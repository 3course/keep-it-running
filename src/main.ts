import { initAnalytics, track } from './analytics.js';
import { Game } from './sim/Game.js';
import { showRendererFailure } from './ui/failure.js';
import { World3D } from './world3d/app.js';
import { describeGpu, probeGpu, type GpuInfo } from './world3d/gpu.js';
import { readSave } from './world/save.js';
import { newWorld } from './world/state.js';
import { graphicsSearch } from './settings.js';
import { dayHeading } from './world/lease.js';
import { dailyStart, seedParam, shiftSeed } from './world/daily.js';
import { getItem, KEYS, removeItem } from './storage.js';
import { checkSwKill, checkSwUpdates } from './serviceWorker.js';

initAnalytics();
checkSwKill();
checkSwUpdates();

// ?daily: today's daily (Melbourne date), from the canonical start, saving nothing but the result
const daily = new URLSearchParams(location.search).has('daily');
// The seed for a new game: ?seed=N to reproduce a run (the browser tests use it), otherwise today's shift — the
// Melbourne date as YYYYMMDD, so everyone starting today gets the same day.
const asked = seedParam(location.search);
const seed = shiftSeed(location.search);
// Closing the app is a pause: pick up exactly where the last session left off, clock stopped. A ?seed=N other than
// the saved game's starts that run fresh instead (it replaces the save once it autosaves).
const stored = daily ? null : readSave();
const saved = stored && (asked === undefined || stored.game.seed === asked) ? stored : null;
const start = daily ? dailyStart(undefined, seed) : null;
const game = start?.game ?? saved?.game ?? new Game(seed);
const world = start?.world ?? saved?.world ?? newWorld(game);
// ?event=<id> (council, bigJob, uteClip): force that rare event on day 1, landing soon after the clock starts
const forced = new URLSearchParams(location.search).get('event');
if (forced && game.dayIndex === 1 && !game.rare && !game.forceRareEvent(forced)) console.warn(`[Keep It Running] no rare event "${forced}"`);
// new_game = a fresh start; resume = someone coming back to a saved game (that's the retention number)
track(saved ? 'resume_game' : 'new_game', { day_index: game.dayIndex, cash: Math.round(game.cash) });

// what the GPU can do decides the render tier (?safe=1 forces the plain one)
const gpu = probeGpu(graphicsSearch(location.search));
// handy for poking at balance from the console: window.kir.cash = 9999
Object.assign(window as unknown as { kir: Game; kirGpu: GpuInfo }, { kir: game, kirGpu: gpu });

// The title comes first on a load. Not for the daily, ?title=0 / ?intro=0 (the tests), or straight after a choice made on it
// (New game, a graphics change, Restart day reload the page and set the session's KEYS.boot).
const boot = getItem(KEYS.boot, 'session');
removeItem(KEYS.boot, 'session');
const q = new URLSearchParams(location.search);
const showTitle = !daily && !boot && q.get('title') !== '0' && q.get('intro') !== '0';
const title = showTitle ? { summary: saved && world.lease ? dayHeading(game, world.lease) : null } : null;

try {
  new World3D(document.getElementById('game')!, game, world, !!saved, gpu, daily ? 'daily' : 'lease', title);
} catch (e) {
  // no WebGL, or the renderer died being made: say so, with the details, instead of a blank canvas
  showRendererFailure(describeGpu(gpu, e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
}
