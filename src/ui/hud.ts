// Goose-style HUD as plain DOM laid over the canvas: clock and cash top-right, a notepad tab on the
// left edge, floating action labels on objects, the virtual stick, and the few modal moments
// (5pm, paused, end of day/week). DOM keeps text crisp over the chunky low-res 3D render.
import { CONFIG, type JobTypeId } from '../config.js';
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
#kir-hud .pad li.news { color: #3d6f9e; font-size: 14px; cursor: default; }
#kir-hud .pad li.news::before { content: '• '; }
#kir-hud .bubble { position: absolute; transform: translate(-50%, -100%); background: #f4ecd2; color: #2b2418; font: 15px ${HAND};
  padding: 5px 10px; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,.4); white-space: nowrap; pointer-events: none; display: none; }
#kir-hud .bubble::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -6px; border: 7px solid transparent; border-bottom: 0; border-top-color: #f4ecd2; }
#kir-hud .ply .card { width: 340px; text-align: left; padding: 14px; }
#kir-hud .ply h1 { text-align: center; }
#kir-hud .ply .row { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 8px 0; }
#kir-hud .ply .row .name { font-size: 14px; line-height: 1.2; }
#kir-hud .ply .row .name small { color: #a2937f; font-size: 11px; display: block; }
#kir-hud .ply .row button { margin: 0; min-width: 0; width: 64px; padding: 8px 2px; font-size: 13px; background: #4e8a46; line-height: 1.15; }
#kir-hud .ply .row button small { display: block; font-size: 10px; color: #d8ecd0; }
#kir-hud .ply .row button:disabled { background: #4a4540; color: #a2937f; }
#kir-hud .ply .close { display: block; margin: 12px auto 0; background: #4a4540; }
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
#kir-hud .lbl button.tick { background: #8fd37a; animation: kir-tick .35s ease-out; }
@keyframes kir-tick { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
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
#kir-hud .summary .reset { display: block; text-align: center; margin-top: 14px; color: #a2937f; font-size: 11px; text-decoration: underline; cursor: pointer; }
#kir-hud .pointers { position: absolute; inset: 0; pointer-events: none; }
#kir-hud .ptr { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: rgba(20,17,15,.78);
  border: 2px solid #f2c76b; display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1; transition: transform .08s; }
#kir-hud .ptr .arrow { position: absolute; left: 50%; top: 50%; width: 0; height: 0; margin: -6px 0 0 -5px;
  border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 9px solid #f2c76b; transform-origin: 5px 6px; }
#kir-hud .ptr.ring { transform: scale(1.25); border-color: #f08a6b; }
#kir-hud .ptr.ring .arrow { border-left-color: #f08a6b; }
#kir-hud .hint { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); width: 280px; padding: 12px 14px; display: none;
  background: #f4ecd2; color: #2b2418; border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.45); text-align: center; pointer-events: none;
  font: 16px ${HAND}; }
#kir-hud .sign { position: absolute; transform: translate(-50%, -50%); font: bold 10px 'Courier New', monospace; letter-spacing: 1px; color: #f4ecd2;
  background: #4a3a22; border: 1px solid #2b2418; border-radius: 2px; padding: 1px 5px; white-space: nowrap; pointer-events: none; }
#kir-hud .pad h3.vm { color: #3d6f9e; }
#kir-hud .pad li.callback { color: #2e5a86; }
#kir-hud .canchip { position: absolute; right: 10px; bottom: 26px; pointer-events: auto; font: 600 14px 'Courier New', monospace; color: #efe6d8;
  background: rgba(20,17,15,.75); border: 2px solid #c0281e; border-radius: 18px; padding: 8px 12px; touch-action: none; }
#kir-hud .canchip::before { content: '🍺 '; }
#kir-hud .mute { position: absolute; right: 10px; top: 62px; width: 32px; height: 28px; pointer-events: auto; cursor: pointer; border: 0; border-radius: 6px;
  background: rgba(20,17,15,.6); color: #efe6d8; font-size: 15px; line-height: 28px; padding: 0; }
