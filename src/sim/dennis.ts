// Dennis, the accountant: a call with one calculated risk, in plain-English numbers and honest odds (CONFIG.dennis).
// Yes, no, or "give me a minute" (he rings back in two hours; the offer may be gone). Each bet settles some days later
// on a hidden roll at his stated odds; wins are revenue, costs and losses go under "bets". Every bet goes in his ledger.
// Three no's running and he goes quiet a few days, then comes back humbler (safer odds, smaller numbers).
// Plain data on Game (it saves); his rolls use their own seeded stream, so he never moves the rest of the game's dice.
import { CONFIG, type JobTypeId } from '../config.js';
import { Rng } from './rng.js';

export type BetKind = 'prebuy' | 'terms' | 'bandsaw' | 'secondRouter' | 'jessHours' | 'extractorService' | 'rushInvoice' | 'longerLease' | 'footy';
export const BET_KINDS: BetKind[] = ['prebuy', 'terms', 'bandsaw', 'secondRouter', 'jessHours', 'extractorService', 'rushInvoice', 'longerLease', 'footy'];

export interface Bet {
  id: number;
  kind: BetKind;
  day: number;            // dayIndex he pitched it
  hit: number;            // the real chance (and what he says: it's honest)
  stake: number;          // $ it ties up or costs now
  gain: number;           // $ he says it's worth
  loss: number;           // $ it'll cost if it goes wrong
  settleDay: number;
  until?: number;         // last dayIndex its effect runs
  status: 'pitched' | 'open' | 'won' | 'lost' | 'declined' | 'gone';
  net: number;            // $ so far: gains less costs
  held: number;           // $ of pay waiting on it (jobs on terms / his invoice)
  jobs?: number[];
}

export interface DennisState {
  bets: Bet[];
  nextId: number;
  declines: number;       // no's in a row
  quietUntil: number;     // dayIndex
  humble: number;         // times he's come back humbler
  call: { minute: number; kind: BetKind; back?: boolean } | null; // today's call, still to ring
  ringing: { until: number; bet: Bet } | null;
  pitched: Bet | null;    // answered: waiting on your yes/no
  lastKind: BetKind | null;
}

export const newDennis = (): DennisState => ({ bets: [], nextId: 1, declines: 0, quietUntil: 0, humble: 0, call: null, ringing: null, pitched: null, lastKind: null });

/** The bits of Game this needs (Game passes itself). */
export interface DennisHost {
  seed: number; dayIndex: number; minute: number; cash: number;
  dennis: DennisState;
  stock: Record<JobTypeId, number>; stockValue: Record<JobTypeId, number>;
  dennisEarn(amount: number, note: string): void;
  dennisSpend(amount: number, bucket: 'bets' | 'labour' | 'upgrades', note: string): void;
  dennisJobs(type: JobTypeId, sheets: number, dueDays: number, priceMult: number, label: string, rush: boolean): number[];
  /** Still to be cut (queued or cutting). */
  jobOpen(id: number): boolean;
  dennisSay(text: string, tone?: 'good' | 'bad' | 'info' | 'money'): void;
}

/** Sim only (`npm run sim -- dennis only=<kind>`): he only ever pitches this kind, to price it on its own. */
export const simOnly: { kind: BetKind | null } = { kind: null };

const rngFor = (h: DennisHost, salt: number) => new Rng(((h.seed * 2654435761) ^ (h.dayIndex * 40503) ^ (salt * 2246822519)) >>> 0 || 1);
const D = () => CONFIG.dennis;

/** His honest odds, the way he says them. */
export function oddsWords(p: number): string {
  if (p >= 0.84) return 'five in six'; if (p >= 0.79) return 'four in five'; if (p >= 0.74) return 'three in four';
  if (p >= 0.69) return 'seven in ten'; return 'two in three';
}

