import * as THREE from 'three';
import type { WeaponId } from '../state/types';
import type { WeaponSystem } from '../weapons/weaponSystem';
import { mergeGeometries } from '../world/vegetation';
import { clamp, damp, lerp } from '../util/math';

const FLASH_DURATION = 0.09;

interface WeaponVisual {
  root: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Mesh;
  flashLight: THREE.PointLight;
  hipPos: THREE.Vector3;
  aimPos: THREE.Vector3;
  hipRot: THREE.Euler;
  aimRot: THREE.Euler;
  slide: THREE.Object3D | null;
}

export class ViewModel {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<WeaponId, WeaponVisual>();
  private current: WeaponId = 'pistol';

  private swayX = 0;
  private swayY = 0;
  private kickZ = 0;
  private kickPitch = 0;
  private lowerBlend = 0;
  private reloadBlend = 0;
  private walkBob = 0;
  private bobWeight = 0;
  private flashTimer = 0;

  constructor() {
    this.group.name = 'viewmodel';
    this.group.matrixAutoUpdate = true;
    const pistol = this.buildPistol();
    const rifle = this.buildRifle();
    this.applyRigScale(pistol, 0.82);
    this.applyRigScale(rifle, 0.86);
    this.visuals.set('pistol', pistol);
    this.visuals.set('rifle', rifle);
    for (const v of this.visuals.values()) {
      v.root.visible = false;
      this.group.add(v.root);
    }
    const first = this.visuals.get('pistol');
    if (first) first.root.visible = true;
  }

  private makeMaterials(): {
    metal: THREE.MeshStandardMaterial;
    polymer: THREE.MeshStandardMaterial;
    hands: THREE.MeshStandardMaterial;
  } {
    return {
      metal: new THREE.MeshStandardMaterial({
        color: 0x35383c,
        roughness: 0.42,
        metalness: 0.85,
      }),
      polymer: new THREE.MeshStandardMaterial({
        color: 0x22242a,
        roughness: 0.72,
        metalness: 0.12,
      }),
      hands: new THREE.MeshStandardMaterial({
        color: 0x9c7355,
        roughness: 0.82,
        metalness: 0,
      }),
    };
  }

  private makeFlash(scale: number): { mesh: THREE.Mesh; light: THREE.PointLight } {
    const geo = mergeGeometries([
      starGeometry(0.09 * scale, 0.028 * scale, 6),
      (() => {
        const cone = new THREE.ConeGeometry(0.028 * scale, 0.14 * scale, 6, 1, true);
        cone.rotateX(-Math.PI / 2);
        cone.translate(0, 0, -0.07 * scale);
        return cone;
      })(),
    ]);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 20;
    const light = new THREE.PointLight(0xffc98a, 0, 12, 2);
    light.castShadow = false;
    return { mesh, light };
  }

