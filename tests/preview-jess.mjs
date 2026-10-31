// Preview 3 (not a test): Jess, part time → full time (the ask, your yes, cake at smoko), and a customer at pickup
// seeing the finished piece, then dropping round a thank-you the next day. node tests/preview-jess.mjs <outdir>
import { startBrowser, freshGame, frames, walkTo } from './browser.mjs';

const out = process.argv[2] ?? 'previews';
const env = await startBrowser();
const shot = (game, name) => game.page.screenshot({ path: `${out}/${name}.png` });
const tidy = game => game.eval((g, w) => {
  document.querySelectorAll('.lettercard').forEach(e => e.remove());
  if (w.lease) w.lease.letterRead = true;
  if (!document.getElementById('preview-css')) { const st = document.createElement('style'); st.id = 'preview-css'; st.textContent = '#kir-hud .hint { display: none !important; }'; document.head.appendChild(st); }
});
const dayReply = (game, i) => game.page.evaluate(i => document.querySelectorAll('#kir-hud .replies.day button')[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), i);
const beside = game => game.eval((g, w, s) => { const j = s.peopleDay.jess; j.x = s.pos.x + 1.1; j.z = s.pos.z + 0.3; j.path = []; j.fig.root.position.set(j.x, 0, j.z); });

try {
  const game = await freshGame(env);
  await tidy(game);
  await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); g.day = 2; g.dayIndex = 2; g.minute = 9 * 60; });
  await game.page.waitForFunction(() => !!window.kirScene.peopleDay.jess);
  await beside(game);
  await game.page.waitForTimeout(800);
  await shot(game, '3a-jess-in-on-her-day');
  // trust past the mark: she asks, a line at a time, then your answer
  await game.eval((g, w) => { w.people.trust = 50; g.minute = 11 * 60 + 2; });
  await beside(game);
  await game.page.waitForFunction(() => window.kirScene.peopleDay.task === 'ask' && window.kirScene.peopleDay.talk.asking, null, { timeout: 120_000 });
  await shot(game, '3b-the-full-time-ask');
  await dayReply(game, 1); // "Mate. YES. You're a legend."
  await game.page.waitForTimeout(2900);
  await shot(game, '3c-yes');
  // next morning: cake at smoko, tonight's mate in early, everyone cheers
  await game.eval((g, w, s) => { s.peopleDay.talk.hideReplies(); s.peopleDay.talk.hush('jess'); g.minute = 9 * 60 + 50; });
  await game.eval((g, w, s) => { // the nearest walkable cell to the smoko crate
    let best = null; for (let y = 36; y <= 46; y++) for (let x = 20; x <= 29; x++) if (s.walkable(x, y)) { const d = Math.hypot(x - 25.5, y - 41); if (!best || d < best.d) best = { x, y, d }; }
    s.pos.x = (best.x + 0.5) * 0.5; s.pos.z = (best.y + 0.5) * 0.5; w.px = s.pos.x; w.py = s.pos.z; });
  await frames(game, 10);
  await game.eval((g, w, s) => { w.people.cakeDay = g.dayIndex + 1; g.dayIndex += 1; g.day = 3; g.minute = 10 * 60 + 1; });
  await game.page.waitForFunction(() => window.kirScene.w.people.gifts.some(x => x.kind === 'cake'));
  await game.eval((g, w, s) => { const j = s.peopleDay.jess; if (j) { j.x = s.pos.x - 1.2; j.z = s.pos.z - 0.4; j.path = []; j.fig.root.position.set(j.x, 0, j.z); }
    const m = s.peopleDay.cakeMate; if (m) { m.x = s.pos.x + 1.2; m.z = s.pos.z - 0.4; m.fig.root.position.set(m.x, 0, m.z); } });
  await game.page.waitForFunction(() => /Speech|cheer|Hooray|full-timer/i.test([...document.querySelectorAll('#kir-hud .talk.day')].filter(b => b.style.display !== 'none').map(b => b.textContent).join(' ')), null, { timeout: 20_000 });
  await game.page.waitForTimeout(400);
  await shot(game, '3d-cake-at-smoko');
  // a customer at pickup sees the finished piece; tomorrow they're back with a thank-you
  await game.eval((g, w, s) => { const m = s.peopleDay.cakeMate; if (m) m.leaveAt = 0; });
  await game.page.waitForTimeout(4000); // the cheers die down
  await game.eval((g, w, s) => { for (const k of ['jess', 'mate', 'you']) s.peopleDay.talk.hush(k); w.finishedStack = 3; w.utePresent = true; w.rollerUpUntil = 1e9; g.deliveries = []; });
  await walkTo(game, 'rollerDoor');
  await frames(game, 20);
  await game.eval((g, w, s) => { w.made = [{ job: g.jobs[0].id, design: 'mila-cloud' }]; w.pickedUp = 0; s.peopleDay.pickup(1); });
  await frames(game, 10);
  await shot(game, '3e-pickup-they-see-it');
  await game.eval((g, w, s) => { const d = w.people.pendingGifts[0]; if (d) { d.dayIndex = g.dayIndex; d.minute = g.minute; } });
  await game.page.waitForFunction(() => window.kirScene.w.people.gifts.some(x => x.kind !== 'cake'), null, { timeout: 15_000 });
  await game.page.waitForTimeout(1000);
  await shot(game, '3f-thank-you-next-day');
  await game.context.close();
} finally { await env.close(); }
