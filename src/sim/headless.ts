// Headless balance check: plays a week with a "competent", an "average" and a "sloppy" operator policy and prints
// the P&L for each. Run with `npm run sim`.
//
// Three weeks per script and seed: week 1 of a new game (breakdowns ramp in from zero, CONFIG.difficulty), week 2 of
// the same game (days 6–10, the middle of the ramp) and a steady-state week (a new game started past the end of the
// ramp, so breakdowns run at the ramp's plateau all week). The detailed lines are for the steady-state week;
// `npm run sim -- week1` or `-- week2` prints them for that week instead. All end with a summary: margin and scrap
// rate (sheets ruined / sheets cut) per script. These runs buy no upgrades.
// `npm run sim -- upgrades [seeds]` (default 20) measures the upgrades instead: each one alone, and each script's
// buying policy over four weeks, compared seed for seed (see upgradeStudy).
import { ENDINGS, outcome, type Ending } from '../world/leaseEnding.js';
import { Game, type Phase } from './Game.js';
import { CONFIG } from '../config.js';
import type { DayStats } from './types.js';
import type { JobTypeId, UpgradeId } from '../config.js';
import type { LayoutEffects } from './types.js';
import { NEUTRAL_LAYOUT } from './Game.js';
import { PRESETS, effectsOf, measure } from '../world/layoutPlan.js';
import { simOnly, type BetKind } from './dennis.js';

type Policy = (g: Game) => void;

/** Open sheets due today (or overdue) already exceed what can be cut before 5pm: the game's "board's full" warning. */
const overCommitted = (g: Game) => g.overCommitted;

// Both scripts reorder a line when it drops to this many sheets.
const REORDER_AT = 3;
const onOrder = (g: Game, t: JobTypeId) => g.deliveries.some(d => d.lines.some(l => l.type === t));

/** Sign for a truck on the apron and unload it, one bundle (trip) at a time. */
function handleTruck(g: Game) {
  const d = g.truckOnApron;
  if (!d || !g.canAct) return;
  if (d.stage === 'waiting') g.signDelivery(d.id);
  else g.unloadBundle(d.id);
}

/**
 * Competent: reorders at 3 — a free-delivery 12 when the board plus tomorrow's work justifies it, else 8 (no spare late in the
 * week), and just before the 3pm cut-off tops up anything that'd run low by morning.
 */
function competentOrders(g: Game) {
  const lateCall = g.minute >= 14.5 * 60 && g.minute < CONFIG.supply.cutoffHour * 60;
  const spare = g.day >= CONFIG.week.days ? 0 : 4;
  for (const t of CONFIG.jobs.types) {
    const low = g.stock[t.id] <= (lateCall ? REORDER_AT + 2 : REORDER_AT);
    // already coming today? fine. Only coming tomorrow (a missed truck) and run dry? order again for today
    const comingToday = g.deliveries.some(d => d.day === g.dayIndex && d.lines.some(l => l.type === t.id));
    if (!low || comingToday || (onOrder(g, t.id) && g.stock[t.id] > 0)) continue;
    const need = g.queued.filter(j => j.type === t.id && j.id !== g.inHand).length - g.stock[t.id] + spare;
    // batch: a free-delivery 12 when the board plus tomorrow's work would use more than 8, else 8. Tomorrow's
    // work is the line's share of the day's guaranteed demand (none on the last day of the week).
    const tomorrow = g.day >= CONFIG.week.days ? 0 : t.weight * CONFIG.jobs.orders.minDemandSheets;
    const size = need + tomorrow > 8 ? CONFIG.supply.freeDeliveryFrom : 8;
    if (need <= 0) continue;
    // a second order for a line that's already coming only helps if this one would arrive today
    const q = g.plyQuote(t.id, size);
    if ('error' in q || (onOrder(g, t.id) && q.day !== g.dayIndex)) continue;
    g.orderPly(t.id, size);
  }
}

// sloppy's memory per line: whether they forgot to reorder this time it dropped to 3
const sloppyForgot = new WeakMap<Game, Map<JobTypeId, boolean>>();
/** Sloppy: reorders 4 at a time at 3 sheets, but forgets 30% of the time, then only orders once they've actually run out. Ignores the cut-off. */
function sloppyOrders(g: Game) {
  let mem = sloppyForgot.get(g);
  if (!mem) sloppyForgot.set(g, mem = new Map());
  for (const t of CONFIG.jobs.types) {
    const n = g.stock[t.id];
    if (n > REORDER_AT) { mem.delete(t.id); continue; }
    if (onOrder(g, t.id)) continue;
    if (!mem.has(t.id)) mem.set(t.id, g.rng.chance(0.3));
    const forgot = mem.get(t.id)!;
    if (!forgot || (n === 0 && g.starvedTypes.includes(t.id))) g.orderPly(t.id, 4); // a few at a time, every time
  }
}

// ---------- rare events (CONFIG.rareEvent): each script's way with them. True = that's this minute spent. ----------
// (The big job is a phone call: each script answers it the way it answers any order call.)
const bagFull = (g: Game) => 1 - g.wear.filter > CONFIG.fire.bagFullAbove;

/** Competent: changes a full bag before the inspector sees it, walks them round, and clears the slats while it cuts. */
function competentRare(g: Game): boolean {
  if (g.inspectorTouring) { g.escort(60); return true; }
  if (g.inspectorWaiting && g.canAct && !g.fault) {
    if (bagFull(g) && !g.replacing && g.replaceConsumable('filter')) return true;
    if (!g.replacing && g.showCouncilRound()) { g.escort(60); return true; }
  }
  if (g.dockBlocked && g.canAct && (g.machine !== 'idle' || g.truckOnApron)) return g.clearDebris();
  return false;
}

/** Average: gets to the inspector and the slats late a third of the time (like its faults), but gets there. */
function averageRare(g: Game): boolean {
  if (g.inspectorTouring) { g.escort(60); return true; }
  if (g.inspectorWaiting && g.canAct && averageReacts(g, `council-${g.dayIndex}`, 5, 25) && g.showCouncilRound()) { g.escort(60); return true; }
  if (g.dockBlocked && g.canAct && averageReacts(g, `ute-${g.dayIndex}`, 10, 40)) return g.clearDebris();
  return false;
}

// sloppy's call on each inspector, made when they turn up: true = never gets round to them
const sloppyDodges = new WeakMap<Game, Map<number, boolean>>();
/** Sloppy: leaves the inspector standing half the time, wanders off mid-walk, and only clears the slats for a truck. */
function sloppyRare(g: Game): boolean {
  if (g.inspectorTouring) { if (g.rng.chance(0.6)) g.escort(60); return true; }
  if (g.inspectorWaiting && g.canAct) {
    let m = sloppyDodges.get(g);
    if (!m) sloppyDodges.set(g, m = new Map());
    if (!m.has(g.dayIndex)) m.set(g.dayIndex, g.rng.chance(0.5));
    if (!m.get(g.dayIndex) && g.showCouncilRound()) return true;
  }
  if (g.dockBlocked && g.canAct && g.truckOnApron && g.rng.chance(0.5)) return g.clearDebris();
  return false;
}

// ---------- chores (CONFIG.chore): each script's way with them. True = that's this minute spent. ----------
const CLAMPS = CONFIG.chore.clamp.clamps;
/** The sheets off the machine so far today: a key that holds still while one chore's due, so each script decides once. */
const sheetsToday = (g: Game) => g.today.sheetsDone + g.today.sheetsScrapped;

