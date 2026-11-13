// The game with a gamepad and nothing else, in landscape on a 720p screen: every gesture has one pad mapping (hold A;
// A on each target; hold A and steer the left stick; d-pad then A), the spray is aimed with the stick, and a whole day
// plays start to finish on the pad. The pad is a virtual one read through the same path as a real pad (src/input),
// and the view is stepped frame by frame; only the hold gestures wait real seconds, by design (as they do for a thumb).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { advance, freshGame, padConnect, padFocus, padGesture, padLabel, padPress, padSet, startBrowser, stepUntil, steps, TV, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const C = env.config;

const breakDown = (game, id, type = 'formwork') => game.eval(async (g, w, s, a) => {
  const { FAULTS } = await import(new URL('src/data/faults.ts', document.baseURI).href);
  w.tour = null;
  const job = g.jobs.find(j => j.type === a.type) ?? g.jobs[0];
  job.type = a.type; job.status = 'cutting'; job.progress = 5;
  g.current = job; w.bed = 'running'; w.bedJobId = job.id;
  g.fault = { def: FAULTS.find(f => f.id === a.id), phase: 'diagnose', minutesOpen: 0, triedDiagnoses: [], busyRemaining: 0, busyLabel: '' };
  g.machine = 'fault';
  return job.id;
}, { id, type });
const workThrough = async game => {
  await game.eval(g => { const tick = Object.getPrototypeOf(g).tick; for (let i = 0; i < 30 && g.fault?.phase === 'working'; i++) tick.call(g); });
  await advance(game, 0);
};

