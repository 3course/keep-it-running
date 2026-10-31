// The notepad: what needs doing now, what can wait, and today's sheets.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { faultTarget, fixStep } from './fixes.js';
import type { ObjectId } from './layout.js';
import { HOOKS, hookThere, offcutsBagAt, onHook, type WorldState } from './state.js';
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

/** "11:30", or "tomorrow ~8:40" for a pickup on another day (absolute minutes). */
export function pickupTime(g: Game, abs: number): string {
  const day = Math.floor(abs / 1440), t = g.formatTime(abs - day * 1440);
  return day === g.dayIndex ? t : day === g.dayIndex + 1 ? `tomorrow ${t}` : `in ${day - g.dayIndex} days, ${t}`;
}

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

  // Dennis on the line
  if (g.dennisRinging) add(true, 'dennis', `Phone's ringing (${CONFIG.dennis.name})`, 'phone');

  // the Lease: the rent, from day 1
  const l = w.lease;
  if (l) {
    const day = g.dayIndex - l.startDayIndex + 1, of = CONFIG.lease.weeks * CONFIG.week.days;
    if (day <= of) add(false, 'lease', `Rent: $${l.rentDue.toLocaleString('en-AU')} by day ${of} · day ${day} · $${Math.round(g.cash).toLocaleString('en-AU')} in the bank`);
  }

  // the layout put the compressor on the extractor's circuit: the breaker
  if (g.powerTripped) add(true, 'breaker', "Power's tripped: reset the breaker", 'switchboard');

  // the morning after: a can on the router bed holds up the first cut; the rest want bagging for the refund
  const cans = w.people?.cans ?? [];
  if (cans.some(c => c.spot === 'bed')) add(true, 'bedcan', 'Can on the router bed from last night', 'machine');
  if (w.carrying === 'cans') add(true, 'cans-bag', `Cans in the refund bag by the roller door (${w.canCount ?? 0} in hand)`, 'fridge');
  else if (cans.length) add(false, 'cans', `Last night's empties: ${cans.length} about the place (tap one)`, 'fridge');

  // first day: the walk-round comes first, in order
  if (tourActive(w)) for (const t of TOUR) if (!w.tour!.visited.includes(t.id)) add(true, `tour-${t.id}`, t.text, t.id);

  // today's rare event: its tell, then what to do about it
  const r = g.rare;
  if (r && r.phase === 'tell') {
    if (r.id === 'council') add(true, 'rare-tell', 'Car door out front. Someone at the roller door?', 'rollerDoor');
    else if (r.id === 'bigJob') add(true, 'rare-tell', "Text from a builder: \"Ringing in a sec, big one\"", 'phone');
    else add(true, 'rare-tell', 'Reversing beeper on the apron. Close…');
  } else if (r && r.phase === 'live') {
    if (g.inspectorWaiting) add(true, 'council', `The council's here: stop the machine, show them round (${r.waitLeft}m)`, 'rollerDoor');
    else if (g.inspectorTouring) add(true, 'council', 'Walk the inspector round: stay with them');
    else if (g.dockBlocked && w.carrying !== 'debris') add(true, 'debris', `Clear the busted roller door (${r.tripsLeft} load${r.tripsLeft === 1 ? '' : 's'} to the skip)`, 'rollerDoor');
  }

  // more due today than there's time to cut: a nudge to turn work down (top of the "later" list; it's not a chore)
  if (g.overCommitted && g.minute < CONFIG.clock.endHour * 60) {
    add(false, 'board-full', `Board's full: ${g.dueToday} due today, time for about ${Math.floor(g.canCutToday)}`);
  }

  // a ringing phone goes on top of the rest: it's the one thing that won't wait
  for (const d of g.distractions) {
    if (d.kind === 'phone') add(true, `phone-${d.id}`, d.order ? "Phone's ringing (new order)" : "Phone's ringing", 'phone');
    else if (d.kind === 'bank') add(true, `bank-${d.id}`, "Phone's ringing (the bank)", 'phone');
  }
  if (g.fire) {
    const ext = HOOKS.filter(h => onHook(g, w, h.hook)).map(h => h.id);
    add(true, 'fire', 'Put out the exhaust fire', w.carrying === 'extinguisher' || !ext.length ? 'exhaust' : ext);
  }
  if (g.machineDown) add(true, 'down', 'Machine is cooked for today', 'machine');
  // the fault: wherever its next part happens (the extractor, the bit rack, the skip…), not just the machine
  if (g.fault) add(true, `fault-${g.fault.def.id}`, `Sort out the ${g.fault.def.name.toLowerCase()}`, faultTarget(g, w) ?? 'machine');
  for (const d of g.distractions) {
    if (d.kind === 'courier') add(true, `courier-${d.id}`, 'Sign for the delivery', 'rollerDoor');
    else if (d.kind === 'friend' && d.ask) add(true, `mate-${d.id}`, `${g.mateName(d)} wants a word`); // they come to you
  }
  if (w.bed === 'done') add(true, 'unload', 'Unload the machine', 'machine');
  if (w.bed === 'scrap' && !g.fault) add(true, 'scrap', 'Clear the scrap off the bed', 'machine');
  if (w.bed === 'placed') add(true, 'clamp', `Clamp the sheet (${w.clamps ?? 0}/${CONFIG.chore.clamp.clamps})`, 'machine');
  // the chores (CONFIG.chore): boards off the bed, the offcuts, the compressor
  if (g.bedPile > 0) add(g.bedFull, 'unload', g.bedFull ? `Bed's full: carry the boards off (${g.bedPile})` : `Carry the boards off the bed (${g.bedPile})`, 'machine');
  if (g.offcutPile > 0) add(true, 'offcut-pile', `Offcuts all over the floor (${g.offcutPile} load${g.offcutPile > 1 ? 's' : ''} to the skip)`, 'offcutBin');
  if (g.compressorDue) add(true, 'drain', 'The compressor hiss has dropped: drain it', 'compressor');
  if (w.bed === 'clamped' && g.machine === 'idle') add(true, 'start', 'Start the cut', 'machine');
  switch (w.carrying) {
    case 'sheet': add(true, 'carry-sheet', 'Load the sheet', 'machine'); break;
    case 'cut': add(true, 'carry-cut', 'Stack the cut sheet', 'finishedPallet'); break;
    case 'scrap': add(true, 'carry-scrap', 'Bin the scrap', 'offcutBin'); break;
    case 'bag': if (!g.fault) add(true, 'carry-bag', 'Old bag to the skip', 'skip'); break; // mid-fix, the fault's line leads there
    case 'offcuts': add(true, 'carry-offcuts', 'Offcuts to the skip', 'skip'); break;
    case 'debris': add(true, 'carry-debris', 'Slats to the skip', 'skip'); break;
    case 'bit': if (fixStep(g.fault)?.needs !== 'bit') add(false, 'carry-bit', 'Put the bit back on the rack', 'bitRack'); break;
    case 'newBag': if (fixStep(g.fault)?.needs !== 'newBag') add(false, 'carry-newbag', 'Put the new bag back', 'bags'); break;
    case 'extinguisher': if (!g.fire) {
      const empty: ObjectId[] = HOOKS.filter(h => hookThere(g, h.hook) && !onHook(g, w, h.hook)).map(h => h.id);
      add(false, 'carry-ext', 'Hang the extinguisher back up', empty);
    } break;
  }

  const low = CONFIG.ui.swapHintBelow;
  if (g.wear.bit < low) add(false, 'bit', 'Swap the bit', 'bitRack');
  if (g.wear.filter < low) add(false, 'bag', 'Change the extractor bag', 'extractor');
  if (g.wear.spoilboard < low) add(false, 'spoilboard', 'New spoilboard', 'machine');
  if (w.oldBagWaiting) add(false, 'oldbag', 'Old bag out of the extractor', 'extractor');
  if (!g.offcutPile && g.offcutBin >= offcutsBagAt(g)) add(g.offcutBin >= 1, 'offcuts', g.offcutBin >= 1 ? 'Offcut bin is full: empty it' : 'Empty the offcut bin', 'offcutBin');
  // a pickup: the stack off the finished pallet, out through the roller door to the ute
  if (w.utePresent && w.carrying === 'stack') add(true, 'pickup', `Take the stack out to the ute (${g.sheetsHere})`, 'rollerDoor');
  else if (w.utePresent) add(true, 'pickup', `Ute's here for a pickup (${g.sheetsHere})`, 'finishedPallet');
  if (g.palletFull) add(true, 'palletfull', "Finished pallet's full: the bed can't be cleared till someone picks up", 'finishedPallet');
  // who's coming, and when (you texted them as the sheet came off; some text back running late)
  for (const p of g.pickups.filter(x => x.status === 'waiting')) {
    const who = w.pickupNames?.[p.id] ?? p.order;
    add(false, `pickup-${p.id}`, p.slipped ? `${who}: "running late, after lunch ok?" Now ~${pickupTime(g, p.dueAt)}` : `Texted ${who}, picking up ~${pickupTime(g, p.dueAt)}`, 'finishedPallet');
  }
  const tourGrab = tourActive(w) && !w.tour!.visited.includes('plyPallet');
  if (!tourGrab && w.bed === 'empty' && w.carrying === null && g.nextUp() && !g.machineDown) add(false, 'next', 'Grab the next sheet', 'plyPallet');
  // work on the board with no ply for it, and nothing for it on order
  const short = g.starvedTypes.filter(t => !g.deliveries.some(d => d.lines.some(l => l.type === t)));
  if (short.length) add(!g.nextUp(), 'orderply', `Order ply (out of ${short.map(t => g.stockWord(t)).join(', ')})`, ['phone', 'desk']);

  // milestones still to come: tap one to go and look at what it unlocks
  if (CONFIG.milestones) {
    const m = g.milestones, c = CONFIG.milestone;
    if (!g.hasMilestone('sparkArrestor')) add(false, 'milestone-fire', `Milestone: ${m.fireFreeStreak} of ${c.fireFreeDays} days without a fire → upgraded extractor`, 'extractor');
    if (!g.hasMilestone('secondBitRack')) add(false, 'milestone-day', `Milestone: best day $${Math.max(0, m.bestDayProfit)} of $${c.bigDayProfit} → second bit rack`, 'bitRack');
  }

  // voicemails sit under the main list: they'll wait, but not forever
  const callbacks: TodoItem[] = g.callbacks.map(c => ({
    key: `callback-${c.id}`, text: `Call back ${c.customer} (${Math.max(0, c.expiresMinute - g.minute)}m)`, targets: ['phone'], urgent: false,
  }));
  return [...now, ...later, ...callbacks];
}