/** A bet of this kind, numbers worked out (humbler ones: better odds, smaller numbers). */
export function makeBet(h: DennisHost, kind: BetKind): Bet {
  const st = h.dennis, b = D().bets, humble = st.humble > 0;
  const k = humble ? D().humbleScale : 1, hitUp = Math.min(0.9, (humble ? D().humbleHit * st.humble : 0));
  let stake = 0, gain = 0, loss = 0, settle = 1, hit = 0.75;
  const boardCost = CONFIG.jobs.types.find(t => t.id === 'formwork')!.boardCost;
  switch (kind) {
    case 'prebuy': { const n = Math.round(b.prebuy.sheets * k); stake = n * boardCost; gain = stake * b.prebuy.rise; loss = stake * b.prebuy.drop; settle = b.prebuy.settleDays; hit = b.prebuy.hit; break; }
    case 'terms': { gain = 0; stake = 0; loss = 0; settle = b.terms.settleDays; hit = b.terms.hit; break; }
    case 'bandsaw': stake = b.bandsaw.cost * k; gain = b.bandsaw.cost * 0.9; loss = b.bandsaw.part; settle = b.bandsaw.settleDays; hit = b.bandsaw.hit; break;
    case 'secondRouter': stake = b.secondRouter.lease * k; gain = b.secondRouter.perDay * b.secondRouter.days - stake; loss = stake - b.secondRouter.perDay; settle = 1; hit = b.secondRouter.hit; break;
    case 'jessHours': stake = b.jessHours.wagePerDay * b.jessHours.days * k; gain = b.jessHours.orderMargin * k; loss = stake; settle = b.jessHours.days; hit = b.jessHours.hit; break;
    case 'extractorService': stake = b.extractorService.cost * k; gain = b.extractorService.claimed * k; loss = stake; settle = 1; hit = b.extractorService.hit; break;
    case 'rushInvoice': settle = b.rushInvoice.settleDays; hit = b.rushInvoice.hit; break;
    case 'longerLease': gain = CONFIG.economy.weeklyOverheads * b.longerLease.discount * b.longerLease.weeks; loss = b.longerLease.breakFee; settle = b.longerLease.settleDays; hit = b.longerLease.hit; break;
    case 'footy': stake = b.footy.cost * k; gain = b.footy.claimed * k; loss = stake; settle = 1; hit = b.footy.hit; break;
  }
  return { id: st.nextId++, kind, day: h.dayIndex, hit: Math.min(0.9, hit + hitUp), stake: Math.round(stake), gain: Math.round(gain), loss: Math.round(loss),
    settleDay: h.dayIndex + settle, status: 'pitched', net: 0, held: 0 };
}

/** Start of a day: bets that are due settle; maybe a call later; his running effects. */
export function dennisStartDay(h: DennisHost) {
  if (!D().enabled) return;
  const st = h.dennis;
  st.call = null; st.ringing = null; st.pitched = null;
  for (const bet of st.bets) if (bet.status === 'open' && bet.settleDay <= h.dayIndex) settle(h, bet);
  if (h.dayIndex < 2 || h.dayIndex < st.quietUntil) return;
  const r = rngFor(h, 1);
  if (!r.chance(D().callChance)) return;
  // one bet a day: rotate through the library, nothing he's already got running
  const running = new Set(st.bets.filter(b => b.status === 'open' || ((b.status === 'won' || b.status === 'lost') && (b.until ?? -1) >= h.dayIndex)).map(b => b.kind));
  const from = st.lastKind ? (BET_KINDS.indexOf(st.lastKind) + 1) : r.int(0, BET_KINDS.length - 1);
  let kind: BetKind | null = null;
  for (let i = 0; i < BET_KINDS.length && !kind; i++) { const k = BET_KINDS[(from + i) % BET_KINDS.length]; if (!running.has(k)) kind = k; }
  if (simOnly.kind) kind = running.has(simOnly.kind) ? null : simOnly.kind;
  if (!kind) return;
  st.call = { minute: Math.round(r.range(D().callFromHour * 60, D().callToHour * 60)), kind };
}

/** A minute: the phone rings when it's time; it stops if nobody answers. */
export function dennisTick(h: DennisHost) {
  const st = h.dennis;
  if (st.call && h.minute >= st.call.minute && !st.ringing && !st.pitched) {
    const back = st.call.back;
    st.ringing = { until: h.minute + D().answerMinutes, bet: makeBet(h, st.call.kind) };
    st.call = null;
    if (back) st.ringing.bet.status = 'pitched';
    h.dennisSay(`Phone ringing — ${D().name}${back ? ', ringing back' : ''}.`, 'info');
  }
  if (st.ringing && h.minute >= st.ringing.until) { st.ringing = null; h.dennisSay(`Missed ${D().name}. He'll try another day.`); }
}

/** Picked up: the bet's on the table. */
export function dennisAnswer(h: DennisHost): Bet | null {
  const st = h.dennis;
  if (!st.ringing) return null;
  st.pitched = st.ringing.bet; st.ringing = null;
  st.lastKind = st.pitched.kind;
  return st.pitched;
}

