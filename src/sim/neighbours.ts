// Next door: Sal's joinery, Mick's fab shop, Priya's sign place. Each has a favour ledger (who owes whom), small deals
// on the phone or over the fence, and a cool-off when you've burned them. The router keeps cutting while you talk.
//
// The deals (numbers in CONFIG.neighbours):
//   Sal    borrow sheets when you're out and the truck's gone (owed back in sheets or cash at a markup, by a due day;
//          borrowing again adds to what you owe); repay early at his place; take an overflow job at his price (you can
//          ask for a bit more, once); lend him your wall extinguisher (he brings it back, or you go and get it)
//   Mick   rings when your extractor bag's blowing dust over his fence: empty it in time or he calls the council;
//          takes a load of your offcuts in his skip for a favour
//   Priya  buys your offcut bin
// Saying no politely never costs anything. Only a burned relationship cools a neighbour off (`burnDays`): a broken deal
// (Sal's overflow job pulled by the customer), an unpaid debt (past its due day and the grace), or an ignored complaint
// (the bag still full when Mick's patience runs out; he rings the council too).
//
// Rolls use their own seeded hash (Rng.derive(seed, 'neighbour', …)), so the shift's other streams don't move.

import { CONFIG, type JobTypeId } from '../config.js';
import type { Game } from './Game.js';
import { NEIGHBOUR_NAMES } from '../people/lines/neighbours.js';
import { Rng } from './rng.js';

import type { BorrowedPly, NeighbourId, NeighbourLedger } from './types.js';
export type { NeighbourId } from './types.js';
export const NEIGHBOUR_IDS: NeighbourId[] = ['sal', 'mick', 'priya'];

/** One answer in a conversation. `decline`: the polite no (B on a pad). `next: 'counter'`: it goes on to a counter-offer. */
export interface NeighbourChoice { label: string; decline?: boolean; next?: 'counter'; apply: (g: Game) => void }

const cfg = () => CONFIG.neighbours;
const first = (who: NeighbourId) => NEIGHBOUR_NAMES[who].split(' ')[0];
const roll = (g: Game, key: string, ...n: number[]) => Rng.derive(g.seed, 'neighbour', g.dayIndex, g.minute, key.split('').reduce((s, c) => s + c.charCodeAt(0), 0), ...n);

export function newNeighbourLedgers(): Record<NeighbourId, NeighbourLedger> {
  return { sal: { favour: 0, burnedUntil: 0 }, mick: { favour: 0, burnedUntil: 0 }, priya: { favour: 0, burnedUntil: 0 } };
}

/** What's been offered today (each deal rings at most once a day). */
export function newNeighbourDaily() {
  return { salOverflow: false, salExt: false, salBorrow: false, mickSkip: false, priyaBuy: false, mickNagged: false };
}
export type NeighbourDaily = ReturnType<typeof newNeighbourDaily>;

/** On speaking terms today: past their first day, and not cooling off. */
export function neighboursActive(g: Game, who: NeighbourId): boolean {
  if (!cfg().enabled || g.dayIndex < cfg().fromDay[who]) return false;
  return g.dayIndex >= g.neighbours[who].burnedUntil;
}

/** Cooling off (burned). */
export const burned = (g: Game, who: NeighbourId) => cfg().enabled && g.dayIndex >= cfg().fromDay[who] && g.dayIndex < g.neighbours[who].burnedUntil;

export function favourText(g: Game, who: NeighbourId): string {
  const name = first(who), f = g.neighbours[who].favour;
  if (burned(g, who)) return `${name}: not speaking to you till day ${g.neighbours[who].burnedUntil}`;
  if (f > 0) return `${name}: owes you ${f === 1 ? 'one' : f}`;
  if (f < 0) return `${name}: you owe ${-f === 1 ? 'one' : -f}`;
  return `${name}: square`;
}

export function ledgerLines(g: Game): string[] {
  if (!cfg().enabled) return [];
  return NEIGHBOUR_IDS.filter(id => g.dayIndex >= cfg().fromDay[id]).map(id => favourText(g, id));
}

