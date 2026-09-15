import { clamp01 } from '../util/math';
import type { DayNightCycle } from '../time/dayNight';
import type { WeatherSystem } from './weather';

export interface AmbienceMix {
  ambienceForest: number;
  ambienceNight: number;
  ambienceRain: number;
}

export function computeAmbienceMix(
  cycle: DayNightCycle,
  weather: WeatherSystem,
  out: AmbienceMix = { ambienceForest: 0, ambienceNight: 0, ambienceRain: 0 },
): AmbienceMix {
  const night = clamp01(cycle.moonlit);
  const rain = weather.rainAmbienceGain;
  const rainDuck = 1 - clamp01(weather.current.rainIntensity) * 0.55;

  out.ambienceRain = rain;
  out.ambienceNight = night * 0.85 * rainDuck;
  out.ambienceForest = (1 - night) * 0.7 * rainDuck;
  return out;
}
