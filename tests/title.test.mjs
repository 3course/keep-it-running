// The title screen: on load before the cafe; Continue only with a save; New game confirms over a save; the settings
// card shared with the pause card persists in localStorage. (Tests that load ?intro=0 or ?title=0 skip it.)
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PHONE, startBrowser } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { graphicsSearch } = await env.load('/src/settings.ts');

async function open(query, { save = false } = {}) {
  const context = await env.browser.newContext(PHONE);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (save) { // play a moment with the title skipped, so there's a save, then come back with the title
    await page.goto(`${env.url}?seed=1&title=0&intro=0`);
    await page.waitForFunction(() => window.kirScene?.started);
    await page.evaluate(() => { window.kirScene.setPaused(true); });
  }
  await page.goto(`${env.url}${query}`);
  await page.waitForFunction(() => window.kirScene?.started);
  await page.waitForTimeout(300);
  return { page, context, errors };
}
const buttons = page => page.evaluate(() => [...document.querySelectorAll('.kirtitle button')].map(b => b.textContent.trim()));

describe('the title screen', () => {
  it('a new player: New game and Settings, no Continue, nothing saved, the clock stopped', async () => {
    const { page, context, errors } = await open('?seed=1');
    const b = await buttons(page);
    assert.ok(b.some(t => /new game/i.test(t)) && b.some(t => /settings/i.test(t)), b.join('|'));
    assert.ok(!b.some(t => /continue/i.test(t)), 'no save, no Continue');
    assert.equal(await page.evaluate(() => localStorage.getItem("kir-save-v2")), null);
    const m0 = await page.evaluate(() => window.kir.minute); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.kir.minute), m0, 'the clock waits');
    await page.locator('.kirtitle .new').first().click();
    await page.waitForTimeout(300);
    assert.equal((await buttons(page)).length, 0, 'title gone');
    assert.deepEqual(errors, []);
    await context.close();
  });

  it('with a save: Continue shows where you are; New game asks first', async () => {
    const { page, context } = await open('?seed=1', { save: true });
    const b = await buttons(page);
    assert.ok(b.some(t => /continue/i.test(t)), b.join('|'));
    assert.match(await page.locator('.kirtitle').innerText(), /rent due in \d+ day/i);
    await page.locator('.kirtitle .new').first().click();
    await page.waitForTimeout(200);
    assert.ok((await buttons(page)).some(t => /start new game/i.test(t)), 'a confirm');
    await context.close();
  });

  it('settings persist, and graphics maps to ?safe', async () => {
    const { page, context } = await open('?seed=1');
    await page.locator('.kirtitle .set').first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /^fast$/i }).click();
    const stored = await page.evaluate(() => localStorage.getItem('kir-settings'));
    assert.match(stored, /"textSpeed":"fast"/);
    assert.equal(graphicsSearch('', 'low'), '?safe=1');
    assert.equal(graphicsSearch('', 'bare'), '?safe=2');
    assert.equal(graphicsSearch('?safe=2', 'low'), '?safe=2');
    assert.equal(graphicsSearch('', 'auto'), '');
    await context.close();
  });
});
