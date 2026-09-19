import { describe, expect, it } from 'vitest';
import type { RewardEntry } from '../maps/mapTypes';
import { PurchaseResult } from '../state/types';
import { Inventory } from '../inventory/inventory';
import { PointsEconomy } from '../economy/points';
import { PowerSystem } from '../progression/power';
import { DEFAULT_REWARD_TABLE, RewardSystem } from './rewardSystem';

function inv(): Inventory {
  return new Inventory({
    weapons: ['pistol'],
    reserves: { pistol: 0 },
    medical: { bandage: 0, medkit: 0 },
  });
}

function rich(points = 100000): PointsEconomy {
  const e = new PointsEconomy();
  e.points = points;
  return e;
}

function powered(seed = 99): RewardSystem {
  const power = new PowerSystem();
  power.activate('main');
  return new RewardSystem(power, { seed });
}

describe('RewardSystem', () => {
  it('refuses to roll without power', () => {
    const rs = new RewardSystem(new PowerSystem(), { seed: 1 });
    const e = rich();
    const g = rs.purchase(950, e, inv(), true);
    expect(g.result).toBe(PurchaseResult.NeedsPower);
    expect(e.spent).toBe(0);
    expect(rs.rolls).toBe(0);
  });

  it('refuses a roll the player cannot afford', () => {
    const rs = powered();
    const e = new PointsEconomy();
    e.points = 100;
    const g = rs.purchase(950, e, inv());
    expect(g.result).toBe(PurchaseResult.Insufficient);
    expect(e.points).toBe(100);
    expect(rs.rolls).toBe(0);
  });

  it('deducts the cost exactly once per roll', () => {
    const rs = powered();
    const e = rich(2000);
    expect(rs.purchase(950, e, inv()).result).toBe(PurchaseResult.Ok);
    expect(e.points).toBe(1050);
    expect(e.spent).toBe(950);
    expect(rs.rolls).toBe(1);
  });

  it('produces the identical sequence for the same seed', () => {
    const a = powered(4242);
    const b = powered(4242);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 25; i++) seqA.push(a.purchase(10, rich(), inv()).label);
    for (let i = 0; i < 25; i++) seqB.push(b.purchase(10, rich(), inv()).label);
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(1);
  });

  it('produces a different sequence for a different seed', () => {
    const a = powered(1);
    const b = powered(2);
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 25; i++) seqA.push(a.purchase(10, rich(), inv()).label);
    for (let i = 0; i < 25; i++) seqB.push(b.purchase(10, rich(), inv()).label);
    expect(seqA).not.toEqual(seqB);
  });

  it('replays the same sequence after reset', () => {
    const rs = powered(777);
    const first: string[] = [];
    for (let i = 0; i < 10; i++) first.push(rs.purchase(10, rich(), inv()).label);
    rs.reset();
    expect(rs.rolls).toBe(0);
    const second: string[] = [];
    for (let i = 0; i < 10; i++) second.push(rs.purchase(10, rich(), inv()).label);
    expect(second).toEqual(first);
  });

  it('maps roll positions onto the weighted table deterministically', () => {
    const rs = powered();
    const total = DEFAULT_REWARD_TABLE.reduce((s, e) => s + e.weight, 0);
    expect(rs.peek(0)).toBe(DEFAULT_REWARD_TABLE[0]);
    expect(rs.peek(0.999999)).toBe(DEFAULT_REWARD_TABLE[DEFAULT_REWARD_TABLE.length - 1]);
    const firstShare = DEFAULT_REWARD_TABLE[0].weight / total;
    expect(rs.peek(firstShare * 0.5)).toBe(DEFAULT_REWARD_TABLE[0]);
    expect(rs.peek(firstShare + 0.001)).toBe(DEFAULT_REWARD_TABLE[1]);
  });

  it('grants ammo through the real inventory', () => {
    const table: RewardEntry[] = [
      { kind: 'ammo', ammo: '9mm', rounds: 60, weight: 1, label: 'Pistol Ammo' },
    ];
    const rs = powered();
    rs.setTable(table);
    const inventory = inv();
    const g = rs.purchase(500, rich(), inventory);
    expect(g.result).toBe(PurchaseResult.Ok);
    expect(g.granted).toBe(60);
    expect(inventory.weaponEntry('pistol')?.reserve).toBe(60);
  });

  it('grants medical through the real inventory', () => {
    const rs = powered();
    rs.setTable([{ kind: 'medical', medical: 'medkit', count: 2, weight: 1, label: 'Medkit' }]);
    const inventory = inv();
    const g = rs.purchase(500, rich(), inventory);
    expect(g.granted).toBe(2);
    expect(inventory.medicalCount('medkit')).toBe(2);
  });

  it('flags a genuinely new weapon and converts a duplicate into ammo', () => {
    const rs = powered();
    rs.setTable([{ kind: 'weapon', weapon: 'rifle', weight: 1, label: 'Rifle' }]);
    const inventory = inv();
    const first = rs.purchase(500, rich(), inventory);
    expect(first.newWeapon).toBe(true);
    expect(first.granted).toBe(1);

    const owning = new Inventory({
      weapons: ['pistol', 'rifle'],
      reserves: { pistol: 0, rifle: 0 },
      medical: {},
    });
    const second = rs.purchase(500, rich(), owning);
    expect(second.newWeapon).toBe(false);
    expect(second.granted).toBeGreaterThan(0);
    expect(second.label).toContain('Ammo');
    expect(owning.weaponEntry('rifle')?.reserve).toBeGreaterThan(0);
  });

  it('refunds and reports unavailable when the table is empty', () => {
    const rs = powered();
    rs.setTable([]);
    const e = rich(1000);
    const g = rs.purchase(500, e, inv());
    expect(g.result).toBe(PurchaseResult.Unavailable);
    expect(e.points).toBe(1000);
  });

  it('can roll without power when the machine does not require it', () => {
    const rs = new RewardSystem(new PowerSystem(), { seed: 5 });
    const g = rs.purchase(500, rich(), inv(), false);
    expect(g.result).toBe(PurchaseResult.Ok);
  });
});
