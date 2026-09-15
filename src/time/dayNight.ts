import { clamp01, lerp, smoothstep, TAU } from '../util/math';

export const enum DayPhase {
  Night = 0,
  Morning = 1,
  Day = 2,
  Evening = 3,
}

export const PHASE_BOUNDS = {
  morningStart: 0.21,
  dayStart: 0.33,
  eveningStart: 0.68,
  nightStart: 0.81,
} as const;

export interface SunPosition {
  x: number;
  y: number;
  z: number;
  elevation: number;
}

export interface DayNightOptions {
  dayLengthSeconds: number;
  startFraction: number;
  sunAzimuth: number;
  sunTilt: number;
}

export const DEFAULT_DAY_NIGHT: DayNightOptions = {
  dayLengthSeconds: 720,
  startFraction: 0.38,
  sunAzimuth: 0.6,
  sunTilt: 0.34,
};

const MAX_DARKNESS = 0.88;

export class DayNightCycle {
  private readonly opts: DayNightOptions;

  fraction: number;

  dayCount = 0;

  readonly sun: SunPosition = { x: 0, y: 1, z: 0, elevation: 1 };

  readonly moon: SunPosition = { x: 0, y: -1, z: 0, elevation: -1 };

  paused = false;

  constructor(options: Partial<DayNightOptions> = {}) {
    this.opts = { ...DEFAULT_DAY_NIGHT, ...options };
    this.fraction = wrap01(this.opts.startFraction);
    this.recomputeBodies();
  }

  reset(): void {
    this.fraction = wrap01(this.opts.startFraction);
    this.dayCount = 0;
    this.paused = false;
    this.recomputeBodies();
  }

  get dayLengthSeconds(): number {
    return this.opts.dayLengthSeconds;
  }

  step(dt: number): void {
    if (this.paused || dt <= 0) return;
    const advanced = this.fraction + dt / this.opts.dayLengthSeconds;
    const whole = Math.floor(advanced);
    if (whole !== 0) this.dayCount += whole;
    this.fraction = advanced - whole;
    this.recomputeBodies();
  }

  setFraction(f: number): void {
    this.fraction = wrap01(f);
    this.recomputeBodies();
  }

  setHour(hour: number): void {
    this.setFraction(hour / 24);
  }

  get hour(): number {
    return this.fraction * 24;
  }

  get phase(): DayPhase {
    const f = this.fraction;
    const b = PHASE_BOUNDS;
    if (f < b.morningStart) return DayPhase.Night;
    if (f < b.dayStart) return DayPhase.Morning;
    if (f < b.eveningStart) return DayPhase.Day;
    if (f < b.nightStart) return DayPhase.Evening;
    return DayPhase.Night;
  }

  get phaseName(): 'night' | 'morning' | 'day' | 'evening' {
    switch (this.phase) {
      case DayPhase.Morning:
        return 'morning';
      case DayPhase.Day:
        return 'day';
      case DayPhase.Evening:
        return 'evening';
      default:
        return 'night';
    }
  }

  get darkness(): number {
    const lit = smoothstep(-0.18, 0.12, this.sun.elevation);
    return (1 - lit) * MAX_DARKNESS;
  }

  get daylight(): number {
    return clamp01(smoothstep(-0.14, 0.16, this.sun.elevation));
  }

  get moonlit(): number {
    return 1 - this.daylight;
  }

  get goldenHour(): number {
    const e = this.sun.elevation;
    if (e <= -0.08 || e >= 0.42) return 0;
    const t = (e + 0.08) / 0.5;
    return Math.sin(t * Math.PI);
  }

  private recomputeBodies(): void {
    const theta = (this.fraction - 0.25) * TAU;
    const elevation = Math.sin(theta);
    const alongArc = Math.cos(theta);

    const az = this.opts.sunAzimuth;
    const tilt = this.opts.sunTilt;

    const hx = alongArc * Math.cos(az) + tilt * Math.sin(az);
    const hz = alongArc * Math.sin(az) - tilt * Math.cos(az);

    normaliseInto(this.sun, hx, elevation, hz);
    normaliseInto(this.moon, -hx, -elevation, -hz);
  }
}

function normaliseInto(out: SunPosition, x: number, y: number, z: number): void {
  const len = Math.hypot(x, y, z) || 1;
  out.x = x / len;
  out.y = y / len;
  out.z = z / len;
  out.elevation = out.y;
}

function wrap01(v: number): number {
  const w = v - Math.floor(v);
  return w < 0 ? w + 1 : w;
}

export function fractionDelta(from: number, to: number): number {
  let d = (to - from) % 1;
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d;
}

export { lerp };
