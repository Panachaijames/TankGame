import React, { useState } from 'react';
import { useShell } from '../../state/AppShellContext';
import { useNet } from '../../state/NetContext';
import { createOnlineMatchConfig } from '../../state/matchConfig';
import type { TankClass, MatchMode } from '../../types';
import { TANK_CLASSES } from '../../constants';
import Button from '../ui/Button';
import Panel from '../ui/Panel';

const CLASS_LIST = Object.keys(TANK_CLASSES) as TankClass[];
const NAME_KEY = 'hypertank.lastName';

export const Lobby: React.FC = () => {
  const { dispatch } = useShell();
  const { net, hostRoom, joinRoom, setSelfClass, startMatch, leave } = useNet();

  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');
  const [cls, setCls] = useState<TankClass>('assault');
  const [mode, setMode] = useState<MatchMode>('versus'); // battle-royale by default

  const persistName = (n: string) => {
    setName(n);
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
  };
  const callsign = () => (name.trim() || 'PILOT').slice(0, 14);

  const back = () => {
    leave();
    dispatch({ type: 'navigate', screen: 'modeSelect' });
  };

  const ClassRow: React.FC<{ value: TankClass; onPick: (c: TankClass) => void }> = ({ value, onPick }) => (
    <div className="grid grid-cols-3 gap-2">
      {CLASS_LIST.map((c) => {
        const tc = TANK_CLASSES[c];
        const sel = value === c;
        return (
          <button
            key={c}
            onClick={() => onPick(c)}
            className={`rounded-lg border px-2 py-2 text-center transition ${
              sel ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
            }`}
          >
            <span className="font-orbitron text-xs font-bold" style={{ color: tc.accent }}>
              {tc.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ── Idle: create or join ────────────────────────────────────────────────
  if (net.phase === 'idle' || net.phase === 'error') {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-white animate-fade-in">
        <h2 className="mb-2 font-orbitron text-4xl font-bold text-sky-400">ONLINE</h2>
        <p className="mb-6 font-sans text-slate-400">Battle royale or co-op over the net · the host picks the mode.</p>

        {net.phase === 'error' && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {net.error}
          </div>
        )}

        <Panel className="w-full max-w-md space-y-5 p-8">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-widest text-slate-400">Callsign</span>
            <input
              value={name}
              onChange={(e) => persistName(e.target.value)}
              maxLength={14}
              placeholder="PILOT"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-orbitron uppercase tracking-widest text-sky-300 outline-none focus:border-sky-500"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs uppercase tracking-widest text-slate-400">Tank Class</span>
            <ClassRow value={cls} onPick={setCls} />
          </div>

          <Button fullWidth onClick={() => hostRoom(callsign(), cls)}>
            CREATE ROOM
          </Button>

          <div className="flex items-center gap-3 text-xs text-slate-600">
            <div className="h-px flex-1 bg-slate-700" /> OR <div className="h-px flex-1 bg-slate-700" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ROOM CODE"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center font-orbitron tracking-[0.3em] text-sky-300 outline-none focus:border-sky-500"
            />
            <Button variant="secondary" disabled={!code.trim()} onClick={() => joinRoom(code, callsign(), cls)}>
              JOIN
            </Button>
          </div>
        </Panel>

        <div className="mt-8">
          <Button variant="ghost" onClick={back}>
            ← BACK
          </Button>
        </div>
      </div>
    );
  }

  // ── Connecting ────────────────────────────────────────────────────────────
  if (net.phase === 'connecting') {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white animate-fade-in">
        <div className="font-orbitron text-2xl text-sky-400 animate-pulse">CONNECTING…</div>
        <button className="mt-6 text-sm text-slate-500 hover:text-slate-300" onClick={back}>
          cancel
        </button>
      </div>
    );
  }

  // ── Lobby (connected) ───────────────────────────────────────────────────
  const isHost = net.role === 'host';
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-white animate-fade-in">
      <h2 className="mb-1 font-orbitron text-3xl font-bold text-sky-400">LOBBY</h2>
      <button
        onClick={() => navigator.clipboard?.writeText(net.roomCode)}
        title="Copy"
        className="mb-6 font-orbitron text-5xl font-black tracking-[0.4em] text-white hover:text-sky-300"
      >
        {net.roomCode}
      </button>
      <p className="mb-4 -mt-3 text-xs uppercase tracking-widest text-slate-500">Share this code · click to copy</p>

      <Panel className="w-full max-w-md p-6">
        <div className="mb-2 text-xs uppercase tracking-widest text-slate-400">
          Pilots ({net.players.length})
        </div>
        <div className="space-y-2">
          {net.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: TANK_CLASSES[p.tankClass]?.accent || '#38bdf8' }}
                />
                <span className="font-orbitron text-sm uppercase">{p.name}</span>
                {p.isHost && <span className="rounded bg-sky-500/20 px-1.5 text-[9px] text-sky-300">HOST</span>}
                {p.id === net.selfId && <span className="text-[9px] text-slate-500">(you)</span>}
              </div>
              <span className="font-orbitron text-[10px]" style={{ color: TANK_CLASSES[p.tankClass]?.accent }}>
                {TANK_CLASSES[p.tankClass]?.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <span className="mb-1 block text-xs uppercase tracking-widest text-slate-400">Change your class</span>
          <ClassRow value={cls} onPick={(c) => { setCls(c); setSelfClass(c); }} />
        </div>

        {isHost && (
          <div className="mt-5">
            <span className="mb-1 block text-xs uppercase tracking-widest text-slate-400">Game mode</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['versus', 'VERSUS', 'Battle royale · last tank standing', false],
                  ['coop', 'CO-OP', 'Team vs AI — online soon', true],
                ] as const
              ).map(([m, label, desc, disabled]) => (
                <button
                  key={m}
                  disabled={disabled}
                  onClick={() => !disabled && setMode(m)}
                  className={`rounded-lg border p-2 text-left transition ${
                    disabled
                      ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-50'
                      : mode === m
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                  }`}
                >
                  <div className="font-orbitron text-xs font-bold text-white">
                    {label}
                    {disabled && <span className="ml-1 text-[8px] text-amber-400">SOON</span>}
                  </div>
                  <div className="text-[10px] leading-tight text-slate-400">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {!isHost && (
          <p className="mt-4 text-center text-[11px] uppercase tracking-widest text-slate-500">
            Host picks the mode
          </p>
        )}
      </Panel>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="ghost" onClick={back}>
          ← LEAVE
        </Button>
        {isHost ? (
          <Button size="lg" onClick={() => startMatch(createOnlineMatchConfig(net.players, mode))}>
            START ▸
          </Button>
        ) : (
          <span className="font-orbitron text-sm text-slate-400">Waiting for host…</span>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-600">
        {mode === 'versus' ? 'Versus · huge map · last tank standing' : 'Co-op vs AI'} · the host runs the match · {net.players.length}/{5} pilots.
      </p>
    </div>
  );
};

export default Lobby;
