import { describe, expect, it } from 'vitest';
import type { MapConfig } from '../maps/mapTypes';
import { PurchaseResult } from '../state/types';
import { PointsEconomy } from '../economy/points';
import { BarrierSystem } from './barriers';
import { PowerSystem } from './power';

function testMap(): MapConfig {
  return {
    id: 'city',
    name: 'Test City',
    description: '',
    roundBased: true,
    playerSpawn: { x: 0, y: 0, z: 0, yaw: 0 },
    zones: [
      { id: 'spawn', name: 'Spawn', unlockedAtStart: true },
      { id: 'street', name: 'Street', unlockedAtStart: false },
      { id: 'vault', name: 'Vault', unlockedAtStart: false },
    ],
    spawnZones: [],
    barriers: [
      {
        id: 'gate_street',
        name: 'Gate',
        zone: 'spawn',
        unlocksZone: 'street',
        cost: 750,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        width: 2,
        height: 3,
        thickness: 0.2,
        requiresPower: false,
      },
      {
        id: 'gate_vault',
        name: 'Vault Door',
        zone: 'street',
        unlocksZone: 'vault',
        cost: 1250,
        x: 10,
        y: 0,
        z: 0,
        yaw: 0,
        width: 2,
        height: 3,
        thickness: 0.2,
        requiresPower: true,
      },
    ],
    wallWeapons: [],
    perkMachines: [],
    powerSwitch: null,
    rewardMachines: [],
  };
}

function setup(): { power: PowerSystem; barriers: BarrierSystem; map: MapConfig } {
  const power = new PowerSystem();
  const barriers = new BarrierSystem(power);
  const map = testMap();
  barriers.load(map);
  return { power, barriers, map };
}

function rich(points: number): PointsEconomy {
  const e = new PointsEconomy();
  e.points = points;
  return e;
}

describe('BarrierSystem', () => {
  it('starts with only the start zones unlocked', () => {
    const { barriers } = setup();
    expect(barriers.isZoneUnlocked('spawn')).toBe(true);
    expect(barriers.isZoneUnlocked('street')).toBe(false);
    expect(barriers.unlockedZones.size).toBe(1);
  });

  it('deducts exactly once and unlocks the zone', () => {
    const { barriers } = setup();
    const e = rich(1000);
    const out = barriers.purchase('gate_street', e);
    expect(out.result).toBe(PurchaseResult.Ok);
    expect(out.unlockedZone).toBe('street');
    expect(out.requiresCollisionUpdate).toBe(true);
    expect(e.points).toBe(250);
    expect(e.spent).toBe(750);
    expect(barriers.isZoneUnlocked('street')).toBe(true);
    expect(barriers.openedCount).toBe(1);
  });

  it('refuses a second purchase of the same barrier and charges nothing', () => {
    const { barriers } = setup();
    const e = rich(5000);
    barriers.purchase('gate_street', e);
    const balanceAfter = e.points;
    const second = barriers.purchase('gate_street', e);
    expect(second.result).toBe(PurchaseResult.AlreadyOwned);
    expect(e.points).toBe(balanceAfter);
    expect(e.spent).toBe(750);
    expect(barriers.openedCount).toBe(1);
  });

  it('refuses insufficient funds without opening anything', () => {
    const { barriers } = setup();
    const e = rich(749);
    const out = barriers.purchase('gate_street', e);
    expect(out.result).toBe(PurchaseResult.Insufficient);
    expect(e.points).toBe(749);
    expect(e.spent).toBe(0);
    expect(barriers.isZoneUnlocked('street')).toBe(false);
    expect(barriers.isOpen('gate_street')).toBe(false);
  });

  it('refuses a powered barrier until the power is on', () => {
    const { power, barriers } = setup();
    const e = rich(9000);
    expect(barriers.availability('gate_vault')).toBe(PurchaseResult.NeedsPower);
    const blocked = barriers.purchase('gate_vault', e);
    expect(blocked.result).toBe(PurchaseResult.NeedsPower);
    expect(e.spent).toBe(0);

    power.activate('main');
    const allowed = barriers.purchase('gate_vault', e);
    expect(allowed.result).toBe(PurchaseResult.Ok);
    expect(e.spent).toBe(1250);
    expect(barriers.isZoneUnlocked('vault')).toBe(true);
  });

  it('reports an unknown barrier as unavailable', () => {
    const { barriers } = setup();
    const e = rich(9999);
    expect(barriers.purchase('nope', e).result).toBe(PurchaseResult.Unavailable);
    expect(e.spent).toBe(0);
  });

  it('fires the opened and unlocked callbacks once each', () => {
    const { barriers } = setup();
    const opened: string[] = [];
    const zones: string[] = [];
    barriers.onBarrierOpened = (d) => opened.push(d.id);
    barriers.onZoneUnlocked = (z) => zones.push(z);
    const e = rich(5000);
    barriers.purchase('gate_street', e);
    barriers.purchase('gate_street', e);
    expect(opened).toEqual(['gate_street']);
    expect(zones).toEqual(['street']);
  });

  it('relocks everything on reset', () => {
    const { barriers, map } = setup();
    barriers.purchase('gate_street', rich(5000));
    barriers.reset(map);
    expect(barriers.isZoneUnlocked('street')).toBe(false);
    expect(barriers.openedCount).toBe(0);
  });
});

describe('PowerSystem', () => {
  it('is off until activated and only activates once', () => {
    const p = new PowerSystem();
    expect(p.on).toBe(false);
    expect(p.activate('main').result).toBe(PurchaseResult.Ok);
    expect(p.on).toBe(true);
    expect(p.sourceSwitchId).toBe('main');
    expect(p.activate('main').result).toBe(PurchaseResult.AlreadyOwned);
  });

  it('fires the callback exactly once', () => {
    const p = new PowerSystem();
    let count = 0;
    p.onPowerOn = () => count++;
    p.activate('main');
    p.activate('main');
    expect(count).toBe(1);
    p.reset();
    expect(p.on).toBe(false);
  });
});
