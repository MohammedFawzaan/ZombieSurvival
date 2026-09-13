import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameState } from '../state/gameState';
import { WeaponSystem } from './weaponSystem';
import { WEAPONS, REGION_MULTIPLIER } from './definitions';

const IDLE = { fire: false, firePressed: false, aim: false, reload: false };

function advance(w: WeaponSystem, seconds: number, intent = IDLE): number {
  let shots = 0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    w.step(dt, intent, true, () => {
      shots++;
    });
  }
  return shots;
}

describe('WeaponSystem ammunition', () => {
  let state: GameState;
  let weapons: WeaponSystem;

  beforeEach(() => {
    state = new GameState();
    weapons = new WeaponSystem(state);
  });

  it('starts with a full magazine and the defined reserve', () => {
    expect(state.weaponId).toBe('pistol');
    expect(state.magazine).toBe(WEAPONS.pistol.magazineSize);
    expect(state.reserve).toBe(WEAPONS.pistol.startingReserve);
  });

  it('consumes exactly one round per shot', () => {
    const before = weapons.currentSlot.magazine;
    weapons.forceFire(() => {});
    expect(weapons.currentSlot.magazine).toBe(before - 1);
  });

  it('refuses to fire an empty magazine', () => {
    weapons.currentSlot.magazine = 0;
    const fired = weapons.forceFire(() => {});
    expect(fired).toBe(false);
  });

  it('moves rounds from reserve into the magazine on reload', () => {
    const def = WEAPONS.pistol;
    weapons.currentSlot.magazine = 5;
    const reserveBefore = weapons.currentSlot.reserve;
    expect(weapons.beginReload()).toBe(true);
    advance(weapons, def.reloadTime + 0.2);
    expect(weapons.currentSlot.magazine).toBe(def.magazineSize);
    expect(weapons.currentSlot.reserve).toBe(reserveBefore - (def.magazineSize - 5));
  });

  it('never creates ammunition out of nothing', () => {
    const def = WEAPONS.pistol;
    weapons.currentSlot.magazine = 0;
    weapons.currentSlot.reserve = 4;
    weapons.beginReload();
    advance(weapons, def.reloadTime + 0.2);
    expect(weapons.currentSlot.magazine).toBe(4);
    expect(weapons.currentSlot.reserve).toBe(0);
  });

  it('does not reload a full magazine or with an empty reserve', () => {
    expect(weapons.beginReload()).toBe(false);
    weapons.currentSlot.magazine = 1;
    weapons.currentSlot.reserve = 0;
    expect(weapons.beginReload()).toBe(false);
  });

  it('caps reserve ammunition at the weapon maximum', () => {
    weapons.addAmmo('pistol', 100000);
    expect(weapons.currentSlot.reserve).toBe(WEAPONS.pistol.maxReserve);
  });
});

describe('WeaponSystem fire rate and modes', () => {
  let weapons: WeaponSystem;

  beforeEach(() => {
    weapons = new WeaponSystem(new GameState());
  });

  it('fires a semi-automatic weapon once per trigger press', () => {
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    const shots = advance(weapons, 1, held);
    expect(shots).toBe(1);
  });

  it('fires an automatic weapon continuously at roughly its rated rpm', () => {
    weapons.selectById('rifle');
    advance(weapons, 0.6);
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    const shots = advance(weapons, 1, held);
    const expected = WEAPONS.rifle.rpm / 60;
    expect(shots).toBeGreaterThan(expected * 0.75);
    expect(shots).toBeLessThanOrEqual(Math.ceil(expected) + 1);
  });

  it('cannot fire while reloading', () => {
    weapons.currentSlot.magazine = 3;
    weapons.beginReload();
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    let shots = 0;
    weapons.step(1 / 60, held, true, () => {
      shots++;
    });
    expect(shots).toBe(0);
  });

  it('cannot fire while the player is dead', () => {
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    let shots = 0;
    weapons.step(1 / 60, held, false, () => {
      shots++;
    });
    expect(shots).toBe(0);
  });
});

describe('WeaponSystem switching', () => {
  let state: GameState;
  let weapons: WeaponSystem;

  beforeEach(() => {
    state = new GameState();
    weapons = new WeaponSystem(state);
  });

  it('cycles between the two weapons', () => {
    expect(weapons.current.id).toBe('pistol');
    weapons.cycle();
    expect(weapons.current.id).toBe('rifle');
    weapons.cycle();
    expect(weapons.current.id).toBe('pistol');
  });

  it('blocks firing during the swap animation, then allows it', () => {
    weapons.selectById('rifle');
    expect(weapons.switching).toBe(true);
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    let shots = 0;
    weapons.step(1 / 60, held, true, () => {
      shots++;
    });
    expect(shots).toBe(0);
    advance(weapons, 0.8);
    expect(weapons.switching).toBe(false);
  });

  it('keeps each weapon its own ammunition', () => {
    weapons.currentSlot.magazine = 2;
    weapons.selectById('rifle');
    advance(weapons, 0.6);
    expect(weapons.currentSlot.magazine).toBe(WEAPONS.rifle.magazineSize);
    weapons.selectById('pistol');
    advance(weapons, 0.6);
    expect(weapons.currentSlot.magazine).toBe(2);
  });

  it('cancels an in-progress reload when swapping', () => {
    weapons.currentSlot.magazine = 1;
    weapons.beginReload();
    expect(weapons.isReloading).toBe(true);
    weapons.selectById('rifle');
    expect(weapons.isReloading).toBe(false);
  });
});

