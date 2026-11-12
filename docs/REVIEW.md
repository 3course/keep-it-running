# Keep It Running — review pass (`world` / 3D build)

PR #15 (Cursor) plus the follow-ups in #17 (Claude), reviewed against `world` at `7b6ed4b`. Severity: **bug** (wrong
game state or money), **risk** (likely to break in play or in the build), **cleanup** (dead code, types, perf),
**feature** (asked for). Line numbers are for this branch. "Test" names the test that fails without the fix.

## Fixed

| Severity | Location | Issue | Fix | Test |
|---|---|---|---|---|
| bug | `src/sim/Game.ts:437` | `coffeeUntil` (a minute of the day) carried overnight: yesterday's large coffee still sped you up before 11 | Reset each morning in `startDay` | `dayflow.test.mjs` |
| bug | `src/sim/Game.ts:1172` | "Ring back by 11:30" voicemails died at 11:30 (`>=`) | `>`: the stated minute still counts | `dayflow.test.mjs` |
| bug | `src/sim/Game.ts:332` | Resetting the breaker went straight back to cutting, mid walk-round or mid swap | `settleMachine()` | `machine-state.test.mjs` |
| bug | `src/sim/Game.ts:623` | A swap finishing went back to cutting mid walk-round | `settleMachine()` | `machine-state.test.mjs` |
| bug | `src/sim/Game.ts:2382` | The overdraft fee was charged before walk-ins and Dennis's router day landed, so a day that ended in the black still paid it | Charged after everyone squares up | `walkins.test.mjs` |
| bug | `src/world/save.ts:118` | A saved fault was repaired against `{}`, so junk (a string `busyRemaining`, a made-up phase) loaded and could wedge the machine on 'fault' | Repaired against a template; phase whitelisted; numbers clamped | `save.test.mjs` |
| bug | `src/world/save.ts:133` | A swap with a junk key wrote garbage into `wear` | Dropped | `save.test.mjs` |
| bug | `src/world/save.ts:146` | View-set flags (`signing`, `spraying`, `fireHold`, `extinguisherAway`) loaded frozen | Reset on load | `save.test.mjs` |
| bug | `src/world/save.ts:238` | The lease wasn't validated: junk `rentDue` / `startDayIndex` stopped rent ever falling due | Repaired against a fresh lease; numbers clamped; ending and fortunes whitelisted | `save.test.mjs` |
| bug | `src/sim/Game.ts:2105` | Knock off early was offered with a ute still due later today: its pay landed tomorrow, so on day 20 it missed the reckoning (#17) | Waits for any pickup due before close | `knockoff-early.test.mjs` |
| risk | `src/world3d/app.ts:320` | The call card threw on an offer whose job type isn't in the config (a stale save) | Falls back to the first type | — |
| risk | `src/ui/callCard.ts:45` | `pointercancel` went through the call card to the shed | Stopped like the other pointer events | — |
| risk | `src/world3d/peopleDay.ts:503` | Dialogue beats on `setTimeout` fired into a destroyed `Talk` after a rebuild | Tracked and cleared (`:506`) | — |
| risk | `src/world3d/app.ts:145` | The spray could be held on the label and the exhaust at once; one lift leaked the other's flag | A finger id per hold | `multitouch.test.mjs` |
| risk | `src/ui/gesture.ts:161`, `:213` | A second finger restarted or emptied a hold ring, or warped a drag | Keyed to one pointer | — (no test) |
| risk | `src/world3d/app.ts:562` | Keys held when the window lost focus stayed held (the keyup never comes) | Cleared on `blur` | `multitouch.test.mjs` |
| risk | `src/world3d/app.ts:555` | Space behind the title paused/unpaused the (stopped) clock | Ignored behind the title | `title.test.mjs` |
| cleanup | `src/world3d/pixelSnap.ts:16`, `app.ts:917` | The pixel-snap registry kept every old scene graph alive after a rebuild | `pruneSnapped` on rebuild; the cafe's sparrows unsnapped (`cafe.ts:543`) | `memory.test.mjs` |
| cleanup | `src/world3d/app.ts:977` | Pickup names kept for utes long gone | Pruned with `Game.pickups` | — |
| cleanup | `src/world3d/app.ts:990` | `honked` grew a key per ute all lease | Capped at 40 | — |
| cleanup | `src/world3d/app.ts:1652` | `actionLog` grew all session | Capped at 400 | — |
| cleanup | `src/world3d/reveal.ts:210`, `ring.ts:68` | The keepsake thumbnail cache and the ring's cue list grew all run | Capped (40, 60) | — |
| cleanup | `src/world3d/app.ts:2142` | The fire pointer pathfound per hook every frame of a fire | Cached on (your cell, where the extinguishers are) | — |
| cleanup | `src/world3d/gratitude.ts:63` | A full stringify of gifts and keepsakes every frame | A cheap count signature gates it | — |
| cleanup | `src/ui/hud.ts:229` | `coverLeft` read `getBoundingClientRect` every frame | Cached when the pad is laid out (`:230`) | — |
| cleanup | `src/world3d/figures.ts:305`, `app.ts:159` | A `Vector3` allocated per figure / per camera update per frame | Written into scratch vectors | — |
| cleanup | `src/world3d/tracing.ts:203`, `:342` | The trace's ink material leaked per frame while drawing; a rebuild left a live trace's meshes | Disposed; `dispose()` on rebuild | — |
| cleanup | `src/sim/Game.ts:392`, `src/ui/summary.ts:203` | `as unknown as Record` double-casts on `DayStats` | Typed index writes | — |
| cleanup | `src/world/state.ts:36` (removed), `src/ui/hud.ts:242`, `src/world/pathfind.ts:71` | Dead fields and helpers: `WorldState.offcutBin` and `sheetsSeen` (the bin is `Game`'s now), the 5pm overtime modal (`showEndOfDay`, never called on `world`), `pathLength` | Removed | — |
| cleanup | `src/config.ts:241`, `:300`, `src/people/dialogue/topics.ts:677` | Real Melbourne bars and a real cafe in the fiction; "Bunnings" in a line | Invented venues ("The Offcut", "Early Mark"…); "the big hardware barn". ("Instagram" in `src/people/friends.ts:64` is left as is: a global brand, by decision) | `cafe.test.mjs`, `intro.test.mjs` |
| feature | `src/sim/Game.ts:2088`, `:2096`, `:2119`; `src/world/todo.ts:149`, `src/world/kerr.ts:47`, `src/world/interactables.ts:234`, `src/world3d/app.ts:294` | Dead time after the day's last order call with a clear board | **Knock off early**: offered (notepad, Kerr, roller door) once today's calls are done, the board's clear and the machine's sat idle (from 2pm). A **time-skip, not a saving** (#17): the clock jumps to 5 and labour is charged to 5 exactly as the ticks would have (`Game.ts:2124`). What the afternoon would have brought (a 3pm walk-in, a late inspection) doesn't come | `knockoff-early.test.mjs` |
| feature | `vite.config.ts:18`; `src/world3d/app.ts:945`, `:947`, `:955` | One 1,344 kB JS bundle | `three` and `dialogue` split out (parallel download, cached across deploys that don't touch them); the day summary, weekend and daily card load when they first show (#17: on #15 they were in a preloaded chunk and loaded at boot). The deferred saving is **about 16 kB**; the first visit still downloads about 1,333 kB | `sw.test.mjs` |
| risk | `.github/workflows/ci.yml:7` | No CI on PRs | Typecheck + the full test suite on every PR into `world`; pinned SHAs, read-only token. `deploy.yml` is unchanged and identical on `main` and `world` (#17 reverted a lint step #15 had added to world's only) | — |
| cleanup | `tests/browser.mjs:18` | Real-time waits flaky on slower CI runners | `waitTimeout()`: 2.5× on CI for real-time Playwright timeouts only, never frame budgets (#17) | — |

## Not fixed

| Severity | Location | Issue | Why it's left |
|---|---|---|---|
| risk | `src/world/save.ts:228` (`worldFromJson`) | Saves don't validate `w.layout` (the floor plan) or people references (`w.people`: friend ids, design ids, gifts) beyond JSON kinds. A tampered plan or id can reach the view | Needs a whitelist per field against `layoutPlan` / `people` data; its own change with tamper tests |
| cleanup | ESLint / `npm run lint` | No lint | typescript-eslint (8.72, peers `typescript <6.1`) refuses TypeScript 7 even without type-aware rules, and TS 7's npm package has no JS parser API for it. The repo stays on TS 7 (one TypeScript version); lint is deferred until typescript-eslint supports TS 7 |
| cleanup | `src/sim/Game.ts:595` with `:207` | `tick()` rates a minute by the clock after it moves on, so the minute landing on 5:00 is charged at the overtime rate ($0.75 extra a day) | Fixing it moves every day's numbers (a sim shift); knock off early mirrors it so both ways cost the same |
| risk | `src/sim/headless.ts:456` | The sim's bots still work overtime; the shed no longer offers it (at 5 a mate's at the roller door) | The lease bands were measured with these scripts; changing them means re-measuring the bands |
| cleanup | `src/world/kerr.ts:49` | Kerr flags fires with the bag over `CONFIG.kerr.fullBagAbove` (80%) but advises changing it at `CONFIG.fire.bagFullAbove` (75%) | Two config numbers; which is right is a design call |
| cleanup | `src/world3d/app.ts:49`, `:51` | The layout editor and the cafe are statically imported | Lazy-loading them would trim the first parse a little more |
| cleanup | `vite.config.ts:18` | The `three` chunk (585 kB) still trips Vite's 500 kB warning | Three.js itself; tree-shaking it further is a separate job |
| risk | Android WebGL | GPU tier failures on some devices | Out of scope for this pass |

## Balance

`npm run sim -- --lease 200`, rent made (target bands in CLAUDE.md):

| | `world` | this branch |
|---|---|---|
| competent (80–90%) | 84% | 84% |
| average (65–75%) | 70% | 70% |
| sloppy (5–15%) | 10% | 10% |

The spare moves about +$20 a lease (the overdraft fee now waits for walk-ins to settle). The bots never knock off early, so
it doesn't touch these numbers; it's labour-neutral by design.

## Build size

| | `world` | this branch |
|---|---|---|
| JS at first visit | 1,343.8 kB (one chunk) | ~1,333 kB (`index` 593 + `three` 585 + `dialogue` 154) |
| Loaded later | — | ~16 kB (`summary` 12.8, `weekend` 1.8, `dailyCard` 1.4) |
| Precache | one per-commit cache (`kir-<commit>`) | the same, with every chunk |

## Playtest checklist

- [ ] First-day tour, ply truck sign, first cut
- [ ] Knock off early after the last call with an empty board (notepad, Kerr, roller door): does the jump to 5 read clearly?
- [ ] Knock-off night and the day-20 reckoning after knocking off early
- [ ] Save mid-day and resume (callbacks, a part swap, a fault)
- [ ] Layout editor ("Move anything round?")
- [ ] First visit on a phone over 4G (three parallel chunks) and an update after a deploy
