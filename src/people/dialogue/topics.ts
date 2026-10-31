// The night's argument: one topic a night, rotated. The friend argues their {side} ({take}, from src/people/friends.ts);
// your replies push back with {otherSide} or go along. Shared threads, so any friend can say them: lean on the
// templates and keep it lively. A guest who's turned up chips in with {guestSide}. All pubs, breweries and bands are
// made up.
import type { Thread, TopicId } from './types.js';

export const TOPICS: Record<TopicId, { name: string; sides: string[] }> = {
  festival: { name: 'Meredith and Golden Plains', sides: ['Meredith', 'Golden Plains'] },
  craftBeer: { name: 'craft beer', sides: ['hazy', 'crisp', 'plain lager on principle'] },
  pubs: { name: 'inner north pubs', sides: ['the front bar', 'the beer garden', 'trivia night'] },
  suburbs: { name: 'moving further north', sides: ['stay put', 'go further north', 'Coburg forever'] },
  housePrices: { name: 'house prices', sides: ['still might buy', 'never buying', "should've bought"] },
  band: { name: 'the old band', sides: ['reform for the 40th', 'leave it in the past', 'start a new band'] },
  cycling: { name: 'bikes', sides: ['the gravel bike', 'the old fixie', 'the tram'] },
  footy: { name: 'the footy', sides: ['the footy', 'the tacos at the ground', 'the pie at half time'] },
  coffee: { name: 'coffee', sides: ['the old café', 'the new café', 'instant at home'] },
  bunnings: { name: 'the hardware store', sides: ['Saturday morning', 'Sunday arvo', 'avoid it'] },
  kids: { name: 'kids', sides: ['kids', 'no kids', 'the cool godparent'] },
  ferment: { name: 'fermenting', sides: ['still going', 'gave it up', 'never started'] },
  uteTarago: { name: 'ute or Tarago', sides: ['ute', 'Tarago', 'a borrowed trailer'] },
  aches: { name: 'aches and pains', sides: ['push through it', 'see a physio', 'stretch every morning'] },
  wine: { name: 'wine', sides: ['wine person now', 'beer forever', "whatever's open"] },
  radio: { name: 'the radio', sides: ['still listening', 'stopped, and fine with it', 'only the countdown'] },
  parents: { name: 'mum and dad', sides: ['ring them Sundays', 'drop round unannounced', 'let them do their thing'] },
};

