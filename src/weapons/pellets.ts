import { TAU } from '../util/math';

export function pelletPattern(
  count: number,
  out: Float32Array,
  rand: () => number = Math.random,
): Float32Array {
  const baseAngle = rand() * TAU;
  const wedge = TAU / count;

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i + rand()) * wedge;
    const ringT = (i + rand()) / count;
    const radius = Math.sqrt(ringT);

    out[i * 2] = Math.cos(angle) * radius;
    out[i * 2 + 1] = Math.sin(angle) * radius;
  }
  return out;
}

export const UNIFORM_DISC_MEAN_RADIUS = 2 / 3;
