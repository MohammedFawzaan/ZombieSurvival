import { Noise2D } from '../../util/noise';
import { clamp } from '../../util/math';

export interface CityGroundConfig {
  seed: number;
  size: number;
  segments: number;
  maxHeight: number;
}

export const DEFAULT_CITY_GROUND: CityGroundConfig = {
  seed: 20260915,
  size: 300,
  segments: 150,
  maxHeight: 1.1,
};

const RIM_START = 0.9;
const RIM_HEIGHT = 14;

export class CityGround {
  readonly config: CityGroundConfig;
  readonly heights: Float32Array;
  readonly gridSize: number;
  readonly cellSize: number;

  private readonly undulation: Noise2D;
  private readonly grain: Noise2D;

  constructor(config: CityGroundConfig = DEFAULT_CITY_GROUND) {
    this.config = config;
    this.gridSize = config.segments + 1;
    this.cellSize = config.size / config.segments;
    this.undulation = new Noise2D(config.seed);
    this.grain = new Noise2D(config.seed ^ 0x5bf03635);
    this.heights = new Float32Array(this.gridSize * this.gridSize);
    this.generate();
  }

  get half(): number {
    return this.config.size / 2;
  }

  private sampleHeight(x: number, z: number): number {
    const s = 1 / 150;
    let h = this.undulation.fbm(x * s, z * s, 2, 2, 0.5) * 0.7;
    h += this.grain.fbm(x * 0.06, z * 0.06, 2, 2, 0.5) * 0.3;

    let height = h * this.config.maxHeight;

    const edge = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    if (edge > RIM_START) {
      const t = clamp((edge - RIM_START) / (1 - RIM_START), 0, 1);
      height += t * t * RIM_HEIGHT;
    }

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
