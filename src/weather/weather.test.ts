import { describe, it, expect } from 'vitest';
import {
  WeatherSystem,
  WeatherKind,
  WEATHER_PRESETS,
  weatherName,
  type WeatherParams,
} from './weather';
import { computeAmbienceMix } from './ambienceMix';
import { DayNightCycle } from '../time/dayNight';

const KEYS: (keyof WeatherParams)[] = [
  'cloudCover',
  'sunFactor',
  'ambientFactor',
  'fogFactor',
  'exposureFactor',
  'rainIntensity',
  'wetness',
  'warmth',
  'shadowStrength',
];

function settled(opts = {}): WeatherSystem {
  return new WeatherSystem({ autoChange: false, ...opts });
}

describe('WeatherSystem basics', () => {
  it('starts settled on its start condition', () => {
    const w = settled({ start: WeatherKind.Cloudy });
    expect(w.settled).toBe(true);
    expect(w.dominant).toBe(WeatherKind.Cloudy);
    expect(w.current.cloudCover).toBeCloseTo(WEATHER_PRESETS[WeatherKind.Cloudy].cloudCover, 6);
  });

  it('names the three conditions', () => {
    expect(weatherName(WeatherKind.Clear)).toBe('clear');
    expect(weatherName(WeatherKind.Cloudy)).toBe('cloudy');
    expect(weatherName(WeatherKind.Rain)).toBe('rain');
  });

  it('does not auto-change when autoChange is off', () => {
    const w = settled({ start: WeatherKind.Clear });
    for (let i = 0; i < 10000; i++) w.step(1 / 60);
    expect(w.dominant).toBe(WeatherKind.Clear);
    expect(w.settled).toBe(true);
  });
});

