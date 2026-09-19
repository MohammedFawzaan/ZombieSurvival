import type { PhysicsWorld } from '../physics/physics';
import { CharacterBody } from '../physics/character';
import type { InputIntent } from '../input/input';
import type { GameState } from '../state/gameState';
import { clamp, damp } from '../util/math';

export const PLAYER_TUNING = {
  radius: 0.34,
  standHalfHeight: 0.56,
  crouchHalfHeight: 0.22,
  eyeStandHeight: 1.66,
  eyeCrouchHeight: 1.06,

  walkSpeed: 4.0,
  sprintSpeed: 7.1,
  crouchSpeed: 1.9,
  aimSpeedMul: 0.55,
  backpedalMul: 0.82,

  groundAccel: 52,
  groundDecel: 42,
  airAccel: 11,
  airControl: 0.42,

  gravity: 22,
  jumpSpeed: 6.4,
  coyoteTime: 0.11,
  jumpBufferTime: 0.14,

  maxPitch: Math.PI / 2 - 0.03,

  staminaMax: 100,
  staminaSprintDrain: 15.5,
  staminaJumpCost: 11,
  staminaRegen: 13.5,
  staminaRegenDelay: 0.85,
  staminaExhaustRecover: 32,

  slopeSlideAngleDeg: 46,
} as const;

export class Player {
  readonly body: CharacterBody;
  private readonly physics: PhysicsWorld;
  private readonly state: GameState;

  yaw = 0;
  pitch = 0;

  crouching = false;
  sprinting = false;
  aiming = false;

  private coyote = 0;
  private jumpBuffer = 0;
  staminaMaxMultiplier = 1;
  staminaRegenMultiplier = 1;
  staminaDrainMultiplier = 1;

  private staminaIdle = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  private landingDip = 0;
  private prevVelY = 0;
  private spawn = { x: 0, y: 0, z: 0 };

  readonly eye = { x: 0, y: 0, z: 0 };
  readonly viewOffset = { pitch: 0, roll: 0, y: 0 };
  eyeHeight: number = PLAYER_TUNING.eyeStandHeight;

  /**
   * Physics runs on a fixed step but the display refreshes at whatever rate
   * the monitor runs at. These snapshots hold the body position before and
   * after the most recent fixed step so the camera can be rendered at the
   * exact sub-step position the current frame falls on. Without this, every
   * frame that lands between two steps reuses a stale position, which reads
   * as constant micro-stutter no matter how high the frame rate is.
   */
  private prevPos = { x: 0, y: 0, z: 0 };
  private currPos = { x: 0, y: 0, z: 0 };
  private prevFeet = 0;
  private currFeet = 0;
  private prevBobPhase = 0;
  private prevBobAmount = 0;
  private prevLandingDip = 0;
  private prevEyeHeight: number = PLAYER_TUNING.eyeStandHeight;
  private currEyeHeight: number = PLAYER_TUNING.eyeStandHeight;

  horizontalSpeed = 0;

  constructor(physics: PhysicsWorld, state: GameState, x: number, y: number, z: number) {
    this.physics = physics;
    this.state = state;
    this.spawn = { x, y, z };
    const t = PLAYER_TUNING;
    this.body = new CharacterBody(physics, x, y + t.standHalfHeight + t.radius, z, {
      radius: t.radius,
      halfHeight: t.standHalfHeight,
      maxSlopeClimbDeg: 52,
      minSlopeSlideDeg: t.slopeSlideAngleDeg,
      stepHeight: 0.45,
      snapToGround: 0.35,
      isPlayer: true,
    });
    this.syncInterpolation();
    this.updateEye(1);
  }

  get position(): { x: number; y: number; z: number } {
    return this.body.position;
  }

