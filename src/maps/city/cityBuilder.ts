import * as THREE from 'three';
import type { PhysicsWorld } from '../../physics/physics';
import { mergeGeometries } from '../../world/vegetation';
import { makeRng } from '../../util/math';
import type { CityGround } from './cityGround';
import { CITY_MAP } from './cityConfig';
import { emitBuildingDetail, paintGeometry, paintStreet, type DetailBuckets } from './cityDetail';
import { buildCityLights } from './cityLights';
import type { CityAssetSet } from './cityAssets';
import {
  buildStreetSurfaces,
  generateDebris,
  generateReclaimGrowth,
  type ReclaimPoint,
} from './cityStreet';
import {
  CITY_BUILDINGS,
  CITY_PROPS,
  anyFootprintContains,
  type BuildingDef,
  type PropKind,
} from './cityLayout';

export interface CityBuildResult {
  group: THREE.Group;
  landmarks: { x: number; z: number; label: string }[];
  barrierMeshes: Map<string, THREE.Object3D>;
  barrierColliders: Map<string, number>;
  setPowered(on: boolean): void;
  dispose(): void;
}

const WALL_THICKNESS = 0.35;
const ROOF_THICKNESS = 0.3;
const PARAPET = 0.5;

const PALETTES = [0xb4a894, 0x9d8d7c, 0xa8907a];
const ROOF_COLOR = 0x6f6b63;
const TRIM_COLOR = 0x938779;

interface KitInstance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export function buildCity(
  ground: CityGround,
  physics: PhysicsWorld,
  assets?: CityAssetSet,
): CityBuildResult {
  const rng = makeRng(90210);
  const group = new THREE.Group();
  group.name = 'city';
  const landmarks: { x: number; z: number; label: string }[] = [];
  const barrierMeshes = new Map<string, THREE.Object3D>();
  const barrierColliders = new Map<string, number>();
  const disposables: (THREE.Material | THREE.BufferGeometry)[] = [];

  const wallMats = PALETTES.map(() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0,
      vertexColors: true,
    });
    disposables.push(m);
    return m;
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.05,
    vertexColors: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.1,
    vertexColors: true,
  });
  const surfaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    vertexColors: true,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.55,
    vertexColors: true,
  });
  const rustMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.28,
    vertexColors: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7f8f99,
    roughness: 0.18,
    metalness: 0.15,
    envMapIntensity: 1.2,
  });
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0.02,
    vertexColors: true,
  });
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.05,
    vertexColors: true,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const decalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.99,
    metalness: 0,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  disposables.push(
    roofMat,
    trimMat,
    surfaceMat,
    metalMat,
    rustMat,
    glassMat,
    boardMat,
    barrierMat,
    foliageMat,
    decalMat,
  );

  const detail: DetailBuckets = {
    wall: PALETTES.map(() => []),
    trim: [],
    metal: [],
    glass: [],
    board: [],
    roof: [],
  };

  buildRoadSurface(group, ground, rng, surfaceMat, decalMat, disposables);
  buildBuildings(
    group,
    ground,
    physics,
    rng,
    wallMats,
    roofMat,
    glassMat,
    detail,
    landmarks,
    disposables,
  );
  buildProps(group, ground, physics, rng, metalMat, rustMat, trimMat, detail, disposables, assets);
  buildBarriers(group, ground, physics, rng, barrierMat, barrierMeshes, barrierColliders, disposables);
  buildInteractableAnchors(group, ground, rng, metalMat, trimMat, detail, disposables);
  buildGroundDressing(group, ground, rng, foliageMat, decalMat, boardMat, disposables);
  flushDetail(group, rng, detail, wallMats, trimMat, metalMat, glassMat, boardMat, disposables);

  const lights = buildCityLights(ground, makeRng(4471));
  group.add(lights.group);

  return {
    group,
    landmarks,
    barrierMeshes,
    barrierColliders,
    setPowered(on: boolean): void {
      lights.setPowered(on);
    },
    dispose(): void {
      lights.dispose();
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };
}

