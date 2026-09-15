# Zombie Survival — Version 1 Documentation

## Purpose
This documentation defines Version 1 of the project: a single-player, first-person, realistic 3D forest zombie-survival game built without a traditional game engine.

## Scope note (V1 implementation brief, 2026-09-14)
The delivered V1 narrows this specification. Still in: the bounded forest, first-person
movement and combat, zombies, firearms plus melee, medical/healing, day/night, weather,
audio, local settings persistence. Deliberately **cut** from V1 and deferred: world
looting, random loot, crafting, safe-house gameplay systems, and save/load of run state.
The pre-game loadout screen replaces world looting as the way the player equips.

## Core principle
**Depth over breadth.**

Version 1 intentionally implements fewer systems, but each implemented system must have strong:
- physics
- mathematics
- AI logic
- rendering
- simulation
- performance engineering
- visual quality
- system-to-system interaction

## Version 1 includes
- Large but bounded forest world
- Roads, natural terrain, landmarks and safe houses
- First-person player
- Advanced movement/collision
- Medium-to-high zombie population
- Advanced zombie AI and perception
- Firearms and melee combat
- Loot and inventory
- Medicine/healing
- Basic useful crafting
- Safe house
- Dynamic day/night
- Dynamic weather
- Local save/load
- High-quality WebGPU/Three.js graphics
- Blender-driven 3D asset pipeline
- Performance systems for substantial zombie populations

## Explicitly excluded
- Multiplayer/networking
- TPP
- Vehicles
- Audio
- XP/levels/skill trees
- Large RPG progression
- Cities/residential neighborhoods
- Huge empty world
- Online/server persistence

## Technology
- TypeScript
- Electron
- Three.js
- WebGPU primary renderer
- WebGL2 fallback
- React + TypeScript
- Vite
- Rapier
- Blender + Blender Python
- GLB/GLTF
- PBR materials
- npm/Git/Git LFS

Three.js WebGPURenderer supports a WebGPU backend with WebGL2 fallback and provides TSL/node-based materials and a modern post-processing system. See the official Three.js documentation for implementation constraints and current API details.

Blender exposes a Python API suitable for automated asset creation, modification and export.
