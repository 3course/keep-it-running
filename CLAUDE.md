# Keep It Running — notes for Claude Code

Browser game, Phaser 3 + TypeScript + Vite. See README.md for the loop.

Rules of the codebase:
- `src/sim/` must never import Phaser. It's the whole game and it runs headless (`npm run sim`).
- Every balance number goes in `src/config.ts`. No magic numbers in `Game.ts` or scenes.
- New faults go in `src/data/faults.ts` only: symptom, diagnoses (exactly one `correct: true`), 2+ paths, each path 1–5 steps with minutes and cost. Cheap/slow DIY path first.
- `world` branch: the game is `WorldScene` (portrait 390×844, walkable tilemap). It drives `Game` through public methods only — never change `src/sim` or `config.ts` for presentation. World-only state (position, what's carried, the bed, pallets) lives in `src/world/state.ts`; actions per object in `src/world/interactables.ts`; presentation numbers (speed, zoom, ranges) in `src/world/worldConfig.ts`. HUD is DOM (`src/ui/hud.ts`). `FactoryScene` is the old panel UI, kept for reference and not loaded.
- `src/world/save.ts` serialises every field of `Game`. A new field that isn't plain JSON (a Set, a class, a reference into another array) needs handling there too.
- After any change to config or faults: `npm run sim` and check competent stays roughly 10–20% margin and sloppy goes negative.
- Commit after each system or balance pass.
