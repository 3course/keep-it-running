// Next-door economy: favour ledger, walks, phone asks, and deals that don't pause the router.

import { CONFIG, type JobTypeId } from '../config.js';
import type { Game } from './Game.js';
import { NEIGHBOUR_NAMES } from '../people/lines/neighbours.js';
import { Rng } from './rng.js';

import type { BorrowedPly, NeighbourId, NeighbourLedger, NeighbourTalk } from './types.js';
export type { NeighbourId } from './types.js';
export const NEIGHBOUR_IDS: NeighbourId[] = ['sal', 'mick', 'priya'];

export interface NeighbourChoice { label: string; next?: 'counter' | 'done'; apply: (g: Game) => void }

const cfg = () => CONFIG.neighbours;
const roll = (g: Game, key: string, ...n: number[]) => Rng.derive(g.seed, 'neighbour', g.dayIndex, g.minute, key.split('').reduce((s, c) => s + c.charCodeAt(0), 0), ...n);

export function newNeighbourLedgers(): Record<NeighbourId, NeighbourLedger> {
  return { sal: { favour: 0, burnedUntil: 0 }, mick: { favour: 0, burnedUntil: 0 }, priya: { favour: 0, burnedUntil: 0 } };
}

export function newNeighbourDaily() {
  return { salOffered: false, priyaOffcut: false, mickNagged: false, salBorrowed: false };
}

export function neighboursActive(g: Game, who: NeighbourId): boolean {
  if (!cfg().enabled || g.dayIndex < cfg().fromDay[who]) return false;
  return g.dayIndex >= g.neighbours[who].burnedUntil;
}

export function favourText(who: NeighbourId, favour: number): string {
  const name = who === 'sal' ? 'Sal' : who === 'mick' ? 'Mick' : 'Priya';
  if (favour > 0) return `${name}: owes you ${favour === 1 ? 'one' : favour}`;
  if (favour < 0) return `${name}: you owe ${-favour === 1 ? 'one' : -favour}`;
  return `${name}: square`;
}

export function ledgerLines(g: Game): string[] {
  if (!cfg().enabled) return [];
  return NEIGHBOUR_IDS.filter(id => g.dayIndex >= cfg().fromDay[id]).map(id => favourText(id, g.neighbours[id].favour));
}

export function adjustFavour(g: Game, who: NeighbourId, delta: number, rude = false) {
  const L = g.neighbours[who];
  L.favour = Math.max(cfg().favourFloor, Math.min(cfg().favourCeil, L.favour + delta));
  if (rude || L.favour <= cfg().favourFloor) L.burnedUntil = g.dayIndex + cfg().burnDays;
}

function walkOneWay(g: Game, who: NeighbourId): number {
  const [lo, hi] = cfg().walkMinutes[who];
  return g.neighbourLayoutWalk(roll(g, 'walk', who === 'sal' ? 1 : who === 'mick' ? 2 : 3).int(lo, hi));
}

export function walkToNeighbour(g: Game, who: NeighbourId, walked = false): boolean {
  if (!neighboursActive(g, who) || g.phase !== 'day') return false;
  if (!walked) g.busy = { label: `walking to ${NEIGHBOUR_NAMES[who].split(' ')[0]}'s`, remaining: walkOneWay(g, who) };
  g.neighbourSite = who;
  return true;
}

export function walkHome(g: Game, walked = false): boolean {
  if (!g.neighbourSite || g.phase !== 'day') return false;
  const mins = walkOneWay(g, g.neighbourSite);
  if (!walked) g.busy = { label: 'walking back to the shed', remaining: mins };
  g.neighbourSite = null;
  return true;
}

type Scene = { lines: string[]; choices: NeighbourChoice[]; counter?: { line: string; choices: NeighbourChoice[] } };

