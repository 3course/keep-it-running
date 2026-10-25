// Shared harness for the browser tests: a Vite dev server, headless Chromium as a phone, and a fresh game
// per test (each test gets its own browser context, so localStorage — the save — starts empty).
//
// The game is driven through its own test hooks: window.kir (the Game) and window.kirScene (World3D).
// Labels are tapped with real touch input at their on-screen position, so a label that's covered or
// off-screen fails the test the way it would fail a player.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/** The reference phone the HUD is tuned for (WORLD.view). */
export const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

/**
 * Start the dev server and the browser once per test file. `config` and `mates` come from src/ (and `load`
 * gets any other module), so tests check against the real numbers and names.
 */
export async function startBrowser() {
  const server = await createServer({ logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const load = path => server.ssrLoadModule(path);
  const { CONFIG } = await load('/src/config.ts');
  const { MATES } = await load('/src/data/mates.ts');
  const browser = await chromium.launch();
  return {
    url, browser, load, config: CONFIG, mates: MATES,
    async close() { await browser.close(); await server.close(); },
  };
}

/**
 * A brand-new game on a phone: empty save, day 1, 7:00, a fixed seed (so it plays the same every run). The game clock
 * is stopped (Game.tick is a no-op; advance() runs it) so nothing spawns, wears or wanders off while a test walks
 * around; tests set the time they need.
 */
export async function freshGame(env, seed = 1) {
  const context = await env.browser.newContext(PHONE);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${env.url}?seed=${seed}`);
  await page.waitForFunction(() => window.kirScene?.started, null, { timeout: 30_000 });
  // the clock's stopped (advance() runs it), and nobody turns up unless a test sends them
  await page.evaluate(() => { window.kir.tick = () => {}; window.kir.maybeDistraction = () => {}; });
  const game = {
    page, context, errors,
    /** Run fn(g, w, scene) in the page: g is the Game, w the WorldState. Return value must be JSON. */
    eval: (fn, arg) => page.evaluate(([src, a]) => {
      const scene = window.kirScene;
      return new Function('g', 'w', 'scene', 'arg', `return (${src})(g, w, scene, arg);`)(window.kir, scene.w, scene, a);
    }, [fn.toString(), arg]),
    async close() {
      await context.close();
      assert.deepEqual(errors, [], 'no page errors');
    },
  };
  return game;
}

/** Walk there the way a player would (pathfinding, no auto-action on arrival) and wait to arrive. */
export async function walkTo(game, id) {
  const ok = await game.eval((g, w, scene, id) => { scene.goTo(id, false); return scene.inRange(id) || scene.walking; }, id);
  assert.ok(ok, `no path to ${id}`);
  await game.page.waitForFunction(id => window.kirScene.inRange(id) && !window.kirScene.walking, id, { timeout: 30_000 });
}

/** The label buttons on screen right now. */
export const labels = game => game.page.evaluate(() => window.kirScene.labelScreens().map(l => l.text));

/** Wait for a label to show (exact text). */
export async function waitForLabel(game, text, timeout = 5_000) {
  await game.page.waitForFunction(text => window.kirScene.labelScreens().some(l => l.text === text), text, { timeout }).catch(async () => {
    assert.fail(`no label ${text}; showing: ${JSON.stringify(await labels(game))}`);
  });
}

/** Where a label button is, and whether it's the thing a finger at its centre would actually hit. */
async function labelTarget(game, text) {
  return game.page.evaluate(text => {
    const b = [...document.querySelectorAll('#kir-hud .lbl button')].find(x => x.textContent === text);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, hit: top === b || b.contains(top), onScreen: x > 0 && y > 0 && x < innerWidth && y < innerHeight, covering: top?.className || top?.tagName || 'nothing' };
  }, text);
}

/** Tap a label with a finger. Fails if it isn't showing, is off-screen, or something's on top of it. */
export async function tapLabel(game, text) {
  await waitForLabel(game, text);
  const t = await labelTarget(game, text);
  assert.ok(t, `label "${text}" vanished`);
  assert.ok(t.onScreen, `label "${text}" is off-screen at ${Math.round(t.x)},${Math.round(t.y)}`);
  assert.ok(t.hit, `label "${text}" is covered by ${t.covering}`);
  const before = await game.eval((g, w, scene) => scene.actionLog.length);
  await game.page.touchscreen.tap(t.x, t.y);
  const entry = await game.page.waitForFunction(n => window.kirScene.actionLog[n] ?? null, before, { timeout: 2_000 })
    .then(h => h.jsonValue()).catch(() => assert.fail(`tapping "${text}" did nothing`));
  assert.equal(entry.label, text, 'the tap ran the label it landed on');
  return entry; // { label, said }
}

/** Put a finger down on a hold label (spraying) and keep it there; returns a function that lifts it. */
export async function holdLabel(game, text) {
  await waitForLabel(game, text);
  const t = await labelTarget(game, text);
  assert.ok(t?.onScreen && t.hit, `label "${text}" can't be pressed (${JSON.stringify(t)})`);
  const cdp = await game.context.newCDPSession(game.page);
  const point = [{ x: t.x, y: t.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
  return async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); };
}

/**
 * A mate drops in the way Game does it (Game.spawnDistraction): they come straight over with something to say, not
 * yarning yet. Any mate already in leaves first. `mateId` (src/data/mates.ts): keep sending them until that one turns up.
 */
export async function freshMate(game, mateId) {
  const mate = await game.eval((g, w, s, want) => {
    for (let i = 0; i < 100; i++) {
      g.distractions = g.distractions.filter(d => d.kind !== 'friend');
      g.lastMate = null;
      g.spawnDistraction('friend');
      const d = g.distractions.find(x => x.kind === 'friend');
      if (!want || d.mate === want) return { id: d.id, mate: d.mate, name: g.mateName(d), engaged: d.engaged, ask: d.ask, beers: d.beers, remaining: d.remaining };
    }
    return null;
  }, mateId ?? null);
  assert.ok(mate, `${mateId} never turned up`);
  return mate;
}

/** The visiting mate now (null if they've gone). */
export const mateNow = game => game.eval(g => {
  const d = g.distractions.find(x => x.kind === 'friend');
  return d ? { id: d.id, mate: d.mate, engaged: d.engaged, ask: d.ask, beers: d.beers, chat: d.chat, cooldown: d.cooldown, remaining: d.remaining } : null;
});

/** Run the game clock for `minutes` (freshGame stops it; this runs the real Game.tick), then let the view catch up. */
export async function advance(game, minutes) {
  await game.eval((g, w, s, n) => { const tick = Object.getPrototypeOf(g).tick; for (let i = 0; i < n; i++) tick.call(g); }, minutes);
  await frames(game);
}

/** Set the clock (minutes since midnight). */
export const setTime = (game, hour, min = 0) => game.eval((g, w, s, m) => { g.minute = m; return g.formatTime(); }, hour * 60 + min);

/** Wait a few frames so the view catches up with a state change. */
export const frames = (game, n = 3) => game.page.evaluate(n => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