/** Competent: four clamps every sheet, drains the compressor when the hiss drops, empties the bin when it's full (before
 * the next sheet's offcuts spill), clears a spill straight away, and carries finished boards off a couple at a time while
 * the next one cuts (one trip for the lot), before the bed fills. */
function competentChores(g: Game): boolean {
  if (!CONFIG.chores || !g.canAct) return false;
  if (g.offcutPile > 0) return g.clearOffcutPile();
  if (g.compressorDue) return g.drainCompressor();
  if (g.offcutBin >= 1 - 1e-9) return g.emptyOffcutBin();
  if (g.bedFull || (g.bedPile >= CONFIG.chore.stack.bedHolds - 1 && g.machine === 'cutting')) return g.clearBed();
  return false;
}

/** Average: the same chores, done while a sheet cuts, but a third of the time it gets to the compressor, the bin and a
 * spill late; it leaves the boards on the bed till it's full; and one sheet in four goes on a clamp short. */
function averageChores(g: Game): boolean {
  if (!CONFIG.chores || !g.canAct) return false;
  if (g.offcutPile > 0 && averageReacts(g, `pile-${g.dayIndex}-${g.today.binOverflows}`, 20, 60)) return g.clearOffcutPile();
  if (g.compressorDue && averageReacts(g, `drain-${g.dayIndex}-${sheetsToday(g) - g.compressorSheets}`, 30, 90)) return g.drainCompressor();
  if (g.offcutBin >= 1 - 1e-9 && averageReacts(g, `bin-${g.dayIndex}-${sheetsToday(g)}`, 20, 60)) return g.emptyOffcutBin();
  if (g.bedFull) return g.clearBed();
  return false;
}
const averageClamps = (g: Game) => (g.rng.chance(1 / 4) ? CLAMPS - 1 : CLAMPS);

// sloppy's call on each spill: true = gets round to clearing it today
const sloppyClears = new WeakMap<Game, Map<string, boolean>>();
/** Sloppy: two or three clamps, never empties the bin (it spills), clears a spill half the time, only drains the compressor
 * once a sheet's lifted, and only clears the bed when it's full. */
function sloppyChores(g: Game): boolean {
  if (!CONFIG.chores || !g.canAct) return false;
  if (g.offcutPile > 0) {
    let m = sloppyClears.get(g);
    if (!m) sloppyClears.set(g, m = new Map());
    const key = `${g.dayIndex}-${g.today.binOverflows}`;
    if (!m.has(key)) m.set(key, g.rng.chance(0.5));
    if (m.get(key) && g.rng.chance(0.05)) return g.clearOffcutPile();
  }
  if (g.compressorDue && g.today.sheetsLifted > 0) return g.drainCompressor();
  if (g.bedFull) return g.clearBed();
  return false;
}
const sloppyClamps = (g: Game) => (g.rng.chance(0.5) ? CLAMPS - 2 : CLAMPS - 1);

/** Dennis on the phone: every script picks up and answers the run's way (`-- dennis`: yes to everything, or no). */
let dennisSays: 'yes' | 'no' = 'no';
/** `-- dennis only=<kind>`: yes to that kind of bet only (to price each one). */
const dennisOnly = () => ((globalThis as { process?: { argv: string[] } }).process?.argv ?? []).find(a => a.startsWith('only='))?.slice(5);
function answersDennis(g: Game) {
  if (!g.dennisRinging || !g.canAct) return;
  const bet = g.answerDennis();
  if (bet) g.decideDennis(dennisSays);
}

/** The breaker: competent resets it straight away, average soon after, sloppy when they notice. True: that's this minute. */
function resetsPower(g: Game, chance: number): boolean {
  if (!g.powerTripped || !g.canAct || !g.rng.chance(chance)) return false;
  return g.resetPower();
}

const competent: Policy = (g) => {
  answersDennis(g);
  if (g.powerTripped && resetsPower(g, 1)) return;
  // a fire beats everything: drop what you're doing and go
  if (g.fire && !g.fireResponse) g.fightFire();
  g.setSpraying(g.fireResponse?.step === 'atDuct');
  if (g.fireResponse) return;
  if (competentRare(g)) return;
  if (g.fault) {
    const f = g.fault;
    if (f.phase === 'diagnose') {
      const right = f.def.diagnoses.find(d => d.correct)!;
      g.diagnose(right.id);
    } else if (f.phase === 'choosePath') {
      const paths = g.availablePaths();
      // cheap path unless the sheet is about to be scrapped
      const urgent = f.def.scrapAfterMinutes - f.minutesOpen < 8;
      const byTime = [...paths].sort((a, b) => a.steps.reduce((s, x) => s + x.minutes, 0) - b.steps.reduce((s, x) => s + x.minutes, 0));
      const byCost = [...paths].sort((a, b) => a.steps.reduce((s, x) => s + x.cost, 0) - b.steps.reduce((s, x) => s + x.cost, 0));
      g.choosePath((urgent ? byTime : byCost)[0].id);
    } else if (f.phase === 'step') {
      g.doStep();
    }
    return;
  }
  if (g.truckOnApron?.stage === 'waiting') handleTruck(g); // sign before the driver gives up
  for (const d of g.distractions) {
    // a mate who comes up (or is yarning): chats when the machine's idle, sends them off when it's cutting
    if (d.kind === 'friend') { if (d.ask || d.engaged) g.respond(d.id, g.machine === 'cutting' ? 'disengage' : 'chat'); }
    else if (d.order) g.respond(d.id, overCommitted(g) ? 'decline' : 'answer');
    else g.respond(d.id, d.kind === 'courier' ? 'sign' : 'answer');
  }
  for (const c of g.callbacks) g.callBack(c.id, overCommitted(g) ? 'decline' : 'answer');
  competentOrders(g);
  if (g.machine === 'idle' && g.queued.length) {
    // proactive maintenance between sheets
    if (g.wear.bit < 0.3) { g.replaceConsumable('bit'); return; }
    if (g.wear.filter < 0.25) { g.replaceConsumable('filter'); return; }
    // a due compressor or a full bed first: the next sheet needs both
    if ((g.compressorDue || g.bedFull) && competentChores(g)) return;
    if (g.loadNextSheet()) return;
  }
  if (competentChores(g)) return; // while it cuts
  handleTruck(g); // between sheets, or while one cuts
};

// sloppy's call on each fire, made once when they notice it: true = leave it until it gets worse
const sloppyIgnores = new WeakMap<Game, Map<number, boolean>>();

