// Which layout a screen gets (by its shape, never the device), and which words and button prompts the player sees (by
// the input they're using: touch, keyboard or a pad, with that pad's letters), switching the moment they change. The
// keyboard mirrors the pad; a pad going away pauses the game. Settings stored with junk in them load as defaults.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { freshGame, padConnect, padFocus, padPress, PHONE, startBrowser, steps, TV, TV1080 } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { layoutFor, hudScale, LANDSCAPE } = await env.load('/src/ui/viewLayout.ts');

describe('layout by aspect ratio', () => {
  it('portrait when taller than wide; landscape otherwise; the HUD scale from the height in landscape', () => {
    assert.equal(layoutFor(390, 844), 'portrait', 'a phone held up');
    assert.equal(layoutFor(1000, 1000), 'portrait', 'square: still portrait');
    assert.equal(layoutFor(844, 390), 'landscape', 'a phone on its side');
    assert.equal(layoutFor(1280, 720), 'landscape');
    assert.equal(layoutFor(1920, 1080), 'landscape');
    assert.equal(layoutFor(1024, 768), 'landscape', '4:3 too');
    assert.equal(hudScale(390, 844), 1, 'the reference phone');
    assert.ok(Math.abs(hudScale(1280, 720) - 720 / LANDSCAPE.scaleFromHeight) < 1e-9, '720p');
    assert.equal(hudScale(1920, 1080), LANDSCAPE.maxScale, '1080p');
    // the smallest font after scaling: 16px at 720p, from the couch
    assert.ok(LANDSCAPE.minFontPx * hudScale(1280, 720) >= 16);
  });

  it('in the browser: a TV gets the landscape HUD with a 5% safe area; a phone the portrait one, untouched; a resize switches', async () => {
    const read = game => game.page.evaluate(() => {
      const r = document.documentElement, cs = getComputedStyle(r);
      const pad = document.querySelector('#kir-hud .pad').getBoundingClientRect(), clock = document.querySelector('#kir-hud .clock').getBoundingClientRect();
      return { layout: r.dataset.layout, s: cs.getPropertyValue('--s').trim(), tvx: cs.getPropertyValue('--tvx').trim(), tvy: cs.getPropertyValue('--tvy').trim(),
        padLeft: Math.round(pad.left), clockRight: Math.round(innerWidth - clock.right), clockTop: Math.round(clock.top), w: innerWidth, h: innerHeight };
    });
    for (const [dev, want] of [[TV, { layout: 'landscape', tvx: '64px', tvy: '36px' }], [TV1080, { layout: 'landscape', tvx: '96px', tvy: '54px' }], [PHONE, { layout: 'portrait', tvx: '0px', tvy: '0px' }]]) {
      const game = await freshGame(env, 1, dev);
      try {
        const r = await read(game);
        assert.deepEqual({ layout: r.layout, tvx: r.tvx, tvy: r.tvy }, want, JSON.stringify(r));
        if (want.layout === 'landscape') {
          // everything the HUD pins to an edge is inside the safe area
          assert.ok(r.padLeft >= r.w * 0.05 - 1 && r.clockRight >= r.w * 0.05 - 1 && r.clockTop >= r.h * 0.05 - 1, JSON.stringify(r));
        } else assert.equal(r.s, '1', 'the phone HUD at its own scale');
        if (dev === PHONE) {
          // turned on its side: landscape, by shape
          await game.page.setViewportSize({ width: 844, height: 390 });
          await steps(game, 3);
          assert.equal((await read(game)).layout, 'landscape');
        }
      } finally { await game.close(); }
    }
  });
});

