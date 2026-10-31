// Speech in the world: a bubble over whoever's talking (it follows their head on screen), and your two or three
// replies as bubbles of your own, low on the screen with their tails pointing at you. Not a dialog box: the scene
// stays in view, and the bubbles are part of it.
const F = (n: number) => `calc(${n}px * var(--s, 1))`;
const CSS = `
#kir-hud .talk { position: absolute; transform: translate(-50%, -100%); max-width: ${F(250)}; width: max-content; z-index: 6; pointer-events: none;
  background: #fbfaf4; color: #14110f; border: 3px solid #14110f; border-radius: 16px; padding: ${F(7)} ${F(11)}; font: ${F(17)}/1.25 'Courier New', monospace;
  box-shadow: 0 4px 0 rgba(20,17,15,.35); transition: opacity .2s; }
#kir-hud .talk::after { content: ''; position: absolute; left: var(--tail, 50%); bottom: -12px; transform: translateX(-50%); border: 9px solid transparent; border-top-color: #14110f; }
#kir-hud .talk .nm { display: block; font-size: ${F(12)}; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #8a4f32; margin-bottom: 2px; }
#kir-hud .talk.you { background: #fff1c9; }
#kir-hud .talk.phone { background: #dff1ff; border-style: dashed; }
#kir-hud .talk.dim { opacity: .55; }
#kir-hud .talk .pic { display: block; width: ${F(150)}; height: auto; margin: 2px auto 4px; border-radius: 6px; background: radial-gradient(circle at 50% 40%, #5a4632, #241f1a 75%); }
#kir-hud .replies { position: absolute; left: 50%; bottom: calc(${F(18)} + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: min(92%, ${F(380)});
  display: flex; flex-direction: column; gap: ${F(8)}; z-index: 7; pointer-events: auto; }
#kir-hud .replies button { position: relative; text-align: left; font: ${F(17)}/1.25 'Courier New', monospace; color: #14110f; background: #fff1c9;
  border: 3px solid #14110f; border-radius: 16px; padding: ${F(9)} ${F(12)}; box-shadow: 0 4px 0 #14110f; }
#kir-hud .replies button.call { background: #dff1ff; }
#kir-hud .replies button.wind { background: #efe6d8; font-style: italic; }
#kir-hud .replies button.door { background: #8fd37a; font-weight: 700; }
#kir-hud .replies button.home { background: #d9cdb8; }
#kir-hud .replies button::after { content: ''; position: absolute; left: ${F(22)}; bottom: -11px; border: 8px solid transparent; border-top-color: #14110f; }
`;

export interface Reply { text: string; cls?: string }

export class Talk {
  private bubbles = new Map<string, HTMLDivElement>();
  private replies: HTMLDivElement;
  /** Taps anywhere (not on a reply) hurry the current line along. */
  onTap: (() => void) | null = null;

  constructor(private parent: HTMLElement, readonly cls = '') {
    if (!document.getElementById('kir-talk-css')) {
      const s = document.createElement('style'); s.id = 'kir-talk-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    this.replies = document.createElement('div');
    this.replies.className = `replies ${this.cls}`;
    this.replies.style.display = 'none';
    for (const t of ['pointerdown', 'pointerup', 'click'] as const) this.replies.addEventListener(t, e => e.stopPropagation());
    parent.appendChild(this.replies);
    window.addEventListener('pointerdown', () => this.onTap?.());
  }

  /** Put `text` over `who` (an id; one bubble each). `name`: shown small above it. */
  say(who: string, name: string, text: string, kind: '' | 'you' | 'phone' = '', img?: string | null) {
    let b = this.bubbles.get(who);
    if (!b) { b = document.createElement('div'); this.parent.appendChild(b); this.bubbles.set(who, b); }
    b.className = `talk ${kind} ${this.cls}`;
    b.dataset.who = who;
    b.innerHTML = `<span class="nm">${esc(name)}</span>${img ? `<img class="pic" alt="" src="${img}">` : ''}${esc(text)}`;
    b.style.display = 'block';
    // one voice at a time: the others' bubbles go (by day, people talk over each other: leave them)
    if (!this.cls) for (const [k, o] of this.bubbles) if (k !== who) o.style.display = 'none';
  }

  /** Follow a speaker on screen (CSS px of the top of their head). Off screen: hide. */
  place(who: string, x: number, y: number, visible = true) {
    const b = this.bubbles.get(who);
    if (!b) return;
    // kept on screen; the tail still points at whoever's talking
    const vw = this.parent.clientWidth || window.innerWidth, half = b.offsetWidth / 2, pad = 8;
    const cx = Math.max(half + pad, Math.min(vw - half - pad, x));
    b.style.left = `${Math.round(cx)}px`; b.style.top = `${Math.round(Math.max(b.offsetHeight + pad, y))}px`;
    b.style.setProperty('--tail', `${Math.round(Math.max(16, Math.min(b.offsetWidth - 16, half + (x - cx))))}px`);
    if (!visible) b.style.display = 'none';
  }

  hush(who?: string) {
    for (const [k, b] of this.bubbles) if (!who || k === who) b.style.display = 'none';
  }

  ask(options: Reply[], pick: (i: number) => void) {
    this.replies.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = o.text; b.className = o.cls ?? '';
      b.dataset.i = String(i);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.hideReplies(); pick(i); });
      this.replies.appendChild(b);
    });
    this.replies.style.display = 'flex';
  }
  hideReplies() { this.replies.style.display = 'none'; this.replies.innerHTML = ''; }
  get asking() { return this.replies.style.display === 'flex'; }
  /** For tests: the replies on offer. */
  get options() { return [...this.replies.querySelectorAll('button')].map(b => b.textContent ?? ''); }

  clear() { for (const b of this.bubbles.values()) b.remove(); this.bubbles.clear(); this.hideReplies(); this.onTap = null; }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
