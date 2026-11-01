// The time scale (Game.timeScale / Game.scaleFor, CONFIG.clock): driven by the state, not by actions. 1x while anything's
// on (a cut, a fault, a visitor, the phone, a truck…), you're moving or something's pending; fast once you've stood still
// a moment with nothing to do; 0 behind a full screen. The day's length doesn't change; the day log says how much of it
// went by fast.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { frames, freshGame, startBrowser, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { Game } = await env.load('/src/sim/Game.ts');
const { CONFIG } = await env.load('/src/config.ts');
const C = CONFIG.clock;
const still = { held: false, moving: false, stillMs: C.fastAfterStillMs + 1, pending: false };

/** A day with nothing going on: no sheets, no calls, nobody about. */
function quiet() {
  const g = new Game(1, 3);
  g.jobs = []; g.orderCalls = []; g.distractions = []; g.deliveries = []; g.mateVisits = []; g.lateDropToday = false;
  g.maybeDistraction = () => {}; g.minute = 9 * 60;
  return g;
}

describe('the time scale, on Game', () => {
  it(`${C.fastScale}x only when nothing's on, nothing's pending and you've stood still ${C.fastAfterStillMs}ms`, () => {
    const g = quiet();
    assert.equal(g.scaleFor(still), C.fastScale);
    assert.equal(g.scaleFor({ ...still, held: true }), 0, 'behind a full screen');
    assert.equal(g.scaleFor({ ...still, moving: true }), 1, 'walking');
    assert.equal(g.scaleFor({ ...still, stillMs: C.fastAfterStillMs - 1 }), 1, 'not still long enough');
    assert.equal(g.scaleFor({ ...still, pending: true }), 1, 'something on the notepad to do');
    for (const [what, set] of [
      ['a cut running', g => { g.machine = 'cutting'; }],
      ['a fault', g => { g.fault = { def: {}, phase: 'diagnose' }; }],
      ['a mate in', g => { g.distractions = [{ id: 1, kind: 'friend' }]; }],
      ['the phone ringing', g => { g.distractions = [{ id: 2, kind: 'phone' }]; }],
      ['on a call', g => { g.busy = { label: 'on the phone', remaining: 3 }; }],
      ['a truck at the dock', g => { g.deliveries = [{ id: 1, stage: 'waiting', lines: [], bundles: [] }]; }],
      ['a fire', g => { g.fire = { id: 1, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; }],
    ]) {
      const h = quiet(); set(h);
      assert.equal(h.scaleFor(still), 1, what);
    }
  });
  it('the day log says how much of the day went by fast, and flags it past the share', () => {
    const g = quiet();
    g.timeScale = C.fastScale;
    while (g.phase === 'day') g.tick();
    const line = g.log.find(l => l.text.startsWith('Fast-forward:'))?.text ?? '';
    const m = g.today.fastMinutes;
    assert.ok(m > 0);
    assert.match(line, new RegExp(`^Fast-forward: ${m} game min \\(\\d+% of the day\\), \\d+s real — over ${Math.round(C.fastWarnShare * 100)}%: a job-queue problem`));
    // and the sim, which never speeds up, says nothing
    const s = quiet(); while (s.phase === 'day') s.tick();
    assert.ok(!s.log.some(l => l.text.startsWith('Fast-forward:')));
  });
});

describe('the time scale, in the shed', () => {
  it('stand still with nothing to do: fast, "waiting…" under the clock; the phone rings: 1x, and a beat before its pointer', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => {
        document.querySelectorAll('.lettercard').forEach(e => e.remove());
        w.tour = null; g.tick = Object.getPrototypeOf(g).tick; // the real clock
        g.jobs = []; g.orderCalls = []; g.distractions = []; g.deliveries = []; g.mateVisits = []; g.lateDropToday = false; g.minute = 9 * 60;
      });
      await walkTo(game, 'compressor');
      await game.page.waitForFunction(fast => window.kir.timeScale === fast, C.fastScale, { timeout: C.fastAfterStillMs + 4000 });
      assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .clock').textContent), /waiting…/);
      assert.match(await game.eval((g, w, s) => s.hud.pad.querySelector('h2').textContent), /waiting…/);
      const t0 = await game.eval(g => g.minute);
      await game.page.waitForTimeout(1500);
      assert.ok(await game.eval(g => g.minute) - t0 >= 3, 'the clock runs faster');
      // something fires: straight back to 1x, and the pointers hold a beat
      await game.eval(g => { g.spawnDistraction('phone'); });
      await frames(game, 2);
      const r = await game.eval((g, w, s) => ({ scale: g.timeScale, held: s.time < s.snapHoldUntil }));
      assert.deepEqual(r, { scale: 1, held: true });
      // Kerr's up: the clock stops
      await game.eval(g => { g.distractions = []; });
      await game.eval((g, w, s) => s.kerr.open({ header: [], advice: [] }, { orderPly: () => {}, close: () => {} }));
      await frames(game, 2);
      assert.equal(await game.eval(g => g.timeScale), 0);
    } finally { await game.close(); }
  });
});
