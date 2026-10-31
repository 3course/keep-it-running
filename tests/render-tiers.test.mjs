// Render tiers: each tier's internal resolution and the detail it draws. High (desktop/iOS) renders at 2× the base
// 1/3 scale, mid (capable Android) at 1.5×, low (?safe=1) and bare (?safe=2) at 1× with none of the extra detail;
// ?res=N overrides the multiplier. Detail on mid/high: textured sheets, sawdust that follows the extractor bag and
// clears when it's changed, particles (fire embers, sparks when a bit lets go, a dust puff when a cut starts), and
// faked lighting (tube fittings, a shaft through the roller door, the shed going red while flames show).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, PHONE } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

async function open(query = '', userAgent) {
  const context = await env.browser.newContext({ ...PHONE, ...(userAgent ? { userAgent } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${env.url}?seed=1${query}`);
  await page.waitForFunction(() => window.kirScene?.started, null, { timeout: 30_000 });
  await page.evaluate(() => { window.kir.tick = () => {}; window.kir.maybeDistraction = () => {}; window.kirScene.w.tour = null; });
  const view = () => page.evaluate(() => {
    const s = window.kirScene, c = s.renderer.domElement;
    return {
      tier: window.kirGpu.tier, tierRes: s.tier.resMult, res: s.resMult, canvas: [c.width, c.height],
      textures: !!s.looks, sawdust: s.sawdust ? s.sawdust.count : null, particles: s.particles ? s.particles.live : null, lighting: !!s.lighting,
    };
  });
  return { page, view, async close() { await context.close(); assert.deepEqual(errors, [], 'no page errors'); } };
}

/** The canvas is the CSS viewport × 1/3 × the multiplier the view is using now (the frame-rate guard can step it down). */
const expectCanvas = v => [Math.round(390 / 3 * v.res), Math.round(844 / 3 * v.res)];

describe('render tiers', () => {
  for (const [name, query, ua, tier, mult, detail] of [
    ['high (desktop/iOS)', '', null, 'full', 2, true],
    ['mid (capable Android)', '', ANDROID, 'mid', 1.5, true],
    ['?safe=1', '&safe=1', null, 'low', 1, false],
    ['?safe=2', '&safe=2', null, 'bare', 1, false],
  ]) {
    it(`${name}: ${mult}× internal resolution, ${detail ? 'with' : 'without'} the extra detail`, async () => {
      const t = await open(query, ua);
      const v = await t.view();
      assert.equal(v.tier, tier);
      assert.equal(v.tierRes, mult);
      assert.ok(v.res <= mult && v.res >= 1, `multiplier in use ${v.res}`);
      assert.deepEqual(v.canvas, expectCanvas(v));
      assert.equal(v.textures, detail, 'textured sheets');
      assert.equal(v.sawdust !== null, detail, 'sawdust');
      assert.equal(v.particles !== null, detail, 'particles');
      assert.equal(v.lighting, detail, 'tubes, door shaft, fire flicker');
      await t.close();
    });
  }

  it('?res=N overrides the tier and holds (no frame-rate step-down)', async () => {
    const t = await open('&res=1.5');
    const v = await t.view();
    assert.equal(v.tier, 'full');
    assert.equal(v.res, 1.5);
    assert.deepEqual(v.canvas, [195, 422]);
    assert.match(await t.page.evaluate(() => document.body.textContent), /res ×1\.5/, 'tagged on screen');
    await t.close();
  });

  it('sawdust builds as the extractor bag fills and clears when it is changed', async () => {
    const t = await open();
    const set = async f => { await t.page.evaluate(f => { window.kir.wear.filter = f; }, f); await t.page.waitForTimeout(200); return (await t.view()).sawdust; };
    assert.equal(await set(1), 0, 'fresh bag: clean floor');
    const half = await set(0.5), full = await set(0);
    assert.ok(half > 0 && full > half, `more dust as it fills: ${half} then ${full}`);
    assert.equal(await set(1), 0, 'bag changed: swept');
    await t.close();
  });

  it('particles: embers off a fire, sparks when a bit fault starts, a puff when a cut starts', async () => {
    const t = await open();
    assert.deepEqual((await t.view()).particles, { glow: 0, dust: 0 }, 'nothing going on, nothing drawn');
    await t.page.evaluate(() => { window.kir.fire = { id: 99, stage: 'duct', minutes: 10, sprayed: 0, heat: 0 }; });
    await t.page.waitForTimeout(800);
    assert.ok((await t.view()).particles.glow > 0, 'embers while the duct burns');
    const red = await t.page.evaluate(() => { let h; window.kirScene.scene.traverse(o => { if (o.isHemisphereLight) h = o; }); return h.color.r - h.color.g; });
    assert.ok(red > 0.1, `the shed's light goes red (${red.toFixed(2)})`);
    await t.page.evaluate(() => { window.kir.fire = null; });
    await t.page.waitForTimeout(2500);
    assert.equal((await t.view()).particles.glow, 0, 'embers die out once it is out');

    // a bit fault (chipping) starting throws sparks; the machine starting a cut throws dust
    await t.page.evaluate(async () => {
      const { FAULTS } = await import(new URL('src/data/faults.ts', document.baseURI).href);
      window.kir.fault = { def: FAULTS.find(f => f.id === 'chipping'), phase: 'diagnose', minutesOpen: 0, triedDiagnoses: [], busyRemaining: 0, busyLabel: '' };
    });
    await t.page.waitForTimeout(100);
    assert.ok((await t.view()).particles.glow > 0, 'sparks');
    await t.page.evaluate(() => { window.kir.fault = null; window.kir.machine = 'cutting'; });
    await t.page.waitForTimeout(100);
    assert.ok((await t.view()).particles.dust > 0, 'dust puff');
    await t.close();
  });
});
