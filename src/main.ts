import { initAnalytics, track } from './analytics.js';
import { Game } from './sim/Game.js';
import { showRendererFailure } from './ui/failure.js';
import { World3D } from './world3d/app.js';
import { describeGpu, probeGpu, type GpuInfo } from './world3d/gpu.js';
import { readSave } from './world/save.js';
import { newWorld } from './world/state.js';
import { dailyStart } from './world/daily.js';

initAnalytics();

// ?daily: today's daily (Melbourne date), from the canonical start, saving nothing but the result
const daily = new URLSearchParams(location.search).has('daily');
// Closing the app is a pause: pick up exactly where the last session left off, clock stopped.
const saved = daily ? null : readSave();
// ?seed=N starts a new game on that seed (reproducible: the browser tests use it); otherwise a random one
const seed = Number(new URLSearchParams(location.search).get('seed')) || undefined;
const start = daily ? dailyStart() : null;
const game = start?.game ?? saved?.game ?? new Game(seed);
const world = start?.world ?? saved?.world ?? newWorld(game);
// ?event=<id> (council, bigJob, uteClip): force that rare event on day 1, landing soon after the clock starts
const forced = new URLSearchParams(location.search).get('event');
if (forced && game.dayIndex === 1 && !game.rare && !game.forceRareEvent(forced)) console.warn(`[Keep It Running] no rare event "${forced}"`);
// new_game = a fresh start; resume = someone coming back to a saved game (that's the retention number)
track(saved ? 'resume_game' : 'new_game', { day_index: game.dayIndex, cash: Math.round(game.cash) });

// what the GPU can do decides the render tier (?safe=1 forces the plain one)
const gpu = probeGpu();
// handy for poking at balance from the console: window.kir.cash = 9999
Object.assign(window as unknown as { kir: Game; kirGpu: GpuInfo }, { kir: game, kirGpu: gpu });

try {
  new World3D(document.getElementById('game')!, game, world, !!saved, gpu, daily ? 'daily' : 'lease');
} catch (e) {
  // no WebGL, or the renderer died being made: say so, with the details, instead of a blank canvas
  showRendererFailure(describeGpu(gpu, e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
}
