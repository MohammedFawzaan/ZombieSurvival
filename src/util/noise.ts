import { makeRng } from './math';

const PERM_SIZE = 512;

export class Noise2D {
  private readonly perm: Uint8Array;
  private readonly gradX: Float32Array;
  private readonly gradY: Float32Array;

  constructor(seed = 1337) {
    const rng = makeRng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm = new Uint8Array(PERM_SIZE);
    for (let i = 0; i < PERM_SIZE; i++) this.perm[i] = p[i & 255];

    this.gradX = new Float32Array(256);
    this.gradY = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rng() * Math.PI * 2;
      this.gradX[i] = Math.cos(a);
      this.gradY[i] = Math.sin(a);
    }
  }

  sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const x0 = xi & 255;
    const y0 = yi & 255;
    const x1 = (xi + 1) & 255;
    const y1 = (yi + 1) & 255;

    const n00 = this.dot(x0, y0, xf, yf);
    const n10 = this.dot(x1, y0, xf - 1, yf);
    const n01 = this.dot(x0, y1, xf, yf - 1);
    const n11 = this.dot(x1, y1, xf - 1, yf - 1);

    const a = n00 + u * (n10 - n00);
    const b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.4;
  }

  private dot(ix: number, iy: number, dx: number, dy: number): number {
    const g = this.perm[this.perm[ix] + iy] & 255;
    return this.gradX[g] * dx + this.gradY[g] * dy;
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  ridged(x: number, y: number, octaves = 4): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.sample(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
