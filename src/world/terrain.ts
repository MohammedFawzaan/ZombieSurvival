import { Noise2D } from '../util/noise';
import { clamp, smoothstep } from '../util/math';

export interface TerrainConfig {
  seed: number;
  size: number;
  segments: number;
  maxHeight: number;
}

export const DEFAULT_TERRAIN: TerrainConfig = {
  seed: 20260910,
  size: 420,
  segments: 168,
  maxHeight: 26,
};

export interface RoadPath {
  points: { x: number; z: number }[];
  halfWidth: number;
}

export class Terrain {
  readonly config: TerrainConfig;
  readonly heights: Float32Array;
  readonly gridSize: number;
  readonly cellSize: number;
  readonly road: RoadPath;

  private readonly noise: Noise2D;
  private readonly detail: Noise2D;

  constructor(config: TerrainConfig = DEFAULT_TERRAIN) {
    this.config = config;
    this.gridSize = config.segments + 1;
    this.cellSize = config.size / config.segments;
    this.noise = new Noise2D(config.seed);
    this.detail = new Noise2D(config.seed ^ 0x9e3779b9);
    this.road = this.buildRoad();
    this.heights = new Float32Array(this.gridSize * this.gridSize);
    this.generate();
  }

  get half(): number {
    return this.config.size / 2;
  }

  private buildRoad(): RoadPath {
    const half = this.config.size / 2;
    const points: { x: number; z: number }[] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = -half + t * this.config.size;
      const x = Math.sin(t * Math.PI * 1.6) * 46 - 10;
      points.push({ x, z });
    }
    return { points, halfWidth: 4.2 };
  }

  distanceToRoad(x: number, z: number): number {
    let best = Infinity;
    const pts = this.road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x;
      const az = pts[i].z;
      const bx = pts[i + 1].x;
      const bz = pts[i + 1].z;
      const dx = bx - ax;
      const dz = bz - az;
      const lenSq = dx * dx + dz * dz;
      let t = lenSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lenSq : 0;
      t = clamp(t, 0, 1);
      const px = ax + dx * t - x;
      const pz = az + dz * t - z;
      const d = Math.sqrt(px * px + pz * pz);
      if (d < best) best = d;
    }
    return best;
  }

  private sampleHeight(x: number, z: number): number {
    const c = this.config;
    const s = 1 / 190;

    let h = this.noise.fbm(x * s, z * s, 4, 2.05, 0.5) * 0.62;

    h += (this.noise.ridged(x * s * 2.3 + 11, z * s * 2.3 - 7, 3) - 0.5) * 0.34;

    h += this.detail.fbm(x * s * 5.5, z * s * 5.5, 3, 2, 0.5) * 0.14;

    h += this.detail.fbm(x * 0.22, z * 0.22, 2, 2, 0.5) * 0.02;

    let height = h * c.maxHeight;

    const basin = smoothstep(120, 30, Math.hypot(x, z));
    height *= 1 - basin * 0.45;

    const roadDist = this.distanceToRoad(x, z);
    const roadBlend = 1 - smoothstep(this.road.halfWidth, this.road.halfWidth + 9, roadDist);
    if (roadBlend > 0) {
      const flat = height * 0.55 - 0.25;
      height = height + (flat - height) * roadBlend;
    }

    const edge = Math.max(Math.abs(x), Math.abs(z)) / (c.size / 2);
    const rim = smoothstep(0.78, 1.0, edge);
    height += rim * 20;

    return height;
  }

  private generate(): void {
    const { gridSize, cellSize } = this;
    const half = this.half;
    for (let j = 0; j < gridSize; j++) {
      const z = -half + j * cellSize;
      for (let i = 0; i < gridSize; i++) {
        const x = -half + i * cellSize;
        this.heights[j * gridSize + i] = this.sampleHeight(x, z);
      }
    }
  }

  heightAt(x: number, z: number): number {
    const half = this.half;
    const gx = clamp((x + half) / this.cellSize, 0, this.config.segments);
    const gz = clamp((z + half) / this.cellSize, 0, this.config.segments);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gz);
    const i1 = Math.min(i0 + 1, this.config.segments);
    const j1 = Math.min(j0 + 1, this.config.segments);
    const tx = gx - i0;
    const tz = gz - j0;
    const g = this.gridSize;
    const h00 = this.heights[j0 * g + i0];
    const h10 = this.heights[j0 * g + i1];
    const h01 = this.heights[j1 * g + i0];
    const h11 = this.heights[j1 * g + i1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  normalAt(x: number, z: number, out: { x: number; y: number; z: number }): void {
    const e = this.cellSize;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    let nx = hl - hr;
    let ny = 2 * e;
    let nz = hd - hu;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    out.x = nx;
    out.y = ny;
    out.z = nz;
  }

  slopeAt(x: number, z: number): number {
    const n = { x: 0, y: 1, z: 0 };
    this.normalAt(x, z, n);
    return Math.acos(clamp(n.y, -1, 1));
  }

  isInBounds(x: number, z: number, margin = 14): boolean {
    const lim = this.half - margin;
    return x > -lim && x < lim && z > -lim && z < lim;
  }
}