describe('WeaponSystem spread', () => {
  it('is tighter while aiming than from the hip', () => {
    const weapons = new WeaponSystem(new GameState());
    const hip = weapons.currentSpread;
    const aiming = { fire: false, firePressed: false, aim: true, reload: false };
    advance(weapons, 1, aiming);
    expect(weapons.aimBlend).toBeGreaterThan(0.9);
    expect(weapons.currentSpread).toBeLessThan(hip);
  });

  it('blooms when firing and recovers when the trigger is released', () => {
    const weapons = new WeaponSystem(new GameState());
    weapons.selectById('rifle');
    advance(weapons, 0.6);
    const rest = weapons.currentSpread;
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    advance(weapons, 0.5, held);
    const bloomed = weapons.currentSpread;
    expect(bloomed).toBeGreaterThan(rest);
    advance(weapons, 3);
    expect(weapons.currentSpread).toBeLessThan(bloomed);
  });

  it('never exceeds the configured maximum spread', () => {
    const weapons = new WeaponSystem(new GameState());
    weapons.selectById('rifle');
    advance(weapons, 0.6);
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    advance(weapons, 5, held);
    expect(weapons.currentSpread).toBeLessThanOrEqual(WEAPONS.rifle.spreadMax + 1e-9);
  });
});

describe('WeaponSystem recoil', () => {
  it('reports an upward pitch kick on every shot', () => {
    const weapons = new WeaponSystem(new GameState());
    const kicks: number[] = [];
    for (let i = 0; i < 8; i++) {
      weapons.forceFire((_req, recoil) => kicks.push(recoil.pitch));
    }
    expect(kicks).toHaveLength(8);
    for (const k of kicks) expect(k).toBeGreaterThan(0);
  });

  it('kicks less while aiming', () => {
    const hipWeapons = new WeaponSystem(new GameState());
    let hip = 0;
    hipWeapons.forceFire((_r, recoil) => {
      hip = recoil.pitch;
    });

    const aimWeapons = new WeaponSystem(new GameState());
    const aiming = { fire: false, firePressed: false, aim: true, reload: false };
    advance(aimWeapons, 1, aiming);
    let aimed = 0;
    aimWeapons.forceFire((_r, recoil) => {
      aimed = recoil.pitch;
    });

    expect(aimed).toBeLessThan(hip * 1.05);
  });
});

describe('Weapon definitions', () => {
  it('gives headshots substantially more damage than body shots', () => {
    expect(REGION_MULTIPLIER.head).toBeGreaterThan(REGION_MULTIPLIER.torso * 2);
    expect(REGION_MULTIPLIER.limb).toBeLessThan(REGION_MULTIPLIER.torso);
  });

  it('defines coherent values for every weapon', () => {
    for (const def of Object.values(WEAPONS)) {
      expect(def.damage).toBeGreaterThan(0);
      expect(def.rpm).toBeGreaterThan(0);
      expect(def.magazineSize).toBeGreaterThan(0);
      expect(def.reloadTime).toBeGreaterThan(0);
      expect(def.range).toBeGreaterThan(def.falloffStart);
      expect(def.falloffMin).toBeGreaterThan(0);
      expect(def.falloffMin).toBeLessThanOrEqual(1);
      expect(def.spreadAim).toBeLessThan(def.spreadHip);
      expect(def.startingReserve).toBeLessThanOrEqual(def.maxReserve);
    }
  });

  it('makes the rifle a higher-rate, longer-range weapon than the pistol', () => {
    expect(WEAPONS.rifle.rpm).toBeGreaterThan(WEAPONS.pistol.rpm);
    expect(WEAPONS.rifle.range).toBeGreaterThan(WEAPONS.pistol.range);
    expect(WEAPONS.rifle.automatic).toBe(true);
    expect(WEAPONS.pistol.automatic).toBe(false);
  });
});

describe('GameState vitals', () => {
  it('clamps health at zero and flips to the dead phase', () => {
    const state = new GameState();
    state.setPhase('playing' as never);
    state.damage(1000);
    expect(state.health).toBe(0);
    expect(state.phase).toBe('dead');
  });

  it('never heals above maximum', () => {
    const state = new GameState();
    state.health = 50;
    state.heal(1000);
    expect(state.health).toBe(state.maxHealth);
  });

  it('ignores damage outside the playing phase', () => {
    const state = new GameState();
    state.damage(50);
    expect(state.health).toBe(state.maxHealth);
  });

  it('counts kills only when a hit is lethal', () => {
    const state = new GameState();
    state.registerHit(false);
    expect(state.kills).toBe(0);
    state.registerHit(true);
    expect(state.kills).toBe(1);
  });

  it('restores a clean slate on reset', () => {
    const state = new GameState();
    state.setPhase('playing' as never);
    state.damage(40);
    state.registerHit(true);
    state.survivedSeconds = 99;
    state.reset();
    expect(state.health).toBe(state.maxHealth);
    expect(state.kills).toBe(0);
    expect(state.survivedSeconds).toBe(0);
    expect(state.damageFlash).toBe(0);
  });

  it('notifies subscribers when vitals change', () => {
    const state = new GameState();
    const seen = vi.fn();
    const unsub = state.subscribe(seen);
    state.setPhase('playing' as never);
    state.damage(10);
    expect(seen).toHaveBeenCalled();
    unsub();
  });
});
