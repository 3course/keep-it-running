# Keep It Running — notes for Claude Code

Browser game, Phaser 3 + TypeScript + Vite. See README.md for the loop.

Rules of the codebase:
- `src/sim/` must never import Phaser. It's the whole game and it runs headless (`npm run sim`).
- Every balance number goes in `src/config.ts`. No magic numbers in `Game.ts` or scenes.
- New faults go in `src/data/faults.ts` only: symptom, diagnoses (exactly one `correct: true`), 2+ paths, each path 1–5 steps with minutes and cost. Cheap/slow DIY path first.
- `FactoryScene` rebuilds its dynamic objects every game minute via `render()`. Add UI through `this.keep(...)` so it gets cleaned up.
- After any change to config or faults: `npm run sim` and check competent stays roughly 10–20% margin and sloppy goes negative.
- Commit after each system or balance pass.
