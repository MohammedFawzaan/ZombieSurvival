import type { SpawnZoneDef, ZoneId } from '../maps/mapTypes';
import type { ZombieKind } from '../zombies/zombieTypes';
import { makeRng } from '../util/math';
import { pickKind, type RoundPlan } from './difficulty';

export interface SpawnRequest {
  x: number;
  z: number;
  kind: ZombieKind;
  healthMultiplier: number;
  speedMultiplier: number;
  zoneId: ZoneId;
  spawnZoneId: string;
}

export interface RoundSpawnSink {
  spawnAtPoint(request: SpawnRequest): boolean;
  aliveCount: number;
}

export interface SpawnDirectorConfig {
  seed?: number;
  minPlayerDistance?: number;
  maxPlayerDistance?: number;
  frontConeDot?: number;
  frontConeDistance?: number;
  jitterRadiusScale?: number;
  attemptsPerSpawn?: number;
  burstLimit?: number;
  spawnsPerStep?: number;
}

export interface PlayerProbe {
  x: number;
  z: number;
  yaw: number;
}

export interface SpawnPlacement {
  distance: number;
  facingDot: number;
}

const DEFAULTS = {
  seed: 1337,
  minPlayerDistance: 18,
  maxPlayerDistance: 130,
  frontConeDot: 0.62,
  frontConeDistance: 34,
  jitterRadiusScale: 0.85,
  attemptsPerSpawn: 12,
  burstLimit: 4,
  spawnsPerStep: 2,
};

export class SpawnDirector {
  private readonly rng: () => number;
  private readonly cfg: Required<SpawnDirectorConfig>;

  private zones: readonly SpawnZoneDef[] = [];
  private unlocked: ReadonlySet<ZoneId> = new Set<ZoneId>();

  private timer = 0;
  private interval = 3;
  private burstRemaining = 0;

  private readonly candidates: SpawnZoneDef[] = [];
  private readonly placements: SpawnPlacement[] = [];
  private readonly request: SpawnRequest = {
    x: 0,
    z: 0,
    kind: 'walker',
    healthMultiplier: 1,
    speedMultiplier: 1,
    zoneId: '',
    spawnZoneId: '',
  };