function flushDetail(
  group: THREE.Group,
  rng: () => number,
  detail: DetailBuckets,
  wallMats: THREE.Material[],
  trimMat: THREE.Material,
  metalMat: THREE.Material,
  glassMat: THREE.Material,
  boardMat: THREE.Material,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  detail.wall.forEach((parts, i) => {
    if (parts.length === 0) return;
    const geo = mergeGeometries(parts);
    paintGeometry(geo, new THREE.Color(PALETTES[i]), rng, {
      mottle: 0.1,
      grimeHeight: 1.6,
      grimeStrength: 0.5,
      streakStrength: 0.34,
    });
    const mesh = new THREE.Mesh(geo, wallMats[i]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `city_walldetail_${i}`;
    group.add(mesh);
    disposables.push(geo);
  });

  const flush = (
    parts: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    base: number,
    paint: boolean,
    options: Parameters<typeof paintGeometry>[3],
  ) => {
    if (parts.length === 0) return;
    const geo = mergeGeometries(parts);
    if (paint) paintGeometry(geo, new THREE.Color(base), rng, options);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
    disposables.push(geo);
  };

  flush(detail.trim, trimMat, 'city_trim', TRIM_COLOR, true, {
    mottle: 0.12,
    grimeHeight: 1.2,
    grimeStrength: 0.42,
  });
  flush(detail.metal, metalMat, 'city_metaldetail', 0x8d9298, true, {
    mottle: 0.16,
    grimeHeight: 2.2,
    grimeStrength: 0.45,
  });
  flush(detail.board, boardMat, 'city_boards', 0x9c8059, true, {
    mottle: 0.2,
    grimeHeight: 1.4,
    grimeStrength: 0.4,
  });
  flush(detail.glass, glassMat, 'city_glassdetail', 0x2a3338, false, {});
}

function buildRoadSurface(
  group: THREE.Group,
  ground: CityGround,
  rng: () => number,
  surfaceMat: THREE.Material,
  decalMat: THREE.Material,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  const surfaces = buildStreetSurfaces(ground, rng);

  const roadVerts = surfaces.road.attributes.position.count;
  const kerbVerts = surfaces.kerb.attributes.position.count;
  const solid = mergeGeometries([surfaces.road, surfaces.kerb, surfaces.pavement]);
  paintStreet(solid, roadVerts, kerbVerts, rng);
  const street = new THREE.Mesh(solid, surfaceMat);
  street.receiveShadow = true;
  street.name = 'city_street';
  group.add(street);
  disposables.push(solid);

  const decalParts: THREE.BufferGeometry[] = [];
  if (surfaces.markings) decalParts.push(surfaces.markings);
  if (surfaces.patches) decalParts.push(surfaces.patches);
  if (decalParts.length > 0) {
    const decals = mergeGeometries(decalParts);
    for (const p of decalParts) p.dispose();
    const mesh = new THREE.Mesh(decals, decalMat);
    mesh.receiveShadow = true;
    mesh.name = 'city_streetdecals';
    group.add(mesh);
    disposables.push(decals);
  }
}

function buildGroundDressing(
  group: THREE.Group,
  ground: CityGround,
  rng: () => number,
  foliageMat: THREE.Material,
  decalMat: THREE.Material,
  boardMat: THREE.Material,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  const blocked = (x: number, z: number) => anyFootprintContains(x, z, 1.2) !== null;
  const growth = generateReclaimGrowth(ground, rng, blocked);
  const debris = generateDebris(ground, rng, blocked);

  addScatter(group, ground, growth.weeds, makeWeedGeometry(rng), foliageMat, 'city_weeds', disposables, false);
  addScatter(group, ground, growth.bushes, makeOvergrownBushGeometry(rng), foliageMat, 'city_overgrowth', disposables, true);
  addScatter(group, ground, debris.litter, makeLitterGeometry(rng), boardMat, 'city_litter', disposables, false);
  addScatter(group, ground, debris.scorch, makeScorchGeometry(), decalMat, 'city_scorch', disposables, false);
}

function addScatter(
  group: THREE.Group,
  ground: CityGround,
  points: ReclaimPoint[],
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  name: string,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
  shadows: boolean,
): void {
  disposables.push(geo);
  if (points.length === 0) return;
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  mesh.name = name;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  points.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw);
    pos.set(p.x, ground.heightAt(p.x, p.z), p.z);
    scl.setScalar(p.scale);
    mtx.compose(pos, q, scl);
    mesh.setMatrixAt(i, mtx);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function buildBuildings(
  group: THREE.Group,
  ground: CityGround,
  physics: PhysicsWorld,
  rng: () => number,
  wallMats: THREE.Material[],
  roofMat: THREE.Material,
  glassMat: THREE.Material,
  detail: DetailBuckets,
  landmarks: { x: number; z: number; label: string }[],
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  const wallBuckets: THREE.BufferGeometry[][] = wallMats.map(() => []);
  const roofParts: THREE.BufferGeometry[] = [];
  const glassParts: THREE.BufferGeometry[] = [];

  for (const b of CITY_BUILDINGS) {
    const base = ground.heightAt(b.x, b.z);
    if (b.enterable) {
      emitEnterableShell(b, base, wallBuckets[b.palette], roofParts, physics);
    } else {
      emitSolidShell(b, base, wallBuckets[b.palette], roofParts, physics);
    }
    emitBuildingDetail(b, base, detail, rng);
    if (b.kind === 'apartment' || b.kind === 'warehouse' || b.kind === 'substation') {
      landmarks.push({ x: b.x, z: b.z, label: labelFor(b) });
    }
  }

  wallBuckets.forEach((parts, i) => {
    if (parts.length === 0) return;
    const geo = mergeGeometries(parts);
    paintGeometry(geo, new THREE.Color(PALETTES[i]), rng, {
      mottle: 0.085,
      grimeHeight: 2.4,
      grimeStrength: 0.55,
      streakStrength: 0.4,
      topFade: 0.05,
    });
    const mesh = new THREE.Mesh(geo, wallMats[i]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `city_walls_${i}`;
    group.add(mesh);
    disposables.push(geo);
  });

  if (roofParts.length > 0) {
    const geo = mergeGeometries(roofParts);
    paintGeometry(geo, new THREE.Color(ROOF_COLOR), rng, { mottle: 0.18 });
    const roofs = new THREE.Mesh(geo, roofMat);
    roofs.castShadow = true;
    roofs.receiveShadow = true;
    roofs.name = 'city_roofs';
    group.add(roofs);
    disposables.push(geo);
  }

  if (glassParts.length > 0) {
    const glass = new THREE.Mesh(mergeGeometries(glassParts), glassMat);
    glass.name = 'city_glass';
    group.add(glass);
    disposables.push(glass.geometry);
  }
}

function labelFor(b: BuildingDef): string {
  if (b.kind === 'apartment') return 'Apartments';
  if (b.kind === 'warehouse') return 'Depot';
  return 'Substation';
}

function pushBox(
  parts: THREE.BufferGeometry[],
  b: BuildingDef,
  lx: number,
  ly: number,
  lz: number,
  hw: number,
  hh: number,
  hd: number,
  base: number,
): void {
  const geo = new THREE.BoxGeometry(hw * 2, hh * 2, hd * 2);
  geo.translate(lx, ly, lz);
  geo.rotateY(b.yaw);
  geo.translate(b.x, base, b.z);
  parts.push(geo);
}

function emitSolidShell(
  b: BuildingDef,
  base: number,
  wallParts: THREE.BufferGeometry[],
  roofParts: THREE.BufferGeometry[],
  physics: PhysicsWorld,
): void {
  const hw = b.width * 0.5;
  const hd = b.depth * 0.5;
  const hh = b.height * 0.5;

  pushBox(wallParts, b, 0, hh, 0, hw, hh, hd, base);
  pushBox(roofParts, b, 0, b.height + ROOF_THICKNESS * 0.5, 0, hw + 0.3, ROOF_THICKNESS * 0.5, hd + 0.3, base);

  if (b.kind === 'apartment' || b.kind === 'warehouse') {
    const parapetY = b.height + ROOF_THICKNESS + PARAPET * 0.5;
    pushBox(roofParts, b, 0, parapetY, hd + 0.3, hw + 0.3, PARAPET * 0.5, 0.15, base);
    pushBox(roofParts, b, 0, parapetY, -(hd + 0.3), hw + 0.3, PARAPET * 0.5, 0.15, base);
  }

  physics.addStaticBox(b.x, base + hh, b.z, hw, hh, hd, b.yaw);
}

function emitEnterableShell(
  b: BuildingDef,
  base: number,
  wallParts: THREE.BufferGeometry[],
  roofParts: THREE.BufferGeometry[],
  physics: PhysicsWorld,
): void {
  const hw = b.width * 0.5;
  const hd = b.depth * 0.5;
  const t = WALL_THICKNESS;

  const addWall = (
    lx: number,
    lz: number,
    halfLenX: number,
    halfLenZ: number,
    wallH: number,
    yOff = 0,
  ) => {
    pushBox(wallParts, b, lx, yOff + wallH * 0.5, lz, halfLenX, wallH * 0.5, halfLenZ, base);
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    physics.addStaticBox(
      b.x + lx * c + lz * s,
      base + yOff + wallH * 0.5,
      b.z - lx * s + lz * c,
      halfLenX,
      wallH * 0.5,
      halfLenZ,
      b.yaw,
    );
  };

  const door = b.doorways[0];
  const doorHalf = door.width * 0.5;
  const sideSpan = (b.width - door.width) * 0.5;

  addWall(-(doorHalf + sideSpan * 0.5), -hd, sideSpan * 0.5, t, b.height);
  addWall(doorHalf + sideSpan * 0.5, -hd, sideSpan * 0.5, t, b.height);
  addWall(0, -hd, doorHalf, t, b.height - door.height, door.height);

  addWall(0, hd, hw, t, b.height);
  addWall(-hw, 0, t, hd, b.height);
  addWall(hw, 0, t, hd, b.height);

  pushBox(roofParts, b, 0, b.height + ROOF_THICKNESS * 0.5, 0, hw + 0.3, ROOF_THICKNESS * 0.5, hd + 0.3, base);
  physics.addStaticBox(b.x, base + b.height + ROOF_THICKNESS * 0.5, b.z, hw, ROOF_THICKNESS * 0.5, hd, b.yaw);

  pushBox(wallParts, b, 0, 0.05, 0, hw, 0.05, hd, base);
}

function buildProps(
  group: THREE.Group,
  ground: CityGround,
  physics: PhysicsWorld,
  rng: () => number,
  metalMat: THREE.Material,
  rustMat: THREE.Material,
  trimMat: THREE.Material,
  detail: DetailBuckets,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
  assets?: CityAssetSet,
): void {
  const byKind = new Map<PropKind, KitInstance[]>();
  for (const p of CITY_PROPS) {
    const y = ground.heightAt(p.x, p.z);
    const list = byKind.get(p.kind) ?? [];
    list.push({ x: p.x, y, z: p.z, yaw: p.yaw, scale: 1 });
    byKind.set(p.kind, list);
  }

  emitCarWrecks(byKind.get('car') ?? [], detail, rng);
  emitDumpsterSpill(byKind.get('dumpster') ?? [], detail, rng);

  const kits: {
    kind: PropKind;
    geo: THREE.BufferGeometry;
    mat: THREE.Material;
    tint: number;
    collide: (i: KitInstance) => void;
  }[] = [
    {
      kind: 'car',
      geo: assets?.car?.geometry ?? makeCarGeometry(),
      mat: rustMat,
      tint: 0x9c8a76,
      collide: (i) => physics.addStaticBox(i.x, i.y + 0.68, i.z, 2.15, 0.68, 0.92, i.yaw),
    },
    {
      kind: 'lamp',
      geo: assets?.lamp?.geometry ?? makeLampGeometry(),
      mat: metalMat,
      tint: 0x8d9298,
      collide: (i) => physics.addStaticCylinder(i.x, i.y + 2.4, i.z, 2.4, 0.13),
    },
    {
      kind: 'pole',
      geo: makePoleGeometry(),
      mat: trimMat,
      tint: 0x958a7c,
      collide: (i) => physics.addStaticCylinder(i.x, i.y + 3.6, i.z, 3.6, 0.17),
    },
    {
      kind: 'dumpster',
      geo: assets?.dumpster?.geometry ?? makeDumpsterGeometry(),
      mat: rustMat,
      tint: 0x7f8f70,
      collide: (i) => physics.addStaticBox(i.x, i.y + 0.62, i.z, 1.05, 0.62, 0.72, i.yaw),
    },
    {
      kind: 'hydrant',
      geo: assets?.hydrant?.geometry ?? makeHydrantGeometry(),
      mat: rustMat,
      tint: 0x8c3b32,
      collide: (i) => physics.addStaticCylinder(i.x, i.y + 0.42, i.z, 0.42, 0.18),
    },
    {
      kind: 'bench',
      geo: makeBenchGeometry(),
      mat: trimMat,
      tint: 0x957c5e,
      collide: (i) => physics.addStaticBox(i.x, i.y + 0.45, i.z, 0.95, 0.45, 0.32, i.yaw),
    },
    {
      kind: 'barricade',
      geo: assets?.barricade?.geometry ?? makeBarricadeGeometry(),
      mat: trimMat,
      tint: 0x9c8059,
      collide: (i) => physics.addStaticBox(i.x, i.y + 0.55, i.z, 1.3, 0.55, 0.2, i.yaw),
    },
    {
      kind: 'rubble',
      geo: makeRubbleGeometry(),
      mat: trimMat,
      tint: 0xa9a193,
      collide: (i) => physics.addStaticBox(i.x, i.y + 0.35, i.z, 1.1, 0.35, 1.0, i.yaw),
    },
  ];

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);

  for (const kit of kits) {
    const list = byKind.get(kit.kind);
    paintGeometry(kit.geo, new THREE.Color(kit.tint), rng, {
      mottle: 0.2,
      grimeHeight: 0.6,
      grimeStrength: 0.4,
    });
    disposables.push(kit.geo);
    if (!list || list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(kit.geo, kit.mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `city_${kit.kind}`;
    list.forEach((inst, i) => {
      q.setFromAxisAngle(up, inst.yaw);
      pos.set(inst.x, inst.y, inst.z);
      scl.setScalar(inst.scale);
      mtx.compose(pos, q, scl);
      mesh.setMatrixAt(i, mtx);
      kit.collide(inst);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  buildFences(group, ground, physics, rng, trimMat, disposables);
}

function buildFences(
  group: THREE.Group,
  ground: CityGround,
  physics: PhysicsWorld,
  rng: () => number,
  mat: THREE.Material,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  const panelLen = 2;
  const panels: KitInstance[] = [];
  for (const p of CITY_PROPS) {
    if (p.kind !== 'fence') continue;
    const count = Math.max(1, Math.round(p.length / panelLen));
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    for (let i = 0; i < count; i++) {
      const t = (i - (count - 1) * 0.5) * panelLen;
      const x = p.x + t * c;
      const z = p.z - t * s;
      panels.push({ x, y: ground.heightAt(x, z), z, yaw: p.yaw, scale: 1 });
    }
    physics.addStaticBox(p.x, ground.heightAt(p.x, p.z) + 0.85, p.z, p.length * 0.5, 0.85, 0.09, p.yaw);
  }
  if (panels.length === 0) return;

  const geo = makeFencePanelGeometry(panelLen);
  disposables.push(geo);
  const mesh = new THREE.InstancedMesh(geo, mat, panels.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'city_fence';
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  panels.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yaw + (rng() - 0.5) * 0.04);
    pos.set(p.x, p.y, p.z);
    mtx.compose(pos, q, scl);
    mesh.setMatrixAt(i, mtx);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function buildBarriers(
  group: THREE.Group,
  ground: CityGround,
  physics: PhysicsWorld,
  rng: () => number,
  mat: THREE.Material,
  out: Map<string, THREE.Object3D>,
  colliders: Map<string, number>,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  for (const bar of CITY_MAP.barriers) {
    const base = ground.heightAt(bar.x, bar.z);
    const parts: THREE.BufferGeometry[] = [];
    const planks = 5;
    for (let i = 0; i < planks; i++) {
      const y = 0.35 + (i * (bar.height - 0.6)) / (planks - 1);
      const tilt = (i % 2 === 0 ? 1 : -1) * 0.05;
      const plank = new THREE.BoxGeometry(bar.width, 0.28, bar.thickness);
      plank.rotateZ(tilt);
      plank.translate(0, y, 0);
      parts.push(plank);
    }
    const postL = new THREE.BoxGeometry(0.18, bar.height, bar.thickness * 1.2);
    postL.translate(-bar.width * 0.5 + 0.1, bar.height * 0.5, 0);
    const postR = postL.clone();
    postR.translate(bar.width - 0.2, 0, 0);
    parts.push(postL, postR);

    const geo = mergeGeometries(parts);
    geo.rotateY(bar.yaw);
    paintGeometry(geo, new THREE.Color(0xa07a45), rng, {
      mottle: 0.22,
      grimeHeight: 1.0,
      grimeStrength: 0.42,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bar.x, base, bar.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `barrier_${bar.id}`;
    group.add(mesh);
    disposables.push(geo);
    out.set(bar.id, mesh);

    const handle = physics.addStaticBox(
      bar.x,
      base + bar.height * 0.5,
      bar.z,
      bar.width * 0.5,
      bar.height * 0.5,
      bar.thickness * 0.5,
      bar.yaw,
    );
    colliders.set(bar.id, handle);
  }
}

function buildInteractableAnchors(
  group: THREE.Group,
  ground: CityGround,
  rng: () => number,
  metalMat: THREE.Material,
  trimMat: THREE.Material,
  detail: DetailBuckets,
  disposables: (THREE.Material | THREE.BufferGeometry)[],
): void {
  const machines: KitInstance[] = [];
  for (const p of CITY_MAP.perkMachines) {
    machines.push({ x: p.x, y: ground.heightAt(p.x, p.z), z: p.z, yaw: p.yaw, scale: 1 });
  }
  for (const r of CITY_MAP.rewardMachines) {
    machines.push({ x: r.x, y: ground.heightAt(r.x, r.z), z: r.z, yaw: r.yaw, scale: 1 });
  }

  if (machines.length > 0) {
    const geo = makeMachineGeometry();
    paintGeometry(geo, new THREE.Color(0x8d9298), rng, { mottle: 0.16, grimeHeight: 0.5, grimeStrength: 0.35 });
    disposables.push(geo);
    const mesh = new THREE.InstancedMesh(geo, metalMat, machines.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'city_machines';
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    machines.forEach((m, i) => {
      q.setFromAxisAngle(up, m.yaw);
      pos.set(m.x, m.y, m.z);
      mtx.compose(pos, q, scl);
      mesh.setMatrixAt(i, mtx);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  const signs: KitInstance[] = CITY_MAP.wallWeapons.map((w) => ({
    x: w.x,
    y: ground.heightAt(w.x, w.z) + w.y,
    z: w.z,
    yaw: w.yaw,
    scale: 1,
  }));

  for (const w of CITY_MAP.wallWeapons) {
    const board = new THREE.BoxGeometry(1.5, 1.1, 0.07);
    board.translate(0, 0, -0.06);
    board.rotateY(w.yaw);
    board.translate(w.x, ground.heightAt(w.x, w.z) + w.y, w.z);
    detail.board.push(board);
  }
  if (signs.length > 0) {
    const geo = makeWallSignGeometry();
    paintGeometry(geo, new THREE.Color(TRIM_COLOR), rng, { mottle: 0.18 });
    disposables.push(geo);
    const mesh = new THREE.InstancedMesh(geo, trimMat, signs.length);
    mesh.castShadow = true;
    mesh.name = 'city_wallweapons';
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    signs.forEach((s, i) => {
      q.setFromAxisAngle(up, s.yaw);
      pos.set(s.x, s.y, s.z);
      mtx.compose(pos, q, scl);
      mesh.setMatrixAt(i, mtx);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  const ps = CITY_MAP.powerSwitch;
  if (ps) {
    const geo = makePowerSwitchGeometry();
    paintGeometry(geo, new THREE.Color(0x8d9298), rng, { mottle: 0.16, grimeHeight: 0.8, grimeStrength: 0.4 });
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, metalMat);
    mesh.position.set(ps.x, ground.heightAt(ps.x, ps.z), ps.z);
    mesh.rotation.y = ps.yaw;
    mesh.castShadow = true;
    mesh.name = 'city_powerswitch';
    group.add(mesh);
  }
}

function makeCarGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(4.3, 0.85, 1.85);
  body.translate(0, 0.72, 0);
  const cabin = new THREE.BoxGeometry(2.2, 0.75, 1.65);
  cabin.translate(-0.15, 1.5, 0);
  const parts: THREE.BufferGeometry[] = [body, cabin];
  for (const [wx, wz] of [
    [1.42, 0.95],
    [1.42, -0.95],
    [-1.42, 0.95],
    [-1.42, -0.95],
  ]) {
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8);
    wheel.rotateX(Math.PI / 2);
    wheel.translate(wx, 0.34, wz);
    parts.push(wheel);
  }
  return mergeGeometries(parts);
}

function makeLampGeometry(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.11, 0.15, 4.8, 6);
  post.translate(0, 2.4, 0);
  const arm = new THREE.BoxGeometry(1.25, 0.12, 0.12);
  arm.translate(0.6, 4.75, 0);
  const head = new THREE.BoxGeometry(0.6, 0.2, 0.34);
  head.translate(1.15, 4.62, 0);
  const foot = new THREE.CylinderGeometry(0.26, 0.3, 0.2, 6);
  foot.translate(0, 0.1, 0);
  return mergeGeometries([post, arm, head, foot]);
}

function makePoleGeometry(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.15, 0.19, 7.2, 6);
  post.translate(0, 3.6, 0);
  const crossA = new THREE.BoxGeometry(2.4, 0.12, 0.12);
  crossA.translate(0, 6.6, 0);
  const crossB = new THREE.BoxGeometry(1.8, 0.1, 0.1);
  crossB.translate(0, 6.05, 0);
  return mergeGeometries([post, crossA, crossB]);
}

function makeDumpsterGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(2.1, 1.15, 1.35);
  body.translate(0, 0.62, 0);
  const lid = new THREE.BoxGeometry(2.2, 0.12, 1.45);
  lid.rotateZ(0.06);
  lid.translate(0, 1.26, 0);
  return mergeGeometries([body, lid]);
}

function makeHydrantGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.16, 0.19, 0.72, 8);
  body.translate(0, 0.36, 0);
  const cap = new THREE.SphereGeometry(0.17, 8, 5);
  cap.translate(0, 0.76, 0);
  const armA = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6);
  armA.rotateZ(Math.PI / 2);
  armA.translate(0, 0.46, 0);
  return mergeGeometries([body, cap, armA]);
}

function makeBenchGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(1.9, 0.1, 0.5);
  seat.translate(0, 0.46, 0);
  const back = new THREE.BoxGeometry(1.9, 0.5, 0.09);
  back.translate(0, 0.74, -0.22);
  const parts: THREE.BufferGeometry[] = [seat, back];
  for (const lx of [-0.78, 0.78]) {
    const leg = new THREE.BoxGeometry(0.1, 0.46, 0.44);
    leg.translate(lx, 0.23, 0);
    parts.push(leg);
  }
  return mergeGeometries(parts);
}

function makeBarricadeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const plank = new THREE.BoxGeometry(2.6, 0.24, 0.1);
    plank.rotateZ(i === 1 ? 0.06 : -0.04);
    plank.translate(0, 0.3 + i * 0.36, 0);
    parts.push(plank);
  }
  for (const lx of [-1.1, 1.1]) {
    const post = new THREE.BoxGeometry(0.14, 1.1, 0.14);
    post.translate(lx, 0.55, 0);
    parts.push(post);
  }
  return mergeGeometries(parts);
}

function makeRubbleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number, number][] = [
    [0, 0, 0.62, 0.3],
    [0.62, 0.35, 0.44, 0.22],
    [-0.55, -0.3, 0.5, 0.26],
    [0.2, -0.6, 0.36, 0.18],
  ];
  for (const [lx, lz, s, h] of spots) {
    const chunk = new THREE.BoxGeometry(s, h, s * 0.85);
    chunk.rotateY(lx + lz);
    chunk.translate(lx, h * 0.5, lz);
    parts.push(chunk);
  }
  return mergeGeometries(parts);
}

function makeFencePanelGeometry(len: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rail = new THREE.BoxGeometry(len, 0.09, 0.07);
  rail.translate(0, 1.5, 0);
  const rail2 = rail.clone();
  rail2.translate(0, -0.7, 0);
  parts.push(rail, rail2);
  const slats = Math.max(2, Math.round(len / 0.34));
  for (let i = 0; i < slats; i++) {
    const t = (i - (slats - 1) * 0.5) * (len / slats);
    const slat = new THREE.BoxGeometry(0.11, 1.7, 0.05);
    slat.translate(t, 0.85, 0);
    parts.push(slat);
  }
  return mergeGeometries(parts);
}

function makeMachineGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.95, 1.75, 0.72);
  body.translate(0, 0.88, 0);
  const face = new THREE.BoxGeometry(0.72, 0.9, 0.08);
  face.translate(0, 1.15, 0.38);
  const top = new THREE.BoxGeometry(1.02, 0.16, 0.8);
  top.translate(0, 1.82, 0);
  const foot = new THREE.BoxGeometry(1.0, 0.1, 0.78);
  foot.translate(0, 0.05, 0);
  return mergeGeometries([body, face, top, foot]);
}