export function adjustFavour(g: Game, who: NeighbourId, delta: number) {
  const L = g.neighbours[who];
  L.favour = Math.max(cfg().favourFloor, Math.min(cfg().favourCeil, L.favour + delta));
}

/** A burned relationship: they cool off for `burnDays`, and the ledger drops to the floor. */
export function burn(g: Game, who: NeighbourId, why: string) {
  const L = g.neighbours[who];
  L.burnedUntil = g.dayIndex + cfg().burnDays;
  L.favour = cfg().favourFloor;
  g.neighbourSay(`${why} ${first(who)}'s not speaking to you for ${cfg().burnDays} days.`, 'bad');
}

// ---------- Sal: what you owe him ----------

/** Everything you owe Sal: sheets, and the cash it'd take to square it all. */
export function salOwed(g: Game): { sheets: number; cash: number; due: number | null } {
  const d = g.salDebts;
  return { sheets: d.reduce((s, x) => s + x.sheets, 0), cash: d.reduce((s, x) => s + x.cashOwe, 0), due: d.length ? Math.min(...d.map(x => x.dueDay)) : null };
}

/** The cash Sal wants for `sheets` of `type` (his markup, less a bit for every favour he owes you). */
function borrowCost(g: Game, type: JobTypeId, sheets: number) {
  const t = CONFIG.jobs.types.find(x => x.id === type)!, s = cfg().sal;
  const markup = Math.max(1, s.borrowMarkup - s.markupPerFavour * Math.max(0, g.neighbours.sal.favour));
  return Math.round(t.boardCost * sheets * markup);
}

/** Borrow from Sal: the sheets now, owed back by the due day. Borrowing again adds a line to what you owe. */
export function salBorrow(g: Game, type: JobTypeId) {
  const sheets = cfg().sal.borrowSheets;
  const debt: BorrowedPly = { type, sheets, cashOwe: borrowCost(g, type, sheets), dueDay: g.dayIndex + cfg().sal.repayDays };
  g.stock[type] += sheets;
  g.salDebts.push(debt);
  g.neighbourDaily.salBorrow = true;
  g.neighbourSay(`Sal lent you ${sheets} sheets of ${type}. Back by day ${debt.dueDay}: sheets, or $${debt.cashOwe}.`, 'info');
}

/** Pay a debt back: in sheets if they're on the pallet (and `sheets`), else in cash. True if it was paid. */
function repay(g: Game, d: BorrowedPly, sheets: boolean): boolean {
  if (sheets && g.stock[d.type] >= d.sheets) g.stock[d.type] -= d.sheets;
  else if (g.cash - d.cashOwe >= -CONFIG.economy.overdraftLimit) g.neighbourSpend(d.cashOwe, 'materials', 'paid Sal back');
  else return false;
  g.salDebts = g.salDebts.filter(x => x !== d);
  return true;
}

/** Pay Sal everything you can (sheets first, then cash). How many debts were cleared. */
export function salRepayAll(g: Game, sheets = true): number {
  let n = 0;
  for (const d of [...g.salDebts]) if (repay(g, d, sheets)) n++;
  if (n) { adjustFavour(g, 'sal', 1); g.neighbourSay(sheets ? 'Squared up with Sal.' : 'Paid Sal back in cash.', 'good'); }
  return n;
}

// ---------- conversations ----------

type Scene = { lines: string[]; choices: NeighbourChoice[]; counter?: { line: string; choices: NeighbourChoice[] } };
export const SCENES = ['sal_borrow', 'sal_repay', 'sal_overflow', 'sal_ext', 'sal_ext_back', 'mick_complaint', 'mick_skip', 'priya_offcuts', 'chat'] as const;
export type SceneId = (typeof SCENES)[number];

/** The type you're out of, or the first type. */
const shortType = (g: Game): JobTypeId => (g.starvedTypes.find(t => CONFIG.jobs.types.some(j => j.id === t)) ?? CONFIG.jobs.types[0].id) as JobTypeId;

/** What Priya pays for the bin as it is (and a bit more for each favour she owes you). */
export const priyaPay = (g: Game) => Math.round(cfg().priya.binPay * g.offcutBin + cfg().priya.payPerFavour * Math.max(0, g.neighbours.priya.favour));

