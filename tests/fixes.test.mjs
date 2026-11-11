// Fixes in the shed, by hand: each fault fixed where it physically is, each step a one-thumb gesture (done here with
// real touch: hold, taps, drag, signature, pick). The extractor bag goes clips → skip → new bag → fit → restart; a
// dull bit is picked off the rack to suit the board (the wrong one cuts rough and the sheet's a reject) after any
// ruined sheet's dragged off; a beer can fumble a gesture so it has to be redone. Plus the spray aim, the order card,
// the ply docket and the pickup out to the ute. Money and the sim are untouched: Game's fault steps run as before.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { advance, answerCard, doGesture, frames, freshGame, gestureNow, holdLabel, labels, startBrowser, steps, tapLabel, waitForLabel, walkTo } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const C = env.config;

/** A fault, as Game starts one, with a sheet of `type` cutting on the bed. */
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

/** Where the notepad's fault line (and the 🔧 pointer) sends you now. */
const faultTargets = game => game.eval(async (g, w) => {
  const { todoItems } = await import(new URL('src/world/todo.ts', document.baseURI).href);
  return todoItems(g, w).find(i => i.key.startsWith('fault-'))?.targets ?? null;
});

/** Run Game's clock until the fault step that's being worked is done (its minutes), then let the view catch up. */
const workThrough = async game => {
  await game.eval(g => { const tick = Object.getPrototypeOf(g).tick; for (let i = 0; i < 30 && g.fault?.phase === 'working'; i++) tick.call(g); });
  await advance(game, 0);
};

