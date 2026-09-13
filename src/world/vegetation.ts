import * as THREE from 'three';
import type { Terrain } from './terrain';
import type { PhysicsWorld } from '../physics/physics';
import { Noise2D } from '../util/noise';
import { clamp, makeRng, TAU } from '../util/math';
import type { CullLayer } from './vegetationCulling';

export interface VegetationPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  variant: number;
}

export interface VegetationLayout {
  trees: VegetationPlacement[];
  bushes: VegetationPlacement[];
  rocks: VegetationPlacement[];
  grass: VegetationPlacement[];
  clearings: { x: number; z: number; radius: number }[];
}

const TREE_VARIANTS = 3;

export function generateVegetation(
  terrain: Terrain,
  density: number,
  seed = 777,
): VegetationLayout {
  const rng = makeRng(seed);
  const forest = new Noise2D(seed ^ 0x1234);
  const clearingNoise = new Noise2D(seed ^ 0xabcd);

  const clearings: { x: number; z: number; radius: number }[] = [];
  const clearingCount = 7;
  for (let i = 0; i < clearingCount; i++) {
    const angle = rng() * TAU;
    const dist = 25 + rng() * (terrain.half - 70);
    clearings.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      radius: 16 + rng() * 22,
    });
  }
  clearings.push({ x: 0, z: 0, radius: 26 });

  const clearingFactor = (x: number, z: number): number => {
    let openness = 0;
    for (const c of clearings) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.radius) {
        openness = Math.max(openness, 1 - d / c.radius);
      }
    }
    return openness;
  };

  const trees: VegetationPlacement[] = [];
  const bushes: VegetationPlacement[] = [];
  const rocks: VegetationPlacement[] = [];
  const grass: VegetationPlacement[] = [];

  const half = terrain.half - 8;
  const spacing = 4.4 / Math.sqrt(clamp(density, 0.2, 1.5));

  for (let z = -half; z <= half; z += spacing) {
    for (let x = -half; x <= half; x += spacing) {
      const jx = x + (rng() - 0.5) * spacing * 1.5;
      const jz = z + (rng() - 0.5) * spacing * 1.5;
      if (Math.abs(jx) > half || Math.abs(jz) > half) continue;

      const slope = terrain.slopeAt(jx, jz);
      if (slope > 0.72) {
        if (rng() < 0.1) {
          pushRock(rocks, terrain, jx, jz, rng);
        }
        continue;
      }

      const roadDist = terrain.distanceToRoad(jx, jz);
      if (roadDist < terrain.road.halfWidth + 1.6) continue;

      const open = clearingFactor(jx, jz);
      const forestNoise = forest.fbm(jx * 0.0085, jz * 0.0085, 3) * 0.5 + 0.5;
      const edgeBoost = clamp((Math.hypot(jx, jz) - 60) / 140, 0, 1) * 0.25;
      let treeChance = (forestNoise * 0.85 + edgeBoost) * (1 - open * 0.96) * density;
      treeChance *= 1 - clamp(slope / 0.75, 0, 1) * 0.55;
      if (roadDist < 12) treeChance *= 0.55;

      if (rng() < treeChance) {
        const y = terrain.heightAt(jx, jz);
        trees.push({
          x: jx,
          y,
          z: jz,
          yaw: rng() * TAU,
          scale: 0.78 + rng() * 0.62,
          variant: Math.floor(rng() * TREE_VARIANTS),
        });
        continue;
      }

      if (rng() < 0.14 * density * (0.4 + open * 0.8)) {
        const y = terrain.heightAt(jx, jz);
        bushes.push({
          x: jx,
          y,
          z: jz,
          yaw: rng() * TAU,
          scale: 0.65 + rng() * 0.75,
          variant: Math.floor(rng() * 2),
        });
      } else if (rng() < 0.045) {
        pushRock(rocks, terrain, jx, jz, rng);
      }
    }
  }

  const grassSpacing = 1.55;
  const grassNoise = clearingNoise;
  for (let z = -half; z <= half; z += grassSpacing) {
    for (let x = -half; x <= half; x += grassSpacing) {
      const jx = x + (rng() - 0.5) * grassSpacing * 1.6;
      const jz = z + (rng() - 0.5) * grassSpacing * 1.6;
      if (Math.abs(jx) > half || Math.abs(jz) > half) continue;
      const slope = terrain.slopeAt(jx, jz);
      if (slope > 0.62) continue;
      if (terrain.distanceToRoad(jx, jz) < terrain.road.halfWidth + 0.4) continue;
      const open = clearingFactor(jx, jz);
      const d = grassNoise.fbm(jx * 0.03, jz * 0.03, 2) * 0.5 + 0.5;
      const chance = (0.24 + open * 0.5) * d * density;
      if (rng() > chance) continue;
      grass.push({
        x: jx,
        y: terrain.heightAt(jx, jz),
        z: jz,
        yaw: rng() * TAU,
        scale: 0.7 + rng() * 0.8,
        variant: 0,
      });
    }
  }

  return { trees, bushes, rocks, grass, clearings };
}

