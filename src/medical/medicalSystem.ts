import type { MedicalId, MedicalSnapshot } from '../state/types';
import type { GameState } from '../state/gameState';
import type { Inventory } from '../inventory/inventory';
import { MEDICAL, MEDICAL_ORDER } from './definitions';
import { clamp } from '../util/math';

export type MedicalUseResult =
  | 'started'
  | 'already-using'
  | 'none-carried'
  | 'full-health'
  | 'blocked';

export type MedicalInterruptReason = 'damage' | 'cancelled' | 'switched' | 'died';

const INTERRUPT_FEEDBACK_TIME = 1.4;

export class MedicalSystem {
  private readonly state: GameState;
  private readonly inventory: Inventory;

  private activeId: MedicalId | null = null;
  private timer = 0;
  private duration = 0;
  private interruptedFor = 0;

  onHealed: ((id: MedicalId, amount: number) => void) | null = null;
  onInterrupted: ((id: MedicalId, reason: MedicalInterruptReason) => void) | null = null;
  onStarted: ((id: MedicalId) => void) | null = null;

  constructor(state: GameState, inventory: Inventory) {
    this.state = state;
    this.inventory = inventory;
  }

  get using(): MedicalId | null {
    return this.activeId;
  }

  get busy(): boolean {
    return this.activeId !== null;
  }

  get progress(): number {
    if (this.activeId === null || this.duration <= 0) return 0;
    return clamp(1 - this.timer / this.duration, 0, 1);
  }

  begin(id: MedicalId, canAct: boolean): MedicalUseResult {
    if (!canAct) return 'blocked';
    if (this.activeId !== null) return 'already-using';
    const def = MEDICAL[id];
    if (!def) return 'none-carried';
    if (this.inventory.medicalCount(id) <= 0) return 'none-carried';
    if (this.state.maxHealth - this.state.health < def.minHealthDeficit) return 'full-health';

    this.activeId = id;
    this.duration = def.useTime;
    this.timer = def.useTime;
    this.syncState();
    this.onStarted?.(id);
    return 'started';
  }

  beginBest(canAct: boolean): MedicalUseResult {
    const deficit = this.state.maxHealth - this.state.health;
    let chosen: MedicalId | null = null;
    for (const id of MEDICAL_ORDER) {
      if (this.inventory.medicalCount(id) <= 0) continue;
      if (chosen === null) {
        chosen = id;
        continue;
      }
      const current = MEDICAL[chosen];
      const candidate = MEDICAL[id];
      const currentWaste = Math.max(0, current.heal - deficit);
      const candidateWaste = Math.max(0, candidate.heal - deficit);
      if (candidateWaste < currentWaste) chosen = id;
      else if (candidateWaste === currentWaste && candidate.heal > current.heal) chosen = id;
    }
    if (chosen === null) return 'none-carried';
    return this.begin(chosen, canAct);
  }

  cancel(reason: MedicalInterruptReason): boolean {
    if (this.activeId === null) return false;
    const id = this.activeId;
    this.activeId = null;
    this.timer = 0;
    this.duration = 0;
    this.interruptedFor = INTERRUPT_FEEDBACK_TIME;
    this.onInterrupted?.(id, reason);
    this.syncState();
    return true;
  }

  notifyDamaged(): void {
    if (this.activeId === null) return;
    if (!MEDICAL[this.activeId].cancelOnDamage) return;
    this.cancel('damage');
  }

  notifyWeaponSwitched(): void {
    this.cancel('switched');
  }

  step(dt: number, canAct: boolean): void {
    if (this.interruptedFor > 0) {
      this.interruptedFor = Math.max(0, this.interruptedFor - dt);
      this.syncState();
    }
    if (this.activeId === null) return;
    if (!canAct) {
      this.cancel('died');
      return;
    }

    this.timer -= dt;
    if (this.timer > 0) {
      this.syncState();
      return;
    }

    const id = this.activeId;
    const def = MEDICAL[id];
    const before = this.state.health;
    const consumed = this.inventory.consumeMedical(id, 1);

    this.activeId = null;
    this.timer = 0;
    this.duration = 0;

    if (consumed) {
      this.state.heal(def.heal);
      this.onHealed?.(id, this.state.health - before);
    }
    this.syncState();
  }

  reset(): void {
    this.activeId = null;
    this.timer = 0;
    this.duration = 0;
    this.interruptedFor = 0;
    this.lastSyncedProgress = -1;
    this.lastSyncedId = null;
    this.lastSyncedInterrupt = -1;
    this.state.medical = this.snapshot();
    this.state.emit();
  }

  snapshot(): MedicalSnapshot {
    return {
      usingId: this.activeId,
      usingName: this.activeId ? MEDICAL[this.activeId].name : null,
      progress: this.progress,
      quantities: MEDICAL_ORDER.map((id) => ({
        id,
        name: MEDICAL[id].name,
        count: this.inventory.medicalCount(id),
      })),
      interruptedFor: this.interruptedFor,
    };
  }

  private lastSyncedProgress = -1;
  private lastSyncedId: MedicalId | null = null;
  private lastSyncedInterrupt = -1;

  private syncState(): void {
    const progress = Math.round(this.progress * 50) / 50;
    const interrupt = Math.round(this.interruptedFor * 10) / 10;
    if (
      progress === this.lastSyncedProgress &&
      this.activeId === this.lastSyncedId &&
      interrupt === this.lastSyncedInterrupt
    ) {
      return;
    }
    this.lastSyncedProgress = progress;
    this.lastSyncedId = this.activeId;
    this.lastSyncedInterrupt = interrupt;
    this.state.medical = this.snapshot();
    this.state.emit();
  }
}
