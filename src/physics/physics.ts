import RAPIER from '@dimforge/rapier3d-compat';
import type { GroundSurface } from '../maps/groundSurface';
import { FIXED_DT } from '../core/clock';

export type Rapier = typeof RAPIER;

export const GROUP = {
  TERRAIN: 0x0001,
  PROP: 0x0002,
  PLAYER: 0x0004,
  ZOMBIE: 0x0008,
} as const;

export function groups(member: number, filter: number): number {
  return (member << 16) | filter;
}

export const FILTER = {
  terrain: groups(GROUP.TERRAIN, 0xffff),

  prop: groups(GROUP.PROP, GROUP.PLAYER | GROUP.ZOMBIE),

  player: groups(GROUP.PLAYER, GROUP.TERRAIN | GROUP.PROP | GROUP.ZOMBIE),

  zombie: groups(GROUP.ZOMBIE, GROUP.TERRAIN | GROUP.PROP | GROUP.PLAYER | GROUP.ZOMBIE),
} as const;

export const RAY_SOLID_FILTER = groups(0xffff, GROUP.TERRAIN | GROUP.PROP);

export interface RayHit {
  distance: number;
  colliderHandle: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

let rapierReady: Promise<Rapier> | null = null;

export function initRapier(): Promise<Rapier> {
  if (!rapierReady) rapierReady = RAPIER.init().then(() => RAPIER);
  return rapierReady;
}

export class PhysicsWorld {
  readonly rapier: Rapier;
  readonly world: RAPIER.World;
  private terrainCollider: RAPIER.Collider | null = null;
  private readonly propBodies: RAPIER.RigidBody[] = [];
  private readonly rayScratch: RAPIER.Ray;
  private readonly hitScratch: RayHit = {
    distance: 0,
    colliderHandle: -1,
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
  };

  constructor(rapier: Rapier) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: -22.0, z: 0 });
    this.world.timestep = FIXED_DT;

    this.world.integrationParameters.numSolverIterations = 4;
    this.rayScratch = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  step(): void {
    this.world.step();
  }

  addTerrain(terrain: GroundSurface): void {
    const { gridSize, heights, config } = terrain;

    const data = new Float32Array(gridSize * gridSize);
    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        data[i * gridSize + j] = heights[j * gridSize + i];
      }
    }
    const desc = this.rapier.ColliderDesc.heightfield(
      gridSize - 1,
      gridSize - 1,
      data,
      { x: config.size, y: 1, z: config.size },
    )
      .setFriction(1.0)
      .setRestitution(0)
      .setCollisionGroups(FILTER.terrain);
    const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed());
    this.terrainCollider = this.world.createCollider(desc, body);
  }

  /**
   * Invisible walls at the world edge. The rim ridge reads as terrain, but a
   * sprinting player can still crest it, and past the heightfield there is
   * nothing to stand on — so the boundary has to be solid.
   */
  addWorldBounds(halfSize: number, height: number): void {
    const t = 2;
    const specs: [number, number, number, number][] = [
      [0, halfSize + t, halfSize + t * 2, t],
      [0, -(halfSize + t), halfSize + t * 2, t],
      [halfSize + t, 0, t, halfSize + t * 2],
      [-(halfSize + t), 0, t, halfSize + t * 2],
    ];
    for (const [x, z, hx, hz] of specs) {
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.fixed().setTranslation(x, 0, z),
      );
      this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(hx, height, hz)
          .setFriction(0.4)
          .setCollisionGroups(FILTER.prop),
        body,
      );
      this.propBodies.push(body);
    }
  }

  get terrainColliderHandle(): number {
    return this.terrainCollider?.handle ?? -1;
  }

  addStaticCylinder(x: number, y: number, z: number, halfHeight: number, radius: number): void {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cylinder(halfHeight, radius)
        .setFriction(0.9)
        .setCollisionGroups(FILTER.prop),
      body,
    );
    this.propBodies.push(body);
  }

  addStaticBall(x: number, y: number, z: number, radius: number): void {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.ball(radius).setFriction(0.8).setCollisionGroups(FILTER.prop),
      body,
    );
    this.propBodies.push(body);
  }

  addStaticBox(
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    yaw = 0,
  ): number {
    const half = yaw * 0.5;
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed()
        .setTranslation(x, y, z)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9).setCollisionGroups(FILTER.prop),
      body,
    );
    this.propBodies.push(body);
    return body.handle;
  }

  removeBody(handle: number): boolean {
    const body = this.world.getRigidBody(handle);
    if (!body) return false;
    const index = this.propBodies.indexOf(body);
    if (index >= 0) this.propBodies.splice(index, 1);
    this.world.removeRigidBody(body);
    return true;
  }

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    filter = RAY_SOLID_FILTER,
  ): RayHit | null {
    this.rayScratch.origin.x = ox;
    this.rayScratch.origin.y = oy;
    this.rayScratch.origin.z = oz;
    this.rayScratch.dir.x = dx;
    this.rayScratch.dir.y = dy;
    this.rayScratch.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(
      this.rayScratch,
      maxDistance,
      true,
      undefined,
      filter,
    );
    if (!hit) return null;
    const out = this.hitScratch;
    out.distance = hit.timeOfImpact;
    out.colliderHandle = hit.collider.handle;
    out.point.x = ox + dx * hit.timeOfImpact;
    out.point.y = oy + dy * hit.timeOfImpact;
    out.point.z = oz + dz * hit.timeOfImpact;
    out.normal.x = hit.normal.x;
    out.normal.y = hit.normal.y;
    out.normal.z = hit.normal.z;
    return out;
  }

  hasLineOfSight(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.001) return true;
    const inv = 1 / dist;
    const hit = this.raycast(ax, ay, az, dx * inv, dy * inv, dz * inv, dist - 0.15);
    return hit === null;
  }

  dispose(): void {
    this.world.free();
  }
}
