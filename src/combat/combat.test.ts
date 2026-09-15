import { describe, expect, it, beforeEach } from 'vitest';
import { CombatSystem, type ShotOutcome } from './combat';
import { WEAPONS, REGION_MULTIPLIER } from '../weapons/definitions';
import { HitRegion, ZombieState } from '../state/types';
import type { PhysicsWorld } from '../physics/physics';
import type { Zombie, ZombieManager } from '../zombies/zombieManager';
import { makeRng } from '../util/math';

const ZDEF = {
  radius: 0.36,
  height: 1.82,
  health: 100,
  staggerResist: 0,
};

interface DamageRecord {
  zombie: Zombie;
  amount: number;
  region: HitRegion;
}

function makeZombie(id: number, x: number, z: number, health = 100): Zombie {
  const def = ZDEF;
  return {
    id,
    alive: true,
    def,
    state: ZombieState.Chasing,
    health,
    maxHealth: health,
    body: {
      position: { x, y: 0.91, z },
      feetOffset: 0.91,
      velocity: { x: 0, y: 0, z: 0 },
    },
  } as unknown as Zombie;
}

class FakeZombies {
  readonly zombies: Zombie[] = [];
  readonly damage: DamageRecord[] = [];
  readonly staggers: Zombie[] = [];

  applyDamage(z: Zombie, amount: number, region: HitRegion): boolean {
    this.damage.push({ zombie: z, amount, region });
    z.health -= amount;
    if (z.health <= 0) {
      z.alive = false;
      return true;
    }
    return false;
  }

  forceStagger(z: Zombie): boolean {
    this.staggers.push(z);
    return true;
  }
}

class FakePhysics {
  wallDistance: number | null = null;

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
  ) {
    if (this.wallDistance === null || this.wallDistance > maxDistance) return null;
    const t = this.wallDistance;
    return {
      distance: t,
      colliderHandle: 0,
      point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t },
      normal: { x: -dx, y: -dy, z: -dz },
    };
  }
}

function build(): {
  combat: CombatSystem;
  zombies: FakeZombies;
  physics: FakePhysics;
  out: ShotOutcome;
} {
  const zombies = new FakeZombies();
  const physics = new FakePhysics();
  const combat = new CombatSystem(
    physics as unknown as PhysicsWorld,
    zombies as unknown as ZombieManager,
  );
  return { combat, zombies, physics, out: CombatSystem.createOutcome() };
}

const TORSO_Y = ZDEF.height * 0.66;
const HEAD_Y = ZDEF.height - ZDEF.radius * 0.62 * 0.92;

describe('shotgun pellet firing', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it('fires exactly the defined number of pellets', () => {
    const def = WEAPONS.shotgun;
    ctx.combat.firePellets(
      def, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(5),
    );
    expect(ctx.out.pellets).toHaveLength(def.pellets ?? 0);
    expect(def.pellets).toBe(9);
  });

  it('lands every pellet on a zombie filling the pattern at point-blank range', () => {
    ctx.zombies.zombies.push(makeZombie(0, 0, -2.5, 10000));
    ctx.combat.firePellets(
      WEAPONS.shotgun, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(11),
    );
    expect(ctx.out.pelletHits).toBe(9);
    expect(ctx.out.hitZombie).toBe(true);
  });

  it('accumulates all pellet damage into a single applyDamage call per zombie', () => {
    ctx.zombies.zombies.push(makeZombie(0, 0, -2.5, 10000));
    ctx.combat.firePellets(
      WEAPONS.shotgun, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(11),
    );
    expect(ctx.zombies.damage).toHaveLength(1);
    expect(ctx.zombies.damage[0].amount).toBeCloseTo(ctx.out.damageDealt, 5);
  });

  it('counts a multi-pellet kill exactly once', () => {
    ctx.zombies.zombies.push(makeZombie(0, 0, -2.5, 100));
    ctx.combat.firePellets(
      WEAPONS.shotgun, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(11),
    );
    expect(ctx.out.kills).toBe(1);
    expect(ctx.out.zombiesHit).toBe(1);
    expect(ctx.zombies.damage).toHaveLength(1);
  });

  it('never counts one pellet against two zombies', () => {
    ctx.zombies.zombies.push(makeZombie(0, -0.45, -3, 10000));
    ctx.zombies.zombies.push(makeZombie(1, 0.45, -3, 10000));
    ctx.combat.firePellets(
      WEAPONS.shotgun, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(7),
    );
    expect(ctx.out.pelletHits).toBeLessThanOrEqual(9);
    const totalApplied = ctx.zombies.damage.reduce((a, d) => a + d.amount, 0);
    expect(totalApplied).toBeCloseTo(ctx.out.damageDealt, 5);
  });

  it('deals one full magazine of damage per shell at point-blank torso range', () => {
    const def = WEAPONS.shotgun;
    ctx.zombies.zombies.push(makeZombie(0, 0, -2.5, 10000));
    ctx.combat.firePellets(def, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(11));
    const expected = (def.pellets ?? 0) * def.damage * REGION_MULTIPLIER.torso;
    expect(ctx.out.damageDealt).toBeCloseTo(expected, 4);
    expect(expected).toBeGreaterThan(100);
  });

  it('stops pellets at a wall in front of the target', () => {
    ctx.zombies.zombies.push(makeZombie(0, 0, -6, 10000));
    ctx.physics.wallDistance = 3;
    ctx.combat.firePellets(
      WEAPONS.shotgun, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 0, makeRng(3),
    );
    expect(ctx.out.pelletHits).toBe(0);
    expect(ctx.out.hitZombie).toBe(false);
    expect(ctx.zombies.damage).toHaveLength(0);
  });

  it('tightens the pattern when aiming', () => {
    const def = WEAPONS.shotgun;
    const spreadAt = (aimBlend: number): number => {
      const c = build();
      c.combat.firePellets(def, 0, 0, TORSO_Y, 0, 0, 0, -1, c.out, aimBlend, makeRng(21));
      let maxOff = 0;
      for (const p of c.out.pellets) {
        maxOff = Math.max(maxOff, Math.hypot(p.dirX, p.dirY));
      }
      return maxOff;
    };
    expect(spreadAt(1)).toBeLessThan(spreadAt(0));
  });
});