const sloppy: Policy = (g) => {
  answersDennis(g);
  if (g.powerTripped && resetsPower(g, 0.3)) return;
  if (g.fireResponse) { g.setSpraying(g.fireResponse.step === 'atDuct'); return; }
  if (sloppyRare(g)) return;
  if (g.fire) {
    let calls = sloppyIgnores.get(g);
    if (!calls) sloppyIgnores.set(g, calls = new Map());
    if (!calls.has(g.fire.id)) calls.set(g.fire.id, g.rng.chance(0.2));
    const ignoring = calls.get(g.fire.id)! && g.fire.stage === 'spot';
    // finishes whatever step they're in the middle of first
    const midStep = g.fault && (g.fault.phase === 'working' || g.fault.phase === 'wrongCall');
    if (!ignoring && !midStep && g.fightFire()) return;
  }
  if (g.fault) {
    const f = g.fault;
    if (f.phase === 'diagnose') {
      const untried = f.def.diagnoses.filter(d => !f.triedDiagnoses.includes(d.id));
      g.diagnose(g.rng.pick(untried).id); // guesses
    } else if (f.phase === 'choosePath') {
      g.choosePath(g.rng.pick(g.availablePaths()).id);
    } else if (f.phase === 'step') {
      if (g.rng.chance(0.6)) g.doStep(); // dawdles
    }
    return;
  }
  // chats to everyone, ignores the courier, drinks from 2pm
  for (const d of g.distractions) {
    if (d.kind === 'phone' || d.kind === 'bank') g.respond(d.id, 'answer');
    if (d.kind === 'friend' && d.ask) g.respond(d.id, 'chat'); // yes to everything, a beer whenever they ask
  }
  for (const c of g.callbacks) g.callBack(c.id);
  sloppyOrders(g);
  if (g.rng.chance(0.5)) handleTruck(g); // gets round to it
  // a can at 2pm and another at 4pm, or as soon after as they're free (the empty goes in the bin first); the loo once it's really slowing them down
  const due = (g.minute >= 16 * 60 ? 2 : g.minute >= 14 * 60 ? 1 : 0) - g.beersToday;
  if (due > 0 && g.canAct) { if (g.heldCan) g.binCan(); g.buyBeer(); }
  // the fridge in sight of the router (the layout): an extra can on a hot arvo
  else if (g.layout.beerTemptation > 1 && g.minute >= 14 * 60 && g.beersToday < 3 && g.canAct && g.rng.chance((g.layout.beerTemptation - 1) * 0.01)) { if (g.heldCan) g.binCan(); g.buyBeer(); }
  if (g.needLoo && g.looSlow >= 0.15) g.useToilet();
  if (sloppyChores(g)) return;
  if (g.machine === 'idle' && g.queued.length && g.rng.chance(0.5)) g.loadNextSheet(CONFIG.chores ? sloppyClamps(g) : CLAMPS);
};

// average's reaction to each fire and fault, decided when it turns up: the absolute minute they get round to it
const averageGetsTo = new WeakMap<Game, Map<string, number>>();
// average's call on each worn consumable, decided when it's due: true = puts it off until it's nearly gone
const averagePutsOff = new WeakMap<Game, Map<string, boolean>>();
const now = (g: Game) => g.dayIndex * 24 * 60 + g.minute;

/** When average gets to this fire or fault: straight away, or (a third of the time) minLag–maxLag minutes later. */
function averageReacts(g: Game, key: string, minLag: number, maxLag: number): boolean {
  let m = averageGetsTo.get(g);
  if (!m) averageGetsTo.set(g, m = new Map());
  if (!m.has(key)) m.set(key, now(g) + (g.rng.chance(1 / 3) ? g.rng.int(minLag, maxLag) : 0));
  return now(g) >= m.get(key)!;
}

// average's call on each order it's offered while the board's full: true = heeds the warning and turns it down
const averageHeedsCalls = new WeakMap<Game, Map<string, boolean>>();
/** Average heeds the "board's full" warning two times in three, decided once per call or voicemail (seeded). */
function averageHeeds(g: Game, key: string): boolean {
  let m = averageHeedsCalls.get(g);
  if (!m) averageHeedsCalls.set(g, m = new Map());
  if (!m.has(key)) m.set(key, g.rng.chance(2 / 3));
  return m.get(key)!;
}

// average's call on each time a mate comes up while the machine's cutting: true = lets them talk
const averageTalks = new WeakMap<Game, Map<string, boolean>>();
function averageLetsTalk(g: Game, d: { id: number; approaches?: number }): boolean {
  let m = averageTalks.get(g);
  if (!m) averageTalks.set(g, m = new Map());
  const key = `${d.id}-${d.approaches}`;
  if (!m.has(key)) m.set(key, g.rng.chance(1 / 3));
  return m.get(key)!;
}

/** Average swaps a worn part between sheets like competent, but puts a third of the swaps off until the part's nearly gone. */
function averageWantsSwap(g: Game, key: 'bit' | 'filter', at: number): boolean {
  let m = averagePutsOff.get(g);
  if (!m) averagePutsOff.set(g, m = new Map());
  const health = g.wear[key];
  if (health >= at) { m.delete(key); return false; }
  if (!m.has(key)) m.set(key, g.rng.chance(1 / 3));
  return !m.get(key) || health < 0.08;
}

/**
 * Average: knows the job but isn't on top of it. Misses or delays about a third of the fires and faults it should react to,
 * usually makes the right call once it does, and sometimes lets chores slide (puts off swaps, gets to trucks and the next sheet late).
 */
const average: Policy = (g) => {
  answersDennis(g);
  if (g.powerTripped && resetsPower(g, 0.6)) return;
  if (g.fireResponse) { g.setSpraying(g.fireResponse.step === 'atDuct'); return; }
  if (g.fire && averageReacts(g, `fire-${g.fire.id}`, 20, 60) && g.fightFire()) return;
  if (averageRare(g)) return;
  if (g.fault) {
    const f = g.fault;
    if (!averageReacts(g, `fault-${g.dayIndex}-${g.today.faults}`, 5, 20)) return; // hasn't noticed / gets to it after this
    if (f.phase === 'diagnose') {
      const right = f.def.diagnoses.find(d => d.correct)!;
      const untried = f.def.diagnoses.filter(d => !f.triedDiagnoses.includes(d.id));
      g.diagnose(g.rng.chance(0.75) ? right.id : g.rng.pick(untried).id);
    } else if (f.phase === 'choosePath') {
      const byCost = [...g.availablePaths()].sort((a, b) => a.steps.reduce((s, x) => s + x.cost, 0) - b.steps.reduce((s, x) => s + x.cost, 0));
      g.choosePath(byCost[0].id);
    } else if (f.phase === 'step') {
      g.doStep();
    }
    return;
  }
  if (g.truckOnApron?.stage === 'waiting' && g.rng.chance(0.5)) handleTruck(g);
  for (const d of g.distractions) {
    // a mate who comes up: a yarn (or the beer they asked for) when the machine's idle; while it's cutting, sends
    // them off two times in three and lets them talk (they start a yarn anyway) the third
    if (d.kind === 'friend') {
      if (!d.ask) continue;
      if (g.machine !== 'cutting') g.respond(d.id, 'chat');
      else if (!averageLetsTalk(g, d)) g.respond(d.id, 'disengage');
    } else if (d.order) g.respond(d.id, overCommitted(g) && averageHeeds(g, `call-${d.id}`) ? 'decline' : 'answer');
    else g.respond(d.id, d.kind === 'courier' ? 'sign' : 'answer');
  }
  for (const c of g.callbacks) g.callBack(c.id, overCommitted(g) && averageHeeds(g, `voicemail-${c.id}`) ? 'decline' : 'answer');
  competentOrders(g);
  if (g.machine === 'idle' && g.queued.length) {
    if (averageWantsSwap(g, 'bit', 0.3)) { g.replaceConsumable('bit'); return; }
    if (g.bedFull && averageChores(g)) return; // the bed has to be cleared to load
    if (averageWantsSwap(g, 'filter', 0.25)) { g.replaceConsumable('filter'); return; }
    // in overtime, only a sheet that'll be off the bed by lights-out (a half-cut one is scrap)
    const next = g.nextUp();
    const fits = !g.overtime || (!!next && g.minute + CONFIG.jobs.loadMinutes + next.cutMinutes < CONFIG.clock.overtimeEndHour * 60);
    if (fits && g.rng.chance(0.8) && g.loadNextSheet(CONFIG.chores ? averageClamps(g) : CLAMPS)) return;
  }
  if (averageChores(g)) return; // with the sheet cutting
  if (g.rng.chance(0.7)) handleTruck(g);
};

