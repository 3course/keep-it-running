// The chores, with teeth (CONFIG.chore): clamps (each one left off is a chance the sheet shifts and is ruined), boards
// piling on the bed (a full bed takes no sheet), the offcut bin (it spills, the heap slows you down, two loads to the
// skip), and the compressor (its hiss drops when it's due; past that, sheets lift). The rules on Game without a browser,
// then the hands-on parts in the shed: clamps tapped on one by one, the heap underfoot, the hiss.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';
import { freshGame, startBrowser, walkTo, gestureNow, labels } from './browser.mjs';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false } });
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const { WORLD } = await server.ssrLoadModule('/src/world/worldConfig.ts');
const env = await startBrowser();
after(async () => { await server.close(); await env.close(); });
const CH = CONFIG.chore;

/** A game mid-morning with plenty of ply and work, nothing else going on. */
function shed(seed = 1) {
  const g = new Game(seed, 1);
  g.minute = 8 * 60;
  for (const t of CONFIG.jobs.types) { g.stock[t.id] = 20; g.stockValue[t.id] = 20 * t.boardCost; }
  g.deliveries = []; g.distractions = []; g.orderCalls = [];
  g.maybeFault = () => {}; g.maybeFire = () => {}; g.maybeDistraction = () => {};
  for (let i = 0; i < 12; i++) g.jobs.push({ ...g.jobs[0], id: 500 + i, status: 'queued', dueDay: g.dayIndex + 1, progress: 0 });
  return g;
}
/** Load the next sheet and cut it through (or until it's ruined). Returns the job. */
function cutOne(g, clamps = CH.clamp.clamps) {
  assert.ok(g.loadNextSheet(clamps), 'loads');
  const j = g.current;
  while (g.current === j && g.phase === 'day') g.tick();
  g.busy = null;
  return j;
}
const always = g => { g.rng.chance = p => p > 0; }; // whatever can go wrong, does

describe('chores, on Game', () => {
  it('clamps: all four, and nothing shifts; each left off is a chance it shifts mid-cut and is ruined', () => {
    const g = shed(); always(g);
    assert.equal(cutOne(g).status, 'done', 'four clamps: cut clean, however unlucky');
    g.bedPile = 0;
    const j = cutOne(g, 2);
    assert.equal(j.status, 'scrapped');
    assert.equal(j.ruinedBy, 'shift');
    assert.ok(j.progress > 0 && j.progress < j.cutMinutes, 'mid-cut');
    assert.deepEqual([g.today.sheetsShifted, g.today.choreBoards], [1, j.materialCost]);
    assert.deepEqual(CH.clamp.shiftChanceByMissing.slice(0, 3), [0, CH.clamp.shiftChanceByMissing[1], CH.clamp.shiftChanceByMissing[2]]);
    assert.ok(CH.clamp.shiftChanceByMissing.every((p, i, a) => i === 0 || p > a[i - 1]), 'each clamp left off adds to it');
  });

  it('clamping takes a minute on top of loading', () => {
    const g = shed();
    g.loadNextSheet(CH.clamp.clamps);
    assert.equal(g.loadingRemaining, Math.ceil(CONFIG.jobs.loadMinutes + CH.clamp.clamps * CH.clamp.minutesPerClamp));
  });

  it(`stacking: finished boards pile on the bed; at ${CH.stack.bedHolds} it takes no sheet until they're carried off`, () => {
    const g = shed();
    for (let i = 0; i < CH.stack.bedHolds; i++) cutOne(g);
    assert.equal(g.bedPile, CH.stack.bedHolds);
    assert.ok(g.bedFull);
    assert.equal(g.loadNextSheet(), false, 'no room on the bed');
    assert.ok(g.clearBed());
    assert.equal(g.busy.remaining, CH.stack.unloadMinutes, 'one trip to the finished pallet with the lot');
    g.busy = null;
    assert.ok(g.loadNextSheet());
  });

  it(`offcuts: the bin takes ${CH.offcuts.sheetsToFill} sheets; the next spills a heap that slows loading until ${CH.offcuts.pileTrips} loads go to the skip`, () => {
    const g = shed();
    for (let i = 0; i < CH.offcuts.sheetsToFill; i++) { cutOne(g); g.bedPile = 0; }
    assert.ok(g.offcutBin > 0.999 && g.offcutPile === 0, 'full, not spilt');
    cutOne(g); g.bedPile = 0;
    assert.deepEqual([g.offcutPile, g.today.binOverflows], [CH.offcuts.pileTrips, 1]);
    g.loadNextSheet();
    assert.equal(g.loadingRemaining, Math.ceil(CONFIG.jobs.loadMinutes + CH.clamp.clamps * CH.clamp.minutesPerClamp + CH.offcuts.pileSlowMinutes), 'the heap is in the way');
    g.machine = 'idle'; g.current.status = 'queued'; g.current = null;
    for (let i = 0; i < CH.offcuts.pileTrips; i++) { assert.ok(g.clearOffcutPile()); assert.equal(g.busy.remaining, CH.offcuts.tripMinutes); g.busy = null; }
    assert.equal(g.offcutPile, 0);
    assert.ok(g.emptyOffcutBin());
    assert.equal(g.offcutBin, 0);
  });

  it(`compressor: due after ${CH.compressor.sheetsPerDrain} sheets; one more is safe, then sheets lift until it's drained`, () => {
    const g = shed(); always(g);
    for (let i = 0; i < CH.compressor.sheetsPerDrain; i++) { cutOne(g); g.bedPile = 0; g.offcutBin = 0; }
    assert.ok(g.compressorDue, 'the hiss has dropped');
    assert.equal(cutOne(g).status, 'done', 'the warning sheet');
    g.bedPile = 0; g.offcutBin = 0;
    const j = cutOne(g);
    assert.deepEqual([j.status, j.ruinedBy, g.today.sheetsLifted], ['scrapped', 'lift', 1]);
    assert.ok(g.drainCompressor());
    assert.equal(g.busy.remaining, CH.compressor.drainMinutes);
    g.busy = null;
    assert.equal(g.compressorSheets, 0);
    assert.equal(cutOne(g).status, 'done', 'drained: it holds again');
  });

  it('with CONFIG.chores off, none of it', () => {
    CONFIG.chores = false;
    try {
      const g = shed(); always(g);
      for (let i = 0; i < 8; i++) assert.equal(cutOne(g, 0).status, 'done');
      assert.deepEqual([g.bedPile, g.offcutBin, g.offcutPile, g.compressorSheets], [0, 0, 0, 0]);
      assert.equal(g.loadNextSheet(), true);
      assert.equal(g.loadingRemaining, CONFIG.jobs.loadMinutes);
    } finally { CONFIG.chores = true; }
  });

  it('the day log and the summary itemise what skipping them cost', () => {
    const g = shed(); always(g);
    cutOne(g, 1);
    assert.match(g.dayReport(), /Chores: 1 shifted \(clamps\), 0 lifted \(compressor\), boards lost \$\d+/);
  });
});

