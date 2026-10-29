import type { Game } from '../sim/Game.js';
import { MACHINE_SPOT, START_TILE, type ObjectId } from './layout.js';
import { WORLD } from './worldConfig.js';

/** What the player can be carrying. One thing at a time. */
export type Carry = 'sheet' | 'cut' | 'scrap' | 'extinguisher' | 'bag' | 'offcuts' | 'bundle' | 'debris';

/**
 * The physical shed: the things the economy (Game) doesn't model — where you are, what's in your hands,
 * what's on the bed and the pallets. Serialised alongside Game so a reload resumes exactly.
 */
export interface WorldState {
  v: 1;
  dayIndex: number;              // Game.dayIndex this state belongs to (a new day resets the per-day parts)
  px: number; py: number;        // player position in metres on the floor (x, z)
  fx: number; fy: number;        // facing (unit vector on the floor, x and z)
  carrying: Carry | null;
  extinguisherFrom: Hook | null;   // which hook the carried extinguisher came off
  hooks: { wall: boolean; shed: boolean; exhaust?: boolean }; // extinguishers hanging up (exhaust: once bought)
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
  done: string[];                // today's events, newest first: crossed-off to-dos ("✓ Clamp the sheet") and news ("4 sheets of formply left")
  newsSeen?: number;             // today's Game log entries already scanned for stock news
  shrugs?: number;               // bumped when you reach for a sheet that isn't there (the view shrugs)
  canSpots?: Record<number, { x: number; z: number }>; // where each can that's been put down is (metres)
  /** First day only: the walk-round before the first cut. The clock waits until that cut starts. */
  tour?: { visited: ObjectId[]; cutStarted: boolean } | null;
}

export const absMinute = (g: Game) => g.dayIndex * 24 * 60 + g.minute;

/** The extinguisher hooks, and the object each hangs on. The exhaust one is there once it's bought. */
export type Hook = 'wall' | 'shed' | 'exhaust';
export const HOOKS: { hook: Hook; id: ObjectId }[] = [
  { hook: 'wall', id: 'extinguisher' }, { hook: 'shed', id: 'spareExtinguisher' }, { hook: 'exhaust', id: 'exhaustExtinguisher' },
];
export const hookThere = (g: Game, h: Hook) => h !== 'exhaust' || g.upgrades.has('exhaustExtinguisher');
/** An extinguisher hanging on this hook now (a save from before the exhaust hook counts it as hung). */
export const onHook = (g: Game, w: WorldState, h: Hook) => hookThere(g, h) && w.hooks[h] !== false;
/** How full the offcut bin is before it's worth bagging (the bigger bin lets it fill further). */
export const offcutsBagAt = (g: Game) => g.upgrades.has('bigBin') ? g.upgradeEffect('bigBin') : WORLD.offcutsEmptyAt;

/** Today's event log (shown as toasts, and in the Log panel). The same line never goes in twice in a row. */
export function logEvent(w: WorldState, text: string) {
  const line = text.replace(/^• /, '');
  if (w.done[0] === line) return;
  w.done.unshift(line);
  if (w.done.length > 60) w.done.length = 60;
}

export function newWorld(g: Game): WorldState {
  const t = WORLD.cell;
  return {
    v: 1, dayIndex: g.dayIndex,
    px: (START_TILE.x + 0.5) * t, py: (START_TILE.y + 0.5) * t, fx: 0, fy: -1,
    carrying: null, extinguisherFrom: null, hooks: { wall: true, shed: true, exhaust: true },
    bed: 'empty', bedJobId: null, finishedStack: 0, utePresent: false, offcutBin: 0,
    oldBagWaiting: false, watchingSwap: null, toiletUntil: null, rollerUpUntil: null,
    sheetsSeen: g.today.sheetsDone, done: [],
    tour: g.dayIndex === 1 ? { visited: [], cutStarted: false } : null, // a fresh save starts with the tour
  };
}

/** Overnight: back at the machine, hands empty, extinguishers rehung, pickups collected. The bed keeps what's on it. */
export function startNewDay(w: WorldState, g: Game) {
  const t = WORLD.cell;
  w.dayIndex = g.dayIndex;
  w.px = (MACHINE_SPOT.x + 0.5) * t; w.py = (MACHINE_SPOT.y + 0.5) * t; w.fx = 0; w.fy = -1;
  w.tour = null;
  if (w.carrying === 'sheet' && w.bed === 'empty') w.bed = 'placed'; // left it on the bed
  w.carrying = null; w.extinguisherFrom = null; w.hooks = { wall: true, shed: true, exhaust: true };
  w.finishedStack = 0; w.utePresent = false; w.toiletUntil = null; w.rollerUpUntil = null;
  w.watchingSwap = null; w.sheetsSeen = g.today.sheetsDone; w.done = []; w.newsSeen = 0; w.canSpots = {};
  if (w.carrying === 'bundle') w.carrying = null; // the driver's forklift took care of it
  // a sheet cutting at knock-off was scrapped by Game; it's still lying on the bed
  if (w.bed === 'running') w.bed = 'scrap';
}
