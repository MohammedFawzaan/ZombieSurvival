import * as THREE from 'three';
import { mergeGeometries } from '../../world/vegetation';
import type { CityGround } from './cityGround';
import { paintGeometry } from './cityDetail';
import {
  CITY_PAVEMENTS,
  CITY_ROADS,
  PAVEMENT_HEIGHT,
  type PavementDef,
  type RoadSegmentDef,
} from './cityLayout';

export interface StreetSurfaceResult {
  road: THREE.BufferGeometry;
  kerb: THREE.BufferGeometry;
  pavement: THREE.BufferGeometry;
  markings: THREE.BufferGeometry | null;
  patches: THREE.BufferGeometry | null;
}


const ASPHALT = new THREE.Color(0x6e6c68);
const KERB = new THREE.Color(0xa8a49b);
const PAVEMENT = new THREE.Color(0x9b978f);
const MARKING = new THREE.Color(0xc4bb93);
const PATCH = new THREE.Color(0x56544f);
export const STREET_COLORS = {
  asphalt: ASPHALT,
  kerb: KERB,
  pavement: PAVEMENT,
  marking: MARKING,
  patch: PATCH,
};

export function buildStreetSurfaces(
  ground: CityGround,
  rng: () => number,
): StreetSurfaceResult {
  const roadParts: THREE.BufferGeometry[] = [];
  const markingParts: THREE.BufferGeometry[] = [];
  const patchParts: THREE.BufferGeometry[] = [];

  for (const seg of CITY_ROADS) {
    emitRoadSegment(seg, ground, rng, roadParts, markingParts, patchParts);
  }

  const kerbParts: THREE.BufferGeometry[] = [];
  const pavementParts: THREE.BufferGeometry[] = [];
  for (const pv of CITY_PAVEMENTS) {
    emitPavementSlab(pv, ground, rng, pavementParts, kerbParts);
  }

  const road = mergeGeometries(roadParts);
  const kerb = mergeGeometries(kerbParts);
  const pavement = mergeGeometries(pavementParts);

  let markings: THREE.BufferGeometry | null = null;
  if (markingParts.length > 0) {
    markings = mergeGeometries(markingParts);
    paintGeometry(markings, MARKING, rng, { mottle: 0.3 });
  }

  let patches: THREE.BufferGeometry | null = null;
  if (patchParts.length > 0) {
    patches = mergeGeometries(patchParts);
    paintGeometry(patches, PATCH, rng, { mottle: 0.22 });
  }

  return { road, kerb, pavement, markings, patches };
}

function emitRoadSegment(
  seg: RoadSegmentDef,
  ground: CityGround,
  rng: () => number,
  roadParts: THREE.BufferGeometry[],
  markingParts: THREE.BufferGeometry[],
  patchParts: THREE.BufferGeometry[],
): void {
  const dx = seg.x2 - seg.x1;
  const dz = seg.z2 - seg.z1;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const cx = (seg.x1 + seg.x2) * 0.5;
  const cz = (seg.z1 + seg.z2) * 0.5;

  const slabs = Math.max(2, Math.round(len / 18));
  for (let i = 0; i < slabs; i++) {
    const t = (i + 0.5) / slabs - 0.5;
    const sx = cx + dx * t;
    const sz = cz + dz * t;
    const slabLen = len / slabs + 0.04;
    const plane = new THREE.BoxGeometry(seg.width, 0.08, slabLen);
    plane.rotateY(yaw);
    plane.translate(sx, ground.heightAt(sx, sz) + 0.04, sz);
    roadParts.push(plane);
  }

  if (seg.kind === 'road') {
    const dashes = Math.max(3, Math.round(len / 9));
    for (let i = 0; i < dashes; i++) {
      if (rng() < 0.28) continue;
      const t = (i + 0.5) / dashes - 0.5;
      const sx = cx + dx * t;
      const sz = cz + dz * t;
      const dash = new THREE.BoxGeometry(0.22, 0.02, 2.6);
      dash.rotateY(yaw);
      dash.translate(sx, ground.heightAt(sx, sz) + 0.09, sz);
      markingParts.push(dash);
    }
  }

  const patchCount = Math.max(2, Math.round(len / 26));
  const ux = dx / (len || 1);
  const uz = dz / (len || 1);
  const px = -uz;
  const pz = ux;
  for (let i = 0; i < patchCount; i++) {
    const t = rng() - 0.5;
    const off = (rng() - 0.5) * seg.width * 0.72;
    const sx = cx + dx * t + px * off;
    const sz = cz + dz * t + pz * off;
    const w = 1.2 + rng() * 2.6;
    const l = 1.4 + rng() * 3.4;
    const patch = new THREE.BoxGeometry(w, 0.02, l);
    patch.rotateY(yaw + (rng() - 0.5) * 0.6);
    patch.translate(sx, ground.heightAt(sx, sz) + 0.085, sz);
    patchParts.push(patch);
  }
}

