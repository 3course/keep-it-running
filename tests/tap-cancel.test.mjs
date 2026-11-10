// Touch on the shed floor: a quick lift is a tap (walk there, or use whatever's under it); a touch the system cancels
// (pointercancel: a swipe in from the edge, a call coming in) is not a tap. Real touch events through the browser's
// input layer (CDP), not synthetic DOM events; what's counted is the scene's tap handler being called.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, startBrowser } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

/** A short touch on the shed floor a metre and a half from you, ended by `end` ('touchEnd' or 'touchCancel'). */
async function touch(game, cdp, end) {
  const at = await game.eval((g, w, s) => {
    const V = s.camera.position.constructor, p = new V(s.pos.x - 1.5, 0, s.pos.z).project(s.camera), r = s.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
  await game.page.waitForTimeout(200);
}

describe('touch: tap and cancel', () => {
  it('a quick lift is a tap; a cancelled touch is not', async () => {
    const game = await freshGame(env);
    try {
      // a tap is a lift inside WORLD.tapMaxMs of real time: under a loaded test run the two touch events can land
      // further apart than that, so give the test all the time it needs (what's checked is lift vs cancel, not speed)
      await game.page.evaluate(async () => { const { WORLD } = await import(new URL('src/world/worldConfig.ts', document.baseURI).href); WORLD.tapMaxMs = 60_000; });
      await game.eval((g, w, s) => {
        w.tour = null;
        const tap = s.tap.bind(s);
        window.__taps = 0;
        s.tap = (...a) => { window.__taps++; return tap(...a); };
      });
      const cdp = await game.context.newCDPSession(game.page);
      const taps = () => game.page.evaluate(() => window.__taps);
      await touch(game, cdp, 'touchEnd');
      assert.equal(await taps(), 1, 'a lift: one tap');
      await touch(game, cdp, 'touchCancel');
      assert.equal(await taps(), 1, 'a cancel: no tap');
      await touch(game, cdp, 'touchEnd');
      assert.equal(await taps(), 2, 'and the next lift taps again (the cancel left nothing stuck)');
    } finally { await game.close(); }
  });
});

describe('the first hint', () => {
  it('"Drag anywhere to walk" is learnt by tapping to walk too, so the hints after it come through', async () => {
    const game = await freshGame(env);
    try {
      await game.page.evaluate(async () => { const { WORLD } = await import(new URL('src/world/worldConfig.ts', document.baseURI).href); WORLD.tapMaxMs = 60_000; });
      await game.eval((g, w, s) => { w.tour = null; s.hints.reset(); });
      assert.equal(await game.eval((g, w, s) => s.hints.current), 'Drag anywhere to walk');
      const cdp = await game.context.newCDPSession(game.page);
      await touch(game, cdp, 'touchEnd');
      const now = await game.eval((g, w, s) => s.hints.current);
      assert.notEqual(now, 'Drag anywhere to walk', 'a tap-walk counts');
      assert.equal(now, 'Tap things to use them', 'and the next one comes up');
    } finally { await game.close(); }
  });
});
