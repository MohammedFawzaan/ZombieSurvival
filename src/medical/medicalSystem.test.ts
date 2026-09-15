import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../state/gameState';
import { GamePhase } from '../state/types';
import { Inventory } from '../inventory/inventory';
import { MedicalSystem } from './medicalSystem';
import { MEDICAL } from './definitions';
import { defaultLoadout } from '../inventory/loadout';

function advance(m: MedicalSystem, seconds: number, canAct = true): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) m.step(dt, canAct);
}

describe('medical item definitions', () => {
  it('makes the bandage the small, fast heal and the medkit the large, slow one', () => {
    expect(MEDICAL.bandage.heal).toBeLessThan(MEDICAL.medkit.heal);
    expect(MEDICAL.bandage.useTime).toBeLessThan(MEDICAL.medkit.useTime);
  });

  it('gives both items a non-instant use duration', () => {
    expect(MEDICAL.bandage.useTime).toBeGreaterThan(0.5);
    expect(MEDICAL.medkit.useTime).toBeGreaterThan(0.5);
  });

  it('makes only the medkit cancellable by damage', () => {
    expect(MEDICAL.bandage.cancelOnDamage).toBe(false);
    expect(MEDICAL.medkit.cancelOnDamage).toBe(true);
  });
});

describe('MedicalSystem healing', () => {
  let state: GameState;
  let inventory: Inventory;
  let medical: MedicalSystem;

  beforeEach(() => {
    state = new GameState();
    state.setPhase(GamePhase.Playing);
    inventory = new Inventory(defaultLoadout());
    medical = new MedicalSystem(state, inventory);
  });

  it('does not heal instantly when a use begins', () => {
    state.health = 40;
    expect(medical.begin('bandage', true)).toBe('started');
    expect(state.health).toBe(40);
    advance(medical, MEDICAL.bandage.useTime * 0.5);
    expect(state.health).toBe(40);
  });

  it('reports progress from 0 to 1 across the use', () => {
    state.health = 40;
    medical.begin('bandage', true);
    expect(medical.progress).toBeCloseTo(0, 2);
    advance(medical, MEDICAL.bandage.useTime * 0.5);
    expect(medical.progress).toBeGreaterThan(0.4);
    expect(medical.progress).toBeLessThan(0.6);
  });

  it('applies the full heal only when the use completes', () => {
    state.health = 40;
    medical.begin('bandage', true);
    advance(medical, MEDICAL.bandage.useTime + 0.1);
    expect(state.health).toBe(40 + MEDICAL.bandage.heal);
    expect(medical.busy).toBe(false);
  });

  it('never heals above maximum health', () => {
    state.health = state.maxHealth - 1;
    medical.begin('medkit', true);
    advance(medical, MEDICAL.medkit.useTime + 0.1);
    expect(state.health).toBe(state.maxHealth);
  });

  it('never heals above maximum across repeated uses', () => {
    state.health = 5;
    for (let i = 0; i < 8; i++) {
      if (medical.begin('bandage', true) !== 'started') break;
      advance(medical, MEDICAL.bandage.useTime + 0.05);
      expect(state.health).toBeLessThanOrEqual(state.maxHealth);
    }
    expect(state.health).toBeLessThanOrEqual(state.maxHealth);
  });

  it('refuses to start at full health', () => {
    state.health = state.maxHealth;
    expect(medical.begin('bandage', true)).toBe('full-health');
    expect(medical.busy).toBe(false);
  });

  it('refuses to start a second use while one is running', () => {
    state.health = 30;
    expect(medical.begin('bandage', true)).toBe('started');
    expect(medical.begin('medkit', true)).toBe('already-using');
  });

  it('refuses to start while dead', () => {
    state.health = 30;
    expect(medical.begin('bandage', false)).toBe('blocked');
  });
});

describe('MedicalSystem inventory consumption', () => {
  let state: GameState;
  let inventory: Inventory;
  let medical: MedicalSystem;

  beforeEach(() => {
    state = new GameState();
    state.setPhase(GamePhase.Playing);
    inventory = new Inventory(defaultLoadout());
    medical = new MedicalSystem(state, inventory);
    state.health = 10;
  });

  it('decrements the stack by exactly one per completed use', () => {
    const before = inventory.medicalCount('bandage');
    medical.begin('bandage', true);
    advance(medical, MEDICAL.bandage.useTime + 0.1);
    expect(inventory.medicalCount('bandage')).toBe(before - 1);
  });

  it('does not consume the item until the use completes', () => {
    const before = inventory.medicalCount('bandage');
    medical.begin('bandage', true);
    advance(medical, MEDICAL.bandage.useTime * 0.8);
    expect(inventory.medicalCount('bandage')).toBe(before);
  });

  it('refunds the item when a use is interrupted', () => {
    const before = inventory.medicalCount('medkit');
    medical.begin('medkit', true);
    advance(medical, MEDICAL.medkit.useTime * 0.9);
    medical.cancel('cancelled');
    expect(inventory.medicalCount('medkit')).toBe(before);
    expect(state.health).toBe(10);
  });

  it('refuses to start when none are carried', () => {
    while (inventory.consumeMedical('medkit', 1)) {
      /* drain */
    }
    expect(medical.begin('medkit', true)).toBe('none-carried');
  });

  it('cannot be drained below zero', () => {
    let uses = 0;
    while (medical.begin('bandage', true) === 'started') {
      advance(medical, MEDICAL.bandage.useTime + 0.05);
      state.health = 10;
      uses++;
      if (uses > 20) break;
    }
    expect(inventory.medicalCount('bandage')).toBe(0);
    expect(uses).toBe(defaultLoadout().medical.bandage);
  });
});

