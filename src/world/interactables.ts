// What you can do at each object, given the economy (Game) and the physical shed (WorldState).
// Every economy action goes through Game's existing public methods; world-only chores (clamping,
// unloading, carrying bags to the skip) just change WorldState.
//
// Two rules: an action only shows when it makes sense right now (no dead buttons), and every action
// says what happened — `done` is the line it leaves in the notepad's recent events.
import { CONFIG, type ConsumableKey } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { Distraction } from '../sim/types.js';
import type { ObjectId } from './layout.js';
import { absMinute, HOOKS, hookThere, offcutsBagAt, onHook, type WorldState } from './state.js';
import { WORLD } from './worldConfig.js';

export interface Action {
  label: string;
  /** Tap to do it. Return a line to say what happened instead of `done` (e.g. it couldn't be done after all). */
  run?: () => string | void;
  hold?: boolean;     // hold to do it (spraying)
  /** false: never done automatically on arrival — it costs money or is a choice. Tap the label. */
  auto?: boolean;
  /** The notepad line this action answers: tapping that line does this on arrival. */
  key?: string;
  /** What it leaves in the notepad's recent events. */
  done?: string;
  /** Needs both hands: a can in your hand gets put down at your feet first. */
  twoHands?: boolean;
  /** Draw attention to it: the right call just now (turning work down when the board's full). */
  highlight?: boolean;
}

/** Binning the can in your hand: at any bin. */
function canBin(g: Game): Action[] {
  const c = g.heldCan;
  if (!c) return [];
  return [{ label: c.fill > 0 ? 'Bin the beer' : 'Bin the empty', done: c.fill > 0 ? 'Poured it out' : 'Empty in the bin', run: () => { g.binCan(); } }];
}

const money = (n: number) => `$${Math.round(n)}`;

/** UI the actions can open (set by the 3D view). */
export const uiHooks = { orderPly: () => {} };

function faultActions(g: Game): Action[] {
  const f = g.fault!;
  switch (f.phase) {
    case 'diagnose':
      return f.def.diagnoses.filter(d => !f.triedDiagnoses.includes(d.id)).map(d => ({ label: d.label, done: `Checked: ${d.label.toLowerCase()}`, run: () => { g.diagnose(d.id); } }));
    case 'choosePath':
      return g.availablePaths().map(p => {
        const mins = p.steps.reduce((s, x) => s + x.minutes, 0), cost = p.steps.reduce((s, x) => s + x.cost, 0);
        return { label: `${p.label} (~${mins}m${cost ? ', ' + money(cost) : ''})`, done: `Plan: ${p.label.toLowerCase()}`, run: () => { g.choosePath(p.id); } };
      });
    case 'step': {
      const step = f.path!.steps[f.stepIndex];
      return [{ label: `Do: ${step.label}`, done: `Started: ${step.label.toLowerCase()}`, run: () => { g.doStep(); } }];
    }
    default:
      return [];
  }
}

/** Can Game start a consumable swap right now? Mirrors replaceConsumable's own checks so we don't offer a dead button. */
const canSwap = (g: Game) => g.phase === 'day' && g.canAct && !g.replacing && !g.fault && g.machine !== 'loading' && g.machine !== 'down';
/** A swap is only worth offering once the part's actually worn. */
const worn = (g: Game, k: ConsumableKey) => g.wear[k] < WORLD.offerSwapBelow;