interface Script {
  name: string;
  policy: Policy;
  /** At 5pm: work overtime (to 7pm at double rate) or knock off? A half-cut sheet on the bed is scrap if you knock off. */
  overtime: (g: Game) => boolean;
  /** At the day summary, when it's buying upgrades (the `upgrades` mode). */
  buy: (g: Game) => void;
}

// ---------- upgrade buying (claude/office-manager-and-upgrades.md, sim plan) ----------

/** Cash kept back for ply: both careful scripts dip to ~$200 mid-week paying for boards up front. Competent keeps more
 * back: enough for a week's overheads and a ply order on top (claude/sim-solvency.md). */
const BUY_BUFFER = 1500;
const COMPETENT_BUY_BUFFER = 2500;
const price = (id: UpgradeId) => CONFIG.upgrades.find(u => u.id === id)!.cost;
const cheapestFirst = [...CONFIG.upgrades].sort((a, b) => a.cost - b.cost).map(u => u.id);
/** Competent's order: best payback first. The `upgrades` mode measures it (competent's own gain per dollar) before playing. */
let competentOrder: UpgradeId[] = cheapestFirst;

/** Competent: the best payback it can afford above its buffer, any day. */
function competentBuys(g: Game) {
  for (const id of competentOrder) if (!g.upgrades.has(id) && g.cash - price(id) >= COMPETENT_BUY_BUFFER) { g.buyUpgrade(id); return; }
}
/** Average: one a week, at the end of it — the cheapest it hasn't got, if it's above the buffer. */
function averageBuys(g: Game) {
  if (g.day < CONFIG.week.days) return;
  const id = cheapestFirst.find(x => !g.upgrades.has(x));
  if (id && g.cash - price(id) >= BUY_BUFFER) g.buyUpgrade(id);
}
/** Sloppy: whatever it can afford, whenever, cheapest first. No buffer. */
function sloppyBuys(g: Game) {
  for (const id of cheapestFirst) if (!g.upgrades.has(id) && g.cash >= price(id)) g.buyUpgrade(id);
}

const SCRIPTS: Script[] = [
  // a half-cut sheet on the bed counts as work left: knocking off would scrap it
  { name: 'competent', policy: competent, overtime: g => !g.machineDown && (!!g.current || g.queued.length > 0), buy: competentBuys },
  { name: 'average', policy: average, overtime: g => !g.machineDown && !!g.current, buy: averageBuys }, // only to save the sheet on the bed
  { name: 'sloppy', policy: sloppy, overtime: () => false, buy: sloppyBuys },
];

/** First day of a steady-state week: the ramp's last entry, which every later day uses too. */
const STEADY_FROM = CONFIG.difficulty.breakdownByDay.length;

interface WeekResult { g: Game; idle: { total: number; longest: number }[] }

/** Play `weeks` weeks of a new game starting on `firstDay`; the result is the last of them. */
/** How a run treats upgrades: none (the default), the script's buying policy, or some owned from the start (free: just the effect). */
interface Upgrading { buying?: boolean; owned?: readonly UpgradeId[] }

/** Play `weeks` weeks of a new game starting on `firstDay`; the result is the last of them (`weeks`: every week's days). */
function playWeek(script: Script, seed: number, firstDay: number, weeks = 1, up: Upgrading = {}): WeekResult & { weeks: DayStats[][]; refused: number } {
  const g = new Game(seed, firstDay);
  g.layout = simLayout; // `-- layouts`: the factory laid out a given way (default: as built)
  // count the ply orders the supplier refused for want of money (an insolvent business can't restock)
  let refused = 0;
  const quote = g.plyQuote.bind(g);
  g.plyQuote = (t, q) => { const r = quote(t, q); if ('error' in r && r.broke) refused++; return r; };
  for (const id of up.owned ?? []) g.upgrades.add(id);
  let idle: { total: number; longest: number }[] = [];
  const all: DayStats[][] = [];
  for (let w = 0; w < weeks; w++) {
    if (w > 0) g.nextWeek();
    idle = playOn(script, g, !!up.buying);
    all.push([...g.week]);
  }
  return { g, idle, weeks: all, refused };
}

/** Play the rest of the week. Returns per day: minutes the bed sat empty (machine 'idle') while labour was on the
 * clock, and the longest such run. Fault downtime and consumable swaps aren't counted — this measures pacing, not breakdowns. */
function playOn(script: Script, g: Game, buying = false) {
  let guard = 0;
  const idle: { total: number; longest: number }[] = [];
  let idleDay: DayStats | null = null, run = 0;
  while (g.phase !== 'weekSummary' && guard++ < 100000) {
    if (g.phase === 'day') {
      if (idleDay !== g.today) { idleDay = g.today; idle.push({ total: 0, longest: 0 }); run = 0; }
      script.policy(g); g.tick();
      const today = idle[idle.length - 1];
      const phaseAfter = g.phase as Phase; // tick() can end the day; don't count the 7pm lights-off minute
      if (phaseAfter !== 'daySummary' && g.machine === 'idle') {
        today.total += 1; run += 1; today.longest = Math.max(today.longest, run);
      } else run = 0;
    }
    else if (g.phase === 'endOfDayPrompt') { script.overtime(g) ? g.startOvertime() : g.knockOff(); }
    else if (g.phase === 'daySummary') {
      if (buying) script.buy(g);
      g.nextDay();
    }
  }
  return idle;
}

const margin = (days: DayStats[]) => {
  const rev = days.reduce((s, d) => s + d.revenue, 0), cost = days.reduce((s, d) => s + d.costs, 0);
  return rev > 0 ? (rev - cost) / rev : 0;
};
const sum = (days: DayStats[], k: keyof DayStats) => days.reduce((s, d) => s + d[k], 0);
/** Sheets ruined / sheets cut. */
const scrapRate = (days: DayStats[]) => sum(days, 'sheetsScrapped') / Math.max(1, sum(days, 'sheetsDone'));

