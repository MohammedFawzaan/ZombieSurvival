import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../state/gameState';
import { Inventory } from '../inventory/inventory';
import { WeaponSystem } from '../weapons/weaponSystem';
import { MedicalSystem } from '../medical/medicalSystem';
import { PerkSystem } from './perkSystem';
import { PowerSystem } from '../progression/power';
import { PointsEconomy, POINTS } from '../economy/points';
import { PERKS } from './perkDefinitions';

function buyAll(perks: PerkSystem, economy: PointsEconomy): void {
  economy.refund(100000);
  for (const id of ['vitality', 'steadyhands', 'secondwind', 'fieldmedic'] as const) {
    perks.purchase(id, economy, PERKS[id].defaultCost, true);
  }
}

describe('perk effects reach the systems that consume them', () => {
  let power: PowerSystem;
  let perks: PerkSystem;
  let economy: PointsEconomy;

  beforeEach(() => {
    power = new PowerSystem();
    power.activate('test');
    perks = new PerkSystem(power);
    economy = new PointsEconomy(POINTS);
  });

  it('steadyhands actually shortens a real reload', () => {
    const state = new GameState();
    const inventory = new Inventory();
    const weapons = new WeaponSystem(state, inventory);
    const baseline = weapons.current.reloadTime;

    buyAll(perks, economy);
    weapons.reloadTimeMultiplier = perks.reloadTime(1);

    expect(weapons.reloadTimeMultiplier).toBeLessThan(1);
    expect(baseline * weapons.reloadTimeMultiplier).toBeLessThan(baseline);
  });

  it('fieldmedic actually changes healing applied to health', () => {
    const state = new GameState();
    const inventory = new Inventory();
    const medical = new MedicalSystem(state, inventory);

    buyAll(perks, economy);
    medical.healAmountMultiplier = perks.healAmount(1);
    medical.healSpeedMultiplier = perks.healUseTime(1);

    expect(medical.healAmountMultiplier).toBeGreaterThan(1);
    expect(medical.healSpeedMultiplier).toBeLessThan(1);
  });

  it('vitality raises max health above the base', () => {
    buyAll(perks, economy);
    expect(perks.maxHealthFor(100)).toBeGreaterThan(100);
  });

  it('secondwind improves the stamina economy', () => {
    buyAll(perks, economy);
    expect(perks.staminaMax(100)).toBeGreaterThanOrEqual(100);
    expect(perks.staminaDrain(1)).toBeLessThanOrEqual(1);
  });

  it('every perk multiplier is neutral before any purchase', () => {
    expect(perks.reloadTime(1)).toBe(1);
    expect(perks.healAmount(1)).toBe(1);
    expect(perks.healUseTime(1)).toBe(1);
    expect(perks.staminaMax(1)).toBe(1);
    expect(perks.staminaRegen(1)).toBe(1);
    expect(perks.staminaDrain(1)).toBe(1);
    expect(perks.maxHealthFor(100)).toBe(100);
  });
});
