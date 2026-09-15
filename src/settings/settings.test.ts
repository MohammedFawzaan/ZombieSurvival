import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsStore,
  normalizeSettings,
  type Settings,
} from './settings';

function memoryStorage(seed?: string): Storage {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set('zombie-survival:settings:v1', seed);
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe('normalizeSettings', () => {
  it('returns defaults for empty or junk input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volumes into 0..1', () => {
    const s = normalizeSettings({ audio: { master: 5, effects: -3, ambience: 0.42 } });
    expect(s.audio.master).toBe(1);
    expect(s.audio.effects).toBe(0);
    expect(s.audio.ambience).toBeCloseTo(0.42);
  });

  it('clamps sensitivity into its supported range', () => {
    expect(normalizeSettings({ controls: { sensitivity: 99 } }).controls.sensitivity).toBe(3);
    expect(normalizeSettings({ controls: { sensitivity: 0 } }).controls.sensitivity).toBe(0.2);
  });

  it('rejects an unknown quality level but keeps the rest of the object', () => {
    const s = normalizeSettings({
      graphics: { quality: 'ultra', fullscreen: true },
    });
    expect(s.graphics.quality).toBe(DEFAULT_SETTINGS.graphics.quality);
    expect(s.graphics.fullscreen).toBe(true);
  });

  it('falls back per-field, so one bad key does not reset unrelated preferences', () => {
    const s = normalizeSettings({
      audio: { master: 'loud', effects: 0.25 },
      controls: { sensitivity: 2.5 },
    });
    expect(s.audio.master).toBe(DEFAULT_SETTINGS.audio.master);
    expect(s.audio.effects).toBe(0.25);
    expect(s.controls.sensitivity).toBe(2.5);
  });

  it('accepts a valid time-of-day preference and rejects an unknown one', () => {
    expect(normalizeSettings({ graphics: { timeOfDay: 'night' } }).graphics.timeOfDay).toBe('night');
    expect(normalizeSettings({ graphics: { timeOfDay: 'noon' } }).graphics.timeOfDay).toBe(
      DEFAULT_SETTINGS.graphics.timeOfDay,
    );
  });

  it('accepts a valid weather preference and rejects an unknown one', () => {
    expect(normalizeSettings({ graphics: { weather: 'rain' } }).graphics.weather).toBe('rain');
    expect(normalizeSettings({ graphics: { weather: 'snow' } }).graphics.weather).toBe(
      DEFAULT_SETTINGS.graphics.weather,
    );
  });

  it('rejects NaN and Infinity rather than propagating them into the mixer', () => {
    const s = normalizeSettings({ audio: { master: NaN, effects: Infinity } });
    expect(s.audio.master).toBe(DEFAULT_SETTINGS.audio.master);
    expect(s.audio.effects).toBe(DEFAULT_SETTINGS.audio.effects);
  });
});

describe('SettingsStore', () => {
  it('starts from defaults when storage is empty', () => {
    const store = new SettingsStore(memoryStorage());
    expect(store.value).toEqual(DEFAULT_SETTINGS);
  });

  it('loads and validates previously persisted settings', () => {
    const seed = JSON.stringify({ graphics: { quality: 'high' }, audio: { master: 0.3 } });
    const store = new SettingsStore(memoryStorage(seed));
    expect(store.value.graphics.quality).toBe('high');
    expect(store.value.audio.master).toBeCloseTo(0.3);
  });

  it('survives corrupt stored JSON', () => {
    const store = new SettingsStore(memoryStorage('{not json at all'));
    expect(store.value).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage after flush', () => {
    const storage = memoryStorage();
    const a = new SettingsStore(storage);
    a.update({ audio: { master: 0.15 }, graphics: { quality: 'low' } });
    a.flush();
    const b = new SettingsStore(storage);
    expect(b.value.audio.master).toBeCloseTo(0.15);
    expect(b.value.graphics.quality).toBe('low');
  });

  it('merges partial updates without clobbering other sections', () => {
    const store = new SettingsStore(memoryStorage());
    store.update({ audio: { master: 0.5 } });
    store.update({ controls: { sensitivity: 1.8 } });
    expect(store.value.audio.master).toBeCloseTo(0.5);
    expect(store.value.controls.sensitivity).toBeCloseTo(1.8);
    expect(store.value.graphics.quality).toBe(DEFAULT_SETTINGS.graphics.quality);
  });

  it('notifies subscribers immediately and on change', () => {
    const store = new SettingsStore(memoryStorage());
    const seen: Settings[] = [];
    const off = store.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(1);
    store.update({ audio: { effects: 0.1 } });
    expect(seen).toHaveLength(2);
    expect(seen[1].audio.effects).toBeCloseTo(0.1);
    off();
    store.update({ audio: { effects: 0.9 } });
    expect(seen).toHaveLength(2);
  });

  it('works with no storage available at all', () => {
    const store = new SettingsStore(null);
    expect(() => store.update({ audio: { master: 0.2 } })).not.toThrow();
    expect(store.value.audio.master).toBeCloseTo(0.2);
  });
});
