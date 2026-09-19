import { describe, expect, it } from 'vitest';
import type { MapConfig } from '../maps/mapTypes';
import { InteractKind, PurchaseResult } from '../state/types';
import { InteractionSystem, buildInteractables } from './interactionSystem';
import type { Interactable, InteractionOutcome } from './interactionTypes';

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
      { id: 'locked', name: 'Locked', unlockedAtStart: false },
    ],
    spawnZones: [],
    barriers: [
      {
        id: 'gate',
        name: 'Gate',
        zone: 'spawn',
        unlocksZone: 'locked',
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
      { id: 'wall_rifle', weapon: 'rifle', zone: 'locked', cost: 1200, ammoCost: 450, x: 40, y: 0, z: 0, yaw: 0 },
    ],
    perkMachines: [
      { id: 'perk_vit', perk: 'vitality', zone: 'spawn', cost: 2500, x: 100, y: 0, z: 0, yaw: 0 },
    ],
    powerSwitch: { id: 'power', zone: 'spawn', x: 60, y: 0, z: 0, yaw: 0 },
    rewardMachines: [
      { id: 'drop', zone: 'spawn', cost: 950, requiresPower: true, x: 80, y: 0, z: 0, yaw: 0 },
    ],
  };
}

function handlers(
  availability: (t: Interactable) => PurchaseResult,
  performed: string[],
  unlocked = new Set(['spawn']),
) {
  return {
    availability,
    perform: (t: Interactable, out: InteractionOutcome) => {
      performed.push(t.id);
      out.result = PurchaseResult.Ok;
    },
    isZoneUnlocked: (zone: string) => unlocked.has(zone),
  };
}

describe('buildInteractables', () => {
  it('creates one entry per feature plus a paired ammo entry', () => {
    const list = buildInteractables(testMap());
    const kinds = list.map((i) => i.kind);
    expect(kinds).toContain(InteractKind.Barrier);
    expect(kinds).toContain(InteractKind.WallWeapon);
    expect(kinds).toContain(InteractKind.WallAmmo);
    expect(kinds).toContain(InteractKind.PerkMachine);
    expect(kinds).toContain(InteractKind.PowerSwitch);
    expect(kinds).toContain(InteractKind.RewardMachine);
    expect(list.find((i) => i.id === 'wall_rifle:ammo')?.cost).toBe(450);
  });
});

describe('InteractionSystem', () => {
  it('produces a hold prompt with the cost for a barrier', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    sys.step(DT, { x: 0, y: 0, z: 0, yaw: 0, pressed: false });
    expect(sys.prompt.prompt).toBe('HOLD E — OPEN GATE — 750');
  });

  it('ignores interactables in locked zones', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    sys.step(DT, { x: 40, y: 0, z: 0.5, yaw: Math.PI, pressed: false });
    expect(sys.prompt.target).toBeNull();
    expect(sys.prompt.prompt).toBeNull();
  });

  it('requires the full hold before performing and fires exactly once', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    const input = { x: 0, y: 0, z: 0, yaw: 0, pressed: true };

    let outcome: InteractionOutcome | null = null;
    for (let i = 0; i < 10; i++) outcome = sys.step(DT, input);
    expect(outcome).toBeNull();
    expect(performed).toHaveLength(0);
    expect(sys.prompt.holdProgress).toBeGreaterThan(0);

    for (let i = 0; i < 60 && performed.length === 0; i++) outcome = sys.step(DT, input);
    expect(performed).toEqual(['gate']);
    expect(outcome?.performed).toBe(true);

    for (let i = 0; i < 120; i++) sys.step(DT, input);
    expect(performed).toEqual(['gate']);
  });

  it('allows a second interaction only after the key is released', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    const held = { x: 0, y: 0, z: 0, yaw: 0, pressed: true };
    for (let i = 0; i < 120; i++) sys.step(DT, held);
    expect(performed).toHaveLength(1);
    sys.step(DT, { ...held, pressed: false });
    for (let i = 0; i < 120; i++) sys.step(DT, held);
    expect(performed).toHaveLength(2);
  });

  it('reports insufficient funds without performing', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Insufficient, performed));
    const input = { x: 0, y: 0, z: 0, yaw: 0, pressed: false };
    sys.step(DT, input);
    expect(sys.prompt.prompt).toContain('NEED MORE POINTS');
    const outcome = sys.step(DT, { ...input, pressed: true });
    expect(outcome?.performed).toBe(false);
    expect(outcome?.result).toBe(PurchaseResult.Insufficient);
    expect(performed).toHaveLength(0);
  });

  it('shows a power-required prompt and refuses the press', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.NeedsPower, performed));
    sys.step(DT, { x: 0, y: 0, z: 0, yaw: 0, pressed: false });
    expect(sys.prompt.prompt).toContain('POWER REQUIRED');
    for (let i = 0; i < 120; i++) sys.step(DT, { x: 0, y: 0, z: 0, yaw: 0, pressed: true });
    expect(performed).toHaveLength(0);
  });

  it('clears the prompt when the player walks away', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    sys.step(DT, { x: 0, y: 0, z: 0, yaw: 0, pressed: false });
    expect(sys.prompt.prompt).not.toBeNull();
    sys.step(DT, { x: 500, y: 0, z: 500, yaw: 0, pressed: false });
    expect(sys.prompt.prompt).toBeNull();
    expect(sys.prompt.target).toBeNull();
  });

  it('uses a press prompt with the install verb for a perk machine', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    sys.step(DT, { x: 98, y: 0, z: 0, yaw: -Math.PI / 2, pressed: false });
    expect(sys.prompt.target?.id).toBe('perk_vit');
    expect(sys.prompt.prompt).toBe('PRESS E — INSTALL VITALITY SERUM — 2500');
    const outcome = sys.step(DT, { x: 98, y: 0, z: 0, yaw: -Math.PI / 2, pressed: true });
    expect(outcome?.performed).toBe(true);
    expect(performed).toEqual(['perk_vit']);
  });

  it('requires facing a machine but not a barrier', () => {
    const sys = new InteractionSystem();
    const performed: string[] = [];
    sys.load(testMap(), handlers(() => PurchaseResult.Ok, performed));
    sys.step(DT, { x: 0, y: 0, z: -3.2, yaw: 0, pressed: false });
    expect(sys.prompt.target?.kind).toBe(InteractKind.Barrier);
  });
});
