import { clamp01 } from '../util/math';
import type { DayNightCycle } from '../time/dayNight';
import type { WeatherSystem } from './weather';

export interface AmbienceMix {
  ambienceForest: number;
  ambienceNight: number;
  ambienceRain: number;
}

export interface AmbienceContext {
  urban?: boolean;
}

export function createAmbienceMix(): AmbienceMix {
  return {
    ambienceForest: 0,
    ambienceNight: 0,
    ambienceRain: 0,
  };
}

export function computeAmbienceMix(
  cycle: DayNightCycle,
  weather: WeatherSystem,
  out: AmbienceMix = createAmbienceMix(),
  context: AmbienceContext = {},
): AmbienceMix {
  const night = clamp01(cycle.moonlit);
  const rain = weather.rainAmbienceGain;
  const rainDuck = 1 - clamp01(weather.current.rainIntensity) * 0.55;
  const urban = context.urban === true;

  out.ambienceRain = rain;
  out.ambienceNight = night * 0.85 * rainDuck;
  out.ambienceForest = urban ? 0 : (1 - night) * 0.7 * rainDuck;
  return out;
}