export function actionsFor(id: ObjectId, g: Game, w: WorldState): Action[] {
  if (g.phase !== 'day') return [];
  const empty = w.carrying === null;
  const c = CONFIG.consumables;
  switch (id) {
    case 'machine': {
      if (g.machineDown) return [];
      if (g.fault) return g.canAct ? faultActions(g) : [];
      const a: Action[] = [];
      if (w.bed === 'empty' && w.carrying === 'sheet') a.push({ label: 'Load sheet', done: 'Sheet on the bed', run: () => { w.bed = 'placed'; w.carrying = null; } });
      if (w.bed === 'placed') a.push({ label: 'Clamp', done: 'Sheet clamped', run: () => { w.bed = 'clamped'; } });
      if (w.bed === 'clamped' && g.machine === 'idle' && g.canAct) a.push({ label: 'Start', done: 'Cut started', run: () => {
        if (!g.loadNextSheet()) return "Machine won't start";
        w.bed = 'running'; w.bedJobId = g.current?.id ?? null;
      } });
      if (w.bed === 'done' && empty) a.push({ label: 'Unload', twoHands: true, done: 'Cut sheet off the bed', run: () => { w.bed = 'empty'; w.bedJobId = null; w.carrying = 'cut'; } });
      if (w.bed === 'scrap' && empty) a.push({ label: 'Clear the scrap', twoHands: true, done: 'Scrap off the bed', run: () => { w.bed = 'empty'; w.bedJobId = null; w.carrying = 'scrap'; } });
      if (w.bed === 'empty' && empty && g.machine === 'idle' && canSwap(g) && worn(g, 'spoilboard')) {
        a.push({ label: `New spoilboard (${money(c.spoilboard.replaceCost)})`, auto: false, done: 'Fitting a new spoilboard', run: () => {
          if (!g.replaceConsumable('spoilboard')) return "Can't swap the spoilboard right now";
          w.watchingSwap = 'spoilboard';
        } });
      }
      return a;
    }
    case 'plyPallet': {
      const truck = g.truckOnApron;
      if (w.carrying === 'bundle' && truck) {
        return [{ label: 'Stack the ply', key: 'ply-stack', done: 'Bundle on the pallet', run: () => { if (g.unloadBundle(truck.id, true)) w.carrying = null; else return "Couldn't stack it"; } }];
      }
      if (!empty || w.bed !== 'empty' || g.machineDown || !g.queued.length) return [];
      const next = g.nextUp();
      if (next) return [{ label: `Grab sheet (${next.material})`, twoHands: true, done: `Grabbed a sheet of ${next.material}`, run: () => { if (g.takeSheet()) w.carrying = 'sheet'; else return 'None left'; } }];
      // the work's there but the ply isn't
      return [{ label: 'Grab a sheet', done: 'None left — order ply', run: () => { w.shrugs = (w.shrugs ?? 0) + 1; } }];
    }
    case 'finishedPallet':
      return w.carrying === 'cut' ? [{ label: 'Stack it', done: 'Cut sheet stacked for pickup', run: () => { w.carrying = null; w.finishedStack += 1; w.utePresent = true; } }] : [];
    case 'offcutBin': {
      const a: Action[] = [];
      if (w.carrying === 'scrap') a.push({ label: 'Bin the scrap', done: 'Scrap binned', run: () => { w.carrying = null; w.offcutBin = Math.min(1, w.offcutBin + 2 * WORLD.offcutsPerSheet); } });
      if (empty && w.offcutBin >= offcutsBagAt(g)) a.push({ label: 'Bag the offcuts', twoHands: true, done: 'Offcuts bagged', run: () => { w.carrying = 'offcuts'; w.offcutBin = 0; } });
      return [...a, ...canBin(g)];
    }
    case 'skip':
      if (w.carrying === 'debris') {
        // busted roller-door slats (a rare event): each load clears a bit more of the dock
        return [{ label: 'Tip it in', done: 'Slats in the skip', run: () => { if (!g.clearDebris(true)) return 'Not right now'; w.carrying = null; } }, ...canBin(g)];
      }
      return [...(w.carrying === 'bag' || w.carrying === 'offcuts' || w.carrying === 'scrap'
        ? [{ label: 'Tip it in', done: 'Tipped in the skip', run: () => { w.carrying = null; } }] : []), ...canBin(g)];
    case 'bitRack':
      return empty && canSwap(g) && worn(g, 'bit') ? [{ label: `Swap bit (${money(c.bit.replaceCost)})`, auto: false, done: 'Swapping the bit', run: () => {
        if (!g.replaceConsumable('bit')) return "Can't swap the bit right now";
        w.watchingSwap = 'bit';
      } }] : [];
    case 'extractor': {
      const a: Action[] = [];
      if (w.oldBagWaiting && empty) a.push({ label: 'Lift out the old bag', twoHands: true, done: 'Old bag out', run: () => { w.oldBagWaiting = false; w.carrying = 'bag'; } });
      else if (empty && canSwap(g) && worn(g, 'filter')) a.push({ label: `Change bag (${money(c.filter.replaceCost)})`, auto: false, twoHands: true, done: 'Changing the extractor bag', run: () => {
        if (!g.replaceConsumable('filter')) return "Can't change the bag right now";
        w.watchingSwap = 'filter';
      } });
      return a;
    }
    case 'compressor':
      // the compressor isn't modelled yet: a look at the gauge, so the tap answers
      return empty ? [{ label: 'Check compressor', done: "Compressor checked — pressure's fine", run: () => {} }] : [];
    case 'exhaust':
      return w.carrying === 'extinguisher' && g.fire ? [{ label: 'Hold to spray', hold: true }] : [];
    case 'extinguisher':
    case 'spareExtinguisher':
    case 'exhaustExtinguisher': {
      const hook = HOOKS.find(h => h.id === id)!.hook;
      if (!hookThere(g, hook)) return [];
      // only worth taking down when there's a fire to put out
      if (empty && onHook(g, w, hook) && g.fire) return [{ label: 'Grab extinguisher', twoHands: true, done: 'Grabbed the extinguisher', run: () => { w.hooks[hook] = false; w.carrying = 'extinguisher'; w.extinguisherFrom = hook; } }];
      if (w.carrying === 'extinguisher' && !onHook(g, w, hook)) return [{ label: 'Hang it up', done: 'Extinguisher back on its hook', run: () => { w.hooks[hook] = true; w.carrying = null; w.extinguisherFrom = null; } }];
      return [];
    }
    case 'rollerDoor': {
      // a ute's clipped it (a rare event): nothing comes through until the busted slats are gone
      if (g.dockBlocked) {
        return empty ? [{ label: `Pull off the busted slats (${g.rare!.tripsLeft} left)`, twoHands: true, key: 'debris', done: 'Got a load of slats', run: () => { w.carrying = 'debris'; } }] : [];
      }
      const a: Action[] = [];
      const truck = g.truckOnApron;
      const doorUp = w.rollerUpUntil !== null;
      if (truck?.stage === 'waiting' && g.canAct) {
        if (!doorUp) a.push({ label: 'Open the roller door', key: 'ply-sign', done: 'Roller door up', run: () => { w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes; } });
        else a.push({ label: 'Sign for the ply', key: 'ply-sign', done: 'Signed for the ply', run: () => { if (!g.signDelivery(truck.id, true)) return "Couldn't sign"; } });
      }
      if (truck?.stage === 'unloading' && empty) {
        a.push({ label: `Grab a bundle (${truck.bundles.length} left)`, twoHands: true, key: 'ply-unload', done: 'Grabbed a bundle of ply', run: () => { w.carrying = 'bundle'; } });
      }
      const courier = g.distractions.find(d => d.kind === 'courier');
      if (courier && g.canAct) a.push({ label: 'Sign for delivery', done: 'Signed for the delivery', run: () => { if (g.respond(courier.id, 'sign')) w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes; } });
      if (w.utePresent && w.finishedStack > 0 && !truck) a.push({ label: `Open for pickup (${w.finishedStack})`, done: `${w.finishedStack} sheet${w.finishedStack > 1 ? 's' : ''} picked up`, run: () => {
        w.finishedStack = 0; w.utePresent = false; w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes;
      } });
      return a;
    }
    case 'phone': {
      if (!g.canAct) return [];
      const a: Action[] = [];
      for (const d of g.distractions) {
        if (d.kind === 'phone' && d.order && d.big) {
          // the big job (a rare event): a lot of good work, if there's room for it
          const days = CONFIG.rareEvent.events.find(e => e.id === 'bigJob')!.dueDays;
          a.push({ label: `Take the big job (${d.order} sheets, ${days} days)`, key: `phone-${d.id}`, done: `Took the big job: ${d.order} sheets`, run: () => { g.respond(d.id, 'answer'); } });
          a.push({ label: 'Turn it down', auto: false, highlight: g.overCommitted, done: `Turned down the big job`, run: () => { g.respond(d.id, 'decline'); } });
        } else if (d.kind === 'phone' && d.order) {
          a.push({ label: `Take the order (${d.order} sheets)`, key: `phone-${d.id}`, done: `Took a ${d.order}-sheet order`, run: () => { g.respond(d.id, 'answer'); } });
          a.push({ label: 'Turn it down', auto: false, highlight: g.overCommitted, done: `Turned down ${d.order} sheets`, run: () => { g.respond(d.id, 'decline'); } });
        } else if (d.kind === 'phone') a.push({ label: 'Answer', key: `phone-${d.id}`, done: 'Answered the phone', run: () => { g.respond(d.id, 'answer'); } });
        else if (d.kind === 'bank') a.push({ label: 'Talk to the bank', key: `bank-${d.id}`, done: 'Talked the bank round', run: () => { g.respond(d.id, 'answer'); } });
      }
      a.push({ label: 'Order ply', key: 'orderply', auto: false, done: 'On to the supplier', run: () => uiHooks.orderPly() });
      for (const cb of g.callbacks) {
        a.push({ label: `Call ${cb.customer} back (${cb.big ? 'big job, ' : ''}${cb.sheets} sheets)`, key: `callback-${cb.id}`, done: `Rang ${cb.customer} back`, run: () => { g.callBack(cb.id); } });
        a.push({ label: `Ring ${cb.customer}, turn it down`, auto: false, highlight: g.overCommitted, done: `Turned ${cb.customer} down`, run: () => { g.callBack(cb.id, 'decline'); } });
      }
      return a;
    }
    case 'desk':
      return g.canAct ? [{ label: 'Order ply', key: 'orderply', auto: false, done: 'On to the supplier', run: () => uiHooks.orderPly() }] : [];
    case 'fridge':
      return g.fridgeOpen && g.canAct && !g.heldCan ? [{ label: `Beer (${money(CONFIG.beer.cost)})`, auto: false, done: 'Cracked a beer', run: () => { if (!g.buyBeer()) return 'Fridge is shut'; } }] : [];
    case 'toilet':
      // only once there's a reason to go
      return g.needLoo && g.canAct ? [{ label: 'Use the loo', key: 'loo', done: 'Off to the loo', run: () => {
        if (!g.useToilet()) return "Can't go right now";
        w.toiletUntil = absMinute(g) + CONFIG.beer.toiletMinutes;
      } }] : [];
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
      const stock = CONFIG.jobs.types.map(t => `${g.stock[t.id]} ${g.stockWord(t.id)}`).join(' · ');
      const work = next ? `${n} to cut · next: ${next.name} (due ${g.dueLabel(next)})` : n ? `${n} to cut · no ply for any of it` : 'Nothing to cut.';
      return `${stock}
${work}`;
    }
    case 'finishedPallet': return w.finishedStack ? `${w.finishedStack} waiting for pickup` : null;
    case 'bitRack': return g.replacing?.key === 'bit' ? `Swapping bit… ${g.replacing.remaining}m` : null;
    case 'extractor': return g.replacing?.key === 'filter' ? `Changing bag… ${g.replacing.remaining}m` : null;
    case 'phone': return g.busy ? `${g.busy.label}… ${g.busy.remaining}m` : null;
    case 'toilet': return w.toiletUntil ? `Occupied… ${Math.max(0, w.toiletUntil - absMinute(g))}m` : null;
    default: return null;
  }
}

