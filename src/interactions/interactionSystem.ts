import type { MapConfig } from '../maps/mapTypes';
import { InteractKind, PurchaseResult } from '../state/types';
import { WEAPONS, usesAmmo } from '../weapons/definitions';
import { PERKS } from '../perks/perkDefinitions';
import type {
  Interactable,
  InteractionInput,
  InteractionOutcome,
  InteractionPromptState,
} from './interactionTypes';

export interface InteractionHandlers {
  availability(target: Interactable): PurchaseResult;
  perform(target: Interactable, out: InteractionOutcome): void;
  isZoneUnlocked(zone: string): boolean;
}

export interface InteractionConfig {
  barrierRange?: number;
  machineRange?: number;
  barrierHold?: number;
  machineHold?: number;
  facingDot?: number;
  verticalRange?: number;
}

const DEFAULTS = {
  barrierRange: 3.2,
  machineRange: 2.6,
  barrierHold: 0.55,
  machineHold: 0,
  facingDot: 0.35,
  verticalRange: 3.2,
};

export function buildInteractables(
  map: MapConfig,
  config: InteractionConfig = {},
): Interactable[] {
  const cfg = { ...DEFAULTS, ...config };
  const list: Interactable[] = [];

  for (const b of map.barriers) {
    list.push({
      id: b.id,
      kind: InteractKind.Barrier,
      zone: b.zone,
      x: b.x,
      y: b.y,
      z: b.z,
      yaw: b.yaw,
      range: cfg.barrierRange,
      holdTime: cfg.barrierHold,
      cost: b.cost,
      label: b.name.toUpperCase(),
      requiresPower: b.requiresPower,
      unlocksZone: b.unlocksZone,
      facingLimited: false,
    });
  }

  for (const w of map.wallWeapons) {
    const def = WEAPONS[w.weapon];
    list.push({
      id: w.id,
      kind: InteractKind.WallWeapon,
      zone: w.zone,
      x: w.x,
      y: w.y,
      z: w.z,
      yaw: w.yaw,
      range: cfg.machineRange,
      holdTime: cfg.machineHold,
      cost: w.cost,
      label: def.name.toUpperCase(),
      requiresPower: false,
      weapon: w.weapon,
      facingLimited: true,
    });
    if (usesAmmo(def)) {
      list.push({
        id: `${w.id}:ammo`,
        kind: InteractKind.WallAmmo,
        zone: w.zone,
        x: w.x,
        y: w.y,
        z: w.z,
        yaw: w.yaw,
        range: cfg.machineRange,
        holdTime: cfg.machineHold,
        cost: w.ammoCost,
        label: `${def.name.toUpperCase()} AMMO`,
        requiresPower: false,
        weapon: w.weapon,
        facingLimited: true,
      });
    }
  }

  for (const p of map.perkMachines) {
    const def = PERKS[p.perk];
    list.push({
      id: p.id,
      kind: InteractKind.PerkMachine,
      zone: p.zone,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      range: cfg.machineRange,
      holdTime: cfg.machineHold,
      cost: p.cost,
      label: def ? def.name.toUpperCase() : p.perk.toUpperCase(),
      requiresPower: true,
      perk: p.perk,
      facingLimited: true,
    });
  }

  if (map.powerSwitch) {
    const s = map.powerSwitch;
    list.push({
      id: s.id,
      kind: InteractKind.PowerSwitch,
      zone: s.zone,
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      range: cfg.machineRange,
      holdTime: cfg.barrierHold,
      cost: 0,
      label: 'MAIN BREAKER',
      requiresPower: false,
      facingLimited: true,
    });
  }

  for (const r of map.rewardMachines) {
    list.push({
      id: r.id,
      kind: InteractKind.RewardMachine,
      zone: r.zone,
      x: r.x,
      y: r.y,
      z: r.z,
      yaw: r.yaw,
      range: cfg.machineRange,
      holdTime: cfg.machineHold,
      cost: r.cost,
      label: 'SUPPLY DROP',
      requiresPower: r.requiresPower,
      facingLimited: true,
    });
  }

  return list;
}

function verbFor(kind: InteractKind): string {
  switch (kind) {
    case InteractKind.Barrier:
      return 'OPEN';
    case InteractKind.WallWeapon:
      return 'BUY';
    case InteractKind.WallAmmo:
      return 'BUY';
    case InteractKind.PerkMachine:
      return 'INSTALL';
    case InteractKind.PowerSwitch:
      return 'ACTIVATE';
    case InteractKind.RewardMachine:
      return 'PULL';
  }
}

export class InteractionSystem {
  private readonly cfg: Required<InteractionConfig>;
  private interactables: Interactable[] = [];
  private handlers: InteractionHandlers | null = null;

  private holdTimer = 0;
  private heldId: string | null = null;
  private consumedPress = false;

  readonly prompt: InteractionPromptState = {
    target: null,
    prompt: null,
    availability: PurchaseResult.Unavailable,
    cost: 0,
    holdProgress: 0,
    distance: 0,
  };

  private readonly outcome: InteractionOutcome = {
    performed: false,
    kind: InteractKind.Barrier,
    id: '',
    result: PurchaseResult.Unavailable,
    cost: 0,
    message: '',
  };

