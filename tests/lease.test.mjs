// The Lease (20 working days, the rent at the end) and the daily (one seeded day, the same for everyone): the letter,
// the rent on the notepad, the wobble, Friday's group night, the weekend, the reckoning and the wall; the daily's
// canonical start, its result card, streak and share text, and that it saves nothing.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, PHONE } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { Game } = await env.load('/src/sim/Game.ts');
const LS = await env.load('/src/world/lease.ts');
const D = await env.load('/src/world/daily.ts');
const { newPeople } = await env.load('/src/people/state.ts');
const { CONFIG } = await env.load('/src/config.ts');
const LW = await env.load('/src/world/leaseWeeks.ts');

describe('the lease, on Game', () => {
  it('a wobble in week 3, drawn from the pool, set off through the game’s own systems', () => {
    const kinds = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const g = new Game(seed, 1), l = LS.newLease(g, 1), p = newPeople();
      kinds.add(l.wobble.kind);
      const week = Math.ceil((l.wobble.dayIndex - l.startDayIndex + 1) / CONFIG.week.days);
      assert.equal(week, CONFIG.lease.wobbleWeek);
      g.dayIndex = l.wobble.dayIndex;
      assert.ok(LS.fireWobble(l, g, p)); assert.ok(!LS.fireWobble(l, g, p), 'once');
      if (l.wobble.kind === 'priceRise') assert.equal(g.supplyCostMult, CONFIG.lease.priceRise);
      if (l.wobble.kind === 'quietCustomer') assert.ok(g.callMult < 1);
      if (l.wobble.kind === 'extractorDue') assert.ok(g.wear.filter <= 0.15);
      if (l.wobble.kind === 'jessAnswer') assert.ok(p.trust >= 18 && p.jessExtraDay === g.dayIndex);
    }
    assert.equal(kinds.size, 4, 'every kind comes up across seeds');
  });
  it('the weeks a lease deals: seeded, 0–3 a lease on their own weeks, every kind turns up', () => {
    assert.deepEqual(LW.drawFortunes(7), LW.drawFortunes(7));
    const counts = new Set(), kinds = new Set();
    for (let s = 1; s <= 200; s++) { const f = LW.drawFortunes(s); assert.equal(f.length, CONFIG.lease.weeks); counts.add(f.filter(Boolean).length); f.filter(Boolean).forEach(k => kinds.add(k)); }
    assert.deepEqual([...counts].sort(), [0, 1, 2, 3]);
    assert.equal(kinds.size, LW.FORTUNE_KINDS.length);
  });
  it('each dealt week works through Game, for its five days and no longer', () => {
    const F = CONFIG.lease.fortunes, last = 5;
    const fresh = () => { const g = new Game(3, 1); g.maybeDistraction = () => {}; return g; };
    // a big order: ten sheets, due by close on the week's last day, at a premium
    const b = fresh(), before = b.jobs.length;
    LW.startFortune('bigOrder', b, last);
    const big = b.jobs.slice(before);
    assert.equal(big.length, F.bigOrder.sheets); assert.ok(big.every(j => j.dueDay === last && j.type === F.bigOrder.type));
    // cheap ply, this week only
    const p = fresh(), full = p.plyQuote('formwork', 4).boards;
    LW.startFortune('plyDip', p, last);
    assert.ok(p.plyQuote('formwork', 4).boards < full);
    p.dayIndex = last + 1; assert.equal(p.plyQuote('formwork', 4).boards, full, 'over after the week');
    // quiet: today's later calls and this morning's board thin out
    const q = fresh(), calls = q.orderCalls.length, board = q.jobs.length;
    LW.startFortune('quiet', q, last);
    assert.ok(q.orderCalls.length < calls || calls === 1); assert.ok(q.jobs.length < board);
    // premium and rushes: read by the order calls
    const r = fresh(); LW.startFortune('premium', r, last); assert.equal(r.fortuneNow.priceMult, F.premium.priceMult);
    const u = fresh(); LW.startFortune('rushes', u, last); assert.equal(u.fortuneNow.rushMult, F.rushes.rushMult);
    // fortuneMorning only starts a week on its first morning
    const m = fresh(); m.dayIndex = 2;
    assert.equal(LW.fortuneMorning(['premium', 'premium', null, null], 1, m), null);
    m.dayIndex = 6; assert.equal(LW.fortuneMorning(['premium', 'premium', null, null], 1, m), 'premium');
  });
  it('five endings, read off the spare at day 20; a near miss rides to the next lease', () => {
    const E = CONFIG.lease.endings, rent = 7000;
    assert.equal(LS.outcome(rent - E.graceShort - 1, rent), 'short');
    assert.equal(LS.outcome(rent - E.graceShort, rent), 'scraped');
    assert.equal(LS.outcome(rent + E.scrapedUnder - 1, rent), 'scraped');
    assert.equal(LS.outcome(rent + E.scrapedUnder, rent), 'made');
    assert.equal(LS.outcome(rent + E.comfortableFrom, rent), 'comfortable');
    assert.equal(LS.outcome(rent + E.flyingFrom, rent), 'flying');
    assert.equal(LS.owedAfter(rent - 600, rent), 600, 'scraped, short: the rest rides');
    assert.equal(LS.owedAfter(rent + 600, rent), 0);
    assert.equal(LS.owedAfter(rent - E.graceShort - 1, rent), 0, 'short is short: nothing rides');
  });
});

