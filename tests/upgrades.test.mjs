// The upgrades (CONFIG.upgrades), checked on Game itself: no browser, just the sim (and the view's state helpers)
// loaded through Vite. Each one: bought from the day summary, its price comes out of cash (as capex, not an operating
// cost), and its effect shows up against the same game without it.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const { FAULTS } = await server.ssrLoadModule('/src/data/faults.ts');
const { offcutsBagAt, newWorld } = await server.ssrLoadModule('/src/world/state.ts');
const { actionsFor } = await server.ssrLoadModule('/src/world/interactables.ts');
const { WORLD } = await server.ssrLoadModule('/src/world/worldConfig.ts');
const U = Object.fromEntries(CONFIG.upgrades.map(u => [u.id, u]));

/** A game on `day`, nothing random turning up, competence full (no slow-downs), and these upgrades bought the proper way. */
function game(owned = [], day = 4) {
  const g = new Game(1, day);
  g.maybeDistraction = () => {};
  g.competence = CONFIG.competence.max;
  g.phase = 'daySummary'; g.cash = 20_000;
  for (const id of owned) assert.ok(g.buyUpgrade(id), `bought ${id}`);
  g.phase = 'day';
  return g;
}

/** Ply for everything, and the first sheet loaded and cutting. */
function cutting(g) {
  for (const t of CONFIG.jobs.types) { g.stock[t.id] = 20; g.stockValue[t.id] = 20 * t.boardCost; }
  g.maybeFault = () => {}; g.maybeFire = () => {}; // nothing goes wrong unless the test says so
  assert.ok(g.loadNextSheet());
  while (g.machine !== 'cutting') g.tick();
  return g;
}

describe('buying', () => {
  for (const u of CONFIG.upgrades) {
    it(`${u.name}: $${u.cost} out of cash, as capex`, () => {
      const g = new Game(1);
      g.cash = 20_000;
      const cash = g.cash, costs = g.today.costs;
      g.phase = 'daySummary';
      assert.ok(g.buyUpgrade(u.id));
      assert.ok(g.upgrades.has(u.id));
      assert.equal(g.cash, cash - u.cost);
      assert.equal(g.today.upgrades, u.cost, 'on the books as an upgrade');
      assert.equal(g.today.costs, costs, 'not an operating cost');
      assert.equal(g.buyUpgrade(u.id), false, 'once only');
    });
  }
  it('not mid-shift, and not without the cash', () => {
    const g = new Game(1);
    assert.equal(g.buyUpgrade('faultSensor'), false, 'only from the day summary');
    g.phase = 'daySummary'; g.cash = U.faultSensor.cost - 1;
    assert.equal(g.buyUpgrade('faultSensor'), false);
  });
});

