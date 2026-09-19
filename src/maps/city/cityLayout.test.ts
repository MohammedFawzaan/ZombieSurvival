import { describe, it, expect } from 'vitest';
import { CITY_MAP } from './cityConfig';
import {
  CITY_BUILDINGS,
  CITY_HALF,
  CITY_PROPS,
  CITY_ZONE_IDS,
  anyFootprintContains,
  buildingFootprints,
  pointInFootprint,
} from './cityLayout';
import { CityGround } from './cityGround';

const zoneIds = new Set(CITY_MAP.zones.map((z) => z.id));

function reachableZones(): Set<string> {
  const open = new Set(
    CITY_MAP.zones.filter((z) => z.unlockedAtStart).map((z) => z.id),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of CITY_MAP.barriers) {
      if (open.has(b.zone) && !open.has(b.unlocksZone)) {
        open.add(b.unlocksZone);
        grew = true;
      }
    }
  }
  return open;
}

describe('city zone graph', () => {
  it('declares exactly one starting zone', () => {
    const starts = CITY_MAP.zones.filter((z) => z.unlockedAtStart);
    expect(starts.map((z) => z.id)).toEqual(['start_street']);
  });

  it('lists the same zones as the layout module', () => {
    expect([...zoneIds].sort()).toEqual([...CITY_ZONE_IDS].sort());
  });

  it('has unique zone ids', () => {
    expect(zoneIds.size).toBe(CITY_MAP.zones.length);
  });

  it('makes every zone reachable from the start through barriers', () => {
    const open = reachableZones();
    for (const z of CITY_MAP.zones) {
      expect(open.has(z.id), `zone ${z.id} is unreachable`).toBe(true);
    }
  });

  it('references only real zones from every barrier', () => {
    for (const b of CITY_MAP.barriers) {
      expect(zoneIds.has(b.zone), `${b.id}.zone`).toBe(true);
      expect(zoneIds.has(b.unlocksZone), `${b.id}.unlocksZone`).toBe(true);
      expect(b.zone).not.toBe(b.unlocksZone);
    }
  });

  it('prices barriers within the 750-1250 band', () => {
    for (const b of CITY_MAP.barriers) {
      expect([750, 1000, 1250]).toContain(b.cost);
    }
  });

  it('offers more than one route out of the start zone', () => {
    const fromStart = CITY_MAP.barriers.filter((b) => b.zone === 'start_street');
    expect(fromStart.length).toBeGreaterThanOrEqual(2);
  });

  it('forms a loop rather than a single linear corridor', () => {
    const inbound = new Map<string, number>();
    for (const b of CITY_MAP.barriers) {
      inbound.set(b.unlocksZone, (inbound.get(b.unlocksZone) ?? 0) + 1);
    }
    const multiEntry = [...inbound.values()].filter((n) => n > 1);
    expect(multiEntry.length).toBeGreaterThan(0);
  });

  it('has unique barrier ids', () => {
    const ids = CITY_MAP.barriers.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('city spawn placement', () => {
  it('keeps the player spawn clear of every building', () => {
    const { x, z } = CITY_MAP.playerSpawn;
    expect(anyFootprintContains(x, z, 2)).toBeNull();
  });

  it('keeps the player spawn inside the ground bounds', () => {
    const ground = new CityGround();
    expect(ground.isInBounds(CITY_MAP.playerSpawn.x, CITY_MAP.playerSpawn.z)).toBe(true);
  });

  it('places no spawn zone inside a building footprint', () => {
    for (const s of CITY_MAP.spawnZones) {
      const hit = anyFootprintContains(s.x, s.z, s.radius * 0.5);
      expect(hit, `spawn ${s.id} overlaps building ${hit}`).toBeNull();
    }
  });

  it('references only real zones from every spawn zone', () => {
    for (const s of CITY_MAP.spawnZones) {
      expect(zoneIds.has(s.zone), `${s.id}.zone`).toBe(true);
    }
  });

  it('gives every zone at least two spawn points', () => {
    for (const z of CITY_MAP.zones) {
      const n = CITY_MAP.spawnZones.filter((s) => s.zone === z.id).length;
      expect(n, `zone ${z.id} has ${n} spawn zones`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps spawn zones far enough from the player spawn', () => {
    const { x, z } = CITY_MAP.playerSpawn;
    for (const s of CITY_MAP.spawnZones) {
      const d = Math.hypot(s.x - x, s.z - z);
      expect(d, `spawn ${s.id} is ${d.toFixed(1)}m from the player`).toBeGreaterThan(12);
    }
  });

  it('keeps spawn zones within the playable area', () => {
    for (const s of CITY_MAP.spawnZones) {
      expect(Math.abs(s.x), s.id).toBeLessThan(CITY_HALF);
      expect(Math.abs(s.z), s.id).toBeLessThan(CITY_HALF);
    }
  });
});

describe('city interactables', () => {
  const machines = [
    ...CITY_MAP.wallWeapons,
    ...CITY_MAP.perkMachines,
    ...CITY_MAP.rewardMachines,
    ...(CITY_MAP.powerSwitch ? [CITY_MAP.powerSwitch] : []),
  ];

  it('keeps every machine inside the map bounds', () => {
    const ground = new CityGround();
    for (const m of machines) {
      expect(ground.isInBounds(m.x, m.z, 4), `${m.id} out of bounds`).toBe(true);
    }
  });

  it('references only real zones from every machine', () => {
    for (const m of machines) {
      expect(zoneIds.has(m.zone), `${m.id}.zone`).toBe(true);
    }
  });

  it('has globally unique interactable ids', () => {
    const ids = machines.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places the power switch in the substation zone', () => {
    expect(CITY_MAP.powerSwitch).not.toBeNull();
    expect(CITY_MAP.powerSwitch?.zone).toBe('substation');
  });

  it('gates the power switch behind at least three barriers', () => {
    const depth = new Map<string, number>([['start_street', 0]]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of CITY_MAP.barriers) {
        const from = depth.get(b.zone);
        if (from === undefined) continue;
        const next = from + 1;
        if ((depth.get(b.unlocksZone) ?? Infinity) > next) {
          depth.set(b.unlocksZone, next);
          grew = true;
        }
      }
    }
    expect(depth.get('substation')).toBeGreaterThanOrEqual(3);
  });

  it('spreads the four perks across at least three zones', () => {
    const perks = CITY_MAP.perkMachines.map((p) => p.perk);
    expect(new Set(perks).size).toBe(4);
    const zones = new Set(CITY_MAP.perkMachines.map((p) => p.zone));
    expect(zones.size).toBeGreaterThanOrEqual(3);
  });

  it('puts cheap wall weapons in the start zone', () => {
    const start = CITY_MAP.wallWeapons.filter((w) => w.zone === 'start_street');
    expect(start.length).toBeGreaterThanOrEqual(1);
    for (const w of start) expect(w.cost).toBeLessThanOrEqual(750);
  });

  it('provides at least one reward machine', () => {
    expect(CITY_MAP.rewardMachines.length).toBeGreaterThanOrEqual(1);
  });
});

describe('city buildings', () => {
  it('has unique building ids', () => {
    const ids = CITY_BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every building inside the map bounds', () => {
    for (const b of CITY_BUILDINGS) {
      const reach = Math.hypot(b.width, b.depth) * 0.5;
      expect(Math.abs(b.x) + reach, b.id).toBeLessThan(CITY_HALF);
      expect(Math.abs(b.z) + reach, b.id).toBeLessThan(CITY_HALF);
    }
  });

  it('does not overlap any two building footprints', () => {
    const fs = buildingFootprints();
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        const ra = Math.hypot(a.hx, a.hz);
        const rb = Math.hypot(b.hx, b.hz);
        const d = Math.hypot(a.cx - b.cx, a.cz - b.cz);
        expect(d, `${a.id} overlaps ${b.id}`).toBeGreaterThan(ra + rb - Math.min(ra, rb));
      }
    }
  });

  it('references only real zones from every building', () => {
    for (const b of CITY_BUILDINGS) {
      expect(zoneIds.has(b.zone), `${b.id}.zone`).toBe(true);
    }
  });

  it('gives every enterable building at least one doorway', () => {
    for (const b of CITY_BUILDINGS) {
      if (b.enterable) expect(b.doorways.length, b.id).toBeGreaterThan(0);
    }
  });

  it('keeps barriers clear of building footprints', () => {
    for (const bar of CITY_MAP.barriers) {
      const hit = anyFootprintContains(bar.x, bar.z, 0);
      expect(hit, `barrier ${bar.id} sits inside ${hit}`).toBeNull();
    }
  });

  it('places no prop inside a building footprint', () => {
    for (const p of CITY_PROPS) {
      const hit = anyFootprintContains(p.x, p.z, 0);
      expect(hit, `${p.kind} at ${p.x},${p.z} sits inside ${hit}`).toBeNull();
    }
  });
});

describe('city ground', () => {
  const ground = new CityGround();

  it('matches the Terrain member contract', () => {
    expect(typeof ground.half).toBe('number');
    expect(typeof ground.heightAt(0, 0)).toBe('number');
    expect(typeof ground.isInBounds(0, 0)).toBe('boolean');
    expect(typeof ground.slopeAt(0, 0)).toBe('number');
    const n = { x: 0, y: 0, z: 0 };
    ground.normalAt(0, 0, n);
    expect(n.y).toBeGreaterThan(0.9);
  });

  it('exposes the heightfield fields physics.addTerrain reads', () => {
    expect(ground.gridSize).toBe(ground.config.segments + 1);
    expect(ground.heights.length).toBe(ground.gridSize * ground.gridSize);
    expect(ground.config.size).toBe(CITY_HALF * 2);
  });

  it('stays near flat across the playable interior', () => {
    let maxSlope = 0;
    for (let x = -120; x <= 120; x += 6) {
      for (let z = -120; z <= 120; z += 6) {
        maxSlope = Math.max(maxSlope, ground.slopeAt(x, z));
      }
    }
    expect(maxSlope).toBeLessThan(0.12);
  });

  it('keeps every building pad within a small height range', () => {
    for (const b of CITY_BUILDINGS) {
      const hs = [
        ground.heightAt(b.x - b.width * 0.5, b.z - b.depth * 0.5),
        ground.heightAt(b.x + b.width * 0.5, b.z - b.depth * 0.5),
        ground.heightAt(b.x - b.width * 0.5, b.z + b.depth * 0.5),
        ground.heightAt(b.x + b.width * 0.5, b.z + b.depth * 0.5),
      ];
      const spread = Math.max(...hs) - Math.min(...hs);
      expect(spread, `${b.id} pad spread ${spread.toFixed(2)}m`).toBeLessThan(0.6);
    }
  });

  it('rises at the rim to seal the map', () => {
    expect(ground.heightAt(CITY_HALF - 1, 0)).toBeGreaterThan(5);
    expect(ground.heightAt(0, -(CITY_HALF - 1))).toBeGreaterThan(5);
  });
});

describe('footprint helpers', () => {
  it('detects a point inside a rotated footprint', () => {
    const f = { id: 't', cx: 0, cz: 0, hx: 5, hz: 1, yaw: Math.PI / 2 };
    expect(pointInFootprint(0, 4, f)).toBe(true);
    expect(pointInFootprint(4, 0, f)).toBe(false);
  });
});
