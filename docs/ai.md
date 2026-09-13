# Zombie AI & Simulation Specification — Version 1

## Population
Support a medium-to-high active zombie population.

Do not build the game around only a handful of zombies.

Use pooling, spatial partitioning and simulation tiers to maintain performance.

## Zombie types

### Normal
Balanced health, movement and damage.

### Fast
High movement speed and aggressive pursuit.

### Heavy
Slow, durable and powerful.

### Screamer
Special perception/noise behaviour capable of attracting nearby zombies.

Keep the number of types small but make them meaningfully different.

## States
Suggested states:
- Idle
- Wandering
- Roaming
- Investigating
- Alert
- Chasing
- Searching
- Returning
- Attacking
- Stunned
- Dead

## Perception

### Vision
Consider:
- field of view
- detection distance
- line of sight
- occlusion
- player movement
- player visibility
- darkness
- weather

### Hearing/noise
Noise events contain:
- world position
- radius
- intensity
- falloff
- type
- lifetime

Examples:
- gunshot
- movement
- melee impact

## Detection confidence
Avoid binary instant detection.

Use a progression such as:
Unaware → Suspicious → Investigating → Alert → Confirmed Target.

Factors:
- distance
- visibility
- noise
- obstruction
- movement
- time
- environmental conditions

## Search
When a zombie loses sight:
1. Remember last-known position.
2. Move toward it.
3. Search nearby.
4. Investigate likely locations.
5. React to new noise.
6. Eventually lose interest.
7. Return to roaming.

## Navigation
Zombies must navigate around:
- terrain
- trees
- rocks
- roads
- slopes
- safe-house boundaries
- other zombies

Do not run expensive full pathfinding every frame.

## Group behaviour
Zombies may:
- respond to common noise
- converge on events
- form groups
- split
- follow nearby zombies
- react to fleeing/chasing behaviour

Do not grant global awareness to every zombie.

## Combat
Zombie attacks must respect:
- distance
- cooldown
- line of sight
- attack animation
- collision
- damage

Implement:
- attack
- stagger
- hit reaction
- death

## Movement
Use:
- acceleration
- deceleration
- turning behaviour
- speed variation
- animation transitions

Avoid identical robotic movement for every zombie.

## World interaction
Zombie AI must interact with:
- player noise
- day/night
- weather/visibility
- terrain
- obstacles
- population density

The goal is emergent behaviour rather than scripted-looking behaviour.
