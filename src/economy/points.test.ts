import { describe, expect, it } from 'vitest';
import { HitRegion, PurchaseResult } from '../state/types';
import { POINTS, PointsEconomy, hitAward, killAward, roundClearAward } from './points';

describe('points awards', () => {
  it('pays more for a headshot than a torso hit', () => {
    expect(hitAward(30, HitRegion.Head)).toBeGreaterThan(hitAward(30, HitRegion.Torso));
  });

  it('caps a single hit award', () => {
    expect(hitAward(100000, HitRegion.Head)).toBe(POINTS.maxPerHit);
  });

  it('pays nothing for zero damage', () => {
    expect(hitAward(0, HitRegion.Torso)).toBe(0);
    expect(hitAward(-5, HitRegion.Torso)).toBe(0);
  });

  it('adds headshot and melee bonuses to kills', () => {
    expect(killAward(HitRegion.Torso, false)).toBe(POINTS.kill);
    expect(killAward(HitRegion.Head, false)).toBe(POINTS.kill + POINTS.headshotKillBonus);
    expect(killAward(HitRegion.Torso, true)).toBe(POINTS.kill + POINTS.meleeKillBonus);
    expect(killAward(HitRegion.Head, true)).toBeGreaterThan(killAward(HitRegion.Head, false));
  });

  it('scales the round clear bonus with the round', () => {
    expect(roundClearAward(1)).toBe(POINTS.roundClearBase);
    expect(roundClearAward(5)).toBeGreaterThan(roundClearAward(4));
  });
});

describe('PointsEconomy', () => {
  it('starts at the configured balance', () => {
    const e = new PointsEconomy();
    expect(e.points).toBe(POINTS.startingPoints);
    expect(e.earned).toBe(0);
    expect(e.spent).toBe(0);
  });

  it('tracks earned and spent independently of the balance', () => {
    const e = new PointsEconomy();
    e.awardKill(HitRegion.Torso, false);
    const earned = e.earned;
    expect(earned).toBe(POINTS.kill);
    expect(e.points).toBe(POINTS.startingPoints + earned);

    const out = e.spend(100);
    expect(out.result).toBe(PurchaseResult.Ok);
    expect(e.spent).toBe(100);
    expect(e.earned).toBe(earned);
    expect(e.points).toBe(POINTS.startingPoints + earned - 100);
  });

  it('refuses a purchase it cannot afford and deducts nothing', () => {
    const e = new PointsEconomy();
    const before = e.points;
    const out = e.spend(before + 1);
    expect(out.result).toBe(PurchaseResult.Insufficient);
    expect(e.points).toBe(before);
    expect(e.spent).toBe(0);
  });

  it('allows spending the exact balance', () => {
    const e = new PointsEconomy();
    const out = e.spend(e.points);
    expect(out.result).toBe(PurchaseResult.Ok);
    expect(e.points).toBe(0);
    expect(e.canAfford(1)).toBe(false);
    expect(e.canAfford(0)).toBe(true);
  });

  it('rejects a negative cost', () => {
    const e = new PointsEconomy();
    const before = e.points;
    expect(e.spend(-50).result).toBe(PurchaseResult.Unavailable);
    expect(e.points).toBe(before);
  });

  it('refunds without inflating spent below zero', () => {
    const e = new PointsEconomy();
    e.spend(200);
    e.refund(200);
    expect(e.spent).toBe(0);
    expect(e.points).toBe(POINTS.startingPoints);
    e.refund(50);
    expect(e.spent).toBe(0);
  });

  it('notifies on every balance change', () => {
    const e = new PointsEconomy();
    const deltas: number[] = [];
    e.onChange = (_p, d) => deltas.push(d);
    e.awardKill(HitRegion.Torso, false);
    e.spend(10);
    expect(deltas).toEqual([POINTS.kill, -10]);
  });

  it('decays the award popup off dt only', () => {
    const e = new PointsEconomy();
    e.awardKill(HitRegion.Torso, false);
    expect(e.lastAward).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) e.tick(1 / 60);
    expect(e.lastAward).toBe(0);
    expect(e.lastAwardLife).toBe(0);
  });

  it('resets cleanly', () => {
    const e = new PointsEconomy();
    e.awardKill(HitRegion.Head, true);
    e.spend(300);
    e.reset();
    expect(e.points).toBe(POINTS.startingPoints);
    expect(e.earned).toBe(0);
    expect(e.spent).toBe(0);
    expect(e.breakdown.kills).toBe(0);
  });
});
