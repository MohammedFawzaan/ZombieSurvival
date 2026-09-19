import type { MapConfig, PerkId, ZoneId } from '../maps/mapTypes';
import type { Inventory } from '../inventory/inventory';
import { InteractKind, PurchaseResult, RoundPhase, type HitRegion, type WeaponId } from '../state/types';
import { PointsEconomy, POINTS, type PointsTable } from '../economy/points';
import { PowerSystem } from '../progression/power';
import { BarrierSystem } from '../progression/barriers';
import { WallBuySystem, type WallBuyHooks } from '../progression/wallBuys';
import { PerkSystem } from '../perks/perkSystem';
import { RewardSystem } from '../rewards/rewardSystem';
import { InteractionSystem, type InteractionConfig } from '../interactions/interactionSystem';
import type { Interactable, InteractionOutcome } from '../interactions/interactionTypes';
import { RoundManager, type RoundManagerConfig } from './roundManager';
import { SpawnDirector, type PlayerProbe, type RoundSpawnSink, type SpawnDirectorConfig } from './spawnDirector';
import { MatchStats } from './matchStats';
import type { RoundPlan } from './difficulty';

export interface RoundModeConfig {
  round?: RoundManagerConfig;
  spawn?: SpawnDirectorConfig;
  interaction?: InteractionConfig;
  points?: PointsTable;
  rewardSeed?: number;
}

export interface RoundModeEvents {
  onRoundStart?: (plan: RoundPlan) => void;
  onRoundComplete?: (plan: RoundPlan) => void;
  onIntermissionStart?: (nextRound: number) => void;
  onInteraction?: (outcome: InteractionOutcome) => void;
  onBarrierOpened?: (barrierId: string, zone: ZoneId) => void;
  onPowerOn?: () => void;
  onPerkAcquired?: (perk: PerkId) => void;
  onPointsChanged?: (points: number, delta: number) => void;
  onGameOver?: (round: number) => void;
}

export class RoundMode {
  readonly economy: PointsEconomy;
  readonly power = new PowerSystem();
  readonly barriers: BarrierSystem;
  readonly wallBuys = new WallBuySystem();
  readonly perks: PerkSystem;
  readonly rewards: RewardSystem;
  readonly interactions: InteractionSystem;
  readonly rounds: RoundManager;
  readonly director: SpawnDirector;
  readonly stats = new MatchStats();

  events: RoundModeEvents = {};

  private map: MapConfig | null = null;
  private inventory: Inventory | null = null;
  private sink: RoundSpawnSink | null = null;

  private readonly probe: PlayerProbe = { x: 0, z: 0, yaw: 0 };

  constructor(config: RoundModeConfig = {}) {
    this.economy = new PointsEconomy(config.points ?? POINTS);
    this.barriers = new BarrierSystem(this.power);
    this.perks = new PerkSystem(this.power);
    this.rewards = new RewardSystem(this.power, { seed: config.rewardSeed });
    this.interactions = new InteractionSystem(config.interaction);
    this.rounds = new RoundManager(config.round);
    this.director = new SpawnDirector(config.spawn);

    this.economy.onChange = (points, delta) => {
      this.stats.recordPoints(this.economy.earned, this.economy.spent);
      this.events.onPointsChanged?.(points, delta);
    };

    this.rounds.events = {
      onRoundStart: (plan) => {
        this.director.beginRound(plan);
        this.stats.recordRoundStart(plan.round);
        this.events.onRoundStart?.(plan);
      },
      onRoundComplete: (plan) => {
        this.economy.awardRoundClear(plan.round);
        this.stats.recordRoundComplete(plan.round);
        this.events.onRoundComplete?.(plan);
      },
      onIntermissionStart: (next) => this.events.onIntermissionStart?.(next),
      onGameOver: (round) => this.events.onGameOver?.(round),
    };

    this.barriers.onBarrierOpened = (def) => {
      this.stats.recordDoorOpened();
      this.director.setUnlockedZones(this.barriers.unlockedZones);
      this.events.onBarrierOpened?.(def.id, def.unlocksZone);
    };

    this.power.onPowerOn = () => {
      this.stats.recordPowerActivated();
      this.events.onPowerOn?.();
    };

    this.perks.onPerkAcquired = (def) => {
      this.stats.recordPerkBought();
      this.events.onPerkAcquired?.(def.id);
    };
  }

  load(map: MapConfig, inventory: Inventory, sink: RoundSpawnSink, hooks: WallBuyHooks): void {
    this.map = map;
    this.inventory = inventory;
    this.sink = sink;
    this.wallBuys.hooks = hooks;
    this.barriers.load(map);
    this.wallBuys.load(map);
    this.rewards.reset();
    this.director.setZones(map.spawnZones);
    this.director.setUnlockedZones(this.barriers.unlockedZones);
    this.interactions.load(map, {
      availability: (t) => this.availability(t),
      perform: (t, out) => this.perform(t, out),
      isZoneUnlocked: (zone) => this.barriers.isZoneUnlocked(zone),
    });
  }

  reset(): void {
    if (this.map) this.barriers.reset(this.map);
    this.power.reset();
    this.perks.reset();
    this.rewards.reset();
    this.economy.reset();
    this.stats.reset();
    this.interactions.reset();
    this.director.reset();
    if (this.map) this.director.setUnlockedZones(this.barriers.unlockedZones);
    this.rounds.begin();
  }

  get phase(): RoundPhase {
    return this.rounds.phase;
  }

