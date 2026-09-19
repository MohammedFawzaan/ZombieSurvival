import { RoundPhase } from '../state/types';
import { DEFAULT_CURVE, planForRound, type DifficultyCurve, type RoundPlan } from './difficulty';
import { DEFAULT_TIMINGS, type RoundEvents, type RoundSnapshot, type RoundTimings } from './roundTypes';

export interface RoundManagerConfig {
  curve?: DifficultyCurve;
  timings?: Partial<RoundTimings>;
  startRound?: number;
}

export class RoundManager {
  private readonly curve: DifficultyCurve;
  private readonly timings: RoundTimings;
  private readonly startRound: number;

  phase: RoundPhase = RoundPhase.Ready;
  round = 0;
  plan: RoundPlan;
  spawned = 0;
  killed = 0;
  alive = 0;
  countdown = 0;

  events: RoundEvents = {};

  private readonly snap: RoundSnapshot;

  constructor(config: RoundManagerConfig = {}) {
    this.curve = config.curve ?? DEFAULT_CURVE;
    this.timings = { ...DEFAULT_TIMINGS, ...(config.timings ?? {}) };
    this.startRound = Math.max(1, Math.floor(config.startRound ?? 1));
    this.plan = planForRound(this.startRound, this.curve);
    this.snap = {
      phase: this.phase,
      round: 0,
      total: 0,
      spawned: 0,
      killed: 0,
      remaining: 0,
      alive: 0,
      countdown: 0,
      plan: this.plan,
    };
  }

  get total(): number {
    return this.round === 0 ? 0 : this.plan.totalZombies;
  }

  get remaining(): number {
    return Math.max(0, this.total - this.killed);
  }

  get pendingSpawns(): number {
    return Math.max(0, this.total - this.spawned);
  }

  get active(): boolean {
    return this.phase === RoundPhase.Active;
  }

  get spawningOpen(): boolean {
    return this.phase === RoundPhase.Active && this.pendingSpawns > 0;
  }

  reset(): void {
    this.setPhase(RoundPhase.Ready);
    this.round = 0;
    this.plan = planForRound(this.startRound, this.curve);
    this.spawned = 0;
    this.killed = 0;
    this.alive = 0;
    this.countdown = this.timings.readyDelay;
  }

  begin(): void {
    this.reset();
    this.countdown = this.timings.readyDelay;
  }

  private setPhase(next: RoundPhase): void {
    if (this.phase === next) return;
    const previous = this.phase;
    this.phase = next;
    this.events.onPhaseChange?.(next, previous);
  }

  private enterRound(round: number): void {
    this.round = round;
    this.plan = planForRound(round, this.curve);
    this.spawned = 0;
    this.killed = 0;
    this.countdown = this.timings.roundStarting;
    this.setPhase(RoundPhase.RoundStarting);
  }

  startNextRoundNow(): void {
    this.enterRound(this.round === 0 ? this.startRound : this.round + 1);
  }

  notifySpawned(count = 1): void {
    this.spawned += count;
  }

  notifyKilled(count = 1): void {
    if (this.phase !== RoundPhase.Active && this.phase !== RoundPhase.RoundStarting) return;
    this.killed = Math.min(this.total, this.killed + count);
  }

  notifyAlive(count: number): void {
    this.alive = count;
  }

  gameOver(): void {
    if (this.phase === RoundPhase.GameOver) return;
    this.setPhase(RoundPhase.GameOver);
    this.countdown = 0;
    this.events.onGameOver?.(this.round);
  }

  step(dt: number): void {
    switch (this.phase) {
      case RoundPhase.Ready:
        this.countdown -= dt;
        if (this.countdown <= 0) this.enterRound(this.startRound);
        break;

      case RoundPhase.RoundStarting:
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.setPhase(RoundPhase.Active);
          this.events.onRoundStart?.(this.plan);
        }
        break;

      case RoundPhase.Active:
        if (this.killed >= this.total && this.spawned >= this.total && this.alive <= 0) {
          this.countdown = this.timings.roundComplete;
          this.setPhase(RoundPhase.RoundComplete);
          this.events.onRoundComplete?.(this.plan);
        }
        break;

      case RoundPhase.RoundComplete:
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = this.timings.intermission;
          this.setPhase(RoundPhase.Intermission);
          this.events.onIntermissionStart?.(this.round + 1);
        }
        break;

      case RoundPhase.Intermission:
        this.countdown -= dt;
        if (this.countdown <= 0) this.enterRound(this.round + 1);
        break;

      case RoundPhase.GameOver:
        break;
    }
  }

  snapshot(): RoundSnapshot {
    const s = this.snap;
    s.phase = this.phase;
    s.round = this.round;
    s.total = this.total;
    s.spawned = this.spawned;
    s.killed = this.killed;
    s.remaining = this.remaining;
    s.alive = this.alive;
    s.countdown = Math.max(0, this.countdown);
    s.plan = this.plan;
    return s;
  }
}
