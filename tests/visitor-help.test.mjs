// A visiting mate past "Flat out": "Give us a hand?" (he does 1–4 of the jobs that are actually pending, walked to and
// done, on the notepad as he goes) and a beer you fetch from the fridge and hand him ("Give <name> the beer"). Before
// the fridge opens it's "Beer after two?": he stays and helps, or he's back at two.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, freshMate, labels, setTime, startBrowser, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { Game } = await env.load('/src/sim/Game.ts');
const { CONFIG } = await env.load('/src/config.ts');
const V = CONFIG.visitors;

/** A Game with a mate who's just walked in, at `hour`. */
function withMate(seed, hour) {
  const g = new Game(seed, 2);
  g.maybeDistraction = () => {}; g.maybeFault = () => {}; g.maybeFire = () => {};
  g.minute = hour * 60;
  g.spawnDistraction('friend');
  return { g, d: g.distractions.find(x => x.kind === 'friend') };
}

describe('a visiting mate, on Game', () => {
  it('"Give us a hand?": 1–4 jobs, more after a yarn; the visit stretches to fit', () => {
    const seen = new Set();
    let more = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = withMate(seed, 10), b = withMate(seed, 10);
      b.g.yarn(b.d.id); b.g.endYarn(b.d.id);
      const na = a.g.askHelp(a.d.id), nb = b.g.askHelp(b.d.id);
      for (const n of [na, nb]) { assert.ok(n >= V.helpMin && n <= V.helpMax, `${n}`); seen.add(n); }
      if (nb > na) more++;
      assert.ok(a.d.remaining >= na * V.helpMinutesPerTask, 'long enough to do them');
    }
    assert.ok(seen.size >= 3, `a spread of jobs: ${[...seen]}`);
    assert.ok(more >= 20, `a yarn first gets you more help (${more}/40)`);
  });

  it('handing over your can: his beer now, not yours, within the caps', () => {
    const { g, d } = withMate(3, 15);
    assert.equal(g.giveBeer(d.id), false, 'nothing in your hand');
    assert.ok(g.buyBeer());
    const day = { beers: g.today.beers, beer: g.today.beer, mate: g.today.mateBeer ?? 0 };
    assert.ok(g.giveBeer(d.id));
    assert.ok(!g.heldCan, 'the can is gone from your hand');
    assert.equal(d.beers, 1);
    assert.equal(g.today.beers, day.beers - 1, 'not one of yours');
    assert.equal(g.today.mateBeer, day.mate + CONFIG.beer.cost, 'it goes down as his');
    assert.equal(g.today.beer, day.beer - CONFIG.beer.cost);
  });

  it('"Beer after two?": he stays and helps, or he goes and comes back at two', () => {
    const outcomes = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const { g, d } = withMate(seed, 11);
      const r = g.beerAfterTwo(d.id);
      outcomes.add(r);
      if (r === 'help') assert.ok(d.remaining >= V.returnHour * 60 - g.minute, 'stays past two');
      else {
        assert.ok(!g.distractions.some(x => x.kind === 'friend'), 'gone for now');
        assert.equal(g.mateReturn.minute, V.returnHour * 60);
        while (g.minute < V.returnHour * 60) g.tick();
        assert.equal(g.distractions.find(x => x.kind === 'friend')?.mate, d.mate, 'back at two');
      }
    }
    assert.deepEqual([...outcomes].sort(), ['help', 'later']);
  });
});

