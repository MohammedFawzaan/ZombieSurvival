import type { RewardEntry } from '../maps/mapTypes';
import type { Inventory } from '../inventory/inventory';
import { PurchaseResult } from '../state/types';
import type { PointsEconomy } from '../economy/points';
import type { PowerSystem } from '../progression/power';
import { WEAPONS } from '../weapons/definitions';
import { makeRng } from '../util/math';

export const DEFAULT_REWARD_TABLE: readonly RewardEntry[] = [
  { kind: 'weapon', weapon: 'rifle', weight: 14, label: 'AR-15 Rifle' },
  { kind: 'weapon', weapon: 'shotgun', weight: 14, label: 'M590 Shotgun' },
  { kind: 'weapon', weapon: 'machete', weight: 10, label: 'Machete' },
  { kind: 'weapon', weapon: 'pistol', weight: 6, label: 'M9 Pistol' },
  { kind: 'ammo', ammo: '556', rounds: 120, weight: 16, label: 'Rifle Ammo Cache' },
  { kind: 'ammo', ammo: '9mm', rounds: 90, weight: 14, label: 'Pistol Ammo Cache' },
  { kind: 'ammo', ammo: '12g', rounds: 36, weight: 12, label: 'Buckshot Cache' },
  { kind: 'medical', medical: 'bandage', count: 4, weight: 10, label: 'Bandage Bundle' },
  { kind: 'medical', medical: 'medkit', count: 2, weight: 6, label: 'Field Medkit' },
];

export interface RewardGrant {
  result: PurchaseResult;
  entry: RewardEntry | null;
  label: string;
  cost: number;
  granted: number;
  newWeapon: boolean;
  rollIndex: number;
}

export interface RewardSystemConfig {
  seed?: number;
  table?: readonly RewardEntry[];
  weaponFallbackRounds?: number;
}

export class RewardSystem {
  private table: readonly RewardEntry[];
  private rng: () => number;
  private seed: number;
  private readonly weaponFallbackRounds: number;

  rolls = 0;

  onRewardGranted: ((grant: RewardGrant) => void) | null = null;

  private readonly grant: RewardGrant = {
    result: PurchaseResult.Ok,
    entry: null,
    label: '',
    cost: 0,
    granted: 0,
    newWeapon: false,
    rollIndex: 0,
  };

  constructor(
    private readonly power: PowerSystem,
    config: RewardSystemConfig = {},
  ) {
    this.seed = config.seed ?? 20240115;
    this.table = config.table ?? DEFAULT_REWARD_TABLE;
    this.weaponFallbackRounds = config.weaponFallbackRounds ?? 60;
    this.rng = makeRng(this.seed);
  }

  setTable(table: readonly RewardEntry[]): void {
    this.table = table;
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.rolls = 0;
  }

  reset(): void {
    this.rng = makeRng(this.seed);
    this.rolls = 0;
  }

  get entries(): readonly RewardEntry[] {
    return this.table;
  }

  peek(roll: number): RewardEntry | null {
    let total = 0;
    for (const e of this.table) total += e.weight;
    if (total <= 0) return null;
    let acc = roll * total;
    for (const e of this.table) {
      acc -= e.weight;
      if (acc <= 0) return e;
    }
    return this.table[this.table.length - 1] ?? null;
  }

  availability(cost: number, economy: PointsEconomy, requiresPower: boolean): PurchaseResult {
    if (requiresPower && !this.power.on) return PurchaseResult.NeedsPower;
    if (this.table.length === 0) return PurchaseResult.Unavailable;
    if (!economy.canAfford(cost)) return PurchaseResult.Insufficient;
    return PurchaseResult.Ok;
  }

  purchase(
    cost: number,
    economy: PointsEconomy,
    inventory: Inventory,
    requiresPower = true,
  ): RewardGrant {
    const g = this.grant;
    g.cost = cost;
    g.entry = null;
    g.label = '';
    g.granted = 0;
    g.newWeapon = false;

    const available = this.availability(cost, economy, requiresPower);
    if (available !== PurchaseResult.Ok) {
      g.result = available;
      return g;
    }
    const spend = economy.spend(cost);
    if (spend.result !== PurchaseResult.Ok) {
      g.result = spend.result;
      return g;
    }

    const entry = this.peek(this.rng());
    this.rolls++;
    g.rollIndex = this.rolls;
    g.entry = entry;
    if (!entry) {
      g.result = PurchaseResult.Unavailable;
      economy.refund(cost);
      return g;
    }

    g.label = entry.label;
    g.result = PurchaseResult.Ok;

    if (entry.kind === 'weapon' && entry.weapon) {
      const def = WEAPONS[entry.weapon];
      if (inventory.hasWeapon(entry.weapon)) {
        g.granted = def.ammo === 'none' ? 0 : inventory.addAmmo(def.ammo, this.weaponFallbackRounds);
        g.label = `${entry.label} — Ammo`;
      } else {
        g.newWeapon = true;
        g.granted = 1;
      }
    } else if (entry.kind === 'ammo' && entry.ammo) {
      g.granted = inventory.addAmmo(entry.ammo, entry.rounds ?? 0);
    } else if (entry.kind === 'medical' && entry.medical) {
      g.granted = inventory.addMedical(entry.medical, entry.count ?? 1);
    }

    this.onRewardGranted?.(g);
    return g;
  }
}
