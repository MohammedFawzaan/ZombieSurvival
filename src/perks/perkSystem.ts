import type { PerkId } from '../maps/mapTypes';
import { PurchaseResult } from '../state/types';
import type { PointsEconomy } from '../economy/points';
import type { PowerSystem } from '../progression/power';
import { MAX_PERKS, NEUTRAL_EFFECTS, PERKS, PERK_ORDER, type PerkDef, type PerkEffects } from './perkDefinitions';

export interface PerkPurchase {
  result: PurchaseResult;
  perk: PerkId;
  cost: number;
  def: PerkDef | null;
}

export interface PerkBadge {
  id: string;
  name: string;
  short: string;
  color: number;
}

export class PerkSystem {
  private readonly owned = new Set<PerkId>();
  private readonly effects: PerkEffects = { ...NEUTRAL_EFFECTS };
  private readonly badges: PerkBadge[] = [];

  private downedCharges = 0;

  onPerkAcquired: ((def: PerkDef) => void) | null = null;
  onPerkLost: ((def: PerkDef) => void) | null = null;

  private readonly outcome: PerkPurchase = {
    result: PurchaseResult.Ok,
    perk: 'vitality',
    cost: 0,
    def: null,
  };

  constructor(private readonly power: PowerSystem) {}

  get count(): number {
    return this.owned.size;
  }

  get ownedPerks(): ReadonlySet<PerkId> {
    return this.owned;
  }

  has(perk: PerkId): boolean {
    return this.owned.has(perk);
  }

  reset(): void {
    this.owned.clear();
    this.downedCharges = 0;
    this.recompute();
  }

  private recompute(): void {
    const e = this.effects;
    e.maxHealthBonus = NEUTRAL_EFFECTS.maxHealthBonus;
    e.reloadTimeMultiplier = NEUTRAL_EFFECTS.reloadTimeMultiplier;
    e.staminaMaxMultiplier = NEUTRAL_EFFECTS.staminaMaxMultiplier;
    e.staminaRegenMultiplier = NEUTRAL_EFFECTS.staminaRegenMultiplier;
    e.staminaDrainMultiplier = NEUTRAL_EFFECTS.staminaDrainMultiplier;
    e.healSpeedMultiplier = NEUTRAL_EFFECTS.healSpeedMultiplier;
    e.healAmountMultiplier = NEUTRAL_EFFECTS.healAmountMultiplier;
    e.downedSaveCharges = NEUTRAL_EFFECTS.downedSaveCharges;
    e.downedSaveHealth = NEUTRAL_EFFECTS.downedSaveHealth;
    e.meleeStaminaMultiplier = NEUTRAL_EFFECTS.meleeStaminaMultiplier;

    this.badges.length = 0;
    for (const id of PERK_ORDER) {
      if (!this.owned.has(id)) continue;
      const def = PERKS[id];
      const fx = def.effects;
      if (fx.maxHealthBonus !== undefined) e.maxHealthBonus += fx.maxHealthBonus;
      if (fx.reloadTimeMultiplier !== undefined) e.reloadTimeMultiplier *= fx.reloadTimeMultiplier;
      if (fx.staminaMaxMultiplier !== undefined) e.staminaMaxMultiplier *= fx.staminaMaxMultiplier;
      if (fx.staminaRegenMultiplier !== undefined) e.staminaRegenMultiplier *= fx.staminaRegenMultiplier;
      if (fx.staminaDrainMultiplier !== undefined) e.staminaDrainMultiplier *= fx.staminaDrainMultiplier;
      if (fx.healSpeedMultiplier !== undefined) e.healSpeedMultiplier *= fx.healSpeedMultiplier;
      if (fx.healAmountMultiplier !== undefined) e.healAmountMultiplier *= fx.healAmountMultiplier;
      if (fx.downedSaveCharges !== undefined) e.downedSaveCharges += fx.downedSaveCharges;
      if (fx.downedSaveHealth !== undefined) e.downedSaveHealth = Math.max(e.downedSaveHealth, fx.downedSaveHealth);
      if (fx.meleeStaminaMultiplier !== undefined) e.meleeStaminaMultiplier *= fx.meleeStaminaMultiplier;
      this.badges.push({ id: def.id, name: def.name, short: def.short, color: def.color });
    }
  }

  get current(): Readonly<PerkEffects> {
    return this.effects;
  }

  get hudBadges(): readonly PerkBadge[] {
    return this.badges;
  }

  maxHealthFor(baseMaxHealth: number): number {
    return baseMaxHealth + this.effects.maxHealthBonus;
  }

  reloadTime(base: number): number {
    return base * this.effects.reloadTimeMultiplier;
  }

  healUseTime(base: number): number {
    return base * this.effects.healSpeedMultiplier;
  }

  healAmount(base: number): number {
    return base * this.effects.healAmountMultiplier;
  }

  staminaMax(base: number): number {
    return base * this.effects.staminaMaxMultiplier;
  }

  staminaRegen(base: number): number {
    return base * this.effects.staminaRegenMultiplier;
  }

  staminaDrain(base: number): number {
    return base * this.effects.staminaDrainMultiplier;
  }

  meleeStaminaCost(base: number): number {
    return base * this.effects.meleeStaminaMultiplier;
  }

  get downedSavesLeft(): number {
    return this.downedCharges;
  }

  consumeDownedSave(): boolean {
    if (this.downedCharges <= 0) return false;
    this.downedCharges--;
    return true;
  }

  availability(perk: PerkId, requiresPower = true): PurchaseResult {
    if (!(perk in PERKS)) return PurchaseResult.Unavailable;
    if (requiresPower && !this.power.on) return PurchaseResult.NeedsPower;
    if (this.owned.has(perk)) return PurchaseResult.AlreadyOwned;
    if (this.owned.size >= MAX_PERKS) return PurchaseResult.Full;
    return PurchaseResult.Ok;
  }

  purchase(
    perk: PerkId,
    economy: PointsEconomy,
    cost?: number,
    requiresPower = true,
  ): PerkPurchase {
    const o = this.outcome;
    o.perk = perk;
    const def = PERKS[perk] ?? null;
    o.def = def;
    o.cost = cost ?? def?.defaultCost ?? 0;

    const available = this.availability(perk, requiresPower);
    if (available !== PurchaseResult.Ok || !def) {
      o.result = available;
      return o;
    }
    if (!economy.canAfford(o.cost)) {
      o.result = PurchaseResult.Insufficient;
      return o;
    }
    const spend = economy.spend(o.cost);
    if (spend.result !== PurchaseResult.Ok) {
      o.result = spend.result;
      return o;
    }

    this.owned.add(perk);
    this.recompute();
    this.downedCharges = this.effects.downedSaveCharges;
    o.result = PurchaseResult.Ok;
    this.onPerkAcquired?.(def);
    return o;
  }

  revoke(perk: PerkId): boolean {
    if (!this.owned.delete(perk)) return false;
    this.recompute();
    this.downedCharges = Math.min(this.downedCharges, this.effects.downedSaveCharges);
    this.onPerkLost?.(PERKS[perk]);
    return true;
  }
}
