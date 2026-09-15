
export type BusName = 'effects' | 'ambience';

export interface AudioLevels {
  master: number;
  effects: number;
  ambience: number;
}

const DEFAULT_MAX_VOICES = 4;

const GLOBAL_MAX_VOICES = 24;

export interface SoundDef {
  build: (ctx: BaseAudioContext) => AudioBuffer;
  bus: BusName;
  gain: number;
  maxVoices?: number;
  pitchJitter?: number;
  refDistance?: number;
  maxDistance?: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode | null;
  id: string;
  endsAt: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private busGains!: Record<BusName, GainNode>;
  private buffers = new Map<string, AudioBuffer>();
  private defs = new Map<string, SoundDef>();
  private voices: Voice[] = [];
  private levels: AudioLevels = { master: 0.8, effects: 0.9, ambience: 0.7 };
  private ambienceLoops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private started = false;
  private failed = false;

  get ready(): boolean {
    return this.started && !this.failed && this.ctx !== null;
  }

  async start(): Promise<void> {
    if (this.started || this.failed) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.failed = true;
        return;
      }
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);

      this.busGains = {
        effects: ctx.createGain(),
        ambience: ctx.createGain(),
      };
      this.busGains.effects.connect(this.masterGain);
      this.busGains.ambience.connect(this.masterGain);

      if (ctx.state === 'suspended') await ctx.resume();
      this.started = true;
      this.applyLevels();

      for (const [id, def] of this.defs) {
        if (!this.buffers.has(id)) this.buffers.set(id, def.build(ctx));
      }
    } catch {
      this.failed = true;
      this.ctx = null;
    }
  }

  register(id: string, def: SoundDef): void {
    this.defs.set(id, def);
    if (this.ctx && !this.buffers.has(id)) {
      this.buffers.set(id, def.build(this.ctx));
    }
  }

  setLevels(levels: AudioLevels): void {
    this.levels = levels;
    this.applyLevels();
  }

  private applyLevels(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.masterGain.gain.setTargetAtTime(this.levels.master, t, 0.015);
    this.busGains.effects.gain.setTargetAtTime(this.levels.effects, t, 0.015);
    this.busGains.ambience.gain.setTargetAtTime(this.levels.ambience, t, 0.015);
  }

  setListener(
    x: number,
    y: number,
    z: number,
    forwardX: number,
    forwardY: number,
    forwardZ: number,
  ): void {
    if (!this.ready) return;
    const l = this.ctx!.listener;
    const t = this.ctx!.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(x, t, 0.01);
      l.positionY.setTargetAtTime(y, t, 0.01);
      l.positionZ.setTargetAtTime(z, t, 0.01);
      l.forwardX.setTargetAtTime(forwardX, t, 0.01);
      l.forwardY.setTargetAtTime(forwardY, t, 0.01);
      l.forwardZ.setTargetAtTime(forwardZ, t, 0.01);
      l.upX.setTargetAtTime(0, t, 0.01);
      l.upY.setTargetAtTime(1, t, 0.01);
      l.upZ.setTargetAtTime(0, t, 0.01);
    } else {
      const legacy = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(
          fx: number, fy: number, fz: number, ux: number, uy: number, uz: number,
        ): void;
      };
      legacy.setPosition(x, y, z);
      legacy.setOrientation(forwardX, forwardY, forwardZ, 0, 1, 0);
    }
  }

  play(id: string, gainScale = 1): void {
    this.spawn(id, gainScale, null);
  }

  playAt(id: string, x: number, y: number, z: number, gainScale = 1): void {
    this.spawn(id, gainScale, { x, y, z });
  }

  private spawn(
    id: string,
    gainScale: number,
    at: { x: number; y: number; z: number } | null,
  ): void {
    if (!this.ready) return;
    const def = this.defs.get(id);
    const buffer = this.buffers.get(id);
    if (!def || !buffer) return;

    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.reap(now);

    const cap = def.maxVoices ?? DEFAULT_MAX_VOICES;
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= cap) {
      const oldest = same.reduce((a, b) => (a.endsAt <= b.endsAt ? a : b));
      this.stopVoice(oldest);
    }
    if (this.voices.length >= GLOBAL_MAX_VOICES) {
      const oldest = this.voices.reduce((a, b) => (a.endsAt <= b.endsAt ? a : b));
      this.stopVoice(oldest);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (def.pitchJitter) {
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.pitchJitter;
    }

    const gain = ctx.createGain();
    gain.gain.value = def.gain * gainScale;

    let panner: PannerNode | null = null;
    if (at) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = def.refDistance ?? 4;
      panner.maxDistance = def.maxDistance ?? 140;
      panner.rolloffFactor = 1.1;
      panner.positionX.value = at.x;
      panner.positionY.value = at.y;
      panner.positionZ.value = at.z;
      source.connect(gain).connect(panner).connect(this.busGains[def.bus]);
    } else {
      source.connect(gain).connect(this.busGains[def.bus]);
    }

    source.start();
    const voice: Voice = {
      source,
      gain,
      panner,
      id,
      endsAt: now + buffer.duration / (source.playbackRate.value || 1),
    };
    this.voices.push(voice);
    source.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      try {
        gain.disconnect();
        panner?.disconnect();
      } catch {
      }
    };
  }

  private stopVoice(v: Voice): void {
    try {
      v.source.stop();
    } catch {
    }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  private reap(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i].endsAt < now - 0.25) this.voices.splice(i, 1);
    }
  }

  setAmbience(id: string, targetGain: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const def = this.defs.get(id);
    const buffer = this.buffers.get(id);
    if (!def || !buffer) return;

    let loop = this.ambienceLoops.get(id);
    if (!loop) {
      if (targetGain <= 0.0001) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.busGains[def.bus]);
      source.start();
      loop = { source, gain };
      this.ambienceLoops.set(id, loop);
    }
    loop.gain.gain.setTargetAtTime(targetGain * def.gain, ctx.currentTime, 0.6);
  }

  stopAll(): void {
    for (const v of [...this.voices]) this.stopVoice(v);
    for (const [, loop] of this.ambienceLoops) {
      try {
        loop.source.stop();
      } catch {
      }
    }
    this.ambienceLoops.clear();
  }

  dispose(): void {
    this.stopAll();
    try {
      void this.ctx?.close();
    } catch {
    }
    this.ctx = null;
    this.started = false;
  }

  get activeVoices(): number {
    return this.voices.length;
  }
}
