// Two fingers on the shed (real multi-touch through CDP): the first finger down keeps the stick, and a second finger
// neither takes it over nor taps; the finger holding the spray is the one that aims it and the only one whose lift
// lets go. (A tap is a lift inside WORLD.tapMaxMs of real time: raised here so a loaded run can't change the answer.)
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, startBrowser, walkTo, waitForLabel } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

/** A screen point on the floor `dx` metres west of you. */
const floorPoint = (game, dx) => game.eval((g, w, s, dx) => {
  const V = s.camera.position.constructor, p = new V(s.pos.x - dx, 0, s.pos.z).project(s.camera), r = s.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
}, dx);

async function setUp(game) {
  await game.page.evaluate(async () => { const { WORLD } = await import(new URL('src/world/worldConfig.ts', document.baseURI).href); WORLD.tapMaxMs = 60_000; });
  await game.eval((g, w, s) => {
    w.tour = null;
    const tap = s.tap.bind(s);
    window.__taps = 0;
    s.tap = (...a) => { window.__taps++; return tap(...a); };
  });
  const cdp = await game.context.newCDPSession(game.page);
  // touchStart/touchMove list the fingers down; touchEnd lists the ones lifting
  return (type, ...pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id })) });
}

describe('two fingers', () => {
  it('walking with the stick, a second finger tapping doesn\'t take it over or tap', async () => {
    const game = await freshGame(env);
    try {
      const touch = await setUp(game);
      const p = await floorPoint(game, 1.5), q = await floorPoint(game, -1.5);
      const a0 = { ...p, id: 1 }, a1 = { x: p.x + 60, y: p.y, id: 1 }, b = { ...q, id: 2 };
      await touch('touchStart', a0);
      await touch('touchMove', a1); // past the dead zone: the stick's on
      const stick = await game.eval((g, w, s) => ({ id: s.ptr?.id, active: s.ptr?.active, moving: Math.hypot(s.stickVec.x, s.stickVec.y) > 0 }));
      assert.deepEqual([stick.active, stick.moving], [true, true], 'the stick is on');
      await touch('touchStart', a1, b); // a second finger down…
      await touch('touchEnd', b);       // …and up again (the first's still held)
      await game.page.waitForTimeout(100);
      const after2 = await game.eval((g, w, s) => ({ id: s.ptr?.id, active: s.ptr?.active, moving: Math.hypot(s.stickVec.x, s.stickVec.y) > 0, taps: window.__taps }));
      assert.deepEqual(after2, { id: stick.id, active: true, moving: true, taps: 0 }, 'still the first finger\'s stick; no tap');
      await touch('touchEnd', a1);
    } finally { await game.close(); }
  });

  it('spraying, a second finger doesn\'t move the aim or stop the spray', async () => {
    const game = await freshGame(env);
    try {
      const touch = await setUp(game);
      await game.eval((g, w) => { g.fire = { id: 1, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; w.hooks.wall = false; w.carrying = 'extinguisher'; w.extinguisherFrom = 'wall'; });
      await walkTo(game, 'exhaust');
      await waitForLabel(game, 'Hold to spray');
      const lbl = await game.page.evaluate(() => { const b = [...document.querySelectorAll('#kir-hud .lbl button')].find(x => x.textContent === 'Hold to spray'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const a = { ...lbl, id: 1 }, b = { x: 40, y: 120, id: 2 };
      await touch('touchStart', a);
      await game.page.waitForTimeout(100);
      const held = await game.eval((g, w, s) => ({ hold: s.labelHold, thumb: s.thumb }));
      assert.equal(held.hold, true, 'holding the spray');
      await touch('touchStart', a, b); // a second finger somewhere else…
      await touch('touchEnd', b);      // …and up
      await game.page.waitForTimeout(100);
      const now = await game.eval((g, w, s) => ({ hold: s.labelHold, thumb: s.thumb }));
      assert.equal(now.hold, true, 'the other finger lifting doesn\'t let go of the spray');
      assert.deepEqual(now.thumb, held.thumb, 'the aim stays with the spraying finger');
      await touch('touchEnd', a);
      await game.page.waitForTimeout(100);
      assert.equal(await game.eval((g, w, s) => s.labelHold), false, 'its own lift lets go');
    } finally { await game.close(); }
  });

  it('one finger on the exhaust, one on the label: each lift lets go of its own hold only', async () => {
    const game = await freshGame(env);
    try {
      const touch = await setUp(game);
      await game.eval((g, w) => { g.fire = { id: 1, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; w.hooks.wall = false; w.carrying = 'extinguisher'; w.extinguisherFrom = 'wall'; });
      await walkTo(game, 'exhaust');
      await waitForLabel(game, 'Hold to spray');
      // a point on the exhaust's duct (project its world position; the unit's base sits behind the extractor), and the label's button
      const mesh = await game.eval((g, w, s) => {
        const o = s.built.objects.get('exhaust'), V = s.camera.position.constructor;
        const v = new V(); o.group.getWorldPosition(v); v.y += 1.2;
        const p = v.project(s.camera), r = s.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
      });
      const lbl = await game.page.evaluate(() => { const b = [...document.querySelectorAll('#kir-hud .lbl button')].find(x => x.textContent === 'Hold to spray'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const a = { ...mesh, id: 1 }, b = { ...lbl, id: 2 };
      await touch('touchStart', a);
      await game.page.waitForTimeout(100);
      assert.equal(await game.eval((g, w, s) => s.objectHold), true, 'the mesh finger holds');
      await touch('touchStart', a, b);
      await game.page.waitForTimeout(100);
      assert.equal(await game.eval((g, w, s) => s.labelHold), true, 'the label finger holds too');
      await touch('touchEnd', a); // the mesh finger lifts first
      await game.page.waitForTimeout(100);
      assert.deepEqual(await game.eval((g, w, s) => [s.objectHold, s.labelHold]), [false, true], "its lift drops only its own hold; the label's still sprays");
      await touch('touchEnd', b);
      await game.page.waitForTimeout(100);
      assert.deepEqual(await game.eval((g, w, s) => [s.objectHold, s.labelHold, s.holdId]), [false, false, null], 'everything let go with no finger down');
    } finally { await game.close(); }
  });

  it('held keys are dropped when the window loses focus (the keyups will never come)', async () => {
    const game = await freshGame(env);
    try {
      await game.page.keyboard.down('w');
      await game.page.waitForTimeout(50);
      assert.equal(await game.eval((g, w, s) => s.keys.has('w')), true, 'walking on W');
      await game.page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await game.eval((g, w, s) => s.keys.size), 0, 'nothing held after the window blurs');
      await game.page.keyboard.up('w');
    } finally { await game.close(); }
  });
});
