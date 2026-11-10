# Keep It Running — core loop & problem table (v0.1)

Working design for the first prototype. Everything here is a starting guess to be tested, not a spec.

## The pitch in one line
You run a CNC router in a small Melbourne factory. Keep it cutting, keep the margin, don't burn the place down.

## The one-minute loop
1. Check the notepad. What's the current job, what's queued, what's gone wrong.
2. Set up the cut. Walk to the pallet, grab a sheet, load it on the bed, pick the right bit, hit start. (~15 s of player time.)
3. The machine runs. You can't speed it up. This is the "free" time — and that's exactly when problems land.
4. Something interrupts. A spot fire in the exhaust, a mate at the roller door, a phone call with a new order, the extractor bag full.
5. Choose. Deal with it now, write it on the "can wait" list, or ignore it.
6. Resolve (or don't). Most fixes are 1–5 physical steps: walk, grab, use, return. Ignored problems escalate on a timer.
7. Cut finishes. Unload, stack on the finished pallet. Money lands when the job is complete and collected.
8. Back to 1.

The tension: step 3 is dead time only if nothing happens. Every problem that lands while the machine runs is "free" to fix; every problem that lands while you're mid-setup costs you a cut.

## The day
- Shift runs 7:00am–5:00pm, 1 game minute per real second at 1x, faster (4x) when nothing is happening and nothing is pending (playtest 1: see below).
- Jobs arrive by phone/email DURING the day, not all at 7am. The board should never be clearable before ~3pm by a competent player. Some jobs have a deadline (today / tomorrow / this week).
- 2:00pm: the bar fridge unlocks. Each beer knocks ~15% off task speed and adds a chance of fumbling a step. Stackable.
- 5:00pm: day ends. (Overtime is gone: a mate at the roller door, a knock-off beer or home.) Summary screen: revenue, costs, margin, what's on the pallet for tomorrow.

## Money (v0 placeholders)
- Standard job (one 2400×1200 sheet): $250 revenue
- Sheet of ply: $90 cost
- Cut time (clean): 90 s machine time
- Replacement bit when one breaks: $40
- Rush job: $400 revenue, deadline today
- Perfect day (~6 jobs): ~$1,500 revenue, ~$600 costs, ~$900 margin

Rule of thumb: a fire handled well costs one cut (~$160 margin). A fire ignored costs the afternoon.

## Problem table
Columns: trigger · how obvious in the scene · steps to fix · time · $ cost · escalates to

1. Spot fire in exhaust duct · random while cutting, more likely with full bag or dull bit (max 1 on day 1, none during the tour) · HIGH: smoke, orange glow, a pointer to the extinguisher · get the extinguisher (wherever you left it: it's carried, not hung) → walk to duct → spray · 20 s · $0 (refill $60 every second use, counted across the lease) · duct fire → extractor fire → machine stops, $800 repair, lose rest of day
2. Extractor bag full · every ~4 cuts · MED: bag swells, dust on floor · stop extractor → unclip → carry to bin → fit new → restart · 25 s · $15 · dust everywhere, fire chance doubles, cut quality drops
3. Bit dull · every ~8 cuts · LOW: rougher sound, fuzzy edges · stop → swap bit → restart · 15 s · $0 · bit breaks mid-cut: sheet wasted ($90) + $40 bit
4. Bit breaks · dull bit ignored, or random 2% · HIGH: bang, machine halts · clear bed → swap bit → reload sheet → restart · 40 s · $130 · —
5. Sheet loaded wrong · player skips clamp step · LOW until cut starts, sheet shifts · stop → reclamp → restart from scratch · 30 s · $90 if cut underway · ruined sheet
6. Mate drops in ("Got a sec?") · scheduled 1–2/day · HIGH: standing in doorway · talk (60 s, leaves happy) or wave off (5 s, 30% returns later) · 5–60 s · $0 · pure time cost; after 2pm he's brought beers
7. Phone rings, new order · 2–4/day · MED: ringing · walk to office → pick up → the job fills in on the notepad line by line → take it / turn it down · 15 s · $0 · unanswered: 50% lose the job
8. Customer pickup · job deadline hits · HIGH: ute at roller door · walk out → hand over → get paid · 15 s · $0 · late: 20% off price
9. Ply delivery · morning · HIGH: truck · sign → stack pallet (3 trips) · 30 s · — · pallet blocks roller door until moved
10. Power trip · rare, more likely with extractor + compressor + heater all on · HIGH: lights out · switchboard → reset → resume cut · 20 s · $0 · —
11. Compressor low · every ~6 cuts · LOW: quieter hiss, weaker vacuum · walk → drain/reset · 10 s · $0 · sheet lifts mid-cut → ruined sheet
12. Offcut bin overflowing · every ~5 cuts · MED: pile on floor · carry to skip (2 trips) · 20 s · $0 · trip hazard, player walks slower in that zone
13. Rush job call · 1/day, afternoon · MED · accept → bump queue · 10 s · — · accept and miss: fewer calls tomorrow
14. Beer o'clock · 2pm · HIGH: fridge light · open fridge → drink · 5 s · $0 · each beer −15% task speed, +10% fumble, stackable
15. Council/safety visit · weekly · HIGH: clipboard person · stop machine, walk them round · 30 game min (only while you're with them) · $300 fine if bag full or extinguisher missing · —

## Scope for prototype 1
Build only #1, #2, #3/#4, #6, #7, #8. One job type, one sheet type, one day. Defer beer, deliveries, power, compressor, council.

## The test
After a 12-minute day a playtester should be able to say, unprompted: how much they made, which one decision cost them the most, and what they'd do differently tomorrow. If they can't, the problems or the money aren't legible enough.

## Open questions
- Side-on or top-down? Lean side-on: the fire lives up in the duct.
- Does the player leave the factory? Yes: the cafe across the road (the first morning's intro, then an optional coffee from day 2).
- Does the mate have a name? Yes, and three lines.

## Playtest 1 (1 Nov 2026): what changed

Bugs
- Two fires on a fresh shed: the base rate alone did it (wear starts fresh; ×1.5 on MDF; 400+ cutting minutes). Day 1 is now capped at one fire (`CONFIG.fire.firstDayMaxFires`), and none while the tour's on.
- Pickup with nothing to start: a sheet off with the board empty rings today's next order call now. The notepad names the next sheet. Every idle stretch over 2 min goes in the day log.
- The mate's answer buttons sat under his speech bubble. The labels now paint over the bubbles, and the bubble moves clear of the stack.
- "The mate never came": the scheduler checked out (1–2 every day over 250 days) and he walks in fine. The day log now records each planned visit, when it fires, and why one was held or dropped.

Cuts
- Toilet, smoko corner, storage and back shed are walled off (their code stays). The sheet racks and spare bags moved to the dock. No "Need the loo" while the toilet's shut.
- One finished pallet: the clutter that looked like a second stacking spot is gone.
- Office: the phone takes calls; the computer is Kerr; ply is ordered on the computer.

Features
- The extinguisher is carried like a can: put it down anywhere, it stays put. A pointer shows where it is when a fire starts, and the day log says where it was.
- Kerr (the office computer): P&L today and yesterday, the rent clock, 3–5 rule-based lines of advice from the day log, costliest first. Ply ordering.
- Order calls fill in on the notepad as the caller talks. Take it or turn it down once it's all there.
- Rent clock: $8,000 due day 20 (config; was $5,750 — competent makes it ~87%, sloppy ~13%). Countdown on the notepad and Kerr. Short on day 20: game over with the week's log.
- The first morning at the cafe: three beats (rent, fires, work), then the walk over and the tour.
- Time scale: 1x while anything's on or you're moving, 4x when the machine's idle, nothing's pending and you've stood still 2 s, 0 behind a full screen. The day log reports fast-forward time per day; more than 15% of the day means the job queue is the problem.
