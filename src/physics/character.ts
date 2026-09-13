import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './physics';
import { FILTER } from './physics';

export interface CharacterOptions {
  radius: number;

  halfHeight: number;
  maxSlopeClimbDeg: number;
  minSlopeSlideDeg: number;
  stepHeight: number;
  snapToGround: number;
  isPlayer: boolean;
  autostepDynamic?: boolean;
}

export class CharacterBody {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly physics: PhysicsWorld;
  private readonly opts: CharacterOptions;

  readonly velocity = { x: 0, y: 0, z: 0 };
  grounded = false;

  blocked = false;
  groundNormalY = 1;

  private readonly desired = { x: 0, y: 0, z: 0 };
  private currentHalfHeight: number;

  constructor(physics: PhysicsWorld, x: number, y: number, z: number, opts: CharacterOptions) {
    this.physics = physics;
    this.opts = opts;
    this.currentHalfHeight = opts.halfHeight;
    const r = physics.rapier;

    this.body = physics.world.createRigidBody(
      r.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z).setCcdEnabled(true),
    );
    this.collider = physics.world.createCollider(
      r.ColliderDesc.capsule(opts.halfHeight, opts.radius)
        .setCollisionGroups(opts.isPlayer ? FILTER.player : FILTER.zombie)
        .setFriction(0.4),
      this.body,
    );

    const c = physics.world.createCharacterController(0.02);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((opts.maxSlopeClimbDeg * Math.PI) / 180);
    c.setMinSlopeSlideAngle((opts.minSlopeSlideDeg * Math.PI) / 180);
    c.enableAutostep(opts.stepHeight, opts.radius * 0.5, opts.autostepDynamic ?? false);
    c.enableSnapToGround(opts.snapToGround);
    c.setApplyImpulsesToDynamicBodies(false);
    c.setSlideEnabled(true);
    this.controller = c;
  }

  get position(): { x: number; y: number; z: number } {
    return this.body.translation();
  }

  get feetOffset(): number {
    return this.currentHalfHeight + this.opts.radius;
  }

  get radius(): number {
    return this.opts.radius;
  }

  setHalfHeight(halfHeight: number): void {
    if (Math.abs(halfHeight - this.currentHalfHeight) < 0.001) return;
    const prevFeet = this.position.y - this.feetOffset;
    this.currentHalfHeight = halfHeight;
    this.collider.setHalfHeight(halfHeight);
    const p = this.position;
    this.body.setTranslation({ x: p.x, y: prevFeet + this.feetOffset, z: p.z }, true);
  }

  setPosition(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.grounded = false;
  }

  move(dt: number): void {
    this.desired.x = this.velocity.x * dt;
    this.desired.y = this.velocity.y * dt;
    this.desired.z = this.velocity.z * dt;

    this.controller.computeColliderMovement(this.collider, this.desired, undefined, undefined);
    const applied = this.controller.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();

    const wantH = Math.hypot(this.desired.x, this.desired.z);
    const gotH = Math.hypot(applied.x, applied.z);
    this.blocked = wantH > 1e-4 && gotH < wantH * 0.35;

    this.groundNormalY = 1;
    const count = this.controller.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const col = this.controller.computedCollision(i);
      const ny = col?.normal2?.y;
      if (ny !== undefined && ny > 0.1 && ny < this.groundNormalY) this.groundNormalY = ny;
    }

    const p = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: p.x + applied.x,
      y: p.y + applied.y,
      z: p.z + applied.z,
    });

    if (this.grounded && this.velocity.y < 0) {
      this.velocity.y = 0;
    } else if (!wasGrounded && this.velocity.y > 0 && applied.y < this.desired.y * 0.4) {
      this.velocity.y = 0;
    }
  }

  /**
   * Lightweight mover used for zombies.
   *
   * Rapier's kinematic character controller costs ~0.4 ms per call, which does
   * not scale to a crowd. Zombies do not need step-climbing or precise slide
   * resolution: following the terrain height and sliding along blocking props
   * (detected by one short ray, supplied by the caller) looks the same at
   * gameplay distance for a fraction of the cost.
   */
  moveKinematic(
    dt: number,
    groundY: number,
    slopeNormalY: number,
    blockNormal: { x: number; z: number } | null,
  ): void {
    const p = this.body.translation();
    let vx = this.velocity.x;
    let vz = this.velocity.z;

    if (blockNormal) {
      // Remove the component of motion heading into the obstacle so the body
      // slides along it instead of stopping dead or penetrating.
      const into = vx * blockNormal.x + vz * blockNormal.z;
      if (into < 0) {
        vx -= blockNormal.x * into;
        vz -= blockNormal.z * into;
        this.blocked = true;
      } else {
        this.blocked = false;
      }
    } else {
      this.blocked = false;
    }

    const nx = p.x + vx * dt;
    const nz = p.z + vz * dt;
    const targetY = groundY + this.feetOffset;

    let ny = p.y + this.velocity.y * dt;
    if (ny <= targetY) {
      ny = targetY;
      this.grounded = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    } else {
      this.grounded = false;
      // Snap down over small drops so walkers hug the ground on rolling terrain.
      if (ny - targetY < 0.45 && this.velocity.y <= 0) {
        ny = targetY;
        this.grounded = true;
        this.velocity.y = 0;
      }
    }

    this.groundNormalY = slopeNormalY;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
  }

  /** Directly offset the body, used for crowd separation pushes. */
  nudge(dx: number, dz: number): void {
    const p = this.body.translation();
    this.body.setNextKinematicTranslation({ x: p.x + dx, y: p.y, z: p.z + dz });
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}
