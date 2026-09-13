# Product Specification — Version 1

## Product vision
A technically ambitious single-player first-person zombie survival game where the player is dropped into a dangerous forest environment populated by a substantial zombie population.

The experience should feel like a serious indie survival game, not a Three.js technical demo.

## Player fantasy
The player should feel:
- physically present in the world
- vulnerable
- capable but resource constrained
- surrounded by a living/dangerous environment
- rewarded for exploration
- forced to make tactical decisions

## Core loop
Spawn → Explore → Observe → Encounter → Fight → Loot → Heal/Manage Resources → Return to Safe House → Prepare → Explore Again.

## World
The world is large but bounded. It contains:
- dense forest
- hills, slopes and valleys
- roads and intersections
- clearings
- natural paths
- landmarks
- outdoor points of interest
- safe houses

Do not create normal residential neighborhoods or city environments.

## Visual target
Highly realistic and visually convincing graphics achievable with Three.js/WebGPU/Blender. Do not attempt to imitate AAA production scale at the cost of stability, but avoid primitive/demo-quality visuals.

## Version 1 success criteria
A player can:
1. Launch the Windows desktop game.
2. Spawn in the forest.
3. Move naturally through terrain.
4. Encounter a medium-to-high zombie population.
5. Observe zombies wandering and reacting to the environment.
6. Be detected through vision/noise.
7. Fight zombies with firearms and melee.
8. Loot resources.
9. Manage inventory.
10. Heal using medical items.
11. Craft useful survival items.
12. Use a safe house.
13. Experience day/night and weather changes.
14. Save and reload progress.
15. Continue surviving without an artificial level/XP system.

## Quality principles
- Depth over feature count.
- Realism over arcade shortcuts.
- System interaction over isolated features.
- Performance is a design requirement, not a final cleanup task.
- Visual quality must support gameplay rather than become decorative complexity.
