import React, { createContext, useContext, useRef, useState, useCallback, useMemo } from 'react';
import type { TankClass, MatchConfig } from '../types';
import type { PlayerInput } from '@hypertank/shared';
import type { WorldSnapshot, GameOverResult } from '../components/Battlefield';
import { NetSession, type NetRole, type NetMsg } from '../net/connection';
import { serializeSnapshot } from '../net/serialize';
import type { TimedSnap } from '../net/interpolate';

export interface LobbyPlayer {
  id: string;
  name: string;
  tankClass: TankClass;
  isHost: boolean;
}

type Phase = 'idle' | 'connecting' | 'lobby' | 'error';

export const MAX_PLAYERS = 5; // host + 4 (fits the 1000x700 arena without a follow-camera)

interface NetState {
  phase: Phase;
  role: NetRole;
  roomCode: string;
  selfId: string;
  players: LobbyPlayer[];
  error: string;
}

const INITIAL: NetState = {
  phase: 'idle',
  role: 'host',
  roomCode: '',
  selfId: '',
  players: [],
  error: '',
};

/** What the Battlefield engine uses to talk to the network. */
export interface NetAdapter {
  sendInput: (input: PlayerInput) => void; // client → host
  getRemoteInputs: () => Record<string, PlayerInput>; // host reads
  broadcastSnapshot: (s: WorldSnapshot) => void; // host → clients
  getSnapshot: () => unknown | null; // client reads latest wire snapshot
  getSnapshotBuffer: () => TimedSnap[]; // client reads timed buffer for interpolation
  broadcastGameOver: (r: GameOverResult) => void; // host → clients (round end)
  getGameOver: () => GameOverResult | null; // client reads received result
  getConnectedIds: () => string[]; // host: ids still connected (self + live peers)
}

interface NetContextValue {
  net: NetState;
  sessionRef: React.MutableRefObject<NetSession | null>;
  netAdapter: NetAdapter;
  hostRoom: (name: string, tankClass: TankClass) => Promise<void>;
  joinRoom: (code: string, name: string, tankClass: TankClass) => Promise<void>;
  setSelfClass: (c: TankClass) => void;
  startMatch: (config: MatchConfig) => void;
  registerOnStart: (cb: (config: MatchConfig, localId: string, isHost: boolean) => void) => void;
  leave: () => void;
}

const NetContext = createContext<NetContextValue | null>(null);

