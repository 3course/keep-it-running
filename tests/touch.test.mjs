// Touch: the smoko chairs, tapped with a finger. Before the fridge opens (2pm) saying yes to a mate is
// "Have a yarn"; from 2pm it's "Grab <Name> a beer ($8)" — a beer for them out of your fridge, and a
// longer chat. Every run starts a new game with a fresh mate who hasn't started talking yet.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, freshMate, labels, mateNow, setTime, startBrowser, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

const FLAT_OUT = '"Flat out, sorry"';

/** New game, the clock at `time`, a mate who's just walked in, and you standing at the smoko chairs. */
async function atSmoko([h, m], mateId) {
  const game = await freshGame(env);
  await setTime(game, h, m);
  const mate = await freshMate(game, mateId);
  assert.equal(mate.engaged, false, 'a fresh mate is not talking yet');
  assert.equal(mate.hover, env.config.distractions.friend.hoverMinutes, 'a fresh mate is still hovering');
  assert.equal(mate.grabbedBeer, false, "a fresh mate hasn't had a beer");
  await walkTo(game, 'smoko');
  assert.equal((await mateNow(game)).engaged, false, 'still not talking when you get there');
  return { game, mate };
}

describe('smoko chairs before 2pm: "Have a yarn"', () => {
  for (const time of [[9, 0], [13, 59]]) {
    it(`at ${time[0]}:${String(time[1]).padStart(2, '0')}`, async () => {
      const { game, mate } = await atSmoko(time);
      try {
        await waitForLabel(game, 'Have a yarn');
        const shown = await labels(game);
        assert.ok(shown.includes(FLAT_OUT), `"Flat out" is offered too: ${JSON.stringify(shown)}`);
        assert.ok(!shown.some(t => /beer/i.test(t)), `no beer before the fridge opens: ${JSON.stringify(shown)}`);

        const cash = await game.eval(g => g.cash);
        const done = await tapLabel(game, 'Have a yarn');
        assert.equal(done.said, `Yarning with ${mate.name}`);
        const now = await mateNow(game);
        assert.equal(now.engaged, true, 'talking now');
        assert.equal(now.grabbedBeer, false, 'no beer for them');
        assert.equal(await game.eval(g => g.cash), cash, 'a yarn is free');

        // they're talking: the yes goes, the no stays
        await game.page.waitForFunction(() => !window.kirScene.labelScreens().some(l => /Have a yarn/.test(l.text)));
        assert.deepEqual((await labels(game)).filter(t => t !== FLAT_OUT), [], 'only "Flat out" left');
      } finally { await game.close(); }
    });
  }
});

describe('smoko chairs after 2pm: "Grab <Name> a beer"', () => {
  const times = [[14, 0], [15, 30], [16, 45]];
  for (const [i, m] of env.mates.entries()) {
    const time = times[i % times.length];
    it(`${m.name} at ${time[0]}:${String(time[1]).padStart(2, '0')}`, async () => {
      const { game, mate } = await atSmoko(time, m.id);
      const { beer, distractions } = env.config;
      try {
        assert.equal(mate.name, m.name);
        const label = `Grab ${m.name} a beer ($${beer.cost})`;
        await waitForLabel(game, label);
        const shown = await labels(game);
        assert.ok(shown.includes(FLAT_OUT), `"Flat out" is offered too: ${JSON.stringify(shown)}`);
        assert.ok(!shown.includes('Have a yarn'), `no plain yarn once the fridge is open: ${JSON.stringify(shown)}`);

        const cash = await game.eval(g => g.cash);
        const done = await tapLabel(game, label);
        assert.equal(done.said, `Having a beer with ${m.name}`);
        const now = await mateNow(game);
        assert.equal(now.engaged, true, 'talking now');
        assert.equal(now.grabbedBeer, true, 'they got their beer');
        assert.equal(now.remaining, distractions.friend.beerChatMinutes, 'and stay for a beer-length chat');
        assert.equal(await game.eval(g => g.cash), cash - beer.cost, 'the beer came out of your fridge');

        await game.page.waitForFunction(() => !window.kirScene.labelScreens().some(l => /a beer/.test(l.text)));
        assert.deepEqual((await labels(game)).filter(t => t !== FLAT_OUT), [], 'only "Flat out" left');
      } finally { await game.close(); }
    });
  }
});
