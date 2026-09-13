import type { PhysicsWorld } from '../physics/physics';
import { CharacterBody } from '../physics/character';
import type { Terrain } from '../world/terrain';
import type { Player } from '../player/player';
import type { GameState } from '../state/gameState';
import type { NoiseSystem } from '../world/noiseEvents';
import { SpatialGrid } from '../world/spatialGrid';
import { ZombieState, HitRegion } from '../state/types';
import { ZOMBIES, pickZombieKind, type ZombieDef, type ZombieKind } from './zombieTypes';
import {
  angleDelta,
  clamp,
  moveTowardsAngle,
  randRange,
  makeRng,
  TAU,
} from '../util/math';

export interface Zombie {
  id: number;
  alive: boolean;
  def: ZombieDef;
  kind: ZombieKind;
  body: CharacterBody | null;
  state: ZombieState;
  health: number;
  maxHealth: number;
  yaw: number;
  targetYaw: number;
  speed: number;
  awareness: number;
  lastKnownX: number;
  lastKnownZ: number;
  hasTarget: boolean;
  wanderX: number;
  wanderZ: number;
  wanderTimer: number;
  attackTimer: number;
  attackCooldown: number;
  attackCommitted: boolean;
  staggerTimer: number;
  deathTimer: number;
  animPhase: number;
  animSpeed: number;
  hitFlash: number;
  distToPlayer: number;
  lodTier: 0 | 1 | 2;
  updateOffset: number;
  searchTimer: number;
  separationX: number;
  separationZ: number;
  spawnX: number;
  spawnZ: number;
  headY: number;
  torsoY: number;
  losTimer: number;
  losVisible: boolean;
  avoidTimer: number;
  avoidX: number;
  avoidZ: number;
  blockNx: number;
  blockNz: number;
  blockTtl: number;
  /** Committed detour direction (+1/-1), 0 when not avoiding anything. */
  avoidSide: 0 | 1 | -1;

  /**
   * Render transforms captured before and after the last fixed step. The
   * renderer blends between them so zombies move smoothly on frames that
   * fall between physics steps instead of snapping 60 times a second.
   */
  prevRenderX: number;
  prevRenderY: number;
  prevRenderZ: number;
  currRenderX: number;
  currRenderY: number;
  currRenderZ: number;
  prevRenderYaw: number;
  currRenderYaw: number;
  renderInit: boolean;
  /** 0..1 progress from prev toward curr, advanced by the renderer. */
  renderBlend: number;
  /** How many units of blend to add per second of real time. */
  renderBlendRate: number;
}

export interface HitResult {
  zombie: Zombie;
  region: HitRegion;
  distance: number;
  pointX: number;
  pointY: number;
  pointZ: number;
  killed: boolean;
  damage: number;
}

const MAX_ZOMBIES = 44;
const RAY_BUDGET_PER_STEP = 26;
const LOS_INTERVAL_NEAR = 0.18;
const LOS_INTERVAL_MID = 0.45;
const AVOID_INTERVAL = 0.25;
const BLOCK_PROBE_INTERVAL = 0.14;
const PLAYER_STANDOFF = 0.14;
const NEAR_DIST = 34;
const MID_DIST = 78;
const ATTACK_LUNGE = 0.5;

export interface ZombieManagerOptions {
  targetActive: number;
  maxAlive: number;
  spawnMinDistance: number;
  spawnMaxDistance: number;
  despawnDistance: number;
}

export const DEFAULT_ZOMBIE_OPTIONS: ZombieManagerOptions = {
  targetActive: 16,
  maxAlive: 26,
  spawnMinDistance: 34,
  spawnMaxDistance: 105,
  despawnDistance: 190,
};

export class ZombieManager {
  readonly zombies: Zombie[] = [];
  private readonly physics: PhysicsWorld;
  private readonly terrain: Terrain;
  private readonly player: Player;
  private readonly state: GameState;
  private readonly noise: NoiseSystem;
  private readonly grid = new SpatialGrid(5);
  private readonly rng: () => number;
  private readonly colliderToZombie = new Map<number, number>();
  private options: ZombieManagerOptions;

  private readonly normalScratch = { x: 0, y: 1, z: 0 };
  private spawnCooldown = 0;
  private tickIndex = 0;
  private rayBudget = 0;
  aliveCount = 0;
  activeCount = 0;
  onDamagePlayer: ((amount: number, fromX: number, fromZ: number) => void) | null = null;
  onZombieDied: ((z: Zombie) => void) | null = null;

