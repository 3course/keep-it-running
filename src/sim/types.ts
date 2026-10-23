import type { ConsumableKey, UpgradeId } from '../config.js';

export type MachineState = 'idle' | 'loading' | 'cutting' | 'paused' | 'fault' | 'estop';

export type JobStatus = 'queued' | 'cutting' | 'done' | 'scrapped';

export interface Job {
  id: number;
  name: string;
  material: string;
  materialCost: number;
  price: number;
  cutMinutes: number;
  deadlineMinute: number; // minutes since midnight
  progress: number;       // minutes cut
  status: JobStatus;
  paidLate: boolean;
  chipRisk: number;
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
  beers: number;
  faults: number;
  wrongCalls: number;
}

export interface LogEntry {
  minute: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'money';
}
