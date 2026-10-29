// Rare events (CONFIG.rareEvent), milestones (CONFIG.milestone) and the story of the day, checked on Game itself:
// no browser, just the sim loaded through Vite. Everything's seeded, so these runs are exact.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const RE = CONFIG.rareEvent, M = CONFIG.milestone;
const def = id => RE.events.find(e => e.id === id);
const tellMin = id => Math.ceil(def(id).tell.seconds * 1000 / CONFIG.clock.realMsPerGameMinute);

/** Run with the two flags set as given, then put them back. */
function withFlags(flags, fn) {
  const was = { rareEvents: CONFIG.rareEvents, milestones: CONFIG.milestones };
  Object.assign(CONFIG, flags);
  try { return fn(); } finally { Object.assign(CONFIG, was); }
}

/** A game on `day`, quiet (no random arrivals), the competence full, `id` forced to land in a few minutes. */
function forced(id, day = 5) {
  const g = new Game(1, day);
  g.maybeDistraction = () => {};
  g.competence = CONFIG.competence.max;
  assert.ok(g.forceRareEvent(id));
  return g;
}
const tickTo = (g, pred, max = 200) => { for (let i = 0; i < max && !pred(g); i++) g.tick(); return pred(g); };
const landed = id => { const g = forced(id); assert.ok(tickTo(g, x => x.rare.phase === 'live'), `${id} landed`); return g; };
/** Cutting the first sheet, with ply for everything. */
function cutting(g) {
  for (const t of CONFIG.jobs.types) { g.stock[t.id] = 20; g.stockValue[t.id] = 20 * t.boardCost; }
  g.maybeFault = () => {}; g.maybeFire = () => {};
  assert.ok(g.loadNextSheet());
  assert.ok(tickTo(g, x => x.machine === 'cutting'));
}

describe('rolling them', () => {
  it(`about one day in ${Math.round(1 / RE.dayChance)}, never before day ${RE.fromDay}, each one at or after its earliest hour`, () => {
    let days = 0, events = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 30; day++) {
        const g = new Game(seed, day);
        if (day < RE.fromDay) { assert.equal(g.rare, null, `day ${day}`); continue; }
        days++;
        if (!g.rare) continue;
        events++;
        assert.equal(g.rare.phase, 'scheduled');
        assert.ok(g.rare.at >= def(g.rare.id).earliestHour * 60, `${g.rare.id} at ${g.formatTime(g.rare.at)}`);
      }
    }
    const rate = events / days;
    assert.ok(rate > 0.12 && rate < 0.22, `${events} events in ${days} days (${rate.toFixed(3)})`);
  });

  it('replaces one of the day\'s order calls rather than stacking on top', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 8; seed++) for (let day = RE.fromDay; day < RE.fromDay + 10; day++) {
      const on = new Game(seed, day);
      if (!on.rare) continue;
      const off = withFlags({ rareEvents: false }, () => new Game(seed, day));
      assert.equal(on.orderCalls.length, off.orderCalls.length - 1, 'one call fewer');
      assert.ok(off.orderCalls.some(c => c.minute === on.rare.at), 'it took that call\'s slot');
      checked++;
    }
    assert.ok(checked >= 8);
  });

  it('with the flag off there are none, and the day is exactly as before', () => {
    withFlags({ rareEvents: false }, () => {
      for (let seed = 1; seed <= 20; seed++) for (let day = 1; day <= 20; day++) assert.equal(new Game(seed, day).rare, null);
    });
  });

  it('?event=<id> forces it (an unknown id does nothing)', () => {
    for (const e of RE.events) {
      const g = new Game(1, 1);
      assert.ok(g.forceRareEvent(e.id));
      assert.equal(g.rare.id, e.id);
      assert.ok(g.rare.at <= g.minute + RE.debugLeadMinutes + tellMin(e.id) + 60, 'soon after the clock starts');
    }
    assert.equal(new Game(1, 1).forceRareEvent('alien-invasion'), false);
  });

  it('gives its tell before it lands', () => {
    for (const e of RE.events) {
      const g = forced(e.id);
      assert.ok(tickTo(g, x => x.rare.phase === 'tell'));
      assert.equal(g.rare.at - g.minute, tellMin(e.id), `${e.id}: told ${e.tell.seconds} s ahead`);
      assert.ok(g.log.some(l => l.text.startsWith(e.tell.cue)), 'and the cue is in the log');
      assert.ok(tickTo(g, x => x.rare.phase === 'live'));
      assert.equal(g.minute, g.rare.at);
    }
  });
});