function makeWallSignGeometry(): THREE.BufferGeometry {
  const board = new THREE.BoxGeometry(1.1, 0.72, 0.07);
  board.translate(0, 0, 0);
  const frame = new THREE.BoxGeometry(1.24, 0.86, 0.04);
  frame.translate(0, 0, -0.03);
  return mergeGeometries([board, frame]);
}

function makePowerSwitchGeometry(): THREE.BufferGeometry {
  const cabinet = new THREE.BoxGeometry(1.4, 2.0, 0.6);
  cabinet.translate(0, 1.0, 0);
  const lever = new THREE.BoxGeometry(0.16, 0.6, 0.16);
  lever.rotateX(-0.5);
  lever.translate(0, 1.25, 0.36);
  const base = new THREE.BoxGeometry(1.6, 0.14, 0.8);
  base.translate(0, 0.07, 0);
  return mergeGeometries([cabinet, lever, base]);
}

function emitCarWrecks(cars: KitInstance[], detail: DetailBuckets, rng: () => number): void {
  cars.forEach((car, index) => {
    const wrecked = index % 3 === 0;
    const tilt = wrecked ? 0.16 + rng() * 0.12 : (rng() - 0.5) * 0.05;

    const glass = new THREE.BoxGeometry(2.05, 0.62, 1.52);
    glass.rotateZ(tilt);
    glass.translate(-0.15, 1.5, 0);
    glass.rotateY(car.yaw);
    glass.translate(car.x, car.y, car.z);
    if (!wrecked) detail.glass.push(glass);
    else glass.dispose();

    if (wrecked) {
      const crumple = new THREE.BoxGeometry(0.9, 0.55, 1.7);
      crumple.rotateZ(-0.45);
      crumple.translate(1.9, 0.9, 0);
      crumple.rotateY(car.yaw);
      crumple.translate(car.x, car.y, car.z);
      detail.metal.push(crumple);

      for (let i = 0; i < 5; i++) {
        const shard = new THREE.BoxGeometry(0.22 + rng() * 0.3, 0.02, 0.2 + rng() * 0.26);
        shard.rotateY(rng() * Math.PI);
        shard.translate(
          car.x + (rng() - 0.5) * 4.2,
          car.y + 0.03,
          car.z + (rng() - 0.5) * 3.2,
        );
        detail.glass.push(shard);
      }
    }

    const doorOpen = index % 4 === 1;
    if (doorOpen) {
      const door = new THREE.BoxGeometry(1.15, 0.95, 0.09);
      door.rotateY(1.05);
      door.translate(-0.2, 0.95, 1.25);
      door.rotateY(car.yaw);
      door.translate(car.x, car.y, car.z);
      detail.metal.push(door);
    }
  });
}

