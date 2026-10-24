// The notepad: what needs doing now, what can wait, and today's sheets.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { ObjectId } from './layout.js';
import type { WorldState } from './state.js';
import { WORLD } from './worldConfig.js';

/** A to-do line. `targets`: where tapping it walks you (the nearest, if there are several). */
export interface TodoItem { key: string; text: string; targets: ObjectId[]; urgent: boolean }

/** The first-day walk-round, in order. Each ticks off when you get there. */
export const TOUR: { id: ObjectId; text: string }[] = [
  { id: 'phone', text: 'Open up the office' },
  { id: 'extractor', text: 'Switch the extractor on' },
  { id: 'bitRack', text: 'Check the bit rack' },
  { id: 'plyPallet', text: 'Grab a sheet' },
];

export const tourActive = (w: WorldState) => !!w.tour && !w.tour.cutStarted;

export function todoItems(g: Game, w: WorldState): TodoItem[] {
  if (g.phase !== 'day') return [];
  const now: TodoItem[] = [], later: TodoItem[] = [];
  const add = (urgent: boolean, key: string, text: string, targets: ObjectId | ObjectId[] = []) =>
    (urgent ? now : later).push({ key, text, targets: Array.isArray(targets) ? targets : [targets], urgent });

  // after a couple of beers this one goes right to the top
  if (g.needLoo) add(true, 'loo', g.looSlow > 0 ? `Need the loo (walking ${Math.round(g.looSlow * 100)}% slower)` : 'Need the loo', 'toilet');

  // the ply truck: it won't wait (and on the first day it's the first thing you do)
  const truck = g.truckOnApron;
  if (truck?.stage === 'waiting') add(true, 'ply-sign', `Sign for the ply truck (${Math.max(0, truck.signBy - g.minute)}m)`, 'rollerDoor');
  if (truck?.stage === 'unloading') {
    if (w.carrying === 'bundle') add(true, 'ply-stack', 'Stack the ply on the pallet', 'plyPallet');
    else add(true, 'ply-unload', `Unload the ply (${truck.bundles.length} bundle${truck.bundles.length > 1 ? 's' : ''} left)`, 'rollerDoor');
  }

  // first day: the walk-round comes first, in order
  if (tourActive(w)) for (const t of TOUR) if (!w.tour!.visited.includes(t.id)) add(true, `tour-${t.id}`, t.text, t.id);

  // a ringing phone goes on top of the rest: it's the one thing that won't wait
  for (const d of g.distractions) {
    if (d.kind === 'phone') add(true, `phone-${d.id}`, d.order ? "Phone's ringing (new order)" : "Phone's ringing", 'phone');
    else if (d.kind === 'bank') add(true, `bank-${d.id}`, "Phone's ringing (the bank)", 'phone');
  }
  if (g.fire) {
    const ext: ObjectId[] = [];
    if (w.hooks.wall) ext.push('extinguisher');
    if (w.hooks.shed) ext.push('spareExtinguisher');
    add(true, 'fire', 'Put out the exhaust fire', w.carrying === 'extinguisher' || !ext.length ? 'exhaust' : ext);
  }
  if (g.machineDown) add(true, 'down', 'Machine is cooked for today', 'machine');
  if (g.fault) add(true, `fault-${g.fault.def.id}`, `Sort out the ${g.fault.def.name.toLowerCase()}`, 'machine');
  for (const d of g.distractions) {
    if (d.kind === 'courier') add(true, `courier-${d.id}`, 'Sign for the delivery', 'rollerDoor');
    else if (d.kind === 'friend') add(true, `mate-${d.id}`, `${d.title.replace(' wandered in', '')} is at the smoko chairs`, 'smoko');
  }
  if (w.bed === 'done') add(true, 'unload', 'Unload the machine', 'machine');
  if (w.bed === 'scrap' && !g.fault) add(true, 'scrap', 'Clear the scrap off the bed', 'machine');
  if (w.bed === 'placed') add(true, 'clamp', 'Clamp the sheet', 'machine');
  if (w.bed === 'clamped' && g.machine === 'idle') add(true, 'start', 'Start the cut', 'machine');
  switch (w.carrying) {
    case 'sheet': add(true, 'carry-sheet', 'Load the sheet', 'machine'); break;
    case 'cut': add(true, 'carry-cut', 'Stack the cut sheet', 'finishedPallet'); break;
    case 'scrap': add(true, 'carry-scrap', 'Bin the scrap', 'offcutBin'); break;
    case 'bag': add(true, 'carry-bag', 'Old bag to the skip', 'skip'); break;
    case 'offcuts': add(true, 'carry-offcuts', 'Offcuts to the skip', 'skip'); break;
    case 'extinguisher': if (!g.fire) {
      const empty: ObjectId[] = [];
      if (!w.hooks.wall) empty.push('extinguisher');
      if (!w.hooks.shed) empty.push('spareExtinguisher');
      add(false, 'carry-ext', 'Hang the extinguisher back up', empty);
    } break;
  }

  const low = CONFIG.ui.swapHintBelow;
  if (g.wear.bit < low) add(false, 'bit', 'Swap the bit', 'bitRack');
  if (g.wear.filter < low) add(false, 'bag', 'Change the extractor bag', 'extractor');
  if (g.wear.spoilboard < low) add(false, 'spoilboard', 'New spoilboard', 'machine');
  if (w.oldBagWaiting) add(false, 'oldbag', 'Old bag out of the extractor', 'extractor');
  if (w.offcutBin >= WORLD.offcutsEmptyAt) add(false, 'offcuts', 'Empty the offcut bin', 'offcutBin');
  if (w.utePresent) add(false, 'pickup', `Ute's here for a pickup (${w.finishedStack})`, 'rollerDoor');
  const tourGrab = tourActive(w) && !w.tour!.visited.includes('plyPallet');
  if (!tourGrab && w.bed === 'empty' && w.carrying === null && g.nextUp() && !g.machineDown) add(false, 'next', 'Grab the next sheet', 'plyPallet');
  // work on the board with no ply for it, and none coming today
  const short = g.starvedTypes.filter(t => !g.deliveries.some(d => d.day === g.dayIndex && d.lines.some(l => l.type === t)));
  if (short.length) add(!g.nextUp(), 'orderply', `Order ply (out of ${short.map(t => g.stockWord(t)).join(', ')})`, ['phone', 'desk']);

  // voicemails sit under the main list: they'll wait, but not forever
  const callbacks: TodoItem[] = g.callbacks.map(c => ({
    key: `callback-${c.id}`, text: `Call back ${c.customer} (${Math.max(0, c.expiresMinute - g.minute)}m)`, targets: ['phone'], urgent: false,
  }));
  return [...now, ...later, ...callbacks];
}