describe('shotgun damage falloff', () => {
  const def = WEAPONS.shotgun;
  const TIGHT = { ...def, pelletCone: 0, pelletConeAim: 1 };

  const expectedFalloff = (t: number): number =>
    t <= def.falloffStart
      ? 1
      : 1 + (def.falloffMin - 1) * ((t - def.falloffStart) / (def.range - def.falloffStart));

  function perPelletAt(distance: number): number {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -distance, 1e9));
    ctx.combat.firePellets(TIGHT, 0, 0, TORSO_Y, 0, 0, 0, -1, ctx.out, 1, makeRng(101));
    expect(ctx.out.pelletHits).toBe(def.pellets);
    expect(ctx.zombies.damage[0].region).toBe(HitRegion.Torso);
    return ctx.out.damageDealt / ctx.out.pelletHits;
  }

  const volleyAt = (distance: number): number => perPelletAt(distance) * (def.pellets ?? 1);

  it('does full per-pellet damage inside the falloff start', () => {
    expect(def.falloffStart).toBe(9);
    expect(perPelletAt(2)).toBeCloseTo(def.damage, 3);
    expect(perPelletAt(8.5)).toBeCloseTo(def.damage, 3);
  });

  it('follows the linear falloff curve the definition describes', () => {
    for (const d of [12, 20, 35, 50, 58]) {
      const hitT = d - ZDEF.radius * 0.95;
      expect(perPelletAt(d)).toBeCloseTo(def.damage * expectedFalloff(hitT), 1);
    }
  });

  it('degrades monotonically once past the falloff start', () => {
    const samples = [10, 20, 30, 40, 50, 58].map(perPelletAt);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
  });

  it('approaches the configured floor near maximum range', () => {
    expect(perPelletAt(58)).toBeLessThan(def.damage * (def.falloffMin + 0.06));
  });

  it('is devastating up close and a chip at long range', () => {
    expect(volleyAt(2)).toBeGreaterThan(110);
    expect(volleyAt(58)).toBeLessThan(30);
  });

  it('loses to the rifle on sustained damage past 30 m', () => {
    const shotgunPerSecond = volleyAt(35) * (def.rpm / 60);
    const riflePerSecond = WEAPONS.rifle.damage * 0.85 * (WEAPONS.rifle.rpm / 60);
    expect(shotgunPerSecond).toBeLessThan(riflePerSecond);
  });
});

describe('melee swing', () => {
  const def = WEAPONS.machete;

  it('connects with a zombie directly in front', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -1.5));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.hitZombie).toBe(true);
  });

  it('connects with a zombie off centre inside the arc', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0.6, -1.4));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.hitZombie).toBe(true);
  });

  it('misses a zombie well outside the arc', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 3.2, -1.2));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.hitZombie).toBe(false);
  });

  it('misses a zombie beyond its short range', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -(def.range + 1.5)));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.hitZombie).toBe(false);
  });

  it('damages only the nearest zombie, never a whole crowd', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -1.2));
    ctx.zombies.zombies.push(makeZombie(1, 0.5, -1.9));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.zombies.damage).toHaveLength(1);
    expect(ctx.out.zombiesHit).toBe(1);
  });

  it('applies the region multiplier to its base damage', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -1.5, 1e6));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.damageDealt).toBeCloseTo(def.damage * REGION_MULTIPLIER.torso, 4);
  });

  it('staggers a zombie it fails to kill', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -1.5, 1e6));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.zombies.staggers).toHaveLength(1);
  });

  it('does not stagger a zombie it kills', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -1.5, 10));
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.kills).toBe(1);
    expect(ctx.zombies.staggers).toHaveLength(0);
  });

  it('does not swing through a wall', () => {
    const ctx = build();
    ctx.zombies.zombies.push(makeZombie(0, 0, -2.0));
    ctx.physics.wallDistance = 0.8;
    ctx.combat.meleeSwing(def, 0, TORSO_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.hitZombie).toBe(false);
  });
});

describe('hitscan weapons are unchanged', () => {
  it('still applies the headshot multiplier', () => {
    const ctx = build();
    const z = makeZombie(0, 0, -5, 1e6);
    ctx.zombies.zombies.push(z);
    ctx.combat.fireHitscan(WEAPONS.pistol, 0, 0, HEAD_Y, 0, 0, 0, -1, ctx.out);
    expect(ctx.out.headshot).toBe(true);
    expect(ctx.out.damageDealt).toBeCloseTo(WEAPONS.pistol.damage * REGION_MULTIPLIER.head, 4);
    expect(REGION_MULTIPLIER.head).toBe(3.4);
  });

  it('still applies range falloff', () => {
    const near = build();
    near.zombies.zombies.push(makeZombie(0, 0, -10, 1e6));
    near.combat.fireHitscan(WEAPONS.pistol, 0, 0, TORSO_Y, 0, 0, 0, -1, near.out);

    const far = build();
    far.zombies.zombies.push(makeZombie(0, 0, -85, 1e6));
    far.combat.fireHitscan(WEAPONS.pistol, 0, 0, TORSO_Y, 0, 0, 0, -1, far.out);

    expect(far.out.damageDealt).toBeLessThan(near.out.damageDealt);
  });
});
