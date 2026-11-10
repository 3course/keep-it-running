// GPU resources don't pile up: several days of people coming and going (the cafe, a mate in the shed, Dennis's coffee,
// a knock-off night with a mate rung in, the morning's cans picked up so the gratitude rebuilds) and a layout change
// each day (the whole shed rebuilt), and the renderer holds no more geometries, textures or live materials at the end
// than after the first day. Live materials: ones the renderer has set up (it listens for their 'dispose') and that
// haven't been disposed since.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, steps, stepUntil } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

/**
 * Track what the renderer holds from now on: a material, geometry or texture is live from when the renderer starts
 * listening for its 'dispose' (three does that the first time it compiles or uploads it) till it stops (disposed).
 */
const track = game => game.page.evaluate(() => {
  let mesh = null, tex = null;
  window.kirScene.scene.traverse(o => {
    if (!mesh && o.isMesh && !Array.isArray(o.material)) mesh = o;
    if (!tex && o.material && !Array.isArray(o.material)) tex = o.material.map ?? o.material.gradientMap ?? null;
  });
  const base = (o, name) => { let p = Object.getPrototypeOf(o); while (p && p.constructor.name !== name) p = Object.getPrototypeOf(p); if (!p) throw new Error(`no ${name}`); return p; };
  const live = window.__live = { materials: new Set(), geometries: new Set(), textures: new Set() };
  for (const [proto, set] of [[base(mesh.material, 'Material'), live.materials], [base(mesh.geometry, 'BufferGeometry'), live.geometries], [base(tex, 'Texture'), live.textures]]) {
    const add = proto.addEventListener, remove = proto.removeEventListener;
    proto.addEventListener = function (type, l) { if (type === 'dispose') set.add(this); return add.call(this, type, l); };
    proto.removeEventListener = function (type, l) { if (type === 'dispose') set.delete(this); return remove.call(this, type, l); };
  }
});

/**
 * Orphans: live things nothing in the current scene uses (a leak is exactly that: the renderer's still holding it and
 * nobody can ever draw it or dispose it again). Counts of everything live would move with what's on screen that day
 * (the truck in, Jess in, a mate in a hi-vis); orphans don't. By kind, for a failure message; and the renderer's own counts.
 */
const orphans = game => game.page.evaluate(async () => {
  // shared for good (toon()'s cache grows by a colour when someone new wears one: bounded, and meant): not orphans
  const isShared = await import(new URL('src/world3d/dispose.ts', document.baseURI).href).then(m => m.isShared, () => () => false); // (a build without it)
  const used = new Set(), s = window.kirScene;
  s.scene.traverse(o => {
    if (o.geometry) used.add(o.geometry);
    for (const m of o.material ? [o.material].flat() : []) { used.add(m); for (const v of Object.values(m)) if (v?.isTexture) used.add(v); }
  });
  const sig = {
    materials: m => `${m.type}${m.color ? ' #' + m.color.getHexString() : ''}${m.map ? ' +map' : ''}`,
    geometries: g => `${g.type} ${JSON.stringify(g.parameters ?? {}).slice(0, 60)}`,
    textures: t => `${t.constructor.name} ${t.image?.width ?? ''}x${t.image?.height ?? ''}`,
  };
  const out = { n: {}, kinds: {}, info: { ...s.renderer.info.memory } };
  for (const k of ['materials', 'geometries', 'textures']) {
    const left = [...window.__live[k]].filter(x => !used.has(x) && !isShared(x));
    out.n[k] = left.length;
    out.kinds[k] = {};
    for (const x of left) { const key = sig[k](x); out.kinds[k][key] = (out.kinds[k][key] ?? 0) + 1; }
  }
  return out;
});
const diff = (a, b) => { const out = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = (b[k] ?? 0) - (a[k] ?? 0); if (d) out[k] = d; } return out; };

