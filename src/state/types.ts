export type Vec3 = { x: number; y: number; z: number };

export const enum GamePhase {
  Loading = 'loading',
  Menu = 'menu',
  Playing = 'playing',
  Paused = 'paused',
  Dead = 'dead',
}

export const enum ZombieState {
  Idle = 'idle',
  Wandering = 'wandering',
  Detecting = 'detecting',
  Chasing = 'chasing',
  Attacking = 'attacking',
  Staggered = 'staggered',
  Dead = 'dead',
}

export const enum HitRegion {
  Head = 'head',
  Torso = 'torso',
  Limb = 'limb',
}

export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'machete';

export type AmmoType = '9mm' | '556' | '12g' | 'none';

export type WeaponClass = 'hitscan' | 'pellet' | 'melee';

export type MedicalId = 'bandage' | 'medkit';

export interface WeaponRuntime {
  id: WeaponId;
  magazine: number;
  reserve: number;
  reloading: boolean;
  reloadEndsAt: number;
}

export const enum MeleePhase {
  Idle = 'idle',
  Windup = 'windup',
  Active = 'active',
  Recovery = 'recovery',
}

export interface MeleeSnapshot {
  phase: MeleePhase;
  progress: number;
}

export interface MedicalSnapshot {
  usingId: MedicalId | null;
  usingName: string | null;
  progress: number;
  quantities: { id: MedicalId; name: string; count: number }[];
  interruptedFor: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  exhausted: boolean;
  weaponId: WeaponId;
  weaponName: string;
  magazine: number;
  magazineSize: number;
  reserve: number;
  reloading: boolean;
  usesAmmo: boolean;
  ammoType: AmmoType;
  weaponSlots: { id: WeaponId; name: string; usesAmmo: boolean; active: boolean }[];
  melee: MeleeSnapshot;
  medical: MedicalSnapshot;
  aiming: boolean;
  sprinting: boolean;
  crouching: boolean;
  kills: number;
  survivedSeconds: number;
  damageFlash: number;
  hitMarker: number;
  killMarker: number;
  lowHealth: boolean;
  interactHint: string | null;
  /** Damage directions RELATIVE to the player's facing, in radians. */
  damageDirs: { angle: number; strength: number; life: number }[];
}

export interface DebugSnapshot {
  fps: number;
  frameMs: number;
  simMs: number;
  renderMs: number;
  physicsMs: number;
  aiMs: number;
  drawCalls: number;
  triangles: number;
  playerPos: Vec3;
  playerVel: number;
  grounded: boolean;
  zombieTotal: number;
  zombieActive: number;
  zombieAlive: number;
  rendererType: string;
  backend: string;
  memoryMb: number;
  steps?: number;
  playerMs?: number;
}
