# Why average goes broke, and what fixes it — `world` @ 7169bb0 (25 Oct 2026)

**Setup:** continuous 4-week games (20 working days), 100 seeds, scripts buying nothing unless noted.

**No game code or config changed.** The study ran in a temporary copy of the sim, with each candidate fix applied as a runtime override. Neither is committed.

**Day numbering:** working days, so week 2 is days 6–10. The $900 weekly overheads come out at the close of days 5, 10, 15 and 20.

## 1. Diagnosis

### Cash at each day's close (100 seeds)

| Day | Average p25 | Average median | Average p75 | Competent median | Average seeds overdrawn | Seeds with a refused ply order | First overdrawn (cumulative) |
|---|---|---|---|---|---|---|---|
| 1 | $931 | $1,406 | $1,850 | $1,529 | 0 | 0 | 0 |
| 3 | $2,967 | $3,424 | $3,855 | $3,381 | 0 | 0 | 0 |
| 5 | $3,855 | $4,346 | $5,029 | $4,758 | 0 | 0 | 0 |
| 6 | $3,041 | $3,724 | $4,176 | $4,317 | 0 | 0 | 0 |
| 8 | $3,052 | $3,789 | $4,645 | $5,113 | 0 | 0 | 0 |
| 10 | $2,115 | $3,404 | $3,995 | $5,867 | 0 | 0 | 0 |
| 11 | $1,463 | $2,141 | $2,859 | $5,147 | 6 | 4 | 6 |
| 12 | $1,070 | $2,021 | $3,096 | $5,740 | 4 | 4 | 9 |
| 13 | $1,022 | $1,524 | $2,698 | $5,721 | 12 | 6 | 14 |
| 14 | $732 | $1,457 | $2,796 | $6,056 | 15 | 9 | 20 |
| 15 | −$17 | $874 | $1,810 | $6,323 | 26 | 6 | 28 |
| **16** | −$604 | **$69** | $935 | $5,690 | 50 | 40 | **53** |
| 17 | −$460 | $66 | $1,363 | $6,004 | 45 | 38 | 61 |
| 18 | −$572 | −$85 | $966 | $6,415 | 55 | 50 | 68 |
| 19 | −$696 | −$302 | $626 | $6,931 | 60 | 54 | 76 |
| 20 | −$1,508 | −$898 | $41 | $7,288 | 73 | 45 | 80 |

**First overdrawn close:**
- 80 of 100 seeds are overdrawn at some close by day 20.
- The median first day is **day 16**, the first day of week 4 (quartiles: days 15–17).
- Average peaks at about $4,300 on day 5. It drifts down through week 2, then falls about $500 a day through weeks 3–4.
- Competent climbs the whole way.

### Weekly operating profit, before the $900 overheads

| Script | Week 1 | Week 2 | Week 3 | Week 4 |
|---|---|---|---|---|
| Average | $3,944 | $187 | −$1,233 | −$1,302 |
| Competent | $4,062 | $2,002 | $1,587 | $1,610 |

### Where the money goes, per working day

The first column is average in the five days before its first overdrawn close (80 seeds). The other two are average and competent over the same stretch of the game (days 6–15).