function sceneFor(g: Game, who: NeighbourId, scene: string): Scene | null {
  const c = cfg();
  switch (scene) {
    case 'sal_borrow': {
      const type = (g.starvedTypes.find(t => CONFIG.jobs.types.some(j => j.id === t)) ?? CONFIG.jobs.types[0].id) as JobTypeId;
      const jobType = CONFIG.jobs.types.find(t => t.id === type)!;
      const sheets = c.sal.borrowSheets;
      const cost = Math.round(jobType.boardCost * sheets * c.sal.borrowMarkup);
      return {
        lines: [`Short on ${type}. Truck's gone.`, `I've got ${sheets} sheets. Pay me back in ply or $${cost}.`],
        choices: [
          { label: 'Borrow the sheets', apply: gg => {
            gg.stock[type] += sheets;
            gg.borrowedPly = { type, sheets, cashOwe: cost, dueDay: gg.dayIndex + 2 };
            adjustFavour(gg, 'sal', -1);
            gg.neighbourSay(`Sal lent ${sheets} sheets of ${type}.`, 'info');
          } },
          { label: 'Pay cash now', apply: gg => {
            if (gg.cash < cost) { gg.neighbourSay('Not enough cash for Sal.', 'bad'); return; }
            gg.neighbourSpend(cost, 'materials', 'borrowed ply');
            gg.stock[type] += sheets;
            adjustFavour(gg, 'sal', 1);
          } },
          { label: 'Not today', apply: gg => adjustFavour(gg, 'sal', 0, true) },
        ],
      };
    }
    case 'sal_overflow': {
      const t = g.neighbourJobType();
      const sheets = 3;
      const basis = Math.round(CONFIG.jobs.priceBasisBoardCost * t.priceMult);
      const price = Math.round(basis * sheets * c.sal.overflowMargin);
      return {
        lines: ['Overflow job — lower margin than your own board.', `${sheets} sheets of ${t.material}, ${price} total.`],
        choices: [
          { label: 'Take it', apply: gg => { gg.addSalJob(t, sheets, price); adjustFavour(gg, 'sal', 1); gg.neighbourDaily.salOffered = true; } },
          { label: 'Pass', apply: gg => { adjustFavour(gg, 'sal', -1, true); gg.neighbourDaily.salOffered = true; } },
        ],
        counter: { line: 'Best I can do on the price.', choices: [
          { label: 'Still pass', apply: gg => adjustFavour(gg, 'sal', -1, true) },
          { label: 'Fine, take it', apply: gg => { gg.addSalJob(t, sheets, Math.round(price * 1.05)); adjustFavour(gg, 'sal', 0); } },
        ] },
      };
    }
    case 'sal_ext':
      return {
        lines: ['Mine\'s empty. Can I borrow your wall extinguisher?', 'I\'ll bring it back this arvo.'],
        choices: [
          { label: 'Lend it', apply: gg => { gg.lentExtinguisherTo = 'sal'; adjustFavour(gg, 'sal', 1); gg.neighbourSay('Sal took the extinguisher.', 'info'); } },
          { label: 'Need it here', apply: gg => adjustFavour(gg, 'sal', -1) },
          { label: 'Piss off', apply: gg => adjustFavour(gg, 'sal', -2, true) },
        ],
      };
    case 'mick_complaint':
      return {
        lines: ['Bag\'s blowing dust over my fence again.', 'Empty it and we\'re sweet. Or I call the council.'],
        choices: [
          { label: 'Sorry — fixing it now', apply: gg => { gg.mickComplaintUntil = 0; adjustFavour(gg, 'mick', 1); } },
          { label: 'Router pays the filter', apply: gg => adjustFavour(gg, 'mick', -1) },
          { label: 'Complain yourself', apply: gg => { adjustFavour(gg, 'mick', -2, true); gg.triggerMickCouncil(); } },
        ],
      };
    case 'mick_skip':
      return {
        lines: ['Got half a skip. Swap you a load of offcuts for a favour?', 'Saves you a run.'],
        choices: [
          { label: 'Deal', apply: gg => { adjustFavour(gg, 'mick', 1); gg.mickSkipDeal = true; gg.neighbourSay('Mick\'ll take a load in his skip.', 'good'); } },
          { label: 'No thanks', apply: gg => adjustFavour(gg, 'mick', 0) },
        ],
        counter: { line: 'Throw in a coffee. One load.', choices: [
          { label: 'Done', apply: gg => { adjustFavour(gg, 'mick', 1); gg.mickSkipDeal = true; } },
          { label: 'Nah', apply: gg => adjustFavour(gg, 'mick', -1) },
        ] },
      };
    case 'priya_offcuts': {
      const pay = c.priya.offcutPay * Math.max(1, Math.round(g.offcutBin * 3));
      return {
        lines: ['Any clear acrylic offcuts?', `I'll give you $${pay} for what's in the bin.`],
        choices: [
          { label: `Sell ($${pay})`, apply: gg => { gg.receiveNeighbourPay(pay, 'offcuts to Priya'); gg.offcutBin = 0; adjustFavour(gg, 'priya', 1); gg.neighbourDaily.priyaOffcut = true; } },
          { label: 'Keep them', apply: gg => { gg.neighbourDaily.priyaOffcut = true; } },
        ],
      };
    }
    case 'priya_referral':
      return {
        lines: ['Refer signage both ways — eight percent kickback.', 'You send vinyl, I send router work.'],
        choices: [
          { label: 'Shake on it', apply: gg => { gg.priyaReferral = true; adjustFavour(gg, 'priya', 1); } },
          { label: 'Not now', apply: gg => adjustFavour(gg, 'priya', 0) },
        ],
        counter: { line: 'Six percent and I don\'t haggle.', choices: [
          { label: 'Six is fine', apply: gg => { gg.priyaReferral = true; adjustFavour(gg, 'priya', 0); } },
          { label: 'Walk away', apply: gg => adjustFavour(gg, 'priya', -1, true) },
        ] },
      };
    default:
      return null;
  }
}

