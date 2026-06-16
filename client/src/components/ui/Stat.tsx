import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  accent?: string; // tailwind text-color class
}

export const Stat: React.FC<StatProps> = ({ label, value, accent = 'text-sky-400' }) => (
  <div className="text-center">
    <div className="text-xs uppercase tracking-widest text-slate-400">{label}</div>
    <div className={`font-orbitron text-4xl font-bold ${accent}`}>{value}</div>
  </div>
);

export default Stat;
