import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ZombieKind } from '../zombies/zombieTypes';

import walkerUrl from '../../assets/models/zombie_walker.glb?url';
import runnerUrl from '../../assets/models/zombie_runner.glb?url';
import bruteUrl from '../../assets/models/zombie_brute.glb?url';

const SOURCES: Record<ZombieKind, string> = {
  walker: walkerUrl,
  runner: runnerUrl,
  brute: bruteUrl,
};

export type ZombieClipName =
  | 'idle'
  | 'walk'
  | 'chase'
  | 'attack'
  | 'stagger'
  | 'hit'
  | 'death';

export interface ZombieAsset {
  scene: THREE.Group;
  clips: Map<ZombieClipName, THREE.AnimationClip>;
  triangles: number;
}

export type ZombieAssetSet = Record<ZombieKind, ZombieAsset>;

function countTriangles(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const geo = mesh.geometry;
    if (!geo) return;
    const index = geo.getIndex();
    if (index) tris += index.count / 3;
    else if (geo.attributes.position) tris += geo.attributes.position.count / 3;
  });
  return tris;
}

function prepare(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std) continue;
      std.vertexColors = true;
      std.metalness = 0;
      std.roughness = Math.max(0.7, std.roughness ?? 0.86);
      std.shadowSide = THREE.FrontSide;
    }
  });
}

export async function loadZombieAssets(): Promise<ZombieAssetSet> {
  const loader = new GLTFLoader();
  const kinds: ZombieKind[] = ['walker', 'runner', 'brute'];

  const loaded = await Promise.all(
    kinds.map(
      (kind) =>
        new Promise<[ZombieKind, ZombieAsset]>((resolve, reject) => {
          loader.load(
            SOURCES[kind],
            (gltf) => {
              const scene = gltf.scene;
              prepare(scene);
              const clips = new Map<ZombieClipName, THREE.AnimationClip>();
              for (const clip of gltf.animations) {
                clips.set(clip.name as ZombieClipName, clip);
              }
              resolve([kind, { scene, clips, triangles: countTriangles(scene) }]);
            },
            undefined,
            (err) => reject(err),
          );
        }),
    ),
  );

  const out = {} as ZombieAssetSet;
  for (const [kind, asset] of loaded) out[kind] = asset;
  return out;
}