describe('council inspection', () => {
  it('walk them round with the machine stopped: a clean shop passes, the cut resumes', () => {
    const g = landed('council');
    cutting(g);
    const rapport = g.rapport, fees = g.today.fees, job = g.current, progress = job.progress;
    assert.ok(g.inspectorWaiting);
    assert.ok(g.showCouncilRound());
    assert.equal(g.machine, 'paused', 'machine stopped for them');
    g.tick();
    assert.equal(job.progress, progress, 'nothing cut on the walk-round');
    g.escort(def('council').tourSeconds - 1);
    assert.ok(g.inspectorTouring, 'not done until the full 90 s');
    g.escort(1);
    assert.equal(g.rare.outcome, 'passed');
    assert.equal(g.rapport, Math.min(CONFIG.rapport.max, rapport + def('council').passRapport));
    assert.equal(g.today.fees, fees, 'no fine');
    assert.equal(g.machine, 'cutting', 'the cut resumes');
  });

  it(`a full extractor bag, or the extinguisher off its hook: $${def('council').penalty} fine`, () => {
    for (const setup of [g => { g.wear.filter = 0.1; }, g => { g.extinguisherAway = true; }]) {
      const g = landed('council');
      setup(g);
      const cash = g.cash, fees = g.today.fees;
      g.showCouncilRound(); g.escort(def('council').tourSeconds);
      assert.equal(g.rare.outcome, 'fined');
      assert.equal(g.cash, cash - def('council').penalty);
      assert.equal(g.today.fees, fees + def('council').penalty, 'on the books as a fee');
    }
  });

  it(`left standing for ${def('council').waitMinutes} minutes, they write you up anyway`, () => {
    const g = landed('council');
    const fees = g.today.fees;
    for (let i = 0; i < def('council').waitMinutes; i++) g.tick();
    assert.equal(g.rare.outcome, 'fined');
    assert.equal(g.today.fees, fees + def('council').penalty);
  });
});

describe('big job', () => {
  it(`rings through: ${def('bigJob').sheets} sheets, all due in ${def('bigJob').dueDays} days, at the big-job price`, () => {
    const g = landed('bigJob');
    const call = g.distractions.find(d => d.big);
    assert.ok(call, 'the phone rings with it');
    assert.equal(call.order, def('bigJob').sheets);
    const normal = g.jobs.filter(j => j.type === call.orderType);
    assert.ok(g.respond(call.id, 'answer'));
    const big = g.jobs.filter(j => j.name.startsWith('BIG JOB'));
    assert.equal(big.length, def('bigJob').sheets);
    for (const j of big) {
      assert.equal(j.dueDay, g.dayIndex + def('bigJob').dueDays);
      assert.equal(j.deadlineMinute, CONFIG.clock.endHour * 60);
    }
    // price per cut minute against the ordinary sheets of the same type
    const rate = js => js.reduce((s, j) => s + j.price, 0) / js.reduce((s, j) => s + j.cutMinutes, 0);
    if (normal.length) assert.ok(rate(big) > rate(normal) * 1.15, `big ${rate(big).toFixed(2)}/min vs ${rate(normal).toFixed(2)}/min`);
    assert.equal(g.rare.outcome, 'taken');
  });

  it('missed, it leaves a voicemail that is still the big job', () => {
    const g = landed('bigJob');
    tickTo(g, x => x.callbacks.length > 0, CONFIG.distractions.phone.window + 2);
    const cb = g.callbacks[0];
    assert.ok(cb.big);
    g.busy = null;
    assert.ok(g.callBack(cb.id));
    assert.equal(g.jobs.filter(j => j.name.startsWith('BIG JOB')).length, def('bigJob').sheets);
  });
});

