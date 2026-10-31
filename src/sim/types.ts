import type { CONFIG, ConsumableKey, JobTypeId, UpgradeId } from '../config.js';

export type MachineState = 'idle' | 'loading' | 'cutting' | 'paused' | 'fault' | 'estop' | 'fire' | 'down';

/** A fire in the exhaust duct. Spot fire first; left alone it becomes a duct fire, then an extractor fire. */
export interface Fire {
  id: number;
  stage: 'spot' | 'duct';
  minutes: number;        // since it started
  sprayed: number;        // minutes of spraying so far
  heat: number;           // how far it's spread: full-rate minutes (grows at the day's breakdown rate)
  lesson?: boolean;       // the scripted teaching fire (CONFIG.fire.lesson): glows from the start, spreads slower
}

/** You, dealing with a fire: walk to the extinguisher, grab it, walk to the duct, spray, walk it back. */
export interface FireResponse {
  step: 'toExtinguisher' | 'grab' | 'toDuct' | 'atDuct' | 'returning';
  remaining: number;      // minutes left in a walking step (unused at the duct — you're holding E)
}

export type JobStatus = 'queued' | 'cutting' | 'done' | 'scrapped' | 'lost';

export interface Job {
  id: number;
  name: string;
  material: string;
  materialCost: number;
  price: number;
  cutMinutes: number;
  deadlineMinute: number; // minutes since midnight on dueDay
  dueDay: number;         // Game.dayIndex the job is due on (jobs carry over between days)
  progress: number;       // minutes cut
  status: JobStatus;
  paidLate: boolean;
  chipRisk: number;
  type: JobTypeId;
  /** Cut with the wrong bit for its board (the view's bit rack): it comes off the machine a reject. */
  rough?: boolean;
  /** Chores (CONFIG.chore): this sheet will shift (clamps left off) or lift (compressor not drained) at this many minutes in… */
  ruin?: { by: 'shift' | 'lift'; at: number };
  /** …and it did: ruined. */
  ruinedBy?: 'shift' | 'lift';
}

/** An order call's sheets before you say yes (Game.previewOrder). */
export interface OrderPreview { jobs: Job[]; kind: 'today' | 'tomorrow' | 'rush'; label: string }

export interface FaultStep {
  label: string;
  minutes: number;
  cost: number;
}

export interface FixPath {
  id: string;
  label: string;
  steps: FaultStep[];
  requiresUpgrade?: UpgradeId;
  slowsJobBy?: number; // fraction added to remaining cut time (e.g. 0.1)
}

export interface Diagnosis {
  id: string;
  label: string;
  correct: boolean;
}

export interface FaultDef {
  id: string;
  name: string;
  symptom: string;
  weight: number;
  consumable?: ConsumableKey;   // which consumable's wear raises this fault's odds
  restores?: ConsumableKey;     // fixing it restores this consumable
  onlyAtJobStart?: boolean;
  scrapAfterMinutes: number;    // neglect it this long and the sheet is scrapped
  diagnoses: Diagnosis[];
  paths: FixPath[];
}

export type FaultPhase = 'diagnose' | 'wrongCall' | 'choosePath' | 'step' | 'working';

export interface ActiveFault {
  def: FaultDef;
  phase: FaultPhase;
  minutesOpen: number;          // minutes of neglect (not counted while a fix step is running)
  triedDiagnoses: string[];
  busyRemaining: number;
  busyLabel: string;
  path?: FixPath;
  stepIndex: number;
  sheetScrapped: boolean;
  redo?: boolean;         // the last go at this step was fumbled: doing it again costs time, not parts
}

export type DistractionKind = 'friend' | 'phone' | 'courier' | 'bank';

