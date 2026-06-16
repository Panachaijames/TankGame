import * as Tone from 'tone';

interface AudioSettings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
}

class AudioService {
  private initialized = false;
  private synths: Record<string, any> = {};
  private bgmSequence: Tone.Sequence | null = null;

  // Mixer buses: every SFX -> sfxBus, BGM -> musicBus, both -> masterBus -> out.
  private masterBus: Tone.Gain | null = null;
  private musicBus: Tone.Gain | null = null;
  private sfxBus: Tone.Gain | null = null;

  // Settings applied even before Tone is initialised (re-applied on init()).
  private current: AudioSettings = {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    muted: false,
  };

  async init() {
    if (this.initialized) {
      // Already initialised — just ensure transport is running for a restart.
      this.restartBGM();
      return;
    }

    await Tone.start();

    // ── Mixer buses ──────────────────────────────────────────────────────
    this.masterBus = new Tone.Gain(this.current.muted ? 0 : this.current.masterVolume).toDestination();
    this.musicBus = new Tone.Gain(this.current.musicVolume).connect(this.masterBus);
    this.sfxBus = new Tone.Gain(this.current.sfxVolume).connect(this.masterBus);

    // ── SFX synths (all routed through the SFX bus) ──────────────────────
    this.synths.shoot = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
    }).connect(this.sfxBus);

    this.synths.explosion = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 7,
      oscillator: { type: 'sine' },
    }).connect(this.sfxBus);

    this.synths.combo = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
    }).connect(this.sfxBus);

    this.synths.nuke = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.1, decay: 4, sustain: 0 },
    }).connect(this.sfxBus);

    this.synths.notification = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 },
    }).connect(this.sfxBus);

    this.synths.repair = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 },
    }).connect(this.sfxBus);

    this.synths.hit = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
    }).connect(this.sfxBus);

    // Reusable missile-launch noise (was previously allocated per shot and leaked).
    this.synths.missile = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0 },
    }).connect(this.sfxBus);

    // ── BGM (driving techno bassline) routed through the music bus ───────
    const bgmSynth = new Tone.FMSynth({
      modulationIndex: 12,
      harmonicity: 2,
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.5 },
    }).connect(this.musicBus);

    this.bgmSequence = new Tone.Sequence(
      (time, note) => {
        bgmSynth.triggerAttackRelease(note, '8n', time);
      },
      ['C2', 'C2', 'Eb2', 'C2', 'F2', 'F2', 'G2', 'Bb1'],
      '4n',
    );

    this.bgmSequence.start(0);
    Tone.getTransport().bpm.value = 125;
    Tone.getTransport().start();

    this.initialized = true;
  }

  private restartBGM() {
    try {
      Tone.getTransport().cancel();
      if (this.bgmSequence) this.bgmSequence.start(0);
      Tone.getTransport().start();
    } catch (e) {
      console.warn('BGM restart failed', e);
    }
  }

  /** Apply mixer settings. Safe to call before init() — values are re-applied then. */
  applySettings(s: AudioSettings) {
    this.current = { ...s };
    if (!this.initialized) return;
    try {
      this.masterBus?.gain.rampTo(s.muted ? 0 : s.masterVolume, 0.08);
      this.musicBus?.gain.rampTo(s.musicVolume, 0.08);
      this.sfxBus?.gain.rampTo(s.sfxVolume, 0.08);
    } catch (e) {
      console.warn('applySettings failed', e);
    }
  }

  /** Pause the music transport (used by the in-game pause overlay). */
  pause() {
    if (!this.initialized) return;
    try {
      Tone.getTransport().pause();
    } catch (e) {
      console.warn('pause failed', e);
    }
  }

  resume() {
    if (!this.initialized) return;
    try {
      Tone.getTransport().start();
    } catch (e) {
      console.warn('resume failed', e);
    }
  }

  playShoot(isHighPower: boolean) {
    if (!this.initialized) return;
    try {
      this.synths.shoot.triggerAttackRelease(isHighPower ? 'G3' : 'C4', '32n');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playCombo(count: number) {
    if (!this.initialized) return;
    try {
      const baseFreq = 440;
      const freq = baseFreq * Math.pow(2, Math.min(count / 15, 2));
      this.synths.combo.triggerAttackRelease(freq, '16n');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playExplosion() {
    if (!this.initialized) return;
    try {
      this.synths.explosion.triggerAttackRelease('C2', '8n');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playHit() {
    if (!this.initialized) return;
    try {
      this.synths.hit.triggerAttackRelease('16n');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playNuke() {
    if (!this.initialized) return;
    try {
      this.synths.nuke.triggerAttack();
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playNotification() {
    if (!this.initialized) return;
    try {
      this.synths.notification.triggerAttackRelease('C6', '16n');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playRepair() {
    if (!this.initialized) return;
    try {
      this.synths.repair.triggerAttackRelease('C5', '8n');
      this.synths.repair.triggerAttackRelease('E5', '8n', '+0.1');
      this.synths.repair.triggerAttackRelease('G5', '4n', '+0.2');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  playMissileLaunch() {
    if (!this.initialized) return;
    try {
      this.synths.missile.triggerAttackRelease('16n');
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  updateDifficulty(level: number) {
    if (!this.initialized) return;
    const validLevel = Math.max(1, level || 1);
    const multiplier = Math.min(1 + (validLevel - 1) * 0.05, 2.5);
    const targetBpm = 125 * multiplier;
    try {
      Tone.getTransport().bpm.rampTo(targetBpm, 1);
    } catch (e) {
      console.error('BPM update failed', e);
    }
  }

  stop() {
    if (this.initialized) {
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
    }
  }
}

export const audioService = new AudioService();
