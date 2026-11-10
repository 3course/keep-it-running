// Everything the game keeps in the browser goes through here, under one "kir:" namespace (the site shares its origin
// with the /panel/ build, and anything else ever served from keepitrunning.fyi). Reads and writes never throw: blocked
// or full storage means the defaults, and the game plays on.
//
// Keys used to be "kir-<name>"; the first load after the rename moves each one across (once), so nobody loses a save.

export const PREFIX = 'kir:';

/** Every key the game stores, by name (the stored key is PREFIX + name). */
export const KEYS = {
  save: 'save-v2',          // the whole game (src/world/save.ts)
  daystart: 'daystart',     // this morning's save, for Restart day (src/world3d/app.ts)
  settings: 'settings',     // src/settings.ts
  hints: 'hints-v1',        // src/ui/hints.ts
  daily: 'daily',           // the daily's streak and results (src/world/daily.ts)
  leases: 'leases',         // past leases on the office wall (src/world/lease.ts)
  leaseNext: 'lease-next',  // the next lease's number
  muted: 'muted',           // src/world3d/ring.ts, sfx.ts
  introSeen: 'intro-seen',  // src/world3d/cafe.ts, app.ts
  padPinned: 'pad-pinned',  // src/ui/hud.ts
  boot: 'boot',             // sessionStorage: what the title should do after a reload (src/main.ts)
  swKilled: 'sw-killed',    // sessionStorage: the kill switch has reloaded this tab once (src/serviceWorker.ts)
} as const;
export type KeyName = (typeof KEYS)[keyof typeof KEYS];

/** No saved value is ever bigger than this (localStorage holds ~5 MB an origin; a save is tens of KB). */
const MAX_LEN = 2_000_000;

type Area = 'local' | 'session';
function area(a: Area): Storage | null {
  try { return a === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function getItem(name: KeyName, a: Area = 'local'): string | null {
  try {
    const v = area(a)?.getItem(PREFIX + name) ?? null;
    return v !== null && v.length > MAX_LEN ? null : v;
  } catch { return null; }
}

/** Returns whether it was stored. */
export function setItem(name: KeyName, value: string, a: Area = 'local'): boolean {
  try { area(a)?.setItem(PREFIX + name, value); return !!area(a); } catch { return false; }
}

export function removeItem(name: KeyName, a: Area = 'local') {
  try { area(a)?.removeItem(PREFIX + name); } catch { /* blocked */ }
}

/** JSON.parse that never throws (null for missing, unreadable or the wrong kind of thing per `ok`). */
export function getJson<T>(name: KeyName, ok: (v: unknown) => v is T, a: Area = 'local'): T | null {
  const raw = getItem(name, a);
  if (raw === null) return null;
  try { const v: unknown = JSON.parse(raw); return ok(v) ? v : null; } catch { return null; }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The old un-namespaced keys move to "kir:" (once; a value already under the new key wins). */
function migrate() {
  for (const a of ['local', 'session'] as const) {
    const s = area(a);
    if (!s) continue;
    for (const name of Object.values(KEYS)) {
      try {
        const old = s.getItem(`kir-${name}`);
        if (old === null) continue;
        if (s.getItem(PREFIX + name) === null) s.setItem(PREFIX + name, old);
        s.removeItem(`kir-${name}`);
      } catch { /* blocked or full: the old key stays, try again next load */ }
    }
  }
}
migrate();
