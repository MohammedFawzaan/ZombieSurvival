import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameState } from '../state/gameState';
import { WeaponSystem } from './weaponSystem';
import {
  WEAPONS,
  WEAPON_ORDER,
  REGION_MULTIPLIER,
  usesAmmo,
  meleeSwingDuration,
} from './definitions';
import { MeleePhase } from '../state/types';
import { Inventory } from '../inventory/inventory';

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

  it('cycles forward through every carried weapon and wraps', () => {
    const seen: string[] = [weapons.current.id];
    for (let i = 1; i < WEAPON_ORDER.length; i++) {
      weapons.cycle();
      seen.push(weapons.current.id);
    }
    expect(seen).toEqual([...WEAPON_ORDER]);
    weapons.cycle();
    expect(weapons.current.id).toBe(WEAPON_ORDER[0]);
  });

  it('cycles backwards on a reversed wheel', () => {
    weapons.cycle(-1);
    expect(weapons.current.id).toBe(WEAPON_ORDER[WEAPON_ORDER.length - 1]);
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
      expect(def.startingReserve).toBeLessThanOrEqual(def.maxReserve);
      expect(def.falloffMin).toBeGreaterThan(0);
      expect(def.falloffMin).toBeLessThanOrEqual(1);

      if (def.kind === 'melee') {
        expect(usesAmmo(def)).toBe(false);
        expect(def.magazineSize).toBe(0);
        expect(def.range).toBeGreaterThan(0);
        continue;
      }

      expect(usesAmmo(def)).toBe(true);
      expect(def.magazineSize).toBeGreaterThan(0);
      expect(def.reloadTime).toBeGreaterThan(0);
      expect(def.range).toBeGreaterThan(def.falloffStart);
      expect(def.spreadAim).toBeLessThan(def.spreadHip);
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

describe('shotgun ammunition and reload', () => {
  let state: GameState;
  let weapons: WeaponSystem;

  beforeEach(() => {
    state = new GameState();
    weapons = new WeaponSystem(state);
    weapons.selectById('shotgun');
    advance(weapons, 0.6);
  });

  it('uses its own 12-gauge ammunition pool', () => {
    expect(weapons.current.ammo).toBe('12g');
    expect(weapons.currentSlot.magazine).toBe(WEAPONS.shotgun.magazineSize);
    expect(weapons.currentSlot.reserve).toBe(WEAPONS.shotgun.startingReserve);
  });

  it('consumes exactly one shell per trigger pull, whatever the pellet count', () => {
    const before = weapons.currentSlot.magazine;
    weapons.forceFire(() => {});
    expect(weapons.currentSlot.magazine).toBe(before - 1);
    expect(WEAPONS.shotgun.pellets).toBeGreaterThan(1);
  });

  it('is pump-action: one shell per press, not automatic', () => {
    expect(WEAPONS.shotgun.automatic).toBe(false);
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    expect(advance(weapons, 1, held)).toBe(1);
  });

  it('refills the tube from reserve on reload', () => {
    weapons.currentSlot.magazine = 1;
    const reserveBefore = weapons.currentSlot.reserve;
    expect(weapons.beginReload()).toBe(true);
    advance(weapons, WEAPONS.shotgun.reloadTime + 0.2);
    expect(weapons.currentSlot.magazine).toBe(WEAPONS.shotgun.magazineSize);
    expect(weapons.currentSlot.reserve).toBe(
      reserveBefore - (WEAPONS.shotgun.magazineSize - 1),
    );
  });

  it('reloads slower than the pistol and fires slower than the rifle', () => {
    expect(WEAPONS.shotgun.reloadTime).toBeGreaterThan(WEAPONS.pistol.reloadTime);
    expect(WEAPONS.shotgun.rpm).toBeLessThan(WEAPONS.rifle.rpm);
  });

  it('kicks harder than either rifle or pistol', () => {
    expect(WEAPONS.shotgun.recoilPitch).toBeGreaterThan(WEAPONS.rifle.recoilPitch);
    expect(WEAPONS.shotgun.recoilPitch).toBeGreaterThan(WEAPONS.pistol.recoilPitch);
  });

  it('is the loudest weapon in the game', () => {
    for (const def of Object.values(WEAPONS)) {
      if (def.id === 'shotgun') continue;
      expect(WEAPONS.shotgun.noiseRadius).toBeGreaterThan(def.noiseRadius);
    }
  });

  it('caps 12-gauge reserve at the weapon maximum', () => {
    weapons.addAmmo('shotgun', 100000);
    expect(weapons.currentSlot.reserve).toBe(WEAPONS.shotgun.maxReserve);
  });
});

describe('melee weapon runtime', () => {
  let state: GameState;
  let weapons: WeaponSystem;

  beforeEach(() => {
    state = new GameState();
    weapons = new WeaponSystem(state);
    weapons.selectById('machete');
    advance(weapons, 0.6);
  });

  it('reports itself as a melee weapon with no ammunition', () => {
    expect(weapons.isMelee).toBe(true);
    expect(usesAmmo(weapons.current)).toBe(false);
    expect(state.usesAmmo).toBe(false);
  });

  it('publishes zero ammo numbers so the HUD can hide them', () => {
    const snap = state.snapshot();
    expect(snap.usesAmmo).toBe(false);
    expect(snap.magazine).toBe(0);
    expect(snap.magazineSize).toBe(0);
    expect(snap.reserve).toBe(0);
    expect(snap.ammoType).toBe('none');
  });

  it('refuses to reload and never accepts ammunition', () => {
    expect(weapons.beginReload()).toBe(false);
    weapons.addAmmo('machete', 50);
    expect(weapons.currentSlot.reserve).toBe(0);
  });

  it('runs windup, then active, then recovery, then returns to idle', () => {
    const def = WEAPONS.machete;
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    const seen: MeleePhase[] = [];
    const dt = 1 / 60;
    for (let t = 0; t < meleeSwingDuration(def) + 0.2; t += dt) {
      weapons.step(dt, held, true, () => {}, {});
      const phase = weapons.meleeState;
      if (seen[seen.length - 1] !== phase) seen.push(phase);
      if (seen.length === 4) break;
    }
    expect(seen).toEqual([
      MeleePhase.Windup,
      MeleePhase.Active,
      MeleePhase.Recovery,
      MeleePhase.Idle,
    ]);
  });

  it('resolves the hit inside the active window, not on the button press', () => {
    const def = WEAPONS.machete;
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    const dt = 1 / 60;
    let hitAt = -1;
    let elapsed = 0;
    for (let i = 0; i < 60; i++) {
      weapons.step(dt, held, true, () => {}, {
        onMelee: () => {
          if (hitAt < 0) hitAt = elapsed;
        },
      });
      elapsed += dt;
    }
    expect(hitAt).toBeGreaterThanOrEqual((def.meleeWindup ?? 0) - dt);
    expect(hitAt).toBeLessThanOrEqual((def.meleeWindup ?? 0) + (def.meleeActive ?? 0) + dt);
  });

  it('swings at most once per swing cycle while the button is held', () => {
    const def = WEAPONS.machete;
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    let swings = 0;
    const dt = 1 / 60;
    const seconds = 2;
    for (let t = 0; t < seconds; t += dt) {
      weapons.step(dt, held, true, () => {}, { onMelee: () => swings++ });
    }
    const maxSwings = Math.ceil(seconds / meleeSwingDuration(def)) + 1;
    expect(swings).toBeGreaterThan(1);
    expect(swings).toBeLessThanOrEqual(maxSwings);
  });

  it('cannot start a new swing while one is already running', () => {
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    weapons.step(1 / 60, held, true, () => {}, {});
    expect(weapons.meleeBusy).toBe(true);
    let swings = 0;
    weapons.step(1 / 60, held, true, () => {}, { onMelee: () => swings++ });
    expect(swings).toBe(0);
  });

  it('costs stamina and refuses to swing when the player cannot pay', () => {
    const def = WEAPONS.machete;
    expect(def.meleeStamina).toBeGreaterThan(0);
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    let spent = 0;
    weapons.step(1 / 60, held, true, () => {}, {
      canSpendStamina: () => true,
      spendStamina: (a) => {
        spent += a;
      },
    });
    expect(spent).toBe(def.meleeStamina);

    const fresh = new WeaponSystem(new GameState());
    fresh.selectById('machete');
    advance(fresh, 0.6);
    let swings = 0;
    fresh.step(1 / 60, held, true, () => {}, {
      canSpendStamina: () => false,
      onMelee: () => swings++,
    });
    expect(swings).toBe(0);
    expect(fresh.meleeBusy).toBe(false);
  });

  it('publishes a 0..1 swing progress for a future viewmodel', () => {
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    weapons.step(1 / 60, held, true, () => {}, {});
    const mid = weapons.meleeSnapshot();
    expect(mid.phase).not.toBe(MeleePhase.Idle);
    expect(mid.progress).toBeGreaterThanOrEqual(0);
    expect(mid.progress).toBeLessThanOrEqual(1);
  });

  it('cancels an in-flight swing when the weapon is switched away', () => {
    const held = { fire: true, firePressed: true, aim: false, reload: false };
    weapons.step(1 / 60, held, true, () => {}, {});
    expect(weapons.meleeBusy).toBe(true);
    weapons.selectById('pistol');
    expect(weapons.meleeBusy).toBe(false);
    expect(weapons.meleeState).toBe(MeleePhase.Idle);
  });

  it('never aims down sights', () => {
    const aiming = { fire: false, firePressed: false, aim: true, reload: false };
    advance(weapons, 1, aiming);
    expect(weapons.aimBlend).toBeLessThan(0.05);
  });
});

describe('four-weapon switching', () => {
  let state: GameState;
  let weapons: WeaponSystem;

  beforeEach(() => {
    state = new GameState();
    weapons = new WeaponSystem(state);
  });

  it('exposes one slot per carried weapon', () => {
    expect(weapons.slotCount).toBe(WEAPON_ORDER.length);
    expect(state.snapshot().weaponSlots).toHaveLength(WEAPON_ORDER.length);
  });

  it('marks exactly one slot active at a time', () => {
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      weapons.selectSlot(i);
      const slots = state.snapshot().weaponSlots;
      expect(slots.filter((s) => s.active)).toHaveLength(1);
      expect(slots[i].active).toBe(true);
    }
  });

  it('selects any slot directly by index', () => {
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      weapons.selectSlot(i);
      expect(weapons.current.id).toBe(WEAPON_ORDER[i]);
    }
  });

  it('ignores an out-of-range slot index', () => {
    weapons.selectSlot(99);
    expect(weapons.current.id).toBe(WEAPON_ORDER[0]);
    weapons.selectSlot(-1);
    expect(weapons.current.id).toBe(WEAPON_ORDER[0]);
  });

  it('keeps each weapon its own ammunition across all four slots', () => {
    weapons.selectById('shotgun');
    advance(weapons, 0.6);
    weapons.currentSlot.magazine = 2;
    weapons.selectById('rifle');
    advance(weapons, 0.6);
    expect(weapons.currentSlot.magazine).toBe(WEAPONS.rifle.magazineSize);
    weapons.selectById('shotgun');
    advance(weapons, 0.6);
    expect(weapons.currentSlot.magazine).toBe(2);
  });

  it('tells a listener which weapon was selected', () => {
    const seen: string[] = [];
    weapons.onWeaponSwitched = (id) => seen.push(id);
    weapons.selectById('machete');
    weapons.selectById('pistol');
    expect(seen).toEqual(['machete', 'pistol']);
  });

  it('reports whether each slot shows ammunition', () => {
    const slots = state.snapshot().weaponSlots;
    expect(slots.find((s) => s.id === 'machete')?.usesAmmo).toBe(false);
    expect(slots.find((s) => s.id === 'shotgun')?.usesAmmo).toBe(true);
  });
});