/** Your answer. 'later': he rings back in two hours, and it's still on about half the time. */
export function dennisDecide(h: DennisHost, choice: 'yes' | 'no' | 'later'): boolean {
  const st = h.dennis, bet = st.pitched;
  if (!bet) return false;
  st.pitched = null;
  if (choice === 'later') {
    if (rngFor(h, bet.id + 7).chance(D().stillThere)) st.call = { minute: h.minute + D().callbackMinutes, kind: bet.kind, back: true };
    else { bet.status = 'gone'; st.bets.push(bet); }
    return true;
  }
  if (choice === 'no') {
    bet.status = 'declined'; st.bets.push(bet);
    if (++st.declines >= D().quietAfter) { st.declines = 0; st.quietUntil = h.dayIndex + D().quietDays; st.humble++; }
    return true;
  }
  st.declines = 0;
  bet.status = 'open';
  st.bets.push(bet);
  accept(h, bet);
  return true;
}

/** Yes: what it costs now, and what's in the world for it. */
function accept(h: DennisHost, bet: Bet) {
  const b = D().bets, name = D().name;
  switch (bet.kind) {
    case 'prebuy': {
      // the sheets are real: on the pallet now, paid for now (charged as they're cut, like any ply)
      const n = Math.round(bet.stake / CONFIG.jobs.types.find(t => t.id === 'formwork')!.boardCost);
      h.cash -= bet.stake; h.stock.formwork += n; h.stockValue.formwork += bet.stake;
      bet.until = h.dayIndex + b.prebuy.settleDays;
      h.dennisSay(`${n} sheets of formply on the pallet (${name}'s pre-buy). -$${bet.stake}`, 'money');
      break;
    }
    case 'terms': bet.jobs = h.dennisJobs('joinery', b.terms.sheets, b.terms.dueDays, b.terms.priceMult, '30-day terms', false); break;
    case 'rushInvoice': bet.jobs = h.dennisJobs(pickType(h), 1, 0, b.rushInvoice.priceMult, `${name}'s invoice`, true); break;
    case 'bandsaw': h.dennisSpend(bet.stake, 'upgrades', 'second-hand edge-bander'); bet.until = h.dayIndex + b.bandsaw.days; break;
    case 'secondRouter': h.dennisSpend(bet.stake, 'bets', 'second router, leased for the week'); bet.until = h.dayIndex + b.secondRouter.days - 1; break;
    case 'jessHours': h.dennisSpend(bet.stake, 'labour', 'part-timer on extra days'); bet.until = h.dayIndex + b.jessHours.days - 1; break;
    case 'extractorService': h.dennisSpend(bet.stake, 'bets', 'extractor service, prepaid'); bet.until = h.dayIndex + b.extractorService.days - 1; break;
    case 'longerLease': bet.until = h.dayIndex + b.longerLease.weeks * CONFIG.week.days; break;
    case 'footy': h.dennisSpend(bet.stake, 'bets', 'footy club sponsorship'); bet.until = h.dayIndex + b.footy.days - 1; break;
  }
  bet.net = -bet.stake * (bet.kind === 'prebuy' ? 0 : 1);
}

const pickType = (h: DennisHost): JobTypeId => (['formwork', 'joinery', 'signage'] as const)[h.dayIndex % 3];

