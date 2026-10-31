// The "board's full" warning, checked on Game and the view's own logic (no browser): sheets due today (overdue
// included) against what's left of the day at CONFIG.jobs.warnMinutesPerSheet a sheet. When it's on, the notepad
// says so and "Turn it down" is highlighted on order calls and voicemails. Plus the day's money lost to late pay
// and to pulled jobs, which the day summary itemises.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const { todoItems } = await server.ssrLoadModule('/src/world/todo.ts');
const { actionsFor, uiHooks } = await server.ssrLoadModule('/src/world/interactables.ts');
const { newWorld } = await server.ssrLoadModule('/src/world/state.ts');
const PER = CONFIG.jobs.warnMinutesPerSheet, CLOSE = CONFIG.clock.endHour * 60;

/** A game at `minute` with exactly these sheets on the board: `today` due today, `overdue` due yesterday, `later` due tomorrow. */
function board(minute, { today = 0, overdue = 0, later = 0 } = {}) {
  const g = new Game(1, 3);
  g.maybeDistraction = () => {};
  g.minute = minute;
  const proto = g.jobs[0];
  let id = 1000;
  const make = (n, dueDay) => Array.from({ length: n }, () => ({ ...proto, id: id++, status: 'queued', dueDay, progress: 0 }));
  g.jobs = [...make(today, g.dayIndex), ...make(overdue, g.dayIndex - 1), ...make(later, g.dayIndex + 1)];
  return g;
}
const warning = g => todoItems(g, newWorld(g)).find(i => i.key === 'board-full');

describe("board's full", () => {
  it('counts sheets due today and overdue, not tomorrow\'s', () => {
    const g = board(9 * 60, { today: 3, overdue: 2, later: 7 });
    assert.equal(g.dueToday, 5);
    assert.equal(g.canCutToday, (CLOSE - 9 * 60) / PER);
  });

  it('comes on one sheet past what there\'s time for, and not before', () => {
    const minute = CLOSE - 6 * PER; // time for exactly 6
    const fits = board(minute, { today: 6 }), over = board(minute, { today: 7 }), overdue = board(minute, { today: 5, overdue: 2 });
    assert.equal(fits.overCommitted, false);
    assert.equal(warning(fits), undefined, 'six due, time for six: no warning');
    assert.equal(over.overCommitted, true);
    assert.equal(warning(over).text, "Board's full: 7 due today, time for about 6");
    assert.equal(warning(overdue).text, "Board's full: 7 due today, time for about 6", 'overdue sheets count');
    assert.equal(warning(over).urgent, false, "a nudge, not a chore: it's in the later list");
  });

  it('clears as the day catches up: a sheet cut, or work turned down', () => {
    const g = board(CLOSE - 6 * PER, { today: 7 });
    assert.ok(warning(g));
    g.jobs[0].status = 'done';
    assert.equal(warning(g), undefined, 'one cut: six left, time for six');
  });

  it('comes on as the day runs out, with the same board', () => {
    const g = board(9 * 60, { today: 7 });
    assert.equal(warning(g), undefined, 'plenty of day left');
    g.minute = CLOSE - 6 * PER;
    assert.ok(warning(g));
  });

  it('is off after 5pm (overtime is its own decision)', () => {
    const g = board(CLOSE + 30, { today: 3 });
    assert.equal(warning(g), undefined);
  });

  it('"Turn it down" is highlighted on order calls and voicemails only when the board\'s full', () => {
    for (const [today, hot] of [[6, false], [7, true]]) {
      const g = board(CLOSE - 6 * PER, { today });
      g.distractions = [{ id: 1, kind: 'phone', title: '', line: '', remaining: 30, engaged: false, order: 2, orderType: 'formwork', customer: 'Mick' }];
      g.callbacks = [{ id: 2, customer: 'Kerry', sheets: 3, orderType: 'joinery', expiresMinute: g.minute + 60 }];
      const acts = actionsFor('phone', g, newWorld(g));
      // the order call's yes/no is on the card you get picking up
      let card = null;
      uiHooks.orderCard = (d, offer, take, decline) => { card = { take, decline }; };
      acts.find(a => a.label === 'Pick up').run();
      const decline = card.decline, ringBack = acts.find(a => a.label === 'Ring Kerry, turn it down');
      assert.equal(!!decline.highlight, hot, `order call, ${today} due`);
      assert.equal(!!ringBack.highlight, hot, `voicemail, ${today} due`);
      for (const a of acts.filter(x => x !== decline && x !== ringBack)) assert.ok(!a.highlight, `${a.label} is never highlighted`);
    }
  });
});

describe('money lost to late pay and pulled jobs', () => {
  it('a late sheet records what was kept back', () => {
    const g = board(10 * 60, { overdue: 1 });
    for (const t of CONFIG.jobs.types) { g.stock[t.id] = 5; g.stockValue[t.id] = 5 * t.boardCost; }
    g.maybeFault = () => {}; g.maybeFire = () => {};
    const job = g.jobs[0];
    assert.ok(g.loadNextSheet());
    while (job.status === 'cutting') g.tick();
    const pay = Math.round(job.price * CONFIG.economy.latePayFraction);
    assert.equal(g.today.latePayLost, job.price - pay);
  });

  it('a job pulled at close records its price; an on-time day records nothing', () => {
    const g = board(CLOSE - 1, { overdue: 2 });
    const lost = g.jobs.reduce((s, j) => s + j.price, 0);
    g.tick(); g.knockOff();
    assert.equal(g.today.sheetsLost, 2);
    assert.equal(g.today.lostJobsValue, lost);
    assert.equal(g.today.latePayLost, 0);
    const clean = board(CLOSE - 1, { later: 2 });
    clean.tick(); clean.knockOff();
    assert.equal(clean.today.lostJobsValue, 0);
  });
});
