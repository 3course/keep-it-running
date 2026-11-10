// The machine's state after a fire or fault clears (Game.settleMachine): back to cutting only if nothing else is
// still holding it. On Game itself, no browser.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');

/** A game mid-cut, with a duct fire burning (the machine's on 'fire'). */
function cuttingWithDuctFire() {
  const g = new Game(1, 5);
  const j = g.jobs.find(x => x.status === 'queued');
  j.status = 'cutting'; g.current = j; g.machine = 'cutting';
  g.fire = { id: 1, stage: 'duct', minutes: 30, sprayed: 0, heat: 0 };
  g.machine = 'fire';
  return g;
}

describe('the machine after a fire is put out', () => {
  it('nothing else holding it: back to cutting', () => {
    const g = cuttingWithDuctFire();
    g.extinguish();
    assert.equal(g.machine, 'cutting');
  });

  it("the breaker's still off: stays paused, and resetting the breaker starts the cut", () => {
    const g = cuttingWithDuctFire();
    g.powerTripped = true;
    g.extinguish();
    assert.equal(g.machine, 'paused', 'not cutting with the power off');
    g.fireResponse = null; // (back from the duct)
    assert.equal(g.resetPower(true), true);
    assert.equal(g.machine, 'cutting');
  });

  it("the inspector's walk-round is on: stays paused, and starts again when they're done", () => {
    const g = cuttingWithDuctFire();
    g.rare = { id: 'council', phase: 'live', touring: true, escortMinutes: 0, pausedCut: false };
    g.extinguish();
    assert.equal(g.machine, 'paused', 'not cutting mid-tour');
    g.finishCouncil(true);
    assert.equal(g.machine, 'cutting', 'back on after the tour');
  });
});
