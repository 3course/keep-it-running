// The first morning (playtest 1): a new game starts at the cafe across the road. Three beats — the mate on the rent,
// the sparky on the shed's fires, a regular who'll send work — then you walk over and the tour starts (and the
// landlord's letter is waiting). Once only; skippable if you've seen it before; never in the daily.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { PHONE, startBrowser } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

async function open(query, seen = false) {
  const context = await env.browser.newContext(PHONE);
  if (seen) await context.addInitScript(() => { try { localStorage.setItem('kir-intro-seen', '1'); } catch { /* fine */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${env.url}${query}`);
  await page.waitForFunction(() => window.kirScene?.started);
  await page.waitForTimeout(300);
  return { page, context, errors };
}
const state = page => page.evaluate(() => { const s = window.kirScene; return {
  cafe: s.cafe.active, minute: window.kir.minute, tour: !!s.w.tour && !s.w.tour.cutStarted, introDone: !!s.w.introDone,
  letter: !!document.querySelector('#kir-hud .lettercard:not(.gone)'), skip: !!document.querySelector('.cafechip.skip'), done: s.w.done } });

describe('the first morning, at the cafe', () => {
  it('three beats (rent, fires, work), then walk over: the tour, and the letter on the bench', async () => {
    const { page, context, errors } = await open('?seed=1');
    try {
      let st = await state(page);
      assert.equal(st.cafe, true, 'you start at the cafe');
      assert.equal(st.letter, false, 'the letter waits till you get to the shed');
      assert.equal(st.skip, false, 'first time: no skip');
      // listen in, hurrying each line along
      const said = new Set();
      for (let k = 0; k < 120; k++) {
        const r = await page.evaluate(() => { const s = window.kirScene; s.cafe.talk.onTap?.(); return { lines: [...document.querySelectorAll('#kir-hud .talk')].map(b => b.textContent), asking: s.cafe.talk.asking }; });
        r.lines.forEach(l => said.add(l));
        if (r.asking) break;
        await page.waitForTimeout(100);
      }
      const all = [...said].join(' | ');
      assert.match(all, /in 20 days/, `the mate on the rent: ${all}`);
      assert.match(all, /fire/i, 'the sparky on the fires');
      assert.match(all, /send work your way/, 'a regular on work');
      assert.equal((await state(page)).minute, 7 * 60, "the shed's clock hasn't started");
      await page.evaluate(() => document.querySelector('#kir-hud .replies.day button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await page.waitForTimeout(300);
      st = await state(page);
      assert.equal(st.cafe, false, 'walked over');
      assert.equal(st.tour, true, 'the tour starts');
      assert.equal(st.letter, true, "the landlord's letter is waiting");
      assert.equal(st.introDone, true);
      assert.ok(st.done.some(l => /rent's \$[\d,]+ in 20 days/.test(l)) && st.done.some(l => /fires/.test(l)) && st.done.some(l => /send work/.test(l)), `the notepad remembers: ${st.done.join(' / ')}`);
      // once only: a reload doesn't play it again
      await page.evaluate(() => window.kirScene.setPaused(true));
      await page.reload(); await page.waitForFunction(() => window.kirScene?.started); await page.waitForTimeout(300);
      assert.equal((await state(page)).cafe, false, 'not again');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  it('the sign (Little Bird, on the upper façade): fully on screen and never under a speech bubble; the job card waits till the shed', async () => {
    const { page, context } = await open('?seed=3');
    try {
      let samples = 0, withBubble = 0;
      for (let k = 0; k < 80; k++) {
        const r = await page.evaluate(() => {
          const s = document.querySelector('.cafesign').getBoundingClientRect();
          const bs = [...document.querySelectorAll('#kir-hud .talk')].filter(b => b.style.display !== 'none').map(b => b.getBoundingClientRect());
          return { done: !window.kirScene.cafe.active || window.kirScene.cafe.talk.asking, inView: s.width > 0 && s.left >= 0 && s.top >= 0 && s.right <= innerWidth && s.bottom <= innerHeight,
            bubbles: bs.length, overlap: bs.some(r => r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top),
            card: !!document.querySelector('#kir-hud .jobcard.show') };
        });
        if (r.done) break;
        if (k > 3) { // (past the camera's ease in)
          samples++; if (r.bubbles) withBubble++;
          assert.ok(r.inView, 'the sign is on screen'); assert.equal(r.overlap, false, 'no bubble over the sign'); assert.equal(r.card, false, 'no job card over the cafe');
        }
        await page.waitForTimeout(200);
      }
      assert.ok(samples > 10 && withBubble > 10, `checked with bubbles up (${withBubble} of ${samples})`);
      await page.evaluate(() => window.kirScene.cafe.leave());
      await page.waitForFunction(() => !!document.querySelector('#kir-hud .jobcard.show'), null, { timeout: 5000 });
    } finally { await context.close(); }
  });

  it("seen it before (another run): a chip skips it", async () => {
    const { page, context } = await open('?seed=2', true);
    try {
      assert.equal((await state(page)).skip, true);
      await page.evaluate(() => document.querySelector('.cafechip.skip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await page.waitForTimeout(300);
      const st = await state(page);
      assert.deepEqual([st.cafe, st.tour, st.letter, st.introDone], [false, true, true, true]);
    } finally { await context.close(); }
  });

  it('never in the daily', async () => {
    const { page, context } = await open('?daily=1');
    try { assert.equal((await state(page)).cafe, false); } finally { await context.close(); }
  });
});
