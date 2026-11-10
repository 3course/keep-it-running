// Service worker kill switch, loaded into the generated sw.js (vite.config.ts: workbox.importScripts).
//
// To pull the service worker off every phone that has it: deploy a file at <base>sw-kill.txt (any content, served 200).
// The worker looks for it (no timer):
//   - when it activates (a new deploy's worker taking over), and
//   - on navigation requests (page loads and reloads anywhere in its scope, /panel/ included), at most once a minute
//     for as long as this worker instance runs (browsers stop idle workers after ~30 s, which resets that).
// When it's there, the worker deletes all of this origin's caches and unregisters itself. A worker that was serving a
// page when it found the file (the navigation check) also reloads its open tabs once, so they come straight from the
// network. A worker that finds it on activating does not reload anything: the page that registered it is already
// running from the network, and reloading would register it again, find the file again, and loop. So while the file
// is deployed, each visit installs the worker and it removes itself straight away.
// Delete sw-kill.txt and the next visit installs the worker for good.
// Only the worker probes: its fetches don't reach the page's console, so a missing file (the normal case) is silent.
(() => {
  const KILL_URL = new URL('sw-kill.txt', self.registration.scope).href;
  let lastCheck = 0;
  let killed = false; // this worker instance has already removed itself

  async function present() {
    try {
      const res = await fetch(KILL_URL, { cache: 'no-store', credentials: 'omit' });
      return res.ok;
    } catch { return false; } // offline: keep working
  }

  async function kill(reloadTabs) {
    killed = true;
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
    await self.registration.unregister();
    if (!reloadTabs) return;
    const tabs = await self.clients.matchAll({ type: 'window' });
    for (const tab of tabs) tab.navigate(tab.url).catch(() => {});
  }

  self.addEventListener('activate', event => {
    lastCheck = Date.now();
    event.waitUntil(present().then(p => (p ? kill(false) : undefined)));
  });
  // no respondWith: workbox still answers the request; this only looks for the kill file alongside it
  self.addEventListener('fetch', event => {
    if (killed || event.request.mode !== 'navigate' || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    event.waitUntil(present().then(p => (p && !killed ? kill(true) : undefined)));
  });
})();
