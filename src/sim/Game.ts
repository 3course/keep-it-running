import { CONFIG, type ConsumableKey, type JobType, type JobTypeId, type UpgradeId } from '../config.js';
import { FAULTS } from '../data/faults.js';
import { Rng } from './rng.js';
import type {
  ActiveFault, Callback, Can, DayStats, Delivery, Distraction, DistractionKind, FaultDef, Fire, FireResponse, FixPath, Job, LogEntry, MachineState,
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
    upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, sheetsDemanded: 0, sheetsMissed: 0, sheetsDeclined: 0, sheetsLost: 0,
    beers: 0, firesSpot: 0, firesDuct: 0, firesExtractor: 0, faults: 0, wrongCalls: 0, stockOutMinutes: 0, fumbles: 0, looTrips: 0,
    deliveryFees: 0, overdraftFees: 0, trucks: 0, plyOnHandValue: 0, plyOnHandSheets: 0,
  };
}

export class Game {
  rng: Rng;
  phase: Phase = 'day';

  // clock
  day = 1;          // day of the week, 1..CONFIG.week.days
  dayIndex = 1;     // days since the start; never resets, so job due dates survive the week rollover
  minute = CONFIG.clock.startHour * 60; // minutes since midnight
  overtime = false;

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

  // consumables 0..1 (1 = fresh)
  wear: Record<ConsumableKey, number> = { bit: 1, spoilboard: 1, filter: 1 };
  replacing: { key: ConsumableKey; remaining: number } | null = null;

  // exhaust fire
  fire: Fire | null = null;
  fireResponse: FireResponse | null = null;
  spraying = false;            // E held (or the spray button) — set by the UI / sim each frame
  machineDown = false;         // extractor fire: nothing more cuts today
  extinguisherUsesToday = 0;
  private nextFireId = 1;

  // people
  distractions: Distraction[] = [];
  busy: { label: string; remaining: number } | null = null; // on the phone etc.
  nextDistractionId = 1;
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