  constructor(
    physics: PhysicsWorld,
    terrain: Terrain,
    player: Player,
    state: GameState,
    noise: NoiseSystem,
    options: ZombieManagerOptions = DEFAULT_ZOMBIE_OPTIONS,
    seed = 424242,
  ) {
    this.physics = physics;
    this.terrain = terrain;
    this.player = player;
    this.state = state;
    this.noise = noise;
    this.options = options;
    this.rng = makeRng(seed);

    for (let i = 0; i < MAX_ZOMBIES; i++) {
      this.zombies.push(this.createSlot(i));
    }
  }

  setOptions(partial: Partial<ZombieManagerOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  get maxCapacity(): number {
    return MAX_ZOMBIES;
  }

  private createSlot(id: number): Zombie {
    const def = ZOMBIES.walker;
    return {
      id,
      alive: false,
      def,
      kind: 'walker',
      body: null,
      state: ZombieState.Idle,
      health: 0,
      maxHealth: def.health,
      yaw: 0,
      prevRenderX: 0,
      prevRenderY: 0,
      prevRenderZ: 0,
      currRenderX: 0,
      currRenderY: 0,
      currRenderZ: 0,
      prevRenderYaw: 0,
      currRenderYaw: 0,
      renderInit: false,
      renderBlend: 1,
      renderBlendRate: 60,
      targetYaw: 0,
      speed: 0,
      awareness: 0,
      lastKnownX: 0,
      lastKnownZ: 0,
      hasTarget: false,
      wanderX: 0,
      wanderZ: 0,
      wanderTimer: 0,
      attackTimer: 0,
      attackCooldown: 0,
      attackCommitted: false,
      staggerTimer: 0,
      deathTimer: 0,
      animPhase: Math.random() * TAU,
      animSpeed: 1,
      hitFlash: 0,
      distToPlayer: 9999,
      lodTier: 2,
      updateOffset: id % 3,
      searchTimer: 0,
      separationX: 0,
      separationZ: 0,
      spawnX: 0,
      spawnZ: 0,
      headY: 1.7,
      torsoY: 1.15,
      losTimer: 0,
      losVisible: false,
      avoidTimer: 0,
      avoidX: 0,
      avoidZ: 0,
      avoidSide: 0,
      blockNx: 0,
      blockNz: 0,
      blockTtl: 0,
    };
  }

  reset(): void {
    for (const z of this.zombies) {
      if (z.body) {
        this.colliderToZombie.delete(z.body.collider.handle);
        z.body.dispose();
        z.body = null;
      }
      z.alive = false;
      z.state = ZombieState.Idle;
      z.awareness = 0;
      z.hasTarget = false;
      z.deathTimer = 0;
      z.hitFlash = 0;
    }
    this.aliveCount = 0;
    this.activeCount = 0;
    this.spawnCooldown = 0;
  }

  populateInitial(count: number): void {
    for (let i = 0; i < count; i++) {
      this.trySpawn(true);
    }
  }

  private findFreeSlot(): Zombie | null {
    for (const z of this.zombies) if (!z.alive && z.deathTimer <= 0) return z;
    return null;
  }

  private pickSpawnPoint(initial: boolean): { x: number; z: number } | null {
    const p = this.player.position;
    const o = this.options;
    for (let attempt = 0; attempt < 26; attempt++) {
      let x: number;
      let z: number;
      if (initial) {
        const half = this.terrain.half - 30;
        x = randRange(-half, half);
        z = randRange(-half, half);
      } else {
        const angle = this.rng() * TAU;
        const dist = randRange(o.spawnMinDistance, o.spawnMaxDistance);
        x = p.x + Math.cos(angle) * dist;
        z = p.z + Math.sin(angle) * dist;
      }

      if (!this.terrain.isInBounds(x, z, 20)) continue;
      const dx = x - p.x;
      const dz = z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < o.spawnMinDistance) continue;
      if (this.terrain.slopeAt(x, z) > 0.7) continue;

      const forwardX = -Math.sin(this.player.yaw);
      const forwardZ = -Math.cos(this.player.yaw);
      const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;
      if (!initial && dot > 0.55 && dist < 70) continue;

      let tooClose = false;
      for (const other of this.zombies) {
        if (!other.alive || !other.body) continue;
        const op = other.body.position;
        if (Math.hypot(op.x - x, op.z - z) < 3) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      return { x, z };
    }
    return null;
  }

  trySpawn(initial = false): Zombie | null {
    if (this.aliveCount >= this.options.maxAlive) return null;
    const slot = this.findFreeSlot();
    if (!slot) return null;
    const point = this.pickSpawnPoint(initial);
    if (!point) return null;

    const kind = pickZombieKind(this.rng());
    this.spawnAt(slot, kind, point.x, point.z);
    return slot;
  }

  private spawnAt(z: Zombie, kind: ZombieKind, x: number, worldZ: number): void {
    const def = ZOMBIES[kind];
    const groundY = this.terrain.heightAt(x, worldZ);
    const radius = def.radius;
    const halfHeight = Math.max(0.12, def.height * 0.5 - radius);

    z.def = def;
    z.kind = kind;
    z.alive = true;
    z.health = def.health;
    z.maxHealth = def.health;
    z.state = ZombieState.Wandering;
    z.yaw = this.rng() * TAU;
    z.targetYaw = z.yaw;
    // A recycled zombie must not interpolate in from wherever it last died.
    z.renderInit = false;
    z.renderBlend = 1;
    z.renderBlendRate = 60;
    z.speed = 0;
    z.awareness = 0;
    z.hasTarget = false;
    z.attackTimer = 0;
    z.attackCooldown = 0;
    z.attackCommitted = false;
    z.staggerTimer = 0;
    z.deathTimer = 0;
    z.hitFlash = 0;
    z.animPhase = this.rng() * TAU;
    z.wanderTimer = randRange(0.5, 3);
    z.spawnX = x;
    z.spawnZ = worldZ;
    z.searchTimer = 0;
    z.losTimer = 0;
    z.losVisible = false;
    z.avoidTimer = 0;
    z.avoidX = 0;
    z.avoidZ = 0;
    z.avoidSide = 0;
    z.blockNx = 0;
    z.blockNz = 0;
    z.blockTtl = 0;
    z.headY = def.height * 0.92;
    z.torsoY = def.height * 0.62;
    this.pickWanderTarget(z);

    if (z.body) {
      this.colliderToZombie.delete(z.body.collider.handle);
      z.body.dispose();
    }
    z.body = new CharacterBody(this.physics, x, groundY + halfHeight + radius + 0.1, worldZ, {
      radius,
      halfHeight,
      maxSlopeClimbDeg: 55,
      minSlopeSlideDeg: 62,
      stepHeight: 0.45,
      snapToGround: 0.4,
      isPlayer: false,
      autostepDynamic: false,
    });
    this.colliderToZombie.set(z.body.collider.handle, z.id);
    this.aliveCount++;
  }

  private despawn(z: Zombie): void {
    if (z.body) {
      this.colliderToZombie.delete(z.body.collider.handle);
      z.body.dispose();
      z.body = null;
    }
    if (z.alive) this.aliveCount--;
    z.alive = false;
    z.state = ZombieState.Idle;
    z.deathTimer = 0;
  }

  private pickWanderTarget(z: Zombie): void {
    const angle = this.rng() * TAU;
    const dist = randRange(6, 26);
    let x = z.spawnX + Math.cos(angle) * dist;
    let wz = z.spawnZ + Math.sin(angle) * dist;
    if (!this.terrain.isInBounds(x, wz, 22)) {
      x = z.spawnX;
      wz = z.spawnZ;
    }
    z.wanderX = x;
    z.wanderZ = wz;
    z.wanderTimer = randRange(4, 11);
  }

  step(dt: number): void {
    const p = this.player.position;
    const eyeY = this.player.eye.y;

    this.grid.clear();
    for (const z of this.zombies) {
      if (!z.alive || !z.body) continue;
      const zp = z.body.position;
      this.grid.insert(z.id, zp.x, zp.z);
    }

    this.tickIndex = (this.tickIndex + 1) % 3;
    this.rayBudget = RAY_BUDGET_PER_STEP;
    let active = 0;

    for (const z of this.zombies) {
      if (z.deathTimer > 0) {
        z.deathTimer -= dt;
        if (z.deathTimer <= 0) {
          this.despawn(z);
          continue;
        }
        // A corpse still has to keep its distance and render transform current,
        // otherwise it holds a stale distance (which the renderer gates
        // visibility on) and its interpolation targets go stale too, so bodies
        // flicker or snap while they are collapsing.
        if (z.body) {
          const cp = z.body.position;
          z.distToPlayer = Math.hypot(p.x - cp.x, p.z - cp.z);
          z.prevRenderX = z.currRenderX;
          z.prevRenderY = z.currRenderY;
          z.prevRenderZ = z.currRenderZ;
          z.prevRenderYaw = z.currRenderYaw;
          z.currRenderX = cp.x;
          z.currRenderY = cp.y;
          z.currRenderZ = cp.z;
          z.currRenderYaw = z.yaw;
          z.renderBlend = 0;
          z.renderBlendRate = 1 / dt;
        }
        continue;
      }
      if (!z.alive || !z.body) continue;

      const zp = z.body.position;
      const dx = p.x - zp.x;
      const dz = p.z - zp.z;
      z.distToPlayer = Math.hypot(dx, dz);
      z.lodTier = z.distToPlayer < NEAR_DIST ? 0 : z.distToPlayer < MID_DIST ? 1 : 2;
      if (z.hitFlash > 0) z.hitFlash = Math.max(0, z.hitFlash - dt * 3.4);

      if (z.distToPlayer > this.options.despawnDistance) {
        this.despawn(z);
        continue;
      }

      const shouldUpdate =
        z.lodTier === 0 || (z.lodTier === 1 && z.updateOffset === this.tickIndex) || false;
      const midSkip = z.lodTier === 2 && z.updateOffset !== this.tickIndex;

      if (z.lodTier <= 1) active++;

      if (midSkip) continue;

      const stepDt = z.lodTier === 0 ? dt : dt * 3;
      this.updatePerception(z, stepDt, p.x, eyeY, p.z);
      this.updateState(z, stepDt);
      this.computeSeparation(z);
      this.updateMovement(z, stepDt, shouldUpdate);
      this.updateAnimation(z, stepDt);

      // Post-update transform. renderAlphaRate tells the renderer how fast to
      // travel from prev to curr, so a LOD-1 zombie that moved three steps'
      // worth of distance is blended over three steps of time.
      const np = z.body.position;
      z.currRenderX = np.x;
      z.currRenderY = np.y;
      z.currRenderZ = np.z;
      z.currRenderYaw = z.yaw;
      if (!z.renderInit) {
        z.renderInit = true;
        z.prevRenderX = np.x;
        z.prevRenderY = np.y;
        z.prevRenderZ = np.z;
        z.prevRenderYaw = z.yaw;
      }
      z.renderBlend = 0;
      z.renderBlendRate = 1 / stepDt;
    }

    this.activeCount = active;

    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0) {
      this.spawnCooldown = 1.1;
      const nearby = this.countNear(this.options.spawnMaxDistance);
      if (nearby < this.options.targetActive) this.trySpawn(false);
    }
  }

