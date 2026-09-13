import * as THREE from 'three';
import type { Terrain } from './terrain';
import type { PhysicsWorld } from '../physics/physics';
import { mergeGeometries } from './vegetation';
import { makeRng, TAU } from '../util/math';

export interface PropsResult {
  group: THREE.Group;
  landmarks: { x: number; z: number; label: string }[];
  dispose(): void;
}

export function buildProps(
  terrain: Terrain,
  physics: PhysicsWorld,
  seed = 31337,
): PropsResult {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  group.name = 'props';
  const landmarks: { x: number; z: number; label: string }[] = [];

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x594734,
    roughness: 0.9,
    metalness: 0,
    vertexColors: true,
  });
  const rustMat = new THREE.MeshStandardMaterial({
    color: 0x6b4f3a,
    roughness: 0.82,
    metalness: 0.35,
    vertexColors: true,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x8a8781,
    roughness: 0.93,
    metalness: 0,
  });
  const disposables: (THREE.Material | THREE.BufferGeometry)[] = [
    woodMat,
    rustMat,
    concreteMat,
  ];

  const shackSpots = pickRoadsideSpots(terrain, rng, 2, 16, 30);
  for (const spot of shackSpots) {
    const yaw = rng() * TAU;
    const shack = buildShack(woodMat, rustMat);
    shack.position.set(spot.x, terrain.heightAt(spot.x, spot.z) - 0.15, spot.z);
    shack.rotation.y = yaw;
    group.add(shack);
    landmarks.push({ x: spot.x, z: spot.z, label: 'Cabin' });

    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const y = terrain.heightAt(spot.x, spot.z);
    const addWall = (lx: number, lz: number, hx: number, hz: number) => {
      physics.addStaticBox(
        spot.x + lx * c + lz * s,
        y + 1.35,
        spot.z - lx * s + lz * c,
        hx,
        1.5,
        hz,
        yaw,
      );
    };
    addWall(0, -2.4, 2.6, 0.14);
    addWall(-2.5, 0, 0.14, 2.4);
    addWall(2.5, 0, 0.14, 2.4);
    addWall(-1.7, 2.4, 0.9, 0.14);
    addWall(1.7, 2.4, 0.9, 0.14);
  }

  const barrelSpots = pickRoadsideSpots(terrain, rng, 12, 5.5, 14);
  const barrelGeo = makeBarrelGeometry();
  disposables.push(barrelGeo);
  if (barrelSpots.length > 0) {
    const barrels = new THREE.InstancedMesh(barrelGeo, rustMat, barrelSpots.length);
    barrels.castShadow = true;
    barrels.receiveShadow = true;
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    barrelSpots.forEach((spot, i) => {
      const tipped = rng() < 0.3;
      q.setFromAxisAngle(up, rng() * TAU);
      if (tipped) {
        const tilt = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          Math.PI / 2,
        );
        q.multiply(tilt);
      }
      pos.set(spot.x, terrain.heightAt(spot.x, spot.z) + (tipped ? 0.29 : 0), spot.z);
      mtx.compose(pos, q, scl);
      barrels.setMatrixAt(i, mtx);
      physics.addStaticCylinder(
        spot.x,
        terrain.heightAt(spot.x, spot.z) + 0.44,
        spot.z,
        tipped ? 0.29 : 0.44,
        0.29,
      );
    });
    barrels.instanceMatrix.needsUpdate = true;
    group.add(barrels);
  }

  const crateSpots = pickRoadsideSpots(terrain, rng, 14, 4, 20);
  const crateGeo = makeCrateGeometry();
  disposables.push(crateGeo);
  if (crateSpots.length > 0) {
    const crates = new THREE.InstancedMesh(crateGeo, woodMat, crateSpots.length);
    crates.castShadow = true;
    crates.receiveShadow = true;
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    crateSpots.forEach((spot, i) => {
      const yaw = rng() * TAU;
      const size = 0.75 + rng() * 0.5;
      q.setFromAxisAngle(up, yaw);
      const y = terrain.heightAt(spot.x, spot.z);
      pos.set(spot.x, y, spot.z);
      scl.setScalar(size);
      mtx.compose(pos, q, scl);
      crates.setMatrixAt(i, mtx);
      physics.addStaticBox(
        spot.x,
        y + size * 0.35,
        spot.z,
        size * 0.36,
        size * 0.36,
        size * 0.36,
        yaw,
      );
    });
    crates.instanceMatrix.needsUpdate = true;
    group.add(crates);
  }

  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 2.1, 6);
  postGeo.translate(0, 1.05, 0);
  disposables.push(postGeo);
  const posts: { x: number; z: number }[] = [];
  const roadPts = terrain.road.points;
  for (let i = 0; i < roadPts.length - 1; i++) {
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const x = roadPts[i].x + (roadPts[i + 1].x - roadPts[i].x) * t;
      const z = roadPts[i].z + (roadPts[i + 1].z - roadPts[i].z) * t;
      const side = k % 2 === 0 ? 1 : -1;
      const px = x + side * (terrain.road.halfWidth + 0.9);
      if (!terrain.isInBounds(px, z, 12)) continue;
      posts.push({ x: px, z });
    }
  }
  if (posts.length > 0) {
    const postMesh = new THREE.InstancedMesh(postGeo, woodMat, posts.length);
    postMesh.castShadow = true;
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    posts.forEach((p, i) => {
      q.setFromAxisAngle(up, rng() * TAU);
      pos.set(p.x, terrain.heightAt(p.x, p.z) - 0.1, p.z);
      mtx.compose(pos, q, scl);
      postMesh.setMatrixAt(i, mtx);
    });
    postMesh.instanceMatrix.needsUpdate = true;
    group.add(postMesh);
  }

  const wallSpots = pickRoadsideSpots(terrain, rng, 3, 20, 40);
  for (const spot of wallSpots) {
    const yaw = rng() * TAU;
    const len = 4 + rng() * 5;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 0.34), concreteMat);
    const y = terrain.heightAt(spot.x, spot.z);
    wall.position.set(spot.x, y + 0.6, spot.z);
    wall.rotation.y = yaw;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    physics.addStaticBox(spot.x, y + 0.6, spot.z, len * 0.5, 0.75, 0.17, yaw);
    landmarks.push({ x: spot.x, z: spot.z, label: 'Ruin' });
  }

  return {
    group,
    landmarks,
    dispose(): void {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };
}

