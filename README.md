# Zombie Survival

A single-player, first-person 3D zombie-survival game for Windows desktop, built
without a traditional game engine: TypeScript, Electron, Three.js and Rapier.

The current build is the **core playable prototype** — you spawn into a bounded
forest, explore, get hunted by zombies, fight them with a pistol and a rifle,
die when overwhelmed, and restart. See [docs/progress.md](docs/progress.md) for
exactly what works, measured performance, and known issues.

## Requirements

- Node.js 20+
- npm
- Windows (the shell targets Windows; the renderer is platform-agnostic)
- Blender 5.x on `PATH`, only if you want to regenerate art assets

## Run it

```
npm install
npm start
```

Click **Enter the forest**, then use:

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `Space` | Jump |
| `Ctrl` / `C` | Crouch |
| Left mouse | Fire |
| Right mouse | Aim |
| `R` | Reload |
| `1` / `2` / `Q` | Weapons |
| `Esc` | Pause |
| `F3` | Debug overlay |

Aim for the head — headshots do 3.4x damage. Sprinting is loud and draws
zombies from ~22 m; crouching drops that to ~4.5 m and makes you harder to see.

## Development

```
npm run dev              # Vite dev server + Electron with hot reload
npm run typecheck        # tsc --noEmit
npm run test:unit        # 52 unit tests (vitest)
npm run build            # Build Electron bundles + renderer
npm run test:integration # Drive the real Electron build end to end
npm run test:all         # Unit tests, then build, then integration
npm run screenshots      # Capture gameplay frames to screenshots/
npm run package          # electron-builder --win --dir
```

Integration suites launch the built app and exercise it through a scripted
harness: end-to-end gameplay, movement direction against the camera basis,
crosshair-to-hit alignment, collision against terrain/trees/world bounds, melee
engagement distance, FPS floors, and a production launch check. They fail the
build if gameplay regresses.

Run one suite by name:

```
node tools/integration/run.mjs smoke
node tools/integration/run.mjs launch performance
```

## Assets

```
blender --background --python tools/blender/export_assets.py
```

Writes GLB files to `assets/models/`. The runtime still builds its geometry
procedurally; these exports are the upgrade path.

## Architecture

Gameplay state is authoritative and independent of rendering — no module under
`state/`, `player/`, `zombies/`, `weapons/`, `combat/` or `physics/` imports
Three.js, and rendering never owns gameplay values. Simulation runs at a fixed
60 Hz; rendering interpolates.

```
electron/     Desktop shell (main, preload, IPC)
src/core/     Clock, profiler, game orchestrator
src/state/    Authoritative state and shared types
src/input/    Keyboard/mouse, pointer lock
src/physics/  Rapier world, collision groups, character bodies
src/world/    Terrain, vegetation, props, spatial hash, noise events
src/player/   First-person controller
src/zombies/  Zombie types, pooling, AI state machine
src/weapons/  Weapon data and runtime
src/combat/   Hitscan, hitboxes, damage
src/render/   Renderer, sky, meshes, rigs, viewmodel, effects
src/ui/       React HUD and screens
```

The long-term V1 specification lives in [docs/](docs/).
