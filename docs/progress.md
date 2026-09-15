# Progress — Core Playable Prototype

**Status:** first playable milestone complete and verified in a running Electron build.

**Date:** 2026-09-11

---

## How to launch

```
npm install
npm start
```

`npm start` builds the Electron main/preload bundles, builds the renderer, and
launches the desktop app in production mode.

For development with hot reload:

```
npm run dev
```

Click **Enter the forest** on the title screen to capture the mouse and begin.

---

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Shift` | Sprint (drains stamina) |
| `Space` | Jump (costs stamina) |
| `Ctrl` / `C` | Crouch (quieter, harder to see) |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| `R` | Reload |
| `1` / `2` | Pistol / Rifle |
| `Q` / mouse wheel | Cycle weapon |
| `Esc` | Pause (releases the mouse) |
| `F3` or `` ` `` | Toggle the debug overlay |

---

## What works

### Desktop shell
- Electron 33 with context isolation, no node integration in the renderer, and
  a minimal IPC surface (quit, fullscreen, version info).
- Vite + TypeScript + React 18 renderer; esbuild bundles the Electron side.
- `npm run typecheck` is clean; 52 unit tests pass; 6 integration suites pass.

### Rendering
- Three.js WebGL2 renderer with ACES Filmic tone mapping and sRGB output.
- WebGPU is detected and reported in the debug overlay; the `WebGPURenderer`
  path exists behind a preference flag but WebGL2 is the default (see
  *Deferred* below for why).
- Custom sky shader with sun disc, glow and horizon haze; exponential fog;
  directional sun with PCF soft shadows, hemisphere ambient and a fill light.
- Vertex-coloured terrain blending grass, dry grass, dirt, rock and road by
  slope, height and noise, with detail roughness and normal maps.
- Weapon viewmodel renders in a second pass with its own camera and lights, so
  the gun never clips into geometry and stays lit consistently with the sun.

### World
- 420 x 420 m bounded forest on a seeded noise heightfield (169 x 169 grid),
  with hills, valleys, a flattened central basin for combat, and a raised rim
  ridge at the boundary.
- One authoritative heightfield feeds both the render mesh and the Rapier
  heightfield collider, so the visible ground is the collision ground.
- A dirt road winds north-south through the map, carved into the terrain, with
  roadside posts, barrels, crates and concrete ruins.
- Two cabins with solid walls as landmarks.
- Seven clearings plus a central clearing break up the forest.
- Instanced trees (3 variants), bushes, rocks and grass tufts, with
  distance-based instance culling rebuilt as the player moves.
- Invisible boundary walls plus a fall-through recovery that returns the player
  to safe ground.

### Player
- Kinematic capsule in Rapier via `KinematicCharacterController` — not a
  floating camera.
- Walk 4.0 / sprint 7.1 / crouch 1.9 m/s, with separate ground and air
  acceleration, air drag, and mild air control.
- Gravity, ground detection, autostep, snap-to-ground, slope climbing to 52°
  and downhill sliding past 46°.
- Jump with coyote time (0.11 s) and input buffering (0.14 s).
- Crouch shrinks the capsule in place and is blocked from standing when
  something is overhead.
- View bob, landing dip and camera roll; FOV widens when sprinting and narrows
  when aiming.
- Movement basis is derived from the camera basis, verified to under 1° error
  across 17 direction/yaw combinations.

### Zombies
- Pool of 44 slots; 16 target active, 26 max alive, spawning 34–105 m away,
  never in the player's forward cone at close range, never on steep ground or
  on top of each other.
- States: idle, wandering, detecting, chasing, attacking, staggered, dead.
- Three types: walker (balanced), runner (fast, fragile), brute (slow, tough).
- Perception combines a field-of-view/line-of-sight vision check with a noise
  event system (gunshots ~62–95 m, sprinting 22 m, walking 12 m, crouching
  4.5 m) into a gradual awareness value rather than binary detection.
- Line-of-sight raycasts and obstacle-avoidance probes are rate-limited and
  share a per-step raycast budget.
- Movement uses acceleration, turn-rate limits, facing-dependent speed,
  neighbour separation via a spatial hash, and obstacle probes — no teleporting
  or direct position assignment.
- Simulation tiers: full updates within 34 m, every third tick to 78 m,
  lightweight beyond, despawn past 190 m.
- Procedurally animated humanoid rigs (hips, torso, head, arms, forearms,
  thighs, shins, feet) with distinct idle, walk, chase, attack, stagger and
  death poses; 30-rig visual pool assigned nearest-first.
- Hit flash on damage, stagger with knockback, and a death collapse.

### Weapons and combat
- Data-driven pistol (M9, 15+75, semi, 300 rpm) and rifle (AR-15, 30+150, auto,
  720 rpm) with damage, range, falloff, spread, recoil, reload and penetration.
