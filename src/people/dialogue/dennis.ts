// Dennis, the accountant, at knock-off now and then. Cheerful, numerate, slightly too keen. Round figures, odds and
// percentages ("I'd say four in five"), a spreadsheet for everything, honest about his odds. A bit lonely, very decent.
// A lightweight: sentimental by beer three. Hopeless at pacing himself, brilliant at the big idea (he runs the numbers).
import type { Expr, FriendScript, Line, Thread } from './types.js';

const t = (text: string, expr?: Expr): Line => (expr ? { text, expr } : { text });
const q = (text: string, expr?: Expr): Line => ({ ...t(text, expr), quote: true });

export const SCRIPT: FriendScript = {
  greet: [
    "Thought I'd drop by. I brought a spreadsheet. Kidding. It's on my phone.",
    'Evening! Five on the dot. Well, 4:58. I waited round the corner for two minutes.',
    'Hello hello. Am I interrupting? Say no. Historically, ninety percent of people say no.',
    "Knock-off, is it? I've budgeted for two beers. Realistically I'll manage one and a half.",
    'Brought chips. Salt and vinegar. I asked around the office. It polled at sixty-two percent.',
  ],
  grabBeer: [
    "Oh, lovely. Cheers. Pace me, would you? I'm what they call a lightweight. 'They' being everyone.",
    "Cheers! To the shed. Up on last quarter, not that I've looked. I've looked.",
    "Ta. I'll make this one last. Historically they don't last. Historically, neither do I.",
    "Ooh, cold. Cheers. If I start hugging people, that's beer three. Fair warning.",
  ],
  headHome: [
    "No, fair enough! An early night's a sound investment. I'll pop back another time.",
    "Righto. Get some rest. I'll walk to the tram. It's eleven minutes. I've timed it.",
    "All good. I'll leave you be. Big day. You'll sleep like a balanced ledger.",
    "Course. Off you go. That was a lovely four minutes. Genuinely. Top quartile.",
  ],
  another: {
    ask: [
      t("Another one? I'm at about seventy percent capacity. So, one."),
      t("Fridge run? I'll go. I like opening other people's fridges. It's very trusting.", 'laughing'),
      t("Shall we? I'll have a small one. They're all the same size. I know. Let me have this."),
      t('Another? Odds I regret it: one in three. Odds I enjoy it: three in three.', 'animated'),
      t('One more? My spreadsheet says no. My spreadsheet has never sat on a milk crate.', 'laughing'),
    ],
    yes: [
      t("Lovely! Oh, this is nice. This is very nice. I'm already a bit fuzzy.", 'laughing'),
      t('Good call. Best decision of the quarter.', 'animated'),
      t("Cheers. If I go quiet, I'm fine. If I go loud, I'm fine and I love you.", 'laughing'),
    ],
    no: [
      t("Fair. Prudent. I'll nurse this one. I'm a very good nurse."),
      t("Sensible. Lowest-risk option. I respect that more than you'll ever know.", 'thoughtful'),
      t("No worries. I'll pretend I'm sensible too. Look at me. Sipping.", 'laughing'),
    ],
  },
  windUp: [
    [t("Well. That was lovely. I'm writing that one up in the good column.", 'misty'), t('Thanks for having me. Really.')],
    [q("Best knock-off I've had this year. Statistically, that's out of about four. Still counts.", 'laughing')],
    [t('Right, the tram. Lock up, check the extractor, drink a glass of water.'), t("That's my professional advice. Also my personal advice.", 'laughing')],
    [t("I'm calling it. Proper lightweight, me.", 'laughing'), q("You've built something good here, you know. Ten out of ten. No rounding.", 'misty')],
    [t("Same time next month? I'll pencil it in. In pen.", 'animated')],
  ],
  phone: [
    t("Hello, Dennis speaking! Oh, it's you. Is it a tax thing? It's not a tax thing. Lovely.", 'animated'),
    t("I'll come down. I'll bring light beers for me and proper ones for you. Twenty minutes.", 'laughing'),
  ],
  arrive: [
    t('Hello! I brought six beers and a calculator. One of those is a joke.', 'animated'),
    t("The calculator's real. The beers are real too. Hello, everyone! Budge up.", 'laughing'),
  ],
  cutIn: [
    t("Sorry, can I add a number to that? It's a big number. No, go on.", 'animated'),
    t("I'd put the odds on that at about four in five. Carry on."),
    t("That's true. I don't have data, but I've got a feeling, and the feeling's got data.", 'laughing'),
    t('Agree. Strongly. Seventy percent strongly.', 'thoughtful'),
    t('Can I say something? No, you go. No, I will. Sorry. You go.', 'laughing'),
  ],
  love: [
    q("I love you lot. I'm a lightweight, yes. But I'd love you sober. Eighty percent as much.", 'misty'),
    t("You're my favourite client. Don't tell the others. You're also my favourite person. Tell everyone.", 'misty'),
    t("Can I just say? Best crate in Melbourne. Best people on it. That's audited.", 'misty'),
    t("I don't have heaps of mates. But I've got you two. That's a very good portfolio.", 'misty'),
  ],
  music: [
    t("Music! My mate's band. Three accountants and a sax. They're called Carry the One.", 'animated'),
    t('Putting on Brenda Ledger. Northcote folk. Every song is about a long weekend.', 'thoughtful'),
    t('This is the Reservoir Rounding Errors. They play every song a bit too fast. I adore them.', 'laughing'),
    t("I made a playlist. 'Knock-Off'. Eleven songs, forty-four minutes. Perfectly balanced.", 'animated'),
  ],
  trace: {
    start: [
      'Righto. Steady hands. Think of it as a very slow, very pointy signature.',
      'Off you go. Odds of a perfect line: one in ten. Odds of a lovely one: nine in ten.',
      "Go on. I'll be quiet. I won't. But I'll try. Sixty percent.",
    ],
    wobbly: [
      'Ooh. Bit of variance there.',
      "That's a rounding error. We'll call it character.",
      'Little wobble. Within tolerance. My tolerance.',
      'Bit wonky! Like me at beer three.',
    ],
    good: [
      'Look at that line. Straighter than my tax return.',
      'Oh, lovely. Very steady.',
      "Beautiful. I'd sign off on that.",
      'Smooth! Ninety-five percent smooth. That five is me being honest.',
    ],
    done: [
      "Oh, it's gorgeous. I'm a bit teary. It's the beer. It's not the beer.",
      "Done! I'm adding that to the asset register.",
      'Look at it. About four dollars of material and a million in feelings.',
      "Beautiful. I'm taking a photo. Several. For the records.",
    ],
  },
  heardIdea: [
    "Heard you and {lastIdeaWith} were opening {lastIdea}. Want me to run the numbers? I've run the numbers.",
    "So. {lastIdea}, with {lastIdeaWith}. I'd give it one in twenty. Happy to be the one. Tab one's a logo.",
    "{lastIdeaWith} told me about {lastIdea}. I've started a spreadsheet. It's very optimistic. Mostly fonts.",
  ],
};

