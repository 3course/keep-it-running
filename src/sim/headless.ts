// Headless balance check: plays a week with a simple "competent operator" policy
// and a "sloppy operator" policy, prints the P&L for each. Run with `npm run sim`.
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
    // chats when the machine's idle, sends them off when it's cutting
    if (d.kind === 'friend') g.respond(d.id, g.machine === 'cutting' ? 'disengage' : 'chat');
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
    if (d.kind === 'friend') g.respond(d.id, 'chat');
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

function runWeek(name: string, policy: Policy, seed: number, overtime: boolean) {
  const g = new Game(seed);
  let guard = 0;
  // Per day: minutes the bed sat empty (machine 'idle') while labour was on the clock, and the longest such run.
  // Fault downtime and consumable swaps aren't counted — this measures pacing, not breakdowns.
  const idle: { total: number; longest: number }[] = [];
  let idleDay: DayStats | null = null, run = 0;
  while (g.phase !== 'weekSummary' && guard++ < 100000) {
    if (g.phase === 'day') {
      if (idleDay !== g.today) { idleDay = g.today; idle.push({ total: 0, longest: 0 }); run = 0; }
      policy(g); g.tick();
      const today = idle[idle.length - 1];
      const phaseAfter = g.phase as Phase; // tick() can end the day; don't count the 7pm lights-off minute
      if (phaseAfter !== 'daySummary' && g.machine === 'idle') {
        today.total += 1; run += 1; today.longest = Math.max(today.longest, run);
      } else run = 0;
    }
    // a half-cut sheet on the bed counts as work left: knocking off would scrap it
    else if (g.phase === 'endOfDayPrompt') { overtime && !g.machineDown && (g.current || g.queued.length) ? g.startOvertime() : g.knockOff(); }
    else if (g.phase === 'daySummary') {
      if (name === 'competent' && !g.upgrades.has('extractor') && g.cash > 3500) g.buyUpgrade('extractor');
      g.nextDay();
    }
  }
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
  if (name === 'sloppy') console.log(`${''.padEnd(13)}beer: ${wk('beers').trim()} cans/day, fumbles ${wk('fumbles').trim()}/day (week ${g.week.reduce((s, d) => s + d.fumbles, 0)}), loo trips ${wk('looTrips').trim()}/day (week ${g.week.reduce((s, d) => s + d.looTrips, 0)})`);
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

console.log(`Keep It Running — headless week (start cash $${CONFIG.economy.startingCash})`);
for (const seed of [1, 2, 3, 4, 5]) runWeek('competent', competent, seed, true);
for (const seed of [1, 2, 3, 4, 5]) runWeek('sloppy', sloppy, seed, false);
