import type { Game } from '../sim/Game.js';
import { START_TILE } from './layout.js';
import { WORLD } from './worldConfig.js';

/** What the player can be carrying. One thing at a time. */
export type Carry = 'sheet' | 'cut' | 'scrap' | 'extinguisher' | 'bag' | 'offcuts';

/**
 * The physical shed: the things the economy (Game) doesn't model — where you are, what's in your hands,
 * what's on the bed and the pallets. Serialised alongside Game so a reload resumes exactly.
 */
export interface WorldState {
  v: 1;
  dayIndex: number;              // Game.dayIndex this state belongs to (a new day resets the per-day parts)
  px: number; py: number;        // player position, px
  fx: number; fy: number;        // facing (unit-ish vector)
  carrying: Carry | null;
  extinguisherFrom: 'wall' | 'shed' | null; // which hook the carried extinguisher came off
  hooks: { wall: boolean; shed: boolean };  // extinguishers hanging up
  /** The bed: empty → sheet placed → clamped → Game loads and cuts → done (or scrap) → unloaded. */
  bed: 'empty' | 'placed' | 'clamped' | 'running' | 'done' | 'scrap';
  bedJobId: number | null;
  finishedStack: number;         // cut sheets stacked on the finished pallet awaiting pickup
  utePresent: boolean;
  offcutBin: number;             // 0..1
  oldBagWaiting: boolean;        // a full bag lifted out of the extractor, still to go to the skip
  watchingSwap: string | null;   // consumable Game is swapping, so we notice when it finishes
  toiletUntil: number | null;    // absolute game minute
  rollerUpUntil: number | null;  // absolute game minute
  sheetsSeen: number;            // today.sheetsDone last frame, to fill the offcut bin
  done: string[];                // to-do items crossed off today
}

export const absMinute = (g: Game) => g.dayIndex * 24 * 60 + g.minute;

export function newWorld(g: Game): WorldState {
  const t = WORLD.tile;
  return {
    v: 1, dayIndex: g.dayIndex,
    px: (START_TILE.x + 0.5) * t, py: (START_TILE.y + 0.5) * t, fx: 0, fy: -1,
    carrying: null, extinguisherFrom: null, hooks: { wall: true, shed: true },
    bed: 'empty', bedJobId: null, finishedStack: 0, utePresent: false, offcutBin: 0,
    oldBagWaiting: false, watchingSwap: null, toiletUntil: null, rollerUpUntil: null,
    sheetsSeen: g.today.sheetsDone, done: [],
  };
}

/** Overnight: back at the roller door, hands empty, extinguishers rehung, pickups collected. The bed keeps what's on it. */
export function startNewDay(w: WorldState, g: Game) {
  const t = WORLD.tile;
  w.dayIndex = g.dayIndex;
  w.px = (START_TILE.x + 0.5) * t; w.py = (START_TILE.y + 0.5) * t; w.fx = 0; w.fy = -1;
  if (w.carrying === 'sheet' && w.bed === 'empty') w.bed = 'placed'; // left it on the bed
  w.carrying = null; w.extinguisherFrom = null; w.hooks = { wall: true, shed: true };
  w.finishedStack = 0; w.utePresent = false; w.toiletUntil = null; w.rollerUpUntil = null;
  w.watchingSwap = null; w.sheetsSeen = g.today.sheetsDone; w.done = [];
  // a sheet cutting at knock-off was scrapped by Game; it's still lying on the bed
  if (w.bed === 'running') w.bed = 'scrap';
}