describe('the lease, in the shed', () => {
  it('day 1: the landlord’s letter; the rent on the notepad', async () => {
    const game = await freshGame(env);
    assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .lettercard')?.textContent ?? ''), new RegExp(`\\$${CONFIG.lease.rentDue.toLocaleString('en-AU')}`));
    assert.match(await game.eval((g, w, s) => s.hud.pad.textContent), new RegExp(`Rent: \\$${CONFIG.lease.rentDue.toLocaleString('en-AU')} by day 20 · day 1`));
    await game.close();
  });
  it('Friday: a group night — another mate on the way without being rung', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.day = 5; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; s.knockoff.atFive(); });
    await game.page.evaluate(() => document.querySelector('#kir-hud .replies:not(.day) button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    assert.ok(await game.eval((g, w, s) => !!s.knockoff.night.calling), 'someone’s coming');
    await game.close();
  });
  it('the weekend: Saturday’s market sells a piece; Sunday’s a postcard; then Monday', async () => {
    const game = await freshGame(env);
    await game.eval(async (g, w, s) => {
      const { DESIGNS } = await import(new URL('src/designs/index.ts', document.baseURI).href);
      w.tour = null; s.jobCard.hide();
      w.people.keepsakes.push({ design: DESIGNS.find(d => d.id === 'ah-trophy'), suggestedBy: 'eggby', beers: 3, accuracy: 0.4, dayIndex: 1, slot: 0, sheet: 'offcut' });
      g.day = 5; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; g.knockOff(); g.nextDay(); // Friday's summary, then the week's
    });
    await game.page.waitForSelector('#kir-hud .summary h1');
    assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .summary h1').textContent), /Payday/);
    await game.page.click('#kir-hud .summary .next');
    await game.page.waitForSelector('#kir-hud .summary .market');
    const cash = await game.eval(g => g.cash);
    await game.page.click('#kir-hud .summary .market button[data-i="0"]');
    assert.ok(await game.eval(g => g.cash) > cash, 'sold');
    assert.equal(await game.eval((g, w) => w.people.keepsakes.length), 0);
    await game.page.click('#kir-hud .summary .next');
    await game.page.waitForSelector('#kir-hud .summary .postcard');
    await game.page.click('#kir-hud .summary .next');
    assert.equal(await game.eval(g => [g.day, g.phase].join()), '1,day');
    await game.close();
  });
  it('day 20: the reckoning with everyone, an ending card, and the run on the office wall', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.lease.letterRead = true; g.dayIndex = 20; g.day = 5; w.lease.startDayIndex = 1; w.people.fullTime = true; g.cash = 5000; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
    await game.page.waitForFunction(() => window.kirScene.knockoff.mode === 'reckoning');
    assert.ok(await game.eval((g, w, s) => ['eggby', 'courtney', 'tim', 'jess', 'you'].every(id => s.knockoff.figures.has(id))), 'everyone');
    for (let k = 0; k < 200 && !(await game.eval((g, w, s) => s.knockoff.talk.asking)); k++) { await game.page.mouse.click(200, 300); await game.page.waitForTimeout(50); }
    await game.page.evaluate(() => document.querySelector('#kir-hud .replies:not(.day) button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await game.page.waitForSelector('#kir-hud .summary .ending');
    assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .summary .ending').textContent), /Start another lease/);
    const wall = await game.page.evaluate(() => JSON.parse(localStorage.getItem('kir-leases')));
    assert.equal(wall.at(-1).ending, 'short'); // $5,000 less the week's overheads: well short of the rent
    await game.close();
  });
  it('day 20, flying: Jess goes full time on the spot, Dennis brings a spreadsheet', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.lease.letterRead = true; g.dayIndex = 20; g.day = 5; w.lease.startDayIndex = 1; w.people.fullTime = false; w.people.trust = 5; g.cash = 40000; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
    await game.page.waitForFunction(() => window.kirScene.knockoff.mode === 'reckoning');
    assert.equal(await game.eval((g, w) => w.people.fullTime), true, 'full time on the spot');
    assert.equal(await game.eval((g, w) => w.lease.ending), 'flying');
    assert.ok(await game.eval((g, w, s) => s.knockoff.figures.has('dennis')), 'Dennis is there');
    await game.close();
  });
  it('a near miss: scraped it, and the rest rides into the next lease’s letter', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.lease.letterRead = true; g.dayIndex = 20; g.day = 5; w.lease.startDayIndex = 1; g.cash = w.lease.rentDue + 900 - 500; /* less the week's $900 overheads: $500 short */ g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
    await game.page.waitForFunction(() => window.kirScene.knockoff.mode === 'reckoning');
    assert.equal(await game.eval((g, w) => w.lease.ending), 'scraped');
    assert.equal(await game.eval((g, w) => w.lease.owed), 500);
    const wall = await game.page.evaluate(() => JSON.parse(localStorage.getItem('kir-leases')));
    assert.equal(wall.at(-1).owed, 500);
    // the next lease: the usual rent plus what rode over
    const next = await game.page.evaluate(async () => {
      const LS = await import(new URL('src/world/lease.ts', document.baseURI).href);
      const l = LS.newLease(window.kirScene.g, LS.nextLeaseNumber());
      return { rent: l.rentDue, carried: l.carried };
    });
    assert.deepEqual(next, { rent: CONFIG.lease.rentDue + 500, carried: 500 });
    await game.close();
  });
});

