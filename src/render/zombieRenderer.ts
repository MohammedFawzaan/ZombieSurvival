import * as THREE from 'three';
import type { Zombie, ZombieManager } from '../zombies/zombieManager';
import { ZombieState } from '../state/types';
import type { ZombieKind } from '../zombies/zombieTypes';
import { buildZombieRig, createZombieMaterials, type HumanoidParts } from './zombieModel';
import type { ZombieAssetSet, ZombieClipName } from './zombieAssets';
import { clamp, damp, lerp } from '../util/math';

const VISUAL_POOL = 32;

const VISIBLE_DISTANCE = 200;
const VISIBLE_DISTANCE_HIDE = 210;

interface RigSlot {
  parts: HumanoidParts;
  zombieId: number;
  inUse: boolean;
  flashMat: THREE.MeshStandardMaterial[];
  deathLean: number;
  animPhase: number;
  phaseInit: boolean;
  smoothSpeed: number;
  smoothAware: number;
  smoothChase: number;
}

interface SkinnedSlot {
  root: THREE.Group;
  kind: ZombieKind | null;
  zombieId: number;
  inUse: boolean;
  mixer: THREE.AnimationMixer | null;
  actions: Map<ZombieClipName, THREE.AnimationAction>;
  variants: Map<ZombieKind, { scene: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<ZombieClipName, THREE.AnimationAction> }>;
  mats: THREE.MeshStandardMaterial[];
  weights: Map<ZombieClipName, number>;
  smoothSpeed: number;
  smoothChase: number;
  hitPulse: number;
  prevHitFlash: number;
  deathProgress: number;
  attackProgress: number;
  staggerProgress: number;
}

const CLIP_LIST: ZombieClipName[] = ['idle', 'walk', 'chase', 'attack', 'stagger', 'hit', 'death'];


const DEATH_SINK = 1.05;
const DEATH_LINGER_SECONDS = 2.6;
const DEATH_FADE_SECONDS = 1.0;

function deathFade(z: { alive: boolean; deathTimer: number }): number {
  if (z.alive || z.deathTimer <= 0) return 1;
  const elapsed = DEATH_LINGER_SECONDS - z.deathTimer;
  if (elapsed <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - elapsed / DEATH_FADE_SECONDS));
}

function applyFade(root: THREE.Object3D, fade: number): void {
  const opaque = fade >= 0.999;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh & { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (!mesh.isMesh && !mesh.isSkinnedMesh) return;
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) {
      for (const m of mat) {
        m.transparent = !opaque;
        m.opacity = fade;
        m.depthWrite = opaque;
      }
    } else {
      mat.transparent = !opaque;
      mat.opacity = fade;
      mat.depthWrite = opaque;
    }
  });
}

export class ZombieRenderer {
  readonly group = new THREE.Group();
  private readonly slots: RigSlot[] = [];
  private readonly assignment = new Map<number, RigSlot>();
  private readonly materials = createZombieMaterials();
  private readonly hitColor = new THREE.Color(0xff5a4a);
  sourceName = 'procedural';

  private skinned: SkinnedSlot[] = [];
  private skinnedAssignment = new Map<number, SkinnedSlot>();
  private assets: ZombieAssetSet | null = null;

