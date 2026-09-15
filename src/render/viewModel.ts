import * as THREE from 'three';
import type { WeaponId } from '../state/types';
import type { WeaponSystem } from '../weapons/weaponSystem';
import { WEAPONS } from '../weapons/definitions';
import { MeleePhase } from '../state/types';
import { mergeGeometries } from '../world/vegetation';
import { clamp, damp, lerp } from '../util/math';

const FLASH_DURATION = 0.09;
const PUMP_DURATION = 0.46;

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
  pump: THREE.Object3D | null;
  swing: THREE.Object3D | null;
  trail: THREE.Mesh | null;
  melee: boolean;
}

export class ViewModel {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<WeaponId, WeaponVisual>();
  private current: WeaponId = 'pistol';
  private healRig: { root: THREE.Group; item: THREE.Group; hand: THREE.Mesh } | null = null;
  private healBlend = 0;

  private swayX = 0;
  private swayY = 0;
  private kickZ = 0;
  private kickPitch = 0;
  private lowerBlend = 0;
  private reloadBlend = 0;
  private walkBob = 0;
  private bobWeight = 0;
  private flashTimer = 0;
  private pumpTimer = 0;
  private swingBlend = 0;
  private readonly swingPos = new THREE.Vector3();
  private readonly swingRot = new THREE.Euler();

  constructor() {
    this.group.name = 'viewmodel';
    this.group.matrixAutoUpdate = true;
    const pistol = this.buildPistol();
    const rifle = this.buildRifle();
    const shotgun = this.buildShotgun();
    const machete = this.buildMachete();
    this.applyRigScale(pistol, 0.82);
    this.applyRigScale(rifle, 0.86);
    this.applyRigScale(shotgun, 0.86);
    this.applyRigScale(machete, 0.9);
    this.visuals.set('pistol', pistol);
    this.visuals.set('rifle', rifle);
    this.visuals.set('shotgun', shotgun);
    this.visuals.set('machete', machete);
    for (const v of this.visuals.values()) {
      v.root.visible = false;
      this.group.add(v.root);
    }
    const first = this.visuals.get('pistol');
    if (first) first.root.visible = true;
    this.healRig = this.buildHealRig();
    this.healRig.root.scale.setScalar(0.86);
    this.group.add(this.healRig.root);
  }

