import { describe, expect, it } from 'vitest';
import type { MapConfig } from '../maps/mapTypes';
import { HitRegion, PurchaseResult, RoundPhase, type WeaponId } from '../state/types';
import { Inventory } from '../inventory/inventory';
import { RoundMode } from './roundMode';
import type { RoundSpawnSink, SpawnRequest } from './spawnDirector';

const DT = 1 / 60;

function testMap(): MapConfig {
  return {
    id: 'city',
    name: 'Test',
    description: '',
    roundBased: true,
    playerSpawn: { x: 0, y: 0, z: 0, yaw: 0 },
    zones: [
      { id: 'spawn', name: 'Spawn', unlockedAtStart: true },
      { id: 'street', name: 'Street', unlockedAtStart: false },
    ],
    spawnZones: [
      { id: 'sz_spawn', zone: 'spawn', x: 30, z: 0, radius: 2, weight: 1 },
      { id: 'sz_street', zone: 'street', x: -30, z: 0, radius: 2, weight: 1 },
    ],
    barriers: [
      {
        id: 'gate',
        name: 'Gate',
        zone: 'spawn',
        unlocksZone: 'street',
        cost: 750,
        x: 0,
        y: 0,
        z: -2,
        yaw: 0,
        width: 2,
        height: 3,
        thickness: 0.2,
        requiresPower: false,
      },
    ],
    wallWeapons: [
      { id: 'wall_rifle', weapon: 'rifle', zone: 'spawn', cost: 1200, ammoCost: 450, x: 6, y: 0, z: 0, yaw: 0 },
    ],
    perkMachines: [
      { id: 'perk_vit', perk: 'vitality', zone: 'spawn', cost: 2500, x: 12, y: 0, z: 0, yaw: 0 },
    ],
    powerSwitch: { id: 'power', zone: 'spawn', x: 18, y: 0, z: 0, yaw: 0 },
    rewardMachines: [
      { id: 'drop', zone: 'spawn', cost: 950, requiresPower: true, x: 24, y: 0, z: 0, yaw: 0 },
    ],
  };
}

class Sink implements RoundSpawnSink {
  aliveCount = 0;
  readonly spawns: SpawnRequest[] = [];
  spawnAtPoint(r: SpawnRequest): boolean {
    this.spawns.push({ ...r });
    this.aliveCount++;
    return true;
  }
}

function setup(): { mode: RoundMode; inv: Inventory; sink: Sink; granted: WeaponId[] } {
  const mode = new RoundMode({ rewardSeed: 99 });
  const inv = new Inventory({ weapons: ['pistol'], reserves: { pistol: 0 }, medical: {} });
  const sink = new Sink();
  const granted: WeaponId[] = [];
  mode.load(testMap(), inv, sink, {
    grantWeapon: (id) => {
      granted.push(id);
      return true;
    },
  });
  mode.reset();
  return { mode, inv, sink, granted };
}

function idle(mode: RoundMode, seconds: number, x = 200, z = 200): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) mode.step(DT, x, 0, z, 0, false);
}

function press(mode: RoundMode, x: number, z: number, yaw = 0, seconds = 1.2) {
  let last = null;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const out = mode.step(DT, x, 0, z, yaw, true);
    if (out) last = out;
  }
  mode.step(DT, x, 0, z, yaw, false);
  return last;
}

