// Eggby: dry, deadpan, short sentences. Loves a ceremony and the proper way of doing things ("civilisation").
// Front-bar man, footy tipping, works at the council. Secretly the softest of the three.
import type { Expr, FriendScript, Line, Thread } from './types.js';

const s = (text: string, expr?: Expr): Line => (expr ? { text, expr } : { text });
const q = (text: string, expr?: Expr): Line => ({ text, expr, quote: true });
const g = (text: string, expr?: Expr): Line => ({ who: 'guest', text, expr });

export const SCRIPT: FriendScript = {
  greet: [
    "Knock-off. Two of the finest words in the language.",
    "Five o'clock. Roller door's up. Civilisation prevails.",
    "Evening. I'm here to inspect the fridge. Official business.",
    "Same time as yesterday. That's not a habit. That's a tradition.",
    "Don't get up. Actually, do. Fridge is over there.",
  ],
  grabBeer: [
    'Correct decision. Cheers. To the shed.',
    "Cheers. First one's the best one. Don't tell the others.",
    "Milk crate's still warm from last time. Cheers.",
    'Clink. Feel that? That was the week leaving your body.',
  ],
  headHome: [
    "Fair enough. Rest the hands. Shed'll be here tomorrow.",
    "Righto. I'll just stand here a minute and look at the router.",
    'Respect it. Go home. Eat a vegetable. Night.',
    "No worries. I'll walk to the tram slowly. Make an evening of it.",
  ],
  another: {
    // the director says every ask line, so one it is
    ask: [s('Fridge is humming at us. Another one? Purely ceremonial.', 'relaxed')],
    yes: [
      s("Good. I'd already opened it. Didn't want to presume.", 'laughing'),
      s('Lovely. Clink.', 'relaxed'),
      s("That's the spirit. That's what built this country.", 'animated'),
      s('Correct. Tradition upheld.', 'relaxed'),
    ],
    no: [
      s("Fair call. Responsible. I'll pretend I'm not disappointed.", 'laughing'),
      s("No worries. I'll nurse this one like a newborn.", 'relaxed'),
      s('Sensible. Somebody has to be. Never been me.', 'thoughtful'),
    ],
  },
  windUp: [
    [s('Good night, that. One of the good ones.', 'relaxed'), s('Same time tomorrow. Bring yourself.', 'laughing')],
    [s("Proud of this place, you know. Proud of you.", 'misty'), s("Don't tell anyone I said that.", 'laughing')],
    [s("Right. Thanks for the beers. And the crate.", 'relaxed'), s("Best seat in the inner north. Night, champ.", 'misty')],
    [s("I'll go. Leave on a high. That's how the greats do it.", 'animated')],
  ],
  // all of these are said, in order, down the phone
  phone: [
    s('Eggby speaking.', 'relaxed'),
    s('I can hear the bar fridge. Is this a summons?', 'thoughtful'),
    s("I accept. I've already got one shoe on.", 'laughing'),
  ],
  // all said, in order, as he comes through the roller door
  arrive: [
    s('Evening all. I come bearing six.', 'animated'),
    s("The crisp stuff. You can see through it. As nature intended.", 'laughing'),
  ],
  cutIn: [
    s("Point of order. Carry on.", 'thoughtful'),
    s("I'd like it noted in the minutes that I agree.", 'relaxed'),
    s("Sorry. Not to interrupt. But I'm interrupting.", 'laughing'),
    s("Hang on. I'll allow it. Go on.", 'relaxed'),
    s('Can I just say: correct.', 'animated'),
  ],
  love: [
    s("I love you, mate. That's all. Back to the beers.", 'misty'),
    s("I'm going to say something and you won't make it weird. Love you, mate.", 'misty'),
    s('Love you, mate. Put that in the minutes.', 'thoughtful'),
    s("You lot. Honestly. I love you. Right. Moving on.", 'misty'),
  ],
  music: [
    s("Music. 'Pub Carpet' by The Tuesday Committee. It's about pub carpet.", 'relaxed'),
    s("I've made a playlist. It's called 'Shed'. It's one song, eleven times.", 'laughing'),
    s('On goes the Long Lunch Brass Band. Footy theme songs, slowed right down. You will weep.', 'misty'),
    s("Gloria Fenwick, 'Last Tram Home'. Nobody talk through the key change.", 'thoughtful'),
  ],
  trace: {
    start: [
      'Steady hands. This is going on a wall one day.',
      'Go on then. Deep breath. Measure twice, beer once.',
      "Ceremonial first cut. Should've brought a ribbon.",
    ],
    wobbly: [
      'Bit wonky there, champ.',
      "Hmm. That's a choice.",
      "Character. We'll call that character.",
    ],
    good: [
      "Lovely line. Surgeon's hands.",
      "Oh, that's tidy. That's very tidy.",
      "Now that's civilisation.",
    ],
    done: [
      "Beauty. That's going in a museum. Our museum. The fridge.",
      "Done. I'd like to say a few words.",
      'Look at that. Hand-traced. Like the old masters.',
    ],
  },
  heardIdea: [
    "Heard you and {lastIdeaWith} were opening {lastIdea}. Bit hurt I wasn't consulted.",
    "{lastIdeaWith} rang me about {lastIdea}. Twenty minutes. Didn't draw breath.",
    "So. {lastIdea}. With {lastIdeaWith}. I'll want a plaque. Small one. Brass.",
    "Word on the street is {lastIdea}. Word on the street is also that nobody can cook.",
  ],
};