function pushRock(
  rocks: VegetationPlacement[],
  terrain: Terrain,
  x: number,
  z: number,
  rng: () => number,
): void {
  rocks.push({
    x,
    y: terrain.heightAt(x, z),
    z,
    yaw: rng() * TAU,
    scale: 0.55 + rng() * 1.9,
    variant: Math.floor(rng() * 2),
  });
}

export function registerVegetationColliders(
  physics: PhysicsWorld,
  layout: VegetationLayout,
): void {
  for (const t of layout.trees) {
    const trunkRadius = 0.19 * t.scale + 0.08;
    const trunkHeight = 7.5 * t.scale;
    physics.addStaticCylinder(t.x, t.y + trunkHeight * 0.5, t.z, trunkHeight * 0.5, trunkRadius);
  }
  for (const r of layout.rocks) {
    if (r.scale < 0.85) continue;
    const radius = r.scale * 0.62;
    physics.addStaticBall(r.x, r.y + radius * 0.32, r.z, radius);
  }
}

export interface VegetationRenderResult {
  group: THREE.Group;
  grassMesh: THREE.InstancedMesh | null;
  cullLayers: CullLayer[];
  dispose(): void;
}

export interface VegetationRanges {
  tree: number;
  bush: number;
  rock: number;
  grass: number;
}

export const DEFAULT_RANGES: VegetationRanges = {
  tree: 165,
  bush: 78,
  rock: 120,
  grass: 34,
};

