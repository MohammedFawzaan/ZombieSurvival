import { PurchaseResult } from '../state/types';
import type { HitRegion } from '../state/types';

export interface PointsTable {
  startingPoints: number;
  perDamageHit: number;
  damagePerPoint: number;
  maxPerHit: number;
  kill: number;
  headshotKillBonus: number;
  headshotHitBonus: number;
  meleeKillBonus: number;
  roundClearBase: number;
  roundClearPerRound: number;
  reviveFloor: number;
}

export const POINTS: PointsTable = {
  startingPoints: 500,
  perDamageHit: 10,
  damagePerPoint: 12,
  maxPerHit: 60,
  kill: 60,
  headshotKillBonus: 40,
  headshotHitBonus: 5,
  meleeKillBonus: 70,
  roundClearBase: 60,
  roundClearPerRound: 15,
  reviveFloor: 0,
};

export interface SpendOutcome {
  result: PurchaseResult;
  cost: number;
  balance: number;
}

export interface AwardBreakdown {
  hits: number;
  kills: number;
  headshots: number;
  roundBonuses: number;
}

export function hitAward(damage: number, region: HitRegion, table: PointsTable = POINTS): number {
  if (damage <= 0) return 0;
  const scaled = table.perDamageHit + Math.floor(damage / table.damagePerPoint) * 5;
  const bonus = region === 'head' ? table.headshotHitBonus : 0;
  return Math.min(table.maxPerHit, scaled + bonus);
}

export function killAward(
  region: HitRegion,
  melee: boolean,
  table: PointsTable = POINTS,
): number {
  let value = table.kill;
  if (region === 'head') value += table.headshotKillBonus;
  if (melee) value += table.meleeKillBonus;
  return value;
}

export function roundClearAward(round: number, table: PointsTable = POINTS): number {
  return table.roundClearBase + table.roundClearPerRound * Math.max(0, round - 1);
}

export class PointsEconomy {
  private readonly table: PointsTable;

  points: number;
  earned = 0;
  spent = 0;

  readonly breakdown: AwardBreakdown = { hits: 0, kills: 0, headshots: 0, roundBonuses: 0 };

  lastAward = 0;
  lastAwardLife = 0;

  onChange: ((points: number, delta: number) => void) | null = null;

  private readonly outcome: SpendOutcome = { result: PurchaseResult.Ok, cost: 0, balance: 0 };

  constructor(table: PointsTable = POINTS) {
    this.table = table;
    this.points = table.startingPoints;
  }

  get definitions(): PointsTable {
    return this.table;
  }

  reset(): void {
    this.points = this.table.startingPoints;
    this.earned = 0;
    this.spent = 0;
    this.breakdown.hits = 0;
    this.breakdown.kills = 0;
    this.breakdown.headshots = 0;
    this.breakdown.roundBonuses = 0;
    this.lastAward = 0;
    this.lastAwardLife = 0;
  }

  private grant(amount: number): number {
    if (amount <= 0) return 0;
    this.points += amount;
    this.earned += amount;
    this.lastAward = amount;
    this.lastAwardLife = 1.6;
    this.onChange?.(this.points, amount);
    return amount;
  }

  awardHit(damage: number, region: HitRegion): number {
    const amount = hitAward(damage, region, this.table);
    this.breakdown.hits += amount;
    if (region === 'head') this.breakdown.headshots += 1;
    return this.grant(amount);
  }

  awardKill(region: HitRegion, melee: boolean): number {
    const amount = killAward(region, melee, this.table);
    this.breakdown.kills += amount;
    return this.grant(amount);
  }

  awardRoundClear(round: number): number {
    const amount = roundClearAward(round, this.table);
    this.breakdown.roundBonuses += amount;
    return this.grant(amount);
  }

  canAfford(cost: number): boolean {
    return this.points >= cost;
  }

  spend(cost: number): SpendOutcome {
    const o = this.outcome;
    o.cost = cost;
    if (cost < 0) {
      o.result = PurchaseResult.Unavailable;
      o.balance = this.points;
      return o;
    }
    if (this.points < cost) {
      o.result = PurchaseResult.Insufficient;
      o.balance = this.points;
      return o;
    }
    this.points -= cost;
    this.spent += cost;
    o.result = PurchaseResult.Ok;
    o.balance = this.points;
    this.onChange?.(this.points, -cost);
    return o;
  }

  refund(cost: number): void {
    if (cost <= 0) return;
    this.points += cost;
    this.spent = Math.max(0, this.spent - cost);
    this.onChange?.(this.points, cost);
  }

  tick(dt: number): void {
    if (this.lastAwardLife > 0) {
      this.lastAwardLife = Math.max(0, this.lastAwardLife - dt);
      if (this.lastAwardLife === 0) this.lastAward = 0;
    }
  }
}
