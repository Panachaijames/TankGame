import React from 'react';
import { useLeaderboard } from '../../state/LeaderboardContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface LeaderboardProps {
  onClose: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export const Leaderboard: React.FC<LeaderboardProps> = ({ onClose }) => {
  const { topN, clear, scores } = useLeaderboard();
  const top = topN(10);

  return (
    <Modal
      open
      onClose={onClose}
      title="RANKINGS"
      footer={
        scores.length > 0 ? (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clear}>
              CLEAR
            </Button>
          </div>
        ) : undefined
      }
    >
      {top.length === 0 ? (
        <div className="py-10 text-center font-sans text-slate-500">
          No records yet. Deploy and set the standard.
        </div>
      ) : (
        <table className="w-full border-collapse font-sans text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left font-orbitron text-[10px] uppercase tracking-widest text-slate-500">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Pilot</th>
              <th className="py-2 pr-2 text-right">Score</th>
              <th className="py-2 pr-2 text-right">Combo</th>
              <th className="py-2 text-right">Mode</th>
            </tr>
          </thead>
          <tbody>
            {top.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-2 font-orbitron text-slate-400">
                  {MEDALS[i] ?? i + 1}
                </td>
                <td className="py-2 pr-2 font-orbitron uppercase text-sky-300">{s.name}</td>
                <td className="py-2 pr-2 text-right font-bold text-white">
                  {s.score.toLocaleString()}
                </td>
                <td className="py-2 pr-2 text-right text-orange-400">x{s.maxCombo}</td>
                <td className="py-2 text-right text-[11px] uppercase text-slate-500">{s.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
};

export default Leaderboard;
