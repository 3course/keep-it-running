// Kerr on the office computer: a terminal over the shed. The numbers, then the advice a line at a time, then two
// buttons: order ply (Kerr's where ply is ordered) or log off. The clock stops while it's up (the view checks `showing`).
import type { KerrScreen } from '../world/kerr.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .kerr { position: absolute; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center; pointer-events: auto;
  background: rgba(10, 12, 10, .72); }
#kir-hud .kerr .term { width: min(94%, ${F(400)}); max-height: 86%; overflow-y: auto; box-sizing: border-box; padding: ${F(14)} ${F(16)};
  background: #0b0f0b; color: #9fe29f; border: 3px solid #2c3a2c; border-radius: 10px; box-shadow: 0 0 0 2px #0b0f0b, 0 8px 0 rgba(0,0,0,.4);
  font: ${F(15)}/1.4 'Courier New', monospace; text-shadow: 0 0 4px rgba(120, 230, 120, .35); }
#kir-hud .kerr .top { color: #5f8f5f; font-size: ${F(12)}; letter-spacing: 1px; margin-bottom: ${F(10)}; }
#kir-hud .kerr .row { margin: 0 0 ${F(6)}; }
#kir-hud .kerr .row b { display: block; color: #d8f5a8; font-weight: normal; font-size: ${F(12)}; letter-spacing: 1px; }
#kir-hud .kerr hr { border: 0; border-top: 1px dashed #2f4a2f; margin: ${F(10)} 0; }
#kir-hud .kerr .say { margin: 0 0 ${F(8)}; opacity: 0; transition: opacity .15s; }
#kir-hud .kerr .say.on { opacity: 1; }
#kir-hud .kerr .say::before { content: '> '; color: #5f8f5f; }
#kir-hud .kerr .btns { display: flex; gap: ${F(8)}; margin-top: ${F(12)}; }
#kir-hud .kerr .btns button { flex: 1; font: ${F(16)} 'Courier New', monospace; padding: ${F(10)}; border-radius: 6px; border: 2px solid #9fe29f;
  background: #0b0f0b; color: #9fe29f; }
#kir-hud .kerr .btns button.ply { background: #9fe29f; color: #0b0f0b; }
`;

export class KerrView {
  private el: HTMLDivElement;
  private timers: number[] = [];

  constructor(parent: HTMLElement) {
    if (!document.getElementById('kir-kerr-css')) { const s = document.createElement('style'); s.id = 'kir-kerr-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.el = document.createElement('div');
    this.el.className = 'kerr';
    this.el.addEventListener('pointerdown', e => e.stopPropagation()); // the shed under it doesn't take the tap
    parent.appendChild(this.el);
  }

  get showing() { return this.el.style.display === 'flex'; }

  open(screen: KerrScreen, actions: { orderPly: () => void; close: () => void }) {
    this.clearTimers();
    const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.el.innerHTML = `<div class="term">
      <div class="top">KERR 0.3 · LOCAL MODEL · NAC MINI</div>
      ${screen.header.map(([k, v]) => `<div class="row"><b>${esc(k)}</b>${esc(v)}</div>`).join('')}
      <hr>
      ${screen.advice.map(a => `<p class="say">${esc(a)}</p>`).join('')}
      <div class="btns"><button class="ply">Order ply</button><button class="off">Log off</button></div>
    </div>`;
    this.el.style.display = 'flex';
    // the advice comes up a line at a time, like it's thinking
    this.el.querySelectorAll('.say').forEach((p, i) => this.timers.push(window.setTimeout(() => p.classList.add('on'), 250 + i * 350)));
    const on = (sel: string, f: () => void) => this.el.querySelector(sel)!.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); f(); });
    on('.ply', () => { this.close(); actions.orderPly(); });
    on('.off', () => { this.close(); actions.close(); });
  }

  close() { this.clearTimers(); this.el.style.display = 'none'; this.el.innerHTML = ''; }

  private clearTimers() { for (const t of this.timers) window.clearTimeout(t); this.timers = []; }
}
