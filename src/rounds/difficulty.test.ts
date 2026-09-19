import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURVE,
  compositionFor,
  healthMultiplierFor,
  isSpecialRound,
  maxAliveFor,
  pickKind,
  planForRound,
  spawnIntervalFor,
  totalZombiesFor,
} from './difficulty';

describe('difficulty curve', () => {
  it('increases total zombies monotonically until the cap', () => {
    let previous = 0;
    for (let round = 1; round <= 40; round++) {
      const total = totalZombiesFor(round);
      if (!isSpecialRound(round) && !isSpecialRound(round - 1)) {
        expect(total).toBeGreaterThanOrEqual(previous);
      }
      previous = total;
      expect(total).toBeLessThanOrEqual(DEFAULT_CURVE.maxTotalZombies);
    }
  });

  it('never exceeds the hard max-alive ceiling', () => {
    for (let round = 1; round <= 60; round++) {
      const limit = DEFAULT_CURVE.hardMaxAlive + (isSpecialRound(round) ? DEFAULT_CURVE.specialAliveBonus : 0);
      expect(maxAliveFor(round)).toBeLessThanOrEqual(limit);
    }
    expect(maxAliveFor(2)).toBeGreaterThan(maxAliveFor(1) - 1);
  });

  it('shortens the spawn interval monotonically down to a floor', () => {
    let previous = Infinity;
    for (let round = 1; round <= 40; round++) {
      if (isSpecialRound(round)) continue;
      const interval = spawnIntervalFor(round);
      expect(interval).toBeLessThanOrEqual(previous + 1e-6);
      expect(interval).toBeGreaterThanOrEqual(DEFAULT_CURVE.minSpawnInterval);
      previous = interval;
    }
  });

  it('keeps health scaling modest and capped', () => {
    expect(healthMultiplierFor(1)).toBe(1);
    expect(healthMultiplierFor(3)).toBe(1);
    expect(healthMultiplierFor(10)).toBeGreaterThan(1);
    expect(healthMultiplierFor(200)).toBeLessThanOrEqual(DEFAULT_CURVE.healthMultiplierCap);
    expect(healthMultiplierFor(15)).toBeLessThan(2);
  });

  it('starts walkers only and phases in runners then brutes', () => {
    const r1 = compositionFor(1);
    expect(r1.walker).toBe(1);
    expect(r1.runner).toBe(0);
    expect(r1.brute).toBe(0);

    expect(compositionFor(3).runner).toBe(0);
    expect(compositionFor(5).runner).toBeGreaterThan(0);
    expect(compositionFor(7).brute).toBe(0);
    expect(compositionFor(9).brute).toBeGreaterThan(0);
  });

  it('keeps every composition normalised to one', () => {
    for (let round = 1; round <= 50; round++) {
      const c = compositionFor(round);
      expect(c.walker + c.runner + c.brute).toBeCloseTo(1, 6);
      expect(c.walker).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks surge rounds on a fixed cadence', () => {
    expect(isSpecialRound(9)).toBe(false);
    expect(isSpecialRound(10)).toBe(true);
    expect(isSpecialRound(15)).toBe(true);
    expect(isSpecialRound(12)).toBe(false);
    expect(planForRound(10).special).toBe(true);
    expect(planForRound(10).maxAlive).toBeGreaterThan(planForRound(9).maxAlive);
  });

  it('picks kinds deterministically from the composition', () => {
    const c = { walker: 0.5, runner: 0.3, brute: 0.2 };
    expect(pickKind(c, 0.1)).toBe('brute');
    expect(pickKind(c, 0.35)).toBe('runner');
    expect(pickKind(c, 0.9)).toBe('walker');
    expect(pickKind({ walker: 1, runner: 0, brute: 0 }, 0)).toBe('walker');
    expect(pickKind({ walker: 1, runner: 0, brute: 0 }, 1)).toBe('walker');
  });

  it('produces a fully populated plan', () => {
    const plan = planForRound(6);
    expect(plan.round).toBe(6);
    expect(plan.totalZombies).toBeGreaterThan(0);
    expect(plan.maxAlive).toBeGreaterThan(0);
    expect(plan.label).toContain('6');
    expect(planForRound(0).round).toBe(1);
  });
});
