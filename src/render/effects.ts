import * as THREE from 'three';
import type { BulletImpact } from '../combat/combat';
import { clamp, randRange } from '../util/math';

const PARTICLE_VERT = `
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * 620.0 / max(-mvPosition.z, 0.001);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PARTICLE_FRAG = `
uniform sampler2D uMap;
varying vec3 vColor;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  if (tex.a < 0.03) discard;
  gl_FragColor = vec4(vColor, tex.a);
}
`;

const TRACER_POOL = 26;
const PARTICLE_POOL = 320;
const DECAL_POOL = 48;

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  kind: 0 | 1;
  active: boolean;
}

export class EffectsSystem {
  readonly group = new THREE.Group();

  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  private readonly particleMesh: THREE.Points;
  private readonly particlePositions: Float32Array;
  private readonly particleColors: Float32Array;
  private readonly particleSizes: Float32Array;

  private readonly decals: THREE.Mesh[] = [];
  private decalIndex = 0;

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly quat = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.group.name = 'effects';

    const tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 4, 1, true);
    tracerGeo.rotateX(Math.PI / 2);
    tracerGeo.translate(0, 0, -0.5);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a2,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < TRACER_POOL; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      this.group.add(mesh);
      this.tracers.push({ mesh, life: 0, maxLife: 0.06 });
    }

    this.particlePositions = new Float32Array(PARTICLE_POOL * 3);
    this.particleColors = new Float32Array(PARTICLE_POOL * 3);
    this.particleSizes = new Float32Array(PARTICLE_POOL);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    pGeo.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));
    pGeo.setDrawRange(0, PARTICLE_POOL);

    const pMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: makeSoftDot() } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.particleMesh = new THREE.Points(pGeo, pMat);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.renderOrder = 11;
    this.group.add(this.particleMesh);

    for (let i = 0; i < PARTICLE_POOL; i++) {
      this.particles.push({
        x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1, kind: 0, active: false,
      });
      this.particleSizes[i] = 0;
    }

    const decalGeo = new THREE.CircleGeometry(0.16, 8);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x1b1b1b,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    for (let i = 0; i < DECAL_POOL; i++) {
      const mesh = new THREE.Mesh(decalGeo, decalMat.clone());
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.decals.push(mesh);
    }
  }

  spawnTracer(
    ox: number, oy: number, oz: number,
    ex: number, ey: number, ez: number,
  ): void {
    const tracer = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0];
    const dx = ex - ox;
    const dy = ey - oy;
    const dz = ez - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;

    tracer.mesh.position.set(ox, oy, oz);
    this.tmp.set(dx / len, dy / len, dz / len);
    this.tmp2.set(0, 0, -1);
    this.quat.setFromUnitVectors(this.tmp2, this.tmp);
    tracer.mesh.quaternion.copy(this.quat);
    tracer.mesh.scale.set(1, 1, len);
    tracer.mesh.visible = true;
    tracer.life = 0.055;
    tracer.maxLife = 0.055;
    (tracer.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75;
  }

  spawnImpact(impact: BulletImpact): void {
    const count = impact.onZombie ? 12 : 8;
    const blood = impact.onZombie;
    for (let i = 0; i < count; i++) {
      const p = this.particles.find((q) => !q.active);
      if (!p) break;
      const spread = blood ? 3.4 : 2.6;
      p.x = impact.x;
      p.y = impact.y;
      p.z = impact.z;
      p.vx = impact.nx * randRange(0.6, 2.4) + randRange(-spread, spread) * 0.35;
      p.vy = impact.ny * randRange(0.6, 2.0) + randRange(0.4, 2.6);
      p.vz = impact.nz * randRange(0.6, 2.4) + randRange(-spread, spread) * 0.35;
      p.life = blood ? randRange(0.35, 0.75) : randRange(0.28, 0.62);
      p.maxLife = p.life;
      p.size = blood ? randRange(0.05, 0.12) : randRange(0.04, 0.1);
      p.kind = blood ? 1 : 0;
      p.active = true;
    }

    if (!impact.onZombie) this.placeDecal(impact);
  }

  spawnDeathBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 22; i++) {
      const p = this.particles.find((q) => !q.active);
      if (!p) break;
      p.x = x + randRange(-0.2, 0.2);
      p.y = y + randRange(0.3, 1.4);
      p.z = z + randRange(-0.2, 0.2);
      p.vx = randRange(-2.2, 2.2);
      p.vy = randRange(0.6, 3.4);
      p.vz = randRange(-2.2, 2.2);
      p.life = randRange(0.5, 1.05);
      p.maxLife = p.life;
      p.size = randRange(0.06, 0.14);
      p.kind = 1;
      p.active = true;
    }
  }

  private placeDecal(impact: BulletImpact): void {
    const mesh = this.decals[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.decals.length;
    mesh.position.set(
      impact.x + impact.nx * 0.02,
      impact.y + impact.ny * 0.02,
      impact.z + impact.nz * 0.02,
    );
    this.tmp.set(impact.nx, impact.ny, impact.nz);
    if (this.tmp.lengthSq() < 1e-6) this.tmp.copy(this.up);
    this.quat.setFromUnitVectors(this.forward, this.tmp.normalize());
    mesh.quaternion.copy(this.quat);
    const s = randRange(0.7, 1.35);
    mesh.scale.set(s, s, 1);
    mesh.rotateZ(Math.random() * Math.PI * 2);
    mesh.visible = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5;
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        continue;
      }
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = (t.life / t.maxLife) * 0.75;
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.particleSizes[i] = 0;
        this.particlePositions[i * 3 + 1] = -9999;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.particleSizes[i] = 0;
        this.particlePositions[i * 3 + 1] = -9999;
        continue;
      }
      p.vy -= 16 * dt;
      p.vx *= 1 - 2.6 * dt;
      p.vz *= 1 - 2.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const t = clamp(p.life / p.maxLife, 0, 1);
      this.particlePositions[i * 3] = p.x;
      this.particlePositions[i * 3 + 1] = p.y;
      this.particlePositions[i * 3 + 2] = p.z;
      this.particleSizes[i] = p.size * t;
      if (p.kind === 1) {
        this.particleColors[i * 3] = 0.42 * t + 0.12;
        this.particleColors[i * 3 + 1] = 0.03 * t;
        this.particleColors[i * 3 + 2] = 0.04 * t;
      } else {
        const g = 0.32 * t + 0.08;
        this.particleColors[i * 3] = g * 1.1;
        this.particleColors[i * 3 + 1] = g;
        this.particleColors[i * 3 + 2] = g * 0.82;
      }
    }

    const geom = this.particleMesh.geometry;
    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    for (const t of this.tracers) {
      t.life = 0;
      t.mesh.visible = false;
    }
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
      this.particleSizes[i] = 0;
      this.particlePositions[i * 3 + 1] = -9999;
    }
    for (const d of this.decals) d.visible = false;
    const geom = this.particleMesh.geometry;
    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}

function makeSoftDot(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - c, y - c) / c;
      const a = Math.max(0, 1 - d);
      const v = Math.floor(Math.pow(a, 1.4) * 255);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = v;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}
