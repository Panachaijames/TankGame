import React, { useState } from 'react';
import { useShell } from '../../state/AppShellContext';
import type { MatchConfig, MatchMode } from '../../types';
import Button from '../ui/Button';
import Panel from '../ui/Panel';

interface MatchSetupProps {
  onLaunch: (config: MatchConfig) => void;
}

const DIFFICULTIES = [
  { value: 1, label: 'RECRUIT', desc: 'Standard escalation' },
  { value: 3, label: 'VETERAN', desc: 'Faster, tougher waves' },
  { value: 5, label: 'ELITE', desc: 'Brutal from the start' },
];

export const MatchSetup: React.FC<MatchSetupProps> = ({ onLaunch }) => {
  const { shell, dispatch } = useShell();
  const base = shell.match;

  const [mode, setMode] = useState<MatchMode>(base?.mode ?? 'coop');
  const [difficulty, setDifficulty] = useState<number>(base?.options.startDifficulty ?? 1);

  if (!base) {
    // Shouldn't happen — guard so TS is happy and we degrade gracefully.
    return null;
  }

  const isMultiplayer = base.session !== 'solo';

  const launch = () => {
    const config: MatchConfig = {
      ...base,
      mode,
      options: { ...base.options, startDifficulty: difficulty },
    };
    onLaunch(config);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-white animate-fade-in">
      <h2 className="mb-2 font-orbitron text-4xl font-bold text-sky-400">DEPLOYMENT</h2>
      <p className="mb-8 font-sans capitalize text-slate-400">
        {base.session === 'solo' ? 'Solo survival' : base.session.replace('2p', ' 2P')}
      </p>

      <Panel className="w-full max-w-lg p-8">
        {isMultiplayer && (
          <div className="mb-8">
            <div className="mb-3 font-orbitron text-sm uppercase tracking-widest text-slate-400">
              Match Type
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['coop', 'versus'] as MatchMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-xl border p-4 text-left transition ${
                    mode === m
                      ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_18px_rgba(56,189,248,0.2)]'
                      : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                  }`}
                >
                  <div className="font-orbitron font-bold text-white">
                    {m === 'coop' ? 'CO-OP' : 'VERSUS'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {m === 'coop' ? 'Team up vs AI' : 'Fight each other'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 font-orbitron text-sm uppercase tracking-widest text-slate-400">
            Difficulty
          </div>
          <div className="grid grid-cols-3 gap-3">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`rounded-xl border p-3 text-center transition ${
                  difficulty === d.value
                    ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_18px_rgba(56,189,248,0.2)]'
                    : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                }`}
              >
                <div className="font-orbitron text-sm font-bold text-white">{d.label}</div>
                <div className="mt-1 text-[10px] leading-tight text-slate-400">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={() => dispatch({ type: 'navigate', screen: 'modeSelect' })}>
          ← BACK
        </Button>
        <Button size="lg" onClick={launch}>
          DEPLOY ▸
        </Button>
      </div>
    </div>
  );
};

export default MatchSetup;
