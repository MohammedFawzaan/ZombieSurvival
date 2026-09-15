import { MeleePhase, type MeleeSnapshot, type WeaponId } from '../state/types';
import type { GameState } from '../state/gameState';
import type { Inventory } from '../inventory/inventory';
import { WEAPONS, WEAPON_ORDER, meleeSwingDuration, usesAmmo, type WeaponDef } from './definitions';
import { clamp, damp, gaussian } from '../util/math';

export interface ShotRequest {
  def: WeaponDef;
  spread: number;
  aimBlend: number;
}

export interface MeleeRequest {
  def: WeaponDef;
}

interface Slot {
  def: WeaponDef;
  magazine: number;
  reserve: number;
}

export type FireCallback = (
  req: ShotRequest,
  recoil: { pitch: number; yaw: number },
) => void;

export interface WeaponHooks {
  onMelee?: (req: MeleeRequest) => void;
  canSpendStamina?: (amount: number) => boolean;
  spendStamina?: (amount: number) => void;
}

export class WeaponSystem {
  private readonly slots: Slot[] = [];
  private index = 0;

  private cooldown = 0;
  private reloadTimer = 0;
  private reloading = false;
  private triggerHeld = false;
  private switchTimer = 0;

  private spreadBloom = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;

  private meleePhase: MeleePhase = MeleePhase.Idle;
  private meleeTimer = 0;
  private meleeElapsed = 0;
  private meleeResolved = false;

  aimBlend = 0;
  kick = 0;
  swayPhase = 0;
  muzzleFlash = 0;
  lastShotAt = -999;

  onWeaponSwitched: ((id: WeaponId) => void) | null = null;

  private readonly state: GameState;
  private readonly inventory: Inventory | null;

  constructor(state: GameState, inventory: Inventory | null = null) {
    this.state = state;
    this.inventory = inventory;
    this.buildSlots();
    this.syncState();
  }

  private buildSlots(): void {
    this.slots.length = 0;
    if (this.inventory) {
      for (const entry of this.inventory.weapons) {
        const def = WEAPONS[entry.id];
        if (!def) continue;
        this.slots.push({ def, magazine: entry.magazine, reserve: entry.reserve });
      }
    }
    if (this.slots.length === 0) {
      for (const id of WEAPON_ORDER) {
        const def = WEAPONS[id];
        this.slots.push({ def, magazine: def.magazineSize, reserve: def.startingReserve });
      }
    }
    this.index = 0;
  }

  get slotCount(): number {
    return this.slots.length;
  }

  get currentIndex(): number {
    return this.index;
  }

  get current(): WeaponDef {
    return this.slots[this.index].def;
  }

  get currentSlot(): Slot {
    return this.slots[this.index];
  }

  get isReloading(): boolean {
    return this.reloading;
  }

  get switching(): boolean {
    return this.switchTimer > 0;
  }

  get isMelee(): boolean {
    return this.current.kind === 'melee';
  }

  get meleeState(): MeleePhase {
    return this.meleePhase;
  }

  get meleeBusy(): boolean {
    return this.meleePhase !== MeleePhase.Idle;
  }

  get currentSpread(): number {
    const def = this.current;
    if (def.spreadHip <= 0 && def.spreadAim <= 0) return 0;
    const base = def.spreadAim + (def.spreadHip - def.spreadAim) * (1 - this.aimBlend);
    return Math.min(def.spreadMax, base + this.spreadBloom);
  }

  get meleeVisualPhase(): MeleePhase {
    return this.current.kind === 'melee' ? this.meleePhase : MeleePhase.Idle;
  }

  get meleeVisualProgress(): number {
    const def = this.current;
    if (def.kind !== 'melee' || this.meleePhase === MeleePhase.Idle) return 0;
    const total = meleeSwingDuration(def);
    return total > 0 ? clamp(this.meleeElapsed / total, 0, 1) : 0;
  }

  meleeSnapshot(): MeleeSnapshot {
    const def = this.current;
    if (def.kind !== 'melee' || this.meleePhase === MeleePhase.Idle) {
      return { phase: MeleePhase.Idle, progress: 0 };
    }
    const total = meleeSwingDuration(def);
    return {
      phase: this.meleePhase,
      progress: total > 0 ? clamp(this.meleeElapsed / total, 0, 1) : 0,
    };
  }

