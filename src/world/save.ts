// Save and restore the whole game — economy and world — to localStorage, so closing the app is a pause.
// Game.ts isn't touched: its fields (including private ones, which are ordinary properties at runtime)
// are copied out and back in, with the few non-JSON bits (RNG state, the upgrade Set, fault references,
// the current-job reference) handled by hand.
import { FAULTS } from '../data/faults.js';
import { Game } from '../sim/Game.js';
import { Rng } from '../sim/rng.js';
import type { Job } from '../sim/types.js';
import type { WorldState } from './state.js';
import { WORLD } from './worldConfig.js';

const SAVE_VERSION = 2; // 2: positions in metres (Three.js world)

interface SaveFile { v: number; savedAt: number; game: Record<string, unknown>; world: WorldState }

type Loose = Record<string, unknown>;

function gameToJson(g: Game): Loose {
  const out: Loose = {};
  for (const [k, v] of Object.entries(g as unknown as Loose)) out[k] = v;
  out.rng = { s: (g.rng as unknown as { s: number }).s };
  out.upgrades = [...g.upgrades];
  out.current = g.current ? g.current.id : null;
  out.fault = g.fault ? { ...g.fault, def: g.fault.def.id, path: g.fault.path?.id ?? null } : null;
  return out;
}

function gameFromJson(data: Loose): Game {
  const g = new Game();
  const target = g as unknown as Loose;
  for (const [k, v] of Object.entries(data)) target[k] = v;
  const rng = new Rng();
  (rng as unknown as { s: number }).s = (data.rng as { s: number }).s;
  g.rng = rng;
  g.upgrades = new Set(data.upgrades as Game['upgrades'] extends Set<infer U> ? U[] : never);
  const jobs = data.jobs as Job[];
  g.jobs = jobs;
  g.current = data.current == null ? null : jobs.find(j => j.id === data.current) ?? null;
  const f = data.fault as (Loose & { def: string; path: string | null }) | null;
  if (f) {
    const def = FAULTS.find(d => d.id === f.def)!;
    g.fault = { ...(f as unknown as NonNullable<Game['fault']>), def, path: f.path ? def.paths.find(p => p.id === f.path) : undefined };
  } else g.fault = null;
  return g;
}

export function writeSave(g: Game, w: WorldState) {
  const file: SaveFile = { v: SAVE_VERSION, savedAt: Date.now(), game: gameToJson(g), world: w };
  try { localStorage.setItem(WORLD.saveKey, JSON.stringify(file)); } catch { /* storage full or blocked: play on without saving */ }
}

export function readSave(): { game: Game; world: WorldState } | null {
  try {
    const raw = localStorage.getItem(WORLD.saveKey);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (file.v !== SAVE_VERSION) return null;
    return { game: gameFromJson(file.game), world: file.world };
  } catch {
    return null; // corrupt save: start fresh rather than crash
  }
}

export function clearSave() {
  try { localStorage.removeItem(WORLD.saveKey); } catch { /* ignore */ }
}
