// First-launch hints: three cards, one at a time, each cleared by doing the thing. Then a couple that wait for the
// moment they're about (the first fault, the first hands-on job). Remembered in localStorage (separately from the
// save) so they never come back unless reset.
import { getJson, KEYS, removeItem, setItem } from '../storage.js';
import { say, type PromptKey } from '../input/prompts.js';

const HINT_IDS = ['drag', 'interact', 'notepad', 'fault', 'gesture', 'neighbours'] as const;
export type HintId = (typeof HINT_IDS)[number];

// (the words are the input's: touch, keyboard or pad — src/input/prompts.ts)
const ORDER: { id: HintId; text: PromptKey }[] = [
  { id: 'drag', text: 'walk' },
  { id: 'interact', text: 'interact' },
  { id: 'notepad', text: 'notepad' },
];

export class Hints {
  private done = new Set<HintId>();

  constructor() {
    const ids: readonly string[] = HINT_IDS;
    for (const id of getJson(KEYS.hints, Array.isArray) ?? []) if (typeof id === 'string' && ids.includes(id)) this.done.add(id as HintId);
  }

  /** The card to show now, or null when they've all been done. */
  get current(): string | null { const h = ORDER.find(x => !this.done.has(x.id)); return h ? say(h.text) : null; }

  /** A hint for a moment (once the first three are done): its card if it hasn't been seen through yet. */
  when(id: Exclude<HintId, 'drag' | 'interact' | 'notepad'>): string | null {
    return this.current || this.done.has(id) ? null : say(id);
  }

  mark(id: HintId) {
    if (this.done.has(id)) return;
    this.done.add(id);
    setItem(KEYS.hints, JSON.stringify([...this.done]));
  }

  reset() {
    this.done.clear();
    removeItem(KEYS.hints);
  }
}