  reset(): void {
    this.inventory?.reset();
    this.buildSlots();
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.triggerHeld = false;
    this.switchTimer = 0;
    this.spreadBloom = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.aimBlend = 0;
    this.kick = 0;
    this.muzzleFlash = 0;
    this.meleePhase = MeleePhase.Idle;
    this.meleeTimer = 0;
    this.meleeElapsed = 0;
    this.meleeResolved = false;
    this.syncState();
  }

  selectSlot(i: number): void {
    if (i < 0 || i >= this.slots.length || i === this.index) return;
    this.index = i;
    this.reloading = false;
    this.reloadTimer = 0;
    this.switchTimer = 0.42;
    this.cooldown = Math.max(this.cooldown, 0.32);
    this.spreadBloom = 0;
    this.meleePhase = MeleePhase.Idle;
    this.meleeTimer = 0;
    this.meleeElapsed = 0;
    this.meleeResolved = false;
    this.syncState();
    this.onWeaponSwitched?.(this.current.id);
  }

  selectById(id: WeaponId): void {
    this.selectSlot(this.slots.findIndex((s) => s.def.id === id));
  }

  cycle(step = 1): void {
    const n = this.slots.length;
    if (n <= 1) return;
    this.selectSlot((((this.index + step) % n) + n) % n);
  }

  beginReload(): boolean {
    const slot = this.currentSlot;
    if (!usesAmmo(slot.def)) return false;
    if (this.reloading || this.switchTimer > 0 || this.meleeBusy) return false;
    if (slot.magazine >= slot.def.magazineSize || slot.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = slot.def.reloadTime;
    this.syncState();
    return true;
  }

  addAmmo(id: WeaponId, rounds: number): void {
    const slot = this.slots.find((s) => s.def.id === id);
    if (!slot || !usesAmmo(slot.def)) return;
    slot.reserve = Math.min(slot.def.maxReserve, slot.reserve + rounds);
    this.writeBackAmmo();
    this.syncState();
  }

  step(
    dt: number,
    intent: { fire: boolean; firePressed: boolean; aim: boolean; reload: boolean },
    canAct: boolean,
    onFire: FireCallback,
    hooks: WeaponHooks = {},
  ): void {
    const def = this.current;

    if (this.switchTimer > 0) this.switchTimer = Math.max(0, this.switchTimer - dt);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 22);
    this.kick = damp(this.kick, 0, 13, dt);
    this.spreadBloom = Math.max(0, this.spreadBloom - def.spreadRecovery * dt);

    const wantAim =
      canAct && intent.aim && !this.reloading && this.switchTimer <= 0 && def.kind !== 'melee';
    this.aimBlend = damp(this.aimBlend, wantAim ? 1 : 0, 15, dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }

    if (canAct && intent.reload) this.beginReload();

    if (!intent.fire) this.triggerHeld = false;

    if (def.kind === 'melee') {
      this.stepMelee(dt, intent, canAct, def, hooks);
    } else if (canAct && !this.reloading && this.switchTimer <= 0 && this.cooldown <= 0) {
      const wantsShot = def.automatic ? intent.fire : intent.firePressed && !this.triggerHeld;
      if (wantsShot) {
        if (this.currentSlot.magazine > 0) {
          this.fire(def, onFire);
        } else {
          this.cooldown = 0.28;
          this.beginReload();
        }
        if (!def.automatic) this.triggerHeld = true;
      }
    }

    this.recoilPitch = damp(this.recoilPitch, 0, def.recoilRecovery, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, def.recoilRecovery, dt);
    this.syncState();
  }

  private stepMelee(
    dt: number,
    intent: { fire: boolean; firePressed: boolean },
    canAct: boolean,
    def: WeaponDef,
    hooks: WeaponHooks,
  ): void {
    if (this.meleePhase !== MeleePhase.Idle) {
      this.meleeTimer -= dt;
      this.meleeElapsed += dt;

      if (this.meleePhase === MeleePhase.Windup && this.meleeTimer <= 0) {
        this.meleePhase = MeleePhase.Active;
        this.meleeTimer = def.meleeActive ?? 0.1;
        this.meleeResolved = false;
      }

      if (this.meleePhase === MeleePhase.Active && !this.meleeResolved) {
        this.meleeResolved = true;
        this.kick = def.kickBack;
        this.lastShotAt = performance.now() / 1000;
        hooks.onMelee?.({ def });
      }

      if (this.meleePhase === MeleePhase.Active && this.meleeTimer <= 0) {
        this.meleePhase = MeleePhase.Recovery;
        this.meleeTimer = def.meleeRecovery ?? 0.3;
      }

      if (this.meleePhase === MeleePhase.Recovery && this.meleeTimer <= 0) {
        this.meleePhase = MeleePhase.Idle;
        this.meleeTimer = 0;
        this.meleeElapsed = 0;
      }
      return;
    }

    if (!canAct || this.switchTimer > 0 || this.cooldown > 0) return;
    const wantsSwing = def.automatic ? intent.fire : intent.firePressed && !this.triggerHeld;
    if (!wantsSwing) return;

    const cost = def.meleeStamina ?? 0;
    if (cost > 0 && hooks.canSpendStamina && !hooks.canSpendStamina(cost)) return;
    if (cost > 0) hooks.spendStamina?.(cost);

    this.meleePhase = MeleePhase.Windup;
    this.meleeTimer = def.meleeWindup ?? 0.1;
    this.meleeElapsed = 0;
    this.meleeResolved = false;
    this.cooldown = Math.max(60 / def.rpm, meleeSwingDuration(def));
    if (!def.automatic) this.triggerHeld = true;
  }