describe('prompts follow the input', () => {
  it('touch, then keys, then a pad (Xbox, then PlayStation letters), then touch again: hint, ring and legend switch', async () => {
    const game = await freshGame(env, 1, { ...TV, hasTouch: true });
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); localStorage.removeItem('kir:hints-v1'); });
      const now = () => game.eval((g, w, s) => ({
        kind: s.input.kind, hint: document.querySelector('#kir-hud .hint')?.textContent ?? '',
        legend: document.querySelector('.padlegend')?.style.display !== 'none' ? document.querySelector('.padlegend').textContent : '',
        ring: !!document.querySelector('.padfocus'),
      }));
      await steps(game, 3);
      let p = await now();
      assert.equal(p.kind, 'touch'); assert.match(p.hint, /Drag anywhere to walk/); assert.equal(p.legend, ''); assert.equal(p.ring, false);
      // a key
      await game.page.keyboard.down('q'); await steps(game, 2); await game.page.keyboard.up('q'); await steps(game, 3);
      p = await now();
      assert.equal(p.kind, 'keyboard'); assert.match(p.hint, /WASD or arrow keys/); assert.match(p.legend, /Tab\s*Notepad/);
      // a pad turns up: its prompts at once, its letters
      await padConnect(game); await steps(game, 3);
      p = await now();
      assert.equal(p.kind, 'pad'); assert.match(p.hint, /Left stick/); assert.match(p.legend, /Y\s*Notepad/); assert.match(p.legend, /Menu\s*Pause/);
      await padConnect(game, 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'); await padPress(game, 'up'); await steps(game, 2);
      assert.match((await now()).legend, /△\s*Notepad/, 'PlayStation letters');
      await padConnect(game, 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'); await padPress(game, 'up'); await steps(game, 2);
      assert.match((await now()).legend, /X\s*Notepad/, 'Switch letters (X on top)');
      // a finger: back to touch, the ring and legend go
      await game.page.touchscreen.tap(900, 400); await steps(game, 3);
      p = await now();
      // (the tap itself got you about, so that hint's done: the next one, in touch words)
      assert.equal(p.kind, 'touch'); assert.match(p.hint, /Tap things to use them/); assert.equal(p.legend, ''); assert.equal(p.ring, false);
    } finally { await game.close(); }
  });

  it('the keyboard mirrors the pad: WASD walks, Tab the notepad, E takes a line, Esc pauses and resumes', async () => {
    const game = await freshGame(env, 1, TV);
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); });
      const at = () => game.eval((g, w, s) => ({ x: s.pos.x, z: s.pos.z }));
      const a = await at();
      await game.page.keyboard.down('d'); await steps(game, 15); await game.page.keyboard.up('d'); await steps(game, 2);
      const b = await at();
      assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.5, 'walked');
      await game.page.keyboard.press('Tab'); await steps(game, 2);
      assert.equal((await padFocus(game)).layer, 'notepad');
      const before = await game.eval((g, w, s) => s.actionLog.length);
      await game.page.keyboard.press('e'); await steps(game, 3);
      // E on a line: off there (or, already in reach, it's done)
      assert.equal(await game.eval((g, w, s, n) => s.walking || !!s.pending || !!s.gesture.active || s.actionLog.length > n, before), true, 'E took the line');
      assert.notEqual((await padFocus(game)).layer, 'notepad', 'and the notepad lets go');
      await game.page.keyboard.press('Escape'); await steps(game, 2);
      assert.equal(await game.eval((g, w, s) => s.paused), true, 'Esc pauses');
      await game.page.keyboard.press('Escape'); await steps(game, 2);
      assert.equal(await game.eval((g, w, s) => s.paused), false, 'Esc again: Resume (back)');
    } finally { await game.close(); }
  });

  it('a pad going away mid-game pauses it', async () => {
    const game = await freshGame(env, 1, TV);
    try {
      await game.eval((g, w, s) => { w.tour = null; document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); });
      await padConnect(game); await padPress(game, 'up');
      assert.equal(await game.eval((g, w, s) => s.paused), false);
      await game.eval((g, w, s) => { s.input.virtualPad = null; });
      await steps(game, 3);
      assert.equal(await game.eval((g, w, s) => s.paused), true, 'paused');
      assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .toast').textContent), /disconnected/i);
    } finally { await game.close(); }
  });
});

describe('settings with junk in them', () => {
  it('each field: a wrong type or out of range loads as its default; rumble stays off once turned off', async () => {
    const { parseSettings, DEFAULT_SETTINGS } = await env.load('/src/settings.ts');
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('x'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings([]), DEFAULT_SETTINGS);
    const JUNK = [null, 'x', -1, 2, 1e308, true, [], {}, '__proto__'];
    for (const key of Object.keys(DEFAULT_SETTINGS)) for (const junk of JUNK) {
      const s = parseSettings({ ...DEFAULT_SETTINGS, [key]: junk });
      assert.deepEqual(Object.keys(s).sort(), Object.keys(DEFAULT_SETTINGS).sort(), `${key}=${JSON.stringify(junk)}: the same fields`);
      for (const k of Object.keys(DEFAULT_SETTINGS)) assert.equal(typeof s[k], typeof DEFAULT_SETTINGS[k], `${key}=${JSON.stringify(junk)}: ${k}'s type`);
      if (key === 'rumble') assert.equal(s.rumble, junk !== false, `rumble=${JSON.stringify(junk)}`);
    }
    assert.equal(parseSettings({ rumble: false }).rumble, false, 'off stays off');
    const polluted = parseSettings(JSON.parse('{"__proto__":{"rumble":false},"sound":0.5}'));
    assert.equal(polluted.sound, 0.5); assert.equal(polluted.rumble, true); assert.equal(({}).rumble, undefined, 'no prototype pollution');
  });
});
