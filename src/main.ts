import Phaser from 'phaser';
import { Game } from './sim/Game.js';
import { WorldScene } from './scenes/WorldScene.js';
import { DaySummaryScene, WeekSummaryScene } from './scenes/SummaryScenes.js';
import { readSave } from './world/save.js';
import { newWorld } from './world/state.js';
import { WORLD } from './world/worldConfig.js';

// Closing the app is a pause: pick up exactly where the last session left off, clock stopped.
const saved = readSave();
const game = saved?.game ?? new Game();
const world = saved?.world ?? newWorld(game);

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD.view.width,
  height: WORLD.view.height,
  backgroundColor: '#14110f',
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { activePointers: 2 },
  scene: [WorldScene, DaySummaryScene, WeekSummaryScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

phaser.registry.set('game', game);
phaser.registry.set('world', world);
phaser.registry.set('resumePaused', !!saved);

// handy for poking at balance from the console: window.kir.cash = 9999
(window as unknown as { kir: Game }).kir = game;
