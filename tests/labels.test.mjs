// Action labels: the per-frame placement doesn't force a layout (sizes are measured when a label is built, not every frame).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, walkTo, waitForLabel, steps, stepUntil } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const BEER = `Beer ($${env.config.beer.cost})`;

/** Stand at the dock's extinguisher bracket with the fridge open (4pm): both labels are up, right next to each other. */
async function atBracketAndFridge(game) {
  await game.eval(g => { g.minute = 16 * 60; });
  await walkTo(game, 'extinguisher');
  // a step on, in reach of both (the first such floor cell, found the way the game measures reach)
  const cell = await game.eval((g, w, s) => {
    const p0 = { x: s.pos.x, z: s.pos.z }, C = 0.5;
    let found = null;
    for (let y = 0; y < 80 && !found; y++) for (let x = 0; x < 80 && !found; x++) {
      if (!s.walkable(x, y)) continue;
      s.pos.x = (x + 0.5) * C; s.pos.z = (y + 0.5) * C;
      if (s.inRange('extinguisher') && s.inRange('fridge')) found = { x, y };
    }
    s.pos.x = p0.x; s.pos.z = p0.z;
    if (found) s.walkToPoint((found.x + 0.5) * C, (found.y + 0.5) * C);
    return found;
  });
  assert.ok(cell, 'somewhere in reach of both');
  await stepUntil(game, (g, w, s, c) => !s.walking && s.cell().x === c.x && s.cell().y === c.y, cell, { what: 'walking to the fridge side' });
  assert.ok(await game.eval((g, w, s) => s.inRange('extinguisher') && s.inRange('fridge')), 'in reach of both');
  await waitForLabel(game, 'Grab extinguisher');
  await waitForLabel(game, BEER);
  await steps(game, 3);
}

/** Screen rects of the label buttons. */
const rects = game => game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .lbl button')].map(b => {
  const r = b.getBoundingClientRect();
  return { text: b.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}));

describe('labels', () => {
  it('an unchanged set of labels is placed every frame without measuring the page', async () => {
    const game = await freshGame(env);
    try {
      await atBracketAndFridge(game);
      await game.page.evaluate(() => {
        const n = window.__layoutReads = { count: 0 };
        for (const prop of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop']) {
          const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
          Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get() { n.count++; return d.get.call(this); } });
        }
        const gbcr = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () { n.count++; return gbcr.call(this); };
      });
      const sig = () => game.eval((g, w, s) => s.labelSig);
      const before = await sig();
      for (let i = 0; i < 3; i++) await steps(game, 20);
      assert.equal(await sig(), before, 'the same labels all along');
      const reads = await game.page.evaluate(() => window.__layoutReads.count);
      assert.ok(reads <= 2, `layout reads over 60 frames with nothing changed: ${reads}`);
    } finally { await game.close(); }
  });
});