  forceFire(onFire: FireCallback, hooks: WeaponHooks = {}): boolean {
    const def = this.current;
    if (def.kind === 'melee') {
      if (this.meleeBusy) return false;
      this.meleePhase = MeleePhase.Active;
      this.meleeTimer = def.meleeActive ?? 0.1;
      this.meleeElapsed = def.meleeWindup ?? 0;
      this.meleeResolved = true;
      hooks.onMelee?.({ def });
      return true;
    }
    if (this.reloading || this.currentSlot.magazine <= 0) return false;
    this.fire(def, onFire);
    return true;
  }

  private fire(def: WeaponDef, onFire: FireCallback): void {
    const slot = this.currentSlot;
    slot.magazine--;
    this.writeBackAmmo();
    this.cooldown = 60 / def.rpm;
    this.spreadBloom = Math.min(def.spreadMax, this.spreadBloom + def.spreadPerShot);
    this.kick = def.kickBack;
    this.muzzleFlash = 1;
    this.lastShotAt = performance.now() / 1000;

    const aimEase = 1 - this.aimBlend * 0.42;
    const pitch = def.recoilPitch * aimEase * (0.82 + Math.random() * 0.36);
    const yaw = def.recoilYaw * aimEase * gaussian() * 0.7;
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;

    onFire({ def, spread: this.currentSpread, aimBlend: this.aimBlend }, { pitch, yaw });
  }

  private finishReload(): void {
    const slot = this.currentSlot;
    const need = slot.def.magazineSize - slot.magazine;
    const take = Math.min(need, slot.reserve);
    slot.magazine += take;
    slot.reserve -= take;
    this.reloading = false;
    this.reloadTimer = 0;
    this.writeBackAmmo();
    this.syncState();
  }

  private writeBackAmmo(): void {
    if (!this.inventory) return;
    for (const slot of this.slots) {
      const entry = this.inventory.weaponEntry(slot.def.id);
      if (!entry) continue;
      entry.magazine = slot.magazine;
      entry.reserve = slot.reserve;
    }
  }

  sway(dt: number, speed: number): void {
    this.swayPhase = (this.swayPhase + dt * (2.4 + clamp(speed, 0, 8) * 1.1)) % (Math.PI * 2);
  }

  get reloadProgress(): number {
    if (!this.reloading) return 0;
    return 1 - clamp(this.reloadTimer / this.current.reloadTime, 0, 1);
  }

  private syncState(): void {
    const slot = this.currentSlot;
    const s = this.state;
    const ammo = usesAmmo(slot.def);
    const melee = this.meleeSnapshot();
    const changed =
      s.weaponId !== slot.def.id ||
      s.magazine !== slot.magazine ||
      s.reserve !== slot.reserve ||
      s.reloading !== this.reloading ||
      s.meleePhase !== melee.phase;
    s.weaponId = slot.def.id;
    s.weaponName = slot.def.name;
    s.magazine = ammo ? slot.magazine : 0;
    s.magazineSize = ammo ? slot.def.magazineSize : 0;
    s.reserve = ammo ? slot.reserve : 0;
    s.usesAmmo = ammo;
    s.ammoType = slot.def.ammo;
    s.reloading = this.reloading;
    s.meleePhase = melee.phase;
    s.meleeProgress = melee.progress;
    s.weaponSlots.length = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const d = this.slots[i].def;
      s.weaponSlots.push({
        id: d.id,
        name: d.name,
        usesAmmo: usesAmmo(d),
        active: i === this.index,
      });
    }
    if (changed) s.emit();
  }
}