/** Sal's overflow job: the material, the sheets, the price (all of it): today's, priced like your own work at his margin. */
function overflowOffer(g: Game) {
  const jobs = g.salOverflowJobs();
  return { material: jobs[0].material, sheets: jobs.length, price: jobs.reduce((s, j) => s + j.price, 0) };
}

function sceneFor(g: Game, who: NeighbourId, scene: SceneId): Scene | null {
  const c = cfg();
  switch (scene) {
    case 'sal_borrow': {
      if (who !== 'sal') return null;
      const type = shortType(g), sheets = c.sal.borrowSheets, cost = borrowCost(g, type, sheets);
      const owed = salOwed(g);
      return {
        lines: [owed.sheets ? `Out again? That'd be ${owed.sheets + sheets} sheets you owe me.` : `Short on ${type}? I've got ${sheets} sheets.`,
          `Back by day ${g.dayIndex + c.sal.repayDays}: the sheets, or $${cost}.`],
        choices: [
          { label: `Borrow ${sheets} sheets`, apply: gg => salBorrow(gg, type) },
          { label: 'No thanks', decline: true, apply: () => {} },
        ],
      };
    }
    case 'sal_repay': {
      if (who !== 'sal' || !g.salDebts.length) return null;
      const o = salOwed(g), canSheets = g.salDebts.every(d => g.stock[d.type] >= d.sheets);
      return {
        lines: [`You owe me ${o.sheets} sheet${o.sheets === 1 ? '' : 's'}${o.due !== null ? `, by day ${o.due}` : ''}.`, `Or $${o.cash} and we're square.`],
        choices: [
          ...(canSheets ? [{ label: `Give him the ${o.sheets} sheets`, apply: (gg: Game) => { salRepayAll(gg, true); } }] : []),
          { label: `Pay $${o.cash}`, apply: gg => { salRepayAll(gg, false); } },
          { label: 'Next week, mate', decline: true, apply: () => {} },
        ],
      };
    }
    case 'sal_overflow': {
      if (who !== 'sal') return null;
      const o = overflowOffer(g), more = Math.round(o.price * (1 + c.sal.haggle));
      return {
        lines: [`I'm slammed. ${o.sheets} sheets of ${o.material}, due today by ${g.formatTime(CONFIG.clock.endHour * 60 - c.sal.overflowDueBeforeClose)}.`, `$${o.price} the lot. Lower than your own work, I know.`],
        choices: [
          { label: `Take it ($${o.price})`, apply: gg => { gg.addSalJob(); adjustFavour(gg, 'sal', 1); } },
          { label: 'Ask for a bit more', next: 'counter', apply: () => {} },
          { label: 'Not today', decline: true, apply: () => {} },
        ],
        counter: { line: `$${more}. That's my lot.`, choices: [
          { label: `Done ($${more})`, apply: gg => { gg.addSalJob(1 + c.sal.haggle); } },
          { label: 'Leave it', decline: true, apply: () => {} },
        ] },
      };
    }
    case 'sal_ext':
      if (who !== 'sal' || g.lentExtinguisherTo || g.extinguisherAway || g.fire) return null;
      return {
        lines: ['Mine\'s empty. Lend us your wall extinguisher?', `I'll have it back on your bracket by ${g.formatTime(Math.min(CONFIG.clock.endHour * 60, g.minute + c.sal.extBackAfterMinutes))}.`],
        choices: [
          { label: 'Lend it', apply: gg => {
            gg.lentExtinguisherTo = 'sal'; gg.extBackAt = Math.min(CONFIG.clock.endHour * 60, gg.minute + c.sal.extBackAfterMinutes);
            adjustFavour(gg, 'sal', 1);
            gg.neighbourSay('Sal took the wall extinguisher. Its bracket\'s empty till he brings it back.', 'info');
          } },
          { label: 'Need it here', decline: true, apply: () => {} },
        ],
      };
    case 'sal_ext_back':
      if (who !== 'sal' || g.lentExtinguisherTo !== 'sal') return null;
      return {
        lines: ['Your extinguisher? Yeah, nearly done with it.'],
        choices: [
          { label: 'I need it back now', apply: gg => returnExtinguisher(gg, 'You took the extinguisher back from Sal. Back on its bracket.') },
          { label: 'Keep it a bit', decline: true, apply: () => {} },
        ],
      };
    case 'mick_complaint':
      if (who !== 'mick' || !g.mickComplaintUntil) return null;
      return {
        lines: ['Your bag\'s blowing dust over my fence again.', `Empty it by ${g.formatTime(g.mickComplaintUntil)} or I ring the council.`],
        choices: [
          { label: 'Sorry, on it', apply: () => {} },
          { label: 'Can\'t talk now', decline: true, apply: () => {} },
        ],
      };
    case 'mick_skip':
      if (who !== 'mick' || g.offcutBin <= 0) return null;
      return {
        lines: ['Got room in my skip. Chuck your offcuts in.', 'You owe me one.'],
        choices: [
          { label: 'Cheers, Mick', apply: gg => { gg.offcutBin = 0; adjustFavour(gg, 'mick', -1); gg.neighbourSay('Your offcuts went in Mick\'s skip.', 'good'); } },
          { label: 'I\'m right, thanks', decline: true, apply: () => {} },
        ],
      };
    case 'priya_offcuts': {
      if (who !== 'priya' || g.offcutBin <= 0) return null;
      const pay = priyaPay(g);
      return {
        lines: ['Any acrylic offcuts? I pay cash.', `$${pay} for what's in your bin.`],
        choices: [
          { label: `Sell them ($${pay})`, apply: gg => { gg.receiveNeighbourPay(pay, 'offcuts to Priya'); gg.offcutBin = 0; adjustFavour(gg, 'priya', 1); } },
          { label: 'Keep them', decline: true, apply: () => {} },
        ],
      };
    }
    case 'chat':
      return { lines: [CHAT[who][g.dayIndex % CHAT[who].length]], choices: [{ label: 'Back to it', decline: true, apply: () => {} }] };
  }
}