  private buildPistol(): WeaponVisual {
    const m = this.makeMaterials();
    const root = new THREE.Group();
    root.name = 'vm-pistol';

    const frame = new THREE.Group();
    root.add(frame);

    const slideGroup = new THREE.Group();
    const slideGeo = mergeGeometries([
      boxAt(0.052, 0.058, 0.235, 0, 0, -0.055),
      boxAt(0.03, 0.016, 0.05, 0, 0.036, -0.14),
    ]);
    const slide = new THREE.Mesh(slideGeo, m.metal);
    slide.castShadow = false;
    slideGroup.add(slide);
    frame.add(slideGroup);

    const grip = new THREE.Mesh(
      mergeGeometries([
        (() => {
          const g = boxAt(0.048, 0.135, 0.075, 0, -0.098, 0.032);
          g.rotateX(-0.28);
          return g;
        })(),
        boxAt(0.05, 0.03, 0.13, 0, -0.036, -0.005),
        boxAt(0.012, 0.03, 0.02, 0, -0.05, -0.045),
      ]),
      m.polymer,
    );
    frame.add(grip);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0115, 0.0115, 0.06, 8),
      m.metal,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.004, -0.185);
    frame.add(barrel);

    const hand = this.buildHand(m.hands, 0);
    hand.position.set(0.006, -0.105, 0.02);
    hand.rotation.set(-0.35, 0, 0.12);
    frame.add(hand);

    const support = this.buildHand(m.hands, 1);
    support.position.set(-0.028, -0.09, -0.005);
    support.rotation.set(-0.5, 0.3, -0.5);
    support.scale.setScalar(0.95);
    frame.add(support);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.004, -0.215);
    frame.add(muzzle);

    const { mesh: flash, light } = this.makeFlash(0.85);
    muzzle.add(flash);
    muzzle.add(light);

    const hipPos = new THREE.Vector3(0.17, -0.155, -0.46);
    root.position.copy(hipPos);

    return {
      root,
      muzzle,
      flash,
      flashLight: light,
      hipPos,
      aimPos: new THREE.Vector3(0.0, -0.085, -0.42),
      hipRot: new THREE.Euler(0.03, -0.1, 0.02),
      aimRot: new THREE.Euler(0, 0, 0),
      slide: slideGroup,
    };
  }

  private buildRifle(): WeaponVisual {
    const m = this.makeMaterials();
    const root = new THREE.Group();
    root.name = 'vm-rifle';

    const frame = new THREE.Group();
    root.add(frame);

    const upper = new THREE.Mesh(
      mergeGeometries([
        boxAt(0.05, 0.062, 0.4, 0, 0.002, -0.11),
        boxAt(0.042, 0.03, 0.12, 0, 0.046, -0.02),
        boxAt(0.036, 0.022, 0.06, 0, 0.056, -0.235),
      ]),
      m.metal,
    );
    frame.add(upper);

    const handguard = new THREE.Mesh(
      mergeGeometries([
        (() => {
          const g = new THREE.CylinderGeometry(0.028, 0.028, 0.24, 8);
          g.rotateX(Math.PI / 2);
          g.translate(0, -0.004, -0.29);
          return g;
        })(),
        boxAt(0.014, 0.05, 0.04, 0, -0.048, -0.24),
      ]),
      m.polymer,
    );
    frame.add(handguard);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0105, 0.0105, 0.2, 8),
      m.metal,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.004, -0.48);
    frame.add(barrel);

    const brake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.015, 0.05, 8),
      m.metal,
    );
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, -0.004, -0.585);
    frame.add(brake);

    const stock = new THREE.Mesh(
      mergeGeometries([
        boxAt(0.036, 0.05, 0.13, 0, -0.006, 0.15),
        boxAt(0.044, 0.08, 0.03, 0, -0.012, 0.225),
      ]),
      m.polymer,
    );
    frame.add(stock);

    const magazine = new THREE.Mesh(
      (() => {
        const g = boxAt(0.036, 0.155, 0.06, 0, -0.115, -0.01);
        g.rotateX(0.14);
        return g;
      })(),
      m.polymer,
    );
    frame.add(magazine);

    const grip = new THREE.Mesh(
      (() => {
        const g = boxAt(0.042, 0.12, 0.06, 0, -0.09, 0.085);
        g.rotateX(-0.3);
        return g;
      })(),
      m.polymer,
    );
    frame.add(grip);

    const hand = this.buildHand(m.hands, 0);
    hand.position.set(0.008, -0.1, 0.075);
    hand.rotation.set(-0.42, 0, 0.1);
    frame.add(hand);

    const support = this.buildHand(m.hands, 1);
    support.position.set(-0.012, -0.062, -0.285);
    support.rotation.set(-1.15, 0.25, -0.3);
    frame.add(support);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, -0.004, -0.615);
    frame.add(muzzle);

    const { mesh: flash, light } = this.makeFlash(1.2);
    muzzle.add(flash);
    muzzle.add(light);

    const hipPos = new THREE.Vector3(0.185, -0.175, -0.34);
    root.position.copy(hipPos);

    return {
      root,
      muzzle,
      flash,
      flashLight: light,
      hipPos,
      aimPos: new THREE.Vector3(0.0, -0.095, -0.3),
      hipRot: new THREE.Euler(0.025, -0.09, 0.015),
      aimRot: new THREE.Euler(0, 0, 0),
      slide: null,
    };
  }

  private buildHand(material: THREE.Material, variant: number): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(boxAt(0.052, 0.075, 0.05, 0, 0, 0));
    for (let i = 0; i < 4; i++) {
      const g = boxAt(0.05, 0.017, 0.019, 0.004, 0.026 - i * 0.019, -0.032);
      g.rotateX(-0.45 - i * 0.06);
      g.translate(0, 0.0, -0.005);
      parts.push(g);
    }
    const thumb = boxAt(0.018, 0.05, 0.019, variant === 0 ? -0.03 : 0.03, 0.012, -0.012);
    parts.push(thumb);
    const forearm = boxAt(0.05, 0.052, 0.085, 0, -0.005, 0.06);
    parts.push(forearm);
    const geo = mergeGeometries(parts);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = false;
    return mesh;
  }

  private applyRigScale(visual: WeaponVisual, scale: number): void {
    visual.root.scale.setScalar(scale);
  }

  select(id: WeaponId): void {
    if (this.current === id) return;
    for (const [key, v] of this.visuals) v.root.visible = key === id;
    this.current = id;
    this.lowerBlend = 1;
  }

  onFire(): void {
    this.flashTimer = FLASH_DURATION;
    this.kickZ += this.current === 'rifle' ? 0.026 : 0.038;
    this.kickPitch += this.current === 'rifle' ? 0.028 : 0.05;
  }

  update(
    dt: number,
    weapons: WeaponSystem,
    lookDeltaX: number,
    lookDeltaY: number,
    moveSpeed: number,
    grounded: boolean,
    sprinting: boolean,
  ): void {
    const visual = this.visuals.get(this.current);
    if (!visual) return;

    // lookDelta* are per-frame amounts, so they must be converted to a
    // per-second rate before driving sway. Using the raw delta makes the
    // target depend on frame time, which shows up as the gun jittering
    // while moving.
    const invDt = dt > 1e-5 ? 1 / dt : 0;
    const lookRateX = lookDeltaX * invDt;
    const lookRateY = lookDeltaY * invDt;
    this.swayX = damp(this.swayX, clamp(-lookRateX * 0.055, -0.05, 0.05), 9, dt);
    this.swayY = damp(this.swayY, clamp(-lookRateY * 0.055, -0.05, 0.05), 9, dt);

    this.kickZ = damp(this.kickZ, 0, 13, dt);
    this.kickPitch = damp(this.kickPitch, 0, 11, dt);
    this.lowerBlend = damp(this.lowerBlend, weapons.switching ? 1 : 0, 12, dt);
    this.reloadBlend = damp(this.reloadBlend, weapons.isReloading ? 1 : 0, 11, dt);

    const bobRate = sprinting ? 11.5 : 7.4;
    const bobbing = grounded && moveSpeed > 0.5;
    // Always advance the phase; never damp it. walkBob is a wrapped angle, so
    // damping it toward 0 drags it backwards through a whole cycle whenever it
    // sits near 2*PI, which reads as the weapon snapping.
    if (bobbing) this.walkBob = (this.walkBob + dt * bobRate) % (Math.PI * 2);
    // Fade the amplitude instead, so the weapon settles smoothly when stopping.
    this.bobWeight = damp(this.bobWeight, bobbing ? 1 : 0, 6, dt);
    const bobMag =
      clamp(moveSpeed / 7, 0, 1) * (sprinting ? 1.5 : 1) * (grounded ? 1 : 0.2) * this.bobWeight;

    const aim = weapons.aimBlend;
    const pos = visual.hipPos.clone().lerp(visual.aimPos, aim);
    pos.x += Math.sin(this.walkBob) * 0.016 * bobMag * (1 - aim * 0.7);
    pos.y += Math.abs(Math.sin(this.walkBob * 2)) * -0.012 * bobMag * (1 - aim * 0.7);
    pos.x += this.swayX * (1 - aim * 0.6);
    pos.y += this.swayY * (1 - aim * 0.6);
    pos.z += this.kickZ;

    const lower = this.lowerBlend * 0.26 + this.reloadBlend * 0.12;
    pos.y -= lower;

    visual.root.position.copy(pos);

    const rotX = lerp(visual.hipRot.x, visual.aimRot.x, aim) + this.kickPitch;
    const rotY = lerp(visual.hipRot.y, visual.aimRot.y, aim) - this.swayX * 2.2;
    const rotZ =
      lerp(visual.hipRot.z, visual.aimRot.z, aim) +
      Math.sin(this.walkBob) * 0.02 * bobMag +
      this.lowerBlend * 0.55 +
      this.reloadBlend * 0.42;
    visual.root.rotation.set(rotX + this.lowerBlend * 0.35, rotY, rotZ);

    if (visual.slide) {
      const recoilFrac = clamp(this.kickZ / 0.04, 0, 1);
      visual.slide.position.z = recoilFrac * 0.035;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const t = clamp(this.flashTimer / FLASH_DURATION, 0, 1);
      visual.flash.visible = true;
      visual.flash.rotation.z += dt * 30;
      visual.flash.scale.setScalar(0.7 + t * 0.6 + Math.random() * 0.25);
      (visual.flash.material as THREE.MeshBasicMaterial).opacity = t;
      visual.flashLight.intensity = t * 26;
    } else {
      visual.flash.visible = false;
      visual.flashLight.intensity = 0;
    }
  }

  getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const visual = this.visuals.get(this.current);
    if (!visual) return out.set(0, 0, 0);
    visual.muzzle.getWorldPosition(out);
    return out;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

function boxAt(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function starGeometry(outer: number, inner: number, points: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  return geo;
}
