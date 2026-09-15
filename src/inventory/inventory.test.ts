import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory';
import {
  CARRY,
  WEIGHT,
  defaultLoadout,
  loadoutWeight,
  validateLoadout,
  type Loadout,
} from './loadout';
import { WEAPONS } from '../weapons/definitions';
import { MEDICAL } from '../medical/definitions';

function loadout(partial: Partial<Loadout> = {}): Loadout {
  return { weapons: [], reserves: {}, medical: {}, ...partial };
}

describe('loadout validation', () => {
  it('accepts the default loadout the game spawns with', () => {
    const result = validateLoadout(defaultLoadout());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects an empty loadout', () => {
    expect(validateLoadout(loadout()).valid).toBe(false);
  });

  it('rejects more firearms than may be carried', () => {
    const r = validateLoadout(
      loadout({ weapons: ['pistol', 'rifle', 'shotgun', 'pistol'] }),
    );
    expect(r.valid).toBe(false);
  });

  it('rejects a duplicated weapon', () => {
    const r = validateLoadout(loadout({ weapons: ['pistol', 'pistol'] }));
    expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('does not count melee against the firearm limit', () => {
    const r = validateLoadout(
      loadout({
        weapons: ['pistol', 'rifle', 'shotgun', 'machete'],
        reserves: { pistol: 45, rifle: 90, shotgun: 18 },
      }),
    );
    expect(r.valid).toBe(true);
  });

  it('rejects ammunition for a weapon that is not carried', () => {
    const r = validateLoadout(loadout({ weapons: ['pistol'], reserves: { rifle: 30 } }));
    expect(r.valid).toBe(false);
  });

  it('rejects ammunition for a melee weapon', () => {
    const r = validateLoadout(loadout({ weapons: ['machete'], reserves: { machete: 10 } }));
    expect(r.errors.some((e) => e.includes('does not take ammunition'))).toBe(true);
  });

  it('rejects a reserve past the weapon maximum', () => {
    const r = validateLoadout(
      loadout({ weapons: ['pistol'], reserves: { pistol: WEAPONS.pistol.maxReserve + 1 } }),
    );
    expect(r.valid).toBe(false);
  });

  it('rejects a medical stack past its limit', () => {
    const r = validateLoadout(
      loadout({ weapons: ['pistol'], medical: { bandage: MEDICAL.bandage.stackLimit + 1 } }),
    );
    expect(r.valid).toBe(false);
  });

  it('rejects more medical items in total than may be carried', () => {
    const r = validateLoadout(
      loadout({ weapons: ['pistol'], medical: { bandage: 8, medkit: 3 } }),
    );
    expect(r.errors.some((e) => e.includes('medical items'))).toBe(true);
  });

  it('rejects a loadout over the weight limit', () => {
    const heavy = loadout({
      weapons: ['pistol', 'rifle', 'shotgun', 'machete'],
      reserves: {
        pistol: WEAPONS.pistol.maxReserve,
        rifle: WEAPONS.rifle.maxReserve,
        shotgun: WEAPONS.shotgun.maxReserve,
      },
      medical: { bandage: 8, medkit: 2 },
    });
    const r = validateLoadout(heavy);
    expect(r.weight).toBeGreaterThan(CARRY.maxWeight);
    expect(r.valid).toBe(false);
  });

  it('uses a 25 kg bag', () => {
    expect(CARRY.maxWeight).toBe(25);
  });

  it('leaves the default loadout comfortably inside the bag', () => {
    const r = validateLoadout(defaultLoadout());
    expect(r.valid).toBe(true);
    expect(r.weight).toBeLessThan(CARRY.maxWeight);
    expect(r.weight).toBeGreaterThan(CARRY.maxWeight * 0.5);
  });

  it('orders item weights so a rifle costs more than a pistol than a machete', () => {
    expect(WEIGHT.rifle).toBeGreaterThan(WEIGHT.shotgun);
    expect(WEIGHT.shotgun).toBeGreaterThan(WEIGHT.pistol);
    expect(WEIGHT.pistol).toBeGreaterThan(WEIGHT.machete);
    expect(WEIGHT.medkit).toBeGreaterThan(WEIGHT.bandage);
  });

  it('makes heavier calibres weigh more per round', () => {
    expect(WEIGHT.ammoPer10['12g']).toBeGreaterThan(WEIGHT.ammoPer10['556']);
    expect(WEIGHT.ammoPer10['556']).toBeGreaterThan(WEIGHT.ammoPer10['9mm']);
  });

  it('makes weight rise with both weapons and spare ammunition', () => {
    const light = loadout({ weapons: ['pistol'], reserves: { pistol: 15 } });
    const heavier = loadout({ weapons: ['pistol'], reserves: { pistol: 150 } });
    expect(loadoutWeight(heavier)).toBeGreaterThan(loadoutWeight(light));
    expect(loadoutWeight(loadout({ weapons: ['rifle'] }))).toBeGreaterThan(
      loadoutWeight(loadout({ weapons: ['machete'] })),
    );
  });

  it('rejects an unknown weapon id', () => {
    const r = validateLoadout(loadout({ weapons: ['rocket' as never] }));
    expect(r.valid).toBe(false);
  });
});

describe('Inventory from a loadout', () => {
  it('carries exactly the weapons the loadout names, in order', () => {
    const inv = new Inventory(loadout({ weapons: ['shotgun', 'machete'] }));
    expect(inv.weapons.map((w) => w.id)).toEqual(['shotgun', 'machete']);
  });

  it('starts each firearm with a full magazine and the requested reserve', () => {
    const inv = new Inventory(loadout({ weapons: ['shotgun'], reserves: { shotgun: 12 } }));
    const entry = inv.weaponEntry('shotgun');
    expect(entry?.magazine).toBe(WEAPONS.shotgun.magazineSize);
    expect(entry?.reserve).toBe(12);
  });

  it('gives a melee weapon no magazine and no reserve', () => {
    const inv = new Inventory(loadout({ weapons: ['machete'] }));
    const entry = inv.weaponEntry('machete');
    expect(entry?.magazine).toBe(0);
    expect(entry?.reserve).toBe(0);
  });

  it('clamps a reserve to the weapon maximum', () => {
    const inv = new Inventory(loadout({ weapons: ['pistol'], reserves: { pistol: 99999 } }));
    expect(inv.weaponEntry('pistol')?.reserve).toBe(WEAPONS.pistol.maxReserve);
  });

  it('clamps medical quantities to the per-stack limit', () => {
    const inv = new Inventory(loadout({ weapons: ['pistol'], medical: { bandage: 999 } }));
    expect(inv.medicalCount('bandage')).toBe(MEDICAL.bandage.stackLimit);
  });

  it('clamps medical quantities to the total carry limit', () => {
    const inv = new Inventory(
      loadout({ weapons: ['pistol'], medical: { bandage: 8, medkit: 3 } }),
    );
    expect(inv.totalMedical).toBeLessThanOrEqual(CARRY.maxMedicalItems);
  });

  it('restores the original loadout on reset', () => {
    const inv = new Inventory(defaultLoadout());
    inv.consumeMedical('bandage', 2);
    inv.weaponEntry('pistol')!.magazine = 0;
    inv.reset();
    expect(inv.medicalCount('bandage')).toBe(defaultLoadout().medical.bandage);
    expect(inv.weaponEntry('pistol')?.magazine).toBe(WEAPONS.pistol.magazineSize);
  });
});

describe('Inventory item handling', () => {
  it('refuses to consume more medical items than are carried', () => {
    const inv = new Inventory(loadout({ weapons: ['pistol'], medical: { bandage: 1 } }));
    expect(inv.consumeMedical('bandage', 1)).toBe(true);
    expect(inv.consumeMedical('bandage', 1)).toBe(false);
    expect(inv.medicalCount('bandage')).toBe(0);
  });

  it('respects the stack limit when picking items up', () => {
    const inv = new Inventory(loadout({ weapons: ['pistol'], medical: { bandage: 0 } }));
    const taken = inv.addMedical('bandage', 999);
    expect(taken).toBe(MEDICAL.bandage.stackLimit);
    expect(inv.medicalCount('bandage')).toBe(MEDICAL.bandage.stackLimit);
  });

  it('respects the total carry limit when picking items up', () => {
    const inv = new Inventory(
      loadout({ weapons: ['pistol'], medical: { bandage: 8 } }),
    );
    inv.addMedical('medkit', 3);
    expect(inv.totalMedical).toBeLessThanOrEqual(CARRY.maxMedicalItems);
  });

  it('routes picked-up ammunition to the weapon that uses that calibre', () => {
    const inv = new Inventory(
      loadout({ weapons: ['pistol', 'shotgun'], reserves: { pistol: 0, shotgun: 0 } }),
    );
    inv.addAmmo('12g', 10);
    expect(inv.weaponEntry('shotgun')?.reserve).toBe(10);
    expect(inv.weaponEntry('pistol')?.reserve).toBe(0);
  });

  it('discards ammunition for a calibre nothing carried uses', () => {
    const inv = new Inventory(loadout({ weapons: ['pistol'], reserves: { pistol: 0 } }));
    expect(inv.addAmmo('12g', 10)).toBe(0);
  });

  it('never pushes a reserve past the weapon maximum when picking up ammunition', () => {
    const inv = new Inventory(loadout({ weapons: ['pistol'], reserves: { pistol: 0 } }));
    inv.addAmmo('9mm', 99999);
    expect(inv.weaponEntry('pistol')?.reserve).toBe(WEAPONS.pistol.maxReserve);
  });
});
