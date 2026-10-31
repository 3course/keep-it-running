// The big ideas: around beer 3 someone pitches one with total conviction, you both build it up over a few turns
// (name, details, who does what), then one basic question and it falls over. Shared threads: any friend can pitch
// these, so keep the voice neutral-ish. The restaurant is in each friend's own file.
import type { BigIdeaId, Thread } from './types.js';

export const BIG_IDEAS: Record<BigIdeaId, string> = { restaurant: 'a restaurant', foodTruck: 'a food truck', podcast: 'a podcast', boat: 'a boat', brewery: 'a brewery', castlemaine: 'a block in Castlemaine' };

export const IDEA_THREADS: Thread[] = [
  {
    id: 'idea-foodTruck', kind: 'bigIdea', bigIdea: 'foodTruck', stage: 2,
    nodes: [
      {
        id: 'pitch',
        say: [
          { text: 'Hear me out. A food truck.', expr: 'animated' },
          { text: 'Toasties. Fancy ones. Parked out the front of Golden Plains at three in the morning.' },
        ],
        replies: [{ text: "Fancy toasties. I'm listening.", next: 'name' }, { text: 'Who wants a fancy toastie?', next: 'name' }],
      },
      {
        id: 'name',
        say: [
          { text: 'Everyone, at 3am. Name: the Jaffle Rouser.', expr: 'laughing', quote: true },
          { text: "You'd do the fit-out. Cut the menu board on the router. I'd do front of house. Well, front of truck." },
        ],
        replies: [{ text: 'I could knock up the menu board tonight.', next: 'menu' }, { text: 'I want a cut of the profits.', next: 'menu' }],
      },
      {
        id: 'menu',
        say: [
          { text: 'Kimchi and cheese. Pear and blue for the posh crowd. Vegemite and cheese for the purists.', expr: 'animated' },
          { text: 'Little paper bags with our faces on them. A tip jar shaped like a sandwich press.' },
        ],
        replies: [{ text: "We'd need a truck though.", next: 'truck' }, { text: "Who's driving it?", next: 'truck' }],
      },
      {
        id: 'truck',
        say: [
          { text: 'Easy. We get a truck.', expr: 'relaxed' },
          { text: "...Do you need a special licence for a truck? I failed my Ls twice. In an automatic.", expr: 'thoughtful' },
        ],
        replies: [{ text: 'Have you even got a sandwich press?', next: 'collapse' }, { text: 'Can you make a toastie, though?', next: 'collapse' }],
      },
      {
        id: 'collapse',
        say: [
          { text: "I don't own a sandwich press. I do mine with the iron.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: "The Jaffle Rouser, closed before opening.", another: true }, { text: 'We could start with a bike trailer.', another: true }],
      },
    ],
  },
  {
    id: 'idea-podcast', kind: 'bigIdea', bigIdea: 'podcast', stage: 2,
    nodes: [
      {
        id: 'pitch',
        say: [
          { text: 'We should start a podcast.', expr: 'animated' },
          { text: 'Two mates, a bar fridge, a CNC router. People would eat that up.' },
        ],
        replies: [{ text: 'We are pretty good value.', next: 'name' }, { text: "Everyone's got a podcast.", next: 'name' }],
      },
      {
        id: 'name',
        say: [
          { text: "That's why ours is different. We record it right here. On the milk crates." },
          { text: "Name: Knock-Off Beers. Done. Iconic.", expr: 'animated', quote: true },
        ],
        replies: [{ text: "I'll cut a little sign for the mic.", next: 'plan' }, { text: "We'd need a theme song.", next: 'plan' }],
      },
      {
        id: 'plan',
        say: [
          { text: "You're the voice of reason, I'm the chaos. Episode one: is a parma a sandwich?" },
          { text: 'Episode three: live show. Tickets. Merch. A tote bag.', expr: 'animated' },
        ],
        replies: [{ text: "A tote bag. Now we're talking.", next: 'charts' }, { text: 'Is a parma a sandwich, though?', next: 'charts' }],
      },
      {
        id: 'charts',
        say: [
          { text: "Top of the charts in a month. Advertisers fighting over us. Mattresses. Meal kits.", expr: 'laughing' },
          { text: "Right. So. You've got the gear sorted, yeah?" },
        ],
        replies: [{ text: 'How do you actually record a podcast?', next: 'collapse' }, { text: 'I thought you had the gear.', next: 'collapse' }],
      },
      {
        id: 'collapse',
        say: [
          { text: "I assumed you'd know. You've got the computer for the router.", expr: 'thoughtful' },
          { text: "My whole audio career is one voice memo of me singing in the shower.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Episode one: we look it up.', another: true }, { text: "Let's just keep talking to each other.", another: true }],
      },
    ],
  },
  {
    id: 'idea-boat', kind: 'bigIdea', bigIdea: 'boat', stage: 2,
    nodes: [
      {
        id: 'pitch',
        say: [
          { text: 'Two words. A boat.', expr: 'animated' },
          { text: 'Not a yacht. A little weekend one. Port Phillip Bay. Us, an esky, two hats.' },
        ],
        replies: [{ text: "I'd crew that boat.", next: 'name' }, { text: 'What kind of boat?', next: 'name' }],
      },
      {
        id: 'name',
        say: [
          { text: 'Timber. Classic. You cut the bits on the router. Name on the back in gold.' },
          { text: "She'll be called Shed Happens.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Shed Happens. Perfect.', next: 'crew' }, { text: "Who's captain?", next: 'crew' }],
      },
      {
        id: 'crew',
        say: [
          { text: "I'm captain, obviously. You're first mate. Whoever's late is the anchor." },
          { text: 'Sunsets. Fish and chips off the side. Waving at the ferry like royalty.', expr: 'animated' },
        ],
        replies: [{ text: 'We could sail to Tassie.', next: 'tassie' }, { text: 'Fish and chips on the water. Yes.', next: 'tassie' }],
      },
      {
        id: 'tassie',
        say: [
          { text: 'Tassie, easy. Turn left at Sorrento.' },
          { text: "Hang on. How do you make a boat... go? Like, which end's the front?", expr: 'thoughtful' },
        ],
        replies: [{ text: 'The pointy end. I think.', next: 'collapse' }, { text: 'Have you ever been on a boat?', next: 'collapse' }],
      },
      {
        id: 'collapse',
        say: [
          { text: 'Once. The ferry to Williamstown. I got seasick before it left the dock.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Start with a pedal boat?', another: true }, { text: 'Shed Happens stays in the shed.', another: true }],
      },
    ],
  },
  {
    id: 'idea-brewery', kind: 'bigIdea', bigIdea: 'brewery', stage: 2,
    nodes: [
      {
        id: 'pitch',
        say: [
          { text: "I've been thinking. We should brew our own.", expr: 'animated' },
          { text: 'Not homebrew. A brewery. Right here. The fridge is half the infrastructure already.' },
        ],
        replies: [{ text: 'It is a very good fridge.', next: 'name' }, { text: 'In the shed? Where?', next: 'name' }],
      },
      {
        id: 'name',
        say: [
          { text: 'Router there, tanks there, tasting bar on the milk crates. Off Cut Brewing.' },
          { text: "Our lager's called Tolerance. Like machining. People will lose their minds.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: "I'll cut the tap handles.", next: 'roles' }, { text: 'The stout could be Burnt Edge.', next: 'roles' }],
      },
      {
        id: 'roles',
        say: [
          { text: 'Burnt Edge! Tap handles shaped like little routers!', expr: 'animated' },
          { text: "You run the taps, I do the labels and the vibe. We hire someone for the books. Someone with a calculator." },
        ],
        replies: [{ text: "Gold medal inside a year.", next: 'recipe' }, { text: 'We could do a festival beer.', next: 'recipe' }],
      },
      {
        id: 'recipe',
        say: [
          { text: 'Gold medal, framed, on that wall. Right. Step one: the recipe.' },
          { text: "...What's beer made of? I know hops. Is it just hops? Is yeast bread?", expr: 'thoughtful' },
        ],
        replies: [{ text: 'Water, I reckon. And... beer?', next: 'collapse' }, { text: "Haven't you brewed before?", next: 'collapse' }],
      },
      {
        id: 'collapse',
        say: [
          { text: "Our whole brewing experience is opening that fridge.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: "And we're excellent at it.", another: true }, { text: 'More research is needed.', another: true }],
      },
    ],
  },
  {
    id: 'idea-castlemaine', kind: 'bigIdea', bigIdea: 'castlemaine', stage: 2,
    nodes: [
      {
        id: 'pitch',
        say: [
          { text: "I've decided. We go halves on a block in Castlemaine.", expr: 'animated' },
          { text: 'Chooks. Veggie patch. A shed. A real shed.' },
        ],
        replies: [{ text: 'This is a real shed.', next: 'shed' }, { text: 'Chooks. Go on.', next: 'shed' }],
      },
      {
        id: 'shed',
        say: [
          { text: 'A bigger real shed. Router at one end, wood fire at the other.' },
          { text: 'Sourdough on Saturdays. Farmers market. Everyone knows our names.', expr: 'misty' },
        ],
        replies: [{ text: "I'd cut the sign for the gate.", next: 'name' }, { text: 'What would we call the place?', next: 'name' }],
      },
      {
        id: 'name',
        say: [
          { text: 'Milk Crate Acres.', expr: 'laughing', quote: true },
          { text: "You do the fencing, I do the chooks. Margaret, Gwen and Lasagne." },
        ],
        replies: [{ text: "We'd grow our own hops.", next: 'price' }, { text: "We'd need an old ute.", next: 'price' }],
      },
      {
        id: 'price',
        say: [
          { text: 'Old ute, dog in the back. Not our dog. We find one.', expr: 'animated' },
          { text: "So how much is a block in Castlemaine? ...Neither of us has looked, have we.", expr: 'thoughtful' },
        ],
        replies: [{ text: 'What do chooks even eat?', next: 'collapse' }, { text: 'Can you grow a veggie, though?', next: 'collapse' }],
      },
      {
        id: 'collapse',
        say: [
          { text: "I killed a cactus. They live in deserts. It lasted a week on my windowsill.", expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'Margaret deserves better.', another: true }, { text: 'Pot plant in the shed. Start small.', another: true }],
      },
    ],
  },
];