/**
 * A visiting mate, when you're next to them: they've come up with something to say (a yes, and "flat out"), or
 * they're yarning with you ("flat out" ends it). Nothing while they're off wandering. A yes to a beer they asked
 * for is a beer for them, within the day's caps; anything else is a yarn.
 */
export function visitorActions(g: Game, d: Distraction): Action[] {
  if (g.phase !== 'day') return [];
  const who = g.mateName(d);
  const flatOut: Action = { label: '"Flat out, sorry"', auto: false, done: `Sent ${who} off for a bit`, run: () => { g.respond(d.id, 'disengage'); } };
  if (d.engaged) return [flatOut];
  if (!d.ask) return [];
  const yes: Action = d.ask.kind === 'beer' && g.visitorMayHaveBeer(d)
    ? { label: `Grab ${who} a beer (${money(CONFIG.beer.cost)})`, auto: false, done: `Having a beer with ${who}`, run: () => { g.respond(d.id, 'chat'); } }
    : { label: 'Have a yarn', done: `Yarning with ${who}`, run: () => { g.respond(d.id, 'chat'); } };
  return [yes, flatOut];
}

/** What a visiting mate's up to, shown over them when you're close (what they've come to say is in their speech bubble). */
export function visitorStatus(g: Game, d: Distraction): string | null {
  return d.engaged ? `${g.mateName(d)}: yarning, ${d.chat}m to go` : null;
}

/** The council inspector (a rare event), when you're next to them: they're waiting to be shown round. */
export function inspectorActions(g: Game): Action[] {
  if (!g.inspectorWaiting) return [];
  return [{ label: 'Show them round', auto: false, done: 'Machine off; walking the inspector round', run: () => { if (!g.showCouncilRound()) return 'Not right now'; } }];
}

/** What the inspector's up to, over their head when you're close. */
export function inspectorStatus(g: Game): string | null {
  if (g.inspectorWaiting) return `Council: "Mind if I have a look round?" (${g.rare!.waitLeft}m)`;
  if (g.inspectorTouring) {
    const left = Math.max(0, Math.ceil(CONFIG.rareEvent.events.find(e => e.id === 'council')!.tourSeconds! - (g.rare!.escortSec ?? 0)));
    return `Council: walking the round, stay with them (${left}s)`;
  }
  return null;
}
