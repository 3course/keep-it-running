// Speech bubbles in the shed (playtest 2): a bubble stays max(2.5 s, 0.9 s + 0.06 s a character) of real time (scaled by
// the text speed), tap it to put it away, and while you're within ~2 m of the speaker it stays till you walk off or tap.
// A mate's answer buttons stay until chosen, whatever happens to his bubble.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, freshMate, labels, startBrowser, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { WORLD } = await env.load('/src/world/worldConfig.js');
const B = WORLD.bubble;

describe('speech bubbles', () => {
  it(`held max(${B.minSeconds} s, ${B.baseSeconds} s + ${B.perChar} s a character), scaled by the text speed; tap puts it away; near the speaker it stays; replies keep it`, async () => {
    const game = await freshGame(env);
    try {
      const r = await game.eval(async (g, w, s) => {
        const M = await import(new URL('src/ui/talk.ts', document.baseURI).href);
        const t = new M.Talk(s.hud.labels.parentElement, 'visit'); t.autoHold = true;
        const out = { short: M.holdSeconds('Hi.'), long: M.holdSeconds('x'.repeat(100)) };
        M.TEXT.holdMult = 1.5; out.slow = M.holdSeconds('Hi.'); M.TEXT.holdMult = 1;
        const mine = () => [...document.querySelectorAll('.talk[data-who=mate]')].at(-1);
        t.say('mate', 'Tim', 'Hi.');
        t.update(M.holdSeconds('Hi.') - 0.1); out.before = t.showing('mate');
        t.update(0.2); out.after = t.showing('mate');
        t.say('mate', 'Tim', 'Hi.'); t.update(30, () => true); out.near = t.showing('mate');
        t.update(0.1, () => false); out.walkedOff = t.showing('mate');
        t.say('you', 'You', 'Hi.'); t.update(30, () => true); out.you = t.showing('you');
        t.say('mate', 'Tim', 'Hi.'); t.ask([{ text: 'Yes' }], () => {}); t.update(30); out.asking = t.showing('mate'); t.hideReplies(); t.update(0.1); out.afterReplies = t.showing('mate');
        t.say('mate', 'Tim', 'Hi.'); mine().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); out.tapped = t.showing('mate');
        t.clear();
        return out;
      });
      assert.equal(r.short, B.minSeconds, 'a short line: the minimum');
      assert.ok(Math.abs(r.long - (B.baseSeconds + B.perChar * 100)) < 1e-9, 'a long one: 0.9 s + 0.06 s a character');
      assert.equal(r.slow, B.minSeconds * 1.5, 'slow text stays longer');
      assert.deepEqual([r.before, r.after], [true, false], 'up till its time, then gone');
      assert.deepEqual([r.near, r.walkedOff], [true, false], 'kept while you are near; gone when you walk off');
      assert.equal(r.you, false, 'your own lines do not wait on that');
      assert.deepEqual([r.asking, r.afterReplies], [true, false], 'kept while the replies are up');
      assert.equal(r.tapped, false, 'a tap puts it away');
    } finally { await game.close(); }
  });

  it("a mate's own bubble tapped away: his answer buttons stay until you choose", async () => {
    const game = await freshGame(env);
    try {
      await game.page.evaluate(() => document.querySelectorAll('.lettercard').forEach(e => e.remove()));
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.minute = 10 * 60; });
      await walkTo(game, 'racks');
      await freshMate(game);
      await waitForLabel(game, '"Yeah, what\'s up?"', 20_000);
      const shown = () => game.page.evaluate(() => getComputedStyle(document.querySelector('#kir-hud .bubble.say')).display !== 'none');
      assert.equal(await shown(), true, 'his line is up');
      await game.page.evaluate(() => document.querySelector('#kir-hud .bubble.say').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await game.page.waitForTimeout(200);
      assert.equal(await shown(), false, 'tapped away');
      assert.ok((await labels(game)).includes('"Yeah, what\'s up?"'), 'the buttons stay');
    } finally { await game.close(); }
  });
});
