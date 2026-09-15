import { clamp01, lerp } from '../util/math';

export const enum WeatherKind {
  Clear = 0,
  Cloudy = 1,
  Rain = 2,
}

export const WEATHER_KINDS: readonly WeatherKind[] = [
  WeatherKind.Clear,
  WeatherKind.Cloudy,
  WeatherKind.Rain,
];

export function weatherName(k: WeatherKind): 'clear' | 'cloudy' | 'rain' {
  return k === WeatherKind.Clear ? 'clear' : k === WeatherKind.Cloudy ? 'cloudy' : 'rain';
}

export interface WeatherParams {
  cloudCover: number;
  sunFactor: number;
  ambientFactor: number;
  fogFactor: number;
  exposureFactor: number;
  rainIntensity: number;
  wetness: number;
  warmth: number;
  shadowStrength: number;
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherParams> = {
  [WeatherKind.Clear]: {
    cloudCover: 0.12,
    sunFactor: 1,
    ambientFactor: 1,
    fogFactor: 1,
    exposureFactor: 1,
    rainIntensity: 0,
    wetness: 0,
    warmth: 0.35,
    shadowStrength: 1,
  },
  [WeatherKind.Cloudy]: {
    cloudCover: 0.68,
    sunFactor: 0.52,
    ambientFactor: 1.18,
    fogFactor: 1.5,
    exposureFactor: 0.95,
    rainIntensity: 0,
    wetness: 0.1,
    warmth: -0.3,
    shadowStrength: 0.45,
  },
  [WeatherKind.Rain]: {
    cloudCover: 0.92,
    sunFactor: 0.3,
    ambientFactor: 1.1,
    fogFactor: 2.3,
    exposureFactor: 0.9,
    rainIntensity: 1,
    wetness: 1,
    warmth: -0.5,
    shadowStrength: 0.2,
  },
};

export interface WeatherOptions {
  start: WeatherKind;
  minHoldSeconds: number;
  maxHoldSeconds: number;
  transitionSeconds: number;
  weights: [number, number, number];
  autoChange: boolean;
}

export const DEFAULT_WEATHER: WeatherOptions = {
  start: WeatherKind.Clear,
  minHoldSeconds: 150,
  maxHoldSeconds: 420,
  transitionSeconds: 45,
  weights: [0.5, 0.32, 0.18],
  autoChange: true,
};

export class WeatherSystem {
  private opts: WeatherOptions;

  from: WeatherKind;
  to: WeatherKind;
  blend = 1;

  readonly current: WeatherParams = { ...WEATHER_PRESETS[WeatherKind.Clear] };

  private holdTimer: number;
  private rng: () => number;
  private readonly fromParams: WeatherParams = { ...WEATHER_PRESETS[WeatherKind.Clear] };

  constructor(options: Partial<WeatherOptions> = {}, seed = 0x9e37) {
    this.opts = { ...DEFAULT_WEATHER, ...options };
    this.from = this.opts.start;
    this.to = this.opts.start;
    this.rng = mulberry32(seed >>> 0);
    this.holdTimer = this.rollHold();
    copyParams(this.current, WEATHER_PRESETS[this.opts.start]);
    copyParams(this.fromParams, WEATHER_PRESETS[this.opts.start]);
  }

  get settled(): boolean {
    return this.blend >= 1 && this.from === this.to;
  }

  get dominant(): WeatherKind {
    return this.blend >= 0.5 ? this.to : this.from;
  }

  get transitionProgress(): number {
    return this.blend;
  }

  get transitionSeconds(): number {
    return this.opts.transitionSeconds;
  }

  setWeather(kind: WeatherKind, immediate = false): void {
    if (kind === this.to && this.blend < 1) return;
    if (kind === this.to && this.settled && !immediate) return;
    if (immediate) {
      this.from = kind;
      this.to = kind;
      this.blend = 1;
      copyParams(this.current, WEATHER_PRESETS[kind]);
      copyParams(this.fromParams, WEATHER_PRESETS[kind]);
      this.holdTimer = this.rollHold();
      return;
    }
    this.rebaseFrom();
    this.to = kind;
    this.blend = 0;
    this.holdTimer = this.rollHold();
  }

  reset(): void {
    this.from = this.opts.start;
    this.to = this.opts.start;
    this.blend = 1;
    this.holdTimer = this.rollHold();
    Object.assign(this.current, WEATHER_PRESETS[this.opts.start]);
    Object.assign(this.fromParams, WEATHER_PRESETS[this.opts.start]);
  }

  setAutoChange(on: boolean): void {
    this.opts = { ...this.opts, autoChange: on };
  }

  step(dt: number): void {
    if (dt <= 0) return;

    if (this.blend < 1) {
      const rate = 1 / Math.max(this.opts.transitionSeconds, 0.001);
      this.blend = clamp01(this.blend + dt * rate);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      blendParams(this.current, this.fromParams, WEATHER_PRESETS[this.to], t);
      if (this.blend >= 1) {
        this.from = this.to;
        copyParams(this.current, WEATHER_PRESETS[this.to]);
        copyParams(this.fromParams, WEATHER_PRESETS[this.to]);
      }
      return;
    }

    if (!this.opts.autoChange) return;

    this.holdTimer -= dt;
    if (this.holdTimer <= 0) this.setWeather(this.pickNext());
  }

  snapshot(): WeatherParams {
    return { ...this.current };
  }

  get rainAmbienceGain(): number {
    const r = clamp01(this.current.rainIntensity);
    return r <= 0.001 ? 0 : 0.18 + r * 0.72;
  }

  private rebaseFrom(): void {
    copyParams(this.fromParams, this.current);
    this.from = this.dominant;
  }

  private rollHold(): number {
    const { minHoldSeconds, maxHoldSeconds } = this.opts;
    return minHoldSeconds + this.rng() * Math.max(maxHoldSeconds - minHoldSeconds, 0);
  }

  private pickNext(): WeatherKind {
    const w = this.opts.weights.slice() as [number, number, number];
    w[this.to] = 0;
    const total = w[0] + w[1] + w[2];
    if (total <= 0) return this.to;
    let r = this.rng() * total;
    for (let i = 0; i < 3; i++) {
      r -= w[i];
      if (r <= 0) return i as WeatherKind;
    }
    return WeatherKind.Clear;
  }
}

function copyParams(dst: WeatherParams, src: WeatherParams): void {
  dst.cloudCover = src.cloudCover;
  dst.sunFactor = src.sunFactor;
  dst.ambientFactor = src.ambientFactor;
  dst.fogFactor = src.fogFactor;
  dst.exposureFactor = src.exposureFactor;
  dst.rainIntensity = src.rainIntensity;
  dst.wetness = src.wetness;
  dst.warmth = src.warmth;
  dst.shadowStrength = src.shadowStrength;
}

function blendParams(dst: WeatherParams, a: WeatherParams, b: WeatherParams, t: number): void {
  dst.cloudCover = lerp(a.cloudCover, b.cloudCover, t);
  dst.sunFactor = lerp(a.sunFactor, b.sunFactor, t);
  dst.ambientFactor = lerp(a.ambientFactor, b.ambientFactor, t);
  dst.fogFactor = lerp(a.fogFactor, b.fogFactor, t);
  dst.exposureFactor = lerp(a.exposureFactor, b.exposureFactor, t);
  dst.rainIntensity = lerp(a.rainIntensity, b.rainIntensity, t);
  dst.wetness = lerp(a.wetness, b.wetness, t);
  dst.warmth = lerp(a.warmth, b.warmth, t);
  dst.shadowStrength = lerp(a.shadowStrength, b.shadowStrength, t);
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
