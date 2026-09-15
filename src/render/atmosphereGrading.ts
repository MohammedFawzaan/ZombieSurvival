import * as THREE from 'three';
import { DayNightCycle } from '../time/dayNight';
import type { WeatherParams } from '../weather/weather';
import { clamp, clamp01, lerp, smoothstep } from '../util/math';
import type { AtmosphereState } from './sky';

interface SkyKey {
  elevation: number;
  zenith: number;
  horizon: number;
  ground: number;
  sun: number;
  sunIntensity: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  fog: number;
  fogDensity: number;
  haze: number;
  exposure: number;
}

const KEYS: SkyKey[] = [
  {
    elevation: -1,
    zenith: 0x1b2b46,
    horizon: 0x354861,
    ground: 0x181d26,
    sun: 0xa9c0e2,
    sunIntensity: 1.02,
    ambientSky: 0x8299c2,
    ambientGround: 0x4d5566,
    ambientIntensity: 1.34,
    fog: 0x28334a,
    fogDensity: 0.0072,
    haze: 0.48,
    exposure: 1.14,
  },
  {
    elevation: -0.25,
    zenith: 0x223255,
    horizon: 0x4a5670,
    ground: 0x1e232c,
    sun: 0xc0cde4,
    sunIntensity: 1.1,
    ambientSky: 0x8799bb,
    ambientGround: 0x4f5766,
    ambientIntensity: 1.34,
    fog: 0x333e54,
    fogDensity: 0.007,
    haze: 0.54,
    exposure: 1.12,
  },
  {
    elevation: -0.06,
    zenith: 0x2c4166,
    horizon: 0x8d6a62,
    ground: 0x221f1e,
    sun: 0xd99a66,
    sunIntensity: 1.0,
    ambientSky: 0x8894b2,
    ambientGround: 0x4a453c,
    ambientIntensity: 1.2,
    fog: 0x574f52,
    fogDensity: 0.0076,
    haze: 0.78,
    exposure: 1.1,
  },
  {
    elevation: 0.13,
    zenith: 0x3f6da3,
    horizon: 0xd7a173,
    ground: 0x2b2822,
    sun: 0xffc489,
    sunIntensity: 2.1,
    ambientSky: 0x9fb0c8,
    ambientGround: 0x4e4636,
    ambientIntensity: 1.22,
    fog: 0x9a8b7c,
    fogDensity: 0.0068,
    haze: 0.86,
    exposure: 1.07,
  },
  {
    elevation: 0.45,
    zenith: 0x4776ad,
    horizon: 0xc6cabc,
    ground: 0x2a2b22,
    sun: 0xfff0d6,
    sunIntensity: 2.9,
    ambientSky: 0xaecbe8,
    ambientGround: 0x5c5a42,
    ambientIntensity: 1.32,
    fog: 0xb3bdb4,
    fogDensity: 0.0063,
    haze: 0.72,
    exposure: 1.05,
  },
  {
    elevation: 1,
    zenith: 0x4a7bb0,
    horizon: 0xc2c9bd,
    ground: 0x2a2b22,
    sun: 0xfff1d8,
    sunIntensity: 3.15,
    ambientSky: 0xaecbe8,
    ambientGround: 0x5c5a42,
    ambientIntensity: 1.35,
    fog: 0xb3bdb4,
    fogDensity: 0.0062,
    haze: 0.7,
    exposure: 1.05,
  },
];

const OVERCAST_ZENITH = new THREE.Color(0x67707b);
const OVERCAST_HORIZON = new THREE.Color(0x8d949a);
const OVERCAST_FOG = new THREE.Color(0x8a9096);
const OVERCAST_NIGHT_ZENITH = new THREE.Color(0x1e2735);
const OVERCAST_NIGHT_HORIZON = new THREE.Color(0x2f3a4a);
const OVERCAST_NIGHT_FOG = new THREE.Color(0x2c374a);

export interface GradingOutput {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  haze: number;
  exposure: number;
  ambientSky: THREE.Color;
  ambientGround: THREE.Color;
  moonlit: number;
  shadowStrength: number;
  wetness: number;
  cloudCover: number;
}

