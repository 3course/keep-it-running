// Frame times, per tier: a rolling window of the last few seconds, for the "Copy details" and "Copy day log" text,
// and for stepping the render resolution down if a tier can't hold its frame rate.

const WINDOW = 180; // frames (~3 s at 60 fps)

class FrameStats {
  tier = '';
  /** Internal render size and its multiple of the original 1/3 scale. */
  size = '';
  resMult = 0;
  targetMs = 0;
  /** Times the resolution was stepped down to hold the frame rate, and why. */
  readonly stepDowns: string[] = [];
  private ms = new Float32Array(WINDOW);
  private n = 0;
  private i = 0;
  private all = { frames: 0, total: 0, slow: 0 };

  add(ms: number) {
    if (!(ms > 0) || ms > 1000) return; // a stalled or backgrounded tab isn't a frame
    this.ms[this.i] = ms; this.i = (this.i + 1) % WINDOW; this.n = Math.min(WINDOW, this.n + 1);
    this.all.frames++; this.all.total += ms;
    if (this.targetMs && ms > this.targetMs * 1.5) this.all.slow++;
  }

  /** Over the last window: median and 95th-percentile frame time (ms). */
  get recent() {
    const xs = Array.from(this.ms.subarray(0, this.n)).sort((a, b) => a - b);
    const at = (p: number) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : 0;
    return { frames: xs.length, median: at(0.5), p95: at(0.95) };
  }

  /** Forget the window (after a resolution change, so it's judged afresh). */
  reset() { this.n = 0; this.i = 0; }

  /** One line for the copied text. */
  report(): string {
    if (!this.all.frames) return '';
    const r = this.recent, fps = (ms: number) => (ms ? Math.round(1000 / ms) : 0);
    const avg = this.all.total / this.all.frames;
    return `Frames (${this.tier}, ${this.size}, res ×${this.resMult.toFixed(2)}, target ${fps(this.targetMs)} fps): ` +
      `last ${r.frames} median ${r.median.toFixed(1)} ms (${fps(r.median)} fps), p95 ${r.p95.toFixed(1)} ms; ` +
      `session ${this.all.frames} frames, mean ${avg.toFixed(1)} ms, ${Math.round(100 * this.all.slow / this.all.frames)}% slow` +
      (this.stepDowns.length ? `; stepped down: ${this.stepDowns.join(', ')}` : '');
  }
}

export const perf = new FrameStats();
