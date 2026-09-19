import * as THREE from 'three';
import type { BuildingDef } from './cityLayout';

export interface DetailBuckets {
  wall: THREE.BufferGeometry[][];
  trim: THREE.BufferGeometry[];
  metal: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  board: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
}

export function paintGeometry(
  geo: THREE.BufferGeometry,
  base: THREE.Color,
  rng: () => number,
  options: {
    grimeHeight?: number;
    grimeStrength?: number;
    streakStrength?: number;
    mottle?: number;
    topFade?: number;
  } = {},
): THREE.BufferGeometry {
  const grimeHeight = options.grimeHeight ?? 0;
  const grimeStrength = options.grimeStrength ?? 0;
  const streakStrength = options.streakStrength ?? 0;
  const mottle = options.mottle ?? 0.05;
  const topFade = options.topFade ?? 0;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    c.copy(base);

    if (mottle > 0) {
      const n = hashNoise(x * 0.7, y * 0.35, z * 0.7);
      c.offsetHSL((n - 0.5) * 0.012, (n - 0.5) * mottle * 0.4, (n - 0.5) * mottle);
    }

    if (grimeStrength > 0 && grimeHeight > 0 && y < grimeHeight) {
      const t = 1 - y / grimeHeight;
      const dirt = t * t * grimeStrength;
      c.lerp(GRIME, dirt);
    }

    if (streakStrength > 0) {
      const lane = hashNoise(x * 2.3, 0, z * 2.3);
      if (lane > 0.62) {
        const fall = Math.max(0, 1 - y / 7);
        c.lerp(STREAK, fall * streakStrength * (lane - 0.62) * 2.4);
      }
    }

    if (topFade > 0) {
      c.offsetHSL(0, 0, Math.min(y * 0.004, topFade));
    }

    const jitter = (rng() - 0.5) * 0.02;
    colors[i * 3] = Math.max(0, c.r + jitter);
    colors[i * 3 + 1] = Math.max(0, c.g + jitter);
    colors[i * 3 + 2] = Math.max(0, c.b + jitter);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

const GRIME = new THREE.Color(0x3c352c);
const STREAK = new THREE.Color(0x5b5347);
const ASPHALT = new THREE.Color(0x3a3a3c);
const ASPHALT_WORN = new THREE.Color(0x56544f);
const KERB = new THREE.Color(0x8e8a82);
const PAVEMENT = new THREE.Color(0x7c786f);
const MOSS = new THREE.Color(0x4d5a38);

export function paintStreet(
  geo: THREE.BufferGeometry,
  roadVertexCount: number,
  kerbVertexCount: number,
  rng: () => number,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const kerbEnd = roadVertexCount + kerbVertexCount;
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const grain = hashNoise(x * 1.9, 0, z * 1.9);
    const patch = hashNoise(x * 0.21, 0, z * 0.21);
    const edge = hashNoise(x * 0.63, 11, z * 0.63);

    if (i < roadVertexCount) {
      c.copy(ASPHALT);
      c.lerp(ASPHALT_WORN, Math.max(0, patch - 0.45) * 1.5);
      c.offsetHSL(0, 0, (grain - 0.5) * 0.06);
      if (edge > 0.74) c.lerp(MOSS, (edge - 0.74) * 0.9);
    } else if (i < kerbEnd) {
      c.copy(KERB);
      c.offsetHSL(0, 0, (grain - 0.5) * 0.05);
      c.lerp(GRIME, Math.max(0, patch - 0.5) * 0.7);
      if (edge > 0.7) c.lerp(MOSS, (edge - 0.7) * 0.7);
    } else {
      c.copy(PAVEMENT);
      c.offsetHSL(0, 0, (grain - 0.5) * 0.07);
      c.lerp(GRIME, Math.max(0, patch - 0.58) * 0.8);
      if (edge > 0.68) c.lerp(MOSS, (edge - 0.68) * 1.1);
    }

    const jitter = (rng() - 0.5) * 0.02;
    colors[i * 3] = Math.max(0, c.r + jitter);
    colors[i * 3 + 1] = Math.max(0, c.g + jitter);
    colors[i * 3 + 2] = Math.max(0, c.b + jitter);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function hashNoise(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function localBox(
  b: BuildingDef,
  base: number,
  lx: number,
  ly: number,
  lz: number,
  sx: number,
  sy: number,
  sz: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(lx, ly, lz);
  geo.rotateY(b.yaw);
  geo.translate(b.x, base, b.z);
  return geo;
}

export function emitBuildingDetail(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  rng: () => number,
): void {
  const hw = b.width * 0.5;
  const hd = b.depth * 0.5;
  const wall = buckets.wall[b.palette];

  emitPlinth(b, base, wall, hw, hd);
  emitGutter(b, base, buckets.metal, hw, hd);

  if (b.kind === 'house') emitHouseFront(b, base, buckets, hw, hd, rng);
  else if (b.kind === 'storefront') emitShopFront(b, base, buckets, hw, hd, rng);
  else if (b.kind === 'apartment') emitApartmentFront(b, base, buckets, hw, hd, rng);
  else if (b.kind === 'garage') emitGarageFront(b, base, buckets, hw, hd, rng);
  else if (b.kind === 'kiosk') emitKioskFront(b, base, buckets, hw, hd);
  else if (b.kind === 'warehouse' || b.kind === 'substation') {
    emitIndustrialFront(b, base, buckets, hw, hd, rng);
  }
}

function emitPlinth(
  b: BuildingDef,
  base: number,
  wall: THREE.BufferGeometry[],
  hw: number,
  hd: number,
): void {
  wall.push(localBox(b, base, 0, 0.3, 0, hw * 2 + 0.22, 0.6, hd * 2 + 0.22));
}

function emitGutter(
  b: BuildingDef,
  base: number,
  metal: THREE.BufferGeometry[],
  hw: number,
  hd: number,
): void {
  const y = b.height - 0.12;
  metal.push(localBox(b, base, 0, y, hd + 0.16, hw * 2 + 0.5, 0.16, 0.18));
  metal.push(localBox(b, base, 0, y, -(hd + 0.16), hw * 2 + 0.5, 0.16, 0.18));
  for (const sx of [-1, 1]) {
    const pipe = new THREE.CylinderGeometry(0.075, 0.075, b.height - 0.2, 5);
    pipe.translate(sx * (hw - 0.3), (b.height - 0.2) * 0.5, hd + 0.16);
    pipe.rotateY(b.yaw);
    pipe.translate(b.x, base, b.z);
    metal.push(pipe);
  }
}

function emitWindowUnit(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  ly: number,
  lz: number,
  w: number,
  h: number,
  boarded: boolean,
  broken: boolean,
): void {
  const depth = lz > 0 ? 1 : -1;
  const face = lz + depth * 0.03;
  const frameT = 0.11;

  buckets.trim.push(localBox(b, base, lx, ly + h * 0.5 + frameT * 0.5, face, w + frameT * 2, frameT, 0.14));
  buckets.trim.push(localBox(b, base, lx, ly - h * 0.5 - frameT * 0.5, face, w + frameT * 2, frameT, 0.14));
  buckets.trim.push(localBox(b, base, lx - w * 0.5 - frameT * 0.5, ly, face, frameT, h, 0.14));
  buckets.trim.push(localBox(b, base, lx + w * 0.5 + frameT * 0.5, ly, face, frameT, h, 0.14));
  buckets.trim.push(
    localBox(b, base, lx, ly - h * 0.5 - frameT, face + depth * 0.06, w + frameT * 3, 0.1, 0.26),
  );

  if (boarded) {
    for (let i = 0; i < 3; i++) {
      const plank = new THREE.BoxGeometry(w + 0.18, 0.2, 0.06);
      plank.rotateZ((i - 1) * 0.07);
      plank.translate(lx, ly - h * 0.3 + i * h * 0.32, face + depth * 0.09);
      plank.rotateY(b.yaw);
      plank.translate(b.x, base, b.z);
      buckets.board.push(plank);
    }
    return;
  }

  if (broken) {
    const shard = new THREE.BoxGeometry(w * 0.92, h * 0.34, 0.05);
    shard.translate(lx, ly + h * 0.28, face);
    shard.rotateY(b.yaw);
    shard.translate(b.x, base, b.z);
    buckets.glass.push(shard);
    return;
  }

  const pane = new THREE.BoxGeometry(w, h, 0.05);
  pane.translate(lx, ly, face);
  pane.rotateY(b.yaw);
  pane.translate(b.x, base, b.z);
  buckets.glass.push(pane);
}

function emitDoorRecess(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  lz: number,
  w: number,
  h: number,
  barricaded: boolean,
): void {
  const depth = lz > 0 ? 1 : -1;
  const face = lz + depth * 0.02;

  buckets.trim.push(localBox(b, base, lx, h * 0.5, face + depth * 0.05, w + 0.26, h + 0.26, 0.12));
  buckets.board.push(localBox(b, base, lx, h * 0.5, face, w, h, 0.09));
  buckets.metal.push(
    localBox(b, base, lx + w * 0.32, h * 0.52, face + depth * 0.08, 0.1, 0.1, 0.1),
  );

  if (barricaded) {
    for (let i = 0; i < 2; i++) {
      const plank = new THREE.BoxGeometry(w + 0.34, 0.22, 0.07);
      plank.rotateZ(i === 0 ? 0.11 : -0.09);
      plank.translate(lx, h * 0.42 + i * 0.62, face + depth * 0.12);
      plank.rotateY(b.yaw);
      plank.translate(b.x, base, b.z);
      buckets.board.push(plank);
    }
  }
}

function emitStep(
  b: BuildingDef,
  base: number,
  wall: THREE.BufferGeometry[],
  lx: number,
  lz: number,
  w: number,
): void {
  const depth = lz > 0 ? 1 : -1;
  wall.push(localBox(b, base, lx, 0.09, lz + depth * 0.55, w, 0.18, 1.1));
}

function emitHouseFront(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
  rng: () => number,
): void {
  const wall = buckets.wall[b.palette];
  const doorW = 1.15;
  const doorH = 2.2;
  const doorX = -hw * 0.42;

  emitDoorRecess(b, base, buckets, doorX, hd, doorW, doorH, rng() < 0.45);
  emitStep(b, base, wall, doorX, hd, doorW + 0.9);
  emitPorch(b, base, buckets, doorX, hd, doorW + 1.5);

  const winY = 1.75;
  const spots = [hw * 0.18, hw * 0.62];
  for (const lx of spots) {
    const r = rng();
    emitWindowUnit(b, base, buckets, lx, winY, hd, 1.5, 1.35, r < 0.4, r >= 0.4 && r < 0.62);
  }
  emitWindowUnit(b, base, buckets, -hw * 0.42, 4.35, hd, 1.2, 1.1, rng() < 0.35, rng() < 0.3);
  emitWindowUnit(b, base, buckets, hw * 0.4, 4.35, hd, 1.2, 1.1, rng() < 0.35, rng() < 0.3);

  for (const side of [-1, 1]) {
    const r = rng();
    const geoLx = side * (hw + 0.02);
    emitSideWindow(b, base, buckets, geoLx, 2.0, -hd * 0.3, side, 1.25, 1.2, r < 0.5);
  }

  emitChimney(b, base, buckets, hw * 0.55, -hd * 0.4);
}

function emitSideWindow(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  ly: number,
  lz: number,
  side: number,
  w: number,
  h: number,
  boarded: boolean,
): void {
  const face = lx + side * 0.03;
  const frameT = 0.11;
  buckets.trim.push(localBox(b, base, face, ly + h * 0.5, lz, 0.14, frameT, w + frameT * 2));
  buckets.trim.push(localBox(b, base, face, ly - h * 0.5, lz, 0.14, frameT, w + frameT * 2));
  buckets.trim.push(localBox(b, base, face, ly, lz - w * 0.5, 0.14, h, frameT));
  buckets.trim.push(localBox(b, base, face, ly, lz + w * 0.5, 0.14, h, frameT));

  if (boarded) {
    for (let i = 0; i < 2; i++) {
      buckets.board.push(
        localBox(b, base, face + side * 0.06, ly - 0.25 + i * 0.5, lz, 0.06, 0.2, w + 0.16),
      );
    }
    return;
  }
  buckets.glass.push(localBox(b, base, face, ly, lz, 0.05, h, w));
}

function emitPorch(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  hd: number,
  w: number,
): void {
  const roofY = 2.75;
  buckets.board.push(localBox(b, base, lx, roofY, hd + 0.75, w, 0.14, 1.6));
  for (const sx of [-1, 1]) {
    const post = new THREE.BoxGeometry(0.14, roofY, 0.14);
    post.translate(lx + sx * (w * 0.5 - 0.12), roofY * 0.5, hd + 1.42);
    post.rotateY(b.yaw);
    post.translate(b.x, base, b.z);
    buckets.board.push(post);
  }
}

function emitChimney(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  lz: number,
): void {
  const wall = buckets.wall[b.palette];
  wall.push(localBox(b, base, lx, b.height + 0.95, lz, 0.85, 1.9, 0.85));
  buckets.trim.push(localBox(b, base, lx, b.height + 1.95, lz, 0.98, 0.14, 0.98));
}

function emitShopFront(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
  rng: () => number,
): void {
  const wall = buckets.wall[b.palette];
  const doorW = 1.25;
  const doorH = 2.35;

  emitDoorRecess(b, base, buckets, hw * 0.55, hd, doorW, doorH, rng() < 0.55);
  emitStep(b, base, wall, hw * 0.55, hd, doorW + 0.8);

  const glassW = hw * 0.92;
  const r = rng();
  emitWindowUnit(b, base, buckets, -hw * 0.22, 1.85, hd, glassW, 2.3, r < 0.35, r >= 0.35);

  emitAwning(b, base, buckets, -hw * 0.22, hd, glassW + 0.5);
  emitShopSign(b, base, buckets, 0, hd, hw * 1.5);

  const upperY = 5.2;
  for (const lx of [-hw * 0.55, 0, hw * 0.55]) {
    const rr = rng();
    emitWindowUnit(b, base, buckets, lx, upperY, hd, 1.25, 1.2, rr < 0.45, rr >= 0.45 && rr < 0.7);
  }
}

function emitAwning(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  hd: number,
  w: number,
): void {
  const geo = new THREE.BoxGeometry(w, 0.12, 1.5);
  geo.rotateX(-0.28);
  geo.translate(lx, 3.35, hd + 0.72);
  geo.rotateY(b.yaw);
  geo.translate(b.x, base, b.z);
  buckets.board.push(geo);

  for (const sx of [-1, 1]) {
    const bar = new THREE.CylinderGeometry(0.045, 0.045, 1.5, 4);
    bar.rotateX(Math.PI / 2 - 0.5);
    bar.translate(lx + sx * (w * 0.5 - 0.15), 3.6, hd + 0.4);
    bar.rotateY(b.yaw);
    bar.translate(b.x, base, b.z);
    buckets.metal.push(bar);
  }
}

function emitShopSign(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  hd: number,
  w: number,
): void {
  buckets.board.push(localBox(b, base, lx, 4.15, hd + 0.18, w, 0.85, 0.16));
  buckets.trim.push(localBox(b, base, lx, 4.15, hd + 0.3, w - 0.3, 0.5, 0.06));
}

function emitApartmentFront(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
  rng: () => number,
): void {
  const wall = buckets.wall[b.palette];
  const doorW = 1.6;
  const doorH = 2.5;

  emitDoorRecess(b, base, buckets, 0, hd, doorW, doorH, false);
  emitStep(b, base, wall, 0, hd, doorW + 1.2);
  buckets.trim.push(localBox(b, base, 0, doorH + 0.5, hd + 0.35, doorW + 1.4, 0.16, 0.9));

  const floors = 4;
  const cols = [-hw * 0.66, -hw * 0.22, hw * 0.22, hw * 0.66];
  for (let f = 0; f < floors; f++) {
    const y = 3.4 + f * 2.9;
    if (y > b.height - 1.2) continue;
    for (const lx of cols) {
      const r = rng();
      emitWindowUnit(b, base, buckets, lx, y, hd, 1.2, 1.35, r < 0.25, r >= 0.25 && r < 0.45);
    }
    buckets.trim.push(localBox(b, base, 0, y - 1.15, hd + 0.08, hw * 2, 0.12, 0.2));
  }

  emitFireEscape(b, base, buckets, hw, hd);
}

function emitFireEscape(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
): void {
  const side = -1;
  const lx = side * (hw + 0.55);
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const y = 3.5 + i * 2.9;
    if (y > b.height - 0.8) break;
    buckets.metal.push(localBox(b, base, lx, y, hd * 0.1, 1.1, 0.09, 3.4));
    buckets.metal.push(localBox(b, base, lx + side * 0.5, y + 0.55, hd * 0.1, 0.07, 1.1, 3.4));
    for (const lz of [hd * 0.1 - 1.7, hd * 0.1 + 1.7]) {
      buckets.metal.push(localBox(b, base, lx, y + 0.55, lz, 1.1, 1.1, 0.07));
    }
    if (i < levels - 1) {
      const stair = new THREE.BoxGeometry(0.85, 0.09, 3.2);
      stair.rotateX(0.72);
      stair.translate(lx, y + 1.45, hd * 0.1 + 1.0);
      stair.rotateY(b.yaw);
      stair.translate(b.x, base, b.z);
      buckets.metal.push(stair);
    }
  }
}

function emitGarageFront(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
  rng: () => number,
): void {
  const doorW = hw * 1.25;
  const doorH = 2.8;
  buckets.trim.push(localBox(b, base, 0, doorH * 0.5, hd + 0.1, doorW + 0.3, doorH + 0.3, 0.12));

  const slats = 7;
  for (let i = 0; i < slats; i++) {
    const y = 0.22 + (i * (doorH - 0.3)) / slats;
    buckets.metal.push(localBox(b, base, 0, y, hd + 0.16, doorW, (doorH - 0.3) / slats - 0.04, 0.09));
  }

  if (rng() < 0.5) {
    emitWindowUnit(b, base, buckets, hw * 0.62, 3.5, hd, 0.95, 0.85, true, false);
  }
}

function emitKioskFront(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
): void {
  buckets.trim.push(localBox(b, base, 0, 2.05, hd + 0.2, hw * 2 + 0.4, 0.5, 0.3));
  for (let i = 0; i < 4; i++) {
    const shutter = new THREE.BoxGeometry(hw * 1.7, 0.26, 0.09);
    shutter.translate(0, 0.9 + i * 0.3, hd + 0.14);
    shutter.rotateY(b.yaw);
    shutter.translate(b.x, base, b.z);
    buckets.metal.push(shutter);
  }
}

function emitIndustrialFront(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  hw: number,
  hd: number,
  rng: () => number,
): void {
  const door = b.doorways[0];
  const doorHalf = door ? door.width * 0.5 : 3;
  const doorH = door ? door.height : 5;

  buckets.trim.push(
    localBox(b, base, 0, doorH + 0.2, -(hd + 0.12), doorHalf * 2 + 0.7, 0.3, 0.24),
  );
  for (const sx of [-1, 1]) {
    buckets.trim.push(
      localBox(b, base, sx * (doorHalf + 0.2), doorH * 0.5, -(hd + 0.12), 0.24, doorH, 0.24),
    );
  }

  const bandY = b.height * 0.62;
  buckets.metal.push(localBox(b, base, 0, bandY, hd + 0.1, hw * 2, 0.22, 0.14));
  buckets.metal.push(localBox(b, base, 0, bandY, -(hd + 0.1), hw * 2, 0.22, 0.14));

  const cols = Math.max(3, Math.round(hw / 3));
  for (let i = 0; i < cols; i++) {
    const t = (i + 0.5) / cols;
    const lx = -hw * 0.82 + t * hw * 1.64;
    const r = rng();
    emitHighWindow(b, base, buckets, lx, b.height * 0.78, hd, 1.5, 1.0, r < 0.5);
  }

  buckets.metal.push(localBox(b, base, hw * 0.7, b.height + 0.85, 0, 1.4, 1.1, 1.4));
  buckets.trim.push(localBox(b, base, -hw * 0.6, 2.6, hd + 0.16, 2.6, 1.1, 0.14));
}

function emitHighWindow(
  b: BuildingDef,
  base: number,
  buckets: DetailBuckets,
  lx: number,
  ly: number,
  hd: number,
  w: number,
  h: number,
  broken: boolean,
): void {
  buckets.trim.push(localBox(b, base, lx, ly, hd + 0.05, w + 0.16, h + 0.16, 0.1));
  if (broken) {
    buckets.glass.push(localBox(b, base, lx, ly + h * 0.3, hd + 0.08, w * 0.9, h * 0.35, 0.05));
    return;
  }
  buckets.glass.push(localBox(b, base, lx, ly, hd + 0.08, w, h, 0.05));
}
