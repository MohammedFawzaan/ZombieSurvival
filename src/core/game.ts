import * as THREE from 'three';
import { Clock, FIXED_DT } from './clock';
import { Profiler } from './profiler';
import { GameState } from '../state/gameState';
import { GamePhase, type DebugSnapshot } from '../state/types';
import { InputSystem, type InputIntent } from '../input/input';
import { initRapier, PhysicsWorld } from '../physics/physics';
import { Terrain, DEFAULT_TERRAIN } from '../world/terrain';
import {
  generateVegetation,
  registerVegetationColliders,
  buildVegetationMeshes,
  type VegetationLayout,
  type VegetationRenderResult,
} from '../world/vegetation';
import { buildProps, type PropsResult } from '../world/props';
import { VegetationCuller } from '../world/vegetationCulling';
import { NoiseSystem } from '../world/noiseEvents';
import { Player } from '../player/player';
import { ZombieManager, DEFAULT_ZOMBIE_OPTIONS } from '../zombies/zombieManager';
import { CombatSystem, type ShotOutcome } from '../combat/combat';
import { WeaponSystem } from '../weapons/weaponSystem';
import type { WeaponDef } from '../weapons/definitions';
import { createRenderer, type RendererBundle, type RendererPreference } from '../render/rendererFactory';
import { QUALITY_PRESETS, applyQuality, type QualitySettings } from '../render/renderer';
import { Atmosphere } from '../render/sky';
import { buildTerrainMesh } from '../render/terrainMesh';
import { ZombieRenderer } from '../render/zombieRenderer';
import { ViewModel } from '../render/viewModel';
import { EffectsSystem } from '../render/effects';
import { clamp, damp } from '../util/math';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface GameOptions {
  quality: QualityLevel;
  rendererPreference: RendererPreference;
  seed: number;
}

const VIEWMODEL_FOV = 58;

const DEFAULT_OPTIONS: GameOptions = {
  quality: 'medium',
  rendererPreference: 'auto',
  seed: DEFAULT_TERRAIN.seed,
};

export class Game {
  readonly state = new GameState();
  readonly input = new InputSystem();
  readonly profiler = new Profiler();

  private canvas: HTMLCanvasElement;
  private options: GameOptions;
  private quality: QualitySettings;

  private clock = new Clock();
  private intent: InputIntent = InputSystem.createIntent();
  private frameHandle = 0;
  private fallbackTimer = 0;
  private lastTick = 0;
  lastStepCount = 0;
  private running = false;
  private disposed = false;

  private bundle!: RendererBundle;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private viewCamera!: THREE.PerspectiveCamera;
  private viewScene!: THREE.Scene;
  private viewLights!: {
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
  };
  private atmosphere!: Atmosphere;

  private physics!: PhysicsWorld;
  private terrain!: Terrain;
  private vegetationLayout!: VegetationLayout;
  private vegetation!: VegetationRenderResult;
  private props!: PropsResult;
  private culler = new VegetationCuller();
  private terrainMesh!: THREE.Mesh;

  private player!: Player;
  private zombies!: ZombieManager;
  private combat!: CombatSystem;
  private weapons!: WeaponSystem;
  private noise = new NoiseSystem();

  private zombieRenderer!: ZombieRenderer;
  private viewModel!: ViewModel;
  private effects!: EffectsSystem;

  private shotOutcome: ShotOutcome = CombatSystem.createOutcome();
  private tmpVec = new THREE.Vector3();
  private tmpMuzzle = new THREE.Vector3();
  private tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private cameraTargetFov = 72;
  private currentFov = 72;
  private movementNoiseTimer = 0;
  private readonly pendingEdges: {
    jump: boolean;
    firePressed: boolean;
    reload: boolean;
    interact: boolean;
    nextWeapon: boolean;
    switchTo: 1 | 2 | null;
  } = {
    jump: false,
    firePressed: false,
    reload: false,
    interact: false,
    nextWeapon: false,
    switchTo: null,
  };
  private renderTime = 0;
  private deathAnim = 0;
  private deathRoll = 0;
  private deathYaw = 0;
  private deathDriftX = 0;
  private deathDriftZ = 0;
  private deathPitchBias = 0;
  private lookAccumX = 0;
  private lookAccumY = 0;

