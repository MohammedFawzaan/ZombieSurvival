export type NoiseKind = 'gunshot' | 'movement' | 'impact';

export interface NoiseEvent {
  x: number;
  y: number;
  z: number;
  radius: number;
  intensity: number;
  kind: NoiseKind;
  life: number;
  active: boolean;
}

const MAX_EVENTS = 48;

export class NoiseSystem {
  private readonly pool: NoiseEvent[] = [];

  constructor() {
    for (let i = 0; i < MAX_EVENTS; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        z: 0,
        radius: 0,
        intensity: 0,
        kind: 'movement',
        life: 0,
        active: false,
      });
    }
  }

  emit(
    x: number,
    y: number,
    z: number,
    radius: number,
    intensity: number,
    kind: NoiseKind,
    life = 0.6,
  ): void {
    let slot = this.pool.find((e) => !e.active);
    if (!slot) {
      slot = this.pool.reduce((a, b) => (a.intensity <= b.intensity ? a : b));
    }
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.radius = radius;
    slot.intensity = intensity;
    slot.kind = kind;
    slot.life = life;
    slot.active = true;
  }

  step(dt: number): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      e.life -= dt;
      if (e.life <= 0) e.active = false;
    }
  }

  forEach(fn: (e: NoiseEvent) => void): void {
    for (const e of this.pool) if (e.active) fn(e);
  }

  clear(): void {
    for (const e of this.pool) e.active = false;
  }
}
