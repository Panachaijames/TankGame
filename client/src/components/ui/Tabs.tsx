import React from 'react';

interface TabsProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange }) => (
  <div className="mb-6 flex gap-1 rounded-xl border border-slate-800 bg-slate-950/50 p-1" role="tablist">
    {tabs.map((t) => (
      <button
        key={t.id}
        role="tab"
        aria-selected={active === t.id}
        onClick={() => onChange(t.id)}
        className={`flex-1 rounded-lg px-4 py-2 font-orbitron text-sm font-bold transition ${
          active === t.id
            ? 'bg-sky-600 text-white shadow-[0_0_15px_rgba(2,132,199,0.4)]'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

export default Tabs;
