// Every tunable number in the game lives here. Nothing else should hardcode balance.

/**
 * A rare event: the odd day something big happens. One at most a day, rolled at day start; it takes the time slot of
 * one of that day's scheduled order calls (`replacesInterruption`: that call doesn't ring) rather than stacking on top.
 * Every one is told before it lands (`tell`: seen and heard `seconds` early) and is dealt with in the shed, on foot.
 */
export interface RareEvent {
  id: 'council' | 'bigJob' | 'uteClip';
  name: string;
  weight: number;               // relative odds, among the events that can still happen today
  earliestHour: number;         // it lands no earlier than this
  tell: { seconds: number; cue: string };     // what you see and hear before it lands (1 game minute = 1 real second)
  steps: string[];              // how it's resolved, in the shed
  payoff: number;               // $ earned (or rapport for the council: see `passRapport`)
  penalty: number;              // $ lost
  replacesInterruption: boolean;
  // per event
  waitMinutes?: number;         // council: how long they'll wait to be shown round before writing you up anyway
  tourSeconds?: number;         // council: the walk-round, staying with them
  passRapport?: number;         // council: rapport for a clean inspection
  sheets?: number;              // big job: sheets in the order
  dueDays?: number;             // big job: working days to deliver it all
  priceMult?: number;           // big job: on each sheet's usual price
  trips?: number;               // ute: loads of busted slats to the skip before the dock opens
  tripMinutes?: number;         // ute (sim only: the world walks it): one trip to the skip and back
}

const RARE_EVENTS: RareEvent[] = [
  {
    id: 'council', name: 'Council inspection', weight: 3, earliestHour: 9,
    tell: { seconds: 20, cue: 'A council car pulls up out the front; a car door, then a knock on the roller door' },
    steps: ['Meet them at the roller door', 'Stop the machine', 'Walk them round for 90 s, staying with them'],
    payoff: 0, penalty: 300, replacesInterruption: true,
    waitMinutes: 20, tourSeconds: 90, passRapport: 5,
  },
  {
    id: 'bigJob', name: 'Big job', weight: 3, earliestHour: 8.5,
    tell: { seconds: 20, cue: 'Your mobile buzzes: a builder texts that he\'s about to ring with a big one' },
    steps: ['Answer the office phone', 'Take it (or turn it down)', 'Cut 20 sheets inside three days'],
    payoff: 0, penalty: 0, replacesInterruption: true,
    sheets: 20, dueDays: 3, priceMult: 1.35,
  },
  {
    id: 'uteClip', name: 'Ute clips the roller door', weight: 2, earliestHour: 10,
    tell: { seconds: 15, cue: 'A reversing beeper on the apron, getting closer' },
    steps: ['Pull the busted slats off the roller door', 'Three trips to the skip', 'The dock opens again'],
    payoff: 0, penalty: 0, replacesInterruption: true,
    trips: 3, tripMinutes: 4,
  },
];

