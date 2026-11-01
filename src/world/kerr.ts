// Kerr: the "local LLM" on the office computer (a Nac Mini under the desk). It isn't a model: it's rules over the day
// log and the day's numbers. On open: today's P&L so far, yesterday's, the rent clock; then 3–5 lines of advice, one per
// rule that fired, the costliest first. Dry and terse. Pure (no DOM): src/ui/kerr.ts draws it.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { DayStats } from '../sim/types.js';
import { leaseDay, leaseLength } from './lease.js';
import type { WorldState } from './state.js';

export interface KerrScreen {
  /** Label/value rows for the top of the screen. */
  header: [string, string][];
  /** 3–5 lines, costliest first. */
  advice: string[];
}

/** A rule that fired: what it cost (dollars, roughly) and the line Kerr says about it. */
interface Said { cost: number; line: string }

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-AU')}`;
const pl = (d: DayStats) => {
  const profit = d.revenue - d.costs, m = d.revenue > 0 ? ` (${Math.round((profit / d.revenue) * 100)}%)` : '';
  return `${money(d.revenue)} in, ${money(d.costs)} out, ${money(profit)}${m}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a sheet's worth to you, roughly: the price over the board, from what's on the board today (or a standard one). */
function sheetMargin(g: Game): number {
  const jobs = g.jobs.filter(j => j.status !== 'lost');
  if (!jobs.length) return CONFIG.jobs.priceBasisBoardCost;
  return jobs.reduce((s, j) => s + (j.price - j.materialCost), 0) / jobs.length;
}

/** The rules. Each reads the day (Game's log and numbers) and says one line if it has something to say. */
function rules(g: Game): Said[] {
  const d = g.today, out: Said[] = [];
  const perMinute = CONFIG.jobs.machineRatePerMinute;
  // the router sat idle (the day log's "Idle …" stretches)
  const idle = d.idleMinutes ?? 0;
  if (idle > CONFIG.kerr.idleOverMinutes) out.push({ cost: idle * perMinute, line: `Router idle ${idle} min today. About ${money(idle * perMinute)} of cutting. Have the next sheet on the bed before this one's done.` });
  // a fire with a full bag
  const hot = g.fireStarts.filter(f => f.bag > CONFIG.kerr.fullBagAbove);
  if (hot.length) {
    const f = hot[0], c = hot.length * CONFIG.kerr.fireCost;
    out.push({ cost: c, line: `${hot.length > 1 ? `${hot.length} fires` : `Fire at ${g.formatTime(f.minute)}`} with the bag ${Math.round(f.bag * 100)}% full. Full bags catch. Change it at ${Math.round(CONFIG.fire.bagFullAbove * 100)}.` });
  }
  // a ute kept waiting at the roller door
  const now = g.dayIndex * 1440 + g.minute, today = g.dayIndex * 1440;
  const waits = g.pickups.filter(p => p.hereAt !== undefined && p.hereAt >= today).map(p => ((p.doneAt ?? now) - p.hereAt!)).filter(m => m > CONFIG.pickup.honkAfterMinutes);
  if (waits.length) {
    const m = waits.reduce((s, x) => s + x, 0);
    out.push({ cost: m * CONFIG.kerr.waitCostPerMinute, line: `${waits.length > 1 ? `${waits.length} utes` : 'A ute'} waited ${m} min at the roller door. They remember that.` });
  }
  // sheets out late
  if ((d.latePayLost ?? 0) > 0) out.push({ cost: d.latePayLost, line: `${plural(d.sheetsLate, 'sheet')} late, ${money(d.latePayLost)} docked. Cut the tight deadlines first.` });
  // work turned down, or let ring out
  if (d.sheetsDeclined > 0) {
    const c = d.sheetsDeclined * sheetMargin(g);
    out.push({ cost: c, line: `Turned down ${plural(d.sheetsDeclined, 'sheet')}, about ${money(c)}. Fine if the board was full. Was it?` });
  }
  if (d.sheetsMissed > 0) {
    const c = d.sheetsMissed * sheetMargin(g);
    out.push({ cost: c, line: `${plural(d.sheetsMissed, 'sheet')} went elsewhere: nobody answered. About ${money(c)}.` });
  }
  // bit trouble (a dull bit chipping the edge, the collet letting go)
  const bit = g.faultsToday.filter(id => id === 'chipping' || id === 'collet').length;
  if (bit) out.push({ cost: bit * CONFIG.kerr.bitFaultCost, line: `Bit trouble ${bit > 1 ? `${bit} times` : 'today'}. Swap it at ${Math.round(CONFIG.ui.swapHintBelow * 100)}%, not when it starts chewing.` });
  // sheets in the skip
  if (d.sheetsScrapped > 0) {
    const c = d.sheetsScrapped * CONFIG.jobs.priceBasisBoardCost;
    out.push({ cost: c, line: `${plural(d.sheetsScrapped, 'sheet')} in the skip. About ${money(c)} of board, before the time.` });
  }
  return out;
}

/** When the rules are quiet: the rent pace, the consumables, and a sign-off. Free, so they always sort last. */
function filler(g: Game, w: WorldState): string[] {
  const out: string[] = [];
  const l = w.lease;
  if (l) {
    const left = leaseLength() - leaseDay(l, g), short = l.rentDue - g.cash;
    if (short > 0 && left > 0) out.push(`Rent pace: ${money(short / left)} a day for ${plural(left, 'day')}.`);
    else if (short <= 0) out.push('Rent is covered. Keep it that way.');
  }
  const d = g.today, m = d.revenue > 0 ? Math.round(((d.revenue - d.costs) / d.revenue) * 100) : null;
  out.push(`${money(g.cash)} in the bank.${m === null ? ' Nothing in yet today.' : ` ${m}% margin so far.`}`);
  out.push(`Bit ${Math.round(g.wear.bit * 100)}%. Bag ${Math.round((1 - g.wear.filter) * 100)}% full. Spoilboard ${Math.round(g.wear.spoilboard * 100)}%.`);
  out.push('Nothing else. Back to it.');
  return out;
}

export function kerrScreen(g: Game, w: WorldState): KerrScreen {
  const header: [string, string][] = [['TODAY SO FAR', pl(g.today)], ['YESTERDAY', g.lastDay ? pl(g.lastDay) : 'no record']];
  const l = w.lease;
  if (l) {
    const of = leaseLength(), day = leaseDay(l, g), left = Math.max(0, of - day), short = l.rentDue - g.cash;
    header.push(['RENT', `${money(l.rentDue)} due day ${of}. ${left ? `${plural(left, 'day')} left` : 'due today'}. ${short > 0 ? `${money(short)} short` : `covered (${money(-short)} spare)`}.`]);
  } else header.push(['RENT', 'none in the daily']);
  const said = rules(g).sort((a, b) => b.cost - a.cost).map(s => s.line).slice(0, CONFIG.kerr.maxLines);
  for (const f of filler(g, w)) if (said.length < CONFIG.kerr.minLines) said.push(f);
  return { header, advice: said };
}
