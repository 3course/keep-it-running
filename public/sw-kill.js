// Service worker kill switch, loaded into the generated sw.js (vite.config.ts: workbox.importScripts).
//
// To pull the service worker off every phone that has it: deploy a file at <base>sw-kill.txt (any content, served 200).
// Every worker that sees it — on activating, or on a page load at most once a minute — deletes all of this origin's
// caches, unregisters itself and reloads its open tabs, which then come straight from the network. The page checks too
// (src/serviceWorker.ts), so a tab whose worker is too old to have this file still gets cleaned up once the new page loads.
// Delete sw-kill.txt to let the worker come back on the next visit.
(() => {
  const KILL_URL = new URL('sw-kill.txt', self.registration.scope).href;
  let lastCheck = 0;

  async function killed() {
    try {
      const res = await fetch(KILL_URL, { cache: 'no-store', credentials: 'omit' });
      return res.ok;
    } catch { return false; } // offline: keep working
  }

  async function kill() {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    for (const tab of tabs) tab.navigate(tab.url).catch(() => {});
  }

  const check = () => killed().then(k => (k ? kill() : undefined));

  self.addEventListener('activate', event => { lastCheck = Date.now(); event.waitUntil(check()); });
  // no respondWith: workbox still answers the request; this only looks for the kill file alongside it
  self.addEventListener('fetch', event => {
    if (event.request.mode !== 'navigate' || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    event.waitUntil(check());
  });
})();
