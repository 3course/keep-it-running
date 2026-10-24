// The phone, heard: an old-style double ring synthesised with WebAudio (no sound files).
// Two tones with a fast tremolo, gated by the ring cadence, panned toward the office and quieter
// the further away you are. One cadence drives both the sound and the on-screen pointer's pulse.

const PERIOD = 3.0; // s: ring-ring … pause

/** 0..1: is the phone sounding right now? Shared by the sound and the pointer pulse. */
export function ringOn(t: number): boolean {
  const p = t % PERIOD;
  return p < 0.4 || (p >= 0.6 && p < 1.0);
}

const MUTE_KEY = 'kir-muted';

export class RingSound {
  private ctx: AudioContext | null = null;
  private gate: GainNode | null = null;
  private level: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }
  }

  /** Browsers only allow audio after a user gesture: call from the first tap or key press. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const mix = ctx.createGain(); mix.gain.value = 0.18;
    for (const f of [400, 450]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(mix); o.start(); }
    // tremolo: 20 Hz wobble on the amplitude, like a bell striker
    const trem = ctx.createGain(); trem.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 20;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(trem.gain); lfo.start();
    this.gate = ctx.createGain(); this.gate.gain.value = 0;
    this.level = ctx.createGain(); this.level.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    mix.connect(trem).connect(this.gate).connect(this.level).connect(this.pan).connect(ctx.destination);
    this.ctx = ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage blocked */ }
  }

  /** Call every frame. pan: -1 left .. 1 right. volume: 0..1. */
  update(ringing: boolean, t: number, pan: number, volume: number) {
    if (!this.ctx || !this.gate || !this.level || !this.pan) return;
    const now = this.ctx.currentTime;
    const on = ringing && !this.muted && ringOn(t);
    this.gate.gain.setTargetAtTime(on ? 1 : 0, now, 0.012);
    this.level.gain.setTargetAtTime(ringing && !this.muted ? volume : 0, now, 0.05);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.05);
  }

  /** For tests: what's playing. */
  get state() {
    return { ctx: this.ctx?.state ?? 'none', muted: this.muted, gate: this.gate?.gain.value ?? 0, level: this.level?.gain.value ?? 0, pan: this.pan?.pan.value ?? 0 };
  }
}