  private countNear(radius: number): number {
    const p = this.player.position;
    let n = 0;
    for (const z of this.zombies) {
      if (!z.alive || !z.body) continue;
      const zp = z.body.position;
      if (Math.hypot(zp.x - p.x, zp.z - p.z) <= radius) n++;
    }
    return n;
  }

  private updatePerception(
    z: Zombie,
    dt: number,
    px: number,
    peyeY: number,
    pz: number,
  ): void {
    if (!z.body) return;
    const def = z.def;
    const zp = z.body.position;
    const dist = z.distToPlayer;

    let gain = 0;

    if (dist < def.viewDistance) {
      const dx = px - zp.x;
      const dz = pz - zp.z;
      const inv = 1 / Math.max(dist, 0.001);
      const facingX = -Math.sin(z.yaw);
      const facingZ = -Math.cos(z.yaw);
      const dot = (dx * inv) * facingX + (dz * inv) * facingZ;
      const cosHalf = Math.cos((def.viewAngleDeg * 0.5 * Math.PI) / 180);
      const inFov = dot >= cosHalf;
      const closeEnoughToSense = dist < 3.2;

      if (inFov || closeEnoughToSense) {
        z.losTimer -= dt;
        const interval = z.lodTier === 0 ? LOS_INTERVAL_NEAR : LOS_INTERVAL_MID;
        if (z.losTimer <= 0 && this.rayBudget > 0) {
          this.rayBudget--;
          z.losTimer = interval * (0.85 + this.rng() * 0.3);
          const eyeY = zp.y + def.height * 0.35;
          z.losVisible = this.physics.hasLineOfSight(zp.x, eyeY, zp.z, px, peyeY, pz);
        }
        if (z.losVisible) {
          const distFactor = 1 - clamp(dist / def.viewDistance, 0, 1);
          const speedFactor = clamp(this.player.horizontalSpeed / 5, 0, 1);
          const crouchPenalty = this.player.crouching ? 0.45 : 1;
          gain = (0.55 + distFactor * 1.5 + speedFactor * 0.9) * crouchPenalty;
          if (closeEnoughToSense) gain = Math.max(gain, 2.4);
          z.lastKnownX = px;
          z.lastKnownZ = pz;
          z.hasTarget = true;
        }
      } else {
        z.losVisible = false;
      }
    }

    this.noise.forEach((e) => {
      const nd = Math.hypot(e.x - zp.x, e.z - zp.z);
      if (nd > e.radius) return;
      const falloff = 1 - nd / e.radius;
      const heard = falloff * e.intensity * def.hearingMultiplier;
      if (heard <= 0.02) return;
      gain = Math.max(gain, heard * 1.9);
      if (heard > 0.12) {
        z.lastKnownX = e.x;
        z.lastKnownZ = e.z;
        z.hasTarget = true;
      }
    });

    if (gain > 0) {
      z.awareness = clamp(z.awareness + gain * dt, 0, 1.6);
    } else {
      const decay = z.awareness > 1 ? 0.09 : 0.22;
      z.awareness = clamp(z.awareness - decay * dt, 0, 1.6);
    }
  }

