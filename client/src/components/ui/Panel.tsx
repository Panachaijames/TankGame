import React from 'react';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

/** Glassmorphism surface used across menus, the HUD and overlays. */
export const Panel: React.FC<PanelProps> = ({ glow, className = '', children, ...rest }) => (
  <div
    className={`rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] ${glow ? 'ring-1 ring-sky-500/20' : ''} ${className}`}
    {...rest}
  >
    {children}
  </div>
);

export default Panel;
