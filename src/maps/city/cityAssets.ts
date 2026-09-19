import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import carUrl from '../../../assets/models/city_car.glb?url';
import dumpsterUrl from '../../../assets/models/city_dumpster.glb?url';
import lampUrl from '../../../assets/models/city_lamp.glb?url';
import hydrantUrl from '../../../assets/models/city_hydrant.glb?url';
import barricadeUrl from '../../../assets/models/city_barricade.glb?url';

export type CityAssetKind = 'car' | 'dumpster' | 'lamp' | 'hydrant' | 'barricade';

const SOURCES: Record<CityAssetKind, string> = {
  car: carUrl,
  dumpster: dumpsterUrl,
  lamp: lampUrl,
  hydrant: hydrantUrl,
  barricade: barricadeUrl,
};

export interface CityAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  triangles: number;
}

export type CityAssetSet = Partial<Record<CityAssetKind, CityAsset>>;

function mergeIntoSingle(root: THREE.Object3D): CityAsset | null {
  const geometries: THREE.BufferGeometry[] = [];
  let material: THREE.Material | null = null;

  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (!mesh.geometry) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        geo.deleteAttribute(name);
      }
    }
    if (!geo.getAttribute('uv')) {
      const count = geo.getAttribute('position').count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    geometries.push(geo);
    if (!material) {
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (m) material = (m as THREE.Material).clone();
    }
  });

  if (geometries.length === 0) return null;

  const merged = mergeBuffers(geometries);
  for (const g of geometries) g.dispose();
  if (!merged) return null;

  const index = merged.getIndex();
  const pos = merged.getAttribute('position');
  const triangles = index ? index.count / 3 : pos ? pos.count / 3 : 0;

  return {
    geometry: merged,
    material: material ?? new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.9 }),
    triangles,
  };
}

function mergeBuffers(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geometries.length === 1) return geometries[0].clone();

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (!pos) return null;
    vertexTotal += pos.count;
    const idx = g.getIndex();
    indexTotal += idx ? idx.count : pos.count;
  }

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const uvs = new Float32Array(vertexTotal * 2);
  const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i++) {
      positions[(vOffset + i) * 3] = pos.getX(i);
      positions[(vOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vOffset + i) * 3 + 2] = pos.getZ(i);
      if (nrm) {
        normals[(vOffset + i) * 3] = nrm.getX(i);
        normals[(vOffset + i) * 3 + 1] = nrm.getY(i);
        normals[(vOffset + i) * 3 + 2] = nrm.getZ(i);
      }
      if (uv) {
        uvs[(vOffset + i) * 2] = uv.getX(i);
        uvs[(vOffset + i) * 2 + 1] = uv.getY(i);
      }
    }
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[iOffset + i] = vOffset + idx.getX(i);
      iOffset += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOffset + i] = vOffset + i;
      iOffset += pos.count;
    }
    vOffset += pos.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

export async function loadCityAssets(): Promise<CityAssetSet> {
  const loader = new GLTFLoader();
  const out: CityAssetSet = {};

  const kinds = Object.keys(SOURCES) as CityAssetKind[];
  await Promise.all(
    kinds.map(async (kind) => {
      try {
        const gltf = await loader.loadAsync(SOURCES[kind]);
        const asset = mergeIntoSingle(gltf.scene);
        if (asset) out[kind] = asset;
      } catch {
        return;
      }
    }),
  );

  return out;
}