  constructor(config: InteractionConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config } as Required<InteractionConfig>;
  }

  load(map: MapConfig, handlers: InteractionHandlers): void {
    this.interactables = buildInteractables(map, this.cfg);
    this.handlers = handlers;
    this.reset();
  }

  setHandlers(handlers: InteractionHandlers): void {
    this.handlers = handlers;
  }

  get all(): readonly Interactable[] {
    return this.interactables;
  }

  find(id: string): Interactable | null {
    return this.interactables.find((i) => i.id === id) ?? null;
  }

  reset(): void {
    this.holdTimer = 0;
    this.heldId = null;
    this.consumedPress = false;
    this.prompt.target = null;
    this.prompt.prompt = null;
    this.prompt.availability = PurchaseResult.Unavailable;
    this.prompt.cost = 0;
    this.prompt.holdProgress = 0;
    this.prompt.distance = 0;
  }

  private pickTarget(input: InteractionInput): Interactable | null {
    const h = this.handlers;
    if (!h) return null;
    const forwardX = -Math.sin(input.yaw);
    const forwardZ = -Math.cos(input.yaw);
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    let bestDist = 0;

    for (const item of this.interactables) {
      if (!h.isZoneUnlocked(item.zone)) continue;
      const dx = item.x - input.x;
      const dz = item.z - input.z;
      const dy = item.y - input.y;
      if (Math.abs(dy) > this.cfg.verticalRange) continue;
      const dist = Math.hypot(dx, dz);
      if (dist > item.range) continue;

      let dot = 1;
      if (dist > 0.0001) {
        dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;
        if (item.facingLimited && dot < this.cfg.facingDot) continue;
      }
      const actionable = h.availability(item) === PurchaseResult.Ok;
      const score = dot * 2 - dist / item.range + (actionable ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = item;
        bestDist = dist;
      }
    }
    this.prompt.distance = best ? bestDist : 0;
    return best;
  }

  promptFor(target: Interactable, availability: PurchaseResult): string {
    const verb = verbFor(target.kind);
    const key = target.holdTime > 0 ? 'HOLD E' : 'PRESS E';
    switch (availability) {
      case PurchaseResult.NeedsPower:
        return `${target.label} — POWER REQUIRED`;
      case PurchaseResult.AlreadyOwned:
        if (target.kind === InteractKind.PerkMachine) return `${target.label} — INSTALLED`;
        if (target.kind === InteractKind.PowerSwitch) return 'MAIN BREAKER — ONLINE';
        if (target.kind === InteractKind.WallWeapon) return `${target.label} — OWNED`;
        return `${target.label} — OPEN`;
      case PurchaseResult.Full:
        return `${target.label} — NO PERK SLOTS`;
      case PurchaseResult.Unavailable:
        return `${target.label} — UNAVAILABLE`;
      default:
        break;
    }
    if (target.cost <= 0) return `${key} — ${verb} ${target.label}`;
    const affordable = availability !== PurchaseResult.Insufficient;
    const tail = affordable ? `${target.cost}` : `${target.cost} — NEED MORE POINTS`;
    return `${key} — ${verb} ${target.label} — ${tail}`;
  }

  step(dt: number, input: InteractionInput): InteractionOutcome | null {
    const h = this.handlers;
    const p = this.prompt;
    if (!h) {
      p.target = null;
      p.prompt = null;
      return null;
    }

    const target = this.pickTarget(input);
    p.target = target;

    if (!target) {
      p.prompt = null;
      p.availability = PurchaseResult.Unavailable;
      p.cost = 0;
      p.holdProgress = 0;
      this.holdTimer = 0;
      this.heldId = null;
      if (!input.pressed) this.consumedPress = false;
      return null;
    }

    const availability = h.availability(target);
    p.availability = availability;
    p.cost = target.cost;
    p.prompt = this.promptFor(target, availability);

    if (this.heldId !== target.id) {
      this.heldId = target.id;
      this.holdTimer = 0;
    }

    if (!input.pressed) {
      this.consumedPress = false;
      this.holdTimer = 0;
      p.holdProgress = 0;
      return null;
    }

    if (this.consumedPress) {
      p.holdProgress = 0;
      return null;
    }

    if (availability !== PurchaseResult.Ok) {
      this.consumedPress = true;
      p.holdProgress = 0;
      const o = this.outcome;
      o.performed = false;
      o.kind = target.kind;
      o.id = target.id;
      o.result = availability;
      o.cost = target.cost;
      o.message = p.prompt ?? '';
      o.weapon = target.weapon;
      o.perk = target.perk;
      o.unlockedZone = undefined;
      o.rewardLabel = undefined;
      o.grantedCount = undefined;
      o.newWeapon = undefined;
      return o;
    }

    if (target.holdTime > 0) {
      this.holdTimer += dt;
      p.holdProgress = Math.min(1, this.holdTimer / target.holdTime);
      if (this.holdTimer < target.holdTime) return null;
    } else {
      p.holdProgress = 1;
    }

    this.consumedPress = true;
    this.holdTimer = 0;
    p.holdProgress = 0;

    const o = this.outcome;
    o.performed = false;
    o.kind = target.kind;
    o.id = target.id;
    o.result = PurchaseResult.Ok;
    o.cost = target.cost;
    o.message = '';
    o.weapon = target.weapon;
    o.perk = target.perk;
    o.unlockedZone = undefined;
    o.rewardLabel = undefined;
    o.grantedCount = undefined;
    o.newWeapon = undefined;

    h.perform(target, o);
    if (o.result === PurchaseResult.Ok) o.performed = true;
    if (!o.message) o.message = p.prompt ?? '';
    p.prompt = this.promptFor(target, h.availability(target));
    return o;
  }
}
