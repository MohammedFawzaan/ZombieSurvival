import { memo } from 'react';
import type { DebugSnapshot } from '../state/types';

export const LoadingScreen = memo(function LoadingScreen({
  label,
  progress,
  error,
}: {
  label: string;
  progress: number;
  error: string | null;
}) {
  return (
    <div className="loading">
      <div className="loading__title">Zombie Survival</div>
      {error ? (
        <div className="loading__error">{error}</div>
      ) : (
        <>
          <div className="loading__bar">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <div className="loading__label">{label}</div>
        </>
      )}
    </div>
  );
});

const CONTROLS = (
  <div className="screen__hint">
    <kbd>W</kbd>
    <kbd>A</kbd>
    <kbd>S</kbd>
    <kbd>D</kbd> move &nbsp;·&nbsp; <kbd>Shift</kbd> sprint &nbsp;·&nbsp; <kbd>Space</kbd> jump
    &nbsp;·&nbsp; <kbd>Ctrl</kbd>/<kbd>C</kbd> crouch
    <br />
    <kbd>LMB</kbd> fire &nbsp;·&nbsp; <kbd>RMB</kbd> aim &nbsp;·&nbsp; <kbd>R</kbd> reload
    &nbsp;·&nbsp; <kbd>1</kbd>-<kbd>4</kbd>/<kbd>Q</kbd> weapons &nbsp;·&nbsp; <kbd>F</kbd>/
    <kbd>G</kbd> heal
    <br />
    <kbd>Esc</kbd> pause &nbsp;·&nbsp; <kbd>F3</kbd> debug overlay
  </div>
);

export type QualityChoice = 'low' | 'medium' | 'high';

export const MapSelectScreen = memo(function MapSelectScreen({
  onSelect,
  onBack,
}: {
  onSelect: (id: 'forest' | 'city') => void;
  onBack: () => void;
}) {
  return (
    <div className="screen overlay--interactive">
      <p className="screen__eyebrow">Select deployment</p>
      <h1 className="screen__title">Choose your ground</h1>
      <div className="screen__rule" />
      <div className="map-grid">
        <button className="map-card" onClick={() => onSelect('city')} autoFocus>
          <span className="map-card__tag">Round-based</span>
          <span className="map-card__name">Ravenhill District</span>
          <span className="map-card__desc">
            An abandoned residential block. Survive waves, earn points, buy your way deeper
            into the city.
          </span>
        </button>
        <button className="map-card" onClick={() => onSelect('forest')}>
          <span className="map-card__tag">Free-form</span>
          <span className="map-card__name">Blackpine Forest</span>
          <span className="map-card__desc">
            The original bounded forest. Open survival against a roaming population.
          </span>
        </button>
      </div>
      <button className="link-btn" onClick={onBack}>
        Back
      </button>
    </div>
  );
});

export const StartScreen = memo(function StartScreen({
  onStart,
  onSettings,
  onExit,
}: {
  onStart: () => void;
  onSettings: () => void;
  onExit: () => void;
}) {
  return (
    <div className="screen overlay--interactive">
      <p className="screen__eyebrow">Version 2</p>
      <h1 className="screen__title">Zombie Survival</h1>
      <p className="screen__subtitle">Outlast the dead</p>
      <div className="screen__rule" />
      <div className="btn-row">
        <button className="btn" onClick={onStart} autoFocus>
          New run
        </button>
        <button className="btn btn--ghost" onClick={onSettings}>
          Settings
        </button>
      </div>
      {CONTROLS}
      <button className="link-btn" onClick={onExit}>
        Exit game
      </button>
    </div>
  );
});

export const PauseScreen = memo(function PauseScreen({
  onResume,
  onRestart,
  onQuit,
  onSettings,
  quality,
  onQuality,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onSettings: () => void;
  quality: QualityChoice;
  onQuality: (q: QualityChoice) => void;
}) {
  const levels: QualityChoice[] = ['low', 'medium', 'high'];
  return (
    <div className="screen overlay--interactive">
      <h1 className="screen__title pause-title">Paused</h1>
      <p className="screen__subtitle">Click resume to recapture the mouse</p>
      <div className="btn-row">
        <button className="btn" onClick={onResume} autoFocus>
          Resume
        </button>
        <button className="btn btn--ghost" onClick={onRestart}>
          Restart
        </button>
        <button className="btn btn--ghost" onClick={onSettings}>
          Settings
        </button>
        <button className="btn btn--ghost" onClick={onQuit}>
          Main menu
        </button>
      </div>
      <div className="settings-row">
        <span className="settings-row__label">Graphics</span>
        {levels.map((level) => (
          <button
            key={level}
            className={`chip${quality === level ? ' is-active' : ''}`}
            onClick={() => onQuality(level)}
          >
            {level}
          </button>
        ))}
      </div>
      {CONTROLS}
    </div>
  );
});

function row(label: string, value: string, tone?: 'good' | 'bad') {
  return (
    <div className={`debug__row${tone ? ` is-${tone}` : ''}`} key={label}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export const DebugOverlay = memo(function DebugOverlay({ d }: { d: DebugSnapshot }) {
  const fpsTone = d.fps >= 50 ? 'good' : d.fps < 30 ? 'bad' : undefined;
  return (
    <div className="debug">
      <div className="debug__title">Debug · F3</div>
      {row('FPS', d.fps.toFixed(0), fpsTone)}
      {row('Frame', `${d.frameMs.toFixed(2)} ms`)}
      <div className="debug__sep" />
      {row('Sim', `${d.simMs.toFixed(2)} ms`)}
      {row('Physics', `${d.physicsMs.toFixed(2)} ms`)}
      {row('AI', `${d.aiMs.toFixed(2)} ms`)}
      {row('Render', `${d.renderMs.toFixed(2)} ms`)}
      <div className="debug__sep" />
      {row('Draw calls', String(d.drawCalls))}
      {row('Triangles', d.triangles.toLocaleString())}
      <div className="debug__sep" />
      {row(
        'Position',
        `${d.playerPos.x.toFixed(1)} ${d.playerPos.y.toFixed(1)} ${d.playerPos.z.toFixed(1)}`,
      )}
      {row('Speed', `${d.playerVel.toFixed(2)} m/s`)}
      {row('Grounded', d.grounded ? 'yes' : 'no')}
      <div className="debug__sep" />
      {row('Zombies alive', `${d.zombieAlive} / ${d.zombieTotal}`)}
      {row('Zombies active', String(d.zombieActive))}
      <div className="debug__sep" />
      {row('Renderer', d.rendererType)}
      {row('Backend', d.backend)}
      {d.memoryMb > 0 && row('JS heap', `${d.memoryMb} MB`)}
    </div>
  );
});