- Equip/switch with a swap delay that blocks firing, per-weapon ammo pools,
  reload that moves rounds from reserve and never invents ammunition.
- Spread is tighter when aiming, blooms per shot and recovers; recoil kicks the
  camera and settles; recoil is reduced while aiming.
- Hitscan with a Gaussian spread cone, verified to fire exactly along the
  crosshair at every tested yaw.
- Analytic ray-vs-sphere and ray-vs-vertical-capsule hitboxes for head, torso
  and limbs. Measured: **head 116, torso 34, limb 22** damage with the pistol.
- Headshots do 3.4x, limbs 0.65x. Damage falls off past the weapon's
  falloff-start distance.
- Feedback: tracers, muzzle flash mesh plus a point light (verified visible for
  ~5 frames at peak opacity 0.81), impact particles, blood on zombie hits,
  bullet decals on the world, hit markers and kill markers on the crosshair.

### Survival loop
- Health 100 with damage vignette, low-health vignette and death at zero.
- Stamina 100 with sprint drain, jump cost, delayed regeneration and an
  exhausted state that blocks sprinting until 32% recovers.
- Zombie attacks have windup, a committed damage frame, cooldown and range and
  facing checks. Measured 8 hits landed in 15 s of sustained melee at a stable
  0.84 m standoff.
- **YOU DIED** screen with kills and time survived, plus a Restart button that
  fully resets health, stamina, ammo, kills, timer, effects and the zombie
  population.
- Pause screen (Esc) with resume, restart and quit.

### HUD
Graphics preset selector (low/medium/high) on the pause screen.
Health and stamina bars, current weapon, magazine and reserve ammunition,
reload progress, weapon slots, kill count, survival timer, dynamic crosshair
that opens with spread, hit/kill markers, and status tags for
sprinting/crouching/aiming/exhausted.

### Debug overlay (F3)
FPS, frame time, sim/physics/AI/render milliseconds, draw calls, triangles,
player position, speed, grounded state, zombies alive/active/total, renderer
type and backend, and JS heap usage.

---

## Measured performance

Development machine: Intel Core i7-1185G7, Intel Iris Xe integrated graphics,
16 GB RAM, Windows 11. Measured in a focused 1600x900 window.

| Scenario | Avg FPS | Min FPS | Frame | Sim | Physics | AI | Render | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Idle, ~20 zombies | 132 | 97 | 8.4 ms | 2.6 ms | 2.6 ms | 0.5 ms | 4.8 ms | 145 | 543 K |
| Sprinting through forest | 114 | 92 | 9.1 ms | 2.8 ms | 4.6 ms | 0.4 ms | 4.9 ms | 174 | 540 K |
| 25 zombies aggroed in melee | 90 | 81 | 11.5 ms | 3.0 ms | 3.5 ms | 0.7 ms | 7.1 ms | 411 | 554 K |

Two optimisations mattered most:

1. **Distance-based instance culling** cut triangles from 1.17 M to ~540 K by
   rebuilding visible instance ranges instead of drawing the whole 420 m world.
2. **Replacing Rapier's character controller for zombies.**
   `computeColliderMovement` measured **0.41 ms per body per step**, which at 26
   zombies and 60 Hz is ~640 ms/s of solver time. Zombies now use a lightweight
   mover (terrain follow + a single blocking ray + direct separation nudges),
   which took crowd combat from 32 FPS/8 min to 90 FPS/81 min. The player still
   uses the full controller, where step-climbing and precise sliding matter.

---

## Verification

Unit tests (`npm run test:unit`) — 52 tests covering math helpers, terrain
determinism and sampling, weapon ammunition/fire-rate/switching/spread/recoil,
weapon data coherence, and game-state vitals.

Integration suites (`npm run test:integration`) drive the real Electron build:

- **smoke** — end-to-end: launch, menu, spawn, walk, sprint/stamina, jump
  (including 6 repeated presses), crouch, mouse look, zombie spawning and
  bodies, torso and head damage with the measured 3.4x headshot ratio, killing
  and the kill counter, reload consuming reserve, weapon switching, AI hearing a
  gunshot and closing distance, zombies damaging the player, death, and restart
  state reset.
- **direction** — 17 movement direction cases (W/A/S/D/diagonals across seven
  yaw angles) verified against the camera basis, plus 6 crosshair-to-hit
  alignment checks.
- **collision** — terrain adherence for every zombie, crowd separation, player
  approach distance, ground gap while sprinting, tree collision.
- **obstacles** — player and zombie driven into a trunk and required to stop,
  zombie navigating around a tree to a goal behind it, world-boundary
  containment.
- **melee** — a single zombie chasing from 12 m, required to reach attack range
  and land hits without entering the player capsule.
- **restart integrity** (inside smoke) — five consecutive restarts, checking
  that the live zombie count exactly matches the Rapier body count each time
  and does not grow, so restarting does not leak physics bodies.
