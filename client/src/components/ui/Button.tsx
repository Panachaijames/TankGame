import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-sky-600 hover:bg-sky-500 text-white shadow-[0_0_22px_rgba(2,132,199,0.35)]',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700',
  ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700/60',
  danger: 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_22px_rgba(220,38,38,0.35)]',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg',
  md: 'px-6 py-3 text-base rounded-xl',
  lg: 'px-10 py-4 text-xl rounded-2xl',
};

/** Primary button — carries the signature neon shine-sweep harvested from the original menu. */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}) => (
  <button
    className={`group relative overflow-hidden font-orbitron font-bold tracking-wide transition-all duration-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    {...rest}
  >
    <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
  </button>
);

export default Button;
