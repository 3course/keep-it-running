// The production build with its service worker, as players get it: built once into a temp folder and served from
// 127.0.0.1 (a secure context, so the worker really registers; the dev server the other tests use has none).
//   - /, ?safe=1 and ?safe=2 load with no console errors, no page errors and no CSP violations, under the worker,
//     whose cache is named for this build's commit;
//   - the kill switch (public/sw-kill.js): deploying sw-kill.txt clears every cache and unregisters the worker, without
//     a reload loop, and taking it away again brings the worker back. The page itself never asks for sw-kill.txt (a 404 there would be a
//     console error on every load).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.json': 'application/json' };

let dir, server, origin, browser;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kir-sw-'));
  await build({ logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
  // a plain static host like GitHub Pages: files as they are on disk right now, 404.html for anything missing
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dir, path);
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { file = null; }
    const headers = { 'Cache-Control': 'no-cache' };
    if (!file) { res.writeHead(404, { ...headers, 'Content-Type': 'text/html' }); res.end(readFileSync(join(dir, '404.html'))); return; }
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** A page that records console errors, page errors, CSP violations and every URL the page itself requests. */
async function open(context) {
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const page = await context.newPage();
  const problems = [], requested = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', r => requested.push(new URL(r.url()).pathname));
  return { page, problems, requested };
}

const swState = page => page.evaluate(async () => ({
  regs: (await navigator.serviceWorker.getRegistrations()).length,
  caches: await caches.keys(),
  commit: document.querySelector('meta[name=build-commit]')?.content,
}));

describe('the production build and its service worker', () => {
  for (const q of ['', '?safe=1', '?safe=2']) {
    it(`/${q} loads clean under the worker, with the cache named for this commit`, async () => {
      const context = await browser.newContext();
      const { page, problems, requested } = await open(context);
      try {
        await page.goto(`${origin}/${q}`);
        await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30_000 });
        await page.reload(); // a second load, now served by the worker
        await page.waitForFunction(() => window.kir, null, { timeout: 30_000 });
        await page.waitForTimeout(2000);
        const s = await swState(page);
        assert.equal(s.regs, 1);
        assert.deepEqual(s.caches, [`kir-${s.commit}-precache-v2-${origin}/`]);
        assert.deepEqual(await page.evaluate(() => window.__csp), [], 'no CSP violations');
        assert.deepEqual(problems, [], 'no console or page errors');
        assert.ok(!requested.some(p => p.endsWith('/sw-kill.txt')), 'the page never asks for sw-kill.txt');
      } finally { await context.close(); }
    });
  }

  it('the end-of-day screens load when they show, not at boot (and the worker still caches them for offline)', async () => {
    const assets = readdirSync(join(dir, 'assets')), html = readFileSync(join(dir, 'index.html'), 'utf8');
    const lazy = ['summary', 'weekend', 'dailyCard'];
    for (const name of lazy) {
      assert.ok(assets.some(f => f.startsWith(`${name}-`) && f.endsWith('.js')), `a ${name} chunk of its own`);
      assert.ok(!new RegExp(`assets/${name}-[\\w-]+\\.js`).test(html), `${name} isn't preloaded by index.html`);
    }
    const context = await browser.newContext();
    const { page, problems, requested } = await open(context);
    try {
      await page.goto(`${origin}/?seed=3&intro=0&title=0`);
      await page.waitForFunction(() => window.kirScene?.started, null, { timeout: 30_000 });
      const boot = [...requested];
      assert.ok(!boot.some(p => /\/assets\/summary-/.test(p)), 'no summary chunk at boot');
      await page.evaluate(() => { window.kirScene.w.tour = null; window.kir.phase = 'daySummary'; });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#kir-hud .summary')).display !== 'none', null, { timeout: 30_000 }); // (block on a phone, a grid in landscape)
      assert.ok(requested.some(p => /\/assets\/summary-/.test(p)), 'fetched when the day summary shows');
      // the worker's precache has them too, so the end of the day works offline
      await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30_000 });
      const cached = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
      for (const name of lazy) assert.ok(cached.some(p => p.startsWith(`/assets/${name}-`)), `${name} is in the precache`);
      assert.deepEqual(problems, [], 'no console or page errors');
    } finally { await context.close(); }
  });

  it('kill switch: sw-kill.txt clears the caches and unregisters; removing it brings the worker back', async () => {
    const kill = join(dir, 'sw-kill.txt');
    const context = await browser.newContext();
    const { page } = await open(context);
    try {
      await page.goto(`${origin}/`);
      await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30_000 });
      let s = await swState(page);
      assert.equal(s.regs, 1); assert.equal(s.caches.length, 1);

      writeFileSync(kill, 'kill\n');
      // stop the running worker so the next navigation meets a fresh one (no once-a-minute throttle in the way)
      const cdp = await context.newCDPSession(page);
      await cdp.send('ServiceWorker.enable');
      await cdp.send('ServiceWorker.stopAllWorkers');
      await page.reload();
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && (await caches.keys()).length === 0, null, { timeout: 30_000, polling: 250 });
      await page.waitForLoadState('load');
      // and it stays that way: no reload loop (each reload would register the worker again and kill it again)
      let loads = 0; const count = () => loads++;
      page.on('load', count);
      await page.waitForTimeout(6000);
      page.off('load', count);
      assert.equal(loads, 0, 'no reload loop while sw-kill.txt is deployed');
      // the reloaded page registers the worker again, and it removes itself when it activates (sw-kill.js): under a
      // loaded run that install can still be going after the wait above, so wait for it to settle, not a fixed time
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && (await caches.keys()).length === 0, null, { timeout: 30_000, polling: 250 })
        .catch(() => {});
      s = await swState(page);
      assert.deepEqual([s.regs, s.caches], [0, []], 'killed: no worker, no caches');

      rmSync(kill);
      await page.reload();
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 1 && (await caches.keys()).length === 1, null, { timeout: 30_000, polling: 250 });
      s = await swState(page);
      assert.equal(s.regs, 1, 'the worker is back'); assert.equal(s.caches.length, 1, 'and its cache');
    } finally {
      rmSync(kill, { force: true });
      await context.close();
    }
  });
});