export const NetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sessionRef = useRef<NetSession | null>(null);
  const rosterRef = useRef<LobbyPlayer[]>([]);
  const remoteInputsRef = useRef<Record<string, PlayerInput>>({});
  const snapshotRef = useRef<unknown | null>(null);
  const snapshotBufferRef = useRef<TimedSnap[]>([]);
  const gameOverRef = useRef<GameOverResult | null>(null);
  const onStartRef = useRef<((config: MatchConfig, localId: string, isHost: boolean) => void) | null>(null);
  const [net, setNet] = useState<NetState>(INITIAL);

  const publishRoster = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.role !== 'host') return;
    const liveIds = new Set([s.selfId, ...s.peerIds()]);
    rosterRef.current = rosterRef.current.filter((p) => liveIds.has(p.id));
    const players = [...rosterRef.current];
    setNet((n) => ({ ...n, players }));
    s.broadcast({ t: 'roster', players });
  }, []);

  const hostRoom = useCallback(
    async (name: string, tankClass: TankClass) => {
      setNet({ ...INITIAL, phase: 'connecting', role: 'host' });
      const s = new NetSession();
      sessionRef.current = s;
      s.onFatal = (msg) => setNet((n) => ({ ...n, phase: 'error', error: `Connection lost (${msg}).` }));
      s.onMessage = (fromId, msg) => {
        if (msg.t === 'hello') {
          const existing = rosterRef.current.find((p) => p.id === fromId);
          if (!existing && rosterRef.current.length >= MAX_PLAYERS) {
            s.send(fromId, { t: 'full' });
            return;
          }
          const player: LobbyPlayer = {
            id: fromId,
            name: String(msg.name || 'Pilot'),
            tankClass: (msg.tankClass as TankClass) || 'assault',
            isHost: false,
          };
          if (existing) Object.assign(existing, player);
          else rosterRef.current.push(player);
          publishRoster();
        } else if (msg.t === 'input') {
          remoteInputsRef.current[fromId] = msg.input as PlayerInput;
        }
      };
      s.onPeersChanged = () => publishRoster();
      try {
        const code = await s.host();
        rosterRef.current = [{ id: s.selfId, name, tankClass, isHost: true }];
        setNet({ phase: 'lobby', role: 'host', roomCode: code, selfId: s.selfId, players: [...rosterRef.current], error: '' });
      } catch (e) {
        setNet((n) => ({ ...n, phase: 'error', error: e instanceof Error ? e.message : 'Failed to host.' }));
      }
    },
    [publishRoster],
  );

  const joinRoom = useCallback(async (code: string, name: string, tankClass: TankClass) => {
    setNet({ ...INITIAL, phase: 'connecting', role: 'client' });
    const s = new NetSession();
    sessionRef.current = s;
    s.onFatal = (msg) => setNet((n) => ({ ...n, phase: 'error', error: `Connection lost (${msg}).` }));
    s.onMessage = (_fromId, msg) => {
      if (msg.t === 'roster') {
        setNet((n) => ({ ...n, players: (msg.players as LobbyPlayer[]) || [] }));
      } else if (msg.t === 'full') {
        setNet((n) => ({ ...n, phase: 'error', error: 'That room is full (max 5 pilots).' }));
        sessionRef.current?.close();
      } else if (msg.t === 'snapshot') {
        snapshotRef.current = msg.s;
        const buf = snapshotBufferRef.current;
        buf.push({ t: performance.now(), s: msg.s });
        if (buf.length > 24) buf.shift();
      } else if (msg.t === 'start') {
        onStartRef.current?.(msg.config as MatchConfig, sessionRef.current!.selfId, false);
      } else if (msg.t === 'gameover') {
        gameOverRef.current = msg.r as GameOverResult;
      }
    };
    try {
      await s.join(code);
      setNet({ phase: 'lobby', role: 'client', roomCode: code.toUpperCase(), selfId: s.selfId, players: [], error: '' });
      s.sendToHost({ t: 'hello', name, tankClass });
    } catch (e) {
      setNet((n) => ({ ...n, phase: 'error', error: e instanceof Error ? e.message : 'Failed to join.' }));
    }
  }, []);

  const setSelfClass = useCallback(
    (c: TankClass) => {
      const s = sessionRef.current;
      if (!s) return;
      if (s.role === 'host') {
        const self = rosterRef.current.find((p) => p.id === s.selfId);
        if (self) self.tankClass = c;
        publishRoster();
      } else {
        const self = net.players.find((p) => p.id === s.selfId);
        s.sendToHost({ t: 'hello', name: self?.name || 'Pilot', tankClass: c });
      }
    },
    [publishRoster, net.players],
  );

  const startMatch = useCallback((config: MatchConfig) => {
    const s = sessionRef.current;
    if (!s) return;
    remoteInputsRef.current = {};
    snapshotRef.current = null;
    gameOverRef.current = null;
    snapshotBufferRef.current = [];
    s.broadcast({ t: 'start', config });
    onStartRef.current?.(config, s.selfId, true);
  }, []);

  const registerOnStart = useCallback(
    (cb: (config: MatchConfig, localId: string, isHost: boolean) => void) => {
      onStartRef.current = cb;
    },
    [],
  );

  const netAdapter = useMemo<NetAdapter>(
    () => ({
      sendInput: (input) => sessionRef.current?.sendToHost({ t: 'input', input }),
      getRemoteInputs: () => remoteInputsRef.current,
      broadcastSnapshot: (s) => sessionRef.current?.broadcast({ t: 'snapshot', s: serializeSnapshot(s) }),
      getSnapshot: () => snapshotRef.current,
      getSnapshotBuffer: () => snapshotBufferRef.current,
      broadcastGameOver: (r) => sessionRef.current?.broadcast({ t: 'gameover', r }),
      getGameOver: () => gameOverRef.current,
      getConnectedIds: () => {
        const s = sessionRef.current;
        return s ? [s.selfId, ...s.peerIds()] : [];
      },
    }),
    [],
  );

  const leave = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    rosterRef.current = [];
    remoteInputsRef.current = {};
    snapshotRef.current = null;
    snapshotBufferRef.current = [];
    gameOverRef.current = null;
    setNet(INITIAL);
  }, []);

  const value = useMemo<NetContextValue>(
    () => ({ net, sessionRef, netAdapter, hostRoom, joinRoom, setSelfClass, startMatch, registerOnStart, leave }),
    [net, netAdapter, hostRoom, joinRoom, setSelfClass, startMatch, registerOnStart, leave],
  );

  return <NetContext.Provider value={value}>{children}</NetContext.Provider>;
};

export function useNet(): NetContextValue {
  const ctx = useContext(NetContext);
  if (!ctx) throw new Error('useNet must be used within <NetProvider>');
  return ctx;
}

export type { NetMsg };
