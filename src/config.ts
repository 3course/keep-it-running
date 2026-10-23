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
    latePayFraction: 0.7,   // late sheets pay this fraction of price
    bankFee: 50,            // fee when you ignore the bank
    weeklyOverheads: 900,   // rent/power/insurance, taken at end of week
  },

  jobs: {
    // only a few sheets are on the board at 7am; the rest arrive by phone through the day
    perDayMin: 3,
    perDayMax: 4,
    orders: {
      callsMin: 2, callsMax: 4,           // order calls per day, including the guaranteed first one
      firstCallFromHour: 8.25, firstCallToHour: 9.5, // the first call always lands in this window
      firstHour: 9, lastHour: 15,         // the rest land at random times in this window
      sheetsMin: 1, sheetsMax: 3,         // sheets per order
      slackMinutes: 150,                  // due = call time + the order's cut time + this
      missedKeepChance: 0.5,              // unanswered: chance they leave a message instead of going elsewhere
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
  },

  materials: [
    { name: '16mm white melamine', cost: 65, chipRisk: 1.4 },
    { name: '18mm Vic Ash veneer MDF', cost: 180, chipRisk: 1.1 },
    { name: '12mm MDF', cost: 40, chipRisk: 0.5 },
    { name: '16mm Egger laminate', cost: 95, chipRisk: 1.6 },
    { name: '17mm hoop pine ply', cost: 110, chipRisk: 0.9 },
  ],

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
    phone:   { window: 2, busyMinutes: 3, ignoreRapportCost: 5, answerRapportGain: 2, weight: 3 },
    courier: { window: 3, busyMinutes: 1, ignoredMaterialPenalty: 0.25, signRapportGain: 1, weight: 2 },
    bank:    { window: 2, busyMinutes: 4, ignoreRapportCost: 10, weight: 5 }, // only when cash < 0
  },

  competence: {
    start: 90,
    max: 100,
    beerPenalty: 15,
    beerCost: 8,
    fridgeUnlockHour: 14,
    recoveryPerMinute: 0.08,
    beerFriendDurationMult: 1.5,   // friends stay longer once you've had one
    misclickThreshold: 60,         // below this, misclicks start
    misclickDivisor: 200,          // chance = (threshold - competence) / divisor
    inputDelayMsPerPoint: 12,      // ms of input lag per point below max
    durationPenaltyDivisor: 100,   // step time multiplier = 1 + (max - c)/divisor
    sleepRecovery: 20,             // competence back overnight
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

  startingMarginHint: 0.15,
} as const;

export type UpgradeId = (typeof CONFIG.upgrades)[number]['id'];
export type ConsumableKey = keyof typeof CONFIG.consumables;
