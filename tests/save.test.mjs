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
const { START_TILE } = await server.ssrLoadModule('/src/world/layout.ts');
const { WORLD } = await server.ssrLoadModule('/src/world/worldConfig.ts');

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

  describe('the extinguisher', () => {
    const C = WORLD.cell;
    const at = (cx, cy) => ({ x: (cx + 0.5) * C, z: (cy + 0.5) * C }); // the middle of a cell
    const FLOOR = at(START_TILE.x, START_TILE.y);  // the dock, where a new game starts
    /** A mid-game save with the shed's extinguisher state set by `edit`, loaded back. */
    const load = edit => {
      const { g, w } = midGame();
      const file = JSON.parse(saveText(g, w));
      edit(file.world);
      const back = parseSave(JSON.stringify(file));
      assert.ok(back, 'loads');
      return back.world;
    };
    const place = w => ({ hook: w.hooks.wall, down: w.extAt?.wall ?? null, carrying: w.carrying, from: w.extinguisherFrom });

    it('put down on floor you can reach: kept where it is', () => {
      assert.deepEqual(place(load(w => { w.hooks.wall = false; w.extAt = { wall: FLOOR }; })), { hook: false, down: FLOOR, carrying: null, from: null });
    });

    it('a bad spot goes back on the bracket: junk, in a wall, a walled-off room, off the map', () => {
      for (const spot of [null, 'x', [], {}, { x: 'a', z: 1 }, { x: 1, z: Infinity }, at(5, 20), at(20, 45), { x: -50, z: 3 }]) {
        const w = load(f => { f.hooks.wall = false; f.extAt = { wall: spot }; });
        assert.deepEqual(place(w), { hook: true, down: null, carrying: null, from: null }, JSON.stringify(spot));
      }
      // (Infinity doesn't survive JSON: a number too big for a double does)
      const { g, w } = midGame();
      const text = saveText(g, w).replace('"extAt":{}', '"extAt":{"wall":{"x":1e999,"z":2}}').replace('"hooks":{"wall":true', '"hooks":{"wall":false');
      assert.ok(text.includes('1e999') && text.includes('"hooks":{"wall":false'), 'the save was edited');
      assert.deepEqual(place(parseSave(text).world), { hook: true, down: null, carrying: null, from: null }, '1e999');
    });

    it("hooks that aren't in the shed, and odd keys, are dropped", () => {
      const w = load(f => { f.hooks.wall = false; f.extAt = { wall: FLOOR, shed: FLOOR, exhaust: FLOOR, nope: FLOOR }; });
      assert.deepEqual(Object.keys(w.extAt), ['wall'], 'the shed is walled off and the exhaust one is not bought');
      const text = saveText(midGame().g, midGame().w).replace('"extAt":{}', `"extAt":{"__proto__":{"x":1,"z":1},"wall":${JSON.stringify(FLOOR)}}`).replace('"hooks":{"wall":true', '"hooks":{"wall":false');
      assert.ok(text.includes('"__proto__"') && text.includes('"hooks":{"wall":false'), 'the save was edited');
      const back = parseSave(text).world;
      assert.deepEqual(Object.keys(back.extAt), ['wall']);
      assert.equal(back.hooks.wall, false, 'still on the floor');
      assert.equal(Object.getPrototypeOf(back.extAt), Object.prototype);
    });

    it('carrying it with no bracket of its own: down where you stand', () => {
      for (const from of [null, 'nope', 7, 'shed']) {
        const w = load(f => { f.hooks.wall = false; f.extAt = {}; f.carrying = 'extinguisher'; f.extinguisherFrom = from; f.px = FLOOR.x; f.py = FLOOR.z; });
        assert.deepEqual(place(w), { hook: false, down: FLOOR, carrying: null, from: null }, JSON.stringify(from));
      }
      // standing nowhere real: back on its bracket instead
      const w = load(f => { f.hooks.wall = false; f.extAt = {}; f.carrying = 'extinguisher'; f.extinguisherFrom = null; f.px = -50; f.py = -50; });
      assert.deepEqual(place(w), { hook: true, down: null, carrying: null, from: null });
    });

    it('carrying it properly: still in your hands, even if the save also had it on the floor or the bracket', () => {
      for (const extAt of [{}, { wall: FLOOR }]) for (const hook of [true, false]) {
        const w = load(f => { f.hooks.wall = hook; f.extAt = extAt; f.carrying = 'extinguisher'; f.extinguisherFrom = 'wall'; });
        assert.deepEqual(place(w), { hook: false, down: null, carrying: 'extinguisher', from: 'wall' });
      }
    });

    it('in no place at all, or a stray "from" with empty hands: back on the bracket', () => {
      assert.deepEqual(place(load(f => { f.hooks.wall = false; f.extAt = {}; })), { hook: true, down: null, carrying: null, from: null });
      assert.deepEqual(place(load(f => { f.hooks.wall = false; f.extAt = {}; f.carrying = null; f.extinguisherFrom = 'wall'; })), { hook: true, down: null, carrying: null, from: null });
    });
  });
});
