import { AudioEngine } from './audioEngine';
import { SOUND_IDS, registerAllSounds } from './soundBank';

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface AmbienceMix {
  forest: number;
  night: number;
  rain: number;
}

const FOOTSTEP_INTERVAL_WALK = 0.52;
const FOOTSTEP_INTERVAL_SPRINT = 0.34;
const FOOTSTEP_INTERVAL_CROUCH = 0.78;
const ZOMBIE_IDLE_MIN_GAP = 2.4;
const ZOMBIE_IDLE_CHANCE_PER_SECOND = 0.22;
const ZOMBIE_IDLE_RANGE = 42;

export class AudioBridge {
  readonly engine = new AudioEngine();

  private footstepAccum = 0;
  private zombieIdleTimer = 0;
  private mix: AmbienceMix = { forest: 0, night: 0, rain: 0 };

  constructor() {
    registerAllSounds(this.engine);
  }

  async start(): Promise<void> {
    await this.engine.start();
  }

  get ready(): boolean {
    return this.engine.ready;
  }

  get activeVoices(): number {
    return this.engine.activeVoices;
  }

  setLevels(master: number, effects: number, ambience: number): void {
    this.engine.setLevels({ master, effects, ambience });
  }

  updateListener(pose: ListenerPose): void {
    this.engine.setListener(
      pose.x,
      pose.y,
      pose.z,
      -Math.sin(pose.yaw),
      0,
      -Math.cos(pose.yaw),
    );
  }

  setAmbienceMix(mix: AmbienceMix): void {
    this.mix = mix;
    this.engine.setAmbience(SOUND_IDS.ambienceForest, mix.forest);
    this.engine.setAmbience(SOUND_IDS.ambienceNight, mix.night);
    this.engine.setAmbience(SOUND_IDS.ambienceRain, mix.rain);
  }

  get ambienceMix(): AmbienceMix {
    return this.mix;
  }

  weaponFired(weaponId: string): void {
    switch (weaponId) {
      case 'shotgun':
        this.engine.play(SOUND_IDS.shotgunShot);
        break;
      case 'rifle':
        this.engine.play(SOUND_IDS.rifleShot);
        break;
      case 'melee':
        this.engine.play(SOUND_IDS.meleeSwing);
        break;
      default:
        this.engine.play(SOUND_IDS.pistolShot);
    }
  }

  dryFire(): void {
    this.engine.play(SOUND_IDS.dryFire);
  }

  reloadStarted(): void {
    this.engine.play(SOUND_IDS.reloadOut);
  }

  reloadFinished(): void {
    this.engine.play(SOUND_IDS.reloadIn);
  }

  bulletImpact(x: number, y: number, z: number): void {
    this.engine.playAt(SOUND_IDS.bulletImpact, x, y, z);
  }

  meleeImpact(x: number, y: number, z: number): void {
    this.engine.playAt(SOUND_IDS.meleeImpact, x, y, z);
  }

  zombieHurt(x: number, y: number, z: number): void {
    this.engine.playAt(SOUND_IDS.zombieHurt, x, y, z);
  }

  zombieDied(x: number, y: number, z: number): void {
    this.engine.playAt(SOUND_IDS.zombieDeath, x, y, z);
  }

  zombieAttacked(x: number, y: number, z: number): void {
    this.engine.playAt(SOUND_IDS.zombieAttack, x, y, z);
  }

  zombieAlerted(x: number, y: number, z: number): void {
    this.engine.playAt(SOUND_IDS.zombieAlert, x, y, z);
  }

  playerHurt(): void {
    this.engine.play(SOUND_IDS.playerHurt);
  }

  healUsed(): void {
    this.engine.play(SOUND_IDS.heal);
  }

  healComplete(): void {
    this.engine.play(SOUND_IDS.healComplete);
  }

  tickFootsteps(
    dt: number,
    speed: number,
    grounded: boolean,
    sprinting: boolean,
    crouching: boolean,
  ): void {
    if (!grounded || speed < 0.6) {
      this.footstepAccum = FOOTSTEP_INTERVAL_WALK * 0.6;
      return;
    }
    const interval = crouching
      ? FOOTSTEP_INTERVAL_CROUCH
      : sprinting
        ? FOOTSTEP_INTERVAL_SPRINT
        : FOOTSTEP_INTERVAL_WALK;
    this.footstepAccum += dt;
    if (this.footstepAccum >= interval) {
      this.footstepAccum -= interval;
      const gain = crouching ? 0.28 : sprinting ? 1 : 0.5;
      this.engine.play(SOUND_IDS.footstep, gain);
    }
  }

  tickZombieAmbience(
    dt: number,
    nearest: { x: number; y: number; z: number; dist: number } | null,
  ): void {
    this.zombieIdleTimer -= dt;
    if (this.zombieIdleTimer > 0 || !nearest) return;
    if (nearest.dist > ZOMBIE_IDLE_RANGE) return;
    if (Math.random() > ZOMBIE_IDLE_CHANCE_PER_SECOND * dt * 60) return;
    this.zombieIdleTimer = ZOMBIE_IDLE_MIN_GAP + Math.random() * 2.6;
    this.engine.playAt(SOUND_IDS.zombieIdle, nearest.x, nearest.y, nearest.z);
  }

  reset(): void {
    this.footstepAccum = 0;
    this.zombieIdleTimer = 0;
  }

  stopAll(): void {
    this.engine.stopAll();
  }

  dispose(): void {
    this.engine.dispose();
  }
}
