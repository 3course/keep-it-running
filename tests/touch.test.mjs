// Touch: a visiting mate, answered with a finger. They come up to you with something to say; before the fridge opens
// (2pm) a yes is "Have a yarn", from 2pm a beer ask is "Grab <Name> a beer ($8)" — a beer for them out of your fridge
// and a longer chat — within the day's caps. "Flat out, sorry" sends them wandering; they come back after a cooldown.
// They stay the whole visit whatever you say. Every run is a new game on a fixed seed, with a mate who's just walked in.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { advance, freshGame, freshMate, labels, mateNow, setTime, startBrowser, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const V = env.config.visitors, F = env.config.distractions.friend, BEER = env.config.beer;

const FLAT_OUT = '"Flat out, sorry"';
const hhmm = ([h, m]) => `${h}:${String(m).padStart(2, '0')}`;
const yes = shown => shown.filter(t => t !== FLAT_OUT);

/** New game, you at the smoko chairs, the clock at `time`, `beers` already given out today, and a mate who's just walked in. */
async function mateDropsIn([h, m], { mate: mateId, beers } = {}) {
  const game = await freshGame(env);
  await walkTo(game, 'smoko');
  await setTime(game, h, m);
  if (beers) await game.eval((g, w, s, b) => { g.visitorBeers = b; }, beers);
  const mate = await freshMate(game, mateId);
  assert.ok(mate.ask, 'they come straight over with something to say');
  assert.equal(mate.engaged, false, 'not yarning yet');
  assert.equal(mate.beers, 0);
  return { game, mate };
}

/** The mate's come up and is waiting for an answer: their line's over their head and the labels are up. */
async function asked(game, mate, yesLabel) {
  await waitForLabel(game, yesLabel, 20_000); // they walk over to you
  const shown = await labels(game);
  assert.ok(shown.includes(FLAT_OUT), `"Flat out" is offered too: ${JSON.stringify(shown)}`);
  const now = await mateNow(game);
  assert.equal(await game.eval((g, w, s) => s.hud.mateBubble.textContent), now.ask.text, 'what they said is over their head');
  return now;
}

/** Tick a minute at a time until the mate comes up again (or `max` minutes). */
async function untilTheyComeBack(game, max = 30) {
  for (let i = 1; i <= max; i++) { await advance(game, 1); if ((await mateNow(game))?.ask) return i; }
  return null;
}

describe('before 2pm: "Have a yarn"', () => {
  for (const time of [[9, 0], [13, 59]]) {
    it(`at ${hhmm(time)}`, async () => {
      const { game, mate } = await mateDropsIn(time);
      try {
        assert.equal(mate.ask.kind, 'cuppa', 'a cuppa or a yarn, not a beer');
        await asked(game, mate, 'Have a yarn');
        assert.ok(!(await labels(game)).some(t => /beer/i.test(t)), 'no beer before the fridge opens');

        const cash = await game.eval(g => g.cash);
        assert.equal((await tapLabel(game, 'Have a yarn')).said, `Yarning with ${mate.name}`);
        const now = await mateNow(game);
        assert.equal(now.engaged, true, 'yarning now');
        assert.equal(now.beers, 0, 'no beer for them');
        assert.equal(await game.eval(g => g.cash), cash, 'a yarn is free');
        await game.page.waitForFunction(() => !window.kirScene.labelScreens().some(l => l.text === 'Have a yarn'));
        assert.deepEqual(yes(await labels(game)), [], 'mid-yarn: only "Flat out" left');
      } finally { await game.close(); }
    });
  }
});

describe('after 2pm: "Grab <Name> a beer"', () => {
  const times = [[14, 0], [15, 30], [16, 15]];
  for (const [i, m] of env.mates.entries()) {
    const time = times[i % times.length];
    it(`${m.name} at ${hhmm(time)}, and they don't leave after it`, async () => {
      const { game, mate } = await mateDropsIn(time, { mate: m.id });
      try {
        assert.equal(mate.name, m.name);
        assert.equal(mate.ask.kind, 'beer');
        const label = `Grab ${m.name} a beer ($${BEER.cost})`;
        await asked(game, mate, label);
        assert.ok(!(await labels(game)).includes('Have a yarn'), 'they asked for a beer');

        const cash = await game.eval(g => g.cash);
        assert.equal((await tapLabel(game, label)).said, `Having a beer with ${m.name}`);
        const now = await mateNow(game);
        assert.equal(now.beers, 1, 'they got their beer');
        assert.equal(now.chat, F.beerChatMinutes, 'and a beer-length yarn');
        assert.equal(await game.eval(g => g.cash), cash - BEER.cost, 'out of your fridge');

        await advance(game, F.beerChatMinutes);
        const after = await mateNow(game);
        assert.ok(after && after.id === mate.id, 'still here after the beer');
        assert.equal(after.engaged, false, 'done yarning: wandering again');
      } finally { await game.close(); }
    });
  }
});

