# Technical Architecture — Version 1

## Architecture
Use a modular TypeScript architecture with strict separation of:
- rendering
- gameplay state
- physics
- AI
- world
- weapons
- inventory
- loot
- survival
- UI
- assets
- persistence
- Electron shell

Rendering objects must not become the authoritative source of gameplay state.

## Desktop
Electron is the desktop shell only.
- Keep gameplay out of Electron main.
- Keep renderer isolated.
- Use secure Electron configuration.
- Expose only APIs that are actually required.

## Rendering
Primary:
- Three.js WebGPURenderer
- WebGPU backend

Fallback:
- WebGL2 backend

Use:
- PBR materials
- high-quality lighting
- dynamic shadows
- tone mapping
- color management
- atmospheric effects
- post-processing
- TSL/node materials where useful
- GPU instancing
- LOD
- frustum culling

Do not assume every WebGPU feature is universally available. Keep a reliable fallback path.

## Physics
Rapier handles appropriate physical simulation and collision.

Use mathematical models for:
- velocity
- acceleration
- gravity
- impulses
- friction
- drag
- slope handling
- collision response
- ray intersections
- distances
- angles

Do not physically simulate decorative objects unnecessarily.

## World
World systems should be data-driven and support:
- terrain generation
- vegetation placement
- roads
- landmarks
- zombie regions
- loot regions
- safe-house locations

Use procedural techniques only where they improve scale or variation. Maintain deliberate composition.

## AI
Use a clean state-machine or equivalent architecture.

AI should have:
- perception
- decision making
- navigation
- movement
- combat
- state transitions
- group behaviour

## Performance
Use:
- object pooling
- GPU instancing
- spatial partitioning
- LOD
- frustum culling
- staggered AI updates
- distance-based simulation
- efficient collision queries
- efficient raycasts
- minimal allocations
- asset streaming/loading

Simulation tiers:
- Near: full AI/physics/animation.
- Mid: reduced update frequency and simplified processing.
- Far: lightweight simulation.

The transition should be visually unobtrusive.

## Persistence
Version 1 uses local persistence only.
Do not add PostgreSQL/Redis/server persistence.

Persist:
- inventory
- weapons
- ammunition
- medical resources
- safe-house storage
- relevant world state

Keep persistence replaceable so future multiplayer/server persistence can be added.

## Testing
Test deterministic systems:
- movement
- damage
- healing
- weapon calculations
- ammo
- inventory
- stacking
- loot
- crafting
- AI perception
- AI state transitions
- noise propagation
- spawning
- save/load
