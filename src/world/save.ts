// Save and restore the whole game — economy and world — to localStorage, so closing the app is a pause.
// Game.ts isn't touched: its fields (including private ones, which are ordinary properties at runtime)
// are copied out and back in, with the few non-JSON bits (RNG state, the upgrade Set, fault references,
// the current-job reference) handled by hand.
import { track } from '../analytics.js';
import { CONFIG, type UpgradeId } from '../config.js';
import { FAULTS } from '../data/faults.js';
import { Game } from '../sim/Game.js';
import { Rng } from '../sim/rng.js';
import type { FaultPhase, Job } from '../sim/types.js';
import type { WorldState } from './state.js';
import { getItem, KEYS, removeItem, setItem } from '../storage.js';
import { CARRIES, HOOKS, hookThere, newWorld, type Hook } from './state.js';
import { DEFAULT_PLAN, fullPlan, reachableFor } from './layoutPlan.js';
import { newLease, type LeaseState } from './lease.js';
import { ENDINGS } from './leaseEnding.js';
import { FORTUNE_KINDS } from './leaseWeeks.js';
import { WORLD } from './worldConfig.js';

const SAVE_VERSION = 2; // 2: positions in metres (Three.js world)

interface SaveFile { v: number; savedAt: number; game: Record<string, unknown>; world: WorldState }

type Loose = Record<string, unknown>;

function gameToJson(g: Game): Loose {
  const out: Loose = {};
  for (const [k, v] of Object.entries(g as unknown as Loose)) out[k] = v;
  out.actionRng = { s: (g.actionRng as unknown as { s: number }).s };
  out.visitorRng = { s: (g.visitorRng as unknown as { s: number }).s };
  out.upgrades = [...g.upgrades];
  out.current = g.current ? g.current.id : null;
  out.fault = g.fault ? { ...g.fault, def: g.fault.def.id, path: g.fault.path?.id ?? null } : null;
  return out;
}

// ---------- loading a save safely ----------
// A save is whatever is in localStorage: it might be from an older build, cut off half-written, or edited by hand. Loading
// keeps every field that's the right kind of thing and puts a fresh game's value back for any that isn't, clamps the
// numbers that index or divide something, and drops references that point at nothing — so a bad save loads as a
// slightly odd game (or not at all), never as one that crashes mid-shift.

/** Keys that must never be copied onto an object from parsed JSON (they'd reach the prototype). */
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
/** Sanity bounds for loaded numbers: far past anything a real game reaches, short of anything that breaks the maths. */
const LIMIT = { money: 1e9, dayIndex: 100_000, count: 1e6 };

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPlain = (v: unknown): v is Loose => isObject(v) && Object.getPrototypeOf(v) === Object.prototype;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;

/** Is `v` the same kind of JSON value as `like` (a fresh game's value for that field)? A field a fresh game leaves null or unset takes anything. */
function sameKind(v: unknown, like: unknown): boolean {
  if (like === null || like === undefined) return true;
  if (typeof like === 'number') return typeof v === 'number' && Number.isFinite(v); // (JSON.parse('1e999') is Infinity)
  if (typeof like === 'string' || typeof like === 'boolean') return typeof v === typeof like;
  if (Array.isArray(like)) return Array.isArray(v);
  if (typeof like === 'object') return isObject(v);
  return false; // a method: never from a save
}

/**
 * `v` with every field that's the wrong kind (against `like`) swapped for `like`'s, `depth` levels into plain objects.
 * Inside those (not at the top: the caller decides what a missing top-level field means) a field `like` has and `v`
 * lacks is filled in from `like`, as a fresh game would have it.
 */
function repair(v: Loose, like: Loose, depth: number, fill = false): Loose {
  const out: Loose = {};
  for (const [k, x] of Object.entries(v)) {
    if (UNSAFE.has(k)) continue;
    const l = like[k];
    if (!sameKind(x, l)) { out[k] = structuredClone(l); continue; }
    out[k] = depth > 0 && isPlain(l) && isObject(x) ? repair(x, l, depth - 1, true) : x;
  }
  if (fill) for (const [k, l] of Object.entries(like)) if (!(k in out) && l !== undefined && typeof l !== 'function') out[k] = structuredClone(l);
  return out;
}

function rngFrom(v: unknown, fallbackSeed: number): Rng {
  const r = new Rng(fallbackSeed);
  const s = isObject(v) ? v.s : undefined;
  if (typeof s === 'number' && Number.isFinite(s)) (r as unknown as { s: number }).s = s >>> 0;
  return r;
}

