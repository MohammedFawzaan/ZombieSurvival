import * as THREE from 'three';
import type { Zombie, ZombieManager } from '../zombies/zombieManager';
import { ZombieState } from '../state/types';
import { buildZombieRig, createZombieMaterials, type HumanoidParts } from './zombieModel';
import { clamp, damp, lerp } from '../util/math';

/**
 * Must be >= the manager's maxAlive so a visible zombie can never be denied a
 * rig because another one took the last slot. When the pool could run out, the
 * distance-sorted assignment handed slots around between frames and zombies
 * flickered in and out of existence.
 */
const VISUAL_POOL = 32;

/**
 * Slightly beyond the manager's despawn distance, with hysteresis below, so a
 * zombie hovering near the cutoff does not blink as it crosses it.
 */
const VISIBLE_DISTANCE = 200;
const VISIBLE_DISTANCE_HIDE = 210;

interface RigSlot {
  parts: HumanoidParts;
  zombieId: number;
  inUse: boolean;
  flashMat: THREE.MeshStandardMaterial[];
  deathLean: number;
  /**
   * Locally advanced animation phase. The simulation only advances a zombie's
   * animPhase on its own LOD tick -- every third step beyond 34 m -- so using
   * it directly freezes the pose for two steps and then jumps. This phase
   * advances every rendered frame and is gently steered toward the simulated
   * one, which keeps limbs moving continuously at any LOD.
   */
  animPhase: number;
  phaseInit: boolean;
  /**
   * Smoothed pose inputs. speed/awareness only change on a zombie's LOD tick,
   * so feeding them straight into the pose makes limbs snap between values.
   */
  smoothSpeed: number;
  smoothAware: number;
  smoothChase: number;
}

export class ZombieRenderer {
  readonly group = new THREE.Group();
  private readonly slots: RigSlot[] = [];
  private readonly assignment = new Map<number, RigSlot>();
  private readonly materials = createZombieMaterials();
  private readonly hitColor = new THREE.Color(0xff5a4a);