/** Reply `i` (or the last) on the knock-off's bubbles. */
const reply = (game, i) => game.eval((g, w, s, i) => {
  const bs = [...document.querySelectorAll('#kir-hud .replies:not(.day) button')];
  bs[i < 0 ? bs.length + i : i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}, i);

/** Until the knock-off's replies are up (hurrying the lines along the way a tap does), or the night's over. */
const untilReplies = game => stepUntil(game, (g, w, s) => {
  if (s.knockoff.talk.asking || s.knockoff.mode === 'off') return true;
  s.knockoff.talk.onTap?.();
  return false;
}, null, { frames: 6000, what: 'the knock-off replies' });

/** One day of comings and goings. Ends at the next morning, with nobody in and the shed as built. */
async function day(game) {
  await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.minute = 7 * 60 + 5; });
  await steps(game, 5);
  // the cafe: in and out
  await game.eval((g, w, s) => s.cafe.enter());
  await steps(game, 20);
  await game.eval((g, w, s) => s.cafe.leave());
  await steps(game, 5);
  // last night's empties (a few, at least, made up on the first morning), picked up one at a time: the gratitude rebuilds each time
  await game.eval(async (g, w) => {
    if (w.people.cans.length) return;
    const { scatterCans } = await import(new URL('src/world/cans.ts', document.baseURI).href);
    scatterCans(w.people, 6, g.dayIndex);
  });
  for (let k = 0; k < 40 && await game.eval((g, w) => w.people.cans.length); k++) {
    await game.eval((g, w) => { w.people.cans.pop(); });
    await steps(game, 2);
  }
  // move the ply pallet and the bit rack, then put them back: the shed's rebuilt twice
  const was = await game.eval((g, w, s) => { const p = s.plan; return { ply: p.plyPallet, bits: p.bitRack }; });
  for (const [ply, bits] of [[[9, 28], [10, 21]], [[was.ply.x, was.ply.y], [was.bits.x, was.bits.y]]]) {
    await game.eval((g, w, s, a) => {
      s.enterLayout(); s.layoutEditor.place('plyPallet', ...a.ply); s.layoutEditor.place('bitRack', ...a.bits);
      if (Object.keys(s.layoutEditor.bad).length) throw new Error(JSON.stringify(s.layoutEditor.bad));
      if (!s.layoutEditor.commitNow()) throw new Error('layout not committed');
      g.busy = null; s.layoutOffered = g.dayIndex;
    }, { ply, bits });
    await steps(game, 5);
  }
  // a mate drops in to the shed, and goes
  await game.eval(g => g.spawnDistraction('friend'));
  await steps(game, 10);
  assert.ok(await game.eval((g, w, s) => !!s.shedMate), 'the mate is in the shed');
  await game.eval(g => { g.distractions = g.distractions.filter(d => d.kind !== 'friend'); });
  await steps(game, 3);
  // Dennis in for a coffee, and gone
  await game.eval((g, w, s) => { g.minute = 10 * 60; s.dennisView.coffeeVisit(); });
  await steps(game, 5);
  await game.eval(g => { g.minute = 11 * 60; });
  await steps(game, 3);
  // 5pm: a beer, ring a mate if it comes up, then wind it up
  await game.eval((g, w, s) => { s.jobCard.hide(); g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
  await stepUntil(game, (g, w, s) => s.knockoff.talk.asking, null, { what: 'the mate at the door' });
  await reply(game, 0);
  for (let turn = 0; turn < 10; turn++) {
    await untilReplies(game);
    if (await game.eval((g, w, s) => s.knockoff.mode === 'off')) break;
    const o = await game.eval((g, w, s) => ({ opts: s.knockoff.talk.options, guest: s.knockoff.night.guest, calling: !!s.knockoff.night.calling }));
    if (o.guest) break;
    const call = o.opts.findIndex(x => /call/i.test(x)), yes = o.opts.findIndex(x => /^go on/i.test(x));
    await reply(game, yes >= 0 ? yes : call >= 0 && !o.calling ? call : 0);
  }
  await untilReplies(game);
  if (await game.eval((g, w, s) => s.knockoff.mode !== 'off')) await reply(game, -1); // wind it up
  await stepUntil(game, g => g.phase === 'daySummary', null, { frames: 6000, what: 'the end of the night' });
  // tomorrow
  for (let k = 0; k < 6 && await game.eval(g => g.phase !== 'day'); k++) {
    await game.page.click('#kir-hud .summary .next');
    await steps(game, 2);
  }
  assert.equal(await game.eval(g => g.phase), 'day');
  // the morning: tonight's cans are tomorrow's to pick up; gifts and keepsakes would legitimately add to the shed, so none
  await game.eval((g, w) => {
    const p = w.people;
    p.gifts = []; p.pendingGifts = []; p.keepsakes = []; p.fridgeGifted = 0; p.bagged = 0; p.oddObject = null;
  });
  await steps(game, 5);
}

describe('GPU memory', () => {
  it('several days and layout changes: nothing the renderer holds is left behind', async () => {
    const game = await freshGame(env);
    await track(game);
    await day(game);                    // warm-up: everything made once (the cafe set, the caches) is made
    const before = await orphans(game);
    console.log('  after the warm-up:', JSON.stringify(before.n), 'renderer', JSON.stringify(before.info));
    let end = before;
    for (let d = 0; d < 3; d++) {
      await day(game);
      end = await orphans(game);
      console.log(`  day ${d + 2}:`, JSON.stringify(end.n), 'renderer', JSON.stringify(end.info));
    }
    const what = Object.fromEntries(['materials', 'geometries', 'textures'].map(k => [k, diff(before.kinds[k], end.kinds[k])]));
    assert.deepEqual(end.n, before.n, `orphans piled up: ${JSON.stringify(what)}`);
    await game.close();
  });
});
