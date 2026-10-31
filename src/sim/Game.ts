import { CONFIG, type ConsumableKey, type JobType, type JobTypeId, type RareEvent, type UpgradeId } from '../config.js';
import { FAULTS } from '../data/faults.js';
import { MATES, SHOP_TALK, mateById } from '../data/mates.js';
import { Rng } from './rng.js';
import { dennisAnswer, dennisCallMult, dennisDecide, dennisFaultMult, dennisFireMult, dennisJoineryMult, dennisPowerTrip, dennisRentMult, dennisRouterDay,
  dennisStartDay, dennisTick, newDennis, type Bet, type DennisState } from './dennis.js';
import type { Fortune, LayoutEffects, Pickup, WalkIn } from './types.js';
import type {
  ActiveFault, Callback, Can, DayStats, Delivery, Distraction, DistractionKind, FaultDef, Fire, FireResponse, FixPath, Job, LogEntry, MachineState, OrderPreview,
  MilestoneId, MilestoneState, RareEventId, RareEventState, VisitorAsk,
} from './types.js';

export type Phase = 'day' | 'endOfDayPrompt' | 'daySummary' | 'weekSummary';

const JOB_NAMES = [
  'Kitchen carcasses — Thornbury', 'Drawer fronts — Brunswick reno', 'Wardrobe doors — Kew',
  'Laundry cabinets — Preston', 'TV unit — Fitzroy North', 'Vanity — Northcote', 'Pantry — Coburg',
  'Shop fit-out panels — Collingwood', 'Bookcase — Malvern East', 'Island bench — Thomastown joiner',
  'Office pods — Richmond', 'Bar front — Footscray',
];

const CUSTOMERS = ['Mick', 'Kerry', 'Dave', 'Priya', 'Sal', 'Tran', 'Lou', 'Gus', 'Jen', 'Rob'];

function emptyStats(day: number): DayStats {
  return {
    day, revenue: 0, costs: 0, materials: 0, labour: 0, consumables: 0, fixes: 0, beer: 0, fees: 0,
    upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, sheetsDemanded: 0, sheetsMissed: 0, sheetsDeclined: 0, sheetsLost: 0, latePayLost: 0, lostJobsValue: 0,
    beers: 0, firesSpot: 0, firesDuct: 0, firesExtractor: 0, faults: 0, wrongCalls: 0, stockOutMinutes: 0, fumbles: 0, looTrips: 0,
    deliveryFees: 0, overdraftFees: 0, mateBeer: 0, trucks: 0, plyOnHandValue: 0, plyOnHandSheets: 0,
    sheetsShifted: 0, sheetsLifted: 0, choreBoards: 0, walkIns: 0, walkInCount: 0, pickups: 0, palletBlocked: 0, binOverflows: 0, afterHours: 0, canRefund: 0, layoutMinutes: 0, bets: 0, coffee: 0,
  };
}

export class Game {
  readonly seed: number;
  rng: Rng;
  /** Everything a visiting mate decides (when they come up, what they say, where they wander): its own stream, reseeded each day. */
  visitorRng = new Rng(0);
  phase: Phase = 'day';

  // clock
  day = 1;          // day of the week, 1..CONFIG.week.days
  dayIndex = 1;     // days since the start; never resets, so job due dates survive the week rollover
  minute = CONFIG.clock.startHour * 60; // minutes since midnight
  overtime = false;
  /** What the factory layout does (src/world/layoutPlan.ts). Neutral: the default layout. */
  layout: LayoutEffects = NEUTRAL_LAYOUT;
  /** The 3D world walks its own walks: layout walking minutes only apply when Game times the walks itself (the sim). */
  worldWalks = false;
  /** Dennis the accountant: his calls, bets and ledger (src/sim/dennis.ts). Plain data. */
  dennis: DennisState = newDennis();
  /** The Lease's wobble (src/world/lease.ts): ply prices up, or a big customer gone quiet. Neutral unless it's happened. */
  supplyCostMult = 1;
  callMult = 1;
  callMultUntil = 0;              // dayIndex the quiet spell lasts to
  /** The Lease's week (src/world/leaseWeeks.ts): calls, rush share, ply price and order prices for a run of days. Null: neutral. */
  fortune: Fortune | null = null;
  /** This morning's new sheets (ids), so a quiet week that starts today can thin them. */
  freshToday: number[] = [];
  /** The cafe: a large coffee speeds tasks until this minute; the sparky you shouted resets the breaker on the house. */
  coffeeUntil = 0;
  sparkyFavour = false;
  /** Finished sheets waiting on their customers (CONFIG.pickup), and the ones collected recently. Plain data. */
  pickups: Pickup[] = [];
  /** Sheets on the finished pallet, waiting for pickup (cleared off the bed; full, the bed can't be cleared). */
  pallet = 0;
  /** The world hands the stack over by hand; the sim (and Game-only tests) hand over the moment the ute's there. */
  servesPickups = false;
  /** Today's walk-ins at the roller door (CONFIG.economy.walkIn*): plain data. */
  walkIns: WalkIn[] = [];
  /** The world serves walk-ins by hand; the sim (and Game-only tests) take every one as it comes. */
  servesWalkIns = false;
  /** The power's tripped (a compressor on the extractor's circuit): the machine waits for the breaker. */
  powerTripped = false;

  // economy
  cash = CONFIG.economy.startingCash;
  rapport: number = CONFIG.rapport.start;
  today: DayStats = emptyStats(1);
  week: DayStats[] = [];
  weekOverheads = 0;

  // machine
  machine: MachineState = 'idle';
  loadingRemaining = 0;
  jobs: Job[] = [];
  current: Job | null = null;
  fault: ActiveFault | null = null;
  courierPenaltyPending = false;
  rushJobsToday = 0;
  orderCalls: { minute: number; sheets: number }[] = []; // today's order calls still to ring, soonest first
  lateDropToday = false;     // rolled at 7am so the demand floor can count it
  lostYesterday = 0;         // sheets lost at close yesterday; costs order calls today

  // ply: sheets on the pallet per job type, orders on their way, and the sheet you've taken off the pallet
  stock = Object.fromEntries(CONFIG.jobs.types.map(t => [t.id, 0])) as Record<JobTypeId, number>;
  deliveries: Delivery[] = [];
  nextDeliveryId = 1;
  inHand: number | null = null;  // job id of the sheet taken off the pallet, not yet on the bed
  // Ply is stock: cash leaves when it's ordered, but the day's P&L is charged a sheet's cost when it's loaded.
  stockValue = Object.fromEntries(CONFIG.jobs.types.map(t => [t.id, 0])) as Record<JobTypeId, number>; // cost of what's on the pallet
  inHandCost = 0;                // cost of the sheet in your hands

  // chores (CONFIG.chore; all zero and unused with CONFIG.chores off)
  bedPile = 0;           // finished boards on the bed, waiting to go to the finished pallet
  offcutBin = 0;         // 0..1
  offcutPile = 0;        // loads to the skip left to clear an overflow off the floor
  compressorSheets = 0;  // sheets cut since the compressor was last drained

  // consumables 0..1 (1 = fresh)
  wear: Record<ConsumableKey, number> = { bit: 1, spoilboard: 1, filter: 1 };
  replacing: { key: ConsumableKey; remaining: number } | null = null;

  // exhaust fire
  fire: Fire | null = null;
  fireResponse: FireResponse | null = null;
  spraying = false;            // E held (or the spray button) — set by the UI / sim each frame
  machineDown = false;         // extractor fire: nothing more cuts today
  extinguisherUsesToday = 0;
  lessonFireDone = false;      // the scripted spot fire (CONFIG.fire.lesson) has happened
  /** The wall extinguisher's off its hook (set by the view each frame; the sim's fire walk counts on its own). */
  extinguisherAway = false;

  // rare events and milestones (CONFIG.rareEvent, CONFIG.milestone)
  rare: RareEventState | null = null;  // today's rare event, if there is one
  milestones: MilestoneState = { fireFreeStreak: 0, bestDayProfit: 0, unlocked: [] };
  /** The day's biggest event or decision and what it cost or earned: written at close, shown on the summary. */
  story: string | null = null;
  private notes: { text: string; amount: number; rank: number }[] = []; // today's candidates for the story
  /** Every rare event so far and how it went (for the balance sim). */
  rareLog: { day: number; id: RareEventId; outcome: string }[] = [];
  private nextFireId = 1;

  // people
  distractions: Distraction[] = [];
  busy: { label: string; remaining: number } | null = null; // on the phone etc.
  nextDistractionId = 1;
  lastMate: string | null = null; // never the same mate twice running
  visitorBeers: Record<string, number> = {}; // today's beers from your fridge, per mate (CONFIG.visitors caps them)
  callbacks: Callback[] = [];  // voicemails from order calls that rang out, oldest first

  // competence
  competence: number = CONFIG.competence.start;
  beersToday = 0;

  // beer: cans you hold or have put down, how much has gone in, and the loo
  cans: Can[] = [];
  nextCanId = 1;
  alcohol = 0;          // cans' worth taking effect (ramps up while you drink, wears off after)
  alcoholAtLastSip = 0;
  sips = 0;             // visible sips so far, for the view to animate
  looSince: number | null = null; // minute you started needing the loo
  beersAtLoo = 0;       // beersToday at the last visit

  upgrades = new Set<UpgradeId>();
  /** Running totals per job type since the game started (for the balance sim; shared costs like labour aren't split). */
  typeLedger = Object.fromEntries(CONFIG.jobs.types.map(t => [t.id, { revenue: 0, boards: 0, fixes: 0, cut: 0, scrapped: 0, minutes: 0 }])) as
    Record<JobTypeId, { revenue: number; boards: number; fixes: number; cut: number; scrapped: number; minutes: number }>;
  log: LogEntry[] = [];
  private nextJobId = 1;

  /** `firstDay`: the dayIndex to start on (the balance sim starts later to play a week past the difficulty ramp). */
  constructor(seed?: number, firstDay = 1) {
    this.seed = seed ?? (Date.now() >>> 0);
    this.rng = new Rng(this.seed);
    this.dayIndex = firstDay;
    this.startDay();
    // the first morning's ply was ordered (and paid for) last week: the truck's at the door
    const first = CONFIG.supply.firstDelivery;
    this.deliveries.push({
      id: this.nextDeliveryId++, lines: CONFIG.jobs.types.map(t => ({ type: t.id, qty: first[t.id], unitCost: Math.round(t.boardCost * this.materialMult()) })),
      day: this.dayIndex, minute: this.minute, stage: 'due', signBy: 0, bundles: [], fee: 0, feeOwed: false,
    });
    this.arriveDeliveries();
  }

  // ---------- helpers ----------

  get hour(): number { return this.minute / 60; }
  get isOvertimeHours(): boolean { return this.minute >= CONFIG.clock.endHour * 60; }
  get margin(): number {
    const r = this.today.revenue;
    return r > 0 ? (r - this.today.costs) / r : (this.today.costs > 0 ? -1 : 0);
  }
  get weekRevenue(): number { return this.week.reduce((s, d) => s + d.revenue, 0) + (this.phase === 'weekSummary' ? 0 : this.today.revenue); }
  get weekCosts(): number { return this.week.reduce((s, d) => s + d.costs, 0) + (this.phase === 'weekSummary' ? 0 : this.today.costs) + this.weekOverheads; }
  get weekMargin(): number { const r = this.weekRevenue; return r > 0 ? (r - this.weekCosts) / r : 0; }
  get friendPresent(): boolean { return this.distractions.some(d => d.kind === 'friend' && d.engaged); }
  get canAct(): boolean { return this.busy === null && this.fireResponse === null; }
  get fridgeOpen(): boolean { return this.hour >= CONFIG.beer.fridgeUnlockHour; }
  /** Sheets due by close today, overdue ones included, not cut yet (the one on the bed counts). */
  get dueToday(): number { return this.jobs.filter(j => (j.status === 'queued' || j.status === 'cutting') && j.dueDay <= this.dayIndex).length; }
  /** About how many sheets there's time to cut before 5pm. */
  get canCutToday(): number { return Math.max(0, CONFIG.clock.endHour * 60 - this.minute) / CONFIG.jobs.warnMinutesPerSheet; }
  /** More due today than there's time to cut: worth turning work down. */
  get overCommitted(): boolean { return this.dueToday > this.canCutToday; }
  /** Today's fraction of the full breakdown rate (CONFIG.difficulty): none on the first days, ramping up. */
  get breakdownMult(): number {
    const ramp = CONFIG.difficulty.breakdownByDay;
    return ramp[Math.min(this.dayIndex, ramp.length) - 1];
  }
  get heldCan(): Can | undefined { return this.cans.find(c => c.held); }
  get needLoo(): boolean { return this.looSince !== null; }
  /** Task and walk speed lost to beer, 0…0.6. */
  get beerSlow(): number { return Math.min(0.6, CONFIG.beer.slowPerCan * this.alcohol); }
  get fumbleChance(): number { return CONFIG.beer.fumblePerCan * this.alcohol; }
  /** Walk speed lost to needing the loo. */
  get looSlow(): number {
    const b = CONFIG.beer;
    return this.looSince === null ? 0 : Math.min(b.looSlowMax, b.looSlowStep * Math.floor((this.minute - this.looSince) / b.looEveryMinutes));
  }
  /** Walking speed as a fraction of sober, comfortable speed. */
  walkMult(): number { return (1 - this.beerSlow) * (1 - this.looSlow) * this.layout.walkMult; }
  private walkMinutes(m: number) { return Math.ceil(m / this.walkMult()); }
  /** A walk Game times itself, longer or shorter for the layout (not when the world walks it). */
  private laid(m: number, delta: number) {
    if (this.worldWalks || !delta) return m;
    const extra = Math.max(1 - m, delta);
    this.today.layoutMinutes = (this.today.layoutMinutes ?? 0) + Math.max(0, extra);
    return Math.max(1, Math.round(m + extra));
  }

