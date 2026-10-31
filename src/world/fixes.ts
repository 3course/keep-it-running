// Faults are fixed where they are, with your hands. Game keeps each fault's state (diagnose → choose a fix → its
// steps, each a few minutes of work, money and time exactly as before); this says where in the shed each part happens
// and the one-thumb gesture that starts each step. Some steps need something fetched first (a bit from the rack, a new
// extractor bag) or something done on the way (the full bag tipped in the skip). Presentation only: the balance sim
// runs the same faults without any of it.
import { CONFIG, type JobTypeId } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { ActiveFault } from '../sim/types.js';
import type { GestureSpec } from '../ui/gesture.js';
import type { ObjectId } from './layout.js';
import type { Carry, WorldState } from './state.js';

/** One fix step in the shed: where it's done, what it takes, the gesture, and what it leaves you holding. */
export interface FixStep {
  at: ObjectId;
  verb: string;           // the label (short, the gesture card itself has no words)
  gesture: GestureSpec;
  needs?: Carry;          // you have to be carrying this (fetched with fetchActions)
  bedClear?: boolean;     // a ruined sheet has to come off the bed first
  leaves?: Carry | null;  // what you're carrying afterwards (undefined: unchanged)
}

const hold = (icon: string, seconds: number): GestureSpec => ({ kind: 'hold', icon, seconds });
const taps = (icon: string, n: number): GestureSpec => ({ kind: 'taps', icon, n });
const drag = (icon: string, dir: 'up' | 'down' | 'left' | 'right'): GestureSpec => ({ kind: 'drag', icon, dir });
const resume: FixStep = { at: 'machine', verb: 'Resume', gesture: taps('▶️', 1) };

/** Where each fault is: where you read it, work out what it is and pick the fix. */
export const FAULT_AT: Record<string, ObjectId> = { extraction: 'extractor' };
export const faultAt = (f: ActiveFault): ObjectId => FAULT_AT[f.def.id] ?? 'machine';

/** Each fault's fix paths, step by step, in the order of src/data/faults.ts. */
const FIXES: Record<string, Record<string, FixStep[]>> = {
  chipping: {
    diy: [
      { at: 'machine', verb: 'Inspect the bit', gesture: hold('🔍', 1.5) },
      { at: 'machine', verb: 'Swap the bit in the collet', gesture: taps('🔧', 2), needs: 'bit', bedClear: true, leaves: null },
      { at: 'machine', verb: 'Re-zero Z', gesture: hold('📏', 2) },
      resume,
    ],
    preset: [
      { at: 'machine', verb: 'Swap the pre-set holder', gesture: taps('🔧', 2), needs: 'bit', bedClear: true, leaves: null },
      resume,
    ],
  },
  collet: {
    diy: [
      { at: 'machine', verb: 'Clean and re-seat the collet', gesture: taps('🔧', 3), bedClear: true },
      { at: 'machine', verb: 'Re-zero Z', gesture: hold('📏', 2) },
    ],
    new: [
      { at: 'machine', verb: 'Fit the new collet', gesture: taps('🔧', 2), needs: 'bit', bedClear: true, leaves: null },
      { at: 'machine', verb: 'Re-zero Z', gesture: hold('📏', 2) },
    ],
  },
  partLifted: {
    diy: [
      { at: 'machine', verb: 'Reset the E-stop', gesture: taps('🛑', 1) },
      { at: 'machine', verb: 'Clear the debris', gesture: drag('🧹', 'left') },
      { at: 'machine', verb: 'Check the vacuum gauge', gesture: hold('⏲️', 1) },
      { at: 'machine', verb: 'Skim the spoilboard', gesture: hold('🪚', 3) },
      { at: 'machine', verb: 'Tabs on, re-run', gesture: taps('▶️', 1) },
    ],
    newboard: [
      { at: 'machine', verb: 'Reset the E-stop', gesture: taps('🛑', 1) },
      { at: 'machine', verb: 'Clear the debris', gesture: drag('🧹', 'left') },
      { at: 'machine', verb: 'Lay the new spoilboard', gesture: drag('🟫', 'right') },
      { at: 'machine', verb: 'Re-run with tabs', gesture: taps('▶️', 1) },
    ],
  },
  extraction: {
    // unclip the full bag, tip it in the skip, fetch a new one from the spare bags, fit it, restart
    diy: [
      { at: 'extractor', verb: 'Unclip the bag', gesture: taps('🗜️', 2), leaves: 'bag' },
      { at: 'skip', verb: 'Tip the bag', gesture: drag('🗑️', 'down'), needs: 'bag', leaves: null },
      { at: 'extractor', verb: 'Fit the new bag', gesture: drag('🛍️', 'up'), needs: 'newBag', leaves: null },
      { at: 'extractor', verb: 'Restart', gesture: taps('🟢', 1) },
    ],
    tech: [
      { at: 'extractor', verb: 'Stop the extractor', gesture: taps('⏸️', 1) },
      { at: 'extractor', verb: 'Let the tech in', gesture: hold('🧑‍🔧', 1.5) },
    ],
  },
  spindle: {
    cool: [
      { at: 'machine', verb: 'Pause it to cool', gesture: hold('🌡️', 2) },
      { at: 'machine', verb: 'Feed down 15%, resume', gesture: drag('🎚️', 'down') },
    ],
    chiller: [
      { at: 'machine', verb: 'Top up the chiller', gesture: hold('💧', 3) },
      resume,
    ],
    swap: [
      { at: 'machine', verb: 'Swap the spindle', gesture: hold('🔧', 3) },
      resume,
    ],
  },
  wrongMaterial: {
    diy: [
      { at: 'machine', verb: 'Drag the sheet off', gesture: drag('🪵', 'left') },
      { at: 'plyPallet', verb: 'Find the right board', gesture: { kind: 'pick', icon: '🪵', options: [] } },
      { at: 'machine', verb: 'Slide it on', gesture: drag('🪵', 'right') },
      { at: 'machine', verb: 'Re-run the nest', gesture: taps('▶️', 1) },
    ],
    forklift: [
      { at: 'machine', verb: 'Wave Dave over', gesture: taps('🚜', 1) },
    ],
  },
};

