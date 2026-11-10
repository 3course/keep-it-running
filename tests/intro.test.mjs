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
  if (seen) await context.addInitScript(() => { try { localStorage.setItem('kir:intro-seen', '1'); } catch { /* fine */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${env.url}${query}&title=0`);
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

  it('no auto-advance: each line waits for "Next" (bottom-right) or a tap anywhere; the last comes with "Walk over to the shed"', async () => {
    const { page, context } = await open('?seed=5');
    try {
      const state = () => page.evaluate(() => ({
        lines: [...document.querySelectorAll('#kir-hud .talk')].filter(b => b.style.display !== 'none').map(b => b.textContent),
        next: (() => { const b = document.querySelector('.cafenext'); if (!b) return null; const r = b.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, text: b.textContent }; })(),
        asking: window.kirScene.cafe.talk.asking, minute: window.kir.minute }));
      await page.waitForFunction(() => document.querySelector('#kir-hud .talk') && document.querySelector('.cafenext'), null, { timeout: 10_000 });
      const first = await state();
      assert.equal(first.lines.length, 1); assert.match(first.next.text, /Next/);
      assert.ok(first.next.right < 80 && first.next.bottom < 120, `bottom-right of the screen (${first.next.right}, ${first.next.bottom})`);
      await page.waitForTimeout(6000); // far longer than the old auto-advance
      assert.deepEqual((await state()).lines, first.lines, 'still the first line: nothing advances on its own');
      // the Next button, then a tap anywhere
      await page.evaluate(() => document.querySelector('.cafenext').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await page.waitForFunction(first => [...document.querySelectorAll('#kir-hud .talk')].filter(b => b.style.display !== 'none').map(b => b.textContent).join() !== first, first.lines.join(), { timeout: 3000 });
      const second = await state();
      await page.mouse.click(200, 300);
      await page.waitForFunction(prev => [...document.querySelectorAll('#kir-hud .talk')].filter(b => b.style.display !== 'none').map(b => b.textContent).join() !== prev, second.lines.join(), { timeout: 3000 });
      // on to the last line: Next goes, "Walk over to the shed" comes
      for (let k = 0; k < 12 && !(await state()).asking; k++) { await page.mouse.click(200, 300); await page.waitForTimeout(250); }
      const last = await state();
      assert.equal(last.asking, true); assert.equal(last.next, null, 'no Next on the last line');
      assert.deepEqual(await page.evaluate(() => window.kirScene.cafe.talk.options), ['Walk over to the shed']);
      assert.equal(last.minute, 7 * 60, "the shed's clock hasn't started");
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
        if (k % 12 === 11) await page.evaluate(() => window.kirScene.cafe.talk.onTap?.()); // on to the next line now and then
        await page.waitForTimeout(200);
      }
      assert.ok(samples > 10 && withBubble > 10, `checked with bubbles up (${withBubble} of ${samples})`);
      await page.evaluate(() => window.kirScene.cafe.leave());
      await page.waitForFunction(() => !!document.querySelector('#kir-hud .jobcard.show'), null, { timeout: 5000 });
    } finally { await context.close(); }
  });

  it('the sparrows: pecking, a hop now and then (never two at once, never while someone is talking), off when you walk up', async () => {
    const { page, context } = await open('?seed=4');
    try {
      const sample = () => page.evaluate(() => { const c = window.kirScene.cafe; return { t: c.t, speaking: c.talk.speaking, up: c.sparrows.map(b => b.root.position.y > 0.001), pecking: c.sparrows.map(b => b.head.rotation.z !== 0), visible: c.sparrows.map(b => b.root.visible) }; });
      // Every frame of the birds, recorded in the page (not sampled on a wall clock): what's checked is the scene's own
      // game time, so slow frames under a full run mean a longer wait, never a different answer.
      await page.evaluate(() => {
        const c = window.kirScene.cafe, step = c.updateSparrows.bind(c);
        window.__birds = [];
        c.updateSparrows = dt => { step(dt); window.__birds.push({ t: c.t, speaking: c.talk.speaking, up: c.sparrows.map(b => b.root.position.y > 0.001), pecking: c.sparrows.some(b => b.head.rotation.z !== 0) }); };
      });
      const frames = () => page.evaluate(() => window.__birds.splice(0));
      // someone's talking: pecking only (a couple of game seconds of it)
      await page.waitForFunction(() => window.__birds.length && window.__birds.at(-1).t - window.__birds[0].t >= 2, null, { timeout: 120_000, polling: 100 });
      for (const f of await frames()) if (f.speaking) assert.ok(!f.up.some(Boolean), 'no hops while a bubble is up');
      // quiet (bubbles held off) for 20 game seconds: every bird is due a hop at least every 8 s plus the 1.5 s spacing,
      // so that's two or more hops whatever the frame rate. One at a time, each bird at most every few seconds; they peck.
      await page.evaluate(() => { window.__hush = setInterval(() => window.kirScene.cafe.talk.hush(), 16); window.__birds.length = 0; });
      await page.waitForFunction(() => window.__birds.length && window.__birds.at(-1).t - window.__birds[0].t >= 20, null, { timeout: 120_000, polling: 100 });
      const quiet = await frames();
      const hopsAt = [[], [], []], was = [false, false, false];
      for (const f of quiet) {
        assert.ok(f.up.filter(Boolean).length <= 1, 'never two hopping at once');
        f.up.forEach((u, i) => { if (u && !was[i]) hopsAt[i].push(f.t); was[i] = u; });
      }
      const all = hopsAt.flat();
      assert.ok(all.length >= 2, `they hop now and then (${all.length} in 20 s)`);
      for (const h of hopsAt) for (let i = 1; i < h.length; i++) assert.ok(h[i] - h[i - 1] >= 3.5, `a bird hops at most every 4-8 s (${(h[i] - h[i - 1]).toFixed(1)} s)`);
      assert.ok(quiet.some(f => f.pecking), 'heads down, pecking');
      // you walk up to each bird in turn (they hop about at random, so one spot isn't near all three): off each one goes,
      // and they don't come back
      for (let i = 0; i < 3; i++) {
        await page.evaluate(i => { const c = window.kirScene.cafe, you = c.figs.get('you'), b = c.sparrows[i]; if (b.state === 'gone' || b.state === 'flee') return; you.walking = true; you.root.position.copy(b.root.position).add({ x: 0.5, y: 0, z: 0 }); }, i);
        await page.waitForFunction(i => ['flee', 'gone'].includes(window.kirScene.cafe.sparrows[i].state), i, { timeout: 30_000 });
      }
      await page.waitForFunction(() => window.kirScene.cafe.sparrows.every(b => !b.root.visible), null, { timeout: 120_000 }); // (1.4 game seconds of flying off)
      await page.waitForTimeout(500);
      assert.ok((await sample()).visible.every(v => !v), 'gone for the scene');
    } finally { await page.evaluate(() => clearInterval(window.__hush)).catch(() => {}); await context.close(); }
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
