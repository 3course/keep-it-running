// The order call, picked up: a card with what's on offer — the board (its colour and name), how many sheets, the
// price each and in all, and when it's due — and two big buttons, yes and no. It stays up while they're on the line;
// if they ring off it goes.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { Distraction, OrderPreview } from '../sim/types.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .ordercard { position: absolute; left: 50%; bottom: ${F(96)}; transform: translateX(-50%); width: ${F(320)}; pointer-events: auto; z-index: 7;
  background: #efe6d8; border: 3px solid #14110f; border-radius: 14px; box-shadow: 0 6px 0 rgba(20,17,15,.35); padding: ${F(12)};
  font: ${F(18)} 'Courier New', monospace; color: #14110f; touch-action: none; }
#kir-hud .ordercard .who { font-weight: 700; font-size: ${F(20)}; margin-bottom: ${F(8)}; }
#kir-hud .ordercard .board { display: flex; align-items: center; gap: ${F(10)}; font-weight: 700; }
#kir-hud .ordercard .sw { width: ${F(40)}; height: ${F(28)}; border: 3px solid #14110f; border-radius: 4px; flex: none; }
#kir-hud .ordercard .terms { margin: ${F(8)} 0 ${F(4)}; line-height: 1.35; }
#kir-hud .ordercard .terms b.rush { color: #c0281e; }
#kir-hud .ordercard .row { display: flex; gap: ${F(12)}; margin-top: ${F(10)}; }
#kir-hud .ordercard button { flex: 1; height: ${F(64)}; font: 700 ${F(34)} sans-serif; border: 3px solid #14110f; border-radius: 12px; box-shadow: 0 4px 0 #14110f; }
#kir-hud .ordercard button.no { background: #d9cdb8; }
#kir-hud .ordercard button.no.hot { background: #e8644a; color: #fff8ec; animation: kir-hot 1.2s ease-in-out infinite; }
#kir-hud .ordercard button.yes { background: #8fd37a; }
`;

/** The board colours on the card, like the sheets themselves (CONFIG.jobs.types order). */
const SWATCH: Record<string, string> = { formwork: '#8a4f32', joinery: '#b48c62', signage: '#cfe2e8' };

export class OrderCard {
  private el: HTMLDivElement | null = null;
  /** The call it's for (it closes if they ring off). */
  callId: number | null = null;

  constructor(private parent: HTMLElement) {
    if (!document.getElementById('kir-ordercard-css')) {
      const s = document.createElement('style'); s.id = 'kir-ordercard-css'; s.textContent = CSS; document.head.appendChild(s);
    }
  }

  get showing() { return this.el !== null; }

  show(g: Game, d: Distraction, offer: OrderPreview, highlightNo: boolean, yes: () => void, no: () => void) {
    this.close();
    const j = offer.jobs[0], n = offer.jobs.length;
    const t = CONFIG.jobs.types.find(x => x.id === j.type)!;
    const total = offer.jobs.reduce((s, x) => s + x.price, 0);
    const lo = Math.min(...offer.jobs.map(x => x.price)), hi = Math.max(...offer.jobs.map(x => x.price));
    const rush = offer.kind === 'rush';
    const el = this.el = document.createElement('div');
    el.className = 'ordercard';
    el.innerHTML = `
      <div class="who">📞 ${d.customer ?? 'A customer'}${d.big ? ' · BIG JOB' : ''}</div>
      <div class="board"><span class="sw" style="background:${SWATCH[t.id]}"></span>${t.name} × ${n}</div>
      <div class="terms">$${lo === hi ? lo : `${lo}–${hi}`} each · <b>$${total}</b><br>due <b class="${rush ? 'rush' : ''}">${rush ? 'RUSH ' : ''}${g.dueLabel(j)}</b></div>
      <div class="row"><button class="no${highlightNo ? ' hot' : ''}" data-act="decline" aria-label="Turn it down">✕</button>
        <button class="yes" data-act="take" aria-label="Take it">✓</button></div>`;
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'click'] as const) el.addEventListener(t, e => e.stopPropagation());
    el.querySelector('.no')!.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); no(); });
    el.querySelector('.yes')!.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); yes(); });
    this.callId = d.id;
    this.parent.appendChild(el);
  }

  close() { this.el?.remove(); this.el = null; this.callId = null; }
}
