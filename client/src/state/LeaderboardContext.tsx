import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import type { ScoreEntry } from '../types';

const STORAGE_KEY = 'hypertank.scores.v1';
const MAX_ENTRIES = 50;
const HIGH_SCORE_RANK = 10; // top-N counts as a "high score"

function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScoreEntry[];
  } catch {
    return [];
  }
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

interface LeaderboardContextValue {
  scores: ScoreEntry[];
  addScore: (entry: Omit<ScoreEntry, 'id' | 'date'>) => { rank: number; isHighScore: boolean };
  topN: (n: number, filterMode?: ScoreEntry['mode']) => ScoreEntry[];
  isHighScore: (score: number) => boolean;
  clear: () => void;
}

const LeaderboardContext = createContext<LeaderboardContextValue | null>(null);

export const LeaderboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    } catch {
      /* ignore */
    }
  }, [scores]);

  const isHighScore = useCallback(
    (score: number) => {
      if (scores.length < HIGH_SCORE_RANK) return true;
      const sorted = [...scores].sort((a, b) => b.score - a.score);
      return score > (sorted[HIGH_SCORE_RANK - 1]?.score ?? 0);
    },
    [scores],
  );

  const addScore = useCallback<LeaderboardContextValue['addScore']>((entry) => {
    const full: ScoreEntry = { ...entry, id: makeId(), date: new Date().toISOString() };
    let rank = 1;
    setScores((prev) => {
      const next = [...prev, full].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
      rank = next.findIndex((s) => s.id === full.id) + 1;
      return next;
    });
    // rank computed inside the updater; recompute deterministically for the return value
    const projected = [...scores, full].sort((a, b) => b.score - a.score);
    const computedRank = projected.findIndex((s) => s.id === full.id) + 1;
    return { rank: computedRank, isHighScore: computedRank <= HIGH_SCORE_RANK };
  }, [scores]);

  const topN = useCallback<LeaderboardContextValue['topN']>(
    (n, filterMode) => {
      const filtered = filterMode ? scores.filter((s) => s.mode === filterMode) : scores;
      return [...filtered].sort((a, b) => b.score - a.score).slice(0, n);
    },
    [scores],
  );

  const clear = useCallback(() => setScores([]), []);

  const value = useMemo(
    () => ({ scores, addScore, topN, isHighScore, clear }),
    [scores, addScore, topN, isHighScore, clear],
  );

  return <LeaderboardContext.Provider value={value}>{children}</LeaderboardContext.Provider>;
};

export function useLeaderboard(): LeaderboardContextValue {
  const ctx = useContext(LeaderboardContext);
  if (!ctx) throw new Error('useLeaderboard must be used within <LeaderboardProvider>');
  return ctx;
}
