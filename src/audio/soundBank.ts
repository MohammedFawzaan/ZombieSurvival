
import type { SoundDef } from './audioEngine';

const SR_FALLBACK = 48000;

function makeBuffer(ctx: BaseAudioContext, seconds: number, channels = 1): AudioBuffer {
  const sr = ctx.sampleRate || SR_FALLBACK;
  return ctx.createBuffer(channels, Math.max(1, Math.floor(sr * seconds)), sr);
}

function decay(t: number, k: number): number {
  return Math.exp(-t * k);
}

function attack(t: number, ms: number): number {
  const a = ms / 1000;
  return t >= a ? 1 : t / a;
}

function lowpass(data: Float32Array, cutoff: number, sr: number): void {
  const dt = 1 / sr;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    prev += a * (data[i] - prev);
    data[i] = prev;
  }
}

function highpass(data: Float32Array, cutoff: number, sr: number): void {
  const dt = 1 / sr;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = rc / (rc + dt);
  let prevIn = data[0];
  let prevOut = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    prevOut = a * (prevOut + x - prevIn);
    prevIn = x;
    data[i] = prevOut;
  }
}

function saturate(data: Float32Array, drive: number): void {
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.tanh(data[i] * drive) / Math.tanh(drive);
  }
}

function normalize(data: Float32Array, peak = 0.9): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max < 1e-6) return;
  const g = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= g;
}

function gunshot(
  ctx: BaseAudioContext,
  opts: { seconds: number; cutoff: number; decayK: number; bodyHz: number; drive: number },
): AudioBuffer {
  const buf = makeBuffer(ctx, opts.seconds);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;

  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = decay(t, opts.decayK);
    const noise = (Math.random() * 2 - 1) * env;
    const body = Math.sin(2 * Math.PI * opts.bodyHz * t) * decay(t, opts.decayK * 0.55) * 0.8;
    const crack = t < 0.004 ? (Math.random() * 2 - 1) * (1 - t / 0.004) * 1.4 : 0;
    d[i] = noise * 0.85 + body + crack;
  }

  lowpass(d, opts.cutoff, sr);
  highpass(d, 90, sr);
  saturate(d, opts.drive);
  normalize(d, 0.95);
  return buf;
}

function mechanical(
  ctx: BaseAudioContext,
  opts: { seconds: number; cutoff: number; decayK: number; tone: number },
): AudioBuffer {
  const buf = makeBuffer(ctx, opts.seconds);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = decay(t, opts.decayK) * attack(t, 0.4);
    const noise = (Math.random() * 2 - 1) * env;
    const tone = Math.sin(2 * Math.PI * opts.tone * t) * env * 0.5;
    d[i] = noise * 0.8 + tone;
  }
  lowpass(d, opts.cutoff, sr);
  highpass(d, 240, sr);
  normalize(d, 0.95);
  return buf;
}

function vocal(
  ctx: BaseAudioContext,
  opts: {
    seconds: number;
    baseHz: number;
    driftHz: number;
    rasp: number;
    cutoff: number;
    attackMs: number;
    decayK: number;
  },
): AudioBuffer {
  const buf = makeBuffer(ctx, opts.seconds);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const drift = Math.sin(2 * Math.PI * opts.driftHz * t) * 0.22 + 1;
    const f = opts.baseHz * drift;
    phase += (2 * Math.PI * f) / sr;
    phase2 += (2 * Math.PI * f * 1.48) / sr;

    const env = attack(t, opts.attackMs) * decay(t, opts.decayK);
    const body = (((phase % (2 * Math.PI)) / Math.PI) - 1) * 0.6 + Math.sin(phase2) * 0.25;
    const breath = (Math.random() * 2 - 1) * opts.rasp;
    d[i] = (body + breath) * env;
  }
  lowpass(d, opts.cutoff, sr);
  highpass(d, 70, sr);
  saturate(d, 1.8);
  normalize(d, 0.8);
  return buf;
}

