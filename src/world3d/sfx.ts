// Little sounds, synthesised (no files): a can cracking, a tram somewhere down the road, a dog a few yards over, a
// cheer, and some music once someone puts it on. Off when the game's muted.
const MUTE_KEY = 'kir-muted';

export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: { gain: GainNode; timer: number } | null = null;

  get muted() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } }

  /** After a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain(); this.out.gain.value = 0.5; this.out.connect(this.ctx.destination);
  }

  private ready() { return this.ctx && this.out && !this.muted ? { ctx: this.ctx, out: this.out } : null; }

  private noise(dur: number) {
    const ctx = this.ctx!, buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; return src;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Pssht-tk. */
  crack() {
    const r = this.ready(); if (!r) return;
    const t = r.ctx.currentTime;
    const click = r.ctx.createOscillator(); click.type = 'square'; click.frequency.value = 1800;
    const cg = r.ctx.createGain(); this.env(cg, t, 0.25, 0.002, 0.03); click.connect(cg).connect(r.out); click.start(t); click.stop(t + 0.05);
    const hiss = this.noise(0.5), hp = r.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    const hg = r.ctx.createGain(); this.env(hg, t + 0.02, 0.35, 0.01, 0.35); hiss.connect(hp).connect(hg).connect(r.out); hiss.start(t + 0.02);
  }

  /** A tram bell down the road and its rumble, quiet. */
  tram() {
    const r = this.ready(); if (!r) return;
    const t = r.ctx.currentTime;
    for (const dt of [0, 0.32]) {
      const o = r.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1320;
      const g = r.ctx.createGain(); this.env(g, t + dt, 0.05, 0.005, 0.5); o.connect(g).connect(r.out); o.start(t + dt); o.stop(t + dt + 0.6);
    }
    const rum = this.noise(2.5), lp = r.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const rg = r.ctx.createGain(); this.env(rg, t, 0.12, 0.8, 1.6); rum.connect(lp).connect(rg).connect(r.out); rum.start(t);
  }

  /** A ute's horn out the front: two short honks. */
  honk() {
    const r = this.ready(); if (!r) return;
    const t = r.ctx.currentTime;
    for (const dt of [0, 0.32]) {
      for (const f of [392, 494]) {
        const o = r.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        const lp = r.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        const g = r.ctx.createGain(); this.env(g, t + dt, 0.07, 0.01, 0.2); o.connect(lp).connect(g).connect(r.out); o.start(t + dt); o.stop(t + dt + 0.25);
      }
    }
  }

  /** A dog a few yards over: woof woof. */
  dog() {
    const r = this.ready(); if (!r) return;
    const t = r.ctx.currentTime;
    for (const dt of [0, 0.28]) {
      const o = r.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t + dt); o.frequency.exponentialRampToValueAtTime(260, t + dt + 0.12);
      const bp = r.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 2;
      const g = r.ctx.createGain(); this.env(g, t + dt, 0.05, 0.01, 0.12); o.connect(bp).connect(g).connect(r.out); o.start(t + dt); o.stop(t + dt + 0.2);
    }
  }

  /** A little crowd: everyone at once. */
  cheer() {
    const r = this.ready(); if (!r) return;
    const t = r.ctx.currentTime;
    const n = this.noise(1.4), bp = r.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = r.ctx.createGain(); this.env(g, t, 0.25, 0.15, 1.1); n.connect(bp).connect(g).connect(r.out); n.start(t);
  }

  /** A laugh: each person's own pitch and rhythm (a few short voiced syllables through a vowel filter). */
  laugh(who: string) {
    const r = this.ready(); if (!r) return;
    const v = ({ eggby: { f: 120, n: 3, gap: 0.16 }, courtney: { f: 260, n: 6, gap: 0.09 }, tim: { f: 165, n: 4, gap: 0.12 } } as Record<string, { f: number; n: number; gap: number }>)[who] ?? { f: 200, n: 4, gap: 0.11 };
    const t = r.ctx.currentTime;
    for (let i = 0; i < v.n; i++) {
      const at = t + i * v.gap, o = r.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(v.f * (1.15 - i * 0.04 + Math.random() * 0.06), at); o.frequency.exponentialRampToValueAtTime(v.f * 0.85, at + v.gap * 0.8);
      const bp = r.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      const g = r.ctx.createGain(); this.env(g, at, 0.12, 0.01, v.gap * 0.7);
      o.connect(bp).connect(g).connect(r.out); o.start(at); o.stop(at + v.gap);
    }
  }

  /** Someone's put music on: a loose, warm little loop (louder on group nights). */
  startMusic(loud = false) {
    const r = this.ready(); if (!r || this.music) return;
    const gain = r.ctx.createGain(); gain.gain.value = loud ? 0.09 : 0.05; gain.connect(r.out);
    const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 294]];
    let i = 0;
    const play = () => {
      const c = this.ctx!; const t = c.currentTime;
      chords[i++ % chords.length].forEach((f, k) => {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + k * 0.12); g.gain.exponentialRampToValueAtTime(0.5, t + k * 0.12 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g).connect(gain); o.start(t + k * 0.12); o.stop(t + 1.2);
      });
      const b = c.createOscillator(); b.type = 'sine'; b.frequency.value = chords[(i - 1) % chords.length][0] / 2;
      const bg = c.createGain(); this.env(bg, t, 0.6, 0.02, 0.9); b.connect(bg).connect(gain); b.start(t); b.stop(t + 1);
    };
    play();
    this.music = { gain, timer: window.setInterval(play, 1200) };
  }

  stopMusic() {
    if (!this.music) return;
    window.clearInterval(this.music.timer);
    this.music.gain.disconnect();
    this.music = null;
  }
  get musicOn() { return !!this.music; }
}
