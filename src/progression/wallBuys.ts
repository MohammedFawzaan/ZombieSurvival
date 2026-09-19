import type { MapConfig, WallWeaponDef } from '../maps/mapTypes';
import { PurchaseResult, type WeaponId } from '../state/types';
import type { Inventory } from '../inventory/inventory';
import type { PointsEconomy } from '../economy/points';
import { WEAPONS, usesAmmo } from '../weapons/definitions';

export interface WallBuyResult {
  result: PurchaseResult;
  wallId: string;
  weapon: WeaponId;
  cost: number;
  granted: number;
  newWeapon: boolean;
}

export interface WallBuyHooks {
  grantWeapon(id: WeaponId): boolean;
}

export const AMMO_REFILL_FRACTION = 1;

export class WallBuySystem {
  private readonly walls = new Map<string, WallWeaponDef>();

  hooks: WallBuyHooks | null = null;

  onWeaponPurchased: ((def: WallWeaponDef) => void) | null = null;
  onAmmoPurchased: ((def: WallWeaponDef, rounds: number) => void) | null = null;

  private readonly outcome: WallBuyResult = {
    result: PurchaseResult.Ok,
    wallId: '',
    weapon: 'pistol',
    cost: 0,
    granted: 0,
    newWeapon: false,
  };

  load(map: MapConfig): void {
    this.walls.clear();
    for (const w of map.wallWeapons) this.walls.set(w.id, w);
  }

  definition(wallId: string): WallWeaponDef | null {
    return this.walls.get(wallId) ?? null;
  }

  ammoRefillRounds(weapon: WeaponId): number {
    const def = WEAPONS[weapon];
    if (!def || !usesAmmo(def)) return 0;
    return Math.round(def.maxReserve * AMMO_REFILL_FRACTION);
  }

  weaponAvailability(wallId: string, inventory: Inventory): PurchaseResult {
    const def = this.walls.get(wallId);
    if (!def) return PurchaseResult.Unavailable;
    if (inventory.hasWeapon(def.weapon)) return PurchaseResult.AlreadyOwned;
    return PurchaseResult.Ok;
  }

  ammoAvailability(wallId: string, inventory: Inventory): PurchaseResult {
    const def = this.walls.get(wallId);
    if (!def) return PurchaseResult.Unavailable;
    const weaponDef = WEAPONS[def.weapon];
    if (!weaponDef || !usesAmmo(weaponDef)) return PurchaseResult.Unavailable;
    if (!inventory.hasWeapon(def.weapon)) return PurchaseResult.Unavailable;
    const entry = inventory.weaponEntry(def.weapon);
    if (entry && entry.reserve >= weaponDef.maxReserve) return PurchaseResult.Full;
    return PurchaseResult.Ok;
  }

  purchaseWeapon(wallId: string, economy: PointsEconomy, inventory: Inventory): WallBuyResult {
    const o = this.outcome;
    const def = this.walls.get(wallId);
    o.wallId = wallId;
    o.weapon = def?.weapon ?? 'pistol';
    o.cost = def?.cost ?? 0;
    o.granted = 0;
    o.newWeapon = false;

    const available = this.weaponAvailability(wallId, inventory);
    if (available !== PurchaseResult.Ok || !def) {
      o.result = available;
      return o;
    }
    if (!economy.canAfford(def.cost)) {
      o.result = PurchaseResult.Insufficient;
      return o;
    }
    if (!this.hooks?.grantWeapon(def.weapon)) {
      o.result = PurchaseResult.Unavailable;
      return o;
    }
    economy.spend(def.cost);
    o.result = PurchaseResult.Ok;
    o.newWeapon = true;
    o.granted = 1;
    this.onWeaponPurchased?.(def);
    return o;
  }

  purchaseAmmo(wallId: string, economy: PointsEconomy, inventory: Inventory): WallBuyResult {
    const o = this.outcome;
    const def = this.walls.get(wallId);
    o.wallId = wallId;
    o.weapon = def?.weapon ?? 'pistol';
    o.cost = def?.ammoCost ?? 0;
    o.granted = 0;
    o.newWeapon = false;

    const available = this.ammoAvailability(wallId, inventory);
    if (available !== PurchaseResult.Ok || !def) {
      o.result = available;
      return o;
    }
    if (!economy.canAfford(def.ammoCost)) {
      o.result = PurchaseResult.Insufficient;
      return o;
    }
    const weaponDef = WEAPONS[def.weapon];
    const granted = inventory.addAmmo(weaponDef.ammo, this.ammoRefillRounds(def.weapon));
    if (granted <= 0) {
      o.result = PurchaseResult.Full;
      return o;
    }
    economy.spend(def.ammoCost);
    o.result = PurchaseResult.Ok;
    o.granted = granted;
    this.onAmmoPurchased?.(def, granted);
    return o;
  }
}
