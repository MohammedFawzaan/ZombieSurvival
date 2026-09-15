import { describe, expect, it } from 'vitest';
import { pelletPattern, UNIFORM_DISC_MEAN_RADIUS } from './pellets';
import { makeRng } from '../util/math';
import { WEAPONS } from './definitions';

function pattern(count: number, seed: number): { u: number; v: number }[] {
  const out = new Float32Array(count * 2);
  pelletPattern(count, out, makeRng(seed));
  const list: { u: number; v: number }[] = [];
  for (let i = 0; i < count; i++) list.push({ u: out[i * 2], v: out[i * 2 + 1] });
  return list;
}

describe('pellet pattern geometry', () => {
  it('produces exactly the requested number of offsets', () => {
    for (const n of [1, 6, 8, 9, 12, 16]) {
      expect(pattern(n, n * 17 + 1)).toHaveLength(n);
    }
  });

  it('keeps every pellet inside the unit disc', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const p of pattern(9, seed)) {
        expect(Math.hypot(p.u, p.v)).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('spreads pellets over the whole disc rather than clustering at the centre', () => {
    const rng = makeRng(9001);
    const out = new Float32Array(9 * 2);
    let sum = 0;
    let n = 0;
    for (let shot = 0; shot < 4000; shot++) {
      pelletPattern(9, out, rng);
      for (let i = 0; i < 9; i++) {
        sum += Math.hypot(out[i * 2], out[i * 2 + 1]);
        n++;
      }
    }
    const mean = sum / n;
    expect(mean).toBeGreaterThan(UNIFORM_DISC_MEAN_RADIUS - 0.03);
    expect(mean).toBeLessThan(UNIFORM_DISC_MEAN_RADIUS + 0.03);
  });

  it('fills every angular quadrant on a single shot', () => {
    const rng = makeRng(4242);
    const out = new Float32Array(9 * 2);
    for (let shot = 0; shot < 500; shot++) {
      pelletPattern(9, out, rng);
      const quadrants = new Set<number>();
      for (let i = 0; i < 9; i++) {
        const u = out[i * 2];
        const v = out[i * 2 + 1];
        quadrants.add((u >= 0 ? 0 : 2) + (v >= 0 ? 0 : 1));
      }
      expect(quadrants.size).toBe(4);
    }
  });

  it('puts roughly equal pellet counts in the inner and outer halves by area', () => {
    const rng = makeRng(31337);
    const out = new Float32Array(9 * 2);
    const half = Math.SQRT1_2;
    let inner = 0;
    let total = 0;
    for (let shot = 0; shot < 4000; shot++) {
      pelletPattern(9, out, rng);
      for (let i = 0; i < 9; i++) {
        if (Math.hypot(out[i * 2], out[i * 2 + 1]) < half) inner++;
        total++;
      }
    }
    expect(inner / total).toBeGreaterThan(0.45);
    expect(inner / total).toBeLessThan(0.55);
  });

  it('does not repeat the same pattern on consecutive shots', () => {
    const rng = makeRng(77);
    const a = new Float32Array(18);
    const b = new Float32Array(18);
    pelletPattern(9, a, rng);
    pelletPattern(9, b, rng);
    let identical = true;
    for (let i = 0; i < 18; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-9) identical = false;
    }
    expect(identical).toBe(false);
  });
});

describe('shotgun cone sizing', () => {
  it('throws a pattern of a sensible physical width at 10 m', () => {
    const def = WEAPONS.shotgun;
    const cone = def.pelletCone ?? 0;
    const radiusAt10m = Math.tan(cone) * 10;
    expect(radiusAt10m).toBeGreaterThan(0.6);
    expect(radiusAt10m).toBeLessThan(1.2);
  });

  it('tightens but does not eliminate the cone while aiming', () => {
    const def = WEAPONS.shotgun;
    const aimScale = def.pelletConeAim ?? 1;
    expect(aimScale).toBeGreaterThan(0.3);
    expect(aimScale).toBeLessThan(1);
  });
});
