// First-launch hints: three cards, one at a time, each cleared by doing the thing. Then a couple that wait for the
// moment they're about (the first fault, the first hands-on job). Remembered in localStorage (separately from the
// save) so they never come back unless reset.

export type HintId = 'drag' | 'interact' | 'notepad' | 'fault' | 'gesture';

const KEY = 'kir-hints-v1';
const ORDER: { id: HintId; text: string }[] = [
  { id: 'drag', text: 'Drag anywhere to walk' },
  { id: 'interact', text: 'Tap things to use them' },
  { id: 'notepad', text: 'Your notepad is on the left — tap a line to go there' },
];

const MOMENTS = {
  fault: 'Something’s broken. Follow the 🔧 — fix it where it is',
  gesture: 'Do it with your thumb: copy the grey dot',
};

export class Hints {
  private done = new Set<HintId>();

  constructor() {
    try { for (const id of JSON.parse(localStorage.getItem(KEY) ?? '[]') as HintId[]) this.done.add(id); } catch { /* none yet */ }
  }

  /** The card to show now, or null when they've all been done. */
  get current(): string | null { return ORDER.find(h => !this.done.has(h.id))?.text ?? null; }

  /** A hint for a moment (once the first three are done): its card if it hasn't been seen through yet. */
  when(id: Exclude<HintId, 'drag' | 'interact' | 'notepad'>): string | null {
    return this.current || this.done.has(id) ? null : MOMENTS[id];
  }

  mark(id: HintId) {
    if (this.done.has(id)) return;
    this.done.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...this.done])); } catch { /* storage blocked */ }
  }

  reset() {
    this.done.clear();
    try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  }
}
