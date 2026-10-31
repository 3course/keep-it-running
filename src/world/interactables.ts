// What you can do at each object, given the economy (Game) and the physical shed (WorldState).
// Every economy action goes through Game's existing public methods; world-only chores (clamping,
// unloading, carrying bags to the skip) just change WorldState.
//
// Two rules: an action only shows when it makes sense right now (no dead buttons), and every action
// says what happened — `done` is the line it leaves in the notepad's recent events.
import { CONFIG, type ConsumableKey } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { Distraction, OrderPreview } from '../sim/types.js';
import type { GestureSpec } from '../ui/gesture.js';
import { faultAt, fixActions, fixStep, putBackActions } from './fixes.js';
import type { ObjectId } from './layout.js';
import { absMinute, HOOKS, hookThere, offcutsBagAt, onHook, type WorldState } from './state.js';
import { WORLD } from './worldConfig.js';
import { canOnBed } from './cans.js';
import { PEOPLE } from '../people/config.js';

export interface Action {
  label: string;
  /**
   * Tap to do it. Return a line to say what happened instead of `done` (e.g. it couldn't be done after all).
   * `choice`: which option a pick gesture landed on.
   */
  run?: (choice?: number) => string | void;
  /** Hands-on: tapping the label opens this one-thumb gesture, and `run` happens when it's done. */
  gesture?: GestureSpec;
  /** Taps gestures: each target as it's tapped (clamps go on one at a time, even if you stop short). */
  onTap?: (n: number) => void;
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

/** UI the actions can open (set by the 3D view): the ply order form, and the yes/no card for an order call. */
export const uiHooks = {
  orderPly: () => {},
  /** Dennis on the line: his pitch and your answer (the view shows it). */
  dennis: () => {},
  /** Dennis's ledger, on the office wall. */
  ledger: () => {},
  orderCard: (_d: Distraction, _offer: OrderPreview, _take: Action, _decline: Action) => {},
};

/** The fault, where it is: work out what it is and pick a fix there; then each step where that step happens. */
function faultActions(id: ObjectId, g: Game, w: WorldState): Action[] {
  const f = g.fault!;
  if (!g.canAct) return [];
  if (f.phase === 'step') return fixActions(id, g, w);
  if (id !== faultAt(f)) return [];
  switch (f.phase) {
    case 'diagnose':
      return f.def.diagnoses.filter(d => !f.triedDiagnoses.includes(d.id)).map(d => ({ label: d.label, done: `Checked: ${d.label.toLowerCase()}`, run: () => { g.diagnose(d.id); } }));
    case 'choosePath':
      return g.availablePaths().map(p => {
        const mins = p.steps.reduce((s, x) => s + x.minutes, 0), cost = p.steps.reduce((s, x) => s + x.cost, 0);
        return { label: `${p.label} (~${mins}m${cost ? ', ' + money(cost) : ''})`, done: `Plan: ${p.label.toLowerCase()}`, run: () => { g.choosePath(p.id); } };
      });
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
  // a fault being fixed takes over wherever its next part happens (and what you fetched for it goes back if it's gone)
  if (g.fault && id !== 'machine') { const fx = faultActions(id, g, w); if (fx.length) return fx; }
  const back = putBackActions(id, g, w);
  if (back.length) return back;
  switch (id) {
    case 'machine': {
      if (g.machineDown) return [];
      if (g.fault) return faultActions('machine', g, w);
      const a: Action[] = [];
      const clamps = CONFIG.chore.clamp.clamps, on = w.clamps ?? 0;
      // a bed piled with finished boards takes no sheet (machine's status says so)
      // the morning after: a can left on the bed comes off before any sheet goes on
      const bedCan = w.people?.cans.find(c => c.spot === 'bed');
      if (bedCan && (empty || (w.carrying === 'cans' && (w.canCount ?? 0) < PEOPLE.cans.carry))) a.push({ label: 'Grab the can off the bed', key: 'bedcan', done: 'Can off the router bed', run: () => {
        w.people!.cans = w.people!.cans.filter(c => c !== bedCan);
        w.carrying = 'cans'; w.canCount = (w.canCount ?? 0) + 1;
      } });
      // …and after the rare late one, a milk crate's somehow up there
      if (w.people?.oddObject === 'crateOnBed' && empty) a.push({ label: 'Lift the milk crate off the bed', key: 'oddcrate', done: 'Milk crate off the bed. No idea.', run: () => { w.people!.oddObject = null; } });
      if (w.bed === 'empty' && w.carrying === 'sheet' && !g.bedFull && !canOnBed(w.people)) a.push({ label: 'Load sheet', done: 'Sheet on the bed', run: () => { w.bed = 'placed'; w.carrying = null; w.clamps = 0; } });
      // four clamps, a tap each; stop short and the sheet may shift mid-cut
      if (w.bed === 'placed') a.push({ label: 'Clamp', key: 'clamp', gesture: { kind: 'taps', icon: '🗜️', n: clamps - on }, onTap: n => { w.clamps = on + n; },
        done: 'Sheet clamped', run: () => { w.clamps = clamps; w.bed = 'clamped'; } });
      if ((w.bed === 'clamped' || (CONFIG.chores && w.bed === 'placed')) && g.machine === 'idle' && g.canAct) a.push({ label: 'Start', key: 'start', auto: w.bed === 'clamped', done: 'Cut started', run: () => {
        if (!g.loadNextSheet(w.bed === 'clamped' ? clamps : on)) return "Machine won't start";
        w.bed = 'running'; w.bedJobId = g.current?.id ?? null;
      } });
      // the finished boards piled on the bed, off to the finished pallet in one go
      if (g.bedPile > 0 && empty) a.push({ label: `Carry the boards off (${g.bedPile})`, key: 'unload', twoHands: true, done: 'Boards off the bed', run: () => {
        const n = g.bedPile;
        if (g.palletFull) return "Finished pallet's full: wait for a pickup";
        if (!g.clearBed(true)) return 'Not right now';
        w.carrying = 'cut'; w.carryCount = n - g.bedPile;
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
      if (w.carrying === 'cut') return [{ label: 'Stack it', done: 'Cut sheets stacked for pickup', run: () => { w.carrying = null; w.finishedStack += w.carryCount ?? 1; w.carryCount = undefined; } }];
      if (w.carrying === 'stack') return [{ label: 'Put the stack back', done: 'Stack back on the pallet', run: () => { w.carrying = null; } }];
      // the customer's ute is out the front: carry the stack out to it
      if (empty && w.utePresent && w.finishedStack > 0) return [{ label: `Pick up the stack (${w.finishedStack})`, twoHands: true, key: 'pickup', done: 'Got the stack', run: () => { w.carrying = 'stack'; } }];
      return [];
    case 'offcutBin': {
      const a: Action[] = [];
      // (a ruined sheet's offcuts were counted in the bin as it came off the machine)
      if (w.carrying === 'scrap') a.push({ label: 'Bin the scrap', done: 'Scrap binned', run: () => { w.carrying = null; } });
      // it overflowed: scoop the floor pile up, a load at a time, for the skip
      if (empty && g.offcutPile > 0) a.push({ label: `Scoop up the offcuts (${g.offcutPile} left)`, key: 'offcut-pile', twoHands: true, gesture: { kind: 'drag', icon: '🧹', dir: 'up' },
        done: 'A load of offcuts off the floor', run: () => { if (!g.clearOffcutPile(true)) return 'Not right now'; w.carrying = 'offcuts'; } });
      else if (empty && g.offcutBin >= offcutsBagAt(g)) a.push({ label: 'Bag the offcuts', key: 'offcuts', twoHands: true, done: 'Offcuts bagged', run: () => {
        if (!g.emptyOffcutBin(true)) return 'Not right now';
        w.carrying = 'offcuts';
      } });
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
      // hold the drain valve open: the water's out and the vacuum holds again (the hiss tells you when it's due)
      return empty && g.canAct && g.compressorSheets > 0 ? [{ label: 'Drain the tank', key: 'drain', gesture: { kind: 'hold', icon: '💧', seconds: 2 },
        done: 'Compressor drained', run: () => { if (!g.drainCompressor(true)) return 'Nothing to drain'; } }] : [];
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
        else a.push({ label: 'Sign for the ply', key: 'ply-sign', gesture: { kind: 'sign', icon: '🧾' }, done: 'Signed for the ply', run: () => { if (!g.signDelivery(truck.id, true)) return "Couldn't sign"; } });
      }
      if (truck?.stage === 'unloading' && empty) {
        a.push({ label: `Grab a bundle (${truck.bundles.length} left)`, twoHands: true, key: 'ply-unload', done: 'Grabbed a bundle of ply', run: () => { w.carrying = 'bundle'; } });
      }
      const courier = g.distractions.find(d => d.kind === 'courier');
      if (courier && g.canAct) a.push({ label: 'Sign for delivery', gesture: { kind: 'sign', icon: '🧾' }, done: 'Signed for the delivery', run: () => { if (g.respond(courier.id, 'sign')) w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes; } });
      // a pickup: the door goes up so the stack can go out to the ute
      if (w.utePresent && w.finishedStack > 0 && !truck && !doorUp) a.push({ label: 'Open the roller door', key: 'pickup', done: 'Roller door up', run: () => {
        w.rollerUpUntil = absMinute(g) + WORLD.rollerOpenMinutes;
      } });
      return a;
    }
    case 'phone': {
      if (!g.canAct) return [];
      const a: Action[] = [];
      for (const d of g.distractions) {
        if (d.kind === 'phone' && d.order) {
          // pick up the handset: the card shows what's on offer (board, price, when it's due), then yes or no
          const take: Action = d.big
            ? { label: 'Take the big job', done: `Took the big job: ${d.order} sheets`, run: () => { if (!g.respond(d.id, 'answer')) return 'They rang off'; } }
            : { label: 'Take it', done: `Took a ${d.order}-sheet order`, run: () => { if (!g.respond(d.id, 'answer')) return 'They rang off'; } };
          const decline: Action = { label: 'Turn it down', highlight: g.overCommitted, done: d.big ? 'Turned down the big job' : `Turned down ${d.order} sheets`,
            run: () => { if (!g.respond(d.id, 'decline')) return 'They rang off'; } };
          a.push({ label: 'Pick up', key: `phone-${d.id}`, done: 'Picked up', run: () => {
            const offer = g.previewOrder(d.id);
            if (!offer) return 'They rang off';
            uiHooks.orderCard(d, offer, take, decline);
          } });
        } else if (d.kind === 'phone') a.push({ label: 'Answer', key: `phone-${d.id}`, done: 'Answered the phone', run: () => { g.respond(d.id, 'answer'); } });
        else if (d.kind === 'bank') a.push({ label: 'Talk to the bank', key: `bank-${d.id}`, done: 'Talked the bank round', run: () => { g.respond(d.id, 'answer'); } });
      }
      if (g.dennisRinging) a.unshift({ label: `Answer (${CONFIG.dennis.name})`, key: 'dennis', done: `On the phone to ${CONFIG.dennis.name}`, run: () => { if (!g.answerDennis()) return 'He rang off'; uiHooks.dennis(); } });
      a.push({ label: 'Order ply', key: 'orderply', auto: false, done: 'On to the supplier', run: () => uiHooks.orderPly() });
      // Dennis's ledger hangs by the phone
      if (g.dennis.bets.some(b => b.status !== 'pitched')) a.push({ label: `Read ${CONFIG.dennis.name}'s ledger`, auto: false, done: `Read ${CONFIG.dennis.name}'s ledger`, run: () => uiHooks.ledger() });
      for (const cb of g.callbacks) {
        a.push({ label: `Call ${cb.customer} back (${cb.big ? 'big job, ' : ''}${cb.sheets} sheets)`, key: `callback-${cb.id}`, done: `Rang ${cb.customer} back`, run: () => { g.callBack(cb.id); } });
        a.push({ label: `Ring ${cb.customer}, turn it down`, auto: false, highlight: g.overCommitted, done: `Turned ${cb.customer} down`, run: () => { g.callBack(cb.id, 'decline'); } });
      }
      return a;
    }
    case 'switchboard':
      // a compressor on the extractor's circuit (the layout) trips it now and then
      return g.powerTripped && g.canAct ? [{ label: 'Reset the breaker', key: 'breaker', done: 'Breaker back on', run: () => { if (!g.resetPower(true)) return 'Not right now'; } }] : [];
    case 'desk':
      return g.canAct ? [{ label: 'Order ply', key: 'orderply', auto: false, done: 'On to the supplier', run: () => uiHooks.orderPly() }] : [];
    case 'fridge':
      if (w.people?.oddObject === 'extinguisherInFridge' && empty) return [{ label: 'Get the extinguisher out of the fridge', key: 'oddext', done: 'Extinguisher back on the wall. Cold.', run: () => { w.people!.oddObject = null; } }];
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
  // the fault: what it looks like where it is, and how the step's going where it's being done
  const f = g.fault;
  if (f && id !== 'machine') {
    const st = fixStep(f);
    if (st && st.at === id && f.phase === 'working') return `${f.busyLabel} (${f.busyRemaining}m)`;
    if (id === faultAt(f) && !st) return f.phase === 'wrongCall' ? `${f.def.symptom}\n${f.busyLabel} (${f.busyRemaining}m)` : f.def.symptom;
  }
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
      if (canOnBed(w.people) && w.bed === 'empty') return "There's an empty on the bed from last night.";
      if (w.bed === 'clamped') return 'Clamped. Ready to start.';
      if (w.bed === 'placed') return `Sheet on the bed. Clamps ${w.clamps ?? 0}/${CONFIG.chore.clamp.clamps}.`;
      if (g.bedFull) return "Bed's full of finished boards. Carry them off.";
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
    case 'compressor': return g.compressorDue ? 'The hiss has dropped: water in the tank. Drain it.' : g.compressorSheets > 0 ? 'Hissing away.' : 'Just drained.';
    case 'offcutBin': return g.offcutPile > 0 ? 'Overflowing: offcuts all round it.' : `${Math.round(g.offcutBin * g.binSheets)} of ${g.binSheets} sheets' offcuts`;
    case 'bitRack': return g.replacing?.key === 'bit' ? `Swapping bit… ${g.replacing.remaining}m` : null;
    case 'extractor': return g.replacing?.key === 'filter' ? `Changing bag… ${g.replacing.remaining}m` : null;
    case 'phone': return g.busy ? `${g.busy.label}… ${g.busy.remaining}m` : null;
    case 'switchboard': return g.powerTripped ? 'TRIPPED. The compressor and the extractor are on one circuit.' : null;
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

/** The customer's ute out the front, when you're beside it with the stack: hand it over. */
export function uteActions(g: Game, w: WorldState): Action[] {
  if (g.phase !== 'day' || w.carrying !== 'stack' || !w.utePresent) return [];
  const n = Math.min(w.finishedStack, g.sheetsHere) || g.sheetsHere;
  return [{ label: `Hand it over (${n})`, gesture: { kind: 'taps', icon: '🤝', n: 1 }, done: `${n} sheet${n > 1 ? 's' : ''} picked up`, run: () => {
    const k = g.handOver();
    w.finishedStack = Math.max(0, w.finishedStack - k); w.carrying = null; // anyone else's sheets go back on the pallet
  } }];
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