const CHAT: Record<NeighbourId, string[]> = {
  sal: ['Kitchen in Brunswick. Nothing\'s square in that house.', 'Quiet one. Don\'t say it out loud.'],
  mick: ['Welding all day. Can\'t hear a thing.', 'Your router sounds like a Harley.'],
  priya: ['Three shopfronts this week. Gold leaf, all of them.', 'People still want neon. I still say no.'],
};

/** What a visit's about, by what's going on: what he's got of yours, what you owe, a complaint, a sale. */
export function defaultVisitScene(g: Game, who: NeighbourId): SceneId {
  const has = (s: SceneId) => !!sceneFor(g, who, s);
  const order: Record<NeighbourId, SceneId[]> = {
    sal: ['sal_ext_back', 'sal_repay', 'sal_borrow', 'chat'],
    mick: ['mick_complaint', 'mick_skip', 'chat'],
    priya: ['priya_offcuts', 'chat'],
  };
  // (Sal only lends when you're short: otherwise it's a chat)
  return order[who].find(s => has(s) && (s !== 'sal_borrow' || g.starvedTypes.length > 0)) ?? 'chat';
}

export function openTalk(g: Game, who: NeighbourId, via: 'phone' | 'visit', scene: SceneId): boolean {
  if (!neighboursActive(g, who) || !sceneFor(g, who, scene)) return false;
  g.neighbourTalk = { who, via, scene, step: 'offer' };
  return true;
}

export function talkLines(g: Game): string[] {
  const t = g.neighbourTalk;
  const sc = t && isScene(t.scene) ? sceneFor(g, t.who, t.scene) : null;
  if (!t || !sc) return [];
  return t.step === 'counter' && sc.counter ? [sc.counter.line] : sc.lines;
}

export function talkChoices(g: Game): NeighbourChoice[] {
  const t = g.neighbourTalk;
  const sc = t && isScene(t.scene) ? sceneFor(g, t.who, t.scene) : null;
  if (!t || !sc) return [];
  return t.step === 'counter' && sc.counter ? sc.counter.choices : sc.choices;
}