describe('a visiting mate, in the shed', () => {
  it('"Give us a hand?": he does 1–4 of the jobs that are actually pending, one after another, then stops', async () => {
    const game = await freshGame(env);
    try {
      await walkTo(game, 'racks');
      await setTime(game, 10, 0);
      // pending: two boards on the bed, the old extractor bag, a full offcut bin
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.bedPile = 2; w.oldBagWaiting = true; g.offcutBin = 1; g.deliveries = []; });
      const mate = await freshMate(game);
      await waitForLabel(game, '"Give us a hand?"', 20_000);
      await tapLabel(game, '"Give us a hand?"');
      const n = await game.eval(g => g.distractions.find(x => x.kind === 'friend').helping);
      assert.ok(n >= 1 && n <= 4, `${n} jobs`);
      assert.match(await game.eval((g, w, s) => s.hud.pad.textContent), new RegExp(`${mate.name}: \\w.*\\(1 of ${n}\\)`), 'on the notepad');
      // he walks them and does them
      await game.page.waitForFunction(() => { const d = window.kir.distractions.find(x => x.kind === 'friend'); return d && !d.helping; }, null, { timeout: 150_000, polling: 250 });
      const st = await game.eval((g, w) => ({ bed: g.bedPile, stack: w.finishedStack, pallet: g.pallet, bag: w.oldBagWaiting, bin: g.offcutBin, sheet: w.bed, helped: g.distractions.find(x => x.kind === 'friend').helped }));
      // in his order: the boards, the bag, the bin, then a sheet on the bed
      const done = [st.bed === 0 && st.stack === 2 && st.pallet === 2, st.bag === false, st.bin === 0, st.sheet === 'placed'];
      assert.equal(st.helped, n, 'as many as he said');
      assert.deepEqual(done, [0, 1, 2, 3].map(i => i < n), JSON.stringify(st));
      assert.equal(await game.eval((g, w) => w.mateHelp ?? null), null, 'off the notepad when he is done');
    } finally { await game.close(); }
  });

  it('"Grab you a beer?": fetch a can, walk it over, and the "Give" prompt is on him', async () => {
    const game = await freshGame(env);
    try {
      await walkTo(game, 'racks');
      await setTime(game, 15, 0);
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); });
      const mate = await freshMate(game);
      await waitForLabel(game, '"Grab you a beer?"', 20_000);
      await tapLabel(game, '"Grab you a beer?"');
      const cash = await game.eval(g => g.cash);
      await walkTo(game, 'fridge');
      await tapLabel(game, `Beer ($${CONFIG.beer.cost})`);
      assert.ok(await game.eval(g => !!g.heldCan), 'a can in your hand');
      // over to him: he may wander while he waits, so walk up to wherever he is (re-aiming as he goes)
      const give = `Give ${mate.name} the beer`;
      for (let i = 0; i < 12 && !(await labels(game)).includes(give); i++) {
        await game.eval((g, w, s) => {
          const v = s.visitor, side = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].find(([dx, dz]) => s.walkable(Math.floor((v.x + dx) / 0.5), Math.floor((v.z + dz) / 0.5))) ?? [0, 0];
          s.walkToPoint(v.x + side[0], v.z + side[1]);
        });
        await new Promise(r => setTimeout(r, 1200));
      }
      await waitForLabel(game, give, 5_000);
      await tapLabel(game, give);
      const st = await game.eval(g => ({ can: !!g.heldCan, beers: g.distractions.find(x => x.kind === 'friend').beers, cash: g.cash}));
      assert.deepEqual([st.can, st.beers], [false, 1], 'his now');
      assert.equal(st.cash, cash - CONFIG.beer.cost, 'one can out of your fridge');
      assert.ok(!(await labels(game)).includes(give), 'nothing left to give');
      assert.ok(await game.eval((g, w, s) => s.built.mate.getObjectByName('mateCan')?.visible), 'the can in his hand');
    } finally { await game.close(); }
  });

  it('after two, "Give us a hand?": a beer from the fridge first; hand it over and he gets to work', async () => {
    const game = await freshGame(env);
    try {
      await walkTo(game, 'racks');
      await setTime(game, CONFIG.visitors.helpBeerFromHour, 30);
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.bedPile = 2; g.offcutBin = 1; });
      const mate = await freshMate(game);
      await waitForLabel(game, '"Give us a hand?"', 20_000);
      await tapLabel(game, '"Give us a hand?"');
      assert.deepEqual(await game.eval((g, w) => { const d = g.distractions.find(x => x.kind === 'friend'); return [d.beerFirst, d.helping ?? 0, w.mateBeerFor]; }), [true, 0, mate.name], 'a beer first');
      await walkTo(game, 'fridge');
      await tapLabel(game, `Beer ($${CONFIG.beer.cost})`);
      const give = `Give ${mate.name} the beer`;
      for (let i = 0; i < 12 && !(await labels(game)).includes(give); i++) {
        await game.eval((g, w, s) => { const v = s.visitor, side = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].find(([dx, dz]) => s.walkable(Math.floor((v.x + dx) / 0.5), Math.floor((v.z + dz) / 0.5))) ?? [0, 0]; s.walkToPoint(v.x + side[0], v.z + side[1]); });
        await new Promise(r => setTimeout(r, 1200));
      }
      await tapLabel(game, give);
      await game.page.waitForFunction(() => (window.kir.distractions.find(x => x.kind === 'friend')?.helping ?? 0) > 0, null, { timeout: 8_000 });
    } finally { await game.close(); }
  });
});
