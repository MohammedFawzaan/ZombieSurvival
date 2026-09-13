import * as THREE from 'three';
import { mergeGeometries } from '../world/vegetation';

export interface HumanoidParts {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armLeft: THREE.Group;
  armRight: THREE.Group;
  forearmLeft: THREE.Group;
  forearmRight: THREE.Group;
  legLeft: THREE.Group;
  legRight: THREE.Group;
  shinLeft: THREE.Group;
  shinRight: THREE.Group;
  material: THREE.MeshStandardMaterial;
}

const SKIN_BASE = 0x93a077;

export interface ZombieMaterialSet {
  flesh: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
}

export function createZombieMaterials(): ZombieMaterialSet {
  const flesh = new THREE.MeshStandardMaterial({
    color: SKIN_BASE,
    roughness: 0.78,
    metalness: 0,
    vertexColors: true,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x5d564a,
    roughness: 0.95,
    metalness: 0,
    vertexColors: true,
  });
  return { flesh, cloth };
}

function tint(geo: THREE.BufferGeometry, base: number, variance = 0.06): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    c.setHex(base);
    c.offsetHSL((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * variance);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function limbGeometry(
  topRadius: number,
  bottomRadius: number,
  length: number,
  color: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 7, 1);
  geo.translate(0, -length * 0.5, 0);
  const cap = new THREE.SphereGeometry(bottomRadius, 7, 5);
  cap.translate(0, -length, 0);
  const merged = mergeGeometries([geo, cap]);
  return tint(merged, color);
}

function torsoGeometry(): THREE.BufferGeometry {
  const chest = new THREE.BoxGeometry(0.46, 0.44, 0.26, 2, 2, 2);
  chest.translate(0, 0.24, 0);
  const belly = new THREE.BoxGeometry(0.38, 0.26, 0.23, 2, 1, 1);
  belly.translate(0, -0.03, 0);
  const shoulderL = new THREE.SphereGeometry(0.115, 7, 5);
  shoulderL.translate(-0.235, 0.38, 0);
  const shoulderR = new THREE.SphereGeometry(0.115, 7, 5);
  shoulderR.translate(0.235, 0.38, 0);
  const merged = mergeGeometries([chest, belly, shoulderL, shoulderR]);
  const pos = merged.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) + Math.sin(y * 3) * 0.02);
  }
  pos.needsUpdate = true;
  merged.computeVertexNormals();
  return tint(merged, 0x63594a, 0.09);
}

function headGeometry(): THREE.BufferGeometry {
  const skull = new THREE.SphereGeometry(0.125, 9, 7);
  skull.scale(0.94, 1.08, 1.02);
  const jaw = new THREE.BoxGeometry(0.13, 0.075, 0.13, 1, 1, 1);
  jaw.translate(0, -0.095, 0.022);
  const nose = new THREE.ConeGeometry(0.028, 0.06, 5);
  nose.rotateX(Math.PI * 0.5);
  nose.translate(0, -0.012, -0.13);
  const merged = mergeGeometries([skull, jaw, nose]);
  return tint(merged, 0x9caa80, 0.08);
}

function hipsGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.36, 0.2, 0.24, 2, 1, 1);
  return tint(geo, 0x514a3f, 0.07);
}

export function buildZombieRig(materials: ZombieMaterialSet): HumanoidParts {
  const root = new THREE.Group();
  root.name = 'zombie';

  const hips = new THREE.Group();
  hips.position.y = 0.94;
  root.add(hips);

  const hipsMesh = new THREE.Mesh(hipsGeometry(), materials.cloth);
  hipsMesh.castShadow = true;
  hips.add(hipsMesh);

  const torso = new THREE.Group();
  torso.position.y = 0.1;
  hips.add(torso);
  const torsoMesh = new THREE.Mesh(torsoGeometry(), materials.cloth);
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);

  const neck = new THREE.Group();
  neck.position.y = 0.5;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const headMesh = new THREE.Mesh(headGeometry(), materials.flesh);
  headMesh.castShadow = true;
  head.add(headMesh);

  const makeArm = (side: number) => {
    const upper = new THREE.Group();
    upper.position.set(side * 0.245, 0.38, 0);
    torso.add(upper);
    const upperMesh = new THREE.Mesh(limbGeometry(0.075, 0.06, 0.3, 0x635a4c), materials.cloth);
    upperMesh.castShadow = true;
    upper.add(upperMesh);

    const fore = new THREE.Group();
    fore.position.y = -0.3;
    upper.add(fore);
    const foreMesh = new THREE.Mesh(limbGeometry(0.058, 0.05, 0.3, 0x98a67c), materials.flesh);
    foreMesh.castShadow = true;
    fore.add(foreMesh);
    return { upper, fore };
  };

  const makeLeg = (side: number) => {
    const upper = new THREE.Group();
    upper.position.set(side * 0.105, -0.1, 0);
    hips.add(upper);
    const upperMesh = new THREE.Mesh(limbGeometry(0.095, 0.078, 0.42, 0x524b40), materials.cloth);
    upperMesh.castShadow = true;
    upper.add(upperMesh);

    const shin = new THREE.Group();
    shin.position.y = -0.42;
    upper.add(shin);
    const shinMesh = new THREE.Mesh(limbGeometry(0.075, 0.058, 0.42, 0x474137), materials.cloth);
    shinMesh.castShadow = true;
    shin.add(shinMesh);

    const foot = new THREE.Mesh(
      tint(boxAt(0.11, 0.06, 0.22, 0, -0.44, -0.045), 0x3a352d, 0.05),
      materials.cloth,
    );
    foot.castShadow = true;
    shin.add(foot);
    return { upper, shin };
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  return {
    root,
    hips,
    torso,
    head,
    armLeft: armL.upper,
    armRight: armR.upper,
    forearmLeft: armL.fore,
    forearmRight: armR.fore,
    legLeft: legL.upper,
    legRight: legR.upper,
    shinLeft: legL.shin,
    shinRight: legR.shin,
    material: materials.flesh,
  };
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