`;

export interface HudCallbacks {
  /** Walk to the nearest of these (a notepad line was tapped). `key`: that line, so arriving does its action and not just any. */
  goTo: (targets: ObjectId[], key?: string) => void;
  /** The can chip: put the can in your hand down where you stand. */
  putCanDown: () => void;
  toggleMute: () => boolean;
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
  private pointers: HTMLDivElement;
  private pointerEls = new Map<string, HTMLDivElement>();
  private hint: HTMLDivElement;
  private mute: HTMLButtonElement;
  private padSig = '';
  private ply: HTMLDivElement;
  readonly bubble: HTMLDivElement;
  private canChip: HTMLButtonElement;
  private tag!: HTMLDivElement;
  /** A note after the build tag: which render tier this device is on, when it isn't the full one. */
  setTagNote(note: string) { this.tag.textContent = `${BUILD_TAG} · ${note}`; }
  get plyShowing() { return this.ply.style.display === 'flex'; }
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
    const tag = this.tag = el('div', { className: 'tag', textContent: BUILD_TAG });
    this.pointers = el('div', { className: 'pointers' });
    this.hint = el('div', { className: 'hint' });
    this.mute = el('button', { className: 'mute' });
    this.ply = el('div', { className: 'modal ply' });
    this.bubble = el('div', { className: 'bubble' });
    this.canChip = el('button', { className: 'canchip' });
    this.canChip.style.display = 'none';
    this.canChip.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.cb.putCanDown(); });
    this.mute.addEventListener('click', e => { e.stopPropagation(); this.setMuted(this.cb.toggleMute()); });
    this.stage.append(this.labels, this.bubble, this.pointers, this.hint, this.stick, this.catcher, this.clock, this.mute, this.tab, this.pad, this.canChip, this.eod, this.ply, this.summary, this.pausedEl, tag);
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
    const isCallback = (i: TodoItem) => i.key.startsWith('callback-');
    const now = items.filter(i => i.urgent), later = items.filter(i => !i.urgent && !isCallback(i)), calls = items.filter(isCallback);
    const li = (i: TodoItem) => `<li class="${i.urgent ? 'urgent' : ''}${isCallback(i) ? ' callback' : ''}" data-key="${esc(i.key)}" data-targets="${i.targets.join(',')}">${esc(i.text)}</li>`;
    this.pad.innerHTML = `
      <h2>Day ${g.day} of ${CONFIG.week.days}</h2>
      <h3>Now</h3><ul>${now.map(li).join('') || '<li class="empty">Nothing on fire. Yet.</li>'}${done.map(d => d.startsWith('• ') ? `<li class="news">${esc(d.slice(2))}</li>` : `<li class="done">${esc(d)}</li>`).join('')}</ul>
      <h3>Can wait</h3><ul>${later.map(li).join('') || '<li class="empty">—</li>'}</ul>
      ${calls.length ? `<h3 class="vm">Voicemail</h3><ul>${calls.map(li).join('')}</ul>` : ''}
      <h3>Sheets (${open.length})</h3><ul>${open.map(j => `<li class="sheet ${g.isLate(j) ? 'late' : ''}" data-targets="${j.status === 'cutting' ? 'machine' : 'plyPallet'}">${j.status === 'cutting' ? '▶ ' : ''}${esc(j.name)}<br>&nbsp;&nbsp;${esc(j.material)} · due ${g.dueLabel(j)} · ${money(j.price)}</li>`).join('') || '<li class="empty">Board is clear.</li>'}</ul>`;
    for (const node of Array.from(this.pad.querySelectorAll<HTMLLIElement>('li[data-targets]'))) {
      const targets = (node.dataset.targets ?? '').split(',').filter(Boolean) as ObjectId[];
      if (targets.length) node.addEventListener('click', () => { this.close(); this.cb.goTo(targets, node.dataset.key); });
    }
  }

  /** The supplier on the line: pick a material and how many. Board cost and the delivery fee are paid now. */
  showPlyOrder(g: Game, order: (type: JobTypeId, qty: number) => void) {
    // labels act on pointerdown, so the same tap's click lands on whatever opens under the finger: ignore it
    const opened = performance.now();
    const live = () => performance.now() - opened > 350;
    const render = () => {
      const s = CONFIG.supply;
      const rows = CONFIG.jobs.types.map(t => {
        const buttons = s.orderSizes.map(n => {
          const q = g.plyQuote(t.id, n);
          return 'error' in q ? `<button disabled>${n}</button>`
            : `<button data-t="${t.id}" data-n="${n}">${n}<small>${money(q.boards + q.fee)}</small></button>`;
        }).join('');
        return `<div class="row"><div class="name">${esc(t.material)}<small>${g.stock[t.id]} on the pallet${g.deliveries.some(d => d.lines.some(l => l.type === t.id)) ? ' · more coming' : ''}</small></div>${buttons}</div>`;
      }).join('');
      const any = g.plyQuote(CONFIG.jobs.types[0].id, s.orderSizes[0]);
      const when = 'error' in any ? any.error : any.day === g.dayIndex ? `Truck in about ${s.leadMinutes} minutes.` : `After ${s.cutoffHour > 12 ? s.cutoffHour - 12 : s.cutoffHour}pm it comes tomorrow, ${g.formatTime(any.minute)}.`;
      this.ply.innerHTML = `<div class="card"><h1>Order ply</h1><p>${esc(when)} Price includes the ${money(s.deliveryFee)} delivery fee.</p>${rows}<button class="close">Never mind</button></div>`;
      for (const b of Array.from(this.ply.querySelectorAll<HTMLButtonElement>('button[data-t]'))) {
        b.addEventListener('click', () => { if (!live()) return; order(b.dataset.t as JobTypeId, Number(b.dataset.n)); this.hidePlyOrder(); });
      }
      this.ply.querySelector('.close')!.addEventListener('click', () => { if (live()) this.hidePlyOrder(); });
    };
    render();
    this.ply.style.display = 'flex';
  }
  setCanChip(text: string | null) {
    if (!text) { if (this.canChip.style.display !== 'none') this.canChip.style.display = 'none'; return; }
    if (this.canChip.textContent !== text) this.canChip.textContent = text;
    if (this.canChip.style.display !== 'block') this.canChip.style.display = 'block';
  }

  hidePlyOrder() { this.ply.style.display = 'none'; }

  setPaused(paused: boolean) { this.pausedEl.style.display = paused ? 'flex' : 'none'; }

  setMuted(m: boolean) { this.mute.textContent = m ? '🔇' : '🔊'; this.mute.title = m ? 'Sound off' : 'Sound on'; }

  /** One first-launch hint card at a time; null hides it. */
  showHint(text: string | null) {
    this.hint.style.display = text ? 'block' : 'none';
    if (text && this.hint.textContent !== text) this.hint.textContent = text;
  }

  /** Edge pointers for off-screen problems. x, y in logical px; angle in radians (0 = pointing right). */
  setPointers(list: { key: string; icon: string; x: number; y: number; angle: number; ring: boolean }[]) {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.key);
      let e = this.pointerEls.get(p.key);
      if (!e) {
        e = el('div', { className: 'ptr' });
        e.innerHTML = `<span class="arrow"></span><span class="icon"></span>`;
        this.pointers.appendChild(e);
        this.pointerEls.set(p.key, e);
      }
      (e.querySelector('.icon') as HTMLSpanElement).textContent = p.icon;
      e.style.left = `${p.x}px`; e.style.top = `${p.y}px`;
      (e.querySelector('.arrow') as HTMLSpanElement).style.transform = `rotate(${p.angle}rad) translateX(22px)`;
      e.classList.toggle('ring', p.ring);
    }
    for (const [k, e] of this.pointerEls) if (!seen.has(k)) { e.remove(); this.pointerEls.delete(k); }
  }
  /** For tests: what pointers are showing. */
  get pointerKeys() { return [...this.pointerEls.keys()]; }

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
  setHudVisible(v: boolean) { for (const e of [this.clock, this.tab, this.labels, this.pointers, this.hint, this.mute]) e.style.visibility = v ? 'visible' : 'hidden'; }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
