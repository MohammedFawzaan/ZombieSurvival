import type { AmmoType, WeaponId } from '../state/types';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  ammo: AmmoType;

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
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'M9 Pistol',
    ammo: '9mm',
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
};

export const WEAPON_ORDER: readonly WeaponId[] = ['pistol', 'rifle'];

export const REGION_MULTIPLIER = {
  head: 3.4,
  torso: 1.0,
  limb: 0.65,
} as const;
