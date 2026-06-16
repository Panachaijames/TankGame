import React from 'react';
import Button from '../ui/Button';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onRestart, onSettings, onQuit }) => (
  <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/75 backdrop-blur-md animate-fade-in">
    <div className="w-full max-w-xs animate-scale-in text-center text-white">
      <h2 className="mb-8 font-orbitron text-5xl font-bold text-sky-400 drop-shadow-[0_0_25px_rgba(56,189,248,0.4)]">
        PAUSED
      </h2>
      <div className="flex flex-col gap-3">
        <Button size="lg" fullWidth onClick={onResume}>
          RESUME
        </Button>
        <Button variant="secondary" fullWidth onClick={onRestart}>
          RESTART
        </Button>
        <Button variant="secondary" fullWidth onClick={onSettings}>
          SETTINGS
        </Button>
        <Button variant="danger" fullWidth onClick={onQuit}>
          QUIT TO MENU
        </Button>
      </div>
    </div>
  </div>
);

export default PauseMenu;