export function defaultVisitScene(g: Game, who: NeighbourId): string {
  if (who === 'sal' && (g.borrowedPly || g.starvedTypes.length)) return 'sal_borrow';
  if (who === 'mick' && g.mickComplaintUntil) return 'mick_complaint';
  if (who === 'mick' && !g.mickSkipDeal) return 'mick_skip';
  if (who === 'priya' && g.offcutBin > 0.3) return 'priya_offcuts';
  if (who === 'priya' && !g.priyaReferral) return 'priya_referral';
  if (who === 'sal') return 'sal_overflow';
  return 'priya_offcuts';
}

export function openTalk(g: Game, who: NeighbourId, via: 'phone' | 'visit', scene: string): boolean {
  if (!neighboursActive(g, who)) return false;
  if (!sceneFor(g, who, scene)) return false;
  g.neighbourTalk = { who, via, scene, step: 'offer' };
  return true;
}

export function talkLines(g: Game): string[] {
  const t = g.neighbourTalk;
  if (!t) return [];
  const sc = sceneFor(g, t.who, t.scene);
  if (!sc) return [];
  if (t.step === 'counter' && sc.counter) return [sc.counter.line];
  return sc.lines;
}

export function talkChoices(g: Game): NeighbourChoice[] {
  const t = g.neighbourTalk;
  if (!t) return [];
  const sc = sceneFor(g, t.who, t.scene);
  if (!sc) return [];
  return t.step === 'counter' && sc.counter ? sc.counter.choices : sc.choices;
}

export function pickTalk(g: Game, index: number): boolean {
  const t = g.neighbourTalk;
  if (!t) return false;
  const choices = talkChoices(g);
  const ch = choices[index];
  if (!ch) return false;
  ch.apply(g);
  const sc = sceneFor(g, t.who, t.scene)!;
  if (ch.next === 'counter' && sc.counter) { t.step = 'counter'; return true; }
  const via = t.via;
  g.neighbourTalk = null;
  if (via === 'visit' && g.neighbourSite) walkHome(g, g.worldWalks);
  return true;
}

