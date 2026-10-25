// Visiting mates (CONFIG.visitors), checked on Game itself: no browser, just the sim loaded through Vite.
// Everything a visitor decides comes from Game.visitorRng (seeded per day), so these runs are exact.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const { MATES, SHOP_TALK } = await server.ssrLoadModule('/src/data/mates.ts');
const V = CONFIG.visitors, F = CONFIG.distractions.friend;

/** A game at `hour` with nothing else going on (no random arrivals), and a mate who's just walked in. */
function visit(hour, { seed = 1, mate } = {}) {
  const g = new Game(seed);
  g.minute = hour * 60;
  g.maybeDistraction = () => {}; // nobody else turns up
  g.distractions = [];
  for (let i = 0; i < 200; i++) {
    g.lastMate = null;
    g.distractions = g.distractions.filter(d => d.kind !== 'friend');
    g.spawnDistraction('friend');
    if (!mate || g.distractions[0].mate === mate) break;
  }
  const d = g.distractions.find(x => x.kind === 'friend');
  return { g, d, mate: MATES.find(m => m.id === d.mate) };
}

/** Tick until the mate comes up to you again (or `max` minutes); minutes it took, or null. */
function untilAsk(g, d, max = 60) {
  for (let i = 1; i <= max; i++) { g.tick(); if (d.ask) return i; }
  return null;
}