  private availability(t: Interactable): PurchaseResult {
    const inv = this.inventory;
    switch (t.kind) {
      case InteractKind.Barrier:
        return this.barriers.availability(t.id);
      case InteractKind.WallWeapon:
        return inv ? this.wallBuys.weaponAvailability(t.id, inv) : PurchaseResult.Unavailable;
      case InteractKind.WallAmmo:
        return inv
          ? this.wallBuys.ammoAvailability(t.id.replace(/:ammo$/, ''), inv)
          : PurchaseResult.Unavailable;
      case InteractKind.PerkMachine:
        return t.perk ? this.perks.availability(t.perk, true) : PurchaseResult.Unavailable;
      case InteractKind.PowerSwitch:
        return this.power.on ? PurchaseResult.AlreadyOwned : PurchaseResult.Ok;
      case InteractKind.RewardMachine:
        return this.rewards.availability(t.cost, this.economy, t.requiresPower);
    }
  }

  private perform(t: Interactable, out: InteractionOutcome): void {
    const inv = this.inventory;
    switch (t.kind) {
      case InteractKind.Barrier: {
        const r = this.barriers.purchase(t.id, this.economy);
        out.result = r.result;
        out.cost = r.cost;
        if (r.unlockedZone) out.unlockedZone = r.unlockedZone;
        out.message = r.result === PurchaseResult.Ok ? `${t.label} OPENED` : out.message;
        break;
      }
      case InteractKind.WallWeapon: {
        if (!inv) {
          out.result = PurchaseResult.Unavailable;
          break;
        }
        const r = this.wallBuys.purchaseWeapon(t.id, this.economy, inv);
        out.result = r.result;
        out.cost = r.cost;
        out.weapon = r.weapon;
        out.newWeapon = r.newWeapon;
        if (r.result === PurchaseResult.Ok) {
          this.stats.recordWeaponBought();
          out.message = `${t.label} ACQUIRED`;
        }
        break;
      }
      case InteractKind.WallAmmo: {
        if (!inv) {
          out.result = PurchaseResult.Unavailable;
          break;
        }
        const r = this.wallBuys.purchaseAmmo(t.id.replace(/:ammo$/, ''), this.economy, inv);
        out.result = r.result;
        out.cost = r.cost;
        out.weapon = r.weapon;
        out.grantedCount = r.granted;
        if (r.result === PurchaseResult.Ok) {
          this.stats.recordAmmoBought();
          out.message = `+${r.granted} ROUNDS`;
        }
        break;
      }
      case InteractKind.PerkMachine: {
        if (!t.perk) {
          out.result = PurchaseResult.Unavailable;
          break;
        }
        const r = this.perks.purchase(t.perk, this.economy, t.cost, true);
        out.result = r.result;
        out.cost = r.cost;
        out.perk = t.perk;
        if (r.result === PurchaseResult.Ok) out.message = `${t.label} INSTALLED`;
        break;
      }
      case InteractKind.PowerSwitch: {
        const r = this.power.activate(t.id);
        out.result = r.result;
        out.cost = 0;
        if (r.result === PurchaseResult.Ok) out.message = 'POWER RESTORED';
        break;
      }
      case InteractKind.RewardMachine: {
        if (!inv) {
          out.result = PurchaseResult.Unavailable;
          break;
        }
        const r = this.rewards.purchase(t.cost, this.economy, inv, t.requiresPower);
        out.result = r.result;
        out.cost = r.cost;
        out.rewardLabel = r.label;
        out.grantedCount = r.granted;
        out.newWeapon = r.newWeapon;
        if (r.result === PurchaseResult.Ok) {
          this.stats.recordRewardRolled();
          out.message = r.label;
          if (r.newWeapon && r.entry?.weapon) {
            const granted = this.wallBuys.hooks?.grantWeapon(r.entry.weapon) ?? false;
            out.weapon = r.entry.weapon;
            out.newWeapon = granted;
          }
        }
        break;
      }
    }
  }

  registerHit(damage: number, region: HitRegion, killed: boolean, melee: boolean): number {
    if (!this.rounds.active && this.rounds.phase !== RoundPhase.RoundComplete) {
      this.stats.recordDamage(damage, region);
      return 0;
    }
    this.stats.recordDamage(damage, region);
    let awarded = this.economy.awardHit(damage, region);
    if (killed) {
      awarded += this.economy.awardKill(region, melee);
      this.stats.recordKill(melee);
      this.rounds.notifyKilled(1);
    }
    return awarded;
  }

  registerDamageTaken(amount: number): void {
    this.stats.recordDamageTaken(amount);
  }

  registerShot(count = 1): void {
    this.stats.recordShot(count);
  }

  grantedWeapons(): readonly WeaponId[] {
    return this.inventory ? this.inventory.weapons.map((w) => w.id) : [];
  }

  step(
    dt: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    playerYaw: number,
    interactHeld: boolean,
  ): InteractionOutcome | null {
    this.probe.x = playerX;
    this.probe.z = playerZ;
    this.probe.yaw = playerYaw;

    this.economy.tick(dt);
    this.stats.tick(dt);

    if (this.sink) this.rounds.notifyAlive(this.sink.aliveCount);
    this.rounds.step(dt);

    if (this.sink && this.rounds.spawningOpen) {
      const spawned = this.director.step(
        dt,
        this.rounds.plan,
        this.rounds.pendingSpawns,
        this.sink,
        this.probe,
      );
      if (spawned > 0) this.rounds.notifySpawned(spawned);
    }

    return this.interactions.step(dt, {
      x: playerX,
      y: playerY,
      z: playerZ,
      yaw: playerYaw,
      pressed: interactHeld,
    });
  }

  get interactHint(): string | null {
    return this.interactions.prompt.prompt;
  }
}
