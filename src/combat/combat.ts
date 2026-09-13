import type { PhysicsWorld } from '../physics/physics';
import type { ZombieManager, Zombie } from '../zombies/zombieManager';
import { HitRegion } from '../state/types';
import { REGION_MULTIPLIER, type WeaponDef } from '../weapons/definitions';
import { clamp, gaussian } from '../util/math';

export interface BulletImpact {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  onZombie: boolean;
  region: HitRegion;
}

export interface ShotOutcome {
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  endX: number;
  endY: number;
  endZ: number;
  impacts: BulletImpact[];
  hitZombie: boolean;
  killed: boolean;
  headshot: boolean;
  damageDealt: number;
}

interface ZombieHit {
  zombie: Zombie;
  t: number;
  region: HitRegion;
  px: number;
  py: number;
  pz: number;
}

const HEAD_RADIUS_SCALE = 0.62;

export class CombatSystem {
  private readonly physics: PhysicsWorld;
  private readonly zombies: ZombieManager;
  private readonly hitBuffer: ZombieHit[] = [];

  constructor(physics: PhysicsWorld, zombies: ZombieManager) {
    this.physics = physics;
    this.zombies = zombies;
  }

  fireHitscan(
    def: WeaponDef,
    spread: number,
    ox: number,
    oy: number,
    oz: number,
    fx: number,
    fy: number,
    fz: number,
    out: ShotOutcome,
  ): ShotOutcome {
    let dx = fx;
    let dy = fy;
    let dz = fz;

    if (spread > 0) {
      let rx = -fz;
      let ry = 0;
      let rz = fx;
      let rlen = Math.hypot(rx, ry, rz);
      if (rlen < 1e-5) {
        rx = 1;
        ry = 0;
        rz = 0;
        rlen = 1;
      }
      rx /= rlen;
      rz /= rlen;

      const ux = ry * fz - rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy - ry * fx;

      const a = gaussian() * spread * 0.5;
      const b = gaussian() * spread * 0.5;
      dx += rx * a + ux * b;
      dy += ry * a + uy * b;
      dz += rz * a + uz * b;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl;
      dy /= dl;
      dz /= dl;
    }

    out.originX = ox;
    out.originY = oy;
    out.originZ = oz;
    out.dirX = dx;
    out.dirY = dy;
    out.dirZ = dz;
    out.impacts.length = 0;
    out.hitZombie = false;
    out.killed = false;
    out.headshot = false;
    out.damageDealt = 0;

    const worldHit = this.physics.raycast(ox, oy, oz, dx, dy, dz, def.range);
    const wallT = worldHit ? worldHit.distance : def.range;

    this.hitBuffer.length = 0;
    this.gatherZombieHits(ox, oy, oz, dx, dy, dz, Math.min(wallT, def.range));
    this.hitBuffer.sort((a, b) => a.t - b.t);

    let pierced = 0;
    let endT = wallT;

    for (const hit of this.hitBuffer) {
      if (pierced >= def.penetration) break;
      const falloff = this.damageFalloff(def, hit.t);
      const mult = REGION_MULTIPLIER[hit.region];
      const damage = def.damage * mult * falloff * (pierced > 0 ? 0.62 : 1);
      const killed = this.zombies.applyDamage(hit.zombie, damage, hit.region, dx, dz);

      out.hitZombie = true;
      out.damageDealt += damage;
      if (hit.region === HitRegion.Head) out.headshot = true;
      if (killed) out.killed = true;
      out.impacts.push({
        x: hit.px,
        y: hit.py,
        z: hit.pz,
        nx: -dx,
        ny: -dy,
        nz: -dz,
        onZombie: true,
        region: hit.region,
      });
      pierced++;
      endT = hit.t;
    }

    if (pierced < def.penetration && worldHit) {
      out.impacts.push({
        x: worldHit.point.x,
        y: worldHit.point.y,
        z: worldHit.point.z,
        nx: worldHit.normal.x,
        ny: worldHit.normal.y,
        nz: worldHit.normal.z,
        onZombie: false,
        region: HitRegion.Torso,
      });
      endT = wallT;
    }

    if (out.impacts.length === 0) endT = def.range;

    out.endX = ox + dx * endT;
    out.endY = oy + dy * endT;
    out.endZ = oz + dz * endT;
    return out;
  }