function gameFromJson(raw: Loose): Game {
  const seed = isUint32(raw.seed) ? raw.seed : undefined;
  const g = new Game(seed);
  const target = g as unknown as Loose;
  const data = repair(raw, target, 2);
  tidyLists(data, 2);
  // fields of the wrong kind come back as the fresh game's value; the hand-restored ones below are skipped here
  for (const [k, v] of Object.entries(data)) {
    if (k === 'seed' || k === 'actionRng' || k === 'visitorRng' || k === 'rng' || k === 'upgrades' || k === 'current' || k === 'fault') continue;
    target[k] = v;
  }
  // the clock and the money: whole days from 1, a minute inside the day, cash a real number
  g.dayIndex = clamp(Math.floor(g.dayIndex), 1, LIMIT.dayIndex);
  g.day = clamp(Math.floor(g.day), 1, CONFIG.week.days);
  g.minute = clamp(g.minute, 0, 24 * 60);
  target.cash = clamp(g.cash, -LIMIT.money, LIMIT.money);
  g.rapport = clamp(g.rapport, CONFIG.rapport.min, CONFIG.rapport.max);
  g.competence = clamp(g.competence, 0, CONFIG.competence.max);
  for (const k of Object.keys(g.wear) as (keyof Game['wear'])[]) g.wear[k] = clamp(g.wear[k], 0, 1);
  // the player's stream; a save from before the world's rolls got their own streams had one `rng` for everything,
  // and carries on from where it was (the world's rolls are derived from the seed, so there's nothing else to restore)
  g.actionRng = rngFrom(raw.actionRng ?? raw.rng, g.seed);
  // a save from before visitors had their own stream: the new game's (reseeded tomorrow) does
  g.visitorRng = rngFrom(raw.visitorRng, g.seed);
  const known = new Set<string>(CONFIG.upgrades.map(u => u.id));
  g.upgrades = new Set((Array.isArray(raw.upgrades) ? raw.upgrades : []).filter((u): u is UpgradeId => typeof u === 'string' && known.has(u)));
  const jobs = g.jobs = g.jobs.filter((j): j is Job => isObject(j) && typeof j.id === 'number');
  g.current = raw.current == null ? null : jobs.find(j => j.id === raw.current) ?? null;
  const f = raw.fault;
  const def = isObject(f) ? FAULTS.find(d => d.id === f.def) : undefined;
  if (isObject(f) && def) {
    // repaired against a template, not {}: a fresh game's fault is null, so sameKind would otherwise take
    // anything — and a string busyRemaining (say) never counts down, wedging the machine on 'fault' all day
    const template: Omit<NonNullable<Game['fault']>, 'def' | 'path'> = {
      phase: 'diagnose', minutesOpen: 0, triedDiagnoses: [], busyRemaining: 0, busyLabel: '', stepIndex: 0, sheetScrapped: false,
    };
    const path = typeof f.path === 'string' ? def.paths.find(p => p.id === f.path) : undefined;
    const r = repair(f, template as unknown as Loose, 1, true) as unknown as NonNullable<Game['fault']>;
    g.fault = { ...r, def, path };
    const PHASES: FaultPhase[] = ['diagnose', 'wrongCall', 'choosePath', 'step', 'working'];
    if (!PHASES.includes(g.fault.phase)) g.fault.phase = path ? 'step' : 'diagnose';
    if ((g.fault.phase === 'step' || g.fault.phase === 'working') && !path) g.fault.phase = 'diagnose'; // a step needs its path
    g.fault.minutesOpen = clamp(g.fault.minutesOpen, 0, 24 * 60);
    g.fault.busyRemaining = clamp(g.fault.busyRemaining, 0, 24 * 60);
    g.fault.stepIndex = path ? clamp(Math.floor(g.fault.stepIndex), 0, path.steps.length) : 0;
  } else g.fault = null; // (a fault that isn't in the game any more: cleared)
  if (g.replacing && !(g.replacing.key in CONFIG.consumables)) g.replacing = null; // a junk key would write garbage into wear
  g.deliveries = g.deliveries.filter(d => isObject(d) && Array.isArray(d.lines));
  for (const d of g.deliveries) d.lines = d.lines.filter(l => isObject(l) && CONFIG.jobs.types.some(t => t.id === l.type));
  if (g.fire !== null && !isObject(g.fire)) g.fire = null;
  if (g.rare != null && !isObject(g.rare)) g.rare = null;
  if (g.rare) {
    // a save from before the walk-round ran in game minutes (escortSec, real seconds): the round starts over
    const r = g.rare as unknown as Loose;
    delete r.escortSec;
    if (r.id === 'council' && (typeof r.escortMinutes !== 'number' || !Number.isFinite(r.escortMinutes) || r.escortMinutes < 0)) r.escortMinutes = 0;
  }
  // the view sets these each frame from where you are / what's held; left frozen they'd make the
  // validation day (playsOn) a different game from the one the player resumes
  g.escorting = false; g.signing = false; g.spraying = false; g.fireHold = false; g.extinguisherAway = false;
  // a save from before refills counted across days: the old daily count isn't carried (the lifetime count starts at 0)
  delete (g as unknown as Loose).extinguisherUsesToday;
  target.extinguisherUses = clamp(Math.floor(g.extinguisherUses), 0, LIMIT.count);
  // a save from before stock was valued: what's on the pallet is worth what it costs to buy
  if (!('stockValue' in data)) for (const t of CONFIG.jobs.types) g.stockValue[t.id] = g.stock[t.id] * t.boardCost;
  for (const d of g.deliveries) {
    for (const l of d.lines) l.unitCost ??= CONFIG.jobs.types.find(t => t.id === l.type)!.boardCost;
    d.fee ??= CONFIG.supply.deliveryFee; // from before big orders shipped free
  }
  if (g.fire) g.fire.heat ??= g.fire.minutes; // from before fires spread at the day's breakdown rate
  // a save from before ply stock: keep the new game's truck at the door, and give the driver a fresh wait
  if (!('stock' in data)) for (const d of g.deliveries) { d.day = g.dayIndex; if (d.stage === 'waiting') d.signBy = g.minute + CONFIG.supply.signWindowMinutes; }
  return g;
}

