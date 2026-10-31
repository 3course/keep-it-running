// Customer pickup in the shed: the text on the notepad as a sheet comes off, no ute (and no off-screen pointer) until
// it's due, then the ute at the roller door and a honk if it's left waiting.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, frames } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());

describe('customer pickup, in the shed', () => {
  it('the text on the notepad; no ute till it is due; then the ute, and a honk after two minutes', async () => {
    const game = await freshGame(env);
    await game.eval((g, w, s) => {
      w.tour = null; s.jobCard.hide(); g.deliveries = []; g.minute = 9 * 60;
      const j = g.jobs.find(x => x.status === 'queued');
      j.status = 'cutting'; j.progress = j.cutMinutes; g.current = j; g.machine = 'cutting'; w.bed = 'running'; w.bedJobId = j.id;
    });
    // finish it the way the clock would
    await game.eval(g => { const T = Object.getPrototypeOf(g).tick; T.call(g); });
    await frames(game, 5);
    const st = await game.eval((g, w, s) => ({ pickups: g.pickups.length, here: g.pickupsHere.length, ute: w.utePresent, pad: s.hud.pad.textContent }));
    assert.equal(st.pickups, 1); assert.equal(st.here, 0); assert.equal(st.ute, false, 'no ute yet');
    assert.match(st.pad, /Texted .+, picking up ~\d+:\d\d/);
    // it's due: the ute's out the front; left waiting, it honks
    await game.eval((g, w, s) => { s.sfx.honk = () => { window.honks = (window.honks ?? 0) + 1; }; const p = g.pickups[0]; p.dueAt = g.dayIndex * 1440 + g.minute; Object.getPrototypeOf(g).tick.call(g); });
    await frames(game, 5);
    assert.equal(await game.eval((g, w) => w.utePresent), true);
    await game.eval(g => { for (let k = 0; k < 3; k++) Object.getPrototypeOf(g).tick.call(g); });
    await frames(game, 5);
    assert.ok(await game.page.evaluate(() => window.honks >= 1), 'honked');
    await game.close();
  });
});