- **performance** — FPS floors (30 avg / 20 min) across idle, sprinting and
  crowd-combat scenarios.
- **launch** — loads the production build the way `electron/main.ts` does,
  requiring the window to actually become visible, the game to reach the menu,
  the preload bridge to be exposed, and zero page errors.

`npm run screenshots` captures 17 gameplay frames to `screenshots/`.

---

## Bugs found and fixed during verification

- **Movement was mirrored against the camera.** Player movement used
  `(+sin(yaw), -cos(yaw))` as forward while the camera used
  `(-sin(yaw), -cos(yaw))`. The X axis was inverted, so at 90° the player moved
  opposite to where they were looking. It coincidentally matched at yaw 0 and
  180, which is why it survived casual testing. Both now derive from one basis.
- **Player could leave the world and fall forever.** Sprinting crested the rim
  ridge and reached x=260 in a 210-half-width world, then fell to y=-303. Added
  boundary colliders plus a fall-through recovery.
- **Zombies walked into the camera.** Separation only considered other zombies,
  and the new light mover ignores the player capsule. Added an explicit player
  standoff; they now hold ~0.84 m.
- **Weapon viewmodel filled the screen.** Arm geometry extended behind the
  camera plane, projecting to 2.15x the screen height. Shortened the forearms,
  moved the rig forward and scaled it down; max coverage is now 0.85.
- **HUD damage vignette froze.** `tickFeedback` decayed the flash values every
  frame but never notified React, so the vignette stuck at its last emitted
  value. It now emits on change.
- **Simulation froze when the window lost focus.** `requestAnimationFrame` is
  throttled when hidden or occluded; added a timer fallback.
- **Scene was far too dark.** Foliage and trunks read as black silhouettes.
  Raised sun and ambient intensity and lightened terrain, foliage and zombie
  materials.
- **Grass read as dark claws.** Blades were tall, narrow and vertical; widened
  and shortened them into low clumps.
- **Player spawned inside props.** Spawn now requires clearance from trees,
  bushes, rocks and landmarks.
- **Edge-triggered inputs were silently dropped.** Jump, fire, reload and weapon
  switch were consumed once per rendered frame, but a frame can run zero fixed
  steps on a display faster than 60 Hz — so the press was cleared before any
  simulation step observed it. Jumps failed intermittently. Edges are now
  latched and delivered to the first fixed step of the frame, then cleared, so
  one press is neither dropped nor repeated. Guarded by a test that requires
  6/6 jump presses to lift the player.

---

## Known issues and rough edges

- Zombies can clip ~0.2 m into a tree trunk before sliding off. Visually
  acceptable at gameplay distance but not exact.
- Zombie collision against thin geometry uses a single forward ray, so a very
  narrow obstacle approached at a shallow angle can be missed for one probe
  interval (0.14 s).
- Shadows have no cascades, so the shadow frustum follows the camera and distant
  shadows are omitted beyond the quality preset's shadow distance.
- The visual style is stylised low-poly rather than photoreal. The Blender
  pipeline exists but the game still builds its geometry procedurally.
- Bullet decals are a 48-entry ring buffer, so old holes disappear.
- No audio at all, by design for this milestone.
- `src/zombies/zombieManager.ts` (919 lines) and `src/core/game.ts` (771 lines)
  are larger than the engineering rules in `docs/roadmap.md` want. Both are
  internally sectioned (spawning / perception / state / movement / animation;
  init / loop / presentation), but they should be split before the AI
  specification in `docs/ai.md` is built out. Deliberately deferred here rather
  than refactoring verified gameplay at the end of the milestone.
- Quality presets (low/medium/high) are selectable from the pause screen and
  adjust shadow resolution, shadow distance, render scale, texture anisotropy,
  vegetation density and grass. Vegetation density only takes effect on a new
  world, since placement happens at load time.

---

## Asset pipeline

`tools/blender/export_assets.py` generates GLB assets headlessly:

```
blender --background --python tools/blender/export_assets.py
blender --background --python tools/blender/export_assets.py -- rock barrel
```

It currently produces `tree_conifer`, `tree_broadleaf`, `rock`, `bush`,
`barrel` and `zombie_base` into `assets/models/`. These are the upgrade path
for replacing procedural geometry piece by piece; the runtime does not load
them yet.

---

## Deferred (per the milestone brief)

Not started, and deliberately so: advanced inventory, loot, crafting, safe-house
functionality, medical/healing items, weather, full day/night simulation,
save/load, world streaming, Screamer and advanced group AI, sophisticated
searching behaviour, huge populations, complex POIs, melee weapons, the shotgun,
multiplayer/networking, audio, vehicles, third-person, and XP/levels/skill trees.