describe('RoundMode', () => {
  it('starts a round and spawns only from unlocked zones', () => {
    const { mode, sink } = setup();
    idle(mode, 10);
    expect(mode.phase).toBe(RoundPhase.Active);
    idle(mode, 30);
    expect(sink.spawns.length).toBeGreaterThan(0);
    for (const s of sink.spawns) expect(s.zoneId).toBe('spawn');
  });

  it('completes a round only after every zombie dies', () => {
    const { mode, sink } = setup();
    idle(mode, 10);
    const total = mode.rounds.total;
    idle(mode, 120);
    expect(mode.rounds.spawned).toBe(total);
    expect(mode.phase).toBe(RoundPhase.Active);

    for (let i = 0; i < total; i++) {
      sink.aliveCount--;
      mode.registerHit(50, HitRegion.Torso, true, false);
    }
    mode.step(DT, 200, 0, 200, 0, false);
    expect(mode.phase).toBe(RoundPhase.RoundComplete);
    expect(mode.stats.kills).toBe(total);
  });

  it('awards points for hits and kills and pays a round-clear bonus', () => {
    const { mode } = setup();
    idle(mode, 10);
    const start = mode.economy.points;
    mode.registerHit(30, HitRegion.Head, false, false);
    expect(mode.economy.points).toBeGreaterThan(start);
    const afterHit = mode.economy.points;
    mode.registerHit(30, HitRegion.Head, true, true);
    expect(mode.economy.points - afterHit).toBeGreaterThan(100);
  });

  it('opens a barrier, deducts points once and opens the zone to spawns', () => {
    const { mode, sink } = setup();
    idle(mode, 10);
    mode.economy.points = 1000;
    const out = press(mode, 0, 0, 0);
    expect(out?.result).toBe(PurchaseResult.Ok);
    expect(out?.unlockedZone).toBe('street');
    expect(mode.economy.points).toBe(250);
    expect(mode.stats.doorsOpened).toBe(1);

    expect(mode.barriers.isZoneUnlocked('street')).toBe(true);

    sink.spawns.length = 0;
    const plan = mode.rounds.plan;
    for (let i = 0; i < 4000 && sink.spawns.length < 20; i++) {
      sink.aliveCount = 0;
      mode.director.step(DT, plan, 50, sink, { x: 0, z: 0, yaw: 0 });
    }
    expect(sink.spawns.some((s) => s.zoneId === 'street')).toBe(true);
  });

  it('refuses a barrier the player cannot afford', () => {
    const { mode } = setup();
    idle(mode, 10);
    mode.economy.points = 100;
    const out = press(mode, 0, 0, 0);
    expect(out?.result).toBe(PurchaseResult.Insufficient);
    expect(out?.performed).toBe(false);
    expect(mode.economy.points).toBe(100);
    expect(mode.barriers.isZoneUnlocked('street')).toBe(false);
  });

  it('buys a wall weapon through the real inventory hook', () => {
    const { mode, granted } = setup();
    idle(mode, 10);
    mode.economy.points = 5000;
    const out = press(mode, 4.5, 0, -Math.PI / 2);
    expect(out?.result).toBe(PurchaseResult.Ok);
    expect(out?.weapon).toBe('rifle');
    expect(granted).toEqual(['rifle']);
    expect(mode.economy.points).toBe(3800);
    expect(mode.stats.weaponsBought).toBe(1);
  });

  it('refuses a perk until the power switch is thrown, then installs it', () => {
    const { mode } = setup();
    idle(mode, 10);
    mode.economy.points = 9000;

    const blocked = press(mode, 10.5, 0, -Math.PI / 2);
    expect(blocked?.result).toBe(PurchaseResult.NeedsPower);
    expect(mode.perks.has('vitality')).toBe(false);
    expect(mode.economy.points).toBe(9000);

    const powerOut = press(mode, 16.5, 0, -Math.PI / 2);
    expect(powerOut?.result).toBe(PurchaseResult.Ok);
    expect(mode.power.on).toBe(true);

    const perkOut = press(mode, 10.5, 0, -Math.PI / 2);
    expect(perkOut?.result).toBe(PurchaseResult.Ok);
    expect(mode.perks.has('vitality')).toBe(true);
    expect(mode.perks.maxHealthFor(100)).toBe(175);
    expect(mode.economy.points).toBe(6500);
  });

  it('rolls a reward only with power and grants it to the inventory', () => {
    const { mode, inv } = setup();
    idle(mode, 10);
    mode.economy.points = 9000;
    expect(press(mode, 22.5, 0, -Math.PI / 2)?.result).toBe(PurchaseResult.NeedsPower);
    press(mode, 16.5, 0, -Math.PI / 2);
    const out = press(mode, 22.5, 0, -Math.PI / 2);
    expect(out?.result).toBe(PurchaseResult.Ok);
    expect(out?.rewardLabel).toBeTruthy();
    expect(mode.stats.rewardsRolled).toBe(1);
    const gotSomething = (out?.grantedCount ?? 0) > 0 || out?.newWeapon === true;
    expect(gotSomething).toBe(true);
    expect(inv).toBeDefined();
  });

  it('exposes a single interaction hint for the HUD', () => {
    const { mode } = setup();
    idle(mode, 10);
    mode.step(DT, 200, 0, 200, 0, false);
    expect(mode.interactHint).toBeNull();
    mode.step(DT, 0, 0, 0, 0, false);
    expect(mode.interactHint).toContain('GATE');
  });

  it('is deterministic across two identical runs', () => {
    const a = setup();
    const b = setup();
    idle(a.mode, 60);
    idle(b.mode, 60);
    expect(a.sink.spawns).toEqual(b.sink.spawns);
    expect(a.mode.rounds.spawned).toBe(b.mode.rounds.spawned);
  });

  it('stops spawning once game over is declared', () => {
    const { mode, sink } = setup();
    idle(mode, 10);
    mode.rounds.gameOver();
    const before = sink.spawns.length;
    idle(mode, 30);
    expect(sink.spawns.length).toBe(before);
    expect(mode.phase).toBe(RoundPhase.GameOver);
  });
});
