// Every tunable number in the game lives here. Nothing else should hardcode balance.

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
    latePayFraction: 0.8,   // late sheets pay this fraction of price
    bankFee: 50,            // fee when you ignore the bank
    overdraftLimit: 1000,   // the supplier won't take an order that would put cash below -this
    overdraftFeePerDay: 25, // charged at close on any day that ends overdrawn
    weeklyOverheads: 900,   // rent/power/insurance, taken at end of week
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
      { id: 'signage',  name: 'Signage',        material: '6mm acrylic',  weight: 0.15, boardCost: 190, priceMult: 1.7, cutMult: 0.85, bagFillMult: 1.0, fireChanceMult: 1.0, chipRisk: 1.1, dullBitRuinsSheet: true },
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
    ductFireAfterMinutes: 90,     // ignored this long: duct fire — cut stops until it's out
    extractorFireAfterMinutes: 180, // ignored this long: extractor fire — repair bill, machine down for the day
    extractorRepairCost: 800,
    walkToExtinguisherMinutes: 5, // extinguisher hangs by the roller door
    grabMinutes: 1,
    walkToDuctMinutes: 6,
    walkBackMinutes: 5,
    sprayMinutes: { spot: 3, duct: 6 }, // hold E at the duct this long
    refillEveryUses: 2,           // the extinguisher is good for this many fires…
    refillCost: 60,               // …then it's a refill
  },

  faults: {
    baseChancePerMinute: 0.011,       // while cutting, before consumable modifiers
    worstConsumableChanceBoost: 1.0,  // chance *= 1 + (1 - worstHealth) * this
    wrongMaterialChanceAtStart: 0.08, // chance a job starts with the wrong board on the bed
    wrongDiagnosisMinutes: 3,         // time wasted on a wrong call
    attentionSplitChanceMult: 1.25,   // fault chance while a friend is hanging around
    attentionSplitDurationMult: 1.5,  // fix steps take longer while distracted
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
    // friend: hovers for `hoverMinutes` then starts chatting unless you send them off
    friend:  { durationMin: 8, durationMax: 18, hoverMinutes: 3, disengageRapportCost: 5, chatRapportGain: 4, weight: 4 },
    // window: game minutes it rings (1 game min = 1 real s) — long enough to finish what you're doing and get to the office
    phone:   { window: 30, busyMinutes: 3, ignoreRapportCost: 5, answerRapportGain: 2, weight: 3 },
    // weight 0: board now arrives on real ply deliveries (supply, below), so the random courier is retired
    courier: { window: 3, busyMinutes: 1, ignoredMaterialPenalty: 0.25, signRapportGain: 1, weight: 0 },
    bank:    { window: 2, busyMinutes: 4, ignoreRapportCost: 10, weight: 5 }, // only when cash < 0
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
  beer: {
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
  ],

  week: { days: 5 },

  ui: {
    swapHintBelow: 0.3,   // the to-do list says "Swap the …" once a consumable's health drops below this
  },

  startingMarginHint: 0.15,
} as const;

export type UpgradeId = (typeof CONFIG.upgrades)[number]['id'];
export type ConsumableKey = keyof typeof CONFIG.consumables;
export type JobType = (typeof CONFIG.jobs.types)[number];
export type JobTypeId = JobType['id'];