export class AtmosphereGrading {
  readonly out: GradingOutput = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    ground: new THREE.Color(),
    haze: 0.7,
    exposure: 1.05,
    ambientSky: new THREE.Color(),
    ambientGround: new THREE.Color(),
    moonlit: 0,
    shadowStrength: 1,
    wetness: 0,
    cloudCover: 0.12,
  };

  private readonly tmpA = new THREE.Color();
  private readonly tmpB = new THREE.Color();
  private readonly keySun = new THREE.Color();

  evaluate(cycle: DayNightCycle, weather: WeatherParams, state: AtmosphereState): void {
    const e = cycle.sun.elevation;
    const { a, b, t } = bracket(e);

    const o = this.out;

    this.tmpA.setHex(a.zenith, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.zenith, THREE.SRGBColorSpace);
    o.zenith.copy(this.tmpA).lerp(this.tmpB, t);

    this.tmpA.setHex(a.horizon, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.horizon, THREE.SRGBColorSpace);
    o.horizon.copy(this.tmpA).lerp(this.tmpB, t);

    this.tmpA.setHex(a.ground, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.ground, THREE.SRGBColorSpace);
    o.ground.copy(this.tmpA).lerp(this.tmpB, t);

    this.tmpA.setHex(a.sun, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.sun, THREE.SRGBColorSpace);
    this.keySun.copy(this.tmpA).lerp(this.tmpB, t);

    this.tmpA.setHex(a.ambientSky, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.ambientSky, THREE.SRGBColorSpace);
    o.ambientSky.copy(this.tmpA).lerp(this.tmpB, t);

    this.tmpA.setHex(a.ambientGround, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.ambientGround, THREE.SRGBColorSpace);
    o.ambientGround.copy(this.tmpA).lerp(this.tmpB, t);

    this.tmpA.setHex(a.fog, THREE.SRGBColorSpace);
    this.tmpB.setHex(b.fog, THREE.SRGBColorSpace);
    state.fogColor.copy(this.tmpA).lerp(this.tmpB, t);

    let sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
    let ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
    let fogDensity = lerp(a.fogDensity, b.fogDensity, t);
    o.haze = lerp(a.haze, b.haze, t);
    o.exposure = lerp(a.exposure, b.exposure, t);

    const moonlit = cycle.moonlit;
    o.moonlit = moonlit;

    const cover = clamp01(weather.cloudCover);
    o.cloudCover = cover;
    o.wetness = clamp01(weather.wetness);

    sunIntensity *= weather.sunFactor;
    ambientIntensity *= weather.ambientFactor;
    fogDensity *= weather.fogFactor;
    o.exposure *= weather.exposureFactor;

    const storm = clamp01(weather.rainIntensity);
    const stormDim = 1 - storm * 0.42;

    this.tmpA.copy(OVERCAST_ZENITH).lerp(OVERCAST_NIGHT_ZENITH, moonlit);
    this.tmpA.multiplyScalar(stormDim);
    o.zenith.lerp(this.tmpA, cover * 0.82);
    this.tmpA.copy(OVERCAST_HORIZON).lerp(OVERCAST_NIGHT_HORIZON, moonlit);
    this.tmpA.multiplyScalar(stormDim);
    o.horizon.lerp(this.tmpA, cover * 0.74);
    this.tmpA.copy(OVERCAST_FOG).lerp(OVERCAST_NIGHT_FOG, moonlit);
    this.tmpA.multiplyScalar(1 - storm * 0.3);
    state.fogColor.lerp(this.tmpA, cover * 0.7);

    const warmth = clamp(weather.warmth, -1, 1);
    if (warmth > 0) {
      this.tmpA.setRGB(1, 0.93, 0.82);
      this.keySun.lerp(this.tmpA, warmth * 0.22);
    } else {
      this.tmpA.setRGB(0.82, 0.88, 1);
      this.keySun.lerp(this.tmpA, -warmth * 0.3);
      o.ambientSky.lerp(this.tmpA, -warmth * 0.22);
    }

    const nightFloor = lerp(0, NIGHT_AMBIENT_FLOOR, moonlit);
    ambientIntensity = Math.max(ambientIntensity, nightFloor);

    const keyFloor = lerp(0, NIGHT_KEY_FLOOR, moonlit);
    sunIntensity = Math.max(sunIntensity, keyFloor);

    const maxNightFog = lerp(0.02, NIGHT_FOG_CEILING, moonlit);
    fogDensity = Math.min(fogDensity, maxNightFog);

    o.exposure = clamp(o.exposure * lerp(1, NIGHT_EXPOSURE_LIFT, moonlit), 0.85, 1.45);

    state.sunColor.copy(this.keySun);
    state.sunIntensity = sunIntensity;
    state.ambientColor.copy(o.ambientSky);
    state.ambientIntensity = ambientIntensity;
    state.fogDensity = fogDensity;

    const body = moonlit > 0.5 ? cycle.moon : cycle.sun;
    state.sunDirection.set(body.x, body.y, body.z);
    if (state.sunDirection.y < MIN_KEY_ELEVATION) {
      const horizontal = Math.hypot(state.sunDirection.x, state.sunDirection.z);
      const wanted = Math.sqrt(Math.max(1 - MIN_KEY_ELEVATION * MIN_KEY_ELEVATION, 0));
      const scale = horizontal > 1e-6 ? wanted / horizontal : 0;
      state.sunDirection.set(
        state.sunDirection.x * scale,
        MIN_KEY_ELEVATION,
        state.sunDirection.z * scale,
      );
    }

    o.shadowStrength = weather.shadowStrength * lerp(1, 0.55, moonlit);
  }
}

export const MIN_KEY_ELEVATION = 0.06;
export const NIGHT_AMBIENT_FLOOR = 1.46;
export const NIGHT_KEY_FLOOR = 1.02;
export const NIGHT_FOG_CEILING = 0.0082;
export const NIGHT_EXPOSURE_LIFT = 1.1;

function bracket(elevation: number): { a: SkyKey; b: SkyKey; t: number } {
  const e = clamp(elevation, -1, 1);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (e <= b.elevation) {
      const span = b.elevation - a.elevation;
      const raw = span <= 0 ? 0 : (e - a.elevation) / span;
      return { a, b, t: smoothstep(0, 1, clamp01(raw)) };
    }
  }
  const last = KEYS[KEYS.length - 1];
  return { a: last, b: last, t: 0 };
}