  private updateState(z: Zombie, dt: number): void {
    if (!z.body) return;
    const def = z.def;

    if (z.attackCooldown > 0) z.attackCooldown -= dt;

    if (z.state === ZombieState.Staggered) {
      z.staggerTimer -= dt;
      if (z.staggerTimer <= 0) {
        z.state = z.awareness >= 0.85 ? ZombieState.Chasing : ZombieState.Wandering;
      }
      return;
    }

    if (z.state === ZombieState.Attacking) {
      z.attackTimer -= dt;
      if (!z.attackCommitted && z.attackTimer <= 0) {
        z.attackCommitted = true;
        if (z.distToPlayer <= def.attackRange * 1.35 && this.state.alive) {
          const ap = z.body.position;
          this.onDamagePlayer?.(def.attackDamage, ap.x, ap.z);
        }
        z.attackTimer = def.attackCooldown * 0.55;
      } else if (z.attackCommitted && z.attackTimer <= 0) {
        z.attackCooldown = def.attackCooldown;
        z.attackCommitted = false;
        z.state = ZombieState.Chasing;
      }
      return;
    }

    const canSeeOrKnow = z.awareness >= 0.85;

    if (canSeeOrKnow && z.hasTarget) {
      if (
        z.distToPlayer <= def.attackRange &&
        z.attackCooldown <= 0 &&
        this.state.alive &&
        Math.abs(angleDelta(z.yaw, this.yawTo(z, this.player.position.x, this.player.position.z))) <
          0.9
      ) {
        z.state = ZombieState.Attacking;
        z.attackTimer = def.attackWindup;
        z.attackCommitted = false;
        return;
      }
      z.state = ZombieState.Chasing;
      z.searchTimer = 6;
      return;
    }

    if (z.awareness >= 0.35) {
      z.state = ZombieState.Detecting;
      return;
    }

    if (z.hasTarget && z.searchTimer > 0) {
      z.searchTimer -= dt;
      z.state = ZombieState.Detecting;
      if (z.searchTimer <= 0) {
        z.hasTarget = false;
        z.spawnX = z.lastKnownX;
        z.spawnZ = z.lastKnownZ;
        this.pickWanderTarget(z);
      }
      return;
    }

    z.wanderTimer -= dt;
    if (z.wanderTimer <= 0) this.pickWanderTarget(z);
    const wanderDist = Math.hypot(z.wanderX - z.body.position.x, z.wanderZ - z.body.position.z);
    z.state = wanderDist < 1.4 ? ZombieState.Idle : ZombieState.Wandering;
    if (z.state === ZombieState.Idle && z.wanderTimer > 2.2) z.wanderTimer = randRange(0.6, 2.2);
  }

