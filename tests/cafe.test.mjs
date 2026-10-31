// The cafe before work: the offer (a chip, from day 2), the factory clock waiting till 7, the coffee's real cost and
// what a large one does, what's overheard landing on the notepad as you walk back (a lead rings at 10), the barista's
// long look after the rare late one, and her question on day 20.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const tap = (game, sel, i = 0) => game.page.evaluate(([sel, i]) => document.querySelectorAll(sel)[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), [sel, i]);
const asking = game => game.page.waitForFunction(() => window.kirScene.cafe.talk.asking, null, { timeout: 60_000 });

describe('the cafe', () => {
  it('not on day 1; from day 2 a chip; the clock waits till 7; a large coffee; walking back, the notepad picks up what you heard', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.lease.letterRead = true; });
    assert.equal(await game.page.evaluate(() => !!document.querySelector('#kir-hud .cafechip')), false, 'not day 1');
    await game.eval(g => { g.dayIndex = 2; g.day = 2; g.minute = 7 * 60; });
    await game.page.waitForSelector('#kir-hud .cafechip');
    await tap(game, '#kir-hud .cafechip');
    assert.equal(await game.eval((g, w, s) => [s.cafe.active, s.cafe.holdsClock].join()), 'true,true');
    await asking(game);
    assert.deepEqual(await game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .replies.day button')].map(b => b.textContent)), ['Regular', 'Large', 'Shout the sparky']);
    await tap(game, '#kir-hud .replies.day button', 1);
    assert.deepEqual(await game.eval(g => [g.today.coffee, g.coffeeUntil]), [6.5, 11 * 60]);
    await asking(game);
    await tap(game, '#kir-hud .replies.day button');
    const after = await game.eval((g, w, s) => ({ active: s.cafe.active, done: w.done.join('|'), calls: g.orderCalls.map(c => c.minute), jess: w.people.trust }));
    assert.equal(after.active, false);
    assert.match(after.done, /Coffee at Little Bird/);
    if (/Lead:/.test(after.done)) assert.ok(after.calls.includes(600), 'the lead rings at 10');
    await game.close();
  });

  it('after the rare late one, the barista just looks at you; on day 20 she asks if you’re staying on', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => {
      w.tour = null; s.jobCard.hide(); w.lease.letterRead = true;
      g.dayIndex = 6; g.day = 1; g.minute = 7 * 60;
      w.people.lastNight = { dayIndex: 5, who: ['tim', 'eggby'], beers: 5, quote: '…', quoteBy: 'Tim Baker', group: true, lsg: true };
      s.cafe.enter();
    });
    await game.page.waitForFunction(() => document.querySelector('#kir-hud .talk.day[data-who="mai"]')?.style.display === 'block', null, { timeout: 10_000 });
    const look = await game.page.evaluate(() => document.querySelector('#kir-hud .talk.day[data-who="mai"]').textContent);
    assert.ok(look.replace(/^Mai/, '').trim().length < 40, `just a look: ${look}`);
    await game.eval((g, w, s) => { s.cafe.leave(); w.people.lastNight = null; g.dayIndex = 20; w.lease.startDayIndex = 1; s.cafe.enter(); });
    await game.page.waitForFunction(() => document.querySelector('#kir-hud .talk.day[data-who="mai"]')?.style.display === 'block', null, { timeout: 10_000 });
    const q = await game.page.evaluate(() => document.querySelector('#kir-hud .talk.day[data-who="mai"]').textContent);
    assert.ok(q.length > 10, `staying on? ${q}`);
    await game.close();
  });
});