/** `SHOTS=<dir>`: also save each screen at 1280×720 (the PR's screenshots). */
const shot = async (game, name) => { if (process.env.SHOTS) await game.page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function padGame(seed = 1) {
  const game = await freshGame(env, seed, TV);
  await padConnect(game);
  await steps(game, 3);
  return game;
}

describe('each gesture, by pad', () => {
  it("the morning's cans (a tap on them, for a thumb): a prompt beside them for the pad, A picks one up", async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => {
        w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove());
        w.people.cans = [{ id: 1, spot: 'floor', x: s.pos.x + 0.4, y: 0, z: s.pos.z }];
      });
      await padLabel(game, 'Pick up the can');
      assert.deepEqual(await game.eval((g, w) => [w.carrying, w.canCount, w.people.cans.length]), ['cans', 1, 0]);
    } finally { await game.close(); }
  });

  it('after-hours trace: the stick brings a cursor; hold A and steer to draw; the d-pad to Cut it', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); s.tracing.start('freehand', 'eggby', 0, a => { window.__traced = a; }); });
      await stepUntil(game, (g, w, s) => s.padNav.layer === 'replies', null, { frames: 60, what: 'offcut or sheet' });
      await padPress(game, 'confirm'); // an offcut
      await stepUntil(game, (g, w, s) => s.tracing.drawing, null, { frames: 200, what: 'the pencil out' });
      // the stick: a cursor over the sheet; A held and steered: a line
      await padSet(game, [], { lx: -0.5, ly: -0.2 }); await steps(game, 6);
      assert.equal(await game.eval((g, w, s) => s.padNav.cursor.on), true, 'a cursor');
      await padSet(game, ['confirm']); await steps(game, 2);
      for (const [lx, ly] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { await padSet(game, ['confirm'], { lx, ly }); await steps(game, 6); }
      await padSet(game, []); await steps(game, 3);
      assert.ok(await game.eval((g, w, s) => s.tracing.strokes.flat().length) > 4, 'drawn');
      await shot(game, '22-trace');
      // the d-pad (not the stick) goes to the answers: Cut it
      await padPress(game, 'down');
      assert.equal((await padFocus(game)).layer, 'replies');
      for (let i = 0; i < 4 && (await padFocus(game)).text !== 'Cut it'; i++) await padPress(game, 'up', { hold: 1, after: 1 });
      await padPress(game, 'confirm');
      await stepUntil(game, (g, w, s) => !s.tracing.drawing, null, { frames: 60, what: 'cutting' });
    } finally { await game.close(); }
  });

  it('taps (the clips), drag down (tip the bag), drag up (fit the new one): the extractor bag', async () => {
    const game = await padGame();
    try {
      await breakDown(game, 'extraction');
      await walkTo(game, 'extractor');
      await padLabel(game, 'Bin full or hose blocked');
      await padLabel(game, 'Empty the bin and clear the hose yourself (~13m)');
      await padLabel(game, 'Unclip the bag'); // taps: A on each clip
      assert.equal(await game.eval((g, w) => w.carrying), 'bag');
      await workThrough(game);
      await walkTo(game, 'skip');
      await padLabel(game, 'Tip the bag'); // drag down: hold A, stick down
      await workThrough(game);
      await walkTo(game, 'bags');
      await padLabel(game, 'Grab a new bag');
      await walkTo(game, 'extractor');
      await padLabel(game, 'Fit the new bag'); // drag up
      await workThrough(game);
      await padLabel(game, 'Restart');
      await workThrough(game);
      assert.deepEqual(await game.eval((g, w) => [g.fault, w.carrying, g.wear.filter]), [null, null, 1]);
    } finally { await game.close(); }
  });

  it('hold (inspect the bit) and pick (the right bit off the rack, d-pad then A)', async () => {
    const game = await padGame();
    try {
      await breakDown(game, 'chipping', 'formwork');
      await walkTo(game, 'machine');
      await padLabel(game, 'Dull or wrong bit');
      await padLabel(game, 'Swap in a new compression bit yourself (~9m, $85)');
      await padLabel(game, 'Inspect the bit'); // a hold: A held for the ring's real seconds
      await workThrough(game);
      await walkTo(game, 'bitRack');
      const label = await game.eval((g, w, s) => s.labelScreens().map(l => l.text).find(t => /bit/i.test(t)));
      await padLabel(game, label); // the pick: the one that matches the swatch
      assert.equal(await game.eval((g, w) => w.carrying), 'bit', 'the right bit in hand');
    } finally { await game.close(); }
  });

  it('spray: hold A on "Hold to spray" and steer the aim onto the glow with the stick', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w) => { w.tour = null; g.fire = { id: 9, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; w.carrying = 'extinguisher'; w.hooks.wall = false; w.extinguisherFrom = 'wall'; });
      await walkTo(game, 'exhaust');
      await padLabel(game, 'Hold to spray').catch(() => {}); // (a hold label logs nothing: it's the hold that counts)
      await padSet(game, ['confirm']); await steps(game, 2);
      // steer: the aim mark (above the pad's pointer) onto the glow
      for (let i = 0; i < 120; i++) {
        const v = await game.eval((g, w, s) => {
          const t = s.sprayTarget(), p = s.thumb;
          const dx = t.x - p.x, dy = t.y - (p.y - t.above), d = Math.hypot(dx, dy);
          return d < t.radius * 0.4 ? null : { x: dx / d, y: dy / d };
        });
        if (!v) break;
        await padSet(game, ['confirm'], { lx: v.x, ly: v.y }); await steps(game, 1);
      }
      await padSet(game, ['confirm']); await steps(game, 2);
      assert.equal(await game.eval(g => g.spraying), true, 'on the glow: spraying');
      await advance(game, C.fire.sprayMinutes.spot);
      await padSet(game, []); await steps(game, 3);
      assert.equal(await game.eval(g => g.fire), null, 'out');
    } finally { await game.close(); }
  });
});

// ---------- every screen: navigable with the d-pad, and left with the pad (no dead ends) ----------


