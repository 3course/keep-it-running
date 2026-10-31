// Tim Baker at knock-off. Laconic, wry, a punster who waits for the laugh. Captain of Quiz Team Aguilera, parma
// scholar, Coburg forever, should've bought in 2012, plain lager on principle, a band he will one day start.
// Says "write that down" when he's pleased with himself. Underneath the bits: he means every word.
import type { Expr, FriendScript, Line, Thread } from './types.js';

const t = (text: string, expr?: Expr): Line => (expr ? { text, expr } : { text });
const q = (text: string, expr?: Expr): Line => ({ ...t(text, expr), quote: true });

export const SCRIPT: FriendScript = {
  greet: [
    "Knock knock. It's me. The roller door doesn't have a knocker, so I said it.",
    'Five on the dot. Punctuality is the only sport I play.',
    "Evening. I've come to inspect the fridge. Council business.",
    "Shop's still standing. Good effort. Got room on a crate for a Coburg man?",
    "Heard there was a router in here. I've come to router-ise. That's not a word. Let me in.",
  ],
  grabBeer: [
    "Plain lager for me. On principle. Someone's got to hold the line.",
    "Cheers. To the shed. May she never be rezoned.",
    "Ah. That first one. Like a hug from a cold relative.",
    "Thanks, champ. I'll put it on my tab. The tab is you.",
  ],
  headHome: [
    "Fair call. You've earned the couch. I'll see myself out. Via the fridge.",
    "No worries. Early night. Very mature. I'll tell the others you've grown up.",
    "Righto. I'll take one for the walk. The tram home's a long road. It's four stops.",
    "All good. Go on, get home. I'll knock again tomorrow. Metaphorically. No knocker.",
  ],
  another: {
    ask: [
      t('Another one?'),
      t("Fridge is giving me a look. Another?", 'laughing'),
      t("I'm going in. You want one, or are you watching your figure?"),
      t("One more for the road. The road's very thirsty this time of year."),
    ],
    yes: [
      t('Good. I was going anyway. Now it looks like a team decision.', 'laughing'),
      t("Champion. Plain lager for me, whatever you like for you. I'm not your dad."),
      t("Lovely. Write that down: best decision of the day.", 'animated'),
    ],
    no: [
      t("Fair enough. More for the fridge. She'll look after them."),
      t("Respect. I'll pace myself too. Next to you. Holding this one. Slowly."),
      t("No worries. Hydrate. Water's just beer that hasn't applied itself.", 'laughing'),
    ],
  },
  windUp: [
    [t("Good night, that. Best crate in Melbourne.", 'relaxed'), q("Proud of you, you know. The shed. All of it. Right. Bye.", 'misty')],
    [t("Righto. I'll leave you to it."), t("Same time tomorrow? Don't answer. I'll just turn up.", 'laughing')],
    [q("Cheers for the beers, mate. Best bar in the inner north and it smells of sawdust.", 'relaxed')],
    [t("That'll do us. Good chat.", 'thoughtful'), t("Lock up properly. Not because of thieves. Because of me. I'll be back.", 'laughing')],
    [t("I'm calling it. Like a trivia answer. Confidently, and probably right.", 'animated')],
  ],
  phone: [
    t("Tim Baker, captain, Quiz Team Aguilera. How can I help."),
    t("Are there beers? Don't answer. I can hear the fridge humming. On my way.", 'laughing'),
  ],
  arrive: [
    t("Delivery. Six plain lagers and a bag of chips I've already opened.", 'animated'),
    t("Sorry I'm late. I wasn't. I was having a chat with your bins. Lovely bins."),
  ],
  cutIn: [
    t("Sorry, can I just say: that's a question for trivia. Write that down.", 'animated'),
    t("Hang on, hang on. Before you go on. Correct.", 'laughing'),
    t("I'll be honest, I wasn't listening, but I agree."),
    t("Point of order. Is there a parma involved? No? Carry on."),
    t("That's what I've been saying. Not out loud. But in here.", 'thoughtful'),
  ],
  love: [
    t("I love you, mate. Don't make it weird. It's already weird. Leave it.", 'misty'),
    q("Love you, champ. You're the plain lager of people. Reliable. Underrated.", 'misty'),
    t("I'd put you on my trivia team. That's the highest thing I can say. Love ya.", 'misty'),
    t("Love you both. Genuinely. Someone write that down so I can deny it tomorrow.", 'laughing'),
  ],
  music: [
    t("Right, music. This is the Thornbury Tramlines. Three blokes and a cello. Life-changing.", 'animated'),
    t("Putting on Sister Parma. Coburg pub-rock. Saw them once to six people. I was four of them.", 'laughing'),
    t("This is Lionel Hush. Sad synth from Preston. You will cry. Then you will dance. Then cry.", 'thoughtful'),
    t("Mixtape time. Every song's about a tram. It's a concept album. My concept.", 'animated'),
  ],
  trace: {
    start: [
      'Go on, champ. Steady hands. Pretend it is a parma and you are crumbing it.',
      "Right. No pressure. It's only going on a wall forever.",
      'Off you go. I will provide commentary. Like the cricket. But less qualified.',
    ],
    wobbly: [
      'Bit wonky there, champ.',
      'Ooh. Bit of a detour. Scenic route.',
      "That's not a mistake. That's character. Write that down.",
      'Bit of a wobble. Like me after trivia.',
    ],
    good: [
      'Look at that. Smooth as.',
      "That's lovely. Hands like a surgeon. A surgeon who's had two beers.",
      'Steady. Steady. Beautiful.',
      'Oh, that line. You could frame that line.',
    ],
    done: [
      "Beauty. I'm getting a bit misty. It's the dust. It's not the dust.",
      'Done. Masterpiece. We should charge admission.',
      "Look at it. That's going in the will.",
      'Cut and dried. Mostly cut. Write that down.',
    ],
  },
  heardIdea: [
    "Heard you and {lastIdeaWith} were opening {lastIdea}. Where's my invite? I'll bring a plain lager.",
    "So. {lastIdea}, I hear. With {lastIdeaWith}. Bold. I give it a week. I'll invest twenty bucks.",
    "{lastIdeaWith} told me about {lastIdea}. I've already written a review. Four stars. Lost one for parking.",
  ],
};

