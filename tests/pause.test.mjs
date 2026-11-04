// Pause: one button top-right under the clock, the pause card (Resume, Settings, Restart day, Quit to title), the
// settings card on top of it, Restart day back to the morning, the tab going hidden pausing the game.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, startBrowser } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const shown = (game, sel) => game.page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; }, sel);

describe('pause', () => {
  it('the button is always there, clear of the clock and the other buttons, and stops and starts the game', async () => {
    const game = await freshGame(env);
    assert.ok(await shown(game, '#kir-hud .pausebtn'));
    const box = await game.page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect().toJSON(); return { p: r('.pausebtn'), c: r('.clock'), m: r('.mute') }; });
    assert.ok(box.p.top >= box.c.bottom - 1, 'under the clock');
    assert.ok(box.m.top >= box.p.bottom - 1, 'mute under pause');
    assert.ok(box.p.width >= 44 && box.p.height >= 44, 'a thumb-sized target');
    assert.ok(box.p.right > 390 - 20, 'on the right edge');
    await game.page.click('#kir-hud .pausebtn');
    assert.equal(await game.eval((g, w, s) => s.isPaused), true);
    assert.ok(await shown(game, '#kir-hud .paused'));
    const names = await game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .paused .big')].map(b => b.textContent.trim()));
    assert.deepEqual(names, ['Resume', 'Settings', 'Restart day', 'Quit to title']);
    await game.page.click('#kir-hud .paused .resume');
    assert.equal(await game.eval((g, w, s) => s.isPaused), false);
    await game.close();
  });

  it('Settings opens over the pause card and closes back to it', async () => {
    const game = await freshGame(env);
    await game.page.click('#kir-hud .pausebtn');
    await game.page.click('#kir-hud .paused .settings');
    assert.ok(await shown(game, '.kirset'));
    await game.page.click('.kirset .done');
    assert.ok(!(await shown(game, '.kirset')));
    assert.ok(await shown(game, '#kir-hud .paused'));
    await game.close();
  });

  it('a hidden tab pauses and saves', async () => {
    const game = await freshGame(env);
    await game.page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await game.eval((g, w, s) => s.isPaused), true);
    assert.ok(await game.page.evaluate(() => !!localStorage.getItem('kir:save-v2')));
    await game.close();
  });

  it('Restart day asks twice, then brings back this morning with the title skipped', async () => {
    const game = await freshGame(env);
    await game.eval(g => { g.cash += 0; });
    const start = await game.eval(g => ({ cash: g.cash, minute: g.minute, day: g.dayIndex }));
    await game.eval(g => { g.cash += 1234; g.minute = 11 * 60; });
    await game.page.click('#kir-hud .pausebtn');
    await game.page.click('#kir-hud .paused .restart');
    assert.match(await game.page.locator('#kir-hud .paused .restart').innerText(), /sure/i);
    assert.equal(await game.eval(g => g.minute), 11 * 60, 'the first tap only asks');
    await Promise.all([game.page.waitForNavigation(), game.page.click('#kir-hud .paused .restart')]);
    await game.page.waitForFunction(() => window.kirScene?.started);
    const now = await game.eval(g => ({ cash: g.cash, minute: g.minute, day: g.dayIndex }));
    assert.deepEqual(now, start);
    assert.ok(!(await shown(game, '.kirtitle')), 'no title after a restart');
    game.errors.length = 0;
    await game.context.close();
  });

  it('Quit to title saves and reloads onto the title with Continue', async () => {
    const game = await freshGame(env);
    await game.page.click('#kir-hud .pausebtn');
    await Promise.all([game.page.waitForNavigation(), game.page.click('#kir-hud .paused .quit')]);
    await game.page.waitForTimeout(100);
    // the test URL carries intro=0, which skips the title; the quit is a reload of it, so open the bare one
    await game.page.goto(env.url + '?seed=1');
    await game.page.waitForFunction(() => window.kirScene?.started);
    assert.ok(await shown(game, '.kirtitle .cont'), 'Continue is offered');
    game.errors.length = 0;
    await game.context.close();
  });
});
