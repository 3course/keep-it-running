// Kerr (src/world/kerr.ts): the office computer's rule-based "local model". The numbers on top, then 3–5 lines of
// advice, one per rule that fired, costliest first. On Game, no browser (the screen itself: tests/interactables.test.mjs).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const { kerrScreen } = await server.ssrLoadModule('/src/world/kerr.ts');
const { newWorld } = await server.ssrLoadModule('/src/world/state.ts');
const { newLease } = await server.ssrLoadModule('/src/world/lease.ts');

const fresh = () => { const g = new Game(1, 3); const w = newWorld(g); w.tour = null; return { g, w }; };

describe('Kerr', () => {
  it('the numbers: today so far, yesterday, the rent clock', () => {
    const { g, w } = fresh();
    w.lease = newLease(g, 1); w.lease.startDayIndex = g.dayIndex - 12; // day 13 of 20
    g.today.revenue = 900; g.today.costs = 600;
    g.lastDay = { ...g.today, revenue: 1200, costs: 1000 };
    g.cash = 4000;
    const s = kerrScreen(g, w), h = Object.fromEntries(s.header);
    assert.equal(h['TODAY SO FAR'], '$900 in, $600 out, $300 (33%)');
    assert.equal(h['YESTERDAY'], '$1,200 in, $1,000 out, $200 (17%)');
    assert.match(h['RENT'], new RegExp(`due day 20\\. 7 days left\\. \\$${(w.lease.rentDue - 4000).toLocaleString('en-AU')} short`));
  });
  it('a quiet day still says three things (the rent pace, the bank, the wear, a sign-off: the first three that apply)', () => {
    const { g, w } = fresh();
    const s = kerrScreen(g, w);
    assert.equal(s.advice.length, CONFIG.kerr.minLines);
    assert.match(s.advice[0], /in the bank./);
  });
  it('each rule: idle, a fire on a full bag, a ute kept waiting, late sheets, work turned down, bit trouble', () => {
    const { g, w } = fresh();
    const say = () => kerrScreen(g, w).advice.join('\n');
    g.today.idleMinutes = 34; assert.match(say(), /^Router idle 34 min today\. About \$68 of cutting/m);
    g.fireStarts = [{ minute: 14 * 60 + 14, bag: 0.86, bit: 0.5 }]; assert.match(say(), /Fire at 2:14pm with the bag 86% full\. Full bags catch\./);
    g.minute = 11 * 60; g.pickups = [{ id: 1, order: 'x', jobs: [1], pay: 0, textedAt: 0, dueAt: 0, slipped: false, status: 'done', hereAt: g.dayIndex * 1440 + 10 * 60, doneAt: g.dayIndex * 1440 + 10 * 60 + 14 }];
    assert.match(say(), /A ute waited 14 min at the roller door\./);
    g.today.sheetsLate = 2; g.today.latePayLost = 90; assert.match(say(), /2 sheets late, \$90 docked\./);
    g.today.sheetsDeclined = 3; assert.match(say(), /Turned down 3 sheets, about \$\d+/);
    g.faultsToday = ['chipping']; assert.match(say(), /Bit trouble today\./);
  });
  it(`costliest first, never more than ${CONFIG.kerr.maxLines}`, () => {
    const { g, w } = fresh();
    g.today.idleMinutes = 12;                                  // $24
    g.faultsToday = ['collet'];                                // $60
    g.fireStarts = [{ minute: 600, bag: 0.9, bit: 0.9 }];      // $120
    g.today.sheetsLate = 4; g.today.latePayLost = 2000;        // $2000
    g.today.sheetsScrapped = 1;                                // a board
    g.today.sheetsMissed = 1;                                  // a sheet's margin
    const s = kerrScreen(g, w).advice;
    assert.equal(s.length, CONFIG.kerr.maxLines);
    assert.match(s[0], /late, \$2,000 docked/);
    assert.ok(!s.some(l => l.startsWith('Router idle')), 'the cheapest one drops off');
  });
});