describe('fixed where it is', () => {
  it('extractor bag: unclip, tip it in the skip, a new bag from the spares, fit it, restart', async () => {
    const game = await freshGame(env);
    try {
      await breakDown(game, 'extraction');
      assert.deepEqual(await faultTargets(game), ['extractor'], 'the notepad sends you to the extractor, not the machine');
      await walkTo(game, 'machine');
      assert.ok(!(await labels(game)).includes('Bin full or hose blocked'), 'nothing to do about it at the machine');
      await walkTo(game, 'extractor');
      await tapLabel(game, 'Bin full or hose blocked');
      await tapLabel(game, 'Empty the bin and clear the hose yourself (~13m)');
      // two clips: tapped with the thumb
      await tapLabel(game, 'Unclip the bag');
      assert.equal(await game.eval((g, w) => w.carrying), 'bag', 'the full bag in your arms');
      assert.deepEqual(await faultTargets(game), ['skip']);
      await workThrough(game);
      await walkTo(game, 'skip');
      await tapLabel(game, 'Tip the bag'); // dragged down into the skip
      await workThrough(game);
      assert.deepEqual(await faultTargets(game), ['bags'], 'then to the spare bags');
      await walkTo(game, 'bags');
      await tapLabel(game, 'Grab a new bag');
      assert.deepEqual(await faultTargets(game), ['extractor']);
      await walkTo(game, 'extractor');
      await tapLabel(game, 'Fit the new bag'); // dragged up into place
      await workThrough(game);
      await tapLabel(game, 'Restart');
      await workThrough(game);
      assert.deepEqual(await game.eval((g, w) => [g.fault, w.carrying, g.wear.filter]), [null, null, 1], 'fixed: a fresh bag, hands empty');
    } finally { await game.close(); }
  });

  it('dull bit: the bit off the rack has to suit the board; the wrong one cuts rough and the sheet is a reject', async () => {
    for (const [pick, rough] of [['formwork', false], ['signage', true]]) {
      const game = await freshGame(env);
      try {
        const id = await breakDown(game, 'chipping', 'formwork');
        await walkTo(game, 'machine');
        await tapLabel(game, 'Dull or wrong bit');
        await tapLabel(game, 'Swap in a new compression bit yourself (~9m, $85)');
        await tapLabel(game, 'Inspect the bit'); // a hold
        await workThrough(game);
        assert.deepEqual(await faultTargets(game), ['bitRack'], 'off to the rack for a bit');
        await walkTo(game, 'bitRack');
        // the card shows the board's colour to match; the holders are colour-coded
        await tapLabel(game, 'Pick a bit', { choice: C.jobs.types.findIndex(t => t.id === pick) });
        assert.deepEqual(await game.eval((g, w) => [w.carrying, w.bitFor]), ['bit', pick]);
        await walkTo(game, 'machine');
        await tapLabel(game, 'Swap the bit in the collet'); // taps on the collet
        assert.equal(await game.eval((g, w, s, id) => !!g.jobs.find(j => j.id === id).rough, id), rough);
        await workThrough(game);
        await tapLabel(game, 'Re-zero Z');
        await workThrough(game);
        await tapLabel(game, 'Resume');
        await workThrough(game);
        assert.equal(await game.eval(g => g.fault), null);
        // run the sheet to the end: a rough one comes off a reject
        const status = await game.eval((g, w, s, id) => {
          const j = g.jobs.find(x => x.id === id);
          g.maybeFault = () => {}; g.maybeFire = () => {};
          const tick = Object.getPrototypeOf(g).tick;
          for (let i = 0; i < 80 && j.status === 'cutting'; i++) tick.call(g);
          return j.status;
        }, id);
        assert.equal(status, rough ? 'scrapped' : 'done', rough ? 'wrong bit: a reject' : 'right bit: a good sheet');
      } finally { await game.close(); }
    }
  });

  it('a ruined sheet is dragged off the bed before a new bit goes in', async () => {
    const game = await freshGame(env);
    try {
      await breakDown(game, 'chipping', 'signage');
      await game.eval((g, w) => { g.fault.phase = 'choosePath'; g.fault.sheetScrapped = true; g.current.status = 'scrapped'; w.bed = 'scrap'; });
      await walkTo(game, 'machine');
      await tapLabel(game, 'Grab the pre-set tool holder from the rack (~3m, $160)');
      await walkTo(game, 'bitRack');
      assert.deepEqual(await labels(game), [], 'no bit until the bed is clear');
      assert.deepEqual(await faultTargets(game), ['machine']);
      await walkTo(game, 'machine');
      await tapLabel(game, 'Drag the ruined sheet off'); // a drag
      assert.deepEqual(await game.eval((g, w) => [w.bed, w.carrying]), ['empty', 'scrap']);
      await walkTo(game, 'offcutBin');
      await tapLabel(game, 'Bin the scrap');
      assert.deepEqual(await faultTargets(game), ['bitRack'], 'now the rack');
      await walkTo(game, 'bitRack');
      await waitForLabel(game, 'Pick a pre-set holder');
    } finally { await game.close(); }
  });

  it('a beer can fumble a gesture: the card shakes and it has to be done again', async () => {
    const game = await freshGame(env);
    try {
      await breakDown(game, 'collet');
      await walkTo(game, 'machine');
      await tapLabel(game, 'Collet slipping');
      await tapLabel(game, 'Re-seat and torque the collet (~7m)');
      await game.eval(g => { g.alcohol = 100; }); // a fumble every time
      const before = await game.eval((g, w, s) => s.actionLog.length);
      await game.eval(async (g, w, s) => {
        const { actionsFor } = await import(new URL('src/world/interactables.ts', document.baseURI).href);
        s.doAction(actionsFor('machine', g, w)[0], 'machine');
      });
      assert.equal((await gestureNow(game)).kind, 'taps');
      await doGesture(game);
      assert.ok(await gestureNow(game), 'still open: fumbled, do it again');
      assert.equal(await game.eval((g, w, s) => s.actionLog.length), before, 'nothing happened');
      assert.equal(await game.eval(g => g.fault.phase), 'step');
      assert.ok(await game.eval(g => g.today.fumbles >= 1), 'counted as a fumble');
      await game.eval(g => { g.alcohol = 0; });
      await doGesture(game);
      assert.equal(await gestureNow(game), null, 'sober: done');
      assert.equal(await game.eval(g => g.fault.phase), 'working');
    } finally { await game.close(); }
  });
});

