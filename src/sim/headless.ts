// Headless balance check: plays a week with a simple "competent operator" policy
// and a "sloppy operator" policy, prints the P&L for each. Run with `npm run sim`.
import { Game } from './Game.js';
import { CONFIG } from '../config.js';

type Policy = (g: Game) => void;

const competent: Policy = (g) => {
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
    else g.respond(d.id, d.kind === 'courier' ? 'sign' : 'answer');
  }
  if (g.machine === 'idle' && g.queued.length) {
    // proactive maintenance between sheets
    if (g.wear.bit < 0.3) { g.replaceConsumable('bit'); return; }
    if (g.wear.filter < 0.25) { g.replaceConsumable('filter'); return; }
    g.loadNextSheet();
  }
};

const sloppy: Policy = (g) => {
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
  if (g.fridgeOpen && g.beersToday < 4 && g.rng.chance(0.02)) g.drinkBeer();
  if (g.machine === 'idle' && g.queued.length && g.rng.chance(0.5)) g.loadNextSheet();
};

function runWeek(name: string, policy: Policy, seed: number, overtime: boolean) {
  const g = new Game(seed);
  let guard = 0;
  while (g.phase !== 'weekSummary' && guard++ < 100000) {
    if (g.phase === 'day') { policy(g); g.tick(); }
    else if (g.phase === 'endOfDayPrompt') { overtime && g.queued.length ? g.startOvertime() : g.knockOff(); }
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
  console.log(
    `${name.padEnd(10)} seed=${seed} cash=$${g.cash.toFixed(0).padStart(6)} rev=$${rev.toFixed(0).padStart(5)} ` +
    `cost=$${cost.toFixed(0).padStart(5)} margin=${(margin * 100).toFixed(0).padStart(4)}% ` +
    `done=${done} late=${late} scrap=${scrap} faults=${faults} rapport=${g.rapport}`,
  );
}

console.log(`Keep It Running — headless week (start cash $${CONFIG.economy.startingCash})`);
for (const seed of [1, 2, 3, 4, 5]) runWeek('competent', competent, seed, true);
for (const seed of [1, 2, 3, 4, 5]) runWeek('sloppy', sloppy, seed, false);
