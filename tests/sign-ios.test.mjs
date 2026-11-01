// iPhone: signing for the ply truck with a finger. The docket's touches must go to the pen, never to the world's
// virtual stick or tap-to-walk underneath (on iOS the stick used to pop up in the middle of the pad and nothing was
// drawn while the driver's patience ran out).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { devices } from 'playwright';
import { frames, startBrowser, tapLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

/** iPhone touch emulation: Playwright's iPhone 13 (390×844, @3x, iOS Safari UA) with touch on and mobile layout. */
const IPHONE = { ...devices['iPhone 13'], hasTouch: true, isMobile: true };

async function iphoneGame() {
  const context = await env.browser.newContext(IPHONE);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${env.url}?seed=1`);
  await page.waitForFunction(() => window.kirScene?.started, null, { timeout: 30_000 });
  await page.evaluate(() => { window.kir.tick = () => {}; window.kir.maybeDistraction = () => {}; });
  // spy on the world's input layer: every time the stick is drawn, or a tap walks you somewhere
  await page.evaluate(() => {
    const s = window.kirScene; window.stickShown = 0; window.worldTaps = 0;
    const show = s.hud.showStick.bind(s.hud); s.hud.showStick = (...a) => { window.stickShown++; return show(...a); };
    const tap = s.tap.bind(s); s.tap = (...a) => { window.worldTaps++; return tap(...a); };
  });
  const game = {
    page, context, errors,
    eval: (fn, arg) => page.evaluate(([src, a]) => {
      const scene = window.kirScene;
      return new Function('g', 'w', 'scene', 'arg', `return (${src})(g, w, scene, arg);`)(window.kir, scene.w, scene, a);
    }, [fn.toString(), arg]),
    async close() { await context.close(); assert.deepEqual(errors, [], 'no page errors'); },
  };
  return game;
}

describe('iPhone: sign for the ply', () => {
  it('a finger stroke across the docket signs the delivery, and the stick never wakes', async () => {
    const game = await iphoneGame();
    try {
      assert.equal(await game.eval(g => g.truckOnApron?.stage), 'waiting', "day 1: last week's ply is on the apron");
      await walkTo(game, 'rollerDoor');
      await tapLabel(game, 'Open the roller door');
      // open the docket the way a player does: a real touch on the label
      const t = await game.page.evaluate(() => window.kirScene.labelScreens().find(l => l.text === 'Sign for the ply'));
      assert.ok(t, 'the label is up');
      const lt = await game.page.evaluate(text => {
        const b = [...document.querySelectorAll('#kir-hud .lbl button')].find(x => x.textContent.trim() === text);
        const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, 'Sign for the ply');
      await game.page.touchscreen.tap(lt.x, lt.y);
      await game.page.waitForFunction(() => window.kirScene.gesture.active?.kind === 'sign', null, { timeout: 3_000 });
      assert.equal(await game.eval((g, w, s) => s.uiBlocking), true, 'the docket blocks the world input layer');
      await frames(game, 3);
      await game.eval(() => { window.stickShown = 0; window.worldTaps = 0; });

      // the canvas is set up for a finger, and its backing store matches the screen's pixel ratio
      const cv = await game.page.evaluate(() => {
        const c = document.querySelector('#kir-hud .gesture[data-kind="sign"] canvas'), cs = getComputedStyle(c), r = c.getBoundingClientRect();
        return { touch: cs.touchAction, select: cs.userSelect || cs.webkitUserSelect, w: c.width, cssW: r.width, dpr: devicePixelRatio,
          top: [[0.12, 0.6], [0.5, 0.6], [0.9, 0.6], [0.5, 0.2]].every(([u, v]) => c.parentElement.contains(document.elementFromPoint(r.left + r.width * u, r.top + r.height * v))) };
      });
      assert.equal(cv.touch, 'none');
      assert.equal(cv.select, 'none');
      assert.equal(cv.dpr, 3);
      assert.equal(cv.w, Math.round(cv.cssW * cv.dpr), 'backing store at devicePixelRatio');
      assert.ok(cv.top, 'the docket is the topmost thing under the finger, all across it');

      // one stroke across the middle of the docket with real touch events, a step at a time
      const d = await game.page.evaluate(() => { const r = document.querySelector('#kir-hud .gesture [data-g="sign"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const cdp = await game.context.newCDPSession(game.page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      const y = d.y + d.h * 0.6;
      await touch('touchStart', d.x + d.w * 0.12, y);
      let pausedMidStroke = null;
      for (let i = 1; i <= 20; i++) {
        await touch('touchMove', d.x + d.w * (0.12 + 0.72 * i / 20), y + Math.sin(i * 0.9) * d.h * 0.08);
        await game.page.waitForTimeout(16);
        if (i === 10) pausedMidStroke = await game.eval((g, w, s) => ({ drawing: s.gesture.drawing, signing: g.signing }));
      }
      // ink went down where the finger is (under the middle of the stroke)
      const inked = await game.page.evaluate(([px, py]) => {
        const c = document.querySelector('#kir-hud .gesture[data-kind="sign"] canvas'), r = c.getBoundingClientRect(), k = c.width / r.width;
        const data = c.getContext('2d').getImageData(Math.round((px - r.left) * k) - 6, Math.round((py - r.top) * k) - 30, 12, 60).data;
        for (let i = 0; i < data.length; i += 4) if (data[i + 2] > 100 && data[i + 3] > 200 && data[i] < 80) return true;
        return false;
      }, [d.x + d.w * 0.48, y]);
      await touch('touchEnd');
      await cdp.detach();

      assert.deepEqual(pausedMidStroke, { drawing: true, signing: true }, "the driver's patience is paused while the pen moves");
      assert.ok(inked, 'ink under the finger');
      await game.page.waitForFunction(() => window.kirScene.actionLog.some(a => a.label === 'Sign for the ply'), null, { timeout: 5_000 });
      assert.equal(await game.eval(g => g.truckOnApron?.stage), 'unloading', 'the delivery is signed');
      assert.equal(await game.eval((g, w, s) => s.gesture.active), null, 'the docket closed');
      assert.equal(await game.eval(g => g.signing), false);
      assert.equal(await game.page.evaluate(() => window.stickShown), 0, 'the virtual stick never showed');
      assert.equal(await game.page.evaluate(() => window.worldTaps), 0, 'no tap-to-walk');
      assert.equal(await game.eval((g, w, s) => s.stickVec.x === 0 && s.stickVec.y === 0 && !s.ptr), true, 'the stick is idle');
    } finally { await game.close(); }
  });

  it('the driver waits while you sign', async () => {
    const game = await iphoneGame();
    try {
      const before = await game.eval(g => g.truckOnApron.signBy);
      await game.eval(g => { g.tick = Object.getPrototypeOf(g).tick.bind(g); g.signing = true; g.tick(); g.tick(); g.signing = false; g.tick = () => {}; });
      assert.equal(await game.eval(g => g.truckOnApron.signBy), before + 2, 'two minutes of signing: two more minutes of patience');
    } finally { await game.close(); }
  });
});
