// Headless balance check: plays a week with a "competent", an "average" and a "sloppy" operator policy and prints
// the P&L for each. Run with `npm run sim`.
//
// Three weeks per script and seed: week 1 of a new game (breakdowns ramp in from zero, CONFIG.difficulty), week 2 of
// the same game (days 6–10, the middle of the ramp) and a steady-state week (a new game started past the end of the
// ramp, so breakdowns run at the full rate all week). The detailed lines are for the steady-state week;
// `npm run sim -- week1` or `-- week2` prints them for that week instead. All end with a summary: margin and scrap
// rate (sheets ruined / sheets cut) per script.
import { Game, type Phase } from './Game.js';
import { CONFIG } from '../config.js';
import type { DayStats } from './types.js';
import type { JobTypeId } from '../config.js';

type Policy = (g: Game) => void;

// The competent operator's rule of thumb for one sheet, start to finish, faults included. Not a game rule.
const COMPETENT_MINUTES_PER_SHEET = 40;

/** Open sheets due today (or overdue) already exceed what can be cut before 5pm. */
function overCommitted(g: Game): boolean {
  const dueToday = g.jobs.filter(j => (j.status === 'queued' || j.status === 'cutting') && j.dueDay <= g.dayIndex).length;
  const capacity = Math.max(0, CONFIG.clock.endHour * 60 - g.minute) / COMPETENT_MINUTES_PER_SHEET;
  return dueToday > capacity;
}

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

const competent: Policy = (g) => {
  // a fire beats everything: drop what you're doing and go
  if (g.fire && !g.fireResponse) g.fightFire();
  g.setSpraying(g.fireResponse?.step === 'atDuct');
  if (g.fireResponse) return;
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
    if (g.loadNextSheet()) return;
  }
  handleTruck(g); // between sheets, or while one cuts
};

// sloppy's call on each fire, made once when they notice it: true = leave it until it gets worse
const sloppyIgnores = new WeakMap<Game, Map<number, boolean>>();

const sloppy: Policy = (g) => {
  if (g.fireResponse) { g.setSpraying(g.fireResponse.step === 'atDuct'); return; }
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
  if (g.needLoo && g.looSlow >= 0.15) g.useToilet();
  if (g.machine === 'idle' && g.queued.length && g.rng.chance(0.5)) g.loadNextSheet();
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
  if (g.fireResponse) { g.setSpraying(g.fireResponse.step === 'atDuct'); return; }
  if (g.fire && averageReacts(g, `fire-${g.fire.id}`, 20, 60) && g.fightFire()) return;
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
    } else g.respond(d.id, d.kind === 'courier' ? 'sign' : 'answer');
  }
  for (const c of g.callbacks) g.callBack(c.id);
  competentOrders(g);
  if (g.machine === 'idle' && g.queued.length) {
    if (averageWantsSwap(g, 'bit', 0.3)) { g.replaceConsumable('bit'); return; }
    if (averageWantsSwap(g, 'filter', 0.25)) { g.replaceConsumable('filter'); return; }
    // in overtime, only a sheet that'll be off the bed by lights-out (a half-cut one is scrap)
    const next = g.nextUp();
    const fits = !g.overtime || (!!next && g.minute + CONFIG.jobs.loadMinutes + next.cutMinutes < CONFIG.clock.overtimeEndHour * 60);
    if (fits && g.rng.chance(0.8) && g.loadNextSheet()) return;
  }
  if (g.rng.chance(0.7)) handleTruck(g);
};

interface Script {
  name: string;
  policy: Policy;
  /** At 5pm: work overtime (to 7pm at double rate) or knock off? A half-cut sheet on the bed is scrap if you knock off. */
  overtime: (g: Game) => boolean;
}

const SCRIPTS: Script[] = [
  // a half-cut sheet on the bed counts as work left: knocking off would scrap it
  { name: 'competent', policy: competent, overtime: g => !g.machineDown && (!!g.current || g.queued.length > 0) },
  { name: 'average', policy: average, overtime: g => !g.machineDown && !!g.current }, // only to save the sheet on the bed
  { name: 'sloppy', policy: sloppy, overtime: () => false },
];

/** First day of a steady-state week: the ramp's last entry, which every later day uses too. */
const STEADY_FROM = CONFIG.difficulty.breakdownByDay.length;

interface WeekResult { g: Game; idle: { total: number; longest: number }[] }

/** Play `weeks` weeks of a new game starting on `firstDay`; the result is the last of them. */
function playWeek(script: Script, seed: number, firstDay: number, weeks = 1): WeekResult {
  const g = new Game(seed, firstDay);
  let idle: { total: number; longest: number }[] = [];
  for (let w = 0; w < weeks; w++) {
    if (w > 0) g.nextWeek();
    idle = playOn(script, g);
  }
  return { g, idle };
}

/** Play the rest of the week. Returns per day: minutes the bed sat empty (machine 'idle') while labour was on the
 * clock, and the longest such run. Fault downtime and consumable swaps aren't counted — this measures pacing, not breakdowns. */
function playOn(script: Script, g: Game) {
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
      if (script.name === 'competent' && !g.upgrades.has('extractor') && g.cash > 3500) g.buyUpgrade('extractor');
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

const SEEDS = [1, 2, 3, 4, 5];
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? []; // no Node types in this project
const detail = args[2] === 'week1' || args[2] === 'week2' ? args[2] : 'steady';
const runs = SCRIPTS.map(script => ({
  script,
  week1: SEEDS.map(seed => playWeek(script, seed, 1)),
  week2: SEEDS.map(seed => playWeek(script, seed, 1, 2)),
  steady: SEEDS.map(seed => playWeek(script, seed, STEADY_FROM)),
}));

const days = CONFIG.week.days;
console.log(`Keep It Running — headless week (start cash $${CONFIG.economy.startingCash}), ` +
  (detail === 'week1' ? 'week 1 of a new game' : detail === 'week2' ? `week 2 of the same game (days ${days + 1}–${2 * days})`
    : `steady state (days ${STEADY_FROM}–${STEADY_FROM + days - 1}, full breakdown rate)`));
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
