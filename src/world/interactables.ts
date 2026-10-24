// What you can do at each object, given the economy (Game) and the physical shed (WorldState).
// Every economy action goes through Game's existing public methods; world-only chores (clamping,
// unloading, carrying bags to the skip) just change WorldState.
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { ObjectId } from './layout.js';
import { absMinute, type WorldState } from './state.js';
import { WORLD } from './worldConfig.js';

export interface Action {
  label: string;
  run?: () => void;   // tap to do it
  hold?: boolean;     // hold to do it (spraying)
  /** false: never done automatically on arrival — it costs money or is a choice. Tap the label. */
  auto?: boolean;
  /** The notepad line this action answers: tapping that line does this on arrival. */
  key?: string;
}

const money = (n: number) => `$${Math.round(n)}`;

function faultActions(g: Game): Action[] {
  const f = g.fault!;
  switch (f.phase) {
    case 'diagnose':
      return f.def.diagnoses.filter(d => !f.triedDiagnoses.includes(d.id)).map(d => ({ label: d.label, run: () => { g.diagnose(d.id); } }));
    case 'choosePath':
      return g.availablePaths().map(p => {
        const mins = p.steps.reduce((s, x) => s + x.minutes, 0), cost = p.steps.reduce((s, x) => s + x.cost, 0);
        return { label: `${p.label} (~${mins}m${cost ? ', ' + money(cost) : ''})`, run: () => { g.choosePath(p.id); } };
      });
    case 'step':
      return [{ label: `Do: ${f.path!.steps[f.stepIndex].label}`, run: () => { g.doStep(); } }];
    default:
      return [];
  }
}

/** Can Game start a consumable swap right now? Mirrors replaceConsumable's own checks so we don't offer a dead button. */
const canSwap = (g: Game) => g.phase === 'day' && g.canAct && !g.replacing && !g.fault && g.machine !== 'loading' && g.machine !== 'down';

export function actionsFor(id: ObjectId, g: Game, w: WorldState): Action[] {
  if (g.phase !== 'day') return [];
  const empty = w.carrying === null;
  const c = CONFIG.consumables;
  switch (id) {
    case 'machine': {
      if (g.machineDown) return [];
      if (g.fault) return g.canAct ? faultActions(g) : [];
      const a: Action[] = [];
      if (w.bed === 'empty' && w.carrying === 'sheet') a.push({ label: 'Load sheet', run: () => { w.bed = 'placed'; w.carrying = null; } });
      if (w.bed === 'placed') a.push({ label: 'Clamp', run: () => { w.bed = 'clamped'; } });
      if (w.bed === 'clamped' && g.machine === 'idle' && g.canAct) a.push({ label: 'Start', run: () => {
        if (g.loadNextSheet()) { w.bed = 'running'; w.bedJobId = g.current?.id ?? null; }
      } });
      if (w.bed === 'done' && empty) a.push({ label: 'Unload', run: () => { w.bed = 'empty'; w.bedJobId = null; w.carrying = 'cut'; } });
      if (w.bed === 'scrap' && empty) a.push({ label: 'Clear the scrap', run: () => { w.bed = 'empty'; w.bedJobId = null; w.carrying = 'scrap'; } });
      if (w.bed === 'empty' && empty && g.machine === 'idle' && canSwap(g)) {
        a.push({ label: `New spoilboard (${money(c.spoilboard.replaceCost)})`, auto: false, run: () => { if (g.replaceConsumable('spoilboard')) w.watchingSwap = 'spoilboard'; } });
      }
      return a;
    }
    case 'plyPallet': {
      const next = g.nextUp();
      if (!empty || !next || w.bed !== 'empty' || g.machineDown) return [];
      return [{ label: `Grab sheet (${next.material})`, run: () => { w.carrying = 'sheet'; } }];
    }
    case 'finishedPallet':
      return w.carrying === 'cut' ? [{ label: 'Stack it', run: () => { w.carrying = null; w.finishedStack += 1; w.utePresent = true; } }] : [];
    case 'offcutBin': {
      const a: Action[] = [];
      if (w.carrying === 'scrap') a.push({ label: 'Bin the scrap', run: () => { w.carrying = null; w.offcutBin = Math.min(1, w.offcutBin + 2 * WORLD.offcutsPerSheet); } });
      if (empty && w.offcutBin >= WORLD.offcutsEmptyAt) a.push({ label: 'Bag the offcuts', run: () => { w.carrying = 'offcuts'; w.offcutBin = 0; } });
      return a;
    }
    case 'skip':
      return w.carrying === 'bag' || w.carrying === 'offcuts' || w.carrying === 'scrap'
        ? [{ label: 'Tip it in', run: () => { w.carrying = null; } }] : [];
    case 'bitRack':
      return empty && canSwap(g) ? [{ label: `Swap bit (${money(c.bit.replaceCost)})`, auto: false, run: () => { if (g.replaceConsumable('bit')) w.watchingSwap = 'bit'; } }] : [];
    case 'extractor': {
      const a: Action[] = [];
      if (w.oldBagWaiting && empty) a.push({ label: 'Lift out the old bag', run: () => { w.oldBagWaiting = false; w.carrying = 'bag'; } });
      else if (empty && canSwap(g)) a.push({ label: `Change bag (${money(c.filter.replaceCost)})`, auto: false, run: () => { if (g.replaceConsumable('filter')) w.watchingSwap = 'filter'; } });
      return a;
    }
    case 'compressor':
      return [{ label: 'Drain & reset', auto: false, run: () => { /* not modelled yet */ } }];
    case 'exhaust':
      return w.carrying === 'extinguisher' && g.fire ? [{ label: 'Hold to spray', hold: true }] : [];
    case 'extinguisher':
    case 'spareExtinguisher': {
      const hook = id === 'extinguisher' ? 'wall' : 'shed';
      if (empty && w.hooks[hook]) return [{ label: 'Grab extinguisher', run: () => { w.hooks[hook] = false; w.carrying = 'extinguisher'; w.extinguisherFrom = hook; } }];
      if (w.carrying === 'extinguisher' && !w.hooks[hook]) return [{ label: 'Hang it up', run: () => { w.hooks[hook] = true; w.carrying = null; w.extinguisherFrom = null; } }];
      return [];
    }
    case 'rollerDoor': {
      const a: Action[] = [];
      const courier = g.distractions.find(d => d.kind === 'courier');
      if (courier && g.canAct) a.push({ label: 'Sign for delivery', run: () => { if (g.respond(courier.id, 'sign')) w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes; } });
      if (w.utePresent && w.finishedStack > 0) a.push({ label: `Open for pickup (${w.finishedStack})`, run: () => {
        w.finishedStack = 0; w.utePresent = false; w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes;
      } });
      return a;
    }
    case 'smoko': {
      const mate = g.distractions.find(d => d.kind === 'friend');
      if (!mate) return [];
      const a: Action[] = [];
      if (!mate.engaged) a.push({ label: 'Have a yarn', run: () => { g.respond(mate.id, 'chat'); } });
      a.push({ label: '"Flat out, sorry"', auto: false, run: () => { g.respond(mate.id, 'disengage'); } });
      return a;
    }
    case 'phone': {
      if (!g.canAct) return [];
      const a: Action[] = [];
      for (const d of g.distractions) {
        if (d.kind === 'phone' && d.order) {
          a.push({ label: `Take the order (${d.order} sheets)`, key: `phone-${d.id}`, run: () => { g.respond(d.id, 'answer'); } });
          a.push({ label: 'Turn it down', auto: false, run: () => { g.respond(d.id, 'decline'); } });
        } else if (d.kind === 'phone') a.push({ label: 'Answer', key: `phone-${d.id}`, run: () => { g.respond(d.id, 'answer'); } });
        else if (d.kind === 'bank') a.push({ label: 'Talk to the bank', key: `bank-${d.id}`, run: () => { g.respond(d.id, 'answer'); } });
      }
      for (const c of g.callbacks) {
        a.push({ label: `Call ${c.customer} back (${c.sheets} sheets)`, key: `callback-${c.id}`, run: () => { g.callBack(c.id); } });
        a.push({ label: `Ring ${c.customer}, turn it down`, auto: false, run: () => { g.callBack(c.id, 'decline'); } });
      }
      return a;
    }
    case 'fridge':
      return g.fridgeOpen && g.canAct ? [{ label: `Beer (${money(CONFIG.competence.beerCost)})`, auto: false, run: () => { g.drinkBeer(); } }] : [];
    case 'toilet':
      return empty || w.carrying !== null ? [{ label: 'Use the loo', auto: false, run: () => { w.toiletUntil = absMinute(g) + WORLD.toiletMinutes; } }] : [];
    default:
      return [];
  }
}

