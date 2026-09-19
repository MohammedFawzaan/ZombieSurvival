import { describe, expect, it } from 'vitest';
import type { SpawnZoneDef } from '../maps/mapTypes';
import { planForRound } from './difficulty';
import { SpawnDirector, type RoundSpawnSink, type SpawnRequest } from './spawnDirector';

const DT = 1 / 60;

const ZONES: SpawnZoneDef[] = [
  { id: 'a', zone: 'spawn', x: 40, z: 0, radius: 3, weight: 1 },
  { id: 'b', zone: 'spawn', x: -40, z: 0, radius: 3, weight: 1 },
  { id: 'c', zone: 'locked', x: 0, z: 60, radius: 3, weight: 5 },
];

class RecordingSink implements RoundSpawnSink {
  aliveCount = 0;
  readonly spawns: SpawnRequest[] = [];
  constructor(private readonly cap = Infinity) {}
  spawnAtPoint(r: SpawnRequest): boolean {
    if (this.aliveCount >= this.cap) return false;
    this.spawns.push({ ...r });
    this.aliveCount++;
    return true;
  }
}

function director(seed = 7): SpawnDirector {
  const d = new SpawnDirector({ seed });
  d.setZones(ZONES);
  d.setUnlockedZones(new Set(['spawn']));
  return d;
}

function run(d: SpawnDirector, sink: RecordingSink, seconds: number, pendingStart = 50): void {
  const plan = planForRound(1);
  let pending = pendingStart;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const n = d.step(DT, plan, pending, sink, { x: 0, z: 0, yaw: 0 });
    pending -= n;
  }
}

describe('SpawnDirector', () => {
  it('only uses spawn zones in unlocked areas', () => {
    const d = director();
    const sink = new RecordingSink();
    run(d, sink, 30);
    expect(sink.spawns.length).toBeGreaterThan(0);
    for (const s of sink.spawns) expect(s.zoneId).toBe('spawn');
  });

  it('starts using a zone once its area is unlocked', () => {
    const d = director();
    d.setUnlockedZones(new Set(['spawn', 'locked']));
    const sink = new RecordingSink();
    run(d, sink, 60);
    expect(sink.spawns.some((s) => s.spawnZoneId === 'c')).toBe(true);
  });

  it('never spawns on top of the player', () => {
    const d = director();
    const sink = new RecordingSink();
    run(d, sink, 60);
    for (const s of sink.spawns) {
      expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(14);
    }
  });

  it('respects the max-alive cap', () => {
    const plan = planForRound(1);
    const d = director();
    const sink = new RecordingSink();
    sink.aliveCount = plan.maxAlive;
    run(d, sink, 20);
    expect(sink.spawns).toHaveLength(0);
  });

  it('spawns nothing when nothing is pending', () => {
    const d = director();
    const sink = new RecordingSink();
    const plan = planForRound(1);
    for (let i = 0; i < 600; i++) d.step(DT, plan, 0, sink, { x: 0, z: 0, yaw: 0 });
    expect(sink.spawns).toHaveLength(0);
  });

  it('spawns nothing when no zone is unlocked', () => {
    const d = director();
    d.setUnlockedZones(new Set<string>());
    expect(d.hasUsableZone).toBe(false);
    const sink = new RecordingSink();
    run(d, sink, 30);
    expect(sink.spawns).toHaveLength(0);
  });

  it('is deterministic for a given seed', () => {
    const a = director(1234);
    const b = director(1234);
    const sa = new RecordingSink();
    const sb = new RecordingSink();
    run(a, sa, 45);
    run(b, sb, 45);
    expect(sa.spawns).toEqual(sb.spawns);
    expect(sa.spawns.length).toBeGreaterThan(3);
  });

  it('paces spawns roughly to the round interval', () => {
    const plan = planForRound(1);
    const d = director();
    d.beginRound(plan);
    const sink = new RecordingSink();
    run(d, sink, 10, 200);
    expect(sink.spawns.length).toBeLessThanOrEqual(Math.ceil(10 / plan.spawnInterval) * 3 + 3);
  });

  it('carries the round health and speed multipliers into each request', () => {
    const d = director();
    const sink = new RecordingSink();
    const plan = planForRound(12);
    let pending = 40;
    for (let i = 0; i < 1200; i++) {
      pending -= d.step(DT, plan, pending, sink, { x: 0, z: 0, yaw: 0 });
    }
    expect(sink.spawns.length).toBeGreaterThan(0);
    for (const s of sink.spawns) {
      expect(s.healthMultiplier).toBe(plan.healthMultiplier);
      expect(s.speedMultiplier).toBe(plan.speedMultiplier);
    }
  });
});
