# Sim with visitors — `world` (25 Oct 2026)

Compared with `claude/sim-after-grace.md` (the commit before this one, cbd719f). `npm test`: 54/54 pass.

## What changed

Visiting mates (Eggby, Courtney, Tim Baker) no longer leave after one answer:

- A visit lasts `visitors.visitMinutes` (30) whatever you say (×1.5 if you've had a beer today, the existing `beer.friendDurationMult`). They come straight over when they arrive, then wander the factory floor, office and smoko and come back to you every so often.
- Each time they come up they say one line from three pools, never the same line twice running:
  - an **ask**: a beer from 2pm (while the caps allow), otherwise a cuppa or a yarn;
  - **shop talk**: the machine, the jobs, "busy day?";
  - a **story**: a night out in Collingwood, Abbotsford or Fitzroy, three or four per mate, never repeated in a visit.
- **Replies are unchanged:** "Have a yarn", "Grab <Name> a beer ($8)" (only for a beer ask) and "Flat out, sorry". A yarn is `yarnMinutes` (6); a beer is the existing 20-minute chat. Left unanswered for `askMinutes` (3), they start a yarn anyway (no beer).
- **Guardrails** (all in `config.ts`, `visitors`):
  - after a yarn, 3–8 minutes before they come up again; after "flat out", 12;
  - at most 2 beers per mate per day and 4 for all mates together, after which a beer ask becomes a cuppa/yarn ask. Mates helping themselves from the fridge count towards both caps.
  - Beer cost ($8) and the fumble and speed effects are unchanged.
- **"Flat out, sorry"** still costs the existing 5 rapport. They keep wandering and come back after the cooldown.
- **Seeded:** every visitor decision (when they come up, what they say, where they wander, which bar) comes from `Game.visitorRng`, reseeded each day from the game seed. Nothing in visitor code uses `Math.random`. The view only walks them to the area spot Game picked, and they never stop in a doorway, round the machine or phone, or at the pickup by the roller door. They step aside when they're on your route.
- **One mate at a time,** as before.

## Margins (means of 5 seeds)

| Script | Week 1 before → after | Week 2 before → after | Steady before → after |
|---|---|---|---|
| competent | 24% → 24% | 17% → 17% | 10.8% → 9.2% |
| average | 25% → 24% | 6% → 2% | 0% → 5% |
| sloppy | 22% → 22% | −24% → −26% | −29% → −36% |

Per seed these moved a lot (competent steady seed 1: 14% → 2%, seed 2: 11% → 18%). Most of that is the random stream reshuffling, not visitors: the old visit length was a random roll and that roll is gone, so every later roll in the game moves. On **20 seeds** the shift is small:

| Script (20 seeds) | Week 1 before → after | Week 2 before → after | Steady before → after |
|---|---|---|---|
| competent | 24% → 24% | 16% → 16% | 11% → 10% |
| average | 24% → 23% | 4% → 2% | 1% → 3% |
| sloppy | 21% → 22% | −28% → −27% | −29% → −31% |

Steady-state competent is 10% (20 seeds) / 9.2% (5 seeds): at the bottom of the 10–20% target, about a point lower than before. Sloppy stays well negative.

### Per seed, 5 seeds (after)

| Script | Seed | Week 1 | Days 1–3 ruined/cut | Week 2 | Steady | Steady scrap |
|---|---|---|---|---|---|---|
| competent | 1 | 27% | 1/43 | 17% | 2% | 15% |
| competent | 2 | 24% | 1/46 | 15% | 18% | 7% |
| competent | 3 | 23% | 1/48 | 22% | 6% | 12% |
| competent | 4 | 23% | 1/43 | 12% | 12% | 10% |
| competent | 5 | 25% | 2/47 | 20% | 8% | 11% |
| average | 1 | 22% | 0/46 | −8% | 4% | 11% |
| average | 2 | 24% | 0/46 | 2% | 19% | 17% |
| average | 3 | 26% | 0/44 | −2% | 4% | 20% |
| average | 4 | 21% | 0/44 | 1% | −3% | 30% |
| average | 5 | 26% | 0/48 | 19% | 2% | 18% |
| sloppy | 1 | 15% | 2/39 | −23% | −50% | 35% |
| sloppy | 2 | 28% | 1/41 | −29% | −13% | 20% |
| sloppy | 3 | 24% | 3/38 | −17% | −50% | 40% |
| sloppy | 4 | 28% | 2/40 | −33% | −41% | 23% |
| sloppy | 5 | 15% | 3/39 | −26% | −26% | 18% |

The average script still ruins nothing on days 1–3 (0/228).

## Beers per day (yours / bought for mates)

| Script | Week 1 before → after | Week 2 before → after | Steady before → after |
|---|---|---|---|
| competent | 0 / 0.3 → 0 / 0.7 | 0 / 0.3 → 0 / 0.2 | 0 / 0.3 → 0 / 0.3 |
| average | 0 / 0.4 → 0 / 0.4 | 0 / 0.2 → 0 / 0.4 | 0 / 0.2 → 0 / 0.5 |
| sloppy | 2 / 0.9 → 2 / 1.2 | 2 / 0.8 → 2 / 1.2 | 2 / 0.8 → 2 / 0.9 |

20 seeds, after: competent 0.4–0.5 for mates, average 0.3–0.4, sloppy 0.9–1.4. Mate beers are up by up to about half a beer a day (about $4/day) and never reach the caps (2 per mate, 4 a day). Your own beers are unchanged (only sloppy drinks: 2 a day).

## What the visitors do in a steady-state week (per day, 5 seeds)

| Script | Visits | Times they come up | "Flat out" | Minutes yarning (attention split) |
|---|---|---|---|---|
| competent | 3.7 (was 4.2) | 10.7 | 8.6 (was 3.8) | 12.7 (was 9.1) |
| average | 3.5 (was 3.7) | 9.7 | 4.0 (was 3.2) | 29.3 (was 6.4) |
| sloppy | 2.8 (was 3.0) | 8.0 | 0 (was 0) | 44.6 (was 38.8) |

## Notes for a decision (not changed)

- **A mate is about for ~2 hours a day now:** 3–4 visits × 30 minutes, at the old arrival rate (`distractions.chancePerMinute` and the friend weight weren't touched). If that's too much company, lower the friend weight or the visit length.
- **Competent waves visitors off ~8.6 times a day** (they come back after 12 minutes, and keep coming while it's cutting), at the existing 5 rapport each: about −43 rapport a day against +4 per visit. Rapport only moves rush-job odds, so the margin barely notices, but the rapport number will sit low.
- **Average's yarning jumped** (6 → 29 minutes a day): its script lets a third of asks during a cut ride, and an unanswered ask becomes a 6-minute yarn.
- **The bar names and suburbs are placeholders** (Dr Morse — Abbotsford; The Builders Arms, Labour in Vain, Naked for Satan — Fitzroy), unverified. Swap them in `config.ts` → `visitors.bars`. One story is set on Smith Street, Collingwood, without a bar.
