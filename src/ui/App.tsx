import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '../core/game';
import { GamePhase, type DebugSnapshot, type HudSnapshot } from '../state/types';
import { Hud } from './Hud';
import {
  DebugOverlay,
  LoadingScreen,
  MapSelectScreen,
  PauseScreen,
  StartScreen,
  type QualityChoice,
} from './Screens';
import { LoadoutScreen, ResultsScreen } from './LoadoutScreen';
import { SettingsScreen } from './SettingsScreen';
import { SettingsStore, type Settings } from '../settings/settings';
import { defaultLoadout, type Loadout } from '../inventory/loadout';
import type { MapId } from '../maps/mapTypes';

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

type Overlay = 'none' | 'mapselect' | 'loadout' | 'settings';

export function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const settingsRef = useRef<SettingsStore | null>(null);
  if (settingsRef.current === null) settingsRef.current = new SettingsStore();

  const [loading, setLoading] = useState(true);
  const [loadLabel, setLoadLabel] = useState('Booting');
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const [debug, setDebug] = useState<DebugSnapshot | null>(null);
  const [debugOn, setDebugOn] = useState(false);
  const [spreadPx, setSpreadPx] = useState(4);
  const [reloadProgress, setReloadProgress] = useState(0);
  const [settings, setSettings] = useState<Settings>(settingsRef.current.value);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [loadout, setLoadout] = useState<Loadout>(() => defaultLoadout());
  const [mapId, setMapId] = useState<MapId>(() => {
    const requested = new URLSearchParams(window.location.search).get('map');
    return requested === 'forest' || requested === 'city' ? requested : 'city';
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    setLoading(true);
    const store = settingsRef.current!;
    const game = new Game(canvas, {
      quality: store.value.graphics.quality,
      rendererPreference: 'auto',
      map: mapId,
    });
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

    const unsubSettings = store.subscribe((s) => {
      if (disposed) return;
      setSettings(s);
      game.setQuality(s.graphics.quality);
      game.input.sensitivityScale = s.controls.sensitivity;
      game.input.invertY = s.controls.invertY;
      game.audio.setLevels(s.audio.master, s.audio.effects, s.audio.ambience);
      game.applyWeatherPreference(s.graphics.weather);
      game.applyTimePreference(s.graphics.timeOfDay);
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
      unsubSettings();
      store.flush();
      game.dispose();
      gameRef.current = null;
      delete window.game;
    };
  }, [mapId]);

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

  const updateSettings = useCallback(
    (patch: Parameters<SettingsStore['update']>[0]) => {
      const store = settingsRef.current;
      if (!store) return;
      const next = store.update(patch);
      if (patch.graphics && 'fullscreen' in patch.graphics) {
        void window.desktop?.toggleFullscreen();
      }
      return next;
    },
    [],
  );

  const handleOpenMapSelect = useCallback(() => setOverlay('mapselect'), []);

  const handleSelectMap = useCallback(
    (id: MapId) => {
      setMapId(id);
      setOverlay('loadout');
    },
    [],
  );

  const handleDeploy = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.setLoadout(loadout);
    setOverlay('none');
    void game.audio.start();
    game.startNewRun();
  }, [loadout]);

  const handleResume = useCallback(() => {
    gameRef.current?.resume();
  }, []);
  const handleRestart = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.setLoadout(loadout);
    void game.audio.start();
    game.startNewRun();
  }, [loadout]);
  const handleMenu = useCallback(() => {
    gameRef.current?.returnToMenu();
    setOverlay('none');
  }, []);
  const handleExit = useCallback(() => {
    settingsRef.current?.flush();
    void window.desktop?.quit();
  }, []);
  const handleQuality = useCallback(
    (q: QualityChoice) => {
      updateSettings({ graphics: { quality: q } });
    },
    [updateSettings],
  );
  const handleResetSettings = useCallback(() => {
    settingsRef.current?.reset();
  }, []);

  const phase = snap?.phase ?? GamePhase.Loading;

  const [deathReady, setDeathReady] = useState(false);
  useEffect(() => {
    if (phase !== GamePhase.Dead) {
      setDeathReady(false);
      return;
    }
    const t = window.setTimeout(() => setDeathReady(true), 1100);
    return () => window.clearTimeout(t);
  }, [phase]);

  const playing = phase === GamePhase.Playing || phase === GamePhase.Paused;

  return (
    <div className="app">
      <canvas id="game-canvas" ref={canvasRef} tabIndex={-1} />

      {snap && playing && (
        <Hud snap={snap} spreadPx={spreadPx} reloadProgress={reloadProgress} />
      )}

      {phase === GamePhase.Dead && <div className="death-fade" />}

      {debugOn && debug && <DebugOverlay d={debug} />}

      {!loading && phase === GamePhase.Menu && overlay === 'none' && (
        <StartScreen
          onStart={handleOpenMapSelect}
          onSettings={() => setOverlay('settings')}
          onExit={handleExit}
        />
      )}

      {!loading && overlay === 'mapselect' && (
        <MapSelectScreen onSelect={handleSelectMap} onBack={() => setOverlay('none')} />
      )}

      {!loading && overlay === 'loadout' && (
        <LoadoutScreen
          loadout={loadout}
          onChange={setLoadout}
          onDeploy={handleDeploy}
          onBack={() => setOverlay('none')}
        />
      )}

      {!loading && overlay === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          onClose={() => setOverlay('none')}
          onReset={handleResetSettings}
        />
      )}

      {!loading && phase === GamePhase.Paused && overlay === 'none' && (
        <PauseScreen
          onResume={handleResume}
          onRestart={handleRestart}
          onQuit={handleMenu}
          onSettings={() => setOverlay('settings')}
          quality={settings.graphics.quality}
          onQuality={handleQuality}
        />
      )}

      {!loading && snap && phase === GamePhase.Dead && deathReady && (
        <ResultsScreen
          kills={snap.kills}
          survivedSeconds={snap.survivedSeconds}
          stats={gameRef.current?.matchStats ?? null}
          onRestart={handleRestart}
          onMenu={handleMenu}
        />
      )}

      {(loading || error) && (
        <LoadingScreen label={loadLabel} progress={loadProgress} error={error} />
      )}
    </div>
  );
}