export function buildVegetationMeshes(
  layout: VegetationLayout,
  grassEnabled: boolean,
  ranges: VegetationRanges = DEFAULT_RANGES,
): VegetationRenderResult {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const cullLayers: CullLayer[] = [];

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x6d5742,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x62864a,
    roughness: 0.82,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x8d8d86,
    roughness: 0.88,
    metalness: 0,
    vertexColors: true,
    flatShading: true,
  });
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0x5c7f43,
    roughness: 0.85,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  disposables.push(barkMat, leafMat, rockMat, bushMat);

  const trunkGeo = makeTrunkGeometry();
  const canopyGeos = [makeConiferCanopy(), makeBroadCanopy(), makeSparseCanopy()];
  const rockGeo = makeRockGeometry();
  const bushGeo = makeBushGeometry();
  disposables.push(trunkGeo, rockGeo, bushGeo, ...canopyGeos);

  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const trunkMatrix = (t: VegetationPlacement, out: THREE.Matrix4) => {
    quat.setFromAxisAngle(up, t.yaw);
    pos.set(t.x, t.y, t.z);
    scl.set(t.scale, t.scale * (0.9 + (t.variant === 0 ? 0.25 : 0)), t.scale);
    out.compose(pos, quat, scl);
  };
  const canopyMatrix = (t: VegetationPlacement, out: THREE.Matrix4) => {
    quat.setFromAxisAngle(up, t.yaw);
    pos.set(t.x, t.y, t.z);
    scl.setScalar(t.scale);
    out.compose(pos, quat, scl);
  };

  if (layout.trees.length > 0) {
    const trunkCap = estimateCapacity(layout.trees, ranges.tree);
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trunkCap);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    trunks.frustumCulled = false;
    trunks.name = 'tree-trunks';
    trunks.count = 0;
    group.add(trunks);
    cullLayers.push({
      mesh: trunks,
      placements: layout.trees,
      radius: ranges.tree,
      buildMatrix: trunkMatrix,
    });

    const byVariant: VegetationPlacement[][] = [[], [], []];
    for (const t of layout.trees) byVariant[t.variant % TREE_VARIANTS].push(t);

    byVariant.forEach((list, variant) => {
      if (list.length === 0) return;
      const cap = estimateCapacity(list, ranges.tree);
      const mesh = new THREE.InstancedMesh(canopyGeos[variant], leafMat, cap);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.name = `tree-canopy-${variant}`;
      mesh.count = 0;
      group.add(mesh);
      cullLayers.push({
        mesh,
        placements: list,
        radius: ranges.tree,
        buildMatrix: canopyMatrix,
      });
    });
  }

  if (layout.rocks.length > 0) {
    const cap = estimateCapacity(layout.rocks, ranges.rock);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, cap);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.frustumCulled = false;
    rocks.name = 'rocks';
    rocks.count = 0;
    group.add(rocks);
    cullLayers.push({
      mesh: rocks,
      placements: layout.rocks,
      radius: ranges.rock,
      buildMatrix: (r, out) => {
        quat.setFromAxisAngle(up, r.yaw);
        pos.set(r.x, r.y - r.scale * 0.18, r.z);
        scl.set(r.scale, r.scale * 0.72, r.scale * (0.85 + (r.variant ? 0.3 : 0)));
        out.compose(pos, quat, scl);
      },
    });
  }

  if (layout.bushes.length > 0) {
    const cap = estimateCapacity(layout.bushes, ranges.bush);
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, cap);
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    bushes.frustumCulled = false;
    bushes.name = 'bushes';
    bushes.count = 0;
    group.add(bushes);
    cullLayers.push({
      mesh: bushes,
      placements: layout.bushes,
      radius: ranges.bush,
      buildMatrix: (b, out) => {
        quat.setFromAxisAngle(up, b.yaw);
        pos.set(b.x, b.y, b.z);
        scl.set(b.scale, b.scale * 0.85, b.scale);
        out.compose(pos, quat, scl);
      },
    });
  }

  let grassMesh: THREE.InstancedMesh | null = null;
  if (grassEnabled && layout.grass.length > 0) {
    const grassGeo = makeGrassTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x7e8f4e,
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
      alphaTest: 0.2,
      transparent: false,
    });
    disposables.push(grassGeo, grassMat);
    const cap = estimateCapacity(layout.grass, ranges.grass);
    grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, cap);
    grassMesh.castShadow = false;
    grassMesh.receiveShadow = false;
    grassMesh.frustumCulled = false;
    grassMesh.name = 'grass';
    grassMesh.count = 0;
    group.add(grassMesh);
    cullLayers.push({
      mesh: grassMesh,
      placements: layout.grass,
      radius: ranges.grass,
      buildMatrix: (g, out) => {
        quat.setFromAxisAngle(up, g.yaw);
        pos.set(g.x, g.y, g.z);
        scl.set(g.scale, g.scale * 0.95, g.scale);
        out.compose(pos, quat, scl);
      },
    });
  }

  return {
    group,
    grassMesh,
    cullLayers,
    dispose(): void {
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Must cover the culler's rebuild margin as well as the visible radius, or the
 * extra resident instances get silently dropped at the capacity guard.
 */
const CAPACITY_MARGIN = 18;

function estimateCapacity(all: VegetationPlacement[], radius: number): number {
  if (all.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of all) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const area = Math.max((maxX - minX) * (maxZ - minZ), 1);
  const density = all.length / area;
  const r = radius + CAPACITY_MARGIN;
  const visibleArea = Math.PI * r * r;
  const estimate = Math.ceil(density * visibleArea * 1.45) + 96;
  return Math.min(all.length, estimate);
}

function tintGeometry(geo: THREE.BufferGeometry, base: THREE.Color, variance: number): void {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const h = pos.getY(i);
    c.copy(base);
    c.offsetHSL(
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * variance * 0.5,
      (Math.random() - 0.5) * variance + h * 0.006,
    );
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function makeTrunkGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.16, 0.32, 7.5, 6, 3);
  geo.translate(0, 3.75, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const lean = Math.sin(y * 0.32) * 0.09;
    pos.setX(i, pos.getX(i) + lean);
    pos.setZ(i, pos.getZ(i) + Math.cos(y * 0.27) * 0.07);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  tintGeometry(geo, new THREE.Color(0x6b5540), 0.08);
  return geo;
}

function makeConiferCanopy(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const radius = 2.5 * (1 - t * 0.66);
    const height = 3.4 * (1 - t * 0.35);
    const cone = new THREE.ConeGeometry(radius, height, 7, 1);
    cone.translate(0, 4.4 + i * 1.75, 0);
    parts.push(cone);
  }
  const merged = mergeGeometries(parts);
  tintGeometry(merged, new THREE.Color(0x4c7038), 0.1);
  return merged;
}

function makeBroadCanopy(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs = [
    { x: 0, y: 7.4, z: 0, r: 2.9 },
    { x: 1.5, y: 6.5, z: 0.7, r: 2.1 },
    { x: -1.4, y: 6.7, z: -0.9, r: 2.0 },
    { x: 0.3, y: 8.6, z: -1.2, r: 1.8 },
  ];
  for (const b of blobs) {
    const sphere = new THREE.IcosahedronGeometry(b.r, 1);
    sphere.scale(1, 0.82, 1);
    sphere.translate(b.x, b.y, b.z);
    parts.push(sphere);
  }
  const merged = mergeGeometries(parts);
  tintGeometry(merged, new THREE.Color(0x628449), 0.1);
  return merged;
}

function makeSparseCanopy(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU;
    const r = 1.7 + Math.random() * 0.9;
    const sphere = new THREE.IcosahedronGeometry(1.5 + Math.random() * 0.6, 0);
    sphere.scale(1.15, 0.7, 1.15);
    sphere.translate(Math.cos(angle) * r, 6.2 + Math.random() * 2.4, Math.sin(angle) * r);
    parts.push(sphere);
  }
  const merged = mergeGeometries(parts);
  tintGeometry(merged, new THREE.Color(0x6d8446), 0.12);
  return merged;
}

