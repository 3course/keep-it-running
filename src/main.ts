import { Game } from './sim/Game.js';
import { World3D } from './world3d/app.js';
import { readSave } from './world/save.js';
import { newWorld } from './world/state.js';

// Closing the app is a pause: pick up exactly where the last session left off, clock stopped.
const saved = readSave();
const game = saved?.game ?? new Game();
const world = saved?.world ?? newWorld(game);

new World3D(document.getElementById('game')!, game, world, !!saved);

// handy for poking at balance from the console: window.kir.cash = 9999
(window as unknown as { kir: Game }).kir = game;