/** The step you're on (or working through), if the fault's that far along. */
export function fixStep(f: ActiveFault | null, ahead = 0): FixStep | null {
  if (!f || !f.path || (f.phase !== 'step' && f.phase !== 'working')) return null;
  const i = f.stepIndex + ahead;
  if (i >= f.path.steps.length) return null;
  return FIXES[f.def.id]?.[f.path.id]?.[i] ?? { at: faultAt(f), verb: f.path.steps[i].label, gesture: hold('🔧', 2) };
}

/** Where the fault needs you next: what to fetch, the bed to clear, the step's place, or the fault itself. */
export function faultTarget(g: Game, w: WorldState): ObjectId | null {
  const f = g.fault;
  if (!f) return null;
  // while a step's being worked, head for the next one (the minutes run while you walk)
  const st = f.phase === 'working' ? fixStep(f, 1) ?? fixStep(f) : fixStep(f);
  if (!st) return faultAt(f);
  if (st.bedClear && w.bed === 'scrap') return 'machine';
  if (st.needs && w.carrying !== st.needs) return FETCH[st.needs] ?? st.at;
  return st.at;
}

/** Where a thing a step needs comes from. */
const FETCH: Partial<Record<Carry, ObjectId>> = { bit: 'bitRack', newBag: 'bags' };

/** The bit holders on the rack, one per board, colour-coded like the boards (CONFIG.jobs.types order). */
export const BIT_COLOURS: Record<JobTypeId, string> = { formwork: '#8a4f32', joinery: '#b48c62', signage: '#cfe2e8' };
const bitPick = (match: string | undefined, icon: string): GestureSpec => ({
  kind: 'pick', icon, match, options: CONFIG.jobs.types.map(t => ({ colour: BIT_COLOURS[t.id], mark: '🔩' })),
});
/** The board the sheet on the bed is (what the bit has to suit). */
const bedType = (g: Game): JobTypeId | undefined => g.current?.type;