/** The roll at his odds, and what it means. */
function settle(h: DennisHost, bet: Bet) {
  // jobs on terms (or his invoice) settle once they've been cut and delivered
  if ((bet.kind === 'terms' || bet.kind === 'rushInvoice') && bet.jobs?.some(id => h.jobOpen(id))) { bet.settleDay = h.dayIndex + 1; return; }
  const won = rngFor(h, bet.id).chance(bet.hit);
  const b = D().bets;
  bet.status = won ? 'won' : 'lost';
  switch (bet.kind) {
    case 'prebuy': if (won) h.dennisEarn(bet.gain, 'ply price went up: the pre-buy saved'); else h.dennisSpend(bet.loss, 'bets', 'ply price dropped: the pre-buy overpaid'); bet.net = won ? bet.gain : -bet.loss; break;
    case 'terms': case 'rushInvoice': {
      const pays = won ? 1 : bet.kind === 'terms' ? b.terms.slowPays : b.rushInvoice.disputePays;
      const paid = Math.round(bet.held * pays);
      if (paid) h.dennisEarn(paid, bet.kind === 'terms' ? 'job on terms paid' : 'invoice settled');
      bet.net = paid - bet.held * (bet.kind === 'terms' ? 1 / b.terms.priceMult : 1 / b.rushInvoice.priceMult);
      bet.held = 0;
      break;
    }
    case 'bandsaw': if (!won) h.dennisSpend(b.bandsaw.part, 'bets', 'edge-bander needed a part'); bet.net = -bet.stake - (won ? 0 : b.bandsaw.part); break;
    case 'secondRouter': if (!won) bet.until = h.dayIndex; bet.net = -bet.stake; break; // broken: no more days out of it
    case 'jessHours': if (won) h.dennisEarn(bet.gain, 'the big order landed'); bet.net = won ? bet.gain - bet.stake : -bet.stake; break;
    case 'extractorService': if (!won) bet.until = h.dayIndex - 1; bet.net = -bet.stake; break;          // no-show: nothing for it
    case 'longerLease': if (!won) { h.dennisSpend(bet.loss, 'bets', 'lease break fee'); bet.until = h.dayIndex - 1; } bet.net = won ? 0 : -bet.loss; break;
    case 'footy': if (!won) bet.until = h.dayIndex - 1; bet.net = -bet.stake; break;
  }
  h.dennisSay(`${D().name}: ${won ? 'it came good' : "it didn't come off"} (${bet.kind}).`, won ? 'good' : 'bad');
}

// ---------- what his bets do while they run (Game reads these) ----------

const live = (h: { dennis: DennisState; dayIndex: number }, kind: BetKind) =>
  h.dennis.bets.find(b => b.kind === kind && (b.status === 'open' || b.status === 'won') && b.until !== undefined && b.until >= h.dayIndex);

export const dennisFireMult = (h: { dennis: DennisState; dayIndex: number }) =>
  (live(h, 'extractorService') ? CONFIG.dennis.bets.extractorService.fireMult : 1) * (live(h, 'secondRouter') ? CONFIG.dennis.bets.secondRouter.fireMult : 1);
export const dennisFaultMult = (h: { dennis: DennisState; dayIndex: number }) => (live(h, 'extractorService') ? CONFIG.dennis.bets.extractorService.faultMult : 1);
export const dennisPowerTrip = (h: { dennis: DennisState; dayIndex: number }) => (live(h, 'secondRouter') ? CONFIG.dennis.bets.secondRouter.powerTripPerMinute : 0);
/** Edged panels: joinery pays more while the edge-bander's working. */
export const dennisJoineryMult = (h: { dennis: DennisState; dayIndex: number }) => (live(h, 'bandsaw') ? 1 + CONFIG.dennis.bets.bandsaw.premium : 1);
/** More order calls while the club's shirts have your name on them (only once it's come off). */
export const dennisCallMult = (h: { dennis: DennisState; dayIndex: number }) => (h.dennis.bets.some(b => b.kind === 'footy' && b.status === 'won' && (b.until ?? -1) >= h.dayIndex) ? CONFIG.dennis.bets.footy.callMult : 1);
/** The longer lease: cheaper weeks (once it's signed and stuck). */
export const dennisRentMult = (h: { dennis: DennisState; dayIndex: number }) => (h.dennis.bets.some(b => b.kind === 'longerLease' && b.status === 'won' && (b.until ?? -1) >= h.dayIndex) ? 1 - CONFIG.dennis.bets.longerLease.discount : 1);
/** The leased second router's day of overflow work (its income at knock-off). */
export const dennisRouterDay = (h: { dennis: DennisState; dayIndex: number }) => (live(h, 'secondRouter') ? CONFIG.dennis.bets.secondRouter.perDay : 0);
/** The part-timer's in on these days (his bet). */
export const dennisJessDay = (h: { dennis: DennisState; dayIndex: number }) => !!live(h, 'jessHours');

/** The ledger: bets decided (not the ones still ringing). */
export function ledger(st: DennisState) {
  const decided = st.bets.filter(b => b.status === 'won' || b.status === 'lost');
  return { bets: st.bets, won: decided.filter(b => b.status === 'won').length, settled: decided.length, net: st.bets.reduce((s, b) => s + (b.status === 'won' || b.status === 'lost' || b.status === 'open' ? b.net : 0), 0) };
}
