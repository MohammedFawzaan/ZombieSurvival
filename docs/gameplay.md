# Gameplay Specification — Version 1

## Perspective
First-person only. No third-person camera.

## Player movement
Implement:
- walking
- sprinting
- crouching
- jumping
- gravity
- acceleration/deceleration
- friction/drag
- ground detection
- slope handling
- collision
- air control
- stamina

Movement should feel responsive but physically credible.

## Health and healing
Implement:
- health
- maximum health
- damage
- death
- healing
- stamina

Healing is resource-based, not level-based.

Medical items should have meaningful differences:
- bandage: limited/small healing
- stronger medical item: larger healing
- use duration where appropriate

## Weapons
Version 1:
- pistol
- shotgun
- assault rifle
- melee weapon

Each is data-driven with:
- damage
- fire rate
- magazine
- ammo type
- reload time
- recoil
- spread
- range
- damage falloff where appropriate
- projectile/hitscan characteristics

## Combat
Support:
- aiming
- shooting
- melee
- recoil
- spread
- reload
- weapon switching
- hit detection
- damage
- hit reactions
- death

Use appropriate mathematics for trajectories and ray intersections.

Where useful, support zombie hit regions:
- head
- torso
- limbs

## Inventory
Implement:
- slots
- item definitions
- stack limits
- weapons
- ammunition
- medical items
- survival items
- crafting resources

Inventory logic must be independent from UI.

## Loot
Outdoor loot locations:
- roadside objects
- forest points of interest
- abandoned objects
- safe-house surroundings
- designated landmarks

Loot should be controlled/randomized rather than everywhere.

## Crafting
Implement a small set of useful survival recipes.
Do not build a huge crafting tree.

## Safe house
Provide:
- storage
- healing/recovery
- weapon management
- inventory management
- crafting access
- secure preparation area

## Save/load
Local save/load for relevant player and safe-house state.

## UI
Minimal polished HUD:
- health
- stamina
- weapon
- ammo
- interaction prompt
- inventory
- item use/healing
- crafting
- safe-house storage
- pause/settings
- death

No debug-looking HUD in normal gameplay.

## Audio
Version 1 ships minimal, purposeful audio: weapon fire, reloads, melee impact, zombie
vocalisations, player damage, footsteps, rain and forest ambience. Sounds are synthesised
procedurally (`src/audio/soundBank.ts`) rather than shipped as samples. Positional audio
uses distance attenuation with per-sound and global voice caps. Master/effects/ambience
volumes are user-settable and persisted. There is deliberately no dynamic music system.

Separately from audible sound, gameplay exposes internal noise events such as:
- gunshot
- movement
- melee impact
- environmental event

These events exist for AI simulation only.
