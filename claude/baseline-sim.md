# Baseline sim — `world` @ 4ab3e47 (25 Oct 2026)

`npm run sim`: one 5-day week per seed, start cash $1500. Output is deterministic (two runs identical).
`npm test`: 23/23 browser tests pass at the same commit.

Target (CLAUDE.md): competent roughly 10–20% margin, sloppy negative.

## Competent

| Seed | Margin | Cut/day | Demand/day | Late/day | Declined/day | Idle/day | Scrap | Faults | Spot fires/day | Trucks | Fees | Rapport | Cash end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 14% | 13.4 | 18.2 | 3.0 | 2.0 | 46m | 6 | 47 | 1.0 | 9 | $300 | 90 | $857 |
| 2 | 11% | 12.6 | 15.2 | 1.6 | 1.0 | 90m | 5 | 45 | 1.0 | 8 | $300 | 88 | $2001 |
| 3 | 5% | 12.8 | 17.0 | 3.0 | 2.6 | 50m | 8 | 50 | 1.6 | 7 | $120 | 26 | $2087 |
| 4 | 12% | 13.0 | 15.2 | 1.8 | 1.0 | 75m | 4 | 54 | 2.2 | 8 | $300 | 97 | $2407 |
| 5 | 12% | 13.2 | 17.6 | 5.0 | 3.2 | 70m | 5 | 47 | 1.6 | 8 | $180 | 67 | $2153 |
| **Mean** | **10.8%** | **13.0** | 16.6 | 2.9 | 2.0 | 66m | 5.6 | 48.6 | 1.5 | 8.0 | $240 | 74 | $1901 |

Range 5–14%. Seed 3 is below the 10% floor (signage barely broke even: 5 cut, 4 ruined, 2% contribution; rapport fell to 26).
No duct or extractor fires on any seed.

## Sloppy

| Seed | Margin | Cut/day | Demand/day | Late/day | Missed/day | Idle/day | Scrap | Faults | Spot/duct fires/day | Trucks | Fees | Rapport | Cash end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | −29% | 9.6 | 15.4 | 6.4 | 0.2 | 48m | 12 | 38 | 1.6 / 0.4 | 14 | $780 | 90 | −$1408 |
| 2 | −7% | 9.8 | 14.4 | 3.8 | 0.0 | 63m | 9 | 35 | 1.6 / 0.4 | 17 | $960 | 100 | $130 |
| 3 | −27% | 9.6 | 15.6 | 5.6 | 0.4 | 54m | 13 | 38 | 1.6 / 0.4 | 16 | $960 | 95 | −$1658 |
| 4 | −37% | 9.2 | 15.6 | 4.4 | 0.0 | 51m | 16 | 43 | 0.6 / 0.2 | 16 | $900 | 90 | −$1903 |
| 5 | −45% | 9.4 | 16.2 | 6.0 | 1.2 | 50m | 13 | 42 | 1.4 / 0.6 | 12 | $660 | 100 | −$2217 |
| **Mean** | **−29%** | **9.5** | 15.4 | 5.2 | 0.4 | 53m | 12.6 | 39.2 | 1.4 / 0.4 | 15.0 | $852 | 95 | −$1411 |

Range −45% to −7%: negative on every seed. 2.0 beers/day on every seed; no extractor fires.

## Contribution by job type (week totals, per seed)

| Seed | Competent formwork | Competent joinery | Competent signage | Sloppy formwork | Sloppy joinery | Sloppy signage |
|---|---|---|---|---|---|---|
| 1 | 45% | 45% | 53% | 9% | 31% | −35% |
| 2 | 46% | 46% | 36% | −2% | 47% | 43% |
| 3 | 40% | 54% | 2% | 13% | 31% | −49% |
| 4 | 51% | 44% | 44% | −3% | 16% | −10% |
| 5 | 38% | 60% | 43% | −11% | −4% | −18% |

## Raw output

Run `npm run sim` for the full lines (per-day breakdown, fires by day, revenue and $/machine-hr by type, stock left).
