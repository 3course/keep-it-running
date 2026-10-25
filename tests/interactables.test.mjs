// Every interactable in the shed (each object src/world/interactables.ts has actions for): set up the moment
// its action makes sense, walk there, tap the label with a finger, and check the game did what the label
// said. One new game per object.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { frames, freshGame, freshMate, holdLabel, labels, mateNow, setTime, startBrowser, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const C = env.config;
const $ = n => `$${Math.round(n)}`;

/** Ply on the pallet for the first job in the queue (day 1 starts with none until the truck's unloaded). */
const stockNext = game => game.eval((g, w, s, boardCost) => {
  const t = g.queued[0].type;
  g.stock[t] = 5; g.stockValue[t] = 5 * boardCost[t];
  return g.nextUp().material;
}, Object.fromEntries(C.jobs.types.map(t => [t.id, t.boardCost])));

/** A spot fire at the exhaust unit end of the duct. */
const startFire = game => game.eval(g => { g.fire = { id: 99, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; });

const CASES = {
  async machine(game) {
    await stockNext(game);
    await game.eval((g, w) => { w.carrying = 'sheet'; });
    await walkTo(game, 'machine');
    assert.equal((await tapLabel(game, 'Load sheet')).said, 'Sheet on the bed');
    assert.deepEqual(await game.eval((g, w) => [w.bed, w.carrying]), ['placed', null]);
    assert.equal((await tapLabel(game, 'Clamp')).said, 'Sheet clamped');
    assert.equal(await game.eval((g, w) => w.bed), 'clamped');
    assert.equal((await tapLabel(game, 'Start')).said, 'Cut started');
    assert.deepEqual(await game.eval((g, w) => [w.bed, g.machine, w.bedJobId === g.current?.id]), ['running', 'loading', true]);
  },

  async plyPallet(game) {
    const material = await stockNext(game);
    await walkTo(game, 'plyPallet');
    assert.equal((await tapLabel(game, `Grab sheet (${material})`)).said, `Grabbed a sheet of ${material}`);
    assert.deepEqual(await game.eval((g, w) => [w.carrying, g.inHand !== null]), ['sheet', true]);
  },

  async finishedPallet(game) {
    await game.eval((g, w) => { w.carrying = 'cut'; });
    await walkTo(game, 'finishedPallet');
    assert.equal((await tapLabel(game, 'Stack it')).said, 'Cut sheet stacked for pickup');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.finishedStack, w.utePresent]), [null, 1, true]);
  },

  async offcutBin(game) {
    await game.eval((g, w) => { w.carrying = 'scrap'; w.offcutBin = 0.25; });
    await walkTo(game, 'offcutBin');
    assert.equal((await tapLabel(game, 'Bin the scrap')).said, 'Scrap binned');
    assert.equal(await game.eval((g, w) => w.carrying), null);
    // that filled it past bagging level
    assert.equal((await tapLabel(game, 'Bag the offcuts')).said, 'Offcuts bagged');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.offcutBin]), ['offcuts', 0]);
  },

  async skip(game) {
    await game.eval((g, w) => { w.carrying = 'offcuts'; });
    await walkTo(game, 'skip');
    assert.equal((await tapLabel(game, 'Tip it in')).said, 'Tipped in the skip');
    assert.equal(await game.eval((g, w) => w.carrying), null);
  },

  async bitRack(game) {
    const cash = await game.eval(g => { g.wear.bit = 0.3; return g.cash; });
    await walkTo(game, 'bitRack');
    assert.equal((await tapLabel(game, `Swap bit (${$(C.consumables.bit.replaceCost)})`)).said, 'Swapping the bit');
    assert.deepEqual(await game.eval((g, w) => [g.replacing?.key, w.watchingSwap, g.cash]), ['bit', 'bit', cash - C.consumables.bit.replaceCost]);
  },

  async extractor(game) {
    const cash = await game.eval(g => { g.wear.filter = 0.3; return g.cash; });
    await walkTo(game, 'extractor');
    assert.equal((await tapLabel(game, `Change bag (${$(C.consumables.filter.replaceCost)})`)).said, 'Changing the extractor bag');
    assert.deepEqual(await game.eval((g, w) => [g.replacing?.key, w.watchingSwap, g.cash]), ['filter', 'filter', cash - C.consumables.filter.replaceCost]);
  },

  async compressor(game) {
    await walkTo(game, 'compressor');
    assert.equal((await tapLabel(game, 'Check compressor')).said, "Compressor checked — pressure's fine");
  },

  async exhaust(game) {
    await startFire(game);
    await game.eval((g, w) => { w.carrying = 'extinguisher'; w.hooks.wall = false; w.extinguisherFrom = 'wall'; });
    await walkTo(game, 'exhaust');
    const lift = await holdLabel(game, 'Hold to spray');
    try {
      await game.page.waitForFunction(() => window.kir.spraying, null, { timeout: 2_000 }).catch(() => assert.fail('holding the label should spray'));
      assert.equal((await game.eval(g => g.fireResponse))?.step, 'atDuct', 'at the duct, spraying');
    } finally { await lift(); }
    await game.page.waitForFunction(() => !window.kir.spraying, null, { timeout: 2_000 }).catch(() => assert.fail('lifting the finger should stop spraying'));
    await waitForLabel(game, 'Hold to spray');
  },

  async extinguisher(game) {
    await startFire(game);
    await walkTo(game, 'extinguisher');
    assert.equal((await tapLabel(game, 'Grab extinguisher')).said, 'Grabbed the extinguisher');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.hooks.wall, w.extinguisherFrom]), ['extinguisher', false, 'wall']);
    assert.equal((await tapLabel(game, 'Hang it up')).said, 'Extinguisher back on its hook');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.hooks.wall]), [null, true]);
  },

  async spareExtinguisher(game) {
    await startFire(game);
    await walkTo(game, 'spareExtinguisher');
    assert.equal((await tapLabel(game, 'Grab extinguisher')).said, 'Grabbed the extinguisher');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.hooks.shed, w.extinguisherFrom]), ['extinguisher', false, 'shed']);
    assert.equal((await tapLabel(game, 'Hang it up')).said, 'Extinguisher back on its hook');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.hooks.shed]), [null, true]);
  },

  async rollerDoor(game) {
    // day 1: last week's ply order is on the apron, waiting for a signature
    assert.equal(await game.eval(g => g.truckOnApron?.stage), 'waiting');
    await walkTo(game, 'rollerDoor');
    assert.equal((await tapLabel(game, 'Open the roller door')).said, 'Roller door up');
    assert.ok(await game.eval((g, w) => w.rollerUpUntil !== null));
    assert.equal((await tapLabel(game, 'Sign for the ply')).said, 'Signed for the ply');
    const left = await game.eval(g => g.truckOnApron.bundles.length);
    assert.equal(await game.eval(g => g.truckOnApron.stage), 'unloading');
    assert.equal((await tapLabel(game, `Grab a bundle (${left} left)`)).said, 'Grabbed a bundle of ply');
    assert.equal(await game.eval((g, w) => w.carrying), 'bundle');
  },

  async smoko(game) {
    await setTime(game, 10);
    const mate = await freshMate(game);
    await walkTo(game, 'smoko');
    assert.equal((await tapLabel(game, 'Have a yarn')).said, `Yarning with ${mate.name}`);
    assert.equal((await mateNow(game)).engaged, true);
  },

  async phone(game) {
    await game.eval(g => { g.spawnDistraction('phone'); });
    await walkTo(game, 'phone');
    assert.ok((await labels(game)).includes('Order ply'), 'you can always order ply from the phone');
    assert.equal((await tapLabel(game, 'Answer')).said, 'Answered the phone');
    assert.deepEqual(await game.eval(g => [g.busy?.label, g.distractions.some(d => d.kind === 'phone')]), ['on the phone', false]);
  },

  async desk(game) {
    await walkTo(game, 'desk');
    assert.equal((await tapLabel(game, 'Order ply')).said, 'On to the supplier');
    assert.ok(await game.eval((g, w, s) => s.hud.plyShowing), 'the ply order card is up');
  },

  async fridge(game) {
    await setTime(game, C.beer.fridgeUnlockHour);
    const cash = await game.eval(g => g.cash);
    await walkTo(game, 'fridge');
    assert.equal((await tapLabel(game, `Beer (${$(C.beer.cost)})`)).said, 'Cracked a beer');
    assert.deepEqual(await game.eval(g => [!!g.heldCan, g.cash]), [true, cash - C.beer.cost]);
  },

  async toilet(game) {
    await game.eval(g => { g.looSince = g.minute; });
    await walkTo(game, 'toilet');
    assert.equal((await tapLabel(game, 'Use the loo')).said, 'Off to the loo');
    assert.deepEqual(await game.eval((g, w) => [g.needLoo, w.toiletUntil !== null]), [false, true]);
  },
};

