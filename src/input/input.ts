// One input layer for touch, keyboard and gamepad. Touch keeps its own handlers (the stick, the labels, the gesture
// cards are all pointer events, unchanged); this turns the keyboard and a pad into the same small set of actions, polled
// once a frame, and remembers which of the three the player used last so prompts and hints can match it.
//
//   action    pad (standard mapping)      keyboard
//   move      left stick, d-pad           WASD / arrows
//   confirm   A (bottom face)             E, Enter
//   back      B (right face)              Esc, Backspace
//   carry     X (left face)               Q
//   notepad   Y (top face)                Tab
//   prev/next LB / RB                     [ / ]
//   log       View                        L
//   pause     Menu                        Esc (in the shed), P
//   aim       right stick                 —
//
// Time is frame time (`poll(dt)`), never the wall clock, so tests that step frames get the same answers every run.
import { padFamily, readPad, type PadButton, type PadFamily, type PadState, type VirtualPad } from './pad.js';

export type InputKind = 'touch' | 'keyboard' | 'pad';
export type Action = PadButton;

const KEYMAP: Record<string, Action[]> = {
  e: ['confirm'], enter: ['confirm'],
  escape: ['back'], backspace: ['back'],
  q: ['carry'], tab: ['notepad'], '[': ['prev'], ']': ['next'], l: ['log'], p: ['pause'],
  arrowup: ['up'], w: ['up'], arrowdown: ['down'], s: ['down'], arrowleft: ['left'], a: ['left'], arrowright: ['right'], d: ['right'],
};
const NAV: Action[] = ['up', 'down', 'left', 'right'];
/** Nav repeat when a direction is held: the first step at once, again after `delay`, then every `every` (seconds). */
const REPEAT = { delay: 0.38, every: 0.12 };
/** A stick past this counts as a direction for menus (lower than walking, which uses the whole range). */
const NAV_STICK = 0.55;

export class Input {
  /** Tests: a pad that stands in for a real one (the Gamepad API isn't there to drive in headless Chromium). */
  virtualPad: VirtualPad | null = null;
  /** The input used last: what the prompts show. */
  kind: InputKind = 'touch';
  /** The connected pad's family (for its button letters). */
  family: PadFamily = 'xbox';
  /** A pad is connected now. */
  padConnected = false;

  private keysDown = new Set<string>();
  private keysEdge = new Set<string>();   // pressed since the last poll (a tap inside one frame still counts)
  private now = new Set<Action>();
  private was = new Set<Action>();
  private pad: PadState | null = null;
  private repeat = new Map<Action, number>(); // seconds until a held direction steps again
  private navFired = new Set<Action>();
  private fromStick = new Set<Action>();
  private lastPadSig = '';
  private listeners = new Set<(k: InputKind) => void>();
  /** Told when a pad goes away mid-game (the view pauses). */
  onDisconnect: (() => void) | null = null;
  /** Told when a pad connects. */
  onConnect: (() => void) | null = null;

