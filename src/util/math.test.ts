import { describe, expect, it } from 'vitest';
import { angleDelta, clamp, damp, lerp, makeRng, moveTowardsAngle, smoothstep } from './math';

describe('clamp', () => {
  it('bounds values to the range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });
});

describe('lerp', () => {
  it('interpolates endpoints exactly', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.25)).toBe(4);
  });
});

describe('smoothstep', () => {
  it('is flat outside the edges and 0.5 at the midpoint', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('angleDelta', () => {
  it('returns the shortest signed rotation', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(angleDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 6);
    expect(Math.abs(angleDelta(0, Math.PI * 1.9))).toBeLessThan(Math.PI);
    expect(angleDelta(0, Math.PI * 1.9)).toBeCloseTo(-0.1 * Math.PI, 6);
  });
});

describe('moveTowardsAngle', () => {
  it('never overshoots the target', () => {
    expect(moveTowardsAngle(0, 1, 5)).toBe(1);
    expect(moveTowardsAngle(0, 1, 0.25)).toBeCloseTo(0.25, 6);
  });

  it('turns the short way around the wrap point', () => {
    const result = moveTowardsAngle(3.0, -3.0, 0.2);
    expect(result).toBeGreaterThan(3.0);
  });
});

describe('damp', () => {
  it('approaches the target without overshooting', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 8, 1 / 60);
    expect(v).toBeGreaterThan(9.9);
    expect(v).toBeLessThanOrEqual(10);
  });

  it('is frame-rate independent to a close tolerance', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 6, 1 / 60);
    let b = 0;
    for (let i = 0; i < 120; i++) b = damp(b, 1, 6, 1 / 120);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces values inside [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});
