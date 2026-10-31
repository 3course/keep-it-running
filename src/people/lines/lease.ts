// The Lease's words: the landlord's letter, Sunday postcards, the Saturday market, the week-3 wobble's notices, and
// the five endings (with a line from everyone who's part of the shed by then). Speech bubbles: keep lines under ~100.
// Templates (filled from the run): {rent} {cash} {days} {landlord} {gifts} {best} {bestAmount} {worst} {worstAmount}
// {piece} {won} {total} {net} {jess} {mate} {lease} {beers} {nights} {sheets} {price} {buyer} {kept} {owed} {carried}
import type { Ending } from '../../world/leaseEnding.js';
import type { FortuneKind } from '../../world/leaseWeeks.js';
export type { Ending };
export interface EndingLines { headline: string; headlineRide?: string; you: string[]; youRide?: string[]; landlord: string[]; landlordRide?: string[]; byPerson: Record<'eggby' | 'courtney' | 'tim' | 'jess' | 'dennis', string[]> }
export type WobbleKind = 'priceRise' | 'quietCustomer' | 'extractorDue' | 'jessAnswer';

export const LEASE_LINES = {
  landlord: 'Graham Pettifer',
  /** Day 1: an envelope under the roller door. Dry, decent. */
  letter: [
    'Dear tenant. Hope the shed is treating you well. It treated me well for thirty years.',
    'Rent for the term is {rent}, in the bank by close of business, {days} working days from today.',
    "After that the lease is up for renewal. I'd like to renew. I'd like the rent more.",
    "No need to reply. Just keep the gutters clear and the roller door oiled. She sticks in winter.",
    'Regards, {landlord}. P.S. The fridge was there when I bought it. It goes with the building.',
  ],
  /** Sunday's one line (the shed is shut). */
  postcards: [
    'Sunday. Slept till ten. The shed sat there all day being a shed, and that was fine.',
    'Sunday. Long walk along Merri Creek. Saw a heron. It looked like it had a lease too.',
    'Sunday. Thought about {best} over a slow coffee. What a day that was.',
    'Sunday. Dusted the {gifts} thank-yous on the shelf. Read every card again. Soft.',
    'Sunday. Drove past the {piece} on purpose. Still there. Still good.',
    "Sunday. {jess} texted a photo of a sign in Preston: 'we could do better than this'. We could.",
    'Sunday. {mate} rang to say nothing much for forty minutes. Best call of the week.',
    'Sunday. Roast at Mum\'s. She asked how the shop was going. Said "good" and meant it.',
    'Sunday. Washed the work shirts. The sawdust came out. Most of it. Some of it is me now.',
    'Sunday. Sat in the sun at Edinburgh Gardens and did nothing on purpose. Nailed it.',
    'Sunday. Did the books at the kitchen table. Not scary. Mostly not scary.',
    "Sunday. Rode the tram to the end of the line and back. Didn't think about ply once. Twice.",
    'Sunday. Cooked a proper dinner. Ate it at a table. Like a person with a life.',
    'Sunday. Footy on the radio, washing on the line, one ear on the score. Perfect.',
    'Sunday. Popped in to check the shed. Nothing to check. Said goodnight to the router anyway.',
    'Sunday. Hung the next week\'s jobs on the fridge at home. Looks like a good week.',
    'Sunday. Rain all day. Couch, blanket, a book. The roller door can wait.',
    "Sunday. Sketched a shelf for no one in particular. Might cut it. Might frame the sketch.",
    'Sunday. {sheets} sheets this lease so far. Counted them twice in bed. Slept like a log.',
    'Sunday. Walked past three shopfronts and mentally re-signed all of them. Occupational hazard.',
  ],
  /** The optional Saturday market: selling the after-hours pieces. */
  market: {
    open: [
      'Saturday market. A trestle, a thermos and every odd thing we cut after hours.',
      'Market day. Set up between the honey lady and a bloke selling succulents in teacups.',
      "Saturday. Trestle up at seven. Sign says 'Made in a shed in the inner north'. True.",
      "Market's open. Sun's out. The pieces look better in daylight. Most people do.",
      'Saturday market. Thermos, folding chair, a tin for the change. Shopkeeping, but outdoors.',
    ],
    sold: [
      'Sold the {piece} to {buyer} for {price}. They carried it off like a newborn.',
      '{price} for the {piece}. {buyer} said it was "exactly the thing". It was.',
      "The {piece} went to {buyer}. {price}. Didn't even haggle. Wanted to hug them.",
      "{buyer} took the {piece} home for {price}. Asked who made it. Said: 'a shed'.",
      'Sold! The {piece}, {price}, to {buyer}. Told them it was cut with love. And a 6mm bit.',
      "{price} in the tin for the {piece}. {buyer} wants another one for their sister.",
      'The {piece} found a home with {buyer}. {price}. Bit sad to see it go. Mostly chuffed.',
    ],
    nothing: [
      'Nothing to sell this week. Bought a sausage and some honey instead. Good market.',
      "Table's empty: no after-hours pieces this week. Went for the egg-and-bacon roll.",
      "Nothing on the trestle this week. Had a chat with the succulent bloke. He's lovely.",
      'No stock. Wandered the stalls with a coffee, taking notes on other people\'s signage.',
      'Nothing cut, nothing to sell. Bought a teacup succulent. Named it Spoilboard.',
    ],
    skip: [
      'Skipped the market. Slept in till nine. The pieces will keep.',
      'No market today. Pancakes. A second cup of tea. The trestle stays folded.',
      'Slept in. Heard the market from bed, faintly. Rolled over. Excellent decision.',
      'Market can wait. Lay in the sun on the back step like a cat. Recharging.',
      'Gave the market a miss. Long breakfast, short walk, longer nap.',
    ],
  },
  /** Week 3's wobble: the notice on the notepad and in the log. */
  wobbles: {
    priceRise: [
      'The timber yard rang: ply is up from today. "Sorry, love, it\'s everyone." Sheets cost more now.',
      "Invoice from the yard, new prices in red pen. Ply's up. Same sheets, dearer.",
      'Ply price rise, effective immediately. The yard bloke sounded more upset about it than us.',
    ],
    quietCustomer: [
      'Your biggest regular has gone quiet. No calls for a few days. Probably just busy. Probably.',
      'The phone is suspiciously calm. Your best builder is on a job up in Kilmore for a bit.',
      "Your steadiest customer's away on site. Fewer calls this week. The phone looks lonely.",
    ],
    extractorDue: [
      'The extractor service sticker says: overdue. Fires come easier when she\'s wheezing.',
      'Extractor service due. She\'s working, but she sounds like Eggby walking up stairs.',
      "Sticker on the extractor: SERVICE DUE. In someone else's handwriting. Fair enough.",
    ],
    jessAnswer: [
      '{jess} wants an answer about full time. Not a pushy note. A very hopeful one.',
      'A note on the bench from {jess}: "No rush! But… full time? Any thoughts? No rush!"',
      '{jess} has asked properly about full time. She deserves a proper answer this week.',
    ],
  } as Record<WobbleKind, string[]>,
  /** A week the lease deals, on its first morning (src/world/leaseWeeks.ts). */
  weeks: {
    quiet: [
      "Quiet week. The phone's barely ringing and the board's thin. Everyone's away, apparently.",
      'School holidays. Half the builders are at the coast. It\'s going to be a slow one.',
    ],
    bigOrder: [
      'Big order in: one builder, ten sheets of formply, due Friday. Clear the decks.',
      'Ten sheets for one job, due Friday, and they\'re paying well for it. Get cutting.',
    ],
    rushes: [
      "Everyone wants it yesterday this week. Rush jobs, rush prices. Keep the bed full.",
      'A run of rush jobs coming. Pays a premium, if you can turn them round.',
    ],
    plyDip: [
      "The yard's clearing stock: ply's 20% off all week. Buy ahead while it's cheap.",
      'Cheap ply this week. The yard over-ordered. Stock up.',
    ],
    premium: [
      'A repeat customer with deep pockets this week. Orders pay over the odds.',
      'Good week for prices: the regulars are paying a premium. Do them proud.',
    ],
  } satisfies Record<FortuneKind, string[]>,
  /** The letter's extra line when last lease's shortfall rode over. */
  letterCarried: "That's the usual, plus the {carried} that rode over from last time. No rush. Well. Some rush.",
  /** Day 20: how it went, and a line from everyone. */
  endings: {
    flying: {
      headline: 'Rent paid. Flying.',
      landlord: [
        "Rent's in, and then some, I'd guess. Renewal's yours. Don't let me put it up. — {landlord}",
        "{rent}, received. Thirty years and I never had a month like your month.",
        "Paid in full and early. Mate, I might come and work for you.",
      ],
      you: [
        '{rent} paid and {cash} in the bank. Twenty days. We are flying.',
        "Rent's paid and there's real money left. Real decisions now. Good ones.",
        "{sheets} sheets, {gifts} thank-yous, and enough left over to choose what's next.",
      ],
      byPerson: {
        eggby: [
          'This is the best thing a shed has ever done. I say that as a man who has seen sheds.',
          "{best}! {bestAmount}! I'm getting it engraved. You'll cut the engraving. Obviously.",
          "Flying. Civilisation achieved. Next step: an awning. Then: Rome.",
        ],
        courtney: [
          "FLYING! We're FLYING! Bron says this is what Golden Plains feels like on the Sunday!",
          "I'm crying! Happy crying! {gifts} gifts! You're basically a local legend now!",
          "The {piece}! The money! The {piece}! I've run out of exclamation marks! Here's more!!",
        ],
        tim: [
          "Should've bought the shed in 2012. Then again, you're doing all right without it.",
          '{sheets} sheets and a fat bank balance. Champ. Write that down. Frame it.',
          'Even {worst} looks small from up here. {worstAmount}? Pocket change, champ.',
        ],
        jess: [
          "Look at that number! I'm screenshotting the bank. Is that allowed? I've done it.",
          "{sheets} sheets! And I get to keep coming in every day. Best job I've had.",
          'The {piece} was my favourite. Can we make another one? For us this time?',
        ],
        dennis: [
          "I've got a spreadsheet ready. Tab one: second router. Tab two: {jess}. Tab three: a holiday.",
          "Spreadsheet's open. {won} of {total} came good, {net} net. Now: what do we do with the rest?",
          "I took the liberty. Three options, colour-coded. Gold's my favourite. I never use gold.",
        ],
      },
    },
    comfortable: {
      headline: 'Rent paid, with room to spare.',
      landlord: [
        "Rent's in, early and in full. Lease is yours again if you want it. — {landlord}",
        "{rent}, received. You've done more with that shed than I did in thirty years.",
        'Renewal papers in the post. Keep the gutters clear. And keep doing whatever you\'re doing.',
      ],
      you: [
        '{rent} in the bank and {cash} to spare. Twenty days. One shed. Not bad at all.',
        'Paid the rent with change left over. Sat on a crate and grinned at the router.',
        "{sheets} sheets, {gifts} thank-yous, rent's paid. The shed stays. We stay.",
      ],
      byPerson: {
        eggby: [
          'Rent paid in full. That deserves a speech. This is the speech. Civilisation.',
          '{best}. {bestAmount}. I want it on a plaque. You own a router. Make the plaque.',
          "{nights} nights on the crates, {beers} beers. Proper. I'd sign another lease for that.",
        ],
        courtney: [
          'YOU DID IT! With money LEFT OVER! I am telling Bron! I am telling Bron\'s DOG!',
          "{gifts} thank-you gifts! That's not a business, that's a FAN CLUB. Love you.",
          'The {piece}! I still think about the {piece}! We\'re having a party. I\'ve made shirts.',
        ],
        tim: [
          "Rent paid with change. Should've bought the shed in 2012. Write that down.",
          '{sheets} sheets. That\'s a lot of sheets. That\'s a bedding company. Proud of you, champ.',
          "Even {worst} turned out fine. {worstAmount}. Character building. You've got character now.",
        ],
        jess: [
          "We made it! With room! I'm framing the rent receipt. Is that weird? I'm doing it.",
          '{sheets} sheets! I counted. Well, I estimated, and then I counted. It was {sheets}.',
          "Best twenty days. I liked the {piece} best. Can we do another lease? Please?",
        ],
        dennis: [
          '{won} from {total} on my bets, {net} net. Rent plus margin. I\'m misty. So\'s the spreadsheet.',
          'Odds you\'d make rent comfortably? I had it at three in five. Delighted to be wrong low.',
          'Best day {bestAmount}, {best}. I\'ve highlighted the cell in gold. I never use gold.',
        ],
      },
    },
    made: {
      headline: 'Rent paid. A bit left over.',
      landlord: [
        "Rent's in, in full. Lease is yours if you want it. Clear the gutters. — {landlord}",
        '{rent} received. No fuss. My favourite kind of tenant.',
        "Paid up. I'll send the renewal. Keep doing what you're doing, only a bit more.",
      ],
      you: [
        '{rent} paid, {cash} left. Not a fortune. Not nothing. The shed stays.',
        "Made it. Didn't sweat the last day too much. Only a little bit.",
        "{sheets} sheets, rent paid, a bit in the tin. That'll do. That'll more than do.",
      ],
      byPerson: {
        eggby: [
          "Made it. Not a squeak, not a fanfare. A solid, decent result. Very civilised.",
          '{best} did the heavy lifting. {bestAmount}. Remember that day. I will.',
          "Rent paid with a bit left. That's the dream, isn't it? The modest dream.",
        ],
        courtney: [
          "You did it! I knew you would! Well, I hoped! Same thing! Get in here!",
          'Rent PAID! Bron owes me ten bucks. She said you would. So did I. We both win.',
          "The {piece}! Still thinking about it! Let's do a small party. A medium party.",
        ],
        tim: [
          "Made it. Good. Next one, a bit more. That's how they get you. Write it down.",
          '{sheets} sheets. Solid. Like a good parma. Not fancy. Right.',
          "Should've bought in 2012. But you're all right. You're doing all right.",
        ],
        jess: [
          "We made it! I knew we would! I wrote it on the whiteboard and everything!",
          "Next lease I'm going to be faster at stacking. You'll see. Watch me.",
          'The {piece} was the best one. I told my mum about it. She wants one.',
        ],
        dennis: [
          'Paid, with a little margin. {won} of {total} on my calls, {net} net. Respectable.',
          "I had it at four in five. Spot on. I'm unbearable when I'm spot on.",
          "There's {cash} spare. I'd keep most of it. And spend a little on a round.",
        ],
      },
    },
    scraped: {
      headline: 'Rent paid. Only just.',
      /** Short, but inside the grace: the landlord takes what's there and the rest rides. */
      headlineRide: 'Near enough. The rest rides.',
      landlordRide: [
        "{owed} short. Pay what you've got. The rest rides to next lease. I'm not a monster. — {landlord}",
        "Near enough's good enough, this once. The {owed} can ride. Keep the gutters clear.",
        "I'll take what's there. {owed} rides over. I've had worse tenants. I've had much worse.",
      ],
      youRide: [
        '{owed} short. Graham took what was there and let the rest ride. We stay.',
        "Close. Not quite. Close enough, as it turns out. The shed's still ours.",
        'Paid what we had. {owed} to find next lease. Laughed about it eventually.',
      ],
      landlord: [
        "Rent's in. Just. I could hear you sweating from Ivanhoe. Lease is yours. — {landlord}",
        "{rent} received, by the skin of the teeth. I like a tenant who makes it close. Builds character.",
        "Paid to the dollar, near enough. I'll renew. Maybe buy yourself a smaller kettle.",
      ],
      you: [
        '{rent} paid, {cash} left. Not much. Enough. The shed stays open.',
        "Made it by a whisker. Sat down. Laughed. Didn't stop for a while.",
        'Rent paid with the change from the market tin. Every dollar pulled its weight.',
      ],
      byPerson: {
        eggby: [
          "Close. Very close. But a win's a win. We'll have a small ceremony. Medium ceremony.",
          '{worst} nearly did us. {worstAmount}. And yet. Here we are. On crates. Civilisation.',
          "You scraped it. Scraping's a craft. Ask any good painter.",
        ],
        courtney: [
          "That was TOO close! My heart! I aged a year! Worth it! Group hug! Get in here!",
          'Made it by a hair! Like Golden Plains, last tram, running, holding a hat. Glory!',
          "{nights} nights, {beers} beers, and you STILL paid the rent. Superhuman, honestly.",
        ],
        tim: [
          "Just. That's my favourite amount. Ask Quiz Team Aguilera. We win everything by one.",
          'Scraped it. Like a parma off a plate. Nothing left, nothing wasted. Write that down.',
          "{best} carried us. {bestAmount}. Never forget {best}. I'll put it on a trivia question.",
        ],
        jess: [
          "We made it! Just! I'm still shaking! Good shaking. Rent shaking.",
          "I'll do extra sweeping next lease. For margins. Is that how margins work?",
          "The {piece} still makes me happy. Even when the numbers were scary. Especially then.",
        ],
        dennis: [
          'Margin: thin. Result: paid. I had it at fifty-fifty. Honestly, my favourite kind.',
          '{won} from {total} on my calls, {net} net. Not all heroes. But enough. Just.',
          'Rent paid with {cash} spare. I wouldn\'t spend it. Except on a round. I\'ll get it.',
        ],
      },
    },
    short: {
      headline: 'Short on the rent. Not short on anything else.',
      landlord: [
        "A bit short. Pay what you've got; the rest by end of next month. I'm not a monster. — {landlord}",
        "We'll sort it. Thirty years I've owned that shed and it's never been loved like this.",
        "Short this time. Keep the key. I'd rather a tenant who tries than an empty shed.",
      ],
      you: [
        "{cash} of {rent}. Not quite. But the shed's still here, and so are we.",
        "Didn't make it this time. Made {sheets} sheets of things people love, though.",
        'Short on the rent. Long on mates. The landlord gave us till next month. We go again.',
      ],
      byPerson: {
        eggby: [
          "Not this time. Next one. Losing well is also civilisation. Possibly more so.",
          '{gifts} people gave you something to say thanks. Thank-yous don\'t pay rent. They count, though.',
          "I'm still making a trophy. It says 'Tried Very Hard'. That's a real category.",
        ],
        courtney: [
          "Short?! Pfft! Bron and I have been short since 2009! It's character! We go again!",
          'The {piece}, though! Nobody remembers the rent. Everybody remembers the {piece}.',
          "Come round for lasagne. Then we make a plan. Then more lasagne. That's the plan.",
        ],
        tim: [
          "Short. Like me. Like my fringe. Next lease, champ. Write that down. I'll write it down.",
          'Even {best} was {bestAmount}. Remember {best}. Do that again eight times. Easy.',
          "Should've bought in 2012. Still can't. Still here. You'll be all right.",
        ],
        jess: [
          "I'm still coming in. Even if it's just for sweeping. I'll bring cake. Two cakes.",
          "We did {sheets} sheets! That's not nothing. That's a lot of something!",
          "Next lease we'll smash it. I've already got a list. It's mostly about clamps.",
        ],
        dennis: [
          'Even I miss sometimes. {won} from {total}, {net} net. My fault partly. I\'ll own that.',
          "Short by a bit. I've made a recovery spreadsheet. It's very optimistic. Four in five.",
          'Odds you bounce back next lease? I\'d say four in five. And I\'m always honest about my odds.',
        ],
      },
    },
  } satisfies Record<Ending, EndingLines> as Record<Ending, EndingLines>,
  /** Flying, and she wasn't full time yet: you ask her on the spot. */
  jessOnTheSpot: [
    'Full time? Starting Monday? Starting NOW? I am already here! YES!',
    "You're asking me now? In front of everyone? Yes! Obviously yes! I'm going to cry.",
    'Full time! I brought a cake just in case. That was a joke. I did bring a cake.',
  ],
};
