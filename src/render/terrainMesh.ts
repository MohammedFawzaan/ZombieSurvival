import * as THREE from 'three';
import type { GroundSurface } from '../maps/groundSurface';
import { clamp } from '../util/math';
import { Noise2D } from '../util/noise';

export interface TerrainMeshResult {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

export interface TerrainPalette {
  grass: number;
  grassDry: number;
  dirt: number;
  rock: number;
  road: number;
  detailRepeat: number;
}

export const FOREST_PALETTE: TerrainPalette = {
  grass: 0x63753f,
  grassDry: 0x87834a,
  dirt: 0x776045,
  rock: 0x8a8a84,
  road: 0x6e6153,
  detailRepeat: 1,
};

export const URBAN_PALETTE: TerrainPalette = {
  grass: 0x5b6440,
  grassDry: 0x6f6a4c,
  dirt: 0x6a5c49,
  rock: 0x6d6a64,
  road: 0x5a5148,
  detailRepeat: 0.42,
};

export function buildTerrainMesh(
  terrain: GroundSurface,
  anisotropy: number,
  palette: TerrainPalette = FOREST_PALETTE,
): TerrainMeshResult {
  const { config, gridSize, cellSize } = terrain;
  const half = terrain.half;
  const vertexCount = gridSize * gridSize;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);

  const detail = new Noise2D(config.seed ^ 0x5bf03635);
  const n = { x: 0, y: 1, z: 0 };

  const grass = new THREE.Color(palette.grass);
  const grassDry = new THREE.Color(palette.grassDry);
  const dirt = new THREE.Color(palette.dirt);
  const rock = new THREE.Color(palette.rock);
  const roadCol = new THREE.Color(palette.road);
  const tmp = new THREE.Color();

  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      const idx = j * gridSize + i;
      const x = -half + i * cellSize;
      const z = -half + j * cellSize;
      const y = terrain.heights[idx];

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      terrain.normalAt(x, z, n);
      normals[idx * 3] = n.x;
      normals[idx * 3 + 1] = n.y;
      normals[idx * 3 + 2] = n.z;

      uvs[idx * 2] = (x + half) / config.size;
      uvs[idx * 2 + 1] = (z + half) / config.size;

      const slope = Math.acos(clamp(n.y, -1, 1));
      const rockiness = clamp((slope - 0.42) / 0.5, 0, 1);
      const dryness = clamp(detail.fbm(x * 0.013, z * 0.013, 3) * 0.5 + 0.5, 0, 1);
      const heightFactor = clamp((y - 2) / 22, 0, 1);
      const road = terrain.road;
      const onRoad =
        road && terrain.distanceToRoad
          ? 1 - clamp((terrain.distanceToRoad(x, z) - road.halfWidth) / 3.4, 0, 1)
          : 0;

      tmp.copy(grass).lerp(grassDry, dryness * 0.75);
      tmp.lerp(dirt, clamp(rockiness * 0.7 + heightFactor * 0.12, 0, 1) * 0.7);
      tmp.lerp(rock, rockiness * 0.82);
      tmp.lerp(roadCol, onRoad * 0.92);

      const macro = detail.fbm(x * 0.09, z * 0.09, 2) * 0.06;
      tmp.offsetHSL(0, 0, macro);

      colors[idx * 3] = tmp.r;
      colors[idx * 3 + 1] = tmp.g;
      colors[idx * 3 + 2] = tmp.b;
    }
  }

  const indexCount = config.segments * config.segments * 6;
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let ptr = 0;
  for (let j = 0; j < config.segments; j++) {
    for (let i = 0; i < config.segments; i++) {
      const a = j * gridSize + i;
      const b = a + 1;
      const c = a + gridSize;
      const d = c + 1;
      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;
      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    dithering: true,
  });

  const detailTex = makeDetailTexture(anisotropy, palette.detailRepeat);
  material.roughnessMap = detailTex;
  material.normalMap = makeDetailNormal(anisotropy, palette.detailRepeat);
  material.normalScale.set(0.55, 0.55);

  const mesh = new THREE.Mesh(geom, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return { mesh, material };
}

function makeDetailTexture(anisotropy: number, repeatScale = 1): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const noise = new Noise2D(9182);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = noise.fbm(x * 0.09, y * 0.09, 3) * 0.5 + 0.5;
      const g = Math.floor(190 + v * 60);
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60 * repeatScale, 60 * repeatScale);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeDetailNormal(anisotropy: number, repeatScale = 1): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const noise = new Noise2D(5521);
  const h = (x: number, y: number) => noise.fbm(x * 0.16, y * 0.16, 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      let nx = -dx * 2.2;
      let ny = -dy * 2.2;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      data[i] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.floor((nz / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90 * repeatScale, 90 * repeatScale);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}