**On WebGPU:** the renderer factory detects WebGPU and can construct Three's
`WebGPURenderer`, but the default is WebGL2. On Iris Xe the WebGL2 path already
holds 90+ FPS in the worst measured case, and `WebGPURenderer` requires node
materials for the custom sky and particle shaders, which would mean maintaining
two shader paths before the gameplay is settled. The switch is a one-line
preference change (`rendererPreference: 'webgpu'`) once the shaders are ported.

---

## Architecture

Gameplay simulation is independent of rendering. Nothing under `state/`,
`player/`, `zombies/`, `weapons/`, `combat/`, `physics/` or `world/` (except the
mesh builders) imports Three.js, and the renderer never owns gameplay values.

```
electron/          Desktop shell: main process, preload, IPC surface
src/core/          Fixed-timestep clock, profiler, game orchestrator
src/state/         Authoritative game state and shared data types
src/input/         Keyboard/mouse capture, pointer lock, intent snapshot
src/physics/       Rapier world, collision groups, character bodies
src/world/         Terrain, vegetation, props, spatial hash, noise events
src/player/        First-person controller: movement, stamina, view
src/zombies/       Zombie types, pooled entities, AI state machine
src/weapons/       Weapon definitions and runtime firing/reload/spread
src/combat/        Hitscan, hitboxes, damage regions and falloff
src/render/        Renderer factory, sky, terrain mesh, rigs, viewmodel, FX
src/ui/            React HUD, screens, debug overlay
src/util/          Math and noise helpers
tools/             Electron build, Blender pipeline, integration harnesses
```

Simulation runs at a fixed 60 Hz with an accumulator capped at 5 steps per
frame; rendering interpolates and runs as fast as the display allows.

---

## Smoothness pass (2026-09-11)

Reported symptom: 100-120 FPS standing still, 60-70 moving, but movement and
mouse look felt laggy constantly. High FPS with bad feel meant the problem was
frame *pacing* and input timing, not GPU load.

### Root causes found and fixed

1. **No fixed-step interpolation (the main cause).**
   `Player.updateEye(_alpha)` ignored its `alpha` argument. Physics ran at a
   fixed 60 Hz while the display refreshed at 100-120 Hz, so roughly 45% of
   rendered frames reused a stale camera position. Now the body transform,
   view bob, landing dip and eye height are all interpolated between the last
   two fixed steps. `src/player/player.ts`

2. **Two loops driving the frame.**
   A `setInterval(16ms)` fallback ran alongside `requestAnimationFrame` and
   only checked a `lastTick` that rAF alone updated, so a slow frame let both
   run: double physics steps and double renders. rAF is now the single driver,
   with an explicit `__pump()` for hidden-window verification only.
   `src/core/game.ts`

3. **Uncapped presentation.**
   `disable-frame-rate-limit` let frames present mid-refresh, causing tearing
   and judder that reads as mouse lag. Removed in favour of vsync.
   `electron/main.ts`

4. **Mouse deltas lost/clumped between frames.**
   Mouse polling (125-1000 Hz) does not align with refresh, so per-frame event
   counts varied. Now uses `pointermove` with `getCoalescedEvents()` to count
   every hardware sample exactly once. `src/input/input.ts`

5. **Aim sensitivity one frame stale.**
   Sensitivity was assigned after the deltas were consumed. Moved before.
   `src/core/game.ts`

6. **Shadow map re-rendered every frame.**
   The sun target tracked the camera continuously, invalidating the whole
   shadow pass each frame. The frustum is now snapped to a texel grid and the
   pass re-runs only when the snapped focus moves (also removes shadow crawl).
   `src/render/sky.ts`

7. **Vegetation culler rebuilt every layer at once.**
   Rebuilds rewrote and re-uploaded thousands of instance matrices on a single
   frame every ~6 m walked, a periodic hitch. Now amortized one layer/frame.
   `src/world/vegetationCulling.ts`

8. **Zombies snapped to raw physics positions.** Distant zombies also only
   think every third step. Both now interpolate over their own update
   interval. `src/zombies/zombieManager.ts`, `src/render/zombieRenderer.ts`

9. Removed a per-frame `Vector3` allocation in the impact effect path.

### Measured result (Iris Xe, WebGL2, moving + sprinting)

| Metric | Before | After |
|---|---|---|
| Walk motion CV | 0.147 | **0.005** |
| Walk stalled frames | 2 / 239 | **0** |
| Mouse look CV (slow & fast) | - | **0.0000** |
| Look stalled frames | - | **0 / 179** |
| Frame time median | - | **16.7 ms** |
| Frame time p99 | - | **18.7 ms** |
| Frame time worst | - | **22.5 ms** |
| Spikes > 33 ms | - | **0** |

CV = coefficient of variation of per-frame travel; lower is more uniform.

### Verification