  private yawTo(z: Zombie, x: number, worldZ: number): number {
    if (!z.body) return z.yaw;
    const zp = z.body.position;
    return Math.atan2(-(x - zp.x), -(worldZ - zp.z));
  }

  private computeSeparation(z: Zombie): void {
    if (!z.body) return;
    const zp = z.body.position;
    let sx = 0;
    let sz = 0;
    const range = z.def.radius * 2 + 1.1;
    this.grid.forEachNear(zp.x, zp.z, range, (otherId) => {
      if (otherId === z.id) return;
      const other = this.zombies[otherId];
      if (!other.alive || !other.body) return;
      const op = other.body.position;
      const dx = zp.x - op.x;
      const dz = zp.z - op.z;
      const d = Math.hypot(dx, dz);
      const minDist = z.def.radius + other.def.radius + 0.42;
      if (d > 0.0001 && d < minDist) {
        const push = (minDist - d) / minDist;
        sx += (dx / d) * push;
        sz += (dz / d) * push;
      }
    });

    // The light mover ignores the player capsule, so without an explicit push
    // a chasing zombie walks its head into the camera. Hold them at roughly
    // arm's length, which is also where their attack lands.
    const p = this.player.position;
    const pdx = zp.x - p.x;
    const pdz = zp.z - p.z;
    const pd = Math.hypot(pdx, pdz);
    const standoff = z.def.radius + this.player.body.radius + PLAYER_STANDOFF;
    if (pd > 0.0001 && pd < standoff) {
      const push = (standoff - pd) / standoff;
      sx += (pdx / pd) * push * 1.6;
      sz += (pdz / pd) * push * 1.6;
    }

    z.separationX = sx;
    z.separationZ = sz;
  }

