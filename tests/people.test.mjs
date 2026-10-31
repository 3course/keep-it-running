// The people side, in the shed as a phone: knock-off beers at 5 (instead of overtime), a night through to "Last
// night" in the summary, ringing a mate and the morning-after cans, an after-hours trace that becomes a keepsake,
// the part-timer's arc to full time (kept across a reload), a customer's thank-you, and the safe tier's plain night.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, tapLabel, walkTo, frames } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

/** Knock off at 5. */
const five = game => game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; });
/** Tap reply `i` (or the one matching a regex) on the bubbles at the bottom. */
async function reply(game, which, sel = '#kir-hud .replies:not(.day) button') {
  await game.page.waitForFunction(s => document.querySelectorAll(s).length > 0, sel, { timeout: 60_000 });
  await game.page.evaluate(([w, sel]) => {
    const bs = [...document.querySelectorAll(sel)];
    const b = typeof w === 'number' ? bs[w] : bs.find(x => new RegExp(w, 'i').test(x.textContent));
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }, [which instanceof RegExp ? which.source : which, sel]);
}
/** Tap through the lines until the replies are up (or the night's over). */
async function untilReplies(game) {
  for (let k = 0; k < 400; k++) {
    const st = await game.eval((g, w, s) => ({ asking: s.knockoff.talk.asking, mode: s.knockoff.mode }));
    if (st.asking || st.mode === 'off') return st;
    await game.page.mouse.click(200, 300);
    await game.page.waitForTimeout(60);
  }
  throw new Error('replies never came up');
}

describe('knock-off beers', () => {
  it('at 5 a mate is at the roller door instead of an overtime prompt; "Head home" ends the day', async () => {
    const game = await freshGame(env);
    await five(game);
    await game.page.waitForFunction(() => window.kirScene.knockoff.mode === 'door');
    const opts = await game.eval((g, w, s) => s.knockoff.talk.options);
    assert.deepEqual(opts, ['Grab a beer', 'Head home']);
    assert.equal(await game.page.evaluate(() => !!document.querySelector('#kir-hud .modal .ot')), false, 'no overtime button');
    await reply(game, 1);
    await game.page.waitForFunction(() => window.kir.phase === 'daySummary', null, { timeout: 10_000 });
    await game.close();
  });

  it('a night: replies, another one, wind it up → the summary says who, how many and a quote; tomorrow is someone else', async () => {
    const game = await freshGame(env);
    await five(game);
    const host = await game.eval((g, w, s) => { s.knockoff.atFive(); return s.knockoff.friend; });
    await reply(game, 0);
    for (let turn = 0; turn < 7; turn++) {
      const st = await untilReplies(game);
      if (st.mode === 'off') break;
      const opts = await game.eval((g, w, s) => s.knockoff.talk.options);
      assert.match(opts.at(-1), /w.*n+.*d.*it.*up/i, 'Wind it up is always there (last)');
      await reply(game, opts.findIndex(o => /^go on/i.test(o)) >= 0 ? opts.findIndex(o => /^go on/i.test(o)) : 0);
    }
    await untilReplies(game);
    await reply(game, /w.*nd it up/); // wind it up
    await game.page.waitForFunction(() => window.kir.phase === 'daySummary', null, { timeout: 30_000 });
    await game.page.waitForSelector('#kir-hud .summary .lastnight');
    const sum = await game.page.evaluate(() => document.querySelector('#kir-hud .summary .lastnight')?.textContent ?? '');
    assert.match(sum, /Last night: You and .+, \d+ beers? each\. “.+” — .+/);
    const p = await game.eval((g, w) => ({ last: w.people.lastFriend, nights: w.people.nights }));
    assert.equal(p.last, host); assert.equal(p.nights, 1);
    const next = await game.eval(async (g, w) => (await import(new URL('src/people/friends.ts', document.baseURI).href)).pickFriend(w.people.lastFriend, g.dayIndex + 1));
    assert.notEqual(next, host, 'never the same mate two days running');
    await game.close();
  });

  it('ring a mate: they walk in, the night goes three-way, and the morning after there are cans (one on the bed)', async () => {
    const game = await freshGame(env);
    await five(game);
    await game.eval((g, w, s) => s.knockoff.atFive());
    await reply(game, 0);
    let guest = null;
    for (let turn = 0; turn < 14 && !guest; turn++) {
      await untilReplies(game);
      const st = await game.eval((g, w, s) => ({ opts: s.knockoff.talk.options, beers: s.knockoff.night.beers, guest: s.knockoff.night.guest, calling: !!s.knockoff.night.calling }));
      guest = st.guest;
      if (guest) break;
      const yes = st.opts.findIndex(o => /^go on/i.test(o)), call = st.opts.findIndex(o => /call/i.test(o));
      await reply(game, yes >= 0 ? yes : call >= 0 && !st.calling ? call : 0);
    }
    assert.ok(guest, 'they turned up');
    assert.equal(await game.eval((g, w, s) => s.knockoff.figures.size), 3, 'three on the crates');
    await untilReplies(game);
    await reply(game, (await game.eval((g, w, s) => s.knockoff.talk.options.length)) - 1);
    await game.page.waitForFunction(() => window.kir.phase === 'daySummary', null, { timeout: 30_000 });
    const cans = await game.eval((g, w) => w.people.cans.map(c => c.spot));
    assert.ok(cans.length >= 3 && cans.includes('bed') && cans.includes('extractor'), `cans: ${cans}`);
    await game.close();
  });
});

