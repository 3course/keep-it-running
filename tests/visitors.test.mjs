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

describe('how often a mate drops in (CONFIG.visitors.perDay)', () => {
  it('1 or 2 visits a day, never two arrivals within 90 minutes, at most one after two', () => {
    const P = V.perDay, count = [0, 0, 0, 0];
    for (let seed = 1; seed <= 30; seed++) {
      const g = new Game(seed, 1);
      for (let day = 0; day < 5; day++) {
        const arrivals = [], seen = new Set();
        while (g.phase === 'day') { g.tick(); for (const d of g.distractions) if (d.kind === 'friend' && !seen.has(d.id)) { seen.add(d.id); arrivals.push(g.minute); } }
        count[Math.min(3, arrivals.length)]++;
        assert.ok(arrivals.filter(m => m >= P.afterHour * 60).length <= 1, `seed ${seed} day ${day}: two after two`);
        for (let i = 1; i < arrivals.length; i++) assert.ok(arrivals[i] - arrivals[i - 1] >= P.minGapMinutes, `seed ${seed}: ${arrivals}`);
        if (g.phase === 'endOfDayPrompt') g.knockOff();
        if (g.phase === 'daySummary') g.nextDay();
        if (g.phase === 'weekSummary') break;
      }
    }
    assert.equal(count[0] + count[3], 0, `every day 1 or 2: ${count}`);
    assert.ok(count[1] > 20 && count[2] > 20, `both happen: ${count}`);
  });
});

describe("a mate who said he'd be back after two", () => {
  it("doesn't turn up the next day if he couldn't come back that day", () => {
    const g = new Game(3);
    g.mateReturn = { mate: g.lastMate ?? 'tim', minute: 14 * 60 };
    while (g.phase === 'day') { g.distractions = g.distractions.filter(d => d.kind !== 'friend').concat([{ id: 999, kind: 'friend', remaining: 999, engaged: false }]); g.tick(); } // someone's in all afternoon
    if (g.phase === 'endOfDayPrompt') g.knockOff();
    g.nextDay();
    assert.equal(g.mateReturn, null, 'the promise was for yesterday');
  });
});

describe('the visit scheduler, in the day log (playtest 1: a day with no mate)', () => {
  it('every day: 1–2 planned, logged when planned and when each one walks in', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game(seed);
      for (let day = 1; day <= 3; day++) {
        const planned = g.mateVisits.length;
        assert.ok(planned >= 1 && planned <= 2, `seed ${seed} day ${g.dayIndex}: ${planned} planned`);
        let arrived = 0;
        const spawn = g.spawnDistraction.bind(g);
        g.spawnDistraction = (k, ...a) => { if (k === 'friend') arrived++; return spawn(k, ...a); };
        while (g.phase === 'day') g.tick();
        g.spawnDistraction = spawn;
        const today = g.log.filter(l => l.dayIndex === g.dayIndex).map(l => l.text);
        assert.ok(today.some(t => t.startsWith('[visits] planned: ')), 'the plan is in the log');
        assert.ok(arrived >= 1, `seed ${seed} day ${g.dayIndex}: someone came`);
        assert.equal(today.filter(t => /^\[visits\] .* fired: /.test(t)).length, arrived, 'a line for each one that walked in');
        if (g.phase === 'endOfDayPrompt') g.knockOff();
        g.nextDay();
      }
    }
  });
});

describe('asking a mate for a hand, more than once a visit (playtest: "only one chance")', () => {
  it(`jobs done: he's back within ${V.helpAgainMinutes} min with the visit still on, and you can ask again — and again`, () => {
    const { g, d } = visit(10);
    for (let round = 1; round <= 3; round++) {
      const n = g.askHelp(d.id);
      assert.ok(n > 0, `round ${round}: he says yes`);
      for (let i = 0; i < n; i++) g.helperDid(d.id);
      assert.equal(d.helping, 0, 'done');
      let back = null;
      for (let m = 1; m <= V.helpAgainMinutes + 1 && !back; m++) { g.tick(); if (d.ask) back = m; }
      assert.ok(back !== null, `round ${round}: he comes back over`);
      assert.ok(g.distractions.includes(d), 'still here to be asked');
    }
  });
});

describe('what a hand costs', () => {
  it(`the first ask in a visit is free; each after costs ${V.helpAgainRapport} rapport and ${V.helpAgainChatMinutes} min more yarn on his way out`, () => {
    const { g, d } = visit(10);
    g.rapport = 50;
    const n1 = g.askHelp(d.id); for (let i = 0; i < n1; i++) g.helperDid(d.id);
    assert.equal(g.rapport, 50 + CONFIG.distractions.friend.chatRapportGain, 'free (he even leaves you happier)');
    const r = g.rapport;
    const n2 = g.askHelp(d.id); for (let i = 0; i < n2; i++) g.helperDid(d.id);
    assert.equal(g.rapport, r - V.helpAgainRapport + CONFIG.distractions.friend.chatRapportGain, 'the second costs rapport');
    assert.equal(d.outChat, V.helpAgainChatMinutes);
    g.askHelp(d.id);
    assert.equal(d.outChat, 2 * V.helpAgainChatMinutes, 'and the third');
    // the visit runs out: he yarns that long before he goes
    d.helping = 0; d.remaining = 1; g.tick();
    assert.ok(g.distractions.includes(d), 'not gone yet');
    assert.equal(d.engaged, true, 'yarning at you');
    for (let m = 0; m < 2 * V.helpAgainChatMinutes; m++) g.tick();
    assert.ok(!g.distractions.includes(d), 'then he goes');
  });
  it(`from ${V.helpBeerFromHour}:00 he wants a beer before he starts; given one, he helps; past the caps, he just helps`, () => {
    const { g, d } = visit(V.helpBeerFromHour + 0.5);
    assert.equal(g.askHelp(d.id), 0, 'a beer first');
    assert.equal(d.beerFirst, true);
    assert.ok(g.buyBeer(), 'from the fridge'); assert.ok(g.giveBeer(d.id), 'handed over');
    assert.equal(d.engaged, false, 'not off yarning: ready to work');
    assert.ok(g.askHelp(d.id) > 0, 'now he helps');
    const capped = visit(V.helpBeerFromHour + 0.5);
    capped.g.visitorBeers = { [capped.d.mate]: V.beersPerVisitor };
    assert.ok(capped.g.askHelp(capped.d.id) > 0, 'past the caps he helps without');
  });
});
