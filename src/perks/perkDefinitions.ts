import type { PerkId } from '../maps/mapTypes';

export interface PerkEffects {
  maxHealthBonus: number;
  reloadTimeMultiplier: number;
  staminaMaxMultiplier: number;
  staminaRegenMultiplier: number;
  staminaDrainMultiplier: number;
  healSpeedMultiplier: number;
  healAmountMultiplier: number;
  downedSaveCharges: number;
  downedSaveHealth: number;
  meleeStaminaMultiplier: number;
}

export interface PerkDef {
  id: PerkId;
  name: string;
  short: string;
  tagline: string;
  description: string;
  defaultCost: number;
  color: number;
  effects: Partial<PerkEffects>;
}

export const NEUTRAL_EFFECTS: PerkEffects = {
  maxHealthBonus: 0,
  reloadTimeMultiplier: 1,
  staminaMaxMultiplier: 1,
  staminaRegenMultiplier: 1,
  staminaDrainMultiplier: 1,
  healSpeedMultiplier: 1,
  healAmountMultiplier: 1,
  downedSaveCharges: 0,
  downedSaveHealth: 0,
  meleeStaminaMultiplier: 1,
};

export const PERKS: Record<PerkId, PerkDef> = {
  vitality: {
    id: 'vitality',
    name: 'Vitality Serum',
    short: 'VIT',
    tagline: 'Thicker skin, longer nights.',
    description: 'Raises maximum health by 75 and tops you off when installed.',
    defaultCost: 2500,
    color: 0xd14b4b,
    effects: { maxHealthBonus: 75 },
  },
  steadyhands: {
    id: 'steadyhands',
    name: 'Steady Hands',
    short: 'STD',
    tagline: 'No fumbling under pressure.',
    description: 'Cuts reload time by 40 percent on every weapon.',
    defaultCost: 3000,
    color: 0xd9b23c,
    effects: { reloadTimeMultiplier: 0.6 },
  },
  secondwind: {
    id: 'secondwind',
    name: 'Second Wind',
    short: 'SWD',
    tagline: 'Run the block twice.',
    description: 'More stamina, faster recovery, cheaper sprinting and swings.',
    defaultCost: 2000,
    color: 0x4ba6d1,
    effects: {
      staminaMaxMultiplier: 1.35,
      staminaRegenMultiplier: 1.55,
      staminaDrainMultiplier: 0.72,
      meleeStaminaMultiplier: 0.7,
    },
  },
  fieldmedic: {
    id: 'fieldmedic',
    name: 'Field Medic',
    short: 'MED',
    tagline: 'Patch fast, move faster.',
    description: 'Halves bandage and medkit use time and heals 35 percent more.',
    defaultCost: 2750,
    color: 0x5fbf6a,
    effects: { healSpeedMultiplier: 0.5, healAmountMultiplier: 1.35 },
  },
};

export const PERK_ORDER: readonly PerkId[] = ['vitality', 'steadyhands', 'secondwind', 'fieldmedic'];

export const MAX_PERKS = 4;

export function isPerkId(value: string): value is PerkId {
  return value in PERKS;
}
