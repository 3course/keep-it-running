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

- 7am–5pm, one real second per game minute. Optional overtime to 7pm at double labour.
- 6–8 nested sheets a day. On time pays full, late pays 70%, scrapped pays nothing and you've burnt the board.
- Faults fire while cutting. Each needs a diagnosis (wrong call = minutes lost) then a fix path: DIY is cheap and slow, calling someone is fast and dear. Neglect a fault too long and the sheet is scrap.
- Bit, spoilboard and extraction filter wear down and push fault odds up. Swap them between sheets or pay for it later.
- Mates wander in, the phone rings, the courier needs a signature. Each costs attention or rapport. Rapport drives rush-job odds.
- Fridge opens at 2pm. Each beer: -15 competence → slower fixes, input lag, misclicks, and mates stay longer.
- End of day: P&L and an upgrade shop. End of week: overheads come out and you see whether it was a business.

Everything numeric lives in `src/config.ts`. `window.kir` is the live game object for poking from the console.
