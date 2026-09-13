export type ZombieKind = 'walker' | 'runner' | 'brute';

export interface ZombieDef {
  kind: ZombieKind;
  health: number;
  walkSpeed: number;
  chaseSpeed: number;
  accel: number;
  turnRate: number;
  attackDamage: number;
  attackRange: number;
  attackWindup: number;
  attackCooldown: number;
  viewDistance: number;
  viewAngleDeg: number;
  hearingMultiplier: number;
  scale: number;
  radius: number;
  height: number;
  staggerResist: number;
  weight: number;
  tint: number;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  walker: {
    kind: 'walker',
    health: 100,
    walkSpeed: 1.05,
    chaseSpeed: 3.5,
    accel: 6.5,
    turnRate: 2.6,
    attackDamage: 13,
    attackRange: 1.65,
    attackWindup: 0.42,
    attackCooldown: 1.25,
    viewDistance: 42,
    viewAngleDeg: 122,
    hearingMultiplier: 1,
    scale: 1,
    radius: 0.36,
    height: 1.82,
    staggerResist: 0.35,
    weight: 0.66,
    tint: 0x7f8a6a,
  },
  runner: {
    kind: 'runner',
    health: 68,
    walkSpeed: 1.5,
    chaseSpeed: 5.6,
    accel: 11,
    turnRate: 4.2,
    attackDamage: 9,
    attackRange: 1.55,
    attackWindup: 0.28,
    attackCooldown: 0.85,
    viewDistance: 50,
    viewAngleDeg: 138,
    hearingMultiplier: 1.25,
    scale: 0.94,
    radius: 0.32,
    height: 1.74,
    staggerResist: 0.2,
    weight: 0.24,
    tint: 0x8d7d5c,
  },
  brute: {
    kind: 'brute',
    health: 235,
    walkSpeed: 0.8,
    chaseSpeed: 2.85,
    accel: 4.2,
    turnRate: 1.7,
    attackDamage: 26,
    attackRange: 1.95,
    attackWindup: 0.62,
    attackCooldown: 1.75,
    viewDistance: 36,
    viewAngleDeg: 108,
    hearingMultiplier: 0.85,
    scale: 1.18,
    radius: 0.46,
    height: 2.06,
    staggerResist: 0.75,
    weight: 0.1,
    tint: 0x6b7358,
  },
};

export const ZOMBIE_KINDS: readonly ZombieKind[] = ['walker', 'runner', 'brute'];

export function pickZombieKind(rand: number): ZombieKind {
  let acc = 0;
  for (const kind of ZOMBIE_KINDS) {
    acc += ZOMBIES[kind].weight;
    if (rand <= acc) return kind;
  }
  return 'walker';
}
