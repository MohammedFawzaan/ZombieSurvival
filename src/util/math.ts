export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01(invLerp(edge0, edge1, v));
  return t * t * (3 - 2 * t);
}

export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function moveTowardsAngle(from: number, to: number, maxDelta: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxDelta) return to;
  return from + Math.sign(d) * maxDelta;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, maxInclusive: number): number {
  return Math.floor(min + Math.random() * (maxInclusive - min + 1));
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