| | Average, week before | Average, days 6–15 | Competent, days 6–15 |
|---|---|---|---|
| Revenue in | $2,139 | $2,301 | $2,957 |
| Ply bought (cash out) | $1,250 | $1,419 | $1,409 |
| Boards cut (cost) | $1,310 | $1,331 | $1,343 |
| — of which scrapped | **$248** | $226 | $127 |
| Late-pay penalty (20% kept back) | **$516** | $457 | $86 |
| Lost jobs (price never paid) | **$293** | $176 | $0 |
| Beers (yours + mates') | $3 | $3 | $3 |
| Labour | $622 | $621 | $627 |
| Consumables | $192 | $205 | $260 |
| Fault fixes | $218 | $208 | $309 |
| Fees (delivery, bank) | $27 | $36 | $56 |
| Overdraft fees | $0 | $1 | $0 |
| Overheads (per day) | $180 | $180 | $180 |
| Sheets cut / scrapped | 11.3 / 2.5 | 11.7 / 2.3 | 13.1 / 1.1 |
| **Backlog at close** (of which overdue) | **15.8 (11.7)** | 13.3 (9.2) | 1.1 (0.1) |
| Sheets paid late / lost per day | 11.0 / 1.2 | 9.7 / 0.7 | 1.8 / 0.0 |
| Sheets declined per day | 0.0 | 0.0 | 0.9 |
| Rapport | 93 | 92 | 11 |
| Net cash change per day | −$267 | −$299 | +$236 |

### Why

**Average never turns work down.** It answers every order call and every voicemail. Competent declines when the sheets due today exceed what it can cut by 5pm, about 0.9 sheets a day.

1. **The backlog builds:** demand outruns average's ~11.5 sheets/day. By week 3 it carries 13–16 sheets, ~10 of them already overdue.
2. **Nearly everything is paid late:** it cuts ~11 sheets a day and ~10 of them are paid late at 80%. That's ~$460–520 a day kept back.
3. **The oldest jobs get pulled:** $180–290 a day of work done for nothing, or never done.
4. **Scrap on top:** about $230 a day of ruined boards (2.3/day, twice competent's), from the faults it leaves.

**Its operating profit goes negative in week 3,** before it's overdrawn. The $900 weekly overheads and up-front ply (~$1,300–1,400 a day) then take the cash down. Refused ply orders come **after** the damage: sheets cut are 11.3 a day both before and after the first overdrawn close, and stock-outs rise only 0 → 5 minutes a day. So the refused orders aren't what sinks it; they're where an operating loss shows up.

**Why a fresh full-rate week looked fine (+0.4%):** it starts with an empty board. The continuous game shows the backlog compounding. Average's rapport stays high (it pleases everyone), which keeps the calls coming.

## 2. Candidate fixes

Each was applied on its own, in the sim only:
1. **Ramp plateau at 0.8:** breakdowns top out at 0.8 from day 8 instead of 1.0.
2. **Supplier credit:** up to $1,500 of ply on account, paid 5 working days (a week) later.
3. **Arranged overdraft:** $2,000 instead of $1,000, with 1% a week interest on the overdrawn balance instead of the $25/day fee. Bank calls are unchanged.
4. **Sensor first:** average buys the fault sensor first (then cheapest-first, one a week, above a $1,500 buffer). Competent and sloppy use their normal buying policies.

**Solvent through week 4** means never refused ply for lack of money, and ending week 4 within what the business can draw on: net cash (cash minus supplier account owed) ≥ 0, or ≥ −$2,000 with the overdraft.

| Variant | Average solvent | Average never refused | Average wk 3–4 margin | Average wk 3–4 profit/week | Competent wk 3–4 margin | Sloppy wk 3–4 profit/week |
|---|---|---|---|---|---|---|
| Today | 25/100 | 40/100 | −12.9% | −$1,268 | 10.8% | −$2,846 |
| 1. Plateau 0.8 | 44/100 | 56/100 | −7.2% | −$776 | 14.2% | −$2,579 |
| 2. Supplier credit $1,500 | 20/100 | 67/100 | −11.3% | −$1,182 | 10.9% | −$3,025 |
| 3. Overdraft $2,000 + interest | 56/100 | 59/100 | −11.6% | −$1,201 | 10.8% | −$2,952 |
| 4. Average buys sensor first | 11/100 | 20/100 | −7.7% | −$762 | 18.0%¹ | −$2,469 |
| (reference: buying, cheapest-first) | 7/100 | 13/100 | −12.8% | −$1,285 | 18.0%¹ | −$2,469 |
| Plateau 0.8 + overdraft $2,000 | 79/100 | 81/100 | −7.1% | −$765 | 14.2% | −$2,549 |
| Credit + sensor first | 6/100 | 44/100 | −7.3% | −$770 | 17.9%¹ | −$2,487 |
| Plateau + credit | 46/100 | 86/100 | −6.5% | −$713 | 14.2% | −$2,720 |
| Plateau + credit + sensor first | 21/100 | 69/100 | −3.0% | −$333 | 20.9%¹ | −$2,411 |
| *Diagnostic: average declines when overcommitted* | **99/100** | **100/100** | **+4.4%** | **+$570** | 10.8% | −$2,846 |
| *Declines + plateau 0.8* | **100/100** | **100/100** | **+9.5%** | **+$1,289** | 14.2% | −$2,579 |
| *Declines + overdraft $2,000* | 100/100 | 100/100 | +4.4% | +$570 | 10.8% | −$2,952 |

¹ With its buying policy, competent spends down to its $1,500 buffer, then gets caught by the $900 overheads plus up-front ply. It's overdrawn on ~24 of 100 seeds (solvent 75/100 in those rows). Separate issue: its buffer is too thin.

**Sloppy is never profitable and never solvent in any variant.** It loses $2,400–3,000 a week in weeks 3–4 everywhere; its margins there are meaningless because it has almost no revenue.

### What each fix does

- **Plateau 0.8:** the only candidate that improves average's operating result (+5.7 points; scrap and fixes fall). But average still loses ~$775 a week, and it lifts competent to 14.2% (inside 10–20%).
- **Supplier credit:** stops some refusals (67/100 never refused) but just moves the money owed a week later; the loss is unchanged. Competent doesn't need it.
- **Overdraft $2,000:** buys time (only 31 seeds go past the −$2,000 limit by day 20, median day 20) but doesn't stop the loss. On a longer game it just goes broke later, deeper in debt.
- **Sensor first:** cuts scrap and helps the margin about as much as the plateau. But spending $1,500 at the end of week 1 drains its cash, so it's overdrawn sooner (day 13). It helps the business and hurts the bank balance.
- **None of the four, alone or combined, makes average profitable in weeks 3–4.** The best (all three together) still loses ~$333 a week.

## 3. Recommendation

**Fix the cause (over-commitment), and add the 0.8 plateau.**

1. **Make turning work down a visible, easy choice.** This is a game change, not one of the four, and is the one that works. When the board's due-today sheets outrun what can be cut by 5pm:
   - the notepad says so (e.g. "Board's full: 9 due today, time to cut about 7");
   - the phone's "Turn it down" label is highlighted on order calls and callbacks.

   Late pay and pulled jobs already punish over-commitment; the player just can't see it coming. The diagnostic shows it's enough: average solvent on 99/100 seeds at +4.4%, without touching any balance number.
2. **Plateau the breakdown ramp at 0.8.** On top of (1), average reaches +9.5% in weeks 3–4 and is solvent on 100/100. Competent goes to 14.2%, still in the 10–20% band, and sloppy stays deeply negative (−$2,579 a week).

**Not recommended:**
- **Supplier credit and a bigger overdraft:** they only postpone the same loss.
- **Sensor-first buying:** it's sound advice but drains the cash early. Leave it to the player, perhaps as a hint once scrap is high.
- **Competent's buying buffer** (separate issue): raise it to cover a week's overheads plus a ply order (~$2,500).

**Caveat:** "declines when overcommitted" is the sim script's behaviour, standing in for a player who heeds a warning. Whether real players do is a playtest question. If they don't, plateau 0.8 + overdraft $2,000 is the fallback that keeps average afloat on 79/100 seeds, while it still loses money.