  headless = false;
  debugEnabled = false;
  private debugSnapshot: DebugSnapshot = {
    fps: 0,
    frameMs: 0,
    simMs: 0,
    renderMs: 0,
    physicsMs: 0,
    aiMs: 0,
    drawCalls: 0,
    triangles: 0,
    playerPos: { x: 0, y: 0, z: 0 },
    playerVel: 0,
    grounded: false,
    zombieTotal: 0,
    zombieActive: 0,
    zombieAlive: 0,
    rendererType: '-',
    backend: '-',
    memoryMb: 0,
  };
  private debugListeners = new Set<(s: DebugSnapshot) => void>();
  private debugEmitAccum = 0;

  onReady: (() => void) | null = null;
  onLoadProgress: ((label: string, pct: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, options: Partial<GameOptions> = {}) {
    this.canvas = canvas;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.quality = QUALITY_PRESETS[this.options.quality];
  }

  async init(): Promise<void> {
    const progress = (label: string, pct: number) => this.onLoadProgress?.(label, pct);

    progress('Starting renderer', 0.05);
    this.bundle = await createRenderer(this.canvas, this.options.rendererPreference);
    applyQuality(this.bundle.renderer, this.quality);
    this.resize();

    this.camera = new THREE.PerspectiveCamera(
      this.currentFov,
      this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1),
      0.08,
      600,
    );
    this.camera.rotation.order = 'YXZ';

    progress('Loading physics', 0.15);
    const rapier = await initRapier();
    this.physics = new PhysicsWorld(rapier);

    progress('Generating terrain', 0.3);
    this.terrain = new Terrain({ ...DEFAULT_TERRAIN, seed: this.options.seed });
    this.physics.addTerrain(this.terrain);
    this.physics.addWorldBounds(this.terrain.half - 6, 160);
    const terrainBuild = buildTerrainMesh(this.terrain, this.quality.anisotropy);
    this.terrainMesh = terrainBuild.mesh;
    this.scene.add(this.terrainMesh);

    progress('Growing forest', 0.5);
    this.vegetationLayout = generateVegetation(
      this.terrain,
      this.quality.vegetationDensity,
      this.options.seed ^ 0x77,
    );
    registerVegetationColliders(this.physics, this.vegetationLayout);
    this.vegetation = buildVegetationMeshes(this.vegetationLayout, this.quality.grassEnabled);
    for (const layer of this.vegetation.cullLayers) this.culler.add(layer);
    this.scene.add(this.vegetation.group);

    progress('Placing landmarks', 0.65);
    this.props = buildProps(this.terrain, this.physics, this.options.seed ^ 0xabc);
    this.scene.add(this.props.group);

    progress('Lighting world', 0.75);
    this.atmosphere = new Atmosphere(this.quality.shadowMapSize, this.quality.shadowDistance);
    this.atmosphere.addTo(this.scene);

    progress('Spawning player', 0.85);
    const spawn = this.findPlayerSpawn();
    this.player = new Player(this.physics, this.state, spawn.x, spawn.y, spawn.z);
    this.weapons = new WeaponSystem(this.state);

    progress('Releasing the dead', 0.92);
    this.zombies = new ZombieManager(
      this.physics,
      this.terrain,
      this.player,
      this.state,
      this.noise,
      DEFAULT_ZOMBIE_OPTIONS,
      this.options.seed ^ 0x5eed,
    );
    this.combat = new CombatSystem(this.physics, this.zombies);
    this.zombies.onDamagePlayer = (amount, fromX, fromZ) => {
      const pp = this.player.position;
      // World angle toward the attacker, in the same convention as the
      // camera yaw (forward is -Z, so the Z term is negated).
      const angle = Math.atan2(fromX - pp.x, -(fromZ - pp.z));
      this.state.damage(amount, angle);
    };
    this.zombies.onZombieDied = (z) => {
      if (z.body) {
        const p = z.body.position;
        this.effects.spawnDeathBurst(p.x, p.y - z.body.feetOffset, p.z);
      }
    };

    this.zombieRenderer = new ZombieRenderer();
    this.scene.add(this.zombieRenderer.group);
    this.effects = new EffectsSystem();
    this.scene.add(this.effects.group);

    this.viewModel = new ViewModel();
    this.viewCamera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV,
      this.camera.aspect,
      0.01,
      12,
    );
    this.viewCamera.rotation.order = 'YXZ';
    this.viewScene = new THREE.Scene();
    this.viewScene.add(this.viewModel.group);
    const vmKey = new THREE.DirectionalLight(0xfff2dc, 2.1);
    vmKey.position.set(0.5, 0.9, 0.4);
    const vmFill = new THREE.DirectionalLight(0x9fb6d4, 0.85);
    vmFill.position.set(-0.7, 0.2, 0.5);
    const vmAmbient = new THREE.AmbientLight(0xa8b4c4, 0.75);
    this.viewScene.add(vmKey, vmFill, vmAmbient);
    this.viewLights = { key: vmKey, fill: vmFill, ambient: vmAmbient };

