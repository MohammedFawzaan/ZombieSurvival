import { describe, it, expect } from 'vitest';
import { DayNightCycle, DayPhase, PHASE_BOUNDS, fractionDelta } from './dayNight';

describe('DayNightCycle progression', () => {
  it('advances fraction proportionally to elapsed time', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 100, startFraction: 0 });
    c.step(25);
    expect(c.fraction).toBeCloseTo(0.25, 6);
    c.step(25);
    expect(c.fraction).toBeCloseTo(0.5, 6);
  });

  it('wraps past midnight without going out of range', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 100, startFraction: 0.9 });
    c.step(20);
    expect(c.fraction).toBeGreaterThanOrEqual(0);
    expect(c.fraction).toBeLessThan(1);
    expect(c.fraction).toBeCloseTo(0.1, 6);
  });

  it('counts whole days as it wraps', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 10, startFraction: 0 });
    expect(c.dayCount).toBe(0);
    c.step(10);
    expect(c.dayCount).toBe(1);
    c.step(25);
    expect(c.dayCount).toBe(3);
  });

  it('stays in range even if a single step exceeds a whole day', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 10, startFraction: 0.5 });
    c.step(1000);
    expect(c.fraction).toBeGreaterThanOrEqual(0);
    expect(c.fraction).toBeLessThan(1);
    expect(Number.isFinite(c.fraction)).toBe(true);
  });

  it('does not advance while paused', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 100, startFraction: 0.4 });
    c.paused = true;
    c.step(50);
    expect(c.fraction).toBeCloseTo(0.4, 6);
  });
});

describe('DayNightCycle phases', () => {
  it('reports each named phase at its boundary window', () => {
    const c = new DayNightCycle();
    c.setFraction(0.05);
    expect(c.phase).toBe(DayPhase.Night);
    c.setFraction(PHASE_BOUNDS.morningStart + 0.01);
    expect(c.phase).toBe(DayPhase.Morning);
    c.setFraction(PHASE_BOUNDS.dayStart + 0.01);
    expect(c.phase).toBe(DayPhase.Day);
    c.setFraction(PHASE_BOUNDS.eveningStart + 0.01);
    expect(c.phase).toBe(DayPhase.Evening);
    c.setFraction(PHASE_BOUNDS.nightStart + 0.01);
    expect(c.phase).toBe(DayPhase.Night);
  });

  it('visits morning, day, evening and night over one full cycle', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 1000, startFraction: 0 });
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      c.step(1);
      seen.add(c.phaseName);
    }
    expect(seen).toEqual(new Set(['morning', 'day', 'evening', 'night']));
  });

  it('puts the sun above the horizon at noon and below at midnight', () => {
    const c = new DayNightCycle();
    c.setFraction(0.5);
    expect(c.sun.elevation).toBeGreaterThan(0.8);
    c.setFraction(0);
    expect(c.sun.elevation).toBeLessThan(-0.8);
  });

  it('keeps the moon opposite the sun', () => {
    const c = new DayNightCycle();
    for (const f of [0, 0.2, 0.4, 0.6, 0.8]) {
      c.setFraction(f);
      expect(c.moon.x).toBeCloseTo(-c.sun.x, 6);
      expect(c.moon.y).toBeCloseTo(-c.sun.y, 6);
      expect(c.moon.z).toBeCloseTo(-c.sun.z, 6);
    }
  });

  it('keeps sun and moon unit length at all times', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 360, startFraction: 0 });
    for (let i = 0; i < 360; i++) {
      c.step(1);
      expect(Math.hypot(c.sun.x, c.sun.y, c.sun.z)).toBeCloseTo(1, 6);
      expect(Math.hypot(c.moon.x, c.moon.y, c.moon.z)).toBeCloseTo(1, 6);
    }
  });
});

describe('DayNightCycle continuity', () => {
  it('moves the sun continuously across midnight', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 1000, startFraction: 0.99 });
    let prevX = c.sun.x;
    let prevY = c.sun.y;
    let prevZ = c.sun.z;
    for (let i = 0; i < 40; i++) {
      c.step(0.5);
      const jump = Math.hypot(c.sun.x - prevX, c.sun.y - prevY, c.sun.z - prevZ);
      expect(jump).toBeLessThan(0.02);
      prevX = c.sun.x;
      prevY = c.sun.y;
      prevZ = c.sun.z;
    }
  });

  it('changes darkness continuously across a whole day including midnight', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 2000, startFraction: 0 });
    let prev = c.darkness;
    for (let i = 0; i < 2000; i++) {
      c.step(1);
      expect(Math.abs(c.darkness - prev)).toBeLessThan(0.02);
      prev = c.darkness;
    }
  });

  it('keeps darkness within a playable range and never fully black', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 2000, startFraction: 0 });
    let maxDark = 0;
    for (let i = 0; i < 2000; i++) {
      c.step(1);
      expect(c.darkness).toBeGreaterThanOrEqual(0);
      maxDark = Math.max(maxDark, c.darkness);
    }
    expect(maxDark).toBeLessThan(0.95);
    expect(maxDark).toBeGreaterThan(0.5);
  });

  it('keeps daylight and moonlit complementary and in range', () => {
    const c = new DayNightCycle({ dayLengthSeconds: 500, startFraction: 0 });
    for (let i = 0; i < 500; i++) {
      c.step(1);
      expect(c.daylight).toBeGreaterThanOrEqual(0);
      expect(c.daylight).toBeLessThanOrEqual(1);
      expect(c.moonlit).toBeCloseTo(1 - c.daylight, 6);
    }
  });

  it('has no discontinuity in daylight as the fraction wraps', () => {
    const before = new DayNightCycle();
    before.setFraction(0.9999);
    const after = new DayNightCycle();
    after.setFraction(0.0001);
    expect(Math.abs(after.daylight - before.daylight)).toBeLessThan(0.01);
    expect(Math.abs(after.sun.elevation - before.sun.elevation)).toBeLessThan(0.01);
  });

  it('peaks goldenHour near sunrise and sunset, not at noon or midnight', () => {
    const c = new DayNightCycle();
    c.setFraction(0.5);
    const noon = c.goldenHour;
    c.setFraction(0);
    const midnight = c.goldenHour;
    let peak = 0;
    for (let i = 0; i <= 100; i++) {
      c.setFraction(0.2 + (i / 100) * 0.12);
      peak = Math.max(peak, c.goldenHour);
    }
    expect(noon).toBe(0);
    expect(midnight).toBe(0);
    expect(peak).toBeGreaterThan(0.7);
  });
});

describe('setHour and fractionDelta', () => {
  it('maps hours onto fractions', () => {
    const c = new DayNightCycle();
    c.setHour(12);
    expect(c.fraction).toBeCloseTo(0.5, 6);
    expect(c.hour).toBeCloseTo(12, 6);
    c.setHour(0);
    expect(c.fraction).toBeCloseTo(0, 6);
  });

  it('normalises out-of-range hours', () => {
    const c = new DayNightCycle();
    c.setHour(30);
    expect(c.fraction).toBeCloseTo(0.25, 6);
    c.setHour(-6);
    expect(c.fraction).toBeCloseTo(0.75, 6);
  });

  it('returns the shortest signed distance across the wrap', () => {
    expect(fractionDelta(0.9, 0.1)).toBeCloseTo(0.2, 6);
    expect(fractionDelta(0.1, 0.9)).toBeCloseTo(-0.2, 6);
    expect(fractionDelta(0.2, 0.4)).toBeCloseTo(0.2, 6);
  });
});
