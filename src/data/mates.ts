// The mates who drop in. One visits at a time (never the same one twice running), wears the same shirt every
// time, and hangs about for a while (CONFIG.visitors), coming up to you every so often with something to say.
//
// Three pools of lines, picked from with no immediate repeats:
// - asks: `beer` once the fridge opens (while the day's beer caps allow), otherwise `cuppa` (a cuppa or a yarn);
// - shop talk (SHOP_TALK, shared): the machine, the jobs, "busy day?";
// - `stories`: a night out in Collingwood, Abbotsford or Fitzroy. {bar} and {suburb} come from CONFIG.visitors.bars.
// `grabsIfYoureDrinking`: if you've got a beer in hand they don't ask — they help themselves from the fridge.
export interface Mate {
  id: string;
  name: string;
  shirt: number;
  grabsIfYoureDrinking?: boolean;
  beer: string[];
  cuppa: string[];
  stories: string[];
}

export const MATES: Mate[] = [
  {
    id: 'eggby', name: 'Eggby', shirt: 0x3d6f9e,
    beer: ['Any beers in that fridge?', "Reckon it's beer o'clock. Somewhere. Here, ideally.", "Wouldn't say no to a cold one."],
    cuppa: ["Kettle on? White with one, ta.", 'Too early for a beer. Got a sec for a yarn?', "Don't suppose there's a cuppa going?"],
    stories: [
      "Ended up at {bar} in {suburb} on Saturday. Ordered a small cocktail. It came in what I'm pretty sure was a vase.",
      'Trivia night at {bar}. Knew every question about the Pies and nothing else. Came second last, proudly.',
      "Mate's fortieth at {bar}. His uncle did the worm across the whole floor. Got a round of applause and a glass of water.",
      'Walked out of {bar} at closing, turned left for the tram. Should have turned right. Saw a lot of {suburb}.',
    ],
  },
  {
    id: 'courtney', name: 'Courtney', shirt: 0x8e3b5a,
    beer: ["Bron's out, up for a beer?", "Hot one today. Fridge working, is it?", "I'd shout, but it's your fridge. Beer?"],
    cuppa: ['Nah, too early for a beer. Got a sec though?', 'Got a teabag going spare?', 'Just popping in. Got a minute for a yarn?'],
    stories: [
      'Went to {bar} for one quiet drink. Got home at two with a traffic cone. No idea where the cone came from.',
      "Bron dragged me to {bar} in {suburb}. Band was so loud I asked for a pint and got a pie. Ate it anyway. Good pie.",
      'Karaoke at {bar}. I did one Cold Chisel song and the whole pub joined in. Bloke behind the bar had a little cry.',
    ],
  },
  {
    id: 'tim', name: 'Tim Baker', shirt: 0x4e8a46, grabsIfYoureDrinking: true,
    beer: ["If you're having a beer, I'll join you.", "That fridge looks lonely. I'll keep it company.", 'Knock-off drink? Bit early. Still counts.'],
    cuppa: ["Any chance of a brew? Tea. It's not even two.", 'Got time for a quick yarn?', "Kettle working? Mine's carked it."],
    stories: [
      'Walked past {bar} three times looking for {bar}. Turns out I was standing in it.',
      'Had a parma at {bar} the size of a car door. Took half home. Even the dog gave up on it.',
      'Big night on Smith Street in Collingwood. Tried for a cab at midnight, gave up and walked. Beat the cab home, probably.',
    ],
  },
];

/** Shop talk, any mate: the machine, the jobs, the day. */
export const SHOP_TALK = [
  "What's on the machine today?",
  'Busy day?',
  'That router still chewing through bits?',
  "Who's all this for, then?",
  'Flat out, or does it just look like it?',
  "How's the extractor holding up?",
  'Got many jobs on this week?',
];

export const mateById = (id: string | undefined) => MATES.find(m => m.id === id);