describe('the morning after', () => {
  it('the can on the bed holds up the first sheet; bagged cans are 10c each back', async () => {
    const game = await freshGame(env);
    await game.eval(async (g, w) => {
      const { scatterCans } = await import(new URL('src/world/cans.ts', document.baseURI).href);
      w.tour = null; w.people ??= (await import(new URL('src/people/state.ts', document.baseURI).href)).newPeople();
      scatterCans(w.people, 30, g.dayIndex);
    });
    await game.eval((g, w) => { if (g.takeSheet()) w.carrying = 'sheet'; });
    await walkTo(game, 'machine');
    const labels = await game.eval((g, w, s) => s.labelScreens().map(l => l.text));
    assert.ok(!labels.includes('Load sheet'), 'no sheet on a bed with a can on it');
    await game.eval((g, w) => { w.carrying = null; });
    await tapLabel(game, 'Grab the can off the bed');
    assert.deepEqual(await game.eval((g, w) => [w.carrying, w.canCount, w.people.cans.some(c => c.spot === 'bed')]), ['cans', 1, false]);
    // fill the bag: 19 already in it, this one makes 20
    const cash = await game.eval((g, w) => { w.people.bagged = 19; return g.cash; });
    await game.eval((g, w, s) => { s.pendingMorning = { bag: true }; s.pos.x = 13.9; s.pos.z = 18.6; s.morningArrive(); });
    const after = await game.eval((g, w) => ({ cash: g.cash, bagged: w.people.bagged, refund: g.today.canRefund, carrying: w.carrying }));
    assert.equal(Math.round((after.cash - cash) * 100), 200, '$2 for a bag of 20');
    assert.equal(after.bagged, 0); assert.equal(after.carrying, null);
    await game.close();
  });
});

describe('after hours', () => {
  it('a traced idea is cut from your path, kept in the shed, and in the summary under After hours', async () => {
    const game = await freshGame(env);
    await five(game);
    await game.eval((g, w, s) => s.knockoff.atFive());
    await reply(game, 0);
    await untilReplies(game);
    await game.eval((g, w, s) => { s.knockoff.talk.hideReplies(); s.knockoff.night.beers = 3; s.knockoff.startCut('ah-coaster', s.knockoff.night.host); });
    await reply(game, 0); // an offcut
    await game.page.waitForFunction(() => window.kirScene.tracing.mode === 'trace');
    await game.page.waitForTimeout(2500); // the camera settles over the bed
    // a rough circle with real touches, lifted once and put back down
    const pts = await game.eval(async (g, w, s) => {
      const t = s.tracing, { toLocal } = await import(new URL('src/world3d/piece.ts', document.baseURI).href);
      const tl = toLocal(t.design, t.scale), grp = t.d.sheet.parent, y = t.surface(), P = s.camera.position.constructor, out = [];
      for (let a = 0; a <= 32; a++) { const [x, z] = tl([200 + 170 * Math.cos(a / 32 * Math.PI * 2), 200 + 170 * Math.sin(a / 32 * Math.PI * 2)]); const v = grp.localToWorld(new P(x, y, z)); out.push(s.screenOfPoint(v.x, v.y, v.z)); }
      return out;
    });
    const cdp = await game.context.newCDPSession(game.page);
    for (const run of [pts.slice(0, 18), pts.slice(16)]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: run[0].x, y: run[0].y, id: 1 }] });
      for (const p of run.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const traced = await game.eval((g, w, s) => ({ strokes: s.tracing.strokes.length, score: s.tracing.score() }));
    assert.equal(traced.strokes, 2, 'lifted and resumed');
    assert.ok(traced.score > 0.4, `close enough: ${traced.score}`);
    await reply(game, /cut it/);
    await game.page.waitForFunction(() => window.kirScene.tracing.mode === 'off' && window.kirScene.knockoff.mode === 'night', null, { timeout: 30_000 });
    const k = await game.eval((g, w) => w.people.keepsakes.map(k => ({ id: k.design.id, outer: k.design.outer.slice(0, 2), beers: k.beers, by: k.suggestedBy, sheet: k.sheet })));
    assert.equal(k.length, 1);
    assert.match(k[0].id, /^kept-ah-coaster/); assert.equal(k[0].beers, 3); assert.equal(k[0].sheet, 'offcut');
    // wind it up: the summary shows it
    await untilReplies(game);
    await reply(game, (await game.eval((g, w, s) => s.knockoff.talk.options.length)) - 1);
    await game.page.waitForFunction(() => window.kir.phase === 'daySummary', null, { timeout: 30_000 });
    await game.page.waitForSelector('#kir-hud .summary .afterhours');
    const ah = await game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .summary .afterhours .pair .cap')].map(c => c.textContent));
    assert.equal(ah.length, 1);
    assert.match(ah[0], /Dinner-plate coaster.*idea, 3 beers deep/);
    await game.close();
  });
});