describe('chores, in the shed', () => {
  it('clamps go on one tap at a time; stop short and the sheet starts with what it has', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w, s) => {
        w.tour = null; w.bed = 'placed'; w.clamps = 0;
        const t = g.queued[0].type; g.stock[t] = 3; g.stockValue[t] = 300; g.inHand = null;
        s.loadedWith = []; const load = g.loadNextSheet.bind(g); g.loadNextSheet = c => { s.loadedWith.push(c); return load(c); };
      });
      await walkTo(game, 'machine');
      const t = await game.page.evaluate(() => { const b = [...document.querySelectorAll('#kir-hud .lbl button')].find(x => x.textContent === 'Clamp').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await game.page.touchscreen.tap(t.x, t.y);
      const card = await gestureNow(game);
      assert.equal(card.kind, 'taps');
      assert.equal(card.parts.length, 4, 'four clamps');
      for (const p of card.parts.slice(0, 2)) await game.page.touchscreen.tap(p.x, p.y);
      assert.equal(await game.eval((g, w) => w.clamps), 2, 'two on');
      const x = await game.page.evaluate(() => { const b = document.querySelector('#kir-hud .gesture .x').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await game.page.touchscreen.tap(x.x, x.y);
      assert.ok((await labels(game)).includes('Start'), 'you can start it short');
      await game.eval(async (g, w, s) => {
        const { actionsFor } = await import(new URL('src/world/interactables.ts', document.baseURI).href);
        actionsFor('machine', g, w).find(a => a.label === 'Start').run();
      });
      assert.deepEqual(await game.eval((g, w, s) => s.loadedWith), [2], 'loaded with two clamps');
    } finally { await game.close(); }
  });

  it('a spilled heap round the offcut bin slows you down until it is cleared', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; });
      await walkTo(game, 'offcutBin');
      assert.equal(await game.eval((g, w, s) => s.maxSpeed), await game.eval(g => g.walkMult()) * WORLD.maxSpeed, 'clear floor: full speed');
      await game.eval(g => { g.offcutPile = 2; });
      const slow = await game.eval((g, w, s) => s.maxSpeed);
      assert.ok(Math.abs(slow - WORLD.maxSpeed * WORLD.offcutPileWalkMult) < 1e-6, `wading: ${slow}`);
      assert.ok((await labels(game)).includes('Scoop up the offcuts (2 left)'));
    } finally { await game.close(); }
  });

  it("the compressor's hiss drops as water builds up, and comes back up when it's drained", async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; g.compressorSheets = 0; });
      await game.page.waitForTimeout(100);
      const fresh = (await game.eval((g, w, s) => s.hissNow)).freq;
      await game.eval((g, w, s, n) => { g.compressorSheets = n; }, CH.compressor.sheetsPerDrain);
      await game.page.waitForTimeout(100);
      const due = (await game.eval((g, w, s) => s.hissNow)).freq;
      assert.ok(due < fresh / 2, `due: ${due} Hz, fresh ${fresh} Hz`);
      assert.equal(due, WORLD.hiss.due);
    } finally { await game.close(); }
  });
});
