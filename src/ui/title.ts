// The landing screen: "KEEP IT RUNNING" in chunky pixel lettering over a slow shot of the shed from the street (the
// world draws that behind it), then Continue (only with a save; says where you were), New game (asks first if there's a
// save to lose) and Settings. The version's small in the corner. Shown on every load (a PWA launch too) before the cafe.
import { fitPixelText, pixelText } from './pixelText.js';

const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
.kirtitle { position: absolute; inset: 0; z-index: 55; display: flex; flex-direction: column; align-items: center; justify-content: space-between; pointer-events: auto; touch-action: none;
  padding: calc(${F(36)} + env(safe-area-inset-top, 0px)) 16px calc(${F(28)} + env(safe-area-inset-bottom, 0px)); box-sizing: border-box;
  background: linear-gradient(rgba(12, 9, 7, .62), rgba(12, 9, 7, .05) 42%, rgba(12, 9, 7, .72)); font-family: 'Courier New', monospace; color: #efe6d8; }
.kirtitle .logo { display: flex; flex-direction: column; align-items: center; gap: ${F(10)}; }
.kirtitle .logo .sub { margin: ${F(6)} 0 0; font-size: ${F(16)}; letter-spacing: 2px; color: #f4e2c4; text-shadow: 0 2px 0 #14110f; text-align: center; }
.kirtitle .menu { display: flex; flex-direction: column; gap: ${F(12)}; width: min(100%, ${F(320)}); }
.kirtitle button { font: bold ${F(20)} 'Courier New', monospace; color: #14110f; background: #f4e2c4; border: 3px solid #14110f; border-radius: 12px; box-shadow: 0 4px 0 #14110f; min-height: ${F(56)}; padding: ${F(8)} ${F(14)}; cursor: pointer; }
.kirtitle button.go { background: #8fd37a; }
.kirtitle button small { display: block; margin-top: 2px; font-size: ${F(13)}; font-weight: normal; }
.kirtitle button.danger { background: #e8644a; color: #fff8ec; }
.kirtitle .confirm { margin: 0; padding: ${F(12)}; text-align: center; background: rgba(36, 31, 26, .94); border: 2px solid #d48a3c; border-radius: 10px; font-size: ${F(17)}; line-height: 1.35; }
.kirtitle .row { display: flex; gap: ${F(10)}; margin-top: ${F(12)}; } .kirtitle .row button { flex: 1; }
.kirtitle .ver { position: absolute; right: calc(10px + env(safe-area-inset-right, 0px)); bottom: calc(6px + env(safe-area-inset-bottom, 0px)); font-size: ${F(11)}; color: rgba(239, 230, 216, .6); }
.kirtitle [hidden] { display: none !important; }
`;

export interface TitleOptions {
  /** Where the saved game is up to ("Mon, week 2 · rent due in 12 days"); null: no save, so no Continue. */
  summary: string | null;
  version: string;
  onContinue: () => void;
  /** New game, confirmed if there's a save to lose. */
  onNew: () => void;
  onSettings: () => void;
}

export class TitleScreen {
  readonly el: HTMLDivElement;
  private onResize = () => this.fit();
  private logos: HTMLCanvasElement[];

  constructor(private parent: HTMLElement, o: TitleOptions) {
    if (!document.getElementById('kir-title-css')) { const s = document.createElement('style'); s.id = 'kir-title-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = this.el = document.createElement('div');
    el.className = 'kirtitle';
    const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    el.innerHTML = `<div class="logo"><p class="sub">a one-man CNC shed</p></div>
      <div class="menu">
        ${o.summary !== null ? `<button class="go cont">Continue<small>${esc(o.summary)}</small></button>` : ''}
        <button class="new">New game</button>
        <button class="set">Settings</button>
        <p class="confirm" hidden>Start a new game? Your saved game will be replaced.<span class="row"><button class="cancel">Cancel</button><button class="danger sure">Start new game</button></span></p>
      </div>
      <div class="ver">${esc(o.version)}</div>`;
    this.logos = [pixelText('KEEP IT', { size: 14 }), pixelText('RUNNING', { size: 14, colour: '#f2a35b', shade: '#a3401c' })];
    const logo = el.querySelector('.logo')!;
    this.logos.forEach(c => logo.insertBefore(c, el.querySelector('.sub')));
    for (const t of ['pointerdown', 'pointerup', 'click'] as const) el.addEventListener(t, e => e.stopPropagation());
    const menu = el.querySelector<HTMLElement>('.menu')!, confirm = el.querySelector<HTMLElement>('.confirm')!;
    const showConfirm = (on: boolean) => { confirm.hidden = !on; menu.querySelectorAll<HTMLElement>(':scope > button').forEach(b => { b.hidden = on; }); };
    el.querySelector('.cont')?.addEventListener('click', () => o.onContinue());
    el.querySelector('.new')!.addEventListener('click', () => { if (o.summary !== null) showConfirm(true); else o.onNew(); });
    el.querySelector('.cancel')!.addEventListener('click', () => showConfirm(false));
    el.querySelector('.sure')!.addEventListener('click', () => o.onNew());
    el.querySelector('.set')!.addEventListener('click', () => o.onSettings());
    parent.appendChild(el);
    window.addEventListener('resize', this.onResize);
    this.fit();
  }

  /** The title's lettering, as big as fits (whole-number scale, so it stays crisp). */
  private fit() {
    const w = Math.min(this.parent.clientWidth || window.innerWidth, 640) - 40;
    this.logos.forEach(c => fitPixelText(c, w));
  }

  remove() { window.removeEventListener('resize', this.onResize); this.el.remove(); }
}