function impact(
  ctx: BaseAudioContext,
  opts: { seconds: number; cutoff: number; decayK: number; thumpHz: number; rasp: number },
): AudioBuffer {
  const buf = makeBuffer(ctx, opts.seconds);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = decay(t, opts.decayK);
    const thump = Math.sin(2 * Math.PI * opts.thumpHz * t * decay(t, 6)) * env;
    const noise = (Math.random() * 2 - 1) * env * opts.rasp;
    d[i] = thump * 0.8 + noise;
  }
  lowpass(d, opts.cutoff, sr);
  normalize(d, 0.85);
  return buf;
}

function footstep(ctx: BaseAudioContext): AudioBuffer {
  const buf = makeBuffer(ctx, 0.17);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = decay(t, 26) + decay(Math.max(0, t - 0.035), 40) * 0.5;
    d[i] = (Math.random() * 2 - 1) * env;
  }
  lowpass(d, 1900, sr);
  highpass(d, 160, sr);
  normalize(d, 0.5);
  return buf;
}

function crossfadeLoop(d: Float32Array, sr: number, fadeSeconds = 0.4): void {
  const n = Math.min(Math.floor(sr * fadeSeconds), Math.floor(d.length / 2));
  for (let i = 0; i < n; i++) {
    const w = i / n;
    const head = d[i];
    const tail = d[d.length - n + i];
    d[i] = head * w + tail * (1 - w);
  }
  for (let i = 0; i < n; i++) {
    d[d.length - n + i] *= 1 - i / n;
  }
}

function rainLoop(ctx: BaseAudioContext): AudioBuffer {
  const buf = makeBuffer(ctx, 4);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  for (let i = 0; i < d.length; i++) {
    d[i] = Math.random() * 2 - 1;
  }
  lowpass(d, 4200, sr);
  highpass(d, 420, sr);
  const drops = 260;
  for (let k = 0; k < drops; k++) {
    const start = Math.floor(Math.random() * (d.length - 600));
    const amp = 0.25 + Math.random() * 0.5;
    for (let i = 0; i < 500; i++) {
      d[start + i] += (Math.random() * 2 - 1) * amp * decay(i / sr, 180);
    }
  }
  crossfadeLoop(d, sr);
  normalize(d, 0.55);
  return buf;
}

function forestLoop(ctx: BaseAudioContext): AudioBuffer {
  const buf = makeBuffer(ctx, 6);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const swell = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.07 * t + Math.sin(t * 0.31));
    d[i] = (Math.random() * 2 - 1) * swell;
  }
  lowpass(d, 620, sr);
  highpass(d, 70, sr);
  crossfadeLoop(d, sr, 0.8);
  normalize(d, 0.4);
  return buf;
}

function nightLoop(ctx: BaseAudioContext): AudioBuffer {
  const buf = makeBuffer(ctx, 6);
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.05 * t);
    d[i] = (Math.random() * 2 - 1) * swell * 0.6;
  }
  lowpass(d, 380, sr);
  for (let k = 0; k < 90; k++) {
    const start = Math.floor(Math.random() * (d.length - 4000));
    const f = 3200 + Math.random() * 1800;
    const len = 900 + Math.floor(Math.random() * 700);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[start + i] += Math.sin(2 * Math.PI * f * t) * decay(t, 90) * 0.07;
    }
  }
  crossfadeLoop(d, sr, 0.8);
  normalize(d, 0.36);
  return buf;
}

export const SOUND_IDS = {
  pistolShot: 'pistolShot',
  rifleShot: 'rifleShot',
  shotgunShot: 'shotgunShot',
  dryFire: 'dryFire',
  reloadOut: 'reloadOut',
  reloadIn: 'reloadIn',
  meleeSwing: 'meleeSwing',
  meleeImpact: 'meleeImpact',
  bulletImpact: 'bulletImpact',
  zombieIdle: 'zombieIdle',
  zombieAlert: 'zombieAlert',
  zombieAttack: 'zombieAttack',
  zombieHurt: 'zombieHurt',
  zombieDeath: 'zombieDeath',
  playerHurt: 'playerHurt',
  footstep: 'footstep',
  heal: 'heal',
  healComplete: 'healComplete',
  ambienceForest: 'ambienceForest',
  ambienceNight: 'ambienceNight',
  ambienceRain: 'ambienceRain',
} as const;