describe('WeatherSystem transitions are gradual', () => {
  it('does not jump on the frame a change is requested', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 30 });
    const before = w.snapshot();
    w.setWeather(WeatherKind.Rain);
    const after = w.snapshot();
    for (const k of KEYS) expect(after[k]).toBeCloseTo(before[k], 6);
  });

  it('reaches the target only after the full transition time', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 30 });
    w.setWeather(WeatherKind.Rain);
    for (let i = 0; i < 29 * 60; i++) w.step(1 / 60);
    expect(w.settled).toBe(false);
    for (let i = 0; i < 2 * 60; i++) w.step(1 / 60);
    expect(w.settled).toBe(true);
    expect(w.current.rainIntensity).toBeCloseTo(1, 6);
  });

  it('moves every driven value continuously with no step', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 20 });
    w.setWeather(WeatherKind.Rain);
    let prev = w.snapshot();
    for (let i = 0; i < 25 * 60; i++) {
      w.step(1 / 60);
      const now = w.snapshot();
      for (const k of KEYS) {
        expect(Math.abs(now[k] - prev[k])).toBeLessThan(0.02);
      }
      prev = now;
    }
  });

  it('keeps every value inside the envelope of the two presets', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 20 });
    w.setWeather(WeatherKind.Rain);
    const a = WEATHER_PRESETS[WeatherKind.Clear];
    const b = WEATHER_PRESETS[WeatherKind.Rain];
    for (let i = 0; i < 25 * 60; i++) {
      w.step(1 / 60);
      for (const k of KEYS) {
        const lo = Math.min(a[k], b[k]);
        const hi = Math.max(a[k], b[k]);
        expect(w.current[k]).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(w.current[k]).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });

  it('advances monotonically toward the target for a single transition', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 20 });
    w.setWeather(WeatherKind.Rain);
    let prev = w.current.rainIntensity;
    for (let i = 0; i < 25 * 60; i++) {
      w.step(1 / 60);
      expect(w.current.rainIntensity).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = w.current.rainIntensity;
    }
  });

  it('does not snap backwards when redirected mid-transition', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 20 });
    w.setWeather(WeatherKind.Rain);
    for (let i = 0; i < 10 * 60; i++) w.step(1 / 60);

    const mid = w.snapshot();
    w.setWeather(WeatherKind.Cloudy);
    const afterRedirect = w.snapshot();
    for (const k of KEYS) expect(afterRedirect[k]).toBeCloseTo(mid[k], 6);

    let prev = afterRedirect;
    for (let i = 0; i < 25 * 60; i++) {
      w.step(1 / 60);
      const now = w.snapshot();
      for (const k of KEYS) expect(Math.abs(now[k] - prev[k])).toBeLessThan(0.02);
      prev = now;
    }
    expect(w.dominant).toBe(WeatherKind.Cloudy);
  });

  it('applies an immediate change without a transition', () => {
    const w = settled({ start: WeatherKind.Clear });
    w.setWeather(WeatherKind.Rain, true);
    expect(w.settled).toBe(true);
    expect(w.current.rainIntensity).toBeCloseTo(1, 6);
  });

  it('stays in range across a long randomised auto-changing run', () => {
    const w = new WeatherSystem({
      minHoldSeconds: 5,
      maxHoldSeconds: 12,
      transitionSeconds: 8,
    });
    let prev = w.snapshot();
    for (let i = 0; i < 60 * 60 * 2; i++) {
      w.step(1 / 60);
      const now = w.snapshot();
      for (const k of KEYS) {
        expect(Number.isFinite(now[k])).toBe(true);
        expect(Math.abs(now[k] - prev[k])).toBeLessThan(0.05);
      }
      expect(now.rainIntensity).toBeGreaterThanOrEqual(0);
      expect(now.rainIntensity).toBeLessThanOrEqual(1);
      expect(now.cloudCover).toBeGreaterThanOrEqual(0);
      expect(now.cloudCover).toBeLessThanOrEqual(1);
      prev = now;
    }
  });

  it('only ever settles on one of the three conditions', () => {
    const w = new WeatherSystem({ minHoldSeconds: 2, maxHoldSeconds: 5, transitionSeconds: 3 });
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 60 * 3; i++) {
      w.step(1 / 60);
      if (w.settled) seen.add(w.dominant);
    }
    for (const k of seen) {
      expect([WeatherKind.Clear, WeatherKind.Cloudy, WeatherKind.Rain]).toContain(k);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('rain ambience gain', () => {
  it('is silent when there is no rain', () => {
    const w = settled({ start: WeatherKind.Clear });
    expect(w.rainAmbienceGain).toBe(0);
  });

  it('rises with rain intensity and stays within unit range', () => {
    const w = settled({ start: WeatherKind.Clear, transitionSeconds: 10 });
    w.setWeather(WeatherKind.Rain);
    let prev = w.rainAmbienceGain;
    for (let i = 0; i < 12 * 60; i++) {
      w.step(1 / 60);
      const g = w.rainAmbienceGain;
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = g;
    }
    expect(w.rainAmbienceGain).toBeGreaterThan(0.8);
  });
});

describe('ambience mix', () => {
  it('favours forest by day and night ambience after dark', () => {
    const cycle = new DayNightCycle();
    const w = settled({ start: WeatherKind.Clear });

    cycle.setFraction(0.5);
    const day = computeAmbienceMix(cycle, w);
    expect(day.ambienceForest).toBeGreaterThan(day.ambienceNight);
    expect(day.ambienceRain).toBe(0);

    cycle.setFraction(0);
    const night = computeAmbienceMix(cycle, w);
    expect(night.ambienceNight).toBeGreaterThan(night.ambienceForest);
  });

  it('leaves forest behaviour unchanged when no context is supplied', () => {
    const cycle = new DayNightCycle();
    cycle.setFraction(0.5);
    const w = settled({ start: WeatherKind.Clear });

    const implicit = computeAmbienceMix(cycle, w);
    const explicit = computeAmbienceMix(cycle, w, undefined, { urban: false });
    expect(implicit.ambienceForest).toBe(explicit.ambienceForest);
    expect(implicit.ambienceNight).toBe(explicit.ambienceNight);
    expect(implicit.ambienceRain).toBe(explicit.ambienceRain);
  });

  it('ducks the bed under heavy rain and keeps all gains in range', () => {
    const cycle = new DayNightCycle();
    cycle.setFraction(0.5);
    const dry = settled({ start: WeatherKind.Clear });
    const wet = settled({ start: WeatherKind.Rain });

    const dryMix = computeAmbienceMix(cycle, dry);
    const wetMix = computeAmbienceMix(cycle, wet);

    expect(wetMix.ambienceRain).toBeGreaterThan(0.8);
    expect(wetMix.ambienceForest).toBeLessThan(dryMix.ambienceForest);

    for (const m of [dryMix, wetMix]) {
      for (const v of Object.values(m)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
