import React, { useState, useCallback, useRef, useEffect } from 'react';
import Battlefield from './components/Battlefield';
import HUD from './components/HUD';
import TopMenuBar from './components/game/TopMenuBar';
import MainMenu from './components/screens/MainMenu';
import ModeSelect from './components/screens/ModeSelect';
import MatchSetup from './components/screens/MatchSetup';
import Results, { type MatchResult } from './components/screens/Results';
import Settings from './components/overlays/Settings';
import HowToPlay from './components/overlays/HowToPlay';
import Leaderboard from './components/overlays/Leaderboard';
import PauseMenu from './components/overlays/PauseMenu';
import AnimatedBackground from './components/ui/AnimatedBackground';
import { type GameState, type MatchConfig, WeatherType, TerrainType } from './types';
import { audioService } from './services/audioService';
import { SettingsProvider } from './state/SettingsContext';
import { LeaderboardProvider } from './state/LeaderboardContext';
import { AppShellProvider, useShell } from './state/AppShellContext';

const freshGameState = (difficulty: number): GameState => ({
  score: 0,
  difficulty,
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
  status: 'playing',
});

const GameRoot: React.FC = () => {
  const { shell, dispatch } = useShell();
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
      setGameId((g) => g + 1);
      setGameState(freshGameState(config.options.startDifficulty));
      dispatch({ type: 'startMatch', match: config });
    },
    [dispatch],
  );

  const handleGameOver = useCallback(
    (finalScore: number, finalMaxCombo: number) => {
      setLastResult({
        score: finalScore,
        maxCombo: finalMaxCombo,
        difficulty: gsRef.current.difficulty,
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
    if (shell.match) launch(shell.match);
  }, [shell.match, launch]);

  const quitToMenu = useCallback(() => {
    audioService.stop();
    setGameState((prev) => ({ ...prev, status: 'menu' }));
    dispatch({ type: 'quitToMenu' });
  }, [dispatch]);

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
      {shell.screen === 'matchSetup' && <MatchSetup onLaunch={launch} />}
      {shell.screen === 'results' && (
        <Results result={lastResult} config={shell.match} onPlayAgain={restart} onMenu={quitToMenu} />
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
          />
          <HUD state={gameState} />
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
        <GameRoot />
      </AppShellProvider>
    </LeaderboardProvider>
  </SettingsProvider>
);

export default App;
