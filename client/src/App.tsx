import React, { useState, useCallback, useRef, useEffect } from 'react';
import Battlefield from './components/Battlefield';
import HUD from './components/HUD';
import TopMenuBar from './components/game/TopMenuBar';
import MainMenu from './components/screens/MainMenu';
import ModeSelect from './components/screens/ModeSelect';
import MatchSetup from './components/screens/MatchSetup';
import Lobby from './components/screens/Lobby';
import Results, { type MatchResult } from './components/screens/Results';
import Settings from './components/overlays/Settings';
import HowToPlay from './components/overlays/HowToPlay';
import Leaderboard from './components/overlays/Leaderboard';
import PauseMenu from './components/overlays/PauseMenu';
import AnimatedBackground from './components/ui/AnimatedBackground';
import { type GameState, type MatchConfig, WeatherType, TerrainType } from './types';
import { audioService } from './services/audioService';
import { SettingsProvider, useSettings } from './state/SettingsContext';
import { LeaderboardProvider } from './state/LeaderboardContext';
import { AppShellProvider, useShell } from './state/AppShellContext';
import { NetProvider, useNet } from './state/NetContext';
import { createOnlineMatchConfig } from './state/matchConfig';

const freshGameState = (difficulty: number): GameState => ({
  score: 0,
  difficulty,
  health: 100,
  maxHealth: 100,
  weather: WeatherType.Clear,
  terrain: TerrainType.Grassland,
  combo: 0,
  maxCombo: 0,
  nukeReady: false,
  nukeProgress: 0,
  bomberReady: false,
  bomberProgress: 0,
  ammo: 35,
  maxAmmo: 35,
  missiles: 0,
  isCooldown: false,
  cooldownRemaining: 0,
  energy: 0,
  maxEnergy: 100,
  ultReady: false,
  ultName: '',
  status: 'playing',
});

