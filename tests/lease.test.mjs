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
  it('three endings, read off the cash', () => {
    assert.equal(LS.outcome(9000, 6500), 'comfortable'); assert.equal(LS.outcome(6600, 6500), 'scraped'); assert.equal(LS.outcome(2000, 6500), 'short');
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
    assert.equal(wall.at(-1).ending, 'short'); // $5,000 less the week's overheads: short of $6,500
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
