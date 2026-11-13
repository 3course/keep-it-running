// An order call, answered: the call itself as a job card. Who's calling (and a red RUSH stamp if it's a rush), their
// sketch, then the details as they describe them — the board and how many, the price — and the due time bottom-right;
// then Accept / Decline at the bottom, inside the card. It stays open until one's tapped (the clock runs on; the
// caller holds). Walking away from the phone hangs up: that's a decline.
import { designForJob } from '../designs/index.js';
import { sketchSvg, SKETCH_CSS } from '../designs/sketch.js';
import type { Job } from '../sim/types.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .callcard { position: absolute; left: calc(var(--cover, 0px) + (100% - var(--cover, 0px)) / 2); /* centred in the shed, clear of a pinned notepad */ top: calc(${F(70)} + max(env(safe-area-inset-top, 0px), var(--tvy, 0px))); width: ${F(300)}; transform: translateX(-50%) rotate(-1.2deg);
  display: none; pointer-events: auto; z-index: 7; touch-action: none;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 6px; box-shadow: 0 6px 0 rgba(20,17,15,.35); font: ${F(14)} 'Courier New', monospace; color: #14110f; }
#kir-hud .callcard.on { display: block; }
#kir-hud .callcard .hd { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 5px 8px 3px; border-bottom: 2px dashed #14110f; font-weight: 700; }
#kir-hud .callcard svg { display: block; width: 100%; height: auto; }
#kir-hud .callcard .ln { padding: 2px 8px; opacity: 0; transition: opacity .2s; }
#kir-hud .callcard .ln.on { opacity: 1; }
#kir-hud .callcard .ln.dots::after { content: ' …'; }
#kir-hud .callcard .ft { padding: 3px 8px 5px; border-top: 2px dashed #14110f; display: flex; justify-content: flex-end; font-weight: 700; opacity: 0; transition: opacity .2s; }
#kir-hud .callcard .ft.on { opacity: 1; }
#kir-hud .callcard .row { display: none; gap: ${F(8)}; padding: 0 8px 8px; }
#kir-hud .callcard .row.on { display: flex; }
#kir-hud .callcard .row button { flex: 1; min-height: ${F(48)}; font: 700 ${F(17)} 'Courier New', monospace; border: 3px solid #14110f; border-radius: 10px; box-shadow: 0 3px 0 #14110f; color: #14110f; }
#kir-hud .callcard .row .yes { background: #8fd37a; }
#kir-hud .callcard .row .no { background: #d9cdb8; }
#kir-hud .callcard .row .no.hot { background: #e8644a; color: #fff8ec; animation: kir-hot 1.2s ease-in-out infinite; }
#kir-hud .stamp { color: #c0281e; border: 2px solid #c0281e; border-radius: 3px; padding: 0 4px; font-weight: 700; letter-spacing: 1px; transform: rotate(4deg); display: inline-block; }
${SKETCH_CSS.replace('.sketch', '#kir-hud .callcard .sketch')}
`;

export interface CallDetails { who: string; job: Job; lines: string[]; due: string; rush: boolean }

export class CallCard {
  readonly el: HTMLDivElement;
  private timers: number[] = [];
  private onDecline: (() => void) | null = null;
  /** The call it's for (it closes if they ring off). */
  callId: number | null = null;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('kir-callcard-css')) { const s = document.createElement('style'); s.id = 'kir-callcard-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.el = document.createElement('div');
    this.el.className = 'callcard';
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click'] as const) this.el.addEventListener(t, e => e.stopPropagation());
    parent.appendChild(this.el);
  }

  get showing() { return this.callId !== null; }
  /** Changes whenever the card's size can (a new call, the answers coming up): a cached rect is good till then. */
  get layoutKey() { return `${this.callId}|${this.ready}`; }
  /** All told: the answers are up. */
  get ready() { return !!this.el.querySelector('.row.on'); }

  show(callId: number, c: CallDetails, lineMs: number, highlightNo: boolean, take: () => void, decline: () => void) {
    this.close();
    this.callId = callId;
    this.onDecline = decline;
    const esc = (t: string) => t.replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!);
    const d = designForJob(c.job);
    this.el.innerHTML = `<div class="hd"><span>📞 ${esc(c.who)}</span>${c.rush ? '<span class="stamp">RUSH</span>' : ''}</div>
      ${sketchSvg(d, { width: 300, height: 190 })}
      ${c.lines.map(l => `<div class="ln">${esc(l)}</div>`).join('')}
      <div class="ft"><span>due ${esc(c.due)}</span></div>
      <div class="row"><button class="no${highlightNo ? ' hot' : ''}" data-act="decline">Decline</button><button class="yes" data-act="take">Accept</button></div>`;
    this.el.dataset.design = d.id;
    this.el.classList.add('on');
    // they describe it a line at a time; the line being said trails off till the next
    const lns = [...this.el.querySelectorAll('.ln')];
    lns.forEach((ln, i) => this.timers.push(window.setTimeout(() => { lns.forEach(x => x.classList.remove('dots')); ln.classList.add('on', 'dots'); }, i * lineMs)));
    this.timers.push(window.setTimeout(() => { lns.forEach(x => x.classList.remove('dots')); this.el.querySelector('.ft')!.classList.add('on'); }, lns.length * lineMs));
    this.timers.push(window.setTimeout(() => this.el.querySelector('.row')!.classList.add('on'), (lns.length + 1) * lineMs));
    // on the click (after the finger's up): the card goes as you answer, and the tap mustn't land on the shed
    this.el.querySelector('.no')!.addEventListener('click', e => { e.preventDefault(); this.close(); decline(); });
    this.el.querySelector('.yes')!.addEventListener('click', e => { e.preventDefault(); this.close(); take(); });
  }

  /** Walked away from the phone: hung up, which is a decline. */
  hangUp() { const d = this.onDecline; this.close(); d?.(); }

  close() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.callId = null; this.onDecline = null;
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }
}
