import type { BarrierDef, MapConfig, ZoneId } from '../maps/mapTypes';
import { PurchaseResult } from '../state/types';
import type { PointsEconomy } from '../economy/points';
import type { PowerSystem } from './power';

export interface BarrierPurchase {
  result: PurchaseResult;
  barrierId: string;
  cost: number;
  unlockedZone: ZoneId | null;
  requiresCollisionUpdate: boolean;
}

export class BarrierSystem {
  private readonly barriers = new Map<string, BarrierDef>();
  private readonly openedIds = new Set<string>();
  private readonly unlocked = new Set<ZoneId>();

  onBarrierOpened: ((def: BarrierDef) => void) | null = null;
  onZoneUnlocked: ((zone: ZoneId) => void) | null = null;

  private readonly outcome: BarrierPurchase = {
    result: PurchaseResult.Ok,
    barrierId: '',
    cost: 0,
    unlockedZone: null,
    requiresCollisionUpdate: false,
  };

  constructor(private readonly power: PowerSystem) {}

  load(map: MapConfig): void {
    this.barriers.clear();
    this.openedIds.clear();
    this.unlocked.clear();
    for (const b of map.barriers) this.barriers.set(b.id, b);
    for (const z of map.zones) if (z.unlockedAtStart) this.unlocked.add(z.id);
  }

  reset(map: MapConfig): void {
    this.load(map);
  }

  get unlockedZones(): ReadonlySet<ZoneId> {
    return this.unlocked;
  }

  get openedBarriers(): ReadonlySet<string> {
    return this.openedIds;
  }

  get openedCount(): number {
    return this.openedIds.size;
  }

  isZoneUnlocked(zone: ZoneId): boolean {
    return this.unlocked.has(zone);
  }

  isOpen(barrierId: string): boolean {
    return this.openedIds.has(barrierId);
  }

  definition(barrierId: string): BarrierDef | null {
    return this.barriers.get(barrierId) ?? null;
  }

  availability(barrierId: string): PurchaseResult {
    const def = this.barriers.get(barrierId);
    if (!def) return PurchaseResult.Unavailable;
    if (this.openedIds.has(barrierId)) return PurchaseResult.AlreadyOwned;
    if (def.requiresPower && !this.power.on) return PurchaseResult.NeedsPower;
    return PurchaseResult.Ok;
  }

  purchase(barrierId: string, economy: PointsEconomy): BarrierPurchase {
    const o = this.outcome;
    o.barrierId = barrierId;
    o.unlockedZone = null;
    o.requiresCollisionUpdate = false;
    const def = this.barriers.get(barrierId);
    o.cost = def?.cost ?? 0;

    const available = this.availability(barrierId);
    if (available !== PurchaseResult.Ok || !def) {
      o.result = available;
      return o;
    }

    if (!economy.canAfford(def.cost)) {
      o.result = PurchaseResult.Insufficient;
      return o;
    }

    const spend = economy.spend(def.cost);
    if (spend.result !== PurchaseResult.Ok) {
      o.result = spend.result;
      return o;
    }

    this.openedIds.add(barrierId);
    const newZone = !this.unlocked.has(def.unlocksZone);
    this.unlocked.add(def.unlocksZone);
    o.result = PurchaseResult.Ok;
    o.unlockedZone = def.unlocksZone;
    o.requiresCollisionUpdate = true;
    this.onBarrierOpened?.(def);
    if (newZone) this.onZoneUnlocked?.(def.unlocksZone);
    return o;
  }
}