function pickRoadsideSpots(
  terrain: Terrain,
  rng: () => number,
  count: number,
  minRoadDist: number,
  maxRoadDist: number,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 60) {
    attempts++;
    const half = terrain.half - 30;
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    const rd = terrain.distanceToRoad(x, z);
    if (rd < minRoadDist || rd > maxRoadDist) continue;
    if (terrain.slopeAt(x, z) > 0.28) continue;
    let clash = false;
    for (const o of out) {
      if (Math.hypot(o.x - x, o.z - z) < 18) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    out.push({ x, z });
  }
  return out;
}

function tintGeo(geo: THREE.BufferGeometry, base: number, variance: number): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    c.setHex(base);
    c.offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * variance);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function makeBarrelGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 10, 1);
  body.translate(0, 0.44, 0);
  const ring1 = new THREE.TorusGeometry(0.29, 0.022, 5, 10);
  ring1.rotateX(Math.PI / 2);
  ring1.translate(0, 0.62, 0);
  const ring2 = ring1.clone();
  ring2.translate(0, -0.36, 0);
  return tintGeo(mergeGeometries([body, ring1, ring2]), 0x6a4a34, 0.11);
}

function makeCrateGeometry(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(0.72, 0.72, 0.72, 1, 1, 1);
  box.translate(0, 0.36, 0);
  const parts: THREE.BufferGeometry[] = [box];
  for (const [ax, az] of [
    [0.37, 0],
    [-0.37, 0],
    [0, 0.37],
    [0, -0.37],
  ]) {
    const plank = new THREE.BoxGeometry(az === 0 ? 0.05 : 0.74, 0.09, ax === 0 ? 0.05 : 0.74);
    plank.translate(ax, 0.36, az);
    parts.push(plank);
  }
  return tintGeo(mergeGeometries(parts), 0x5c4a35, 0.12);
}

function buildShack(wood: THREE.Material, metal: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shack';

  const wallParts: THREE.BufferGeometry[] = [];
  const addWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    wallParts.push(b);
  };
  addWall(5.4, 3, 0.24, 0, 1.5, -2.4);
  addWall(0.24, 3, 5, -2.5, 1.5, 0);
  addWall(0.24, 3, 5, 2.5, 1.5, 0);
  addWall(1.8, 3, 0.24, -1.7, 1.5, 2.4);
  addWall(1.8, 3, 0.24, 1.7, 1.5, 2.4);
  addWall(5.4, 0.24, 5, 0, 0.05, 0);

  const walls = new THREE.Mesh(tintGeo(mergeGeometries(wallParts), 0x594734, 0.1), wood);
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);

  const roofParts: THREE.BufferGeometry[] = [];
  const left = new THREE.BoxGeometry(3.4, 0.16, 5.6);
  left.rotateZ(0.42);
  left.translate(-1.45, 3.6, 0);
  const right = new THREE.BoxGeometry(3.4, 0.16, 5.6);
  right.rotateZ(-0.42);
  right.translate(1.45, 3.6, 0);
  roofParts.push(left, right);
  const roof = new THREE.Mesh(tintGeo(mergeGeometries(roofParts), 0x4a4a48, 0.09), metal);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  return g;
}
