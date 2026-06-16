import React, { useState } from 'react';
import { useSettings } from '../../state/SettingsContext';
import type { GraphicsQuality } from '../../types';
import Modal from '../ui/Modal';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import Tabs from '../ui/Tabs';
import KeyCap from '../ui/KeyCap';
import Button from '../ui/Button';

interface SettingsProps {
  onClose: () => void;
}

const QUALITIES: { id: GraphicsQuality; label: string }[] = [
  { id: 'low', label: 'LOW' },
  { id: 'medium', label: 'MEDIUM' },
  { id: 'high', label: 'HIGH' },
];

const CONTROLS: { keys: string[]; action: string }[] = [
  { keys: ['W', 'A', 'S', 'D'], action: 'Drive chassis' },
  { keys: ['MOUSE'], action: 'Aim turret' },
  { keys: ['CLICK'], action: 'Fire' },
  { keys: ['R'], action: 'Reload' },
  { keys: ['Q'], action: 'Nuke (when charged)' },
  { keys: ['F'], action: 'Air strike (when charged)' },
  { keys: ['ESC'], action: 'Pause' },
];

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const { settings, setSetting, resetSettings } = useSettings();
  const [tab, setTab] = useState('audio');

  return (
    <Modal
      open
      onClose={onClose}
      title="SETTINGS"
      footer={
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={resetSettings}>
            RESET DEFAULTS
          </Button>
          <Button size="sm" onClick={onClose}>
            DONE
          </Button>
        </div>
      }
    >
      <Tabs
        tabs={[
          { id: 'audio', label: 'AUDIO' },
          { id: 'video', label: 'VIDEO' },
          { id: 'controls', label: 'CONTROLS' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'audio' && (
        <div className="space-y-5">
          <Toggle
            label="Mute all"
            checked={settings.muted}
            onChange={(v) => setSetting('muted', v)}
          />
          <Slider
            label="Master volume"
            value={settings.masterVolume}
            onChange={(v) => setSetting('masterVolume', v)}
            disabled={settings.muted}
          />
          <Slider
            label="Music"
            value={settings.musicVolume}
            onChange={(v) => setSetting('musicVolume', v)}
            disabled={settings.muted}
          />
          <Slider
            label="Sound effects"
            value={settings.sfxVolume}
            onChange={(v) => setSetting('sfxVolume', v)}
            disabled={settings.muted}
          />
        </div>
      )}

      {tab === 'video' && (
        <div className="space-y-6">
          <div>
            <div className="mb-2 text-sm text-slate-300">Graphics quality</div>
            <div className="grid grid-cols-3 gap-2">
              {QUALITIES.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setSetting('graphicsQuality', q.id)}
                  className={`rounded-lg border px-3 py-2 font-orbitron text-sm font-bold transition ${
                    settings.graphicsQuality === q.id
                      ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Controls bloom, particle density and resolution (applies once the WebGL renderer
              lands in Phase 4).
            </p>
          </div>
          <Toggle
            label="Screen shake"
            description="Camera kick on hits and explosions"
            checked={settings.screenShake}
            onChange={(v) => setSetting('screenShake', v)}
          />
          <Toggle
            label="Reduce motion"
            description="Minimise UI animations and background effects"
            checked={settings.reduceMotion}
            onChange={(v) => setSetting('reduceMotion', v)}
          />
        </div>
      )}

      {tab === 'controls' && (
        <div className="space-y-2">
          {CONTROLS.map((c) => (
            <div
              key={c.action}
              className="flex items-center justify-between border-b border-slate-800/60 py-2"
            >
              <span className="text-slate-300">{c.action}</span>
              <span className="flex gap-1">
                {c.keys.map((k) => (
                  <KeyCap key={k}>{k}</KeyCap>
                ))}
              </span>
            </div>
          ))}
          <p className="pt-3 text-xs text-slate-500">Custom key rebinding arrives with local 2P (Phase 5).</p>
        </div>
      )}
    </Modal>
  );
};

export default Settings;