export const THREADS: Thread[] = [
  // ---------------------------------------------------------------- stage 1: shop talk
  {
    id: 'tim-shop-pickup', kind: 'shop', friend: 'tim', stage: 1, needs: ['pickup'],
    nodes: [
      {
        id: 'a',
        say: [t("Saw {customer} leaving with the {design}. Carrying it like a newborn."), t('Happy customer?')],
        replies: [{ text: 'Over the moon. Took a photo with it.', next: 'b' }, { text: "Hard to tell. They just nodded.", next: 'c' }],
      },
      {
        id: 'b',
        say: [q("That's the job, isn't it. Someone takes a photo of a thing you made. Their nan sees it.", 'thoughtful')],
        replies: [{ text: "Their nan's got good taste.", another: true }, { text: 'Nans are the core demographic.' }],
      },
      {
        id: 'c',
        say: [t("A nod's good. A nod from a Melbourne customer is a standing ovation.", 'laughing'), t("I nod at the tram driver. It's the most I've ever felt.")],
        replies: [{ text: "I'll take a nod.", another: true }, { text: 'Next time I want a wave.' }],
      },
    ],
  },
  {
    id: 'tim-shop-fire', kind: 'shop', friend: 'tim', stage: 1, needs: ['fire'],
    nodes: [
      {
        id: 'a',
        say: [t("Bit of a smell in here. Smoky. Like a pizza oven had a bad day.", 'thoughtful'), t('Was there a fire?')],
        replies: [{ text: 'Small one. Very small. Tiny fire.', next: 'b' }, { text: "Don't want to talk about it.", next: 'c' }],
      },
      {
        id: 'b',
        say: [q("So you're saying business is heating up. Write that down.", 'laughing'), t("Seriously though. You right? Hands all there?")],
        replies: [{ text: 'All ten. Counted twice.', another: true }, { text: 'Nine and a half. Joking.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Fair. Too soon. I'll just say this: you're a hot property.", 'laughing')],
        replies: [{ text: "Please leave.", another: true }, { text: 'That one was actually good.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Ha. Glad you're right. Fire's the router's way of saying it's working too hard. Like you.", 'thoughtful')],
        replies: [{ text: "We're both on smoko from here.", another: true }, { text: 'Fair call.' }],
      },
    ],
  },
  {
    id: 'tim-shop-gift', kind: 'shop', friend: 'tim', stage: 1, needs: ['gift'],
    nodes: [
      {
        id: 'a',
        say: [t("What's that on the bench?"), t("{giver} brought you {gift}? Just like that? No invoice?", 'animated')],
        replies: [{ text: 'No invoice. Just {gift}.', next: 'b' }, { text: "Want some? You can't have any.", next: 'c' }],
      },
      {
        id: 'b',
        say: [q("That's the economy we should be in. You cut a thing, someone brings you {gift}.", 'thoughtful')],
        replies: [{ text: 'The barter system. Coburg-style.', another: true }, { text: 'I still need actual money, though.' }],
      },
      {
        id: 'c',
        say: [t("I'm not asking for me. I'm asking for my inner child. He's very hungry.", 'laughing')],
        replies: [{ text: 'Fine. Your inner child can have a bit.', another: true }, { text: 'Tell him to cut his own sign.' }],
      },
    ],
  },
  {
    id: 'tim-shop-jess', kind: 'shop', friend: 'tim', stage: 1, needs: ['jess'],
    nodes: [
      {
        id: 'a',
        say: [t("{jess} in today? How's she going?")],
        replies: [{ text: "Better than me. She's quicker on the sanding.", next: 'b' }, { text: 'She reorganised my whole drill bit wall.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Course she is. You've got good staff. That's the whole secret. Ask any pub.", 'thoughtful')],
        replies: [{ text: 'Staff. Plural. One person.', another: true }, { text: "Don't tell her. She'll want a raise." }],
      },
      {
        id: 'c',
        say: [t("Colour-coded?"), q("Marry her. Not literally. Professionally. Give her a lanyard.", 'laughing')],
        replies: [{ text: "I'll get some lanyards cut.", another: true }, { text: 'Lanyard is the highest honour.' }],
      },
    ],
  },
  {
    id: 'tim-shop-busy', kind: 'shop', friend: 'tim', stage: 1, needs: ['busy'],
    nodes: [
      {
        id: 'a',
        say: [t('{sheets} sheets today? Look at you. Industrial revolution.', 'animated')],
        replies: [{ text: "I'm basically a factory now.", next: 'b' }, { text: "I'm basically a puddle now.", next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Next you'll want a hard hat. A clipboard. A bloke called Gary."), t("Every factory's got a Gary.", 'laughing')],
        replies: [{ text: 'You could be Gary.', next: 'd' }, { text: 'I am Gary.', another: true }],
      },
      {
        id: 'c',
        say: [t("Sit. Drink. Don't operate heavy machinery. Apart from the bottle opener.", 'laughing')],
        replies: [{ text: 'Doctor Tim Baker.', another: true }, { text: 'Bottle opener is my best tool.' }],
      },
      {
        id: 'd',
        say: [q("Gary Baker. I'd wear hi-vis to the pub. People would ask me for directions.", 'animated')],
        replies: [{ text: "You'd love that.", another: true }, { text: "You'd give them wrong ones." }],
      },
    ],
  },
  {
    id: 'tim-shop-quiet', kind: 'shop', friend: 'tim', stage: 1, needs: ['quiet'],
    nodes: [
      {
        id: 'a',
        say: [t('Quiet one? {sheets} sheets?'), t("Nothing wrong with that. Even the router needs a lie down.", 'relaxed')],
        replies: [{ text: 'Did a lot of sweeping.', next: 'b' }, { text: 'Bit worried, honestly.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Sweeping's underrated. It's meditation with a handle.", 'thoughtful')],
        replies: [{ text: 'Write that down.', another: true }, { text: 'My broom is my therapist.' }],
      },
      {
        id: 'c',
        say: [t("Don't be. One quiet day's not a trend. It's a Tuesday. Even if it's Thursday.", 'thoughtful'), q('Everyone round here knows where you are. They come back.', 'misty')],
        replies: [{ text: 'Yeah. You might be right.', another: true }, { text: 'You come back. Mostly for the fridge.' }],
      },
    ],
  },
  {
    id: 'tim-shop-question', kind: 'shop', friend: 'tim', stage: 1,
    nodes: [
      {
        id: 'a',
        say: [t("Trivia question for you. Practice round."), t("What's the fastest a CNC router can go?", 'animated')],
        replies: [{ text: 'Depends on the feed rate and the material.', next: 'b' }, { text: 'Faster than you to the fridge.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Too right. Too technical, though. The answer on the card is 'very'.", 'laughing')],
        replies: [{ text: 'Who writes your cards?', next: 'd' }, { text: "I'll accept 'very'.", another: true }],
      },
      {
        id: 'c',
        say: [t("Incorrect. Nothing's faster than me to the fridge. That's a known constant.")],
        replies: [{ text: "Fair. You're a natural force.", another: true }, { text: 'Who writes your cards?', next: 'd' }],
      },
      {
        id: 'd',
        say: [q("I write my own cards. That's how we win. It's not cheating if nobody checks.", 'laughing')],
        replies: [{ text: "That's absolutely cheating.", another: true }, { text: 'Quiz Team Aguilera: built on lies.' }],
      },
    ],
  },
  {
    id: 'tim-shop-extractor', kind: 'shop', friend: 'tim', stage: 1,
    nodes: [
      {
        id: 'a',
        say: [t("That extractor fan's got a lovely voice. Bit of a baritone."), t("Have you thought about recording it?", 'thoughtful')],
        replies: [{ text: 'For the band?', next: 'b' }, { text: "It's not a voice, it's a cry for help.", next: 'c' }],
      },
      {
        id: 'b',
        say: [t("For the band. Our drummer will be the fan. Very reliable. Never late. Only one beat.", 'animated')],
        replies: [{ text: 'One beat is enough.', another: true }, { text: "That's every drummer." }],
      },
      {
        id: 'c',
        say: [t("Every great singer's crying for help. That's what makes it art.", 'laughing')],
        replies: [{ text: "I'll book it in for a service.", another: true }, { text: "I'll tell it you said that." }],
      },
    ],
  },

  // ---------------------------------------------------------------- stage 2: life
  {
    id: 'tim-life-2012', kind: 'life', friend: 'tim', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("You know what I'd do differently?", 'thoughtful'), t('Should have bought in 2012.')],
        replies: [{ text: 'You say that every year.', next: 'b' }, { text: 'Where would you have bought?', next: 'c' }],
      },
      {
        id: 'b',
        say: [q("Every year. It's tradition. Christmas, Easter, should've bought in 2012.", 'laughing')],
        replies: [{ text: "What would you really do differently?", next: 'd' }, { text: 'A noble tradition.', another: true }],
      },
      {
        id: 'c',
        say: [t("Coburg. Little weatherboard with a lemon tree. Walked past it twice. Bought a parma instead.")],
        replies: [{ text: 'Was it a good parma?', next: 'd' }, { text: 'Priorities.', another: true }],
      },
      {
        id: 'd',
        say: [t("Honestly? Not much. I've got good mates, a good team, a good crate.", 'thoughtful'), q("Wouldn't swap it for a lemon tree.", 'misty')],
        replies: [{ text: 'Maybe for two lemon trees.', another: true }, { text: "That's lovely, mate." }],
      },
    ],
  },
  {
    id: 'tim-life-mum', kind: 'life', friend: 'tim', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("Mum rang. She's started a book club. They don't read the books."), t("They just argue about the biscuits.", 'laughing')],
        replies: [{ text: "That's every book club.", next: 'b' }, { text: 'What are the biscuit positions?', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("She asked if you were still doing the cutting. I said you're a master craftsman now."), t("She wants a sign for the book club.", 'animated')],
        replies: [{ text: "For your mum? On the house.", next: 'd' }, { text: 'What does it say?', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Two camps. Ginger nut and the cream ones. There's been tears. Shirley's left twice.", 'laughing')],
        replies: [{ text: "I'm with Shirley.", another: true }, { text: 'Which side is your mum?', next: 'd' }],
      },
      {
        id: 'd',
        say: [q("She wants it to say 'We Have Read Some Of It'. I think that's beautiful.", 'misty')],
        replies: [{ text: "I'll cut it this week.", another: true }, { text: 'Your mum is a poet.', another: true }],
      },
    ],
  },
  {
    id: 'tim-life-band', kind: 'life', friend: 'tim', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("I'm still starting the band, you know.", 'thoughtful'), t("Any day now. Possibly a Wednesday.")],
        replies: [{ text: "What's it called this week?", next: 'b' }, { text: 'Do you play anything yet?', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("The Plain Lagers. No. The Late Trams. No. Upper Coburg Philharmonic.", 'animated')],
        replies: [{ text: 'Upper Coburg. Stop there.', next: 'd' }, { text: 'Does Upper Coburg exist?', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("I own a tambourine. I've owned it for eleven years. We're taking it slow.", 'laughing')],
        replies: [{ text: 'Eleven years is a real relationship.', next: 'd' }, { text: 'Tambourine is a gateway drug.', another: true }],
      },
      {
        id: 'd',
        say: [q("Doesn't matter if it happens. It's nice having a band you're about to start.", 'thoughtful')],
        replies: [{ text: "I'll do the merch.", another: true }, { text: "I'll come to the first gig. All six of us." }],
      },
    ],
  },
  {
    id: 'tim-life-business', kind: 'life', friend: 'tim', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("Can I ask a business question?"), t("Are you making money? Not a lot. Just, like, enough for crates?", 'thoughtful')],
        replies: [{ text: 'Enough for crates. Just.', next: 'b' }, { text: 'Some weeks. Other weeks, crates.', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("I make spreadsheets at work. For a company that makes other spreadsheets."), t("You make actual things. People touch them.", 'thoughtful')],
        replies: [{ text: 'People touch your spreadsheets.', next: 'c' }, { text: 'You could always come work here.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Nobody's ever touched my spreadsheets. Not once. Not even with a cursor.", 'laughing')],
        replies: [{ text: "I'll touch one. As a friend.", another: true }, { text: 'Print one out. I can cut a frame.' }],
      },
      {
        id: 'd',
        say: [q("Don't tempt me. I'd be the worst employee. I'd sweep for an hour and call it smoko.", 'laughing')],
        replies: [{ text: "You're hired. Salary: crates.", another: true }, { text: "{jess} would have you sorted in a day." }],
      },
    ],
  },
  {
    id: 'tim-life-sister', kind: 'life', friend: 'tim', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("My nephew's eight. Asked me what I do. I said 'quiz'.", 'laughing'), t("He's told the whole class his uncle is a professional quizzer.")],
        replies: [{ text: 'You basically are.', next: 'b' }, { text: 'Did you correct him?', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("We came fourth last week. Fourth of nine. That's top half. Nearly."), t("He made me a medal out of a bottle cap.", 'misty')],
        replies: [{ text: 'Real medal energy.', next: 'd' }, { text: 'I could cut you a proper one.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("No. Never correct a child when they're making you sound good. First rule of uncling.")],
        replies: [{ text: 'Write that down.', another: true }, { text: "What's the second rule?", next: 'd' }],
      },
      {
        id: 'd',
        say: [q("Always be the uncle who knows the capital of Mongolia. They remember that.", 'thoughtful')],
        replies: [{ text: 'Ulaanbaatar.', another: true }, { text: "I'd have said 'Mongolia City'.", another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- stage 3: the big stuff
  {
    id: 'tim-deep-meaning', kind: 'deep', friend: 'tim', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("Can I get serious for a sec? Just one sec. Then I'll do a pun.", 'thoughtful'), t('Why do you do it? The shed. All of it.')],
        replies: [{ text: 'I like making things people keep.', next: 'b' }, { text: 'Honestly? Nobody tells me what to do.', next: 'c' }],
      },
      {
        id: 'b',
        say: [q("That's it, isn't it. Somewhere in Brunswick there's a sign you cut. It'll outlive both of us.", 'misty')],
        replies: [{ text: "That's a nice thought.", next: 'd' }, { text: "Hopefully not in a skip.", next: 'd' }],
      },
      {
        id: 'c',
        say: [t("That's freedom. Proper freedom. You and a machine and nobody's boss of nobody.", 'thoughtful')],
        replies: [{ text: "The router's the boss, really.", next: 'd' }, { text: 'Sometimes I miss a boss to blame.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Right. One sec's up."), t("Work is like a parma. Better when someone else made it with love.", 'laughing')],
        replies: [{ text: "That's barely a pun.", another: true }, { text: 'Write that down.', another: true }],
      },
    ],
  },
  {
    id: 'tim-deep-mates', kind: 'deep', friend: 'tim', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("How long have we known each other now?", 'thoughtful')],
        replies: [{ text: 'Long enough to sit on crates in silence.', next: 'b' }, { text: 'Since that terrible share house.', next: 'c' }],
      },
      {
        id: 'b',
        say: [q("That's the test, isn't it. You can sit quiet with a mate and it's still a good night.", 'misty')],
        replies: [{ text: 'Let us test it now.', next: 'd' }, { text: "You've never been quiet once.", next: 'd' }],
      },
      {
        id: 'c',
        say: [t("The Northcote one. With the possum in the ceiling we called Landlord.", 'laughing'), t("He paid more rent than me.")],
        replies: [{ text: 'Landlord was a good possum.', next: 'd' }, { text: 'Landlord had his life together.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("..."), t("...", 'thoughtful'), q("Lovely. Best silence I've had all week. Thanks, mate.", 'misty')],
        replies: [{ text: 'Any time.', another: true }, { text: 'That was eight seconds.', another: true }],
      },
    ],
  },
  {
    id: 'tim-deep-older', kind: 'deep', friend: 'tim', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("Found a grey hair this morning. In my eyebrow. My eyebrow.", 'animated'), t("Do you feel old?")],
        replies: [{ text: 'Only my knees do.', next: 'b' }, { text: 'Not on knock-off. Only at 7am.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Knees are the first to go. Then the hearing. Then you start liking jazz.", 'laughing')],
        replies: [{ text: 'I already like jazz.', next: 'd' }, { text: "We've got a while yet.", next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Fair. 7am is an old person's hour. Nobody young is awake at 7am. That's the law.")],
        replies: [{ text: "But it doesn't scare you?", next: 'd' }, { text: 'I start the router at 7.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Here's my plan. Get old. Get really good at trivia. Win everything at 84.", 'thoughtful'), q("Getting older's fine if your mates do it with you. Bit like a tram.", 'misty')],
        replies: [{ text: "We'll all be on the tram.", another: true }, { text: "That's not how trams work.", another: true }],
      },
    ],
  },
  {
    id: 'tim-deep-proud', kind: 'deep', friend: 'tim', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("What are you proudest of? And don't say the router. The router did the work.", 'thoughtful')],
        replies: [{ text: 'That the doors are still open.', next: 'b' }, { text: 'Fair. What are YOU proudest of?', next: 'c' }],
      },
      {
        id: 'b',
        say: [q("Too right. Half of Coburg's got a bit of this shed on their wall. That's a legacy.", 'misty')],
        replies: [{ text: "A sawdust legacy.", next: 'd' }, { text: "What about you, then?", next: 'c' }],
      },
      {
        id: 'c',
        say: [t("Honestly? Quiz Team Aguilera. Eight years. We've never won. Never missed a week.", 'thoughtful')],
        replies: [{ text: "That's the proudest thing I've heard.", next: 'd' }, { text: 'Turning up is the whole thing.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Turning up. That's it, really. You turn up for the shed, I turn up for trivia."), t("And we both turn up here.", 'misty')],
        replies: [{ text: 'Same crate, same time.', another: true }, { text: "Don't get soppy, I'll cry.", another: true }],
      },
    ],
  },
  {
    id: 'tim-deep-dad', kind: 'deep', friend: 'tim', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("Dad used to have a shed. Not like this. Just a shed. Full of jars of screws.", 'thoughtful'), t('He never used one screw.')],
        replies: [{ text: 'Were they for something?', next: 'b' }, { text: 'I have three of those jars.', next: 'c' }],
      },
      {
        id: 'b',
        say: [q("I reckon the shed was the something. Somewhere to go and be quietly useful.", 'misty')],
        replies: [{ text: "That's what this is, really.", next: 'd' }, { text: 'Quietly useful. Good epitaph.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Course you do. Every shed's got the jars. They're load-bearing.", 'laughing')],
        replies: [{ text: 'The jars hold the whole place up.', next: 'd' }, { text: "Your dad would've liked it here.", next: 'd' }],
      },
      {
        id: 'd',
        say: [t("He'd have loved this place. Would've sat right there and told you you're doing it wrong.", 'misty'), t("Then asked for a sign.")],
        replies: [{ text: "I'd have cut him one.", another: true }, { text: "Here's to your dad.", another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- the big idea: the restaurant
  {
    id: 'tim-restaurant', kind: 'bigIdea', friend: 'tim', stage: 2, bigIdea: 'restaurant',
    nodes: [
      {
        id: 'a',
        say: [t("I've had a thought. Hear me out. Don't speak.", 'animated'), q("A restaurant. Parmas. Only parmas. Called Parmanent Residence.", 'animated')],
        replies: [{ text: 'Parmanent Residence. Oh no. Oh yes.', next: 'b' }, { text: 'Where would it be?', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("Sydney Road. Old shopfront. Exposed brick, tram rattling past."), t("Every table is a milk crate. Like this. It's a theme.", 'animated')],
        replies: [{ text: "I'd cut the menu boards.", next: 'c' }, { text: 'Milk crates are a liability.', next: 'c' }],
      },
      {
        id: 'c',
        say: [t("Exactly. You'd do the fit-out, I'd do front of house. I'm very good at the front of houses.", 'animated'), t("Menu's half-written. Parma, parma deluxe, parma for the table.")],
        replies: [{ text: "What's the deluxe?", next: 'd' }, { text: 'Is there a vegetarian parma?', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("It's a parma on a parma. And an eggplant one. And Tuesdays is trivia. Obviously I host."), t("This is real. Write that down.", 'animated')],
        replies: [{ text: "Who's in the kitchen?", next: 'e' }, { text: "I'm writing it down. Right after this.", next: 'e' }],
      },
      {
        id: 'e',
        say: [t('...'), t("Wait. Do either of us know how to cook?", 'thoughtful')],
        replies: [{ text: 'I can do toast. Mostly.', next: 'f' }, { text: 'What did you have for breakfast?', next: 'f' }],
      },
      {
        id: 'f',
        say: [q("I did Milo on toast this morning.", 'laughing'), t("Parmanent Residence is now a temporary visa. Cheers.", 'laughing')],
        replies: [{ text: "To the best restaurant that never was.", another: true }, { text: 'Milo on toast is a cuisine.', another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- after-hours cuts
  {
    id: 'tim-cut-parma', kind: 'cut', friend: 'tim', stage: 2, cut: 'ah-parma',
    nodes: [
      {
        id: 'a',
        say: [t("Let's cut a sign for the trivia team. Shaped like a parma. Obviously.", 'animated'), t("We hold it up when we win. Or when we come fourth.")],
        replies: [{ text: "Get the MDF. Let's cut it.", cut: true }, { text: 'Do you deserve a sign?', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("Deserve? Eight years. Never won. Never missed a week. Not one.", 'thoughtful'), q("If anyone deserves a parma-shaped sign, it's us.", 'misty')],
        replies: [{ text: "Alright. You've moved me. Let's cut.", cut: true }, { text: "Win once and I'll cut you two.", another: true }],
      },
    ],
  },
  {
    id: 'tim-cut-pick', kind: 'cut', friend: 'tim', stage: 2, cut: 'ah-pick',
    nodes: [
      {
        id: 'a',
        say: [t("Cut me a guitar pick the size of a dinner plate. For the band I will one day start.", 'animated')],
        replies: [{ text: "Grab the acrylic. Let's cut it.", cut: true }, { text: 'Tim. You play tambourine.', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("The pick's not for playing. It's for believing. You hang it up, the band comes.", 'thoughtful'), t("Field of Dreams but in Coburg.", 'laughing')],
        replies: [{ text: "Fine. If I cut it, the band will come.", cut: true }, { text: 'Start the band first.', another: true }],
      },
    ],
  },
  {
    id: 'tim-cut-trophy', kind: 'cut', friend: 'tim', stage: 2, cut: 'ah-trophy',
    nodes: [
      {
        id: 'a',
        say: [t("Trophy. For the best customer. We present it. There's a speech. I'll write it.", 'animated'), t("Opens with a joke. Closes with a tear.")],
        replies: [{ text: "Love it. Let's cut it now.", cut: true }, { text: "What's the joke?", next: 'b' }],
      },
      {
        id: 'b',
        say: [t("'I'd like to thank the router. Without it, this would just be a plank.'", 'laughing'), t("Then the tear. Probably mine.", 'misty')],
        replies: [{ text: "Sold. Cut it.", cut: true }, { text: 'Workshop the joke first.', another: true }],
      },
    ],
  },
  {
    id: 'tim-cut-freehand', kind: 'cut', friend: 'tim', stage: 2, cut: 'freehand',
    nodes: [
      {
        id: 'a',
        say: [t("Here's a thought. Draw whatever you want. No customer. No brief. Just you.", 'thoughtful')],
        replies: [{ text: "Alright. Let's see what comes out.", cut: true }, { text: "I wouldn't know what to draw.", next: 'b' }],
      },
      {
        id: 'b',
        say: [q("That's the point. Nobody knows what to draw. Draw a squiggle. Squiggles are art.", 'animated')],
        replies: [{ text: "One squiggle, coming up.", cut: true }, { text: "Another night. I'll think on it.", another: true }],
      },
    ],
  },
];