describe('WeaponSystem driven by an inventory', () => {
  it('builds its slots from the carried loadout', () => {
    const inv = new Inventory({
      weapons: ['shotgun', 'machete'],
      reserves: { shotgun: 18 },
      medical: {},
    });
    const weapons = new WeaponSystem(new GameState(), inv);
    expect(weapons.slotCount).toBe(2);
    expect(weapons.current.id).toBe('shotgun');
    expect(weapons.currentSlot.reserve).toBe(18);
  });

  it('writes spent ammunition back into the inventory', () => {
    const inv = new Inventory({
      weapons: ['pistol'],
      reserves: { pistol: 30 },
      medical: {},
    });
    const weapons = new WeaponSystem(new GameState(), inv);
    weapons.forceFire(() => {});
    expect(inv.weaponEntry('pistol')?.magazine).toBe(WEAPONS.pistol.magazineSize - 1);
  });

  it('restores the loadout on reset', () => {
    const inv = new Inventory({
      weapons: ['pistol'],
      reserves: { pistol: 30 },
      medical: {},
    });
    const weapons = new WeaponSystem(new GameState(), inv);
    for (let i = 0; i < 5; i++) weapons.forceFire(() => {});
    weapons.reset();
    expect(weapons.currentSlot.magazine).toBe(WEAPONS.pistol.magazineSize);
    expect(weapons.currentSlot.reserve).toBe(30);
  });
});
