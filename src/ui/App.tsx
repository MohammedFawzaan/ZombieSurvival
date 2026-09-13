import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '../core/game';
import { GamePhase, type DebugSnapshot, type HudSnapshot } from '../state/types';
import { Hud } from './Hud';
import {
  DeathScreen,
  DebugOverlay,
  LoadingScreen,
  PauseScreen,
  StartScreen,
  type QualityChoice,
} from './Screens';

declare global {
  interface Window {
    desktop?: {
      quit(): Promise<void>;
      toggleFullscreen(): Promise<boolean>;
      getInfo(): Promise<{ version: string; electron: string; chrome: string; platform: string }>;
    };
    game?: Game;
  }
}

export function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadLabel, setLoadLabel] = useState('Booting');
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const [debug, setDebug] = useState<DebugSnapshot | null>(null);
  const [debugOn, setDebugOn] = useState(false);
  const [spreadPx, setSpreadPx] = useState(4);
  const [reloadProgress, setReloadProgress] = useState(0);
  const [quality, setQuality] = useState<QualityChoice>('medium');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    const game = new Game(canvas, { quality: 'medium', rendererPreference: 'auto' });
    gameRef.current = game;
    window.game = game;

    game.onLoadProgress = (label, pct) => {
      if (disposed) return;
      setLoadLabel(label);
      setLoadProgress(pct);
    };

    const unsubState = game.state.subscribe((s) => {
      if (!disposed) setSnap(s);
    });
    const unsubDebug = game.subscribeDebug((d) => {
      if (!disposed) setDebug(d);
    });

    game
      .init()
      .then(() => {
        if (disposed) return;
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[game] init failed', err);
        if (disposed) return;
        const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
        setError(msg);
      });

    return () => {
      disposed = true;
      unsubState();
      unsubDebug();
      game.dispose();
      gameRef.current = null;
      delete window.game;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const game = gameRef.current;
      if (!game) return;
      setDebugOn(game.debugEnabled);
      const w = game.weaponsPublic;
      if (w) {
        setSpreadPx(2 + w.currentSpread * 620);
        setReloadProgress(w.reloadProgress);
      }
    }, 60);
    return () => window.clearInterval(id);
  }, []);

  const handleStart = useCallback(() => {
    gameRef.current?.startNewRun();
  }, []);
  const handleResume = useCallback(() => {
    gameRef.current?.resume();
  }, []);
  const handleRestart = useCallback(() => {
    gameRef.current?.startNewRun();
  }, []);
  const handleQuit = useCallback(() => {
    void window.desktop?.quit();
  }, []);
  const handleQuality = useCallback((q: QualityChoice) => {
    gameRef.current?.setQuality(q);
    setQuality(q);
  }, []);

  const phase = snap?.phase ?? GamePhase.Loading;

  // Let the death collapse play before the screen covers it.
  const [deathReady, setDeathReady] = useState(false);
  useEffect(() => {
    if (phase !== GamePhase.Dead) {
      setDeathReady(false);
      return;
    }
    const t = window.setTimeout(() => setDeathReady(true), 1100);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <div className="app">
      <canvas id="game-canvas" ref={canvasRef} tabIndex={-1} />

      {snap && phase === GamePhase.Playing && (
        <Hud snap={snap} spreadPx={spreadPx} reloadProgress={reloadProgress} />
      )}
      {snap && phase === GamePhase.Paused && (
        <Hud snap={snap} spreadPx={spreadPx} reloadProgress={reloadProgress} />
      )}

      {debugOn && debug && <DebugOverlay d={debug} />}

      {!loading && phase === GamePhase.Menu && <StartScreen onStart={handleStart} />}
      {!loading && phase === GamePhase.Paused && (
        <PauseScreen
          onResume={handleResume}
          onRestart={handleRestart}
          onQuit={handleQuit}
          quality={quality}
          onQuality={handleQuality}
        />
      )}
      {!loading && snap && phase === GamePhase.Dead && deathReady && (
        <DeathScreen snap={snap} onRestart={handleRestart} />
      )}

      {(loading || error) && (
        <LoadingScreen label={loadLabel} progress={loadProgress} error={error} />
      )}
    </div>
  );
}