  private updateMovement(z: Zombie, dt: number, precise: boolean): void {
    if (!z.body) return;
    const def = z.def;
    const body = z.body;
    const zp = body.position;

    let goalX = zp.x;
    let goalZ = zp.z;
    let desiredSpeed = 0;

    switch (z.state) {
      case ZombieState.Idle:
        desiredSpeed = 0;
        break;
      case ZombieState.Wandering:
        goalX = z.wanderX;
        goalZ = z.wanderZ;
        desiredSpeed = def.walkSpeed;
        break;
      case ZombieState.Detecting:
        goalX = z.lastKnownX;
        goalZ = z.lastKnownZ;
        desiredSpeed = def.walkSpeed * 1.85;
        break;
      case ZombieState.Chasing:
        goalX = this.player.position.x;
        goalZ = this.player.position.z;
        desiredSpeed = def.chaseSpeed;
        break;
      case ZombieState.Attacking:
        goalX = this.player.position.x;
        goalZ = this.player.position.z;
        desiredSpeed = z.attackCommitted ? 0 : def.chaseSpeed * 0.18;
        break;
      case ZombieState.Staggered:
      case ZombieState.Dead:
        desiredSpeed = 0;
        break;
    }

    let dirX = goalX - zp.x;
    let dirZ = goalZ - zp.z;
    let dist = Math.hypot(dirX, dirZ);
    if (dist > 0.0001) {
      dirX /= dist;
      dirZ /= dist;
    } else {
      dirX = -Math.sin(z.yaw);
      dirZ = -Math.cos(z.yaw);
    }

    if (desiredSpeed > 0 && precise && z.lodTier === 0) {
      z.avoidTimer -= dt;
      if (z.avoidTimer <= 0 && this.rayBudget > 0) {
        z.avoidTimer = AVOID_INTERVAL * (0.8 + this.rng() * 0.4);
        const probe = this.avoidObstacles(z, dirX, dirZ);
        z.avoidX = probe.x;
        z.avoidZ = probe.z;
      }
      if (z.avoidX !== 0 || z.avoidZ !== 0) {
        const blend = 0.72;
        dirX = dirX * (1 - blend) + z.avoidX * blend;
        dirZ = dirZ * (1 - blend) + z.avoidZ * blend;
        const l = Math.hypot(dirX, dirZ);
        if (l > 1e-4) {
          dirX /= l;
          dirZ /= l;
        }
      }
    }

    if (z.separationX !== 0 || z.separationZ !== 0) {
      const sepWeight =
        z.state === ZombieState.Chasing ? 0.85 : z.state === ZombieState.Attacking ? 0.5 : 1.35;
      dirX += z.separationX * sepWeight;
      dirZ += z.separationZ * sepWeight;
      const l = Math.hypot(dirX, dirZ);
      if (l > 0.0001) {
        dirX /= l;
        dirZ /= l;
      }
    }

    if (!this.terrain.isInBounds(zp.x, zp.z, 12)) {
      const inward = Math.hypot(zp.x, zp.z);
      if (inward > 0.001) {
        dirX = -zp.x / inward;
        dirZ = -zp.z / inward;
        desiredSpeed = Math.max(desiredSpeed, def.walkSpeed);
      }
    }

    if (desiredSpeed > 0) {
      z.targetYaw = Math.atan2(-dirX, -dirZ);
    }
    const turn = def.turnRate * (z.state === ZombieState.Chasing ? 1.35 : 1) * dt;
    z.yaw = moveTowardsAngle(z.yaw, z.targetYaw, turn);

    const facingPenalty = Math.max(
      0.25,
      1 - Math.abs(angleDelta(z.yaw, z.targetYaw)) / Math.PI,
    );
    const targetSpeed = desiredSpeed * facingPenalty;
    const accel = def.accel * (targetSpeed > z.speed ? 1 : 1.9);
    const delta = targetSpeed - z.speed;
    z.speed += clamp(delta, -accel * dt, accel * dt);
    if (z.speed < 0.01) z.speed = 0;

    const moveX = -Math.sin(z.yaw) * z.speed;
    const moveZ = -Math.cos(z.yaw) * z.speed;

    const vel = body.velocity;
    vel.x = moveX;
    vel.z = moveZ;

    if (z.state === ZombieState.Attacking && !z.attackCommitted && dist > def.attackRange * 0.95) {
      vel.x += -Math.sin(z.yaw) * ATTACK_LUNGE;
      vel.z += -Math.cos(z.yaw) * ATTACK_LUNGE;
    }

    if (body.grounded) {
      if (vel.y < 0) vel.y = -2;
    } else {
      vel.y -= 22 * dt;
      if (vel.y < -50) vel.y = -50;
    }

    // Refresh the cached blocking normal occasionally. Rapier's character
    // controller costs ~0.4 ms per body, which does not scale to a crowd, so
    // zombies use a light mover fed by one short ray instead.
    z.blockTtl -= dt;
    if (z.blockTtl <= 0 && z.speed > 0.15 && this.rayBudget > 0) {
      z.blockTtl = BLOCK_PROBE_INTERVAL * (0.8 + this.rng() * 0.4);
      this.rayBudget--;
      const probeDist = z.def.radius + 0.42 + z.speed * 0.09;
      const invLen = 1 / Math.max(Math.hypot(vel.x, vel.z), 1e-4);
      const px = vel.x * invLen;
      const pz = vel.z * invLen;
      const hit = this.physics.raycast(zp.x, zp.y, zp.z, px, 0, pz, probeDist);
      if (hit) {
        z.blockNx = hit.normal.x;
        z.blockNz = hit.normal.z;
        const nlen = Math.hypot(z.blockNx, z.blockNz);
        if (nlen > 1e-4) {
          z.blockNx /= nlen;
          z.blockNz /= nlen;
        } else {
          z.blockNx = -px;
          z.blockNz = -pz;
        }
      } else {
        z.blockNx = 0;
        z.blockNz = 0;
      }
    }

    const groundY = this.terrain.heightAt(zp.x, zp.z);
    this.normalScratch.x = 0;
    this.normalScratch.y = 1;
    this.normalScratch.z = 0;
    if (z.lodTier === 0) this.terrain.normalAt(zp.x, zp.z, this.normalScratch);
    const blocking =
      z.blockNx !== 0 || z.blockNz !== 0 ? { x: z.blockNx, z: z.blockNz } : null;

    body.moveKinematic(dt, groundY, this.normalScratch.y, blocking);

    // Keep bodies out of each other by nudging directly; this is far cheaper
    // than letting the physics solver resolve capsule-vs-capsule overlap.
    if (z.separationX !== 0 || z.separationZ !== 0) {
      const push = Math.min(1, Math.hypot(z.separationX, z.separationZ)) * 2.6 * dt;
      const sl = Math.hypot(z.separationX, z.separationZ) || 1;
      body.nudge((z.separationX / sl) * push, (z.separationZ / sl) * push);
    }

    if (body.blocked && z.state !== ZombieState.Attacking && z.speed > 0.2) {
      z.targetYaw += (this.rng() > 0.5 ? 1 : -1) * 0.9;
      if (z.state === ZombieState.Wandering) z.wanderTimer = Math.min(z.wanderTimer, 0.5);
    }
  }

