# Keep It Running

A small management sim: you run a CNC wood router in a one-man cabinetry shed in Melbourne.
Money is the only score. Faults, mates, the phone and the beer fridge all eat your margin.

## Run it

```
npm install
npm run dev
```

Open the URL Vite prints. Space pauses.

## Other scripts

- `npm run sim` — headless balance check. Plays a week with a "competent" and a "sloppy" operator policy and prints the P&L. Run this after touching `src/config.ts`.
- `npm run typecheck` / `npm run build`

## Layout

```
src/config.ts          every tunable number (prices, odds, wear rates, upgrades)
src/data/faults.ts     the fault table: symptom → diagnoses → fix paths → steps
src/sim/Game.ts        the whole simulation, no Phaser dependency, one tick() per game minute
src/sim/headless.ts    balance sim
src/scenes/            Phaser scenes: FactoryScene (the day), DaySummaryScene, WeekSummaryScene
src/ui/widgets.ts      panels, buttons, bars
```

## The loop

- **The lease.** $5,750 rent due at close on day 20 (`CONFIG.lease`). The notepad header and Kerr count down to it. Short by more than the grace on day 20 and it's game over, with the week's log.
- **The first morning** starts at the cafe across the road. Your mate's seen the landlord's letter, the sparky says the shed's had fires, a regular says they'll send work your way. Then you walk over and the tour starts. Once per game; skippable if you've seen it before.
- **The day:** 7am–5pm, one real second per game minute at 1x. The clock runs 4x when the machine's idle, nothing's pending and you've stood still for 2 seconds ("waiting…" under the clock). It snaps back to 1x the moment anything happens, and stops behind a full screen (the cafe, Kerr, the day summary). The day log says how much of the day went by fast. Over 15% is a job-queue problem, not a clock problem.
- **The work:** sheets on the morning board, more by phone. Pick up and the job fills in on the notepad as the caller describes it (who, board, price, due), then take it or turn it down. Grab a sheet, clamp it, cut it, stack it on the finished pallet. The customer's ute collects and pays. On time pays full, late pays less, scrap pays nothing.
- **Faults** fire while cutting. Diagnose where it shows, then fix it where the fix happens. Bit, spoilboard and extractor bag wear push the odds up.
- **Fires** start in the exhaust while cutting (at most one on day 1, none during the tour). The extinguisher is a thing you carry: put it down anywhere and it stays there. When a fire starts, a pointer shows where it is.
- **The office:** the phone takes calls. The computer is Kerr, a rule-based "local model" on the Nac Mini: today's and yesterday's P&L, the rent clock, 3–5 lines of dry advice from the day log (costliest first). Ply is ordered there.
- **People:** mates drop in 1–2 times a day, the courier needs a signature, the bank rings if you're overdrawn. The fridge opens at 2pm.
- **The shed** is the factory floor, the office, the dock, the side and rear yards. The toilet, smoko corner, storage and back shed are walled off until each has a job.
- **End of day:** P&L, an upgrade shop, "Copy day log" (with the shift's seed). Then a knock-off beer with a mate, or home.

Everything numeric lives in `src/config.ts`. `window.kir` is the live game object for poking from the console.
