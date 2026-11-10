// The extinguisher is a thing you carry, like a can (playtest 1): put it down anywhere, it stays there (overnight too),
// and it's picked up from where it is. When a fire starts, a pointer shows where it is, and the day log says where.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { frames, freshGame, labels, startBrowser, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

const fire = (game, id = 7) => game.eval((g, w, s, id) => { g.fire = { id, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; }, id);
const tapChip = game => game.page.evaluate(() => document.querySelector('#kir-hud .canchip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
const chipText = game => game.page.evaluate(() => { const c = document.querySelector('#kir-hud .canchip'); return c.style.display === 'none' ? null : c.textContent; });
const pointerKeys = game => game.eval((g, w, s) => [...s.hud.pointerEls.keys()].filter(k => s.hud.pointerEls.get(k).style.display !== 'none'));

describe('the extinguisher, carried', () => {
  it('grab it in a fire, put it down anywhere with the chip; it stays there; pick it up from there', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; });
      await fire(game);
      await walkTo(game, 'extinguisher');
      assert.equal((await tapLabel(game, 'Grab extinguisher')).said, 'Grabbed the extinguisher');
      assert.equal(await chipText(game), 'Put the extinguisher down');
      await walkTo(game, 'machine');
      await tapChip(game);
      await frames(game);
      const down = await game.eval((g, w, s) => ({ carrying: w.carrying, at: w.extAt.wall, hook: w.hooks.wall, you: { x: s.pos.x, z: s.pos.z }, mesh: s.extMeshes.has('wall') }));
      assert.equal(down.carrying, null, 'out of your hands');
      assert.ok(down.at && Math.hypot(down.at.x - down.you.x, down.at.z - down.you.z) < 0.6, 'at your feet');
      assert.equal(down.hook, false, 'not back on the hook');
      assert.ok(down.mesh, 'you can see it there');
      // it's not on the hook: nothing to grab there
      await walkTo(game, 'extinguisher');
      assert.ok(!(await labels(game)).includes('Grab extinguisher'));
      // a new day: still where you left it
      await game.eval(g => { g.fire = null; g.phase = 'daySummary'; g.nextDay(); });
      await frames(game, 10);
      const kept = await game.eval((g, w) => w.extAt.wall);
      assert.deepEqual(kept, down.at, 'overnight too');
      // picked up from where it is
      await game.eval((g, w, s, at) => s.walkToPoint(at.x, at.z), down.at);
      await waitForLabel(game, 'Pick up the extinguisher', 20_000);
      assert.equal((await tapLabel(game, 'Pick up the extinguisher')).said, 'Picked up the extinguisher');
      assert.deepEqual(await game.eval((g, w) => [w.carrying, w.extinguisherFrom, w.extAt.wall ?? null]), ['extinguisher', 'wall', null]);
    } finally { await game.close(); }
  });

  it('carrying it at knock-off: it\'s down where you stood', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; w.hooks.wall = false; w.carrying = 'extinguisher'; w.extinguisherFrom = 'wall'; });
      await walkTo(game, 'bitRack');
      const you = await game.eval((g, w) => ({ x: w.px, z: w.py }));
      await game.eval((g, w, s) => { g.phase = 'daySummary'; g.nextDay(); });
      await frames(game, 10);
      const r = await game.eval((g, w) => ({ carrying: w.carrying, at: w.extAt.wall }));
      assert.equal(r.carrying, null);
      assert.ok(r.at && Math.hypot(r.at.x - you.x, r.at.z - you.z) < 0.6, `left where you stood: ${JSON.stringify(r.at)} vs ${JSON.stringify(you)}`);
    } finally { await game.close(); }
  });

  it('a fire starts: a pointer to it if it\'s off screen, and the day log says where it was', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; w.hooks.wall = false; w.extAt = { wall: { x: 15.25, z: 1.75 } }; }); // put down at the far end of the rear yard
      await walkTo(game, 'phone'); // in the office: the rear yard's well off screen
      await fire(game, 11);
      await frames(game, 5);
      assert.ok((await pointerKeys(game)).includes('ext'), 'a 🧯 pointer on the screen edge');
      const line = await game.eval(g => g.log.find(l => l.text.startsWith('Fire in the exhaust'))?.text ?? null);
      assert.match(line ?? '', /^Fire in the exhaust \(bag \d+% full\)\. /);
      assert.match(line ?? '', /extinguisher on the floor \(rear yard/i);
      // the notepad's fire line walks you to it
      await game.eval((g, w, s) => s.hud.pad.querySelector('[data-key="fire"]')?.click());
      await frames(game, 3);
      assert.equal(await game.eval((g, w, s) => s.pendingExt), 'wall', 'heading for the extinguisher');
      // in your hands when the next one starts: the log says so
      await game.eval((g, w) => { g.fire = null; delete w.extAt.wall; w.carrying = 'extinguisher'; w.extinguisherFrom = 'wall'; });
      await fire(game, 12);
      await frames(game, 3);
      assert.ok(await game.eval(g => g.log.some(l => /^Fire in the exhaust \(bag \d+% full\)\. extinguisher in your hands\.$/.test(l.text))));
      assert.ok(!(await pointerKeys(game)).includes('ext'), 'in your hands: no pointer');
    } finally { await game.close(); }
  });

  it('off the bracket with no fire: tapping it walks you there and offers it (no grab on arrival); grab, hang it back', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; g.fire = null; });
      // the way a tap on it goes (act: true): arriving doesn't take it, the label does
      await game.eval((g, w, s) => { s.goTo('extinguisher', true); });
      await game.page.waitForFunction(() => window.kirScene.inRange('extinguisher') && !window.kirScene.walking, null, { timeout: 30_000 });
      await frames(game);
      assert.deepEqual(await game.eval((g, w) => [w.carrying, w.hooks.wall]), [null, true], 'still on its bracket');
      await waitForLabel(game, 'Grab extinguisher');
      assert.equal((await tapLabel(game, 'Grab extinguisher')).said, 'Grabbed the extinguisher');
      assert.deepEqual(await game.eval((g, w) => [w.carrying, w.extinguisherFrom, w.hooks.wall, !!g.fire]), ['extinguisher', 'wall', false, false]);
      assert.equal(await chipText(game), 'Put the extinguisher down');
      assert.equal((await tapLabel(game, 'Hang it up')).said, 'Extinguisher back on its hook');
      assert.deepEqual(await game.eval((g, w) => [w.carrying, w.hooks.wall]), [null, true]);
    } finally { await game.close(); }
  });

  it('in a fire, arriving at the bracket still grabs it', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; });
      await fire(game);
      await game.eval((g, w, s) => { s.goTo('extinguisher', true); });
      await game.page.waitForFunction(() => window.kirScene.w.carrying === 'extinguisher', null, { timeout: 30_000 });
    } finally { await game.close(); }
  });

  /** Stand on a floor cell against the west wall, facing it, still. */
  const faceWestWall = game => game.eval((g, w, s) => {
    const C = 0.5;
    let y = 14; while (y < 38 && !(s.walkable(6, y) && s.walkable(7, y) && s.walkable(6, y + 1) && s.walkable(6, y - 1))) y++;
    s.stopWalking(); s.vel = { x: 0, z: 0 };
    s.pos.x = 6 * C + 0.23; s.pos.z = (y + 0.5) * C; w.fx = -1; w.fy = 0; // the player's radius off the wall's face
  });
  /** Is a thing of radius r at p clear of every wall and machine, on a walkable cell? */
  const clear = (game, p, r) => game.eval((g, w, s, [p, r]) => s.walkable(Math.floor(p.x / 0.5), Math.floor(p.z / 0.5))
    && !s.boxes().some(b => p.x + r > b.minX && p.x - r < b.maxX && p.z + r > b.minZ && p.z - r < b.maxZ), [p, r]);

  it('put down facing a wall: it lands on the floor in front of you, not in the wall; picked up from there', async () => {
    const game = await freshGame(env);
    try {
      const { WORLD } = await env.load('/src/world/worldConfig.ts');
      await game.eval((g, w) => { w.tour = null; w.hooks.wall = false; w.carrying = 'extinguisher'; w.extinguisherFrom = 'wall'; });
      await faceWestWall(game);
      await frames(game);
      await tapChip(game);
      const r = await game.eval((g, w, s) => ({ at: w.extAt.wall, you: { x: s.pos.x, z: s.pos.z } }));
      assert.ok(r.at, 'down');
      assert.ok(await clear(game, r.at, WORLD.dropRadius.extinguisher), `clear of the wall: ${JSON.stringify(r)}`);
      assert.ok(r.at.x <= r.you.x + 1e-9 && Math.hypot(r.at.x - r.you.x, r.at.z - r.you.z) < 0.4, `between you and the wall: ${JSON.stringify(r)}`);
      await game.eval((g, w, s) => { s.walkToPoint(w.extAt.wall.x, w.extAt.wall.z); s.pendingExt = 'wall'; });
      await game.page.waitForFunction(() => window.kirScene.w.carrying === 'extinguisher', null, { timeout: 15_000 });
    } finally { await game.close(); }
  });

  it('a can put down facing a wall lands clear of it too (the same drop code)', async () => {
    const game = await freshGame(env);
    try {
      const { WORLD } = await env.load('/src/world/worldConfig.ts');
      await game.eval((g, w) => { w.tour = null; g.minute = 16 * 60; });
      assert.ok(await game.eval(g => g.buyBeer()), 'a can in hand');
      await faceWestWall(game);
      await frames(game);
      await tapChip(game);
      const r = await game.eval((g, w, s) => { const c = g.cans.find(x => !x.held && w.canSpots?.[x.id]); return c ? { at: w.canSpots[c.id], you: { x: s.pos.x, z: s.pos.z } } : null; });
      assert.ok(r, 'down');
      assert.ok(await clear(game, r.at, WORLD.dropRadius.can), `clear of the wall: ${JSON.stringify(r)}`);
    } finally { await game.close(); }
  });
});
