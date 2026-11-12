// Neighbours: ledger, thaw, CNC while away, Mick→council, save, no events day 1.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false } });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { newWorld } = await server.ssrLoadModule('/src/world/state.ts');
const { parseSave, saveText } = await server.ssrLoadModule('/src/world/save.ts');
const { adjustFavour, neighboursActive, openTalk, pickTalk, tickNeighbours } = await server.ssrLoadModule('/src/sim/neighbours.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');

function steps(g, n) { for (let i = 0; i < n; i++) if (g.phase === 'day') g.tick(); }

describe('neighbours', () => {
  it('day 1: no neighbour ticks', () => {
    const g = new Game(42);
    assert.equal(g.dayIndex, 1);
    const before = g.distractions.length;
    tickNeighbours(g);
    assert.equal(g.distractions.length, before);
    assert.equal(neighboursActive(g, 'sal'), false);
  });

  it('ledger favour clamp and burn thaw', () => {
    const g = new Game(99, 5);
    adjustFavour(g, 'sal', 10);
    assert.equal(g.neighbours.sal.favour, CONFIG.neighbours.favourCeil);
    adjustFavour(g, 'mick', -10, true);
    assert.equal(g.neighbours.mick.favour, CONFIG.neighbours.favourFloor);
    assert.ok(g.neighbours.mick.burnedUntil > g.dayIndex);
    g.dayIndex = g.neighbours.mick.burnedUntil;
    assert.equal(neighboursActive(g, 'mick'), true, 'thawed on burn-until day');
  });

  it('CNC keeps cutting while busy walking', () => {
    const g = new Game(77, 8);
    const j = g.jobs.find(x => x.status === 'queued');
    assert.ok(j);
    g.current = j;
    j.status = 'cutting';
    g.machine = 'cutting';
    g.busy = { label: 'walking', remaining: 20 };
    const p0 = j.progress;
    steps(g, 5);
    assert.ok(j.progress > p0);
    assert.ok(g.busy.remaining > 0);
  });

  it('Mick complaint can bring council forward', () => {
    const g = new Game(123, 6);
    g.wear.filter = 0.05;
    g.mickComplaintUntil = g.minute + 5;
    steps(g, 6);
    assert.ok(g.rare?.id === 'council' || g.mickComplaintUntil === 0);
  });

  it('negotiation round-trip on save', () => {
    const g = new Game(2026, 5);
    const w = newWorld(g);
    openTalk(g, 'priya', 'visit', 'priya_offcuts');
    pickTalk(g, 0);
    const text = saveText(g, w);
    const back = parseSave(text);
    assert.ok(back);
    assert.equal(back.game.neighbours.priya.favour, g.neighbours.priya.favour);
  });
});