function spawnPhone(g: Game, who: NeighbourId, scene: string, line: string) {
  if (g.distractions.some(d => d.neighbour === who)) return;
  g.distractions.push({
    id: g.nextDistractionId++, kind: 'phone', title: NEIGHBOUR_NAMES[who], line, remaining: cfg().phoneWindow,
    engaged: false, neighbour: who, neighbourScene: scene,
  });
}

export function tickNeighbours(g: Game) {
  if (!cfg().enabled || g.phase !== 'day' || g.dayIndex === 1) return;
  if (!g.worldWalks && !cfg().simEvents) return;
  const c = cfg();

  if (g.borrowedPly && g.dayIndex > g.borrowedPly.dueDay) {
    const b = g.borrowedPly;
    if (g.stock[b.type] >= b.sheets) {
      g.stock[b.type] -= b.sheets;
      g.borrowedPly = null;
      adjustFavour(g, 'sal', 1);
      g.neighbourSay('Repaid Sal in sheets.', 'good');
    } else if (g.cash >= b.cashOwe) {
      g.neighbourSpend(b.cashOwe, 'materials', 'repay Sal');
      g.borrowedPly = null;
      adjustFavour(g, 'sal', 1);
    }
  }

  if (neighboursActive(g, 'mick') && !g.neighbourDaily.mickNagged && 1 - g.wear.filter > c.mick.bagAbove) {
    g.neighbourDaily.mickNagged = true;
    g.mickComplaintUntil = g.minute + c.mick.complaintMinutes;
    spawnPhone(g, 'mick', 'mick_complaint', 'Dust on my side again. Empty that bag.');
    g.neighbourSay('Mick\'s ringing about the extractor bag.', 'bad');
  }
  if (g.mickComplaintUntil && g.minute >= g.mickComplaintUntil && g.mickComplaintUntil > 0 && 1 - g.wear.filter > c.mick.bagAbove) {
    g.mickComplaintUntil = 0;
    g.triggerMickCouncil();
    adjustFavour(g, 'mick', -2, true);
  } else if (g.mickComplaintUntil && g.minute >= g.mickComplaintUntil) g.mickComplaintUntil = 0;

  const pastCutoff = g.minute >= CONFIG.supply.cutoffHour * 60;
  const truckGone = !g.deliveries.some(d => d.day === g.dayIndex);
  if (neighboursActive(g, 'sal') && pastCutoff && truckGone && g.starvedTypes.length && !g.borrowedPly) {
    if (roll(g, 'salBorrow').chance(0.06)) spawnPhone(g, 'sal', 'sal_borrow', 'Truck\'s gone. You still short?');
  }
  if (neighboursActive(g, 'sal') && !g.neighbourDaily.salOffered && g.minute > 10 * 60 && roll(g, 'salOverflow').chance(0.05)) {
    spawnPhone(g, 'sal', 'sal_overflow', 'Got crumbs. Want a job?');
  }
  if (neighboursActive(g, 'sal') && !g.lentExtinguisherTo && roll(g, 'salExt').chance(0.04) && g.minute > 11 * 60) {
    spawnPhone(g, 'sal', 'sal_ext', 'Can I borrow your extinguisher?');
  }
  if (neighboursActive(g, 'priya') && !g.neighbourDaily.priyaOffcut && g.offcutBin > 0.5 && roll(g, 'priyaOff').chance(0.1)) {
    spawnPhone(g, 'priya', 'priya_offcuts', 'I\'ll buy what\'s in your offcut bin.');
  }
  if (neighboursActive(g, 'priya') && !g.priyaReferral && g.dayIndex >= c.fromDay.priya + 2 && roll(g, 'priyaRef').chance(0.06)) {
    spawnPhone(g, 'priya', 'priya_referral', 'Referral deal — eight percent both ways.');
  }
}