  private damageFalloff(def: WeaponDef, distance: number): number {
    if (distance <= def.falloffStart) return 1;
    const t = clamp((distance - def.falloffStart) / (def.range - def.falloffStart), 0, 1);
    return 1 + (def.falloffMin - 1) * t;
  }

  private gatherZombieHits(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxT: number,
  ): void {
    for (const z of this.zombies.zombies) {
      if (!z.alive || !z.body) continue;
      const p = z.body.position;
      const feetY = p.y - z.body.feetOffset;

      const roughDx = p.x - ox;
      const roughDy = p.y - oy;
      const roughDz = p.z - oz;
      const along = roughDx * dx + roughDy * dy + roughDz * dz;
      if (along < -2 || along > maxT + 2) continue;
      const perpSq =
        roughDx * roughDx + roughDy * roughDy + roughDz * roughDz - along * along;
      const bound = z.def.radius + z.def.height * 0.6;
      if (perpSq > bound * bound) continue;

      const headR = z.def.radius * HEAD_RADIUS_SCALE;
      const headCY = feetY + z.def.height - headR * 0.92;
      const headT = raySphere(ox, oy, oz, dx, dy, dz, p.x, headCY, p.z, headR, maxT);
      if (headT !== null) {
        this.hitBuffer.push({
          zombie: z,
          t: headT,
          region: HitRegion.Head,
          px: ox + dx * headT,
          py: oy + dy * headT,
          pz: oz + dz * headT,
        });
        continue;
      }

      const torsoBottom = feetY + z.def.height * 0.42;
      const torsoTop = feetY + z.def.height * 0.9;
      const torsoT = rayCapsuleVertical(
        ox, oy, oz, dx, dy, dz,
        p.x, p.z, torsoBottom, torsoTop, z.def.radius * 0.95, maxT,
      );
      if (torsoT !== null) {
        this.hitBuffer.push({
          zombie: z,
          t: torsoT,
          region: HitRegion.Torso,
          px: ox + dx * torsoT,
          py: oy + dy * torsoT,
          pz: oz + dz * torsoT,
        });
        continue;
      }

      const legT = rayCapsuleVertical(
        ox, oy, oz, dx, dy, dz,
        p.x, p.z, feetY + 0.1, feetY + z.def.height * 0.45, z.def.radius * 0.85, maxT,
      );
      if (legT !== null) {
        this.hitBuffer.push({
          zombie: z,
          t: legT,
          region: HitRegion.Limb,
          px: ox + dx * legT,
          py: oy + dy * legT,
          pz: oz + dz * legT,
        });
      }
    }
  }

  static createOutcome(): ShotOutcome {
    return {
      originX: 0,
      originY: 0,
      originZ: 0,
      dirX: 0,
      dirY: 0,
      dirZ: -1,
      endX: 0,
      endY: 0,
      endZ: 0,
      impacts: [],
      hitZombie: false,
      killed: false,
      headshot: false,
      damageDealt: 0,
    };
  }
}

function raySphere(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  radius: number, maxT: number,
): number | null {
  const ex = ox - cx;
  const ey = oy - cy;
  const ez = oz - cz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0 || t > maxT) return null;
  return t;
}

function rayCapsuleVertical(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cz: number,
  yBottom: number, yTop: number,
  radius: number, maxT: number,
): number | null {
  const ex = ox - cx;
  const ez = oz - cz;
  const a = dx * dx + dz * dz;
  let best: number | null = null;

  if (a > 1e-8) {
    const b = ex * dx + ez * dz;
    const c = ex * ex + ez * ez - radius * radius;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / a, (-b + sq) / a]) {
        if (t < 0 || t > maxT) continue;
        const y = oy + dy * t;
        if (y >= yBottom && y <= yTop) {
          if (best === null || t < best) best = t;
        }
      }
    }
  }

  const capBottom = raySphere(ox, oy, oz, dx, dy, dz, cx, yBottom, cz, radius, maxT);
  if (capBottom !== null && (best === null || capBottom < best)) best = capBottom;
  const capTop = raySphere(ox, oy, oz, dx, dy, dz, cx, yTop, cz, radius, maxT);
  if (capTop !== null && (best === null || capTop < best)) best = capTop;

  return best;
}
