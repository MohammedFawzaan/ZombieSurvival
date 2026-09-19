import { describe, expect, it } from 'vitest';
import { RoundPhase } from '../state/types';
import { RoundManager } from './roundManager';

const DT = 1 / 60;

function advance(rm: RoundManager, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) rm.step(DT);
}

function reachActive(rm: RoundManager): void {
  rm.begin();
  advance(rm, 10);
}

describe('RoundManager', () => {
  it('walks Ready -> RoundStarting -> Active', () => {
    const rm = new RoundManager();
    rm.begin();
    expect(rm.phase).toBe(RoundPhase.Ready);
    advance(rm, 3);
    expect(rm.phase).toBe(RoundPhase.RoundStarting);
    expect(rm.round).toBe(1);
    advance(rm, 4);
    expect(rm.phase).toBe(RoundPhase.Active);
  });

  it('does not complete a round until every required zombie is dead', () => {
    const rm = new RoundManager();
    reachActive(rm);
    const total = rm.total;
    expect(total).toBeGreaterThan(0);

    rm.notifySpawned(total);
    for (let i = 0; i < total - 1; i++) rm.notifyKilled(1);
    rm.notifyAlive(1);
    advance(rm, 5);
    expect(rm.phase).toBe(RoundPhase.Active);
    expect(rm.remaining).toBe(1);

    rm.notifyKilled(1);
    rm.notifyAlive(0);
    rm.step(DT);
    expect(rm.phase).toBe(RoundPhase.RoundComplete);
    expect(rm.remaining).toBe(0);
  });

  it('will not complete while zombies are still alive even if the kill count matches', () => {
    const rm = new RoundManager();
    reachActive(rm);
    rm.notifySpawned(rm.total);
    rm.notifyKilled(rm.total);
    rm.notifyAlive(2);
    advance(rm, 3);
    expect(rm.phase).toBe(RoundPhase.Active);
    rm.notifyAlive(0);
    rm.step(DT);
    expect(rm.phase).toBe(RoundPhase.RoundComplete);
  });

  it('will not complete while spawns are still pending', () => {
    const rm = new RoundManager();
    reachActive(rm);
    rm.notifySpawned(2);
    rm.notifyKilled(2);
    rm.notifyAlive(0);
    advance(rm, 3);
    expect(rm.phase).toBe(RoundPhase.Active);
    expect(rm.pendingSpawns).toBeGreaterThan(0);
  });

  it('runs intermission and increments the round', () => {
    const rm = new RoundManager();
    reachActive(rm);
    const firstTotal = rm.total;
    rm.notifySpawned(firstTotal);
    rm.notifyKilled(firstTotal);
    rm.notifyAlive(0);
    rm.step(DT);
    expect(rm.phase).toBe(RoundPhase.RoundComplete);
    advance(rm, 3);
    expect(rm.phase).toBe(RoundPhase.Intermission);
    advance(rm, 10);
    expect(rm.round).toBe(2);
    expect(rm.phase).toBe(RoundPhase.RoundStarting);
    expect(rm.killed).toBe(0);
    expect(rm.spawned).toBe(0);
    expect(rm.total).toBeGreaterThan(firstTotal);
  });

  it('fires lifecycle events in order', () => {
    const rm = new RoundManager();
    const log: string[] = [];
    rm.events = {
      onRoundStart: (p) => log.push(`start:${p.round}`),
      onRoundComplete: (p) => log.push(`complete:${p.round}`),
      onIntermissionStart: (n) => log.push(`inter:${n}`),
    };
    reachActive(rm);
    rm.notifySpawned(rm.total);
    rm.notifyKilled(rm.total);
    rm.notifyAlive(0);
    rm.step(DT);
    advance(rm, 3);
    expect(log).toEqual(['start:1', 'complete:1', 'inter:2']);
  });

  it('advances only off the dt it is given', () => {
    const rm = new RoundManager();
    rm.begin();
    const before = rm.phase;
    for (let i = 0; i < 1000; i++) rm.step(0);
    expect(rm.phase).toBe(before);
  });

  it('stops everything on game over', () => {
    const rm = new RoundManager();
    let over = -1;
    rm.events = { onGameOver: (r) => (over = r) };
    reachActive(rm);
    rm.gameOver();
    expect(rm.phase).toBe(RoundPhase.GameOver);
    expect(over).toBe(1);
    advance(rm, 30);
    expect(rm.phase).toBe(RoundPhase.GameOver);
    expect(rm.spawningOpen).toBe(false);
  });

  it('gates spawning to the active phase', () => {
    const rm = new RoundManager();
    rm.begin();
    expect(rm.spawningOpen).toBe(false);
    advance(rm, 10);
    expect(rm.spawningOpen).toBe(true);
    rm.notifySpawned(rm.total);
    expect(rm.spawningOpen).toBe(false);
  });

  it('never reports negative remaining', () => {
    const rm = new RoundManager();
    reachActive(rm);
    rm.notifyKilled(999);
    expect(rm.remaining).toBe(0);
    expect(rm.killed).toBe(rm.total);
  });
});