  constructor(private target: Window = window) {
    target.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'tab') e.preventDefault(); // Tab is the notepad, not the browser's focus ring
      if (!e.repeat) this.keysEdge.add(k);
      this.keysDown.add(k);
      this.use('keyboard');
    }, true);
    target.addEventListener('keyup', e => this.keysDown.delete(e.key.toLowerCase()), true);
    target.addEventListener('blur', () => this.keysDown.clear());
    // a real finger or mouse (the pad's own pointer events are synthetic: they don't count)
    target.addEventListener('pointerdown', e => { if (e.isTrusted) this.use('touch'); }, true);
    target.addEventListener('gamepadconnected', () => { this.padConnected = true; this.onConnect?.(); });
    target.addEventListener('gamepaddisconnected', () => this.disconnected());
  }

  /** Be told when the input kind changes (prompts and hints swap). Returns the unsubscribe. */
  onKind(f: (k: InputKind) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }

  use(k: InputKind) {
    if (this.kind === k) return;
    this.kind = k;
    for (const f of this.listeners) f(k);
  }

  private disconnected() {
    this.padConnected = !!readPad(null);
    if (!this.padConnected) { this.pad = null; this.onDisconnect?.(); }
  }

  /** Read everything once for this frame (`dt` real seconds, frame time). */
  poll(dt: number) {
    this.was = this.now;
    this.now = new Set();
    const p = readPad(this.virtualPad);
    if (!p) this.fromStick.clear();
    // a virtual pad unplugged (tests): the same as a real one going
    if (this.pad && !p && this.virtualPad === null && this.padConnected) this.disconnected();
    // a pad just turned up (switched on, plugged in): its prompts from now, before the first press
    if (p && !this.pad) this.use('pad');
    this.pad = p;
    if (p) {
      this.padConnected = true;
      this.family = padFamily(p.id);
      for (const b of p.down) this.now.add(b);
      // the stick as a d-pad for menus (remembered apart: a cursor scene wants the stick for the cursor only)
      this.fromStick.clear();
      const st = (a: Action) => { if (!this.now.has(a)) this.fromStick.add(a); this.now.add(a); };
      if (p.ly < -NAV_STICK) st('up'); if (p.ly > NAV_STICK) st('down');
      if (p.lx < -NAV_STICK) st('left'); if (p.lx > NAV_STICK) st('right');
      const sig = `${[...p.down].sort().join(',')}|${Math.round(p.lx * 4)},${Math.round(p.ly * 4)},${Math.round(p.rx * 4)},${Math.round(p.ry * 4)}`;
      if (sig !== this.lastPadSig) { if (p.down.size || p.lx || p.ly || p.rx || p.ry) this.use('pad'); this.lastPadSig = sig; }
    }
    for (const k of new Set([...this.keysDown, ...this.keysEdge])) for (const a of KEYMAP[k] ?? []) this.now.add(a);
    // a key that went down and up between two frames still presses once
    this.edgeOnly = new Set([...this.keysEdge].filter(k => !this.keysDown.has(k)).flatMap(k => KEYMAP[k] ?? []));
    this.keysEdge.clear();
    // held directions repeat for menus
    this.navFired.clear();
    for (const a of NAV) {
      if (!this.now.has(a)) { this.repeat.delete(a); continue; }
      const left = this.repeat.get(a);
      if (left === undefined) { this.navFired.add(a); this.repeat.set(a, REPEAT.delay); continue; }
      const next = left - dt;
      if (next <= 0) { this.navFired.add(a); this.repeat.set(a, REPEAT.every); } else this.repeat.set(a, next);
    }
  }
  private edgeOnly = new Set<Action>();

  /** Down this frame. */
  down(a: Action) { return this.now.has(a); }
  /** Went down this frame. */
  pressed(a: Action) { return (this.now.has(a) && !this.was.has(a)) || this.edgeOnly.has(a); }
  /** Came up this frame. */
  released(a: Action) { return (!this.now.has(a) && this.was.has(a)) || this.edgeOnly.has(a); }
  /** A menu step this frame (pressed, or repeating while held). */
  nav(dpadOnly = false): 'up' | 'down' | 'left' | 'right' | null {
    for (const a of NAV) if (this.navFired.has(a) && !(dpadOnly && this.fromStick.has(a))) return a as 'up' | 'down' | 'left' | 'right';
    return null;
  }

  /** Walking: the left stick, or WASD/arrows (unit length, screen-relative, y down). */
  move(): { x: number; y: number } {
    const k = (n: string) => this.keysDown.has(n);
    let x = (k('d') || k('arrowright') ? 1 : 0) - (k('a') || k('arrowleft') ? 1 : 0);
    let y = (k('s') || k('arrowdown') ? 1 : 0) - (k('w') || k('arrowup') ? 1 : 0);
    if (x || y) { const n = Math.hypot(x, y); return { x: x / n, y: y / n }; }
    const p = this.pad;
    if (!p) return { x: 0, y: 0 };
    if (p.lx || p.ly) return { x: p.lx, y: p.ly };
    // the d-pad walks too, at full speed
    x = (p.down.has('right') ? 1 : 0) - (p.down.has('left') ? 1 : 0);
    y = (p.down.has('down') ? 1 : 0) - (p.down.has('up') ? 1 : 0);
    if (x || y) { const n = Math.hypot(x, y); return { x: x / n, y: y / n }; }
    return { x: 0, y: 0 };
  }

  /** The left stick alone (steering a cursor or a gesture), keys included. */
  stick(): { x: number; y: number } { return this.move(); }

  /** The right stick (scrolling, aiming). */
  aim(): { x: number; y: number } { return this.pad ? { x: this.pad.rx, y: this.pad.ry } : { x: 0, y: 0 }; }

  /** Is any key held that the game reads (so the view doesn't also treat it as walking)? */
  keyHeld(k: string) { return this.keysDown.has(k); }
}
