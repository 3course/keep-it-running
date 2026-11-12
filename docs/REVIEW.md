# Keep It Running — review pass (`world` / 3D build)

Severity tags: **bug** (wrong game state or data), **risk** (likely breakage under play), **cleanup** (dead code, types, perf), **not fixed** (known, deferred).

## Fixed in this branch

| Severity | Location | Issue | Fix |
|----------|----------|-------|-----|
| bug | `Game.ts` `startDay` | `coffeeUntil` carried overnight and still sped the player up at 7am | Reset `coffeeUntil` each morning |
| bug | `Game.ts` `tickCallbacks` | Voicemail expiry used `>=`, so "ring back by 11:30" died at 11:30 | Use `>` so the stated minute still counts (`dayflow.test.mjs`) |
| bug | `Game.ts` `resetPower` / replacing | Machine could resume a cut mid walk-round or leave bed state wrong after power events | `settleMachine()` on reset; don't resume cut when escorting (`fixes.test.mjs`, `machine-state.test.mjs`) |
| bug | `Game.ts` `endDay` | Overdraft fee charged before walk-ins settled | Reorder so walk-in revenue lands first (`walkins.test.mjs`) |
| bug | `save.ts` `repair` | Some enum fields accepted junk and could strand state | Stricter whitelists for phase, layouts, people refs (`save.test.mjs`) |
| risk | `app.ts` order card | Missing job type lookup could throw on stale saves | Fallback to first configured type |
| risk | `tracing.ts` | Unused import broke lint / hinted dead wiring | Remove import |
| cleanup | `Game.ts` / `summary.ts` | `as unknown as Record` double-casts on `DayStats` | Typed index writes |
| cleanup | `hud.ts`, `state.ts`, `pathfind.ts` | Dead fields and helpers (`sheetsSeen`, `offcutBin`, etc.) | Removed |
| perf | `app.ts`, `pixelSnap.ts` | Pathfind and snap registry costs grew over a lease | Coordinate cache; prune snap registry (`memory.test.mjs`) |
| perf | `app.ts` | Per-frame `getBoundingClientRect` on the notepad | Cache `coverLeft` when the pad layout runs |
| cleanup | — | Real Melbourne bar/cafe names in fiction | Invented venues (`config.ts`, dialogue) |
| cleanup | — | No lint in CI | ESLint flat config, TS 6.0.3, `npm run lint`, `.github/workflows/ci.yml` |
| feature | `Game.ts` / `todo.ts` / `kerr.ts` | Dead time after the last order call when the board is clear | **Knock off early** (notepad + roller door; `knockoff-early.test.mjs`) |
| feature | `vite.config.ts` / `app.ts` | 1.34 MB single JS bundle | Split `three`, `dialogue`, lazy-load day/week/daily summary modules |

## Not fixed (documented)

| Severity | Location | Why left |
|----------|----------|----------|
| not fixed | Android WebGL | GPU tier failures on some devices; unchanged this pass |
| not fixed | `headless.ts` overtime | Scripts still use overtime for balance bands; player UI does not (by design since knock-off beers) |
| risk | `honked` Map / `pickupNames` in `app.ts` | Grow over a long lease; low impact, needs product decision on caps |
| risk | `actionLog` in `app.ts` | Unbounded string log in a 20-day session |
| cleanup | `layoutEditor` / `cafe` | Still statically imported in `app.ts`; further lazy init would shrink first parse more |

## Balance (after fixes)

`npm run sim -- --lease 200` rent-made rates:

- competent **84%** (target 80–90%)
- average **70%** (target 65–75%)
- sloppy **10%** (target 5–15%)

## Build size (after)

| Asset | Size (min) |
|-------|------------|
| Before | one chunk **1,345 KB** |
| `index-*.js` (app shell) | **418 KB** |
| `three-*.js` | **585 KB** |
| `dialogue-*.js` | **154 KB** |
| `endings-*.js` (lazy at summary) | **193 KB** |

PWA precache total ~1,345 KiB (same bytes, better caching and parallel load).

## Playtest checklist

- [ ] First-day tour, ply truck sign, first cut
- [ ] Knock off early after last call with an empty board (notepad line + roller door)
- [ ] Knock-off beers / reckoning on day 20
- [ ] Save mid-day and resume (phone callbacks, partial swap)
- [ ] Layout editor "Move anything round?"
- [ ] Service worker update after deploy (commit-tagged precache)
