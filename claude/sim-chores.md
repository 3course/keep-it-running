# Chores with teeth — sim before and after (31 Oct 2026)

The four chores that did nothing now cost money when they're skipped. All of them live in `Game` (so the balance sim
plays them), every number is in `config.ts` → `chore`, and `CONFIG.chores = false` (`npm run sim -- nochores`)
reproduces the old economy exactly (byte-identical sim output apart from the header line).

## What each chore does

| Chore | In the shed | The rule (config.ts → `chore`) | What skipping it costs |
|---|---|---|---|
| Clamping | Tap 4 clamps on the loaded sheet (a taps gesture; stop short and you can still start it) | Chance it shifts mid-cut, by clamps left off: 0 / 3% / 12% / 27% / 48%. Clamping adds 1 min to loading | A ruined sheet: the board (~$95 formply, $55 MDF, $190 acrylic) and the job. The sheet slides and the cut line wobbles |
| Stacking | Finished boards pile at the bed's end; "Carry the boards off (n)" takes them all to the finished pallet | The bed holds 3; a full bed takes no sheet. One trip: 2 min | Machine time while the bed's full |
| Offcuts | The bin fills over 5 sheets (8 with the bigger bin); bag it any time from half full | The 6th sheet's offcuts spill: a heap round the bin. 2 loads to the skip, 4 min each. While it's there, loading and unloading the bed take 2 min longer, and you walk at 55% through it | Time, and slower walking near the machine |
| Compressor | Its hiss drops a little each sheet and falls right away when it's due; hold the drain valve 2 s | Due after 6 sheets. The next sheet is still safe (the warning); after that each sheet's lift chance is +8% per sheet over, up to 50%. Draining: 2 min | A ruined sheet: the vacuum lets go and it lifts |

The new costs are in the day summary (P&L: "Missed clamps: n sheets shifted $x", "Undrained compressor: n sheets
lifted $x"; Shop floor: shifted, lifted, bin overflows), the day verdict, and the copied day log ("Chores: …").

## How the scripts handle them

- **Competent:** four clamps every sheet; drains when the hiss drops (before the next load); empties the bin when it's
  full, clears a spill straight away; carries the boards off two or three at a time while the next sheet cuts.
- **Average:** the same, done while a sheet cuts, but a third of the time it gets to the compressor, the bin and a
  spill late; leaves boards on the bed till it's full; one sheet in four goes on a clamp short.
- **Sloppy:** two or three clamps; never empties the bin (it spills), clears a spill half the time; drains the
  compressor only once a sheet's lifted that day; clears the bed only when it's full.

## Before and after — `npm run sim`, 5 seeds (operating margin)

| Script | Week 1 before → after | Week 2 before → after | Steady before → after |
|---|---|---|---|
| Competent | 23% → **21%** | 19% → **15%** | 15% → **15%** |
| Average | 25% → 23% | 7% → 8% | 15% → 7% |
| Sloppy | 22% → **7%** | −32% → **−51%** | −14% → **−30%** |

Chores per day (after): competent ruins nothing; average ~0.1 shifted, ~0.05 lifted, ~0.5 bin spills, $10–21 of boards;
sloppy ~0.8 shifted, ~0.8 lifted, ~1 spill, ~$150–160 of boards.

**Competent stays at 15% (inside 10–20%) and never drops below 5% on any seed in week 2 or steady state (lowest: 9%,
seed 3 steady).** Sloppy goes from profitable in week 1 to barely (7%), and much further negative after.

## 20 seeds (`npm run sim -- seeds=20`), to see past the noise

| Script | Week 1 off → on | Week 2 off → on | Steady off → on |
|---|---|---|---|
| Competent | 24% → 22% | 16% → 15% | 15% → 14% |
| Average | 25% → 23% | 10% → 7% | 9% → 6% |
| Sloppy | 22% → 5% | −31% → −55% | −17% → −38% |

Five seeds swing several points either way (average steady reads 15% → 7% on 5 seeds but 9% → 6% on 20).

Solvency over four continuous weeks (`npm run sim -- upgrades 20`, solvent = never refused ply and cash ≥ 0):

| Script | Solvent, buying nothing (off → on) | Weeks 3–4 margin (off → on) |
|---|---|---|
| Competent | 20 → 20 | 15.6% → 14.1% |
| Average | 19 → **17** | 7.8% → **4.5%** |
| Sloppy | 0 → 0 | — |

## Tuning done

First pass (7% shift chance per missing clamp, lift risk from the first sheet past due, 12% a sheet) took average to
3% steady. What moved it back:

1. **Average's chores while the sheet cuts.** It was doing them before loading, leaving the machine idle (with every
   chore's minutes zeroed it recovered to 7–8%, so time, not ruined sheets, was the cost). That was the script, not the
   rules.
2. **Clamp risk climbs per clamp** (3/12/27/48% rather than 7% each): a slip is cheap, a habit isn't.
3. **The hiss is a warning:** the first sheet after it's due is safe; lift risk 8% a sheet over (cap 50%).
4. Competent carries boards off in twos and threes (one trip for the lot).

Shorter trips to the skip (3 min) and a smaller heap penalty were tried and made no difference beyond noise; the
4-minute trip stays (the skip is out the back).

## Open question

**Average is thinner now:** about 6–7% steady and 17 of 20 solvent through week 4 buying nothing (19 with its upgrade
buying). That's the cost of being a third late on chores on top of being a third late on faults. If that's too harsh,
the knobs are `chore.compressor.liftChancePerSheetOver`, `chore.clamp.shiftChanceByMissing[1]`, or average's chore lag
in `src/sim/headless.ts` (`averageChores`).
