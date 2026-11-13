// A word with Sal, Mick or Priya (on the phone or over the fence): who, what they say, and your answers, in the style of
// the order-call card. Works the same on touch (tap an answer), keys and a pad (the ring, A; B is the polite no:
// `button.no`, see src/input/padNav.ts), portrait or landscape (centred on the free floor, inside the TV safe area).
// Drawn only when what it says changes, so an answer under a finger (or the pad's press) is never swapped mid-tap.
import { NEIGHBOUR_NAMES, NEIGHBOUR_SHOPS } from '../people/lines/neighbours.js';
import { talkChoices, talkLines } from '../sim/neighbours.js';
import type { Game } from '../sim/Game.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .nbrcard { position: absolute; left: calc(var(--cover, 0px) + (100% - var(--cover, 0px)) / 2);
  top: calc(${F(70)} + max(env(safe-area-inset-top, 0px), var(--tvy, 0px))); width: min(calc(100% - 24px), ${F(320)}); transform: translateX(-50%); box-sizing: border-box;
  display: none; pointer-events: auto; z-index: 8; touch-action: none;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 6px; box-shadow: 0 6px 0 rgba(20,17,15,.35); font: ${F(16)}/1.3 'Courier New', monospace; color: #14110f; }
#kir-hud .nbrcard.on { display: block; }
#kir-hud .nbrcard .hd { padding: ${F(6)} ${F(10)} ${F(4)}; border-bottom: 2px dashed #14110f; font-weight: 700; }
#kir-hud .nbrcard .hd small { display: block; font-weight: normal; font-size: ${F(13)}; color: #6b5d45; }
#kir-hud .nbrcard .ln { padding: ${F(4)} ${F(10)} 0; }
#kir-hud .nbrcard .row { display: flex; flex-direction: column; gap: ${F(8)}; padding: ${F(10)}; }
#kir-hud .nbrcard .row button { min-height: ${F(48)}; font: 700 ${F(16)} 'Courier New', monospace; border: 3px solid #14110f; border-radius: 10px;
  box-shadow: 0 3px 0 #14110f; background: #8fd37a; color: #14110f; text-align: left; padding: ${F(6)} ${F(12)}; }
#kir-hud .nbrcard .row button.no { background: #d9cdb8; font-weight: normal; }
#kir-hud .nbrcard .row button.more { background: #f2c76b; }
`;

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class NeighbourCard {
  readonly el: HTMLDivElement;
  private sig = '';
  private pick: (i: number) => void = () => {};

  constructor(parent: HTMLElement) {
    if (!document.getElementById('kir-nbrcard-css')) { const s = document.createElement('style'); s.id = 'kir-nbrcard-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.el = document.createElement('div');
    this.el.className = 'nbrcard';
    // the shed under it doesn't take the touches
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click'] as const) this.el.addEventListener(t, e => e.stopPropagation());
    // answers act on the click (a finger's lift, or A coming up): the press that opened the card can't also answer it
    this.el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
      if (b) { e.preventDefault(); this.pick(Number(b.dataset.i)); }
    });
    parent.appendChild(this.el);
  }

  get showing() { return this.el.classList.contains('on'); }

  /** Show the talk that's on (or close the card if none). Called every frame; redraws only on a change. */
  sync(g: Game, pick: (i: number) => void) {
    this.pick = pick;
    const t = g.neighbourTalk;
    const lines = t ? talkLines(g) : [], choices = t ? talkChoices(g) : [];
    if (!t || !choices.length) { this.close(); return; }
    const sig = JSON.stringify([t.who, t.scene, t.step, t.via, lines, choices.map(c => c.label)]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.innerHTML = `<div class="hd">${t.via === 'phone' ? '📞 ' : ''}${esc(NEIGHBOUR_NAMES[t.who])}<small>${esc(NEIGHBOUR_SHOPS[t.who])}</small></div>`
      + lines.map(l => `<div class="ln">${esc(l)}</div>`).join('')
      + `<div class="row">${choices.map((c, i) => `<button data-i="${i}" class="${c.decline ? 'no' : c.next === 'counter' ? 'more' : 'yes'}">${esc(c.label)}</button>`).join('')}</div>`;
    this.el.classList.add('on');
  }

  close() {
    if (!this.sig && !this.el.classList.contains('on')) return;
    this.sig = '';
    this.el.classList.remove('on'); this.el.innerHTML = '';
  }
}
