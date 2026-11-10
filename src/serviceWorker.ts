/// <reference types="vite/client" />
// The page's side of the service worker (vite-plugin-pwa registers it; see vite.config.ts).
//
// Updates: ask the browser to look for a new sw.js on every load and whenever the app comes back to the foreground (an
// installed app on a phone can sit open for days without a navigation, which is the only other time browsers look).
// A new worker takes over straight away and drops the old build's cache; the running game isn't reloaded under the
// player, it picks the new build up on the next launch.
//
// Kill switch: the page's half (public/sw-kill.js has the worker's) (public/sw-kill.js has the worker's): if <base>sw-kill.txt is
// deployed, unregister every service worker this page can see and clear the caches, then reload once from the network.
// Runs after load, off the critical path; offline or missing file (a 404) means nothing happens.
import { getItem, KEYS, setItem } from './storage.js';

export function checkSwKill(base: string = import.meta.env.BASE_URL) {
  if (!('serviceWorker' in navigator)) return;
  const run = async () => {
    try {
      const res = await fetch(`${base}sw-kill.txt`, { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      if ('caches' in window) await Promise.all((await caches.keys()).map(n => caches.delete(n)));
      // reload once so this tab isn't left running on cached files (sessionStorage stops a reload loop)
      const again = getItem(KEYS.swKilled, 'session') === '1';
      if (!setItem(KEYS.swKilled, '1', 'session')) return; // (storage blocked: no reload, so no loop)
      if (regs.length && !again) location.reload();
    } catch { /* offline, or storage blocked: try again next load */ }
  };
  if (document.readyState === 'complete') void run(); else addEventListener('load', () => void run(), { once: true });
}

const UPDATE_EVERY_MS = 60_000; // at most this often, coming back to the foreground

export function checkSwUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let last = 0;
  const update = () => {
    if (Date.now() - last < UPDATE_EVERY_MS) return;
    last = Date.now();
    navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => { /* offline: next time */ });
  };
  addEventListener('load', update, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') update(); });
}