  private avoidObstacles(z: Zombie, dirX: number, dirZ: number): { x: number; z: number } {
    if (!z.body) return { x: dirX, z: dirZ };
    const zp = z.body.position;
    const y = zp.y;
    const probeLen = 2.4 + z.speed * 0.35;

    if (this.rayBudget <= 0) return { x: dirX, z: dirZ };
    this.rayBudget--;
    const straight = this.physics.raycast(zp.x, y, zp.z, dirX, 0, dirZ, probeLen);
    if (!straight) {
      // Path ahead is open, so any previous detour is finished. Releasing the
      // committed side here is what lets a zombie resume heading at its goal
      // once it has cleared the obstacle.
      z.avoidSide = 0;
      return { x: dirX, z: dirZ };
    }

    // Commit to one side for the whole detour. Re-picking randomly on every
    // probe makes a zombie oscillate in front of an obstacle and never get
    // around it. The side is chosen once, then kept while still blocked.
    // raycast() returns a shared scratch object, so the normal must be read
    // before any further cast overwrites it.
    const hitNx = straight.normal.x;
    const hitNz = straight.normal.z;

    if (z.avoidSide === 0) {
      // Prefer the side the obstacle's surface normal points toward: that is
      // the shorter way around. Fall back to a random side for a dead-on hit.
      const cross = dirX * hitNz - dirZ * hitNx;
      z.avoidSide = cross > 0.05 ? 1 : cross < -0.05 ? -1 : this.rng() > 0.5 ? 1 : -1;
    }

    const perpX = -dirZ;
    const perpZ = dirX;

    // Sweep progressively wider angles. The old +/-0.75 offsets were only
    // about 37 degrees, too shallow to clear a tree trunk approached head-on,
    // so every probe failed and the zombie fell back to a 90-degree turn that
    // pointed away from its goal. Going out to a full sidestep finds a real
    // way past, and trying the committed side first keeps the detour stable.
    const offsets = [0.5, 0.9, 1.4, 2.2, 3.4];
    for (const mag of offsets) {
      for (const side of [z.avoidSide, -z.avoidSide as 1 | -1]) {
        if (this.rayBudget <= 0) break;
        this.rayBudget--;
        const offset = mag * side;
        let nx = dirX + perpX * offset;
        let nz = dirZ + perpZ * offset;
        const len = Math.hypot(nx, nz) || 1;
        nx /= len;
        nz /= len;
        if (!this.physics.raycast(zp.x, y, zp.z, nx, 0, nz, probeLen * 0.85)) {
          // Keep the side that actually worked so the detour stays committed.
          z.avoidSide = side;
          return { x: nx, z: nz };
        }
      }
    }

    // Fully enclosed ahead: slide along the obstacle rather than turning to
    // face away from the goal, so forward progress is still possible.
    return { x: -dirZ * z.avoidSide, z: dirX * z.avoidSide };
  }