/** Ring everything on the top layer with the d-pad (down, then right): what it visited. Fails if nothing's ringed. */
async function walkLayer(game, layer, { max = 14 } = {}) {
  await steps(game, 2);
  const seen = [];
  for (const dir of ['down', 'right', 'up']) {
    for (let i = 0; i < max; i++) {
      const f = await padFocus(game);
      assert.equal(f.layer, layer, `still on ${layer} (${JSON.stringify(f)})`);
      if (!seen.includes(f.text)) seen.push(f.text);
      await padPress(game, dir, { hold: 1, after: 1 });
    }
  }
  assert.ok(seen.length >= 1 && seen.some(Boolean), `${layer}: something to press`);
  return seen;
}
const layerNow = async game => (await padFocus(game)).layer;
const page_wait = (game, ms) => game.page.waitForTimeout(ms);

describe('every screen, by pad', () => {
  it('title, settings, the first morning, the letter', async () => {
    const context = await env.browser.newContext(TV);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${env.url}?seed=1`);
    await page.waitForFunction(() => window.kirScene?.started, null, { timeout: 30_000 });
    const game = { page, context, eval: (fn, a) => page.evaluate(([src, a]) => new Function('g', 'w', 'scene', 'arg', `return (${src})(g, w, scene, arg);`)(window.kir, window.kirScene.w, window.kirScene, a), [fn.toString(), a]) };
    try {
      await padConnect(game); await steps(game, 3);
      assert.equal(await layerNow(game), 'title');
      await shot(game, '01-title');
      const t = await walkLayer(game, 'title');
      assert.ok(t.includes('New game') && t.includes('Settings'), JSON.stringify(t));
      // settings: every row, a slider nudged, the rumble switch, then B back to the title
      while ((await padFocus(game)).text !== 'Settings') await padPress(game, 'down', { hold: 1, after: 1 });
      await padPress(game, 'confirm');
      assert.equal(await layerNow(game), 'settings');
      await shot(game, '02-settings');
      const s = await walkLayer(game, 'settings');
      assert.ok(s.includes('Done'), JSON.stringify(s));
      await padPress(game, 'back');
      assert.equal(await layerNow(game), 'title', 'B: back to the title');
      // New game: the first morning (the cafe): Next by A, and B skips it
      while ((await padFocus(game)).text !== 'New game') await padPress(game, 'up', { hold: 1, after: 1 });
      await padPress(game, 'confirm');
      await stepUntil(game, (g, w, s) => s.cafe.active, null, { what: 'the first morning' });
      await steps(game, 40);
      await shot(game, '03-first-morning');
      // the first time there's no Skip: A brings each line (and the last one walks you over to the shed)
      for (let i = 0; i < 80 && await game.eval((g, w, s) => s.cafe.active); i++) { await padPress(game, 'confirm', { hold: 1, after: 2 }); await steps(game, 10); }
      assert.equal(await game.eval((g, w, s) => s.cafe.active), false, 'out of the cafe, on the pad');
      await stepUntil(game, () => !!document.querySelector('#kir-hud .lettercard'), null, { frames: 600, what: 'the letter' });
      await shot(game, '04-letter');
      assert.equal(await layerNow(game), 'letter');
      await padPress(game, 'back');
      await steps(game, 5);
      assert.notEqual(await layerNow(game), 'letter', 'B put the letter away');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  it('the shed: notepad, pause (and its settings), the log, Kerr and the ply order, a call, a gesture card', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); });
      await steps(game, 3);
      await shot(game, '05-shed');
      // the notepad: Y, a walk down its lines, B back to the shed
      await padPress(game, 'notepad');
      assert.equal(await layerNow(game), 'notepad');
      await shot(game, '06-notepad');
      await walkLayer(game, 'notepad', { max: 6 });
      await padPress(game, 'back');
      assert.notEqual(await layerNow(game), 'notepad');
      // pause: Menu; its settings; B, B
      await padPress(game, 'pause');
      assert.equal(await layerNow(game), 'pause');
      await shot(game, '07-pause');
      const p = await walkLayer(game, 'pause');
      assert.ok(p.includes('Resume') && p.includes('Quit to title'), JSON.stringify(p));
      while ((await padFocus(game)).text !== 'Settings') await padPress(game, 'up', { hold: 1, after: 1 });
      await padPress(game, 'confirm');
      assert.equal(await layerNow(game), 'settings');
      await padPress(game, 'back');
      assert.equal(await layerNow(game), 'pause');
      await padPress(game, 'back');
      assert.equal(await game.eval((g, w, s) => s.paused), false, 'B resumed');
      // the log: View, B
      await padPress(game, 'log');
      assert.equal(await layerNow(game), 'log');
      await shot(game, '08-log');
      await padPress(game, 'back');
      assert.notEqual(await layerNow(game), 'log');
      // Kerr: A at the desk; Order ply (A); the ply order walked; B; Kerr again and B logs off
      await walkTo(game, 'desk');
      await padLabel(game, 'Ask Kerr');
      await steps(game, 30);
      assert.equal(await layerNow(game), 'kerr');
      await shot(game, '09-kerr');
      await walkLayer(game, 'kerr');
      while ((await padFocus(game)).text !== 'Order ply') await padPress(game, 'left', { hold: 1, after: 1 });
      await padPress(game, 'confirm');
      await steps(game, 10);
      assert.equal(await layerNow(game), 'ply');
      await shot(game, '10-ply-order');
      await walkLayer(game, 'ply');
      // (the card ignores taps for its first 350 ms of real time: the tap that opened it mustn't also press it)
      await page_wait(game, 400);
      await padPress(game, 'back');
      await steps(game, 5);
      assert.notEqual(await layerNow(game), 'ply');
      await padLabel(game, 'Ask Kerr'); await steps(game, 10);
      await padPress(game, 'back');
      assert.notEqual(await layerNow(game), 'kerr', 'B logs off');
      // a call: A to answer, the card's two answers, B declines
      await game.eval(g => g.spawnOrderCall(3));
      await walkTo(game, 'phone');
      await padLabel(game, 'Answer');
      await stepUntil(game, () => !!document.querySelector('#kir-hud .callcard .row.on'), null, { frames: 200, what: 'the answers' });
      assert.equal(await layerNow(game), 'call');
      await shot(game, '11-call');
      await walkLayer(game, 'call');
      await padPress(game, 'back');
      assert.notEqual(await layerNow(game), 'call', 'B declined');
      await game.eval(g => { g.busy = null; }); // (the call's minutes on the phone: the test's clock is stopped)
      // a gesture card: ✕ by B
      await game.eval(g => { g.compressorSheets = 5; });
      await walkTo(game, 'compressor');
      await steps(game, 3);
      for (let i = 0; i < 8 && (await padFocus(game)).text !== 'Drain the tank'; i++) await padPress(game, 'next', { hold: 1, after: 1 });
      await padPress(game, 'confirm'); // (just the press: the card opens and waits)
      await stepUntil(game, (g, w, s) => !!s.gesture.active, null, { frames: 40, what: 'the gesture card' });
      await shot(game, '12-gesture');
      await padPress(game, 'back');
      assert.equal(await game.eval((g, w, s) => s.gesture.active), null, 'B put the card away');
    } finally { await game.close(); }
  });

  it('the layout editor: a cursor on the stick, A to shove, B to cancel', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); });
      await padPress(game, 'pause');
      while ((await padFocus(game)).text !== 'Move things round') await padPress(game, 'down', { hold: 1, after: 1 });
      await padPress(game, 'confirm');
      await stepUntil(game, (g, w, s) => s.layoutEditor.active, null, { frames: 60, what: 'the layout editor' });
      // the stick brings the cursor out; A held and steered drags whatever's under it
      await padSet(game, [], { lx: 0.8, ly: 0.3 }); await steps(game, 10);
      assert.equal(await game.eval((g, w, s) => s.padNav.cursor.on), true, 'a cursor');
      await padSet(game, ['confirm']); await steps(game, 2);
      await padSet(game, ['confirm'], { lx: -0.6 }); await steps(game, 8);
      await padSet(game, []); await steps(game, 3);
      assert.equal(await game.eval((g, w, s) => s.layoutEditor.active), true, 'still shoving things round');
      await shot(game, '13-layout-editor');
      // the d-pad walks the answers (Done / Try / Cancel); B cancels
      await padPress(game, 'down');
      assert.equal(await layerNow(game), 'replies');
      await padPress(game, 'back');
      await stepUntil(game, (g, w, s) => !s.layoutEditor.active, null, { frames: 60, what: 'out of the editor' });
    } finally { await game.close(); }
  });

  it('a mate drops in: his answers on the d-pad, A to pick', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); g.distractions = g.distractions.filter(d => d.kind !== 'friend'); g.lastMate = null; g.spawnDistraction('friend'); });
      await stepUntil(game, (g, w, s) => s.labelScreens().some(l => /what's up|Flat out/.test(l.text)), null, { frames: 1200, what: 'the mate' });
      await shot(game, '14-mate');
      await padLabel(game, (await game.eval((g, w, s) => s.labelScreens().map(l => l.text).find(t => /Flat out/.test(t)))));
    } finally { await game.close(); }
  });

  it('knock-off, the day summary, the week, the weekend, and back to Monday', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); document.querySelectorAll('#kir-hud .lettercard').forEach(e => e.remove()); g.day = 5; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
      await stepUntil(game, (g, w, s) => s.knockoff.talk.asking, null, { frames: 600, what: 'the mate at the door' });
      assert.equal(await layerNow(game), 'replies');
      await shot(game, '15-knockoff');
      await padPress(game, 'back'); // Head home
      await stepUntil(game, (g, w, s) => s.hud.summaryShowing && !!document.querySelector('#kir-hud .summary .next'), null, { frames: 1200, what: 'the summary' });
      await steps(game, 3);
      assert.equal(await layerNow(game), 'summary');
      await shot(game, '16-day-summary');
      assert.equal((await padFocus(game)).text.length > 0, true);
      await padPress(game, 'confirm'); // the ring starts on the way out (Next)
      await stepUntil(game, () => /Payday|week/i.test(document.querySelector('#kir-hud .summary h1')?.textContent ?? ''), null, { frames: 400, what: 'the week' });
      await steps(game, 3);
      await shot(game, '17-week');
      await padPress(game, 'confirm');
      await stepUntil(game, () => !!document.querySelector('#kir-hud .summary .market'), null, { frames: 400, what: 'Saturday' });
      await steps(game, 3);
      await shot(game, '18-weekend');
      await padPress(game, 'confirm');
      await stepUntil(game, () => !!document.querySelector('#kir-hud .summary .postcard'), null, { frames: 400, what: 'Sunday' });
      await padPress(game, 'confirm');
      await stepUntil(game, g => g.phase === 'day' && g.day === 1, null, { frames: 400, what: 'Monday' });
    } finally { await game.close(); }
  });

  it('day 20: the reckoning and the ending card', async () => {
    const game = await padGame();
    try {
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.lease.letterRead = true; g.dayIndex = 20; g.day = 5; w.lease.startDayIndex = 1; w.people.fullTime = true; g.cash = 1000; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
      await stepUntil(game, (g, w, s) => s.knockoff.mode === 'reckoning', null, { frames: 400, what: 'the reckoning' });
      // A hurries each line along; the answer comes on the d-pad
      for (let i = 0; i < 300 && !(await game.eval((g, w, s) => s.knockoff.talk.asking)); i++) await padPress(game, 'confirm', { hold: 1, after: 2 });
      await shot(game, '19-reckoning');
      await padPress(game, 'confirm');
      await stepUntil(game, () => !!document.querySelector('#kir-hud .summary .ending'), null, { frames: 1200, what: 'the ending' });
      await steps(game, 3);
      await shot(game, '20-ending');
      const e = await walkLayer(game, 'summary', { max: 10 });
      assert.ok(e.some(t => /Start over|again|lease/i.test(t)), `a way on from the ending: ${JSON.stringify(e)}`);
    } finally { await game.close(); }
  });

  it('the daily: its card, and Back to the lease', async () => {
    const context = await env.browser.newContext(TV);
    const page = await context.newPage();
    await page.goto(`${env.url}?daily=1`);
    await page.waitForFunction(() => window.kirScene?.started, null, { timeout: 30_000 });
    const game = { page, context, eval: (fn, a) => page.evaluate(([src, a]) => new Function('g', 'w', 'scene', 'arg', `return (${src})(g, w, scene, arg);`)(window.kir, window.kirScene.w, window.kirScene, a), [fn.toString(), a]) };
    try {
      await padConnect(game);
      await page.evaluate(() => { window.kir.tick = () => {}; window.kir.today.revenue = 1000; window.kir.today.costs = 800; window.kir.phase = 'daySummary'; });
      await page.waitForSelector('#kir-hud .summary .dailycard');
      await steps(game, 3);
      await shot(game, '21-daily');
      const d = await walkLayer(game, 'summary', { max: 6 });
      assert.ok(d.includes('Back to the lease'), JSON.stringify(d));
    } finally { await context.close(); }
  });
});

// ---------- a whole day on the pad ----------

describe('a whole day, pad only', () => {
  it('day 1 from the letter to the day summary and on to day 2, with nothing but the pad', async () => {
    const game = await padGame();
    try {
      // the real clock and the real day (freshGame stops them for the other tests)
      await game.eval(g => { delete g.tick; delete g.maybeDistraction; });
      const snap = () => game.eval((g, w, s) => ({
        phase: g.phase, day: g.dayIndex, layer: s.padNav.layer, gesture: s.gesture.active?.kind ?? null, walking: s.walking,
        lines: [...document.querySelectorAll('#kir-hud .pad li[data-key]')].length, summary: s.hud.summaryShowing,
        knock: s.knockoff.inScene, home: !!document.querySelector('#kir-hud .replies button.home'), answers: !!document.querySelector('#kir-hud .callcard .row.on'),
      }));
      // the player: reads the screen, presses buttons (never calls the game)
      let i = 0;
      for (; i < 4000; i++) {
        const st = await snap();
        if (st.phase === 'day' && st.day === 2) break;
        if (st.gesture) { await padGesture(game); continue; }
        switch (st.layer) {
          case 'letter': await padPress(game, 'confirm'); continue;
          case 'call': if (st.answers) await padPress(game, 'confirm'); else await steps(game, 10); continue; // take the job
          case 'kerr': case 'ply': case 'log': case 'ledger': case 'pause': case 'settings': await padPress(game, 'back'); continue;
          case 'summary': await padPress(game, 'confirm'); await steps(game, 20); continue; // the ring starts on the way on
          case 'replies':
            // home at 5 (B); otherwise the last answer (back to work)
            if (st.home) await padPress(game, 'back'); else { await padPress(game, 'up'); await padPress(game, 'confirm'); }
            await steps(game, 10); continue;
          case 'notepad': await padPress(game, 'confirm'); continue; // the top line: walk there and do it
        }
        if (st.knock || st.summary) { await padPress(game, 'confirm'); await steps(game, 10); continue; } // hurry the night along
        if (st.walking) { await steps(game, 20); continue; }
        if (st.layer === 'world' && i % 3 !== 0) { await padPress(game, 'confirm'); await steps(game, 10); continue; } // what's ringed here
        if (st.lines && st.phase === 'day') { await padPress(game, 'notepad'); await steps(game, 2); continue; }
        await steps(game, 40); // nothing to do: let the clock run
      }
      const end = await game.eval((g, w) => ({ day: g.dayIndex, phase: g.phase, made: g.lastDay?.sheetsDone ?? null, revenue: g.lastDay?.revenue ?? null }));
      assert.deepEqual([end.day, end.phase], [2, 'day'], `day 2 on the pad (stopped after ${i} steps: ${JSON.stringify(end)})`);
      assert.ok(end.made >= 1, `sheets went out the door on day 1 (${JSON.stringify(end)})`);
      assert.deepEqual(game.errors, []);
    } finally { await game.close(); }
  });
});
