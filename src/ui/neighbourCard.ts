// Negotiation with Sal, Mick or Priya — same finger-feel as the order call card, fewer taps.
import { talkChoices, talkLines } from '../sim/neighbours.js';
import type { Game } from '../sim/Game.js';
import { NEIGHBOUR_NAMES } from '../people/lines/neighbours.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .nbrcard { position: absolute; left: calc(var(--cover, 0px) + (100% - var(--cover, 0px)) / 2); top: calc(${F(70)} + env(safe-area-inset-top, 0px)); width: ${F(300)}; transform: translateX(-50%);
  display: none; pointer-events: auto; z-index: 8; touch-action: none;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 6px; box-shadow: 0 6px 0 rgba(20,17,15,.35); font: ${F(14)} 'Courier New', monospace; color: #14110f; }
#kir-hud .nbrcard.on { display: block; }
#kir-hud .nbrcard .hd { padding: 5px 8px 3px; border-bottom: 2px dashed #14110f; font-weight: 700; }
#kir-hud .nbrcard .ln { padding: 2px 8px; }
#kir-hud .nbrcard .row { display: flex; flex-direction: column; gap: ${F(6)}; padding: 6px 8px 8px; }
#kir-hud .nbrcard .row button { min-height: ${F(44)}; font: 700 ${F(16)} 'Courier New', monospace; border: 3px solid #14110f; border-radius: 10px; box-shadow: 0 3px 0 #14110f; background: #d9cdb8; color: #14110f; }
`;

export class NeighbourCard {
  readonly el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('kir-nbrcard-css')) { const s = document.createElement('style'); s.id = 'kir-nbrcard-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.el = document.createElement('div');
    this.el.className = 'nbrcard';
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'click'] as const) this.el.addEventListener(t, e => e.stopPropagation());
    parent.appendChild(this.el);
  }

  get showing() { return this.el.classList.contains('on'); }

  sync(g: Game, pick: (i: number) => void) {
    const t = g.neighbourTalk;
    if (!t) { this.close(); return; }
    const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const lines = talkLines(g).map(l => `<div class="ln">${esc(l)}</div>`).join('');
    const choices = talkChoices(g);
    const btns = choices.map((c, i) => `<button data-i="${i}">${esc(c.label)}</button>`).join('');
    this.el.innerHTML = `<div class="hd">${esc(NEIGHBOUR_NAMES[t.who])}</div>${lines}<div class="row">${btns}</div>`;
    this.el.classList.add('on');
    this.el.querySelectorAll('button').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      pick(Number((e.currentTarget as HTMLButtonElement).dataset.i));
    }));
  }

  close() { this.el.classList.remove('on'); this.el.innerHTML = ''; }
}