const GameRoot: React.FC = () => {
  const { shell, dispatch } = useShell();
  const { settings } = useSettings();
  const { netAdapter, registerOnStart, leave: netLeave, startMatch: netStartMatch, net } = useNet();
  const [online, setOnline] = useState({ active: false, isHost: false, localId: '' });
  const [gameId, setGameId] = useState(0);
  const [gameState, setGameState] = useState<GameState>(() => ({
    ...freshGameState(1),
    status: 'menu',
  }));
  const [lastResult, setLastResult] = useState<MatchResult>({ score: 0, maxCombo: 0, difficulty: 1 });

  // Latest game state, readable from callbacks without stale closures.
  const gsRef = useRef(gameState);
  gsRef.current = gameState;

  const launch = useCallback(
    async (config: MatchConfig) => {
      await audioService.init();
      setOnline({ active: false, isHost: false, localId: '' });
      setGameId((g) => g + 1);
      setGameState(freshGameState(config.options.startDifficulty));
      dispatch({ type: 'startMatch', match: config });
    },
    [dispatch],
  );

  // Online: when the host starts (or a client receives 'start'), launch the match.
  useEffect(() => {
    registerOnStart((config, localId, isHost) => {
      audioService.init();
      setOnline({ active: true, isHost, localId });
      setGameId((g) => g + 1);
      setGameState(freshGameState(config.options.startDifficulty));
      dispatch({ type: 'startMatch', match: config });
    });
  }, [registerOnStart, dispatch]);

  const handleGameOver = useCallback(
    (finalScore: number, finalMaxCombo: number, outcome?: 'victory' | 'defeat' | 'draw') => {
      setLastResult({
        score: finalScore,
        maxCombo: finalMaxCombo,
        difficulty: gsRef.current.difficulty,
        outcome,
      });
      setGameState((prev) => ({
        ...prev,
        status: 'gameover',
        score: finalScore,
        maxCombo: finalMaxCombo,
      }));
      audioService.stop();
      dispatch({ type: 'endMatch' });
    },
    [dispatch],
  );

  const updateStateFromGame = useCallback((updates: Partial<GameState>) => {
    setGameState((prev) => ({ ...prev, ...updates }));
  }, []);

  const togglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev.status === 'playing') {
        audioService.pause();
        return { ...prev, status: 'paused' };
      }
      if (prev.status === 'paused') {
        audioService.resume();
        return { ...prev, status: 'playing' };
      }
      return prev;
    });
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: 'closeOverlay' });
    setGameState((prev) => {
      if (prev.status !== 'paused') return prev;
      audioService.resume();
      return { ...prev, status: 'playing' };
    });
  }, [dispatch]);

  const restart = useCallback(() => {
    // Online host: re-broadcast a fresh start so every connected pilot rematches
    // (the offline launch() path would drop the connection + run a broken solo).
    if (online.active) {
      if (online.isHost) {
        netStartMatch(createOnlineMatchConfig(net.players, shell.match?.mode ?? 'versus'));
      }
      // Non-host clients can't force a rematch; they wait for the host (PLAY AGAIN hidden).
      return;
    }
    if (shell.match) launch(shell.match);
  }, [online, netStartMatch, net.players, shell.match, launch]);

  const quitToMenu = useCallback(() => {
    audioService.stop();
    netLeave();
    setOnline({ active: false, isHost: false, localId: '' });
    setGameState((prev) => ({ ...prev, status: 'menu' }));
    dispatch({ type: 'quitToMenu' });
  }, [dispatch, netLeave]);

  // Esc toggles pause while playing; overlays handle their own Esc (capture phase).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (shell.screen !== 'playing' || shell.overlay !== null) return;
      togglePause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shell.screen, shell.overlay, togglePause]);

  const playing = shell.screen === 'playing';
  const closeOverlay = () => dispatch({ type: 'closeOverlay' });

  return (
    <div className="relative h-screen w-screen select-none overflow-hidden bg-slate-950 text-white">
      {!playing && <AnimatedBackground />}

      {/* Primary screens */}
      {shell.screen === 'mainMenu' && <MainMenu />}
      {shell.screen === 'modeSelect' && <ModeSelect />}
      {shell.screen === 'lobby' && <Lobby />}
      {shell.screen === 'matchSetup' && <MatchSetup onLaunch={launch} />}
      {shell.screen === 'results' && (
        <Results result={lastResult} config={shell.match} onPlayAgain={restart} onMenu={quitToMenu} hidePlayAgain={online.active && !online.isHost} />
      )}

      {/* Live match */}
      {playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Battlefield
            key={gameId}
            onGameOver={handleGameOver}
            onStateUpdate={updateStateFromGame}
            difficulty={gameState.difficulty}
            status={gameState.status}
            graphicsQuality={settings.graphicsQuality}
            playerConfigs={shell.match?.players ?? []}
            online={online.active}
            isHost={online.isHost}
            localPlayerId={online.localId}
            net={netAdapter}
            directControls={settings.movementMode === 'direct'}
            matchMode={shell.match?.mode ?? 'coop'}
          />
          <HUD state={gameState} versus={shell.match?.mode === 'versus'} />
          <TopMenuBar config={shell.match} onPause={togglePause} />
          {gameState.status === 'paused' && shell.overlay === null && (
            <PauseMenu
              onResume={resume}
              onRestart={restart}
              onSettings={() => dispatch({ type: 'openOverlay', overlay: 'settings' })}
              onQuit={quitToMenu}
            />
          )}
        </div>
      )}

      {/* Modal overlays — render above everything, reachable from menu or pause */}
      {shell.overlay === 'settings' && <Settings onClose={closeOverlay} />}
      {shell.overlay === 'howToPlay' && <HowToPlay onClose={closeOverlay} />}
      {shell.overlay === 'leaderboard' && <Leaderboard onClose={closeOverlay} />}
    </div>
  );
};

const App: React.FC = () => (
  <SettingsProvider>
    <LeaderboardProvider>
      <AppShellProvider>
        <NetProvider>
          <GameRoot />
        </NetProvider>
      </AppShellProvider>
    </LeaderboardProvider>
  </SettingsProvider>
);

export default App;