function emitPavementSlab(
  pv: PavementDef,
  ground: CityGround,
  rng: () => number,
  pavementParts: THREE.BufferGeometry[],
  kerbParts: THREE.BufferGeometry[],
): void {
  const alongX = pv.width >= pv.depth;
  const span = alongX ? pv.width : pv.depth;
  const slabs = Math.max(2, Math.round(span / 12));

  for (let i = 0; i < slabs; i++) {
    const t = (i + 0.5) / slabs - 0.5;
    const sx = pv.x + (alongX ? pv.width * t : 0);
    const sz = pv.z + (alongX ? 0 : pv.depth * t);
    const w = alongX ? pv.width / slabs + 0.03 : pv.width;
    const d = alongX ? pv.depth : pv.depth / slabs + 0.03;
    const sag = (rng() - 0.5) * 0.02;
    const slab = new THREE.BoxGeometry(w, PAVEMENT_HEIGHT, d);
    slab.translate(sx, ground.heightAt(sx, sz) + PAVEMENT_HEIGHT * 0.5 + sag, sz);
    pavementParts.push(slab);
  }

  const kerbH = PAVEMENT_HEIGHT + 0.09;
  const kerbT = 0.3;
  const kerbSlabs = Math.max(3, Math.round(span / 4.5));
  for (const side of [-1, 1]) {
    for (let i = 0; i < kerbSlabs; i++) {
      const t = (i + 0.5) / kerbSlabs - 0.5;
      const sx = pv.x + (alongX ? pv.width * t : side * (pv.width * 0.5 + kerbT * 0.5));
      const sz = pv.z + (alongX ? side * (pv.depth * 0.5 + kerbT * 0.5) : pv.depth * t);
      const w = alongX ? pv.width / kerbSlabs + 0.02 : kerbT;
      const d = alongX ? kerbT : pv.depth / kerbSlabs + 0.02;
      const chip = rng() < 0.18 ? 0.045 : 0;
      const tilt = (rng() - 0.5) * 0.035;
      const kerb = new THREE.BoxGeometry(w, kerbH - chip, d);
      kerb.rotateZ(alongX ? tilt : 0);
      kerb.rotateX(alongX ? 0 : tilt);
      kerb.translate(sx, ground.heightAt(sx, sz) + (kerbH - chip) * 0.5, sz);
      kerbParts.push(kerb);
    }
  }
}

export interface ReclaimPoint {
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export function generateReclaimGrowth(
  ground: CityGround,
  rng: () => number,
  blocked: (x: number, z: number) => boolean,
): { weeds: ReclaimPoint[]; bushes: ReclaimPoint[] } {
  const weeds: ReclaimPoint[] = [];
  const bushes: ReclaimPoint[] = [];

  for (const pv of CITY_PAVEMENTS) {
    const alongX = pv.width >= pv.depth;
    const span = alongX ? pv.width : pv.depth;
    const tufts = Math.round(span / 2.1);
    for (let i = 0; i < tufts; i++) {
      if (rng() < 0.32) continue;
      const t = rng() - 0.5;
      const side = rng() < 0.5 ? -1 : 1;
      const edge = alongX ? pv.depth * 0.5 : pv.width * 0.5;
      const jitter = (rng() - 0.5) * 0.5;
      const x = pv.x + (alongX ? pv.width * t : side * (edge + 0.25 + jitter));
      const z = pv.z + (alongX ? side * (edge + 0.25 + jitter) : pv.depth * t);
      if (!ground.isInBounds(x, z, 4) || blocked(x, z)) continue;
      weeds.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.75 });
    }
  }

  for (const seg of CITY_ROADS) {
    const dx = seg.x2 - seg.x1;
    const dz = seg.z2 - seg.z1;
    const len = Math.hypot(dx, dz);
    const ux = dx / (len || 1);
    const uz = dz / (len || 1);
    const cracks = Math.round(len / 7);
    for (let i = 0; i < cracks; i++) {
      if (rng() < 0.55) continue;
      const t = rng();
      const off = (rng() - 0.5) * seg.width * 0.88;
      const x = seg.x1 + dx * t - uz * off;
      const z = seg.z1 + dz * t + ux * off;
      if (!ground.isInBounds(x, z, 4) || blocked(x, z)) continue;
      weeds.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.55 + rng() * 0.5 });
    }
  }

  const yardBands: [number, number, number, number][] = [
    [-72, 52, 72, 66],
    [-72, 20, 72, 30],
    [-72, -26, 72, -18],
    [-72, -66, 72, -60],
    [-100, -110, -20, -104],
    [20, -110, 100, -104],
  ];
  for (const [x0, z0, x1, z1] of yardBands) {
    const area = Math.abs((x1 - x0) * (z1 - z0));
    const n = Math.round(area / 145);
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0);
      const z = z0 + rng() * (z1 - z0);
      if (!ground.isInBounds(x, z, 6) || blocked(x, z)) continue;
      if (rng() < 0.26) {
        bushes.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.7 + rng() * 0.8 });
      } else {
        weeds.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.9 });
      }
    }
  }

  return { weeds, bushes };
}

export interface DebrisScatter {
  litter: ReclaimPoint[];
  scorch: ReclaimPoint[];
}

export function generateDebris(
  ground: CityGround,
  rng: () => number,
  blocked: (x: number, z: number) => boolean,
): DebrisScatter {
  const litter: ReclaimPoint[] = [];
  const scorch: ReclaimPoint[] = [];

  const clusters: [number, number, number][] = [
    [0, 96, 26],
    [-40, 88, 16],
    [44, 92, 16],
    [0, 10, 24],
    [-52, 53, 14],
    [52, 53, 14],
    [0, -34, 20],
    [-62, -84, 18],
    [62, -84, 18],
    [-24, -44, 14],
    [24, -44, 14],
  ];

  for (const [cx, cz, radius] of clusters) {
    const n = Math.round(radius * 1.5);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!ground.isInBounds(x, z, 4) || blocked(x, z)) continue;
      litter.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.6 + rng() * 0.9 });
    }
  }

  const burns: [number, number][] = [
    [-11, 96],
    [12, 100],
    [-30, 6],
    [0, -34],
    [-30, -82],
    [34, -74],
    [-52, 92],
  ];
  for (const [x, z] of burns) {
    if (blocked(x, z)) continue;
    scorch.push({ x, z, yaw: rng() * Math.PI * 2, scale: 1.1 + rng() * 1.5 });
  }

  return { litter, scorch };
}