describe('interactables', () => {
  it('has a case for every object with actions', async () => {
    // the objects actionsFor() has a `case` for; the rest (duct, racks, bags) are scenery
    const src = readFileSync(new URL('../src/world/interactables.ts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('export function actionsFor'), src.indexOf('export function statusFor'));
    const withActions = [...body.matchAll(/case '(\w+)':/g)].map(m => m[1]);
    const { OBJECTS } = await env.load('/src/world/layout.ts');
    for (const id of withActions) assert.ok(OBJECTS.some(o => o.id === id), `${id} is in the shed`);
    assert.deepEqual(Object.keys(CASES).sort(), withActions.sort());
    assert.equal(withActions.length, 17);
  });

  // the exhaust unit's glow: a spot fire only smokes at first; day 2's lesson fire (CONFIG.fire.lesson) glows from the start
  it('exhaust glow: smoke first, but the lesson fire glows at once', async () => {
    const game = await freshGame(env);
    try {
      const glowing = async fire => {
        await game.eval((g, w, s, f) => { g.fire = f; }, fire);
        await frames(game);
        return game.eval((g, w, s) => s.effects.fireGroup.visible);
      };
      assert.equal(await glowing({ id: 1, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }), false, 'a new spot fire is just smoke');
      assert.equal(await glowing({ id: 1, stage: 'spot', minutes: C.fire.smokeOnlyMinutes, sprayed: 0, heat: 0 }), true, 'then it glows');
      assert.equal(await glowing({ id: 2, stage: 'spot', minutes: 0, sprayed: 0, heat: 0, lesson: true }), true, 'the lesson fire glows straight away');
    } finally { await game.close(); }
  });

  for (const [id, run] of Object.entries(CASES)) {
    it(id, async () => {
      const game = await freshGame(env);
      try {
        await run(game);
        await frames(game);
      } finally { await game.close(); }
    });
  }
});
