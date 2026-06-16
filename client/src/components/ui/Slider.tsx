import React from 'react';

interface SliderProps {
  label: string;
  value: number; // 0..1
  onChange: (v: number) => void;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({ label, value, onChange, disabled }) => (
  <label className={`block ${disabled ? 'opacity-50' : ''}`}>
    <div className="mb-1 flex justify-between text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="font-orbitron text-sky-400">{Math.round(value * 100)}%</span>
    </div>
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full cursor-pointer accent-sky-500"
    />
  </label>
);

export default Slider;
