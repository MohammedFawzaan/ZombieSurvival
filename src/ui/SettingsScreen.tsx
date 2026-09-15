import { memo } from "react";
import {
  TIME_PREFERENCES,
  WEATHER_PREFERENCES,
  type QualityLevel,
  type Settings,
} from "../settings/settings";

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="set-row">
      <span className="set-row__label">
        {label}
        {hint && <i>{hint}</i>}
      </span>
      <input
        className="set-row__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="set-row__value">{format(value)}</span>
    </div>
  );
}

function Chips<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="set-row">
      <span className="set-row__label">
        {label}
        {hint && <i>{hint}</i>}
      </span>
      <div className="chip-row">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`chip${value === o ? " is-active" : ""}`}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <span className="set-row__value" />
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="set-row">
      <span className="set-row__label">
        {label}
        {hint && <i>{hint}</i>}
      </span>
      <button
        type="button"
        className={`toggle${value ? " is-on" : ""}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className="toggle__knob" />
      </button>
      <span className="set-row__value">{value ? "On" : "Off"}</span>
    </div>
  );
}

export const SettingsScreen = memo(function SettingsScreen({
  settings,
  onChange,
  onClose,
  onReset,
}: {
  settings: Settings;
  onChange: (patch: {
    graphics?: Partial<Settings["graphics"]>;
    audio?: Partial<Settings["audio"]>;
    controls?: Partial<Settings["controls"]>;
  }) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const levels: QualityLevel[] = ["low", "medium", "high"];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="screen screen--settings overlay--interactive">
      <div className="set">
        <header className="set__head">
          <div>
            <h1 className="set__title">Settings</h1>
            <p className="set__sub">Changes apply immediately and are saved</p>
          </div>
        </header>

        <div className="set__body">
          <h2 className="set__group">Graphics</h2>
          <Chips
            label="Quality"
            hint="Shadows, vegetation, render scale"
            options={levels}
            value={settings.graphics.quality}
            onChange={(v) => onChange({ graphics: { quality: v } })}
          />
          <Slider
            label="Resolution scale"
            hint="Lower is faster"
            value={settings.graphics.renderScale}
            min={0.5}
            max={1}
            step={0.05}
            format={pct}
            onChange={(v) => onChange({ graphics: { renderScale: v } })}
          />
          <Toggle
            label="Fullscreen"
            value={settings.graphics.fullscreen}
            onChange={(v) => onChange({ graphics: { fullscreen: v } })}
          />
          <div className="set__divider" />
          <Chips
            label="Weather"
            hint="Dynamic cycles on its own"
            options={WEATHER_PREFERENCES}
            value={settings.graphics.weather}
            onChange={(v) => onChange({ graphics: { weather: v } })}
          />
          <Chips
            label="Time of day"
            hint="Dynamic runs the full cycle"
            options={TIME_PREFERENCES}
            value={settings.graphics.timeOfDay}
            onChange={(v) => onChange({ graphics: { timeOfDay: v } })}
          />

          <h2 className="set__group">Audio</h2>
          <Slider
            label="Master"
            value={settings.audio.master}
            min={0}
            max={1}
            step={0.05}
            format={pct}
            onChange={(v) => onChange({ audio: { master: v } })}
          />
          <Slider
            label="Effects"
            hint="Weapons, zombies, footsteps"
            value={settings.audio.effects}
            min={0}
            max={1}
            step={0.05}
            format={pct}
            onChange={(v) => onChange({ audio: { effects: v } })}
          />
          <Slider
            label="Weather"
            hint="Rainfall only"
            value={settings.audio.ambience}
            min={0}
            max={1}
            step={0.05}
            format={pct}
            onChange={(v) => onChange({ audio: { ambience: v } })}
          />

          <h2 className="set__group">Controls</h2>
          <Slider
            label="Mouse sensitivity"
            value={settings.controls.sensitivity}
            min={0.2}
            max={3}
            step={0.05}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => onChange({ controls: { sensitivity: v } })}
          />
          <Toggle
            label="Invert vertical"
            value={settings.controls.invertY}
            onChange={(v) => onChange({ controls: { invertY: v } })}
          />
        </div>

        <footer className="set__foot">
          <button className="set-reset" type="button" onClick={onReset}>
            Reset defaults
          </button>
          <button className="btn" type="button" onClick={onClose} autoFocus>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
});