describe('MedicalSystem interruption rule', () => {
  let state: GameState;
  let inventory: Inventory;
  let medical: MedicalSystem;

  beforeEach(() => {
    state = new GameState();
    state.setPhase(GamePhase.Playing);
    inventory = new Inventory(defaultLoadout());
    medical = new MedicalSystem(state, inventory);
    state.health = 30;
  });

  it('aborts a medkit when the player is damaged mid-use', () => {
    medical.begin('medkit', true);
    advance(medical, 1);
    medical.notifyDamaged();
    expect(medical.busy).toBe(false);
    expect(inventory.medicalCount('medkit')).toBe(defaultLoadout().medical.medkit);
  });

  it('does not abort a bandage when the player is damaged mid-use', () => {
    medical.begin('bandage', true);
    advance(medical, 1);
    medical.notifyDamaged();
    expect(medical.busy).toBe(true);
    advance(medical, MEDICAL.bandage.useTime);
    expect(state.health).toBeGreaterThan(30);
  });

  it('aborts any use when the weapon is switched', () => {
    medical.begin('bandage', true);
    medical.notifyWeaponSwitched();
    expect(medical.busy).toBe(false);
  });

  it('aborts any use when the player dies', () => {
    medical.begin('bandage', true);
    advance(medical, 0.5);
    medical.step(1 / 60, false);
    expect(medical.busy).toBe(false);
  });

  it('reports the interrupt reason to a listener', () => {
    const reasons: string[] = [];
    medical.onInterrupted = (_id, reason) => reasons.push(reason);
    medical.begin('medkit', true);
    medical.notifyDamaged();
    expect(reasons).toEqual(['damage']);
  });

  it('surfaces a short interrupt flag for the HUD', () => {
    medical.begin('medkit', true);
    medical.notifyDamaged();
    expect(medical.snapshot().interruptedFor).toBeGreaterThan(0);
    advance(medical, 2);
    expect(medical.snapshot().interruptedFor).toBe(0);
  });
});

describe('MedicalSystem automatic selection', () => {
  it('prefers the item that wastes the least healing', () => {
    const state = new GameState();
    state.setPhase(GamePhase.Playing);
    const inventory = new Inventory(defaultLoadout());
    const medical = new MedicalSystem(state, inventory);

    state.health = state.maxHealth - 10;
    medical.beginBest(true);
    expect(medical.using).toBe('bandage');
    medical.cancel('cancelled');

    state.health = 10;
    medical.beginBest(true);
    expect(medical.using).toBe('medkit');
  });

  it('reports none-carried when the bag is empty', () => {
    const state = new GameState();
    state.setPhase(GamePhase.Playing);
    const inventory = new Inventory({ weapons: ['pistol'], reserves: {}, medical: {} });
    const medical = new MedicalSystem(state, inventory);
    state.health = 10;
    expect(medical.beginBest(true)).toBe('none-carried');
  });
});

describe('MedicalSystem HUD snapshot', () => {
  it('exposes what is being used, progress and remaining quantities', () => {
    const state = new GameState();
    state.setPhase(GamePhase.Playing);
    const inventory = new Inventory(defaultLoadout());
    const medical = new MedicalSystem(state, inventory);
    state.health = 20;

    medical.begin('bandage', true);
    advance(medical, MEDICAL.bandage.useTime * 0.5);

    const snap = state.snapshot().medical;
    expect(snap.usingId).toBe('bandage');
    expect(snap.usingName).toBe('Bandage');
    expect(snap.progress).toBeGreaterThan(0.3);
    expect(snap.progress).toBeLessThan(0.7);
    expect(snap.quantities.find((q) => q.id === 'bandage')?.count).toBe(
      defaultLoadout().medical.bandage,
    );
  });

  it('clears back to idle after a use finishes', () => {
    const state = new GameState();
    state.setPhase(GamePhase.Playing);
    const inventory = new Inventory(defaultLoadout());
    const medical = new MedicalSystem(state, inventory);
    state.health = 20;
    medical.begin('bandage', true);
    advance(medical, MEDICAL.bandage.useTime + 0.2);

    const snap = state.snapshot().medical;
    expect(snap.usingId).toBeNull();
    expect(snap.progress).toBe(0);
  });
});