function report(name: string, seed: number, { g, idle }: WeekResult) {
  const rev = g.week.reduce((s, d) => s + d.revenue, 0);
  const cost = g.week.reduce((s, d) => s + d.costs, 0);
  const done = g.week.reduce((s, d) => s + d.sheetsDone, 0);
  const scrap = g.week.reduce((s, d) => s + d.sheetsScrapped, 0);
  const late = g.week.reduce((s, d) => s + d.sheetsLate, 0);
  const faults = g.week.reduce((s, d) => s + d.faults, 0);
  const margin = rev > 0 ? (rev - cost) / rev : 0;
  const d1 = g.week[0];
  const d1Margin = d1.revenue > 0 ? (d1.revenue - d1.costs) / d1.revenue : 0;
  const avg = (f: (d: { total: number; longest: number }) => number) => idle.reduce((s, d) => s + f(d), 0) / idle.length;
  const worstGap = Math.max(...idle.map(d => d.longest));
  const n = g.week.length;
  const wk = (k: keyof DayStats) => (g.week.reduce((s, d) => s + d[k], 0) / n).toFixed(1).padStart(4);
  const missed = (d: DayStats) => d.sheetsMissed + d.sheetsLost; // calls that went elsewhere + overdue sheets pulled
  const p = (v: number, w = 3) => String(v).padStart(w);
  console.log(
    `${name.padEnd(9)} s${seed} day1: margin=${(d1Margin * 100).toFixed(0).padStart(4)}% idle=${p(idle[0].total)}m gap=${p(idle[0].longest)}m ` +
    `demand=${p(d1.sheetsDemanded, 2)} cut=${p(d1.sheetsDone, 2)} missed=${p(missed(d1), 2)} late=${p(d1.sheetsLate, 2)} declined=${p(d1.sheetsDeclined, 2)} noPly=${p(d1.stockOutMinutes)}m | ` +
    `week: margin=${(margin * 100).toFixed(0).padStart(4)}% idle=${avg(d => d.total).toFixed(0).padStart(3)}m gap=${avg(d => d.longest).toFixed(0).padStart(3)}m (worst ${p(worstGap)}m) ` +
    `demand=${wk('sheetsDemanded')} cut=${wk('sheetsDone')} missed=${(g.week.reduce((s, d) => s + missed(d), 0) / n).toFixed(1).padStart(4)} late=${wk('sheetsLate')} declined=${wk('sheetsDeclined')} noPly=${wk('stockOutMinutes')}m/day | ` +
    `trucks/wk=${g.week.reduce((s, d) => s + d.trucks, 0)} fees=$${g.week.reduce((s, d) => s + d.deliveryFees, 0)} ply on hand=$${g.plyOnHand.value.toFixed(0)} (${g.plyOnHand.sheets}) cash=$${g.cash.toFixed(0).padStart(6)} scrap=${scrap} faults=${faults} rapport=${g.rapport} stock=${CONFIG.jobs.types.map(t => g.stock[t.id]).join('/')}`,
  );
  const fires = (d: DayStats) => `${d.firesSpot}/${d.firesDuct}/${d.firesExtractor}`;
  const mateBeers = g.week.reduce((s, d) => s + d.mateBeer, 0) / CONFIG.beer.cost;
  console.log(`${''.padEnd(13)}beer: yours ${wk('beers').trim()} cans/day, fumbles ${wk('fumbles').trim()}/day (week ${g.week.reduce((s, d) => s + d.fumbles, 0)}), loo trips ${wk('looTrips').trim()}/day (week ${g.week.reduce((s, d) => s + d.looTrips, 0)}) | for mates ${(mateBeers / n).toFixed(1)}/day (week ${mateBeers}, $${mateBeers * CONFIG.beer.cost})`);
  console.log(`${''.padEnd(13)}fires spot/duct/extractor: day1 ${fires(d1)} | week per day ${wk('firesSpot').trim()}/${wk('firesDuct').trim()}/${wk('firesExtractor').trim()} | by day ${g.week.map(fires).join('  ')}`);
  // Per job type, whole week: contribution = revenue - boards (incl. ruined) - fault fixes while it was on the bed.
  // Labour, consumables and overheads are shared and not split, so these margins sit above the week margin.
  const byType = CONFIG.jobs.types.map(t => {
    const l = g.typeLedger[t.id];
    const contrib = l.revenue - l.boards - l.fixes;
    const m = l.revenue > 0 ? `${((contrib / l.revenue) * 100).toFixed(0)}%` : '—';
    const perHour = l.minutes > 0 ? `$${((contrib / l.minutes) * 60).toFixed(0)}/machine-hr` : '—';
    return `${t.id} cut=${l.cut} ruined=${l.scrapped} rev=$${l.revenue.toFixed(0)} contrib=$${contrib.toFixed(0)} (${m}, ${perHour})`;
  });
  console.log(`${''.padEnd(13)}by type: ${byType.join(' | ')}`);
}

const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? []; // no Node types in this project
// Dennis is off unless asked for (`-- dennis`): the default report is the economy as it was before him
if (!args.includes('dennis')) (CONFIG.dennis as { enabled: boolean }).enabled = false;
/** The layout every game in this run plays on. */
let simLayout: LayoutEffects = NEUTRAL_LAYOUT;
// `-- baseline`: rare events and milestones off, as the economy was before them (the frozen baseline)
if (args.includes('baseline')) Object.assign(CONFIG as unknown as Record<string, boolean>, { rareEvents: false, milestones: false });
// `-- nochores`: the chores without teeth, as the economy was before them
if (args.includes('nochores')) Object.assign(CONFIG as unknown as Record<string, boolean>, { chores: false });
console.log(`(rare events ${CONFIG.rareEvents ? 'on' : 'off'}, milestones ${CONFIG.milestones ? 'on' : 'off'}, chores ${CONFIG.chores ? 'on' : 'off'})`);
if (args[2] === 'upgrades') upgradeStudy();
else if (args[2] === 'layouts') layoutStudy();
else if (args[2] === 'dennis') dennisStudy();
else if (args.includes('--lease') || args[2] === 'lease') leaseStudy();
else defaultReport();

/**
 * `npm run sim -- layouts [seeds]`: the three preset layouts (src/world/layoutPlan.ts) on the same seeds, steady-state week.
 * Margins for competent and sloppy per preset; a flag if any preset beats another by more than 8 points (the
 * trade-offs would be too weak: one layout would just be best).
 */
function layoutStudy() {
  const seeds = Array.from({ length: Number(args.slice(3).find(a => /^\d+$/.test(a))) || 10 }, (_, i) => i + 1);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6);
  const out: Record<string, Record<string, number>> = {};
  console.log(`\nLayouts: steady-state week, ${seeds.length} seeds. Mean operating margin.`);
  console.log(`${'preset'.padEnd(10)} | ${SCRIPTS.map(s => s.name.padStart(9)).join(' ')} | load stack bag duct fire clutter circuit fridge path`);
  for (const [name, plan] of Object.entries(PRESETS)) {
    const m = measure(plan);
    simLayout = effectsOf(m);
    out[name] = {};
    for (const sc of SCRIPTS) out[name][sc.name] = mean(seeds.map(seed => margin(playWeek(sc, seed, STEADY_FROM).g.week)));
    console.log(`${name.padEnd(10)} | ${SCRIPTS.map(s => pct(out[name][s.name]).padStart(9)).join(' ')} | ${[m.load, m.stack, m.bagTrip, m.duct, m.fire].map(x => x.toFixed(1)).join(' ')} ${m.clutter} ${m.sharedCircuit ? 'shared' : 'own'} ${m.fridgeInSight ? 'seen' : 'hidden'} ${m.clearPath ? 'clear' : 'blocked'}`);
  }
  simLayout = NEUTRAL_LAYOUT;
  for (const sc of ['competent', 'sloppy']) {
    const vals = Object.values(out).map(r => r[sc]);
    const spread = Math.max(...vals) - Math.min(...vals);
    console.log(`${sc}: best − worst preset = ${(spread * 100).toFixed(1)} points — ${spread > 0.08 ? 'FLAG: one layout is just better (trade-offs too weak)' : 'ok (no layout strictly best)'}`);
  }
}

