import { memo } from 'react';
import type { DebugSnapshot, HudSnapshot } from '../state/types';

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
    &nbsp;·&nbsp; <kbd>1</kbd>/<kbd>2</kbd>/<kbd>Q</kbd> weapons
    <br />
    <kbd>Esc</kbd> pause &nbsp;·&nbsp; <kbd>F3</kbd> debug overlay
  </div>
);

export const StartScreen = memo(function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen overlay--interactive">
      <h1 className="screen__title">Zombie Survival</h1>
      <p className="screen__subtitle">Core Prototype</p>
      <button className="btn" onClick={onStart} autoFocus>
        Enter the forest
      </button>
      {CONTROLS}
    </div>
  );
});

export type QualityChoice = 'low' | 'medium' | 'high';

export const PauseScreen = memo(function PauseScreen({
  onResume,
  onRestart,
  onQuit,
  quality,
  onQuality,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
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
        <button className="btn btn--ghost" onClick={onQuit}>
          Quit
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

export const DeathScreen = memo(function DeathScreen({
  snap,
  onRestart,
}: {
  snap: HudSnapshot;
  onRestart: () => void;
}) {
  const minutes = Math.floor(snap.survivedSeconds / 60);
  const seconds = Math.floor(snap.survivedSeconds % 60);
  return (
    <div className="screen screen--death overlay--interactive">
      <h1 className="screen__title">You Died</h1>
      <p className="screen__subtitle">The forest keeps what it takes</p>
      <div className="screen__summary">
        <div className="summary-item">
          <span className="summary-item__value">{snap.kills}</span>
          <span className="summary-item__label">Zombies killed</span>
        </div>
        <div className="summary-item">
          <span className="summary-item__value">
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="summary-item__label">Time survived</span>
        </div>
      </div>
      <button className="btn" onClick={onRestart} autoFocus>
        Restart
      </button>
      <div className="screen__hint">
        Aim for the head — headshots do triple damage. Sprinting is loud; crouching is quiet.
      </div>
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