function emitDumpsterSpill(bins: KitInstance[], detail: DetailBuckets, rng: () => number): void {
  bins.forEach((bin, index) => {
    if (index % 2 !== 0) return;
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.1 + rng() * 1.8;
      const bag = new THREE.BoxGeometry(0.4 + rng() * 0.3, 0.3 + rng() * 0.2, 0.4 + rng() * 0.3);
      bag.rotateY(rng() * Math.PI);
      bag.translate(
        bin.x + Math.cos(a) * r,
        bin.y + 0.16,
        bin.z + Math.sin(a) * r,
      );
      detail.board.push(bag);
    }
  });
}

function makeWeedGeometry(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const h = 0.3 + rng() * 0.4;
    const plane = new THREE.PlaneGeometry(0.11, h, 1, 2);
    plane.translate(0, h * 0.5, 0);
    const pos = plane.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      pos.setX(v, pos.getX(v) + Math.pow(y / h, 2) * (0.16 + rng() * 0.12));
    }
    pos.needsUpdate = true;
    plane.rotateY((i / blades) * Math.PI * 2 + rng() * 0.6);
    plane.translate((rng() - 0.5) * 0.16, 0, (rng() - 0.5) * 0.16);
    parts.push(plane);
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  paintGeometry(merged, new THREE.Color(0x6f7f43), rng, { mottle: 0.2 });
  return merged;
}