  // ---------- Dennis (src/sim/dennis.ts calls these) ----------
  dennisSay(text: string, tone?: 'good' | 'bad' | 'info' | 'money') { this.say(text, tone); }
  dennisEarn(amount: number, note: string) { if (amount > 0) this.earn(Math.round(amount), `${CONFIG.dennis.name}: ${note}`); }
  dennisSpend(amount: number, bucket: 'bets' | 'labour' | 'upgrades', note: string) {
    if (bucket === 'bets') this.today.bets ??= 0; // a day saved before the field existed
    this.spend(Math.round(amount), bucket, note);
  }
  dennisJobs(type: JobTypeId, sheets: number, dueDays: number, priceMult: number, label: string, rush: boolean): number[] {
    const t = CONFIG.jobs.types.find(x => x.id === type)!, close = CONFIG.clock.endHour * 60;
    const due = rush ? { day: this.dayIndex, minute: Math.min(close, this.minute + CONFIG.jobs.orders.rushMinutes) } : { day: this.dayIndex + dueDays, minute: close };
    const jobs = Array.from({ length: sheets }, (_, i) => this.makeJob(t, `${rush ? 'RUSH — ' : ''}${CONFIG.dennis.name}'s ${label}${sheets > 1 ? ` (${i + 1}/${sheets})` : ''}`, due.day, due.minute, { priceMult }));
    this.jobs.push(...jobs);
    this.today.sheetsDemanded += sheets;
    this.say(`${sheets} sheet${sheets > 1 ? 's' : ''} on the board: ${CONFIG.dennis.name}'s ${label}.`, 'good');
    return jobs.map(j => j.id);
  }
  /** The Lease's week (src/world/leaseWeeks.ts), from today to `f.until`. A quiet one takes today's later calls too. */
  setFortune(f: Fortune, note?: string) {
    this.fortune = f;
    if (note) this.say(note, f.calls < 1 ? 'info' : 'good'); // a quiet week's line is the radio, not a warning
    if (f.calls < 1) {
      this.orderCalls.splice(Math.max(1, Math.round(this.orderCalls.length * f.calls)));
      const fresh = this.jobs.filter(j => j.status === 'queued' && (this.freshToday ?? []).includes(j.id));
      const drop = new Set(fresh.slice(Math.max(1, Math.round(fresh.length * f.calls))).map(j => j.id));
      this.jobs = this.jobs.filter(j => !drop.has(j.id));
      this.today.sheetsDemanded -= drop.size;
    }
  }
  get fortuneNow(): Fortune | null { return this.fortune && this.dayIndex <= this.fortune.until ? this.fortune : null; }
  /** An order put on the board from outside the phone (the Lease's big order): `sheets` of a type, due by close on `dueDay`. */
  leaseOrder(type: JobTypeId, sheets: number, dueDay: number, priceMult: number, label: string): number[] {
    const t = CONFIG.jobs.types.find(x => x.id === type)!, close = CONFIG.clock.endHour * 60;
    const jobs = Array.from({ length: sheets }, (_, i) => this.makeJob(t, `${label}${sheets > 1 ? ` (${i + 1}/${sheets})` : ''}`, dueDay, close, { priceMult }));
    this.jobs.push(...jobs);
    this.today.sheetsDemanded += sheets;
    this.say(`Order in: ${label}, ${sheets} × ${t.material}.`, 'good');
    return jobs.map(j => j.id);
  }
  jobOpen(id: number) { const j = this.jobs.find(x => x.id === id); return !!j && (j.status === 'queued' || j.status === 'cutting'); }
  /** His phone's ringing (the view rings the phone; the sim answers it). */
  get dennisRinging() { return !!this.dennis.ringing; }
  /** Pick up: the bet he's pitching. */
  answerDennis(): Bet | null { return this.phase === 'day' ? dennisAnswer(this) : null; }
  /** Yes, no, or give me a minute. */
  decideDennis(choice: 'yes' | 'no' | 'later'): boolean { return dennisDecide(this, choice); }

  // ---------- the cafe before work, the Saturday market (the view calls these; the balance sim never does) ----------

  /** A coffee on the way in: what it costs, and what it does (large: quicker till 11; shouting the sparky: a favour). */
  buyCoffee(kind: 'regular' | 'large' | 'shout') {
    const c = CONFIG.cafe, cost = kind === 'regular' ? c.regular : kind === 'large' ? c.large : c.regular * 2;
    this.today.coffee ??= 0;
    this.spend(cost, 'coffee');
    if (kind === 'large') this.coffeeUntil = c.largeUntilHour * 60;
    if (kind === 'shout') this.sparkyFavour = true;
  }
  /** A lead overheard at the cafe: it rings at this minute as an order, warm. */
  leadCall(minute: number, sheets: number) {
    this.orderCalls.push({ minute, sheets });
    this.orderCalls.sort((a, b) => a.minute - b.minute);
  }
  /** Saturday at the market: a piece sold (not the shed's revenue: it's yours). */
  marketSale(amount: number) { if (amount > 0) this.cash += Math.round(amount); }

  /** Move things round at the start of the day: costs time (it's heavy), not money. */
  layoutShuffle(minutes: number) {
    if (this.phase !== 'day' || minutes <= 0) return;
    this.busy = { label: 'shoving things round', remaining: Math.round(minutes) };
    this.today.layoutMinutes = (this.today.layoutMinutes ?? 0) + Math.round(minutes);
    this.say(`Moved things round: ${Math.round(minutes)} min.`);
  }

  /** The breaker's back on. `walked`: the world walked to the switchboard. */
  resetPower(walked = false): boolean {
    if (!this.powerTripped || !this.canAct) return false;
    this.powerTripped = false;
    if (!walked && !this.sparkyFavour) this.busy = { label: 'resetting the breaker', remaining: Math.max(1, Math.round(this.layout.switchboardMinutes)) };
    if (this.sparkyFavour) { this.sparkyFavour = false; this.say('The sparky you shouted came over and reset it. Cheers.'); }
    if (this.machine === 'paused' && this.current && !this.fault && !this.replacing) this.machine = 'cutting';
    this.say('Breaker back on.');
    return true;
  }
  /** Minutes to swap a consumable (the bag rack makes the bag quicker). */
  private replaceMinutes(key: ConsumableKey) {
    const base = key === 'bit' && this.hasMilestone('secondBitRack') ? CONFIG.milestone.bitSwapMinutes
      : key === 'filter' && this.upgrades.has('bagRack') ? this.upgradeEffect('bagRack') : CONFIG.consumables[key].replaceMinutes;
    return this.laid(base, key === 'filter' ? this.layout.filterMinutes : key === 'bit' ? this.layout.bitMinutes : 0);
  }
  /** A walk to or from the fire: shorter with an extinguisher hanging by the exhaust. */
  private fireWalk(m: number) {
    return this.walkMinutes(this.laid(this.upgrades.has('exhaustExtinguisher') ? Math.max(1, m * this.upgradeEffect('exhaustExtinguisher')) : m, this.layout.fireWalkMinutes));
  }
  get queued(): Job[] { return this.jobs.filter(j => j.status === 'queued'); }

  formatTime(m = this.minute): string {
    const h = Math.floor(m / 60), mm = Math.floor(m % 60);
    const ap = h >= 12 ? 'pm' : 'am';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${mm.toString().padStart(2, '0')}${ap}`;
  }

  /** Today's P&L and shed log as plain text, for a playtester to paste into a message. */
  dayReport(): string {
    const d = this.today;
    const m = d.revenue > 0 ? `${Math.round(((d.revenue - d.costs) / d.revenue) * 100)}%` : '—';
    const head = [
      `Keep It Running — day ${d.day} (week day ${this.day}/${CONFIG.week.days})`,
      `Revenue $${Math.round(d.revenue)} · costs $${Math.round(d.costs)} · margin ${m} · cash $${Math.round(this.cash)}`,
      `Sheets: ${d.sheetsDone} delivered (${d.sheetsLate} late), ${d.sheetsScrapped} scrapped · faults ${d.faults} · fires ${d.firesSpot} · beers ${d.beers}`,
      ...(CONFIG.chores ? [`Chores: ${d.sheetsShifted} shifted (clamps), ${d.sheetsLifted} lifted (compressor), boards lost $${Math.round(d.choreBoards)} · offcut bin overflowed ${d.binOverflows}×`] : []),
      ...(this.story ? [`Story of the day: ${this.story}`] : []),
      '',
    ];
    const lines = this.log.filter(l => l.dayIndex === this.dayIndex).map(l => `${this.formatTime(l.minute).padStart(7)}  ${l.text}`);
    return [...head, ...lines].join('\n');
  }

  private say(text: string, tone: LogEntry['tone'] = 'info') {
    this.log.push({ dayIndex: this.dayIndex, minute: this.minute, text, tone });
    // trim old days only, so today's log is whole when it's copied at the end of the day
    while (this.log.length > 200 && this.log[0].dayIndex < this.dayIndex) this.log.shift();
  }

  private spend(amount: number, bucket: keyof DayStats, note?: string) {
    if (amount <= 0) return;
    this.cash -= amount;
    if (bucket !== 'upgrades') this.today.costs += amount; // capex stays out of operating margin
    (this.today as unknown as Record<string, number>)[bucket] += amount;
    if (note) this.say(`-$${amount.toFixed(0)} ${note}`, 'money');
  }

  /** A cost on today's books that was paid for earlier (the board, bought when the ply was ordered). No cash moves. */
  private book(amount: number, bucket: keyof DayStats) {
    if (amount <= 0) return;
    this.today.costs += amount;
    (this.today as unknown as Record<string, number>)[bucket] += amount;
  }

  private earn(amount: number, note: string) {
    this.cash += amount;
    this.today.revenue += amount;
    this.say(`+$${amount.toFixed(0)} ${note}`, 'money');
  }

  stepDurationMult(): number {
    const c = CONFIG.competence;
    let m = 1 + (c.max - this.competence) / c.durationPenaltyDivisor;
    if (this.minute < this.coffeeUntil) m *= 1 - CONFIG.cafe.largeSpeedup; // a large coffee, till 11
    if (this.friendPresent) m *= CONFIG.faults.attentionSplitDurationMult;
    return m / (1 - this.beerSlow);
  }
  misclickChance(): number {
    const c = CONFIG.competence;
    return Math.max(0, (c.misclickThreshold - this.competence) / c.misclickDivisor);
  }
  inputDelayMs(): number {
    return (CONFIG.competence.max - this.competence) * CONFIG.competence.inputDelayMsPerPoint;
  }

  // ---------- day lifecycle ----------

  private startDay() {
    this.phase = 'day';
    this.minute = CONFIG.clock.startHour * 60;
    this.overtime = false;
    this.today = emptyStats(this.day);
    this.beersToday = 0;
    this.cans = []; this.alcohol = 0; this.alcoholAtLastSip = 0; this.looSince = null; this.beersAtLoo = 0; // slept it off; the shed got tidied
    this.rushJobsToday = 0;
    this.competence = Math.min(CONFIG.competence.max, this.competence + CONFIG.competence.sleepRecovery);
    this.distractions = [];
    this.visitorRng = new Rng((Math.imul(this.seed, 31) + Math.imul(this.dayIndex, 0x9e3779b1)) >>> 0);
    this.visitorBeers = {};
    this.callbacks = [];
    this.busy = null;
    this.fault = null;
    this.current = null;
    this.machine = 'idle';
    this.fire = null;
    this.fireResponse = null;
    this.spraying = false;
    this.machineDown = false;
    this.extinguisherUsesToday = 0;
    // unfinished work carries over; delivered, scrapped and lost jobs drop off the board
    const carried = this.jobs.filter(j => j.status === 'queued');
    const fresh = this.generateJobs();
    this.lateDropToday = this.rng.chance(CONFIG.jobs.lateDrop.chance);
    this.orderCalls = this.scheduleOrderCalls(fresh.length + (this.lateDropToday ? 1 : 0));
    // a quiet week (the Lease): the morning board's thin too
    const f = this.fortuneNow;
    if (f && f.calls < 1) fresh.splice(Math.max(1, Math.round(fresh.length * f.calls)));
    this.jobs = [...carried, ...fresh];
    this.freshToday = fresh.map(j => j.id);
    this.today.sheetsDemanded += fresh.length;
    this.rare = null; this.notes = []; this.story = null; this.walkIns = [];
    if (CONFIG.rareEvents) this.rollRareEvent(); // its own seeded roll: off, nothing else in the day changes
    if (CONFIG.dennis.enabled) {
      dennisStartDay(this); // his own seeded rolls: off, nothing else changes
      // the footy club's sponsorship: more calls while it's working
      const mult = dennisCallMult(this);
      if (mult > 1) {
        const r = new Rng((this.seed * 31 + this.dayIndex * 977) >>> 0 || 1), o = CONFIG.jobs.orders;
        const extra = Math.round(this.orderCalls.length * (mult - 1));
        for (let i = 0; i < extra; i++) this.orderCalls.push({ minute: Math.round(r.range(o.spreadFromHour * 60, o.spreadToHour * 60)), sheets: r.int(o.sheetsMin, o.sheetsMax) });
        this.orderCalls.sort((a, b) => a.minute - b.minute);
      }
    }
    const carryNote = carried.length ? ` (${carried.length} carried over)` : '';
    this.say(`Day ${this.day}. ${this.jobs.length} sheets on the board${carryNote}. Roller door's up.`);
  }

  private scheduleOrderCalls(otherSheets: number): { minute: number; sheets: number }[] {
    const o = CONFIG.jobs.orders;
    const from = o.spreadFromHour * 60, to = o.spreadToHour * 60;
    const sheets = () => this.rng.int(o.sheetsMin, o.sheetsMax);
    const n = this.rng.int(o.callsMin, o.callsMax);
    // first call guaranteed early; the rest spaced evenly across the window with jitter
    const calls = [{ minute: Math.round(this.rng.range(o.firstCallFromHour * 60, o.firstCallToHour * 60)), sheets: sheets() }];
    for (let i = 1; i < n; i++) {
      const centre = from + (to - from) * (i + 0.5) / n;
      const minute = Math.round(centre + this.rng.range(-o.jitterMinutes, o.jitterMinutes));
      calls.push({ minute: Math.min(to, Math.max(from, minute)), sheets: sheets() });
    }
    // demand floor: keep adding calls until the day offers enough sheets
    while (otherSheets + calls.reduce((s, c) => s + c.sheets, 0) < o.minDemandSheets) {
      calls.push({ minute: Math.round(this.rng.range(from, to)), sheets: sheets() });
    }
    calls.sort((a, b) => a.minute - b.minute);
    // the Lease's wobble: a big customer's gone quiet (fewer calls for a few days)
    if (this.callMult < 1 && this.dayIndex <= this.callMultUntil) calls.splice(Math.max(1, Math.round(calls.length * this.callMult)));
    const f = this.fortuneNow;
    if (f && f.calls < 1) calls.splice(Math.max(1, Math.round(calls.length * f.calls)));
    // reputation: sheets lost yesterday cost calls today (latest calls go first; the guaranteed first call stays)
    const keep = Math.max(o.callsMin, calls.length - this.lostYesterday * o.lostJobCallPenalty);
    if (keep < calls.length) this.say(`Word's got around about yesterday. Fewer calls today.`, 'bad');
    return calls.slice(0, keep);
  }

