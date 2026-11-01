// An order call, picked up: the job fills in on the notepad a line at a time as the caller describes it — who, the
// board, the price, when it's due — and only then the two answers. Declining ends the call. There's nothing to watch
// while they talk but this: what they're telling you.
const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .callsheet { display: none; margin: 0 0 ${F(10)}; padding: ${F(8)} ${F(10)}; border: 2px dashed #3d6f9e; border-radius: 8px; background: #e9f2fb; }
#kir-hud .callsheet.on { display: block; }
#kir-hud .callsheet h3 { margin: 0 0 4px; color: #2e5a86; text-decoration: none; }
#kir-hud .callsheet .ln { font-size: ${F(19)}; line-height: 1.3; padding: 2px 0; opacity: 0; transform: translateY(4px); transition: opacity .2s, transform .2s; }
#kir-hud .callsheet .ln.on { opacity: 1; transform: none; }
#kir-hud .callsheet .ln b.rush { color: #c0281e; }
#kir-hud .callsheet .ln.dots::after { content: ' …'; }
#kir-hud .callsheet .row { display: none; gap: ${F(10)}; margin-top: ${F(8)}; }
#kir-hud .callsheet .row.on { display: flex; }
#kir-hud .callsheet button { flex: 1; min-height: ${F(52)}; font: 700 ${F(18)} 'Courier New', monospace; border: 3px solid #14110f; border-radius: 10px; box-shadow: 0 3px 0 #14110f; color: #14110f; }
#kir-hud .callsheet button.yes { background: #8fd37a; }
#kir-hud .callsheet button.no { background: #d9cdb8; }
#kir-hud .callsheet button.no.hot { background: #e8644a; color: #fff8ec; animation: kir-hot 1.2s ease-in-out infinite; }
`;

/** One line of what the caller says: plain text, or with a bit of it bold (and maybe red, for a rush). */
export interface CallLine { text: string; bold?: string; rush?: boolean }

export class CallSheet {
  private timers: number[] = [];
  /** The call it's for (it closes if they ring off). */
  callId: number | null = null;

  constructor(readonly el: HTMLDivElement) {
    if (!document.getElementById('kir-callsheet-css')) { const s = document.createElement('style'); s.id = 'kir-callsheet-css'; s.textContent = CSS; document.head.appendChild(s); }
    el.className = 'callsheet';
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'click'] as const) el.addEventListener(t, e => e.stopPropagation());
  }

  get showing() { return this.callId !== null; }
  /** Filled in: the answers are up. */
  get ready() { return !!this.el.querySelector('.row.on'); }

  show(callId: number, lines: CallLine[], lineMs: number, highlightNo: boolean, take: () => void, decline: () => void) {
    this.close();
    this.callId = callId;
    const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.el.innerHTML = `<h3>📞 On the phone</h3>${lines.map(l => `<div class="ln">${esc(l.text)}${l.bold ? ` <b class="${l.rush ? 'rush' : ''}">${esc(l.bold)}</b>` : ''}</div>`).join('')}
      <div class="row"><button class="no${highlightNo ? ' hot' : ''}" data-act="decline">Turn it down</button><button class="yes" data-act="take">Take it</button></div>`;
    this.el.classList.add('on');
    const lns = [...this.el.querySelectorAll('.ln')];
    // the caller's still talking: the line being said trails off until the next one comes
    lns.forEach((ln, i) => this.timers.push(window.setTimeout(() => {
      lns.forEach(x => x.classList.remove('dots'));
      ln.classList.add('on');
      if (i < lns.length - 1) ln.classList.add('dots');
    }, i * lineMs)));
    this.timers.push(window.setTimeout(() => this.el.querySelector('.row')!.classList.add('on'), lines.length * lineMs));
    // on the click (after the finger's up), not pointerdown: the notepad slides away as you answer, and the rest of the
    // tap mustn't land on the shed and walk you off
    this.el.querySelector('.no')!.addEventListener('click', e => { e.preventDefault(); this.close(); decline(); });
    this.el.querySelector('.yes')!.addEventListener('click', e => { e.preventDefault(); this.close(); take(); });
  }

  close() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.callId = null;
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }
}
