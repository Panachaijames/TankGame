import React, { useState } from 'react';
import { useShell } from '../../state/AppShellContext';
import type { MatchConfig, MatchMode, TankClass, MapId } from '../../types';
import { TANK_CLASSES, SHOTGUN } from '../../constants';
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

const MAPS: { id: MapId; label: string; desc: string; icon: string }[] = [
  { id: 'classic', label: 'ARENA', desc: 'Classic single-screen battlefield. Rotating biomes & weather.', icon: '🎯' },
  { id: 'forest', label: 'FOREST', desc: 'Huge forest world. Dense bushes to hide in — ambush ground for the shotgun.', icon: '🌲' },
];

const CLASS_LIST = Object.keys(TANK_CLASSES) as TankClass[];

export const MatchSetup: React.FC<MatchSetupProps> = ({ onLaunch }) => {
  const { shell, dispatch } = useShell();
  const base = shell.match;

  const [mode, setMode] = useState<MatchMode>(base?.mode ?? 'coop');
  const [difficulty, setDifficulty] = useState<number>(base?.options.startDifficulty ?? 1);
  const [classes, setClasses] = useState<TankClass[]>(
    () => base?.players.map((p) => p.tankClass) ?? ['assault'],
  );
  const [map, setMap] = useState<MapId>(base?.mapId ?? 'classic');

  if (!base) return null;

  const isMultiplayer = base.session !== 'solo';
  // The big follow-camera forest can only track one tank, so it's solo-only
  // (local-2P shares a single screen with two pilots).
  const forestAllowed = base.session === 'solo';
  const effectiveMap: MapId = forestAllowed ? map : 'classic';

  const pickClass = (slot: number, c: TankClass) =>
    setClasses((prev) => prev.map((x, i) => (i === slot ? c : x)));

  const launch = () => {
    const config: MatchConfig = {
      ...base,
      mode,
      mapId: effectiveMap,
      players: base.players.map((p, i) => ({ ...p, tankClass: classes[i] ?? p.tankClass })),
      options: { ...base.options, startDifficulty: difficulty },
    };
    onLaunch(config);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-white animate-fade-in">
      <h2 className="mb-2 font-orbitron text-4xl font-bold text-sky-400">DEPLOYMENT</h2>
      <p className="mb-6 font-sans capitalize text-slate-400">
        {base.session === 'solo' ? 'Solo survival' : base.session.replace('2p', ' 2P')}
      </p>

      <Panel className="max-h-[70vh] w-full max-w-2xl overflow-y-auto p-8">
        {/* Tank class picker (one row per player) */}
        <div className="mb-8">
          <div className="mb-3 font-orbitron text-sm uppercase tracking-widest text-slate-400">
            Tank Class
          </div>
          <div className="space-y-4">
            {base.players.map((p, slot) => (
              <div key={p.id}>
                {base.players.length > 1 && (
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CLASS_LIST.map((c) => {
                    const cls = TANK_CLASSES[c];
                    const selected = classes[slot] === c;
                    const dmgLabel = cls.weapon === 'shotgun' ? `${cls.damage}×${SHOTGUN.pellets}` : `${cls.damage}`;
                    return (
                      <button
                        key={c}
                        onClick={() => pickClass(slot, c)}
                        className={`rounded-xl border p-3 text-left transition ${
                          selected
                            ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_18px_rgba(56,189,248,0.2)]'
                            : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                        }`}
                      >
                        <div className="font-orbitron text-sm font-bold" style={{ color: cls.accent }}>
                          {cls.label}
                        </div>
                        <div className="mt-1 mb-2 text-[10px] leading-tight text-slate-400">{cls.desc}</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-orbitron text-[10px] text-slate-300">
                          <span>DMG {dmgLabel}</span>
                          <span>RoF {(1000 / cls.fireRate).toFixed(1)}/s</span>
                          <span>MAG {cls.maxAmmo}</span>
                          <span>HP {cls.health}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Battlefield / map picker */}
        <div className="mb-8">
          <div className="mb-3 font-orbitron text-sm uppercase tracking-widest text-slate-400">
            Battlefield
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MAPS.map((m) => {
              const disabled = m.id === 'forest' && !forestAllowed;
              const selected = effectiveMap === m.id;
              return (
                <button
                  key={m.id}
                  disabled={disabled}
                  onClick={() => !disabled && setMap(m.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    disabled
                      ? 'cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50'
                      : selected
                        ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_18px_rgba(56,189,248,0.2)]'
                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                  }`}
                >
                  <div className="font-orbitron text-sm font-bold text-white">
                    {m.icon} {m.label}
                    {disabled ? ' · SOLO ONLY' : ''}
                  </div>
                  <div className="mt-1 text-[10px] leading-tight text-slate-400">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {isMultiplayer && (
          <div className="mb-8">
            <div className="mb-3 font-orbitron text-sm uppercase tracking-widest text-slate-400">
              Match Type
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['coop', 'versus'] as MatchMode[]).map((m) => {
                const disabled = m === 'versus'; // Versus arrives in Phase 7
                return (
                  <button
                    key={m}
                    disabled={disabled}
                    onClick={() => !disabled && setMode(m)}
                    className={`rounded-xl border p-4 text-left transition ${
                      disabled
                        ? 'cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50'
                        : mode === m
                          ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_18px_rgba(56,189,248,0.2)]'
                          : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                    }`}
                  >
                    <div className="font-orbitron font-bold text-white">
                      {m === 'coop' ? 'CO-OP' : 'VERSUS'}
                      {disabled ? ' · SOON' : ''}
                    </div>
                    <div className="text-xs text-slate-400">
                      {m === 'coop' ? 'Team up vs AI' : 'Fight each other'}
                    </div>
                  </button>
                );
              })}
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

      <div className="mt-6 flex gap-3">
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