- 55 unit tests pass (`npm test`), including new `Clock` alpha tests.
- Integration suites pass: smoke, direction, collision, obstacles, melee,
  launch, pacing (`node tools/integration/run.mjs`).
- New `pacing` suite measures per-frame camera advance, mouse-look uniformity
  through the real input path, and the frame-time distribution.

### Follow-up pass: the two known issues (both fixed)

**1. Zombies snagging on trees — fixed.**
`avoidObstacles()` only probed +/-0.75 lateral offsets (about 37 degrees), too
shallow to clear a tree trunk approached head-on. Every probe failed, so the
code fell back to a hard 90-degree turn that pointed away from the goal, and
because the detour side was re-picked randomly on each probe the zombie
oscillated in front of the trunk instead of committing to a way around.

Now: probes sweep progressively wider (0.5 -> 3.4, i.e. up to a full
sidestep); the detour side is chosen once from the hit surface normal (the
shorter way around) and *committed* until the path ahead is clear; and the
fully-enclosed fallback slides along the obstacle rather than turning away
from the goal. Verified 5/5 consecutive passes, `reached=true`, arriving
within ~1.95 m of a goal 14 m directly behind the tree.
`src/zombies/zombieManager.ts`

**2. The `performance` suite's bogus FPS — fixed, and it exposed a real bug.**
The suite ran a hidden/occluded window, which stops requestAnimationFrame and
starved the loop, so its FPS numbers were meaningless.

Instrumenting the step count found something real underneath: the frame was
running `steps: 5` (the `MAX_STEPS_PER_FRAME` cap) every frame. That is a
catch-up spiral — a slow frame asks for more fixed steps, which makes the next
frame slower, which asks for more still. `simMs` of 30-108 ms was five steps'
cost stacked up, not one expensive step (per-step player cost was 0.53-0.63 ms,
physics 8.7-10.9 ms).

Fixes:
- `Clock.advance()` now caps catch-up at 2 steps once a frame exceeds 50 ms, so
  the loop sheds simulation time and recovers instead of spiralling. Ordinary
  jitter is still absorbed at the full 5-step budget. `src/core/clock.ts`
- The suite drives the loop at display cadence via `__pump()` and forces the
  window visible, so it measures the engine rather than the harness.
- Its assertions now check **per-step simulation cost** (player step, physics,
  AI, draw calls) instead of absolute FPS, because several Electron windows
  running in sequence contend for the same Iris Xe GPU and absolute FPS there
  is not comparable to real play.

For real frame-rate figures use the in-game **F3** overlay or the `pacing`
suite, not this stress harness.

### Known issues

None outstanding from the smoothness/stability work. Real frame-rate figures
come from the in-game F3 overlay or the `pacing` suite.

---

## Prototype polish pass (2026-09-13)

### Zombie flicker — four separate causes

The flicker was not one bug. Each of these produced a different artefact:

1. **Rig pool churn.** The renderer had 30 rig slots but culled at 130 m while
   the manager despawned at 190 m, and slots were handed out by distance-sorted
   first-come. Zombies crossing the boundary, or arriving when the pool was
   full, lost their rig for a frame and got it back the next. The pool is now
   32 (>= `maxAlive` 26), the visible radius is 200 m with a 210 m hide radius
   for hysteresis, and assignment is sticky. `src/render/zombieRenderer.ts`

2. **Corpses kept a stale transform.** A zombie with `deathTimer > 0` hit an
   early `continue` before its `distToPlayer` and render snapshot were
   refreshed, so collapsing bodies held an out-of-date distance (which gates
   visibility) and stale interpolation targets. `src/zombies/zombieManager.ts`

3. **Per-part frustum culling on an animated rig.** Limbs are posed by rotating
   parents, so each mesh's own bounding sphere does not describe where it
   actually ends up; Three.js culled individual parts against stale local
   bounds, popping limbs and whole bodies at screen edges. Culling is now off
   for rig parts (the pool already bounds how many exist).

4. **Animation frozen between LOD ticks — the one that remained after the
   first three.** `animPhase`, `speed` and `awareness` only advance on a
   zombie's own LOD tick: every third step beyond 34 m. Feeding them straight
   into the pose froze limbs for two steps and then jumped. The renderer now
   keeps its own per-slot phase that advances every rendered frame and is eased
   toward the simulated one, and `speed`/`awareness`/chase state are damped so
   crossing a threshold blends instead of snapping. Idle sway was also driven
   by `clock.elapsed`, which only moves in whole fixed steps; it now uses a
   continuous accumulator.

### Weapon/viewmodel flicker while moving

- Sway was driven by a **raw per-frame mouse delta**, so the same hand movement
  produced a larger target at low FPS than at high FPS and the gun jittered
  whenever frame times varied. The delta is converted to a per-second rate first.
