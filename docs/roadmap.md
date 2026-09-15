# Version 1 Roadmap & Engineering Rules

## Phase 0 — Foundation
- Create project from scratch.
- Configure TypeScript.
- Configure Vite.
- Configure Electron.
- Configure React UI.
- Install Three.js.
- Configure WebGPU renderer.
- Implement WebGL2 fallback.
- Configure Rapier.
- Establish asset directories.
- Establish Blender automation pipeline.
- Establish testing.
- Establish Git/LFS.

## Phase 1 — Rendering prototype
Build a small representative scene first:
- terrain
- forest
- lighting
- PBR materials
- WebGPU
- shadows
- atmospheric effects
- first-person camera

Benchmark before scaling.

## Phase 2 — Player physics
Implement:
- movement
- acceleration
- gravity
- collision
- slopes
- sprint
- crouch
- jump
- stamina

Verify movement physically and visually.

## Phase 3 — World
Expand into the intended bounded forest world:
- roads
- terrain
- vegetation
- landmarks
- safe house
- collision
- world streaming/activation if needed

## Phase 4 — Zombie simulation
Implement:
- zombie entities
- animation
- states
- perception
- noise
- navigation
- combat
- group behaviour
- population management

Benchmark with increasing population.

## Phase 5 — Combat
Implement:
- weapons
- aiming
- firing
- recoil
- spread
- hit detection
- damage
- hit regions
- zombie reactions
- melee

## Phase 6 — Survival
Implement:
- inventory
- loot
- medical items
- healing
- crafting
- safe-house storage

## Phase 7 — Environment simulation
Implement:
- day/night
- weather
- visibility changes
- perception changes

## Phase 8 — Persistence
Implement:
- local save/load
- validation
- corruption-safe writing
- migration/versioning

## Phase 9 — Polish
Improve:
- models
- materials
- animation
- lighting
- terrain
- vegetation
- AI transitions
- UI
- performance
- stability

## Development loop
Always:
INSPECT → PLAN → IMPLEMENT → BUILD → RUN → TEST → OBSERVE → FIX → OPTIMIZE → VERIFY → CONTINUE

Never mark a feature complete solely because code compiles.

## Engineering rules
- Depth over breadth.
- Avoid premature complexity.
- Avoid giant files.
- Avoid global mutable state where possible.
- Use typed data.
- Keep gameplay independent of rendering.
- Keep physics independent of UI.
- Keep AI independent of presentation.
- Keep assets replaceable.
- Keep persistence modular.
- Do not add multiplayer yet.
- Audio is in scope for V1: minimal and purposeful only, no dynamic music system.
- Do not add vehicles.
- Do not add RPG levels.
- Do not expand the world merely to make it bigger.

## Definition of done
Version 1 is complete when the player can:
Launch → Spawn → Explore → Encounter substantial zombie population → Fight → Loot → Heal → Craft → Use safe house → Experience day/night/weather → Save/load → Continue surviving.

The final result must feel like a serious, technically ambitious survival-game foundation rather than a graphics/AI demonstration.
