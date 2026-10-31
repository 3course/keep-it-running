// People: the part-timer, the customers' thank-yous, the cans the morning after. Presentation and story numbers —
// the economy's own numbers stay in src/config.ts.
export const PEOPLE = {
  partTimer: {
    name: 'Jess',
    shirt: 0xd9643a,
    /** Days of the week (Game.day, 1-based) she's in before she goes full time. */
    days: [2, 4],
    /** Hours she's in. */
    startHour: 8, endHour: 15,
    /** Hidden trust: what raises it… */
    trust: { onTimeSheet: 1, safeDay: 3, quickFire: 1, answered: 2, showed: 3 },
    /** …and when she asks to go full time (on a day she's in, once it's past this). */
    askAt: 18,
    askHour: 11,
    /** Smoko (cake day). */
    smokoHour: 10,
    /** Chores: she'll do one if she's this close (m) and has been idle this many game minutes. */
    choreReach: 6, choreEvery: 12,
    /** Game minutes between her chat lines, and between questions. */
    chatEvery: 25, askEvery: 70,
  },
  gifts: {
    /** Chance a happy customer comes back the next day with something (a design's own `thanks` overrides the kind). */
    chance: 0.45,
    /** They turn up between these hours, stay this long (game minutes), and leave it by the door if you're busy. */
    fromHour: 9, toHour: 14, stayMinutes: 18,
    /** Cans in a slab. */
    slab: 24,
  },
  cans: {
    /** Cans left about the morning after a group night: per beer drunk (everyone's), capped. */
    perBeer: 0.6, max: 18,
    /** You carry up to this many at once. */
    carry: 6,
    /** A full refund bag. */
    bag: 20,
  },
  night: {
    /** The arc: shop talk until this turn (or this many beers), the big stuff from this turn and beer. */
    lifeFromTurn: 4, lifeFromBeers: 2, deepFromTurn: 7, deepFromBeers: 3,
    bigIdeaAtBeers: 3,
    callFromBeers: 2,
    /** Turns after the call before they walk in. */
    arriveAfter: 2,
    /** Beers a called friend brings (into the fridge, then drunk). */
    guestBrings: 6,
    /** Slur filter strength per beer past the first, and its cap. */
    slurPerBeer: 0.075, slurMax: 0.32,
  },
} as const;