export const THREADS: Thread[] = [
  // ---------------------------------------------------------------- shop talk (today)
  {
    id: 'eggby-shop-pickup', kind: 'shop', friend: 'eggby', stage: 1, needs: ['pickup'],
    nodes: [
      { id: 'a', say: [s('Saw {customer} walk out with the {design}. Held it like a newborn.', 'relaxed'),
        q("That's the bit, isn't it. The walk to the car.", 'thoughtful')],
        replies: [{ text: 'They gave me a little wave from the car.', next: 'wave' }, { text: 'Took ten minutes to get it in the hatchback.', next: 'hatch' }] },
      { id: 'wave', say: [q('A wave. That is the review. Five stars, one wave.', 'misty')],
        replies: [{ text: 'Better than money. Nearly.', another: true }, { text: "Don't get soppy on beer one." }] },
      { id: 'hatch', say: [s('Ten minutes is respectable.', 'laughing'), s('My record is forty. A couch. A hatchback. Two friendships, gone.', 'laughing')],
        replies: [{ text: 'Did the couch make it?', next: 'couch' }, { text: 'Worth it for the couch, though.', another: true }] },
      { id: 'couch', say: [s("Still got it. Still can't sit on it. It's more of a monument now.", 'thoughtful')],
        replies: [{ text: 'To the couch.', another: true }, { text: 'Should put a plaque on it.' }] },
    ],
  },
  {
    id: 'eggby-shop-fire', kind: 'shop', friend: 'eggby', stage: 1, needs: ['fire'],
    nodes: [
      { id: 'a', say: [s("Smells like a barbecue in here. Fire count today: {fires}, I'm told.", 'thoughtful'),
        s("That's a number you want to keep at zero. I'm no expert.", 'relaxed')],
        replies: [{ text: 'Router caught a chip. Extinguisher earned its keep.', next: 'ext' }, { text: 'Tiny one. Barely counts.', next: 'tiny' }] },
      { id: 'ext', say: [s('Good. That extinguisher deserves a medal.', 'animated'), q("I'd do a little ceremony. Pin it on the bracket.", 'relaxed')],
        replies: [{ text: 'It should have a name, then.', next: 'barry' }, { text: "Let's not make fires a tradition." }] },
      { id: 'barry', say: [s("Barry. That's a Barry if I've ever seen one.", 'laughing'), q('Cheers, Barry. You red-bellied legend.', 'laughing')],
        replies: [{ text: 'To Barry.', another: true }, { text: "Barry's on the payroll from now on." }] },
      { id: 'tiny', say: [s('"Barely counts." Famous last words. Carved on a lot of headstones, that.', 'laughing'),
        s("Glad you're alright. That's all. Don't make me say it twice.", 'misty')],
        replies: [{ text: "I'm alright. Shed's alright.", another: true }, { text: 'Say it twice.', next: 'twice' }] },
      { id: 'twice', say: [s("Glad you're alright.", 'misty'), s("There. Happy? That's my quota for the month.", 'laughing')],
        replies: [{ text: 'Very happy.', another: true }, { text: 'Worth the fire, honestly.' }] },
    ],
  },
  {
    id: 'eggby-shop-gift', kind: 'shop', friend: 'eggby', stage: 1, needs: ['gift'],
    nodes: [
      { id: 'a', say: [s("What's on the bench? Did {giver} bring you {gift}?", 'animated'),
        q("People don't bring their accountant {gift}. Think about that.", 'thoughtful')],
        replies: [{ text: 'Want some?', next: 'share' }, { text: "I'm keeping it all. It's mine.", next: 'mine' }] },
      { id: 'share', say: [s("I'd be honoured. That's the correct word. Honoured.", 'misty'), s("When people bring you things, you're part of the street. That's civilisation.", 'thoughtful')],
        replies: [{ text: 'Part of the street. I like that.', another: true }, { text: "Don't cry on it." }] },
      { id: 'mine', say: [s('Fair. A gift is a covenant. Between you and {giver}.', 'thoughtful'), s("I'll just look at it. With my eyes. Sadly.", 'laughing')],
        replies: [{ text: 'Fine. One bit. For the covenant.', another: true }, { text: 'Look all you want.' }] },
    ],
  },
  {
    id: 'eggby-shop-jess', kind: 'shop', friend: 'eggby', stage: 1, needs: ['jess'],
    nodes: [
      { id: 'a', say: [s('{jess} gave me a nod on the way out. Very professional nod.', 'relaxed'),
        s("I nodded back. Bit too much. I think I bowed.", 'laughing')],
        replies: [{ text: "She's the best thing that's happened to this place.", next: 'best' }, { text: "She's going to ask why you bowed.", next: 'bow' }] },
      { id: 'best', say: [q("Good people are the whole thing. Machines don't remember your birthday.", 'thoughtful')],
        replies: [{ text: "Router's never once got me a cake.", another: true }, { text: "I'll tell her you said that." }] },
      { id: 'bow', say: [s("I'll say it's how they greet you at the council. Ancient custom.", 'relaxed'), s("It isn't. But it should be.", 'laughing')],
        replies: [{ text: 'Start it. Be the change.', another: true }, { text: "You're a strange man, Eggby." }] },
    ],
  },
  {
    id: 'eggby-shop-busy', kind: 'shop', friend: 'eggby', stage: 1, needs: ['busy'],
    nodes: [
      { id: 'a', say: [s('{sheets} sheets. You look like you came through a hedge backwards.', 'laughing'), s("I mean that as a compliment. Hedge of industry.", 'relaxed')],
        replies: [{ text: "Didn't stop till four. Ate lunch standing up.", next: 'lunch' }, { text: 'Felt good, honestly. Busy is good.', next: 'good' }] },
      { id: 'lunch', say: [s('Standing lunch. No.', 'thoughtful'), q('A man sits for lunch. Anyone sits for lunch. That is the line between us and the animals.', 'animated')],
        replies: [{ text: "Tomorrow I'll sit. Promise.", another: true }, { text: 'Animals have great lunches, to be fair.' }] },
      { id: 'good', say: [s("It is. Busy and tired. Best kind of tired. Then a beer. That's the order.", 'relaxed')],
        replies: [{ text: 'The sacred order.', another: true }, { text: "Don't let me get used to it." }] },
    ],
  },
  {
    id: 'eggby-shop-quiet', kind: 'shop', friend: 'eggby', stage: 1, needs: ['quiet'],
    nodes: [
      { id: 'a', say: [s('Quiet one? {sheets} sheets.', 'relaxed'), s('Quiet days are for sweeping. And thinking. Mostly thinking while holding a broom.', 'thoughtful')],
        replies: [{ text: 'I did a lot of thinking. Not much sweeping.', next: 'think' }, { text: 'Bit worried, to be honest.', next: 'worry' }] },
      { id: 'think', say: [s('Good. The broom is a prop. It legitimises the thinking.', 'laughing')],
        replies: [{ text: 'Council should fund it.', another: true }, { text: 'Next quiet day, you can hold the broom.' }] },
      { id: 'worry', say: [s("Don't. Footy's got byes. Nobody panics in a bye round.", 'thoughtful'), q('You rest. Then you come out swinging.', 'animated')],
        replies: [{ text: 'Coming out swinging. Cheers.', another: true }, { text: "That's very wise for a bloke on a crate." }] },
    ],
  },
  {
    id: 'eggby-shop-door', kind: 'shop', friend: 'eggby', stage: 1,
    nodes: [
      { id: 'a', say: [s("I've decided. This roller door is the best door in Melbourne.", 'thoughtful')],
        replies: [{ text: 'Based on what?', next: 'why' }, { text: 'It sticks halfway every morning.', next: 'sticks' }] },
      { id: 'why', say: [s('A normal door lets one person in. This lets the whole street in.', 'relaxed'), q('When it goes up at five, the week goes down. Physics.', 'laughing')],
        replies: [{ text: "That's not physics.", another: true }, { text: 'Get that on a plaque.' }] },
      { id: 'sticks', say: [s('Character. It hesitates. It thinks about it. Like a good umpire.', 'laughing')],
        replies: [{ text: 'Good umpire. Name one.', next: 'ump' }, { text: 'I just want it to open.', another: true }] },
      { id: 'ump', say: [s("Can't. That's my point. Bit of a stretch, the whole thing.", 'laughing')],
        replies: [{ text: 'Respect for admitting it.', another: true }, { text: 'Drink your beer.' }] },
    ],
  },
  {
    id: 'eggby-shop-tipping', kind: 'shop', friend: 'eggby', stage: 1,
    nodes: [
      { id: 'a', say: [s("I've started a footy tipping comp. For the shed.", 'animated'), s("Just me so far. I'm winning.", 'relaxed')],
        replies: [{ text: 'Put me down.', next: 'in' }, { text: 'I know nothing about footy.', next: 'nothing' }] },
      { id: 'in', say: [s("Excellent. Entry fee is one beer. Prize is a trophy. I'll make the trophy.", 'animated'), s("You'll make the trophy.", 'laughing')],
        replies: [{ text: 'So I build my own prize.', another: true }, { text: "Sounds like you've thought it through." }] },
      { id: 'nothing', say: [q("Perfect. The people who know nothing always win. It's the cruellest thing in sport.", 'thoughtful')],
        replies: [{ text: "Fine. I'll pick by jumper colour.", another: true }, { text: "Then I'm in. Ruthlessly." }] },
    ],
  },
  {
    id: 'eggby-shop-late', kind: 'shop', friend: 'eggby', stage: 1, needs: ['late'],
    nodes: [
      { id: 'a', say: [s('{late} running late, I hear. Behind schedule.', 'thoughtful'), s("At the council we'd call that 'on track'.", 'laughing')],
        replies: [{ text: "It'll be out first thing tomorrow.", next: 'first' }, { text: "Should've said no to one job.", next: 'no' }] },
      { id: 'first', say: [s("There you go. Late's just early for the next day.", 'relaxed')],
        replies: [{ text: "That's genuinely helpful.", another: true }, { text: "That's not how days work." }] },
      { id: 'no', say: [s('Nobody here says no. That is your whole problem and your whole charm.', 'misty')],
        replies: [{ text: "I'll take the charm.", another: true }, { text: "I'll learn to say no. One day." }] },
    ],
  },

  // ---------------------------------------------------------------- life
  {
    id: 'eggby-life-dad', kind: 'life', friend: 'eggby', stage: 2,
    nodes: [
      { id: 'a', say: [s("Dad's taken up lawn bowls. He's got a blazer. Crest on the pocket.", 'relaxed'),
        s("He wore it to Christmas lunch. Took it off to carve. Put it back on.", 'laughing')],
        replies: [{ text: "That's where you get it from.", next: 'from' }, { text: 'Is he any good?', next: 'good' }] },
      { id: 'from', say: [s('Get what.', 'thoughtful'), s('...The ceremony thing. Yeah. Fair. I own a cummerbund.', 'laughing')],
        replies: [{ text: 'Why do you own a cummerbund?', next: 'cumm' }, { text: 'Of course you do.', another: true }] },
      { id: 'cumm', say: [q("In case. A man doesn't know when civilisation will need him.", 'animated')],
        replies: [{ text: 'Wear it to the next knock-off.', another: true }, { text: "You're your dad. Accept it." }] },
      { id: 'good', say: [s("He's terrible. Loves it. Happiest I've seen him since the '90 grand final.", 'misty'),
        s("Turns out you don't have to be good at the thing. You just have to have a blazer.", 'thoughtful')],
        replies: [{ text: 'Words to live by.', another: true }, { text: 'I need a blazer.' }] },
    ],
  },
  {
    id: 'eggby-life-niece', kind: 'life', friend: 'eggby', stage: 2,
    nodes: [
      { id: 'a', say: [s("My niece asked what I do for work. I said 'meetings'.", 'relaxed'), s("She's seven. She said 'that's sad'.", 'laughing')],
        replies: [{ text: 'Out of the mouths of babes.', next: 'babes' }, { text: 'What did you say back?', next: 'back' }] },
      { id: 'babes', say: [s("Then she asked what you do. I said you make things out of wood with a robot.", 'animated'),
        s("She hasn't stopped talking about you. I'm now her second-favourite.", 'laughing')],
        replies: [{ text: 'Bring her in. I\'ll cut her name out.', next: 'name' }, { text: "Sorry, mate. I'll let you win something.", another: true }] },
      { id: 'name', say: [q("Oh, she'd lose it. Mate. She'd frame it. Then she'd frame the frame.", 'misty')],
        replies: [{ text: 'Saturday morning. Bring her.', another: true }, { text: "You'll be third-favourite after that." }] },
      { id: 'back', say: [s("I said meetings are where grown-ups go to be disappointed together.", 'thoughtful'), s("She said 'oh'. Very gently. Like a nurse.", 'laughing')],
        replies: [{ text: "That's bleak, Eggby.", another: true }, { text: 'Kids see right through us.' }] },
    ],
  },
  {
    id: 'eggby-life-business', kind: 'life', friend: 'eggby', stage: 2,
    nodes: [
      { id: 'a', say: [s('You ever think about getting bigger? Second router? Staff? A lanyard?', 'thoughtful')],
        replies: [{ text: 'Sometimes. A second machine would be nice.', next: 'bigger' }, { text: "Nah. I like it this size.", next: 'size' }] },
      { id: 'bigger', say: [s('Just promise me one thing. Keep the crates.', 'relaxed'), q('The day there are proper chairs in here, something has died.', 'animated')],
        replies: [{ text: 'Crates stay. In the lease.', another: true }, { text: 'You can have a cushion.' }] },
      { id: 'size', say: [s("Good. Small's underrated. The best pub in Melbourne has four stools and a dog.", 'misty'),
        s('Everyone knows your name. Including the dog.', 'relaxed')],
        replies: [{ text: 'Which pub?', next: 'pub' }, { text: 'This shed is that pub.', another: true }] },
      { id: 'pub', say: [s("Not telling you. You'll ruin it. You'll make it a franchise.", 'laughing')],
        replies: [{ text: 'Fair. I would.', another: true }, { text: 'I was going to anyway.' }] },
    ],
  },
  {
    id: 'eggby-life-differently', kind: 'life', friend: 'eggby', stage: 2,
    nodes: [
      { id: 'a', say: [s("If I did it all again I'd have learned a trade. Hands. You've got hands.", 'thoughtful'),
        s("I've got a stapler. I'm very good with it. Nobody's ever framed a staple.", 'laughing')],
        replies: [{ text: "It's not too late. Come in Saturdays.", next: 'sat' }, { text: 'Anything else you would change?', next: 'else' }] },
      { id: 'sat', say: [s('Saturdays. Me. In the shed. With an apron.', 'animated'), s("I'd want my own apron. Name stitched on. That's non-negotiable.", 'relaxed')],
        replies: [{ text: 'Done. Embroidered.', another: true }, { text: "You'd spend the whole day ironing it." }] },
      { id: 'else', say: [s("I'd have kept up the trumpet. Year nine. Played one assembly.", 'misty'),
        q("Got halfway through the anthem and a bird flew in. Never recovered. Neither did the bird.", 'laughing')],
        replies: [{ text: 'You still have the trumpet?', next: 'still' }, { text: 'The bird was a critic.', another: true }] },
      { id: 'still', say: [s("It's under Mum's bed. Waiting. Like a sword in a stone.", 'thoughtful')],
        replies: [{ text: 'Bring it to the next knock-off.', another: true }, { text: 'Leave it. For the bird.' }] },
    ],
  },
  {
    id: 'eggby-life-council', kind: 'life', friend: 'eggby', stage: 2,
    nodes: [
      { id: 'a', say: [s('Approved fourteen footpath permits today. Fourteen. A record.', 'animated'), s('Nobody clapped. I clapped a bit. Quietly. In the lift.', 'laughing')],
        replies: [{ text: 'I would have clapped.', next: 'clap' }, { text: 'Do you like it there? Honestly?', next: 'honest' }] },
      { id: 'clap', say: [q('This is why I come here. Somebody has to clap for the permits.', 'misty')],
        replies: [{ text: 'Standing ovation. Fourteen permits.', another: true }, { text: "I'll clap for fifteen tomorrow." }] },
      { id: 'honest', say: [s("Yeah. I do. Someone's café gets tables outside because I said yes.", 'thoughtful'), s("I like being the yes.", 'misty')],
        replies: [{ text: "That's a good thing to be.", another: true }, { text: "That's oddly beautiful, Eggby." }] },
    ],
  },

  // ---------------------------------------------------------------- the big stuff
  {
    id: 'eggby-deep-meaning', kind: 'deep', friend: 'eggby', stage: 3,
    nodes: [
      { id: 'a', say: [s('You make a thing. Someone takes it home. It sits on their wall thirty years.', 'thoughtful'),
        s("Kids grow up looking at it. That's the job. That's what you actually do.", 'misty')],
        replies: [{ text: 'Most days it feels like invoices.', next: 'inv' }, { text: 'Your permits last too, you know.', next: 'permit' }] },
      { id: 'inv', say: [q('Invoices are the wrapping paper. The present is the thing on the wall.', 'thoughtful')],
        replies: [{ text: "I'm writing that on the whiteboard.", another: true }, { text: "That's beautiful. Who said it?", next: 'who' }] },
      { id: 'who', say: [s('Me. Just now. I was very surprised as well.', 'laughing')],
        replies: [{ text: 'To accidental wisdom.', another: true }, { text: 'Never do it again.' }] },
      { id: 'permit', say: [s("Huh. A café's tables. Thirty years. People proposing at them, probably.", 'misty'),
        s("Don't. I'll get emotional about footpaths.", 'laughing')],
        replies: [{ text: 'Get emotional about footpaths.', another: true }, { text: 'Too late. You already are.' }] },
    ],
  },
  {
    id: 'eggby-deep-mates', kind: 'deep', friend: 'eggby', stage: 3,
    nodes: [
      { id: 'a', say: [s("How long have we known each other?", 'thoughtful'), s("Don't answer. I've stopped counting. That's the test of a good one.", 'misty')],
        replies: [{ text: "Long enough that you've seen me cry at a footy final.", next: 'cry' }, { text: "What's the secret, you reckon?", next: 'secret' }] },
      { id: 'cry', say: [s("You and the whole of the front bar. It was a moving afternoon.", 'laughing'),
        s('Never said it, but I was glad it was you next to me.', 'misty')],
        replies: [{ text: 'Me too, mate.', another: true }, { text: 'You hugged a stranger in a beanie.' }] },
      { id: 'secret', say: [q('Turning up. That is the entire secret. Five o\'clock. Roller door. Turn up.', 'thoughtful'),
        s("Everything else is just talking.", 'relaxed')],
        replies: [{ text: "Then we're doing it right.", another: true }, { text: 'And bringing beers.', next: 'beers' }] },
      { id: 'beers', say: [s('And bringing beers. Fine. Two secrets. Write it down.', 'laughing')],
        replies: [{ text: 'Isn\'t that Tim\'s line?', another: true }, { text: 'Carved in the bench.' }] },
    ],
  },
  {
    id: 'eggby-deep-older', kind: 'deep', friend: 'eggby', stage: 3,
    nodes: [
      { id: 'a', say: [s('Found a grey hair this morning. In my eyebrow. Just the one.', 'thoughtful'), s('Very distinguished. Like a lord. A small lord.', 'laughing')],
        replies: [{ text: 'Does getting older worry you?', next: 'worry' }, { text: 'Pluck it. Show it who\'s boss.', next: 'pluck' }] },
      { id: 'worry', say: [s("Not really. Every year the knock-offs get better.", 'misty'),
        q("I'd like to be eighty on a milk crate. Still telling you the door's the best door in Melbourne.", 'misty')],
        replies: [{ text: "It'll still be the best door.", another: true }, { text: "I'll still be telling you it sticks." }] },
      { id: 'pluck', say: [s('Absolutely not. I worked forty-one years for that hair.', 'animated'), s("It's got seniority.", 'laughing')],
        replies: [{ text: 'Give it a name.', another: true }, { text: 'Respect your elders. Fair call.' }] },
    ],
  },
  {
    id: 'eggby-deep-proud', kind: 'deep', friend: 'eggby', stage: 3,
    nodes: [
      { id: 'a', say: [s("What are you proud of? And you can't say the shed. Everyone says the shed.", 'thoughtful')],
        replies: [{ text: "That people come back. Customers. Mates. You.", next: 'back' }, { text: 'You go first.', next: 'first' }] },
      { id: 'back', say: [s("Yeah. That's the good answer. That's annoyingly good.", 'misty'), q("People don't come back to a place. They come back to a person.", 'misty')],
        replies: [{ text: 'Cheers, Eggby.', another: true }, { text: "Easy. You'll have me crying into my crate." }] },
      { id: 'first', say: [s("Never missed a mate's fortieth. Eleven of them. Eleven speeches.", 'animated'),
        s("Short ones. Two minutes. One joke, one bit where everyone goes quiet.", 'thoughtful')],
        replies: [{ text: "I'm booking you for mine.", next: 'book' }, { text: "That's a good thing to be proud of.", another: true }] },
      { id: 'book', say: [s("Already written. Been written for years. The quiet bit's about this shed.", 'misty')],
        replies: [{ text: 'You can\'t just say that, mate.', another: true }, { text: 'Read me the joke.', next: 'joke' }] },
      { id: 'joke', say: [s("No. Ceremony has rules. You'll hear it on the night. In a cummerbund.", 'laughing')],
        replies: [{ text: 'Looking forward to it.', another: true }, { text: 'The cummerbund is the joke, isn\'t it.' }] },
    ],
  },
  {
    id: 'eggby-deep-ritual', kind: 'deep', friend: 'eggby', stage: 3,
    nodes: [
      { id: 'a', say: [s('Know why I like rituals? Trophies, speeches, all of it?', 'thoughtful'),
        s("It's a way of saying 'this mattered' out loud. Without having to say 'this mattered'.", 'misty')],
        replies: [{ text: 'So knock-offs are a ritual.', next: 'knock' }, { text: "That's very deep for a Tuesday.", next: 'tues' }] },
      { id: 'knock', say: [q("Knock-offs are the most important ritual I've got. Don't tell the council.", 'misty')],
        replies: [{ text: 'Your secret is safe.', another: true }, { text: 'Mine too, mate.' }] },
      { id: 'tues', say: [s("It's not Tuesday.", 'thoughtful'), s("See. You've lost track. That's what a good shed does to a person.", 'laughing')],
        replies: [{ text: "What day is it?", another: true }, { text: 'Best compliment the shed ever got.' }] },
    ],
  },

  // ---------------------------------------------------------------- the big idea
  {
    id: 'eggby-idea-restaurant', kind: 'bigIdea', friend: 'eggby', stage: 2, bigIdea: 'restaurant',
    nodes: [
      { id: 'a', say: [s("I've been thinking. And I'm not joking. We open a restaurant.", 'animated'), s('Proper one. Tablecloths. A man who pours the water.', 'thoughtful')],
        replies: [{ text: "Go on. I'm listening.", next: 'name' }, { text: 'Tablecloths. Bold.', next: 'name' }] },
      { id: 'name', say: [s("It's called The Civic. Like a town hall, but with a roast.", 'animated'),
        q('Every table gets a little brass bell. You ring it, someone arrives. Civilisation.', 'animated')],
        replies: [{ text: "That's actually a great name.", next: 'menu' }, { text: 'Can I ring the bell for no reason?', next: 'menu' }] },
      { id: 'menu', say: [s("Menu's half written. Entrée's a bread roll. A good one. Served warm. With a speech.", 'relaxed'),
        s("Main's still in development.", 'thoughtful')],
        replies: [{ text: 'Who does what?', next: 'roles' }, { text: 'Dessert should be trifle.', next: 'roles' }] },
      { id: 'roles', say: [s("You'd do the fit-out. Big timber tables off the router. Our name in the bar top.", 'animated'),
        s("I'd do front of house. Greet everyone. Remember their names. Little bow.", 'misty')],
        replies: [{ text: "You'd be born for front of house.", next: 'cook' }, { text: "Who's in the kitchen, though?", next: 'cook' }] },
      { id: 'cook', say: [s("The kitchen.", 'thoughtful'), s("...Wait. Do either of us know how to cook?", 'thoughtful')],
        replies: [{ text: 'I can do a toastie. Mostly.', next: 'milo' }, { text: 'I thought you could cook.', next: 'milo' }] },
      { id: 'milo', say: [s("I did Milo on toast this morning.", 'relaxed'), q("Dry Milo. On buttered toast. I was quite proud of it.", 'laughing'),
        s("The Civic is closed. Thanks for coming.", 'laughing')],
        replies: [{ text: 'Tragic loss to the city.', another: true }, { text: "Milo on toast could be the main.", another: true }] },
    ],
  },

  // ---------------------------------------------------------------- after-hours cuts
  {
    id: 'eggby-cut-moon', kind: 'cut', friend: 'eggby', stage: 2, cut: 'ah-dunny-moon',
    nodes: [
      { id: 'a', say: [s('We should make a sign for the dunny door. A moon. Proper old-school.', 'animated'),
        s("Like Nan's place in the country. You saw the moon, you knew where you stood.", 'misty')],
        replies: [{ text: "Let's cut it. Right now.", cut: true }, { text: 'The dunny door says "toilet" already.', next: 'toilet' }] },
      { id: 'toilet', say: [s('"Toilet." In vinyl lettering. From a shop.', 'thoughtful'), q("A moon is a promise. A sticker is a shrug.", 'animated')],
        replies: [{ text: "Fine. For the promise. Let's cut it.", cut: true }, { text: 'Another night. Too dark to find the moon.' }] },
    ],
  },
  {
    id: 'eggby-cut-trophy', kind: 'cut', friend: 'eggby', stage: 2, cut: 'ah-trophy',
    nodes: [
      { id: 'a', say: [s("Let's make a trophy for the best customer. Bit of ceremony.", 'animated'),
        s("Presented annually. In the shed. I'll do the speech. Nan Doreen'd cry.", 'misty')],
        replies: [{ text: 'Get the MDF. We\'re doing it.', cut: true }, { text: "Won't the other customers be jealous?", next: 'jealous' }] },
      { id: 'jealous', say: [s("That's the point. That's what drives standards up. Ask any footy club.", 'thoughtful'),
        s('Next year someone brings you two lemon slices.', 'laughing')],
        replies: [{ text: 'Arms race of baking. Love it. Cut it.', cut: true }, { text: "Let's hold the ceremony another night." }] },
    ],
  },
  {
    id: 'eggby-cut-coaster', kind: 'cut', friend: 'eggby', stage: 2, cut: 'ah-coaster',
    nodes: [
      { id: 'a', say: [s('Cut me a coaster the size of a dinner plate. For the big nights.', 'relaxed'),
        s("A normal coaster can't handle what I put a beer through.", 'thoughtful')],
        replies: [{ text: 'Done. One plate-sized coaster.', cut: true }, { text: 'Why would a coaster need to be that big?', next: 'why' }] },
      { id: 'why', say: [s("Room for the beer, the bottle cap, and a pie. Pie's important.", 'animated'),
        q("It's not a coaster. It's a little stage. The beer performs.", 'laughing')],
        replies: [{ text: "Alright, I'm sold. Cutting it.", cut: true }, { text: 'Use a plate, Eggby.' }] },
    ],
  },
  {
    id: 'eggby-cut-freehand', kind: 'cut', friend: 'eggby', stage: 2, cut: 'freehand',
    nodes: [
      { id: 'a', say: [s("Router's sitting there doing nothing. Seems rude.", 'thoughtful'),
        s('Draw whatever you want. I want to see what comes out of you after a few.', 'animated')],
        replies: [{ text: 'Go on then. Freehand.', cut: true }, { text: "It'll just be a wonky love heart.", next: 'heart' }] },
      { id: 'heart', say: [q("A wonky love heart cut in a shed at night is the most honest thing in this city.", 'misty')],
        replies: [{ text: 'Alright. One wonky heart, coming up.', cut: true }, { text: "Not tonight. Router's earned a rest." }] },
    ],
  },
];