export interface Distraction {
  id: number;
  kind: DistractionKind;
  title: string;
  line: string;
  remaining: number;      // friend: minutes left of the visit. others: response window.
  engaged: boolean;       // friend: you're having a yarn (attention split)
  order?: number;         // phone: sheets in the order this call is bringing, if it's an order call
  orderType?: JobTypeId;  // phone: what kind of job the order is
  customer?: string;      // phone: who's calling with the order
  big?: boolean;          // phone: the big-job call (a rare event)
  preview?: OrderPreview; // phone: the sheets on offer, once you've picked up (Game.previewOrder)
  // friend: a mate visiting (CONFIG.visitors)
  mate?: string;          // which mate (src/data/mates.ts)
  ask?: VisitorAsk | null; // what they've come up to you to say; null while they wander
  chat?: number;          // minutes left of the yarn they're having with you
  cooldown?: number;      // minutes until they come up to you again
  beers?: number;         // beers from your fridge this visit
  lastLine?: string;      // the last thing they said (never twice running)
  told?: number[];        // stories told this visit
  approaches?: number;    // times they've come up to you this visit
  /** Where they're mooching about: an area, a 0..1 pick of a spot in it (the view turns it into a place), minutes left there. */
  wander?: { area: VisitorArea; spot: number; left: number };
}

export type VisitorArea = (typeof CONFIG.visitors.areas)[number];

/** A mate at your elbow: an ask (a beer, or a cuppa/yarn), shop talk or a story. `left`: minutes they'll wait for an answer. */
export interface VisitorAsk { kind: 'beer' | 'cuppa' | 'shop' | 'story'; text: string; left: number }

/**
 * A ply order on its way. 'due': not here yet. 'waiting': the truck's on the apron for a signature.
 * 'unloading': signed; bundles still on the truck. Each bundle is a list of sheets (by job type).
 */
export interface Delivery {
  id: number;
  lines: { type: JobTypeId; qty: number; unitCost: number }[]; // unitCost: what each sheet cost, carried onto the pallet
  day: number;            // Game.dayIndex it arrives
  minute: number;         // minutes since midnight it arrives
  stage: 'due' | 'waiting' | 'unloading';
  signBy: number;         // minute the driver gives up (while waiting)
  bundles: JobTypeId[][]; // still on the truck (while unloading)
  fee: number;            // this order's delivery fee (0 on a big order)
  feeOwed: boolean;       // a redelivery: the fee is charged again when it turns up
}

/** A can of beer: in your hand (being drunk) or put down somewhere, with what's left in it. */
export interface Can {
  id: number;
  fill: number;            // 1 full … 0 empty
  held: boolean;
  downSince: number | null; // minute it was put down (today)
  warm: boolean;           // left down too long
  drunkMinutes: number;    // minutes of drinking so far (for the sips)
  yuck: boolean;           // already pulled a face at this warm can
}

/** An order call that rang out: they left a voicemail and will wait this long for you to ring back. */
export interface Callback {
  id: number;
  customer: string;
  sheets: number;
  orderType: JobTypeId;
  expiresMinute: number;  // minutes since midnight today; after this they've gone elsewhere
  big?: boolean;          // the big job (a rare event)
}

/**
 * Today's rare event (CONFIG.rareEvent), from the morning roll to done. 'scheduled' → 'tell' (its cue, `tell.seconds`
 * before) → 'live' (it's landed; resolve it in the shed) → 'done' (with `outcome` for the story of the day).
 */
export interface RareEventState {
  id: RareEventId;
  at: number;             // minute it lands
  phase: 'scheduled' | 'tell' | 'live' | 'done';
  outcome?: string;
  // council
  waitLeft?: number;      // minutes they'll still wait to be shown round
  touring?: boolean;      // you're walking them round
  escortSec?: number;     // seconds of the walk-round done, staying with them
  pausedCut?: boolean;    // the sheet that was cutting when you stopped the machine for them
  // ute
  tripsLeft?: number;     // loads of slats still to go to the skip; the dock's blocked until 0
  blockedAt?: number;     // minute the dock was blocked
}
export type RareEventId = 'council' | 'bigJob' | 'uteClip';