export const TOPIC_THREADS: Thread[] = [
  // ---------------------------------------------------------------- festival
  {
    id: 'topic-festival', kind: 'topic', topic: 'festival', stage: 1,
    sincere: {
      turn: { text: "Every year I reckon it's the last time we'll all go. Every year we go.", expr: 'misty' },
      recover: { text: 'Every year someone loses a gumboot. Usually me.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'ballot',
        say: [
          { text: 'Did you get a ballot this year?', expr: 'animated' },
          { text: "I'm subscribed on three emails. Mine, my mum's, and one I made for the dog.", expr: 'laughing' },
        ],
        replies: [{ text: 'Got one! Second round.', next: 'lineup' }, { text: 'Missed out. Watching the resales.', next: 'lineup' }],
      },
      {
        id: 'lineup',
        say: [
          { text: "Lineup's out. I've heard of none of them. That's how you know it's a good year.", expr: 'laughing', quote: true },
          { text: "Some bloke from Ballarat with a modular synth. A Japanese psych band nobody's heard of." },
        ],
        replies: [{ text: "Psych band'll be the best thing all weekend.", next: 'side' }, { text: 'Last year was better and you know it.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: '{take}', expr: 'animated' },
          { text: "Don't come at me with {otherSide}." },
        ],
        replies: [{ text: 'Nah. {otherSide}. Fight me.', next: 'push' }, { text: 'Fair call. Team {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "You're wrong, but I respect the passion.", expr: 'laughing' },
          { who: 'guest', text: "{guestSide}. Easy. Next question." },
          { text: "Can we at least agree the boot is the best tradition on earth?" },
        ],
        replies: [{ text: 'One shoe in the air. Perfect.', another: true }, { text: 'The Gift, though. Unbeatable.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "See? Reasonable. This is why we're mates." },
          { text: 'Real question: are we too old for the amphitheatre, or too old for camping?', expr: 'thoughtful', quote: true },
        ],
        replies: [{ text: 'Too old for camping. Never the amphitheatre.', another: true }, { text: 'Neither. We bring a couch.' }],
      },
    ],
  },
  {
    id: 'topic-festival-2', kind: 'topic', topic: 'festival', stage: 1,
    sincere: {
      turn: { text: "Watching the sun come up with you lot. That's the whole reason. The music's a bonus.", expr: 'misty' },
      recover: { text: "Don't tell the bloke from Ballarat I said that.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'sunrise',
        say: [
          { text: 'Okay. Rank the sunrise sets. All time.', expr: 'animated' },
          { text: 'Number one: the year that trumpet bloke played the sun up. I cried into a sausage.', expr: 'misty', quote: true },
        ],
        replies: [{ text: 'The year it rained, though.', next: 'rain' }, { text: 'The year we lost the tent.', next: 'rain' }],
      },
      {
        id: 'rain',
        say: [
          { text: 'The year it rained! Someone surfed down the hill on a lilo.', expr: 'laughing' },
          { text: 'Pink Flamingo in a mud slide. Lost a gumboot. Still lost. Best weekend of my life.' },
        ],
        replies: [{ text: 'You looked like a swamp creature.', next: 'side' }, { text: 'Never been happier.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: 'Anyway. {take}' },
          { text: "And this year we're bringing a couch. A proper one. On the roof racks.", expr: 'animated' },
        ],
        replies: [{ text: '{otherSide}, mate. And we borrow a couch.', next: 'couch' }, { text: 'Couch on the roof. Team {side}.', next: 'couch' }],
      },
      {
        id: 'couch',
        say: [
          { text: 'Borrowing a couch is fine. I sat on forty strangers’ couches one year. Lovely people.', expr: 'laughing' },
          { who: 'guest', text: "I'm {guestSide} and I'm bringing a beanbag. Don't argue." },
          { text: 'Meet at the Eye at nine. Like always. Lose each other by ten.', expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Like always.', another: true }, { text: "Some bloke from Ballarat's on at ten.", another: true }],
      },
    ],
  },
  // ---------------------------------------------------------------- craft beer
  {
    id: 'topic-craftBeer', kind: 'topic', topic: 'craftBeer', stage: 1,
    sincere: {
      turn: { text: "It's never really been about the beer, has it? It's the crack of the can at five.", expr: 'thoughtful' },
      recover: { text: 'Bit about the beer. A bit.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'sold',
        say: [
          { text: 'Did you hear? Wobbly Possum sold out. One of the big brewers bought them.', expr: 'thoughtful' },
          { text: 'Same beer, same can. But does it still count?' },
        ],
        replies: [{ text: 'If it tastes good, it counts.', next: 'side' }, { text: 'Dead to me. Pour one out.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: 'Anyway. {take}', expr: 'animated' },
          { text: "Don't even start with {otherSide}." },
        ],
        replies: [{ text: 'Nah. {otherSide}, every time.', next: 'push' }, { text: 'Fair enough. Team {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "Wrong, but I'll still drink with you.", expr: 'laughing' },
          { who: 'guest', text: "{guestSide}. You're both wrong." },
          { text: "Can we at least agree pale ales are over?" },
        ],
        replies: [{ text: 'Pale ales will outlive us all.', another: true }, { text: 'Over. Like frosted tips.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'And the tasting-paddle people. Four tiny beers on a plank. Just order a pint!' },
          { text: 'Also: a 9% can. Is that a beer, or a decision?', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'A decision. A bad one. On a Tuesday.', another: true }, { text: 'I like a paddle. Little science fair.', another: true }],
      },
    ],
  },
  {
    id: 'topic-craftBeer-2', kind: 'topic', topic: 'craftBeer', stage: 1,
    sincere: {
      turn: { who: 'you', text: 'Best beer in the world is the one after a day you were proud of.', expr: 'thoughtful' },
      recover: { text: "So you're saying a nine-percenter tonight. Bold.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'new',
        say: [
          { text: 'New brewery in a warehouse in Thornbury. Hard Rubbish Ales.', expr: 'animated' },
          { text: 'Forty taps. Every beer is a pun. Hops and Robbers. Ale Caesar. Pint Sized Fury.' },
        ],
        replies: [{ text: 'Ale Caesar is genuinely good.', next: 'lager' }, { text: "Forty taps is too many taps.", next: 'lager' }],
      },
      {
        id: 'lager',
        say: [
          { text: 'And down the end, one tap that just says LAGER. No pun. No picture.', expr: 'thoughtful' },
          { text: "There's always one bloke who orders it. On principle. Like a protest.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'That bloke is a hero.', next: 'side' }, { text: "That bloke's missing out.", next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: '{take}' },
          { who: 'guest', text: 'Put me down for {guestSide}.' },
        ],
        replies: [{ text: "Nah, I'm {otherSide}. Always.", next: 'end' }, { text: 'Team {side}. Cheers.', next: 'end' }],
      },
      {
        id: 'end',
        say: [
          { text: "Whatever's in the bar fridge is the best beer in Melbourne. That's science.", expr: 'misty' },
        ],
        replies: [{ text: "Let's do some more science.", another: true }, { text: 'Peer reviewed.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- pubs
  {
    id: 'topic-pubs', kind: 'topic', topic: 'pubs', stage: 1,
    sincere: {
      turn: { text: "A good pub's just a lounge room for people who don't fit in each other's lounge rooms.", expr: 'thoughtful' },
      recover: { text: "Plus parmas. Your lounge room's never done me a parma.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'changed',
        say: [
          { text: 'The Lord Plumpton in Preston changed hands. Edison bulbs. A thirty-four dollar parma.', expr: 'thoughtful' },
          { text: "It's a deconstructed parma. It's a schnitty and a sauce bottle.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Thirty-four bucks? Sacrilege.', next: 'side' }, { text: 'Was it any good, though?', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: "Point is, it's not the pub any more. We need a new 'the' pub." },
          { text: '{take}', expr: 'animated' },
        ],
        replies: [{ text: "Nah. {otherSide}'s where it's at.", next: 'push' }, { text: 'Agreed. A pub with {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}? Who are you?', expr: 'laughing' },
          { who: 'guest', text: "The pub's wherever {guestSide} is. Settled." },
          { text: 'Fine. Best parma in the north. Go.' },
        ],
        replies: [{ text: 'The Galah and Gasket, Coburg. No contest.', another: true }, { text: 'The Honest Bandicoot. Chips under.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'And no pokies room. The Crooked Possum in Brunswick got one. Used to be the band room.', expr: 'thoughtful' },
          { text: "Now it's just beeping and a carpet that's seen things." },
        ],
        replies: [{ text: "We'll protest with a strongly worded coaster.", another: true }, { text: 'Back to the Bandicoot, then.', another: true }],
      },
    ],
  },
  {
    id: 'topic-pubs-2', kind: 'topic', topic: 'pubs', stage: 1,
    sincere: {
      turn: { text: "Whatever happens to the Bandicoot, we've got this. Milk crates and a fridge.", expr: 'misty' },
      recover: { text: 'Worse carpet, somehow. Impressive, really.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'closing',
        say: [
          { text: 'Heard the Honest Bandicoot in Thornbury might close.', expr: 'misty' },
          { text: "Developers. They want to call it 'The Bandicoot Residences'." },
        ],
        replies: [{ text: 'Over my dead body.', next: 'fundraiser' }, { text: "They can't. Where would trivia go?", next: 'fundraiser' }],
      },
      {
        id: 'fundraiser',
        say: [
          { text: 'Fundraiser on Saturday. Sausage sizzle, raffle, a band made entirely of dads.', expr: 'animated' },
          { text: "Someone's donated a meat tray. Biggest I've ever seen. It's got a whole ham.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: "I'll cut them a sign. Save the Bandicoot.", next: 'side' }, { text: "I'm buying every raffle ticket.", next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: "That's the spirit. A pub is where a suburb lives." },
          { text: 'And when we save it: {take}' },
        ],
        replies: [{ text: "Nah, it's {otherSide} or nothing.", next: 'end' }, { text: 'Team {side}. Obviously.', next: 'end' }],
      },
      {
        id: 'end',
        say: [
          { who: 'guest', text: "I'll be at {guestSide}, holding the ham." },
          { text: "Whatever. As long as it's open. That's all I want. An open pub and you lot in it.", expr: 'misty' },
        ],
        replies: [{ text: 'To the Bandicoot.', another: true }, { text: 'And the ham.', another: true }],
      },
    ],
  },
  // ---------------------------------------------------------------- suburbs
  {
    id: 'topic-suburbs', kind: 'topic', topic: 'suburbs', stage: 1,
    sincere: {
      turn: { text: "Doesn't matter which suburb. Matters who's a tram ride away.", expr: 'misty' },
      recover: { text: 'Within reason. Not Wallan.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'rule',
        say: [
          { text: 'You know the rule. Preston is the new Northcote.', expr: 'animated' },
          { text: 'Coburg is the new Brunswick. Reservoir is the new Preston.' },
        ],
        replies: [{ text: "So what's the new Reservoir?", next: 'new' }, { text: "And Northcote's the new Fitzroy.", next: 'new' }],
      },
      {
        id: 'new',
        say: [
          { text: 'The new Reservoir is a paddock near Wallan with very good coffee.', expr: 'laughing', quote: true },
          { text: "Everyone we know moves one tram stop further north a year. It's like a migration." },
        ],
        replies: [{ text: 'Half our mates are in Thornbury now.', next: 'side' }, { text: 'Why, though? What is it up there?', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: 'Backyards. A lemon tree. A garage you could fit a band in.' },
          { text: '{take}', expr: 'animated' },
        ],
        replies: [{ text: 'Nah. {otherSide}. No question.', next: 'push' }, { text: 'Yeah. Team {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "You'll come round. Everyone comes round.", expr: 'laughing' },
          { who: 'guest', text: '{guestSide}, just saying.' },
          { text: "Five years. You'll be in Reservoir with a lemon tree and opinions about mulch." },
        ],
        replies: [{ text: 'I would love opinions about mulch.', another: true }, { text: "I'll visit. Pack a lunch.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'See! Someone gets it.' },
          { text: "When we're eighty we'll all live on one street. Wave at each other off the verandahs.", expr: 'misty', quote: true },
        ],
        replies: [{ text: "I'll cut the street sign.", another: true }, { text: 'Retirement plan: sorted.', another: true }],
      },
    ],
  },
  // ---------------------------------------------------------------- house prices
  {
    id: 'topic-housePrices', kind: 'topic', topic: 'housePrices', stage: 2,
    sincere: {
      turn: { text: "Used to think owning a house was the finish line. Turns out there isn't one.", expr: 'thoughtful' },
      recover: { text: "Just a carport. And someone's sleeping in it.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'million',
        say: [
          { text: 'A two-bed in Thornbury went for a million dollars.', expr: 'thoughtful' },
          { text: 'It had a carport. The carport was the second bedroom.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Was it a nice carport?', next: 'should' }, { text: "That's madness.", next: 'should' }],
      },
      {
        id: 'should',
        say: [
          { text: "Everyone's got a 'should've bought in 20—' story." },
          { text: "My uncle should've bought in '98. My cousin, 2009. Me? Last Tuesday, apparently.", expr: 'laughing' },
        ],
        replies: [{ text: "Should've bought in 2012. Classic.", next: 'side' }, { text: "I'd have bought a shed. Oh, wait.", next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}' }],
        replies: [{ text: 'Nah, {otherSide}. Long game.', next: 'push' }, { text: "I'm with you: {side}.", next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: 'Look at you. Optimist. I love that.', expr: 'laughing' },
          { who: 'guest', text: "{guestSide}. That's my official position." },
          { text: 'Renters throw the best parties anyway. Nobody worries about the floorboards.' },
        ],
        replies: [{ text: 'To the floorboards.', another: true }, { text: "And the landlord's carpet.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'Look at us. No mortgage, a bar fridge, a shed full of sawdust.' },
          { text: "We're rich in all the stuff that doesn't go on a form.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Cheers to that.', another: true }, { text: 'Write that down.', another: true }],
      },
    ],
  },
  {
    id: 'topic-housePrices-2', kind: 'topic', topic: 'housePrices', stage: 2,
    sincere: {
      turn: { text: "Know what I'd do with a million? More nights like this. Maybe a better fridge.", expr: 'misty' },
      recover: { text: 'A fridge where the light works. Dream big.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'auction',
        say: [
          { text: "Went to an auction in Preston on Saturday. For fun. That's what I do now.", expr: 'animated' },
          { text: 'Bloke in a puffer vest was bidding with his eyebrows. His eyebrows!' },
        ],
        replies: [{ text: 'Did you bid?', next: 'nose' }, { text: 'Eyebrow bidding is an art.', next: 'nose' }],
      },
      {
        id: 'nose',
        say: [
          { text: 'I nearly scratched my nose. Could have bought a bungalow by accident.', expr: 'laughing', quote: true },
          { text: 'Anyway. {take}' },
        ],
        replies: [{ text: 'Nah. {otherSide}, mate.', next: 'end' }, { text: "Same. I'm firmly {side}.", next: 'end' }],
      },
      {
        id: 'end',
        say: [
          { who: 'guest', text: "I'm {guestSide}. But I'll come to the auctions." },
          { text: "Next one, you're coming. We bring a thermos. Rate the eyebrows out of ten.", expr: 'laughing' },
        ],
        replies: [{ text: 'Thermos of what, though?', another: true }, { text: "I'll make scorecards.", another: true }],
      },
    ],
  },
  {
    id: 'topic-housePrices-3', kind: 'topic', topic: 'housePrices', stage: 2,
    sincere: {
      turn: { text: "Honestly? A house is just where your mates come round. We've got that. It's this shed.", expr: 'misty' },
      recover: { text: "Mind you, I'd take a shed with a dunny that locks.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'mate',
        say: [
          { text: "You know someone's mate who bought in Castlemaine? Everyone does. It's the law.", expr: 'animated' },
          { text: 'Wood fire. Six chooks. Goes to Melbourne on a Tuesday and calls it "the big smoke".', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'He makes his own kombucha now.', next: 'smug' }, { text: 'Honestly? Sounds lovely.', next: 'smug' }],
      },
      {
        id: 'smug',
        say: [
          { text: 'Paid less than a carport in Thornbury. He told me. Twice. Unprompted.', expr: 'thoughtful' },
          { text: "Should've bought in 2012. Anywhere. A tent in Coburg. A shoebox in Brunswick." },
        ],
        replies: [{ text: "In 2012 I had eleven dollars and a fixie.", next: 'side' }, { text: 'We all say it. Every year.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: '{take}', expr: 'animated' },
          { who: 'guest', text: "I'm {guestSide}. And I want a chook." },
        ],
        replies: [{ text: "Nah, {otherSide}. I'm calling it.", next: 'push' }, { text: "I'm with you. {side}.", next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: 'Fine. But when you get a wood fire, I want the crate closest to it.', expr: 'laughing' },
          { text: 'And I get to name a chook.' },
        ],
        replies: [{ text: 'Chook called Twenty Twelve.', another: true }, { text: "You can have the grumpy one.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "Castlemaine's lovely. But Castlemaine doesn't have this crate, this fridge, or you.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Day trip, though. Bakery run.', another: true }, { text: "Good crate. Can't argue." }],
      },
    ],
  },
  // ---------------------------------------------------------------- band
  {
    id: 'topic-band', kind: 'topic', topic: 'band', stage: 2,
    sincere: {
      turn: { who: 'you', text: "I miss making something that wasn't for a customer.", expr: 'misty' },
      recover: { text: 'Track three. Four minutes of tuning. Never been bettered.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'demo',
        say: [
          { text: 'Cleaning out a cupboard. Guess what I found. The Dial-Up Tone demo. On a CD-R.', expr: 'animated' },
          { text: 'Five songs. Track three is four minutes of you tuning up.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'That was an artistic choice.', next: 'house' }, { text: 'Snap it in half. Bury it.', next: 'house' }],
      },
      {
        id: 'house',
        say: [
          { text: 'Recorded in the laundry of that share house on Lygon Street. Remember? Mattresses on the walls.' },
          { text: 'We were twenty-four. We thought the bass player had a van. He had a hatchback and confidence.', expr: 'laughing' },
        ],
        replies: [{ text: 'We fit a drum kit in that hatchback.', next: 'side' }, { text: 'Is the demo online anywhere?', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: 'Forty is coming for all of us. Someone said the word "reunion".', expr: 'thoughtful' },
          { text: '{take}', expr: 'animated' },
        ],
        replies: [{ text: 'Nah. {otherSide}. Hear me out.', next: 'push' }, { text: 'Yeah, all right. {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "Bold. Wrong, but bold. That's very Dial-Up Tone of you.", expr: 'laughing' },
          { who: 'guest', text: '{guestSide}. And I want a tambourine this time.' },
          { text: 'If anything happens, it happens in the band room at the Galah and Gasket. Non-negotiable.' },
        ],
        replies: [{ text: 'Two songs, then parmas.', another: true }, { text: 'Only if track three is in the set.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'We were never good. But we were loud, and we were together, and that hatchback never let us down.', expr: 'misty', quote: true },
        ],
        replies: [{ text: 'To the hatchback.', another: true }, { text: 'It let us down twice. On the Hume.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- cycling
  {
    id: 'topic-cycling', kind: 'topic', topic: 'cycling', stage: 1,
    sincere: {
      turn: { text: 'Best bit of the fixie years? We rode everywhere together. Like a flock of idiots.', expr: 'misty' },
      recover: { text: 'A flock of idiots with no brakes. Miracle any of us made forty.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'gravel',
        say: [
          { text: 'Saw a bloke on the Merri Creek trail with a nine-grand gravel bike. Walking it up the hill.', expr: 'laughing' },
          { text: 'Lycra, little cycling cap, the lot. Puffed before Dights Falls.' },
        ],
        replies: [{ text: 'Remember when it was all fixies?', next: 'fixie' }, { text: "Leave him alone, he's on a journey.", next: 'fixie' }],
      },
      {
        id: 'fixie',
        say: [
          { text: 'Brunswick Street, 2011. One gear, no brakes, a moustache you could hang a coat on.', expr: 'animated' },
          { text: 'You stopped by skidding and praying. Mostly praying.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'I skidded into a café once. Inside it.', next: 'side' }, { text: 'Mine had a wooden rim. Mistake.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: 'These days the rule is: most expensive bike, least fitness. Every time.' },
          { text: '{take}', expr: 'animated' },
        ],
        replies: [{ text: 'Nah. {otherSide}, mate.', next: 'push' }, { text: 'Fair call. {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}? Righto, Tour de France.', expr: 'laughing' },
          { who: 'guest', text: '{guestSide}. I will not be taking questions.' },
          { text: "Ride to Castlemaine one weekend? Train back. Obviously the train back." },
        ],
        replies: [{ text: 'Train both ways. Bikes come along.', another: true }, { text: 'I need a new bike first. A dear one.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'See, you get it. A bike is a way to get to the pub without parking.' },
          { text: "Anything else is a lifestyle, and I can't afford a lifestyle.", expr: 'laughing' },
        ],
        replies: [{ text: 'Write that down.', another: true }, { text: "My lifestyle's a milk crate." }],
      },
    ],
  },
  // ---------------------------------------------------------------- footy
  {
    id: 'topic-footy', kind: 'topic', topic: 'footy', stage: 1,
    sincere: {
      turn: { text: 'First game I ever went to, couldn\'t tell you who won. I remember who I sat next to.', expr: 'misty' },
      recover: { text: 'Anyway. That nine-year-old is going down this round.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'tipping',
        say: [
          { text: "Footy tipping. I'm coming last. Behind a nine-year-old who picks by mascot.", expr: 'thoughtful', quote: true },
          { text: 'He went with "the one with the bird" four weeks straight. Eight from eight.', expr: 'laughing' },
        ],
        replies: [{ text: 'The kid has a system. Respect it.', next: 'tacos' }, { text: 'I pick by jumper colour. Same thing.', next: 'tacos' }],
      },
      {
        id: 'tacos',
        say: [
          { text: "Half the people at the ground aren't there for footy anyway. There's a taco van now.", expr: 'animated' },
          { text: "Line's longer than the queue for the loos. People leave at three-quarter time with salsa." },
        ],
        replies: [{ text: 'Best tacos in the north, honestly.', next: 'side' }, { text: 'Tacos at the footy is wrong.', next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}', expr: 'animated' }],
        replies: [{ text: "Nah, I'm there for {otherSide}.", next: 'push' }, { text: 'Same. {side}, every time.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "{otherSide}. Course you are. You've never once watched the last quarter.", expr: 'laughing' },
          { who: 'guest', text: "Can't believe I'm the only {guestSide} person here." },
          { text: 'Grand final day: barbecue here, telly on the bench. Roller door up.' },
        ],
        replies: [{ text: "I'll cut a premiership cup.", another: true }, { text: 'Taco van at the roller door?', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'Cold Saturday, a scarf your nan knitted, forty thousand strangers yelling the same word.', expr: 'misty', quote: true },
          { text: 'Usually "BALL". Sometimes something ruder.', expr: 'laughing' },
        ],
        replies: [{ text: 'BALL!', another: true }, { text: 'Nan would be proud.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- coffee
  {
    id: 'topic-coffee', kind: 'topic', topic: 'coffee', stage: 1,
    sincere: {
      turn: { text: "Twelve years at the same window. They know my name. That's not nothing, you know.", expr: 'thoughtful' },
      recover: { text: "They think my name's Craig. Never had the heart to correct them.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'downhill',
        say: [
          { text: "The Lost Teaspoon's gone downhill. New owners. The barista has a podcast.", expr: 'thoughtful' },
          { text: 'My flat white tasted like a sad envelope.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: "A sad envelope? That's harsh.", next: 'new' }, { text: "It's been downhill since 2016.", next: 'new' }],
      },
      {
        id: 'new',
        say: [
          { text: "Meanwhile Sparrow and Sprocket opened on High Street. Single origin. They show you the bean's passport.", expr: 'animated' },
          { text: "Seven bucks. It came with tasting notes. 'Stone fruit and regret.'" },
        ],
        replies: [{ text: "Regret's my favourite note.", next: 'side' }, { text: 'Seven bucks is a beer!', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: '{take}' },
          { who: 'guest', text: "{guestSide}. Fight me. After my coffee." },
        ],
        replies: [{ text: 'Nah, {otherSide}. Hill I die on.', next: 'push' }, { text: 'Yeah. {side}. Fair enough.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}! Who raised you?', expr: 'laughing' },
          { text: "Next Saturday. Blind taste test. All three. I'll bring paper cups and a clipboard.", expr: 'animated' },
        ],
        replies: [{ text: "I'll cut the scoreboard.", another: true }, { text: 'Loser shouts the beers.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'The coffee was never the point. It was the ten minutes before anything else happened.', expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Ten minutes of peace. Then the router.', another: true }, { text: "Wasn't the point. Still matters." }],
      },
    ],
  },
  // ---------------------------------------------------------------- hardware store
  {
    id: 'topic-bunnings', kind: 'topic', topic: 'bunnings', stage: 1,
    sincere: {
      turn: { text: "Best thing about it? Everyone in there is building something. I find that really lovely.", expr: 'thoughtful' },
      recover: { text: 'Then I buy a hose fitting I already own. That makes four.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'cathedral',
        say: [
          { text: 'Bunnings on a Saturday morning. Big doors open. Smell of timber and onions.', expr: 'misty' },
          { text: "It's a cathedral. The sausage sizzle is communion.", expr: 'animated', quote: true },
        ],
        replies: [{ text: 'Onions under the snag. Not on top.', next: 'list' }, { text: "Bit much. It's a shed shop.", next: 'list' }],
      },
      {
        id: 'list',
        say: [
          { text: 'Go in for one hinge. Come out with a hinge, a pot plant, a ladder and a new personality.', expr: 'laughing' },
          { text: 'And you always run into someone from school in the paint aisle. Always.' },
        ],
        replies: [{ text: 'Saw my Year 9 teacher by the mulch.', next: 'side' }, { text: 'I hide in the plumbing aisle.', next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}', expr: 'animated' }],
        replies: [{ text: "Nah. {otherSide}. That's the way.", next: 'push' }, { text: 'Yep. {side}. Like church.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}? Heathen. Lovely heathen.', expr: 'laughing' },
          { who: 'guest', text: "I'm {guestSide}. And I'm still getting a snag." },
          { text: "Is a snag in bread a sandwich? I'm asking for Quiz Team Aguilera." },
        ],
        replies: [{ text: "It's a hot dog with a mortgage.", another: true }, { text: "It's a sandwich. Next question.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'Saturday. Flat white, wander, snag, home by eleven with a bag of screws you will never use.' },
          { text: "That's a good life, that is.", expr: 'misty' },
        ],
        replies: [{ text: 'A very good life.', another: true }, { text: 'I use all my screws. Eventually.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- kids
  {
    id: 'topic-kids', kind: 'topic', topic: 'kids', stage: 2,
    sincere: {
      turn: { text: "Kids or no kids, I hope some little one out there reckons we're the cool ones.", expr: 'misty' },
      recover: { text: "They don't. They reckon we smell like sawdust and beer.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'zone',
        say: [
          { text: "Everyone we know with kids talks about one thing now. School zones.", expr: 'thoughtful' },
          { text: "A mate moved three houses down the street to be in a zone. Three houses. Same street.", expr: 'laughing' },
        ],
        replies: [{ text: 'Commitment. I respect it.', next: 'gardens' }, { text: "That's madness.", next: 'gardens' }],
      },
      {
        id: 'gardens',
        say: [
          { text: 'Edinburgh Gardens on a Sunday. Dads in a circle with prams, comparing sleep like it was footy scores.', expr: 'animated' },
          { text: '"Asleep by nine on New Year\'s. Best night of my life." He meant it.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: "Asleep by nine sounds great, actually.", next: 'side' }, { text: 'We used to be the loud ones there.', next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}' }],
        replies: [{ text: "Nah. Put me down for {otherSide}.", next: 'push' }, { text: 'Same. Team {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: 'Fair. Everyone gets their own life. That\'s the deal.', expr: 'thoughtful' },
          { who: 'guest', text: "I'm {guestSide}, and I'm very good at it." },
          { text: "Either way, whoever's kids they are, they're getting a cut-out dinosaur from this shed.", expr: 'laughing' },
        ],
        replies: [{ text: "Dinosaurs on the house. Always.", another: true }, { text: "A small one. Ply's not free.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "Takes a village. And this shed's a pretty good village.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Village with a bar fridge.', another: true }, { text: 'Mayor of the milk crates.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- ferment
  {
    id: 'topic-ferment', kind: 'topic', topic: 'ferment', stage: 2,
    sincere: {
      turn: { text: "Lockdown, we all fed a jar twice a day. Funny how much that jar held us together.", expr: 'thoughtful' },
      recover: { text: 'Then we got out and let them all starve. Monsters, the lot of us.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'jar',
        say: [
          { text: "Had a chilli ferment going in the cupboard. Lid blew off at two in the morning.", expr: 'animated' },
          { text: "Thought it was a break-in. It was a hot sauce. My kitchen looked like a crime scene.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Did it taste good, at least?', next: 'phases' }, { text: 'Burp your jars, mate.', next: 'phases' }],
      },
      {
        id: 'phases',
        say: [
          { text: "Everyone had a phase. Sourdough, then kimchi, then kombucha, then you're buying a crock off a forum." },
          { text: "Someone's starter is older than their relationship. Still going. Still bubbling.", expr: 'thoughtful' },
        ],
        replies: [{ text: "Mine's in the fridge. Probably alive.", next: 'side' }, { text: 'I bought bread. Like an adult.', next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}', expr: 'animated' }],
        replies: [{ text: 'Nah. {otherSide}. Easy.', next: 'push' }, { text: "You're right. {side}.", next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "{otherSide}? Your loss. More sauerkraut for me.", expr: 'laughing' },
          { who: 'guest', text: "{guestSide}. My fridge has been through enough." },
          { text: 'Hot sauce label, though. You could cut me a stencil. Very small batch.' },
        ],
        replies: [{ text: '"Two in the Morning". Hot sauce.', another: true }, { text: "Only if I don't have to eat it.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "Good. Keep it alive. Something in your house should be thriving.", expr: 'laughing' },
        ],
        replies: [{ text: 'The jar and me. Thriving.', another: true }, { text: 'Low bar. Cleared it.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- ute or Tarago
  {
    id: 'topic-uteTarago', kind: 'topic', topic: 'uteTarago', stage: 1,
    sincere: {
      turn: { text: "Thing is, whoever had the car, we all got there. Every move, every festival.", expr: 'misty' },
      recover: { text: "Except that one time on the Calder. We don't talk about the Calder.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'move',
        say: [
          { text: "Someone's moving house Saturday. Which means one question. Who's got a ute?", expr: 'animated' },
          { text: "Nobody's got a ute. Everyone's got a mate with a ute. The mate's never free." },
        ],
        replies: [{ text: "I've got the shed van. Sort of.", next: 'tarago' }, { text: "I'm not lifting a couch again.", next: 'tarago' }],
      },
      {
        id: 'tarago',
        say: [
          { text: "Then there's the Tarago. Seats eight. Every Golden Plains in history arrived in one.", expr: 'laughing' },
          { text: "A Tarago is a lounge room that drives. Badly. Uphill.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Uphill is a suggestion for a Tarago.', next: 'side' }, { text: 'Best car ever made.', next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}', expr: 'animated' }],
        replies: [{ text: 'Nah. {otherSide}. Obviously.', next: 'push' }, { text: 'Yeah. {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}. Course. You would.', expr: 'laughing' },
          { who: 'guest', text: "{guestSide}, and I'm right about it." },
          { text: 'Fine. Couch goes in whatever turns up. Pizza for whoever carries the fridge.' },
        ],
        replies: [{ text: "I'll carry the fridge. Big pizza.", another: true }, { text: "I'll carry the cushions.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'Knew you had taste.' },
          { text: "When we're old I want us to buy one together. Drive to the coast. Never park it properly.", expr: 'misty' },
        ],
        replies: [{ text: "I'll do the bumper stickers.", another: true }, { text: 'Dibs the front seat.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- aches
  {
    id: 'topic-aches', kind: 'topic', topic: 'aches', stage: 2,
    sincere: {
      turn: { text: "At twenty-five nothing hurt and I worried about everything. Now it's the other way round.", expr: 'thoughtful' },
      recover: { text: 'Except my neck. I worry about my neck a lot.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'neck',
        say: [
          { text: "I did something to my neck sleeping. Sleeping! I was lying down. That's all I did.", expr: 'animated' },
          { text: 'Woke up looking permanently to the left. Like I heard something interesting.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'My knee clicks going up stairs.', next: 'noises' }, { text: 'My back went picking up a sock.', next: 'noises' }],
      },
      {
        id: 'noises',
        say: [
          { text: 'And the noise when you get off the couch now. The "hooo".' },
          { text: "We used to jump fences into Edinburgh Gardens. Now I do a little groan getting off this crate.", expr: 'laughing' },
        ],
        replies: [{ text: 'Hooo. Yep. Did it just then.', next: 'side' }, { text: 'These crates are not ergonomic.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: "There's only one way to handle it." },
          { text: '{take}', expr: 'animated' },
        ],
        replies: [{ text: 'Nah. {otherSide}. Trust me.', next: 'push' }, { text: 'Yeah, fair. {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "{otherSide}? Look at you. Responsible.", expr: 'laughing' },
          { who: 'guest', text: '{guestSide}. Said nobody with a good back.' },
          { text: "Cut us some proper chairs for the shed. With backs. We've earned backs.", expr: 'thoughtful' },
        ],
        replies: [{ text: 'Chairs with backs. Living large.', another: true }, { text: 'The crates stay. Tradition.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "We're not old. We're vintage. Bit of patina. Bits fall off. Worth more.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Vintage. Love that.', another: true }, { text: 'Bits are definitely falling off.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- wine
  {
    id: 'topic-wine', kind: 'topic', topic: 'wine', stage: 2,
    sincere: {
      turn: { text: "Doesn't matter what's in the glass, really. Matters who's on the crates.", expr: 'misty' },
      recover: { text: "Unless it's orange wine. Then it matters a little bit.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'funk',
        say: [
          { text: 'At the barbecue on Saturday, someone sniffed a glass and said "ooh, bit of funk on that".', expr: 'thoughtful' },
          { text: 'It was one of us. One of US. Said it with a straight face.', expr: 'animated', quote: true },
        ],
        replies: [{ text: 'Who was it? Names.', next: 'cupboard' }, { text: 'Maybe it did have funk.', next: 'cupboard' }],
      },
      {
        id: 'cupboard',
        say: [
          { text: 'It starts small. A bottle shop in Northcote. A chat with a man in a linen shirt.' },
          { text: 'Next thing, you own a decanter and you say "mouthfeel" in public.', expr: 'laughing' },
        ],
        replies: [{ text: "I've said mouthfeel. Once. Sorry.", next: 'side' }, { text: 'Not me. Bar fridge for life.', next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}', expr: 'animated' }],
        replies: [{ text: 'Nah. {otherSide}. No question.', next: 'push' }, { text: 'Fine. Team {side}.', next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}. Noted. Disappointing. Noted.', expr: 'laughing' },
          { who: 'guest', text: "I'm {guestSide}. Pour me whatever, I'll say it's got funk." },
          { text: 'Wine rack for the shed? Little one. Next to the fridge. For guests.' },
        ],
        replies: [{ text: "I'll cut it out of offcuts.", another: true }, { text: 'For guests. Sure. Guests.', another: true }],
      },
      {
        id: 'along',
        say: [
          { text: 'Good. We can grow old together with opinions about Heathcote shiraz.', expr: 'misty' },
        ],
        replies: [{ text: 'Bit of funk on that.', another: true }, { text: 'Lovely mouthfeel, this chat.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- radio
  {
    id: 'topic-radio', kind: 'topic', topic: 'radio', stage: 2,
    sincere: {
      turn: { text: 'Every song from back then has one of your faces in it. That never goes off the air.', expr: 'misty' },
      recover: { text: 'Mostly yours, doing the worm at a house party in Brunswick.', expr: 'laughing' },
    },
    nodes: [
      {
        id: 'stopped',
        say: [
          { text: 'Had Triple J on in the car today. I knew none of it. Not one song.', expr: 'thoughtful' },
          { text: 'There was a band called Velcro Pony. The whole song was a man sighing over a banjo.', expr: 'laughing' },
        ],
        replies: [{ text: 'Velcro Pony are actually great.', next: 'when' }, { text: "That's how it goes. We aged out.", next: 'when' }],
      },
      {
        id: 'when',
        say: [
          { text: "Everyone's got the moment they stopped. The exact song. Mine was 'Sad Hatchback' by The Goodnight Lillys.", expr: 'animated' },
          { text: "I heard it and thought, I'm a podcast person now.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Countdown day, though. Still sacred.', next: 'side' }, { text: 'I stopped at the ads in 2015.', next: 'side' }],
      },
      {
        id: 'side',
        say: [
          { text: "And honestly, is that fine? Or should we be keeping up?" },
          { text: '{take}', expr: 'animated' },
        ],
        replies: [{ text: 'Nah. {otherSide}, and proud.', next: 'push' }, { text: "You're right. {side}.", next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: '{otherSide}? Look at you, reinventing yourself.', expr: 'laughing' },
          { who: 'guest', text: "{guestSide}. And I've got a spreadsheet." },
          { text: 'Countdown barbecue here in January. Roller door up. Predictions in a hat.', expr: 'animated' },
        ],
        replies: [{ text: "Velcro Pony at number one. Calling it.", another: true }, { text: "I'll cut the hat.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "It's fine. The radio's for the kids now. We had our turn. It was a good turn.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'A very good turn.', another: true }, { text: 'Put on the old stuff, then.' }],
      },
    ],
  },
  // ---------------------------------------------------------------- parents (late only)
  {
    id: 'topic-parents', kind: 'topic', topic: 'parents', stage: 3,
    sincere: {
      turn: { who: 'you', text: "I want to make Mum something in here. Something for the mantelpiece.", expr: 'misty' },
      recover: { text: "She'll put it next to your Year 4 clay ashtray. Pride of place.", expr: 'laughing' },
    },
    nodes: [
      {
        id: 'soup',
        say: [
          { text: "Mum's got a tablet now. Sends me photos of her soup. Just soup. No caption.", expr: 'laughing' },
          { text: "Dad rang to ask how to forward an email. Took forty minutes. Best forty minutes of my week.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Mine still prints out emails.', next: 'slower' }, { text: 'Soup photos are a love language.', next: 'slower' }],
      },
      {
        id: 'slower',
        say: [
          { text: "They're slowing down a bit. Dad naps now. Says he's resting his eyes for the footy.", expr: 'thoughtful' },
          { text: "Still the funniest people I know, though. Don't tell them. Dad'd be unbearable." },
        ],
        replies: [{ text: "Mine's taken up lawn bowls. Savage.", next: 'side' }, { text: "We should see them more.", next: 'side' }],
      },
      {
        id: 'side',
        say: [{ text: '{take}', expr: 'thoughtful' }],
        replies: [{ text: "Mm. I'd go {otherSide}.", next: 'push' }, { text: "That's right. {side}.", next: 'along' }],
      },
      {
        id: 'push',
        say: [
          { text: "Yeah? Maybe. There's no wrong way, I reckon. Just do it often.", expr: 'thoughtful' },
          { who: 'guest', text: "I'm {guestSide}. Mum says I'm her favourite. She says it to all of us." },
          { text: "Next time they're over, bring them to the shed. Show them what you made of yourself.", expr: 'misty' },
        ],
        replies: [{ text: "I'll put the good crates out.", another: true }, { text: "Dad'll ask how much the router cost.", another: true }],
      },
      {
        id: 'along',
        say: [
          { text: "They gave us all this. The least we can do is answer the soup photos.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Replying to the soup right now.', another: true }, { text: "Five stars. Lovely soup." }],
      },
    ],
  },
];