- `walkBob` is a wrapped angle, but stopping damped the **phase** toward 0,
  dragging it backwards through a whole cycle whenever it sat near 2*PI — a
  visible snap. The phase now always advances and the **amplitude** fades out
  instead. `src/render/viewModel.ts`

### Rocks rendering as loose triangles

`IcosahedronGeometry` is non-indexed: every triangle carries its own copy of
each corner. The generator displaced **per vertex** with an independent random
factor, so shared corners moved to different positions and the mesh tore into
the floating triangles visible in the report screenshot. Displacement is now
keyed on the position and shared by every copy of it, using low-frequency lumps
plus fine grain, at subdivision level 2. Verified: 540 vertices resolve to 92
unique positions, radii stay within a 0.61-1.32 shell.
`src/world/vegetation.ts`

### Cursor on death / after restart

- Death never released pointer lock, so the "YOU DIED" buttons were unusable
  until the player pressed Escape. The game now reacts to the `Dead` phase and
  releases the cursor immediately.
- Chromium rejects a pointer-lock request made too soon after
  `exitPointerLock()` — exactly the death -> Restart path — which left the mouse
  dead in-game. `requestLock()` now retries (up to 12 attempts, 120 ms apart)
  and falls back to a plain request if `unadjustedMovement` is unsupported.
  `src/input/input.ts`, `src/core/game.ts`

### New: player death animation

Mirrors the zombies' death lean in first person: the camera sinks toward the
ground, pitches down and rolls onto one side (direction chosen randomly per
death so it is not symmetrical), the weapon drops out of frame partway through,
and the death screen is held back ~1.1 s so the collapse is actually seen.
Verified: camera drops 1.34 m, restart returns to `playing` at full health.

### Verification

- 55 unit tests pass.
- New `flicker` suite: 0 visibility toggles over 360 frames with 20 rigs.
- New `deathflow` suite: rock solidity, cursor release, camera collapse, restart.
- `collision`, `obstacles`, `pacing`, `direction`, `melee` all pass.
- `smoke` is timing-flaky under scripted scenarios (different random check fails
  between runs; reload verified correct at 15/15, reserve 75->70, and combat
  verified at 34 damage from every angle via `direction`).

---

## Flicker root cause found via video analysis (2026-09-13)

The previous pass fixed four zombie-specific flicker causes but the report
persisted. Extracting frames from the supplied capture (Blender, 869 frames at
24 fps) and diffing consecutive frames numerically showed the real problem:

```
DIFF f01  changed 0.90%   DIFF f05  changed 5.83%
DIFF f02  changed 1.04%   DIFF f06  changed 2.74%
DIFF f03  changed 2.27%   DIFF f07  changed 3.21%
DIFF f04  changed 3.05%   DIFF f08  changed 9.38%
```

Smooth camera motion produces a steady change rate. This swings 10x frame to
frame, and the hotspots covered the **entire frame including the sky/treeline
row** -- so it was never only the zombies. The whole scene was jittering.

**Cause: the vegetation culler's amortisation, added in the smoothness pass.**
That change spread rebuilds over one layer per frame to avoid a hitch, but all
layers rebuilt from a single `originX/originZ` snapshot captured when the
rebuild was queued. Trees rebuilt on frame N against the old camera position,
rocks on N+1, bushes on N+2 -- so different vegetation layers were
simultaneously positioned for *different camera positions*, and each popped as
its turn came round. The fix that removed one hitch introduced a continuous
one.

Fixed by giving every layer an 18 m residency margin beyond its cull radius and
rebuilding **all layers together against the current camera position**. The
margin means the camera can travel 13.5 m before a rebuild is needed, so
rebuilds are rare and nothing pops in between (everything newly in range was
already resident). `estimateCapacity` grew to cover the margin so the extra
instances are not silently dropped at the capacity guard.
`src/world/vegetationCulling.ts`, `src/world/vegetation.ts`

Measured over 240 frames of sprinting (instance counts per layer, per frame):

| | frames with a change | change rate |
|---|---|---|
| Staggered rebuild, stale origin (old) | 7 | 2.9% |
| Coherent rebuild, current origin (new) | 1 | **0.4%** |

A 7x reduction in visible vegetation churn.

### Also in this pass

- **Player death animation reworked.** Two stages instead of a single sink: the
  knees buckle (short drop plus a forward sag), then the body falls, with the
  roll eased in late so the head tips over at the end and a small settle wobble
  as it comes to rest. It also drifts sideways and backward so it reads as
  toppling rather than sliding down. Direction, roll, drift and pitch bias are
  randomised per death. `src/core/game.ts`

- **Damage direction indicator.** Zombie attacks now report the attacker's
  world position; `GameState` keeps short-lived damage directions (merging
  nearby ones, 2.2 s life) and the HUD draws red arcs around the crosshair
  pointing at each source. The camera's forward is `(-sin yaw, -cos yaw)`, so
  the basis matching `atan2(dx, -dz)` is `-yaw`, not `+yaw` -- verified against
  six cases (front/left/right/behind at two different facings) before building
  the UI. `src/zombies/zombieManager.ts`, `src/state/gameState.ts`,
  `src/ui/Hud.tsx`, `src/ui/hud.css`

