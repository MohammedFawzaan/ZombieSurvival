import type { WeaponId, MedicalId, AmmoType } from '../state/types';

export type MapId = 'forest' | 'city';

export type ZoneId = string;

export interface MapVec2 {
  x: number;
  z: number;
}

export interface SpawnZoneDef {
  id: string;
  zone: ZoneId;
  x: number;
  z: number;
  radius: number;
  weight: number;
}

export interface ZoneDef {
  id: ZoneId;
  name: string;
  unlockedAtStart: boolean;
}

export interface BarrierDef {
  id: string;
  name: string;
  zone: ZoneId;
  unlocksZone: ZoneId;
  cost: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  height: number;
  thickness: number;
  requiresPower: boolean;
}

export interface WallWeaponDef {
  id: string;
  weapon: WeaponId;
  zone: ZoneId;
  cost: number;
  ammoCost: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PerkMachineDef {
  id: string;
  perk: PerkId;
  zone: ZoneId;
  cost: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PowerSwitchDef {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface RewardMachineDef {
  id: string;
  zone: ZoneId;
  cost: number;
  requiresPower: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export type PerkId = 'vitality' | 'steadyhands' | 'secondwind' | 'fieldmedic';

export interface MapConfig {
  id: MapId;
  name: string;
  description: string;
  roundBased: boolean;
  playerSpawn: { x: number; y: number; z: number; yaw: number };
  zones: ZoneDef[];
  spawnZones: SpawnZoneDef[];
  barriers: BarrierDef[];
  wallWeapons: WallWeaponDef[];
  perkMachines: PerkMachineDef[];
  powerSwitch: PowerSwitchDef | null;
  rewardMachines: RewardMachineDef[];
}

export interface RewardEntry {
  kind: 'weapon' | 'ammo' | 'medical';
  weapon?: WeaponId;
  ammo?: AmmoType;
  rounds?: number;
  medical?: MedicalId;
  count?: number;
  weight: number;
  label: string;
}
