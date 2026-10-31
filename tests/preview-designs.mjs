// Preview 1 (not a test): screenshots of the before/after design flow, at phone size. node tests/preview-designs.mjs <outdir>
import { startBrowser, freshGame, frames, walkTo } from './browser.mjs';

const out = process.argv[2] ?? 'previews';
const env = await startBrowser();
const shot = (game, name) => game.page.screenshot({ path: `${out}/${name}.png` });
/** A preview starts past the landlord's letter and the first-run hints. */
export const tidy = game => game.eval((g, w) => {
  document.querySelectorAll('.lettercard').forEach(e => e.remove());
  if (w.lease) w.lease.letterRead = true;
  if (!document.getElementById('preview-css')) { const st = document.createElement('style'); st.id = 'preview-css'; st.textContent = '#kir-hud .hint { display: none !important; }'; document.head.appendChild(st); }
});
const onBed = (game, design, t) => game.eval(async (g, w, s, a) => {
  const { DESIGNS, designForJob } = await import(new URL('src/designs/index.ts', document.baseURI).href);
  w.tour = null;
  const want = DESIGNS.find(d => d.id === a.design);
  const type = { formwork: 'formwork', mdf: 'joinery', acrylic: 'signage' }[want.kind];
  const job = g.jobs.find(j => j.status === 'queued');
  job.type = type;
  for (let i = 0; designForJob(job).id !== a.design; i++) job.name = `${want.name}${i ? ` #${i}` : ""}`;
  job.status = 'cutting'; job.progress = Math.round(job.cutMinutes * a.t);
  g.current = job; g.machine = 'cutting'; w.bed = 'running'; w.bedJobId = job.id;
  return job.id;
}, { design, t });
const finish = (game, id) => game.eval((g, w, s, id) => { const j = g.jobs.find(x => x.id === id); j.progress = j.cutMinutes; j.status = 'done'; g.current = null; g.machine = 'idle'; }, id);

try {
  const game = await freshGame(env);
  await tidy(game);
  await game.eval((g, w, s) => { if (!s.jobCard.showing) s.jobCard.show(g, g.jobs[0]); });
  await frames(game, 20);
  await shot(game, '1a-job-card-sketch');                      // before: the job card with the pencil sketch
  await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); });
  await walkTo(game, 'machine');
  const id = await onBed(game, 'cubby-wall', 0.55);
  await frames(game, 30);
  await shot(game, '1b-cutting-the-line');                     // during: the head on the toolpath, kerf behind it
  await finish(game, id);
  await game.page.waitForTimeout(1200);
  await shot(game, '1c-reveal-lift-and-rotate');               // after: lifted off the bed, turning in the light
  await game.page.waitForTimeout(2500);
  for (const d of ['mila-cloud', 'spoke-wheel']) { const j = await onBed(game, d, 0.95); await frames(game, 3); await finish(game, j); await game.page.waitForTimeout(3200); }
  await game.eval(g => { g.phase = 'daySummary'; });
  await game.page.waitForSelector('#kir-hud .summary section.made');
  await game.page.evaluate(() => document.querySelector('#kir-hud .summary section.made').scrollIntoView());
  await frames(game, 5);
  await shot(game, '1d-made-today-gallery');                   // the day summary: sketch beside the finished piece
  await game.context.close();
} finally { await env.close(); }
