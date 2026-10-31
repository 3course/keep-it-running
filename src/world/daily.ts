// The daily: one day, the same for everyone, seeded from today's date in Melbourne. No carry-over: it starts from a
// canonical mid-run shed (the part-timer part-time, the shed as built, two thank-you cards on the board) and nothing
// is saved but the result and a local streak. No accounts, no server.
import { Game } from '../sim/Game.js';
import { newPeople } from '../people/state.js';
import { newWorld, type WorldState } from './state.js';

/** The canonical start: day 3 of week 2 (past the first-week ramp, before the steady state). */
export const DAILY_DAY = 8;
const KEY = 'kir-daily';

/** Today's date in Melbourne, YYYY-MM-DD. */
export function melbourneDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dailySeed(date: string): number {
  let h = 2166136261;
  for (const c of `kir-daily|${date}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483646 + 1;
}

/** The day's game and shed, from scratch. */
export function dailyStart(date = melbourneDate()): { game: Game; world: WorldState } {
  const game = new Game(dailySeed(date), DAILY_DAY);
  const world = newWorld(game);
  world.tour = null;
  const p = world.people = newPeople();
  p.trust = 8; // she knows you a bit; not enough to ask yet
  p.gifts.push({ kind: 'card', from: 'Nan Doreen', design: 'cubby-wall', dayIndex: game.dayIndex - 2, slot: 0 },
    { kind: 'card', from: 'The Okafors', design: 'house-27', dayIndex: game.dayIndex - 1, slot: 1 });
  return { game, world };
}

export interface DailyResult { date: string; margin: number; sheets: number; walked: number; costliest: string; emoji: string; streak: number; best: number }

/** Five emoji for the day: the money, on time, fire, the work, the people. */
export function emojiLine(g: Game, w: WorldState): string {
  const d = g.today, margin = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : -1;
  const money = margin >= 0.15 ? '💰' : margin >= 0 ? '🪙' : '📉';
  const time = d.sheetsLate > 0 || d.sheetsLost > 0 ? '⏰' : '✅';
  const fire = d.firesDuct + d.firesExtractor > 0 ? '🔥' : d.firesSpot > 0 ? '🧯' : '🌿';
  const work = d.sheetsScrapped > 0 ? '🗑️' : d.sheetsDone >= 7 ? '🪚' : '🪵';
  const people = w.people?.lastNight?.dayIndex === g.dayIndex ? '🍺' : (d.coffee ?? 0) > 0 ? '☕' : '🤝';
  return money + time + fire + work + people;
}

/** Record today's result (once a date) and the streak: a day in a row extends it. */
export function recordDaily(g: Game, w: WorldState, date = melbourneDate()): DailyResult {
  const d = g.today, margin = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : 0;
  let store: { last?: string; streak?: number; best?: number; results?: Record<string, number> } = {};
  try { store = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { /* blocked: a streak of one */ }
  if (store.last !== date) {
    const y = new Date(`${date}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    store.streak = store.last === yesterday ? (store.streak ?? 0) + 1 : 1;
    store.best = Math.max(store.best ?? 0, store.streak);
    store.last = date;
    store.results = { ...(store.results ?? {}), [date]: Math.round(margin * 1000) / 1000 };
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* fine */ }
  }
  return { date, margin, sheets: d.sheetsDone, walked: Math.round(w.walkedToday ?? 0), costliest: g.story ?? 'Nothing went badly. Rare.', emoji: emojiLine(g, w), streak: store.streak ?? 1, best: store.best ?? 1 };
}

/** The card as text, for sharing. */
export function shareText(r: DailyResult): string {
  const km = r.walked >= 1000 ? `${(r.walked / 1000).toFixed(1)} km` : `${r.walked} m`;
  return `Keep It Running · daily ${r.date}\n${r.emoji}\nMargin ${Math.round(r.margin * 100)}% · ${r.sheets} sheets · ${km} walked\nCost me most: ${r.costliest}\nStreak: ${r.streak} day${r.streak === 1 ? '' : 's'}`;
}
