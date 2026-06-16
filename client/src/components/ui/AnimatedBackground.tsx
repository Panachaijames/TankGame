import React from 'react';
import { useSettings } from '../../state/SettingsContext';

/**
 * Lightweight, dependency-free animated menu backdrop: layered neon radials, a
 * drifting tactical grid, glowing blobs and a scan sweep. Collapses to a static
 * scene when reduce-motion is enabled. (Phase 8 may swap this for an idle
 * attract-mode scene rendered on the Pixi canvas.)
 */
export const AnimatedBackground: React.FC = () => {
  const { settings } = useSettings();
  const still = settings.reduceMotion;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(56,189,248,0.15),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_120%,rgba(168,85,247,0.12),transparent_55%)]" />

      <div
        className={`absolute inset-0 opacity-[0.15] ${still ? '' : 'animate-grid-pan'}`}
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.4) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      <div
        className={`absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl ${still ? '' : 'animate-float-slow'}`}
      />
      <div
        className={`absolute -right-24 bottom-1/4 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl ${still ? '' : 'animate-float-slower'}`}
      />

      {!still && (
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sky-400/5 to-transparent animate-scan" />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(2,6,23,0.85))]" />
    </div>
  );
};

export default AnimatedBackground;
