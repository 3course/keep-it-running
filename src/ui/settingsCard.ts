// The settings card, over whatever's up (the title screen, or the pause card): sound and music volume, text speed,
// graphics, reduce motion, and reset save (asks first). Changes save as they're made (src/settings.ts); volume applies live;
// graphics needs a reload, which the host does.
import { SETTINGS, setSetting, type Graphics, type TextSpeed } from '../settings.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
.kirset { position: absolute; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(10, 8, 6, .8); pointer-events: auto; touch-action: none; }
.kirset .card { width: calc(100% - 24px); max-width: ${F(380)}; max-height: calc(100% - 20px); overflow-y: auto; box-sizing: border-box; padding: ${F(16)}; background: #241f1a; border: 2px solid #d48a3c; color: #efe6d8; font: ${F(18)} 'Courier New', monospace; }
.kirset h1 { margin: 0 0 ${F(8)}; font-size: ${F(26)}; font-weight: normal; text-align: center; }
.kirset .row { display: flex; align-items: center; justify-content: space-between; gap: ${F(10)}; margin: ${F(12)} 0; }
.kirset .row > span { flex: 0 0 auto; }
.kirset input[type=range] { flex: 1; min-width: 0; height: ${F(34)}; accent-color: #d48a3c; }
.kirset .val { flex: 0 0 ${F(48)}; text-align: right; color: #a2937f; }
.kirset .seg { display: flex; gap: ${F(4)}; flex-wrap: wrap; justify-content: flex-end; }
.kirset button { font: inherit; font-size: ${F(16)}; color: #efe6d8; background: #3a332b; border: 2px solid #5a4e40; min-height: ${F(44)}; padding: 0 ${F(12)}; cursor: pointer; }
.kirset button.on { background: #d48a3c; border-color: #d48a3c; color: #14110f; font-weight: bold; }
.kirset .note { margin: ${F(-4)} 0 ${F(8)}; font-size: ${F(14)}; color: #f2c76b; text-align: right; }
.kirset .btns { display: flex; gap: ${F(8)}; margin-top: ${F(14)}; }
.kirset .btns button { flex: 1; }
.kirset .danger { background: #6a2a22; border-color: #9e3d3d; }
.kirset .done { background: #4e8a46; border-color: #4e8a46; }
.kirset [hidden] { display: none !important; }
`;

export interface SettingsHost {
  /** Closed (Done). */
  close: () => void;
  /** The graphics setting changed: it applies on a reload, which the host does (after saving). */
  graphicsChanged: () => void;
  /** Reset save, confirmed: wipe the save and go back to the title. */
  resetSave: () => void;
}

export function showSettings(parent: HTMLElement, host: SettingsHost): { close: () => void } {
  if (!document.getElementById('kir-settings-css')) { const s = document.createElement('style'); s.id = 'kir-settings-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div');
  el.className = 'kirset';
  const seg = <T extends string>(key: 'textSpeed' | 'graphics', opts: [T, string][]) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="card">
    <h1>Settings</h1>
    <div class="row"><span>Sound</span><input type="range" min="0" max="100" step="5" data-k="sound" aria-label="Sound volume"><b class="val" data-for="sound"></b></div>
    <div class="row"><span>Music</span><input type="range" min="0" max="100" step="5" data-k="music" aria-label="Music volume"><b class="val" data-for="music"></b></div>
    <div class="row"><span>Text speed</span>${seg<TextSpeed>('textSpeed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']])}</div>
    <div class="row"><span>Graphics</span>${seg<Graphics>('graphics', [['auto', 'Auto'], ['low', 'Low'], ['bare', 'No shadows']])}</div>
    <p class="note" hidden>Applies after a reload…</p>
    <div class="row"><span>Reduce motion</span><button class="toggle" data-k="reduceMotion"></button></div>
    <div class="btns reset-row"><button class="danger reset">Reset save</button></div>
    <div class="btns confirm" hidden><button class="cancel">Keep it</button><button class="danger wipe">Wipe the save</button></div>
    <p class="confirm-text" hidden style="text-align:center;color:#f08a6b;margin:8px 0 0">Wipe your saved game? That can't be undone.</p>
    <div class="btns"><button class="done">Done</button></div>
  </div>`;
  for (const t of ['pointerdown', 'pointerup', 'click'] as const) el.addEventListener(t, e => e.stopPropagation());
  const refresh = () => {
    for (const k of ['sound', 'music'] as const) {
      (el.querySelector(`input[data-k=${k}]`) as HTMLInputElement).value = String(Math.round(SETTINGS[k] * 100));
      el.querySelector(`.val[data-for=${k}]`)!.textContent = `${Math.round(SETTINGS[k] * 100)}%`;
    }
    for (const k of ['textSpeed', 'graphics'] as const) el.querySelectorAll<HTMLButtonElement>(`.seg[data-k=${k}] button`).forEach(b => b.classList.toggle('on', b.dataset.v === SETTINGS[k]));
    const rm = el.querySelector<HTMLButtonElement>('.toggle')!; rm.textContent = SETTINGS.reduceMotion ? 'On' : 'Off'; rm.classList.toggle('on', SETTINGS.reduceMotion);
  };
  el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(i => i.addEventListener('input', () => { setSetting(i.dataset.k as 'sound' | 'music', Number(i.value) / 100); refresh(); }));
  el.querySelectorAll<HTMLButtonElement>('.seg button').forEach(b => b.addEventListener('click', () => {
    const k = (b.parentElement as HTMLElement).dataset.k as 'textSpeed' | 'graphics';
    if (SETTINGS[k] === b.dataset.v) return;
    setSetting(k, b.dataset.v as never); refresh();
    if (k === 'graphics') { el.querySelector<HTMLElement>('.note')!.hidden = false; window.setTimeout(() => host.graphicsChanged(), 700); }
  }));
  el.querySelector('.toggle')!.addEventListener('click', () => { setSetting('reduceMotion', !SETTINGS.reduceMotion); refresh(); });
  const ask = (on: boolean) => { for (const s of ['.confirm', '.confirm-text']) el.querySelector<HTMLElement>(s)!.hidden = !on; el.querySelector<HTMLElement>('.reset-row')!.hidden = on; };
  el.querySelector('.reset')!.addEventListener('click', () => ask(true));
  el.querySelector('.cancel')!.addEventListener('click', () => ask(false));
  el.querySelector('.wipe')!.addEventListener('click', () => host.resetSave());
  const close = () => { el.remove(); host.close(); };
  el.querySelector('.done')!.addEventListener('click', close);
  refresh();
  parent.appendChild(el);
  return { close: () => el.remove() };
}
