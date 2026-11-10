// The page's side of the service worker (vite-plugin-pwa registers it; see vite.config.ts).
//
// Updates: ask the browser to look for a new sw.js on every load and whenever the app comes back to the foreground (an
// installed app on a phone can sit open for days without a navigation, which is the only other time browsers look).
// A new worker takes over straight away and drops the old build's cache; the running game isn't reloaded under the
// player, it picks the new build up on the next launch.
//
// The kill switch lives entirely in the worker (public/sw-kill.js). The page doesn't probe for sw-kill.txt itself: the
// file is normally missing, and a page-side 404 shows up as a console error on every load.

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