/** Pick an answer. A talk whose scene no longer applies (the bag got emptied meanwhile) just ends. */
export function pickTalk(g: Game, index: number): boolean {
  const t = g.neighbourTalk;
  if (!t) return false;
  const sc = isScene(t.scene) ? sceneFor(g, t.who, t.scene) : null;
  if (!sc) { g.neighbourTalk = null; return false; }
  const choices = t.step === 'counter' && sc.counter ? sc.counter.choices : sc.choices;
  const ch = choices[Math.max(0, Math.min(choices.length - 1, Math.floor(index) || 0))];
  ch.apply(g);
  if (ch.next === 'counter' && sc.counter && t.step !== 'counter') { t.step = 'counter'; return true; }
  // a chat over the fence takes a few minutes of your time (the router keeps going)
  if (t.via === 'visit' && g.canAct) g.busy = { label: `talking to ${first(t.who)}`, remaining: cfg().talkMinutes };
  g.neighbourTalk = null;
  return true;
}

/** The answer that's the polite no (B on a pad, Esc). -1: none. */
export function declineIndex(g: Game): number { return talkChoices(g).findIndex(c => c.decline); }

/** A scene we know (a talk saved mid-way is checked against these). */
export const isScene = (s: unknown): s is SceneId => typeof s === 'string' && (SCENES as readonly string[]).includes(s);

// ---------- the extinguisher ----------

function returnExtinguisher(g: Game, line: string) {
  g.lentExtinguisherTo = null; g.extBackAt = -1;
  g.neighbourSay(line, 'good');
}

// ---------- the phone, and each minute ----------

function ring(g: Game, who: NeighbourId, scene: SceneId, line: string) {
  if (g.distractions.some(d => d.neighbour === who) || g.neighbourTalk) return;
  if (!sceneFor(g, who, scene)) return;
  g.distractions.push({
    id: g.nextDistractionId++, kind: 'phone', title: NEIGHBOUR_NAMES[who], line, remaining: cfg().phoneWindow,
    engaged: false, neighbour: who, neighbourScene: scene,
  });
}