    this.zombies.populateInitial(DEFAULT_ZOMBIE_OPTIONS.targetActive);
    this.culler.update(this.player.eye.x, this.player.eye.z, 1, true);

    this.input.attach(this.canvas);
    this.state.setEvents({ onPhaseChange: (phase) => this.handlePhaseChange(phase) });

    this.input.setCallbacks({
      onEscape: () => this.handleEscape(),
      onLockChange: (locked) => this.handleLockChange(locked),
      onDebugToggle: () => this.setDebug(!this.debugEnabled),
    });

    this.debugSnapshot.rendererType = this.bundle.info.type;
    this.debugSnapshot.backend = this.bundle.info.backend;

    window.addEventListener('resize', this.handleResize);

    progress('Ready', 1);
    this.state.setPhase(GamePhase.Menu);
    this.onReady?.();
    this.start();
  }

  private findPlayerSpawn(): { x: number; y: number; z: number } {
    const clearOf = (
      list: { x: number; z: number; scale?: number }[],
      x: number,
      z: number,
      radius: number,
    ): boolean => {
      for (const item of list) {
        if (Math.hypot(item.x - x, item.z - z) < radius) return false;
      }
      return true;
    };

    for (let attempt = 0; attempt < 400; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = attempt < 200 ? Math.random() * 26 : Math.random() * 70;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (!this.terrain.isInBounds(x, z, 40)) continue;
      if (this.terrain.slopeAt(x, z) > 0.22) continue;

      // Nothing may be close enough to poke into the camera's near plane.
      if (!clearOf(this.vegetationLayout.trees, x, z, 3.2)) continue;
      if (!clearOf(this.vegetationLayout.bushes, x, z, 2.6)) continue;
      if (!clearOf(this.vegetationLayout.rocks, x, z, 2.8)) continue;
      if (!clearOf(this.props.landmarks, x, z, 9)) continue;

      return { x, y: this.terrain.heightAt(x, z) + 0.4, z };
    }
    return { x: 0, y: this.terrain.heightAt(0, 0) + 0.4, z: 0 };
  }

  startNewRun(): void {
    this.state.reset();
    this.weapons.reset();
    this.zombies.reset();
    this.zombieRenderer.reset();
    this.effects.reset();
    this.noise.clear();

    const spawn = this.findPlayerSpawn();
    this.player.respawn(spawn.x, spawn.y, spawn.z);
    this.player.yaw = Math.random() * Math.PI * 2;
    this.zombies.populateInitial(DEFAULT_ZOMBIE_OPTIONS.targetActive);

    this.viewModel.select(this.weapons.current.id);
    this.culler.update(this.player.eye.x, this.player.eye.z, 1, true);
    this.deathAnim = 0;
    this.deathRoll = 0;
    this.deathYaw = 0;
    this.deathDriftX = 0;
    this.deathDriftZ = 0;
    this.deathPitchBias = 0;
    this.state.setPhase(GamePhase.Playing);
    this.input.setEnabled(true);
    if (!this.headless) this.input.requestLock();
  }

  resume(): void {
    if (this.state.phase !== GamePhase.Paused) return;
    this.state.setPhase(GamePhase.Playing);
    this.input.setEnabled(true);
    if (!this.headless) this.input.requestLock();
  }

  pause(): void {
    if (this.state.phase !== GamePhase.Playing) return;
    this.state.setPhase(GamePhase.Paused);
    this.input.setEnabled(false);
    this.input.releaseLock();
  }

  private handleEscape(): void {
    if (this.state.phase === GamePhase.Playing) this.pause();
    else if (this.state.phase === GamePhase.Paused) this.resume();
  }

  private handleLockChange(locked: boolean): void {
    if (!locked && this.state.phase === GamePhase.Playing) this.pause();
  }

  /**
   * The death screen has buttons, so the cursor has to come back the moment
   * the player dies rather than the player having to press Escape first.
   */
  private handlePhaseChange(phase: GamePhase): void {
    if (phase === GamePhase.Dead) {
      this.input.setEnabled(false);
      this.input.releaseLock();
      // Fall to one side, chosen once so the collapse is not symmetrical.
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.deathRoll = dir * (1.28 + Math.random() * 0.3);
      this.deathYaw = dir * (0.3 + Math.random() * 0.18);
      this.deathPitchBias = (Math.random() - 0.5) * 0.2;
      // Topple a little to the side being rolled toward, plus a touch of
      // backward drift, so the body visibly falls rather than sinking.
      const sin = Math.sin(this.player.yaw);
      const cos = Math.cos(this.player.yaw);
      const side = 0.35 + Math.random() * 0.2;
      const back = 0.3 + Math.random() * 0.25;
      this.deathDriftX = cos * side * dir + sin * back;
      this.deathDriftZ = -sin * side * dir + cos * back;
    }
  }

  setDebug(v: boolean): void {
    this.debugEnabled = v;
    if (v) this.emitDebug();
  }

  setQuality(level: QualityLevel): void {
    this.options.quality = level;
    this.quality = QUALITY_PRESETS[level];
    applyQuality(this.bundle.renderer, this.quality);
    this.atmosphere.sun.shadow.mapSize.set(
      this.quality.shadowMapSize,
      this.quality.shadowMapSize,
    );
    this.atmosphere.setShadowMapSize(this.quality.shadowMapSize);
    if (this.atmosphere.sun.shadow.map) {
      this.atmosphere.sun.shadow.map.dispose();
      this.atmosphere.sun.shadow.map = null;
    }
    this.atmosphere.configureShadowFrustum(this.quality.shadowDistance);
    if (this.vegetation.grassMesh) {
      this.vegetation.grassMesh.visible = this.quality.grassEnabled;
    }
    this.resize();
  }

  __vegetation = (): VegetationLayout => this.vegetationLayout;

  /** Per-layer instance counts, for verifying vegetation culling coherence. */
  __vegetationCounts = (): number[] => {
    const counts: number[] = [];
    this.vegetation.group.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) counts.push(im.count);
    });
    return counts;
  };

  /** Rock geometry stats, for verifying the mesh is a closed solid. */
  __rockGeometryInfo = (): { vertices: number; unique: number; maxR: number; minR: number } => {
    let mesh: THREE.InstancedMesh | null = null;
    this.vegetation.group.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.name === 'rocks') {
        mesh = o as THREE.InstancedMesh;
      }
    });
    if (!mesh) return { vertices: 0, unique: 0, maxR: 0, minR: 0 };
    const pos = (mesh as THREE.InstancedMesh).geometry.attributes.position as THREE.BufferAttribute;
    const seen = new Set<string>();
    let maxR = 0;
    let minR = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      seen.add(`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`);
      const r = Math.hypot(x, y, z);
      if (r > maxR) maxR = r;
      if (r < minR) minR = r;
    }
    return { vertices: pos.count, unique: seen.size, maxR, minR: minR === Infinity ? 0 : minR };
  };

  /** Per-zombie rig visibility, for flicker verification. */
  __zombieVisibility = (): [number, boolean][] => this.zombieRenderer.debugVisibility();

  /** Camera orientation, for look-smoothness verification. */
  __look = (): { yaw: number; pitch: number } => ({
    yaw: this.player.yaw,
    pitch: this.player.pitch,
  });

  /** Interpolated camera position, for frame-pacing verification. */
  __eye = (): { x: number; y: number; z: number } => ({
    x: this.camera.position.x,
    y: this.camera.position.y,
    z: this.camera.position.z,
  });

  __probeShot = (
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): ShotOutcome => {
    return this.combat.fireHitscan(
      this.weapons.current,
      0,
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      this.shotOutcome,
    );
  };

  __test(): {
    player: Player;
    zombies: ZombieManager;
    weapons: WeaponSystem;
    forceIntent(partial: Partial<InputIntent>): void;
    forceLook(dx: number, dy: number): void;
    fireOnce(): void;
    terrain: Terrain;
  } {
    return {
      player: this.player,
      zombies: this.zombies,
      weapons: this.weapons,
      terrain: this.terrain,
      forceIntent: (partial) => {
        this.scriptedIntent = { ...InputSystem.createIntent(), ...partial };
      },
      forceLook: (dx, dy) => {
        this.player.look(dx, dy);
      },
      fireOnce: () => {
        this.weapons.forceFire((req, recoil) => this.handleShot(req.def, req.spread, recoil));
      },
    };
  }

  private scriptedIntent: InputIntent | null = null;

  get weaponsPublic(): WeaponSystem | null {
    return this.weapons ?? null;
  }

  get rendererInfo(): { type: string; backend: string } {
    return { type: this.bundle.info.type, backend: this.bundle.info.backend };
  }

  subscribeDebug(fn: (s: DebugSnapshot) => void): () => void {
    this.debugListeners.add(fn);
    fn(this.debugSnapshot);
    return () => this.debugListeners.delete(fn);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.reset();

    const loop = (now: number) => {
      if (!this.running) return;
      this.frameHandle = requestAnimationFrame(loop);
      this.lastTick = now;
      this.frame(now);
    };
    this.frameHandle = requestAnimationFrame(loop);

    // requestAnimationFrame is the ONLY driver of the real game: a second
    // timer racing it means double physics steps and double renders, which
    // is felt directly as stutter. Hidden-window/offscreen cases are handled
    // by __pump() below rather than by a background timer.
  }

  /**
   * Drive one frame explicitly. Used by the verification harness, where the
   * window may be occluded and requestAnimationFrame stops being delivered.
   * Guarded by lastTick so it can never double-step a live rAF loop.
   */
  __pump(nowMs?: number): void {
    if (!this.running) return;
    const now = nowMs ?? performance.now();
    if (now - this.lastTick < 4) return;
    this.lastTick = now;
    this.frame(now);
  }

  private frame(now: number): void {
    const steps = this.clock.advance(now);
    const dt = this.clock.frameDt;

    // Sensitivity must be current BEFORE the deltas are consumed, otherwise
    // aim sensitivity is always one frame behind the aim state.
    this.input.sensitivity = 0.0022 * (1 - this.weapons.aimBlend * 0.42);

    this.input.consume(this.intent);
    if (this.scriptedIntent) {
      const scripted = this.scriptedIntent;
      this.intent.forward = scripted.forward;
      this.intent.right = scripted.right;
      this.intent.sprint = scripted.sprint;
      this.intent.crouch = scripted.crouch;
      this.intent.jumpHeld = scripted.jumpHeld;
      this.intent.aim = scripted.aim;
      if (scripted.jump) {
        this.intent.jump = true;
        scripted.jump = false;
      }
      if (scripted.firePressed) {
        this.intent.firePressed = true;
        scripted.firePressed = false;
      }
      if (scripted.fire) this.intent.fire = true;
      if (scripted.reload) {
        this.intent.reload = true;
        scripted.reload = false;
      }
      if (scripted.switchTo !== null) {
        this.intent.switchTo = scripted.switchTo;
        scripted.switchTo = null;
      }
    }

    this.latchEdges();

    const playing = this.state.phase === GamePhase.Playing;

    if (playing) {
      // Mouse deltas are already absolute pixel counts, so they are applied
      // whole on the frame they arrive -- never scaled by dt and never run
      // inside the fixed step, both of which make look motion uneven.
      this.lookAccumX = this.intent.lookX;
      this.lookAccumY = this.intent.lookY;
      this.player.look(this.intent.lookX, this.intent.lookY);
    } else {
      this.lookAccumX = 0;
      this.lookAccumY = 0;
    }

    this.lastStepCount = steps;
    this.profiler.begin('sim');
    for (let i = 0; i < steps; i++) {
      this.applyLatchedEdges(i === 0);
      this.simulate(FIXED_DT, playing);
    }
    this.profiler.end('sim');

    this.state.playerYaw = this.player.yaw;
    this.state.tickFeedback(dt);
    this.updatePresentation(dt);

    this.profiler.begin('render');
    this.bundle.resetInfo();
    this.bundle.render(this.scene, this.camera);
    this.bundle.renderOverlay(this.viewScene, this.viewCamera);
    this.profiler.end('render');

    this.profiler.frame(dt);

    if (this.debugEnabled) {
      this.debugEmitAccum += dt;
      if (this.debugEmitAccum >= 0.2) {
        this.debugEmitAccum = 0;
        this.emitDebug();
      }
    }
  }

  private simulate(dt: number, playing: boolean): void {
    if (!playing) {
      this.noise.step(dt);
      return;
    }

    this.profiler.begin('player');
    this.player.step(dt, this.intent);
    this.enforcePlayerBounds();
    this.profiler.end('player');

    if (this.intent.switchTo === 1) this.weapons.selectSlot(0);
    else if (this.intent.switchTo === 2) this.weapons.selectSlot(1);
    else if (this.intent.nextWeapon) this.weapons.cycle();
    this.viewModel.select(this.weapons.current.id);

    const canAct = this.state.alive;
    this.weapons.step(dt, this.intent, canAct, (req, recoil) =>
      this.handleShot(req.def, req.spread, recoil),
    );

    this.movementNoiseTimer -= dt;
    if (this.movementNoiseTimer <= 0 && this.player.grounded) {
      const speed = this.player.horizontalSpeed;
      if (speed > 0.6) {
        const sprinting = this.player.sprinting;
        const crouching = this.player.crouching;
        const radius = crouching ? 4.5 : sprinting ? 22 : 12;
        const intensity = crouching ? 0.14 : sprinting ? 0.55 : 0.3;
        const p = this.player.position;
        this.noise.emit(p.x, p.y, p.z, radius, intensity, 'movement', 0.5);
        this.movementNoiseTimer = sprinting ? 0.34 : crouching ? 0.75 : 0.5;
      } else {
        this.movementNoiseTimer = 0.25;
      }
    }

    this.profiler.begin('physics');
    this.physics.step();
    this.profiler.end('physics');

    this.profiler.begin('ai');
    this.zombies.step(dt);
    this.profiler.end('ai');

    this.noise.step(dt);
  }

  private enforcePlayerBounds(): void {
    const p = this.player.position;
    const limit = this.terrain.half - 8;
    const groundY = this.terrain.heightAt(
      Math.max(-limit, Math.min(limit, p.x)),
      Math.max(-limit, Math.min(limit, p.z)),
    );
    const outside = Math.abs(p.x) > limit || Math.abs(p.z) > limit;
    const fallen = p.y < groundY - 25;
    if (!outside && !fallen) return;

    const cx = Math.max(-limit + 2, Math.min(limit - 2, p.x));
    const cz = Math.max(-limit + 2, Math.min(limit - 2, p.z));
    const safeY = this.terrain.heightAt(cx, cz);
    this.player.body.setPosition(cx, safeY + this.player.body.feetOffset + 0.2, cz);
  }

  private latchEdges(): void {
    const e = this.pendingEdges;
    if (this.intent.jump) e.jump = true;
    if (this.intent.firePressed) e.firePressed = true;
    if (this.intent.reload) e.reload = true;
    if (this.intent.interact) e.interact = true;
    if (this.intent.nextWeapon) e.nextWeapon = true;
    if (this.intent.switchTo !== null) e.switchTo = this.intent.switchTo;
  }

  /**
   * Only the first fixed step of a frame sees an edge; later steps must not
   * repeat it (one press must not become several jumps or several shots).
   */
  private applyLatchedEdges(isFirstStep: boolean): void {
    const e = this.pendingEdges;
    if (!isFirstStep) {
      this.intent.jump = false;
      this.intent.firePressed = false;
      this.intent.reload = false;
      this.intent.interact = false;
      this.intent.nextWeapon = false;
      this.intent.switchTo = null;
      return;
    }
    this.intent.jump = e.jump;
    this.intent.firePressed = e.firePressed;
    this.intent.reload = e.reload;
    this.intent.interact = e.interact;
    this.intent.nextWeapon = e.nextWeapon;
    this.intent.switchTo = e.switchTo;
    e.jump = false;
    e.firePressed = false;
    e.reload = false;
    e.interact = false;
    e.nextWeapon = false;
    e.switchTo = null;
  }

  private handleShot(
    def: WeaponDef,
    spread: number,
    recoil: { pitch: number; yaw: number },
  ): void {
    const eye = this.player.eye;
    this.tmpEuler.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
    const dir = this.tmpVec.set(0, 0, -1).applyEuler(this.tmpEuler);

    const outcome = this.combat.fireHitscan(
      def,
      spread,
      eye.x,
      eye.y,
      eye.z,
      dir.x,
      dir.y,
      dir.z,
      this.shotOutcome,
    );

    this.player.addRecoil(recoil.pitch, recoil.yaw);
    this.viewModel.onFire();

    const muzzle = this.viewModel.getMuzzleWorldPosition(this.tmpMuzzle);
    this.effects.spawnTracer(muzzle.x, muzzle.y, muzzle.z, outcome.endX, outcome.endY, outcome.endZ);
    for (const impact of outcome.impacts) this.effects.spawnImpact(impact);

    if (outcome.hitZombie) this.state.registerHit(outcome.killed);

    this.noise.emit(eye.x, eye.y, eye.z, def.noiseRadius, 1, 'gunshot', 0.7);
  }

  private updatePresentation(dt: number): void {
    this.player.updateEye(this.clock.alpha);

    const eye = this.player.eye;
    // Death collapse. Two stages so it reads as a body giving way rather than
    // a camera sliding down: a brief backward stagger, then the fall, with the
    // roll easing in late so the head turns as it hits the ground.
    const dying = !this.state.alive;
    this.deathAnim = damp(this.deathAnim, dying ? 1 : 0, dying ? 2.6 : 14, dt);
    const d = this.deathAnim;

    if (d > 0.001) {
      const feetY = this.player.feetY;

      // Stage 1 (0 -> ~0.25): knees buckle, a short drop and a lurch.
      // Stage 2 (~0.25 -> 1): the full fall to the ground.
      const buckle = Math.min(1, d / 0.25);
      const fall = clamp((d - 0.18) / 0.82, 0, 1);
      const fallEase = fall * fall * (3 - 2 * fall);

      const standEye = eye.y;
      const kneeEye = feetY + this.player.eyeHeight * 0.62;
      const groundEye = feetY + 0.3;
      const camY =
        standEye + (kneeEye - standEye) * buckle + (groundEye - kneeEye) * fallEase;

      // Slight sag forward first, then look up at the sky as the body lands.
      const pitchTarget = -0.34 + this.deathPitchBias;
      const pitch =
        this.player.pitch + (0.22 - this.player.pitch) * buckle +
        (pitchTarget - 0.22) * fallEase;

      // The roll lands late so the head tips over at the end of the fall.
      const rollEase = fallEase * fallEase;
      // A small settle wobble as it comes to rest.
      const settle =
        fall > 0.75 ? Math.sin((fall - 0.75) * 26) * 0.035 * (1 - fall) * 4 : 0;

      this.camera.position.set(
        eye.x + this.deathDriftX * fallEase,
        camY,
        eye.z + this.deathDriftZ * fallEase,
      );
      this.camera.rotation.set(
        pitch,
        this.player.yaw + this.deathYaw * fallEase,
        this.player.viewOffset.roll + (this.deathRoll + settle) * rollEase,
      );
    } else {
      this.camera.position.set(eye.x, eye.y, eye.z);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, this.player.viewOffset.roll);
    }
    const dcurve = d;

    const aim = this.weapons.aimBlend;
    const sprintFov = this.player.sprinting ? 4 : 0;
    this.cameraTargetFov = 72 - aim * 16 + sprintFov;
    this.currentFov = damp(this.currentFov, this.cameraTargetFov, 12, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }


    this.viewModel.update(
      dt,
      this.weapons,
      this.lookAccumX,
      this.lookAccumY,
      this.player.horizontalSpeed,
      this.player.grounded,
      this.player.sprinting,
    );
    this.weapons.sway(dt, this.player.horizontalSpeed);
    // Drop the weapon out of frame as the player collapses.
    this.viewModel.group.visible = dcurve < 0.55;

    this.culler.update(this.camera.position.x, this.camera.position.z, dt);
    // Zombies cast shadows inside a now-static frustum, so the shadow pass
    // still has to re-run while any of them are close enough to matter.
    this.atmosphere.update(
      this.scene,
      this.camera.position,
      this.quality.shadowDistance,
      this.zombies.activeCount > 0,
    );

    const sun = this.atmosphere.state;
    this.viewLights.key.color.copy(sun.sunColor);
    this.viewLights.key.intensity = 1.15 + sun.sunIntensity * 0.34;
    this.viewLights.ambient.color.copy(sun.ambientColor);
    this.viewLights.ambient.intensity = 0.34 + sun.ambientIntensity * 0.5;
    this.viewLights.key.position
      .copy(sun.sunDirection)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.player.yaw);
    this.viewCamera.fov = VIEWMODEL_FOV - this.weapons.aimBlend * 8;
    this.viewCamera.updateProjectionMatrix();
    this.renderTime += dt;
    this.zombieRenderer.update(this.zombies, dt, this.camera.position, this.renderTime);
    this.effects.update(dt);
  }

  private emitDebug(): void {
    const s = this.debugSnapshot;
    const p = this.player.position;
    const stats = this.bundle.getStats();
    s.fps = this.profiler.fps;
    s.frameMs = this.profiler.frameMs;
    s.simMs = this.profiler.get('sim');
    s.renderMs = this.profiler.get('render');
    s.physicsMs = this.profiler.get('physics');
    s.aiMs = this.profiler.get('ai');
    s.drawCalls = stats.drawCalls;
    s.triangles = stats.triangles;
    s.playerPos = { x: p.x, y: p.y, z: p.z };
    s.playerVel = this.player.horizontalSpeed;
    s.grounded = this.player.grounded;
    s.zombieTotal = this.zombies.maxCapacity;
    s.zombieAlive = this.zombies.aliveCount;
    s.zombieActive = this.zombies.activeCount;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    s.memoryMb = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
    s.steps = this.lastStepCount;
    s.playerMs = this.profiler.get('player');
    const snapshot = { ...s, playerPos: { ...s.playerPos } };
    for (const fn of this.debugListeners) fn(snapshot);
  }

  private handleResize = (): void => {
    this.resize();
  };

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.bundle.setSize(w, h);
    if (this.camera) {
      this.camera.aspect = w / Math.max(h, 1);
      this.camera.updateProjectionMatrix();
    }
    if (this.viewCamera) {
      this.viewCamera.aspect = w / Math.max(h, 1);
      this.viewCamera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    if (this.fallbackTimer) window.clearInterval(this.fallbackTimer);
    window.removeEventListener('resize', this.handleResize);
    this.input.dispose();
    this.zombieRenderer?.dispose();
    this.viewModel?.dispose();
    this.effects?.dispose();
    this.vegetation?.dispose();
    this.props?.dispose();
    this.atmosphere?.dispose();
    this.terrainMesh?.geometry.dispose();
    (this.terrainMesh?.material as THREE.Material | undefined)?.dispose();
    this.physics?.dispose();
  }
}