/** The usual run: no upgrades, 5 seeds (`-- seeds=20` for more), week 1, week 2 and steady state. */
function defaultReport() {
  const SEEDS = Array.from({ length: Number(args.find(a => /^seeds=\d+$/.test(a))?.slice(6)) || 5 }, (_, i) => i + 1);
  const detail = args.includes('week1') ? 'week1' : args.includes('week2') ? 'week2' : 'steady';
  const runs = SCRIPTS.map(script => ({
    script,
    week1: SEEDS.map(seed => playWeek(script, seed, 1)),
    week2: SEEDS.map(seed => playWeek(script, seed, 1, 2)),
    steady: SEEDS.map(seed => playWeek(script, seed, STEADY_FROM)),
  }));

  const days = CONFIG.week.days;
  console.log(`Keep It Running — headless week (start cash $${CONFIG.economy.startingCash}), ` +
    (detail === 'week1' ? 'week 1 of a new game' : detail === 'week2' ? `week 2 of the same game (days ${days + 1}–${2 * days})`
      : `steady state (days ${STEADY_FROM}–${STEADY_FROM + days - 1}, breakdowns at ${CONFIG.difficulty.breakdownByDay[CONFIG.difficulty.breakdownByDay.length - 1]})`));
  for (const r of runs) r[detail].forEach((w, i) => report(r.script.name, SEEDS[i], w));

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`.padStart(5);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const grace = CONFIG.difficulty.breakdownByDay.findIndex(m => m > 0); // days at the start with no breakdowns
  const ramp = CONFIG.difficulty.breakdownByDay;
  const rampFor = (from: number) => Array.from({ length: days }, (_, i) => ramp[Math.min(from + i, ramp.length) - 1]).join(', ');
  console.log(`\nWeek 1 (breakdowns by day: ${rampFor(1)}), week 2 (${rampFor(days + 1)}) and steady state. Scrap = sheets ruined / sheets cut.`);
  console.log(`${'script'.padEnd(10)} ${'seed'.padEnd(4)} | week 1: margin scrap  days 1-${grace} ruined/cut | week 2: margin scrap | steady: margin scrap`);
  for (const r of runs) {
    const rows = SEEDS.map((seed, i) => {
      const w1 = r.week1[i].g.week, w2 = r.week2[i].g.week, st = r.steady[i].g.week, early = w1.slice(0, grace);
      return { seed, m1: margin(w1), s1: scrapRate(w1), ruined: sum(early, 'sheetsScrapped'), cut: sum(early, 'sheetsDone'),
        m2: margin(w2), s2: scrapRate(w2), ms: margin(st), ss: scrapRate(st) };
    });
    const line = (label: string, x: { m1: number; s1: number; m2: number; s2: number; ms: number; ss: number }, ruinedCut: string) =>
      console.log(`${r.script.name.padEnd(10)} ${label} |        ${pct(x.m1)} ${pct(x.s1)}  ${ruinedCut.padStart(13)}        |        ${pct(x.m2)} ${pct(x.s2)} |         ${pct(x.ms)} ${pct(x.ss)}`);
    for (const x of rows) line(`s${String(x.seed).padEnd(3)}`, x, `${x.ruined}/${x.cut}`);
    const avg = (k: 'm1' | 's1' | 'm2' | 's2' | 'ms' | 'ss') => mean(rows.map(x => x[k]));
    line('mean', { m1: avg('m1'), s1: avg('s1'), m2: avg('m2'), s2: avg('s2'), ms: avg('ms'), ss: avg('ss') },
      `${rows.reduce((s, x) => s + x.ruined, 0)}/${rows.reduce((s, x) => s + x.cut, 0)}`);
  }

  // beers per day: the cans you drank, and the ones you gave visiting mates (CONFIG.visitors caps those)
  const perDay = (ws: WeekResult[], f: (d: DayStats) => number) => mean(ws.map(w => w.g.week.reduce((s, d) => s + f(d), 0) / w.g.week.length));
  const mates = (d: DayStats) => d.mateBeer / CONFIG.beer.cost;
  console.log(`\nBeers per day, mean of seeds (yours / for mates; caps ${CONFIG.visitors.beersPerVisitor} per mate, ${CONFIG.visitors.beersPerDay} a day):`);
  console.log(`${'script'.padEnd(10)} |  week 1     |  week 2     |  steady`);
  for (const r of runs) {
    const cell = (ws: WeekResult[]) => `${perDay(ws, d => d.beers).toFixed(1)} / ${perDay(ws, mates).toFixed(1)}`.padEnd(11);
    console.log(`${r.script.name.padEnd(10)} |  ${cell(r.week1)}|  ${cell(r.week2)}|  ${cell(r.steady)}`);
  }

  // chores: what skipping them cost, per day
  if (CONFIG.chores) {
    console.log(`\nChores per day, mean of seeds (shifted = clamps left off, lifted = compressor not drained; boards = their cost):`);
    console.log(`${'script'.padEnd(10)} |  week 1: shifted lifted bin-spills boards |  week 2: shifted lifted spills boards |  steady: shifted lifted spills boards`);
    for (const r of runs) {
      const cell = (ws: WeekResult[]) => ['sheetsShifted', 'sheetsLifted', 'binOverflows', 'choreBoards'].map(k =>
        (k === 'choreBoards' ? `$${perDay(ws, d => d.choreBoards).toFixed(0)}` : perDay(ws, d => d[k as keyof DayStats] as number).toFixed(2)).padStart(k === 'binOverflows' ? 7 : 6)).join(' ');
      console.log(`${r.script.name.padEnd(10)} |        ${cell(r.week1)}   |        ${cell(r.week2)} |        ${cell(r.steady)}`);
    }
  }

  // rare events and milestones, over every run above (week 1, week 2 and the steady-state week, all seeds)
  if (CONFIG.rareEvents || CONFIG.milestones) {
    console.log(`\nRare events and milestones (${SEEDS.length} seeds × week 1, week 2, steady):`);
    for (const r of runs) {
      const games = [...r.week1, ...r.week2, ...r.steady].map(w => w.g);
      const events = games.flatMap(g => g.rareLog);
      const tally = new Map<string, number>();
      for (const e of events) tally.set(`${e.id} ${e.outcome}`, (tally.get(`${e.id} ${e.outcome}`) ?? 0) + 1);
      const unlocked = (id: string) => games.filter(g => g.milestones.unlocked.includes(id as never)).length;
      console.log(`${r.script.name.padEnd(10)} | events ${events.length}: ${[...tally].sort().map(([k, n]) => `${k} ${n}`).join(', ') || 'none'} | unlocked: spark arrestor ${unlocked('sparkArrestor')}/${games.length}, second bit rack ${unlocked('secondBitRack')}/${games.length}`);
    }
  }
}

/**
 * `npm run sim -- upgrades`: what the upgrades are worth, on 20 seeds compared seed for seed.
 * 1. Each upgrade owned (free) from the start of a steady-state week, one at a time and all together, against none: the
 *    margin and scrap it changes, and its payback (price over the weekly operating profit it adds). Competent's gains set
 *    its buying order (best payback first).
 * 2. Each script's buying policy against buying nothing, over a continuous four-week game: week 1, week 2, and weeks 3–4
 *    (past the breakdown ramp: the steady state, with whatever it bought).
 * Margin is operating margin: upgrades are capex and stay out of it, as in the game.
 */
function upgradeStudy() {
  const seeds = Array.from({ length: Number(args.slice(3).find(a => /^\d+$/.test(a))) || 20 }, (_, i) => i + 1); // `-- upgrades 100` for more
  const pct = (v: number, w = 5) => `${(v * 100).toFixed(1)}%`.padStart(w);
  const pts = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}`.padStart(6);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const profit = (days: DayStats[]) => days.reduce((s, d) => s + d.revenue - d.costs, 0);
  const byName = (n: string) => SCRIPTS.find(s => s.name === n)!;
  const ids = CONFIG.upgrades.map(u => u.id);

  /** Steady-state weeks (fresh, breakdowns at the ramp's plateau) for a script with these owned. */
  const steady = (script: Script, owned: readonly UpgradeId[]) => seeds.map(seed => playWeek(script, seed, STEADY_FROM, 1, { owned }).g.week);

  console.log(`Keep It Running — upgrades, ${seeds.length} seeds, paired (start cash $${CONFIG.economy.startingCash}, buffer $${BUY_BUFFER})`);
  const isolation: Record<string, Record<string, { dm: number; ds: number; dp: number; payback: number }>> = {};
  for (const name of ['competent', 'average']) {
    const script = byName(name);
    const base = steady(script, []);
    const bm = mean(base.map(margin)), bs = mean(base.map(scrapRate)), bp = mean(base.map(profit));
    console.log(`\n${name}: steady-state week, each upgrade owned from the start (baseline margin ${pct(bm)}, scrap ${pct(bs)})`);
    console.log(`${'upgrade'.padEnd(21)} price  | margin  Δpts (±SE) | scrap   Δpts (±SE) | Δprofit/wk | payback`);
    const rows: Record<string, { dm: number; ds: number; dp: number; payback: number }> = {};
    for (const id of [...ids, 'all']) {
      const owned = id === 'all' ? ids : [id as UpgradeId];
      const ws = steady(script, owned);
      const m = mean(ws.map(margin)), sc = mean(ws.map(scrapRate)), p = mean(ws.map(profit));
      // standard error of the paired, seed-by-seed difference: how much of Δ is just which seeds came up
      const se = (f: (d: DayStats[]) => number) => {
        const d = ws.map((w, i) => f(w) - f(base[i])), mu = mean(d);
        return Math.sqrt(d.reduce((s, x) => s + (x - mu) ** 2, 0) / (d.length - 1) / d.length);
      };
      const cost = owned.reduce((s, x) => s + price(x), 0);
      const dp = p - bp, payback = dp > 0 ? cost / dp : Infinity;
      rows[id] = { dm: m - bm, ds: sc - bs, dp, payback };
      console.log(`${(id === 'all' ? 'all of them' : id).padEnd(21)} $${String(cost).padEnd(5)} | ${pct(m)} ${pts(m - bm)} (±${(se(margin) * 100).toFixed(1)}) | ${pct(sc)} ${pts(sc - bs)} (±${(se(scrapRate) * 100).toFixed(1)}) | ${`$${dp.toFixed(0)}`.padStart(10)} | ${Number.isFinite(payback) ? `${payback.toFixed(1)} wk` : 'never'}`);
    }
    isolation[name] = rows;
  }
  // competent buys the best payback first: most weekly profit per dollar
  // competent buys the best payback first, and nothing that didn't pay at all
  competentOrder = ids.filter(id => isolation.competent[id].dp > 0)
    .sort((a, b) => isolation.competent[b].dp / price(b) - isolation.competent[a].dp / price(a));
  console.log(`\ncompetent's buying order (best payback first; skips what didn't pay): ${competentOrder.join(', ')}`);

  console.log(`\nBuying policy vs buying nothing, continuous 4-week game (weeks 3–4: steady state with what it bought)`);
  console.log('solvent = never refused ply for want of money, and cash ≥ 0 at the end of week 4');
  console.log(`${'script'.padEnd(10)} | solvent   | week 1 margin / scrap      | week 2 margin / scrap      | weeks 3–4 margin / scrap   | bought (mean) | cash end wk 4`);
  const policy: Record<string, { none: number[]; buy: number[]; scrapNone: number[]; scrapBuy: number[] }> = {};
  for (const script of SCRIPTS) {
    const none = seeds.map(seed => playWeek(script, seed, 1, 4));
    const buy = seeds.map(seed => playWeek(script, seed, 1, 4, { buying: true }));
    const cell = (wk: (r: typeof none[number]) => DayStats[]) =>
      `${pct(mean(none.map(r => margin(wk(r)))))} → ${pct(mean(buy.map(r => margin(wk(r)))))} / ${pct(mean(none.map(r => scrapRate(wk(r)))), 4)} → ${pct(mean(buy.map(r => scrapRate(wk(r)))), 4)}`;
    const late = (r: typeof none[number]) => [...r.weeks[2], ...r.weeks[3]];
    const solvent = (rs: typeof none) => rs.filter(r => r.refused === 0 && r.g.cash >= 0).length;
    console.log(`${script.name.padEnd(10)} | ${`${solvent(none)} → ${solvent(buy)}`.padEnd(9)} | ${cell(r => r.weeks[0])} | ${cell(r => r.weeks[1])} | ${cell(late)} | ${mean(buy.map(r => r.g.upgrades.size)).toFixed(1).padStart(13)} | $${mean(none.map(r => r.g.cash)).toFixed(0)} → $${mean(buy.map(r => r.g.cash)).toFixed(0)}`);
    const counts = Object.fromEntries(ids.map(id => [id, buy.filter(r => r.g.upgrades.has(id)).length]));
    console.log(`${''.padEnd(10)}   bought by end of week 4 (seeds of ${seeds.length}): ${ids.map(id => `${id} ${counts[id]}`).join(', ')}`);
    policy[script.name] = { none: none.map(r => margin(late(r))), buy: buy.map(r => margin(late(r))), scrapNone: none.map(r => scrapRate(late(r))), scrapBuy: buy.map(r => scrapRate(late(r))) };
  }

  // pass/fail (claude/office-manager-and-upgrades.md)
  const avg = isolation.average, comp = isolation.competent;
  const single = Math.max(...ids.map(id => avg[id].dm));
  const allComp = mean(steady(byName('competent'), ids).map(margin));
  const compPolicyLate = mean(policy.competent.buy);
  const sensor = avg.faultSensor.ds;
  console.log('\nPass/fail');
  console.log(`  no single upgrade lifts average more than 5 points: biggest ${pts(single)} (${ids.find(id => avg[id].dm === single)}) — ${single <= 0.05 ? 'PASS' : 'FAIL'}`);
  console.log(`  everything owned keeps competent at or under 20%: steady ${pct(allComp)}, weeks 3–4 with its buying ${pct(compPolicyLate)} — ${allComp <= 0.2 && compPolicyLate <= 0.2 ? 'PASS' : 'FAIL'}`);
  console.log(`  average with the fault sensor has clearly lower steady-state scrap: ${pts(sensor)} points (${pct(mean(steady(byName('average'), []).map(scrapRate)))} → ${pct(mean(steady(byName('average'), ['faultSensor']).map(scrapRate)))}) — ${sensor <= -0.05 ? 'PASS' : 'FAIL'}`);
  void comp;
}