### Verification

- `deathflow` PASS: rock welded (540 verts -> 92 unique positions), cursor
  released on death, camera drops 1.36 m, restart returns to full health.
- `flicker` PASS: 0 visibility toggles over 360 frames.
- `pacing` PASS with the new vegetation-coherence check.

---

## Flicker cause #6: stale interpolation origin + LOD threshold oscillation (2026-09-14)

The five previously-fixed causes were all real, but one remained, and the
`flicker` suite could not see it: it only sampled `root.visible` booleans. This
bug never changes visibility. The rig stays visible and is drawn in the wrong
place, so the suite reported **0 toggles** while zombies visibly strobed.

### Cause A — `prevRender*` was never advanced in the live path

In `ZombieManager.step()` the live branch overwrote `currRender*` each step but
never copied the old value into `prevRender*`. Only the corpse branch did that.
`prevRender*` was therefore written exactly once, under `if (!z.renderInit)` on
the zombie's first step, and then held that spawn position forever.

The renderer computes `prev + (curr - prev) * blend`. At LOD 0,
`renderBlendRate = 60` so `blend` saturates to 1 within one frame and the stale
origin is masked — which is why this survived every close-range test. At LOD 1
the rate is `1/(3*dt) = 20`, so `blend` sits at 0.33/0.66 and the rig is drawn a
third of the way back toward a position that may be tens of metres away.

### Cause B — no hysteresis on `NEAR_DIST` / `MID_DIST`

A chasing zombie matches the player's speed, so it parks almost exactly on the
34 m boundary for hundreds of frames. With hard thresholds it flipped tier
**every single frame**, alternating `renderBlendRate` between 60 and 20 and thus
alternating between the correct position and the stale one.

Measured, zombie 1 pacing the player at 33.9-34.0 m:

```
f406 lod=0 render=(17.5868,-7.1774)  stepMove= 0.058   body=(17.5868,-7.1774)
f408 lod=1 render=(30.4320,10.2144)  stepMove=21.662   body=(17.6068,-7.2924)
f409 lod=0 render=(17.7177,-7.3585)  stepMove=21.690   body=(16.6410,-7.4640)
f410 lod=1 render=(30.4084,10.0855)  stepMove=21.572   body=(17.6511,-7.5215)
```

A ~21 m teleport and back, every frame, with `root.visible` constant.

### Fixes

- Advance `prevRender* = currRender*` before writing the new transform, so
  interpolation always runs between two consecutive transforms.
- `LOD_HYSTERESIS = 3` m: promote on the plain threshold, demote only past the
  band, so a zombie pacing the player keeps its tier.

`src/zombies/zombieManager.ts`

### Measured (420 frames, sprinting, ~21 zombies)

| | render pos >1 m off body | worst | LOD flips |
|---|---|---|---|
| Before | 57.9% of samples | 21.7 m | 34 (21 on one zombie) |
| After | **0.20%** | **0.19 m** | **10** |

Residual >1 m samples are respawn slots whose `renderInit` is false; the
renderer forces alpha=1 in that case, so they are never drawn from the stale
pair.

### Suite improvement

`flicker` now also reconstructs the interpolated render transform, compares it
against the authoritative body position, and counts LOD tier flips. Validated
to FAIL before the fix (62.82% detached, worst 11.65 m) and PASS after (0.00%,
worst 0.19 m) — with `visibilityToggles: 0` in **both** runs, confirming the
old assertion was structurally blind to this class of bug.

Suites passing: `flicker`, `collision`, `melee`, `obstacles`, `pacing`.

---

## V1 build-out (2026-09-14)

Work delivered on top of the prototype, verified against real Electron builds.

### Zombie visual overhaul

The prototype zombie was a stack of boxes and cylinders built procedurally in
Three.js; `assets/models/zombie_base.glb` existed but was never loaded. V1
replaces both halves of that.

`tools/blender/export_assets.py` now authors three variants — walker, runner and
brute — using real mesh operations rather than stacked primitives, and exports
them with named animation clips (idle, walk, chase, attack, stagger, hit,
death). `src/render/zombieAssets.ts` loads them through `GLTFLoader`;
`ZombieRenderer.enableSkinned()` gates on a successful load, and the procedural
rig is retained as a fallback rather than deleted.

Measured in a running build via the new `zombieart` suite:

| | value |
|---|---|
| geometry source | `glb-skinned` (GLB path live, not the fallback) |
| visible rigs | 22 |
| draw calls | 3 / rig |
| triangles | 6,437 / rig |
| frozen animation samples over 180 frames | 0 |
| clip transitions observed | 16 |