/** Each game minute (Game.tick). */
export function tickNeighbours(g: Game) {
  const c = cfg();
  if (!c.enabled || g.phase !== 'day') return;
  const m = g.minute, D = g.neighbourDaily;

  // the extinguisher comes home on time
  if (g.lentExtinguisherTo && g.extBackAt >= 0 && m >= g.extBackAt) returnExtinguisher(g, 'Sal brought your extinguisher back. Back on its bracket.');

  // a debt past its due day: taken back from the pallet if the sheets are there, else in cash; past the grace, a bill
  for (const d of [...g.salDebts]) {
    if (g.dayIndex <= d.dueDay) continue;
    if (repay(g, d, true)) { g.neighbourSay('Sal came and took back what you owed him.', 'info'); continue; }
    if (g.dayIndex > d.dueDay + c.sal.graceDays) {
      g.neighbourSpend(d.cashOwe, 'materials', 'Sal\'s bill');
      g.salDebts = g.salDebts.filter(x => x !== d);
      burn(g, 'sal', `You never paid Sal back. He sent a bill for $${d.cashOwe}.`);
    }
  }

  // Mick: a full bag blows dust over his fence; empty it by the deadline, or he rings the council
  if (neighboursActive(g, 'mick') && !D.mickNagged && !g.mickComplaintUntil && 1 - g.wear.filter > c.mick.bagAbove) {
    D.mickNagged = true;
    g.mickComplaintUntil = Math.min(CONFIG.clock.endHour * 60, m + c.mick.complaintMinutes + c.mick.graceMinutesPerFavour * Math.max(0, g.neighbours.mick.favour));
    ring(g, 'mick', 'mick_complaint', 'Dust on my side again. Empty that bag.');
    g.neighbourSay('Mick\'s on about the dust from your extractor.', 'bad');
  }
  if (g.mickComplaintUntil) {
    if (1 - g.wear.filter <= c.mick.bagAbove) { g.mickComplaintUntil = 0; adjustFavour(g, 'mick', 1); g.neighbourSay('Bag\'s emptied. Mick\'s happy.', 'good'); }
    else if (m >= g.mickComplaintUntil) {
      // ignored: he stops talking to you; the second time, he rings the council too
      g.mickComplaintUntil = 0;
      g.mickStrikes += 1;
      if (g.mickStrikes >= c.mick.councilAfterStrikes && g.triggerMickCouncil()) { g.mickStrikes = 0; burn(g, 'mick', 'The bag\'s still full and Mick rang the council.'); }
      else burn(g, 'mick', 'The bag\'s still full and Mick\'s had enough.');
    }
  }

  // Sal: you're out and the truck's been: he rings to lend
  const pastCutoff = m >= CONFIG.supply.cutoffHour * 60, truckGone = !g.deliveries.some(d => d.day === g.dayIndex);
  if (neighboursActive(g, 'sal') && !D.salBorrow && pastCutoff && truckGone && g.starvedTypes.length && roll(g, 'salBorrow').chance(c.sal.borrowCallChance)) {
    D.salBorrow = true;
    ring(g, 'sal', 'sal_borrow', 'Truck\'s gone. You still short?');
  }
  if (neighboursActive(g, 'sal') && !D.salOverflow && m >= c.sal.overflowFromHour * 60 && m < c.sal.overflowUntilHour * 60 && roll(g, 'salOverflow').chance(c.sal.overflowChance)) {
    D.salOverflow = true;
    ring(g, 'sal', 'sal_overflow', 'Got more than I can cut. Want a job?');
  }
  if (neighboursActive(g, 'sal') && !D.salExt && m >= c.sal.extFromHour * 60 && m < CONFIG.clock.endHour * 60 - c.sal.extBackAfterMinutes && roll(g, 'salExt').chance(c.sal.extChance)) {
    D.salExt = true;
    ring(g, 'sal', 'sal_ext', 'Can I borrow your extinguisher?');
  }
  if (neighboursActive(g, 'mick') && !D.mickSkip && g.offcutBin >= c.mick.skipBinAbove && roll(g, 'mickSkip').chance(c.mick.skipChance)) {
    D.mickSkip = true;
    ring(g, 'mick', 'mick_skip', 'Room in my skip if you want it.');
  }
  if (neighboursActive(g, 'priya') && !D.priyaBuy && g.offcutBin >= c.priya.binAbove && roll(g, 'priyaBuy').chance(c.priya.buyChance)) {
    D.priyaBuy = true;
    ring(g, 'priya', 'priya_offcuts', 'I\'ll buy what\'s in your offcut bin.');
  }
}

/** Each morning (Game.startDay): today's offers reset; Sal's overflow sheets pulled overnight are a broken deal. */
export function startNeighbourDay(g: Game) {
  g.neighbourDaily = newNeighbourDaily();
  g.neighbourTalk = null;
  if (g.lentExtinguisherTo) returnExtinguisher(g, 'Sal left your extinguisher back on its bracket last night.');
  g.mickComplaintUntil = 0;
  const broken = g.salJobIds.some(id => g.jobs.some(j => j.id === id && j.status === 'lost'));
  g.salJobIds = g.salJobIds.filter(id => g.jobs.some(j => j.id === id && (j.status === 'queued' || j.status === 'cutting')));
  if (broken) burn(g, 'sal', 'Sal\'s overflow job never went out: his customer pulled it.');
}

// ---------- the scripts (the balance sim) ----------

/**
 * How each script treats the neighbours (coin flips on the neighbour stream, so the shift's own rolls don't move).
 * competent: answers, borrows when short (and goes round when he doesn't ring), takes overflow it has room for, sells
 * the bin, takes Mick's skip, empties the bag when Mick rings. average: some of the time. sloppy: lets the phone ring
 * out and ignores Mick, who rings the council.
 */
export const NEIGHBOUR_PROFILES = {
  competent: { answer: 1, borrow: 1, overflow: 1, sell: 1, skip: 1, fixBag: 1, visitWhenShort: 1 },
  average: { answer: 0.6, borrow: 0.5, overflow: 0.4, sell: 0.5, skip: 0.5, fixBag: 0.6, visitWhenShort: 0.25 },
  sloppy: { answer: 0, borrow: 0, overflow: 0, sell: 0, skip: 0, fixBag: 0, visitWhenShort: 0 },
} as const;
export type NeighbourProfile = keyof typeof NEIGHBOUR_PROFILES;

