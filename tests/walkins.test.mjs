// Walk-ins: someone at the roller door with a small job ("Can you do this today?"). On Game: when they come (tracking
// under the floor at 1pm; the day's regular at 3pm), the cap, and that the ones you served square up at close for
// exactly the floor's money (the sim takes every one, so its numbers don't move). In the shed: the person at the door,
// your answer, and "Walk-ins" in the day summary.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { Game } = await env.load('/src/sim/Game.ts');
const { CONFIG } = await env.load('/src/config.ts');
const E = CONFIG.economy;

/** A day with nothing going on: no faults, fires or distractions; run the clock to `hour`. */
function quiet(serves = false) {
  const g = new Game(1, 3);
  g.servesWalkIns = serves;
  g.maybeDistraction = () => {}; g.maybeFault = () => {}; g.maybeFire = () => {};
  g.jobs = []; g.orderCalls = [];
  return g;
}
const runTo = (g, hour) => { while (g.minute < hour * 60) g.tick(); };
const close = g => { runTo(g, CONFIG.clock.endHour); g.knockOff(); };

describe('walk-ins, on Game', () => {
  it('a slow day: one at 1pm, another at 3pm, no more; they pay the floor at close', () => {
    const g = quiet();
    runTo(g, E.walkInHours[0] - 1);
    assert.equal(g.walkIns.length, 0);
    runTo(g, E.walkInHours[0]);
    assert.equal(g.walkIns.length, 1, 'tracking under at 1pm');
    runTo(g, E.walkInHours[1]);
    assert.equal(g.walkIns.length, E.walkInMax, 'still under at 3pm');
    close(g);
    assert.equal(g.walkIns.length, E.walkInMax, 'capped');
    assert.equal(g.today.walkInCount, 2);
    assert.equal(g.today.walkIns, E.walkInFloor, 'nothing else earned: the walk-ins make the floor');
    assert.equal(g.walkIns.reduce((s, w) => s + w.paid, 0), E.walkInFloor);
  });

  it('a good day: just the regular at 3pm, for the usual', () => {
    const g = quiet();
    runTo(g, E.walkInHours[0] - 1);
    g.today.revenue = E.walkInFloor * 2; // flying already
    runTo(g, E.walkInHours[1]);
    assert.equal(g.walkIns.length, 1);
    assert.equal(g.walkIns[0].minute, E.walkInHours[1] * 60);
    close(g);
    assert.equal(g.today.walkIns, E.walkInPerDay);
  });

  it('in the shed they wait for an answer: turn one away, or leave them waiting, and their share is gone', () => {
    const g = quiet(true);
    runTo(g, E.walkInHours[0]);
    const first = g.walkIns[0];
    assert.equal(first.status, 'waiting');
    g.turnAwayWalkIn(first.id);
    assert.equal(first.status, 'left');
    runTo(g, E.walkInHours[1]);
    const second = g.walkIns[1];
    assert.ok(g.serveWalkIn(second.id));
    assert.ok(!g.serveWalkIn(second.id), 'once');
    close(g);
    assert.equal(g.today.walkInCount, 1);
    assert.ok(g.today.walkIns > 0 && second.paid === g.today.walkIns);
    const h = quiet(true);
    runTo(h, E.walkInHours[0] + E.walkInWaitMinutes / 60);
    assert.equal(h.walkIns[0].status, 'left', 'gave up waiting');
    close(h);
    // the 3pm one was never answered either
    assert.equal(h.today.walkIns, 0);
  });

  it("walk-ins don't count toward the best-day milestone", () => {
    const g = quiet();
    close(g);
    assert.ok(g.today.walkIns > 0);
    assert.ok(g.milestones.bestDayProfit < g.today.walkIns);
  });
});

describe('walk-ins, in the shed', () => {
  it('someone at the roller door asks, you say yes, they thank you; the summary lists the walk-ins', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.walkInArrives(); });
    await game.page.waitForFunction(() => !!window.kirScene.peopleDay.walkIn);
    const ask = await game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .talk[data-who="walkin"]')].map(b => b.textContent).join(' | '));
    assert.match(ask, /Can you do this today\?/);
    // over to the door
    await game.eval((g, w, s) => { s.pos.x = (27 + 0.5) * 0.5; s.pos.z = (31 + 0.5) * 0.5; w.px = s.pos.x; w.py = s.pos.z; });
    await game.page.waitForFunction(() => document.querySelectorAll('#kir-hud .replies.day button').length > 0, null, { timeout: 15_000 });
    await game.page.evaluate(() => {
      const b = [...document.querySelectorAll('#kir-hud .replies.day button')].find(x => /Sure/.test(x.textContent));
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    assert.equal(await game.eval(g => g.walkIns[0].status), 'served');
    await game.page.waitForFunction(() => /back at five|square up|on the way home|See you at five/i.test([...document.querySelectorAll('#kir-hud .talk[data-who="walkin"]')].map(b => b.textContent).join(' ')), null, { timeout: 10_000 });
    // knock off: they square up, and the summary says so
    await game.eval(g => { g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; g.knockOff(); });
    const st = await game.eval(g => ({ phase: g.phase, walkIns: g.today.walkIns, n: g.today.walkInCount, list: g.walkIns }));
    assert.ok(st.walkIns > 0 && st.n === 1, JSON.stringify(st));
    const text = await game.page.evaluate(async () => {
      const { renderDaySummary } = await import(new URL('src/ui/summary.ts', document.baseURI).href);
      const el = document.createElement('div'); el.className = 'summary';
      const g = window.kirScene.g; g.phase = 'daySummary';
      renderDaySummary(el, g, () => {}, () => {});
      return el.textContent;
    });
    assert.match(text, /Walk-ins \(1\)/, 'in the P&L');
    assert.match(text, /Walk-ins\s*1 served/, 'on the shop floor');
    await game.close();
  });
});