export const THREADS: Thread[] = [
  // ---------------------------------------------------------------- stage 1: shop talk
  {
    id: 'dennis-shop-pickup', kind: 'shop', friend: 'dennis', stage: 1, needs: ['pickup'],
    nodes: [
      {
        id: 'a',
        say: [t('Saw {customer} go past with the {design}. I did a quick sum on the footpath.'), t('What did you charge? Ballpark. Round figures.', 'animated')],
        replies: [{ text: 'Enough. I think. Probably.', next: 'b' }, { text: "Mate, you're off the clock.", next: 'c' }],
      },
      {
        id: 'b',
        say: [t("'Probably' is my least favourite word. Second is 'roughly'.", 'laughing'), t("Send me the hours. I'll tell you if you're a genius or a charity.")],
        replies: [{ text: 'Bit of both, I reckon.', another: true }, { text: "Tell me I'm a genius.", next: 'd' }],
      },
      {
        id: 'c',
        say: [t("I'm never off the clock. The clock's in here.", 'laughing'), q("But they looked happy. That's not on any spreadsheet. It should be.", 'thoughtful')],
        replies: [{ text: 'Add a column for it.', another: true }, { text: 'Happy pays the rent. Eventually.', next: 'd' }],
      },
      {
        id: 'd',
        say: [q('Genius. An undercharging genius. Put ten percent on the next one. Do it for me.', 'animated')],
        replies: [{ text: 'Ten percent. For you.', another: true }, { text: "Five. Let's not get silly.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-shop-fire', kind: 'shop', friend: 'dennis', stage: 1, needs: ['fire'],
    nodes: [
      {
        id: 'a',
        say: [t('Smells like a barbecue in here. {fires} fire today?', 'thoughtful'), t("I'm not judging. I'm just pricing it.")],
        replies: [{ text: 'Only small. A bag of dust went up.', next: 'b' }, { text: "Don't put it in the spreadsheet.", next: 'c' }],
      },
      {
        id: 'b',
        say: [t('Extractor bags. Industry average is one every forty days or so. You run hot.'), t('You right, though? Eyebrows intact?', 'thoughtful')],
        replies: [{ text: 'Both eyebrows. Fully accounted for.', next: 'd' }, { text: 'Lost a bit of one.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Too late. It's in. Column F. I've coloured it orange, as a kindness.", 'laughing')],
        replies: [{ text: 'Orange is generous.', another: true }, { text: "What's red for?", next: 'd' }],
      },
      {
        id: 'd',
        say: [q("Shed's fine, you're fine. That's a hundred percent of what matters. The rest is just numbers.", 'misty')],
        replies: [{ text: 'From you, that means a lot.', another: true }, { text: "Who are you and what've you done with {host}?", another: true }],
      },
    ],
  },
  {
    id: 'dennis-shop-late', kind: 'shop', friend: 'dennis', stage: 1, needs: ['late'],
    nodes: [
      {
        id: 'a',
        say: [t("So. {late} late today? I'm not cross. I just can't not count things.")],
        replies: [{ text: 'Ran out of hours.', next: 'b' }, { text: 'The router had a sulk.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Everyone runs out of hours. I've done the sums. There's only twenty-four.", 'laughing'), t('What time did you start, out of interest?')],
        replies: [{ text: 'Seven. Ish.', next: 'd' }, { text: "Don't ask.", next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Machines sulk. My printer's been sulking since 2019. I speak to it gently.", 'thoughtful')],
        replies: [{ text: 'Does that help?', next: 'd' }, { text: "Your printer's not a CNC router.", another: true }],
      },
      {
        id: 'd',
        say: [q('Late but done beats on time and rubbish. Put that on a sign. You know a bloke with a router.', 'animated')],
        replies: [{ text: "I'll cut it tomorrow.", another: true }, { text: 'Put it in a spreadsheet instead.', another: true }],
      },
    ],
  },
  {
    id: 'dennis-shop-jess', kind: 'shop', friend: 'dennis', stage: 1, needs: ['jess'],
    nodes: [
      {
        id: 'a',
        say: [t("{jess} in today? What's she on these days, hours-wise?"), t("Sorry. Habit. How's she going?", 'laughing')],
        replies: [{ text: "Brilliant. She's faster than me.", next: 'b' }, { text: 'She wants more hours.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Then she's worth more than she costs. That's the only staff maths that matters.", 'thoughtful'), q('Good people are the one line item that pays you back twice.', 'misty')],
        replies: [{ text: "Don't tell her that.", another: true }, { text: "I'll write that on the wall." }],
      },
      {
        id: 'c',
        say: [t('More hours. Right.', 'animated'), t("I'll run it. Gently. With a highlighter.")],
        replies: [{ text: 'Run it and tell me yes.', next: 'd' }, { text: 'Run it tomorrow. Drink now.', another: true }],
      },
      {
        id: 'd',
        say: [t("Can't promise a yes. Can promise I'll look hard for one. They hide in column K.", 'laughing')],
        replies: [{ text: 'Find me a yes, {host}.', another: true }, { text: 'Fair enough. Cheers.' }],
      },
    ],
  },
  {
    id: 'dennis-shop-busy', kind: 'shop', friend: 'dennis', stage: 1, needs: ['busy'],
    nodes: [
      {
        id: 'a',
        say: [t('{sheets} sheets! Do you know what that is per hour?', 'animated'), t("Don't answer. I'll tell you. It's a lot.")],
        replies: [{ text: 'A good lot?', next: 'b' }, { text: 'Please do not tell me.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Best day this month, I'd say. I'd need the receipts to be sure. I'd love the receipts.")],
        replies: [{ text: "They're in a shoebox.", next: 'd' }, { text: 'You can have them tomorrow.', another: true }],
      },
      {
        id: 'c',
        say: [t("Fine. I'll keep it in. It'll come out later. Probably at beer three.", 'laughing')],
        replies: [{ text: "I'll brace myself.", another: true }, { text: 'Go on, let it out.', next: 'b' }],
      },
      {
        id: 'd',
        say: [q("A shoebox. Oh, mate. I'll bring you one with tabs. Tabs are my love language.", 'laughing')],
        replies: [{ text: 'Tabs. Steady on.', another: true }, { text: 'Your love language is stationery.', another: true }],
      },
    ],
  },
  {
    id: 'dennis-shop-quiet', kind: 'shop', friend: 'dennis', stage: 1, needs: ['quiet'],
    nodes: [
      {
        id: 'a',
        say: [t('{sheets} sheets. Quiet one.'), t("Don't fret. One quiet day is noise, not signal. I'd need five to worry.", 'thoughtful')],
        replies: [{ text: 'And how many to ring me?', next: 'b' }, { text: 'I did a lot of sweeping.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Eight. But your month's fine. I'd tell you. I can't hide a number. I go red.", 'laughing')],
        replies: [{ text: "You're going a bit red now.", another: true }, { text: 'Good to know.' }],
      },
      {
        id: 'c',
        say: [q("Sweeping's still work. It's just work that doesn't send an invoice.", 'thoughtful')],
        replies: [{ text: 'I should invoice the floor.', another: true }, { text: 'Put sweeping on the books.', another: true }],
      },
    ],
  },
  {
    id: 'dennis-shop-ledger', kind: 'shop', friend: 'dennis', stage: 1,
    nodes: [
      {
        id: 'a',
        say: [t('I had a look at your ledger at coffee last week.', 'thoughtful'), t("You've written 'stuff' next to forty dollars. Twice.")],
        replies: [{ text: 'It was stuff.', next: 'b' }, { text: 'Important stuff.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("I believe you. But the tax office is very literal. It wants a noun.", 'laughing')],
        replies: [{ text: 'Snacks. The noun is snacks.', next: 'd' }, { text: 'Bits.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Was it a drill bit? Was it a pie? You can tell me. I won't tell the pie.")],
        replies: [{ text: 'Two pies.', next: 'd' }, { text: 'Drill bit. And a pie.', next: 'd' }],
      },
      {
        id: 'd',
        say: [q('Pies at a workplace are a staff amenity. Partly deductible. Fully delicious.', 'animated')],
        replies: [{ text: "You've made my week.", another: true }, { text: 'Best tax advice I have ever had.', another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- stage 2: life
  {
    id: 'dennis-life-spreadsheet', kind: 'life', friend: 'dennis', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("Confession. I've got a spreadsheet of every knock-off beer I've had since 2014.", 'thoughtful'), t('This is row three hundred and twelve.')],
        replies: [{ text: "That's lovely. And worrying.", next: 'b' }, { text: "What's in the columns?", next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Only three hundred and twelve in twelve years. That's the worrying bit. I'm a slow drinker.", 'laughing')],
        replies: [{ text: "You're a slow everything.", next: 'd' }, { text: 'What are the columns, though?', next: 'c' }],
      },
      {
        id: 'c',
        say: [t('Date. Who with. What we talked about. Then one last column.', 'animated')],
        replies: [{ text: 'Go on.', next: 'd' }, { text: 'Is it a score out of ten?', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Last column's 'Good night? Y/N'.", 'thoughtful'), q("I've never put an N. Not once. Twelve years.", 'misty')],
        replies: [{ text: 'Put a Y for this one.', another: true }, { text: "Don't jinx it. It's early.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-life-dog', kind: 'life', friend: 'dennis', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t("I'm thinking of getting a dog.", 'animated'), t("I've modelled it. Food, vet, insurance. About two grand a year.")],
        replies: [{ text: 'What would you call it?', next: 'b' }, { text: 'Two grand for a best mate? Bargain.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Shortlist's Ledger, Petty Cash and Gary. Gary's polling well.", 'laughing')],
        replies: [{ text: 'Petty Cash. No question.', next: 'c' }, { text: 'Gary the dog. Yes.', next: 'c' }],
      },
      {
        id: 'c',
        say: [t("There's one line I can't price. Someone happy when I get home.", 'thoughtful'), q('Turns out that column has no upper limit.', 'misty')],
        replies: [{ text: 'Get the dog, mate.', another: true }, { text: "Bring it here. I'll be happy too.", next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Oh. That's nice. That's a very nice thing to say. I'm at beer {beers}, careful.", 'misty'), t("Gary will love the shed.", 'laughing')],
        replies: [{ text: "Gary's on the books, then.", another: true }, { text: "Gary can be shop dog.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-life-salsa', kind: 'life', friend: 'dennis', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t('I joined a salsa class. Thursdays, Brunswick. Church hall.', 'animated'), t("I'm the only one who counts out loud.")],
        replies: [{ text: 'Is that allowed?', next: 'b' }, { text: 'How are your hips?', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("It's encouraged! Turns out salsa is half counting. I've finally found my sport.", 'laughing')],
        replies: [{ text: 'And the other half?', next: 'c' }, { text: 'Your time has come.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Hips. I'd say I'm forty percent there on hips. Up from nine.", 'laughing')],
        replies: [{ text: "That's huge growth.", next: 'd' }, { text: 'Show me. Right now.', next: 'd' }],
      },
      {
        id: 'd',
        say: [q("Best bit's after, though. Twelve of us, cups of tea, nobody's good at it. I love it.", 'misty')],
        replies: [{ text: 'Sounds like this, with tea.', another: true }, { text: "I'll come one Thursday.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-life-braver', kind: 'life', friend: 'dennis', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t('You know what I would do differently? If I did it all again?', 'thoughtful')],
        replies: [{ text: 'Bigger bets?', next: 'b' }, { text: 'Nothing. You love it.', next: 'c' }],
      },
      {
        id: 'b',
        say: [t("Bit braver. I've only ever taken four-in-five bets. Never a coin flip.")],
        replies: [{ text: 'What would the coin flip have been?', next: 'd' }, { text: 'Four in five is very you.', next: 'c' }],
      },
      {
        id: 'c',
        say: [t('I do love it. Thirty years. People hand me a shoebox and I hand back a little bit of calm.', 'thoughtful')],
        replies: [{ text: 'That is a good job.', another: true }, { text: 'But what would you change?', next: 'd' }],
      },
      {
        id: 'd',
        say: [t('Asked Marisa from tax law to the Christmas party. In 2003. Said nothing.', 'thoughtful'), q("I've been running that coin flip in my head ever since. Heads every time.", 'laughing')],
        replies: [{ text: 'Is Marisa still around?', another: true }, { text: "Next coin flip's yours, mate.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-life-taxtime', kind: 'life', friend: 'dennis', stage: 2,
    nodes: [
      {
        id: 'a',
        say: [t('Tax time nearly finished me. Nineteen returns in a week.', 'animated'), t('A plumber brought me a sandwich. Unprompted.')],
        replies: [{ text: 'Was it a good sandwich?', next: 'b' }, { text: 'Nineteen? Are you OK?', next: 'c' }],
      },
      {
        id: 'b',
        say: [t('Ham, cheese, pickle. Cut on the diagonal. He respects me.', 'laughing'), q("Best client relationship I've ever had. I nearly cried in the car park.", 'misty')],
        replies: [{ text: 'Diagonal is love.', another: true }, { text: "I'll bring you one next tax time.", next: 'd' }],
      },
      {
        id: 'c',
        say: [t("Fine now! I slept fourteen hours on Saturday. A personal best. I logged it.", 'laughing')],
        replies: [{ text: 'Course you logged it.', another: true }, { text: "Next tax time, I'll bring snacks.", next: 'd' }],
      },
      {
        id: 'd',
        say: [t('Would you? Oh. Cut on the diagonal?', 'misty')],
        replies: [{ text: 'On the diagonal. Promise.', another: true }, { text: 'Cut on the router, even.', another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- stage 3: the big stuff
  {
    id: 'dennis-deep-numbers', kind: 'deep', friend: 'dennis', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t('Thirty years of other people\'s numbers. Can I tell you a secret?', 'thoughtful'), t("Every number's somebody's something.")],
        replies: [{ text: 'What do you mean?', next: 'b' }, { text: 'Like what?', next: 'b' }],
      },
      {
        id: 'b',
        say: [t('Four hundred and twelve dollars. A fridge. Nine grand. A wedding. Sixty bucks. A kid\'s footy boots.', 'misty')],
        replies: [{ text: 'And this shed?', next: 'c' }, { text: "That's a lovely way to see it.", next: 'd' }],
      },
      {
        id: 'c',
        say: [q("This shed's my favourite set of numbers. Every one's a thing someone's going to keep.", 'misty')],
        replies: [{ text: "You'd make a good poet.", next: 'd' }, { text: "Don't, I'll get misty too.", next: 'd' }],
      },
      {
        id: 'd',
        say: [t('You make the thing. I count it after. I just like being near it, I think.', 'thoughtful'), t("Right. That's beer {beers}. I warned you.", 'laughing')],
        replies: [{ text: "You're always welcome near it.", another: true }, { text: "You did warn me.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-deep-odds', kind: 'deep', friend: 'dennis', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("I worked out the odds of us meeting once. Don't laugh.", 'thoughtful')],
        replies: [{ text: "I'm not laughing. Go on.", next: 'b' }, { text: "I'm laughing a bit.", next: 'b' }],
      },
      {
        id: 'b',
        say: [t('You walked into the wrong office. Second floor, not third. I was the only one in.', 'misty'), t('Roughly one in four million.')],
        replies: [{ text: "Best wrong turn I've made.", next: 'c' }, { text: 'How did you get four million?', next: 'd' }],
      },
      {
        id: 'c',
        say: [q("And here we are. Two crates and a fridge. Best odds I've ever beaten.", 'misty')],
        replies: [{ text: 'Cheers to the second floor.', another: true }, { text: 'Proper four-in-a-million mate.', another: true }],
      },
      {
        id: 'd',
        say: [t('I made it up. Mostly. But the feeling is accurate.', 'laughing'), t("I'd stake my practice on the feeling.", 'thoughtful')],
        replies: [{ text: 'Your practice is two rooms.', another: true }, { text: "The feeling's right.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-deep-older', kind: 'deep', friend: 'dennis', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("I'm fifty-one. Actuarially, I'm in the back half.", 'thoughtful'), t('Do you think about getting older?')],
        replies: [{ text: 'Only when I bend down.', next: 'b' }, { text: "Not really. Should I?", next: 'c' }],
      },
      {
        id: 'b',
        say: [t('The noise. The little noise. I make it getting out of a chair. My chair noise is a C sharp.', 'laughing')],
        replies: [{ text: 'Mine is a B flat.', next: 'd' }, { text: 'We should harmonise.', next: 'd' }],
      },
      {
        id: 'c',
        say: [t("No. The back half's got the good bits. You know what you like. You know who you like.", 'thoughtful')],
        replies: [{ text: 'Who do you like?', next: 'd' }, { text: 'Like a footy game.', next: 'd' }],
      },
      {
        id: 'd',
        say: [q('Odds of a good back half go up a lot with good mates. I read that. I may have written it.', 'misty')],
        replies: [{ text: "Sounds peer-reviewed to me.", another: true }, { text: "Here's to the back half.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-deep-proud', kind: 'deep', friend: 'dennis', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t('What are you proudest of? Mine is small. Can I go first? I\'ll go first.', 'thoughtful')],
        replies: [{ text: 'Go on, then.', next: 'b' }, { text: 'Nothing you do is small.', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("A bakery in Preston. Did their books for twelve years. Saw them through two bad winters.", 'misty'), t("They're still open.")],
        replies: [{ text: "That's not small.", next: 'c' }, { text: 'Do you still go?', next: 'c' }],
      },
      {
        id: 'c',
        say: [q('Every Saturday. One croissant and a little cry in the car. Best ten minutes of my week.', 'misty')],
        replies: [{ text: "Mine's that the roller door goes up every day.", next: 'd' }, { text: 'Next Saturday, I am coming.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("See, that's it. Keeping something going. Nobody claps. You just get to keep going.", 'thoughtful'), t('Croissant on me.', 'laughing')],
        replies: [{ text: 'And a little cry.', another: true }, { text: "Here's to keeping going.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-deep-mates', kind: 'deep', friend: 'dennis', stage: 3,
    nodes: [
      {
        id: 'a',
        say: [t("I don't have heaps of mates. I've got clients. Some clients bring sandwiches.", 'thoughtful'), t('Is it sad that this is one of my favourite places?')],
        replies: [{ text: "It's not sad. It's a great place.", next: 'b' }, { text: "You're not a client here. You're a mate.", next: 'c' }],
      },
      {
        id: 'b',
        say: [t("It is, isn't it? A milk crate shouldn't be this comfortable. I've checked the numbers.", 'laughing')],
        replies: [{ text: 'The numbers are love.', next: 'd' }, { text: 'Crate, beer, mate. Simple maths.', next: 'd' }],
      },
      {
        id: 'c',
        say: [q("Oh. Don't. I'm a lightweight. You can't say things like that to a lightweight.", 'misty')],
        replies: [{ text: 'You heard me, though.', next: 'd' }, { text: 'Mate. Mate. Mate.', next: 'd' }],
      },
      {
        id: 'd',
        say: [t("I'm putting that in the spreadsheet. New column. Just says 'mate'.", 'misty')],
        replies: [{ text: 'Every row gets a Y.', another: true }, { text: 'Bold the font.', another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- the big idea: the restaurant
  {
    id: 'dennis-restaurant', kind: 'bigIdea', friend: 'dennis', stage: 2, bigIdea: 'restaurant',
    nodes: [
      {
        id: 'a',
        say: [t("Right. I've had an idea. I've had it for three beers. It's very good.", 'animated'), q('A restaurant. Small. Forty covers. Called Petty Cash.', 'animated')],
        replies: [{ text: "Petty Cash. That's actually good.", next: 'b' }, { text: 'Have you run the numbers?', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("Course I have. Forty covers, two sittings, five nights. Four hundred a week.", 'animated'), t('Average spend thirty-eight dollars. Fifteen grand a week through the door. Round figures.')],
        replies: [{ text: "That's a lot of money.", next: 'c' }, { text: 'What about rent, though?', next: 'c' }],
      },
      {
        id: 'c',
        say: [t('Rent on Sydney Road, small shopfront: six grand a month. Wages: us two and a kitchen hand.', 'thoughtful'), t("Food's thirty percent. We clear twelve percent. If nobody breaks a plate.", 'animated')],
        replies: [{ text: 'People break plates.', next: 'd' }, { text: "Twelve percent's decent, isn't it?", next: 'd' }],
      },
      {
        id: 'd',
        say: [t("Budgeted. Plate line, two hundred a month. You'd do the fit-out, I'd do front of house.", 'animated'), t("Menu's half-written. Schnitzel, a nice soup, a cheese board called 'Assets'.", 'laughing')],
        replies: [{ text: "And which of us is the chef?", next: 'e' }, { text: 'Sold. When do we sign the lease?', next: 'e' }],
      },
      {
        id: 'e',
        say: [t('...'), t('Wait. Do either of us know how to cook?', 'thoughtful')],
        replies: [{ text: 'I can do toast. Mostly.', next: 'f' }, { text: "You've done restaurant books, though?", next: 'f' }],
      },
      {
        id: 'f',
        say: [q('I did Milo on toast this morning.', 'laughing'), t("Full disclosure: I've done the books for one restaurant. My cousin's sandwich van.", 'thoughtful'), t('It got towed. Mid-lunch. With the sandwiches in it.', 'laughing')],
        replies: [{ text: 'To Petty Cash. Gone too soon.', another: true }, { text: "Thirty-eight-dollar Milo on toast. I'd go.", another: true }],
      },
    ],
  },

  // ---------------------------------------------------------------- after-hours cuts
  {
    id: 'dennis-cut-trophy', kind: 'cut', friend: 'dennis', stage: 2, cut: 'ah-trophy',
    nodes: [
      {
        id: 'a',
        say: [t('A trophy. For the customer with the best payment terms. Seven days, every time.', 'animated'), t('We could present it. I have a speech. It has slides.')],
        replies: [{ text: "Grab the MDF. Let's cut it.", cut: true }, { text: 'Who would win?', next: 'b' }],
      },
      {
        id: 'b',
        say: [t('Mrs Papadopoulos. Paid an invoice in four hours once. Cash. In an envelope with a biscuit.', 'misty'), q('That woman is the reason I believe in people.', 'misty')],
        replies: [{ text: "She deserves it. Let's cut.", cut: true }, { text: 'Next time. Write the speech first.', another: true }],
      },
    ],
  },
  {
    id: 'dennis-cut-coaster', kind: 'cut', friend: 'dennis', stage: 2, cut: 'ah-coaster',
    nodes: [
      {
        id: 'a',
        say: [t("Cut me a coaster the size of a dinner plate. I'm a lightweight. I need a big target.", 'laughing')],
        replies: [{ text: "Get the formply. Let's do it.", cut: true }, { text: 'You just want a bigger beer.', next: 'b' }],
      },
      {
        id: 'b',
        say: [t("I want a bigger margin for error. There's a difference. Ninety percent of a difference.", 'animated')],
        replies: [{ text: "Fair. Cutting it now.", cut: true }, { text: "Hold the beer tighter. That's free.", another: true }],
      },
    ],
  },
  {
    id: 'dennis-cut-boomerang', kind: 'cut', friend: 'dennis', stage: 2, cut: 'ah-boomerang',
    nodes: [
      {
        id: 'a',
        say: [t('A boomerang. For my desk. Like an invoice that comes back paid.', 'animated')],
        replies: [{ text: "Love it. Let's cut it.", cut: true }, { text: 'Do invoices come back paid?', next: 'b' }],
      },
      {
        id: 'b',
        say: [t('About four in five. The fifth one I keep throwing. With hope.', 'thoughtful'), q('Hope is a very underrated accounting principle.', 'laughing')],
        replies: [{ text: "Alright. One hopeful boomerang.", cut: true }, { text: 'Chase the fifth first.', another: true }],
      },
    ],
  },
  {
    id: 'dennis-cut-freehand', kind: 'cut', friend: 'dennis', stage: 2, cut: 'freehand',
    nodes: [
      {
        id: 'a',
        say: [t("Can I ask something? What would you cut if nobody was paying?", 'thoughtful'), t('No brief. No invoice. Just draw.')],
        replies: [{ text: "Let's find out. Grab a sheet.", cut: true }, { text: "Honestly? I wouldn't know.", next: 'b' }],
      },
      {
        id: 'b',
        say: [q("Nobody does. That's the bit with no number on it. Best bit.", 'misty'), t("I'll write it off as research.", 'laughing')],
        replies: [{ text: 'Research it is. Cutting.', cut: true }, { text: "Another night. I'll think on it.", another: true }],
      },
    ],
  },
];
