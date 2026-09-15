# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-player first-person 3D zombie-survival game for Windows, built without a game
engine: TypeScript + Electron + Three.js + Rapier. The repo currently holds the **core
playable prototype**; the full V1 specification lives in `docs/` and is largely not built
yet. `docs/progress.md` is the source of truth for what actually works, what the measured
numbers are, and what is deliberately deferred — read it before assuming a system exists.

## Commands

```
npm start                 # Build everything, launch Electron in production mode
npm run dev               # Vite dev server (port 5273, strictPort) + Electron, hot reload
npm run typecheck         # tsc --noEmit
npm run test:unit         # vitest run
npm run build             # build:electron (esbuild) then build:renderer (vite)
npm run test:integration  # All integration suites against the built app
npm run test:all          # unit -> build -> integration
npm run screenshots       # Capture gameplay frames to screenshots/
npm run package           # electron-builder --win --dir
npm run installer         # electron-builder --win (NSIS installer)
```

Single unit test file: `npx vitest run src/world/terrain.test.ts`

Single integration suite (requires `npm run build` first — the runner refuses to start
without `dist/index.html`):

```
node tools/integration/run.mjs smoke
node tools/integration/run.mjs launch performance
```

Suite names: `smoke`, `direction`, `collision`, `obstacles`, `melee`, `performance`,
`launch`, `pacing`, `flicker`, `zombieart`, `zombieshots`, `deathflow`, `atmosphere`,
`skycheck`, `screenshots`. Running with no arguments skips the frame-capture suites.

Regenerating art (optional, needs Blender 5.x on PATH):
`blender --background --python tools/blender/export_assets.py`

## Architecture

### The one rule that shapes everything

Gameplay state is authoritative and independent of rendering. No module under `state/`,
`player/`, `zombies/`, `weapons/`, `combat/` or `physics/` imports Three.js, and rendering
never owns a gameplay value. Renderers read simulation output; they do not mutate it.
Electron main is a shell only — no gameplay there.

### Fixed-step simulation, interpolated rendering

[src/core/clock.ts](src/core/clock.ts) accumulates real time into fixed 60 Hz steps
(`FIXED_DT`) and exposes `alpha` for interpolation. `Game.frame()` in
[src/core/game.ts](src/core/game.ts) runs N simulate steps then exactly one render. Three
deliberate properties of this loop are easy to break:

- The clock caps catch-up steps (2 on an already-slow frame, else 5) so a long frame does
  not spiral by requesting still more simulation.
- `requestAnimationFrame` is the **only** driver. Never add a second timer (setInterval, a
  setTimeout loop) that also steps or renders — that double-steps physics and is felt
  directly as stutter. Offscreen/occluded cases use `Game.__pump()` instead, which is
  guarded by `lastTick` so it cannot double-step a live rAF loop.
- Mouse look is applied whole, per frame, outside the fixed step — never scaled by dt and
  never inside `simulate()`. Look sensitivity is recomputed *before* input is consumed, so
  aim-down-sights sensitivity is not a frame behind.

`docs/progress.md` documents the specific flicker and judder bugs already fixed here; each
had a non-obvious cause and reintroducing one is easy.

### Module map

```
electron/     Desktop shell: main (GPU switches, window, IPC), preload (contextBridge)
src/core/     clock (fixed step), profiler, game (orchestrator — wires every system)
src/state/    GameState (authoritative, pub/sub HudSnapshot), shared types
src/input/    Keyboard/mouse, pointer lock
src/physics/  Rapier world, collision groups, kinematic character bodies
src/world/    Terrain heightfield, vegetation, props, spatial hash, noise events
src/player/   First-person controller (movement, stamina, crouch, eye interpolation)
src/zombies/  Zombie types, pooling, AI state machine, LOD tiers, ray budget
src/weapons/  Weapon definitions (data), WeaponSystem (runtime), shotgun pellet patterns
src/combat/   Hitscan, hitboxes, damage, hit regions, melee swept-arc resolution
src/medical/  Bandage/medkit definitions and the healing runtime
src/inventory/ Inventory model and the weight-budgeted loadout
src/time/     Day/night cycle (pure simulation; the sky reads it)
src/weather/  Clear/cloudy/rain state and the ambience mix
src/audio/    Web Audio mixer, procedural sound bank, event bridge
src/settings/ Persisted graphics/audio/controls settings
src/render/   rendererFactory, renderer, sky, terrainMesh, zombieRenderer, zombieAssets,
              viewModel, effects, weatherFx, atmosphereGrading
src/ui/       React HUD and screens (App owns the Game instance)
```

[src/core/game.ts](src/core/game.ts) (~950 lines) and
[src/zombies/zombieManager.ts](src/zombies/zombieManager.ts) (~1030 lines) are the two hot
spots; `docs/roadmap.md` calls out that both exceed its "avoid giant files" rule and want
splitting.

### Rendering

WebGL2 is the default path. [src/render/rendererFactory.ts](src/render/rendererFactory.ts)
detects WebGPU and can construct Three's `WebGPURenderer`, but `preference: 'auto'`
deliberately resolves to WebGL2 — the custom sky and particle shaders would need
node-material ports, and WebGL2 already holds the performance target on Iris Xe. Switching
is a one-line preference change once the shaders are ported; do not flip it casually.