  private makeMaterials(): {
    metal: THREE.MeshStandardMaterial;
    polymer: THREE.MeshStandardMaterial;
    hands: THREE.MeshStandardMaterial;
    wood: THREE.MeshStandardMaterial;
    steel: THREE.MeshStandardMaterial;
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
      wood: new THREE.MeshStandardMaterial({
        color: 0x4b3323,
        roughness: 0.68,
        metalness: 0.05,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0xb9c0c7,
        roughness: 0.34,
        metalness: 0.58,
      }),
    };
  }

  private makeFlash(scale: number, width = 1): { mesh: THREE.Mesh; light: THREE.PointLight } {
    const parts: THREE.BufferGeometry[] = [
      starGeometry(0.09 * scale * width, 0.028 * scale, 6),
      (() => {
        const cone = new THREE.ConeGeometry(0.028 * scale * width, 0.14 * scale, 6, 1, true);
        cone.rotateX(-Math.PI / 2);
        cone.translate(0, 0, -0.07 * scale);
        return cone;
      })(),
    ];
    if (width > 1.05) {
      const petal = starGeometry(0.135 * scale * width, 0.018 * scale, 4);
      petal.rotateZ(Math.PI / 4);
      petal.translate(0, 0, -0.035 * scale);
      parts.push(petal);
      const halo = new THREE.ConeGeometry(0.075 * scale * width, 0.07 * scale, 8, 1, true);
      halo.rotateX(-Math.PI / 2);
      halo.translate(0, 0, -0.03 * scale);
      parts.push(halo);
    }
    const geo = mergeGeometries(parts);
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

    const { mesh: flash, light } = this.makeFlash(WEAPONS.pistol.muzzleFlashScale);
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
      pump: null,
      swing: null,
      trail: null,
      melee: false,
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

    const { mesh: flash, light } = this.makeFlash(WEAPONS.rifle.muzzleFlashScale);
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
      pump: null,
      swing: null,
      trail: null,
      melee: false,
    };
  }

  private buildShotgun(): WeaponVisual {
    const m = this.makeMaterials();
    const root = new THREE.Group();
    root.name = 'vm-shotgun';

    const frame = new THREE.Group();
    root.add(frame);

    const receiver = new THREE.Mesh(
      mergeGeometries([
        boxAt(0.05, 0.078, 0.26, 0, 0, -0.04),
        boxAt(0.052, 0.03, 0.1, 0, 0.038, -0.15),
        boxAt(0.03, 0.014, 0.05, 0, 0.05, 0.05),
      ]),
      m.metal,
    );
    frame.add(receiver);

    const barrel = new THREE.Mesh(
      (() => {
        const g = new THREE.CylinderGeometry(0.0165, 0.0165, 0.56, 10);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0.016, -0.44);
        return g;
      })(),
      m.metal,
    );
    frame.add(barrel);

    const tube = new THREE.Mesh(
      mergeGeometries([
        (() => {
          const g = new THREE.CylinderGeometry(0.0135, 0.0135, 0.46, 8);
          g.rotateX(Math.PI / 2);
          g.translate(0, -0.021, -0.4);
          return g;
        })(),
        boxAt(0.02, 0.05, 0.02, 0, -0.002, -0.185),
      ]),
      m.metal,
    );
    frame.add(tube);

    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 5), m.steel);
    bead.position.set(0, 0.034, -0.69);
    frame.add(bead);

    const pump = new THREE.Group();
    const forendParts: THREE.BufferGeometry[] = [boxAt(0.05, 0.052, 0.17, 0, -0.005, -0.34)];
    for (let i = 0; i < 5; i++) {
      forendParts.push(boxAt(0.054, 0.008, 0.012, 0, -0.005, -0.405 + i * 0.031));
    }
    const forend = new THREE.Mesh(mergeGeometries(forendParts), m.wood);
    pump.add(forend);
    frame.add(pump);

    const stock = new THREE.Mesh(
      mergeGeometries([
        (() => {
          const g = boxAt(0.044, 0.072, 0.2, 0, -0.035, 0.19);
          g.rotateX(0.07);
          return g;
        })(),
        (() => {
          const g = boxAt(0.05, 0.095, 0.028, 0, -0.05, 0.29);
          g.rotateX(0.12);
          return g;
        })(),
        boxAt(0.042, 0.05, 0.09, 0, -0.028, 0.09),
      ]),
      m.wood,
    );
    frame.add(stock);

    const guard = new THREE.Mesh(
      mergeGeometries([
        boxAt(0.034, 0.012, 0.08, 0, -0.05, 0.02),
        boxAt(0.01, 0.028, 0.012, 0, -0.043, 0.005),
      ]),
      m.metal,
    );
    frame.add(guard);

    const hand = this.buildHand(m.hands, 0);
    hand.position.set(0.008, -0.1, 0.08);
    hand.rotation.set(-0.42, 0, 0.1);
    frame.add(hand);

    const support = this.buildHand(m.hands, 1);
    support.position.set(-0.012, -0.07, -0.335);
    support.rotation.set(-1.2, 0.22, -0.28);
    support.scale.setScalar(0.97);
    pump.add(support);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.016, -0.725);
    frame.add(muzzle);

    const { mesh: flash, light } = this.makeFlash(WEAPONS.shotgun.muzzleFlashScale, 1.45);
    muzzle.add(flash);
    muzzle.add(light);

    const hipPos = new THREE.Vector3(0.19, -0.185, -0.32);
    root.position.copy(hipPos);

    return {
      root,
      muzzle,
      flash,
      flashLight: light,
      hipPos,
      aimPos: new THREE.Vector3(0.0, -0.1, -0.27),
      hipRot: new THREE.Euler(0.028, -0.095, 0.015),
      aimRot: new THREE.Euler(0, 0, 0),
      slide: null,
      pump,
      swing: null,
      trail: null,
      melee: false,
    };
  }

  private buildMachete(): WeaponVisual {
    const m = this.makeMaterials();
    const root = new THREE.Group();
    root.name = 'vm-machete';

    const swing = new THREE.Group();
    root.add(swing);

    const frame = new THREE.Group();
    swing.add(frame);

    const blade = new THREE.Mesh(
      mergeGeometries([
        boxAt(0.011, 0.062, 0.34, 0, 0.012, -0.24),
        (() => {
          const g = boxAt(0.011, 0.078, 0.1, 0, 0.02, -0.44);
          g.rotateX(0.0);
          return g;
        })(),
        (() => {
          const g = new THREE.CylinderGeometry(0.039, 0.004, 0.09, 4, 1);
          g.rotateZ(Math.PI / 2);
          g.rotateY(Math.PI / 2);
          g.scale(0.28, 1, 1);
          g.translate(0, 0.02, -0.53);
          return g;
        })(),
        boxAt(0.014, 0.012, 0.44, 0, 0.042, -0.28),
      ]),
      m.steel,
    );
    frame.add(blade);

    const edge = new THREE.Mesh(
      boxAt(0.004, 0.01, 0.45, 0, -0.018, -0.285),
      new THREE.MeshStandardMaterial({ color: 0xe4e9ee, roughness: 0.18, metalness: 0.6 }),
    );
    frame.add(edge);

    const guard = new THREE.Mesh(
      mergeGeometries([
        boxAt(0.05, 0.014, 0.026, 0, 0.01, -0.058),
        boxAt(0.03, 0.05, 0.016, 0, 0.005, -0.05),
      ]),
      m.metal,
    );
    frame.add(guard);

    const gripParts: THREE.BufferGeometry[] = [boxAt(0.03, 0.038, 0.13, 0, -0.006, 0.015)];
    for (let i = 0; i < 4; i++) {
      gripParts.push(boxAt(0.034, 0.009, 0.014, 0, -0.024, -0.028 + i * 0.03));
    }
    gripParts.push(boxAt(0.036, 0.044, 0.018, 0, -0.006, 0.086));
    const grip = new THREE.Mesh(mergeGeometries(gripParts), m.polymer);
    frame.add(grip);

    const hand = this.buildHand(m.hands, 0);
    hand.position.set(0.004, -0.052, 0.03);
    hand.rotation.set(-0.2, 0.05, 0.06);
    frame.add(hand);

    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xbfd4e6,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const trailGeo = new THREE.PlaneGeometry(0.17, 0.46);
    trailGeo.rotateY(Math.PI / 2);
    trailGeo.rotateZ(-0.12);
    trailGeo.translate(0.0, -0.075, -0.3);
    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.visible = false;
    trail.renderOrder = 19;
    frame.add(trail);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.56);
    frame.add(muzzle);

    const { mesh: flash, light } = this.makeFlash(0.5);
    flash.visible = false;
    muzzle.add(flash);
    muzzle.add(light);

    const hipPos = new THREE.Vector3(0.17, -0.2, -0.52);
    root.position.copy(hipPos);

    return {
      root,
      muzzle,
      flash,
      flashLight: light,
      hipPos,
      aimPos: new THREE.Vector3(0.17, -0.2, -0.52),
      hipRot: new THREE.Euler(0.06, -0.52, -0.62),
      aimRot: new THREE.Euler(0.06, -0.52, -0.62),
      slide: null,
      pump: null,
      swing,
      trail,
      melee: true,
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

  private buildHealRig(): { root: THREE.Group; item: THREE.Group; hand: THREE.Mesh } {
    const m = this.makeMaterials();
    const root = new THREE.Group();
    root.visible = false;

    const gauze = new THREE.MeshStandardMaterial({
      color: 0xe8e4d8,
      roughness: 0.88,
      metalness: 0,
    });
    const cross = new THREE.MeshStandardMaterial({
      color: 0xc2392f,
      roughness: 0.6,
      metalness: 0,
    });

    const item = new THREE.Group();
    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.085, 16),
      gauze,
    );
    wrap.rotation.z = Math.PI / 2;
    item.add(wrap);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.057, 0.057, 0.022, 16),
      cross,
    );
    band.rotation.z = Math.PI / 2;
    item.add(band);

    const tail = new THREE.Mesh(boxAt(0.11, 0.004, 0.07, 0.06, -0.03, 0), gauze);
    tail.rotation.z = -0.35;
    item.add(tail);

    item.position.set(0.07, -0.12, -0.3);
    root.add(item);

    const hand = new THREE.Mesh(boxAt(0.075, 0.055, 0.11, 0, 0, 0), m.hands);
    hand.position.set(-0.07, -0.2, -0.28);
    hand.rotation.set(0.2, 0.25, 0.3);
    root.add(hand);

    const holdHand = new THREE.Mesh(boxAt(0.07, 0.05, 0.1, 0, 0, 0), m.hands);
    holdHand.position.set(0.13, -0.19, -0.27);
    holdHand.rotation.set(0.15, -0.3, -0.25);
    root.add(holdHand);

    for (const o of [wrap, band, tail, hand, holdHand]) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
    return { root, item, hand };
  }

  setHealing(active: boolean, progress: number): void {
    const rig = this.healRig;
    if (!rig) return;
    this.healBlend = damp(this.healBlend, active ? 1 : 0, 14, 1 / 60);
    const showHeal = this.healBlend > 0.02;
    rig.root.visible = showHeal;
    const weapon = this.visuals.get(this.current);
    if (weapon) weapon.root.visible = !showHeal || this.healBlend < 0.5;

    if (!showHeal) return;
    const b = this.healBlend;
    const wobble = Math.sin(progress * Math.PI * 6) * 0.02 * (1 - progress);
    const press = Math.sin(Math.min(1, progress) * Math.PI) * 0.045;
    rig.root.position.set(0, -0.26 * (1 - b), 0);
    rig.item.position.set(0.07 - press * 0.6, -0.12 + press * 0.5 + wobble, -0.3 + press * 0.5);
    rig.item.rotation.set(press * 1.4, wobble * 3, -0.25 + press * 0.8);
    rig.hand.position.set(-0.07 + press * 0.35, -0.2 + press * 0.3 + wobble, -0.28 + press * 0.4);
  }

  select(id: WeaponId): void {
    if (this.current === id) return;
    for (const [key, v] of this.visuals) v.root.visible = key === id;
    this.current = id;
    this.lowerBlend = 1;
  }

  onFire(): void {
    const visual = this.visuals.get(this.current);
    if (visual?.melee) return;
    this.flashTimer = FLASH_DURATION;
    if (this.current === 'shotgun') {
      this.kickZ += 0.055;
      this.kickPitch += 0.075;
      this.pumpTimer = PUMP_DURATION;
    } else {
      this.kickZ += this.current === 'rifle' ? 0.026 : 0.038;
      this.kickPitch += this.current === 'rifle' ? 0.028 : 0.05;
    }
  }

  private updateSwing(dt: number, visual: WeaponVisual, weapons: WeaponSystem): void {
    const swing = visual.swing;
    if (!swing) return;
    const def = WEAPONS[this.current];
    const windup = def.meleeWindup ?? 0.12;
    const active = def.meleeActive ?? 0.1;
    const recovery = def.meleeRecovery ?? 0.36;
    const phase = weapons.meleeVisualPhase;
    const total = windup + active + recovery;
    const elapsed = weapons.meleeVisualProgress * total;

    let t = 0;
    let fromP = REST_POS;
    let toP = REST_POS;
    let fromR = REST_ROT;
    let toR = REST_ROT;

    if (phase === MeleePhase.Windup) {
      t = easeOut(clamp(elapsed / Math.max(windup, 1e-4), 0, 1));
      fromP = REST_POS;
      toP = BACK_POS;
      fromR = REST_ROT;
      toR = BACK_ROT;
    } else if (phase === MeleePhase.Active) {
      t = easeSwing(clamp((elapsed - windup) / Math.max(active, 1e-4), 0, 1));
      fromP = BACK_POS;
      toP = THROUGH_POS;
      fromR = BACK_ROT;
      toR = THROUGH_ROT;
    } else if (phase === MeleePhase.Recovery) {
      t = easeInOut(clamp((elapsed - windup - active) / Math.max(recovery, 1e-4), 0, 1));
      fromP = THROUGH_POS;
      toP = REST_POS;
      fromR = THROUGH_ROT;
      toR = REST_ROT;
    }

    this.swingPos.copy(fromP).lerp(toP, t);
    this.swingRot.set(
      lerp(fromR.x, toR.x, t),
      lerp(fromR.y, toR.y, t),
      lerp(fromR.z, toR.z, t),
    );

    const busy = phase !== MeleePhase.Idle;
    this.swingBlend = busy ? 1 : damp(this.swingBlend, 0, 18, dt);
    const idleSway = Math.sin(this.walkBob * 0.5) * 0.012 * (1 - this.swingBlend);

    swing.position.set(this.swingPos.x, this.swingPos.y + idleSway, this.swingPos.z);
    swing.rotation.set(this.swingRot.x, this.swingRot.y, this.swingRot.z);

    if (visual.trail) {
      const mat = visual.trail.material as THREE.MeshBasicMaterial;
      if (phase === MeleePhase.Active) {
        const a = clamp((elapsed - windup) / Math.max(active, 1e-4), 0, 1);
        visual.trail.visible = true;
        mat.opacity = Math.sin(a * Math.PI) * 0.22;
      } else {
        visual.trail.visible = false;
        mat.opacity = 0;
      }
    }
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

    if (this.pumpTimer > 0) this.pumpTimer = Math.max(0, this.pumpTimer - dt);
    if (visual.pump) {
      const p = this.pumpTimer > 0 ? 1 - this.pumpTimer / PUMP_DURATION : 0;
      visual.pump.position.z = pumpOffset(p) * 0.085;
    }

    if (visual.melee) this.updateSwing(dt, visual, weapons);

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

  getMuzzleViewPosition(out: THREE.Vector3): THREE.Vector3 {
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

const REST_POS = new THREE.Vector3(0, 0, 0);
const BACK_POS = new THREE.Vector3(0.07, 0.13, 0.07);
const THROUGH_POS = new THREE.Vector3(-0.3, -0.15, -0.03);
const REST_ROT = new THREE.Euler(0, 0, 0);
const BACK_ROT = new THREE.Euler(-0.5, -0.62, -0.88);
const THROUGH_ROT = new THREE.Euler(0.32, 0.98, 1.55);

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function easeSwing(t: number): number {
  return t * t * (2.2 - 1.2 * t);
}

function pumpOffset(p: number): number {
  if (p <= 0) return 0;
  if (p < 0.18) return p / 0.18;
  if (p < 0.52) return 1;
  if (p < 0.8) return 1 - (p - 0.52) / 0.28;
  return 0;
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