  /** Collapse interpolation history onto the body's current transform. */
  private syncInterpolation(): void {
    const p = this.body.position;
    const feet = p.y - this.body.feetOffset;
    this.prevPos.x = this.currPos.x = p.x;
    this.prevPos.y = this.currPos.y = p.y;
    this.prevPos.z = this.currPos.z = p.z;
    this.prevFeet = this.currFeet = feet;
    this.prevBobPhase = this.bobPhase;
    this.prevBobAmount = this.bobAmount;
    this.prevLandingDip = this.landingDip;
    this.prevEyeHeight = this.currEyeHeight = this.crouching
      ? PLAYER_TUNING.eyeCrouchHeight
      : PLAYER_TUNING.eyeStandHeight;
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  get feetY(): number {
    return this.body.position.y - this.body.feetOffset;
  }

  respawn(x: number, y: number, z: number): void {
    const t = PLAYER_TUNING;
    this.spawn = { x, y, z };
    this.crouching = false;
    this.body.setHalfHeight(t.standHalfHeight);
    this.body.setPosition(x, y + t.standHalfHeight + t.radius + 0.05, z);
    this.pitch = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.landingDip = 0;
    this.bobAmount = 0;
    this.state.stamina = t.staminaMax;
    this.state.exhausted = false;
    this.syncInterpolation();
    this.updateEye(1);
  }

  get spawnPoint(): { x: number; y: number; z: number } {
    return this.spawn;
  }

  look(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -PLAYER_TUNING.maxPitch, PLAYER_TUNING.maxPitch);

    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  addRecoil(pitchKick: number, yawKick: number): void {
    this.pitch = clamp(
      this.pitch + pitchKick,
      -PLAYER_TUNING.maxPitch,
      PLAYER_TUNING.maxPitch,
    );
    this.yaw += yawKick;
  }

  canSpendStamina(amount: number): boolean {
    return !this.state.exhausted && this.state.stamina >= amount;
  }

  spendStamina(amount: number): void {
    this.state.stamina = Math.max(0, this.state.stamina - amount);
    this.staminaIdle = 0;
    if (this.state.stamina <= 0) this.state.exhausted = true;
  }

  step(dt: number, input: InputIntent): void {
    const t = PLAYER_TUNING;

    // Snapshot the pre-step view state; updateEye() blends from here.
    const p0 = this.body.position;
    this.prevPos.x = p0.x;
    this.prevPos.y = p0.y;
    this.prevPos.z = p0.z;
    this.prevFeet = p0.y - this.body.feetOffset;
    this.prevBobPhase = this.bobPhase;
    this.prevBobAmount = this.bobAmount;
    this.prevLandingDip = this.landingDip;
    this.prevEyeHeight = this.currEyeHeight;

    const vel = this.body.velocity;
    const grounded = this.body.grounded;

    const wantCrouch = input.crouch;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) {
        this.crouching = true;
        this.body.setHalfHeight(t.crouchHalfHeight);
      } else if (this.canStand()) {
        this.crouching = false;
        this.body.setHalfHeight(t.standHalfHeight);
      }
    }

    const wantsMove = input.forward !== 0 || input.right !== 0;
    const canSprint =
      !this.crouching &&
      !this.state.exhausted &&
      this.state.stamina > 1 &&
      wantsMove &&
      input.forward > 0;
    this.sprinting = input.sprint && canSprint;
    this.aiming = input.aim && !this.sprinting;

    const staminaMax = t.staminaMax * this.staminaMaxMultiplier;
    if (this.sprinting && grounded) {
      this.state.stamina -= t.staminaSprintDrain * this.staminaDrainMultiplier * dt;
      this.staminaIdle = 0;
      if (this.state.stamina <= 0) {
        this.state.stamina = 0;
        this.state.exhausted = true;
      }
    } else {
      this.staminaIdle += dt;
      if (this.staminaIdle >= t.staminaRegenDelay) {
        this.state.stamina = Math.min(
          staminaMax,
          this.state.stamina + t.staminaRegen * this.staminaRegenMultiplier * dt,
        );
      }
    }
    if (this.state.exhausted && this.state.stamina >= t.staminaExhaustRecover) {
      this.state.exhausted = false;
    }

    let speed = this.crouching ? t.crouchSpeed : this.sprinting ? t.sprintSpeed : t.walkSpeed;
    if (this.aiming) speed *= t.aimSpeedMul;
    if (input.forward < 0) speed *= t.backpedalMul;

    // Basis must match the camera exactly: with a YXZ euler the camera's
    // forward is (-sin(yaw), -cos(yaw)) and its right is (cos(yaw), -sin(yaw)).
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    let f = input.forward;
    let r = input.right;
    const mag = Math.hypot(f, r);
    if (mag > 1) {
      f /= mag;
      r /= mag;
    }
    const wishX = fwdX * f + rightX * r;
    const wishZ = fwdZ * f + rightZ * r;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;

    if (grounded) {
      const accel = mag > 0.01 ? t.groundAccel : t.groundDecel;
      vel.x = approach(vel.x, targetX, accel * dt);
      vel.z = approach(vel.z, targetZ, accel * dt);
    } else {
      const accel = t.airAccel * t.airControl;
      if (mag > 0.01) {
        vel.x = approach(vel.x, targetX, accel * dt);
        vel.z = approach(vel.z, targetZ, accel * dt);
      }

      vel.x -= vel.x * 0.12 * dt;
      vel.z -= vel.z * 0.12 * dt;
    }

    if (grounded && this.body.groundNormalY < Math.cos((t.slopeSlideAngleDeg * Math.PI) / 180)) {
      const p = this.body.position;
      const e = 0.6;
      const gx = this.sampleGroundY(p.x + e, p.z) - this.sampleGroundY(p.x - e, p.z);
      const gz = this.sampleGroundY(p.x, p.z + e) - this.sampleGroundY(p.x, p.z - e);
      const glen = Math.hypot(gx, gz);
      if (glen > 1e-3) {
        const slide = (1 - this.body.groundNormalY) * 16;
        vel.x -= (gx / glen) * slide * dt;
        vel.z -= (gz / glen) * slide * dt;
      }
    }

