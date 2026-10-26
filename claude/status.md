# Keep It Running — status (25 Oct 2026)

## Links
- **The game** (3D, mobile): https://keepitrunning.fyi/. Weak GPUs: `?safe=1` (low tier), `?safe=2` (no shadows). `?seed=N` starts a new game on a fixed seed. The old `/preview/` address redirects here.
- **Original panel prototype:** https://keepitrunning.fyi/panel/
- **Repo:** https://github.com/3course/keep-it-running. `world` (the 3D build) deploys to the site root, `main` (the panel) to `/panel/`; one workflow builds both on a push to either.

## What's built
- **Economy** (`src/sim`, `config.ts`): orders by phone through the day; three job types (formwork / MDF / acrylic); deadlines, late pay, pulled jobs. Ply is real stock, delivered by truck. Beer is a can you carry. The day summary itemises the P&L.
- **World:** Three.js, low-res pixel render, portrait, tap-to-walk + stick. Day-1 tour, hint cards, off-screen pointers, panned phone ring. PWA, pause-and-resume save, GPU tiering and failure card.
- **Today:**
  - **Browser tests:** `npm test`, 82 tests. Playwright as a touch phone; game-logic tests without a browser.
  - **Breakdown grace and ramp:** no breakdowns on days 1–3, ramping to a **0.8 plateau** from day 8 (`difficulty.breakdownByDay`). Day 2 has a scripted, slow, glowing **lesson fire**.
  - **Visitors:** Eggby, Courtney and Tim Baker stay 30 minutes, wander, and come back with an ask, shop talk or a night-out story. Seeded per day; beer caps (2 a mate, 4 a day); step out of doorways and your way.
  - **Phone:** moved to the office back wall beside the computer, a straight run in from the door.
  - **Upgrades:** premium bits, bag rack, bigger offcut bin, extinguisher by the exhaust, and a $1,500 **fault sensor** (pauses the cut on spindle/bag/collet faults so the sheet waits for you).
  - **Board's-full warning:** a notepad line when more's due than you can cut by 5pm, and "Turn it down" glows. Day-summary lines for money lost to late pay and pulled jobs.

## Sim (`npm run sim`)
- `npm run sim`: 5 seeds, no upgrades; week 1, week 2 and a steady-state week (days 8–12 at 0.8).
- `npm run sim -- week1` / `-- week2`: the detailed per-seed lines for that week instead.
- `npm run sim -- upgrades [seeds]`: each upgrade alone (margin, scrap, payback, ± SE), and each script's buying policy over 4 continuous weeks, with solvency. Default 20 seeds; use 100 for decisions.
- Scripts: **competent**, **average** (late on a third of faults, heeds the warning 2 times in 3), **sloppy**.

**Current numbers** (100 seeds, `sim-solvency.md` §5; continuous weeks 3–4, buying nothing / with its buying policy):

| Script | Solvent through week 4 | Margin, weeks 3–4 | Scrap, weeks 3–4 | Fresh steady week |
|---|---|---|---|---|
| Competent | 100 / 98 | 14.2% / 21.7% | 7.6% / 6.7% | 14.5% |
| Average | 99 / 97 | 7.0% / 8.1% | 17.5% / 16.9% | 8.2% |
| Sloppy | 0 / 0 | loses ~$2,400–2,600 a week | 23.7% / 9.6% | no profit after overheads on any seed |

Week 1 (grace): ~21–25% for all three, so sloppy is profitable that week only.

## Docs in `claude/`
- `baseline-sim.md`: sim before the grace period (competent 10.8%, sloppy −29%).
- `sim-after-grace.md`: grace days, ramp, lesson fire, average script; week 1 / week 2 / steady state.
- `sim-visitors.md`: visitors' margin and beer effects; 20-seed check against reseeding noise.
- `office-manager-and-upgrades.md`: design for Dazza, upgrades and price curve, sim plan.
- `sim-upgrades.md`: each upgrade's margin gain and payback; buying policies; pass/fail.
- `sim-solvency.md`: why average went broke (it never turned work down), candidate fixes, the warning, the 0.8 plateau.

## Open questions
- **Competent with every upgrade owned is ~21.7%,** over the 20% line. Left deliberately; the knobs are nesting's effect or a 0.85 plateau.
- **Spare spindle and second vacuum zone earn nothing** in the sim: the spindle's fix path is never the better choice, and the vacuum zone measures ~0.
- **Dazza the office manager** is designed (`office-manager-and-upgrades.md`, must be net positive for average) but not built.
- **Bar names in the visitor stories** (Dr Morse, The Builders Arms, Labour in Vain, Naked for Satan, and their suburbs) are unverified placeholders, in `config.ts` → `visitors.bars`.
- **Human playtest pending:**
  - Does the day feel full or frantic?
  - Do players heed the board's-full warning? The sim assumes 2 in 3.
- **Still open from before:**
  - faults are fixed at the machine, not where they happen;
  - chores with no money effect (clamping, stacking, offcuts, compressor);
  - Stage 2 people and art;
  - the Android GPU report.
