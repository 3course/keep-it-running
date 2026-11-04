// A corrupted or hand-edited save can't crash the game: every field of the game and the shed is swapped, one at a
// time, for each kind of wrong value (and the prototype is poked at), and the save still loads to something the
// simulation plays two days on. A good save round-trips untouched; junk that isn't a save at all loads as nothing.
// No browser: the modules run in Node through Vite (they never touch localStorage here).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false } });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { newWorld } = await server.ssrLoadModule('/src/world/state.ts');
const { parseSave, saveText } = await server.ssrLoadModule('/src/world/save.ts');

/** Play the game on (knocking off when asked) for `minutes` of day time; it must not throw. */
function play(g, minutes) {
  for (let i = 0, guard = 0; i < minutes && guard++ < 100_000;) {
    if (g.phase === 'day') { g.tick(); i++; }
    else if (g.phase === 'endOfDayPrompt') g.knockOff();
    else if (g.phase === 'daySummary' || g.phase === 'weekSummary') g.nextDay();
    else break;
  }
}

function midGame() {
  const g = new Game(20261104);
  play(g, 300);
  return { g, w: newWorld(g) };
}

const JUNK = [null, 'x', -1, 1e308, true, [], {}, [1, 'a', null], { s: 'x' }];

describe('loading a save', () => {
  it('a good save comes back the same', () => {
    const { g, w } = midGame();
    const text = saveText(g, w);
    const back = parseSave(text);
    assert.ok(back);
    assert.equal(saveText(back.game, back.world).replace(/"savedAt":\d+/, ''), text.replace(/"savedAt":\d+/, ''));
  });

  it('not a save: nothing, not a crash', () => {
    for (const raw of ['', 'null', '[]', '{"v":2}', '{"v":2,"game":5}', '{oops', '"save"', '{"v":99,"game":{}}']) {
      assert.equal(parseSave(raw), null, raw);
    }
  });

  it('every field of the game, set to each kind of junk: loads and plays on', () => {
    const { g, w } = midGame();
    const file = JSON.parse(saveText(g, w));
    for (const key of Object.keys(file.game)) {
      for (const junk of JUNK) {
        const bad = structuredClone(file);
        bad.game[key] = junk;
        const back = parseSave(JSON.stringify(bad));
        if (!back) continue; // refused is fine too; crashing isn't
        assert.doesNotThrow(() => play(back.game, 2 * 12 * 60), `game.${key} = ${JSON.stringify(junk)}`);
        assert.ok(Number.isFinite(back.game.cash) && back.game.dayIndex >= 1, `game.${key}: the books still add up`);
      }
    }
  });

  it('every field of the shed, set to each kind of junk: loads with a sane shed', () => {
    const { g, w } = midGame();
    const file = JSON.parse(saveText(g, w));
    for (const key of Object.keys(file.world)) {
      for (const junk of JUNK) {
        const bad = structuredClone(file);
        bad.world[key] = junk;
        const back = parseSave(JSON.stringify(bad));
        assert.ok(back, `world.${key} = ${JSON.stringify(junk)}`);
        const fresh = newWorld(back.game);
        for (const [k, v] of Object.entries(fresh)) {
          if (typeof v === 'number') assert.ok(Number.isFinite(back.world[k]), `world.${key} junk: world.${k} is a number`);
          if (Array.isArray(v)) assert.ok(Array.isArray(back.world[k]), `world.${key} junk: world.${k} is a list`);
        }
      }
    }
  });

  it("numbers out of range are clamped; references to nothing are dropped; the prototype can't be reached", () => {
    const { g, w } = midGame();
    const file = JSON.parse(saveText(g, w));
    Object.assign(file.game, { dayIndex: -5, minute: 99999, cash: 1e300, rapport: 1e6, upgrades: ['nesting', 'free money', 7], current: 123456 });
    file.game.wear = { bit: 50, spoilboard: -3, filter: 'x' };
    file.game.fault = { def: 'no-such-fault', path: null };
    file.world.bed = 'on fire'; file.world.carrying = 'a grudge'; file.world.offcutBin = 9;
    const text = JSON.stringify(file).replace('"v":2,', '"v":2,"__proto__":{"polluted":1},')
      .replace('"game":{', '"game":{"__proto__":{"tick":null},"constructor":1,');
    const back = parseSave(text.replace(/"seed":\d+/, '"seed":"1e999"'));
    assert.ok(back);
    const b = back.game;
    assert.equal(b.dayIndex, 1); assert.equal(b.minute, 24 * 60); assert.equal(b.cash, 1e9);
    assert.ok(b.rapport <= 100);
    assert.deepEqual([...b.upgrades], ['nesting']);
    assert.equal(b.current, null); assert.equal(b.fault, null);
    assert.deepEqual(b.wear, { bit: 1, spoilboard: 0, filter: 1 });
    assert.equal(back.world.bed, 'empty'); assert.equal(back.world.carrying, null); assert.equal(back.world.offcutBin, 1);
    assert.equal(typeof b.tick, 'function', 'the prototype is untouched');
    assert.equal(Object.getPrototypeOf(b), Game.prototype);
    assert.equal(({}).polluted, undefined);
    assert.doesNotThrow(() => play(b, 24 * 60));
  });
});