/** A step's own action at `id`, the fetching it needs, or the ruined sheet to drag off first. */
export interface FixAction { label: string; gesture?: GestureSpec; twoHands?: boolean; run: (choice?: number) => string | void; done: string }

export function fixActions(id: ObjectId, g: Game, w: WorldState): FixAction[] {
  const f = g.fault;
  if (!f || !g.canAct || f.phase !== 'step') return [];
  const st = fixStep(f)!;
  const empty = w.carrying === null;
  // a ruined sheet's still on the bed: off it comes before anything goes in the spindle
  if (st.bedClear && w.bed === 'scrap') {
    return id === 'machine' && empty ? [{ label: 'Drag the ruined sheet off', gesture: drag('🪵', 'left'), twoHands: true, done: 'Ruined sheet off the bed',
      run: () => { w.bed = 'empty'; w.bedJobId = null; w.carrying = 'scrap'; } }] : [];
  }
  // fetch what the step needs
  if (st.needs && w.carrying !== st.needs) {
    if (st.needs === 'bit' && id === 'bitRack' && empty) {
      if (f.def.id === 'chipping') {
        // pick the bit that suits the board on the bed; the wrong one cuts rough and the sheet's a reject
        const t = bedType(g);
        return [{ label: f.path!.id === 'preset' ? 'Pick a pre-set holder' : 'Pick a bit', gesture: bitPick(t && BIT_COLOURS[t], '🔩'), done: 'Got a bit off the rack',
          run: choice => { w.carrying = 'bit'; w.bitFor = CONFIG.jobs.types[choice ?? 0].id; } }];
      }
      return [{ label: 'Grab a new collet', gesture: taps('🔩', 1), done: 'Got a collet off the rack', run: () => { w.carrying = 'bit'; w.bitFor = null; } }];
    }
    if (st.needs === 'newBag' && id === 'bags' && empty) {
      return [{ label: 'Grab a new bag', twoHands: true, done: 'Got a new extractor bag', run: () => { w.carrying = 'newBag'; } }];
    }
    return [];
  }
  if (id !== st.at) return [];
  if (!st.needs && st.leaves && !empty) return []; // hands full: nothing to lift the bag out with
  // the right board for a wrong-material swap: pick it from the pallet (a wrong pick is just put back)
  if (f.def.id === 'wrongMaterial' && st.gesture.kind === 'pick') {
    const t = bedType(g);
    return [{ label: st.verb, gesture: { kind: 'pick', icon: '🪵', match: t && BIT_COLOURS[t], options: CONFIG.jobs.types.map(x => ({ colour: BIT_COLOURS[x.id], mark: '' })) },
      done: `Done: ${st.verb.toLowerCase()}`, run: choice => {
        if (t && CONFIG.jobs.types[choice ?? 0].id !== t) return 'Not that one: put it back';
        if (!g.doStep()) return 'Not right now';
      } }];
  }
  return [{ label: st.verb, gesture: st.gesture, twoHands: st.leaves !== undefined || st.needs !== undefined, done: `Done: ${st.verb.toLowerCase()}`, run: () => {
    if (!g.doStep()) return 'Not right now';
    // fitting a bit that doesn't suit the board: the rest of this sheet cuts rough
    if (st.needs === 'bit' && w.bitFor && g.current && w.bitFor !== g.current.type) g.current.rough = true;
    if (st.needs === 'bit') w.bitFor = null;
    if (st.leaves !== undefined) w.carrying = st.leaves;
  } }];
}

/** Things fetched for a fix that's gone (the fault cleared some other way): put them back where they came from. */
export function putBackActions(id: ObjectId, g: Game, w: WorldState): FixAction[] {
  const needed = g.fault && fixStep(g.fault)?.needs;
  if (w.carrying === 'bit' && needed !== 'bit' && id === 'bitRack') return [{ label: 'Put it back', done: 'Back on the rack', run: () => { w.carrying = null; w.bitFor = null; } }];
  if (w.carrying === 'newBag' && needed !== 'newBag' && id === 'bags') return [{ label: 'Put it back', done: 'Bag back on the shelf', run: () => { w.carrying = null; } }];
  return [];
}