describe('the rest, by hand', () => {
  it('spot fire: aim at the glow and hold until it is out; let go early and it flares back', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; g.fire = { id: 9, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 }; w.carrying = 'extinguisher'; w.hooks.wall = false; w.extinguisherFrom = 'wall'; });
      await walkTo(game, 'exhaust');
      // held, but not aimed: nothing
      let lift = await holdLabel(game, 'Hold to spray');
      await advance(game, 2);
      assert.equal(await game.eval(g => g.fire.sprayed), 0, 'not on the glow: not putting it out');
      await lift();
      // aimed: it goes out after the spray time
      lift = await holdLabel(game, 'Hold to spray', { aim: true });
      await game.page.waitForFunction(() => window.kir.spraying, null, { timeout: 2_000 });
      await advance(game, C.fire.sprayMinutes.spot);
      await lift();
      assert.equal(await game.eval(g => g.fire), null, 'out');
      assert.equal(await game.eval((g, w) => w.carrying), 'extinguisher', 'still in your hands: hang it back up (or not)');
    } finally { await game.close(); }
  });

  it('phone: answer, and the call is a card: who, the sketch, the board and price as they tell you, due; then Accept or Decline', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w) => { w.tour = null; g.spawnOrderCall(3); });
      await walkTo(game, 'phone');
      await tapLabel(game, 'Answer');
      // straight after answering: still telling you, no answers yet; the phone's prompt has gone (the card's the prompt)
      const early = await game.page.evaluate(() => ({ on: document.querySelectorAll('#kir-hud .callcard .ln.on').length, of: document.querySelectorAll('#kir-hud .callcard .ln').length, row: !!document.querySelector('#kir-hud .callcard .row.on') }));
      assert.equal(early.of, 2);
      // (under a loaded run the lines may already be in by the first look: what matters is the order) — the answers come
      // only once they've told you all of it, never before
      for (let k = 0; k < 60; k++) {
        const r = await game.page.evaluate(() => ({ on: document.querySelectorAll('#kir-hud .callcard .ln.on').length, row: !!document.querySelector('#kir-hud .callcard .row.on') }));
        if (r.row) { assert.equal(r.on, 2, 'no answers till they have told you'); break; }
        await new Promise(res => setTimeout(res, 50));
      }
      assert.ok(!(await game.eval((g, w, s) => s.labelEls.some(l => l.el.textContent.includes('Answer')))), 'no Answer prompt while on the call');
      // it doesn't ring out while they're telling you
      const left = await game.eval(g => g.distractions.find(x => x.order).remaining);
      await game.eval(g => { const t = Object.getPrototypeOf(g).tick; for (let i = 0; i < 5; i++) t.call(g); });
      assert.equal(await game.eval(g => g.distractions.find(x => x.order)?.remaining), left);
      await game.page.waitForSelector('#kir-hud .callcard .row.on', { timeout: 8_000 });
      const offer = await game.eval(g => { const d = g.distractions.find(x => x.order), js = d.preview.jobs; return { prices: js.map(j => j.price), type: js[0].type, due: g.dueLabel(js[0]), who: d.customer }; });
      const card = await game.page.evaluate(() => document.querySelector('#kir-hud .callcard').textContent);
      const t = C.jobs.types.find(t => t.id === offer.type);
      const lo = Math.min(...offer.prices), hi = Math.max(...offer.prices), each = lo === hi ? `$${lo} each` : `$${lo}–${hi} each`;
      for (const bit of [offer.who, `${t.name}: 3 × ${t.material}`, each, `$${offer.prices.reduce((a, b) => a + b)} all up`, `due ${offer.due}`]) assert.ok(card.includes(bit), `the call says ${bit}: ${card}`);
      const ids = await game.eval(g => g.distractions.find(x => x.order).preview.jobs.map(j => j.id));
      assert.equal((await answerCard(game, 'take')).said, 'Took a 3-sheet order');
      assert.deepEqual(await game.eval((g, w, s, ids) => ids.map(id => !!g.jobs.find(j => j.id === id)), ids), [true, true, true], 'exactly the sheets on the card');
    } finally { await game.close(); }
  });

  it('a ringing phone: no card over its Answer prompt; the call card covers no prompt; walking away hangs up (a decline)', async () => {
    const game = await freshGame(env);
    try {
      await game.eval((g, w, s) => { w.tour = null; document.querySelectorAll('.lettercard').forEach(e => e.remove()); s.jobCard.hide(); });
      await walkTo(game, 'phone');
      await game.eval(g => { g.spawnOrderCall(2); g.jobs.push({ ...g.jobs[0], id: 777, status: 'queued' }); }); // a new job lands as it rings
      await frames(game, 10);
      const overlap = () => game.page.evaluate(sel => {
        const c = document.querySelector(sel); if (!c || (sel.includes('jobcard') && !c.classList.contains('show'))) return false;
        const r = c.getBoundingClientRect();
        return [...document.querySelectorAll('#kir-hud .lbl')].filter(l => l.style.display !== 'none' && l.style.visibility !== 'hidden')
          .some(l => { const q = l.getBoundingClientRect(); return q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; });
      }, sel);
      let sel = '#kir-hud .jobcard';
      assert.equal(await overlap(), false, 'the job card is never over the Answer prompt');
      await tapLabel(game, 'Answer');
      sel = '#kir-hud .callcard';
      await frames(game, 3);
      assert.equal(await overlap(), false, 'no prompt under the call card');
      // walk off: hung up, which is a decline
      const declined = await game.eval(g => g.today.sheetsDeclined);
      await game.eval((g, w, s) => { s.pos = { x: s.pos.x + 4, z: s.pos.z - 6 }; });
      await frames(game, 5);
      assert.equal(await game.eval((g, w, s) => s.callCard.showing), false, 'the call is over');
      assert.equal(await game.eval(g => g.today.sheetsDeclined), declined + 2, 'hanging up turned it down');
    } finally { await game.close(); }
  });

  it('signing for a delivery: one long stroke signs it; a short one does not; "Tap to sign" after a few seconds', async () => {
    const game = await freshGame(env);
    try {
      // open the signature card (short foot-tap wait so the test needn't stand about)
      await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); window.signed = 0;
        s.gesture.open({ kind: 'sign', icon: '🧾', strokeFrac: 0.4, fallbackSeconds: 1, waitSeconds: 1 }, () => { window.signed++; }, () => false); });
      const card = () => game.page.evaluate(() => { const c = document.querySelector('#kir-hud .gesture[data-kind="sign"]'); return c ? { p: Number(getComputedStyle(c.querySelector('.progress')).getPropertyValue('--p') || 0), foot: c.querySelector('.waiting').classList.contains('on'), tap: c.querySelector('.tapsign').classList.contains('on') } : null; });
      await frames(game, 3);
      // a short dab: not a signature, the card stays
      await doGesture(game, { early: true });
      const dab = await card();
      assert.ok(dab && dab.p > 0 && dab.p < 1, `a short stroke shows some progress (${dab?.p}) but doesn't sign`);
      assert.equal(await game.page.evaluate(() => window.signed), 0);
      // a long stroke across, nowhere near the dotted guide: signed
      await doGesture(game);
      await game.page.waitForFunction(() => window.signed === 1);
      assert.equal(await card(), null, 'card closed');
      // again, but this time just wait: the "Tap to sign" button turns up and finishes it
      await game.eval((g, w, s) => s.gesture.open({ kind: 'sign', icon: '🧾', fallbackSeconds: 1, waitSeconds: 1 }, () => { window.signed++; }, () => false));
      assert.equal((await card()).tap, false, 'no button straight away');
      await game.page.waitForFunction(() => document.querySelector('#kir-hud .gesture .tapsign.on'), null, { timeout: 3_000 });
      assert.ok((await card()).foot, 'the driver is tapping his foot');
      const b = await game.page.evaluate(() => { const r = document.querySelector('#kir-hud .gesture .tapsign').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await game.page.touchscreen.tap(b.x, b.y);
      await game.page.waitForFunction(() => window.signed === 2);
    } finally { await game.close(); }
  });

  it('pickup: carry the finished stack out to the ute and hand it over', async () => {
    const game = await freshGame(env);
    try {
      // a customer's ute at the door for three sheets on the pallet (no ply truck in the way)
      await game.eval((g, w) => { w.tour = null; w.finishedStack = 3; g.pallet = 3; g.deliveries = [];
        g.pickups.push({ id: 9001, order: 'Bar front', jobs: [9001, 9002, 9003], pay: 600, textedAt: 0, dueAt: 0, slipped: false, status: 'here', hereAt: g.dayIndex * 1440 + g.minute }); });
      await walkTo(game, 'finishedPallet');
      await tapLabel(game, 'Pick up the stack (3)');
      assert.equal(await game.eval((g, w) => w.carrying), 'stack');
      // the roller door goes up on its own (stack in your arms, a ute waiting): straight out onto the apron
      await game.eval((g, w, s) => { const u = s.built.vehicles.ute.position; s.walkToPoint(u.x - 1.4, u.z); });
      await waitForLabel(game, 'Hand it over (3)', 15_000);
      // one tap, no handshake: pressing the label once hands it over and pays, with no gesture card in between
      const before = await game.eval(g => g.cash);
      assert.ok(await game.eval((g, w, s) => s.pressLabel('Hand it over (3)')));
      assert.equal(await gestureNow(game), null, 'no handshake step');
      assert.equal(await game.eval(g => g.cash), before + 600, 'paid on the one tap');
      await game.page.waitForFunction(() => !window.kirScene.w.utePresent);
      assert.deepEqual(await game.eval((g, w) => [w.finishedStack, w.carrying, g.pallet, g.pickupsHere.length]), [0, null, 0, 0]);
    } finally { await game.close(); }
  });
});

describe('a bag swap still going at knock-off', () => {
  it('carries on in the morning, and the old bag turns up when it\'s done', async () => {
    const game = await freshGame(env);
    try {
      // the swap's on (Game.replacing) and the shed's watching it, then the day ends and a new one starts
      const kept = await game.eval(async (g, w) => {
        const { startNewDay } = await import(new URL('src/world/state.ts', document.baseURI).href);
        w.tour = null; g.replacing = { key: 'filter', remaining: 20 }; w.watchingSwap = 'filter'; w.oldBagWaiting = false;
        startNewDay(w, g);
        return [w.watchingSwap, w.oldBagWaiting];
      });
      assert.deepEqual(kept, ['filter', false], 'still watching overnight; no old bag yet');
      // it finishes in the morning: the old bag's out for the skip
      await game.eval(g => { g.wear.filter = 1; g.replacing = null; });
      await steps(game, 3);
      assert.deepEqual(await game.eval((g, w) => [w.watchingSwap, w.oldBagWaiting]), [null, true]);
    } finally { await game.close(); }
  });
});
