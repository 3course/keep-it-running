import type { ConsumableKey, JobTypeId, UpgradeId } from '../config.js';

export type MachineState = 'idle' | 'loading' | 'cutting' | 'paused' | 'fault' | 'estop' | 'fire' | 'down';

/** A fire in the exhaust duct. Spot fire first; left alone it becomes a duct fire, then an extractor fire. */
export interface Fire {
  id: number;
  stage: 'spot' | 'duct';
  minutes: number;        // since it started
  sprayed: number;        // minutes of spraying so far
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
}

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
  remaining: number;      // friend: minutes they'll stay. others: response window.
  engaged: boolean;       // friend: you're chatting (attention split)
  hover: number;          // friend: minutes they hang back before starting to talk
  order?: number;         // phone: sheets in the order this call is bringing, if it's an order call
  orderType?: JobTypeId;  // phone: what kind of job the order is
  customer?: string;      // phone: who's calling with the order
  grabbedBeer?: boolean;  // friend: already had a beer from your fridge
  mate?: string;          // friend: which mate (src/data/mates.ts)
}

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
}

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
  sheetsLost: number;      // carried-over jobs not delivered by close the day after they were due
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
}

export interface LogEntry {
  dayIndex: number;
  minute: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'money';
}