/**
 * `npm run sim -- dennis [seeds]`: competent's margin over two weeks from the steady state, three ways per seed —
 * without Dennis, saying yes to every bet, saying no to every bet. Target: yes beats no clearly on average, but the
 * worst yes seed loses to the best no seed (they're real risks).
 */
function dennisStudy() {
  simOnly.kind = (dennisOnly() as BetKind | undefined) ?? null;
  const seeds = Array.from({ length: Number(args.slice(3).find(a => /^\d+$/.test(a))) || 20 }, (_, i) => i + 1);
  const comp = SCRIPTS.find(s => s.name === 'competent')!;
  const tally: Record<string, { n: number; won: number; net: number; open: number }> = {};
  const run = (seed: number, on: boolean, says: 'yes' | 'no') => {
    (CONFIG.dennis as { enabled: boolean }).enabled = on; dennisSays = says;
    const r = playWeek(comp, seed, STEADY_FROM, 4);
    const days = r.weeks.flat();
    if (on && says === 'yes') for (const b of r.g.dennis.bets) { const t = (tally[b.kind] ??= { n: 0, won: 0, net: 0, open: 0 }); t.n++; if (b.status === 'won') t.won++; if (b.status === 'open') t.open++; t.net += b.net; }
    return { m: margin(days), cash: r.g.cash, bets: r.g.dennis.bets.filter(b => b.status === 'won' || b.status === 'lost' || b.status === 'open').length,
      won: r.g.dennis.bets.filter(b => b.status === 'won').length, lost: r.g.dennis.bets.filter(b => b.status === 'lost').length };
  };
  const rows = seeds.map(seed => ({ seed, off: run(seed, false, 'no'), yes: run(seed, true, 'yes'), no: run(seed, true, 'no') }));
  (CONFIG.dennis as { enabled: boolean }).enabled = false;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`\nDennis: competent, four weeks from the steady state, ${seeds.length} seeds. Operating margin.`);
  console.log('seed |  without | yes to all (won/lost) | no to all');
  for (const r of rows) console.log(`${String(r.seed).padStart(4)} | ${pct(r.off.m)}   | ${pct(r.yes.m)} (${r.yes.won}/${r.yes.lost})        | ${pct(r.no.m)}`);
  const yes = rows.map(r => r.yes.m), no = rows.map(r => r.no.m), off = rows.map(r => r.off.m);
  console.log(`mean | ${pct(mean(off))}   | ${pct(mean(yes))}              | ${pct(mean(no))}`);
  const clear = mean(yes) - mean(no), worstYes = Math.min(...yes), bestNo = Math.max(...no);
  console.log(`yes beats no on average by ${(clear * 100).toFixed(1)} points — ${clear >= 0.02 ? 'PASS' : 'FAIL'} (want a clear margin, 2+ points)`);
  console.log('by bet (yes to all): ' + Object.entries(tally).map(([k, t]) => `${k} ×${t.n} won ${t.won} open ${t.open} net $${Math.round(t.net / t.n)}`).join(' | '));
  console.log(`worst yes seed ${pct(worstYes)} vs best no seed ${pct(bestNo)} — ${worstYes < bestNo ? 'PASS (the risks are real)' : 'FAIL (too safe)'}`);
}

