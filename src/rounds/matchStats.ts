import type { HitRegion } from '../state/types';

export interface MatchStatsSnapshot {
  roundsSurvived: number;
  highestRound: number;
  kills: number;
  headshots: number;
  meleeKills: number;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  pointsEarned: number;
  pointsSpent: number;
  doorsOpened: number;
  perksBought: number;
  weaponsBought: number;
  ammoBought: number;
  rewardsRolled: number;
  powerActivated: boolean;
  survivalSeconds: number;
}

export class MatchStats {
  roundsSurvived = 0;
  highestRound = 0;
  kills = 0;
  headshots = 0;
  meleeKills = 0;
  damageDealt = 0;
  damageTaken = 0;
  shotsFired = 0;
  shotsHit = 0;
  pointsEarned = 0;
  pointsSpent = 0;
  doorsOpened = 0;
  perksBought = 0;
  weaponsBought = 0;
  ammoBought = 0;
  rewardsRolled = 0;
  powerActivated = false;
  survivalSeconds = 0;

  private readonly snap: MatchStatsSnapshot = {
    roundsSurvived: 0,
    highestRound: 0,
    kills: 0,
    headshots: 0,
    meleeKills: 0,
    damageDealt: 0,
    damageTaken: 0,
    shotsFired: 0,
    shotsHit: 0,
    accuracy: 0,
    pointsEarned: 0,
    pointsSpent: 0,
    doorsOpened: 0,
    perksBought: 0,
    weaponsBought: 0,
    ammoBought: 0,
    rewardsRolled: 0,
    powerActivated: false,
    survivalSeconds: 0,
  };

  reset(): void {
    this.roundsSurvived = 0;
    this.highestRound = 0;
    this.kills = 0;
    this.headshots = 0;
    this.meleeKills = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.pointsEarned = 0;
    this.pointsSpent = 0;
    this.doorsOpened = 0;
    this.perksBought = 0;
    this.weaponsBought = 0;
    this.ammoBought = 0;
    this.rewardsRolled = 0;
    this.powerActivated = false;
    this.survivalSeconds = 0;
  }

  tick(dt: number): void {
    this.survivalSeconds += dt;
  }

  recordRoundStart(round: number): void {
    this.highestRound = Math.max(this.highestRound, round);
  }

  recordRoundComplete(round: number): void {
    this.roundsSurvived = Math.max(this.roundsSurvived, round);
    this.highestRound = Math.max(this.highestRound, round);
  }

  recordShot(count = 1): void {
    this.shotsFired += count;
  }

  recordDamage(amount: number, region: HitRegion): void {
    if (amount <= 0) return;
    this.damageDealt += amount;
    this.shotsHit++;
    if (region === 'head') this.headshots++;
  }

  recordDamageTaken(amount: number): void {
    this.damageTaken += Math.max(0, amount);
  }

  recordKill(melee: boolean): void {
    this.kills++;
    if (melee) this.meleeKills++;
  }

  recordPoints(earned: number, spent: number): void {
    this.pointsEarned = earned;
    this.pointsSpent = spent;
  }

  recordDoorOpened(): void {
    this.doorsOpened++;
  }

  recordPerkBought(): void {
    this.perksBought++;
  }

  recordWeaponBought(): void {
    this.weaponsBought++;
  }

  recordAmmoBought(): void {
    this.ammoBought++;
  }

  recordRewardRolled(): void {
    this.rewardsRolled++;
  }

  recordPowerActivated(): void {
    this.powerActivated = true;
  }

  snapshot(): MatchStatsSnapshot {
    const s = this.snap;
    s.roundsSurvived = this.roundsSurvived;
    s.highestRound = this.highestRound;
    s.kills = this.kills;
    s.headshots = this.headshots;
    s.meleeKills = this.meleeKills;
    s.damageDealt = Math.round(this.damageDealt);
    s.damageTaken = Math.round(this.damageTaken);
    s.shotsFired = this.shotsFired;
    s.shotsHit = this.shotsHit;
    s.accuracy = this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0;
    s.pointsEarned = this.pointsEarned;
    s.pointsSpent = this.pointsSpent;
    s.doorsOpened = this.doorsOpened;
    s.perksBought = this.perksBought;
    s.weaponsBought = this.weaponsBought;
    s.ammoBought = this.ammoBought;
    s.rewardsRolled = this.rewardsRolled;
    s.powerActivated = this.powerActivated;
    s.survivalSeconds = this.survivalSeconds;
    return s;
  }
}
