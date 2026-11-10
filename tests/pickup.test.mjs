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
const T = await server.ssrLoadModule('/src/world/todo.ts');
const S = await server.ssrLoadModule('/src/world/state.ts');

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

  it(`the finished pallet holds ${P.palletCapacity}: full, the bed can’t be cleared, and the next sheet waits`, () => {
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

describe('pickups never leave you with nothing to start (playtest 1)', () => {
  it('the last sheet off with the board empty: today\'s next order call rings now, not at its slot', () => {
    let checked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const g = calm(seed, 9);
      if (!g.orderCalls.some(c => c.minute > g.minute + 10)) continue;
      g.orderCalls = g.orderCalls.filter(c => c.minute > g.minute + 10); // nothing about to ring anyway
      const slot = g.orderCalls[0].minute;
      for (const j of g.jobs) if (j.status === 'queued' && j !== g.jobs.find(x => x.status === 'queued')) j.status = 'done';
      finishOne(g); // the only sheet: the board's empty now
      assert.equal(g.queued.length, 0);
      assert.ok(g.distractions.some(d => d.kind === 'phone' && d.order), `seed ${seed}: an order's ringing straight away (slot was ${g.formatTime(slot)})`);
      checked++;
    }
    assert.ok(checked >= 5);
  });
  it(`the day log notes an idle stretch over ${CONFIG.ui.idleLogAboveMinutes} min, with when and why`, () => {
    const g = calm(1, 9);
    for (const j of g.jobs) j.status = 'done'; // nothing on the board
    g.orderCalls = [];
    const from = g.minute;
    for (let k = 0; k < 6; k++) g.tick();
    g.jobs.push({ ...g.jobs[0], id: 999, status: 'queued', progress: 0, dueDay: g.dayIndex + 1 });
    g.stock[g.jobs.at(-1).type] = 5;
    assert.ok(g.loadNextSheet()); g.tick();
    const line = g.log.find(l => l.text.startsWith('Idle '));
    assert.ok(line, 'logged');
    assert.match(line.text, new RegExp(`^Idle \\d+ min, ${g.formatTime(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(line.text, /nothing on the board/);
    // a short gap isn't logged
    const g2 = calm(2, 9); g2.tick(); g2.tick(); g2.machine = 'cutting'; g2.tick();
    assert.ok(!g2.log.some(l => l.text.startsWith('Idle ')));
  });
  it('a ute at the door with the bed free: the next sheet, named, is near the top of the notepad', () => {
    const g = calm(3, 10), w = S.newWorld(g);
    for (const t of CONFIG.jobs.types) g.stock[t.id] = 5; // ply on the pallet
    w.tour = null; w.utePresent = true; w.finishedStack = 1;
    const items = T.todoItems(g, w);
    const next = items.find(i => i.key === 'next');
    assert.ok(next, 'it\'s there'); assert.ok(next.urgent, 'up with the pickup');
    assert.equal(next.text, `Grab the next sheet: ${g.nextUp().name}`);
  });
});
