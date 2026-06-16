
import React from 'react';
import { GameState } from '../types';

interface HUDProps {
  state: GameState;
}

const HUD: React.FC<HUDProps> = ({ state }) => {
  const isHighCombo = state.combo >= 10;
  const isLowAmmo = state.ammo <= 10 && !state.isCooldown;
  const nextSwarm = 10 - (state.combo % 10);
  
  return (
    <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none z-50 font-orbitron text-white">
      <div className="max-w-[1000px] mx-auto flex items-stretch gap-3 h-16">
        
        {/* Module 1: Score & Combo */}
        <div className="flex-1 bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase leading-none mb-1">Score</span>
            <span className="text-xl font-bold text-sky-400 leading-none">{state.score.toLocaleString()}</span>
          </div>
          <div className="h-8 w-[1px] bg-slate-700/50"></div>
          <div className={`flex flex-col transition-all duration-300 ${isHighCombo ? 'scale-110' : ''}`}>
            <span className="text-[10px] text-slate-400 uppercase leading-none mb-1">Combo</span>
            <span className={`text-xl font-bold leading-none ${isHighCombo ? 'text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]' : 'text-orange-500'}`}>
              x{state.combo}
            </span>
          </div>
        </div>

        {/* Module 2: Ammo & Swarm */}
        <div className="flex-[1.2] bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-slate-400 uppercase">Ammo</span>
              <span className={`text-[10px] font-bold ${state.isCooldown ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                {state.isCooldown ? 'RELOADING' : `${state.ammo}/${state.maxAmmo}`}
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
              <div 
                className={`h-full transition-all duration-300 ${state.isCooldown ? 'bg-red-500' : (isLowAmmo ? 'bg-amber-500' : 'bg-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.5)]')}`}
                style={{ width: `${(state.ammo / state.maxAmmo) * 100}%` }}
              />
            </div>
          </div>
          <div className="h-8 w-[1px] bg-slate-700/50"></div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400 uppercase mb-1">Swarm</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-300 ${nextSwarm === 1 ? 'bg-amber-500/20 border-amber-500 animate-pulse' : 'bg-slate-800 border-slate-700'}`}>
              <span className={`text-sm font-bold ${nextSwarm === 1 ? 'text-amber-400' : 'text-slate-300'}`}>{nextSwarm}</span>
            </div>
          </div>
        </div>

        {/* Module 3: Specials (Nuke & Strike) */}
        <div className="flex-[1.5] bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          {/* Nuke Charge */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className={`text-[9px] font-bold tracking-tighter ${state.nukeReady ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`}>
                {state.nukeReady ? 'NUKE READY [Q]' : 'NUKE'}
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${state.nukeReady ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-slate-600'}`}
                style={{ width: `${state.nukeProgress}%` }}
              />
            </div>
          </div>
          
          {/* Air Strike Charge */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className={`text-[9px] font-bold tracking-tighter ${state.bomberReady ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`}>
                {state.bomberReady ? 'STRIKE READY [F]' : 'STRIKE'}
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${state.bomberReady ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]' : 'bg-slate-600'}`}
                style={{ width: `${state.bomberProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Module 4: Level */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-xl px-4 flex flex-col justify-center items-center shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <span className="text-[10px] text-slate-500 uppercase leading-none mb-1">Level</span>
          <span className="text-xl font-bold text-white leading-none">{state.difficulty}</span>
        </div>

      </div>
    </div>
  );
};

export default HUD;