/** Milestones (CONFIG.milestone): streaks that unlock things for good, saved with the game. */
export interface MilestoneState {
  fireFreeStreak: number;   // days running without a fire
  bestDayProfit: number;    // best day's operating profit so far
  unlocked: MilestoneId[];
}
export type MilestoneId = 'sparkArrestor' | 'secondBitRack';

/** Someone at the roller door with a small job (Game.walkIns). Which design it is is the world's business. */
export interface WalkIn { id: number; minute: number; status: 'waiting' | 'served' | 'left'; paid: number }

export interface DayStats {
  day: number;
  revenue: number;
  costs: number;
  materials: number;
  labour: number;
  consumables: number;
  fixes: number;
  beer: number;
  fees: number;
  upgrades: number;
  sheetsDone: number;
  sheetsLate: number;
  sheetsScrapped: number;
  sheetsDemanded: number;  // sheets offered today: 7am board, order calls (answered or not), drop-off, rush
  sheetsMissed: number;    // order calls that rang out and weren't called back in time
  sheetsDeclined: number;  // order calls answered and turned down (no reputation cost)
  sheetsLost: number;
  latePayLost: number;    // $ kept back on sheets paid late
  lostJobsValue: number;  // $ of work pulled by customers (overdue a full day)      // carried-over jobs not delivered by close the day after they were due
  stockOutMinutes: number; // minutes the bed sat empty with work queued but none of it in stock
  deliveryFees: number;    // ply delivery (and redelivery) fees
  overdraftFees: number;   // a day that closed overdrawn
  mateBeer: number;        // beers your mates had from your fridge
  trucks: number;          // ply trucks that turned up (redeliveries included)
  plyOnHandValue: number;  // at close: what the ply on the pallet (and in hand) cost — an asset, not a cost
  plyOnHandSheets: number;
  fumbles: number;         // steps that had to be redone (beer)
  looTrips: number;
  beers: number;
  firesSpot: number;       // spot fires started
  firesDuct: number;       // spot fires that became duct fires
  firesExtractor: number;  // fires that reached the extractor
  faults: number;
  wrongCalls: number;
  // chores (CONFIG.chore)
  sheetsShifted: number;   // ruined: clamps left off
  sheetsLifted: number;    // ruined: the compressor wasn't drained
  choreBoards: number;     // what those ruined boards cost
  walkInCount: number;     // walk-ins served (paid at close)
  walkIns: number;         // the counter's walk-ins (the day's floor): not counted toward a best day
  binOverflows: number;    // times the offcut bin spilled onto the floor
  // after 5 (the view's knock-off beers, src/people): never touched by the balance sim
  afterHours: number;      // boards used cutting things for fun after knock-off
  canRefund: number;       // container deposit back on bags of empties (income, not revenue)
  layoutMinutes: number;   // minutes the layout cost today: shoving things round, longer walks than the default
  bets: number;            // Dennis's bets: what they cost and lost today (their wins are revenue)
  coffee: number;          // the cafe on the way in
}

/**
 * What the factory's layout does (src/world/layoutPlan.ts measures a plan and works these out). Minutes are added to
 * walks Game times itself (the sim's walks; the 3D world really walks them instead); the rest apply everywhere. The
 * default layout's effects are all zero / one: it plays exactly as the game did before layouts.
 */
export interface LayoutEffects {
  loadMinutes: number; stackMinutes: number; unloadTripMinutes: number; filterMinutes: number; bitMinutes: number;
  fireWalkMinutes: number; drainMinutes: number; binTripMinutes: number;
  binFillMult: number; extractionFaultMult: number; chipMult: number; fireSpreadMult: number; walkMult: number;
  powerTripPerMinute: number; beerTemptation: number; switchboardMinutes: number;
}

export interface LogEntry {
  dayIndex: number;
  minute: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'money';
}
