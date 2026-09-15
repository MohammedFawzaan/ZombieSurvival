
export type QualityLevel = 'low' | 'medium' | 'high';

export type WeatherPreference = 'dynamic' | 'clear' | 'cloudy' | 'rain';

export const WEATHER_PREFERENCES: readonly WeatherPreference[] = [
  'dynamic',
  'clear',
  'cloudy',
  'rain',
];

export type TimePreference = 'dynamic' | 'morning' | 'day' | 'evening' | 'night';

export const TIME_PREFERENCES: readonly TimePreference[] = [
  'dynamic',
  'morning',
  'day',
  'evening',
  'night',
];

export interface GraphicsSettings {
  quality: QualityLevel;
  renderScale: number;
  fullscreen: boolean;
  weather: WeatherPreference;
  timeOfDay: TimePreference;
}

export interface AudioSettings {
  master: number;
  effects: number;
  ambience: number;
}

export interface ControlSettings {
  sensitivity: number;
  invertY: boolean;
}

export interface Settings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: { quality: 'medium', renderScale: 1, fullscreen: false, weather: 'dynamic', timeOfDay: 'dynamic' },
  audio: { master: 0.8, effects: 0.9, ambience: 0.7 },
  controls: { sensitivity: 1, invertY: false },
};

const STORAGE_KEY = 'zombie-survival:settings:v1';

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function clampRange(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function asQuality(v: unknown, fallback: QualityLevel): QualityLevel {
  return v === 'low' || v === 'medium' || v === 'high' ? v : fallback;
}

function asWeather(v: unknown, fallback: WeatherPreference): WeatherPreference {
  return WEATHER_PREFERENCES.includes(v as WeatherPreference) ? (v as WeatherPreference) : fallback;
}

function asTime(v: unknown, fallback: TimePreference): TimePreference {
  return TIME_PREFERENCES.includes(v as TimePreference) ? (v as TimePreference) : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function normalizeSettings(raw: unknown): Settings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const g = (o.graphics ?? {}) as Record<string, unknown>;
  const a = (o.audio ?? {}) as Record<string, unknown>;
  const c = (o.controls ?? {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    graphics: {
      quality: asQuality(g.quality, d.graphics.quality),
      renderScale: clampRange(g.renderScale, 0.5, 1, d.graphics.renderScale),
      fullscreen: asBool(g.fullscreen, d.graphics.fullscreen),
      weather: asWeather(g.weather, d.graphics.weather),
      timeOfDay: asTime(g.timeOfDay, d.graphics.timeOfDay),
    },
    audio: {
      master: clamp01(a.master, d.audio.master),
      effects: clamp01(a.effects, d.audio.effects),
      ambience: clamp01(a.ambience, d.audio.ambience),
    },
    controls: {
      sensitivity: clampRange(c.sensitivity, 0.2, 3, d.controls.sensitivity),
      invertY: asBool(c.invertY, d.controls.invertY),
    },
  };
}

export type SettingsListener = (s: Settings) => void;

export class SettingsStore {
  private current: Settings = structuredClone(DEFAULT_SETTINGS);
  private listeners = new Set<SettingsListener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private storage: Storage | null = safeStorage()) {
    this.load();
  }

  get value(): Settings {
    return this.current;
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw) this.current = normalizeSettings(JSON.parse(raw));
    } catch {
      this.current = structuredClone(DEFAULT_SETTINGS);
    }
  }

  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  update(patch: DeepPartial<Settings>): Settings {
    this.current = normalizeSettings({
      graphics: { ...this.current.graphics, ...(patch.graphics ?? {}) },
      audio: { ...this.current.audio, ...(patch.audio ?? {}) },
      controls: { ...this.current.controls, ...(patch.controls ?? {}) },
    });
    for (const fn of this.listeners) fn(this.current);
    this.scheduleSave();
    return this.current;
  }

  reset(): Settings {
    return this.update(DEFAULT_SETTINGS);
  }

  private scheduleSave(): void {
    if (!this.storage) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 250);
  }

  flush(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
    }
  }
}

export type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
