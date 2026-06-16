import React, { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}

/** Centered modal with backdrop blur + Esc-to-close. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer, size = 'md' }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className={`relative w-full ${size === 'lg' ? 'max-w-3xl' : 'max-w-xl'} animate-scale-in rounded-3xl border-2 border-slate-700 bg-slate-900/95 text-white shadow-[0_0_60px_rgba(0,0,0,0.6)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-8 py-5">
          <h2 className="font-orbitron text-2xl font-bold text-sky-400">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto px-8 py-6 font-sans">{children}</div>
        {footer && <div className="border-t border-slate-800 px-8 py-4">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