export const CONFIG = {
  clock: {
    startHour: 7,
    endHour: 17,          // knock-off; overtime prompt appears here
    overtimeEndHour: 19,  // hard stop
    realMsPerGameMinute: 1000,
  },

  labour: {
    hourlyRate: 45,         // your own wage, accrued per game minute
    overtimeMultiplier: 2,
  },

  economy: {
    startingCash: 1500,
    latePayFraction: 0.95,   // late sheets pay this fraction of price
    bankFee: 50,            // fee when you ignore the bank
    overdraftLimit: 4000,   // the supplier won't take an order that would put cash below -this
    overdraftFeePerDay: 25, // charged at close on any day that ends overdrawn
    weeklyOverheads: 900,   // rent/power/insurance, taken at end of week
    // The downside, softened (the day stays as busy; it just shouldn't bankrupt you):
    lateGraceMinutes: 60,    // a sheet isn't late till this long past its deadline
    pullAfterDays: 3,       // an overdue job is pulled this many days past its due day
    scrapSalvage: 0.75,        // a ruined sheet's offcuts still sell for this share of its board cost
    walkInPerDay: 100,        // there's always one walk-in (cut-to-size from offcuts) at the counter…
    walkInFloor: 2300,        // …and on a slow day you take every walk-in going: the day's takings are topped up to this
    // the walk-ins are people: one at walkInHours[0] if the takings are tracking under the floor (pro rata), another at
    // walkInHours[1] if they still are, or the day's regular then if nobody's come. They square up when they collect at
    // close: the floor's money, shared between the ones you served. Turn one away (or leave them waiting) and it's lost.
    walkInHours: [13, 15],
    walkInMax: 2,
    walkInWaitMinutes: 60,    // they wait at the roller door this long for an answer
    fixCostMult: 0.4,         // parts and call-outs on a fix, as a share of their listed price
  },

  jobs: {
    // only a few sheets are on the board at 7am; the rest arrive by phone through the day
    perDayMin: 3,
    perDayMax: 4,
    // Demand should outrun a competent operator (~10–11 sheets/day): the board never clears.
    orders: {
      callsMin: 3, callsMax: 5,           // order calls per day, including the guaranteed first one
      firstCallFromHour: 8.25, firstCallToHour: 9.5, // the first call always lands in this window
      spreadFromHour: 8.25, spreadToHour: 15, // the rest are spaced evenly across this window…
      jitterMinutes: 40,                  // …each nudged up to ± this
      sheetsMin: 2, sheetsMax: 3,         // sheets per order
      minDemandSheets: 13,                // 7am sheets + orders + drop-off; extra calls are added until the day reaches this
      deadlineMix: { today: 0.6, tomorrow: 0.3, rush: 0.1 }, // today/tomorrow = by close of that day
      rushMinutes: 120,                   // a rush order is due this long after the call
      callbackMinutes: 60,                // an order call that rings out always leaves a voicemail; ring back within this or the job's gone
      lostJobCallPenalty: 1,              // each sheet lost (undelivered by close the day after it's due) = one fewer call tomorrow, never below callsMin
    },
    cutMinutesMin: 25,
    cutMinutesMax: 50,
    // sale price = material cost * markup + cutMinutes * machineRatePerMinute
    priceMarkupMin: 1.3,
    priceMarkupMax: 1.7,
    machineRatePerMinute: 2.0,   // ~$155/hr machine rate, the thing a joiner actually pays for
    loadMinutes: 3,              // time to load a sheet onto the bed
    firstDeadlineMinutesAfterOpen: 80,
    // the "board's full" warning: sheets due today (and overdue) against what's left of the day at about this long a
    // sheet, faults included (a careful operator's rule of thumb). Not a balance number: it only decides when to warn.
    warnMinutesPerSheet: 40,
    lastDeadlineMinutesAfterClose: -45, // deadlines spread evenly from the first to endHour + this
    rush: { priceMult: 1.2, cutMinutesLess: 10, deadlineSlackMinutes: 90, maxPerDay: 2 },
    // a joiner drops a sheet off mid-afternoon: premium if it's cut tonight, otherwise it's gone
    lateDrop: { hour: 15, chance: 0.6, priceMult: 1.3 },
    // Job archetypes, picked by weight for every sheet. Types differ in cost and risk, barely in speed.
    // Price: a standard sheet (markup on priceBasisBoardCost + machine time) times the type's priceMult.
    // boardCost is what the type's sheet costs to buy — paid when you order ply, not when you load it — and what a ruined one loses.
    // chipRisk (bit wear and chipping odds) is the old five-material average, 1.1, for all three.
    // fireChanceMult scales the spot-fire chance while this type is cutting.
    // dullBitRuinsSheet: a dull-bit (chipping) fault scraps the sheet outright — acrylic melts instead of fuzzing.
    priceBasisBoardCost: 98,
    types: [
      { id: 'formwork', name: 'Formwork',       material: '18mm formply', weight: 0.50, boardCost: 95,  priceMult: 1.0, cutMult: 1.0,  bagFillMult: 1.0, fireChanceMult: 1.0, chipRisk: 1.1, dullBitRuinsSheet: false },
      { id: 'joinery',  name: 'Joinery panels', material: '18mm MDF',     weight: 0.35, boardCost: 55,  priceMult: 0.8, cutMult: 1.0,  bagFillMult: 1.5, fireChanceMult: 1.5, chipRisk: 1.1, dullBitRuinsSheet: false },
      { id: 'signage',  name: 'Signage',        material: '6mm acrylic',  weight: 0.15, boardCost: 190, priceMult: 1.7, cutMult: 0.85, bagFillMult: 1.0, fireChanceMult: 1.0, chipRisk: 1.1, dullBitRuinsSheet: false },
    ],
  },

  // Spot fire in the exhaust duct (design doc problem #1). Times are game minutes (1 game min = 1 real s).
  fire: {
    baseChancePerMinute: 0.0025,  // while cutting; aim ~1–2 fires on a competent day
    bagFullAbove: 0.75,           // extractor bag fill (1 - filter health) above this…
    bagFullMult: 2,               // …multiplies the chance by this
    dullBitBelow: 0.3,            // bit health below this counts as dull…
    dullBitMult: 1.5,             // …and multiplies the chance by this (job type's fireChanceMult stacks too)
    smokeOnlyMinutes: 20,         // smoke first; the orange glow shows after this
    ductFireAfterMinutes: 90,     // ignored this long (at breakdown rate 1.0; longer at the ramp's plateau): duct fire — cut stops until it's out
    extractorFireAfterMinutes: 180, // ignored this long (at breakdown rate 1.0): extractor fire — repair bill, machine down for the day
    extractorRepairCost: 400,
    walkToExtinguisherMinutes: 5, // extinguisher hangs by the roller door
    grabMinutes: 1,
    walkToDuctMinutes: 6,
    walkBackMinutes: 5,
    sprayMinutes: { spot: 3, duct: 6 }, // hold E at the duct this long
    refillEveryUses: 2,           // the extinguisher is good for this many fires…
    refillCost: 60,               // …then it's a refill
    // Escalation (spot → duct → extractor) runs at the day's breakdown rate (difficulty, below): a spot fire on a grace day never spreads.
    // The lesson: one scripted spot fire on `day`, the first minute a sheet's cutting from `fromHour`, to teach the extinguisher
    // walk before fires matter. It glows straight away and escalates at escalationMult of the day's rate.
    lesson: { day: 2, fromHour: 10, escalationMult: 0.5 },
  },

  // The difficulty curve. Breakdowns — machine faults (anything that stops the machine or ruins a sheet) and fires spreading past a
  // spot fire — run at this fraction of their full rate on each day of the game: index 0 is day 1, later days use the last value.
  // The first days are for learning the shed: chores, the phone, pickups, deliveries and spot fires still happen.
  difficulty: {
    // plateaus at 0.8 from day 8: at 1.0 an average operator couldn't keep up with the faults (claude/sim-solvency.md)
    breakdownByDay: [0, 0, 0, 0.3, 0.45, 0.6, 0.7, 0.8],
  },

  faults: {
    baseChancePerMinute: 0.011,       // while cutting, before consumable modifiers
    worstConsumableChanceBoost: 1.0,  // chance *= 1 + (1 - worstHealth) * this
    wrongMaterialChanceAtStart: 0.08, // chance a job starts with the wrong board on the bed
    wrongDiagnosisMinutes: 3,         // time wasted on a wrong call
    attentionSplitChanceMult: 1.25,   // fault chance while a friend is hanging around
    attentionSplitDurationMult: 1.5,  // fix steps take longer while distracted
    // the fault sensor upgrade pauses the cut on the faults a machine can measure (temperature, airflow, spindle load);
    // it can't see a chipped edge or the wrong board on the bed
    sensorCatches: ['spindle', 'extraction', 'collet'] as string[],
  },

  consumables: {
    // wearPerMinute: a bit lasts ~4 sheets of plain board, less on laminate (chipRisk scales it)
    bit:        { wearPerMinute: 0.0045, replaceCost: 85,  replaceMinutes: 6,  faultBoostAtZero: 3 },
    spoilboard: { wearPerMinute: 0.0018, replaceCost: 120, replaceMinutes: 10, faultBoostAtZero: 2.5 },
    filter:     { wearPerMinute: 0.0035, replaceCost: 60,  replaceMinutes: 8,  faultBoostAtZero: 3 },
  },

  distractions: {
    chancePerMinute: 0.012,
    maxActive: 2,
    // friend: a mate drops in (how long they stay and how often they come up to you: `visitors`, below)
    friend:  { disengageRapportCost: 5, chatRapportGain: 4, weight: 4,
               beerChatMinutes: 20 }, // from when the fridge opens, yes to a mate means a beer for them and a chat this long
    // window: game minutes it rings (1 game min = 1 real s) — long enough to finish what you're doing and get to the office
    phone:   { window: 30, busyMinutes: 3, ignoreRapportCost: 5, answerRapportGain: 2, weight: 3 },
    // weight 0: board now arrives on real ply deliveries (supply, below), so the random courier is retired
    courier: { window: 3, busyMinutes: 1, ignoredMaterialPenalty: 0.25, signRapportGain: 1, weight: 0 },
    bank:    { window: 2, busyMinutes: 4, ignoreRapportCost: 10, weight: 5 }, // only when cash < 0
  },

  // Mates who drop in (src/data/mates.ts). They stay a while, wander the floor, office and smoko, and every so often
  // come up to you with something to say: an ask (a beer from 2pm, else a cuppa or a yarn), shop talk, or a night out.
  // You answer with a yarn (or a beer, if that's what they asked for) or "flat out, sorry".
  visitors: {
    visitMinutes: 30,          // how long a visit lasts, whatever you say to them
    askMinutes: 3,             // they wait at your elbow this long for an answer; unanswered, they start a yarn anyway
    yarnMinutes: 6,            // a yarn: they chat, you're distracted (a beer means distractions.friend.beerChatMinutes)
    cooldownMin: 3,            // game minutes before they come up again after a yarn or a beer…
    cooldownMax: 8,
    waveOffCooldown: 12,       // …and after "flat out, sorry"
    beersPerVisitor: 2,        // beers a mate asks for in a day; past it, and past beersPerDay, they ask for a yarn instead
    beersPerDay: 4,            // all mates together
    wanderMin: 4,              // minutes at one spot before moving on to another
    wanderMax: 8,
    areas: ['floor', 'office', 'smoko'] as const,
    // Bars for the night-out stories ({bar}, {suburb}). Placeholders: names and suburbs unverified, swap freely.
    bars: [
      { name: 'Dr Morse', suburb: 'Abbotsford' },
      { name: 'The Builders Arms', suburb: 'Fitzroy' },
      { name: 'Labour in Vain', suburb: 'Fitzroy' },
      { name: 'Naked for Satan', suburb: 'Fitzroy' },
    ],
  },

  // Ply on the pallet is real stock, one line per job type. You order it; a truck brings it.
  supply: {
    orderSizes: [4, 8, 12],         // sheets per order
    deliveryFee: 60,                // per delivery, on top of the boards…
    freeDeliveryFrom: 12,           // …waived on an order this big: planning ahead pays
    cutoffHour: 15,                 // orders before this arrive today; after, tomorrow morning
    leadMinutes: 30, leadJitter: 5, // truck turns up this long after a same-day order
    morningMinute: 7.5 * 60,        // next-day orders (and redeliveries) arrive at 7:30am
    maxDeliveriesPerDay: 2,
    signWindowMinutes: 15,          // unsigned this long: the driver leaves, the fee's wasted, back tomorrow
    bundles: 3,                     // trips from the truck to the pallet
    unloadTripMinutes: 7,           // sim only: one bundle from the truck to the pallet and back (the world walks it)
    signMinutes: 1,
    lowStockBelow: 5,               // the notepad warns once a line drops below this
    // day 1: a truck that was ordered (and paid for) last week is at the door when the tour starts
    firstDelivery: { formwork: 8, joinery: 6, signage: 4 }, // nothing starts at its reorder point
  },

  competence: {
    start: 90,
    max: 100,
    recoveryPerMinute: 0.08,
    misclickThreshold: 60,         // below this, misclicks start
    misclickDivisor: 200,          // chance = (threshold - competence) / divisor
    inputDelayMsPerPoint: 12,      // ms of input lag per point below max
    durationPenaltyDivisor: 100,   // step time multiplier = 1 + (max - c)/divisor
    sleepRecovery: 20,             // competence back overnight
  },

  // Beer is a can you carry and drink, not an instant hit. Effects ramp in as you drink and wear off after.
  // The cafe before work (src/world3d/cafe.ts): the coffee's real money; a large one makes you a bit quicker till 11.
  cafe: {
    name: 'Little Bird',
    barista: 'Mai',
    regular: 5, large: 6.5,
    largeSpeedup: 0.05, largeUntilHour: 11,
    maxSeconds: 90,             // real seconds before you head back regardless
    leadHour: 10,               // an overheard job lead rings at this hour
  },

  // The Lease (src/world/lease.ts): a run of 4 weeks on one seed; the rent's due at the end, in the bank.
  lease: {
    weeks: 4,
    rentDue: 8200,              // the landlord's letter (npm run sim -- --lease 200 fit: set so sloppy makes it ~45% of the time, the dealt weeks included)
    // the endings, by the spare at day 20 (cash less the rent): src/world/leaseEnding.ts
    endings: {
      graceShort: 1500,        // short by up to this: "scraped it" — the landlord takes what's there, the rest rides to the next lease
      scrapedUnder: 1500,      // over by less than this: still "scraped it"
      comfortableFrom: 3000,   // under this: "made it"
      flyingFrom: 7000,        // this or more: "flying"
    },
    // The weeks the lease deals (src/world/leaseWeeks.ts): upside a sharp operator can ride and a sloppy one mostly
    // can't (spare capacity to take a big order or a run of rushes; stock planned to catch a cheap week), and quiet
    // weeks that only cost you if you'd have filled them. How many a seed gets varies; each lands on its own week.
    fortunes: {
      countWeights: [1, 2, 2, 1],   // a lease gets 0, 1, 2 or 3 of them, by these weights
      quiet:     { weight: 1, calls: 0.35 },                       // the phone barely rings all week
      bigOrder:  { weight: 2, sheets: 10, type: 'formwork' as const, priceMult: 1.4 }, // one customer, ten sheets, due Friday
      rushes:    { weight: 1, rushMult: 5 },                       // a run of rush jobs (rush pays CONFIG.jobs.rush.priceMult)
      plyDip:    { weight: 1, plyMult: 0.8 },                      // the supplier's clearing stock: ply 20% off for the week
      premium:   { weight: 1, priceMult: 1.3 },                    // a repeat customer who pays over the odds, all week
    },
    wobbleWeek: 3,              // the week a wobble comes (drawn from the pool, not scripted)
    priceRise: 1.15,            // the wobble: ply up this much for the rest of the lease
    quietCalls: 0.6, quietDays: 3, // the wobble: a big customer goes quiet — this share of order calls for these days
  },

  // Dennis, the accountant (src/sim/dennis.ts): one calculated risk a call, at most a call a day, none on day 1. Each bet
  // has an honest stated chance (`hit`) and a stated gain; losses hurt. Money in $; days are game days.
  dennis: {
    enabled: true,              // the balance sim turns him off unless run with `-- dennis`
    name: 'Dennis',
    callChance: 0.65,           // a day he rings at all
    callFromHour: 9, callToHour: 14,
    answerMinutes: 15,          // how long the phone rings
    callbackMinutes: 120,       // "give me a minute": he rings back this much later…
    stillThere: 0.5,            // …and the offer's still on this often
    quietAfter: 3, quietDays: 3,  // three no's in a row: he goes quiet this many days…
    humbleHit: 0.05, humbleScale: 0.6, // …then comes back with safer bets: better odds, smaller stakes and gains
    knockOffEvery: 6,           // he's the one at the roller door at 5 about this often
    coffeeEvery: 20,            // a coffee and a look at the ledger, about monthly
    bets: {
      prebuy: { hit: 0.75, sheets: 20, rise: 0.2, drop: 0.1, settleDays: 3 },
      terms: { hit: 0.75, sheets: 6, priceMult: 1.7, dueDays: 3, settleDays: 6, slowPays: 0.5 },
      bandsaw: { hit: 0.7, cost: 900, premium: 0.25, days: 10, part: 600, settleDays: 4 },
      secondRouter: { hit: 0.75, lease: 700, days: 5, perDay: 340, fireMult: 1.4, powerTripPerMinute: 0.0015 },
      jessHours: { hit: 0.7, days: 3, wagePerDay: 180, orderMargin: 1200 },
      extractorService: { hit: 0.8, cost: 100, days: 5, fireMult: 0.35, faultMult: 0.5, claimed: 400 },
      rushInvoice: { hit: 0.75, priceMult: 1.8, disputePays: 0.4, settleDays: 1 },
      longerLease: { hit: 0.8, discount: 0.25, weeks: 4, breakFee: 250, settleDays: 2 },
      footy: { hit: 0.7, cost: 150, days: 10, callMult: 1.15, claimed: 500 },
    },
  },

  // The factory layout (src/world/layoutPlan.ts): what moving things round does. All relative to the default layout.
  layout: {
    metresPerMinute: 4,           // what a metre of walking costs the sim (game minutes are real seconds; you walk 3 m/s, often with a trolley)
    maxDuctMetres: 7,             // the extractor's duct won't reach the router from further than this
    pickupsPerStack: 1,           // a pickup trip for every stack you carry off
    binFillPerMetre: 0.03,        // offcut bin near the router: you bin more as you go, so it fills faster
    suctionPerMetre: 0.08,        // a longer duct: weaker suction, more extraction faults…
    suctionChipPerMetre: 0.025,   // …and a few more chipped edges
    fireSpreadPerMetre: 0.12,     // a shorter duct: a fire in it reaches the machine faster
    clutterFree: 3,               // stations right round the router before it's cluttered…
    clutterPenalty: 0.04,         // …each one past that, slower walking
    blockedPathMult: 0.94,        // no clear metre-wide run dock → router → finished pallet: everyone walks slower
    circuitReachMetres: 3.5,      // compressor this close to the switchboard: on the extractor and heater's circuit…
    powerTripPerMinute: 0.006,    // …and it trips the power now and then while cutting
    fridgeSightMetres: 8,         // the fridge in sight of the router (no wall between, this close)…
    beerTemptation: 1.6,          // …"Grab one" comes up this much more after 2pm
    moveMinutesFirstDayFree: true,
  },

  beer: {
    canRefund: 0.10,               // container deposit back per empty (knock-off cans, taken back in bags)
    cost: 8,
    fridgeUnlockHour: 14,
    drinkMinutes: 30,              // a can lasts this long in your hand
    sipEveryMinutes: 4,            // a visible sip this often
    slowPerCan: 0.15,              // task and walk speed lost per can, ramping in over drinkMinutes
    fumblePerCan: 0.10,            // chance a step has to be redone, per can, ramping in the same way
    decayMinutes: 60,              // effects wear off linearly over this long after the last sip
    warmAfterMinutes: 30,          // a can put down this long goes warm
    friendDurationMult: 1.5,       // friends stay longer once you've had one
    looAfterBeers: 2,              // "Need the loo" after this many cans since the last visit
    looEveryMinutes: 10,           // each this long without going…
    looSlowStep: 0.05,             // …costs this much walk speed…
    looSlowMax: 0.25,              // …up to this
    toiletMinutes: 10,
    mateGrabsBeerAt: 3,            // this many empties lying about: a mate who's in grabs one from your fridge
  },

  rapport: { start: 100, min: 0, max: 100, rushJobChance: 0.4 }, // rush-job odds on a call scale with rapport

  // Upgrades are capex: they come out of cash but not the day's operating margin.
  upgrades: [
    { id: 'extractor',    name: 'Bigger extractor',          cost: 1800, desc: 'Halves filter wear and extraction alarms', effect: 0.5 },
    { id: 'spareSpindle', name: 'Spare spindle on the shelf', cost: 2400, desc: 'Unlocks a fast, free spindle swap',       effect: 1 },
    { id: 'vacuumZone',   name: 'Second vacuum zone',         cost: 1500, desc: 'Parts lift 60% less often',               effect: 0.4 },
    { id: 'nesting',      name: 'Nesting software',           cost: 1200, desc: '10% less material per sheet',             effect: 0.9 },
    // small: cheap, quick to pay back
    { id: 'premiumBits',  name: 'Premium compression bits',  cost: 350,  desc: 'Bits wear 15% slower',                    effect: 0.85 }, // bit wear multiplier
    { id: 'bagRack',      name: 'Wall-mounted bag rack',     cost: 250,  desc: 'Changing the extractor bag takes 5 min, not 8', effect: 5 }, // filter replaceMinutes
    { id: 'bigBin',       name: 'Bigger offcut bin',         cost: 300,  desc: 'Takes 8 sheets of offcuts, not 5: fewer trips to the skip', effect: 8 }, // sheets of offcuts the bin holds (chores.offcuts)
    { id: 'exhaustExtinguisher', name: 'Extinguisher by the exhaust', cost: 400, desc: 'One hanging right by the duct: fire walks 40% shorter', effect: 0.6 }, // fire walk multiplier
    // mid
    { id: 'faultSensor',  name: 'Fault sensor',              cost: 1500, desc: 'Pauses the cut the moment a fault starts: the sheet waits for you', effect: 1 },
  ],

  week: { days: 5 },

  // The chores, with teeth (claude/sim-chores.md). Off: none of them, and the economy runs exactly as it did before them
  // (`npm run sim -- nochores`).
  chores: true,
  chore: {
    // clamping: each loaded sheet takes four clamps. Every one left off is a chance it shifts mid-cut and is ruined.
    clamp: {
      clamps: 4,
      minutesPerClamp: 0.25,        // added to loading the sheet
      // chance the sheet shifts, by clamps left off (0..4): one's a slip, two's a habit, none is asking for it
      shiftChanceByMissing: [0, 0.03, 0.12, 0.27, 0.48],
    },
    // finished boards pile on the bed until they're carried to the finished pallet; a full bed takes no sheet
    stack: {
      bedHolds: 3,                  // finished boards on the bed before it's full
      unloadMinutes: 2,             // one trip to the finished pallet with the lot
    },
    // offcuts fill the bin; once it's full the next sheet's offcuts go on the floor round it
    offcuts: {
      sheetsToFill: 5,              // sheets of offcuts the bin holds (the bigger bin upgrade: its effect)
      tripMinutes: 4,               // a bag of offcuts (or a load off the floor pile) to the skip
      pileTrips: 2,                 // loads to clear an overflow off the floor
      pileSlowMinutes: 2,           // the pile's in the way: loading and unloading the bed each take this much longer
    },
    // the compressor (vacuum hold-down): water builds up as it runs; the hiss drops when it's due a drain
    compressor: {
      sheetsPerDrain: 6,            // due after this many sheets
      drainMinutes: 2,              // holding the drain valve open
      liftChancePerSheetOver: 0.08, // each sheet loaded past due (after one more on the warning): this much more chance it lifts
      liftChanceMax: 0.5,
    },
  },

  // Off: no rare events at all, and the economy runs exactly as before them (the frozen baseline; `npm run sim -- baseline`).
  rareEvents: true,
  rareEvent: {
    dayChance: 1 / 6,          // about one day in six has one
    fromDay: 4,                // none during the grace days
    debugLeadMinutes: 2,       // ?event=<id> forces one on day 1: it lands this long after the clock starts, plus its tell
    events: RARE_EVENTS,
  },

  // Off: no milestones, and no unlocks from them (also part of the frozen baseline).
  milestones: true,
  milestone: {
    fireFreeDays: 3,           // this many days running without a fire…
    fireChanceMult: 0.6,       // …unlocks the upgraded extractor (spark arrestor): spot fires start this much as often
    bigDayProfit: 1000,        // the first day with at least this operating profit…
    bitSwapMinutes: 3,         // …unlocks a second bit rack by the machine: a bit swap takes this long, not consumables.bit
  },

  ui: {
    swapHintBelow: 0.3,   // the to-do list says "Swap the …" once a consumable's health drops below this
  },

  startingMarginHint: 0.15,
} as const;

export type UpgradeId = (typeof CONFIG.upgrades)[number]['id'];
export type ConsumableKey = keyof typeof CONFIG.consumables;
export type JobType = (typeof CONFIG.jobs.types)[number];
export type JobTypeId = JobType['id'];
