# Keep It Running — notes for Claude Code

Browser game, Phaser 3 + TypeScript + Vite. See README.md for the loop.

Rules of the codebase:
- `src/sim/` must never import Phaser. It's the whole game and it runs headless (`npm run sim`).
- Every balance number goes in `src/config.ts`. No magic numbers in `Game.ts` or scenes.
- New faults go in `src/data/faults.ts` only: symptom, diagnoses (exactly one `correct: true`), 2+ paths, each path 1–5 steps with minutes and cost. Cheap/slow DIY path first.
- `world` branch: the game is a Three.js world (`src/world3d/`), portrait 390×844, rendered at 1/3 resolution and upscaled nearest-neighbour. It drives `Game` through public methods only — never change `src/sim` or `config.ts` for presentation. The shed layout (0.5 m cells, objects with real heights) is data in `src/world/layout.ts`; world-only state (position in metres, what's carried, the bed, pallets) in `src/world/state.ts`; actions per object in `src/world/interactables.ts`; presentation numbers (speed, camera, ranges) in `src/world/worldConfig.ts`. All UI is DOM over the canvas (`src/ui/`). The Phaser versions are in history (`003eb00`).
- `src/world/save.ts` serialises every field of `Game`. A new field that isn't plain JSON (a Set, a class, a reference into another array) needs handling there too.
- After any change to config or faults: `npm run sim` and check competent stays roughly 10–20% margin and sloppy goes negative.
- Browser tests: `npm test` (Playwright, headless Chromium as a touch phone; first time on a machine: `npx playwright install chromium`). `tests/interactables.test.mjs` taps every object's action — a new `case` in `actionsFor` needs a test case there; `tests/touch.test.mjs` taps a visiting mate's labels (before/after 2pm, caps, wave-off and return); `tests/difficulty.test.mjs`, `tests/visitors.test.mjs` and `tests/upgrades.test.mjs` check the breakdown ramp, the lesson fire, the visitor rules and each upgrade on `Game` (no browser). Browser tests start the game with `?seed=1`, so runs are repeatable. Run them after changing interactables, labels, the HUD, faults, fires or visitors.
- Commit after each system or balance pass.