  /** The sheet that'll go on the bed next: the one in your hands, else the soonest-due queued sheet that's in stock. */
  nextUp(): Job | undefined {
    const held = this.inHand !== null ? this.jobs.find(j => j.id === this.inHand && j.status === 'queued') : undefined;
    return held ?? this.queued.filter(j => this.stock[j.type] > 0).sort((a, b) => this.dueAt(a) - this.dueAt(b))[0];
  }
  /** Queued work that can't be cut because its ply's run out (none on the pallet). */
  get starvedTypes(): JobTypeId[] {
    return [...new Set(this.queued.filter(j => this.stock[j.type] <= 0 && j.id !== this.inHand).map(j => j.type))];
  }

  /** Absolute due time, comparable across days. */
  dueAt(j: Job): number { return j.dueDay * 24 * 60 + j.deadlineMinute; }
  isLate(j: Job): boolean { return this.dayIndex * 24 * 60 + this.minute > this.dueAt(j) + CONFIG.economy.lateGraceMinutes; }
  dueLabel(j: Job): string {
    if (j.dueDay > this.dayIndex) return `tmrw ${this.formatTime(j.deadlineMinute)}`;
    if (j.dueDay < this.dayIndex) return 'overdue';
    return this.formatTime(j.deadlineMinute);
  }

