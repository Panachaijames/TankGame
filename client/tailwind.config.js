/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['Orbitron', 'ui-sans-serif', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // HyperTank neon-tactical design tokens (mirrors in-canvas palette)
        player: '#38bdf8',
        boss: '#a855f7',
        health: '#22c55e',
        warn: '#fbbf24',
        danger: '#ef4444',
        // per-slot player colors for local/online multiplayer HUD + tanks
        p1: '#38bdf8',
        p2: '#fbbf24',
        p3: '#22c55e',
        p4: '#a855f7',
      },
      boxShadow: {
        neon: '0 0 20px rgba(56, 189, 248, 0.45)',
      },
      keyframes: {
        'grid-pan': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '50px 50px' },
        },
        'float-slow': {
          '0%,100%': { transform: 'translate(0,0)' },
          '50%': { transform: 'translate(40px,-30px)' },
        },
        'float-slower': {
          '0%,100%': { transform: 'translate(0,0)' },
          '50%': { transform: 'translate(-30px,40px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1200%)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'grid-pan': 'grid-pan 4s linear infinite',
        'float-slow': 'float-slow 14s ease-in-out infinite',
        'float-slower': 'float-slower 20s ease-in-out infinite',
        scan: 'scan 8s linear infinite',
        'fade-in': 'fade-in 0.2s ease',
        'scale-in': 'scale-in 0.25s ease',
      },
    },
  },
  plugins: [],
};