/** One minute of a script's dealings with the neighbours. True: that was this minute's action. */
export function neighbourPolicy(g: Game, profile: NeighbourProfile, roomForMore: boolean): boolean {
  const c = cfg(), P = NEIGHBOUR_PROFILES[profile];
  if (!c.enabled || g.phase !== 'day') return false;
  const coin = (k: string, p: number, n = 0) => p >= 1 || (p > 0 && roll(g, `pol-${profile}-${k}`, n).chance(p));
  // a talk that's open: answer it
  const t = g.neighbourTalk;
  if (t) {
    const choices = talkChoices(g), yes = choices.findIndex(x => !x.decline && x.next !== 'counter'), no = declineIndex(g);
    let pick = no;
    switch (t.scene) {
      case 'sal_borrow': pick = coin('borrow', P.borrow) ? yes : no; break;
      case 'sal_repay': pick = yes; break;
      case 'sal_overflow': pick = roomForMore && coin('overflow', P.overflow) ? yes : no; break;
      case 'mick_skip': pick = coin('skip', P.skip) ? yes : no; break;
      case 'priya_offcuts': pick = coin('sell', P.sell) ? yes : no; break;
      case 'sal_ext': pick = no; break; // nobody in the sim lends out the extinguisher
      default: pick = yes;
    }
    pickTalk(g, pick < 0 ? 0 : pick);
    return true;
  }
  if (!g.canAct) return false;
  // the phone: answered, or let ring out
  for (const d of g.distractions) {
    if (!d.neighbour || d.kind !== 'phone') continue;
    if (!coin('answer', P.answer, d.id)) continue;
    if (g.respond(d.id, 'answer')) return true;
  }
  // Mick's waiting on the bag: empty it
  if (g.mickComplaintUntil && coin('fixBag', P.fixBag, g.dayIndex) && g.replaceConsumable('filter')) return true;
  // out of a type with no truck coming and Sal hasn't rung: go round
  const pastCutoff = g.minute >= CONFIG.supply.cutoffHour * 60;
  const coming = (type: JobTypeId) => g.deliveries.some(d => d.lines.some(l => l.type === type));
  if (pastCutoff && !g.neighbourDaily.salBorrow && neighboursActive(g, 'sal') && g.starvedTypes.some(x => !coming(x)) && coin('visit', P.visitWhenShort, g.dayIndex)) {
    g.neighbourDaily.salBorrow = true;
    if (visit(g, 'sal', 'sal_borrow')) return true;
  }
  return false;
}

/** The sim walking round to a neighbour: the walk there and back (the router keeps cutting), then the talk. */
export function visit(g: Game, who: NeighbourId, scene: SceneId): boolean {
  if (!g.canAct || !openTalk(g, who, 'visit', scene)) return false;
  const [lo, hi] = cfg().walkMinutes[who];
  const walk = roll(g, 'walk', NEIGHBOUR_IDS.indexOf(who)).int(lo, hi);
  g.busy = { label: `round to ${first(who)}'s`, remaining: g.neighbourLayoutWalk(2 * walk) };
  return true;
}

// ---------- Kerr ----------

export function kerrNeighbourLines(g: Game): { cost: number; line: string }[] {
  const out: { cost: number; line: string }[] = [];
  if (!cfg().enabled) return out;
  const o = salOwed(g);
  if (o.sheets) out.push({ cost: o.cash, line: `You owe Sal ${o.sheets} sheets (or $${o.cash}) by day ${o.due}. Miss it and he stops talking.` });
  const fine = CONFIG.rareEvent.events.find(e => e.id === 'council')!.penalty;
  if (g.lentExtinguisherTo === 'sal') out.push({ cost: fine, line: 'Sal has your wall extinguisher. An inspector fines an empty bracket.' });
  if (g.mickComplaintUntil) out.push({ cost: fine, line: `Mick wants the bag emptied by ${g.formatTime(g.mickComplaintUntil)}. Then it's the council.` });
  return out;
}