  private updateAnimation(z: Zombie, dt: number): void {
    const def = z.def;
    let rate: number;
    switch (z.state) {
      case ZombieState.Chasing:
        rate = 5.6 + z.speed * 0.9;
        break;
      case ZombieState.Detecting:
        rate = 3.1;
        break;
      case ZombieState.Wandering:
        rate = 2.1 + z.speed * 0.7;
        break;
      case ZombieState.Attacking:
        rate = 7.5;
        break;
      default:
        rate = 1.1;
    }
    z.animSpeed = rate / Math.max(def.scale, 0.5);
    z.animPhase = (z.animPhase + z.animSpeed * dt) % TAU;
  }

  zombieByCollider(handle: number): Zombie | null {
    const id = this.colliderToZombie.get(handle);
    return id === undefined ? null : this.zombies[id];
  }

  applyDamage(z: Zombie, amount: number, region: HitRegion, dirX: number, dirZ: number): boolean {
    if (!z.alive) return false;
    z.health -= amount;
    z.hitFlash = 1;
    z.awareness = 1.6;
    z.hasTarget = true;
    z.lastKnownX = this.player.position.x;
    z.lastKnownZ = this.player.position.z;
    z.searchTimer = 8;

    if (z.health <= 0) {
      this.kill(z);
      return true;
    }

    const staggerChance =
      (region === HitRegion.Head ? 0.85 : 0.4) * (1 - z.def.staggerResist);
    if (this.rng() < staggerChance && z.state !== ZombieState.Attacking) {
      z.state = ZombieState.Staggered;
      z.staggerTimer = randRange(0.28, 0.55) * (1 - z.def.staggerResist * 0.5);
      z.speed *= 0.25;
      if (z.body) {
        z.body.velocity.x += dirX * 1.5;
        z.body.velocity.z += dirZ * 1.5;
      }
    } else if (z.state === ZombieState.Wandering || z.state === ZombieState.Idle) {
      z.state = ZombieState.Chasing;
    }
    return false;
  }

  private kill(z: Zombie): void {
    z.alive = false;
    z.state = ZombieState.Dead;
    z.speed = 0;
    z.deathTimer = 6.5;
    this.aliveCount--;
    if (z.body) {
      z.body.velocity.x = 0;
      z.body.velocity.z = 0;
    }
    this.onZombieDied?.(z);
  }
}
