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

export type CueKind = 'knock' | 'beeper' | 'buzz' | 'crunch';

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

  /**
   * A one-off cue for a rare event (synthesised, no sound files), panned toward it: a knock at the roller door, a
   * reversing beeper, a phone buzzing on a bench, a crunch. Nothing until audio's unlocked, or when muted.
   */
  cue(kind: CueKind, pan: number, volume: number) {
    this.cues.push(kind);
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const out = ctx.createGain(); out.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p).connect(ctx.destination);
    const t0 = ctx.currentTime;
    const tone = (type: OscillatorType, freq: number, at: number, dur: number, peak = 1) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(peak, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + at + dur);
      o.connect(g).connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    };
    if (kind === 'knock') { tone('sine', 110, 0, 0.12); tone('sine', 110, 0.22, 0.12); tone('sine', 105, 0.44, 0.14); }
    else if (kind === 'beeper') { tone('square', 1000, 0, 0.35, 0.35); }
    else if (kind === 'buzz') { for (let i = 0; i < 2; i++) tone('sawtooth', 170, i * 0.45, 0.3, 0.4); }
    else {
      // crunch: a burst of noise over a low thump
      const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); // noise texture only: nothing to do with the game's seeded RNG
      const g = ctx.createGain(); g.gain.value = 0.8; n.buffer = buf; n.connect(g).connect(out); n.start(t0);
      tone('sine', 60, 0, 0.4);
    }
  }
  /** Cues played so far (for tests). */
  readonly cues: CueKind[] = [];

  /** For tests: what's playing. */
  get state() {
    return { ctx: this.ctx?.state ?? 'none', muted: this.muted, gate: this.gate?.gain.value ?? 0, level: this.level?.gain.value ?? 0, pan: this.pan?.pan.value ?? 0 };
  }
}
