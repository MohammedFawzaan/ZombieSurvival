import * as THREE from 'three';
import { mergeGeometries } from '../../world/vegetation';
import type { CityGround } from './cityGround';
import { CITY_BUILDINGS, CITY_PROPS } from './cityLayout';

export interface CityLightRig {
  group: THREE.Group;
  setPowered(on: boolean): void;
  isPowered(): boolean;
  dispose(): void;
}

const LAMP_OFF = new THREE.Color(0x2a2b2e);
const LAMP_ON = new THREE.Color(0xffd9a0);
const WINDOW_OFF = new THREE.Color(0x1b2024);
const WINDOW_ON = new THREE.Color(0xffc987);

export function buildCityLights(ground: CityGround, rng: () => number): CityLightRig {
  const group = new THREE.Group();
  group.name = 'city_lights';
  const disposables: (THREE.Material | THREE.BufferGeometry)[] = [];

  const lampMat = new THREE.MeshStandardMaterial({
    color: LAMP_OFF,
    roughness: 0.4,
    metalness: 0.1,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: WINDOW_OFF,
    roughness: 0.45,
    metalness: 0.15,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
  disposables.push(lampMat, windowMat);

  const lampParts: THREE.BufferGeometry[] = [];
  for (const p of CITY_PROPS) {
    if (p.kind !== 'lamp') continue;
    const y = ground.heightAt(p.x, p.z);
    const lens = new THREE.BoxGeometry(0.52, 0.12, 0.28);
    lens.translate(1.15, 4.52, 0);
    lens.rotateY(p.yaw);
    lens.translate(p.x, y, p.z);
    lampParts.push(lens);
  }

  if (lampParts.length > 0) {
    const geo = mergeGeometries(lampParts);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, lampMat);
    mesh.name = 'city_lamp_lenses';
    group.add(mesh);
  }

  const windowParts: THREE.BufferGeometry[] = [];
  for (const b of CITY_BUILDINGS) {
    if (b.kind === 'garage' || b.kind === 'kiosk') continue;
    const base = ground.heightAt(b.x, b.z);
    const hw = b.width * 0.5;
    const hd = b.depth * 0.5;
    const lit = b.kind === 'apartment' ? 5 : 2;
    for (let i = 0; i < lit; i++) {
      if (rng() < 0.35) continue;
      const lx = (rng() - 0.5) * hw * 1.4;
      const ly = 1.7 + rng() * Math.max(1, b.height - 3.2);
      const pane = new THREE.BoxGeometry(1.15, 1.2, 0.05);
      pane.translate(lx, ly, hd + 0.12);
      pane.rotateY(b.yaw);
      pane.translate(b.x, base, b.z);
      windowParts.push(pane);
    }
  }

  if (windowParts.length > 0) {
    const geo = mergeGeometries(windowParts);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, windowMat);
    mesh.name = 'city_lit_windows';
    group.add(mesh);
  }

  let powered = false;

  return {
    group,
    setPowered(on: boolean): void {
      powered = on;
      lampMat.color.copy(on ? LAMP_ON : LAMP_OFF);
      lampMat.emissive.copy(on ? LAMP_ON : new THREE.Color(0x000000));
      lampMat.emissiveIntensity = on ? 1.35 : 0;
      lampMat.needsUpdate = true;

      windowMat.color.copy(on ? WINDOW_ON : WINDOW_OFF);
      windowMat.emissive.copy(on ? WINDOW_ON : new THREE.Color(0x000000));
      windowMat.emissiveIntensity = on ? 0.85 : 0;
      windowMat.needsUpdate = true;
    },
    isPowered(): boolean {
      return powered;
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
    },
  };
}
