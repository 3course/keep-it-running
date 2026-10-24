// Goose-style HUD as plain DOM laid over the canvas: clock and cash top-right, a notepad tab on the
// left edge, floating action labels on objects, the virtual stick, and the few modal moments
// (5pm, paused, end of day/week). DOM keeps text crisp over the chunky low-res 3D render.
import { CONFIG } from '../config.js';
import { BUILD_TAG } from './clipboard.js';
import type { Game } from '../sim/Game.js';
import type { ObjectId } from '../world/layout.js';
import type { TodoItem } from '../world/todo.js';
import { WORLD } from '../world/worldConfig.js';

const HAND = "'Segoe Print', 'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', cursive";
const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-AU');

const CSS = `
#kir-hud { position: fixed; pointer-events: none; z-index: 10; overflow: hidden; }
#kir-hud .stage { position: absolute; left: 0; top: 0; width: ${WORLD.view.width}px; height: ${WORLD.view.height}px; transform-origin: 0 0; font-family: 'Courier New', monospace; }
#kir-hud .clock { position: absolute; right: 10px; top: 10px; pointer-events: auto; padding: 4px 8px; border-radius: 6px;
  background: rgba(20,17,15,.6); color: #efe6d8; font-size: 13px; text-align: right; line-height: 1.3; cursor: pointer; }
#kir-hud .clock .cash { color: #f2c76b; }
#kir-hud .clock .neg { color: #f08a6b; }
#kir-hud .tab { position: absolute; left: 0; top: 120px; width: 30px; height: 96px; pointer-events: auto; cursor: pointer;
  background: #f4ecd2; border: 1px solid #b9a77a; border-left: none; border-radius: 0 8px 8px 0; box-shadow: 2px 2px 6px rgba(0,0,0,.4);
  writing-mode: vertical-rl; text-orientation: mixed; font-family: ${HAND}; font-size: 14px; color: #4a3a22; display: flex; align-items: center; justify-content: center; }
#kir-hud .tab .dot { writing-mode: horizontal-tb; position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; border-radius: 9px;
  background: #c0281e; color: #fff; font: bold 11px sans-serif; display: none; align-items: center; justify-content: center; }
#kir-hud .tab .dot.pulse { animation: kir-pulse .7s ease-in-out infinite; }
@keyframes kir-pulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(192,40,30,.7); } 50% { transform: scale(1.35); box-shadow: 0 0 0 6px rgba(192,40,30,0); } }
#kir-hud .catcher { position: absolute; inset: 0; pointer-events: auto; display: none; }
#kir-hud .pad { position: absolute; left: 0; top: 60px; bottom: 60px; width: 300px; pointer-events: auto; transform: translateX(-310px);
  transition: transform .22s ease-out; background: #f4ecd2; border-radius: 0 10px 10px 0; box-shadow: 4px 4px 14px rgba(0,0,0,.5);
  padding: 14px 16px 14px 22px; box-sizing: border-box; overflow-y: auto; font-family: ${HAND}; color: #2b2418;
  background-image: repeating-linear-gradient(#f4ecd2 0 25px, #c9d6e6 25px 26px); }
#kir-hud .pad.open { transform: translateX(0); }
#kir-hud .pad h2 { margin: 0 0 6px; font-size: 18px; font-weight: normal; }
#kir-hud .pad h3 { margin: 12px 0 2px; font-size: 14px; color: #8a2a1a; font-weight: normal; text-decoration: underline; }
#kir-hud .pad ul { list-style: none; margin: 0; padding: 0; }
#kir-hud .pad li { font-size: 15px; line-height: 26px; cursor: pointer; }
#kir-hud .pad li.urgent { color: #9a1f12; }
#kir-hud .pad li.done { text-decoration: line-through; color: #8a7d64; cursor: default; }
#kir-hud .pad li.sheet { font-size: 13px; cursor: default; }
#kir-hud .pad li.sheet.late { color: #9a1f12; }
#kir-hud .pad .empty { font-size: 13px; color: #8a7d64; }
#kir-hud .modal { position: absolute; inset: 0; background: rgba(0,0,0,.65); pointer-events: auto; display: none; align-items: center; justify-content: center; }
#kir-hud .modal .card { width: 320px; background: #241f1a; border: 2px solid #d48a3c; color: #efe6d8; padding: 18px; box-sizing: border-box; text-align: center; }
#kir-hud .modal h1 { font-size: 20px; margin: 0 0 10px; font-weight: normal; }
#kir-hud .modal p { font-size: 13px; color: #a2937f; margin: 6px 0; }
#kir-hud .modal p.warn { color: #f08a6b; }
#kir-hud .modal button { font: inherit; font-size: 15px; color: #efe6d8; border: 0; padding: 10px 14px; margin: 12px 6px 0; min-width: 130px; cursor: pointer; }
#kir-hud .modal .go { background: #4e8a46; } #kir-hud .modal .ot { background: #9e3d3d; }
#kir-hud .paused { cursor: pointer; }
#kir-hud .paused .card { border-color: #a2937f; }
#kir-hud .labels { position: absolute; inset: 0; pointer-events: none; }
#kir-hud .lbl { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column-reverse; align-items: center; gap: 5px; }
#kir-hud .lbl button { pointer-events: auto; font: 600 15px 'Courier New', monospace; color: #14110f; background: #f2c76b; border: 2px solid #14110f;
  border-radius: 8px; padding: 7px 11px; box-shadow: 0 3px 0 #14110f; white-space: nowrap; max-width: 300px; overflow: hidden; text-overflow: ellipsis; touch-action: none; }
#kir-hud .lbl button.hold { background: #f2a35b; }
#kir-hud .lbl button.held { background: #8fd37a; }
#kir-hud .lbl .status { font: 12px 'Courier New', monospace; color: #efe6d8; background: rgba(20,17,15,.8); padding: 4px 7px; border-radius: 5px;
  white-space: pre-line; text-align: center; max-width: 270px; }
#kir-hud .stick { position: absolute; width: 88px; height: 88px; margin: -44px 0 0 -44px; border-radius: 50%; border: 2px solid rgba(255,255,255,.45);
  background: rgba(20,17,15,.15); display: none; pointer-events: none; }
#kir-hud .stick .knob { position: absolute; left: 50%; top: 50%; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; background: rgba(255,255,255,.6); }
#kir-hud .tag { position: absolute; right: 4px; bottom: 2px; font: 9px 'Courier New', monospace; color: rgba(239,230,216,.6); pointer-events: none; }
#kir-hud .summary { position: absolute; inset: 0; background: #14110f; color: #efe6d8; pointer-events: auto; overflow-y: auto; display: none;
  padding: 14px 14px 30px; box-sizing: border-box; font: 13px 'Courier New', monospace; }
#kir-hud .summary h1 { font-size: 22px; font-weight: normal; margin: 0; }
#kir-hud .summary h2 { font-size: 11px; color: #a2937f; margin: 0 0 6px; font-weight: normal; letter-spacing: 1px; text-transform: uppercase; }
#kir-hud .summary .sub { color: #a2937f; margin: 4px 0 10px; }
#kir-hud .summary section { background: #241f1a; border: 2px solid #4a3f33; padding: 8px 12px; margin-bottom: 8px; }
#kir-hud .summary .row { display: flex; justify-content: space-between; line-height: 20px; }
#kir-hud .summary .small { font-size: 11px; }
#kir-hud .summary .dim { color: #a2937f; } #kir-hud .summary .good { color: #8fd37a; } #kir-hud .summary .bad { color: #f08a6b; } #kir-hud .summary .money { color: #f2c76b; }
#kir-hud .summary .verdict { margin: 8px 0 2px; }
#kir-hud .summary .upg { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 6px 0; }
#kir-hud .summary .upg small { color: #a2937f; }
#kir-hud .summary button { font: inherit; color: #efe6d8; background: #8f5a22; border: 0; padding: 9px 14px; cursor: pointer; }
#kir-hud .summary button:disabled { background: #4a4540; color: #a2937f; }
#kir-hud .summary .upg button { background: #4e8a46; min-width: 80px; }
#kir-hud .summary .upg button:disabled { background: #4a4540; color: #a2937f; }
#kir-hud .summary .next { display: block; width: 220px; margin: 12px auto 6px; font-size: 15px; }
#kir-hud .summary .feedback { text-align: center; margin: 10px 0 6px; }
#kir-hud .summary .copy { display: block; margin: 0 auto; background: #3d6f9e; }
#kir-hud .summary .status { text-align: center; color: #a2937f; font-size: 11px; }
`;