    if (grounded) this.coyote = t.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);
    if (input.jump) this.jumpBuffer = t.jumpBufferTime;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const canJump =
      this.jumpBuffer > 0 &&
      this.coyote > 0 &&
      !this.crouching &&
      !this.state.exhausted &&
      this.state.stamina >= t.staminaJumpCost * 0.5;
    if (canJump) {
      vel.y = t.jumpSpeed;
      this.state.stamina = Math.max(0, this.state.stamina - t.staminaJumpCost);
      this.staminaIdle = 0;
      this.jumpBuffer = 0;
      this.coyote = 0;
    }

    if (!grounded) {
      vel.y -= t.gravity * dt;
      if (vel.y < -55) vel.y = -55;
    } else if (vel.y < 0) {
      vel.y = -2;
    }

    this.prevVelY = vel.y;
    this.body.move(dt);

    if (this.body.grounded && !grounded && this.prevVelY < -4) {
      this.landingDip = Math.min(0.14, (-this.prevVelY - 4) * 0.012);
    }

    this.horizontalSpeed = Math.hypot(vel.x, vel.z);

    const moving = this.body.grounded && this.horizontalSpeed > 0.6;
    const bobTarget = moving ? (this.sprinting ? 1 : this.crouching ? 0.35 : 0.6) : 0;
    this.bobAmount = damp(this.bobAmount, bobTarget, 7, dt);
    if (moving) {
      const rate = this.sprinting ? 12.6 : 8.4;
      this.bobPhase = (this.bobPhase + rate * dt) % (Math.PI * 2);
    }
    this.landingDip = damp(this.landingDip, 0, 7, dt);

    this.state.sprinting = this.sprinting;
    this.state.crouching = this.crouching;
    this.state.aiming = this.aiming;

    // Post-step snapshot. Crouch changes the capsule instantly, so the eye
    // height is eased over a few steps instead of snapping.
    const p1 = this.body.position;
    this.currPos.x = p1.x;
    this.currPos.y = p1.y;
    this.currPos.z = p1.z;
    this.currFeet = p1.y - this.body.feetOffset;
    const targetEye = this.crouching ? t.eyeCrouchHeight : t.eyeStandHeight;
    this.currEyeHeight = damp(this.currEyeHeight, targetEye, 14, dt);
  }

  private sampleGroundY(x: number, z: number): number {
    const p = this.body.position;
    const from = p.y + 3;
    const hit = this.physics.raycast(x, from, z, 0, -1, 0, 12);
    return hit ? from - hit.distance : p.y - this.body.feetOffset;
  }

  private canStand(): boolean {
    const t = PLAYER_TUNING;
    const p = this.body.position;
    const feet = p.y - this.body.feetOffset;
    const need = (t.standHalfHeight + t.radius) * 2;
    const hit = this.physics.raycast(p.x, feet + 0.2, p.z, 0, 1, 0, need - 0.15);
    return hit === null;
  }

  updateEye(alpha: number): void {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;

    // Interpolate the body transform between the last two fixed steps so the
    // camera advances smoothly on every rendered frame, including the frames
    // that fall between physics steps.
    const x = this.prevPos.x + (this.currPos.x - this.prevPos.x) * a;
    const z = this.prevPos.z + (this.currPos.z - this.prevPos.z) * a;
    const feet = this.prevFeet + (this.currFeet - this.prevFeet) * a;
    const eyeH = this.prevEyeHeight + (this.currEyeHeight - this.prevEyeHeight) * a;
    this.eyeHeight = eyeH;

    // Bob and landing dip are view-only, so interpolate them too; otherwise
    // they reintroduce the very stepping the position blend removes.
    let bobPhase = this.prevBobPhase;
    let dPhase = this.bobPhase - this.prevBobPhase;
    if (dPhase < -Math.PI) dPhase += Math.PI * 2;
    else if (dPhase > Math.PI) dPhase -= Math.PI * 2;
    bobPhase += dPhase * a;
    const bobAmount = this.prevBobAmount + (this.bobAmount - this.prevBobAmount) * a;
    const dip = this.prevLandingDip + (this.landingDip - this.prevLandingDip) * a;

    const bobY = Math.sin(bobPhase * 2) * 0.028 * bobAmount;
    const bobRoll = Math.sin(bobPhase) * 0.011 * bobAmount;

    this.eye.x = x;
    this.eye.y = feet + eyeH + bobY - dip;
    this.eye.z = z;
    this.viewOffset.roll = bobRoll;
    this.viewOffset.pitch = 0;
    this.viewOffset.y = bobY;
  }

  dispose(): void {
    this.body.dispose();
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}
