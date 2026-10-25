// The difficulty curve (CONFIG.difficulty) and day 2's lesson fire, checked on Game itself: no browser, just
// the sim loaded through Vite. Breakdowns — faults, and fires spreading past a spot fire — follow the ramp:
// none on the first days, ramping to a plateau (the steady-state rate) once it ends.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const RAMP = CONFIG.difficulty.breakdownByDay;
const GRACE = RAMP.findIndex(m => m > 0); // days at the start with no breakdowns
const STEADY = RAMP.length;               // from here on, the plateau
const PLATEAU = RAMP.at(-1);

/** A new game on `day` with ply for everything and every consumable worn out (the worst odds there are). */
function worstCase(seed, day) {
  const g = new Game(seed, day);
  for (const t of CONFIG.jobs.types) { g.stock[t.id] = 50; g.stockValue[t.id] = 50 * t.boardCost; }
  g.wear = { bit: 0, spoilboard: 0, filter: 0 };
  return g;
}

/** Cut sheets back to back all day (taking every order), ignoring fires (it's the faults we're counting) and keeping the parts worn. */
function cutAllDay(g) {
  while (g.phase === 'day') {
    for (const d of g.distractions) if (d.order) g.respond(d.id, 'answer');
    if (g.machine === 'idle' && g.queued.length) g.loadNextSheet();
    g.wear = { bit: 0, spoilboard: 0, filter: 0 };
    g.tick();
  }
  return g.today;
}

describe('difficulty curve', () => {
  it(`breakdowns: none for the first ${GRACE} days, the plateau (${PLATEAU}) from day ${STEADY}`, () => {
    assert.ok(GRACE >= 3, 'days 1-3 are breakdown-free');
    assert.ok(PLATEAU > 0 && PLATEAU <= 1, 'the ramp ends at a plateau, no more than the full rate');
    for (let day = 1; day <= STEADY + 5; day++) assert.equal(new Game(1, day).breakdownMult, RAMP[Math.min(day, RAMP.length) - 1], `day ${day}`);
    for (let i = 1; i < RAMP.length; i++) assert.ok(RAMP[i] >= RAMP[i - 1], 'it only ever ramps up');
  });

  it('no faults on the grace days, even cutting all day on worn-out parts', () => {
    for (let day = 1; day <= GRACE; day++) for (const seed of [1, 2, 3, 4, 5]) {
      const d = cutAllDay(worstCase(seed, day));
      assert.ok(d.sheetsDone >= 8, `day ${day} seed ${seed}: it cut (${d.sheetsDone} sheets)`);
      assert.equal(d.faults, 0, `day ${day} seed ${seed}: no faults`);
      assert.equal(d.sheetsScrapped, 0, `day ${day} seed ${seed}: nothing ruined`);
    }
  });

  it('faults do happen at the plateau (the check above can fail)', () => {
    const faults = [1, 2, 3].reduce((n, seed) => n + cutAllDay(worstCase(seed, STEADY)).faults, 0);
    assert.ok(faults > 0, `faults at the plateau: ${faults}`);
  });

  it("a spot fire left alone doesn't spread on the grace days", () => {
    for (let day = 1; day <= GRACE; day++) {
      const g = new Game(1, day);
      g.fire = { id: 99, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 };
      for (let i = 0; i < CONFIG.fire.extractorFireAfterMinutes * 2 && g.phase === 'day'; i++) g.tick();
      assert.equal(g.fire?.stage, 'spot', `day ${day}: still a spot fire after ${g.fire?.minutes} minutes`);
      assert.equal(g.machineDown, false);
      assert.equal(g.today.firesDuct + g.today.firesExtractor, 0);
    }
  });

  it('at the plateau a spot fire left alone becomes a duct fire on time (slower than at the full rate)', () => {
    const g = new Game(1, STEADY);
    g.fire = { id: 99, stage: 'spot', minutes: 0, sprayed: 0, heat: 0 };
    const minutes = Math.ceil(CONFIG.fire.ductFireAfterMinutes / PLATEAU);
    for (let i = 0; i < minutes - 1; i++) g.tick();
    assert.equal(g.fire.stage, 'spot', `still a spot fire after ${minutes - 1} minutes`);
    g.tick();
    assert.equal(g.fire.stage, 'duct', `a duct fire after ${minutes}`);
  });
});

describe('the lesson fire', () => {
  const L = CONFIG.fire.lesson;

  /** A game on `day`, a sheet just started cutting a few minutes before the lesson's hour. */
  function cuttingBefore(day, seed = 1) {
    const g = worstCase(seed, day);
    g.wear = { bit: 1, spoilboard: 1, filter: 1 }; // fresh parts: few random fires to get in the way
    g.minute = L.fromHour * 60 - 6;
    assert.ok(g.loadNextSheet());
    while (g.machine !== 'cutting') g.tick();
    return g;
  }

  it(`starts on day ${L.day} while a sheet is cutting, from ${L.fromHour}:00 (it glows from the start: tests/interactables.test.mjs)`, () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = cuttingBefore(L.day, seed);
      while (g.hour < L.fromHour) { assert.ok(!g.fire?.lesson, `not before its hour (${g.formatTime()})`); g.tick(); }
      assert.ok(g.fire?.lesson, `seed ${seed}: the lesson fire at ${g.formatTime()}, the first minute from its hour`);
      assert.equal(g.fire.stage, 'spot');
      assert.equal(g.machine, 'cutting', 'the sheet keeps cutting');
      assert.ok(g.lessonFireDone);
    }
  });

  it("left alone, it doesn't spread or hurt the machine", () => {
    const g = cuttingBefore(L.day);
    while (!g.fire?.lesson) g.tick();
    while (g.phase === 'day') { if (g.machine === 'idle' && g.queued.length) g.loadNextSheet(); g.tick(); }
    assert.equal(g.today.firesDuct + g.today.firesExtractor, 0);
    assert.equal(g.machineDown, false);
    assert.equal(g.today.faults, 0);
  });

  it('happens once: not again after it was put out, and not on other days', () => {
    const g = cuttingBefore(L.day);
    while (!g.fire?.lesson) g.tick();
    g.fire = null; // put out
    for (let i = 0; i < 60; i++) { g.tick(); assert.ok(!g.fire?.lesson, 'only once'); }
    for (const day of [L.day - 1, L.day + 1, STEADY]) {
      const other = cuttingBefore(day);
      for (let i = 0; i < 60; i++) { other.tick(); assert.ok(!other.fire?.lesson, `no lesson fire on day ${day}`); }
    }
  });
});
