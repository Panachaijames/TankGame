import React from 'react';

export const KeyCap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-slate-600 bg-slate-800 px-2 py-1 font-orbitron text-xs font-bold text-sky-300 shadow-[0_2px_0_rgba(0,0,0,0.5)]">
    {children}
  </kbd>
);

export default KeyCap;