export interface HudCallbacks {
  goTo: (target: ObjectId) => void;
  togglePause: () => void;
  knockOff: () => void;
  overtime: () => void;
}

export class Hud {
  private root: HTMLDivElement;
  private stage: HTMLDivElement;
  private clock: HTMLDivElement;
  private tab: HTMLDivElement;
  private dot: HTMLSpanElement;
  private pad: HTMLDivElement;
  private catcher: HTMLDivElement;
  private eod: HTMLDivElement;
  private pausedEl: HTMLDivElement;
  private stick: HTMLDivElement;
  private knob: HTMLDivElement;
  private summary: HTMLDivElement;
  readonly labels: HTMLDivElement;
  private padSig = '';
  private onResize = () => this.layout();
  isOpen = false;

  constructor(private canvas: HTMLCanvasElement, private cb: HudCallbacks) {
    if (!document.getElementById('kir-hud-css')) {
      const style = document.createElement('style');
      style.id = 'kir-hud-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = el('div', { id: 'kir-hud' });
    this.stage = el('div', { className: 'stage' });
    this.root.appendChild(this.stage);
    this.catcher = el('div', { className: 'catcher' });
    this.catcher.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
    this.clock = el('div', { className: 'clock' });
    this.clock.addEventListener('click', () => this.cb.togglePause());
    this.tab = el('div', { className: 'tab', textContent: 'Notepad' });
    this.dot = el('span', { className: 'dot' });
    this.tab.appendChild(this.dot);
    this.tab.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.pad = el('div', { className: 'pad' });
    this.eod = el('div', { className: 'modal' });
    this.pausedEl = el('div', { className: 'modal paused' });
    this.pausedEl.innerHTML = `<div class="card"><h1>Paused</h1><p>The clock's stopped. Tap to carry on.</p></div>`;
    this.pausedEl.addEventListener('click', () => this.cb.togglePause());
    this.labels = el('div', { className: 'labels' });
    this.stick = el('div', { className: 'stick' });
    this.knob = el('div', { className: 'knob' });
    this.stick.appendChild(this.knob);
    this.summary = el('div', { className: 'summary' });
    const tag = el('div', { className: 'tag', textContent: BUILD_TAG });
    this.stage.append(this.labels, this.stick, this.catcher, this.clock, this.tab, this.pad, this.eod, this.summary, this.pausedEl, tag);
    document.body.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
    this.layout();
  }

  /** Keep the overlay exactly over the (letterboxed, FIT-scaled) canvas. */
  layout() {
    const r = this.canvas.getBoundingClientRect();
    Object.assign(this.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.stage.style.transform = `scale(${r.width / WORLD.view.width})`;
  }

  open() { this.isOpen = true; this.pad.classList.add('open'); this.catcher.style.display = 'block'; }
  close() { this.isOpen = false; this.pad.classList.remove('open'); this.catcher.style.display = 'none'; }

  update(g: Game, items: TodoItem[], done: string[]) {
    const ot = g.overtime ? ' · OT' : '';
    const cashCls = g.cash < 0 ? 'cash neg' : 'cash';
    const html = `${g.formatTime()}${ot}<br><span class="${cashCls}">${money(g.cash)}</span>`;
    if (this.clock.innerHTML !== html) this.clock.innerHTML = html;

    const urgent = items.filter(i => i.urgent).length;
    this.dot.textContent = String(urgent);
    this.dot.style.display = urgent ? 'flex' : 'none';
    // the badge pulses while the phone rings
    this.dot.classList.toggle('pulse', items.some(i => i.key.startsWith('phone-') || i.key.startsWith('bank-')));

    const open = [...g.jobs].filter(j => j.status === 'queued' || j.status === 'cutting').sort((a, b) => g.dueAt(a) - g.dueAt(b));
    const sig = JSON.stringify([items.map(i => i.key + i.text), done, open.map(j => [j.id, j.status, g.isLate(j)]), g.day]);
    if (sig === this.padSig) return;
    this.padSig = sig;
    const now = items.filter(i => i.urgent), later = items.filter(i => !i.urgent);
    const li = (i: TodoItem) => `<li class="${i.urgent ? 'urgent' : ''}" data-target="${i.target ?? ''}">${esc(i.text)}</li>`;
    this.pad.innerHTML = `
      <h2>Day ${g.day} of ${CONFIG.week.days}</h2>
      <h3>Now</h3><ul>${now.map(li).join('') || '<li class="empty">Nothing on fire. Yet.</li>'}${done.map(d => `<li class="done">${esc(d)}</li>`).join('')}</ul>
      <h3>Can wait</h3><ul>${later.map(li).join('') || '<li class="empty">—</li>'}</ul>
      <h3>Sheets (${open.length})</h3><ul>${open.map(j => `<li class="sheet ${g.isLate(j) ? 'late' : ''}">${j.status === 'cutting' ? '▶ ' : ''}${esc(j.name)}<br>&nbsp;&nbsp;${esc(j.material)} · due ${g.dueLabel(j)} · ${money(j.price)}</li>`).join('') || '<li class="empty">Board is clear.</li>'}</ul>`;
    for (const node of Array.from(this.pad.querySelectorAll<HTMLLIElement>('li[data-target]'))) {
      const t = node.dataset.target as ObjectId;
      if (t) node.addEventListener('click', () => { this.close(); this.cb.goTo(t); });
    }
  }

  setPaused(paused: boolean) { this.pausedEl.style.display = paused ? 'flex' : 'none'; }

  showEndOfDay(g: Game) {
    const left = g.queued.length + (g.current ? 1 : 0);
    const half = g.current ? `<p class="warn">${esc(g.current.name)} is half-cut on the bed — knock off now and it's scrap.</p>` : '';
    const ot = money(CONFIG.labour.hourlyRate * CONFIG.labour.overtimeMultiplier);
    this.eod.innerHTML = `<div class="card"><h1>It's 5 o'clock.</h1>${half}
      <p>${left} sheet${left === 1 ? '' : 's'} still on the board. Margin today: ${g.today.revenue > 0 ? Math.round(g.margin * 100) + '%' : '—'}.</p>
      <p>Overtime costs ${ot}/hr. Anything half-cut at ${CONFIG.clock.overtimeEndHour - 12}pm is scrap.</p>
      <button class="go">Knock off</button><button class="ot">Overtime till ${CONFIG.clock.overtimeEndHour - 12}pm</button></div>`;
    this.eod.querySelector('.go')!.addEventListener('click', () => this.cb.knockOff());
    this.eod.querySelector('.ot')!.addEventListener('click', () => this.cb.overtime());
    this.eod.style.display = 'flex';
  }
  hideEndOfDay() { this.eod.style.display = 'none'; }
  get endOfDayShowing() { return this.eod.style.display === 'flex'; }

  /** Logical-px scale of the stage (CSS px per logical px). */
  get scale() { return this.canvas.getBoundingClientRect().width / WORLD.view.width; }
  /** Client (CSS) coordinates → logical 390x844 coordinates. */
  toLogical(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect(), k = r.width / WORLD.view.width;
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  }

  showStick(x: number, y: number, dx: number, dy: number) {
    Object.assign(this.stick.style, { display: 'block', left: `${x}px`, top: `${y}px` });
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  hideStick() { this.stick.style.display = 'none'; }

  /** Show the end-of-day/week screen; returns the element to fill. */
  showSummary(): HTMLDivElement { this.close(); this.summary.style.display = 'block'; this.summary.scrollTop = 0; return this.summary; }
  hideSummary() { this.summary.style.display = 'none'; this.summary.innerHTML = ''; }
  get summaryShowing() { return this.summary.style.display === 'block'; }
  setHudVisible(v: boolean) { for (const e of [this.clock, this.tab, this.labels]) e.style.visibility = v ? 'visible' : 'hidden'; }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
