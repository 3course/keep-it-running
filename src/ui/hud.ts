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

/**
 * A size that scales with the viewport but never drops below `n` real pixels on screen. Every font and
 * touch target in the HUD goes through this: on a phone the minimums hold, on a big screen it all grows.
 * (`--k` is the stage's scale: logical px → screen px.)
 */
const F = (n: number) => `max(${n}px, calc(${n}px / var(--k, 1)))`;

const CSS = `
#kir-hud { position: fixed; pointer-events: none; z-index: 10; overflow: hidden; }
#kir-hud .stage { position: absolute; left: 0; top: 0; width: ${WORLD.view.width}px; height: ${WORLD.view.height}px; transform-origin: 0 0; font-family: 'Courier New', monospace; }
#kir-hud .clock { position: absolute; right: 10px; top: 10px; pointer-events: auto; padding: 5px 10px; border-radius: 8px; min-height: ${F(48)}; box-sizing: border-box;
  background: rgba(20,17,15,.6); color: #efe6d8; font-size: ${F(18)}; text-align: right; line-height: 1.25; cursor: pointer; }
#kir-hud .clock .cash { color: #f2c76b; }
#kir-hud .clock .neg { color: #f08a6b; }
#kir-hud .tab { position: absolute; left: 0; top: 150px; width: ${F(48)}; height: ${F(130)}; pointer-events: auto; cursor: pointer;
  background: #f4ecd2; border: 1px solid #b9a77a; border-left: none; border-radius: 0 10px 10px 0; box-shadow: 2px 2px 6px rgba(0,0,0,.4);
  writing-mode: vertical-rl; text-orientation: mixed; font-family: ${HAND}; font-size: ${F(20)}; color: #4a3a22; display: flex; align-items: center; justify-content: center; }
#kir-hud .tab .dot { writing-mode: horizontal-tb; position: absolute; top: -8px; right: -8px; min-width: ${F(24)}; height: ${F(24)}; border-radius: 12px;
  background: #c0281e; color: #fff; font: bold ${F(15)} sans-serif; display: none; align-items: center; justify-content: center; }
#kir-hud .tab .dot.pulse { animation: kir-pulse .7s ease-in-out infinite; }
@keyframes kir-pulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(192,40,30,.7); } 50% { transform: scale(1.35); box-shadow: 0 0 0 6px rgba(192,40,30,0); } }
#kir-hud .catcher { position: absolute; inset: 0; pointer-events: auto; display: none; }
#kir-hud .pad { position: absolute; left: 0; top: 60px; bottom: 60px; width: calc(100% - 30px); max-width: 360px; pointer-events: auto; transform: translateX(-105%);
  transition: transform .22s ease-out; background: #f4ecd2; border-radius: 0 10px 10px 0; box-shadow: 4px 4px 14px rgba(0,0,0,.5);
  padding: 14px 16px 14px 20px; box-sizing: border-box; overflow-y: auto; font-family: ${HAND}; color: #2b2418;
  background-image: repeating-linear-gradient(#f4ecd2 0 calc(${F(32)} - 1px), #c9d6e6 calc(${F(32)} - 1px) ${F(32)}); }
#kir-hud .pad.open { transform: translateX(0); }
#kir-hud .pad h2 { margin: 0 0 4px; font-size: ${F(26)}; font-weight: normal; }
#kir-hud .pad h3 { margin: 12px 0 2px; font-size: ${F(24)}; color: #8a2a1a; font-weight: normal; text-decoration: underline; }
#kir-hud .pad ul { list-style: none; margin: 0; padding: 0; }
#kir-hud .pad li { font-size: ${F(19)}; line-height: 1.3; padding: 6px 0; min-height: ${F(48)}; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; cursor: pointer; }
#kir-hud .pad li.urgent { color: #9a1f12; }
#kir-hud .pad li.sheet .sub { color: #6b5d45; }
#kir-hud .pad li.sheet .sub span { white-space: nowrap; }
#kir-hud .pad li.sheet.late { color: #9a1f12; }
#kir-hud .pad li.more { color: #3d6f9e; text-decoration: underline; }
#kir-hud .toast { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%); max-width: calc(100% - 24px); padding: 10px 16px; border-radius: 22px;
  min-height: ${F(44)}; box-sizing: border-box; background: rgba(20,17,15,.82); color: #efe6d8; font: ${F(18)} 'Courier New', monospace;
  width: max-content; text-align: center; text-wrap: balance; line-height: 1.25; pointer-events: none; cursor: pointer; opacity: 0; transition: opacity .25s; }
#kir-hud .toast.show { opacity: 1; pointer-events: auto; } /* faded out, it mustn't eat taps on the world */
#kir-hud .log .card { text-align: left; max-height: 75%; display: flex; flex-direction: column; }
#kir-hud .log ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; font-size: ${F(18)}; line-height: 1.35; }
#kir-hud .log li { border-bottom: 1px solid #3a3129; padding: 6px 0; }
#kir-hud .log li.empty { color: #a2937f; border: 0; }
#kir-hud .log button { align-self: center; background: #4a4540; }
#kir-hud .bubble { position: absolute; transform: translate(-50%, -100%); background: #f4ecd2; color: #2b2418; font: ${F(20)} ${HAND};
  padding: 6px 12px; border-radius: 12px; box-shadow: 0 2px 6px rgba(0,0,0,.4); white-space: nowrap; pointer-events: none; display: none; }
#kir-hud .bubble::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -6px; border: 7px solid transparent; border-bottom: 0; border-top-color: #f4ecd2; }
#kir-hud .modal.ply .card { width: calc(100% - 16px); max-width: 380px; text-align: left; padding: 14px 12px; }
#kir-hud .ply h1, #kir-hud .ply p { text-align: center; }
#kir-hud .ply .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px 0; }
#kir-hud .ply .row .name { flex: 1 0 100%; font-size: ${F(18)}; line-height: 1.2; }
#kir-hud .ply .row .name small { color: #a2937f; font-size: ${F(15)}; display: block; }
#kir-hud .ply .row button { flex: 1; margin: 0; min-width: 0; min-height: ${F(56)}; padding: 6px 2px; font-size: ${F(18)}; background: #4e8a46; line-height: 1.15; }
#kir-hud .ply .row button small { display: block; font-size: ${F(13)}; color: #d8ecd0; }
#kir-hud .ply .row button em { display: block; font-size: ${F(12)}; font-style: normal; color: #f2c76b; white-space: nowrap; }
#kir-hud .ply .row button:disabled { background: #4a4540; color: #a2937f; }
#kir-hud .ply .close { display: block; margin: 12px auto 0; background: #4a4540; }
#kir-hud .pad .empty { font-size: ${F(19)}; color: #8a7d64; }
#kir-hud .modal { position: absolute; inset: 0; background: rgba(0,0,0,.65); pointer-events: auto; display: none; align-items: center; justify-content: center; }
#kir-hud .modal .card { width: calc(100% - 24px); max-width: 360px; background: #241f1a; border: 2px solid #d48a3c; color: #efe6d8; padding: 18px; box-sizing: border-box; text-align: center; }
#kir-hud .modal h1 { font-size: ${F(26)}; margin: 0 0 10px; font-weight: normal; }
#kir-hud .modal p { font-size: ${F(18)}; color: #a2937f; margin: 8px 0; line-height: 1.35; }
#kir-hud .modal p.warn { color: #f08a6b; }
#kir-hud .modal button { font: inherit; font-size: ${F(19)}; color: #efe6d8; border: 0; padding: 10px 14px; margin: 12px 6px 0; min-width: 130px; min-height: ${F(48)}; cursor: pointer; }
#kir-hud .modal .go { background: #4e8a46; } #kir-hud .modal .ot { background: #9e3d3d; }
#kir-hud .paused { cursor: pointer; }
#kir-hud .paused .card { border-color: #a2937f; }
#kir-hud .labels { position: absolute; inset: 0; pointer-events: none; }
#kir-hud .lbl { position: absolute; transform: translate(-50%, -100%); width: max-content; display: flex; flex-direction: column-reverse; align-items: center; gap: 6px; }
#kir-hud .lbl button { pointer-events: auto; font: 600 ${F(20)} 'Courier New', monospace; color: #14110f; background: #f2c76b; border: 2px solid #14110f;
  border-radius: 10px; padding: 8px 12px; min-height: ${F(48)}; box-shadow: 0 3px 0 #14110f; max-width: 300px; line-height: 1.15; text-wrap: balance; touch-action: none; }
#kir-hud .lbl button.hold { background: #f2a35b; }
#kir-hud .lbl button.held { background: #8fd37a; }
#kir-hud .lbl button.tick { background: #8fd37a; animation: kir-tick .35s ease-out; }
@keyframes kir-tick { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
#kir-hud .lbl .status { font: ${F(16)} 'Courier New', monospace; color: #efe6d8; background: rgba(20,17,15,.8); padding: 5px 8px; border-radius: 6px;
  white-space: pre-line; text-align: center; max-width: 330px; }
#kir-hud .stick { position: absolute; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%; border: 2px solid rgba(255,255,255,.45);
  background: rgba(20,17,15,.15); display: none; pointer-events: none; }
#kir-hud .stick .knob { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; background: rgba(255,255,255,.6); }
#kir-hud .tag { position: absolute; right: 4px; bottom: 2px; font: ${F(10)} 'Courier New', monospace; color: rgba(239,230,216,.6); pointer-events: none; }
#kir-hud .summary { position: absolute; inset: 0; background: #14110f; color: #efe6d8; pointer-events: auto; overflow-y: auto; display: none;
  padding: 14px 14px 30px; box-sizing: border-box; font: ${F(17)} 'Courier New', monospace; }
#kir-hud .summary h1 { font-size: ${F(26)}; font-weight: normal; margin: 0; }
#kir-hud .summary h2 { font-size: ${F(14)}; color: #a2937f; margin: 0 0 6px; font-weight: normal; letter-spacing: 1px; text-transform: uppercase; }
#kir-hud .summary .sub { color: #a2937f; margin: 4px 0 10px; }
#kir-hud .summary section { background: #241f1a; border: 2px solid #4a3f33; padding: 8px 12px; margin-bottom: 8px; }
#kir-hud .summary .row { display: flex; justify-content: space-between; gap: 8px; line-height: 1.5; }
#kir-hud .summary .small { font-size: ${F(14)}; }
#kir-hud .summary .dim { color: #a2937f; } #kir-hud .summary .good { color: #8fd37a; } #kir-hud .summary .bad { color: #f08a6b; } #kir-hud .summary .money { color: #f2c76b; }
#kir-hud .summary .verdict { margin: 8px 0 2px; }
#kir-hud .summary .upg { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 8px 0; }
#kir-hud .summary .upg small { color: #a2937f; }
#kir-hud .summary button { font: inherit; color: #efe6d8; background: #8f5a22; border: 0; padding: 10px 14px; min-height: ${F(48)}; cursor: pointer; }
#kir-hud .summary button:disabled { background: #4a4540; color: #a2937f; }
#kir-hud .summary .upg button { background: #4e8a46; min-width: 90px; }
#kir-hud .summary .upg button:disabled { background: #4a4540; color: #a2937f; }
#kir-hud .summary .next { display: block; width: 240px; margin: 12px auto 6px; font-size: ${F(19)}; }
#kir-hud .summary .feedback { text-align: center; margin: 10px 0 6px; }
#kir-hud .summary .copy { display: block; margin: 0 auto; background: #3d6f9e; }
#kir-hud .summary .status { text-align: center; color: #a2937f; font-size: ${F(14)}; }
#kir-hud .summary .reset { display: block; text-align: center; margin-top: 14px; padding: 12px; color: #a2937f; font-size: ${F(15)}; text-decoration: underline; cursor: pointer; }
#kir-hud .pointers { position: absolute; inset: 0; pointer-events: none; }
#kir-hud .ptr { position: absolute; width: ${F(44)}; height: ${F(44)}; transform: translate(-50%, -50%); border-radius: 50%; background: rgba(20,17,15,.78); box-sizing: border-box;
  border: 2px solid #f2c76b; display: flex; align-items: center; justify-content: center; font-size: ${F(22)}; line-height: 1; transition: transform .08s; }
#kir-hud .ptr .arrow { position: absolute; left: 50%; top: 50%; width: 0; height: 0; margin: -7px 0 0 -5px;
  border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-left: 10px solid #f2c76b; transform-origin: 5px 7px; }
#kir-hud .ptr.ring { transform: translate(-50%, -50%) scale(1.2); border-color: #f08a6b; }
#kir-hud .ptr.ring .arrow { border-left-color: #f08a6b; }
#kir-hud .hint { position: absolute; left: 50%; bottom: 130px; transform: translateX(-50%); width: calc(100% - 40px); max-width: 340px; padding: 14px 16px; display: none; box-sizing: border-box;
  background: #f4ecd2; color: #2b2418; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.45); text-align: center; pointer-events: none;
  font: ${F(20)} ${HAND}; }
#kir-hud .sign { position: absolute; transform: translate(-50%, -50%); font: bold ${F(13)} 'Courier New', monospace; letter-spacing: 1px; color: #f4ecd2;
  background: #4a3a22; border: 1px solid #2b2418; border-radius: 3px; padding: 2px 6px; white-space: nowrap; pointer-events: none; }
#kir-hud .pad h3.vm { color: #3d6f9e; }
#kir-hud .pad li.callback { color: #2e5a86; }
#kir-hud .canchip { position: absolute; right: 10px; bottom: 26px; pointer-events: auto; font: 600 ${F(18)} 'Courier New', monospace; color: #efe6d8; min-height: ${F(48)};
  background: rgba(20,17,15,.75); border: 2px solid #c0281e; border-radius: 24px; padding: 8px 14px; touch-action: none; }
#kir-hud .canchip::before { content: '🍺 '; }
#kir-hud .mute { position: absolute; right: 10px; top: 76px; width: ${F(48)}; height: ${F(48)}; pointer-events: auto; cursor: pointer; border: 0; border-radius: 8px;
  background: rgba(20,17,15,.6); color: #efe6d8; font-size: ${F(22)}; line-height: 1; padding: 0; }
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
  private toast: HTMLDivElement;
  private toastTimer = 0;
  private toastSeen: string | null | undefined = undefined; // newest log line already toasted (undefined: not started)
  private logPanel: HTMLDivElement;
  private logLines: string[] = [];
  private sheetsOpen = false; // "+ N more jobs" expanded
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
    this.toast = el('div', { className: 'toast' });
    this.toast.addEventListener('click', () => this.showLog());
    this.logPanel = el('div', { className: 'modal log' });
    this.logPanel.addEventListener('click', e => { if (e.target === this.logPanel) this.hideLog(); });
    this.canChip = el('button', { className: 'canchip' });
    this.canChip.style.display = 'none';
    this.canChip.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.cb.putCanDown(); });
    this.mute.addEventListener('click', e => { e.stopPropagation(); this.setMuted(this.cb.toggleMute()); });
    this.stage.append(this.labels, this.bubble, this.pointers, this.hint, this.stick, this.catcher, this.clock, this.mute, this.tab, this.pad, this.toast, this.canChip, this.eod, this.ply, this.logPanel, this.summary, this.pausedEl, tag);
    document.body.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
    this.layout();
  }

  /** Keep the overlay exactly over the (letterboxed, FIT-scaled) canvas. */
  layout() {
    const r = this.canvas.getBoundingClientRect();
    Object.assign(this.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const k = r.width / WORLD.view.width;
    this.stage.style.transform = `scale(${k})`;
    this.stage.style.setProperty('--k', String(k)); // sizes in the CSS hold their on-screen minimums at any scale
  }

  open() { this.isOpen = true; this.pad.classList.add('open'); this.catcher.style.display = 'block'; }
  close() { this.isOpen = false; this.pad.classList.remove('open'); this.catcher.style.display = 'none'; }

  /** Newest event as a toast strip: one line, 2.5 s, a newer one replaces it. Tap it for the Log. */
  private updateToast(log: string[]) {
    this.logLines = log;
    const newest = log[0] ?? null;
    if (this.toastSeen === undefined) { this.toastSeen = newest; return; } // don't replay the last session's news
    if (newest === this.toastSeen) return;
    this.toastSeen = newest;
    if (!newest) return;
    this.toast.textContent = newest;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2500);
  }

  /** Today's events, newest first, in a scrollable panel. */
  showLog() {
    const lines = this.logLines;
    this.logPanel.innerHTML = `<div class="card"><h1>Today so far</h1><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('') || '<li class="empty">Nothing yet.</li>'}</ul><button>Close</button></div>`;
    this.logPanel.querySelector('button')!.addEventListener('click', () => this.hideLog());
    this.logPanel.style.display = 'flex';
  }
  hideLog() { this.logPanel.style.display = 'none'; }

  /** The sheets on the board, one line per job: the next three by due time, the rest behind "+ N more jobs". */
  private sheetsHtml(g: Game): string {
    const open = [...g.jobs].filter(j => j.status === 'queued' || j.status === 'cutting');
    const jobs = new Map<string, { name: string; left: number; total: number; material: string; due: number; dueLabel: string; price: number; cutting: boolean; late: boolean }>();
    for (const j of open) {
      const m = /^(.*) \((\d+)\/(\d+)\)$/.exec(j.name);
      const name = m ? m[1] : j.name, total = m ? Number(m[3]) : 1;
      const key = `${name}|${j.dueDay}|${j.deadlineMinute}`;
      const e = jobs.get(key) ?? { name, left: 0, total, material: j.material.replace(/^\d+mm /, ''), due: g.dueAt(j), dueLabel: g.dueLabel(j), price: 0, cutting: false, late: false };
      e.left += 1; e.price += j.price; e.cutting ||= j.status === 'cutting'; e.late ||= g.isLate(j);
      jobs.set(key, e);
    }
    const list = [...jobs.values()].sort((a, b) => a.due - b.due);
    if (!list.length) return '';
    const line = (e: typeof list[number]) => `<li class="sheet ${e.late ? 'late' : ''}" data-targets="${e.cutting ? 'machine' : 'plyPallet'}">${e.cutting ? '▶ ' : ''}${esc(e.name)}`
      // the detail line breaks only between its parts, never inside one
      + `<span class="sub">${[e.total > 1 ? `${e.left} of ${e.total} left` : '', esc(e.material), e.dueLabel, money(e.price)].filter(Boolean).map(x => `<span>${x}</span>`).join(' · ')}</span></li>`;
    const shown = this.sheetsOpen ? list : list.slice(0, 3);
    const more = list.length - shown.length;
    const sheets = open.length;
    return `<h3>Sheets (${sheets} sheet${sheets === 1 ? '' : 's'}, ${list.length} job${list.length === 1 ? '' : 's'})</h3><ul>${shown.map(line).join('')}`
      + (more > 0 ? `<li class="more" data-more="1">+ ${more} more job${more === 1 ? '' : 's'}</li>` : list.length > 3 ? `<li class="more" data-more="0">Show fewer</li>` : '') + '</ul>';
  }

  update(g: Game, items: TodoItem[], log: string[]) {
    this.updateToast(log);
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
    const sig = JSON.stringify([items.map(i => i.key + i.text), open.map(j => [j.id, j.status, g.isLate(j)]), g.day, this.sheetsOpen]);
    if (sig === this.padSig) return;
    this.padSig = sig;
    const isCallback = (i: TodoItem) => i.key.startsWith('callback-');
    const now = items.filter(i => i.urgent), later = items.filter(i => !i.urgent && !isCallback(i)), calls = items.filter(isCallback);
    const li = (i: TodoItem) => `<li class="${i.urgent ? 'urgent' : ''}${isCallback(i) ? ' callback' : ''}" data-key="${esc(i.key)}" data-targets="${i.targets.join(',')}">${esc(i.text)}</li>`;
    // only sections with something in them: the list is just the list
    const section = (title: string, list: TodoItem[], cls = '') => list.length ? `<h3${cls ? ` class="${cls}"` : ''}>${title}</h3><ul>${list.map(li).join('')}</ul>` : '';
    const body = section('Now', now) + section('Can wait', later) + section('Voicemail', calls, 'vm') + this.sheetsHtml(g);
    this.pad.innerHTML = `<h2>Day ${g.day} of ${CONFIG.week.days}</h2>${body || '<p class="empty">Nothing on fire. Yet.</p>'}`;
    for (const node of Array.from(this.pad.querySelectorAll<HTMLLIElement>('li[data-more]'))) {
      node.addEventListener('click', () => { this.sheetsOpen = node.dataset.more === '1'; this.padSig = ''; this.update(g, items, log); });
    }
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
            : `<button data-t="${t.id}" data-n="${n}">${n}<small>${money(q.boards + q.fee)}</small>${q.fee ? '' : '<em>no fee</em>'}</button>`;
        }).join('');
        return `<div class="row"><div class="name">${esc(t.material)}<small>${g.stock[t.id]} on the pallet${g.deliveries.some(d => d.lines.some(l => l.type === t.id)) ? ' · more coming' : ''}</small></div>${buttons}</div>`;
      }).join('');
      const any = g.plyQuote(CONFIG.jobs.types[0].id, s.orderSizes[0]);
      const when = 'error' in any ? any.error : any.day === g.dayIndex ? `Truck in about ${s.leadMinutes} minutes.` : `After ${s.cutoffHour > 12 ? s.cutoffHour - 12 : s.cutoffHour}pm it comes tomorrow, ${g.formatTime(any.minute)}.`;
      this.ply.innerHTML = `<div class="card"><h1>Order ply</h1><p>${esc(when)} Prices include delivery: ${money(s.deliveryFee)}, free on ${s.freeDeliveryFrom} sheets.</p>${rows}<button class="close">Never mind</button></div>`;
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
      e.style.left = `${p.x}px`; e.style.top = `${p.y}px`; // centred by the CSS transform
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
  setHudVisible(v: boolean) { for (const e of [this.clock, this.tab, this.labels, this.pointers, this.hint, this.mute, this.toast]) e.style.visibility = v ? 'visible' : 'hidden'; }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
