# World, Graphics & Asset Specification — Version 1

## World layout
Primary environment:
- forest
- roads
- clearings
- hills
- valleys
- natural paths
- landmarks
- outdoor points of interest
- safe houses

Exclude:
- cities
- normal residential neighborhoods
- large urban interiors
- huge empty procedural terrain

## Terrain
Implement:
- height variation
- slopes
- hills
- valleys
- terrain collision
- forest floor
- grass
- dirt
- rocks
- roads

Terrain should avoid obvious repeating patterns.

## Vegetation
Use:
- multiple tree variations
- bushes
- grass
- small plants
- fallen branches
- rocks

Use instancing, LOD and controlled randomness.

## Asset creation
Use Blender and Blender Python automation for important assets.

Pipeline:
Claude Code → Blender Python → Blender → GLB/GLTF → Three.js.

Create assets for:
- trees
- rocks
- vegetation
- roads
- safe houses
- weapons
- medical items
- loot
- zombie characters
- first-person weapon models

Do not replace important final assets with cubes.

## Materials
Use PBR workflows:
- base color
- roughness
- metallic where appropriate
- normal maps
- ambient/occlusion information where useful

Materials should be physically plausible.

## Lighting
Use:
- dynamic sun
- ambient/environment lighting
- dynamic shadows
- atmospheric fog
- day/night lighting
- weather-dependent atmosphere

## Day/night
Implement:
- sun movement
- sunrise
- daytime
- sunset
- night
- changing ambient illumination
- changing shadows
- sky/atmospheric transitions

Night should affect visibility and AI perception.

## Weather
Implement:
- clear
- cloudy
- rain
- fog

Weather transitions smoothly.

Weather affects:
- appearance
- atmosphere
- visibility
- AI perception where appropriate

## Rendering philosophy
Do not add expensive effects simply to increase graphical complexity.

Prioritize:
1. lighting
2. materials
3. terrain/vegetation quality
4. shadows
5. atmospheric depth
6. post-processing
7. shader quality
8. animation quality

## Performance
Use:
- instancing
- LOD
- culling
- texture discipline
- streaming
- efficient shaders
- GPU-conscious scene organization

Visual quality must remain high without making the game unplayable.
