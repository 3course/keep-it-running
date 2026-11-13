// Words that depend on how you're playing: "Drag anywhere to walk" on a phone, "Left stick to walk" on a pad, "WASD or
// arrow keys to walk" at a keyboard. The view tells this module which input is in use (Input.onKind); anything that
// shows instructions asks `say(key)` when it draws, so the words switch the moment the player picks up the pad, a key,
// or touches the screen.
import type { InputKind } from './input.js';
import { padGlyph, type PadButton, type PadFamily } from './pad.js';

let kind: InputKind = 'touch', family: PadFamily = 'xbox';

/** The input in use (the view calls this whenever it changes). */
export function setPromptInput(k: InputKind, f: PadFamily) { kind = k; family = f; }
export const promptKind = () => kind;

const KEYS: Record<PadButton, string> = { confirm: 'E', back: 'Esc', carry: 'Q', notepad: 'Tab', prev: '[', next: ']', log: 'L', pause: 'Esc', up: '↑', down: '↓', left: '←', right: '→' };
/** A button's name for the input in use ('' on touch). */
export function glyph(b: PadButton): string { return kind === 'pad' ? padGlyph(b, family) : kind === 'keyboard' ? KEYS[b] : ''; }

const LINES = {
  walk: { touch: 'Drag anywhere to walk', keyboard: 'WASD or arrow keys to walk', pad: 'Left stick to walk' },
  interact: { touch: 'Tap things to use them', keyboard: 'E uses what’s ringed ([ and ] for the others)', pad: '{confirm} uses what’s ringed ({prev} / {next} for the others)' },
  notepad: { touch: 'Your notepad is on the left — tap a line to go there', keyboard: 'Tab for your notepad — Enter on a line to go there', pad: '{notepad} for your notepad — {confirm} on a line to go there' },
  fault: { touch: 'Something’s broken. Follow the 🔧 — fix it where it is', keyboard: 'Something’s broken. Follow the 🔧 — fix it where it is', pad: 'Something’s broken. Follow the 🔧 — fix it where it is' },
  gesture: { touch: 'Do it with your thumb: copy the grey dot', keyboard: 'E to press, hold E to hold, hold E and steer with the arrows to drag', pad: 'Hold {confirm} to hold, {confirm} to tap, hold {confirm} and steer the left stick to drag' },
  skip: { touch: 'Tap to skip', keyboard: 'E to skip', pad: '{confirm} to skip' },
  signNow: { touch: 'Tap to sign', keyboard: 'Sign it (E)', pad: 'Sign it ({confirm})' },
  canTap: { touch: 'tap one', keyboard: 'walk up and press E', pad: 'walk up and press {confirm}' },
  wipeAgain: { touch: 'Tap again to wipe this game and start fresh', keyboard: 'Press again to wipe this game and start fresh', pad: 'Press again to wipe this game and start fresh' },
} as const;
export type PromptKey = keyof typeof LINES;

/** The line for the input in use, with its buttons filled in. */
export function say(key: PromptKey): string {
  return LINES[key][kind].replace(/\{(\w+)\}/g, (_, b: string) => glyph(b as PadButton) || b);
}