describe('the part-timer', () => {
  it('in on her days only; trust past the mark and she asks; yes makes her full time (kept across a reload) and brings cake', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.day = 1; g.minute = 9 * 60; });
    await frames(game, 5);
    assert.equal(await game.eval((g, w, s) => !!s.peopleDay.jess), false, 'not on day 1');
    await game.eval((g, w, s) => { g.day = 2; });
    await game.page.waitForFunction(() => !!window.kirScene.peopleDay.jess);
    await game.eval((g, w, s) => { w.people.trust = 50; g.minute = 11 * 60 + 2; const j = s.peopleDay.jess; j.x = s.pos.x + 1; j.z = s.pos.z; j.path = []; });
    await game.page.waitForFunction(() => window.kirScene.peopleDay.task === 'ask' && window.kirScene.peopleDay.talk.asking, null, { timeout: 120_000 });
    await reply(game, 0, '#kir-hud .replies.day button');
    const p = await game.eval((g, w) => ({ ft: w.people.fullTime, cake: w.people.cakeDay, day: g.dayIndex }));
    assert.ok(p.ft); assert.equal(p.cake, p.day + 1);
    // saved with the game
    await game.eval((g, w, s) => s.setPaused(true));
    await game.page.reload();
    await game.page.waitForFunction(() => window.kirScene?.started);
    assert.equal(await game.page.evaluate(() => window.kirScene.w.people.fullTime), true, 'still full time after a reload');
    // cake at smoko on cake day, and it's on the crate
    await game.eval((g, w, s) => { g.tick = () => {}; s.setPaused(false); w.people.cakeDay = g.dayIndex; g.day = 3; g.minute = 10 * 60 + 1; });
    await game.page.waitForFunction(() => window.kirScene.w.people.gifts.some(x => x.kind === 'cake'));
    await game.close();
  });
});

describe('customers', () => {
  it('at pickup they say something about the piece (with its picture); a thank-you comes round next day and stays', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.made = [{ job: g.jobs[0].id, design: 'mila-cloud' }]; w.pickedUp = 0; s.peopleDay.pickup(1); });
    const b = await game.page.evaluate(() => { const el = document.querySelector('#kir-hud .talk.day[data-who="ute"]'); return { img: !!el?.querySelector('img.pic'), text: el?.textContent ?? '' }; });
    assert.ok(b.img, 'the after-render in the bubble'); assert.match(b.text, /Bec/);
    const due = await game.eval((g, w) => w.people.pendingGifts);
    assert.equal(due.length, 1); assert.equal(due[0].kind, 'drawing'); // Mila draws her sign
    await frames(game, 3);
    const before = await game.eval((g, w, s) => s.gratitude.group.children.length);
    await game.eval((g, w) => { w.people.pendingGifts[0].dayIndex = g.dayIndex; w.people.pendingGifts[0].minute = 0; g.minute = 9 * 60; });
    await game.page.waitForFunction(() => window.kirScene.w.people.gifts.some(x => x.kind === 'drawing'));
    await frames(game, 3);
    assert.ok(await game.eval((g, w, s) => s.gratitude.group.children.length) > before, 'it went up in the shed');
    await game.close();
  });
});

describe('render tiers', () => {
  it('?safe=1: the night has no fridge light and no extra particles, but still plays', async () => {
    const game = await freshGame(env);
    await game.page.goto(`${env.url}?seed=1&safe=1`);
    await game.page.waitForFunction(() => window.kirScene?.started);
    await game.eval((g, w, s) => { g.tick = () => {}; s.setPaused(false); });
    await five(game);
    await game.eval((g, w, s) => s.knockoff.atFive());
    await reply(game, 0);
    await untilReplies(game);
    assert.deepEqual(await game.eval((g, w, s) => [s.knockoff.fridgeLight === null, !!s.reveal.light, !!s.reveal.dust, s.knockoff.figures.size]), [true, false, false, 2]);
    await game.close();
  });
});
