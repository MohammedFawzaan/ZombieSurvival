import type { AmmoType, WeaponClass, WeaponId } from '../state/types';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  ammo: AmmoType;
  kind: WeaponClass;

  damage: number;

  rpm: number;
  automatic: boolean;
  magazineSize: number;
  startingReserve: number;
  maxReserve: number;
  reloadTime: number;

  range: number;
  falloffStart: number;

  falloffMin: number;

  spreadHip: number;
  spreadAim: number;

  spreadPerShot: number;
  spreadRecovery: number;
  spreadMax: number;

  recoilPitch: number;
  recoilYaw: number;
  recoilRecovery: number;

  kickBack: number;
  muzzleFlashScale: number;

  noiseRadius: number;
  penetration: number;

  pellets?: number;
  pelletCone?: number;
  pelletConeAim?: number;

  meleeWindup?: number;
  meleeActive?: number;
  meleeRecovery?: number;
  meleeArc?: number;
  meleeStamina?: number;
  meleeStagger?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'M9 Pistol',
    ammo: '9mm',
    kind: 'hitscan',
    damage: 34,
    rpm: 300,
    automatic: false,
    magazineSize: 15,
    startingReserve: 75,
    maxReserve: 150,
    reloadTime: 1.55,
    range: 90,
    falloffStart: 28,
    falloffMin: 0.55,
    spreadHip: 0.016,
    spreadAim: 0.0045,
    spreadPerShot: 0.006,
    spreadRecovery: 0.05,
    spreadMax: 0.055,
    recoilPitch: 0.017,
    recoilYaw: 0.005,
    recoilRecovery: 9,
    kickBack: 0.05,
    muzzleFlashScale: 0.85,
    noiseRadius: 62,
    penetration: 1,
  },
  rifle: {
    id: 'rifle',
    name: 'AR-15 Rifle',
    ammo: '556',
    kind: 'hitscan',
    damage: 27,
    rpm: 720,
    automatic: true,
    magazineSize: 30,
    startingReserve: 150,
    maxReserve: 300,
    reloadTime: 2.35,
    range: 180,
    falloffStart: 65,
    falloffMin: 0.6,
    spreadHip: 0.026,
    spreadAim: 0.0035,
    spreadPerShot: 0.0042,
    spreadRecovery: 0.075,
    spreadMax: 0.07,
    recoilPitch: 0.0115,
    recoilYaw: 0.0038,
    recoilRecovery: 11,
    kickBack: 0.035,
    muzzleFlashScale: 1.15,
    noiseRadius: 95,
    penetration: 2,
  },
  shotgun: {
    id: 'shotgun',
    name: 'M590 Shotgun',
    ammo: '12g',
    kind: 'pellet',
    damage: 13,
    rpm: 75,
    automatic: false,
    magazineSize: 6,
    startingReserve: 24,
    maxReserve: 60,
    reloadTime: 3.1,
    range: 60,
    falloffStart: 9,
    falloffMin: 0.22,
    spreadHip: 0.012,
    spreadAim: 0.006,
    spreadPerShot: 0.01,
    spreadRecovery: 0.09,
    spreadMax: 0.05,
    recoilPitch: 0.052,
    recoilYaw: 0.011,
    recoilRecovery: 7,
    kickBack: 0.12,
    muzzleFlashScale: 1.6,
    noiseRadius: 135,
    penetration: 1,
    pellets: 9,
    pelletCone: 0.085,
    pelletConeAim: 0.62,
  },
  machete: {
    id: 'machete',
    name: 'Machete',
    ammo: 'none',
    kind: 'melee',
    damage: 58,
    rpm: 80,
    automatic: true,
    magazineSize: 0,
    startingReserve: 0,
    maxReserve: 0,
    reloadTime: 0,
    range: 2.3,
    falloffStart: 2.3,
    falloffMin: 1,
    spreadHip: 0,
    spreadAim: 0,
    spreadPerShot: 0,
    spreadRecovery: 0,
    spreadMax: 0,
    recoilPitch: 0.006,
    recoilYaw: 0.003,
    recoilRecovery: 12,
    kickBack: 0.06,
    muzzleFlashScale: 0,
    noiseRadius: 14,
    penetration: 1,
    meleeWindup: 0.12,
    meleeActive: 0.1,
    meleeRecovery: 0.36,
    meleeArc: 0.45,
    meleeStamina: 9,
    meleeStagger: 0.75,
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = ['pistol', 'rifle', 'shotgun', 'machete'];

export function usesAmmo(def: WeaponDef): boolean {
  return def.ammo !== 'none' && def.magazineSize > 0;
}

export function meleeSwingDuration(def: WeaponDef): number {
  return (def.meleeWindup ?? 0) + (def.meleeActive ?? 0) + (def.meleeRecovery ?? 0);
}

export const REGION_MULTIPLIER = {
  head: 3.4,
  torso: 1.0,
  limb: 0.65,
} as const;
