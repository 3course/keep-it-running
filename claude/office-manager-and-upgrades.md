# Office manager and upgrades — design (25 Oct 2026)

Proposal only, no game code. Numbers are from `sim-after-grace.md`, `sim-visitors.md` and a 20-seed run of `world` @ 3994892.

## 1. Office manager: Dazza

**Darren "Dazza" Pocock**, 24, a mate of a mate. Good on the phone with customers, terrible on the phone with his girlfriend, Kayla.

- **Hire:** a *Staff* section in the day summary, next to the upgrade shop. He starts the next working day.
- **Wage:** $34/h casual, paid at knock-off for the hours he was there. It's labour, so it counts against operating margin (upgrades are capex and don't). About $170 a shift, $510 a week.
- **Shifts:** Tue, Thu, Fri, 10:00–15:00. He's never in for the 7am rush or the late afternoon.
- **Late:** 40% of shifts by 10–60 minutes. 1 shift in 10 he doesn't show (no pay).
- **Losing him:**
  - **Fire him** any time.
  - **Overdrawn payday:** he's paid and walks.
  - **Quits:** a 5% chance each week (Kayla wants Geelong). He can be rehired a week later.

**What he does,** one thing at a time, at 1.5× your time:
- answers the phone and takes orders (he never declines: overcommitting is yours);
- rings back voicemails;
- empties the offcut bin to the skip;
- changes the extractor bag (still $60);
- signs for the ply truck if he's free.

**What he never does:** the machine, faults, fires, or ordering ply.

**What he's bad at**
- **Wrong orders:** 1 order in 8 goes down wrong (wrong material, or a sheet short). You find out when you load it: a wrong-material fault, or an unhappy customer (−rapport).
- **Kayla:** 1–3 calls a shift, 5–15 minutes each, on the office phone. **The line is busy**: order calls go to voicemail (ring back within 60 minutes, as now), you can't use the phone either, and nothing else gets done.
- **Leaves early in spirit:** in his last 10 minutes he won't start a chore.

**Why he won't trivialise the loop:** he's in for 15 of ~50 hours a week, minus lateness (~10%) and arguments (~15–20%), so about a quarter of the phone and chore time, and never the busy ends of the day. When he argues, the phone is worse than if he weren't there. Target: pays for himself for average, ≤ +2 points for competent, never makes sloppy profitable.

**Lines** (we only hear his end of the arguments):
1. "Sorry, sorry. Bridge was a car park."
2. "Keep It Running, Dazza speaking. Yep… yep… how many sheets?"
3. "Babe. Babe. I'm at work. No, I'm not at the TAB."
4. "Bin's done. You've got about a thousand offcuts in there, by the way."
5. "She says hi. She doesn't say hi. Forget I said anything."
6. "Who orders twelve sheets of acrylic? Signs. Big signs, apparently."
7. "Kayla, I can't hear you, the router's going— no, I'm not making that noise with my mouth."
8. "I wrote it down. I wrote something down."
9. "Truck's here. I signed. That's me done, yeah?"
10. "Car's carked it. Back Thursday. Probably."
11. "Phone line was busy? Huh. Must've been the phone company."

## 2. Upgrades

**In the code now** (`config.ts` → `upgrades`, bought in the day summary, capex):

| Upgrade | Price | Effect |
|---|---|---|
| Nesting software | $1,200 | boards cost 10% less: ply orders and each sheet's board cost (prices unchanged) |
| Second vacuum zone | $1,500 | part-lifted faults 60% less likely |
| Bigger extractor | $1,800 | filter wears half as fast; bag-full faults half as likely |
| Spare spindle on the shelf | $2,400 | a free 5-minute fix for spindle over-temp |

**Affordable by the end of week 1?** These are 20 seeds with nothing bought, after the $900 overheads. Ply is paid up front and both scripts dip to about $200 mid-week, so keep about $1,500 back.

| | Cash (median / 25th pct) | Spare after $1,500 |
|---|---|---|
| Competent | $4,763 / $4,272 | ~$3,250 |
| Average | $4,290 / $3,838 | ~$2,800 (~$2,300 in a weak week) |

- **Competent:** any one upgrade, or two of the cheaper three (nesting + vacuum zone = $2,700); not all four ($6,900). Today's sim buys the extractor in week 1 on every seed.
- **Average:** one upgrade; in a weak week, not the spindle. Two only in a good week.
- **Nesting looks strongest:** about 13 sheets/day at a ~$95 average board is ~$6,000 of ply a week, so 10% is ~$600/week, paid back in about 2 weeks. The others only pay when their faults are common (steady state); the sim plan measures that.

**Proposed additions.** Each tier is roughly 2–3× the last. Payback targets for competent: about a week for small, 2–4 weeks for mid, 5–10 weeks for big.

| Tier | Upgrade | Price | Effect |
|---|---|---|---|
| Small | Premium compression bits | $350 | bit wears 35% slower (swaps still $85) |
| Small | Wall bag rack | $250 | bag change 8 → 5 min |
| Small | Bigger offcut bin | $300 | bag it at 0.8 full, not 0.5 |
| Small | Extinguisher by the exhaust | $400 | the fire walk is a third as long |
| Mid | Pallet racking (storage) | $1,800 | needs a pallet cap first (none today), e.g. 24 → 40 sheets |
| Mid | Tool-length sensor | $2,200 | "re-zero Z" steps take 1 minute, not 2 |
| Big | Auto tool changer | $6,500 | bit swaps and chipping fixes 6 → 2 min |
| Big | Second CNC (used) | $12,000 | a second bed: double the capacity, double the trouble |

## 3. Sim plan

1. **Model:** Dazza is a `staff` entity in `Game`, ticked each minute. His own seeded stream (`staffRng`, reseeded per day like `visitorRng`) drives lateness, arguments and mistakes, so hiring him doesn't reshuffle the rest of the run. His numbers go in `config.ts` → `staff.officeManager`; each new upgrade is one `CONFIG.upgrades` entry.
2. **Policies** in `headless.ts`:
   - **Hiring:** competent hires from week 2 if cash covers two weeks' wages; average on day 1 of week 2; sloppy on day 1, and loses him to an overdrawn payday.
   - **Buying:** competent buys the best payback first, above the $1,500 buffer; average buys one a week; sloppy buys whatever it can afford.
3. **Runs:** every script × {no Dazza, Dazza} × {no upgrades, the buying policy}. Report week 1, week 2, weeks 3–4 of a continuous 4-week game (steady state with whatever was bought), and the fresh steady-state week. Use 20 paired seeds (the same seeds in every variant, compared seed by seed), because the 5-seed swing is bigger than these effects.
4. **The near-0% steady state:** run average's steady week with each upgrade owned from the start (one at a time, then all) and with Dazza from the start. Report Δmargin, Δscrap rate, Δsheets/day and payback weeks (price ÷ Δweekly profit). Repeat for competent.
5. **New columns:**
   - Dazza: minutes late, minutes arguing, calls he took, calls lost to the busy line, wrong orders, wages;
   - upgrades: spend and payback;
   - cash at the end of week 4.
6. **Pass/fail:**
   - Dazza: ≤ +2 points for competent, average gains, sloppy stays negative, and calls lost to his arguments are at least 10% of the calls he takes.
   - Each small upgrade pays back within 2 weeks for competent.
   - No single upgrade gives average more than +5 points.
   - Everything owned, plus Dazza, keeps competent ≤ 20%.
7. **Results:** `claude/sim-office-manager.md`. Everything here is a starting value to tune against those runs.
