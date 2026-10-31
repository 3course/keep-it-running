// Customer pickup (CONFIG.pickup) on Game: you text the customer as a sheet comes off; their ute comes an hour or so
// later (or at their deadline, or next morning after 3:30), the money lands when they take it, and the finished pallet
// holds six — full, the bed can't be cleared. The sim hands over the moment the ute's there.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const P = CONFIG.pickup;

/** A day with nothing going wrong and nobody visiting, at `hour`. */
function calm(seed, hour) {
  const g = new Game(seed, 2);
  g.maybeDistraction = () => {}; g.maybeFault = () => {}; g.maybeFire = () => {};
  g.minute = Math.round(hour * 60);
  return g;
}
/** Finish a sheet now: put the first queued job on the bed at its last minute and tick it off. Returns the job. */
function finishOne(g) {
  const j = g.jobs.find(x => x.status === 'queued');
  j.status = 'cutting'; j.progress = j.cutMinutes - 1; g.current = j; g.machine = 'cutting';
  for (let k = 0; k < 30 && j.status === 'cutting'; k++) g.tick();
  assert.equal(j.status, 'done');
  return j;
}
const abs = g => g.dayIndex * 1440 + g.minute;
/** Run the clock on (through knock-off and into the next day) until `until` is true, or `max` minutes. */
function runUntil(g, until, max = 3 * 1440) {
  for (let k = 0; k < max && !until(); k++) {
    if (g.phase === 'day') g.tick();
    else if (g.phase === 'endOfDayPrompt') g.knockOff();
    else if (g.phase === 'daySummary') g.nextDay();
    else if (g.phase === 'weekSummary') g.nextWeek();
  }
}

describe('customer pickup', () => {
  it('never within 30 minutes of the sheet coming off (seeds × times through the day)', () => {
    for (let seed = 1; seed <= 6; seed++) for (let h = 7.5; h <= 16.75; h += 0.25) {
      const g = calm(seed, h);
      const j = finishOne(g), done = abs(g);
      const p = g.pickups.find(x => x.jobs.includes(j.id));
      assert.ok(p, 'texted');
      runUntil(g, () => p.status === 'done');
      assert.equal(p.status, 'done', `seed ${seed} at ${h}: never picked up`);
      assert.ok(p.doneAt - done >= 30, `seed ${seed}: finished ${g.formatTime(done % 1440)}, picked up ${p.doneAt - done} min later`);
    }
  });

  it('an hour plus up to an hour after the text; after 3:30, next morning between 8 and 9', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const g = calm(seed, 9);
      const j = finishOne(g); j.dueDay = g.dayIndex; j.deadlineMinute = 9 * 60; // already due: the lead time decides
      const p = g.pickups.find(x => x.jobs.includes(j.id));
      if (!p.slipped) { const wait = p.dueAt - p.textedAt; assert.ok(wait >= P.leadMinutes && wait <= P.leadMinutes + P.jitterMinutes + 30, `${wait}`); }
      const h = calm(seed, 15.75), k = finishOne(h), q = h.pickups.find(x => x.jobs.includes(k.id));
      const day = Math.floor(q.dueAt / 1440), m = q.dueAt % 1440;
      assert.ok(day > h.dayIndex, 'not today');
      if (!q.slipped && k.dueDay <= h.dayIndex + 1) assert.ok(m >= P.morningHour * 60 && m <= P.morningHour * 60 + P.morningJitterMinutes, `${h.formatTime(m)}`);
    }
  });

  it('on a deadline later than the lead time, they come at the deadline', () => {
    const g = calm(3, 8);
    const j = g.jobs.find(x => x.status === 'queued'); j.dueDay = g.dayIndex; j.deadlineMinute = 14 * 60;
    finishOne(g);
    const p = g.pickups.find(x => x.jobs.includes(j.id));
    if (!p.slipped) assert.equal(p.dueAt, g.dayIndex * 1440 + 14 * 60);
  });

  it('the money lands at pickup, not when the cut finishes', () => {
    const g = calm(2, 10);
    const rev = g.today.revenue;
    const j = finishOne(g);
    assert.equal(g.today.revenue, rev, 'nothing yet');
    const p = g.pickups.find(x => x.jobs.includes(j.id));
    runUntil(g, () => p.status === 'done');
    if (Math.floor(p.doneAt / 1440) === g.dayIndex) assert.ok(g.today.revenue >= rev + j.price * CONFIG.economy.latePayFraction - 1);
  });

  it('about one in ten text back running late, and the time slips 60–90 minutes', () => {
    let slipped = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) for (const h of [8, 9.5, 11]) {
      const g = calm(seed, h); const j = finishOne(g); n++;
      const p = g.pickups.find(x => x.jobs.includes(j.id));
      if (p.slipped) slipped++;
    }
    assert.ok(slipped / n > 0.03 && slipped / n < 0.2, `${slipped}/${n}`);
  });

  it('the finished pallet holds six: full, the bed can’t be cleared, and the next sheet waits', () => {
    const g = calm(1, 9);
    g.servesPickups = true; // nobody hands over
    g.pallet = P.palletCapacity - 1; g.bedPile = 3;
    assert.ok(g.clearBed(true));
    assert.equal(g.pallet, P.palletCapacity); assert.equal(g.bedPile, 2, 'only what fits');
    assert.ok(g.palletFull);
    assert.equal(g.clearBed(true), false);
    g.bedPile = CONFIG.chore.stack.bedHolds;
    assert.equal(g.loadNextSheet(4), false, 'the bed is full and there is nowhere to put it');
  });

  it('in the shed the ute waits at the door for you; handing over pays and frees the pallet', () => {
    const g = calm(4, 9);
    g.servesPickups = true;
    const j = finishOne(g); g.bedPile = 0; g.pallet = 1;
    const p = g.pickups.find(x => x.jobs.includes(j.id));
    runUntil(g, () => p.status === 'here');
    assert.equal(p.status, 'here'); assert.equal(g.pickupsHere.length, 1);
    const rev = g.today.revenue;
    assert.equal(g.handOver(), 1);
    assert.equal(g.pallet, 0); assert.ok(g.today.revenue > rev);
  });
});
