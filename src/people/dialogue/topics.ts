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
};

export const TOPIC_THREADS: Thread[] = [
  // ---------------------------------------------------------------- festival
  {
    id: 'topic-festival', kind: 'topic', topic: 'festival', stage: 1,
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
];