/** A line of close-up detail shown on an object when you're next to it (machine display, timers). */
export function statusFor(id: ObjectId, g: Game, w: WorldState): string | null {
  switch (id) {
    case 'machine': {
      if (g.machineDown) return 'Dead for today.';
      const f = g.fault;
      if (f) {
        if (f.phase === 'wrongCall' || f.phase === 'working') return `${f.def.symptom}\n${f.busyLabel} (${f.busyRemaining}m)`;
        return f.def.symptom;
      }
      if (g.replacing?.key === 'spoilboard') return `Fitting spoilboard… ${g.replacing.remaining}m`;
      if (g.machine === 'loading') return `Loading… ${g.loadingRemaining}m`;
      if (g.machine === 'fire') return "The cut's stopped.";
      if (g.machine === 'paused') return 'Paused for a swap.';
      if (g.current && g.machine === 'cutting') return `${g.current.name}\n${g.current.material} · ${g.current.progress}/${g.current.cutMinutes} min`;
      if (w.bed === 'clamped') return 'Clamped. Ready to start.';
      if (w.bed === 'placed') return 'Sheet on the bed. Clamp it down.';
      return null;
    }
    case 'plyPallet': {
      const n = g.queued.length, next = g.nextUp();
      return next ? `${n} to cut · next: ${next.name} (due ${g.dueLabel(next)})` : 'Nothing to cut.';
    }
    case 'finishedPallet': return w.finishedStack ? `${w.finishedStack} waiting for pickup` : null;
    case 'bitRack': return g.replacing?.key === 'bit' ? `Swapping bit… ${g.replacing.remaining}m` : null;
    case 'extractor': return g.replacing?.key === 'filter' ? `Changing bag… ${g.replacing.remaining}m` : null;
    case 'phone': return g.busy ? `${g.busy.label}… ${g.busy.remaining}m` : null;
    case 'toilet': return w.toiletUntil ? `Occupied… ${Math.max(0, w.toiletUntil - absMinute(g))}m` : null;
    case 'smoko': {
      const mate = g.distractions.find(d => d.kind === 'friend');
      return mate ? `${mate.title.replace(' wandered in', '')}: ${mate.engaged ? `chatting, ${mate.remaining}m to go` : '"Mate. Got a sec?"'}` : null;
    }
    default: return null;
  }
}
