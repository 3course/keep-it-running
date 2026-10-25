# Sim after the grace period — `world` (25 Oct 2026)

Compared with `claude/baseline-sim.md` (4ab3e47). `npm test`: 32/32 pass.

## What changed

- **Difficulty curve** in `src/config.ts` → `difficulty.breakdownByDay`, one table, index 0 = day 1, later days use the last value:

  | Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Breakdown rate | 0 | 0 | 0 | 0.3 | 0.45 | 0.6 | 0.7 | 0.8 | 0.9 | 1 |

  It multiplies (`Game.breakdownMult`):
  - every machine fault — the per-minute roll and the wrong-material roll at job start. That's all six faults in `faults.ts`: laminate chipping / dull bit (including acrylic melting), part lifted, extractor bag full (the fault), spindle over-temp, wrong material, collet slip;
  - fire spreading: a fire's `heat` grows at the day's rate and spot → duct → extractor use it (at 1.0 that's the old minutes). A spot fire on days 1–3 never spreads.
- **Not changed (still on days 1–3):** spot fires starting (same chance), consumable wear and the swap chores (bit, bag), phone/orders, mates, trucks, pickups.
- **Day 2 lesson fire** — `fire.lesson: { day: 2, fromHour: 10, escalationMult: 0.5 }`: one scripted spot fire the first minute a sheet's cutting from 10am on day 2. It glows from the start (other spot fires only smoke for 20 min) and spreads at half the day's rate — zero on day 2, so it can never damage anything.
- **No day checks in `Game.ts`:** the ramp and the lesson day both come from config.
- **"Bit breaking" and "power trips"** aren't in the game (no such fault or event exists), so there was nothing to ramp for them.

## Sim changes

- New **average** script, between competent and sloppy: a third of fires get to 20–60 min late and a third of faults 5–20 min late; right diagnosis 75% of the time, then the cheapest fix; puts off a third of bit/bag swaps until the part's nearly gone; gets to trucks and the next sheet late sometimes; answers everything; no beer. Works overtime only to finish a sheet on the bed, and won't start one in overtime that can't finish by 7pm.
- Each script plays two weeks per seed: **week 1** of a new game (grace days 1–3, then 0.3, 0.45) and a **steady-state week** (a new game started on day 10, the end of the ramp: full rate all week, same conditions as the baseline).
- **Week 2** (added in a follow-up commit): the same game carried on into days 6–10 (ramp 0.6, 0.7, 0.8, 0.9, 1), so the middle of the ramp is measured. Cash, stock, rapport, upgrades and carried-over jobs continue from week 1.
- `npm run sim` prints the detailed lines for the steady-state week; `npm run sim -- week1` / `-- week2` prints them for that week. All end with the summary table.
- **Scrap rate** = sheets ruined / sheets cut (the sim's `cut` = sheets delivered).

## Results (5 seeds each)

| Script | Seed | Week 1 margin | Week 1 scrap | Days 1–3 ruined / cut | Steady margin | Steady scrap |
|---|---|---|---|---|---|---|
| competent | 1 | 23% | 6% | 2 / 49 | 14% | 9% |
| competent | 2 | 26% | 3% | 0 / 47 | 11% | 8% |
| competent | 3 | 22% | 5% | 2 / 49 | 5% | 13% |
| competent | 4 | 27% | 3% | 0 / 48 | 12% | 6% |
| competent | 5 | 21% | 5% | 1 / 47 | 12% | 8% |
| **competent** | **mean** | **24%** | **4%** | **5 / 240** | **11%** | **9%** |
| average | 1 | 25% | 4% | 0 / 49 | 2% | 27% |
| average | 2 | 26% | 4% | 0 / 49 | −9% | 37% |
| average | 3 | 22% | 3% | 0 / 46 | 11% | 18% |
| average | 4 | 25% | 1% | 0 / 48 | 1% | 21% |
| average | 5 | 27% | 1% | 0 / 46 | −3% | 22% |
| **average** | **mean** | **25%** | **3%** | **0 / 238** | **0%** | **25%** |
| sloppy | 1 | 20% | 6% | 2 / 38 | −29% | 25% |
| sloppy | 2 | 28% | 6% | 2 / 40 | −7% | 18% |
| sloppy | 3 | 25% | 10% | 3 / 40 | −27% | 27% |
| sloppy | 4 | 22% | 10% | 3 / 41 | −37% | 35% |
| sloppy | 5 | 13% | 11% | 2 / 35 | −45% | 28% |
| **sloppy** | **mean** | **21%** | **9%** | **12 / 194** | **−29%** | **27%** |

Week 1, per week (means): competent 15.6 sheets/day, 9.8 faults, cash $3513 · average 15.1 sheets/day, 8.8 faults, cash $4703 · sloppy 12.2 sheets/day, 8.4 faults, cash $3935. Steady state has 35–54 faults a week.

Checked separately on all 15 week-1 runs: **0 faults and 0 duct/extractor fires on days 1–3**, and the lesson fire happened on day 2 every time. Duct fires only appear for sloppy, on days 4–5.

## Week 2 (days 6–10, continuing from week 1)

| Script | Seed | Week 2 margin | Week 2 scrap | Sheets cut/day | Faults | Cash at end of week 2 |
|---|---|---|---|---|---|---|
| competent | 1 | 11% | 7% | 13.6 | 38 | $4454 |
| competent | 2 | 17% | 7% | 14.0 | 34 | $5292 |
| competent | 3 | 17% | 9% | 14.0 | 37 | $5310 |
| competent | 4 | 20% | 6% | 14.0 | 34 | $5656 |
| competent | 5 | 18% | 7% | 14.2 | 33 | $4210 |
| **competent** | **mean** | **17%** | **7%** | **14.0** | **35.2** | |
| average | 1 | −5% | 26% | 10.0 | 37 | $2662 |
| average | 2 | −2% | 20% | 11.2 | 40 | $3855 |
| average | 3 | 16% | 1% | 13.4 | 28 | $5808 |
| average | 4 | 12% | 17% | 12.0 | 31 | $5278 |
| average | 5 | 11% | 10% | 11.8 | 25 | $5673 |
| **average** | **mean** | **7%** | **15%** | **11.7** | **32.2** | |
| sloppy | 1 | −9% | 19% | 10.6 | 27 | $1611 |
| sloppy | 2 | −17% | 19% | 9.6 | 29 | $3016 |
| sloppy | 3 | −29% | 21% | 9.6 | 45 | −$77 |
| sloppy | 4 | −41% | 32% | 9.4 | 35 | $146 |
| sloppy | 5 | −26% | 21% | 10.4 | 26 | −$887 |
| **sloppy** | **mean** | **−24%** | **22%** | **9.9** | **32.4** | |

Week 1 → week 2 → steady-state margin: competent 24% → 17% → 11%, average 25% → 7% → 0%, sloppy 21% → −24% → −29%.

- Week 2 is where the scripts separate: sloppy goes negative on every seed, average drops to break-even territory (two seeds negative), competent stays in 11–20%.
- Competent's week 2 (17%) sits above its steady state (11%) for more than the ramp: the continuing game has a week's experience behind it — the extractor upgrade bought at the end of week 1 on most seeds (capex, not in the margin), stock on the pallet and full rapport — where the steady-state week is a new business.
- Average's week 2 is the noisiest (−5% to 16%): faults it leaves late either get fixed in time or scrap the sheet, and there are 25–40 of them a week now.

## Against the targets

- **Average rarely scraps on days 1–3:** 0 of 238 sheets. ✓
- **Average comfortably profitable in week 1:** 22–27%, mean 25%. ✓
- **Steady-state competent 10–20%:** 5–14%, mean 10.8% — **identical to the baseline**, seed for seed (14/11/5/12/12). Seed 3 is still under 10%, as it was before; nothing here touches the steady state.
- **Competent above 20% in week 1:** 21–27%, fine per the brief.

## Compared with the baseline

- The steady-state week reproduces `baseline-sim.md` exactly for competent and sloppy (margins, scrap, faults, cash, every seed): the ramp at 1.0 and fire `heat` change nothing at full rate.
- What used to be the only week now has a gentler start: competent's week 1 margin goes 10.8% → 24%, sloppy's −29% → +21%; faults per week drop from ~49 / ~39 to ~10 / ~8.

## Notes for a decision (not changed)

- **Sloppy is profitable in week 1** (+13% to +28%). Its losses came almost entirely from breakdowns, and three clean days dominate the week. The day 4–5 values barely move this: tried 0.5/0.7, 0.7/0.9 and full rate on days 4–5 — sloppy's week 1 mean was 17%, 19% and 13% (average: 23%, 25%, 21%). If week 1 should already separate careful from careless play, that needs something other than breakdowns (e.g. sloppy's ordering and delivery fees biting sooner).
- **Average at steady state** (0% margin, 25% scrap) scraps almost as much as sloppy (27%): a third of faults left 5–20 min against scrap timers of 6–20 min ruins most of those sheets. Its margin sits between competent and sloppy because it orders and drinks like competent.
- **Scrap on days 1–3 for competent and sloppy** is all sheets still cutting at knock-off (sloppy at 5pm, competent at 7pm lights-off after starting a sheet late in overtime), not breakdowns. Their scripts were left as they were so the steady state stays comparable.