/**
 * `npm run sim -- --lease [seeds]`: The Lease — 20 working days from day 1 on one seed, as the game plays it. The rent
 * (CONFIG.lease.rentDue) is due at the end: the cash in the bank on day 20 has to cover it. Reports the rent-made rate
 * per script (target: competent ~85%, sloppy ~25%) and the spread of what they finish with.
 */
function leaseStudy() {
  const seeds = Array.from({ length: Number(args.slice(3).find(a => /^\d+$/.test(a))) || 40 }, (_, i) => i + 1);
  const due = CONFIG.lease.rentDue;
  console.log(`\nThe Lease: ${CONFIG.lease.weeks} weeks from day 1, ${seeds.length} seeds. Rent due at the end: $${due} in the bank.`);
  const ends: Record<string, number[]> = {};
  for (const sc of SCRIPTS) {
    const finish = ends[sc.name] = seeds.map(seed => playWeek(sc, seed, 1, CONFIG.lease.weeks).g.cash).sort((a, b) => a - b);
    const made = finish.filter(c => c >= due).length / finish.length;
    const q = (p: number) => Math.round(finish[Math.min(finish.length - 1, Math.floor(p * finish.length))]);
    const mean = Math.round(finish.reduce((a, b) => a + b, 0) / finish.length);
    const outcomes = Object.fromEntries(ENDINGS.map(e => [e, finish.filter(c => outcome(c, due) === e).length])) as Record<Ending, number>;
    console.log(`${sc.name.padEnd(10)} rent made ${(made * 100).toFixed(0).padStart(3)}% | spare (mean) $${mean - due} | endings ${ENDINGS.map(e => outcomes[e]).join('/')} (flying/comfortably/made it/scraped/didn't) | cash at the end: worst $${q(0)} · 5% $${q(0.05)} · 25% $${q(0.25)} · median $${q(0.5)} · 75% $${q(0.75)} · best $${q(0.999)}`);
  }
  // where the money goes over a lease, per script (mean of seeds)
  if (args.includes('breakdown')) {
    const keys: (keyof DayStats)[] = ['revenue', 'materials', 'labour', 'consumables', 'fixes', 'beer', 'mateBeer', 'fees', 'deliveryFees', 'overdraftFees', 'latePayLost', 'lostJobsValue', 'choreBoards', 'walkIns', 'walkInCount', 'sheetsDone', 'sheetsScrapped', 'sheetsLate', 'sheetsLost', 'sheetsMissed', 'firesDuct', 'firesExtractor'];
    for (const sc of SCRIPTS) {
      const runs = seeds.map(seed => playWeek(sc, seed, 1, CONFIG.lease.weeks).weeks.flat());
      console.log(`${sc.name.padEnd(10)} ` + keys.map(k => `${k}=${Math.round(runs.reduce((a, days) => a + days.reduce((b, d) => b + (d[k] ?? 0), 0), 0) / runs.length)}`).join(' '));
    }
  }
  if (args.includes('weekly')) {
    for (const sc of SCRIPTS) {
      const runs = seeds.map(seed => playWeek(sc, seed, 1, CONFIG.lease.weeks));
      const wk = (i: number, k: keyof DayStats) => Math.round(runs.reduce((a, r) => a + r.weeks[i].reduce((b, d) => b + (d[k] ?? 0), 0), 0) / runs.length);
      console.log(`${sc.name.padEnd(10)} refused orders/lease=${(runs.reduce((a, r) => a + r.refused, 0) / runs.length).toFixed(1)} | ` + [0, 1, 2, 3].map(i => `wk${i + 1}: done=${wk(i, 'sheetsDone')} lost=${wk(i, 'sheetsLost')} rev=${wk(i, 'revenue')} stockout=${wk(i, 'stockOutMinutes')}m`).join(' | '));
    }
  }
  // what the rent figure does to the rates (the day sim isn't touched: the rent's the only lever)
  const rate = (xs: number[], d: number) => `${Math.round(100 * xs.filter(c => c >= d).length / xs.length)}%`.padStart(4);
  console.log('rent due →  ' + SCRIPTS.map(s => s.name.padStart(10)).join(''));
  for (const d of [-3000, -2000, -1000, -500, 0, 500, 1000, 2000].map(x => CONFIG.lease.rentDue + x)) console.log(`$${d}`.padEnd(11) + SCRIPTS.map(s => rate(ends[s.name], d).padStart(10)).join(''));
}
