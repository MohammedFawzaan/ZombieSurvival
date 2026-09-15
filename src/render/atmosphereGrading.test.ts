import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  AtmosphereGrading,
  NIGHT_AMBIENT_FLOOR,
  NIGHT_KEY_FLOOR,
  NIGHT_FOG_CEILING,
} from './atmosphereGrading';
import type { AtmosphereState } from './sky';
import { DayNightCycle } from '../time/dayNight';
import { WeatherSystem, WeatherKind, WEATHER_PRESETS } from '../weather/weather';
import { shadowExtent, quantiseElevation } from './sky';

function makeState(): AtmosphereState {
  return {
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(),
    sunIntensity: 0,
    ambientColor: new THREE.Color(),
    ambientIntensity: 0,
    fogColor: new THREE.Color(),
    fogDensity: 0,
  };
}

const ALL = [WeatherKind.Clear, WeatherKind.Cloudy, WeatherKind.Rain];

describe('night playability floors', () => {
  it('keeps ambient above the floor at midnight in every condition', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle();
    cycle.setFraction(0);
    for (const kind of ALL) {
      const state = makeState();
      g.evaluate(cycle, WEATHER_PRESETS[kind], state);
      expect(state.ambientIntensity).toBeGreaterThanOrEqual(NIGHT_AMBIENT_FLOOR - 1e-6);
    }
  });

  it('keeps a directional key light at night in every condition', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle();
    cycle.setFraction(0);
    for (const kind of ALL) {
      const state = makeState();
      g.evaluate(cycle, WEATHER_PRESETS[kind], state);
      expect(state.sunIntensity).toBeGreaterThanOrEqual(NIGHT_KEY_FLOOR - 1e-6);
    }
  });

  it('caps fog at night so rain cannot fog the player blind', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle();
    cycle.setFraction(0);
    const state = makeState();
    g.evaluate(cycle, WEATHER_PRESETS[WeatherKind.Rain], state);
    expect(state.fogDensity).toBeLessThanOrEqual(NIGHT_FOG_CEILING + 1e-9);
  });

  it('never lets the key light come from below the horizon', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle({ dayLengthSeconds: 480, startFraction: 0 });
    for (let i = 0; i < 480; i++) {
      cycle.step(1);
      for (const kind of ALL) {
        const state = makeState();
        g.evaluate(cycle, WEATHER_PRESETS[kind], state);
        expect(state.sunDirection.y).toBeGreaterThanOrEqual(0.0599);
        expect(state.sunDirection.length()).toBeCloseTo(1, 5);
      }
    }
  });

  it('keeps night meaningfully darker than day while staying lit', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle();
    const day = makeState();
    const night = makeState();

    cycle.setFraction(0.5);
    g.evaluate(cycle, WEATHER_PRESETS[WeatherKind.Clear], day);
    cycle.setFraction(0);
    g.evaluate(cycle, WEATHER_PRESETS[WeatherKind.Clear], night);

    const irradiance = (s: AtmosphereState) =>
      s.ambientIntensity *
      (0.2126 * s.ambientColor.r + 0.7152 * s.ambientColor.g + 0.0722 * s.ambientColor.b);

    expect(night.sunIntensity).toBeLessThan(day.sunIntensity * 0.4);
    expect(irradiance(night)).toBeLessThan(irradiance(day) * 0.7);
    expect(irradiance(night)).toBeGreaterThan(irradiance(day) * 0.25);
  });

  it('keeps exposure inside a sane band across all times and weather', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle({ dayLengthSeconds: 240, startFraction: 0 });
    for (let i = 0; i < 240; i++) {
      cycle.step(1);
      for (const kind of ALL) {
        const state = makeState();
        g.evaluate(cycle, WEATHER_PRESETS[kind], state);
        expect(g.out.exposure).toBeGreaterThanOrEqual(0.85);
        expect(g.out.exposure).toBeLessThanOrEqual(1.45);
      }
    }
  });
});