function makeRockGeometry(): THREE.BufferGeometry {
  // IcosahedronGeometry is non-indexed: every triangle carries its own copy of
  // each corner. Displacing per-vertex with an independent random factor moves
  // those copies apart and tears the rock into loose floating triangles, so the
  // displacement has to be keyed on the POSITION and shared by every copy of it.
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  const offsets = new Map<string, number>();
  const key = (x: number, y: number, z: number): string =>
    `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = key(x, y, z);
    let f = offsets.get(k);
    if (f === undefined) {
      // Low-frequency lumps plus a little fine grain keeps it boulder-like
      // rather than spiky, and every copy of this corner gets the same value.
      const len = Math.hypot(x, y, z) || 1;
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      const lump =
        Math.sin(nx * 2.1 + 0.7) * 0.13 +
        Math.sin(ny * 1.8 + 2.2) * 0.11 +
        Math.sin(nz * 2.4 + 4.1) * 0.12 +
        Math.sin((nx + nz) * 3.3) * 0.06;
      f = 1 + lump + (Math.random() - 0.5) * 0.05;
      offsets.set(k, f);
    }
    // Squash slightly so it sits like a boulder instead of floating as a ball.
    pos.setXYZ(i, x * f, y * f * 0.76, z * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  tintGeometry(geo, new THREE.Color(0x8f8f88), 0.09);
  return geo;
}

function makeBushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.IcosahedronGeometry(0.55 + Math.random() * 0.35, 0);
    s.scale(1.2, 0.85, 1.2);
    s.translate(
      (Math.random() - 0.5) * 0.9,
      0.42 + Math.random() * 0.35,
      (Math.random() - 0.5) * 0.9,
    );
    parts.push(s);
  }
  const merged = mergeGeometries(parts);
  tintGeometry(merged, new THREE.Color(0x5a7f42), 0.11);
  return merged;
}

function makeGrassTuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI + Math.random() * 0.5;
    const h = 0.2 + Math.random() * 0.16;
    const plane = new THREE.PlaneGeometry(0.24, h, 1, 2);
    plane.translate(0, h * 0.5, 0);
    const posAttr = plane.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < posAttr.count; v++) {
      const y = posAttr.getY(v);
      posAttr.setX(v, posAttr.getX(v) + Math.pow(y / h, 2) * 0.1);
    }
    posAttr.needsUpdate = true;
    plane.rotateY(angle);
    plane.translate((Math.random() - 0.5) * 0.16, 0, (Math.random() - 0.5) * 0.16);
    parts.push(plane);
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  tintGeometry(merged, new THREE.Color(0x7b8b4a), 0.13);
  return merged;
}

export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of list) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let vOff = 0;
  let iOff = 0;
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    positions.set(p.array as Float32Array, vOff * 3);
    if (n) normals.set(n.array as Float32Array, vOff * 3);
    if (uv) uvs.set(uv.array as Float32Array, vOff * 2);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) indices[iOff + i] = src[i] + vOff;
      iOff += src.length;
    } else {
      for (let i = 0; i < p.count; i++) indices[iOff + i] = vOff + i;
      iOff += p.count;
    }
    vOff += p.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}