function makeOvergrownBushGeometry(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.IcosahedronGeometry(0.42 + rng() * 0.3, 0);
    blob.scale(1.25, 0.9, 1.25);
    blob.translate((rng() - 0.5) * 0.8, 0.38 + rng() * 0.32, (rng() - 0.5) * 0.8);
    parts.push(blob);
  }
  const merged = mergeGeometries(parts);
  paintGeometry(merged, new THREE.Color(0x56763f), rng, { mottle: 0.16 });
  return merged;
}

function makeLitterGeometry(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const w = 0.14 + rng() * 0.28;
    const scrap = new THREE.PlaneGeometry(w, w * (0.5 + rng() * 0.7));
    scrap.rotateX(-Math.PI / 2 + (rng() - 0.5) * 0.5);
    scrap.rotateY(rng() * Math.PI);
    scrap.translate((rng() - 0.5) * 0.7, 0.015 + i * 0.004, (rng() - 0.5) * 0.7);
    parts.push(scrap);
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  paintGeometry(merged, new THREE.Color(0x9a9283), rng, { mottle: 0.26 });
  return merged;
}

function makeScorchGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CircleGeometry(1.5, 10);
  disc.rotateX(-Math.PI / 2);
  disc.translate(0, 0.02, 0);
  const colors = new Float32Array(disc.attributes.position.count * 3);
  const pos = disc.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / 1.5;
    const v = 0.06 + r * 0.22;
    colors[i * 3] = v;
    colors[i * 3 + 1] = v * 0.95;
    colors[i * 3 + 2] = v * 0.9;
  }
  disc.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return disc;
}
