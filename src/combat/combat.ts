import type { PhysicsWorld } from '../physics/physics';
import type { ZombieManager, Zombie } from '../zombies/zombieManager';
import { HitRegion } from '../state/types';
import { REGION_MULTIPLIER, type WeaponDef } from '../weapons/definitions';
import { pelletPattern } from '../weapons/pellets';
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

export interface PelletTrace {
  dirX: number;
  dirY: number;
  dirZ: number;
  endX: number;
  endY: number;
  endZ: number;
  hitZombie: boolean;
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
  pellets: PelletTrace[];
  pelletHits: number;
  zombiesHit: number;
  kills: number;
}

interface ZombieHit {
  zombie: Zombie;
  t: number;
  region: HitRegion;
  px: number;
  py: number;
  pz: number;
}

interface VolleyEntry {
  zombie: Zombie;
  damage: number;
  headshot: boolean;
  dirX: number;
  dirZ: number;
  region: HitRegion;
}

const HEAD_RADIUS_SCALE = 0.62;

const MAX_PELLETS = 16;

export class CombatSystem {
  private readonly physics: PhysicsWorld;
  private readonly zombies: ZombieManager;
  private readonly hitBuffer: ZombieHit[] = [];
  private readonly pelletDisc = new Float32Array(MAX_PELLETS * 2);
  private readonly volley: VolleyEntry[] = [];
  private readonly basis = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };

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
      basisFor(fx, fy, fz, this.basis);
      const { rx, ry, rz, ux, uy, uz } = this.basis;
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
    resetOutcome(out);

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
      out.zombiesHit++;
      if (hit.region === HitRegion.Head) out.headshot = true;
      if (killed) {
        out.killed = true;
        out.kills++;
      }
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

  firePellets(
    def: WeaponDef,
    spread: number,
    ox: number,
    oy: number,
    oz: number,
    fx: number,
    fy: number,
    fz: number,
    out: ShotOutcome,
    aimBlend = 0,
    rand: () => number = Math.random,
  ): ShotOutcome {
    const count = Math.min(def.pellets ?? 1, MAX_PELLETS);
    const coneBase = def.pelletCone ?? 0;
    const coneAimScale = def.pelletConeAim ?? 1;
    const cone = coneBase * (1 + (coneAimScale - 1) * aimBlend);

    out.originX = ox;
    out.originY = oy;
    out.originZ = oz;
    resetOutcome(out);

    let ax = fx;
    let ay = fy;
    let az = fz;
    basisFor(fx, fy, fz, this.basis);
    if (spread > 0) {
      const { rx, ry, rz, ux, uy, uz } = this.basis;
      const a = gaussian() * spread * 0.5;
      const b = gaussian() * spread * 0.5;
      ax += rx * a + ux * b;
      ay += ry * a + uy * b;
      az += rz * a + uz * b;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      basisFor(ax, ay, az, this.basis);
    }

    out.dirX = ax;
    out.dirY = ay;
    out.dirZ = az;

    pelletPattern(count, this.pelletDisc, rand);
    const { rx, ry, rz, ux, uy, uz } = this.basis;
    this.volley.length = 0;

    let farthestEnd = 0;

    for (let i = 0; i < count; i++) {
      const a = this.pelletDisc[i * 2] * cone;
      const b = this.pelletDisc[i * 2 + 1] * cone;
      let dx = ax + rx * a + ux * b;
      let dy = ay + ry * a + uy * b;
      let dz = az + rz * a + uz * b;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl;
      dy /= dl;
      dz /= dl;

      const worldHit = this.physics.raycast(ox, oy, oz, dx, dy, dz, def.range);
      const wallT = worldHit ? worldHit.distance : def.range;

      this.hitBuffer.length = 0;
      this.gatherZombieHits(ox, oy, oz, dx, dy, dz, Math.min(wallT, def.range));

      let nearest: ZombieHit | null = null;
      for (const hit of this.hitBuffer) {
        if (nearest === null || hit.t < nearest.t) nearest = hit;
      }

      let endT: number;
      if (nearest) {
        const falloff = this.damageFalloff(def, nearest.t);
        const damage = def.damage * REGION_MULTIPLIER[nearest.region] * falloff;
        this.accumulate(nearest, damage, dx, dz);

        out.pelletHits++;
        out.damageDealt += damage;
        out.hitZombie = true;
        if (nearest.region === HitRegion.Head) out.headshot = true;
        out.impacts.push({
          x: nearest.px,
          y: nearest.py,
          z: nearest.pz,
          nx: -dx,
          ny: -dy,
          nz: -dz,
          onZombie: true,
          region: nearest.region,
        });
        endT = nearest.t;
      } else if (worldHit) {
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
      } else {
        endT = def.range;
      }

      out.pellets.push({
        dirX: dx,
        dirY: dy,
        dirZ: dz,
        endX: ox + dx * endT,
        endY: oy + dy * endT,
        endZ: oz + dz * endT,
        hitZombie: nearest !== null,
      });

      if (endT > farthestEnd) {
        farthestEnd = endT;
        out.endX = ox + dx * endT;
        out.endY = oy + dy * endT;
        out.endZ = oz + dz * endT;
      }
    }

    this.flushVolley(out);
    return out;
  }

  meleeSwing(
    def: WeaponDef,
    ox: number,
    oy: number,
    oz: number,
    fx: number,
    fy: number,
    fz: number,
    out: ShotOutcome,
  ): ShotOutcome {
    out.originX = ox;
    out.originY = oy;
    out.originZ = oz;
    out.dirX = fx;
    out.dirY = fy;
    out.dirZ = fz;
    resetOutcome(out);
    out.endX = ox + fx * def.range;
    out.endY = oy + fy * def.range;
    out.endZ = oz + fz * def.range;

    const arc = def.meleeArc ?? 0.4;
    basisFor(fx, fy, fz, this.basis);
    const { rx, ry, rz, ux, uy, uz } = this.basis;

    const SAMPLES: [number, number][] = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-0.5, 0],
      [0.5, 0],
      [0, -0.6],
      [0, 0.6],
    ];

    let best: ZombieHit | null = null;
    let bestDirX = fx;
    let bestDirZ = fz;

    for (const [su, sv] of SAMPLES) {
      const ta = Math.tan(arc * su);
      const tb = Math.tan(arc * sv);
      let dx = fx + rx * ta + ux * tb;
      let dy = fy + ry * ta + uy * tb;
      let dz = fz + rz * ta + uz * tb;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl;
      dy /= dl;
      dz /= dl;

      const worldHit = this.physics.raycast(ox, oy, oz, dx, dy, dz, def.range);
      const maxT = worldHit ? Math.min(worldHit.distance, def.range) : def.range;

      this.hitBuffer.length = 0;
      this.gatherZombieHits(ox, oy, oz, dx, dy, dz, maxT);
      for (const hit of this.hitBuffer) {
        if (best === null || hit.t < best.t) {
          best = hit;
          bestDirX = dx;
          bestDirZ = dz;
        }
      }
      if (best !== null && best.t < 0.6) break;
    }

    if (!best) return out;

    const damage = def.damage * REGION_MULTIPLIER[best.region];
    const killed = this.zombies.applyDamage(best.zombie, damage, best.region, bestDirX, bestDirZ);

    out.hitZombie = true;
    out.damageDealt = damage;
    out.zombiesHit = 1;
    if (best.region === HitRegion.Head) out.headshot = true;
    if (killed) {
      out.killed = true;
      out.kills = 1;
    } else {
      this.zombies.forceStagger(best.zombie, def.meleeStagger ?? 0.7, bestDirX, bestDirZ);
    }
    out.impacts.push({
      x: best.px,
      y: best.py,
      z: best.pz,
      nx: -bestDirX,
      ny: 0,
      nz: -bestDirZ,
      onZombie: true,
      region: best.region,
    });
    out.endX = best.px;
    out.endY = best.py;
    out.endZ = best.pz;
    return out;
  }

  private accumulate(hit: ZombieHit, damage: number, dirX: number, dirZ: number): void {
    let entry = this.volley.find((e) => e.zombie === hit.zombie);
    if (!entry) {
      entry = {
        zombie: hit.zombie,
        damage: 0,
        headshot: false,
        dirX,
        dirZ,
        region: hit.region,
      };
      this.volley.push(entry);
    }
    entry.damage += damage;
    if (hit.region === HitRegion.Head && !entry.headshot) {
      entry.headshot = true;
      entry.region = HitRegion.Head;
      entry.dirX = dirX;
      entry.dirZ = dirZ;
    }
  }

  private flushVolley(out: ShotOutcome): void {
    for (const entry of this.volley) {
      const killed = this.zombies.applyDamage(
        entry.zombie,
        entry.damage,
        entry.region,
        entry.dirX,
        entry.dirZ,
      );
      out.zombiesHit++;
      if (killed) {
        out.killed = true;
        out.kills++;
      }
    }
    this.volley.length = 0;
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
      pellets: [],
      pelletHits: 0,
      zombiesHit: 0,
      kills: 0,
    };
  }
}

export function resetOutcome(out: ShotOutcome): void {
  out.impacts.length = 0;
  out.pellets.length = 0;
  out.hitZombie = false;
  out.killed = false;
  out.headshot = false;
  out.damageDealt = 0;
  out.pelletHits = 0;
  out.zombiesHit = 0;
  out.kills = 0;
}

export function basisFor(
  fx: number,
  fy: number,
  fz: number,
  out: { rx: number; ry: number; rz: number; ux: number; uy: number; uz: number },
): void {
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
  ry /= rlen;
  rz /= rlen;

  out.rx = rx;
  out.ry = ry;
  out.rz = rz;
  out.ux = ry * fz - rz * fy;
  out.uy = rz * fx - rx * fz;
  out.uz = rx * fy - ry * fx;
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
