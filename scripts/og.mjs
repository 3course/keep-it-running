// Regenerates public/og-image.png, the 1200×630 social share tile (Open Graph / Twitter card), by capturing the game's own
// title screen in headless Chromium: the shed from the street behind the chunky pixel lettering, no menu, and a line under
// the title. Run `npm run og` after any art or title change, then commit the PNG. The page is drawn at 1× so the 1/3-res
// scene and the pixel lettering stay hard-edged (no smoothing); the title sits inside the central ~1000×500, since
// Facebook and LinkedIn trim the edges.
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/og-image.png');
const W = 1200, H = 630, LINE = 'PLAY FREE ON YOUR PHONE';
// The shed from a corner of the street (the in-game title shot is a straight-on look at the roller door and the truck).
const SHOT = { from: { x: 27, y: 5.2, z: 27 }, look: { x: 12.5, y: 1.3, z: 12 } };

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?seed=1`); // a fresh profile: the title with no save
  await page.waitForFunction(() => window.kirScene?.started && document.querySelector('.kirtitle'), null, { timeout: 60_000 });
  await page.evaluate(async ({ line, shot }) => {
    const { pixelText, fitPixelText } = await import('/src/ui/pixelText.ts');
    const { WORLD } = await import('/src/world/worldConfig.ts');
    Object.assign(WORLD.titleShot, shot, { sweepMetres: 0 });
    window.kirScene.titleT = 0; // the shot's start, whatever the sweep has done since load
    const el = document.querySelector('.kirtitle');
    el.querySelector('.menu')?.remove(); el.querySelector('.ver')?.remove();
    el.style.justifyContent = 'center'; el.style.background = 'linear-gradient(rgba(12,9,7,.50), rgba(12,9,7,.18) 50%, rgba(12,9,7,.62))';
    const logo = el.querySelector('.logo'); logo.style.gap = '4px';
    const [a, b] = logo.querySelectorAll('canvas');
    fitPixelText(a, 640); fitPixelText(b, 800);                       // "KEEP IT" / "RUNNING": 1 render px = a whole number of screen px
    const sub = logo.querySelector('.sub'); sub.replaceWith(Object.assign(fitPixelText(pixelText(line, { size: 12, colour: '#fbe9b8', shade: '#a3401c' }), 700), {}));
    logo.lastElementChild.style.marginTop = '22px';
  }, { line: LINE, shot: SHOT });
  await page.waitForTimeout(2500); // a few frames of the scene behind
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'png' });
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
} finally {
  await browser.close(); await server.close();
}
const kb = statSync(out).size / 1024;
console.log(`public/og-image.png  ${W}×${H}  ${kb.toFixed(0)} KB`);
if (kb > 1000) { console.error('over 1 MB'); process.exit(1); }
