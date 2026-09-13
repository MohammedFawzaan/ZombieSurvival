import type { WeaponId } from '../state/types';
import type { GameState } from '../state/gameState';
import { WEAPONS, WEAPON_ORDER, type WeaponDef } from './definitions';
import { clamp, damp, gaussian } from '../util/math';

export interface ShotRequest {
  def: WeaponDef;
  spread: number;
}

interface Slot {
  def: WeaponDef;
  magazine: number;
  reserve: number;
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

  aimBlend = 0;
  kick = 0;
  swayPhase = 0;
  muzzleFlash = 0;
  lastShotAt = -999;

  private readonly state: GameState;

  constructor(state: GameState) {
    this.state = state;
    for (const id of WEAPON_ORDER) {
      const def = WEAPONS[id];
      this.slots.push({ def, magazine: def.magazineSize, reserve: def.startingReserve });
    }
    this.syncState();
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

  get currentSpread(): number {
    const def = this.current;
    const base = def.spreadAim + (def.spreadHip - def.spreadAim) * (1 - this.aimBlend);
    return Math.min(def.spreadMax, base + this.spreadBloom);
  }

  reset(): void {
    for (const slot of this.slots) {
      slot.magazine = slot.def.magazineSize;
      slot.reserve = slot.def.startingReserve;
    }
    this.index = 0;
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
    this.syncState();
  }

  selectById(id: WeaponId): void {
    this.selectSlot(this.slots.findIndex((s) => s.def.id === id));
  }

  cycle(): void {
    this.selectSlot((this.index + 1) % this.slots.length);
  }

  beginReload(): boolean {
    const slot = this.currentSlot;
    if (this.reloading || this.switchTimer > 0) return false;
    if (slot.magazine >= slot.def.magazineSize || slot.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = slot.def.reloadTime;
    this.syncState();
    return true;
  }

  addAmmo(id: WeaponId, rounds: number): void {
    const slot = this.slots.find((s) => s.def.id === id);
    if (!slot) return;
    slot.reserve = Math.min(slot.def.maxReserve, slot.reserve + rounds);
    this.syncState();
  }

  step(
    dt: number,
    intent: { fire: boolean; firePressed: boolean; aim: boolean; reload: boolean },
    canAct: boolean,
    onFire: (req: ShotRequest, recoil: { pitch: number; yaw: number }) => void,
  ): void {
    const def = this.current;

    if (this.switchTimer > 0) this.switchTimer = Math.max(0, this.switchTimer - dt);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 22);
    this.kick = damp(this.kick, 0, 13, dt);
    this.spreadBloom = Math.max(0, this.spreadBloom - def.spreadRecovery * dt);

    const wantAim = canAct && intent.aim && !this.reloading && this.switchTimer <= 0;
    this.aimBlend = damp(this.aimBlend, wantAim ? 1 : 0, 15, dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }

    if (canAct && intent.reload) this.beginReload();

    if (!intent.fire) this.triggerHeld = false;

    if (canAct && !this.reloading && this.switchTimer <= 0 && this.cooldown <= 0) {
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

  forceFire(
    onFire: (req: ShotRequest, recoil: { pitch: number; yaw: number }) => void,
  ): boolean {
    if (this.reloading || this.currentSlot.magazine <= 0) return false;
    this.fire(this.current, onFire);
    return true;
  }

  private fire(
    def: WeaponDef,
    onFire: (req: ShotRequest, recoil: { pitch: number; yaw: number }) => void,
  ): void {
    const slot = this.currentSlot;
    slot.magazine--;
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

    onFire({ def, spread: this.currentSpread }, { pitch, yaw });
  }

  private finishReload(): void {
    const slot = this.currentSlot;
    const need = slot.def.magazineSize - slot.magazine;
    const take = Math.min(need, slot.reserve);
    slot.magazine += take;
    slot.reserve -= take;
    this.reloading = false;
    this.reloadTimer = 0;
    this.syncState();
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
    const changed =
      s.weaponId !== slot.def.id ||
      s.magazine !== slot.magazine ||
      s.reserve !== slot.reserve ||
      s.reloading !== this.reloading;
    s.weaponId = slot.def.id;
    s.weaponName = slot.def.name;
    s.magazine = slot.magazine;
    s.magazineSize = slot.def.magazineSize;
    s.reserve = slot.reserve;
    s.reloading = this.reloading;
    if (changed) s.emit();
  }
}
