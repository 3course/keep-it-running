// Touch: a visiting mate, answered with a finger. They come up to you with something to say, and you've four answers:
// "Yeah, what's up?" (a yarn: their line, your two replies and a way out), "Give us a hand?", a beer ("Beer after two?"
// before the fridge opens, "Grab you a beer?" after, within the day's caps) and "Flat out, sorry" (they wander off and
// come back after a cooldown). They stay the whole visit whatever you say. Every run is a new game on a fixed seed, with
// a mate who's just walked in. (Helping and handing over a beer: tests/visitor-help.test.mjs.)
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { advance, frames, freshGame, freshMate, labels, mateNow, setTime, startBrowser, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const V = env.config.visitors;

const FLAT_OUT = '"Flat out, sorry"';
const hhmm = ([h, m]) => `${h}:${String(m).padStart(2, '0')}`;
const YARN = '"Yeah, what\'s up?"', HAND = '"Give us a hand?"', BEER_LATER = '"Beer after two?"', BEER_NOW = '"Grab you a beer?"';
/** New game, you at the sheet racks in the dock (nothing of their own to tap), the clock at `time`, `beers` already given out today, and a mate who's just walked in. */
async function mateDropsIn([h, m], { mate: mateId, beers } = {}) {
  const game = await freshGame(env);
  await walkTo(game, 'racks');
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

describe('before 2pm: a yarn, a hand, "Beer after two?"', () => {
  for (const time of [[9, 0], [13, 59]]) {
    it(`at ${hhmm(time)}`, async () => {
      const { game, mate } = await mateDropsIn(time);
      try {
        await asked(game, mate, YARN);
        const shown = await labels(game);
        for (const l of [YARN, HAND, BEER_LATER, FLAT_OUT]) assert.ok(shown.includes(l), `${l} in ${JSON.stringify(shown)}`);
        assert.ok(!shown.includes(BEER_NOW), 'no beer before the fridge opens');

        const cash = await game.eval(g => g.cash);
        assert.equal((await tapLabel(game, YARN)).said, `Yarning with ${mate.name}`);
        assert.equal((await mateNow(game)).engaged, true, 'yarning now');
        // the knock-off way: their line over their head, two replies of yours and a way out
        await game.page.waitForFunction(() => document.querySelectorAll('#kir-hud .replies.visit button').length === 3, null, { timeout: 15_000 });
        const opts = await game.eval((g, w, s) => s.mateVisit.talk.options);
        assert.equal(opts[2], 'Better get back to it');
        assert.equal(await game.eval(g => g.cash), cash, 'a yarn is free');
        assert.deepEqual(await labels(game), [], 'mid-yarn: the replies are the answer, not labels');
      } finally { await game.close(); }
    });
  }
});

describe('after 2pm: "Grab you a beer?"', () => {
  const times = [[14, 0], [15, 30], [16, 15]];
  for (const [i, m] of env.mates.entries()) {
    const time = times[i % times.length];
    it(`${m.name} at ${hhmm(time)}: the offer, and you go and get it`, async () => {
      const { game, mate } = await mateDropsIn(time, { mate: m.id });
      try {
        assert.equal(mate.name, m.name);
        await asked(game, mate, BEER_NOW);
        assert.ok(!(await labels(game)).includes(BEER_LATER));
        const cash = await game.eval(g => g.cash);
        await tapLabel(game, BEER_NOW);
        assert.equal(await game.eval(g => g.cash), cash, 'nothing spent till you fetch it');
        assert.match(await game.eval((g, w, s) => s.hud.pad.textContent), new RegExp(`Grab ${m.name} a beer from the fridge`));
      } finally { await game.close(); }
    });
  }
});

describe('visits', () => {
  it(`a mate stays the full ${V.visitMinutes} minutes, whatever you say`, async () => {
    const { game, mate } = await mateDropsIn([10, 0]);
    try {
      await asked(game, mate, YARN);
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
      await asked(game, mate, YARN);
      assert.equal((await tapLabel(game, FLAT_OUT)).said, `Sent ${mate.name} off for a bit`);
      const now = await mateNow(game);
      assert.ok(now?.id === mate.id && !now.ask && !now.engaged, 'still here, off wandering');
      await game.page.waitForFunction(y => !window.kirScene.labelScreens().some(l => l.text === y), YARN);
      assert.equal(await untilTheyComeBack(game), V.waveOffCooldown, 'back once the wave-off cooldown is up');
      await asked(game, mate, YARN); // walked back over
      assert.equal((await tapLabel(game, YARN)).said, `Yarning with ${mate.name}`);
    } finally { await game.close(); }
  });

  it(`after a yarn they leave you alone for at least ${V.cooldownMin} minutes`, async () => {
    const { game, mate } = await mateDropsIn([10, 0]);
    try {
      await asked(game, mate, YARN);
      await tapLabel(game, YARN);
      // call it: "Better get back to it"
      await game.page.waitForFunction(() => document.querySelectorAll('#kir-hud .replies.visit button').length === 3, null, { timeout: 15_000 });
      await game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .replies.visit button')].at(-1).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
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
      await asked(game, mate, YARN);
      assert.ok(!(await labels(game)).some(t => /beer/i.test(t)), 'no beer offered');
    } finally { await game.close(); }
  });

  it(`past ${V.beersPerDay} beers for all the mates today: a yarn, not a beer`, async () => {
    const [a, b, c] = env.mates;
    const { game, mate } = await mateDropsIn([15, 0], { mate: c.id, beers: { [a.id]: V.beersPerVisitor, [b.id]: V.beersPerDay - V.beersPerVisitor } });
    try {
      assert.equal(mate.ask.kind, 'cuppa', `${c.name} hasn't had one, but the day's cap is reached`);
      await asked(game, mate, YARN);
      assert.ok(!(await labels(game)).some(t => /beer/i.test(t)), 'no beer offered');
    } finally { await game.close(); }
  });
});

describe('his answer buttons sit over what he says (playtest 1)', () => {
  for (const spot of ['racks', 'machine', 'phone']) {
    it(`you at the ${spot}: no button under his bubble, and the labels paint over it`, async () => {
      const game = await freshGame(env);
      try {
        await game.page.evaluate(() => document.querySelectorAll('.lettercard').forEach(e => e.remove()));
        await walkTo(game, spot);
        await setTime(game, 10, 0);
        await freshMate(game);
        await waitForLabel(game, YARN, 20_000);
        await frames(game);
        const r = await game.page.evaluate(() => {
          const bub = document.querySelector('#kir-hud .bubble.say'), b = bub.getBoundingClientRect();
          const his = [...document.querySelectorAll('#kir-hud .lbl')].find(l => [...l.querySelectorAll('button')].some(x => x.textContent.includes("what's up")));
          const hits = [...his.querySelectorAll('button')].filter(x => { const q = x.getBoundingClientRect(); return q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top; }).map(x => x.textContent);
          const labels = document.querySelector('#kir-hud .labels');
          return { shown: getComputedStyle(bub).display !== 'none', hits, labelsAfter: !!(bub.compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING) };
        });
        assert.ok(r.shown, 'his line is up');
        assert.deepEqual(r.hits, [], 'none of his answer buttons under the bubble');
        assert.ok(r.labelsAfter, 'the labels layer paints over the speech bubbles');
      } finally { await game.close(); }
    });
  }
});