describe('visitors', () => {
  it(`stay ${V.visitMinutes} minutes, whatever you say to them`, () => {
    for (const reply of ['nothing', 'yarn', 'flat out', 'everything']) {
      const { g, d } = visit(15);
      assert.equal(d.remaining, V.visitMinutes);
      for (let m = 1; m < V.visitMinutes; m++) {
        if (d.ask && reply !== 'nothing') g.respond(d.id, reply === 'flat out' || (reply === 'everything' && m % 2) ? 'disengage' : 'chat');
        g.tick();
        assert.ok(g.distractions.includes(d), `${reply}: still here at minute ${m}`);
      }
      g.tick();
      assert.ok(!g.distractions.includes(d), `${reply}: gone after ${V.visitMinutes} minutes`);
    }
  });

  it("don't leave after a beer", () => {
    const { g, d } = visit(15);
    assert.equal(d.ask.kind, 'beer');
    const cash = g.cash;
    g.respond(d.id, 'chat');
    assert.equal(d.beers, 1);
    assert.equal(g.cash, cash - CONFIG.beer.cost, 'a beer still costs what it did');
    assert.ok(d.engaged && d.chat === F.beerChatMinutes, 'a beer-length yarn');
    for (let i = 0; i < F.beerChatMinutes; i++) g.tick();
    assert.ok(g.distractions.includes(d), 'still here after the beer');
    assert.ok(!d.engaged, 'done yarning, back to wandering');
  });

  it('come straight over when they arrive, and wander between visits to you', () => {
    const { g, d } = visit(10);
    assert.ok(d.ask, 'asking on arrival');
    assert.equal(d.engaged, false, 'not talking yet');
    assert.ok(V.areas.includes(d.wander.area) && d.wander.spot >= 0 && d.wander.spot < 1);
    const areas = new Set();
    for (let i = 0; i < V.visitMinutes - 1; i++) { if (d.ask) g.respond(d.id, 'chat'); g.tick(); areas.add(d.wander.area); }
    assert.ok(areas.size >= 2, `moved between areas: ${[...areas]}`);
  });

  describe('lines', () => {
    /** Every ask over a visit, saying yes to each. */
    function asks(hour, seed, mate) {
      const { g, d } = visit(hour, { seed, mate });
      const out = [{ ...d.ask }];
      for (let i = 0; i < V.visitMinutes - 1; i++) {
        if (d.ask) g.respond(d.id, 'chat');
        g.tick();
        if (d.ask && d.ask.text !== out.at(-1).text) out.push({ ...d.ask });
      }
      return out;
    }

    it('before 2pm: a cuppa or a yarn, never a beer', () => {
      for (const seed of [1, 2, 3, 4, 5, 6]) for (const m of MATES) {
        const list = asks(9, seed, m.id);
        assert.equal(list[0].kind, 'cuppa', 'first thing: the ask');
        assert.ok(!list.some(a => a.kind === 'beer'), `${m.name}: ${JSON.stringify(list)}`);
        for (const a of list.filter(x => x.kind === 'cuppa')) assert.ok(m.cuppa.includes(a.text));
      }
    });

    it('from 2pm: they ask for a beer', () => {
      for (const m of MATES) {
        const { d } = visit(CONFIG.beer.fridgeUnlockHour, { mate: m.id });
        assert.equal(d.ask.kind, 'beer');
        assert.ok(m.beer.includes(d.ask.text));
      }
      assert.equal(visit(CONFIG.beer.fridgeUnlockHour - 1 / 60).d.ask.kind, 'cuppa', '1:59pm: still too early');
    });

    it('come from all three pools, never the same line twice running, stories with real bar names', () => {
      const kinds = new Set();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const m of MATES) {
        const list = asks(15, seed, m.id);
        for (let i = 1; i < list.length; i++) assert.notEqual(list[i].text, list[i - 1].text, 'no immediate repeat');
        for (const a of list) {
          kinds.add(a.kind);
          if (a.kind === 'shop') assert.ok(SHOP_TALK.includes(a.text));
          if (a.kind === 'story') {
            assert.ok(!/[{}]/.test(a.text), `filled in: ${a.text}`);
            assert.ok(V.bars.some(b => a.text.includes(b.name)) || /Collingwood/.test(a.text), `a bar or a suburb: ${a.text}`);
          }
        }
      }
      for (const k of ['beer', 'shop', 'story']) assert.ok(kinds.has(k), `the ${k} pool gets used`);
    });

    it('are seeded per day: the same seed and day says the same things; another day, other things', () => {
      const run = (seed, day) => {
        const g = new Game(seed, day);
        g.minute = 15 * 60; g.maybeDistraction = () => {}; g.distractions = [];
        g.spawnDistraction('friend');
        const d = g.distractions[0], said = [d.ask.text];
        for (let i = 0; i < V.visitMinutes - 1; i++) { if (d.ask) g.respond(d.id, 'chat'); g.tick(); if (d.ask && d.ask.text !== said.at(-1)) said.push(d.ask.text); }
        return said.join(' | ');
      };
      assert.equal(run(7, 3), run(7, 3));
      assert.notEqual(run(7, 3), run(7, 4));
    });
  });

  describe('guardrails', () => {
    it(`come back no sooner than ${V.cooldownMin} minutes after a yarn, ${V.waveOffCooldown} after "flat out"`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { g, d } = visit(10, { seed });
        g.respond(d.id, 'chat');
        for (let i = 0; i < V.yarnMinutes; i++) g.tick();
        assert.equal(d.engaged, false, 'the yarn is over');
        const gap = untilAsk(g, d);
        assert.ok(gap >= V.cooldownMin && gap <= V.cooldownMax, `seed ${seed}: back after ${gap} minutes`);
        g.respond(d.id, 'disengage');
        assert.equal(untilAsk(g, d), V.waveOffCooldown, 'a wave-off: back after the longer cooldown');
      }
    });

    it('a wave-off sends them wandering, not home, and they come back', () => {
      const { g, d } = visit(15);
      const rapport = g.rapport;
      assert.ok(g.respond(d.id, 'disengage'));
      assert.equal(g.rapport, rapport - F.disengageRapportCost);
      assert.ok(g.distractions.includes(d) && !d.ask && !d.engaged, 'still here, wandering');
      assert.equal(g.respond(d.id, 'chat'), true);
      assert.equal(d.engaged, false, "there's nothing to say yes to while they're off wandering");
      assert.ok(untilAsk(g, d) !== null, 'back for another go');
    });

    it('unanswered, they start a yarn anyway (and get no beer)', () => {
      const { g, d } = visit(15);
      for (let i = 0; i < V.askMinutes; i++) g.tick();
      assert.ok(d.engaged && !d.ask);
      assert.equal(d.beers, 0);
    });

    it(`each mate asks for at most ${V.beersPerVisitor} beers a day, then a yarn`, () => {
      const { g, d, mate } = visit(14);
      const stay = () => { if (!g.distractions.includes(d)) { g.distractions.push(d); d.remaining = V.visitMinutes; } }; // the same mate keeps dropping back in
      let beers = 0;
      for (let i = 0; i < 150; i++) {
        stay();
        if (d.ask?.kind === 'beer') { g.respond(d.id, 'chat'); beers++; } else if (d.ask) g.respond(d.id, 'chat');
        g.tick();
      }
      stay();
      g.minute = 14 * 60; // plenty of afternoon left, fridge still open
      assert.equal(beers, V.beersPerVisitor);
      assert.equal(g.visitorBeers[mate.id], V.beersPerVisitor);
      assert.equal(g.visitorMayHaveBeer(d), false);
      for (let n = 0; n < 4; n++) {
        if (d.ask) g.respond(d.id, 'chat');
        let back = false;
        for (let i = 0; i < 60 && !back; i++) { stay(); g.tick(); back = !!d.ask; }
        assert.ok(back, 'they keep coming over');
        assert.notEqual(d.ask.kind, 'beer', `past the cap: anything but a beer (${d.ask.text})`);
      }
    });

    it(`all mates together get at most ${V.beersPerDay} a day`, () => {
      const g = new Game(1);
      g.minute = 14 * 60; g.maybeDistraction = () => {}; g.distractions = [];
      let beers = 0;
      for (let i = 0; i < 12; i++) {
        // mates take turns dropping in (never the same one twice running), saying yes to every beer they ask for
        g.distractions = [];
        g.spawnDistraction('friend');
        const d = g.distractions[0];
        for (let m = 0; m < V.visitMinutes && g.distractions.includes(d); m++) {
          if (d.ask?.kind === 'beer') { beers++; g.respond(d.id, 'chat'); } else if (d.ask) g.respond(d.id, 'chat');
          g.tick();
        }
      }
      assert.equal(beers, V.beersPerDay);
      assert.equal(g.visitorBeersToday, V.beersPerDay);
      assert.equal(g.today.mateBeer, V.beersPerDay * CONFIG.beer.cost);
    });

    it('a yes to a beer past the caps is a yarn, not a beer', () => {
      const { g, d, mate } = visit(15);
      assert.equal(d.ask.kind, 'beer');
      g.visitorBeers[mate.id] = V.beersPerVisitor; // capped since they asked
      const cash = g.cash;
      g.respond(d.id, 'chat');
      assert.equal(d.beers, 0);
      assert.equal(g.cash, cash);
      assert.equal(d.chat, V.yarnMinutes);
    });

    it('a mate helping themselves from the fridge counts towards the caps too', () => {
      const { g, d, mate } = visit(15, { mate: 'tim' }); // Tim grabs one if you're drinking
      g.respond(d.id, 'disengage');
      g.visitorBeers = { eggby: V.beersPerDay - 1, courtney: 0 };
      assert.ok(g.buyBeer());
      g.tick();
      assert.equal(d.beers, 1, 'Tim had one');
      assert.equal(g.visitorBeersToday, V.beersPerDay);
      assert.ok(g.distractions.includes(d), "and didn't head off");
      g.visitorBeers = { eggby: V.beersPerDay };
      const d2 = { ...d, beers: 0 };
      assert.equal(g.visitorMayHaveBeer(d2), false, 'none once the day cap is reached');
      void mate;
    });
  });
});
