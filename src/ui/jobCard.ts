// The "before": when a job lands on the board, its card slides in with the customer's sketch — pencil on graph paper,
// sizes, their note. It doesn't take taps (the world under it still works); any touch or a few seconds puts it away.
// A batch (the morning's sheets) shows the first one due and says how many more came with it.
import { designForJob } from '../designs/index.js';
import { sketchSvg, SKETCH_CSS } from '../designs/sketch.js';
import type { Game } from '../sim/Game.js';
import type { Job } from '../sim/types.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .jobcard { position: absolute; left: 50%; top: calc(${F(70)} + env(safe-area-inset-top, 0px)); width: ${F(300)}; transform: translate(-50%, -12px) rotate(-1.2deg);
  opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; z-index: 6;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 6px; box-shadow: 0 6px 0 rgba(20,17,15,.35); font: ${F(14)} 'Courier New', monospace; color: #14110f; }
#kir-hud .jobcard.show { opacity: 1; transform: translate(-50%, 0) rotate(-1.2deg); }
#kir-hud .jobcard .hd { display: flex; justify-content: space-between; gap: 6px; padding: 5px 8px 3px; border-bottom: 2px dashed #14110f; font-weight: 700; }
#kir-hud .jobcard .hd .tag { color: #c0281e; }
#kir-hud .jobcard svg { display: block; width: 100%; height: auto; }
#kir-hud .jobcard .ft { padding: 3px 8px 5px; border-top: 2px dashed #14110f; display: flex; justify-content: space-between; gap: 6px; }
${SKETCH_CSS.replace('.sketch', '#kir-hud .sketch')}
`;

export class JobCard {
  private el: HTMLDivElement;
  private seen = new Set<number>();
  private timer = 0;
  /** Jobs that arrive before this (performance.now ms) are taken as already shown (the order card had them). */
  private quietUntil = 0;

  constructor(parent: HTMLElement, private showMs = 7000) {
    if (!document.getElementById('kir-jobcard-css')) {
      const s = document.createElement('style'); s.id = 'kir-jobcard-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'jobcard';
    parent.appendChild(this.el);
    window.addEventListener('pointerdown', () => this.hide(), true);
  }

  get showing() { return this.el.classList.contains('show'); }

  /** Everything on the board now counts as seen (a resumed game, a new page). */
  prime(g: Game) { for (const j of g.jobs) this.seen.add(j.id); }
  /** The order card just showed these: don't show them again when they land. */
  quiet(ms = 1500) { this.quietUntil = performance.now() + ms; }

  /** Look for jobs that weren't on the board last time. Call every frame; cheap. */
  update(g: Game, allowed: boolean) {
    const fresh: Job[] = [];
    for (const j of g.jobs) if (!this.seen.has(j.id)) { this.seen.add(j.id); fresh.push(j); }
    if (!fresh.length || !allowed || performance.now() < this.quietUntil) return;
    fresh.sort((a, b) => g.dueAt(a) - g.dueAt(b));
    this.show(g, fresh[0], fresh.length);
  }

  show(g: Game, j: Job, batch = 1) {
    const d = designForJob(j);
    const sheets = g.jobs.filter(x => x.status === 'queued' && x.name.replace(/ \(\d+\/\d+\)$/, '') === j.name.replace(/ \(\d+\/\d+\)$/, '') && x.dueDay === j.dueDay).length || 1;
    const more = batch - sheets;
    this.el.innerHTML = `<div class="hd"><span>${/^RUSH/.test(j.name) ? '<span class="tag">RUSH </span>' : ''}New job: ${esc(d.name)}</span><span>${sheets > 1 ? `×${sheets}` : ''}</span></div>
      ${sketchSvg(d, { width: 300, height: 210 })}
      <div class="ft"><span>${esc(j.material)}</span><span>due ${esc(g.dueLabel(j))}</span></div>
      ${more > 0 ? `<div class="ft"><span>+ ${more} more sheet${more > 1 ? 's' : ''} on the board</span></div>` : ''}`;
    this.el.dataset.design = d.id;
    this.el.classList.add('show');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), this.showMs);
  }

  hide() { this.el.classList.remove('show'); }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