  constructor() {
    this.group.name = 'zombies';
    for (let i = 0; i < VISUAL_POOL; i++) {
      const parts = buildZombieRig({
        flesh: this.materials.flesh.clone(),
        cloth: this.materials.cloth.clone(),
      });
      parts.root.visible = false;
      parts.root.matrixAutoUpdate = true;
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

  get usingSkinned(): boolean {
    return this.assets !== null;
  }

  enableSkinned(assets: ZombieAssetSet): void {
    if (this.assets) return;
    this.assets = assets;
    this.sourceName = 'glb-skinned';

    for (const slot of this.slots) slot.parts.root.visible = false;

    for (let i = 0; i < VISUAL_POOL; i++) {
      const root = new THREE.Group();
      root.name = `zombieSkinned${i}`;
      root.visible = false;
      root.frustumCulled = false;

      const variants = new Map<
        ZombieKind,
        { scene: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<ZombieClipName, THREE.AnimationAction> }
      >();
      const mats: THREE.MeshStandardMaterial[] = [];

      for (const kind of ['walker', 'runner', 'brute'] as ZombieKind[]) {
        const asset = assets[kind];
        const inst = cloneSkinned(asset.scene);
        inst.visible = false;
        inst.frustumCulled = false;
        root.add(inst);

        const mixer = new THREE.AnimationMixer(inst);
        const actions = new Map<ZombieClipName, THREE.AnimationAction>();
        for (const name of CLIP_LIST) {
          const clip = asset.clips.get(name);
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          action.enabled = true;
          action.setEffectiveWeight(0);
          action.play();
          if (name === 'death') {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          actions.set(name, action);
        }
        inst.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const m = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (m && !mats.includes(m)) mats.push(m);
        });
        variants.set(kind, { scene: inst, mixer, actions });
      }

      this.group.add(root);
      this.skinned.push({
        root,
        kind: null,
        zombieId: -1,
        inUse: false,
        mixer: null,
        actions: new Map(),
        variants,
        mats,
        weights: new Map(),
        smoothSpeed: 0,
        smoothChase: 0,
        hitPulse: 0,
        prevHitFlash: 0,
        deathProgress: 0,
        attackProgress: 0,
        staggerProgress: 0,
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

  private acquireSkinned(z: Zombie): SkinnedSlot | null {
    const existing = this.skinnedAssignment.get(z.id);
    if (existing) return existing;
    for (const slot of this.skinned) {
      if (slot.inUse) continue;
      slot.inUse = true;
      slot.zombieId = z.id;
      slot.smoothSpeed = 0;
      slot.smoothChase = 0;
      slot.hitPulse = 0;
      slot.prevHitFlash = z.hitFlash;
      slot.deathProgress = 0;
      slot.attackProgress = 0;
      slot.staggerProgress = 0;
      slot.weights.clear();
      this.bindKind(slot, z.kind);
      slot.root.visible = true;
      this.skinnedAssignment.set(z.id, slot);
      return slot;
    }
    return null;
  }

  private bindKind(slot: SkinnedSlot, kind: ZombieKind): void {
    if (slot.kind === kind) return;
    for (const [k, v] of slot.variants) {
      const on = k === kind;
      v.scene.visible = on;
      if (!on) {
        for (const a of v.actions.values()) a.setEffectiveWeight(0);
      }
    }
    const active = slot.variants.get(kind);
    slot.kind = kind;
    slot.mixer = active ? active.mixer : null;
    slot.actions = active ? active.actions : new Map();
    for (const a of slot.actions.values()) {
      a.reset();
      a.setEffectiveWeight(0);
      a.play();
    }
    slot.weights.clear();
  }

  private releaseSkinned(zombieId: number): void {
    const slot = this.skinnedAssignment.get(zombieId);
    if (!slot) return;
    slot.inUse = false;
    slot.zombieId = -1;
    slot.root.visible = false;
    this.skinnedAssignment.delete(zombieId);
  }

  debugVisibility(): [number, boolean][] {
    const out: [number, boolean][] = [];
    if (this.assets) {
      for (const [id, slot] of this.skinnedAssignment) out.push([id, slot.root.visible]);
      return out;
    }
    for (const [id, slot] of this.assignment) out.push([id, slot.parts.root.visible]);
    return out;
  }

  debugAnimation(): { id: number; clip: string; weight: number; time: number }[] {
    const out: { id: number; clip: string; weight: number; time: number }[] = [];
    for (const [id, slot] of this.skinnedAssignment) {
      let best = 'none';
      let bw = 0;
      let time = 0;
      for (const [name, action] of slot.actions) {
        const w = action.getEffectiveWeight();
        if (w > bw) {
          bw = w;
          best = name;
          time = action.time;
        }
      }
      out.push({ id, clip: best, weight: +bw.toFixed(4), time: +time.toFixed(4) });
    }
    return out;
  }

  reset(): void {
    for (const id of [...this.assignment.keys()]) this.release(id);
    for (const id of [...this.skinnedAssignment.keys()]) this.releaseSkinned(id);
  }

  update(manager: ZombieManager, dt: number, cameraPos: THREE.Vector3, time: number): void {
    const seen = new Set<number>();

    for (const z of manager.zombies) {
      if (!(z.alive || z.deathTimer > 0) || z.body === null) continue;

      const held = this.assets ? this.skinnedAssignment.has(z.id) : this.assignment.has(z.id);
      const limit = held ? VISIBLE_DISTANCE_HIDE : VISIBLE_DISTANCE;
      if (z.distToPlayer >= limit) continue;

      if (this.assets) {
        const slot = this.acquireSkinned(z);
        if (!slot) continue;
        seen.add(z.id);
        this.animateSkinned(slot, z, dt);
      } else {
        const slot = this.acquire(z.id);
        if (!slot) continue;
        seen.add(z.id);
        this.animate(slot, z, dt, cameraPos, time);
      }
    }

    if (this.assets) {
      for (const id of [...this.skinnedAssignment.keys()]) {
        if (!seen.has(id)) this.releaseSkinned(id);
      }
      return;
    }
    for (const id of [...this.assignment.keys()]) {
      if (!seen.has(id)) this.release(id);
    }
  }

  private animateSkinned(slot: SkinnedSlot, z: Zombie, dt: number): void {
    if (!z.body) return;

    this.bindKind(slot, z.kind);

    z.renderBlend = Math.min(1, z.renderBlend + z.renderBlendRate * dt);
    const a = z.renderInit ? z.renderBlend : 1;
    const px = z.prevRenderX + (z.currRenderX - z.prevRenderX) * a;
    const py = z.prevRenderY + (z.currRenderY - z.prevRenderY) * a;
    const pz = z.prevRenderZ + (z.currRenderZ - z.prevRenderZ) * a;
    let dYaw = z.currRenderYaw - z.prevRenderYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const renderYaw = z.prevRenderYaw + dYaw * a;

    const fade = deathFade(z);
    const feetY = py - z.body.feetOffset - (1 - fade) * DEATH_SINK;
    slot.root.position.set(px, feetY, pz);
    slot.root.rotation.y = renderYaw;
    slot.root.scale.setScalar(z.def.scale * (0.82 + fade * 0.18));
    applyFade(slot.root, fade);

    slot.smoothSpeed = damp(slot.smoothSpeed, z.speed, 9, dt);
    const chaseTarget =
      z.state === ZombieState.Chasing || z.state === ZombieState.Detecting ? 1 : 0;
    slot.smoothChase = damp(slot.smoothChase, chaseTarget, 7, dt);

    if (z.hitFlash > slot.prevHitFlash + 0.05) slot.hitPulse = 1;
    slot.prevHitFlash = z.hitFlash;
    slot.hitPulse = Math.max(0, slot.hitPulse - dt * 2.6);

    const dead = z.state === ZombieState.Dead || !z.alive;
    slot.deathProgress = dead ? Math.min(1, slot.deathProgress + dt * 1.9) : 0;

    const attacking = z.state === ZombieState.Attacking;
    slot.attackProgress = damp(slot.attackProgress, attacking ? 1 : 0, 11, dt);
    const staggered = z.state === ZombieState.Staggered;
    slot.staggerProgress = damp(slot.staggerProgress, staggered ? 1 : 0, 10, dt);

    const chaseSpeed = Math.max(z.def.chaseSpeed, 0.1);
    const locomotion = clamp(slot.smoothSpeed / chaseSpeed, 0, 1);
    const moving = clamp((slot.smoothSpeed - 0.08) / 0.5, 0, 1);

    const wDeath = dead ? Math.min(1, slot.deathProgress * 1.35) : 0;
    const rest = 1 - wDeath;
    const wStagger = slot.staggerProgress * rest;
    const afterStagger = rest - wStagger;
    const wAttack = slot.attackProgress * afterStagger;
    const afterAttack = afterStagger - wAttack;
    const wHit = slot.hitPulse * 0.65 * afterAttack;
    const locoTotal = afterAttack - wHit;

    const runBlend = clamp((locomotion - 0.34) / 0.5, 0, 1);
    const wChase = locoTotal * moving * runBlend;
    const wWalk = locoTotal * moving * (1 - runBlend);
    const wIdle = locoTotal * (1 - moving);

    this.setWeight(slot, 'death', wDeath);
    this.setWeight(slot, 'stagger', wStagger);
    this.setWeight(slot, 'attack', wAttack);
    this.setWeight(slot, 'hit', wHit);
    this.setWeight(slot, 'chase', wChase);
    this.setWeight(slot, 'walk', wWalk);
    this.setWeight(slot, 'idle', wIdle);

    const walkAction = slot.actions.get('walk');
    const chaseAction = slot.actions.get('chase');
    const strideRate = lerp(0.85, 1.35, locomotion);
    if (walkAction) walkAction.setEffectiveTimeScale(strideRate);
    if (chaseAction) chaseAction.setEffectiveTimeScale(strideRate);

    if (slot.mixer) slot.mixer.update(dt);

    this.applyFlashSkinned(slot, z.hitFlash);
  }

  private setWeight(slot: SkinnedSlot, name: ZombieClipName, weight: number): void {
    const action = slot.actions.get(name);
    if (!action) return;
    action.setEffectiveWeight(weight);
    slot.weights.set(name, weight);
  }

  private applyFlashSkinned(slot: SkinnedSlot, flash: number): void {
    if (flash <= 0.001) {
      for (const m of slot.mats) {
        if (m.emissiveIntensity !== 0) {
          m.emissiveIntensity = 0;
          m.emissive.setRGB(0, 0, 0);
        }
      }
      return;
    }
    for (const m of slot.mats) {
      m.emissive.copy(this.hitColor);
      m.emissiveIntensity = flash * 0.85;
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

    const fadeP = deathFade(z);
    applyFade(parts.root, fadeP);
    parts.root.position.set(p.x, feetY - (1 - fadeP) * DEATH_SINK, p.z);
    parts.root.rotation.y = renderYaw;
    parts.root.scale.setScalar(scale);

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

function cloneSkinned(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);

  const sourceBones = new Map<string, THREE.Bone>();
  source.traverse((o) => {
    if ((o as THREE.Bone).isBone) sourceBones.set(o.name, o as THREE.Bone);
  });
  const cloneBones = new Map<string, THREE.Bone>();
  clone.traverse((o) => {
    if ((o as THREE.Bone).isBone) cloneBones.set(o.name, o as THREE.Bone);
  });

  const sourceSkinned: THREE.SkinnedMesh[] = [];
  source.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) sourceSkinned.push(o as THREE.SkinnedMesh);
  });
  const cloneSkinnedMeshes: THREE.SkinnedMesh[] = [];
  clone.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) cloneSkinnedMeshes.push(o as THREE.SkinnedMesh);
  });

  for (let i = 0; i < cloneSkinnedMeshes.length; i++) {
    const target = cloneSkinnedMeshes[i];
    const origin = sourceSkinned[i];
    if (!origin) continue;
    const bones = origin.skeleton.bones.map((b) => cloneBones.get(b.name) ?? b);
    const skeleton = new THREE.Skeleton(bones, origin.skeleton.boneInverses);
    target.bind(skeleton, origin.bindMatrix);
    target.material = (origin.material as THREE.Material).clone();
  }

  return clone;
}