/** Lists: holes (null) and anything not the same kind as the list's first entry are dropped. */
function tidyLists(o: Loose, depth: number) {
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) {
      const kind = (x: unknown) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
      const first = v.find(x => x !== null);
      o[k] = v.filter(x => x !== null && kind(x) === kind(first));
    } else if (depth > 0 && isObject(v)) tidyLists(v, depth - 1);
  }
}

/**
 * The last check: a copy of the loaded game plays on to tomorrow morning. Anything the repairs above missed that
 * would throw mid-shift throws here instead, and the save is refused (a fresh game) rather than crashing later.
 */
function playsOn(text: string): boolean {
  try {
    const file = JSON.parse(text) as SaveFile;
    const g = gameFromJson(file.game);
    for (let guard = 0; guard < 4 * 24 * 60; guard++) {
      if (g.phase === 'day') g.tick();
      else if (g.phase === 'endOfDayPrompt') g.knockOff();
      else { g.nextDay(); return true; }
    }
    return true;
  } catch { return false; }
}

/**
 * Each extinguisher in the shed ends up in exactly one place: on its bracket, in your hands, or down on floor you can
 * get to. A put-down spot that isn't (junk, in a wall or a machine, a walled-off room) goes back on its bracket.
 * Carrying one with no bracket of its own puts it down where you stand, as whichever one is missing (or on its bracket
 * if you're not standing anywhere real). One that's in no place at all goes back on its bracket.
 */
function tidyExtinguishers(w: WorldState, g: Game) {
  let reach: (x: number, y: number) => boolean;
  try { reach = reachableFor(fullPlan(w.layout)); } catch { reach = reachableFor(DEFAULT_PLAN); }
  const C = WORLD.cell;
  const onFloor = (p: unknown): p is { x: number; z: number } => isObject(p) && typeof p.x === 'number' && typeof p.z === 'number'
    && Number.isFinite(p.x) && Number.isFinite(p.z) && reach(Math.floor(p.x / C), Math.floor(p.z / C));
  const here = HOOKS.map(h => h.hook).filter(h => hookThere(g, h));
  const isHook = (h: unknown): h is Hook => typeof h === 'string' && (here as string[]).includes(h);
  if (!isObject(w.hooks)) w.hooks = { wall: true, shed: true, exhaust: true };
  const hooks = w.hooks as Record<Hook, boolean | undefined>;
  const down: Partial<Record<Hook, { x: number; z: number }>> = {};
  for (const [h, p] of Object.entries(isObject(w.extAt) ? w.extAt : {})) {
    if (!isHook(h)) continue;
    if (onFloor(p)) { down[h] = { x: p.x, z: p.z }; hooks[h] = false; } else hooks[h] = true; // a bad spot: back on its bracket
  }
  if (w.carrying === 'extinguisher') {
    const h = w.extinguisherFrom;
    if (isHook(h)) { delete down[h]; hooks[h] = false; } // in your hands (wherever else the save had it)
    else {
      w.carrying = null; w.extinguisherFrom = null;
      const missing = here.find(x => hooks[x] === false && !down[x]);
      if (missing) { if (onFloor({ x: w.px, z: w.py })) down[missing] = { x: w.px, z: w.py }; else hooks[missing] = true; }
    }
  } else w.extinguisherFrom = null;
  // off its bracket, not in your hands, not on the floor: nowhere. Back on the bracket.
  for (const h of here) if (hooks[h] === false && !down[h] && !(w.carrying === 'extinguisher' && w.extinguisherFrom === h)) hooks[h] = true;
  w.extAt = down;
}