describe('effects', () => {
  it(`premium bits: the bit wears ${Math.round((1 - U.premiumBits.effect) * 100)}% slower`, () => {
    const worn = owned => { const g = cutting(game(owned)); for (let i = 0; i < 20; i++) g.tick(); return 1 - g.wear.bit; };
    const plain = worn([]), premium = worn(['premiumBits']);
    assert.ok(plain > 0);
    assert.ok(Math.abs(premium / plain - U.premiumBits.effect) < 1e-9, `${premium} vs ${plain}`);
  });

  it(`bag rack: changing the extractor bag takes ${U.bagRack.effect} minutes, not ${CONFIG.consumables.filter.replaceMinutes}`, () => {
    const swap = owned => { const g = game(owned); assert.ok(g.replaceConsumable('filter')); return g.replacing.remaining; };
    assert.equal(swap([]), CONFIG.consumables.filter.replaceMinutes);
    assert.equal(swap(['bagRack']), U.bagRack.effect);
    assert.equal((() => { const g = game(['bagRack']); g.replaceConsumable('bit'); return g.replacing.remaining; })(), CONFIG.consumables.bit.replaceMinutes, 'the bit swap is unchanged');
  });

  it(`bigger offcut bin: bag it at ${U.bigBin.effect * 100}% full, not ${WORLD.offcutsEmptyAt * 100}%`, () => {
    for (const [owned, at] of [[[], WORLD.offcutsEmptyAt], [['bigBin'], U.bigBin.effect]]) {
      const g = game(owned), w = newWorld(g);
      assert.equal(offcutsBagAt(g), at);
      w.offcutBin = (WORLD.offcutsEmptyAt + U.bigBin.effect) / 2; // between the two
      const bag = actionsFor('offcutBin', g, w).some(a => a.label === 'Bag the offcuts');
      assert.equal(bag, !owned.length, owned.length ? 'not worth bagging yet' : 'time to bag it');
    }
  });

  it('extinguisher by the exhaust: a shorter walk to the fire, and a third extinguisher to grab', () => {
    const walk = owned => {
      const g = game(owned);
      g.fire = { id: 1, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 };
      assert.ok(g.fightFire());
      const first = g.fireResponse.remaining;
      while (g.fireResponse.step !== 'atDuct') g.tick();
      return { first, total: g.minute - CONFIG.clock.startHour * 60 };
    };
    const plain = walk([]), near = walk(['exhaustExtinguisher']);
    assert.equal(plain.first, CONFIG.fire.walkToExtinguisherMinutes);
    assert.equal(near.first, Math.ceil(CONFIG.fire.walkToExtinguisherMinutes * U.exhaustExtinguisher.effect));
    assert.ok(near.total <= Math.ceil(plain.total * (U.exhaustExtinguisher.effect + 0.15)), `to the duct in ${near.total} min, not ${plain.total}`);
    // in the shed: only there once it's bought
    for (const owned of [[], ['exhaustExtinguisher']]) {
      const g = game(owned), w = newWorld(g);
      g.fire = { id: 1, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 };
      const grab = actionsFor('exhaustExtinguisher', g, w).map(a => a.label);
      assert.deepEqual(grab, owned.length ? ['Grab extinguisher'] : []);
    }
  });

  describe('fault sensor', () => {
    /** Cutting, then a fault nobody comes to for twice its scrap time. */
    function neglected(owned) {
      const g = cutting(game(owned));
      for (let i = 0; i < 5; i++) g.tick();
      const def = FAULTS.find(f => f.id === 'spindle');
      g.fault = { def, phase: 'diagnose', minutesOpen: 0, triedDiagnoses: [], busyRemaining: 0, busyLabel: '', stepIndex: 0, sheetScrapped: false };
      g.machine = 'fault';
      const job = g.current, progress = job.progress;
      for (let i = 0; i < def.scrapAfterMinutes * 2; i++) g.tick();
      return { g, job, progress, def };
    }

    it('without it, a fault left alone ruins the sheet', () => {
      const { g, job } = neglected([]);
      assert.equal(job.status, 'scrapped');
      assert.equal(g.today.sheetsScrapped, 1);
    });

    it('with it, the sheet waits: paused, not ruined, and the clock keeps costing machine time', () => {
      const { g, job, progress } = neglected(['faultSensor']);
      assert.equal(job.status, 'cutting', 'not scrapped');
      assert.equal(g.today.sheetsScrapped, 0);
      assert.equal(g.machine, 'fault', 'still stopped: you have to fix it');
      assert.equal(job.progress, progress, 'nothing cut while it was paused');
    });

    it('fix it and the cut resumes and finishes', () => {
      const { g, job, def } = neglected(['faultSensor']);
      g.diagnose(def.diagnoses.find(d => d.correct).id);
      g.choosePath(def.paths[0].id);
      for (let i = 0; i < 200 && g.fault; i++) { if (g.fault.phase === 'step') g.doStep(); g.tick(); }
      assert.equal(g.fault, null, 'fixed');
      for (let i = 0; i < 200 && job.status === 'cutting'; i++) g.tick();
      assert.equal(job.status, 'done');
      assert.equal(g.today.sheetsDone, 1);
      assert.equal(g.today.sheetsScrapped, 0);
    });
  });
});