describe('ute clips the roller door', () => {
  it(`the dock's blocked (no truck signed for) until ${def('uteClip').trips} loads go to the skip`, () => {
    const g = landed('uteClip');
    assert.ok(g.dockBlocked);
    // a truck on the apron can't be signed for
    g.deliveries = [{ id: 99, lines: [{ type: 'formwork', qty: 4, unitCost: 95 }], day: g.dayIndex, minute: g.minute, stage: 'waiting', signBy: g.minute + 30, bundles: [], fee: 0, feeOwed: false }];
    assert.equal(g.signDelivery(99, true), false);
    for (let i = 0; i < def('uteClip').trips; i++) {
      assert.ok(g.dockBlocked);
      assert.ok(g.clearDebris(true));
    }
    assert.equal(g.dockBlocked, false);
    assert.equal(g.rare.outcome, 'cleared');
    assert.ok(g.signDelivery(99, true), 'and now it can');
  });
});

describe('milestones', () => {
  /** Run a day to close with these stats. */
  function close(g, { fires = 0, profit = 0 } = {}) {
    g.minute = CONFIG.clock.endHour * 60 - 1;
    g.maybeDistraction = () => {}; g.maybeFire = () => {}; g.maybeFault = () => {};
    g.tick(); // to 5pm (a minute's wages on the books)
    g.today.firesSpot = fires; g.today.revenue = Math.max(0, profit); g.today.costs = Math.max(0, -profit);
    g.knockOff();
    assert.equal(g.phase, 'daySummary');
  }

  it(`${M.fireFreeDays} days running without a fire: the upgraded extractor, and fewer spot fires`, () => {
    const g = new Game(1, 5);
    const before = g.fireChance();
    close(g, { fires: 0 }); g.nextDay();
    close(g, { fires: 1 }); g.nextDay();
    assert.equal(g.milestones.fireFreeStreak, 0, 'a fire resets it');
    for (let i = 0; i < M.fireFreeDays; i++) { assert.ok(!g.hasMilestone('sparkArrestor')); close(g); if (i < M.fireFreeDays - 1) g.nextDay(); }
    assert.ok(g.hasMilestone('sparkArrestor'));
    assert.ok(Math.abs(g.fireChance() / before - M.fireChanceMult) < 1e-9);
  });

  it(`the first $${M.bigDayProfit} day: a second bit rack, and quicker bit swaps`, () => {
    const g = new Game(1, 5);
    close(g, { profit: M.bigDayProfit - 1 });
    assert.ok(!g.hasMilestone('secondBitRack'));
    assert.equal(g.milestones.bestDayProfit, M.bigDayProfit - 1);
    g.nextDay();
    close(g, { profit: M.bigDayProfit });
    assert.ok(g.hasMilestone('secondBitRack'));
    g.nextDay();
    g.competence = CONFIG.competence.max;
    assert.ok(g.replaceConsumable('bit'));
    assert.equal(g.replacing.remaining, M.bitSwapMinutes);
  });

  it('with the flag off: no progress, no unlocks, no effects', () => {
    withFlags({ milestones: false }, () => {
      const g = new Game(1, 5);
      for (let i = 0; i < 4; i++) { close(g, { profit: 5000 }); g.nextDay(); }
      assert.deepEqual(g.milestones.unlocked, []);
      assert.ok(!g.hasMilestone('secondBitRack'));
    });
  });
});

describe('story of the day', () => {
  it('names the rare event and what it cost, and goes in the copied day log', () => {
    const g = landed('council');
    g.wear.filter = 0.1;
    for (let i = 0; i < def('council').waitMinutes; i++) g.tick();
    g.minute = CONFIG.clock.endHour * 60 - 1; g.tick(); g.knockOff();
    assert.match(g.story, /council inspector found .*\$300 fine/);
    assert.ok(g.dayReport().includes(`Story of the day: ${g.story}`));
  });

  it('otherwise the money: the biggest cost or gain, or a quiet day', () => {
    const g = new Game(1, 2);
    g.maybeDistraction = () => {};
    g.minute = CONFIG.clock.endHour * 60 - 1; g.tick(); g.knockOff();
    assert.match(g.story, /^A quiet one: \d+ sheets? out the door/);
    const h = new Game(1, 2);
    h.minute = CONFIG.clock.endHour * 60 - 1; h.tick();
    h.today.latePayLost = 516;
    h.knockOff();
    assert.equal(h.story, 'Late jobs cost you $516.');
  });
});
