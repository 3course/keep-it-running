# Upgrades in the sim — `world` (25 Oct 2026)

`npm run sim -- upgrades` (20 seeds) and `npm run sim -- upgrades 100`. Every comparison is paired: the same seeds with and without, compared seed for seed. Margin is operating margin; upgrades are capex and stay out of it, as in the game. `npm test`: 72/72.

## What's new

Prices and effects are in `config.ts` → `upgrades` (the sensor's fault list is in `faults.sensorCatches`).

| Upgrade | Price | Effect |
|---|---|---|
| Premium compression bits | $350 | bit wears 15% slower (effect 0.85) |
| Wall-mounted bag rack | $250 | extractor bag change 5 min, not 8 |
| Bigger offcut bin | $300 | bag the offcuts at 80% full, not 50% (the bin is only in the 3D view, so no sim effect) |
| Extinguisher by the exhaust | $400 | fire walks 40% shorter (effect 0.6); a third extinguisher on a post by the exhaust unit, there once bought |
| Fault sensor | $1,500 | pauses the cut when a fault it can measure starts: spindle over-temp, extractor bag full, collet slip. That sheet is never scrapped for being left; you still fix the fault, and the machine sits stopped meanwhile. It can't see a dull bit's chipping, a lifted part or the wrong board. |

**Tuned from the design doc to meet the pass/fail.** The doc's starting values were too strong together:

- **Premium bits:** 35% slower → 15%.
- **Exhaust extinguisher:** a third of the walk → 40% shorter.
- **Fault sensor:** catching every fault gave average +8.5 points, so it now catches only what a machine can measure.

With the doc's values, competent with everything owned made 21.2% (fresh week) and 21.4% (weeks 3–4). The doc itself is unchanged apart from the Dazza floor.

**Sim policies** (`headless.ts`, from the doc):

- **Competent:** best payback first (ranked by its own measured gain per dollar; skips anything that didn't pay), keeping $1,500 back for ply.
- **Average:** at the end of each week, the cheapest one it hasn't got, if it's above the $1,500 buffer.
- **Sloppy:** anything it can afford, any day, cheapest first.

Plain `npm run sim` now buys nothing: the old "competent buys the extractor at $3,500" rule is replaced by the policy.

## 1. Each upgrade alone, steady-state week (owned from the start)

### Average: margin gain and payback (100 seeds; ± is the paired standard error)

Baseline: margin 0.4%, scrap 20.7%.

| Upgrade | Price | Margin Δ | Scrap Δ | Profit Δ / week | Payback |
|---|---|---|---|---|---|
| Fault sensor | $1,500 | +2.8 (±0.8) | **−5.1 (±0.7)** | $331 | 4.5 wk |
| Nesting software | $1,200 | +3.8 (±0.7) | +0.4 | $441 | 2.7 wk |
| Premium bits | $350 | +1.8 (±0.9) | +0.8 | $224 | 1.6 wk |
| Exhaust extinguisher | $400 | +1.4 (±0.9) | −0.3 | $185 | 2.2 wk |
| Bigger extractor | $1,800 | +1.1 (±1.0) | +1.8 | $145 | 12.4 wk |
| Bag rack | $250 | +0.6 (±0.9) | +0.4 | $75 | 3.3 wk |
| Second vacuum zone | $1,500 | +0.0 (±0.9) | +0.1 | $14 | ~109 wk |
| Spare spindle | $2,400 | 0 | 0 | $0 | never (no script takes its fix path: the cool-down path also costs $0 and comes first) |
| Bigger offcut bin | $300 | 0 | 0 | $0 | never in the sim (view-only chore) |
| All of them | $9,700 | +10.4 (±1.0) | −5.8 | $1,344 | 7.2 wk |

### On the 20 seeds you asked for (± about 2 points)

The values are noisy at this size:

- **Margin gains:** nesting +5.2 (±1.6), premium bits −0.6 (±2.5), sensor +0.5 (±2.0).
- **Sensor scrap:** −3.0 (±1.3), 19.5% → 16.5%.
- **Bigger extractor:** −4.8 (±2.2), and vacuum zone −2.6 (±2.2). These come from upgrades changing which random rolls happen next, so their paired runs diverge, not from anything real; on 100 seeds both are about zero.

### Competent (100 seeds)

Baseline: 11.0%.

| Upgrade | Margin Δ | Payback |
|---|---|---|
| Nesting | +3.9 | 2.0 wk |
| Bigger extractor | +1.5 | 7.5 wk |
| Exhaust extinguisher | +1.3 | 1.9 wk |
| Fault sensor | +1.1 | 10.8 wk |
| Premium bits | +1.0 | 2.4 wk |
| Bag rack | +0.6 | 3.1 wk |
| Vacuum zone | −0.6 | never |
| Spindle, bin | 0 | never |
| **All owned** | **+6.7 → 17.7%** | 9.1 wk |

## 2. Buying policy vs buying nothing (continuous 4-week game; weeks 3–4 are past the ramp)

Margin, nothing → buying (scrap in brackets). 100 seeds:

| Script | Week 1 | Week 2 | Weeks 3–4 | Bought by week 4 | Cash end of week 4 |
|---|---|---|---|---|---|
| Competent | 23.4% → 24.4% (3.2 → 2.9%) | 13.2% → 20.6% (7.8 → 6.3%) | 10.8% → 19.6% (9.3 → 7.5%) | 6: extractor, nesting, bits, rack, exhaust extinguisher, sensor | $7,302 → $5,911 |
| Average | 23.3% → 23.3% (3.1 → 3.1%) | 0.9% → −0.2% (17.1 → 18.2%) | −12.9% → −12.8% (21.8 → 22.4%) | 2.3: bag rack, bigger bin, some bits | −$666 → −$1,165 |
| Sloppy | 21.4% → 24.8% (9.5 → 8.8%) | −31.7% → −28.3% (24.3 → 17.2%) | −117% → −426% (25.8 → 10.9%) | 6.6: everything cheap, nesting, vacuum zone, sensor on 60% of seeds | −$5,890 → −$8,640 |

20 seeds:

| Script | Week 1 | Week 2 | Weeks 3–4 |
|---|---|---|---|
| Competent | 23.8% → 24.4% | 15.2% → 20.0% | 11.4% → 17.4% |
| Average | 23.3% → 23.3% | 2.2% → −0.2% | −12.9% → −12.8% |
| Sloppy | 21.8% → 25.5% | −27.4% → −31.2% | −99.5% → −532.6% |

- **Sloppy's weeks 3–4 margins aren't meaningful.** It's thousands overdrawn by then, so it can't order ply and has almost no revenue, so its margin swings to huge negatives. Its scrap does drop by more than half with what it bought.
- **Average spends on the wrong things:** cheapest first buys the bag rack and the offcut bin, which barely pay. It never gets to the sensor or nesting, the two that help it.

## Pass/fail

| Check | 20 seeds | 100 seeds |
|---|---|---|
| No single upgrade lifts average more than 5 points | FAIL: nesting +5.2 (±1.6) | **PASS**: largest is nesting, +3.8 (±0.7) |
| Everything owned keeps competent ≤ 20% | PASS: 17.8% fresh, 17.4% weeks 3–4 | **PASS**: 17.7% fresh, 19.6% weeks 3–4 |
| Average with the fault sensor: clearly lower steady-state scrap | FAIL: −3.0 (±1.3) | **PASS**: −5.1 (±0.7), 20.7% → 15.5% |

At 20 seeds the two failures are within noise of their 100-seed values, which pass.

## Notes for a decision (not changed)

- **Nesting sits near the 5-point line for average** (+3.8 ± 0.7 on 100 seeds; 20-seed runs can show over 5). It's an existing upgrade, untouched. Its effect (0.9) is the knob if you want more room.
- **Average falls apart in a continuous game:** −12.9% in weeks 3–4, against +0.4% in a fresh steady-state week. It's overdrawn by week 4 (overdraft fees, ply orders refused past the limit). Neither upgrades nor its buying fix that.
- **Average's "cheapest first" buying is poor.** A smarter-but-still-average policy (the sensor first) would show the sensor's value in play, not just in isolation.
- **Zero-value upgrades:**
  - the spare spindle needs its fix path to be the better choice (today the cool-down path is free too);
  - the bigger offcut bin only saves walking in the 3D view;
  - the vacuum zone is about zero on 100 seeds.
