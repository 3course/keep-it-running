// Layout mode: the plan's rules and measurements (no browser), then moving things round in the shed — from the pause
// menu, the cost in minutes after the first day, the save, putting it back as built, the summary's walking lines, and
// the breaker a compressor on the extractor's circuit trips.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, tapLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const L = await env.load('/src/world/layoutPlan.ts');
const { NEUTRAL_LAYOUT } = await env.load('/src/sim/Game.ts');

describe('the plan', () => {
  it('as built and every preset are valid; the default layout changes nothing', () => {
    for (const [name, plan] of Object.entries(L.PRESETS)) assert.deepEqual(L.problems(plan), {}, name);
    assert.deepEqual(L.effectsOf(L.measure(L.DEFAULT_PLAN)), { ...NEUTRAL_LAYOUT, switchboardMinutes: L.effectsOf(L.measure(L.DEFAULT_PLAN)).switchboardMinutes });
  });
  it('catches a blocked door, things on top of each other, a duct that won\'t reach', () => {
    const p = L.clonePlan(L.DEFAULT_PLAN);
    p.plyPallet = { x: 26, y: 29, rot: 0 };                        // in front of the roller door
    p.offcutBin = { ...L.DEFAULT_PLAN.finishedPallet };            // on the finished pallet
    p.extractor = { x: 23, y: 40, rot: 0 };                        // down the far end of the dock
    const bad = L.problems(p);
    assert.match(bad.plyPallet, /door/); assert.match(bad.offcutBin, /On top/); assert.match(bad.extractor, /Duct|door|already/);
  });
  it('trade-offs: the compact layout walks less but shares a circuit and puts the fire closer', () => {
    const d = L.measure(L.DEFAULT_PLAN), c = L.measure(L.PRESETS.compact), e = L.effectsOf(c);
    assert.ok(c.fix < d.fix && c.fire < d.fire, 'shorter walks to the bits and the extinguisher');
    assert.ok(e.powerTripPerMinute > 0 && e.fireSpreadMult > 1, 'but the power trips and fires reach the machine faster');
    assert.ok(e.walkMult < 1, 'and the router is cluttered');
  });
});

describe('layout mode in the shed', () => {
  it('from the pause menu: the clock stops; a change is saved, rebuilds the shed, and costs minutes after day 1', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.dayIndex = 3; g.day = 3; s.setPaused(true); });
    await game.page.click('#kir-hud .paused .layout');
    await game.page.waitForFunction(() => window.kirScene.layoutEditor.active);
    const minute = await game.eval(g => g.minute);
    await game.page.waitForTimeout(1200);
    assert.equal(await game.eval(g => g.minute), minute, 'clock stopped');
    assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .layoutcard').textContent), /Steps per job/);
    await game.eval((g, w, s) => { s.layoutEditor.place('plyPallet', 9, 28); s.layoutEditor.place('bitRack', 10, 21); });
    assert.deepEqual(await game.eval((g, w, s) => s.layoutEditor.bad), {});
    assert.equal(await game.eval((g, w, s) => s.layoutEditor.commitNow()), true);
    const after = await game.eval((g, w, s) => ({ rect: s.built.objects.get('plyPallet').def.rect, busy: g.busy, saved: w.layout.plyPallet }));
    assert.deepEqual([after.rect.x, after.rect.y], [9, 28]);
    assert.equal(after.busy.label, 'shoving things round'); assert.equal(after.busy.remaining, 5 + 2);
    // kept across a reload
    await game.eval((g, w, s) => s.setPaused(true));
    await game.page.reload();
    await game.page.waitForFunction(() => window.kirScene?.started);
    assert.deepEqual(await game.page.evaluate(() => { const r = window.kirScene.built.objects.get('plyPallet').def.rect; return [r.x, r.y]; }), [9, 28]);
    // put back as built (pause menu)
    await game.page.evaluate(() => document.querySelector('#kir-hud .paused .resetlayout').click());
    assert.deepEqual(await game.page.evaluate(() => { const r = window.kirScene.built.objects.get('plyPallet').def.rect; return [r.x, r.y]; }), [6, 25]);
    await game.close();
  });

  it('a compressor on the extractor\'s circuit: the breaker trips, and you reset it at the switchboard', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.powerTripped = true; g.machine = 'paused'; });
    await walkTo(game, 'switchboard');
    await tapLabel(game, 'Reset the breaker');
    assert.equal(await game.eval(g => g.powerTripped), false);
    await game.close();
  });

  it('the summary: walking today, and the time the layout lost', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.walkedToday = 1234.4; g.today.layoutMinutes = 6; g.phase = 'daySummary'; });
    await game.page.waitForSelector('#kir-hud .summary .walking');
    const t = await game.page.evaluate(() => [document.querySelector('#kir-hud .summary .walking').textContent, document.querySelector('#kir-hud .summary .layoutcost').textContent]);
    assert.match(t[0], /Walking today\s*1,234 m/); assert.match(t[1], /Time lost to layout\s*6 min/);
    await game.close();
  });
});
