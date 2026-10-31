// Designs (src/designs): the shared format that drives each job's before (the sketch on the job card), during (the
// router following the real toolpath) and after (the extruded reveal, the "Made today" gallery). The format is checked
// with no browser; the rest in the shed as a phone, on the high tier and on ?safe=1 (no extra light, no particles).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, frames } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { DESIGNS, designForJob, flatDesign, toolpath, headAt, bounds, area } = await env.load('/src/designs/index.ts');
const { sketchSvg } = await env.load('/src/designs/sketch.ts');

describe('design format', () => {
  it('has a dozen designs, four of each kind, with unique ids', () => {
    assert.ok(DESIGNS.length >= 12);
    for (const k of ['formwork', 'mdf', 'acrylic']) assert.ok(DESIGNS.filter(d => d.kind === k).length >= 4, k);
    assert.equal(new Set(DESIGNS.map(d => d.id)).size, DESIGNS.length);
  });
  for (const d of DESIGNS) {
    it(`${d.id}: a closed outline on its sheet, holes inside it, a toolpath that ends on the outline`, () => {
      for (const k of ['id', 'name', 'kind', 'customer', 'material', 'colour', 'outer', 'note']) assert.ok(d[k], k);
      assert.match(d.colour, /^#[0-9a-f]{6}$/i);
      const f = flatDesign(d);
      assert.ok(f.outer.length > 2 && Math.abs(area(f.outer)) > 1000, 'outline has area');
      const b = bounds([{ pts: f.outer, closed: true }]);
      assert.ok(b.minX >= 0 && b.minY >= 0 && b.maxX <= d.sheet.w && b.maxY <= d.sheet.h, `outline on the sheet ${JSON.stringify(b)}`);
      for (const p of [...f.cuts, ...f.engraves]) {
        const ib = bounds([p]);
        assert.ok(ib.minX > b.minX && ib.maxX < b.maxX && ib.minY > b.minY && ib.maxY < b.maxY, 'inner paths sit inside the outline');
      }
      const tp = toolpath(d);
      assert.ok(tp.length > 0 && tp.moves.at(-1).op === 'cut', 'the outer profile is cut last');
      const end = headAt(tp, 1).p, last = tp.moves.at(-1).to;
      assert.ok(Math.hypot(end[0] - last[0], end[1] - last[1]) < 1e-6, 'the head ends where the cut ends');
      assert.match(sketchSvg(d), /^<svg[\s\S]*<\/svg>$/);
    });
  }
  it('every sheet of one order is the same design; each job type maps to its kind', () => {
    const job = (type, name, n) => ({ type, name: `${name} (${n}/3)`, dueDay: 1, deadlineMinute: 900 });
    for (const [type, kind] of [['formwork', 'formwork'], ['joinery', 'mdf'], ['signage', 'acrylic']]) {
      const ds = [1, 2, 3].map(n => designForJob(job(type, 'Bar front — Footscray', n)));
      assert.ok(ds.every(d => d === ds[0]), 'same design for the whole order');
      assert.equal(ds[0].kind, kind);
    }
  });
});

/** Put a sheet of `design` on the bed, cutting, `t` of the way through. Returns its job id. */
const onBed = (game, design, t) => game.eval(async (g, w, s, a) => {
  const { DESIGNS, designForJob } = await import(new URL('src/designs/index.ts', document.baseURI).href);
  w.tour = null;
  const want = DESIGNS.find(d => d.id === a.design);
  const type = { formwork: 'formwork', mdf: 'joinery', acrylic: 'signage' }[want.kind];
  const job = g.jobs.find(j => j.status === 'queued');
  job.type = type;
  for (let i = 0; designForJob(job).id !== a.design; i++) job.name = `Test ${i}`;
  job.status = 'cutting'; job.progress = Math.round(job.cutMinutes * a.t);
  g.current = job; g.machine = 'cutting'; w.bed = 'running'; w.bedJobId = job.id;
  return job.id;
}, { design, t });

const finish = (game, id) => game.eval((g, w, s, id) => {
  const j = g.jobs.find(x => x.id === id); j.progress = j.cutMinutes; j.status = 'done'; g.current = null; g.machine = 'idle';
}, id);

describe('before, during, after in the shed', () => {
  it('a new game shows the first job card with its sketch; a touch puts it away', async () => {
    const game = await freshGame(env);
    const card = await game.eval((g, w, s) => ({ showing: s.jobCard.showing, design: document.querySelector('#kir-hud .jobcard')?.dataset.design,
      svg: !!document.querySelector('#kir-hud .jobcard svg.sketch') }));
    assert.ok(card.showing && card.svg && card.design, JSON.stringify(card));
    await game.page.touchscreen.tap(200, 700);
    assert.equal(await game.eval((g, w, s) => s.jobCard.showing), false);
    await game.close();
  });

  it('the router head follows the toolpath and the kerf grows with the cut', async () => {
    const game = await freshGame(env);
    await onBed(game, 'cubby-wall', 0.3);
    await frames(game, 4);
    const a = await game.eval((g, w, s) => ({ design: s.cutView.current?.id, head: [s.cutView.head.x, s.cutView.head.y], drawn: s.cutView.lines.geometry.drawRange.count }));
    await game.eval(g => { g.current.progress = Math.round(g.current.cutMinutes * 0.9); });
    await frames(game, 4);
    const b = await game.eval((g, w, s) => ({ head: [s.cutView.head.x, s.cutView.head.y], drawn: s.cutView.lines.geometry.drawRange.count }));
    assert.equal(a.design, 'cubby-wall');
    assert.ok(b.drawn > a.drawn && a.drawn > 0, `kerf grows ${a.drawn} → ${b.drawn}`);
    assert.notDeepEqual(a.head, b.head, 'the head moved along the path');
    await game.close();
  });

  for (const [name, query, light, particles] of [['high tier', '', true, true], ['?safe=1', '&safe=1', false, false]]) {
    it(`${name}: finishing a sheet plays the reveal (${light ? 'warm light, dust' : 'no extra light or particles'}), under 3 s, and a tap skips it`, async () => {
      const game = await freshGame(env);
      if (query) { await game.page.goto(`${env.url}?seed=1${query}`); await game.page.waitForFunction(() => window.kirScene?.started); await game.eval((g, w, s) => { g.tick = () => {}; g.maybeDistraction = () => {}; s.setPaused(false); }); } // a reload resumes paused
      const id = await onBed(game, 'mila-cloud', 0.95);
      await frames(game, 2);
      await finish(game, id);
      await frames(game, 3);
      const r = await game.eval((g, w, s) => ({ active: s.reveal.active, light: !!s.reveal.light, dust: !!s.reveal.dust, made: w.made }));
      assert.ok(r.active, 'reveal playing');
      assert.equal(r.light, light); assert.equal(r.dust, particles);
      assert.deepEqual(r.made.map(m => m.design), ['mila-cloud']);
      const { REVEAL } = await env.load('/src/world3d/reveal.ts');
      assert.ok(REVEAL.total < 3);
      // a tap on the world skips it, and doesn't walk anywhere
      await game.page.touchscreen.tap(200, 500);
      await frames(game, 2);
      assert.equal(await game.eval((g, w, s) => s.reveal.active), false, 'skipped');
      assert.equal(await game.eval((g, w, s) => s.walking), false, "the skip tap didn't send you walking");
      await game.close();
    });
  }

  it('the day summary has "Made today": the sketch beside the finished piece, one per design', async () => {
    const game = await freshGame(env);
    for (const d of ['rocket-bookcase', 'rocket-bookcase', 'spoke-wheel']) {
      const id = await onBed(game, d, 0.9);
      await frames(game, 2);
      await finish(game, id);
      await frames(game, 2);
      await game.eval((g, w, s) => s.reveal.skip());
    }
    await game.eval(g => { g.phase = 'daySummary'; });
    await game.page.waitForSelector('#kir-hud .summary section.made');
    const pairs = await game.eval(() => [...document.querySelectorAll('#kir-hud .summary .pair')].map(p => ({
      design: p.dataset.design, title: p.querySelector('.cap').textContent, sketch: !!p.querySelector('.before svg.sketch'),
      after: p.querySelector('.after img')?.src.slice(0, 22) })));
    assert.deepEqual(pairs.map(p => p.design), ['rocket-bookcase', 'spoke-wheel']);
    assert.match(pairs[0].title, /×2/);
    for (const p of pairs) { assert.ok(p.sketch); assert.equal(p.after, 'data:image/png;base64,'); }
    await game.close();
  });
});