  constructor() {
    this.group.name = 'zombies';
    for (let i = 0; i < VISUAL_POOL; i++) {
      const parts = buildZombieRig({
        flesh: this.materials.flesh.clone(),
        cloth: this.materials.cloth.clone(),
      });
      parts.root.visible = false;
      parts.root.matrixAutoUpdate = true;
      // Rig parts are posed by rotating parents, so each mesh's own bounding
      // sphere does not describe where it actually ends up. Three.js would
      // cull individual limbs (or a whole body) against stale local bounds,
      // which shows up as zombies flickering at the edges of the screen.
      // The renderer already limits how many rigs exist, so per-part culling
      // is not worth the artefacts.
      parts.root.traverse((o) => {
        o.frustumCulled = false;
      });
      this.group.add(parts.root);
      const mats: THREE.MeshStandardMaterial[] = [];
      parts.root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && !mats.includes(m)) mats.push(m);
      });
      this.slots.push({
        parts,
        zombieId: -1,
        inUse: false,
        flashMat: mats,
        deathLean: 0,
        animPhase: 0,
        phaseInit: false,
        smoothSpeed: 0,
        smoothAware: 0,
        smoothChase: 0,
      });
    }
  }

  private acquire(zombieId: number): RigSlot | null {
    const existing = this.assignment.get(zombieId);
    if (existing) return existing;
    for (const slot of this.slots) {
      if (!slot.inUse) {
        slot.inUse = true;
        slot.zombieId = zombieId;
        slot.deathLean = 0;
        slot.phaseInit = false;
        slot.smoothSpeed = 0;
        slot.smoothAware = 0;
        slot.smoothChase = 0;
        slot.parts.root.visible = true;
        this.assignment.set(zombieId, slot);
        return slot;
      }
    }
    return null;
  }

  private release(zombieId: number): void {
    const slot = this.assignment.get(zombieId);
    if (!slot) return;
    slot.inUse = false;
    slot.zombieId = -1;
    slot.parts.root.visible = false;
    this.assignment.delete(zombieId);
  }

  /** Visibility of every assigned rig, for flicker verification. */
  debugVisibility(): [number, boolean][] {
    const out: [number, boolean][] = [];
    for (const [id, slot] of this.assignment) out.push([id, slot.parts.root.visible]);
    return out;
  }

  reset(): void {
    for (const id of [...this.assignment.keys()]) this.release(id);
  }

  update(manager: ZombieManager, dt: number, cameraPos: THREE.Vector3, time: number): void {
    const seen = new Set<number>();

    for (const z of manager.zombies) {
      if (!(z.alive || z.deathTimer > 0) || z.body === null) continue;

      // Hysteresis: a zombie already on screen is kept until it passes the
      // wider hide radius, so one hovering at the boundary cannot blink.
      const held = this.assignment.has(z.id);
      const limit = held ? VISIBLE_DISTANCE_HIDE : VISIBLE_DISTANCE;
      if (z.distToPlayer >= limit) continue;

      const slot = this.acquire(z.id);
      if (!slot) continue;
      seen.add(z.id);
      this.animate(slot, z, dt, cameraPos, time);
    }

    for (const id of [...this.assignment.keys()]) {
      if (!seen.has(id)) this.release(id);
    }
  }

  private animate(
    slot: RigSlot,
    z: Zombie,
    dt: number,
    _cameraPos: THREE.Vector3,
    time: number,
  ): void {
    if (!z.body) return;

    // Advance this zombie's own blend and read an interpolated transform, so
    // motion is smooth on frames between physics steps and stays smooth for
    // distant zombies that only think every third step.
    z.renderBlend = Math.min(1, z.renderBlend + z.renderBlendRate * dt);
    const a = z.renderInit ? z.renderBlend : 1;
    const px = z.prevRenderX + (z.currRenderX - z.prevRenderX) * a;
    const py = z.prevRenderY + (z.currRenderY - z.prevRenderY) * a;
    const pz = z.prevRenderZ + (z.currRenderZ - z.prevRenderZ) * a;
    let dYaw = z.currRenderYaw - z.prevRenderYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const renderYaw = z.prevRenderYaw + dYaw * a;

    const p = { x: px, y: py, z: pz };
    const feetY = p.y - z.body.feetOffset;
    const parts = slot.parts;
    const def = z.def;
    const scale = def.scale;

    parts.root.position.set(p.x, feetY, p.z);
    parts.root.rotation.y = renderYaw;
    parts.root.scale.setScalar(scale);

    // Advance the pose every frame at the zombie's own animation rate, then
    // ease toward the simulated phase so the two never drift apart.
    const TAU = Math.PI * 2;
    if (!slot.phaseInit) {
      slot.phaseInit = true;
      slot.animPhase = z.animPhase;
    }
    slot.animPhase = (slot.animPhase + z.animSpeed * dt) % TAU;
    let phaseErr = z.animPhase - slot.animPhase;
    if (phaseErr > Math.PI) phaseErr -= TAU;
    else if (phaseErr < -Math.PI) phaseErr += TAU;
    slot.animPhase += phaseErr * Math.min(1, dt * 4);
    if (slot.animPhase < 0) slot.animPhase += TAU;

    const phase = slot.animPhase;
    const dead = z.state === ZombieState.Dead || !z.alive;

    // Ease the pose inputs so a zombie crossing a state or speed threshold
    // blends into the new pose instead of snapping to it on its LOD tick.
    const chaseTarget =
      z.state === ZombieState.Chasing || z.state === ZombieState.Detecting ? 1 : 0;
    slot.smoothSpeed = damp(slot.smoothSpeed, z.speed, 9, dt);
    slot.smoothAware = damp(slot.smoothAware, clamp(z.awareness, 0, 1), 6, dt);
    slot.smoothChase = damp(slot.smoothChase, chaseTarget, 7, dt);

    const moving = slot.smoothSpeed > 0.12;
    const chaseBlend = slot.smoothChase;
    const aware = slot.smoothAware;
    const strideScale = clamp(slot.smoothSpeed / Math.max(def.chaseSpeed, 0.1), 0, 1.3);

    if (dead) {
      slot.deathLean = damp(slot.deathLean, 1, 6.5, dt);
      const t = slot.deathLean;
      parts.hips.position.y = lerp(0.94, 0.22, t);
      parts.hips.rotation.x = lerp(0, -1.42, t);
      parts.hips.rotation.z = lerp(0, 0.28, t);
      parts.torso.rotation.x = lerp(0, 0.35, t);
      parts.head.rotation.x = lerp(0, 0.6, t);
      parts.armLeft.rotation.x = lerp(parts.armLeft.rotation.x, 1.1, t * 0.4);
      parts.armRight.rotation.x = lerp(parts.armRight.rotation.x, 0.7, t * 0.4);
      parts.legLeft.rotation.x = lerp(parts.legLeft.rotation.x, 0.35, t * 0.4);
      parts.legRight.rotation.x = lerp(parts.legRight.rotation.x, -0.2, t * 0.4);
      parts.shinLeft.rotation.x = lerp(parts.shinLeft.rotation.x, -0.5, t * 0.4);
      parts.shinRight.rotation.x = lerp(parts.shinRight.rotation.x, -0.3, t * 0.4);
      this.applyFlash(slot, z.hitFlash);
      return;
    }

    slot.deathLean = 0;

    if (z.state === ZombieState.Attacking) {
      const windupTotal = def.attackWindup;
      const swing = z.attackCommitted
        ? clamp(1 - z.attackTimer / (def.attackCooldown * 0.55), 0, 1)
        : 1 - clamp(z.attackTimer / windupTotal, 0, 1);
      const reach = z.attackCommitted ? 1 - swing * 0.85 : swing;

      parts.hips.position.y = 0.9;
      parts.hips.rotation.x = -0.12 - reach * 0.1;
      parts.hips.rotation.z = 0;
      parts.torso.rotation.x = 0.16 + reach * 0.2;
      parts.torso.rotation.y = Math.sin(time * 2) * 0.03;
      parts.head.rotation.x = -0.18;

      parts.armLeft.rotation.x = -2.1 - reach * 0.55;
      parts.armRight.rotation.x = -2.0 - reach * 0.7;
      parts.armLeft.rotation.z = 0.35 - reach * 0.2;
      parts.armRight.rotation.z = -0.4 + reach * 0.25;
      parts.forearmLeft.rotation.x = -0.55 + reach * 0.4;
      parts.forearmRight.rotation.x = -0.6 + reach * 0.45;

      const step = Math.sin(phase * 0.7) * 0.12;
      parts.legLeft.rotation.x = step;
      parts.legRight.rotation.x = -step;
      parts.shinLeft.rotation.x = -0.2;
      parts.shinRight.rotation.x = -0.2;
      this.applyFlash(slot, z.hitFlash);
      return;
    }

    if (z.state === ZombieState.Staggered) {
      const s = clamp(z.staggerTimer / 0.5, 0, 1);
      parts.hips.position.y = 0.9 - s * 0.06;
      parts.hips.rotation.x = -0.3 * s;
      parts.torso.rotation.x = 0.42 * s;
      parts.head.rotation.x = 0.3 * s;
      parts.armLeft.rotation.x = -0.9 - s * 0.8;
      parts.armRight.rotation.x = -0.7 - s * 0.9;
      parts.forearmLeft.rotation.x = -0.9;
      parts.forearmRight.rotation.x = -0.8;
      parts.legLeft.rotation.x = 0.25 * s;
      parts.legRight.rotation.x = -0.3 * s;
      parts.shinLeft.rotation.x = -0.4 * s;
      parts.shinRight.rotation.x = -0.25 * s;
      this.applyFlash(slot, z.hitFlash);
      return;
    }

    const swingAmp = moving ? lerp(0.32, 0.95, strideScale) : 0.05;
    const legSwing = Math.sin(phase) * swingAmp;
    const legSwingOpp = Math.sin(phase + Math.PI) * swingAmp;
    const kneeBend = moving ? clamp(0.25 + strideScale * 0.55, 0, 1.1) : 0.12;

    parts.legLeft.rotation.x = legSwing;
    parts.legRight.rotation.x = legSwingOpp;
    parts.shinLeft.rotation.x = -Math.max(0, Math.sin(phase - 0.9)) * kneeBend - 0.08;
    parts.shinRight.rotation.x = -Math.max(0, Math.sin(phase + Math.PI - 0.9)) * kneeBend - 0.08;

    const bobY = moving ? Math.abs(Math.sin(phase)) * 0.045 * strideScale : 0;
    const idleSway = Math.sin(time * 1.15 + z.id) * 0.02;
    parts.hips.position.y = 0.94 - bobY - chaseBlend * 0.04;
    parts.hips.rotation.x = lerp(-0.06, -0.2, chaseBlend);
    parts.hips.rotation.z = Math.sin(phase) * 0.05 * strideScale + idleSway * 0.5;
    parts.hips.rotation.y = Math.sin(phase) * 0.08 * strideScale;

    parts.torso.rotation.x = lerp(0.13, 0.3, chaseBlend) + Math.sin(phase * 2) * 0.02;
    parts.torso.rotation.y = -Math.sin(phase) * 0.12 * strideScale + idleSway;
    parts.torso.rotation.z = Math.sin(phase + 1) * 0.035;

    parts.head.rotation.x = lerp(lerp(0.16, -0.1, aware), -0.28, chaseBlend);
    parts.head.rotation.y = Math.sin(time * 0.8 + z.id * 2.1) * lerp(0.22, 0.04, chaseBlend);
    parts.head.rotation.z = 0.12 + Math.sin(time * 0.5 + z.id) * 0.05;

    const armRaise = lerp(lerp(-0.35, -1.3, aware), -1.75, chaseBlend);
    const armSwing = moving ? Math.sin(phase + Math.PI) * 0.3 * strideScale : 0;
    parts.armLeft.rotation.x = armRaise + armSwing;
    parts.armRight.rotation.x = armRaise - armSwing;
    parts.armLeft.rotation.z = 0.22 + Math.sin(time * 1.3 + z.id) * 0.05;
    parts.armRight.rotation.z = -0.26 - Math.sin(time * 1.1 + z.id) * 0.05;
    parts.forearmLeft.rotation.x = lerp(-1.05 + armSwing * 0.4, -0.5, chaseBlend);
    parts.forearmRight.rotation.x = lerp(-0.95 - armSwing * 0.4, -0.45, chaseBlend);

    this.applyFlash(slot, z.hitFlash);
  }

  private applyFlash(slot: RigSlot, flash: number): void {
    if (flash <= 0.001) {
      for (const m of slot.flashMat) {
        if (m.emissiveIntensity !== 0) {
          m.emissiveIntensity = 0;
          m.emissive.setRGB(0, 0, 0);
        }
      }
      return;
    }
    for (const m of slot.flashMat) {
      m.emissive.copy(this.hitColor);
      m.emissiveIntensity = flash * 0.85;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
    this.materials.flesh.dispose();
    this.materials.cloth.dispose();
  }
}
