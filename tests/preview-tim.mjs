// Preview 2 (not a test): a knock-off night with Tim Baker, two-shot, through the restaurant big idea to a few beers
// deep (the drunk spelling shows in the idea itself). Skips "call a mate". node tests/preview-tim.mjs <outdir>
import { startBrowser, freshGame, frames } from './browser.mjs';

const out = process.argv[2] ?? 'previews';
const env = await startBrowser();
const shot = (game, name) => game.page.screenshot({ path: `${out}/${name}.png` });
const tidy = game => game.eval((g, w) => {
  document.querySelectorAll('.lettercard').forEach(e => e.remove());
  if (w.lease) w.lease.letterRead = true;
  if (!document.getElementById('preview-css')) { const st = document.createElement('style'); st.id = 'preview-css'; st.textContent = '#kir-hud .hint { display: none !important; }'; document.head.appendChild(st); }
});
const bubbles = game => game.page.evaluate(() => [...document.querySelectorAll('#kir-hud .talk:not(.day)')].filter(b => b.style.display !== 'none').map(b => b.textContent).join(' | '));
const tapReply = (game, i) => game.page.evaluate(i => document.querySelectorAll('#kir-hud .replies:not(.day) button')[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), i);

try {
  const game = await freshGame(env);
  await tidy(game);
  await game.eval((g, w, s) => { w.tour = null; s.jobCard.hide(); w.people.lastFriend = 'eggby'; g.minute = 17 * 60; g.phase = 'endOfDayPrompt'; }); // day 1, last night Eggby: tonight it's Tim
  await game.page.waitForFunction(() => window.kirScene.knockoff.mode === 'door', null, { timeout: 15_000 });
  await game.page.waitForTimeout(1500);
  console.log('host:', await game.eval((g, w, s) => s.knockoff.friend));
  await shot(game, '2a-tim-at-the-roller-door');
  await tapReply(game, 0); // Grab a beer
  await game.page.waitForTimeout(2500);
  await shot(game, '2b-two-shot-on-the-crates');
  let idea = false;
  for (let k = 0; k < 900 && !idea; k++) {
    const st = await game.eval((g, w, s) => ({ asking: s.knockoff.talk.asking, mode: s.knockoff.mode, beers: s.knockoff.night?.beers ?? 0, opts: s.knockoff.talk.options ?? [] }));
    if (st.mode === 'off') break;
    const said = await bubbles(game);
    if (!idea && /Parmanent|restaurant/i.test(said)) { await game.page.waitForTimeout(600); await shot(game, '2c-the-big-idea-restaurant'); idea = true; console.log('idea at beer', st.beers, said); }
    if (st.asking) {
      // another one: yes; never ring a mate; otherwise the first reply
      const i = Math.max(0, st.opts.findIndex(o => /^(yeah|go on|yes|sure|why not)/i.test(o)));
      const pick = /ring|call/i.test(st.opts[i] ?? '') ? st.opts.findIndex(o => !/ring|call|wind/i.test(o)) : i;
      await tapReply(game, Math.max(0, pick));
      await game.page.waitForTimeout(300);
    } else { await game.page.mouse.click(200, 300); await game.page.waitForTimeout(120); }
  }
  // wind it up: the summary's "Last night" line
  for (let k = 0; k < 200; k++) {
    const st = await game.eval((g, w, s) => ({ asking: s.knockoff.talk.asking, mode: s.knockoff.mode, opts: s.knockoff.talk.options ?? [] }));
    if (st.mode === 'off') break;
    if (st.asking) { await tapReply(game, st.opts.length - 1); await game.page.waitForTimeout(300); } else { await game.page.mouse.click(200, 300); await game.page.waitForTimeout(120); }
  }
  await game.page.waitForFunction(() => window.kir.phase === 'daySummary', null, { timeout: 30_000 });
  await game.page.waitForSelector('#kir-hud .summary .lastnight');
  await frames(game, 5);
  await shot(game, '2e-summary-last-night');
  await game.context.close();
} finally { await env.close(); }
