// The knock-off conversation (src/people): the dialogue data's shape, the slur filter, and whole nights played through
// on the director with no browser — every friend, several nights running, picking replies at random.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const load = p => server.ssrLoadModule(p);
const { THREADS, SCRIPTS, TOPICS, BIG_IDEAS } = await load('/src/people/dialogue/index.ts');
const { Night, endNight, TEMPLATE_KEYS } = await load('/src/people/night.ts');
const { FRIENDS } = await load('/src/people/friends.ts');
const { newPeople } = await load('/src/people/state.ts');
const { slur } = await load('/src/people/slur.ts');
const { DESIGNS } = await load('/src/designs/index.ts');

const EXPRS = ['relaxed', 'laughing', 'thoughtful', 'misty', 'animated'];
const WHO = ['host', 'guest', 'you', 'eggby', 'courtney', 'tim', undefined];
// real beer brands and brewers stay out of the dialogue
const BRANDS = /\b(carlton|vb|victoria bitter|coopers|stone ?& ?wood|mountain goat|balter|young henrys|little creatures|pirate life|james squire|great northern|xxxx|tooheys|furphy|hahn|heineken|corona|stella)\b/i;
const keysIn = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
const checkText = (s, where) => {
  for (const k of keysIn(s)) assert.ok(TEMPLATE_KEYS.includes(k), `${where}: unknown template {${k}}`);
  assert.doesNotMatch(s, BRANDS, `${where}: a real brand`);
};

describe('dialogue data', () => {
  it('thread ids are unique; every node has exactly two replies that go somewhere real', () => {
    const ids = new Set();
    for (const t of THREADS) {
      assert.ok(!ids.has(t.id), `duplicate thread ${t.id}`); ids.add(t.id);
      assert.ok(t.nodes.length >= 1, t.id);
      const nodeIds = new Set(t.nodes.map(n => n.id));
      assert.equal(nodeIds.size, t.nodes.length, `${t.id}: duplicate node ids`);
      for (const n of t.nodes) {
        assert.ok(n.say.length >= 1 && n.say.length <= 4, `${t.id}/${n.id}: 1–4 lines`);
        assert.equal(n.replies.length, 2, `${t.id}/${n.id}: exactly two replies`);
        for (const l of n.say) {
          assert.ok(WHO.includes(l.who), `${t.id}/${n.id}: who ${l.who}`);
          assert.ok(!l.expr || EXPRS.includes(l.expr), `${t.id}/${n.id}: expr ${l.expr}`);
          checkText(l.text, `${t.id}/${n.id}`);
        }
        for (const r of n.replies) {
          if (r.next) assert.ok(nodeIds.has(r.next), `${t.id}/${n.id}: next "${r.next}" missing`);
          checkText(r.text, `${t.id}/${n.id} reply`);
        }
      }
    }
  });

  for (const f of FRIENDS) {
    it(`${f.name}: three nights' worth (shop, life, deep), a restaurant, a cut thread per idea, and every set piece`, () => {
      const mine = THREADS.filter(t => t.friend === f.id);
      for (const k of ['shop', 'life', 'deep']) assert.ok(mine.filter(t => t.kind === k).length >= 3, `${f.id} ${k}: ${mine.filter(t => t.kind === k).length}`);
      assert.ok(mine.some(t => t.kind === 'shop' && t.needs?.length), `${f.id}: shop talk that references the day`);
      const rest = mine.filter(t => t.kind === 'bigIdea' && t.bigIdea === 'restaurant');
      assert.equal(rest.length, 1, `${f.id}: their own restaurant`);
      assert.ok(rest[0].nodes.length >= 4, 'restaurant builds over 4+ turns');
      for (const c of f.cutIdeas) {
        assert.ok(DESIGNS.some(d => d.id === c.design && d.afterHours), `${c.design} is an after-hours design`);
        assert.ok(mine.some(t => t.kind === 'cut' && t.cut === c.design && t.nodes.some(n => n.replies.some(r => r.cut))), `${f.id}: cut thread for ${c.design}`);
      }
      assert.ok(mine.some(t => t.kind === 'cut' && t.cut === 'freehand'), `${f.id}: "draw whatever you want"`);
      const s = SCRIPTS[f.id];
      for (const k of ['greet', 'grabBeer', 'headHome', 'windUp', 'phone', 'arrive', 'cutIn', 'love', 'music', 'heardIdea']) assert.ok(s[k].length >= 2, `${f.id} ${k}`);
      for (const k of ['ask', 'yes', 'no']) assert.ok(s.another[k].length >= 1, `${f.id} another.${k}`);
      for (const k of ['start', 'wobbly', 'good', 'done']) assert.ok(s.trace[k].length >= 2, `${f.id} trace.${k}`);
    });
  }

  it('big ideas: each one has a build of 3–5 turns and a collapse that ends on "Another one?"', () => {
    for (const id of Object.keys(BIG_IDEAS)) {
      const ts = THREADS.filter(t => t.kind === 'bigIdea' && t.bigIdea === id);
      assert.ok(ts.length >= 1, `big idea ${id}`);
      for (const t of ts) {
        assert.ok(t.nodes.length >= 4 && t.nodes.length <= 7, `${t.id}: ${t.nodes.length} nodes`);
        const ends = t.nodes.filter(n => n.replies.every(r => !r.next));
        assert.ok(ends.length && ends.every(n => n.replies.some(r => r.another)), `${t.id}: ends on another one`);
      }
    }
  });

  it('topics: each is a 3–6 turn argument', () => {
    for (const id of Object.keys(TOPICS)) {
      const ts = THREADS.filter(t => t.kind === 'topic' && t.topic === id);
      assert.ok(ts.length >= 1, `topic ${id}`);
      for (const t of ts) assert.ok(t.nodes.length >= 3 && t.nodes.length <= 6, `${t.id}: ${t.nodes.length}`);
    }
    assert.ok(THREADS.filter(t => t.kind === 'group').length >= 3, 'group threads');
  });
});

