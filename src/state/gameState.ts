import {
  GamePhase,
  MeleePhase,
  RoundPhase,
  type AmmoType,
  type HudSnapshot,
  type MedicalSnapshot,
  type WeaponId,
} from './types';

export interface GameEvents {
  onPhaseChange?: (phase: GamePhase) => void;
  onDamaged?: (amount: number) => void;
}

const DAMAGE_DIR_LIFE = 2.2;

/** Shortest signed difference between two angles. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface DamageDirection {
  /** World-space angle the damage came FROM, in radians. */
  angle: number;
  life: number;
  strength: number;
}

export class GameState {
  phase: GamePhase = GamePhase.Loading;

  health = 100;
  maxHealth = 100;
  stamina = 100;
  maxStamina = 100;
  exhausted = false;

  kills = 0;
  survivedSeconds = 0;
  elapsed = 0;

  damageFlash = 0;
  hitMarker = 0;
  killMarker = 0;

  weaponId: WeaponId = 'pistol';
  weaponName = 'Pistol';
  magazine = 0;
  magazineSize = 0;
  reserve = 0;
  reloading = false;
  usesAmmo = true;
  ammoType: AmmoType = '9mm';
  readonly weaponSlots: HudSnapshot['weaponSlots'] = [];
  meleePhase: MeleePhase = MeleePhase.Idle;
  meleeProgress = 0;
  medical: MedicalSnapshot = {
    usingId: null,
    usingName: null,
    progress: 0,
    quantities: [],
    interruptedFor: 0,
  };
  aiming = false;
  sprinting = false;
  crouching = false;
  interactHint: string | null = null;
  purchaseMessage: string | null = null;
  purchaseMessageLife = 0;
  roundMode = false;
  roundPhase: RoundPhase = RoundPhase.Ready;
  roundNumber = 0;
  roundZombiesRemaining = 0;
  roundCountdown = 0;
  points = 0;
  pointsPopup: { amount: number; life: number } | null = null;
  powerOn = false;
  perks: { id: string; name: string; short: string; color: number }[] = [];
  readonly damageDirs: DamageDirection[] = [];
  playerYaw = 0;

  private listeners = new Set<(s: HudSnapshot) => void>();
  private events: GameEvents = {};

  setEvents(e: GameEvents): void {
    this.events = e;
  }

  setPhase(phase: GamePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.events.onPhaseChange?.(phase);
    this.emit();
  }

  get alive(): boolean {
    return this.health > 0;
  }

  damage(amount: number, fromAngle: number | null = null): void {
    if (this.phase !== GamePhase.Playing) return;
    this.health = Math.max(0, this.health - amount);
    this.damageFlash = Math.min(1, this.damageFlash + amount / 45 + 0.25);

    // Remember where it came from so the HUD can point at the attacker.
    if (fromAngle !== null) {
      const existing = this.damageDirs.find(
        (d) => Math.abs(angleDiff(d.angle, fromAngle)) < 0.35,
      );
      if (existing) {
        existing.angle = fromAngle;
        existing.life = DAMAGE_DIR_LIFE;
        existing.strength = Math.min(1, existing.strength + amount / 40);
      } else {
        this.damageDirs.push({
          angle: fromAngle,
          life: DAMAGE_DIR_LIFE,
          strength: Math.min(1, amount / 40 + 0.35),
        });
        if (this.damageDirs.length > 6) this.damageDirs.shift();
      }
    }

    this.events.onDamaged?.(amount);
    if (this.health <= 0) this.setPhase(GamePhase.Dead);
    this.emit();
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.emit();
  }

  registerHit(killed: boolean): void {
    this.hitMarker = 1;
    if (killed) {
      this.kills++;
      this.killMarker = 1;
    }
    this.emit();
  }

  reset(): void {
    this.damageDirs.length = 0;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.exhausted = false;
    this.kills = 0;
    this.survivedSeconds = 0;
    this.damageFlash = 0;
    this.hitMarker = 0;
    this.killMarker = 0;
    this.interactHint = null;
    this.purchaseMessage = null;
    this.purchaseMessageLife = 0;
    this.roundPhase = RoundPhase.Ready;
    this.roundNumber = 0;
    this.roundZombiesRemaining = 0;
    this.roundCountdown = 0;
    this.points = 0;
    this.pointsPopup = null;
    this.powerOn = false;
    this.perks = [];
    this.emit();
  }

  tickFeedback(dt: number): void {
    if (this.phase === GamePhase.Playing) {
      this.survivedSeconds += dt;
      this.elapsed += dt;
    }
    let changed = false;
    if (this.damageDirs.length > 0) {
      for (let i = this.damageDirs.length - 1; i >= 0; i--) {
        const d = this.damageDirs[i];
        d.life -= dt;
        if (d.life <= 0) this.damageDirs.splice(i, 1);
      }
      changed = true;
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
      changed = true;
    }
    if (this.hitMarker > 0) {
      this.hitMarker = Math.max(0, this.hitMarker - dt * 4);
      changed = true;
    }
    if (this.killMarker > 0) {
      this.killMarker = Math.max(0, this.killMarker - dt * 1.4);
      changed = true;
    }

    this.uiAccum += dt;
    if (changed || this.uiAccum >= 0.1) {
      this.uiAccum = 0;
      this.emit();
    }
  }

  private uiAccum = 0;

  subscribe(fn: (s: HudSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): HudSnapshot {
    return {
      phase: this.phase,
      health: this.health,
      maxHealth: this.maxHealth,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      exhausted: this.exhausted,
      weaponId: this.weaponId,
      weaponName: this.weaponName,
      magazine: this.magazine,
      magazineSize: this.magazineSize,
      reserve: this.reserve,
      reloading: this.reloading,
      usesAmmo: this.usesAmmo,
      ammoType: this.ammoType,
      weaponSlots: this.weaponSlots.map((w) => ({ ...w })),
      melee: { phase: this.meleePhase, progress: this.meleeProgress },
      medical: this.medical,
      aiming: this.aiming,
      sprinting: this.sprinting,
      crouching: this.crouching,
      kills: this.kills,
      survivedSeconds: this.survivedSeconds,
      damageFlash: this.damageFlash,
      hitMarker: this.hitMarker,
      killMarker: this.killMarker,
      lowHealth: this.health <= this.maxHealth * 0.35,
      interactHint: this.interactHint,
      purchaseMessage: this.purchaseMessage,
      roundMode: this.roundMode,
      roundPhase: this.roundPhase,
      roundNumber: this.roundNumber,
      roundZombiesRemaining: this.roundZombiesRemaining,
      roundCountdown: this.roundCountdown,
      points: this.points,
      pointsPopup: this.pointsPopup,
      powerOn: this.powerOn,
      perks: this.perks,
      damageDirs: this.damageDirs.map((d) => ({
        angle: angleDiff(d.angle, -this.playerYaw),
        strength: d.strength,
        life: d.life / DAMAGE_DIR_LIFE,
      })),
    };
  }

  emit(): void {
    if (this.listeners.size === 0) return;
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}