  constructor(config: SpawnDirectorConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config } as Required<SpawnDirectorConfig>;
    this.rng = makeRng(this.cfg.seed);
  }

  setZones(zones: readonly SpawnZoneDef[]): void {
    this.zones = zones;
  }

  setUnlockedZones(unlocked: ReadonlySet<ZoneId>): void {
    this.unlocked = unlocked;
  }

  reset(): void {
    this.timer = 0;
    this.burstRemaining = 0;
    this.placements.length = 0;
  }

  beginRound(plan: RoundPlan): void {
    this.interval = plan.spawnInterval;
    this.burstRemaining = 0;
    this.timer = Math.min(1, plan.spawnInterval * 0.35);
  }

  get hasUsableZone(): boolean {
    for (const z of this.zones) if (this.unlocked.has(z.zone)) return true;
    return false;
  }

  private collectCandidates(player: PlayerProbe): void {
    this.candidates.length = 0;
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    for (const zone of this.zones) {
      if (!this.unlocked.has(zone.zone)) continue;
      if (zone.weight <= 0) continue;
      const dx = zone.x - player.x;
      const dz = zone.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < this.cfg.minPlayerDistance) continue;
      if (dist > this.cfg.maxPlayerDistance) continue;
      if (dist < this.cfg.frontConeDistance && dist > 0.0001) {
        const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;
        if (dot > this.cfg.frontConeDot) continue;
      }
      this.candidates.push(zone);
    }
    if (this.candidates.length > 0) return;

    let leastFrontal: SpawnZoneDef | null = null;
    let leastFrontalDot = Infinity;
    for (const zone of this.zones) {
      if (!this.unlocked.has(zone.zone) || zone.weight <= 0) continue;
      const dx = zone.x - player.x;
      const dz = zone.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < this.cfg.minPlayerDistance) continue;
      const dot = dist > 0.0001 ? (dx / dist) * forwardX + (dz / dist) * forwardZ : 1;
      if (dot < leastFrontalDot) {
        leastFrontalDot = dot;
        leastFrontal = zone;
      }
    }
    if (leastFrontal) this.candidates.push(leastFrontal);
  }

  private recordPlacement(x: number, z: number, player: PlayerProbe): void {
    const dx = x - player.x;
    const dz = z - player.z;
    const dist = Math.hypot(dx, dz);
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const dot = dist > 0.0001 ? (dx / dist) * forwardX + (dz / dist) * forwardZ : 1;
    this.placements.push({ distance: dist, facingDot: dot });
    if (this.placements.length > 64) this.placements.shift();
  }

  get recentPlacements(): readonly SpawnPlacement[] {
    return this.placements;
  }

  private pickZone(): SpawnZoneDef | null {
    let total = 0;
    for (const z of this.candidates) total += z.weight;
    if (total <= 0) return null;
    let roll = this.rng() * total;
    for (const z of this.candidates) {
      roll -= z.weight;
      if (roll <= 0) return z;
    }
    return this.candidates[this.candidates.length - 1] ?? null;
  }

  private fillRequest(zone: SpawnZoneDef, plan: RoundPlan, player: PlayerProbe): boolean {
    const jitter = zone.radius * this.cfg.jitterRadiusScale;
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    let fallbackX = 0;
    let fallbackZ = 0;
    let fallbackDot = Infinity;
    let hasFallback = false;

    for (let attempt = 0; attempt < this.cfg.attemptsPerSpawn; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const radius = jitter * Math.sqrt(this.rng());
      const x = zone.x + Math.cos(angle) * radius;
      const z = zone.z + Math.sin(angle) * radius;
      const dx = x - player.x;
      const dz = z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < this.cfg.minPlayerDistance) continue;

      const dot = dist > 0.0001 ? (dx / dist) * forwardX + (dz / dist) * forwardZ : 1;
      if (dist < this.cfg.frontConeDistance && dot > this.cfg.frontConeDot) {
        if (dot < fallbackDot) {
          fallbackDot = dot;
          fallbackX = x;
          fallbackZ = z;
          hasFallback = true;
        }
        continue;
      }
      return this.commitRequest(x, z, zone, plan, player);
    }

    if (hasFallback) return this.commitRequest(fallbackX, fallbackZ, zone, plan, player);
    return false;
  }

  private commitRequest(
    x: number,
    z: number,
    zone: SpawnZoneDef,
    plan: RoundPlan,
    player: PlayerProbe,
  ): boolean {
    this.request.x = x;
    this.request.z = z;
    this.recordPlacement(x, z, player);
    this.request.kind = pickKind(plan.composition, this.rng());
    this.request.healthMultiplier = plan.healthMultiplier;
    this.request.speedMultiplier = plan.speedMultiplier;
    this.request.zoneId = zone.zone;
    this.request.spawnZoneId = zone.id;
    return true;
  }

  step(
    dt: number,
    plan: RoundPlan,
    pending: number,
    sink: RoundSpawnSink,
    player: PlayerProbe,
  ): number {
    if (pending <= 0) return 0;
    this.interval = plan.spawnInterval;
    this.timer -= dt;
    if (this.timer > 0) return 0;

    if (this.burstRemaining <= 0) this.burstRemaining = this.cfg.burstLimit;

    let spawned = 0;
    const burst = Math.min(this.burstRemaining, this.cfg.spawnsPerStep, pending);
    for (let i = 0; i < burst; i++) {
      if (sink.aliveCount >= plan.maxAlive) break;
      this.collectCandidates(player);
      const zone = this.pickZone();
      if (!zone) break;
      if (!this.fillRequest(zone, plan, player)) break;
      if (!sink.spawnAtPoint(this.request)) break;
      spawned++;
    }

    this.burstRemaining -= spawned;
    const continuing = spawned > 0 && this.burstRemaining > 0 && pending > spawned;
    if (!continuing) this.burstRemaining = 0;
    this.timer = continuing ? 0 : spawned > 0 ? this.interval : Math.min(this.interval, 0.4);
    return spawned;
  }
}
