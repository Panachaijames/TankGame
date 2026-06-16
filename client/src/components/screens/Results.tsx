import React, { useMemo, useState } from 'react';
import type { MatchConfig } from '../../types';
import { useLeaderboard } from '../../state/LeaderboardContext';
import Button from '../ui/Button';
import Panel from '../ui/Panel';
import Stat from '../ui/Stat';

export interface MatchResult {
  score: number;
  maxCombo: number;
  difficulty: number;
}

interface ResultsProps {
  result: MatchResult;
  config: MatchConfig | null;
  onPlayAgain: () => void;
  onMenu: () => void;
}

const NAME_KEY = 'hypertank.lastName';

export const Results: React.FC<ResultsProps> = ({ result, config, onPlayAgain, onMenu }) => {
  const { addScore, isHighScore } = useLeaderboard();
  const qualifies = useMemo(() => isHighScore(result.score), [isHighScore, result.score]);

  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [savedRank, setSavedRank] = useState<number | null>(null);

  const mode = config?.session ?? 'solo';

  const save = () => {
    const trimmed = (name.trim() || 'PILOT').slice(0, 14).toUpperCase();
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      /* ignore */
    }
    const { rank } = addScore({
      name: trimmed,
      score: result.score,
      maxCombo: result.maxCombo,
      mode,
      difficulty: result.difficulty,
    });
    setSavedRank(rank);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center text-white animate-fade-in">
      <h1 className="mb-1 font-orbitron text-6xl font-black text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.4)]">
        MISSION FAILED
      </h1>
      <p className="mb-8 font-sans uppercase tracking-[0.3em] text-slate-400">
        Protocol terminated · data analyzed
      </p>

      <Panel className="w-full max-w-md p-8">
        <div className="mb-6 flex justify-center gap-12">
          <Stat label="Final Score" value={result.score.toLocaleString()} accent="text-sky-400" />
          <Stat label="Peak Combo" value={`x${result.maxCombo}`} accent="text-orange-400" />
        </div>

        {qualifies && savedRank === null ? (
          <div className="border-t border-slate-800 pt-6">
            <div className="mb-2 font-orbitron text-sm text-amber-400 animate-pulse">
              ★ NEW HIGH SCORE ★
            </div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                maxLength={14}
                placeholder="CALLSIGN"
                autoFocus
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center font-orbitron uppercase tracking-widest text-sky-300 outline-none focus:border-sky-500"
              />
              <Button onClick={save}>SAVE</Button>
            </div>
          </div>
        ) : savedRank !== null ? (
          <div className="border-t border-slate-800 pt-6 font-orbitron text-lg text-sky-400">
            RANKED #{savedRank}
          </div>
        ) : null}
      </Panel>

      <div className="mt-8 flex gap-3">
        <Button variant="secondary" onClick={onMenu}>
          MAIN MENU
        </Button>
        <Button size="lg" onClick={onPlayAgain}>
          PLAY AGAIN ▸
        </Button>
      </div>
    </div>
  );
};

export default Results;
