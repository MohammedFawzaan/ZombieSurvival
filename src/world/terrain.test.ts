import { describe, expect, it } from 'vitest';
import { DEFAULT_TERRAIN, Terrain } from './terrain';

const terrain = new Terrain({ ...DEFAULT_TERRAIN, segments: 48, size: 240 });

describe('Terrain generation', () => {
  it('is deterministic for a given seed', () => {
    const a = new Terrain({ ...DEFAULT_TERRAIN, seed: 999, segments: 32, size: 200 });
    const b = new Terrain({ ...DEFAULT_TERRAIN, seed: 999, segments: 32, size: 200 });
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('varies between seeds', () => {
    const a = new Terrain({ ...DEFAULT_TERRAIN, seed: 1, segments: 32, size: 200 });
    const b = new Terrain({ ...DEFAULT_TERRAIN, seed: 2, segments: 32, size: 200 });
    expect(Array.from(a.heights)).not.toEqual(Array.from(b.heights));
  });

  it('produces real elevation variation rather than a flat plane', () => {
    let min = Infinity;
    let max = -Infinity;
    for (const h of terrain.heights) {
      if (h < min) min = h;
      if (h > max) max = h;
    }
    expect(max - min).toBeGreaterThan(8);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
  });

  it('contains no NaN heights', () => {
    for (const h of terrain.heights) expect(Number.isNaN(h)).toBe(false);
  });
});

describe('Terrain.heightAt', () => {
  it('matches the grid exactly at vertex positions', () => {
    const half = terrain.half;
    for (let j = 0; j < terrain.gridSize; j += 7) {
      for (let i = 0; i < terrain.gridSize; i += 7) {
        const x = -half + i * terrain.cellSize;
        const z = -half + j * terrain.cellSize;
        const expected = terrain.heights[j * terrain.gridSize + i];
        expect(terrain.heightAt(x, z)).toBeCloseTo(expected, 4);
      }
    }
  });

  it('interpolates between vertices without spiking', () => {
    const half = terrain.half;
    const x = -half + terrain.cellSize * 5;
    const z = -half + terrain.cellSize * 5;
    const a = terrain.heightAt(x, z);
    const b = terrain.heightAt(x + terrain.cellSize, z);
    const mid = terrain.heightAt(x + terrain.cellSize * 0.5, z);
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6);
    expect(mid).toBeLessThanOrEqual(Math.max(a, b) + 1e-6);
  });

  it('clamps sampling outside the world instead of returning NaN', () => {
    expect(Number.isFinite(terrain.heightAt(1e6, 1e6))).toBe(true);
    expect(Number.isFinite(terrain.heightAt(-1e6, -1e6))).toBe(true);
  });
});

describe('Terrain normals and slope', () => {
  it('returns unit-length normals pointing upward', () => {
    const n = { x: 0, y: 0, z: 0 };
    for (const [x, z] of [
      [0, 0],
      [30, -20],
      [-55, 41],
    ]) {
      terrain.normalAt(x, z, n);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
      expect(n.y).toBeGreaterThan(0);
    }
  });

  it('reports slope as a non-negative angle below a right angle', () => {
    for (const [x, z] of [
      [0, 0],
      [12, 34],
      [-70, 15],
    ]) {
      const slope = terrain.slopeAt(x, z);
      expect(slope).toBeGreaterThanOrEqual(0);
      expect(slope).toBeLessThan(Math.PI / 2);
    }
  });
});

describe('Terrain road', () => {
  it('measures zero distance on the centreline and more off it', () => {
    const p = terrain.road.points[6];
    expect(terrain.distanceToRoad(p.x, p.z)).toBeLessThan(1);
    expect(terrain.distanceToRoad(p.x + 40, p.z)).toBeGreaterThan(20);
  });

  it('flattens the ground along the road relative to the surrounding forest', () => {
    let roadSlope = 0;
    let offRoadSlope = 0;
    let n = 0;
    for (const p of terrain.road.points.slice(1, -1)) {
      roadSlope += terrain.slopeAt(p.x, p.z);
      offRoadSlope += terrain.slopeAt(p.x + 35, p.z + 12);
      n++;
    }
    expect(roadSlope / n).toBeLessThan(offRoadSlope / n + 0.25);
  });
});

describe('Terrain bounds', () => {
  it('accepts interior points and rejects points past the margin', () => {
    expect(terrain.isInBounds(0, 0)).toBe(true);
    expect(terrain.isInBounds(terrain.half - 2, 0)).toBe(false);
    expect(terrain.isInBounds(terrain.half + 50, 0)).toBe(false);
  });
});
