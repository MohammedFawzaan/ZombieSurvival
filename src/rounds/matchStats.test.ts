import { describe, expect, it } from 'vitest';
import { HitRegion } from '../state/types';
import { MatchStats } from './matchStats';

describe('MatchStats', () => {
  it('tracks kills, headshots and melee kills separately', () => {
    const s = new MatchStats();
    s.recordDamage(40, HitRegion.Head);
    s.recordKill(false);
    s.recordDamage(20, HitRegion.Torso);
    s.recordKill(true);
    const snap = s.snapshot();
    expect(snap.kills).toBe(2);
    expect(snap.headshots).toBe(1);
    expect(snap.meleeKills).toBe(1);
    expect(snap.damageDealt).toBe(60);
  });

  it('computes accuracy from shots fired and hit', () => {
    const s = new MatchStats();
    expect(s.snapshot().accuracy).toBe(0);
    s.recordShot(4);
    s.recordDamage(10, HitRegion.Torso);
    s.recordDamage(10, HitRegion.Torso);
    expect(s.snapshot().accuracy).toBeCloseTo(0.5, 6);
  });

  it('keeps the highest round reached even if the last round was not survived', () => {
    const s = new MatchStats();
    s.recordRoundComplete(4);
    s.recordRoundStart(5);
    const snap = s.snapshot();
    expect(snap.roundsSurvived).toBe(4);
    expect(snap.highestRound).toBe(5);
  });

  it('accumulates survival time off dt only', () => {
    const s = new MatchStats();
    for (let i = 0; i < 120; i++) s.tick(1 / 60);
    expect(s.snapshot().survivalSeconds).toBeCloseTo(2, 4);
  });

  it('counts each purchase category', () => {
    const s = new MatchStats();
    s.recordDoorOpened();
    s.recordDoorOpened();
    s.recordPerkBought();
    s.recordWeaponBought();
    s.recordAmmoBought();
    s.recordRewardRolled();
    s.recordPowerActivated();
    const snap = s.snapshot();
    expect(snap.doorsOpened).toBe(2);
    expect(snap.perksBought).toBe(1);
    expect(snap.weaponsBought).toBe(1);
    expect(snap.ammoBought).toBe(1);
    expect(snap.rewardsRolled).toBe(1);
    expect(snap.powerActivated).toBe(true);
  });

  it('zeroes everything on reset', () => {
    const s = new MatchStats();
    s.recordKill(true);
    s.recordDoorOpened();
    s.tick(5);
    s.reset();
    const snap = s.snapshot();
    expect(snap.kills).toBe(0);
    expect(snap.doorsOpened).toBe(0);
    expect(snap.survivalSeconds).toBe(0);
    expect(snap.powerActivated).toBe(false);
  });
});
