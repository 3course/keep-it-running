// Next door, on Game (no browser): Sal's loans add up and come back (or he sends the bill), the lent extinguisher comes
// home, a polite no costs nothing and only a burned relationship cools a neighbour off, Mick's complaint and the
// council, Sal's overflow priced like real work, the scripts' policies, and saves (every neighbour field checked).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { newWorld } = await server.ssrLoadModule('/src/world/state.ts');
const { parseSave, saveText } = await server.ssrLoadModule('/src/world/save.ts');
const N = await server.ssrLoadModule('/src/sim/neighbours.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const C = CONFIG.neighbours;

const tick = (g, n = 1) => { for (let i = 0; i < n && g.phase === 'day'; i++) g.tick(); };
/** A game on `day` with the clock at `hour`, nothing random ringing (the tests ring what they need). */
function on(day = 6, hour = 10) {
  const g = new Game(1234, 5);
  g.dayIndex = day; g.minute = hour * 60; g.maybeDistraction = () => {};
  return g;
}
/** Answer the open talk with the choice whose label matches. */
function choose(g, re) {
  const i = N.talkChoices(g).findIndex(c => re.test(c.label));
  assert.ok(i >= 0, `${re} among ${JSON.stringify(N.talkChoices(g).map(c => c.label))}`);
  N.pickTalk(g, i);
}
const shortOf = g => { const j = g.jobs.find(x => x.status === 'queued'); g.stock[j.type] = 0; return j.type; };

describe("Sal's loans", () => {
  it('borrowing again adds to what you owe; it never overwrites it', () => {
    const g = on(); const type = shortOf(g);
    assert.ok(N.openTalk(g, 'sal', 'visit', 'sal_borrow')); choose(g, /^Borrow/);
    assert.ok(N.openTalk(g, 'sal', 'visit', 'sal_borrow')); choose(g, /^Borrow/);
    const o = N.salOwed(g);
    assert.equal(g.salDebts.length, 2);
    assert.equal(o.sheets, 2 * C.sal.borrowSheets);
    assert.equal(g.stock[type], 2 * C.sal.borrowSheets);
    assert.ok(o.cash > 0);
  });

  it('when due, it comes off the pallet; with nothing there and past the grace, he sends the bill and he is burned', () => {
    const g = on(); const type = shortOf(g);
    N.openTalk(g, 'sal', 'visit', 'sal_borrow'); choose(g, /^Borrow/);
    const due = g.salDebts[0].dueDay;
    // due and the sheets are there: taken back, still friends
    g.dayIndex = due + 1; tick(g);
    assert.equal(g.salDebts.length, 0); assert.equal(g.stock[type], 0); assert.ok(N.neighboursActive(g, 'sal'));
    // again, but the sheets are gone and the grace runs out: the bill (cash) and a cool-off
    N.openTalk(g, 'sal', 'visit', 'sal_borrow'); choose(g, /^Borrow/);
    g.stock[type] = 0; const owe = g.salDebts[0].cashOwe, cash = g.cash;
    g.dayIndex = g.salDebts[0].dueDay + C.sal.graceDays + 1; tick(g);
    assert.equal(g.salDebts.length, 0);
    assert.ok(g.cash <= cash - owe + 1, 'billed');
    assert.equal(N.neighboursActive(g, 'sal'), false, 'not speaking');
    assert.equal(g.neighbours.sal.burnedUntil, g.dayIndex + C.burnDays);
  });

  it('pay early at his place: sheets, or cash; either squares it and he owes you one', () => {
    const g = on(); shortOf(g);
    N.openTalk(g, 'sal', 'visit', 'sal_borrow'); choose(g, /^Borrow/);
    assert.equal(N.defaultVisitScene(g, 'sal'), 'sal_repay');
    N.openTalk(g, 'sal', 'visit', 'sal_repay'); choose(g, /^Pay \$/);
    assert.equal(g.salDebts.length, 0);
    assert.equal(g.neighbours.sal.favour, 1);
  });
});

describe('the lent extinguisher', () => {
  it('only off its bracket; Sal brings it back on time; meanwhile the council fines the empty bracket', () => {
    const g = on(6, 10);
    g.extinguisherAway = true; // (it's off its bracket already: in your hands, on the floor)
    assert.equal(N.openTalk(g, 'sal', 'phone', 'sal_ext'), false, 'he can only borrow it off the bracket');
    g.extinguisherAway = false;
    assert.ok(N.openTalk(g, 'sal', 'phone', 'sal_ext')); choose(g, /^Lend/);
    assert.equal(g.lentExtinguisherTo, 'sal');
    assert.equal(g.extBackAt, 10 * 60 + C.sal.extBackAfterMinutes);
    // an inspection while it's next door: fined for it
    g.rare = { id: 'council', at: g.minute, phase: 'live', waitLeft: 1, escortMinutes: 0, touring: false };
    const cash = g.cash; g.finishCouncil(false);
    assert.ok(g.cash < cash, 'fined');
    g.rare = null;
    // and back on time
    g.minute = g.extBackAt; tick(g);
    assert.equal(g.lentExtinguisherTo, null);
  });

  it('or go and get it: a visit asks for it back', () => {
    const g = on(6, 10);
    N.openTalk(g, 'sal', 'phone', 'sal_ext'); choose(g, /^Lend/);
    assert.equal(N.defaultVisitScene(g, 'sal'), 'sal_ext_back');
    N.openTalk(g, 'sal', 'visit', 'sal_ext_back'); choose(g, /back now/);
    assert.equal(g.lentExtinguisherTo, null);
  });

  it('never kept overnight', () => {
    const g = on(6, 16);
    N.openTalk(g, 'sal', 'phone', 'sal_ext'); choose(g, /^Lend/);
    N.startNeighbourDay(g);
    assert.equal(g.lentExtinguisherTo, null);
  });
});

describe('a polite no costs nothing; only a burned relationship cools them off', () => {
  it('every decline, on the phone or at the fence: favour and terms unchanged', () => {
    for (const [who, scene] of [['sal', 'sal_borrow'], ['sal', 'sal_overflow'], ['sal', 'sal_ext'], ['mick', 'mick_skip'], ['priya', 'priya_offcuts']]) {
      const g = on(); shortOf(g); g.offcutBin = 0.8;
      assert.ok(N.openTalk(g, who, 'visit', scene), scene);
      N.pickTalk(g, N.declineIndex(g));
      assert.deepEqual(g.neighbours[who], { favour: 0, burnedUntil: 0 }, `${scene}: no change`);
      assert.ok(N.neighboursActive(g, who));
    }
    // a call you say "can't talk now" to
    const g = on();
    g.distractions.push({ id: 99, kind: 'phone', title: 'Sal Fletcher', line: 'x', remaining: 10, engaged: false, neighbour: 'sal', neighbourScene: 'sal_overflow' });
    assert.ok(g.respond(99, 'decline'));
    assert.deepEqual(g.neighbours.sal, { favour: 0, burnedUntil: 0 });
  });

  it("a broken deal: Sal's overflow pulled by his customer", () => {
    const g = on(6, 10);
    N.openTalk(g, 'sal', 'phone', 'sal_overflow'); choose(g, /^Take/);
    assert.equal(g.salJobIds.length, C.sal.overflowSheets);
    for (const id of g.salJobIds) g.jobs.find(j => j.id === id).status = 'lost';
    N.startNeighbourDay(g);
    assert.equal(N.neighboursActive(g, 'sal'), false);
  });

  it("Mick: empty the bag in time and he's happy; ignore him and he stops talking; the last strike, he rings the council", () => {
    const g = on(6, 9);
    g.wear.filter = 0.05; tick(g);
    assert.ok(g.mickComplaintUntil > g.minute, 'a deadline');
    g.wear.filter = 1; tick(g);
    assert.deepEqual([g.mickComplaintUntil, g.neighbours.mick.favour], [0, 1], 'emptied in time');
    let councils = 0;
    for (let k = 0; k < C.mick.councilAfterStrikes; k++) {
      const h = on(6, 9); h.rare = null; h.mickStrikes = k; h.wear.filter = 0.05; tick(h);
      h.minute = h.mickComplaintUntil; tick(h);
      assert.equal(N.neighboursActive(h, 'mick'), false, 'burned');
      if (h.rare?.id === 'council') councils++;
    }
    assert.equal(councils, 1, 'only on the last strike');
  });

  it("Mick's call never replaces a rare event already booked today", () => {
    const g = on(6, 9);
    g.rare = { id: 'bigJob', at: 13 * 60, phase: 'scheduled' };
    assert.equal(g.triggerMickCouncil(), false);
    assert.equal(g.rare.id, 'bigJob');
  });
});

describe("Sal's overflow", () => {
  it('priced like your own work at his margin; what he offers is what goes on the board (a counter is 5% more)', () => {
    const g = on(6, 10);
    const quote = g.salOverflowJobs(), total = quote.reduce((s, j) => s + j.price, 0);
    assert.ok(quote.every(j => j.price > j.materialCost), 'each sheet pays more than its board');
    N.openTalk(g, 'sal', 'phone', 'sal_overflow');
    assert.ok(N.talkLines(g).some(l => l.includes(`$${total}`)));
    choose(g, /bit more/); choose(g, /^Done/);
    const taken = g.jobs.filter(j => g.salJobIds.includes(j.id));
    assert.equal(taken.length, C.sal.overflowSheets);
    assert.ok(Math.abs(taken.reduce((s, j) => s + j.price, 0) - total * (1 + C.sal.haggle)) <= C.sal.overflowSheets);
  });
});

describe('the scripts', () => {
  it('competent takes the work it has room for; sloppy lets the phone ring out', () => {
    for (const [profile, took] of [['competent', true], ['sloppy', false]]) {
      const g = on(6, 10);
      g.distractions.push({ id: 77, kind: 'phone', title: 'Sal Fletcher', line: 'x', remaining: C.phoneWindow, engaged: false, neighbour: 'sal', neighbourScene: 'sal_overflow' });
      for (let i = 0; i < 20; i++) { N.neighbourPolicy(g, profile, true); g.busy = null; }
      assert.equal(g.salJobIds.length > 0, took, profile);
    }
  });

  it('day 1: no deals; the feature off: nothing at all', () => {
    const g = new Game(42); g.maybeDistraction = () => {};
    tick(g, 60);
    assert.equal(g.distractions.some(d => d.neighbour), false);
    const was = C.enabled; C.enabled = false;
    try { const h = on(6, 9); h.wear.filter = 0.05; tick(h, 30); assert.equal(h.mickComplaintUntil, 0); } finally { C.enabled = was; }
  });
});

describe('saves', () => {
  it('round-trip: debts, the lent extinguisher, the ledger, a talk mid-way', () => {
    const g = on(6, 10); shortOf(g);
    N.openTalk(g, 'sal', 'visit', 'sal_borrow'); choose(g, /^Borrow/);
    N.openTalk(g, 'sal', 'phone', 'sal_ext'); choose(g, /^Lend/);
    N.openTalk(g, 'sal', 'phone', 'sal_overflow');
    const w = newWorld(g); w.hooks.wall = false;
    const back = parseSave(saveText(g, w));
    assert.ok(back);
    const b = back.game;
    assert.deepEqual([b.salDebts, b.lentExtinguisherTo, b.extBackAt, b.neighbours, b.neighbourTalk], [g.salDebts, 'sal', g.extBackAt, g.neighbours, g.neighbourTalk]);
    assert.equal(back.world.hooks.wall, false, "the bracket stays empty: it's next door");
  });

  it('tampered: junk in each neighbour field loads sane and plays on', () => {
    const g = on(6, 10);
    const file = JSON.parse(saveText(g, newWorld(g)));
    Object.assign(file.game, {
      neighbours: { sal: { favour: 1e9, burnedUntil: 'x' }, mick: null, nobody: { favour: 1 } },
      salDebts: [{ type: 'gold', sheets: 5 }, { type: CONFIG.jobs.types[0].id, sheets: 1e9, cashOwe: -5, dueDay: 'x' }, 'x'],
      lentExtinguisherTo: 'mick', extBackAt: 'soon', mickComplaintUntil: 1e12, mickStrikes: -3,
      neighbourTalk: { who: 'sal', scene: 'rob_the_bank' }, neighbourDaily: 'x', salJobIds: [99999, 'x'],
    });
    const text = JSON.stringify(file).replace('"neighbours":{', '"neighbours":{"__proto__":{"x":1},');
    const back = parseSave(text);
    assert.ok(back);
    const b = back.game;
    assert.equal(b.neighbours.sal.favour, C.favourCeil); assert.equal(b.neighbours.sal.burnedUntil, 0);
    assert.deepEqual(b.neighbours.mick, { favour: 0, burnedUntil: 0 });
    assert.equal('nobody' in b.neighbours, false);
    assert.deepEqual(b.salDebts.map(d => [d.sheets, d.cashOwe]), [[100, 0]]);
    assert.deepEqual([b.lentExtinguisherTo, b.extBackAt, b.mickComplaintUntil, b.mickStrikes, b.neighbourTalk, b.salJobIds], [null, -1, 24 * 60, 0, null, []]);
    assert.equal(({}).x, undefined);
    assert.doesNotThrow(() => tick(b, 200));
  });
});
