// The notepad: what needs doing now, what can wait, and today's sheets.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { ObjectId } from './layout.js';
import type { WorldState } from './state.js';
import { WORLD } from './worldConfig.js';

export interface TodoItem { key: string; text: string; target?: ObjectId; urgent: boolean }

export function todoItems(g: Game, w: WorldState): TodoItem[] {
  if (g.phase !== 'day') return [];
  const now: TodoItem[] = [], later: TodoItem[] = [];
  const add = (urgent: boolean, key: string, text: string, target?: ObjectId) => (urgent ? now : later).push({ key, text, target, urgent });

  // a ringing phone goes on top: it's the one thing that won't wait
  for (const d of g.distractions) {
    if (d.kind === 'phone') add(true, `phone-${d.id}`, d.order ? "Phone's ringing (new order)" : "Phone's ringing", 'phone');
    else if (d.kind === 'bank') add(true, `bank-${d.id}`, "Phone's ringing (the bank)", 'phone');
  }
  if (g.fire) add(true, 'fire', 'Put out the exhaust fire', w.carrying === 'extinguisher' ? 'exhaust' : 'extinguisher');
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
    case 'extinguisher': if (!g.fire) add(false, 'carry-ext', 'Hang the extinguisher back up', w.extinguisherFrom === 'shed' ? 'spareExtinguisher' : 'extinguisher'); break;
  }

  const low = CONFIG.ui.swapHintBelow;
  if (g.wear.bit < low) add(false, 'bit', 'Swap the bit', 'bitRack');
  if (g.wear.filter < low) add(false, 'bag', 'Change the extractor bag', 'extractor');
  if (g.wear.spoilboard < low) add(false, 'spoilboard', 'New spoilboard', 'machine');
  if (w.oldBagWaiting) add(false, 'oldbag', 'Old bag out of the extractor', 'extractor');
  if (w.offcutBin >= WORLD.offcutsEmptyAt) add(false, 'offcuts', 'Empty the offcut bin', 'offcutBin');
  if (w.utePresent) add(false, 'pickup', `Ute's here for a pickup (${w.finishedStack})`, 'rollerDoor');
  if (w.bed === 'empty' && w.carrying === null && g.queued.length && !g.machineDown) add(false, 'next', 'Grab the next sheet', 'plyPallet');
  return [...now, ...later];
}
