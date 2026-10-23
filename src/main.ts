import Phaser from 'phaser';
import { Game } from './sim/Game.js';
import { FactoryScene } from './scenes/FactoryScene.js';
import { DaySummaryScene, WeekSummaryScene } from './scenes/SummaryScenes.js';

const game = new Game();

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1024,
  height: 640,
  backgroundColor: '#14110f',
  scene: [FactoryScene, DaySummaryScene, WeekSummaryScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

phaser.registry.set('game', game);

// handy for poking at balance from the console: window.kir.cash = 9999
(window as unknown as { kir: Game }).kir = game;