Rendering is two passes against one bundle: the world scene, then the weapon viewmodel in
its own scene with its own camera and lights (`renderOverlay`, autoClear off + clearDepth)
so the gun never clips into geometry.

Zombies load real skinned GLB models (`assets/models/zombie_walker|runner|brute.glb`) via
[src/render/zombieAssets.ts](src/render/zombieAssets.ts), with named animation clips driven
by a per-rig `AnimationMixer`. `enableSkinned()` gates on a successful load and the
procedural rig remains as a fallback — `__zombieCost().source` reports `glb-skinned` when
the GLB path is live. World geometry (terrain, vegetation, props) is still procedural.

### Physics and collision

[src/physics/physics.ts](src/physics/physics.ts) defines `GROUP` bitmasks and `FILTER`
pairs — every collider must be created with an explicit `setCollisionGroups(FILTER.x)`.
`RAY_SOLID_FILTER` is what hitscan and AI line-of-sight rays test against. One
authoritative heightfield feeds both the render mesh and the Rapier heightfield collider,
so the visible ground is the collision ground; keep them generated from the same source.

### Zombie AI budgeting

`ZombieManager.step()` rebuilds a spatial hash each step, rotates a `tickIndex` over 3
phases so not every zombie does expensive work every step, assigns an LOD tier by distance
(`NEAR_DIST`/`MID_DIST`), and spends a per-step `rayBudget` on line-of-sight checks.
Corpses still update distance and render transforms while collapsing — skipping that was a
real flicker bug, since the renderer gates visibility on distance. Preserve these budgets
when adding behaviour.

### UI

[src/ui/App.tsx](src/ui/App.tsx) constructs the `Game`, exposes it as `window.game`, and
subscribes to two streams: `game.state.subscribe` (HudSnapshot, emitted on change) and
`game.subscribeDebug` (DebugSnapshot, throttled to 5 Hz and only while the F3 overlay is
on). React renders HUD chrome only — it is never in the frame-critical path.

## Integration test harness

[tools/integration/run.mjs](tools/integration/run.mjs) copies each suite `.cjs` into a temp
directory as a standalone Electron app (rewriting its `root` constant to point back at the
repo), spawns the real `electron` binary against the real `dist/` build, and parses
`VERDICT: PASS|FAIL` plus the exit code from stdout. Suites drive the game through hooks
the `Game` class exposes for exactly this purpose:

- `window.game.__test()` — `forceIntent()`, `forceLook()`, `fireOnce()`, plus direct access
  to player / zombies / weapons / terrain
- `__pump()`, `__eye()`, `__look()`, `__probeShot()`, `__zombieVisibility()`,
  `__vegetation()`, `__vegetationCounts()`, `__rockGeometryInfo()`
- `game.headless = true`, `game.startNewRun()`

These `__`-prefixed members are a deliberate test surface, not dead code. Adding a suite
means dropping the file in `tools/integration/`, registering it in the `SUITES` map, and
printing a `VERDICT:` line.

Never mark a feature complete because it typechecks — `docs/roadmap.md` states this
explicitly. Verify behaviour in a running build.

## Subagents — delegate V1 work by domain

Four project subagents live in `.claude/agents/`. When a task falls clearly inside one
domain, delegate it rather than doing it inline; each agent's file carries the constraints
and verification commands for its area.

| Agent | Owns |
| --- | --- |
| `zombie-visuals` | Zombie Blender assets and GLB pipeline, meshes/rigs/materials/animation, zombie instancing and draw cost, flicker and rendering artefacts on zombies |
| `gameplay` | Loadout and weapon switching, shotgun, melee, medical/healing items, inventory plumbing, damage and hit-region tuning |
| `environment` | Day/night cycle, weather, audio (when V1 opens it up), forest and terrain visual quality, vegetation, fog and post-processing |
| `qa-performance` | Running suites against a real build, regression diagnosis, new integration suites, profiling, frame pacing, optimisation for the Iris Xe target |

Routing notes for the boundaries that actually overlap:

- Zombie *appearance* → `zombie-visuals`. Zombie *behaviour* (perception, pathing, AI state
  machine, spawn budgets) is simulation and stays with the main agent or `gameplay`.
- A new weapon's mechanics → `gameplay`; its viewmodel and muzzle effects → `environment`
  only if they are world/atmosphere work, otherwise keep them with `gameplay` and the
  render conventions in this file.
- Anything whose deliverable is a *measurement* (is it faster, is it smooth, did it
  regress) → `qa-performance`, including verifying another agent's change.

A change that spans domains gets split: do the simulation half first, then hand the
presentation half over with the state contract already settled.

## Conventions

- Strict TypeScript with `noUnusedLocals` / `noUnusedParameters`; `@/*` aliases `src/*`.
- `const enum` for gameplay enums, all in [src/state/types.ts](src/state/types.ts).
- Hot paths preallocate scratch vectors as class fields (`tmpVec`, `tmpEuler`) rather than
  allocating per frame.
- **Do not write code comments.** Make the code self-explanatory through naming instead.
  Explanations of non-obvious constraints belong in `docs/progress.md`, not in the source.
  Older files still carry comments; strip them from any region you edit.
