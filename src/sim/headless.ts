// Headless balance check: plays a week with a simple "competent operator" policy
// and a "sloppy operator" policy, prints the P&L for each. Run with `npm run sim`.
import { Game, type Phase } from './Game.js';
import { CONFIG } from '../config.js';
import type { DayStats } from './types.js';

type Policy = (g: Game) => void;

// The competent operator's rule of thumb for one sheet, start to finish, faults included. Not a game rule.
const COMPETENT_MINUTES_PER_SHEET = 40;

/** Open sheets due today (or overdue) already exceed what can be cut before 5pm. */
function overCommitted(g: Game): boolean {
  const dueToday = g.jobs.filter(j => (j.status === 'queued' || j.status === 'cutting') && j.dueDay <= g.dayIndex).length;
  const capacity = Math.max(0, CONFIG.clock.endHour * 60 - g.minute) / COMPETENT_MINUTES_PER_SHEET;
  return dueToday > capacity;
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
  for (const d of g.distractions) {
    // chats when the machine's idle, sends them off when it's cutting
    if (d.kind === 'friend') g.respond(d.id, g.machine === 'cutting' ? 'disengage' : 'chat');
    else if (d.order) g.respond(d.id, overCommitted(g) ? 'decline' : 'answer');
    else g.respond(d.id, d.kind === 'courier' ? 'sign' : 'answer');
  }
  for (const c of g.callbacks) g.callBack(c.id, overCommitted(g) ? 'decline' : 'answer');
  if (g.machine === 'idle' && g.queued.length) {
    // proactive maintenance between sheets
    if (g.wear.bit < 0.3) { g.replaceConsumable('bit'); return; }
    if (g.wear.filter < 0.25) { g.replaceConsumable('filter'); return; }
    g.loadNextSheet();
  }
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
  if (g.fridgeOpen && g.beersToday < 4 && g.rng.chance(0.02)) g.drinkBeer();
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
    `demand=${p(d1.sheetsDemanded, 2)} cut=${p(d1.sheetsDone, 2)} missed=${p(missed(d1), 2)} late=${p(d1.sheetsLate, 2)} declined=${p(d1.sheetsDeclined, 2)} | ` +
    `week: margin=${(margin * 100).toFixed(0).padStart(4)}% idle=${avg(d => d.total).toFixed(0).padStart(3)}m gap=${avg(d => d.longest).toFixed(0).padStart(3)}m (worst ${p(worstGap)}m) ` +
    `demand=${wk('sheetsDemanded')} cut=${wk('sheetsDone')} missed=${(g.week.reduce((s, d) => s + missed(d), 0) / n).toFixed(1).padStart(4)} late=${wk('sheetsLate')} declined=${wk('sheetsDeclined')} | ` +
    `cash=$${g.cash.toFixed(0).padStart(6)} scrap=${scrap} faults=${faults} rapport=${g.rapport}`,
  );
  const fires = (d: DayStats) => `${d.firesSpot}/${d.firesDuct}/${d.firesExtractor}`;
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
