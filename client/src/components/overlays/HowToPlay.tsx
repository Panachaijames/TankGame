import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Tabs from '../ui/Tabs';
import KeyCap from '../ui/KeyCap';

interface HowToPlayProps {
  onClose: () => void;
}

export const HowToPlay: React.FC<HowToPlayProps> = ({ onClose }) => {
  const [tab, setTab] = useState('controls');

  return (
    <Modal open onClose={onClose} title="HOW TO PLAY" size="lg">
      <Tabs
        tabs={[
          { id: 'controls', label: 'CONTROLS' },
          { id: 'mechanics', label: 'MECHANICS' },
          { id: 'modes', label: 'MODES' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'controls' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { k: <KeyCap>W A S D</KeyCap>, t: 'Drive the chassis (forward / reverse / rotate)' },
            { k: <KeyCap>MOUSE</KeyCap>, t: 'Aim the turret at the cursor' },
            { k: <KeyCap>CLICK</KeyCap>, t: 'Fire the main cannon' },
            { k: <KeyCap>R</KeyCap>, t: 'Manually reload the magazine' },
            { k: <KeyCap>Q</KeyCap>, t: 'Detonate NUKE when charged (15 kills)' },
            { k: <KeyCap>F</KeyCap>, t: 'Call AIR STRIKE when charged (10 kills)' },
            { k: <KeyCap>ESC</KeyCap>, t: 'Pause the match' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-800/40 p-3">
              <div className="w-28 shrink-0">{row.k}</div>
              <div className="text-sm text-slate-300">{row.t}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'mechanics' && (
        <ul className="space-y-3 text-sm text-slate-300">
          <li>
            <span className="font-bold text-amber-400">COMBO WINDOW:</span> chain kills within 3
            seconds to keep your combo climbing.
          </li>
          <li>
            <span className="font-bold text-sky-400">4-UNIT STRIKE:</span> every 10th combo
            auto-launches a homing missile swarm.
          </li>
          <li>
            <span className="font-bold text-green-400">REPAIR DROPS:</span> a repair pod drops every
            10 kills — drive over it to heal.
          </li>
          <li>
            <span className="font-bold text-sky-400">ENERGY REGEN:</span> stop firing for ~2s to
            slowly regenerate ammo, or tap{' '}
            <KeyCap>R</KeyCap> to reload instantly.
          </li>
          <li>
            <span className="font-bold text-orange-400">DEFLECTION:</span> your rounds and specials
            shoot down incoming enemy fire.
          </li>
          <li>
            <span className="font-bold text-indigo-400">WEATHER &amp; TERRAIN:</span> rain, fog,
            sandstorm and snow change traction and enemy vision.
          </li>
          <li>
            <span className="font-bold text-purple-400">BOSSES:</span> heavy units arrive as your
            score climbs — they unleash radial barrages.
          </li>
        </ul>
      )}

      {tab === 'modes' && (
        <div className="space-y-4 text-sm text-slate-300">
          <div className="rounded-lg bg-slate-800/40 p-4">
            <div className="font-orbitron font-bold text-sky-400">SOLO</div>
            <p>Endless survival against escalating AI. Climb the leaderboard.</p>
          </div>
          <div className="rounded-lg bg-slate-800/40 p-4">
            <div className="font-orbitron font-bold text-green-400">CO-OP (Phase 5/6)</div>
            <p>Team up — local or online — against the AI. Revive downed allies, share the score.</p>
          </div>
          <div className="rounded-lg bg-slate-800/40 p-4">
            <div className="font-orbitron font-bold text-orange-400">VERSUS (Phase 7)</div>
            <p>Fight other pilots. Last tank standing, frag count, or score race.</p>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default HowToPlay;
