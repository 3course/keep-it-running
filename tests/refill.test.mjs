// The extinguisher refill (CONFIG.fire.refillEveryUses / refillCost): counted across days, not reset overnight, so one
// fire a day still costs a refill every second day. Checked on Game itself: no browser, the sim loaded through Vite.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const C = CONFIG.fire;

/** A spot fire, walked to and sprayed out; returns the refill charges made meanwhile. */
function putOut(g, charges) {
  g.fire = { id: 900 + g.dayIndex, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 };
  assert.ok(g.fightFire(), `day ${g.dayIndex}: off to the extinguisher`);
  g.setSpraying(true);
  for (let i = 0; i < 60 && (g.fire || g.fireResponse); i++) g.tick();
  g.setSpraying(false);
  assert.equal(g.fire, null, `day ${g.dayIndex}: fire out`);
  return charges.filter(c => c.day === g.dayIndex);
}

/** Play on to the next morning. */
function toTomorrow(g) {
  const day = g.dayIndex;
  for (let guard = 0; guard < 10_000 && g.dayIndex === day; guard++) {
    if (g.phase === 'day') g.tick();
    else if (g.phase === 'endOfDayPrompt') g.knockOff();
    else g.nextDay();
  }
}

describe('extinguisher refills', () => {
  it(`config: $${C.refillCost} every ${C.refillEveryUses} uses`, () => {
    assert.equal(C.refillCost, 60);
    assert.equal(C.refillEveryUses, 2);
  });

  it('one fire a day for four days: charged twice (days 2 and 4), $60 each, in the fixes bucket', () => {
    const g = new Game(1, 5);
    g.maybeFire = () => {}; g.maybeFault = () => {}; g.maybeDistraction = () => {};
    const charges = [];
    const spend = Object.getPrototypeOf(g).spend;
    g.spend = function (amount, bucket, note) {
      if (note === 'extinguisher refill') charges.push({ day: this.dayIndex, amount, bucket });
      return spend.call(this, amount, bucket, note);
    };
    const start = g.dayIndex;
    const perDay = [];
    for (let d = 0; d < 4; d++) {
      const fixes = g.today.fixes;
      const today = putOut(g, charges);
      perDay.push(today.length);
      if (today.length) assert.equal(g.today.fixes - fixes, C.refillCost, `day ${d + 1}: the refill is on today's fixes`);
      g.maybeFire = () => {}; g.maybeFault = () => {};
      if (d < 3) {
        toTomorrow(g);
        assert.equal(g.lastDay.fixes >= (today.length ? C.refillCost : 0), true, 'and in the day summary');
      }
    }
    assert.deepEqual(perDay, [0, 1, 0, 1], 'a refill on every second fire, across days');
    assert.equal(charges.length, 2);
    for (const c of charges) { assert.equal(c.amount, 60); assert.equal(c.bucket, 'fixes'); }
    assert.deepEqual(charges.map(c => c.day), [start + 1, start + 3]);
    assert.equal(g.extinguisherUses, 4, 'not reset overnight');
  });

  it('a new game (a fresh lease) starts the count at 0', () => {
    assert.equal(new Game(1).extinguisherUses, 0);
  });
});
