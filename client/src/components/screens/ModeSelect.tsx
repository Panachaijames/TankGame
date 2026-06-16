import React from 'react';
import { useShell } from '../../state/AppShellContext';
import { createMatchConfig } from '../../state/matchConfig';
import type { SessionKind } from '../../types';
import Button from '../ui/Button';

interface SessionOption {
  kind: SessionKind;
  title: string;
  blurb: string;
  icon: string;
  enabled: boolean;
  note?: string;
}

const OPTIONS: SessionOption[] = [
  {
    kind: 'solo',
    title: 'SOLO',
    blurb: 'Survive the escalating AI onslaught alone. Endless waves, bosses, weather.',
    icon: '🎯',
    enabled: true,
  },
  {
    kind: 'local2p',
    title: 'LOCAL 2P',
    blurb: 'Two pilots, one screen. Co-op on a shared keyboard (P2: arrow keys) or a gamepad.',
    icon: '🎮',
    enabled: true,
  },
  {
    kind: 'online',
    title: 'ONLINE',
    blurb: 'Battle friends over the net with room codes. Co-op and versus.',
    icon: '🌐',
    enabled: false,
    note: 'PHASE 6',
  },
];

export const ModeSelect: React.FC = () => {
  const { dispatch } = useShell();

  const pick = (kind: SessionKind) => {
    const config = createMatchConfig(kind, 'coop');
    dispatch({ type: 'setMatch', match: config });
    dispatch({ type: 'navigate', screen: 'matchSetup' });
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-white animate-fade-in">
      <h2 className="mb-2 font-orbitron text-4xl font-bold text-sky-400">SELECT MODE</h2>
      <p className="mb-10 font-sans text-slate-400">Choose how you deploy.</p>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            disabled={!o.enabled}
            onClick={() => o.enabled && pick(o.kind)}
            className={`group relative flex flex-col items-start rounded-2xl border p-6 text-left transition-all duration-300 ${
              o.enabled
                ? 'cursor-pointer border-slate-700 bg-slate-900/60 backdrop-blur-xl hover:-translate-y-1 hover:border-sky-500 hover:shadow-[0_0_30px_rgba(56,189,248,0.25)]'
                : 'cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-60'
            }`}
          >
            {o.note && (
              <span className="absolute right-4 top-4 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-orbitron text-[9px] tracking-widest text-amber-400">
                {o.note}
              </span>
            )}
            <div className="mb-3 text-4xl">{o.icon}</div>
            <div className="mb-2 font-orbitron text-2xl font-bold text-white">{o.title}</div>
            <div className="font-sans text-sm text-slate-400">{o.blurb}</div>
          </button>
        ))}
      </div>

      <div className="mt-10">
        <Button variant="ghost" onClick={() => dispatch({ type: 'navigate', screen: 'mainMenu' })}>
          ← BACK
        </Button>
      </div>
    </div>
  );
};

export default ModeSelect;