  constructor(seed?: number) {
    this.rng = new Rng(seed);
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
  walkMult(): number { return (1 - this.beerSlow) * (1 - this.looSlow); }
  private walkMinutes(m: number) { return Math.ceil(m / this.walkMult()); }
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
    this.jobs = [...carried, ...fresh];
    this.today.sheetsDemanded += fresh.length;
    this.lateDropToday = this.rng.chance(CONFIG.jobs.lateDrop.chance);
    this.orderCalls = this.scheduleOrderCalls(fresh.length + (this.lateDropToday ? 1 : 0));
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
  isLate(j: Job): boolean { return this.dayIndex * 24 * 60 + this.minute > this.dueAt(j); }
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
      price: Math.round(this.priceFor(CONFIG.jobs.priceBasisBoardCost, baseCut) * t.priceMult * (opts.priceMult ?? 1)),
      cutMinutes: Math.max(1, Math.round(baseCut * t.cutMult)),
      deadlineMinute, dueDay,
      progress: 0, status: 'queued', paidLate: false, chipRisk: t.chipRisk, type: t.id,
    };
  }

  private materialMult(): number {
    return this.upgrades.has('nesting') ? this.upgradeEffect('nesting') : 1;
  }
  private upgradeEffect(id: UpgradeId): number {
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

    // you, busy
    if (this.busy) {
      this.busy.remaining -= 1;
      if (this.busy.remaining <= 0) { this.say(`Done: ${this.busy.label}`); this.busy = null; }
    }

    // replacing a consumable
    if (this.replacing) {
      this.replacing.remaining -= 1;
      if (this.replacing.remaining <= 0 && this.fumbled(`fitting the ${this.replacing.key}`)) {
        this.replacing.remaining = Math.ceil(CONFIG.consumables[this.replacing.key].replaceMinutes * this.stepDurationMult());
      } else if (this.replacing.remaining <= 0) {
        this.wear[this.replacing.key] = 1;
        this.say(`New ${this.replacing.key} fitted.`, 'good');
        this.replacing = null;
        if (this.machine === 'paused' && this.current) this.machine = 'cutting';
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
      if (this.current.progress >= this.current.cutMinutes) this.finishJob();
      else this.maybeFault(false);
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
    this.wear.bit = Math.max(0, this.wear.bit - c.bit.wearPerMinute * (this.current?.chipRisk ?? 1));
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
    // a dull bit fuzzes most boards, but melts acrylic: the sheet's gone before you can do anything
    if (def.id === 'chipping' && this.current && this.jobType(this.current).dullBitRuinsSheet) {
      this.fault.sheetScrapped = true;
      this.scrapCurrent(`Dull bit melted the edge on ${this.current.material} — ${this.current.name} is scrap.`);
    }
  }

  private tickFault() {
    const f = this.fault!;
    // Neglect clock: runs whenever you're not actively working the fix — including while you're off at a fire.
    const away = this.fireResponse !== null;
    if (f.phase !== 'working' || away) f.minutesOpen += 1;
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
    return p;
  }

  private maybeFire() {
    if (this.fire || this.machineDown || this.machine !== 'cutting') return;
    if (!this.rng.chance(this.fireChance())) return;
    // no alarm and no log line: the smoke at the duct and the to-do list are the only tells
    this.fire = { id: this.nextFireId++, stage: 'spot', minutes: 0, sprayed: 0 };
    this.today.firesSpot += 1;
  }

  /** Go and deal with the fire: walk to the extinguisher, grab it and carry it to the duct. */
  fightFire(): boolean {
    if (this.phase !== 'day' || !this.fire || !this.canAct) return false;
    this.fireResponse = { step: 'toExtinguisher', remaining: this.walkMinutes(CONFIG.fire.walkToExtinguisherMinutes) };
    return true;
  }

  /** Is the extinguisher pointed at the fire? Set every frame from E / the spray button. */
  setSpraying(held: boolean) { this.spraying = held; }

  private tickFire() {
    const c = CONFIG.fire;
    const r = this.fireResponse;
    if (r && r.step !== 'atDuct') {
      r.remaining -= 1;
      if (r.remaining <= 0) {
        if (r.step === 'toExtinguisher') { r.step = 'grab'; r.remaining = c.grabMinutes; }
        else if (r.step === 'grab') { r.step = 'toDuct'; r.remaining = this.walkMinutes(c.walkToDuctMinutes); }
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
    if (f.stage === 'spot' && f.minutes >= c.ductFireAfterMinutes) {
      f.stage = 'duct';
      this.today.firesDuct += 1;
      if (!this.fault) this.machine = 'fire';
      this.say('Flames in the duct. The cut has stopped.', 'bad');
    } else if (f.stage === 'duct' && f.minutes >= c.extractorFireAfterMinutes) {
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
    this.fireResponse = { step: 'returning', remaining: this.walkMinutes(c.walkBackMinutes) };
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
    this.fault = null;
    if (this.current && this.current.status === 'cutting') this.scrapCurrent(`${this.current.name} is ruined.`);
    this.current = null;
    this.machine = 'down';
    // if you were already carrying the extinguisher, carry it back
    if (this.fireResponse) {
      this.fireResponse = this.fireResponse.step === 'toExtinguisher' ? null : { step: 'returning', remaining: c.walkBackMinutes };
    }
  }

  private scrapCurrent(reason: string) {
    if (!this.current) return;
    this.current.status = 'scrapped';
    this.today.sheetsScrapped += 1;
    this.typeLedger[this.current.type].scrapped += 1;
    this.say(`${reason} $${this.current.materialCost} of ${this.current.material} in the skip.`, 'bad');
    // the fault still needs fixing, but there's no job to resume
    if (!this.fault) { this.current = null; this.machine = 'idle'; }
  }

  private finishJob() {
    const j = this.current!;
    j.status = 'done';
    const late = this.isLate(j);
    j.paidLate = late;
    const pay = Math.round(late ? j.price * CONFIG.economy.latePayFraction : j.price);
    this.today.sheetsDone += 1;
    if (late) this.today.sheetsLate += 1;
    this.typeLedger[j.type].revenue += pay;
    this.typeLedger[j.type].cut += 1;
    this.earn(pay, `${j.name}${late ? ` (late, ${Math.round(CONFIG.economy.latePayFraction * 100)}%)` : ''}`);
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
        const who = this.rng.pick(['Macca', 'Jules', 'Big Tony', 'Sal from next door', 'Your brother-in-law']);
        let dur = this.rng.int(d.friend.durationMin, d.friend.durationMax);
        if (this.beersToday > 0) dur = Math.round(dur * CONFIG.beer.friendDurationMult);
        dist = { id, kind, title: `${who} wandered in`, line: '"Mate. Got a sec?"', remaining: dur, engaged: false, hover: d.friend.hoverMinutes };
        break;
      }
      case 'phone':
        dist = { id, kind, title: 'Phone ringing', line: 'A customer. Could be a quote.', remaining: d.phone.window, engaged: false, hover: 0 };
        break;
      case 'courier':
        dist = { id, kind, title: 'Courier at the door', line: 'Board delivery. Needs a signature.', remaining: d.courier.window, engaged: false, hover: 0 };
        break;
      case 'bank':
      default:
        dist = { id, kind, title: 'The bank is calling', line: "Overdrawn. They'd like a word.", remaining: d.bank.window, engaged: false, hover: 0 };
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
      remaining: CONFIG.distractions.phone.window, engaged: false, hover: 0, order: sheets, orderType: t.id,
      customer: this.rng.pick(CUSTOMERS),
    });
    this.say(`Phone ringing — ${t.name.toLowerCase()} order, ${sheets} × ${t.material}`, 'info');
  }

  private addOrder(sheets: number, typeId: JobTypeId) {
    const o = CONFIG.jobs.orders;
    const t = CONFIG.jobs.types.find(x => x.id === typeId)!;
    const name = this.rng.pick(JOB_NAMES);
    const kind = this.rng.weighted(['today', 'tomorrow', 'rush'] as const, k => o.deadlineMix[k])!;
    const close = CONFIG.clock.endHour * 60;
    const due = kind === 'rush' ? { day: this.dayIndex, minute: this.minute + o.rushMinutes }
      : { day: this.dayIndex + (kind === 'tomorrow' ? 1 : 0), minute: close };
    const label = kind === 'rush' ? `RUSH — ${name}` : name;
    const priceMult = kind === 'rush' ? CONFIG.jobs.rush.priceMult : 1;
    for (let i = 0; i < sheets; i++) {
      this.jobs.push(this.makeJob(t, sheets > 1 ? `${label} (${i + 1}/${sheets})` : label, due.day, due.minute, { priceMult }));
    }
    const when = kind === 'tomorrow' ? `tomorrow ${this.formatTime(close)}` : this.formatTime(due.minute);
    this.say(`Order in: ${label}, ${sheets} × ${t.material}, due ${when}.`, kind === 'rush' ? 'bad' : 'good');
  }

  private tickDistractions() {
    const d = CONFIG.distractions;
    for (const dist of [...this.distractions]) {
      if (dist.kind === 'friend' && !dist.engaged) {
        // hovering by the bench; after a bit they start talking regardless
        dist.hover -= 1;
        if (dist.hover <= 0) { dist.engaged = true; this.say('"...so anyway, did I tell you about the boat?"'); }
      }
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
              expiresMinute: this.minute + CONFIG.jobs.orders.callbackMinutes,
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
      return true;
    }
    this.say(`Rang ${c.customer} back.`);
    this.addOrder(c.sheets, c.orderType);
    return true;
  }

  private removeDistraction(id: number) {
    this.distractions = this.distractions.filter(x => x.id !== id);
  }

  // ---------- player actions ----------

  loadNextSheet(): boolean {
    if (this.phase !== 'day' || !this.canAct || this.machine !== 'idle' || this.fault) return false;
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
    this.loadingRemaining = Math.ceil(CONFIG.jobs.loadMinutes * this.stepDurationMult());
    this.say(`Loading ${next.material}...`);
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
    let boards = Math.round(t.boardCost * this.materialMult()) * qty;
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
    if (!d || d.stage !== 'waiting' || this.phase !== 'day' || !this.canAct) return false;
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
    if (!d || d.stage !== 'unloading' || !d.bundles.length || this.phase !== 'day' || !this.canAct) return false;
    for (const t of d.bundles.shift()!) this.addStock(d, t);
    if (!walked) this.busy = { label: 'unloading ply', remaining: this.walkMinutes(CONFIG.supply.unloadTripMinutes) };
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
      if (step.cost > 0) this.spend(step.cost, 'fixes', step.label.toLowerCase());
      if (this.current) this.typeLedger[this.current.type].fixes += step.cost;
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
    this.replacing = { key, remaining: Math.ceil(c.replaceMinutes * this.stepDurationMult()) };
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
          this.addRapport(-d.friend.disengageRapportCost);
          this.removeDistraction(id);
          this.say(`"Sorry mate, flat out." (-${d.friend.disengageRapportCost} rapport)`);
        } else if (!dist.engaged) {
          dist.engaged = true;
          this.say('"Yeah go on, what\'s up?"');
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
          return true;
        }
        this.addRapport(d.phone.answerRapportGain);
        if (dist.order) this.addOrder(dist.order, dist.orderType!);
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
    // a mate who's in, and empties all over the place: they take that as an invitation
    const mate = this.distractions.find(d => d.kind === 'friend' && !d.grabbedBeer);
    if (mate && this.emptiesAbout >= b.mateGrabsBeerAt) {
      mate.grabbedBeer = true;
      this.spend(b.cost, 'beer', 'beer');
      this.say(`${mate.title.replace(' wandered in', '')} grabbed a beer from the fridge.`, 'bad');
    }
  }

  knockOff() {
    if (this.phase !== 'endOfDayPrompt') return;
    this.say('Knocked off at 5.');
    this.endDay();
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
    const lost = this.queued.filter(j => this.dayIndex >= j.dueDay + 1);
    for (const j of lost) j.status = 'lost';
    this.today.sheetsLost = lost.length;
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
    this.fault = null; this.current = null; this.machine = 'idle'; this.busy = null; this.distractions = [];
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
      this.cash -= CONFIG.economy.weeklyOverheads;
      this.weekOverheads = CONFIG.economy.weeklyOverheads;
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
