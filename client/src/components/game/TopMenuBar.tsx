import React from 'react';
import { useSettings } from '../../state/SettingsContext';
import type { MatchConfig } from '../../types';

interface TopMenuBarProps {
  config: MatchConfig | null;
  onPause: () => void;
}

const MODE_LABEL: Record<string, string> = {
  solo: 'SOLO',
  local2p: 'LOCAL 2P',
  online: 'ONLINE',
};

/**
 * The in-game menu bar. Unlike the HUD (which is pointer-events-none so clicks
 * reach the canvas), this is an interactive sibling pinned top-right.
 */
export const TopMenuBar: React.FC<TopMenuBarProps> = ({ config, onPause }) => {
  const { settings, setSetting } = useSettings();

  // The session chip is only useful in multiplayer (it would otherwise overlap
  // the HUD's Level module in solo, where the mode is obvious).
  const showChip = !!config && config.session !== 'solo';
  const sessionLabel = config ? MODE_LABEL[config.session] ?? 'SOLO' : 'SOLO';
  const modeLabel = config && config.session !== 'solo' ? ` · ${config.mode.toUpperCase()}` : '';

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-[60] flex items-center gap-2 font-orbitron">
      {showChip && (
        <div className="hidden items-center rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2 text-[10px] uppercase tracking-widest text-slate-400 backdrop-blur-xl sm:flex">
          {sessionLabel}
          {modeLabel}
        </div>
      )}

      <button
        onClick={() => setSetting('muted', !settings.muted)}
        aria-label={settings.muted ? 'Unmute' : 'Mute'}
        className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2 text-slate-300 backdrop-blur-xl transition hover:bg-slate-800 hover:text-white"
      >
        {settings.muted ? '🔇' : '🔊'}
      </button>

      <button
        onClick={onPause}
        aria-label="Pause"
        className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2 text-slate-300 backdrop-blur-xl transition hover:bg-slate-800 hover:text-white"
      >
        ❚❚
      </button>
    </div>
  );
};

export default TopMenuBar;
