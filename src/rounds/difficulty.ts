import type { ZombieKind } from '../zombies/zombieTypes';

export interface RoundComposition {
  walker: number;
  runner: number;
  brute: number;
}

export interface RoundPlan {
  round: number;
  totalZombies: number;
  maxAlive: number;
  spawnInterval: number;
  healthMultiplier: number;
  speedMultiplier: number;
  composition: RoundComposition;
  special: boolean;
  label: string;
}

export interface DifficultyCurve {
  baseZombies: number;
  zombiesPerRound: number;
  zombiesQuadratic: number;
  maxTotalZombies: number;

  baseMaxAlive: number;
  maxAlivePerRound: number;
  hardMaxAlive: number;

  baseSpawnInterval: number;
  spawnIntervalDecay: number;
  minSpawnInterval: number;

  healthPerRound: number;
  healthMultiplierCap: number;
  healthRampStartRound: number;

  speedPerRound: number;
  speedMultiplierCap: number;

  runnerStartRound: number;
  runnerRampRounds: number;
  runnerMaxShare: number;

  bruteStartRound: number;
  bruteRampRounds: number;
  bruteMaxShare: number;

  specialInterval: number;
  specialFirstRound: number;
  specialAliveBonus: number;
  specialIntervalScale: number;
  specialCountScale: number;
}

export const DEFAULT_CURVE: DifficultyCurve = {
  baseZombies: 18,
  zombiesPerRound: 7.8,
  zombiesQuadratic: 1.14,
  maxTotalZombies: 360,

  baseMaxAlive: 24,
  maxAlivePerRound: 3.45,
  hardMaxAlive: 78,

  baseSpawnInterval: 1.9,
  spawnIntervalDecay: 0.88,
  minSpawnInterval: 0.34,

  healthPerRound: 0.055,
  healthMultiplierCap: 2.1,
  healthRampStartRound: 4,

  speedPerRound: 0.012,
  speedMultiplierCap: 1.25,

  runnerStartRound: 4,
  runnerRampRounds: 9,
  runnerMaxShare: 0.46,

  bruteStartRound: 8,
  bruteRampRounds: 12,
  bruteMaxShare: 0.2,

  specialInterval: 5,
  specialFirstRound: 10,
  specialAliveBonus: 5,
  specialIntervalScale: 0.68,
  specialCountScale: 1.22,
};

export function isSpecialRound(round: number, curve: DifficultyCurve = DEFAULT_CURVE): boolean {
  if (round < curve.specialFirstRound) return false;
  return (round - curve.specialFirstRound) % curve.specialInterval === 0;
}

function rampShare(round: number, start: number, rampRounds: number, maxShare: number): number {
  if (round < start) return 0;
  const t = Math.min(1, (round - start + 1) / rampRounds);
  return maxShare * t;
}

export function compositionFor(
  round: number,
  curve: DifficultyCurve = DEFAULT_CURVE,
): RoundComposition {
  let runner = rampShare(round, curve.runnerStartRound, curve.runnerRampRounds, curve.runnerMaxShare);
  let brute = rampShare(round, curve.bruteStartRound, curve.bruteRampRounds, curve.bruteMaxShare);
  if (isSpecialRound(round, curve)) {
    runner = Math.min(0.85, runner * 1.5 + 0.12);
    brute = Math.min(0.3, brute * 1.15);
  }
  const shared = runner + brute;
  if (shared > 0.94) {
    const scale = 0.94 / shared;
    runner *= scale;
    brute *= scale;
  }
  const walker = Math.max(0, 1 - runner - brute);
  return { walker, runner, brute };
}

export function totalZombiesFor(round: number, curve: DifficultyCurve = DEFAULT_CURVE): number {
  const r = round - 1;
  const raw = curve.baseZombies + curve.zombiesPerRound * r + curve.zombiesQuadratic * r * r;
  const scaled = isSpecialRound(round, curve) ? raw * curve.specialCountScale : raw;
  return Math.min(curve.maxTotalZombies, Math.round(scaled));
}

export function maxAliveFor(round: number, curve: DifficultyCurve = DEFAULT_CURVE): number {
  const bonus = isSpecialRound(round, curve) ? curve.specialAliveBonus : 0;
  const raw = curve.baseMaxAlive + curve.maxAlivePerRound * (round - 1) + bonus;
  return Math.min(curve.hardMaxAlive + bonus, Math.round(raw));
}

export function spawnIntervalFor(round: number, curve: DifficultyCurve = DEFAULT_CURVE): number {
  const raw = curve.baseSpawnInterval * Math.pow(curve.spawnIntervalDecay, round - 1);
  const scaled = isSpecialRound(round, curve) ? raw * curve.specialIntervalScale : raw;
  return Math.max(curve.minSpawnInterval, Number(scaled.toFixed(4)));
}

export function healthMultiplierFor(round: number, curve: DifficultyCurve = DEFAULT_CURVE): number {
  if (round < curve.healthRampStartRound) return 1;
  const raw = 1 + curve.healthPerRound * (round - curve.healthRampStartRound + 1);
  return Math.min(curve.healthMultiplierCap, Number(raw.toFixed(4)));
}

export function speedMultiplierFor(round: number, curve: DifficultyCurve = DEFAULT_CURVE): number {
  const raw = 1 + curve.speedPerRound * (round - 1);
  return Math.min(curve.speedMultiplierCap, Number(raw.toFixed(4)));
}

export function labelFor(round: number, curve: DifficultyCurve = DEFAULT_CURVE): string {
  if (isSpecialRound(round, curve)) return 'SURGE';
  if (round === 1) return 'FIRST CONTACT';
  return `ROUND ${round}`;
}

export function planForRound(round: number, curve: DifficultyCurve = DEFAULT_CURVE): RoundPlan {
  const clamped = Math.max(1, Math.floor(round));
  return {
    round: clamped,
    totalZombies: totalZombiesFor(clamped, curve),
    maxAlive: maxAliveFor(clamped, curve),
    spawnInterval: spawnIntervalFor(clamped, curve),
    healthMultiplier: healthMultiplierFor(clamped, curve),
    speedMultiplier: speedMultiplierFor(clamped, curve),
    composition: compositionFor(clamped, curve),
    special: isSpecialRound(clamped, curve),
    label: labelFor(clamped, curve),
  };
}

export function pickKind(composition: RoundComposition, roll: number): ZombieKind {
  const r = roll <= 0 ? 0 : roll >= 1 ? 0.999999 : roll;
  if (r < composition.brute) return 'brute';
  if (r < composition.brute + composition.runner) return 'runner';
  return 'walker';
}
