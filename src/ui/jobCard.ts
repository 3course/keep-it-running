// The "before": when a job lands on the board, its card slides in with the customer's sketch — pencil on graph paper,
// sizes, their note. It doesn't take taps (the world under it still works); any touch or a few seconds puts it away.
// A batch (the morning's sheets) shows the first one due and says how many more came with it.
import { designForJob } from '../designs/index.js';
import { sketchSvg, SKETCH_CSS } from '../designs/sketch.js';
import type { Game } from '../sim/Game.js';
import type { Job } from '../sim/types.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .jobcard { position: absolute; left: calc(var(--cover, 0px) + (100% - var(--cover, 0px)) / 2); /* clear of a pinned notepad */ top: calc(${F(70)} + max(env(safe-area-inset-top, 0px), var(--tvy, 0px))); width: ${F(300)}; transform: translate(-50%, -12px) rotate(-1.2deg);
  opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; z-index: 6;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 6px; box-shadow: 0 6px 0 rgba(20,17,15,.35); font: ${F(14)} 'Courier New', monospace; color: #14110f; }
#kir-hud .jobcard.show { opacity: 1; transform: translate(-50%, 0) rotate(-1.2deg); }
#kir-hud .jobcard .hd { display: flex; justify-content: space-between; gap: 6px; padding: 5px 8px 3px; border-bottom: 2px dashed #14110f; font-weight: 700; }
#kir-hud .jobcard .hd .stamp, #kir-hud .stamp { color: #c0281e; border: 2px solid #c0281e; border-radius: 3px; padding: 0 4px; font-weight: 700; letter-spacing: 1px; transform: rotate(4deg); display: inline-block; }
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
  /** The job on the card now, and one put away while a full scene was up (shown again after). */
  private shownId: number | null = null;
  private held: number | null = null;
  private shows = 0;
  /** Changes whenever the card's content (so its size) does: a cached rect() is good till then. */
  get layoutKey() { return this.shows; }

  quiet(ms = 1500) { this.quietUntil = performance.now() + ms; }

  /**
   * Look for jobs that weren't on the board last time. Call every frame; cheap. Not `allowed` (a full scene's up, like
   * the cafe): a card that's showing is put away to come back after, and new jobs wait to be shown (not marked seen).
   */
  update(g: Game, allowed: boolean) {
    if (!allowed) {
      if (this.el.classList.contains('show') && this.shownId !== null) { this.held = this.shownId; this.hide(); }
      return;
    }
    if (this.held !== null) {
      const j = g.jobs.find(x => x.id === this.held && x.status === 'queued');
      this.held = null;
      if (j && g.jobs.every(x => this.seen.has(x.id))) { this.show(g, j); return; }
    }
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
    // RUSH is a red stamp at the top right of the header; the due time sits alone at the bottom right
    this.el.innerHTML = `<div class="hd"><span>New job: ${esc(d.name)}</span><span>${sheets > 1 ? `×${sheets} ` : ''}${/^RUSH/.test(j.name) ? '<span class="stamp">RUSH</span>' : ''}</span></div>
      ${sketchSvg(d, { width: 300, height: 210 })}
      <div class="ft"><span>${esc(j.material)}</span><span>due ${esc(g.dueLabel(j))}</span></div>
      ${more > 0 ? `<div class="ft"><span>+ ${more} more sheet${more > 1 ? 's' : ''} on the board</span></div>` : ''}`;
    this.el.dataset.design = d.id;
    this.shownId = j.id;
    this.shows++;
    this.el.classList.add('show');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), this.showMs);
  }

  hide() { this.el.classList.remove('show'); }
  /** Where the card is (or would be: it's laid out even while hidden), on screen. */
  rect() { const r = this.el.getBoundingClientRect(); return new DOMRect(r.left, r.top + 12, r.width, r.height); }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