/** Headless: borrow when starved, fix Mick's bag, decline low-margin overflow. */
export function neighbourPolicy(g: Game, sloppy: boolean, average: boolean): boolean {
  if (!cfg().enabled || g.phase !== 'day') return false;
  if (g.neighbourTalk) {
    pickTalk(g, sloppy ? 2 : 1);
    return true;
  }
  for (const d of g.distractions) {
    if (!d.neighbour || !d.neighbourScene) continue;
    if (!g.canAct) continue;
    if (sloppy && roll(g, 'nbSlop', d.id).chance(0.55)) { g.respond(d.id, 'decline'); return true; }
    if (d.neighbourScene === 'sal_overflow' || d.neighbourScene === 'priya_referral' || d.neighbourScene === 'sal_ext') {
      g.respond(d.id, 'decline');
      return true;
    }
    if (!g.respond(d.id, 'answer')) continue;
    const pick = d.neighbourScene === 'priya_offcuts' && g.offcutBin > 0.5 ? 0 : d.neighbourScene === 'mick_complaint' ? 0 : 2;
    pickTalk(g, Math.min(pick, talkChoices(g).length - 1));
    return true;
  }
  if (g.mickComplaintUntil && 1 - g.wear.filter > cfg().mick.bagAbove && g.canAct) {
    if (!sloppy || !roll(g, 'nbSlop', 1).chance(0.5)) {
      if (g.replaceConsumable('filter')) { g.mickComplaintUntil = 0; return true; }
    }
  }
  const pastCutoff = g.minute >= CONFIG.supply.cutoffHour * 60;
  if (!sloppy && pastCutoff && g.starvedTypes.length && !g.borrowedPly && !g.neighbourDaily.salBorrowed && g.canAct) {
    if (neighboursActive(g, 'sal') && roll(g, 'nbBorrow').chance(average ? 0.35 : 0.55)) {
      g.neighbourDaily.salBorrowed = true;
      const type = g.starvedTypes[0];
      const sheets = cfg().sal.borrowSheets;
      const cost = Math.round(CONFIG.jobs.types.find(t => t.id === type)!.boardCost * sheets * cfg().sal.borrowMarkup);
      g.stock[type] += sheets;
      g.borrowedPly = { type, sheets, cashOwe: cost, dueDay: g.dayIndex + 2 };
      adjustFavour(g, 'sal', -1);
      return true;
    }
  }
  if (!sloppy && g.offcutBin > 0.9 && !g.neighbourDaily.priyaOffcut && neighboursActive(g, 'priya') && g.canAct && roll(g, 'nbSell').chance(0.35)) {
    g.receiveNeighbourPay(cfg().priya.offcutPay * 3, 'offcuts to Priya');
    g.offcutBin = 0;
    g.neighbourDaily.priyaOffcut = true;
    adjustFavour(g, 'priya', 1);
    return true;
  }
  return false;
}

export function kerrNeighbourLines(g: Game): { cost: number; line: string }[] {
  const out: { cost: number; line: string }[] = [];
  if (!cfg().enabled) return out;
  if (g.borrowedPly) {
    const b = g.borrowedPly;
    out.push({ cost: b.cashOwe, line: `You borrowed ${b.sheets} sheets from Sal. Pay sheets or $${b.cashOwe} soon.` });
  }
  if (g.lentExtinguisherTo === 'sal') out.push({ cost: CONFIG.rareEvent.events.find(e => e.id === 'council')!.penalty, line: 'Sal has your extinguisher. Council fines an empty bracket.' });
  if (g.mickComplaintUntil) out.push({ cost: 300, line: 'Mick\'s waiting on the bag. Council complaint\'s next.' });
  return out;
}