export const SOUND_BANK: Record<string, SoundDef> = {
  [SOUND_IDS.pistolShot]: {
    bus: 'effects',
    gain: 0.55,
    maxVoices: 4,
    pitchJitter: 0.06,
    build: (ctx) => gunshot(ctx, { seconds: 0.3, cutoff: 5200, decayK: 26, bodyHz: 150, drive: 2.2 }),
  },
  [SOUND_IDS.rifleShot]: {
    bus: 'effects',
    gain: 0.6,
    maxVoices: 5,
    pitchJitter: 0.05,
    build: (ctx) => gunshot(ctx, { seconds: 0.38, cutoff: 6800, decayK: 20, bodyHz: 110, drive: 2.6 }),
  },
  [SOUND_IDS.shotgunShot]: {
    bus: 'effects',
    gain: 0.72,
    maxVoices: 3,
    pitchJitter: 0.04,
    build: (ctx) => gunshot(ctx, { seconds: 0.62, cutoff: 3400, decayK: 11, bodyHz: 72, drive: 3.1 }),
  },
  [SOUND_IDS.dryFire]: {
    bus: 'effects',
    gain: 0.35,
    maxVoices: 2,
    build: (ctx) => mechanical(ctx, { seconds: 0.09, cutoff: 6000, decayK: 90, tone: 1500 }),
  },
  [SOUND_IDS.reloadOut]: {
    bus: 'effects',
    gain: 0.95,
    maxVoices: 2,
    pitchJitter: 0.04,
    build: (ctx) => mechanical(ctx, { seconds: 0.16, cutoff: 4200, decayK: 34, tone: 620 }),
  },
  [SOUND_IDS.reloadIn]: {
    bus: 'effects',
    gain: 1,
    maxVoices: 2,
    pitchJitter: 0.04,
    build: (ctx) => mechanical(ctx, { seconds: 0.2, cutoff: 3400, decayK: 26, tone: 380 }),
  },
  [SOUND_IDS.meleeSwing]: {
    bus: 'effects',
    gain: 0.4,
    maxVoices: 3,
    pitchJitter: 0.09,
    build: (ctx) => {
      const buf = makeBuffer(ctx, 0.26);
      const d = buf.getChannelData(0);
      const sr = buf.sampleRate;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * Math.min(1, t / 0.22)) ** 2;
        d[i] = (Math.random() * 2 - 1) * env;
      }
      lowpass(d, 1500, sr);
      highpass(d, 300, sr);
      normalize(d, 0.5);
      return buf;
    },
  },
  [SOUND_IDS.meleeImpact]: {
    bus: 'effects',
    gain: 0.6,
    maxVoices: 4,
    pitchJitter: 0.08,
    build: (ctx) => impact(ctx, { seconds: 0.3, cutoff: 2100, decayK: 30, thumpHz: 105, rasp: 0.5 }),
  },
  [SOUND_IDS.bulletImpact]: {
    bus: 'effects',
    gain: 0.34,
    maxVoices: 6,
    pitchJitter: 0.14,
    refDistance: 6,
    maxDistance: 90,
    build: (ctx) => impact(ctx, { seconds: 0.14, cutoff: 5200, decayK: 70, thumpHz: 210, rasp: 0.85 }),
  },

  [SOUND_IDS.zombieIdle]: {
    bus: 'effects',
    gain: 0.32,
    maxVoices: 3,
    pitchJitter: 0.14,
    refDistance: 5,
    maxDistance: 55,
    build: (ctx) =>
      vocal(ctx, { seconds: 1.5, baseHz: 96, driftHz: 1.1, rasp: 0.3, cutoff: 1250, attackMs: 120, decayK: 1.5 }),
  },
  [SOUND_IDS.zombieAlert]: {
    bus: 'effects',
    gain: 0.5,
    maxVoices: 3,
    pitchJitter: 0.12,
    refDistance: 7,
    maxDistance: 95,
    build: (ctx) =>
      vocal(ctx, { seconds: 1.2, baseHz: 155, driftHz: 2.4, rasp: 0.45, cutoff: 2100, attackMs: 25, decayK: 2.4 }),
  },
  [SOUND_IDS.zombieAttack]: {
    bus: 'effects',
    gain: 0.55,
    maxVoices: 3,
    pitchJitter: 0.12,
    refDistance: 4,
    maxDistance: 45,
    build: (ctx) =>
      vocal(ctx, { seconds: 0.7, baseHz: 190, driftHz: 3.6, rasp: 0.55, cutoff: 2600, attackMs: 8, decayK: 5 }),
  },
  [SOUND_IDS.zombieHurt]: {
    bus: 'effects',
    gain: 0.48,
    maxVoices: 4,
    pitchJitter: 0.16,
    refDistance: 5,
    maxDistance: 70,
    build: (ctx) =>
      vocal(ctx, { seconds: 0.5, baseHz: 210, driftHz: 5, rasp: 0.6, cutoff: 2800, attackMs: 5, decayK: 7 }),
  },
  [SOUND_IDS.zombieDeath]: {
    bus: 'effects',
    gain: 0.55,
    maxVoices: 3,
    pitchJitter: 0.1,
    refDistance: 6,
    maxDistance: 80,
    build: (ctx) =>
      vocal(ctx, { seconds: 1.4, baseHz: 120, driftHz: 0.8, rasp: 0.5, cutoff: 1500, attackMs: 10, decayK: 2.1 }),
  },

  [SOUND_IDS.playerHurt]: {
    bus: 'effects',
    gain: 0.5,
    maxVoices: 2,
    pitchJitter: 0.08,
    build: (ctx) =>
      vocal(ctx, { seconds: 0.45, baseHz: 165, driftHz: 4, rasp: 0.4, cutoff: 2200, attackMs: 4, decayK: 8 }),
  },
  [SOUND_IDS.footstep]: {
    bus: 'effects',
    gain: 0.12,
    maxVoices: 3,
    pitchJitter: 0.18,
    build: (ctx) => footstep(ctx),
  },
  [SOUND_IDS.heal]: {
    bus: 'effects',
    gain: 0.4,
    maxVoices: 1,
    build: (ctx) => {
      const buf = makeBuffer(ctx, 0.5);
      const d = buf.getChannelData(0);
      const sr = buf.sampleRate;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * Math.min(1, t / 0.5)) ** 1.5;
        d[i] = (Math.random() * 2 - 1) * env;
      }
      lowpass(d, 3800, sr);
      highpass(d, 900, sr);
      normalize(d, 0.42);
      return buf;
    },
  },

  [SOUND_IDS.healComplete]: {
    bus: 'effects',
    gain: 0.42,
    maxVoices: 1,
    build: (ctx) => {
      const buf = makeBuffer(ctx, 0.55);
      const d = buf.getChannelData(0);
      const sr = buf.sampleRate;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = attack(t, 6) * decay(t, 5.5);
        const breath = (Math.random() * 2 - 1) * 0.5;
        const tone = Math.sin(2 * Math.PI * 196 * t) * 0.35 + Math.sin(2 * Math.PI * 294 * t) * 0.2;
        d[i] = (breath * 0.55 + tone) * env;
      }
      lowpass(d, 2600, sr);
      highpass(d, 150, sr);
      normalize(d, 0.5);
      return buf;
    },
  },

  [SOUND_IDS.ambienceForest]: { bus: 'ambience', gain: 0.9, build: forestLoop },
  [SOUND_IDS.ambienceNight]: { bus: 'ambience', gain: 0.9, build: nightLoop },
  [SOUND_IDS.ambienceRain]: { bus: 'ambience', gain: 0.16, build: rainLoop },
};

export function registerAllSounds(engine: {
  register(id: string, def: SoundDef): void;
}): void {
  for (const [id, def] of Object.entries(SOUND_BANK)) engine.register(id, def);
}