const BEDS: readonly WorldState['bed'][] = ['empty', 'placed', 'clamped', 'running', 'done', 'scrap'];

/** The shed from a save, checked against a fresh one the same way (a missing number or flag gets the fresh value). */
function worldFromJson(raw: unknown, g: Game): WorldState {
  const fresh = newWorld(g) as unknown as Loose;
  if (!isObject(raw)) return fresh as unknown as WorldState;
  const w = repair(raw, fresh, 2);
  for (const [k, v] of Object.entries(fresh)) if (!(k in w) && (typeof v !== 'object' || Array.isArray(v) || k === 'hooks')) w[k] = structuredClone(v);
  const out = w as unknown as WorldState;
  if (!BEDS.includes(out.bed)) out.bed = 'empty';
  if (out.carrying !== null && !CARRIES.includes(out.carrying)) out.carrying = null;
  tidyExtinguishers(out, g);
  out.finishedStack = clamp(Math.floor(out.finishedStack), 0, 1000);
  // the lease: a fresh world has none (newWorld doesn't set it), so repair() above took it as-is — check it
  // against a template lease, or a tampered rentDue/startDayIndex (NaN, a string) silently stops rent ever falling due
  if (out.lease !== undefined) {
    if (!isObject(out.lease)) delete out.lease;
    else {
      const l = repair(out.lease as unknown as Loose, newLease(g) as unknown as Loose, 1, true) as unknown as LeaseState;
      l.n = clamp(Math.floor(l.n), 1, LIMIT.count);
      l.startDayIndex = clamp(Math.floor(l.startDayIndex), 1, LIMIT.dayIndex);
      l.rentDue = clamp(l.rentDue, 0, LIMIT.money);
      if (l.ending !== null && !ENDINGS.includes(l.ending)) l.ending = null;
      l.days = (Array.isArray(l.days) ? l.days : []).filter(isObject) as unknown as LeaseState['days'];
      l.sold = (Array.isArray(l.sold) ? l.sold : []).filter(isObject) as unknown as LeaseState['sold'];
      if (l.fortunes) l.fortunes = l.fortunes.map(k => (k === null || FORTUNE_KINDS.includes(k) ? k : null));
      out.lease = l;
    }
  }
  return out;
}

/** The save as text (what writeSave stores, and parseSave reads back). */
export function saveText(g: Game, w: WorldState): string {
  const file: SaveFile = { v: SAVE_VERSION, savedAt: Date.now(), game: gameToJson(g), world: w };
  return JSON.stringify(file);
}

export function writeSave(g: Game, w: WorldState) {
  try { setItem(KEYS.save, saveText(g, w)); } catch { /* storage full or blocked: play on without saving */ }
}

/** A save as text (localStorage, or the day-start copy) to a game, or null if it isn't one we can load. Never throws. */
export function parseSave(raw: string): { game: Game; world: WorldState } | null {
  try {
    const file: unknown = JSON.parse(raw);
    if (!isObject(file) || file.v !== SAVE_VERSION || !isObject(file.game)) return null;
    const game = gameFromJson(file.game);
    const world = worldFromJson(file.world, game);
    if (!playsOn(saveText(game, world))) { track('save_refused', { day_index: game.dayIndex }); return null; }
    return { game, world };
  } catch {
    return null; // corrupt save: start fresh rather than crash
  }
}

export function readSave(): { game: Game; world: WorldState } | null {
  const raw = getItem(KEYS.save);
  return raw ? parseSave(raw) : null;
}

export function clearSave() {
  removeItem(KEYS.save);
}

/** Wipe the save and reload into a brand-new game: starting cash, day 1, no upgrades. */
export function startOver(cash: number, dayIndex: number) {
  track('start_over', { cash: Math.round(cash), day_index: dayIndex, in_debt: cash < 0 });
  clearSave();
  // give the analytics beacon a moment to leave before the page goes away
  setTimeout(() => location.reload(), 200);
}