  private generateJobs(): Job[] {
    const n = this.rng.int(CONFIG.jobs.perDayMin, CONFIG.jobs.perDayMax);
    const jobs: Job[] = [];
    const names = [...JOB_NAMES].sort(() => this.rng.next() - 0.5);
    const first = CONFIG.clock.startHour * 60 + CONFIG.jobs.firstDeadlineMinutesAfterOpen;
    const last = CONFIG.clock.endHour * 60 + CONFIG.jobs.lastDeadlineMinutesAfterClose;
    const gap = (last - first) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      jobs.push(this.makeJob(this.pickType(), names[i % names.length], this.dayIndex, Math.round(first + gap * i)));
    }
    return jobs;
  }

  private pickType(): JobType {
    return this.rng.weighted(CONFIG.jobs.types, t => t.weight)!;
  }
  jobType(j: Job): JobType {
    return CONFIG.jobs.types.find(t => t.id === j.type)!;
  }

  /** One sheet of the given type. Price is a standard sheet's (basis board, standard cut time) times the type's priceMult. */
  private makeJob(t: JobType, name: string, dueDay: number, deadlineMinute: number, opts: { priceMult?: number; cutMinutesLess?: number } = {}): Job {
    const baseCut = this.rng.int(CONFIG.jobs.cutMinutesMin, CONFIG.jobs.cutMinutesMax - (opts.cutMinutesLess ?? 0));
    return {
      id: this.nextJobId++,
      name,
      material: t.material,
      materialCost: Math.round(t.boardCost * this.materialMult()),
      price: Math.round(this.priceFor(CONFIG.jobs.priceBasisBoardCost, baseCut) * t.priceMult * (opts.priceMult ?? 1) * (t.id === 'joinery' && CONFIG.dennis.enabled ? dennisJoineryMult(this) : 1)),
      cutMinutes: Math.max(1, Math.round(baseCut * t.cutMult)),
      deadlineMinute, dueDay,
      progress: 0, status: 'queued', paidLate: false, chipRisk: t.chipRisk, type: t.id,
    };
  }

  private materialMult(): number {
    return this.upgrades.has('nesting') ? this.upgradeEffect('nesting') : 1;
  }
  upgradeEffect(id: UpgradeId): number {
    return CONFIG.upgrades.find(u => u.id === id)!.effect;
  }
  private priceFor(boardCost: number, cutMinutes: number): number {
    const j = CONFIG.jobs;
    return Math.round(boardCost * this.rng.range(j.priceMarkupMin, j.priceMarkupMax) + cutMinutes * j.machineRatePerMinute);
  }
  private addRapport(n: number) {
    this.rapport = Math.max(CONFIG.rapport.min, Math.min(CONFIG.rapport.max, this.rapport + n));
  }

  /** Advance one game minute. No-op outside the working day. */
  tick() {
    if (this.phase !== 'day') return;
    this.minute += 1;

    // labour
    const rate = CONFIG.labour.hourlyRate / 60 * (this.isOvertimeHours ? CONFIG.labour.overtimeMultiplier : 1);
    this.spend(rate, 'labour');

    // competence recovery
    this.competence = Math.min(CONFIG.competence.max, this.competence + CONFIG.competence.recoveryPerMinute);

    this.tickBeer();
    this.tickWalkIns();
    this.tickPickups();
    if (this.palletFull && (this.bedFull || !CONFIG.chores)) this.today.palletBlocked = (this.today.palletBlocked ?? 0) + 1;

    // you, busy
    if (this.busy) {
      this.busy.remaining -= 1;
      if (this.busy.remaining <= 0) { this.say(`Done: ${this.busy.label}`); this.busy = null; }
    }

    // replacing a consumable
    if (this.replacing) {
      this.replacing.remaining -= 1;
      if (this.replacing.remaining <= 0 && this.fumbled(`fitting the ${this.replacing.key}`)) {
        this.replacing.remaining = Math.ceil(this.replaceMinutes(this.replacing.key) * this.stepDurationMult());
      } else if (this.replacing.remaining <= 0) {
        this.wear[this.replacing.key] = 1;
        this.say(`New ${this.replacing.key} fitted.`, 'good');
        this.replacing = null;
        if (this.machine === 'paused' && this.current && !this.powerTripped) this.machine = 'cutting';
      }
    }

    // machine
    if (this.machine === 'loading') {
      this.loadingRemaining -= 1;
      if (this.loadingRemaining <= 0 && this.fumbled('loading the sheet')) {
        this.loadingRemaining = Math.ceil(CONFIG.jobs.loadMinutes * this.stepDurationMult());
      } else if (this.loadingRemaining <= 0) {
        this.machine = 'cutting';
        this.say(`Cutting: ${this.current!.name}`);
        this.maybeFault(true);
      }
    } else if (this.machine === 'cutting' && this.current) {
      this.current.progress += 1;
      this.typeLedger[this.current.type].minutes += 1;
      this.wearConsumables();
      const r = this.current.ruin;
      if (r && this.current.progress >= r.at && !this.current.ruinedBy) this.ruinSheet(r.by);
      else if (this.current.progress >= this.current.cutMinutes) this.finishJob();
      else this.maybeFault(false);
      // a compressor on the extractor's circuit trips the power now and then (only rolled when the layout's like that)
      const trip = this.layout.powerTripPerMinute + (CONFIG.dennis.enabled ? dennisPowerTrip(this) : 0);
      if (trip > 0 && this.machine === 'cutting' && !this.powerTripped && this.rng.chance(trip)) {
        this.powerTripped = true; this.machine = 'paused';
        this.say('Power tripped. The breaker at the switchboard.', 'bad');
      }
      this.maybeLessonFire();
      this.maybeFire();
    }

    // fault timers
    if (this.fault) this.tickFault();

    // exhaust fire
    this.tickFire();

    // people
    this.tickDistractions();
    this.tickCallbacks();
    this.maybeDistraction();
    while (this.orderCalls.length && this.minute >= this.orderCalls[0].minute) {
      this.spawnOrderCall(this.orderCalls.shift()!.sheets);
    }
    if (this.rare) this.tickRare();
    if (CONFIG.dennis.enabled) dennisTick(this);

    // ply deliveries
    this.tickDeliveries();
    if (this.machine === 'idle' && !this.current && this.queued.length && !this.nextUp()) this.today.stockOutMinutes += 1;

    // afternoon drop-off
    if (this.lateDropToday && this.minute === CONFIG.jobs.lateDrop.hour * 60) this.addLateDrop();

    // end of day
    if (!this.overtime && this.minute >= CONFIG.clock.endHour * 60) {
      this.phase = 'endOfDayPrompt';
    } else if (this.overtime && this.minute >= CONFIG.clock.overtimeEndHour * 60) {
      this.say("That's it, lights off.");
      this.endDay();
    }
  }

  private wearConsumables() {
    const c = CONFIG.consumables;
    const bitMult = this.upgrades.has('premiumBits') ? this.upgradeEffect('premiumBits') : 1;
    this.wear.bit = Math.max(0, this.wear.bit - c.bit.wearPerMinute * bitMult * (this.current?.chipRisk ?? 1));
    this.wear.spoilboard = Math.max(0, this.wear.spoilboard - c.spoilboard.wearPerMinute);
    let filterMult = this.upgrades.has('extractor') ? this.upgradeEffect('extractor') : 1;
    if (this.current) filterMult *= this.jobType(this.current).bagFillMult;
    this.wear.filter = Math.max(0, this.wear.filter - c.filter.wearPerMinute * filterMult);
  }

  private faultWeight(def: FaultDef, atStart: boolean): number {
    if (def.onlyAtJobStart && !atStart) return 0;
    if (!def.onlyAtJobStart && atStart) return 0;
    let w = def.weight;
    if (def.consumable) {
      const health = this.wear[def.consumable];
      w *= 1 + (1 - health) * CONFIG.consumables[def.consumable].faultBoostAtZero;
    }
    if (def.id === 'chipping' && this.current) w *= this.current.chipRisk;
    if (def.id === 'extraction' && this.upgrades.has('extractor')) w *= this.upgradeEffect('extractor');
    if (def.id === 'extraction') w *= this.layout.extractionFaultMult * (CONFIG.dennis.enabled ? dennisFaultMult(this) : 1);
    if (def.id === 'chipping') w *= this.layout.chipMult;
    if (def.id === 'partLifted' && this.upgrades.has('vacuumZone')) w *= this.upgradeEffect('vacuumZone');
    return w;
  }

  private maybeFault(atStart: boolean) {
    if (this.fault || !this.current) return;
    let p = atStart ? CONFIG.faults.wrongMaterialChanceAtStart : CONFIG.faults.baseChancePerMinute;
    if (!atStart) {
      // overall chance scales with worst consumable
      const worst = Math.min(this.wear.bit, this.wear.spoilboard, this.wear.filter);
      p *= 1 + (1 - worst) * CONFIG.faults.worstConsumableChanceBoost;
      if (this.friendPresent) p *= CONFIG.faults.attentionSplitChanceMult;
    }
    p *= this.breakdownMult;
    if (!this.rng.chance(p)) return;
    const def = this.rng.weighted(FAULTS, d => this.faultWeight(d, atStart));
    if (!def) return;
    this.fault = {
      def, phase: 'diagnose', minutesOpen: 0, triedDiagnoses: [], busyRemaining: 0, busyLabel: '',
      stepIndex: 0, sheetScrapped: false,
    };
    this.machine = def.id === 'partLifted' ? 'estop' : 'fault';
    this.today.faults += 1;
    this.say(`FAULT: ${def.name}`, 'bad');
    if (this.sensorPaused(def)) this.say('Fault sensor paused the cut. The sheet will keep.');
    // a dull bit fuzzes most boards, but melts acrylic: the sheet's gone before you can do anything
    if (def.id === 'chipping' && this.current && this.jobType(this.current).dullBitRuinsSheet) {
      this.fault.sheetScrapped = true;
      this.scrapCurrent(`Dull bit melted the edge on ${this.current.material} — ${this.current.name} is scrap.`);
    }
  }

  /** The fault sensor (upgrade) caught this fault and paused the cut: the sheet waits, however long you take. */
  private sensorPaused(def: FaultDef) {
    return this.upgrades.has('faultSensor') && CONFIG.faults.sensorCatches.includes(def.id);
  }

  private tickFault() {
    const f = this.fault!;
    // Neglect clock: runs whenever you're not actively working the fix — including while you're off at a fire.
    // The fault sensor paused the cut the moment it started: the sheet waits, however long you take.
    const away = this.fireResponse !== null;
    if ((f.phase !== 'working' || away) && !this.sensorPaused(f.def)) f.minutesOpen += 1;
    if (!away && (f.phase === 'wrongCall' || f.phase === 'working')) {
      f.busyRemaining -= 1;
      if (f.busyRemaining <= 0) {
        if (f.phase === 'wrongCall') {
          f.phase = 'diagnose';
          this.say("Nope. That wasn't it.", 'bad');
        } else if (this.fumbled(f.busyLabel.toLowerCase())) {
          f.phase = 'step'; f.redo = true; // same step again
        } else {
          this.say(`Done: ${f.busyLabel}`);
          f.stepIndex += 1;
          if (f.path && f.stepIndex >= f.path.steps.length) this.resolveFault();
          else f.phase = 'step';
        }
      }
    }
    if (!f.sheetScrapped && this.current && f.minutesOpen > f.def.scrapAfterMinutes) {
      f.sheetScrapped = true;
      this.scrapCurrent(`Left too long — ${this.current.name} is scrap.`);
    }
  }

  private resolveFault() {
    const f = this.fault!;
    if (f.def.restores) this.wear[f.def.restores] = 1;
    if (f.path?.slowsJobBy && this.current) {
      const remaining = this.current.cutMinutes - this.current.progress;
      this.current.cutMinutes += Math.ceil(remaining * f.path.slowsJobBy);
    }
    this.say(`Fixed: ${f.def.name}.`, 'good');
    this.fault = null;
    this.settleMachine();
  }

  /** Put the machine back in whatever state the shed is now in, after a fault or fire clears. */
  private settleMachine() {
    if (this.machineDown) this.machine = 'down';
    else if (this.fire?.stage === 'duct') this.machine = 'fire';
    else if (this.fault) this.machine = this.fault.def.id === 'partLifted' ? 'estop' : 'fault';
    else if (this.current && this.current.status === 'cutting') this.machine = this.replacing ? 'paused' : 'cutting';
    else { this.machine = 'idle'; this.current = null; }
  }

  // ---------- exhaust fire ----------

  private fireChance(): number {
    const c = CONFIG.fire;
    let p = c.baseChancePerMinute;
    if (this.current) p *= this.jobType(this.current).fireChanceMult;
    if (1 - this.wear.filter > c.bagFullAbove) p *= c.bagFullMult;
    if (this.wear.bit < c.dullBitBelow) p *= c.dullBitMult;
    if (this.hasMilestone('sparkArrestor')) p *= CONFIG.milestone.fireChanceMult;
    if (CONFIG.dennis.enabled) p *= dennisFireMult(this); // a serviced extractor; a second router running
    return p;
  }

  private maybeFire() {
    if (this.fire || this.machineDown || this.machine !== 'cutting') return;
    if (!this.rng.chance(this.fireChance())) return;
    // no alarm and no log line: the smoke at the duct and the to-do list are the only tells
    this.fire = { id: this.nextFireId++, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 };
    this.today.firesSpot += 1;
  }

  /** The scripted lesson fire (CONFIG.fire.lesson): once, on its day, the first minute a sheet's cutting from its hour. */
  private maybeLessonFire() {
    const l = CONFIG.fire.lesson;
    if (this.lessonFireDone || this.dayIndex !== l.day || this.hour < l.fromHour) return;
    if (this.fire || this.machineDown || this.machine !== 'cutting') return;
    this.lessonFireDone = true;
    this.fire = { id: this.nextFireId++, stage: 'spot', minutes: 0, sprayed: 0, heat: 0, lesson: true };
    this.today.firesSpot += 1;
  }

  /** Go and deal with the fire: walk to the extinguisher, grab it and carry it to the duct. */
  fightFire(): boolean {
    if (this.phase !== 'day' || !this.fire || !this.canAct) return false;
    this.fireResponse = { step: 'toExtinguisher', remaining: this.fireWalk(CONFIG.fire.walkToExtinguisherMinutes) };
    return true;
  }

  /** Is the extinguisher pointed at the fire? Set every frame from E / the spray button. */
  setSpraying(held: boolean) { this.spraying = held; }

  /** Let go of the trigger (or lost aim) before it was out: the glow flares back and the spraying starts again from nothing. */
  sprayLetGo(): boolean {
    const f = this.fire;
    if (!f || f.sprayed <= 0) return false;
    f.sprayed = 0;
    this.say('It flared back up.', 'bad');
    return true;
  }

  private tickFire() {
    const c = CONFIG.fire;
    const r = this.fireResponse;
    if (r && r.step !== 'atDuct') {
      r.remaining -= 1;
      if (r.remaining <= 0) {
        if (r.step === 'toExtinguisher') { r.step = 'grab'; r.remaining = c.grabMinutes; }
        else if (r.step === 'grab') { r.step = 'toDuct'; r.remaining = this.fireWalk(c.walkToDuctMinutes); }
        else if (r.step === 'toDuct') { r.step = 'atDuct'; r.remaining = 0; }
        else { this.fireResponse = null; this.say('Extinguisher back on the wall.'); }
      }
    }
    const f = this.fire;
    if (!f) return;
    f.minutes += 1;
    if (this.fireResponse?.step === 'atDuct' && this.spraying) {
      f.sprayed += 1;
      if (f.sprayed >= c.sprayMinutes[f.stage]) { this.extinguish(); return; }
    }
    // it spreads at today's breakdown rate: not at all on the first days
    f.heat += this.breakdownMult * (f.lesson ? c.lesson.escalationMult : 1) * this.layout.fireSpreadMult;
    if (f.stage === 'spot' && f.heat >= c.ductFireAfterMinutes) {
      f.stage = 'duct';
      this.today.firesDuct += 1;
      if (!this.fault) this.machine = 'fire';
      this.say('Flames in the duct. The cut has stopped.', 'bad');
    } else if (f.stage === 'duct' && f.heat >= c.extractorFireAfterMinutes) {
      this.extractorFire();
    }
  }

  private extinguish() {
    const c = CONFIG.fire;
    this.fire = null;
    this.spraying = false;
    this.extinguisherUsesToday += 1;
    this.say('Fire out.', 'good');
    if (this.extinguisherUsesToday % c.refillEveryUses === 0) this.spend(c.refillCost, 'fixes', 'extinguisher refill');
    this.fireResponse = { step: 'returning', remaining: this.fireWalk(c.walkBackMinutes) };
    this.settleMachine();
  }

  private extractorFire() {
    const c = CONFIG.fire;
    this.fire = null;
    this.spraying = false;
    this.today.firesExtractor += 1;
    this.machineDown = true;
    this.say("The extractor's gone up. That's the machine done for today.", 'bad');
    this.spend(c.extractorRepairCost, 'fixes', 'extractor repair');
    this.note(`The extractor went up: $${c.extractorRepairCost} repair and no more cutting today.`, -c.extractorRepairCost);
    this.fault = null;
    if (this.current && this.current.status === 'cutting') this.scrapCurrent(`${this.current.name} is ruined.`);
    this.current = null;
    this.machine = 'down';
    // if you were already carrying the extinguisher, carry it back
    if (this.fireResponse) {
      this.fireResponse = this.fireResponse.step === 'toExtinguisher' ? null : { step: 'returning', remaining: this.upgrades.has('exhaustExtinguisher') ? this.fireWalk(c.walkBackMinutes) : c.walkBackMinutes };
    }
  }

  /** A chore skipped catches up: the sheet shifts (clamps) or lifts (the vacuum let go). Ruined mid-cut. */
  private ruinSheet(by: 'shift' | 'lift') {
    const j = this.current!;
    j.ruinedBy = by;
    if (by === 'shift') this.today.sheetsShifted += 1; else this.today.sheetsLifted += 1;
    this.today.choreBoards += j.materialCost;
    this.scrapCurrent(by === 'shift' ? `${j.name} shifted on the bed: a clamp short.` : `The vacuum let go and ${j.name} lifted: the compressor wants draining.`);
    this.current = null; this.machine = 'idle';
  }

  private scrapCurrent(reason: string) {
    if (!this.current) return;
    this.afterSheet(false);
    this.current.status = 'scrapped';
    this.today.sheetsScrapped += 1;
    this.typeLedger[this.current.type].scrapped += 1;
    this.say(`${reason} $${this.current.materialCost} of ${this.current.material} in the skip.`, 'bad');
    // the offcuts aren't nothing
    const salvage = Math.round(this.current.materialCost * CONFIG.economy.scrapSalvage);
    if (salvage > 0) this.earn(salvage, 'offcuts from the ruined sheet');
    // the fault still needs fixing, but there's no job to resume
    if (!this.fault) { this.current = null; this.machine = 'idle'; }
  }

  private finishJob() {
    const j = this.current!;
    if (j.rough) {
      // cut with the wrong bit (the view's bit rack): the edges are torn and the customer won't take it
      this.scrapCurrent(`${j.name}: rough edges from the wrong bit. A reject.`);
      this.current = null; this.machine = 'idle';
      return;
    }
    j.status = 'done';
    const late = this.isLate(j);
    j.paidLate = late;
    const pay = Math.round(late ? j.price * CONFIG.economy.latePayFraction : j.price);
    this.today.sheetsDone += 1;
    if (late) { this.today.sheetsLate += 1; this.today.latePayLost = (this.today.latePayLost || 0) + j.price - pay; }
    this.typeLedger[j.type].revenue += pay;
    this.typeLedger[j.type].cut += 1;
    // on Dennis's terms (or his invoice): the pay waits on the bet
    const held = CONFIG.dennis.enabled ? this.dennis.bets.find(b => b.status === 'open' && b.jobs?.includes(j.id)) : undefined;
    if (held) { held.held += pay; this.say(`${j.name} delivered: paid when ${CONFIG.dennis.name}'s ${held.kind === 'terms' ? 'terms come due' : 'invoice clears'}.`); }
    this.textCustomer(j, held ? 0 : pay); // paid when they pick it up
    // the edge-bander's share, in its ledger line: edged panels pay the premium
    if (j.type === 'joinery' && CONFIG.dennis.enabled && dennisJoineryMult(this) > 1) {
      const bander = this.dennis.bets.find(b => b.kind === 'bandsaw' && (b.status === 'open' || b.status === 'won' || b.status === 'lost') && (b.until ?? -1) >= this.dayIndex);
      if (bander) bander.net += Math.round(pay - pay / dennisJoineryMult(this));
    }
    this.afterSheet(true);
    this.current = null;
    this.machine = 'idle';
  }

  // ---------- distractions ----------

  private maybeDistraction() {
    if (this.distractions.length >= CONFIG.distractions.maxActive) return;
    if (!this.rng.chance(CONFIG.distractions.chancePerMinute)) return;
    const d = CONFIG.distractions;
    const kinds: { kind: DistractionKind; w: number }[] = [
      { kind: 'friend', w: d.friend.weight },
      { kind: 'phone', w: d.phone.weight },
      { kind: 'courier', w: d.courier.weight },
      { kind: 'bank', w: this.cash < 0 ? d.bank.weight : 0 },
    ];
    if (this.distractions.some(x => x.kind === 'friend')) kinds[0].w = 0;
    const pick = this.rng.weighted(kinds, k => k.w);
    if (!pick) return;
    this.spawnDistraction(pick.kind);
  }

  private spawnDistraction(kind: DistractionKind) {
    const d = CONFIG.distractions;
    const id = this.nextDistractionId++;
    let dist: Distraction;
    switch (kind) {
      case 'friend': {
        const mate = this.rng.pick(MATES.filter(m => m.id !== this.lastMate));
        this.lastMate = mate.id;
        const v = CONFIG.visitors;
        const dur = Math.round(v.visitMinutes * (this.beersToday > 0 ? CONFIG.beer.friendDurationMult : 1));
        dist = {
          id, kind, title: `${mate.name}'s dropped in`, line: '', remaining: dur, engaged: false, mate: mate.id,
          ask: null, chat: 0, cooldown: 0, beers: 0, told: [], approaches: 0, wander: this.newWander(),
        };
        this.approach(dist, 'ask'); // they come straight over to say g'day
        break;
      }
      case 'phone':
        dist = { id, kind, title: 'Phone ringing', line: 'A customer. Could be a quote.', remaining: d.phone.window, engaged: false };
        break;
      case 'courier':
        dist = { id, kind, title: 'Courier at the door', line: 'Board delivery. Needs a signature.', remaining: d.courier.window, engaged: false };
        break;
      case 'bank':
      default:
        dist = { id, kind, title: 'The bank is calling', line: "Overdrawn. They'd like a word.", remaining: d.bank.window, engaged: false };
        break;
    }
    this.distractions.push(dist);
    this.say(dist.title, 'info');
  }

  /** Scheduled order calls ring regardless of the distraction cap — it's the job coming in. */
  private spawnOrderCall(sheets: number) {
    const t = this.pickType();
    this.today.sheetsDemanded += sheets;
    this.distractions.push({
      id: this.nextDistractionId++, kind: 'phone', title: 'Phone ringing — new order',
      line: `${t.name}: ${sheets} sheet${sheets > 1 ? 's' : ''} of ${t.material}.`,
      remaining: CONFIG.distractions.phone.window, engaged: false, order: sheets, orderType: t.id,
      customer: this.rng.pick(CUSTOMERS),
    });
    this.say(`Phone ringing — ${t.name.toLowerCase()} order, ${sheets} × ${t.material}`, 'info');
  }

  private addOrder(sheets: number, typeId: JobTypeId, big = false, ready?: OrderPreview) {
    if (big) { this.addBigJob(sheets, typeId, ready?.jobs); return; }
    const { jobs, kind, label } = ready ?? this.orderJobs(sheets, typeId);
    const t = CONFIG.jobs.types.find(x => x.id === typeId)!;
    this.jobs.push(...jobs);
    const close = CONFIG.clock.endHour * 60;
    const when = kind === 'tomorrow' ? `tomorrow ${this.formatTime(close)}` : this.formatTime(jobs[0].deadlineMinute);
    this.say(`Order in: ${label}, ${sheets} × ${t.material}, due ${when}.`, kind === 'rush' ? 'bad' : 'good');
  }

  /** The sheets an order call brings, not yet on the board. */
  private orderJobs(sheets: number, typeId: JobTypeId): OrderPreview {
    const o = CONFIG.jobs.orders;
    const t = CONFIG.jobs.types.find(x => x.id === typeId)!;
    const name = this.rng.pick(JOB_NAMES);
    const f = this.fortuneNow;
    const kind = this.rng.weighted(['today', 'tomorrow', 'rush'] as const, k => o.deadlineMix[k] * (k === 'rush' && f ? f.rushMult : 1))!;
    const close = CONFIG.clock.endHour * 60;
    const due = kind === 'rush' ? { day: this.dayIndex, minute: this.minute + o.rushMinutes }
      : { day: this.dayIndex + (kind === 'tomorrow' ? 1 : 0), minute: close };
    const label = kind === 'rush' ? `RUSH — ${name}` : name;
    const priceMult = (kind === 'rush' ? CONFIG.jobs.rush.priceMult : 1) * (f?.priceMult ?? 1);
    const jobs: Job[] = [];
    for (let i = 0; i < sheets; i++) {
      jobs.push(this.makeJob(t, sheets > 1 ? `${label} (${i + 1}/${sheets})` : label, due.day, due.minute, { priceMult }));
    }
    return { jobs, kind, label };
  }

  /**
   * Picking up an order call: what's on offer (the sheets, their price and when they're due), for the yes/no card. The
   * same sheets go on the board if you take it. (The balance sim answers straight away and never calls this.)
   */
  previewOrder(id: number): OrderPreview | null {
    const dist = this.distractions.find(d => d.id === id);
    if (!dist || dist.kind !== 'phone' || !dist.order) return null;
    if (!dist.preview) {
      const t = CONFIG.jobs.types.find(x => x.id === dist.orderType)!;
      dist.preview = dist.big ? { jobs: this.bigJobJobs(dist.order, t), kind: 'tomorrow', label: 'BIG JOB — Hallam townhouses' } : this.orderJobs(dist.order, dist.orderType!);
    }
    return dist.preview;
  }

  private tickDistractions() {
    const d = CONFIG.distractions;
    for (const dist of [...this.distractions]) {
      if (dist.kind === 'friend') this.tickVisitor(dist);
      dist.remaining -= 1;
      if (dist.remaining > 0) continue;
      this.removeDistraction(dist.id);
      switch (dist.kind) {
        case 'friend':
          this.addRapport(d.friend.chatRapportGain);
          this.say(`"Righto, I'll let you get back to it." (+${d.friend.chatRapportGain} rapport)`, 'good');
          break;
        case 'phone':
          if (dist.order) {
            // an order call always leaves a voicemail; it's only lost if you don't ring back in time
            const customer = dist.customer ?? this.rng.pick(CUSTOMERS);
            this.callbacks.push({
              id: dist.id, customer, sheets: dist.order, orderType: dist.orderType!,
              expiresMinute: this.minute + CONFIG.jobs.orders.callbackMinutes, big: dist.big,
            });
            this.say(`Missed the call. ${customer} left a voicemail: ${dist.order} sheets. Ring back by ${this.formatTime(this.minute + CONFIG.jobs.orders.callbackMinutes)}.`);
          } else {
            this.addRapport(-d.phone.ignoreRapportCost);
            this.say('Missed the call. They went elsewhere.', 'bad');
          }
          break;
        case 'courier': this.courierPenaltyPending = true; this.say('Courier left. Re-delivery fee on the next sheet.', 'bad'); break;
        case 'bank': this.addRapport(-d.bank.ignoreRapportCost); this.spend(CONFIG.economy.bankFee, 'fees', 'dishonour fee'); break;
      }
    }
  }

  private tickCallbacks() {
    for (const c of this.callbacks.filter(x => this.minute >= x.expiresMinute)) this.loseCallback(c);
  }

  private loseCallback(c: Callback) {
    this.callbacks = this.callbacks.filter(x => x.id !== c.id);
    this.addRapport(-CONFIG.distractions.phone.ignoreRapportCost);
    this.today.sheetsMissed += c.sheets;
    this.say(`Never rang ${c.customer} back. ${c.sheets}-sheet order went elsewhere.`, 'bad');
    if (c.big) this.bigJobAnswered(false, c.sheets, 'missed');
  }

  /** Ring back a voicemail from the office phone: take the order, or turn it down. */
  callBack(id: number, action: 'answer' | 'decline' = 'answer'): boolean {
    const c = this.callbacks.find(x => x.id === id);
    if (!c || this.phase !== 'day' || !this.canAct) return false;
    this.callbacks = this.callbacks.filter(x => x.id !== id);
    this.busy = { label: `on the phone to ${c.customer}`, remaining: CONFIG.distractions.phone.busyMinutes };
    if (action === 'decline') {
      this.today.sheetsDeclined += c.sheets;
      this.say(`Rang ${c.customer} back. Turned down ${c.sheets} sheets.`);
      if (c.big) this.bigJobAnswered(false, c.sheets, 'declined');
      return true;
    }
    this.say(`Rang ${c.customer} back.`);
    this.addOrder(c.sheets, c.orderType, c.big);
    return true;
  }

  private removeDistraction(id: number) {
    this.distractions = this.distractions.filter(x => x.id !== id);
  }

  // ---------- player actions ----------

  /** `clamps`: how many of the four clamps went on (CONFIG.chore.clamp); the sim's scripts and the view say. */
  loadNextSheet(clamps: number = CONFIG.chore.clamp.clamps): boolean {
    if (this.phase !== 'day' || !this.canAct || this.machine !== 'idle' || this.fault) return false;
    if (this.bedFull) return false; // no room on the bed for a sheet
    if (!CONFIG.chores && this.palletFull) return false; // nowhere to put it when it's done
    const next = this.takeSheet();
    if (!next) return false;
    // the board goes on today's books now, as it's used
    this.book(this.inHandCost, 'materials');
    this.typeLedger[next.type].boards += this.inHandCost;
    this.inHandCost = 0;
    this.inHand = null;
    next.status = 'cutting';
    this.current = next;
    this.machine = 'loading';
    let load: number = this.laid(CONFIG.jobs.loadMinutes, this.layout.loadMinutes);
    if (CONFIG.chores) {
      const ch = CONFIG.chore;
      load += clamps * ch.clamp.minutesPerClamp + (this.offcutPile > 0 ? ch.offcuts.pileSlowMinutes : 0);
      this.rollRuin(next, clamps);
    }
    this.loadingRemaining = Math.ceil(load * this.stepDurationMult());
    this.say(`Loading ${next.material}...`);
    return true;
  }

  // ---------- chores (CONFIG.chore) ----------

  /** The finished pallet's full: the bed can't be cleared till someone picks up. */
  get palletFull(): boolean { return this.pallet >= CONFIG.pickup.palletCapacity; }
  /** The bed's holding as many finished boards as it takes: they have to go to the finished pallet before another sheet. */
  get bedFull(): boolean { return CONFIG.chores && this.bedPile >= CONFIG.chore.stack.bedHolds; }
  /** The compressor's hiss has dropped: it's due a drain. */
  get compressorDue(): boolean { return CONFIG.chores && this.compressorSheets >= CONFIG.chore.compressor.sheetsPerDrain; }
  /** How many sheets the offcut bin takes (the bigger bin takes more). */
  get binSheets(): number { return this.upgrades.has('bigBin') ? this.upgradeEffect('bigBin') : CONFIG.chore.offcuts.sheetsToFill; }

  /** As a sheet's loaded: will it shift (a clamp left off) or lift (the compressor past due)? If so, when. */
  private rollRuin(j: Job, clamps: number) {
    const ch = CONFIG.chore;
    const missing = Math.min(ch.clamp.clamps, Math.max(0, ch.clamp.clamps - clamps));
    // the hiss dropping is the warning: the next sheet's still safe, the ones after that aren't
    const over = this.compressorSheets - ch.compressor.sheetsPerDrain;
    const pShift = ch.clamp.shiftChanceByMissing[missing];
    const pLift = over > 0 ? Math.min(ch.compressor.liftChanceMax, over * ch.compressor.liftChancePerSheetOver) : 0;
    const by = pShift > 0 && this.rng.chance(pShift) ? 'shift' : pLift > 0 && this.rng.chance(pLift) ? 'lift' : null;
    if (by) j.ruin = { by, at: this.rng.int(Math.max(1, Math.round(j.cutMinutes * 0.2)), Math.max(1, Math.round(j.cutMinutes * 0.8))) };
  }

  /** Every sheet off the machine, good or ruined: offcuts in the bin (or on the floor), and the compressor runs on. */
  private afterSheet(good: boolean) {
    if (!CONFIG.chores) { if (good) this.pallet += 1; return; }
    if (good) this.bedPile += 1;
    this.compressorSheets += 1;
    if (this.offcutBin >= 1 - 1e-9) {
      if (this.offcutPile === 0) { this.today.binOverflows += 1; this.say("The offcut bin's full: offcuts all over the floor round it.", 'bad'); }
      this.offcutPile = CONFIG.chore.offcuts.pileTrips;
    } else this.offcutBin = Math.min(1, this.offcutBin + this.layout.binFillMult / this.binSheets);
  }

  /** Carry the finished boards off the bed to the finished pallet (`walked`: the view walked it; no time here). */
  clearBed(walked = false): boolean {
    if (this.phase !== 'day' || !this.canAct || this.bedPile <= 0) return false;
    const room = CONFIG.pickup.palletCapacity - this.pallet;
    if (room <= 0) { this.say("The finished pallet's full: nowhere to stack till someone picks up.", 'bad'); return false; }
    const moved = Math.min(room, this.bedPile);
    this.pallet += moved; this.bedPile -= moved;
    if (!walked) this.busy = { label: 'boards to the finished pallet', remaining: this.walkMinutes(this.laid(CONFIG.chore.stack.unloadMinutes, this.layout.stackMinutes) + (this.offcutPile > 0 ? CONFIG.chore.offcuts.pileSlowMinutes : 0)) };
    return true;
  }

  /** Bag the offcut bin and take it to the skip. */
  emptyOffcutBin(walked = false): boolean {
    if (this.phase !== 'day' || !this.canAct || this.offcutBin <= 0) return false;
    this.offcutBin = 0;
    if (!walked) this.busy = { label: 'offcuts to the skip', remaining: this.walkMinutes(this.laid(CONFIG.chore.offcuts.tripMinutes, this.layout.binTripMinutes)) };
    return true;
  }

  /** A load of the overflow off the floor to the skip. */
  clearOffcutPile(walked = false): boolean {
    if (this.phase !== 'day' || !this.canAct || this.offcutPile <= 0) return false;
    this.offcutPile -= 1;
    if (!walked) this.busy = { label: 'offcuts off the floor', remaining: this.walkMinutes(CONFIG.chore.offcuts.tripMinutes) };
    if (this.offcutPile === 0) this.say('Floor clear of offcuts.', 'good');
    return true;
  }

  /** Hold the compressor's drain valve open: the water's out and the vacuum's strong again. */
  drainCompressor(walked = false): boolean {
    if (this.phase !== 'day' || !this.canAct || this.compressorSheets <= 0) return false;
    this.compressorSheets = 0;
    if (!walked) this.busy = { label: 'draining the compressor', remaining: this.laid(CONFIG.chore.compressor.drainMinutes, this.layout.drainMinutes) };
    this.say('Compressor drained. The hiss is back up.');
    return true;
  }

  /** Take the next sheet off the pallet (the board was paid for when it was ordered). Null: nothing in stock for the queue. */
  takeSheet(): Job | null {
    if (this.phase !== 'day') return null;
    if (this.inHand !== null) {
      const held = this.jobs.find(j => j.id === this.inHand);
      if (held && held.status === 'queued') return held;
      // that job's gone (pulled by the customer): the sheet goes back on the pallet
      if (held) { this.stock[held.type] += 1; this.stockValue[held.type] += this.inHandCost; }
      this.inHandCost = 0;
      this.inHand = null;
    }
    const next = this.nextUp();
    if (!next) return null;
    // average cost of that line on the pallet goes with the sheet
    const unit = this.stock[next.type] > 0 ? this.stockValue[next.type] / this.stock[next.type] : 0;
    this.stock[next.type] -= 1;
    this.stockValue[next.type] = Math.max(0, this.stockValue[next.type] - unit);
    this.inHandCost = unit;
    this.inHand = next.id;
    const left = this.stock[next.type], word = this.stockWord(next.type);
    if (left === 0) this.say(`Out of ${word}.`, 'bad');
    else if (left < CONFIG.supply.lowStockBelow) this.say(`${left} sheet${left > 1 ? 's' : ''} of ${word} left.`);
    return next;
  }

  /** "formply", "MDF", "acrylic". */
  stockWord(t: JobTypeId): string { return CONFIG.jobs.types.find(x => x.id === t)!.material.split(' ').slice(1).join(' '); }

  // ---------- ply supply ----------

  /** Same-day truck slots still free (none after the cut-off). */
  get trucksLeftToday(): number {
    return this.minute >= CONFIG.supply.cutoffHour * 60 ? 0 : Math.max(0, CONFIG.supply.maxDeliveriesPerDay - this.deliveriesOn(this.dayIndex));
  }

  private deliveriesOn(day: number) { return this.deliveries.filter(d => d.day === day && !d.feeOwed).length; }
  get truckOnApron(): Delivery | undefined { return this.deliveries.find(d => d.stage === 'waiting' || d.stage === 'unloading'); }

  /** What an order would cost and when it'd turn up, or why it can't be placed. */
  plyQuote(type: JobTypeId, qty: number): { boards: number; fee: number; day: number; minute: number } | { error: string; broke?: boolean } {
    const s = CONFIG.supply;
    if (this.phase !== 'day') return { error: 'Supplier is closed.' };
    if (!(s.orderSizes as readonly number[]).includes(qty)) return { error: 'They sell it in 4s.' };
    const t = CONFIG.jobs.types.find(x => x.id === type)!;
    let boards = Math.round(t.boardCost * this.materialMult() * this.supplyCostMult * (this.fortuneNow?.plyMult ?? 1)) * qty;
    if (this.courierPenaltyPending) boards = Math.round(boards * (1 + CONFIG.distractions.courier.ignoredMaterialPenalty));
    const fee = qty >= s.freeDeliveryFrom ? 0 : s.deliveryFee;
    // the supplier won't take you past the overdraft limit
    if (this.cash - boards - fee < -CONFIG.economy.overdraftLimit) return { error: "Can't afford it", broke: true };
    if (this.minute < s.cutoffHour * 60 && this.deliveriesOn(this.dayIndex) < s.maxDeliveriesPerDay) {
      return { boards, fee, day: this.dayIndex, minute: this.minute + s.leadMinutes };
    }
    const tomorrow = this.dayIndex + 1;
    const booked = this.deliveriesOn(tomorrow);
    if (booked >= s.maxDeliveriesPerDay) return { error: 'Two trucks booked already. Try tomorrow.' };
    return { boards, fee, day: tomorrow, minute: s.morningMinute + booked * 40 };
  }

  /** Ring the supplier: boards and the delivery fee are paid now; the truck comes later. */
  orderPly(type: JobTypeId, qty: number): Delivery | null {
    const q = this.plyQuote(type, qty);
    if ('error' in q) { this.say(q.error, 'bad'); return null; }
    const s = CONFIG.supply;
    // same-day trucks run a few minutes either side of the quote
    const minute = q.day === this.dayIndex ? q.minute + this.rng.int(-s.leadJitter, s.leadJitter) : q.minute;
    this.courierPenaltyPending = false;
    // the boards are stock: cash goes, but they're not today's cost until they're cut
    this.cash -= q.boards;
    this.say(`-$${q.boards.toFixed(0)} ${qty} × ${this.stockWord(type)} (stock)`, 'money');
    this.spend(q.fee, 'deliveryFees', 'delivery fee');
    const d: Delivery = { id: this.nextDeliveryId++, lines: [{ type, qty, unitCost: q.boards / qty }], day: q.day, minute, stage: 'due', signBy: 0, bundles: [], fee: q.fee, feeOwed: false };
    this.deliveries.push(d);
    this.say(`Ordered ${qty} × ${this.stockWord(type)}. Truck ${q.day === this.dayIndex ? `about ${this.formatTime(q.minute)}` : `tomorrow ${this.formatTime(q.minute)}`}.`, 'good');
    return d;
  }

  /** Trucks turn up one at a time; anything due waits behind one already on the apron. */
  private arriveDeliveries() {
    if (this.truckOnApron) return;
    const d = this.deliveries.find(x => x.stage === 'due' && (x.day < this.dayIndex || (x.day === this.dayIndex && this.minute >= x.minute)));
    if (!d) return;
    d.stage = 'waiting';
    this.today.trucks += 1;
    d.signBy = this.minute + CONFIG.supply.signWindowMinutes;
    if (d.feeOwed) { this.spend(d.fee, 'deliveryFees', 'redelivery fee'); d.feeOwed = false; }
    this.say(`Ply truck's here: ${d.lines.map(l => `${l.qty} × ${this.stockWord(l.type)}`).join(', ')}. Needs a signature.`, 'info');
  }

  private tickDeliveries() {
    const d = this.truckOnApron;
    if (d?.stage === 'waiting' && this.minute >= d.signBy) this.driverLeaves(d);
    this.arriveDeliveries();
  }

  /** A sheet off the truck onto the pallet, at what it cost. */
  private addStock(d: Delivery, t: JobTypeId) {
    this.stock[t] += 1;
    this.stockValue[t] += d.lines.find(l => l.type === t)?.unitCost ?? 0;
  }

  /** Ply on the pallet (and in your hands): what it cost, and how many sheets. */
  get plyOnHand(): { value: number; sheets: number } {
    const held = this.inHand !== null ? 1 : 0;
    return {
      value: Object.values(this.stockValue).reduce((a, b) => a + b, 0) + (held ? this.inHandCost : 0),
      sheets: Object.values(this.stock).reduce((a, b) => a + b, 0) + held,
    };
  }

  private driverLeaves(d: Delivery) {
    d.stage = 'due'; d.day = this.dayIndex + 1; d.minute = CONFIG.supply.morningMinute; d.feeOwed = true;
    this.say(`Nobody signed. The driver's gone${d.fee ? ` — $${d.fee} delivery fee wasted` : ''}. Back tomorrow morning.`, 'bad');
  }

  /** Sign for the truck on the apron. Then it's bundles, one trip each. `quick`: one tap in the world, no minute spent. */
  signDelivery(id: number, quick = false): boolean {
    const d = this.deliveries.find(x => x.id === id);
    if (!d || d.stage !== 'waiting' || this.phase !== 'day' || !this.canAct || this.dockBlocked) return false;
    const sheets = d.lines.flatMap(l => Array.from({ length: l.qty }, () => l.type));
    const n = CONFIG.supply.bundles;
    d.bundles = Array.from({ length: n }, (_, i) => sheets.slice(Math.round(i * sheets.length / n), Math.round((i + 1) * sheets.length / n)));
    d.stage = 'unloading';
    if (!quick) this.busy = { label: 'signing for the ply', remaining: CONFIG.supply.signMinutes };
    this.say('Signed for the ply.');
    return true;
  }

  /** One bundle from the truck onto the pallet. `walked`: the world walked it; otherwise it takes a trip's time. */
  unloadBundle(id: number, walked = false): boolean {
    const d = this.deliveries.find(x => x.id === id);
    if (!d || d.stage !== 'unloading' || !d.bundles.length || this.phase !== 'day' || !this.canAct || this.dockBlocked) return false;
    for (const t of d.bundles.shift()!) this.addStock(d, t);
    if (!walked) this.busy = { label: 'unloading ply', remaining: this.walkMinutes(this.laid(CONFIG.supply.unloadTripMinutes, this.layout.unloadTripMinutes)) };
    if (!d.bundles.length) {
      this.deliveries = this.deliveries.filter(x => x.id !== id);
      this.say(`Ply's on the pallet: ${CONFIG.jobs.types.map(t => `${this.stock[t.id]} ${this.stockWord(t.id)}`).join(', ')}.`, 'good');
      this.arriveDeliveries();
    }
    return true;
  }

  diagnose(diagId: string): boolean {
    const f = this.fault;
    if (!f || f.phase !== 'diagnose' || !this.canAct) return false;
    let chosen = f.def.diagnoses.find(d => d.id === diagId);
    if (!chosen) return false;
    if (this.rng.chance(this.misclickChance())) {
      const others = f.def.diagnoses.filter(d => d.id !== diagId && !f.triedDiagnoses.includes(d.id));
      if (others.length) { chosen = this.rng.pick(others); this.say('Fumbled it. Wrong button.', 'bad'); }
    }
    f.triedDiagnoses.push(chosen.id);
    if (chosen.correct) {
      f.phase = 'choosePath';
      this.say(`Diagnosis: ${chosen.label}.`, 'good');
    } else {
      f.phase = 'wrongCall';
      f.busyRemaining = Math.ceil(CONFIG.faults.wrongDiagnosisMinutes * this.stepDurationMult());
      f.busyLabel = `Checking ${chosen.label.toLowerCase()}...`;
      this.today.wrongCalls += 1;
      this.say(f.busyLabel);
    }
    return true;
  }

  availablePaths(): FixPath[] {
    if (!this.fault) return [];
    return this.fault.def.paths.filter(p => !p.requiresUpgrade || this.upgrades.has(p.requiresUpgrade));
  }

  choosePath(pathId: string): boolean {
    const f = this.fault;
    if (!f || f.phase !== 'choosePath' || !this.canAct) return false;
    const path = this.availablePaths().find(p => p.id === pathId);
    if (!path) return false;
    f.path = path;
    f.stepIndex = 0;
    f.phase = 'step';
    this.say(`Plan: ${path.label}`);
    return true;
  }

  doStep(): boolean {
    const f = this.fault;
    if (!f || f.phase !== 'step' || !f.path || !this.canAct) return false;
    const step = f.path.steps[f.stepIndex];
    if (!f.redo) {
      const cost = Math.round(step.cost * CONFIG.economy.fixCostMult); // parts and call-outs, softened (CONFIG.economy)
      if (cost > 0) this.spend(cost, 'fixes', step.label.toLowerCase());
      if (this.current) this.typeLedger[this.current.type].fixes += cost;
    }
    f.redo = false;
    f.phase = 'working';
    f.busyLabel = step.label;
    f.busyRemaining = Math.max(1, Math.ceil(step.minutes * this.stepDurationMult()));
    this.say(`${step.label} (${f.busyRemaining} min)`);
    return true;
  }

  replaceConsumable(key: ConsumableKey): boolean {
    if (this.phase !== 'day' || !this.canAct || this.replacing || this.fault) return false;
    if (this.machine === 'loading' || this.machine === 'down') return false;
    const c = CONFIG.consumables[key];
    this.spend(c.replaceCost, 'consumables', `new ${key}`);
    this.replacing = { key, remaining: Math.ceil(this.replaceMinutes(key) * this.stepDurationMult()) };
    if (this.machine === 'cutting') this.machine = 'paused';
    this.say(`Swapping ${key} (${this.replacing.remaining} min)`);
    return true;
  }

  respond(id: number, action: 'chat' | 'disengage' | 'answer' | 'sign' | 'decline'): boolean {
    const dist = this.distractions.find(d => d.id === id);
    if (!dist) return false;
    const d = CONFIG.distractions;
    switch (dist.kind) {
      case 'friend':
        if (action === 'disengage') {
          // they don't go: they wander off and come back later
          if (!dist.ask && !dist.engaged) return false;
          this.addRapport(-d.friend.disengageRapportCost);
          dist.ask = null; dist.chat = 0; dist.engaged = false;
          dist.cooldown = CONFIG.visitors.waveOffCooldown;
          this.say(`"Sorry mate, flat out." (-${d.friend.disengageRapportCost} rapport)`);
        } else if (dist.ask) {
          if (dist.ask.kind === 'beer' && this.visitorMayHaveBeer(dist)) {
            // they asked for a beer: a yes means one out of your fridge, and a proper chat
            this.mateBeer(dist);
            this.startYarn(dist, d.friend.beerChatMinutes);
            this.say(`"Go on then." A beer for ${this.mateName(dist)}.`);
          } else {
            this.startYarn(dist, CONFIG.visitors.yarnMinutes);
            this.say('"Yeah go on, what\'s up?"');
          }
        }
        return true;
      case 'phone':
        if (!this.canAct) return false;
        this.removeDistraction(id);
        this.busy = { label: 'on the phone', remaining: d.phone.busyMinutes };
        if (action === 'decline' && dist.order) {
          // turning work down honestly costs nothing; it's missing the call that hurts
          this.today.sheetsDeclined += dist.order;
          this.say(`Turned down ${dist.order} sheets. "Flat out this week, sorry mate."`);
          if (dist.big) this.bigJobAnswered(false, dist.order, 'declined');
          return true;
        }
        this.addRapport(d.phone.answerRapportGain);
        if (dist.order) this.addOrder(dist.order, dist.orderType!, dist.big, dist.preview);
        else if (this.rushJobsToday < CONFIG.jobs.rush.maxPerDay && this.rng.chance(CONFIG.rapport.rushJobChance * (this.rapport / CONFIG.rapport.max))) this.addRushJob();
        else this.say('Just a quote. Followed up later.');
        return true;
      case 'courier':
        if (!this.canAct) return false;
        this.removeDistraction(id);
        this.busy = { label: 'signing for delivery', remaining: d.courier.busyMinutes };
        this.addRapport(d.courier.signRapportGain);
        this.say('Board delivered.', 'good');
        return true;
      case 'bank':
        if (!this.canAct) return false;
        this.removeDistraction(id);
        this.busy = { label: 'on the phone with the bank', remaining: d.bank.busyMinutes };
        this.say('Talked them round. For now.');
        return true;
    }
    return false;
  }

  private addRushJob() {
    const r = CONFIG.jobs.rush;
    const j = this.makeJob(this.pickType(), `RUSH — ${this.rng.pick(JOB_NAMES)}`, this.dayIndex, 0,
      { priceMult: r.priceMult, cutMinutesLess: r.cutMinutesLess });
    j.deadlineMinute = this.minute + j.cutMinutes + r.deadlineSlackMinutes;
    this.jobs.push(j);
    this.today.sheetsDemanded += 1;
    this.rushJobsToday += 1;
    this.say(`Rush job added: ${j.name} ($${j.price})`, 'good');
  }

  private addLateDrop() {
    const j = this.makeJob(this.pickType(), `DROP-OFF — ${this.rng.pick(JOB_NAMES)}`, this.dayIndex,
      CONFIG.clock.overtimeEndHour * 60, { priceMult: CONFIG.jobs.lateDrop.priceMult });
    this.jobs.push(j);
    this.today.sheetsDemanded += 1;
    this.say(`A joiner dropped off ${j.material}: ${j.name}. $${j.price} if it's cut tonight.`, 'good');
  }

  // ---------- beer ----------

  /** A can from the fridge, into your hand. One can in hand at a time. */
  buyBeer(): boolean {
    if (this.phase !== 'day' || !this.fridgeOpen || !this.canAct || this.heldCan) return false;
    this.spend(CONFIG.beer.cost, 'beer', 'beer');
    this.cans.push({ id: this.nextCanId++, fill: 1, held: true, downSince: null, warm: false, drunkMinutes: 0, yuck: false });
    this.beersToday += 1;
    this.today.beers += 1;
    this.say(this.beersToday === 1 ? 'Cold one. Well earned.' : `Beer #${this.beersToday}. Things feel… fine.`);
    return true;
  }

  /** Put the can in your hand down (two hands needed, or just done with it). */
  putDownCan(): Can | null {
    const c = this.heldCan;
    if (!c) return null;
    c.held = false; c.downSince = this.minute;
    return c;
  }

  pickUpCan(id: number): boolean {
    const c = this.cans.find(x => x.id === id);
    if (!c || c.held || this.heldCan) return false;
    c.held = true; c.downSince = null;
    return true;
  }

  /** Into a bin: the one in your hand. */
  binCan(): boolean {
    const c = this.heldCan;
    if (!c) return false;
    this.cans = this.cans.filter(x => x.id !== c.id);
    return true;
  }

  get emptiesAbout(): number { return this.cans.filter(c => !c.held && c.fill <= 0).length; }

  useToilet(): boolean {
    if (this.phase !== 'day' || !this.canAct || !this.needLoo) return false;
    this.busy = { label: 'on the loo', remaining: CONFIG.beer.toiletMinutes };
    this.looSince = null;
    this.beersAtLoo = this.beersToday;
    this.today.looTrips += 1;
    return true;
  }

  /** A hands-on gesture in the shed (the view's one-thumb jobs) spoiled by the beer: it has to be done again. */
  gestureFumbled(what: string): boolean { return this.fumbled(what); }

  /** A finished step that has to be done again: a beer's worth of clumsiness. */
  private fumbled(what: string): boolean {
    if (this.fumbleChance <= 0 || !this.rng.chance(this.fumbleChance)) return false;
    this.today.fumbles += 1;
    this.say(`Fumbled: ${what}. Again.`, 'bad');
    return true;
  }

  private tickBeer() {
    const b = CONFIG.beer;
    const c = this.heldCan;
    if (c && c.fill > 0) {
      // a minute of drinking: the can goes down, the beer goes in
      const sip = Math.min(c.fill, 1 / b.drinkMinutes);
      c.fill = Math.max(0, c.fill - sip);
      if (c.fill < 1e-6) c.fill = 0;
      this.alcohol += sip;
      this.alcoholAtLastSip = this.alcohol;
      if (c.drunkMinutes++ % b.sipEveryMinutes === 0) {
        this.sips += 1;
        if (c.warm && !c.yuck) { c.yuck = true; this.say('Yuck. Warm beer.'); }
      }
      if (c.fill === 0) this.say('Finished the beer.');
    } else if (this.alcohol > 0) {
      // wearing off: gone decayMinutes after the last sip
      this.alcohol = Math.max(0, this.alcohol - this.alcoholAtLastSip / b.decayMinutes);
    }
    for (const can of this.cans) {
      if (!can.held && !can.warm && can.fill > 0 && can.downSince !== null && this.minute - can.downSince >= b.warmAfterMinutes) can.warm = true;
    }
    if (this.looSince === null && this.beersToday - this.beersAtLoo >= b.looAfterBeers) { this.looSince = this.minute; this.say('Need the loo.'); }
    // a mate who's in, and empties all over the place: they take that as an invitation (once a visit, within the caps)
    const mate = this.distractions.find(d => d.kind === 'friend' && !d.beers && this.visitorMayHaveBeer(d));
    if (mate && this.emptiesAbout >= b.mateGrabsBeerAt) {
      this.mateBeer(mate);
      this.say(`${this.mateName(mate)} grabbed a beer from the fridge.`, 'bad');
    }
    // the mate who joins you if you're having one: you are, so they don't ask — they help themselves and wander on
    const joiner = this.distractions.find(d => d.kind === 'friend' && !d.engaged && !d.beers && this.visitorMayHaveBeer(d) && mateById(d.mate)?.grabsIfYoureDrinking);
    const can = this.heldCan;
    if (joiner && can && can.fill > 0) {
      this.mateBeer(joiner);
      this.addRapport(CONFIG.distractions.friend.chatRapportGain);
      this.say(`${this.mateName(joiner)} grabbed a beer from the fridge. Cheers.`, 'good');
    }
  }

  mateName(d: Distraction): string { return mateById(d.mate)?.name ?? d.title.replace(/'s dropped in$/, ''); }

  /** One of your beers, for a mate. */
  private mateBeer(d: Distraction) {
    d.beers = (d.beers ?? 0) + 1;
    if (d.mate) this.visitorBeers[d.mate] = (this.visitorBeers[d.mate] ?? 0) + 1;
    this.spend(CONFIG.beer.cost, 'mateBeer', `beer for ${this.mateName(d)}`);
  }

  // ---------- visitors ----------

  /** Today's beers from your fridge for all the mates who've dropped in. */
  get visitorBeersToday(): number { return Object.values(this.visitorBeers).reduce((s, n) => s + n, 0); }

  /** Can this mate have a beer from your fridge right now? Not before it opens, and not past either cap (CONFIG.visitors). */
  visitorMayHaveBeer(d: Distraction): boolean {
    const v = CONFIG.visitors;
    return this.fridgeOpen && (this.visitorBeers[d.mate ?? ''] ?? 0) < v.beersPerVisitor && this.visitorBeersToday < v.beersPerDay;
  }

  /** A minute of a visit: they wander, come up to you when their cooldown's up, wait for an answer, or yarn. */
  private tickVisitor(d: Distraction) {
    const v = CONFIG.visitors;
    d.cooldown ??= 0; d.chat ??= 0; d.told ??= []; d.approaches ??= 0;
    if (!d.wander || --d.wander.left <= 0) d.wander = this.newWander();
    if (d.ask) {
      // unanswered: they start a yarn anyway (no beer unless you say so)
      if (--d.ask.left <= 0) { this.startYarn(d, v.yarnMinutes); this.say('"...so anyway, did I tell you about the boat?"'); }
    } else if (d.engaged) {
      if (--d.chat <= 0) { d.engaged = false; d.cooldown = this.visitorRng.int(v.cooldownMin, v.cooldownMax); }
    } else if (--d.cooldown <= 0) {
      this.approach(d);
    }
  }

  private newWander(): NonNullable<Distraction['wander']> {
    const v = CONFIG.visitors;
    return { area: this.visitorRng.pick(v.areas), spot: this.visitorRng.next(), left: this.visitorRng.int(v.wanderMin, v.wanderMax) };
  }

  private startYarn(d: Distraction, minutes: number) {
    d.ask = null; d.engaged = true; d.chat = minutes;
  }

  /**
   * They come up to you with something to say, from one of three pools: an ask (a beer once the fridge is open and the
   * caps allow, else a cuppa or a yarn), shop talk, or a story they haven't told yet. Never the same line twice running.
   */
  private approach(d: Distraction, pool?: 'ask' | 'shop' | 'story') {
    const mate = mateById(d.mate);
    if (!mate) return;
    const r = this.visitorRng, told = d.told ?? (d.told = []);
    const storiesLeft = mate.stories.map((_, i) => i).filter(i => !told.includes(i));
    pool ??= r.weighted(['ask', 'shop', 'story'] as const, p => (p === 'story' && !storiesLeft.length ? 0 : 1))!;
    const fresh = (lines: readonly string[]) => { const f = lines.filter(l => l !== d.lastLine); return f.length ? f : lines; };
    let ask: VisitorAsk;
    if (pool === 'story') {
      const i = r.pick(storiesLeft);
      told.push(i);
      const bar = r.pick(CONFIG.visitors.bars);
      ask = { kind: 'story', text: mate.stories[i].replace(/{bar}/g, bar.name).replace(/{suburb}/g, bar.suburb), left: 0 };
    } else if (pool === 'shop') ask = { kind: 'shop', text: r.pick(fresh(SHOP_TALK)), left: 0 };
    else if (this.visitorMayHaveBeer(d)) ask = { kind: 'beer', text: r.pick(fresh(mate.beer)), left: 0 };
    else ask = { kind: 'cuppa', text: r.pick(fresh(mate.cuppa)), left: 0 };
    ask.left = CONFIG.visitors.askMinutes;
    d.ask = ask; d.lastLine = ask.text; d.line = ask.text;
    d.approaches = (d.approaches ?? 0) + 1;
    this.say(`${mate.name}: "${ask.text}"`);
  }

  // ---------- rare events (CONFIG.rareEvent) ----------

  private rareDef(id: RareEventId): RareEvent { return CONFIG.rareEvent.events.find(e => e.id === id)!; }
  private tellMinutes(def: RareEvent) { return Math.ceil(def.tell.seconds * 1000 / CONFIG.clock.realMsPerGameMinute); }

  /** Morning roll, on its own seeded stream: about one day in six, one event, in the slot of one of today's order calls. */
  private rollRareEvent() {
    const re = CONFIG.rareEvent;
    if (this.dayIndex < re.fromDay) return;
    const r = new Rng((Math.imul(this.seed ^ 0x5bd1e995, 0x85ebca6b) + Math.imul(this.dayIndex, 0xc2b2ae35)) >>> 0);
    if (!r.chance(re.dayChance)) return;
    const slot = (e: RareEvent) => this.orderCalls.findIndex(c => c.minute >= e.earliestHour * 60);
    const def = r.weighted(re.events.filter(e => slot(e) >= 0), e => e.weight);
    if (def) this.scheduleRare(def, this.orderCalls[slot(def)].minute);
  }

  /** Debug (?event=<id>): today's event is this one, landing soon after the clock starts. */
  forceRareEvent(id: string): boolean {
    const def = CONFIG.rareEvent.events.find(e => e.id === id);
    if (!def || this.phase !== 'day') return false;
    this.scheduleRare(def, this.minute + CONFIG.rareEvent.debugLeadMinutes + this.tellMinutes(def), false);
    return true;
  }

  /**
   * Book it for `at`, in place of the first order call from then on (rather than stacking on top). `takeSlot`: it lands
   * when that call would have rung; otherwise (forced) it keeps `at` and the call just doesn't ring.
   */
  private scheduleRare(def: RareEvent, at: number, takeSlot = true) {
    const i = this.orderCalls.findIndex(c => c.minute >= at);
    if (def.replacesInterruption && i >= 0) {
      if (takeSlot) at = this.orderCalls[i].minute;
      this.orderCalls.splice(i, 1);
    }
    this.rare = { id: def.id, at, phase: 'scheduled' };
  }

  private tickRare() {
    const r = this.rare!, def = this.rareDef(r.id);
    if (r.phase === 'scheduled' && this.minute >= r.at - this.tellMinutes(def)) { r.phase = 'tell'; this.say(`${def.tell.cue}.`, 'info'); }
    if (r.phase === 'tell' && this.minute >= r.at) this.landRare(r, def);
    else if (r.phase === 'live' && r.id === 'council' && !r.touring && --r.waitLeft! <= 0) this.finishCouncil(false);
  }

  private landRare(r: RareEventState, def: RareEvent) {
    r.phase = 'live';
    if (r.id === 'council') {
      r.waitLeft = def.waitMinutes; r.escortSec = 0; r.touring = false;
      this.say("The council's here: an inspector with a clipboard at the roller door. Stop the machine and walk them round.", 'bad');
    } else if (r.id === 'bigJob') {
      const t = this.pickType();
      this.today.sheetsDemanded += def.sheets!;
      this.distractions.push({
        id: this.nextDistractionId++, kind: 'phone', title: 'Phone ringing — big job', big: true,
        line: `Big job: ${def.sheets} sheets of ${t.material}, ${def.dueDays} days.`,
        remaining: CONFIG.distractions.phone.window, engaged: false, order: def.sheets, orderType: t.id, customer: 'Hallam Builders',
      });
      this.say(`Phone ringing — a big job: ${def.sheets} × ${t.material} in ${def.dueDays} days`, 'info');
    } else {
      r.tripsLeft = def.trips; r.blockedAt = this.minute;
      this.say("CRUNCH. A reversing ute's clipped the roller door. The dock's blocked until the slats are cleared.", 'bad');
    }
  }

  /** The dock's blocked: busted roller-door slats in the way. No truck can be signed for or unloaded until they're gone. */
  get dockBlocked(): boolean { return this.rare?.id === 'uteClip' && this.rare.phase === 'live'; }

  /** One load of busted slats to the skip. `walked`: the world carried it; otherwise it takes a trip's time. */
  clearDebris(walked = false): boolean {
    const r = this.rare;
    if (!this.dockBlocked || !r || this.phase !== 'day' || !this.canAct) return false;
    const def = this.rareDef('uteClip');
    r.tripsLeft! -= 1;
    if (!walked) this.busy = { label: 'carting slats to the skip', remaining: this.walkMinutes(def.tripMinutes!) };
    if (r.tripsLeft! > 0) { this.say(`Slats in the skip. ${r.tripsLeft} more load${r.tripsLeft === 1 ? '' : 's'}.`); return true; }
    const mins = this.minute - r.blockedAt!;
    r.phase = 'done'; r.outcome = 'cleared';
    this.say('Roller door cleared. The dock is open again.', 'good');
    this.note(`A ute clipped the roller door: ${def.trips} loads to the skip and the dock blocked for ${mins} min.`, 0, 3);
    return true;
  }

  /** The inspector's here and waiting to be shown round. */
  get inspectorWaiting(): boolean { return this.rare?.id === 'council' && this.rare.phase === 'live' && !this.rare.touring; }
  get inspectorTouring(): boolean { return this.rare?.id === 'council' && this.rare.phase === 'live' && !!this.rare.touring; }

  /** Stop the machine and start walking them round. */
  showCouncilRound(): boolean {
    const r = this.rare;
    if (!this.inspectorWaiting || !r || this.phase !== 'day' || !this.canAct) return false;
    r.touring = true; r.escortSec = 0;
    if (this.machine === 'cutting') { this.machine = 'paused'; r.pausedCut = true; }
    this.say('Machine off. Walking the inspector round.');
    return true;
  }

  /** Time spent with the inspector on the walk-round (the view: while you're beside them; the sim: a minute a tick). */
  escort(seconds: number) {
    const r = this.rare;
    if (!this.inspectorTouring || !r) return;
    r.escortSec = (r.escortSec ?? 0) + seconds;
    if (r.escortSec >= this.rareDef('council').tourSeconds!) this.finishCouncil(true);
  }

  private finishCouncil(walked: boolean) {
    const r = this.rare!, def = this.rareDef('council');
    const faults = [
      ...(!walked ? ['nobody showed them round'] : []),
      ...(1 - this.wear.filter > CONFIG.fire.bagFullAbove ? ['the extractor bag full'] : []),
      ...(this.extinguisherAway || this.fireResponse !== null ? ['the extinguisher off its hook'] : []),
    ];
    r.phase = 'done'; r.touring = false;
    if (r.pausedCut && this.machine === 'paused' && this.current && !this.replacing && !this.powerTripped) this.machine = 'cutting';
    if (faults.length) {
      r.outcome = 'fined';
      this.spend(def.penalty, 'fees', 'council fine');
      this.say(`The inspector wrote you up: ${faults.join(', ')}. $${def.penalty} fine.`, 'bad');
      this.note(`The council inspector found ${faults.join(' and ')}: $${def.penalty} fine.`, -def.penalty, 3);
    } else {
      r.outcome = 'passed';
      this.addRapport(def.passRapport!);
      this.say(`Inspection passed. "Tidy shop." (+${def.passRapport} rapport)`, 'good');
      this.note(`The council inspector signed you off: a clean shop, +${def.passRapport} rapport.`, 0, 3);
    }
  }

  /** The 20 sheets, all due at close in `dueDays`, at the big-job price. */
  private addBigJob(sheets: number, typeId: JobTypeId, ready?: Job[]) {
    const def = this.rareDef('bigJob');
    const t = CONFIG.jobs.types.find(x => x.id === typeId)!;
    let value = 0;
    for (const j of ready ?? this.bigJobJobs(sheets, t)) {
      value += j.price;
      this.jobs.push(j);
    }
    this.say(`Order in: the big job, ${sheets} × ${t.material}, due in ${def.dueDays} days. $${value} of work.`, 'good');
    this.bigJobAnswered(true, sheets, 'taken', value);
  }

  private bigJobJobs(sheets: number, t: JobType): Job[] {
    const def = this.rareDef('bigJob');
    const dueDay = this.dayIndex + def.dueDays!, close = CONFIG.clock.endHour * 60;
    return Array.from({ length: sheets }, (_, i) => this.makeJob(t, `BIG JOB — Hallam townhouses (${i + 1}/${sheets})`, dueDay, close, { priceMult: def.priceMult }));
  }

  private bigJobAnswered(taken: boolean, sheets: number, how: 'taken' | 'declined' | 'missed', value = 0) {
    if (this.rare?.id === 'bigJob') { this.rare.phase = 'done'; this.rare.outcome = how; }
    if (taken) this.note(`Took the big job: ${sheets} sheets, $${value} of work due in ${this.rareDef('bigJob').dueDays} days.`, value, 3);
    else this.note(how === 'declined' ? `Turned down the big job (${sheets} sheets): the board was full enough.` : `Missed the big job: ${sheets} sheets went to someone else.`, 0, 3);
  }

  // ---------- milestones (CONFIG.milestone) ----------

  hasMilestone(id: MilestoneId): boolean { return CONFIG.milestones && (this.milestones?.unlocked ?? []).includes(id); }

  /** At close: the fire-free streak and the best day, and anything they unlock. */
  private updateMilestones() {
    if (!CONFIG.milestones) return;
    const m = this.milestones, c = CONFIG.milestone;
    m.fireFreeStreak = this.today.firesSpot > 0 ? 0 : m.fireFreeStreak + 1;
    const profit = this.today.revenue - (this.today.walkIns ?? 0) - this.today.costs; // the work, not the counter's walk-ins
    m.bestDayProfit = Math.max(m.bestDayProfit, Math.round(profit));
    if (!m.unlocked.includes('sparkArrestor') && m.fireFreeStreak >= c.fireFreeDays) {
      m.unlocked.push('sparkArrestor');
      this.say(`${c.fireFreeDays} days without a fire: the upgraded extractor's in. Fewer sparks make it to the duct.`, 'good');
      this.note(`${c.fireFreeDays} days without a fire unlocked the upgraded extractor.`, 0, 2);
    }
    if (!m.unlocked.includes('secondBitRack') && profit >= c.bigDayProfit) {
      m.unlocked.push('secondBitRack');
      this.say(`Your first $${c.bigDayProfit} day: a second bit rack by the machine. Bit swaps take ${c.bitSwapMinutes} min.`, 'good');
      this.note(`Your first $${c.bigDayProfit} day ($${Math.round(profit)} profit) unlocked a second bit rack.`, Math.round(profit), 2);
    }
  }

  // ---------- customer pickup (CONFIG.pickup) ----------

  /** A seeded roll for a sheet (its own stream: the day's rng isn't touched). */
  private roll(id: number, salt: number): number {
    let h = Math.imul(this.seed ^ 0x6d2b79f5, 0x9e3779b1) ^ Math.imul(id + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  private get absNow() { return this.dayIndex * 1440 + this.minute; }
  /** The order a sheet belongs to: "Bar front — Footscray (2/3)" → "Bar front — Footscray". */
  private orderOf(j: Job) { return j.name.replace(/\s*\(\d+\/\d+\)$/, ''); }

  /** Off the machine: text the customer. They'll come lead + jitter later, or at their deadline if that's later; after
   * the cutoff, next morning. A sheet of an order whose ute's still on its way rides along with it. */
  private textCustomer(j: Job, pay: number) {
    const P = CONFIG.pickup, now = this.absNow, order = this.orderOf(j);
    const ride = this.pickups.find(p => p.status === 'waiting' && p.order === order);
    const closeOf = (abs: number) => Math.floor(abs / 1440) * 1440 + CONFIG.clock.endHour * 60;
    const morning = (day: number) => day * 1440 + P.morningHour * 60 + Math.round(this.roll(j.id, 2) * P.morningJitterMinutes);
    // the lead time, or the deadline if that's later ("by close" means they come before close)
    let due = Math.max(now + P.leadMinutes + Math.round(this.roll(j.id, 1) * P.jitterMinutes), Math.min(this.dueAt(j), closeOf(this.dueAt(j)) - P.beforeCloseMinutes));
    if (this.minute >= P.lateFromHour * 60) due = Math.max(due, morning(this.dayIndex + 1));
    if (due >= closeOf(due)) due = morning(Math.floor(due / 1440) + 1);
    if (ride) {
      ride.jobs.push(j.id); ride.pay += pay; ride.dueAt = Math.max(ride.dueAt, due);
      return;
    }
    const p: Pickup = { id: j.id, order, jobs: [j.id], pay, textedAt: now, dueAt: due, slipped: false, status: 'waiting' };
    // now and then they text back: running late
    if (this.roll(j.id, 3) < P.slipChance) {
      p.slipped = true;
      p.dueAt += P.slipMinutes[0] + Math.round(this.roll(j.id, 4) * (P.slipMinutes[1] - P.slipMinutes[0]));
      if (p.dueAt >= closeOf(p.dueAt)) p.dueAt = morning(Math.floor(p.dueAt / 1440) + 1);
    }
    this.pickups.push(p);
  }

  /** The ute's at the roller door when it's due (in working hours); the sim hands over there and then. */
  private tickPickups() {
    const now = this.absNow;
    for (const p of this.pickups) {
      if (p.status !== 'waiting' || p.dueAt > now) continue;
      p.status = 'here'; p.hereAt = now;
      this.say(`${p.order}: the customer's ute is at the roller door.`, 'good');
      if (!this.servesPickups) this.handOver(p.id);
    }
  }

  /** The utes at the roller door now. */
  get pickupsHere(): Pickup[] { return this.pickups.filter(p => p.status === 'here'); }
  /** Sheets waiting on the pallet for a ute that's at the door. */
  get sheetsHere(): number { return this.pickupsHere.reduce((s, p) => s + p.jobs.length, 0); }

  /** Hand the stack over (one pickup, or every ute at the door): paid now; the sheets come off the pallet (or the bed).
   * Returns the sheets handed over. */
  handOver(id?: number): number {
    let n = 0;
    for (const p of this.pickupsHere.filter(x => id === undefined || x.id === id)) {
      const k = p.jobs.length, fromPallet = Math.min(this.pallet, k);
      this.pallet -= fromPallet; this.bedPile = Math.max(0, this.bedPile - (k - fromPallet));
      p.status = 'done'; p.doneAt = this.absNow;
      this.today.pickups = (this.today.pickups ?? 0) + 1;
      if (p.pay > 0) this.earn(p.pay, `${p.order}: picked up`);
      n += k;
    }
    // the board only needs a few days of them
    this.pickups = this.pickups.filter(p => p.status !== 'done' || (p.doneAt ?? 0) > this.absNow - 3 * 1440);
    return n;
  }

  // ---------- walk-ins (CONFIG.economy.walkIn*) ----------

  /** On the hour: a walk-in at the roller door, if the day's tracking under the floor (or it's the regular's turn). */
  private tickWalkIns() {
    const E = CONFIG.economy, hours = E.walkInHours;
    if (!(E.walkInFloor > 0 || E.walkInPerDay > 0)) return;
    if (this.fortuneNow?.walkIns === 0) return; // a quiet week: nobody walks in either
    for (const w of this.walkIns) if (w.status === 'waiting' && this.minute >= w.minute + E.walkInWaitMinutes) { w.status = 'left'; this.say('The walk-in gave up waiting.', 'bad'); }
    const slot = hours.findIndex(h => this.minute === h * 60);
    if (slot < 0 || this.walkIns.length >= E.walkInMax) return;
    const { startHour, endHour } = CONFIG.clock;
    const under = this.today.revenue < E.walkInFloor * (this.minute / 60 - startHour) / (endHour - startHour);
    const last = slot === hours.length - 1;
    if (under || (last && this.walkIns.length === 0)) this.walkInArrives();
  }

  /** Someone at the roller door with a small job: "Can you do this today?" (public so tests can bring one). */
  walkInArrives(): WalkIn {
    const w: WalkIn = { id: this.dayIndex * 10 + this.walkIns.length + 1, minute: this.minute, status: 'waiting', paid: 0 };
    this.walkIns.push(w);
    if (!this.servesWalkIns) w.status = 'served';
    else this.say('Someone at the roller door with a small job.');
    return w;
  }

  /** You said yes: they'll be back to collect at close. */
  serveWalkIn(id: number): boolean {
    const w = this.walkIns.find(x => x.id === id);
    if (!w || w.status !== 'waiting') return false;
    w.status = 'served';
    return true;
  }

  /** Not today. */
  turnAwayWalkIn(id: number) {
    const w = this.walkIns.find(x => x.id === id);
    if (w && w.status === 'waiting') w.status = 'left';
  }

  /** At close: the floor's money (the regular's job, or a slow day topped up), shared by the walk-ins you served. */
  private settleWalkIns() {
    const E = CONFIG.economy;
    for (const w of this.walkIns) if (w.status === 'waiting') w.status = 'left';
    const served = this.walkIns.filter(w => w.status === 'served');
    if (!served.length) return;
    const due = Math.round(Math.max(E.walkInPerDay, E.walkInFloor - this.today.revenue));
    if (due <= 0) return;
    served.forEach((w, i) => { w.paid = Math.floor(due / served.length) + (i === 0 ? due % served.length : 0); });
    this.today.walkIns += due; this.today.walkInCount += served.length;
    this.earn(due, served.length > 1 ? `${served.length} walk-ins collected and paid` : 'the walk-in collected and paid');
  }

  // ---------- the story of the day ----------

  /** Something worth telling: ranked (rare events first, then milestones), then by how much money it moved. */
  private note(text: string, amount: number, rank = 1) { this.notes.push({ text, amount, rank }); }

  /** The day's biggest event or decision, and what it cost or earned. */
  private storyOfTheDay(): string {
    const d = this.today;
    const scrapped = this.jobs.filter(j => j.status === 'scrapped'); // the board only holds today's finished and ruined sheets
    const money: { text: string; amount: number; rank: number }[] = [...this.notes];
    if (scrapped.length) {
      const cost = scrapped.reduce((s, j) => s + j.materialCost, 0);
      money.push({ text: `${scrapped.length} sheet${scrapped.length > 1 ? 's' : ''} in the skip: $${cost} of board ruined.`, amount: -cost, rank: 1 });
    }
    if (d.latePayLost > 0) money.push({ text: `Late jobs cost you $${Math.round(d.latePayLost)}.`, amount: -d.latePayLost, rank: 1 });
    if (d.lostJobsValue > 0) money.push({ text: `Customers pulled $${Math.round(d.lostJobsValue)} of overdue work.`, amount: -d.lostJobsValue, rank: 1 });
    if (d.mateBeer > 0) money.push({ text: `Shouted the mates $${Math.round(d.mateBeer)} of beer.`, amount: -d.mateBeer, rank: 1 });
    if (d.sheetsDeclined > 0) money.push({ text: `Turned down ${d.sheetsDeclined} sheet${d.sheetsDeclined > 1 ? 's' : ''} to keep the board doable.`, amount: 0, rank: 0 });
    const best = money.sort((a, b) => b.rank - a.rank || Math.abs(b.amount) - Math.abs(a.amount))[0];
    if (best) return best.text;
    const profit = Math.round(d.revenue - d.costs);
    return `A quiet one: ${d.sheetsDone} sheet${d.sheetsDone === 1 ? '' : 's'} out the door, ${profit >= 0 ? `$${profit} profit` : `$${-profit} down`}.`;
  }

  knockOff() {
    if (this.phase !== 'endOfDayPrompt') return;
    this.say('Knocked off at 5.');
    this.endDay();
  }

  // ---------- after knock-off (the view's beers scene) ----------

  /** Beers at knock-off from the bought stock (gifted slabs are free and don't come through here). */
  knockOffBeers(n: number) {
    if (n <= 0) return;
    this.spend(CONFIG.beer.cost * n, 'beer');
  }

  /** A sheet off the pallet for something cut after hours (the board was paid for when it was ordered). */
  afterHoursSheet(type: JobTypeId): boolean {
    if (this.stock[type] <= 0) return false;
    const unit = this.stockValue[type] / this.stock[type];
    this.stock[type] -= 1;
    this.stockValue[type] = Math.max(0, this.stockValue[type] - unit);
    this.today.afterHours ??= 0; // a day saved before the field existed
    this.book(unit, 'afterHours');
    return true;
  }

  /** A bag of empties taken back for the container deposit. */
  refundCans(cans: number) {
    if (cans <= 0) return;
    const back = Math.round(cans * CONFIG.beer.canRefund * 100) / 100;
    this.cash += back;
    this.today.canRefund = (this.today.canRefund ?? 0) + back;
  }

  startOvertime() {
    if (this.phase !== 'endOfDayPrompt') return;
    this.overtime = true;
    this.phase = 'day';
    this.say('Overtime. Double rate. Watch yourself.', 'bad');
  }

  private endDay() {
    // unfinished sheet on the bed is lost
    if (this.current && this.current.status === 'cutting') {
      this.current.status = 'scrapped';
      this.today.sheetsScrapped += 1;
      this.typeLedger[this.current.type].scrapped += 1;
      this.say(`${this.current.name} left half-cut. Scrap.`, 'bad');
    }
    // anything still queued a full day past its due date is gone, and the word gets around
    const lost = this.queued.filter(j => this.dayIndex >= j.dueDay + CONFIG.economy.pullAfterDays);
    for (const j of lost) j.status = 'lost';
    this.today.sheetsLost = lost.length;
    this.today.lostJobsValue = (this.today.lostJobsValue || 0) + lost.reduce((s, j) => s + j.price, 0);
    this.lostYesterday = lost.length;
    if (lost.length) this.say(`${lost.length} overdue sheet${lost.length > 1 ? 's' : ''} pulled by the customer.`, 'bad');
    for (const c of [...this.callbacks]) this.loseCallback(c); // nobody rings back after knock-off
    if (this.cash < 0) { this.spend(CONFIG.economy.overdraftFeePerDay, 'overdraftFees', 'overdraft fee'); }
    const truck = this.truckOnApron;
    if (truck?.stage === 'waiting') this.driverLeaves(truck);
    else if (truck?.stage === 'unloading') {
      // the driver won't wait past knock-off: what's left goes on the pallet with the forklift
      for (const t of truck.bundles.flat()) this.addStock(truck, t);
      this.deliveries = this.deliveries.filter(x => x.id !== truck.id);
      this.say('Driver forklifted the rest onto the pallet.');
    }
    if (this.dockBlocked) { this.rare!.phase = 'done'; this.rare!.outcome = 'blocked'; this.say("Slats still in the doorway at knock-off. The landlord's handyman sorts it overnight."); }
    if (this.rare?.id === 'council' && this.rare.phase !== 'done' && this.rare.phase !== 'scheduled') this.finishCouncil(this.rare.touring === true);
    if (this.rare && this.rare.phase !== 'scheduled') this.rareLog.push({ day: this.dayIndex, id: this.rare.id, outcome: this.rare.outcome ?? 'unresolved' });
    // a ute left at the door goes home; they'll be back in the morning
    for (const p of this.pickupsHere) { p.status = 'waiting'; p.dueAt = (this.dayIndex + 1) * 1440 + CONFIG.pickup.morningHour * 60 + Math.round(this.roll(p.id, 5) * CONFIG.pickup.morningJitterMinutes); }
    // the floor on the day: the walk-ins you served come back to collect and square up
    this.settleWalkIns();
    if (CONFIG.dennis.enabled) {
      const extra = dennisRouterDay(this);
      if (extra > 0) {
        this.earn(extra, 'second router: a day of overflow work');
        const bet = this.dennis.bets.find(b => b.kind === 'secondRouter' && (b.status === 'open' || b.status === 'won') && (b.until ?? -1) >= this.dayIndex);
        if (bet) bet.net += extra;
      }
      this.dennis.ringing = null; this.dennis.call = null; this.dennis.pitched = null;
    }
    this.updateMilestones();
    this.story = this.storyOfTheDay();
    this.fault = null; this.current = null; this.machine = 'idle'; this.busy = null; this.distractions = []; this.powerTripped = false;
    this.fire = null; this.fireResponse = null; this.spraying = false;
    const ply = this.plyOnHand;
    this.today.plyOnHandValue = Math.round(ply.value);
    this.today.plyOnHandSheets = ply.sheets;
    this.phase = 'daySummary';
  }

  buyUpgrade(id: UpgradeId): boolean {
    if (this.phase !== 'daySummary' || this.upgrades.has(id)) return false;
    const u = CONFIG.upgrades.find(x => x.id === id)!;
    if (this.cash < u.cost) return false;
    this.spend(u.cost, 'upgrades', u.name);
    this.upgrades.add(id);
    return true;
  }

  nextDay() {
    if (this.phase !== 'daySummary') return;
    this.week.push(this.today);
    if (this.day >= CONFIG.week.days) {
      const rent = Math.round(CONFIG.economy.weeklyOverheads * (CONFIG.dennis.enabled ? dennisRentMult(this) : 1));
      this.cash -= rent;
      this.weekOverheads = rent;
      const lease = CONFIG.dennis.enabled && rent < CONFIG.economy.weeklyOverheads ? this.dennis.bets.find(b => b.kind === 'longerLease' && b.status === 'won') : undefined;
      if (lease) lease.net += CONFIG.economy.weeklyOverheads - rent;
      this.phase = 'weekSummary';
      return;
    }
    this.day += 1;
    this.dayIndex += 1;
    this.startDay();
  }

  nextWeek() {
    if (this.phase !== 'weekSummary') return;
    this.week = [];
    this.weekOverheads = 0;
    this.day = 1;
    this.dayIndex += 1;
    this.startDay();
  }
}

/** The default layout: changes nothing. */
export const NEUTRAL_LAYOUT: LayoutEffects = {
  loadMinutes: 0, stackMinutes: 0, unloadTripMinutes: 0, filterMinutes: 0, bitMinutes: 0, fireWalkMinutes: 0, drainMinutes: 0, binTripMinutes: 0,
  binFillMult: 1, extractionFaultMult: 1, chipMult: 1, fireSpreadMult: 1, walkMult: 1, powerTripPerMinute: 0, beerTemptation: 1, switchboardMinutes: 1,
};
