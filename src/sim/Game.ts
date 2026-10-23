import { CONFIG, type ConsumableKey, type UpgradeId } from '../config.js';
import { FAULTS } from '../data/faults.js';
import { Rng } from './rng.js';
import type {
  ActiveFault, DayStats, Distraction, DistractionKind, FaultDef, FixPath, Job, LogEntry, MachineState,
} from './types.js';

export type Phase = 'day' | 'endOfDayPrompt' | 'daySummary' | 'weekSummary';

const JOB_NAMES = [
  'Kitchen carcasses — Thornbury', 'Drawer fronts — Brunswick reno', 'Wardrobe doors — Kew',
  'Laundry cabinets — Preston', 'TV unit — Fitzroy North', 'Vanity — Northcote', 'Pantry — Coburg',
  'Shop fit-out panels — Collingwood', 'Bookcase — Malvern East', 'Island bench — Thomastown joiner',
  'Office pods — Richmond', 'Bar front — Footscray',
];

function emptyStats(day: number): DayStats {
  return {
    day, revenue: 0, costs: 0, materials: 0, labour: 0, consumables: 0, fixes: 0, beer: 0, fees: 0,
    upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, sheetsDemanded: 0, sheetsMissed: 0, sheetsLost: 0,
    beers: 0, faults: 0, wrongCalls: 0,
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

  // consumables 0..1 (1 = fresh)
  wear: Record<ConsumableKey, number> = { bit: 1, spoilboard: 1, filter: 1 };
  replacing: { key: ConsumableKey; remaining: number } | null = null;

  // people
  distractions: Distraction[] = [];
  busy: { label: string; remaining: number } | null = null; // on the phone etc.
  nextDistractionId = 1;

  // competence
  competence: number = CONFIG.competence.start;
  beersToday = 0;

  upgrades = new Set<UpgradeId>();
  log: LogEntry[] = [];
  private nextJobId = 1;

  constructor(seed?: number) {
    this.rng = new Rng(seed);
    this.startDay();
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
  get canAct(): boolean { return this.busy === null; }
  get fridgeOpen(): boolean { return this.hour >= CONFIG.competence.fridgeUnlockHour; }
  get queued(): Job[] { return this.jobs.filter(j => j.status === 'queued'); }

  formatTime(m = this.minute): string {
    const h = Math.floor(m / 60), mm = Math.floor(m % 60);
    const ap = h >= 12 ? 'pm' : 'am';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${mm.toString().padStart(2, '0')}${ap}`;
  }

  private say(text: string, tone: LogEntry['tone'] = 'info') {
    this.log.push({ minute: this.minute, text, tone });
    if (this.log.length > 200) this.log.shift();
  }

  private spend(amount: number, bucket: keyof DayStats, note?: string) {
    if (amount <= 0) return;
    this.cash -= amount;
    if (bucket !== 'upgrades') this.today.costs += amount; // capex stays out of operating margin
    (this.today as unknown as Record<string, number>)[bucket] += amount;
    if (note) this.say(`-$${amount.toFixed(0)} ${note}`, 'money');
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
    return m;
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
    this.rushJobsToday = 0;
    this.competence = Math.min(CONFIG.competence.max, this.competence + CONFIG.competence.sleepRecovery);
    this.distractions = [];
    this.busy = null;
    this.fault = null;
    this.current = null;
    this.machine = 'idle';
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

  /** The queued sheet that's due soonest — what "Load sheet & run" will put on the bed. */
  nextUp(): Job | undefined { return this.queued.sort((a, b) => this.dueAt(a) - this.dueAt(b))[0]; }

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
      const mat = this.rng.pick(CONFIG.materials);
      const cut = this.rng.int(CONFIG.jobs.cutMinutesMin, CONFIG.jobs.cutMinutesMax);
      const cost = Math.round(mat.cost * this.materialMult());
      const price = this.priceFor(mat.cost, cut);
      jobs.push({
        id: this.nextJobId++,
        name: names[i % names.length],
        material: mat.name,
        materialCost: cost,
        price,
        cutMinutes: cut,
        deadlineMinute: Math.round(first + gap * i),
        dueDay: this.dayIndex,
        progress: 0,
        status: 'queued',
        paidLate: false,
        chipRisk: mat.chipRisk,
      });
    }
    return jobs;
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

    // you, busy
    if (this.busy) {
      this.busy.remaining -= 1;
      if (this.busy.remaining <= 0) { this.say(`Done: ${this.busy.label}`); this.busy = null; }
    }

    // replacing a consumable
    if (this.replacing) {
      this.replacing.remaining -= 1;
      if (this.replacing.remaining <= 0) {
        this.wear[this.replacing.key] = 1;
        this.say(`New ${this.replacing.key} fitted.`, 'good');
        this.replacing = null;
        if (this.machine === 'paused' && this.current) this.machine = 'cutting';
      }
    }

    // machine
    if (this.machine === 'loading') {
      this.loadingRemaining -= 1;
      if (this.loadingRemaining <= 0) {
        this.machine = 'cutting';
        this.say(`Cutting: ${this.current!.name}`);
        this.maybeFault(true);
      }
    } else if (this.machine === 'cutting' && this.current) {
      this.current.progress += 1;
      this.wearConsumables();
      if (this.current.progress >= this.current.cutMinutes) this.finishJob();
      else this.maybeFault(false);
    }

    // fault timers
    if (this.fault) this.tickFault();

    // people
    this.tickDistractions();
    this.maybeDistraction();
    while (this.orderCalls.length && this.minute >= this.orderCalls[0].minute) {
      this.spawnOrderCall(this.orderCalls.shift()!.sheets);
    }

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
    const filterMult = this.upgrades.has('extractor') ? this.upgradeEffect('extractor') : 1;
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
  }

  private tickFault() {
    const f = this.fault!;
    // Neglect clock: runs whenever you're not actively working the fix.
    if (f.phase !== 'working') f.minutesOpen += 1;
    if (f.phase === 'wrongCall' || f.phase === 'working') {
      f.busyRemaining -= 1;
      if (f.busyRemaining <= 0) {
        if (f.phase === 'wrongCall') {
          f.phase = 'diagnose';
          this.say("Nope. That wasn't it.", 'bad');
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
    if (this.current && this.current.status === 'cutting') {
      this.machine = 'cutting';
    } else {
      this.machine = 'idle';
      this.current = null;
    }
  }

  private scrapCurrent(reason: string) {
    if (!this.current) return;
    this.current.status = 'scrapped';
    this.today.sheetsScrapped += 1;
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
        if (this.beersToday > 0) dur = Math.round(dur * CONFIG.competence.beerFriendDurationMult);
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
    this.today.sheetsDemanded += sheets;
    this.distractions.push({
      id: this.nextDistractionId++, kind: 'phone', title: 'Phone ringing — new order',
      line: `A joiner with ${sheets} sheet${sheets > 1 ? 's' : ''} to cut.`,
      remaining: CONFIG.distractions.phone.window, engaged: false, hover: 0, order: sheets,
    });
    this.say('Phone ringing — new order', 'info');
  }

  private addOrder(sheets: number) {
    const o = CONFIG.jobs.orders;
    const name = this.rng.pick(JOB_NAMES);
    const mat = this.rng.pick(CONFIG.materials);
    const kind = this.rng.weighted(['today', 'tomorrow', 'rush'] as const, k => o.deadlineMix[k])!;
    const close = CONFIG.clock.endHour * 60;
    const due = kind === 'rush' ? { day: this.dayIndex, minute: this.minute + o.rushMinutes }
      : { day: this.dayIndex + (kind === 'tomorrow' ? 1 : 0), minute: close };
    const label = kind === 'rush' ? `RUSH — ${name}` : name;
    const priceMult = kind === 'rush' ? CONFIG.jobs.rush.priceMult : 1;
    for (let i = 0; i < sheets; i++) {
      const cut = this.rng.int(CONFIG.jobs.cutMinutesMin, CONFIG.jobs.cutMinutesMax);
      this.jobs.push({
        id: this.nextJobId++,
        name: sheets > 1 ? `${label} (${i + 1}/${sheets})` : label,
        material: mat.name,
        materialCost: Math.round(mat.cost * this.materialMult()),
        price: Math.round(this.priceFor(mat.cost, cut) * priceMult),
        cutMinutes: cut,
        deadlineMinute: due.minute, dueDay: due.day,
        progress: 0, status: 'queued', paidLate: false, chipRisk: mat.chipRisk,
      });
    }
    const when = kind === 'tomorrow' ? `tomorrow ${this.formatTime(close)}` : this.formatTime(due.minute);
    this.say(`Order in: ${label}, ${sheets} × ${mat.name}, due ${when}.`, kind === 'rush' ? 'bad' : 'good');
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
          if (dist.order && this.rng.chance(CONFIG.jobs.orders.missedKeepChance)) {
            this.say('Missed the call, but they left a message.');
            this.addOrder(dist.order);
          } else {
            this.addRapport(-d.phone.ignoreRapportCost);
            if (dist.order) this.today.sheetsMissed += dist.order;
            this.say(`Missed the call. ${dist.order ? `${dist.order}-sheet order went` : 'They went'} elsewhere.`, 'bad');
          }
          break;
        case 'courier': this.courierPenaltyPending = true; this.say('Courier left. Re-delivery fee on the next sheet.', 'bad'); break;
        case 'bank': this.addRapport(-d.bank.ignoreRapportCost); this.spend(CONFIG.economy.bankFee, 'fees', 'dishonour fee'); break;
      }
    }
  }

  private removeDistraction(id: number) {
    this.distractions = this.distractions.filter(x => x.id !== id);
  }

  // ---------- player actions ----------

  loadNextSheet(): boolean {
    if (this.phase !== 'day' || !this.canAct || this.machine !== 'idle' || this.fault) return false;
    const next = this.nextUp();
    if (!next) return false;
    next.status = 'cutting';
    this.current = next;
    let cost = next.materialCost;
    if (this.courierPenaltyPending) {
      cost = Math.round(cost * (1 + CONFIG.distractions.courier.ignoredMaterialPenalty));
      this.courierPenaltyPending = false;
    }
    this.spend(cost, 'materials', `board for ${next.name}`);
    this.machine = 'loading';
    this.loadingRemaining = Math.ceil(CONFIG.jobs.loadMinutes * this.stepDurationMult());
    this.say(`Loading ${next.material}...`);
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
    if (step.cost > 0) this.spend(step.cost, 'fixes', step.label.toLowerCase());
    f.phase = 'working';
    f.busyLabel = step.label;
    f.busyRemaining = Math.max(1, Math.ceil(step.minutes * this.stepDurationMult()));
    this.say(`${step.label} (${f.busyRemaining} min)`);
    return true;
  }

  replaceConsumable(key: ConsumableKey): boolean {
    if (this.phase !== 'day' || !this.canAct || this.replacing || this.fault) return false;
    if (this.machine === 'loading') return false;
    const c = CONFIG.consumables[key];
    this.spend(c.replaceCost, 'consumables', `new ${key}`);
    this.replacing = { key, remaining: Math.ceil(c.replaceMinutes * this.stepDurationMult()) };
    if (this.machine === 'cutting') this.machine = 'paused';
    this.say(`Swapping ${key} (${this.replacing.remaining} min)`);
    return true;
  }

  respond(id: number, action: 'chat' | 'disengage' | 'answer' | 'sign'): boolean {
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
        this.addRapport(d.phone.answerRapportGain);
        if (dist.order) this.addOrder(dist.order);
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
    const mat = this.rng.pick(CONFIG.materials);
    const cut = this.rng.int(CONFIG.jobs.cutMinutesMin, CONFIG.jobs.cutMinutesMax - r.cutMinutesLess);
    const j: Job = {
      id: this.nextJobId++,
      name: `RUSH — ${this.rng.pick(JOB_NAMES)}`,
      material: mat.name,
      materialCost: Math.round(mat.cost * this.materialMult()),
      price: Math.round(this.priceFor(mat.cost, cut) * r.priceMult),
      cutMinutes: cut,
      deadlineMinute: this.minute + cut + r.deadlineSlackMinutes, dueDay: this.dayIndex,
      progress: 0, status: 'queued', paidLate: false, chipRisk: mat.chipRisk,
    };
    this.jobs.push(j);
    this.today.sheetsDemanded += 1;
    this.rushJobsToday += 1;
    this.say(`Rush job added: ${j.name} ($${j.price})`, 'good');
  }

  private addLateDrop() {
    const mat = this.rng.pick(CONFIG.materials);
    const cut = this.rng.int(CONFIG.jobs.cutMinutesMin, CONFIG.jobs.cutMinutesMax);
    const j: Job = {
      id: this.nextJobId++,
      name: `DROP-OFF — ${this.rng.pick(JOB_NAMES)}`,
      material: mat.name,
      materialCost: Math.round(mat.cost * this.materialMult()),
      price: Math.round(this.priceFor(mat.cost, cut) * CONFIG.jobs.lateDrop.priceMult),
      cutMinutes: cut,
      deadlineMinute: CONFIG.clock.overtimeEndHour * 60, dueDay: this.dayIndex,
      progress: 0, status: 'queued', paidLate: false, chipRisk: mat.chipRisk,
    };
    this.jobs.push(j);
    this.today.sheetsDemanded += 1;
    this.say(`A joiner dropped off ${j.material}: ${j.name}. $${j.price} if it's cut tonight.`, 'good');
  }

  drinkBeer(): boolean {
    if (this.phase !== 'day' || !this.fridgeOpen || !this.canAct) return false;
    this.spend(CONFIG.competence.beerCost, 'beer', 'beer');
    this.beersToday += 1;
    this.today.beers += 1;
    this.competence = Math.max(0, this.competence - CONFIG.competence.beerPenalty);
    this.say(this.beersToday === 1 ? 'Cold one. Well earned.' : `Beer #${this.beersToday}. Things feel… fine.`);
    return true;
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
      this.say(`${this.current.name} left half-cut. Scrap.`, 'bad');
    }
    // anything still queued a full day past its due date is gone, and the word gets around
    const lost = this.queued.filter(j => this.dayIndex >= j.dueDay + 1);
    for (const j of lost) j.status = 'lost';
    this.today.sheetsLost = lost.length;
    this.lostYesterday = lost.length;
    if (lost.length) this.say(`${lost.length} overdue sheet${lost.length > 1 ? 's' : ''} pulled by the customer.`, 'bad');
    this.fault = null; this.current = null; this.machine = 'idle'; this.busy = null; this.distractions = [];
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
