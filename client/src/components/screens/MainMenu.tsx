import React from 'react';
import { useShell } from '../../state/AppShellContext';
import Button from '../ui/Button';

export const MainMenu: React.FC = () => {
  const { dispatch } = useShell();

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center text-white animate-fade-in">
      <div className="mb-2 font-orbitron text-xs tracking-[0.5em] text-sky-500/80">
        TACTICAL BATTLEFIELD
      </div>
      <h1 className="mb-3 bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-500 bg-clip-text font-orbitron text-7xl font-black text-transparent drop-shadow-[0_0_40px_rgba(56,189,248,0.4)] sm:text-8xl">
        HYPERTANK
      </h1>
      <p className="mb-10 max-w-md font-sans text-slate-400">
        Dominate the digital battlefield. Master tactical synergy and survive the escalating
        protocols.
      </p>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" fullWidth onClick={() => dispatch({ type: 'navigate', screen: 'modeSelect' })}>
          PLAY
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => dispatch({ type: 'openOverlay', overlay: 'howToPlay' })}>
            HOW TO PLAY
          </Button>
          <Button variant="secondary" onClick={() => dispatch({ type: 'openOverlay', overlay: 'leaderboard' })}>
            RANKINGS
          </Button>
        </div>
        <Button variant="ghost" onClick={() => dispatch({ type: 'openOverlay', overlay: 'settings' })}>
          SETTINGS
        </Button>
      </div>

      <div className="absolute bottom-5 font-orbitron text-[10px] tracking-widest text-slate-600">
        v0.2 · HYPERTANK ENGINE
      </div>
    </div>
  );
};

export default MainMenu;
