import type { MedicalId, WeaponId } from '../state/types';
import { WEAPONS, usesAmmo } from '../weapons/definitions';
import { MEDICAL } from '../medical/definitions';

export interface Loadout {
  weapons: WeaponId[];
  reserves: Partial<Record<WeaponId, number>>;
  medical: Partial<Record<MedicalId, number>>;
}

export const CARRY = {
  maxFirearms: 3,
  maxMelee: 1,
  maxMedicalItems: 10,
  maxWeight: 25,
} as const;

export const WEIGHT = {
  pistol: 1.2,
  rifle: 4.2,
  shotgun: 3.8,
  machete: 0.7,
  ammoPer10: { '9mm': 0.14, '556': 0.32, '12g': 0.62, none: 0 },
  bandage: 0.12,
  medkit: 0.9,
} as const;

export interface LoadoutValidation {
  valid: boolean;
  errors: string[];
  weight: number;
}

export function loadoutWeight(loadout: Loadout): number {
  let w = 0;
  for (const id of loadout.weapons) {
    w += WEIGHT[id];
    const reserve = loadout.reserves[id] ?? 0;
    if (reserve > 0) w += (reserve / 10) * WEIGHT.ammoPer10[WEAPONS[id].ammo];
  }
  for (const id of Object.keys(loadout.medical) as MedicalId[]) {
    w += (loadout.medical[id] ?? 0) * WEIGHT[id];
  }
  return Math.round(w * 100) / 100;
}

export function validateLoadout(loadout: Loadout): LoadoutValidation {
  const errors: string[] = [];

  if (loadout.weapons.length === 0) errors.push('A loadout needs at least one weapon.');

  const seen = new Set<WeaponId>();
  let firearms = 0;
  let melee = 0;
  for (const id of loadout.weapons) {
    if (!WEAPONS[id]) {
      errors.push(`Unknown weapon: ${id}`);
      continue;
    }
    if (seen.has(id)) errors.push(`Duplicate weapon: ${id}`);
    seen.add(id);
    if (WEAPONS[id].kind === 'melee') melee++;
    else firearms++;
  }
  if (firearms > CARRY.maxFirearms) {
    errors.push(`At most ${CARRY.maxFirearms} firearms may be carried.`);
  }
  if (melee > CARRY.maxMelee) {
    errors.push(`At most ${CARRY.maxMelee} melee weapon may be carried.`);
  }

  for (const id of Object.keys(loadout.reserves) as WeaponId[]) {
    const amount = loadout.reserves[id] ?? 0;
    if (!seen.has(id)) {
      errors.push(`Reserve ammunition for a weapon that is not carried: ${id}`);
      continue;
    }
    if (!usesAmmo(WEAPONS[id])) {
      if (amount > 0) errors.push(`${WEAPONS[id].name} does not take ammunition.`);
      continue;
    }
    if (amount < 0) errors.push(`Negative reserve for ${id}.`);
    if (amount > WEAPONS[id].maxReserve) {
      errors.push(`Reserve for ${id} exceeds the ${WEAPONS[id].maxReserve}-round maximum.`);
    }
  }

  let medicalTotal = 0;
  for (const id of Object.keys(loadout.medical) as MedicalId[]) {
    const count = loadout.medical[id] ?? 0;
    if (!MEDICAL[id]) {
      errors.push(`Unknown medical item: ${id}`);
      continue;
    }
    if (count < 0) errors.push(`Negative quantity for ${id}.`);
    if (count > MEDICAL[id].stackLimit) {
      errors.push(`${MEDICAL[id].name} stack limit is ${MEDICAL[id].stackLimit}.`);
    }
    medicalTotal += count;
  }
  if (medicalTotal > CARRY.maxMedicalItems) {
    errors.push(`At most ${CARRY.maxMedicalItems} medical items may be carried.`);
  }

  const weight = loadoutWeight(loadout);
  if (weight > CARRY.maxWeight) {
    errors.push(`Loadout weighs ${weight}, over the ${CARRY.maxWeight} carry limit.`);
  }

  return { valid: errors.length === 0, errors, weight };
}

export function defaultLoadout(): Loadout {
  return {
    weapons: ['pistol', 'rifle', 'shotgun', 'machete'],
    reserves: { pistol: 75, rifle: 150, shotgun: 24 },
    medical: { bandage: 3, medkit: 1 },
  };
}
