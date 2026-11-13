// Gamepads through the browser's Gamepad API, "standard" mapping (Xbox, PlayStation and Switch Pro pads all report it in
// Chromium, Firefox and Safari). Buttons are named by what they do here, not by their letter, because the letter
// differs by pad: the bottom face button is A on Xbox, ✕ on PlayStation and B on a Switch Pro, but it's always index 0.
//
// No DOM beyond navigator.getGamepads, so tests can feed a virtual pad (`VirtualPad`) through the same path.

/** What each standard-mapping button does in the game. */
export const PAD = {
  confirm: 0,  // bottom face (Xbox A, PS ✕, Switch B)
  back: 1,     // right face (Xbox B, PS ○, Switch A)
  carry: 2,    // left face (Xbox X, PS □, Switch Y): pick up / put down
  notepad: 3,  // top face (Xbox Y, PS △, Switch X)
  prev: 4,     // LB / L1 / L: the target before
  next: 5,     // RB / R1 / R: the next target
  log: 8,      // View / Share / − : today's log
  pause: 9,    // Menu / Options / + : pause
  up: 12, down: 13, left: 14, right: 15,
} as const;
export type PadButton = keyof typeof PAD;
export const PAD_BUTTONS = Object.keys(PAD) as PadButton[];

/** Which pad's face-button letters to show. */
export type PadFamily = 'xbox' | 'playstation' | 'switch';

/** The family from the browser's id string (vendor ids: Sony 054c, Nintendo 057e). Anything else gets Xbox letters. */
export function padFamily(id: string): PadFamily {
  const s = id.toLowerCase();
  if (/045e|xbox|xinput/.test(s)) return 'xbox';
  if (/054c|playstation|dualsense|dualshock|^wireless controller/.test(s)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'switch';
  return 'xbox';
}

/** The glyph for a button on this family of pad (face buttons by position, the rest by their usual names). */
export function padGlyph(b: PadButton, fam: PadFamily): string {
  const face: Record<PadFamily, Partial<Record<PadButton, string>>> = {
    xbox: { confirm: 'A', back: 'B', carry: 'X', notepad: 'Y', prev: 'LB', next: 'RB', log: 'View', pause: 'Menu' },
    playstation: { confirm: '✕', back: '○', carry: '□', notepad: '△', prev: 'L1', next: 'R1', log: 'Share', pause: 'Options' },
    switch: { confirm: 'B', back: 'A', carry: 'Y', notepad: 'X', prev: 'L', next: 'R', log: '−', pause: '+' },
  };
  const dpad: Partial<Record<PadButton, string>> = { up: 'D-pad ↑', down: 'D-pad ↓', left: 'D-pad ←', right: 'D-pad →' };
  return face[fam][b] ?? dpad[b] ?? b;
}

/** A pad as tests (and the keyboard-free test driver) describe it: which buttons are down, and the two sticks. */
export interface VirtualPad { id: string; buttons: Partial<Record<PadButton, boolean>>; lx: number; ly: number; rx: number; ry: number }

/** One frame's reading of a pad, whatever it came from. Sticks are -1..1, y down. */
export interface PadState { id: string; connected: boolean; down: Set<PadButton>; lx: number; ly: number; rx: number; ry: number }

/** Below this a stick reads as centred (worn sticks rest a little off zero). */
export const STICK_DEADZONE = 0.22;

/** A stick's raw axes with a radial dead zone, rescaled so just past it is slow and the rim is full. */
export function deadzone(x: number, y: number, dz = STICK_DEADZONE): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (!(m > dz)) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

/** Read the first connected standard pad (or the virtual one, which wins). */
export function readPad(virtual: VirtualPad | null): PadState | null {
  if (virtual) {
    const down = new Set<PadButton>(PAD_BUTTONS.filter(b => virtual.buttons[b]));
    const l = deadzone(virtual.lx, virtual.ly), r = deadzone(virtual.rx, virtual.ry);
    return { id: virtual.id, connected: true, down, lx: l.x, ly: l.y, rx: r.x, ry: r.y };
  }
  let pads: (Gamepad | null)[] = [];
  try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { pads = []; }
  const p = pads.find(x => x && x.connected && x.mapping === 'standard') ?? pads.find(x => x && x.connected) ?? null;
  if (!p) return null;
  const down = new Set<PadButton>();
  for (const b of PAD_BUTTONS) { const btn = p.buttons[PAD[b]]; if (btn && (btn.pressed || btn.value > 0.5)) down.add(b); }
  const l = deadzone(p.axes[0] ?? 0, p.axes[1] ?? 0), r = deadzone(p.axes[2] ?? 0, p.axes[3] ?? 0);
  return { id: p.id, connected: true, down, lx: l.x, ly: l.y, rx: r.x, ry: r.y };
}

/** A short rumble, where the pad and browser support it (Chromium's vibrationActuator). Never throws. */
export function rumble(strong: number, weak: number, ms: number) {
  try {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    for (const p of pads) {
      const a = (p as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null)?.vibrationActuator;
      void a?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
    }
  } catch { /* no pad, no rumble */ }
}