describe('slur filter', () => {
  const text = "I love this place, mate. Honestly, it's the best thing we've ever done and I'm proud of it.";
  it('one beer: perfect', () => assert.equal(slur(text, 1, 'x'), text));
  it('deterministic, rougher with beers, capped readable', () => {
    assert.equal(slur(text, 3, 'x'), slur(text, 3, 'x'));
    assert.notEqual(slur(text, 3, 'x'), text);
    const words = text.split(' ');
    const changed = (b) => slur(text, b, 'x').split(' ').filter((w, i) => w !== words[i]).length;
    assert.ok(changed(8) >= changed(2), 'more beers, more mess');
    assert.ok(changed(20) <= Math.ceil(words.length * 0.5), `still readable at max: ${slur(text, 20, 'x')}`);
    assert.match(slur('Cheers mate', 4, 'x'), /maa+te/);
  });
});

describe('nights, played through', () => {
  const facts = { sheets: 5, late: 1, scrapped: 0, fires: 1, designs: ['Café menu board', 'Rocket bookcase end'], customers: ['Wren', 'Priya'],
    gift: { phrase: 'a lemon slice', from: 'Nan Doreen' }, jess: 'Jess', jessIn: true, fullTimeToday: false, keepsake: null };
  for (const f of FRIENDS) {
    it(`${f.name}: five nights running, random replies, no loose templates, no repeated argument`, () => {
      const p = newPeople();
      const topics = [];
      for (let day = 1; day <= 5; day++) {
        const n = new Night({ dayIndex: day * 2, host: f.id, facts, people: p });
        let seed = day * 7919 + f.id.length, maxStage = 1, guards = 0;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        while (!n.over && guards++ < 40) {
          const t = n.turnNow;
          for (const l of t.lines) assert.doesNotMatch(l.text, /\{\w+\}/, `loose template: ${l.text}`);
          for (const o of t.options) assert.doesNotMatch(o.text, /\{\w+\}/, `loose template: ${o.text}`);
          // the after-hours cut takes over (tracing): no replies until it's done
          if (t.event?.kind === 'cut') { assert.equal(t.options.length, 0); n.cutDone(0.6); continue; }
          assert.ok(t.options.length >= 2 || n.over, 'options');
          maxStage = Math.max(maxStage, n.stage);
          // keep going till late, ring someone once, say yes to another one mostly
          const wind = t.options.findIndex(o => o.kind === 'wind');
          const call = t.options.findIndex(o => o.kind === 'call');
          const yes = t.options.findIndex(o => o.kind === 'yes');
          let pick;
          if (n.turn >= 18) pick = wind;
          else if (yes >= 0) pick = rnd() < 0.85 ? yes : yes + 1;
          else if (call >= 0 && day % 2 === 0 && n.beers >= 3 && !n.guest && !n.calling) pick = call;
          else pick = Math.floor(rnd() * 2);
          n.choose(pick);
        }
        assert.ok(n.over, 'the night ended');
        assert.equal(maxStage, 3, 'got to the big stuff');
        endNight(n, p, day * 2);
        assert.ok(p.lastNight.quote.length > 0);
        if (n.topic) topics.push(n.topic);
      }
      assert.equal(new Set(topics).size, topics.length, `no argument twice in five nights: ${topics}`);
    });
  }
});