describe('visits', () => {
  it(`a mate stays the full ${V.visitMinutes} minutes, whatever you say`, async () => {
    const { game, mate } = await mateDropsIn([10, 0]);
    try {
      await asked(game, mate, 'Have a yarn');
      await tapLabel(game, 'Have a yarn');
      for (let m = 1; m < V.visitMinutes; m++) {
        await advance(game, 1);
        const now = await mateNow(game);
        assert.ok(now?.id === mate.id, `still here at minute ${m}`);
        // answer every time they come up: "flat out" on alternate goes
        if (now.ask && !now.engaged) await game.eval((g, w, s, a) => { g.respond(a.id, a.flat ? 'disengage' : 'chat'); }, { id: mate.id, flat: m % 2 === 0 });
      }
      await advance(game, 1);
      assert.equal(await mateNow(game), null, `gone after ${V.visitMinutes} minutes`);
      assert.equal(await game.eval((g, w, s) => s.built.mate.visible), false, 'and out of the shed');
      assert.deepEqual(await labels(game), []);
    } finally { await game.close(); }
  });

  it(`"Flat out, sorry": they wander off and come back after ${V.waveOffCooldown} minutes`, async () => {
    const { game, mate } = await mateDropsIn([10, 0]);
    try {
      await asked(game, mate, 'Have a yarn');
      assert.equal((await tapLabel(game, FLAT_OUT)).said, `Sent ${mate.name} off for a bit`);
      const now = await mateNow(game);
      assert.ok(now?.id === mate.id && !now.ask && !now.engaged, 'still here, off wandering');
      await game.page.waitForFunction(() => !window.kirScene.labelScreens().some(l => l.text === 'Have a yarn'));
      assert.equal(await untilTheyComeBack(game), V.waveOffCooldown, 'back once the wave-off cooldown is up');
      await asked(game, mate, 'Have a yarn'); // walked back over
      assert.equal((await tapLabel(game, 'Have a yarn')).said, `Yarning with ${mate.name}`);
    } finally { await game.close(); }
  });

  it(`after a yarn they leave you alone for at least ${V.cooldownMin} minutes`, async () => {
    const { game, mate } = await mateDropsIn([10, 0]);
    try {
      await asked(game, mate, 'Have a yarn');
      await tapLabel(game, 'Have a yarn');
      await advance(game, V.yarnMinutes);
      assert.equal((await mateNow(game)).engaged, false, 'the yarn is over');
      const gap = await untilTheyComeBack(game);
      assert.ok(gap >= V.cooldownMin && gap <= V.cooldownMax, `back after ${gap} minutes`);
    } finally { await game.close(); }
  });

  it(`past ${V.beersPerVisitor} beers for that mate today: a yarn, not a beer`, async () => {
    const m = env.mates[0];
    const { game, mate } = await mateDropsIn([15, 0], { mate: m.id, beers: { [m.id]: V.beersPerVisitor } });
    try {
      assert.equal(mate.ask.kind, 'cuppa');
      await asked(game, mate, 'Have a yarn');
      assert.ok(!(await labels(game)).some(t => /beer/i.test(t)), 'no beer offered');
    } finally { await game.close(); }
  });

  it(`past ${V.beersPerDay} beers for all the mates today: a yarn, not a beer`, async () => {
    const [a, b, c] = env.mates;
    const { game, mate } = await mateDropsIn([15, 0], { mate: c.id, beers: { [a.id]: V.beersPerVisitor, [b.id]: V.beersPerDay - V.beersPerVisitor } });
    try {
      assert.equal(mate.ask.kind, 'cuppa', `${c.name} hasn't had one, but the day's cap is reached`);
      await asked(game, mate, 'Have a yarn');
      assert.ok(!(await labels(game)).some(t => /beer/i.test(t)), 'no beer offered');
    } finally { await game.close(); }
  });
});
