// Day-to-day bookkeeping on Game, no browser: the large coffee wears off overnight, and a voicemail's
// "ring back by" time means what it says (alive at the stated minute, gone after it).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');

/** A quiet day: no faults, fires or distractions ringing over the test. */
function quiet(day = 3) {
  const g = new Game(1, day);
  g.maybeDistraction = () => {}; g.maybeFault = () => {}; g.maybeFire = () => {};
  g.jobs = []; g.orderCalls = [];
  return g;
}

describe('the large coffee', () => {
  it('wears off overnight: no speed boost from yesterday at 7am', () => {
    const g = quiet();
    g.coffeeUntil = CONFIG.cafe.largeUntilHour * 60; // bought a large this morning
    while (g.phase === 'day') g.tick();
    g.knockOff();
    g.nextDay();
    assert.equal(g.coffeeUntil, 0, "yesterday's coffee doesn't speed up today");
  });
});

describe('a voicemail callback', () => {
  it('is still there at the stated "ring back by" minute, and gone the minute after', () => {
    const g = quiet();
    g.minute = 10 * 60;
    const by = g.minute + CONFIG.jobs.orders.callbackMinutes;
    g.callbacks.push({ id: 991, customer: 'Test', sheets: 2, orderType: CONFIG.jobs.types[0].id, expiresMinute: by });
    while (g.minute < by) g.tick();
    assert.equal(g.callbacks.length, 1, `alive at ${by} (the minute the voicemail names)`);
    g.tick();
    assert.equal(g.callbacks.length, 0, 'gone the minute after');
  });
});