describe('grading continuity', () => {
  it('changes lighting continuously across a full day', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle({ dayLengthSeconds: 1800, startFraction: 0 });
    const state = makeState();
    g.evaluate(cycle, WEATHER_PRESETS[WeatherKind.Clear], state);

    let prevSun = state.sunIntensity;
    let prevAmb = state.ambientIntensity;
    let prevFog = state.fogDensity;
    let prevExp = g.out.exposure;
    const prevColor = state.fogColor.clone();

    for (let i = 0; i < 1800; i++) {
      cycle.step(1);
      g.evaluate(cycle, WEATHER_PRESETS[WeatherKind.Clear], state);
      expect(Math.abs(state.sunIntensity - prevSun)).toBeLessThan(0.06);
      expect(Math.abs(state.ambientIntensity - prevAmb)).toBeLessThan(0.02);
      expect(Math.abs(state.fogDensity - prevFog)).toBeLessThan(0.0004);
      expect(Math.abs(g.out.exposure - prevExp)).toBeLessThan(0.01);

      const dc =
        Math.abs(state.fogColor.r - prevColor.r) +
        Math.abs(state.fogColor.g - prevColor.g) +
        Math.abs(state.fogColor.b - prevColor.b);
      expect(dc).toBeLessThan(0.05);

      prevSun = state.sunIntensity;
      prevAmb = state.ambientIntensity;
      prevFog = state.fogDensity;
      prevExp = g.out.exposure;
      prevColor.copy(state.fogColor);
    }
  });

  it('changes lighting continuously while weather transitions at night', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle({ dayLengthSeconds: 4000, startFraction: 0 });
    const w = new WeatherSystem({ autoChange: false, transitionSeconds: 20 });
    const state = makeState();
    g.evaluate(cycle, w.current, state);

    let prevAmb = state.ambientIntensity;
    let prevFog = state.fogDensity;

    w.setWeather(WeatherKind.Rain);
    for (let i = 0; i < 25 * 60; i++) {
      cycle.step(1 / 60);
      w.step(1 / 60);
      g.evaluate(cycle, w.current, state);
      expect(Math.abs(state.ambientIntensity - prevAmb)).toBeLessThan(0.01);
      expect(Math.abs(state.fogDensity - prevFog)).toBeLessThan(0.0002);
      prevAmb = state.ambientIntensity;
      prevFog = state.fogDensity;
    }
  });

  it('produces finite in-range colour channels everywhere', () => {
    const g = new AtmosphereGrading();
    const cycle = new DayNightCycle({ dayLengthSeconds: 200, startFraction: 0 });
    for (let i = 0; i < 200; i++) {
      cycle.step(1);
      for (const kind of ALL) {
        const state = makeState();
        g.evaluate(cycle, WEATHER_PRESETS[kind], state);
        for (const c of [state.fogColor, state.sunColor, state.ambientColor, g.out.zenith]) {
          for (const ch of [c.r, c.g, c.b]) {
            expect(Number.isFinite(ch)).toBe(true);
            expect(ch).toBeGreaterThanOrEqual(0);
            expect(ch).toBeLessThanOrEqual(4);
          }
        }
      }
    }
  });
});

describe('shadow frustum at low sun angles', () => {
  it('widens the extent as the sun approaches the horizon', () => {
    const high = shadowExtent(78, 1);
    const low = shadowExtent(78, 0.3);
    expect(low).toBeGreaterThan(high);
  });

  it('bounds the extent so a horizon sun cannot stretch it without limit', () => {
    const extreme = shadowExtent(78, 0.0001);
    const clampedFloor = shadowExtent(78, 0.26);
    expect(extreme).toBeCloseTo(clampedFloor, 6);
    expect(extreme).toBeLessThan(78 * 2);
  });

  it('is symmetric for a sun above and below the horizon', () => {
    expect(shadowExtent(78, -0.5)).toBeCloseTo(shadowExtent(78, 0.5), 6);
  });

  it('quantises elevation so the frustum does not rebuild every frame', () => {
    const cycle = new DayNightCycle({ dayLengthSeconds: 600, startFraction: 0 });
    let rebuilds = 0;
    let last = Infinity;
    for (let i = 0; i < 600 * 60; i++) {
      cycle.step(1 / 60);
      const q = quantiseElevation(cycle.sun.elevation);
      if (q !== last) {
        rebuilds++;
        last = q;
      }
    }
    expect(rebuilds).toBeLessThan(120);
    expect(rebuilds).toBeGreaterThan(0);
  });
});
