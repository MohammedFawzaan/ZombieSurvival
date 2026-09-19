import { describe, expect, it } from 'vitest';
import { PurchaseResult } from '../state/types';
import { PointsEconomy } from '../economy/points';
import { PowerSystem } from '../progression/power';
import { PERKS, PERK_ORDER } from './perkDefinitions';
import { PerkSystem } from './perkSystem';

function rich(): PointsEconomy {
  const e = new PointsEconomy();
  e.points = 100000;
  return e;
}

function powered(): { power: PowerSystem; perks: PerkSystem } {
  const power = new PowerSystem();
  power.activate('main');
  return { power, perks: new PerkSystem(power) };
}

describe('perk definitions', () => {
  it('defines exactly the four map perk ids with original names', () => {
    expect(PERK_ORDER).toEqual(['vitality', 'steadyhands', 'secondwind', 'fieldmedic']);
    for (const id of PERK_ORDER) {
      expect(PERKS[id].id).toBe(id);
      expect(PERKS[id].name.length).toBeGreaterThan(0);
      expect(PERKS[id].defaultCost).toBeGreaterThan(0);
    }
  });
});

describe('PerkSystem', () => {
  it('refuses every perk until power is on', () => {
    const perks = new PerkSystem(new PowerSystem());
    const e = rich();
    const out = perks.purchase('vitality', e);
    expect(out.result).toBe(PurchaseResult.NeedsPower);
    expect(perks.has('vitality')).toBe(false);
    expect(e.spent).toBe(0);
  });

  it('buys a perk once and refuses a duplicate without charging again', () => {
    const { perks } = powered();
    const e = rich();
    const first = perks.purchase('vitality', e);
    expect(first.result).toBe(PurchaseResult.Ok);
    const spentAfterFirst = e.spent;
    expect(spentAfterFirst).toBe(PERKS.vitality.defaultCost);

    const second = perks.purchase('vitality', e);
    expect(second.result).toBe(PurchaseResult.AlreadyOwned);
    expect(e.spent).toBe(spentAfterFirst);
    expect(perks.count).toBe(1);
  });

  it('refuses a perk the player cannot afford', () => {
    const { perks } = powered();
    const e = new PointsEconomy();
    e.points = 10;
    const out = perks.purchase('steadyhands', e);
    expect(out.result).toBe(PurchaseResult.Insufficient);
    expect(e.points).toBe(10);
    expect(perks.has('steadyhands')).toBe(false);
  });

  it('applies the vitality health bonus as a readable value', () => {
    const { perks } = powered();
    expect(perks.maxHealthFor(100)).toBe(100);
    perks.purchase('vitality', rich());
    expect(perks.maxHealthFor(100)).toBe(175);
  });

  it('applies a reload multiplier the weapon system can read', () => {
    const { perks } = powered();
    expect(perks.reloadTime(2)).toBe(2);
    perks.purchase('steadyhands', rich());
    expect(perks.reloadTime(2)).toBeCloseTo(1.2, 6);
  });

  it('improves stamina economy in all three directions', () => {
    const { perks } = powered();
    perks.purchase('secondwind', rich());
    expect(perks.staminaMax(100)).toBeGreaterThan(100);
    expect(perks.staminaRegen(10)).toBeGreaterThan(10);
    expect(perks.staminaDrain(10)).toBeLessThan(10);
    expect(perks.meleeStaminaCost(10)).toBeLessThan(10);
  });

  it('improves healing speed and amount', () => {
    const { perks } = powered();
    perks.purchase('fieldmedic', rich());
    expect(perks.healUseTime(4)).toBeCloseTo(2, 6);
    expect(perks.healAmount(100)).toBeCloseTo(135, 6);
  });

  it('stacks distinct perks multiplicatively and additively', () => {
    const { perks } = powered();
    const e = rich();
    for (const id of PERK_ORDER) expect(perks.purchase(id, e).result).toBe(PurchaseResult.Ok);
    expect(perks.count).toBe(4);
    expect(perks.maxHealthFor(100)).toBe(175);
    expect(perks.reloadTime(1)).toBeCloseTo(0.6, 6);
    expect(perks.healUseTime(1)).toBeCloseTo(0.5, 6);
    expect(perks.hudBadges).toHaveLength(4);
  });

  it('refuses a fifth perk when every slot is taken', () => {
    const { perks } = powered();
    const e = rich();
    for (const id of PERK_ORDER) perks.purchase(id, e);
    expect(perks.availability('vitality')).toBe(PurchaseResult.AlreadyOwned);
    perks.revoke('vitality');
    expect(perks.availability('vitality')).toBe(PurchaseResult.Ok);
  });

  it('honours a machine cost that overrides the default', () => {
    const { perks } = powered();
    const e = rich();
    perks.purchase('vitality', e, 999);
    expect(e.spent).toBe(999);
  });

  it('clears all effects on reset', () => {
    const { perks } = powered();
    const e = rich();
    for (const id of PERK_ORDER) perks.purchase(id, e);
    perks.reset();
    expect(perks.count).toBe(0);
    expect(perks.maxHealthFor(100)).toBe(100);
    expect(perks.reloadTime(2)).toBe(2);
    expect(perks.hudBadges).toHaveLength(0);
  });

  it('removes a revoked perk effect', () => {
    const { perks } = powered();
    perks.purchase('vitality', rich());
    expect(perks.revoke('vitality')).toBe(true);
    expect(perks.maxHealthFor(100)).toBe(100);
    expect(perks.revoke('vitality')).toBe(false);
  });
});