The "frozen animation samples" check exists because cause #6 (stale
interpolation origin) had an obvious analogue in animation space: a clip time or
blend weight that only advances on a zombie's LOD tick would freeze and jump the
same way. It does not.

### Weapons: shotgun, melee, and the muzzle-space bug

Shotgun fires 9 pellets per shell, each its own hitscan with its own hit region
and falloff. Damage accumulates per zombie across the volley and is applied in a
single `applyDamage` call, so nine pellets into one target is one kill and one
hit marker rather than nine overlapping stagger rolls; a pellet stops at its
first zombie so it can never be counted twice.

Pellet spread (`src/weapons/pellets.ts`) uses `radius = sqrt(u)` for
area-uniformity, then stratifies: pellet *i* is confined to angular wedge *i*
and radial ring *i*, jittered within its cell. At 9 samples plain uniform
sampling visibly clumps; stratification guarantees a usable pattern every shell.
Verified numerically — mean radius converges to the analytic 2/3 within 0.03,
inner/outer halves split 45-55% by area, and all four quadrants are occupied on
every one of 500 shots.

Melee (machete) resolves inside a 0.10 s active window after a 0.12 s windup,
using a 7-sample swept arc rather than a single ray, and damages only the
nearest zombie in the arc. It can stagger a zombie that is already attacking,
which is what makes it usable as a panic button.

**A real bug found while building the viewmodels:** `getMuzzleWorldPosition()`
never returned a world position. The viewmodel renders in its own scene whose
camera never leaves the origin, so the value was camera-*local* — measured
`(0.249, -0.154, -0.940)` while the camera sat at `(-16.70, 3.80, -9.46)`. It
was passed straight to `effects.spawnTracer`, which places tracers in the world
scene, so every tracer originated near the map origin. Nearly invisible with a
single hitscan tracer; with the shotgun it would have been nine wrong streaks
per shot. Renamed to `getMuzzleViewPosition` (honest about its space) and the
call site now applies the simulation-authoritative pitch/yaw/eye, so it does not
depend on render state or a possibly-stale camera matrix. After the fix, with
the player at `(3.8, 1.0, 12.6)`, all nine pellet tracer origins are at
`(2.8, 1.7, 12.9)` — at the barrel.

### Medical and the interruption rule

Bandage heals 25 over 2.4 s and is **not** interruptible by damage; medkit heals
65 over 5.5 s and **is** aborted by damage, with the item refunded. The
asymmetry is the design: a bandage that could be cancelled by chip damage would
be useless in the only situation it is needed, and a medkit that could be used
mid-fight would remove the reason to disengage. Refunding rather than consuming
means a failed medkit costs time, not a scarce resource. Both abort and refund
on weapon switch or death; neither can start at full health or overheal.

### Audio

V1 ships audio, overriding the prototype-era "no audio in Version 1" line in
`docs/gameplay.md` (now reconciled). No sample files: every sound is synthesised
into an `AudioBuffer` at startup from filtered noise and oscillators, which
keeps the repo self-contained and lets a sound be retuned by changing numbers.

Gunshots layer a transient crack, a filtered noise blast and a low body sine;
varying the mix is what makes pistol, rifle and shotgun read as different
weapons rather than one bang at three volumes. Ambience loops cross-fade their
own head and tail so they do not click at the seam. Voice limiting is per-sound
and global (24), because a horde otherwise produces dozens of simultaneous
growls — unpleasant and a real cost on the target hardware.

### Loadout, settings, game flow

Flow is Menu → Loadout → Play → Results → Menu, with settings reachable from
both the menu and the pause screen. The loadout is weight-budgeted (30 kg) over
a weapon list rather than fixed slots; the default sits at 29.88 kg and a
fully-maxed loadout is 47.15 kg, so the budget forces a real choice. Settings
(graphics/audio/controls) persist to localStorage, with per-field validation so
one bad or outdated key cannot reset unrelated preferences.

### A regression caught only by running the build

Wiring the settings store into `App.tsx` introduced a subscription that fires
synchronously on subscribe, which called `Game.setQuality()` before `init()` had
created the renderer — `Cannot read properties of undefined (reading
'renderer')`, and the game never reached the menu. `tsc` was entirely happy with
it. Fixed by guarding on `this.bundle`; the chosen preset still applies at
startup because `this.quality` is assigned before `init()` reads it. This is the
concrete case for the roadmap's rule that compiling is not evidence.

### Harness note

`direction` (and other suites) can report a spurious FAIL when several Electron
instances run concurrently — GPU cache contention, visible as
`Unable to create cache` / `Gpu Cache Creation failed` in the output. Run a
suspect suite alone before treating its failure as real; `direction` passed on
two consecutive solo runs immediately after failing in a contended batch.
