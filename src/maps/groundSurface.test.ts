import { describe, it, expect } from 'vitest';
import { Terrain, DEFAULT_TERRAIN } from '../world/terrain';
import { CityGround, DEFAULT_CITY_GROUND } from './city/cityGround';
import type { GroundSurface } from './groundSurface';

function checkContract(g: GroundSurface, size: number): void {
  expect(g.half).toBe(size / 2);
  expect(g.heights.length).toBe(g.gridSize * g.gridSize);
  expect(Number.isFinite(g.heightAt(0, 0))).toBe(true);
  expect(Number.isFinite(g.slopeAt(0, 0))).toBe(true);
  expect(g.isInBounds(0, 0)).toBe(true);
  expect(g.isInBounds(size, size)).toBe(false);
  const n = { x: 0, y: 0, z: 0 };
  g.normalAt(0, 0, n);
  expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 3);
}

describe('GroundSurface contract', () => {
  it('is satisfied by the V1 forest terrain', () => {
    checkContract(new Terrain(DEFAULT_TERRAIN), DEFAULT_TERRAIN.size);
  });

  it('is satisfied by the V2 city ground', () => {
    checkContract(new CityGround(DEFAULT_CITY_GROUND), DEFAULT_CITY_GROUND.size);
  });

  it('keeps the city interior walkably flat', () => {
    const city = new CityGround(DEFAULT_CITY_GROUND);
    let worst = 0;
    for (let x = -120; x <= 120; x += 6) {
      for (let z = -120; z <= 120; z += 6) {
        worst = Math.max(worst, city.slopeAt(x, z));
      }
    }
    expect(worst).toBeLessThan(0.35);
  });
});