describe('the daily', () => {
  it('the same seed for everyone on a date (Melbourne), a canonical start', () => {
    assert.equal(D.dailySeed('2026-10-31'), D.dailySeed('2026-10-31'));
    assert.notEqual(D.dailySeed('2026-10-31'), D.dailySeed('2026-11-01'));
    assert.equal(D.melbourneDate(new Date('2026-10-31T14:30:00Z')), '2026-11-01', 'already tomorrow in Melbourne');
    const { game, world } = D.dailyStart('2026-10-31');
    assert.equal(game.dayIndex, D.DAILY_DAY); assert.equal(world.people.gifts.length, 2); assert.equal(world.people.fullTime, false); assert.equal(world.layout, undefined);
  });
  it('one day, a result card with a share line and a streak; it saves nothing', async () => {
    const context = await env.browser.newContext(PHONE);
    const page = await context.newPage();
    await page.goto(`${env.url}?daily=1`);
    await page.waitForFunction(() => window.kirScene?.started);
    assert.equal(await page.evaluate(() => [window.kir.dayIndex, !!window.kirScene.w.lease].join()), `${D.DAILY_DAY},false`);
    await page.evaluate(() => { window.kir.tick = () => {}; window.kir.today.revenue = 1000; window.kir.today.costs = 800; window.kir.phase = 'daySummary'; });
    await page.waitForSelector('#kir-hud .summary .dailycard');
    const card = await page.evaluate(() => document.querySelector('#kir-hud .summary').innerText);
    assert.match(card, /Margin\s*20%/); assert.match(card, /Streak\s*1 day/); assert.match(card, /Cost you most/);
    assert.equal(await page.evaluate(() => localStorage.getItem('kir-save-v2')), null, 'no save');
    assert.match(await page.evaluate(async () => (await import(new URL('src/world/daily.ts', document.baseURI).href)).shareText({ date: 'x', margin: 0.2, sheets: 7, walked: 1234, costliest: 'A fire.', emoji: '💰✅🧯🪚☕', streak: 3, best: 3 })), /Margin 20% · 7 sheets · 1\.2 km walked\nCost me most: A fire\.\nStreak: 3 days/);
    await context.close();
  });
});
