// Three-way nights: once the friend you called is through the roller door. Louder, sillier, more "love you, mate".
// Shared threads: `host` is tonight's friend, `guest` is whoever turned up with more beers.
import type { Thread } from './types.js';

export const GROUP_THREADS: Thread[] = [
  {
    id: 'group-toast', kind: 'group', group: true, stage: 2,
    nodes: [
      {
        id: 'up',
        say: [
          { text: "Right. Glasses up. I'm doing a toast.", expr: 'animated' },
          { who: 'guest', text: 'Oh no. Here we go.', expr: 'laughing' },
          { text: 'To this shed. To the router. To whoever invented the milk crate.' },
        ],
        replies: [{ text: 'To the milk crate!', next: 'more' }, { text: 'And to {guest}, for turning up.', next: 'more' }],
      },
      {
        id: 'more',
        say: [
          { who: 'guest', text: 'And to the fridge. Never once let us down.', expr: 'misty' },
          { text: "I love you both. I'm not drunk. I'm {beers} beers honest.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Love you too, ya goose.', another: true }, { text: 'Clink.', another: true }],
      },
    ],
  },
  {
    id: 'group-music', kind: 'group', group: true, stage: 2,
    nodes: [
      {
        id: 'phone',
        say: [
          { who: 'guest', text: "Who's on the music? Give me the phone." },
          { text: 'Absolutely not. Last time you put on whale noises for forty minutes.', expr: 'laughing', quote: true },
        ],
        replies: [{ text: 'I liked the whale noises.', next: 'request' }, { text: 'My shed, my speaker.', next: 'request' }],
      },
      {
        id: 'request',
        say: [
          { text: 'Fine. One request each.' },
          { who: 'guest', text: "That song. You know. The one that goes 'dun dun, da-da-dun'.", expr: 'animated' },
          { text: "That's every song.", expr: 'laughing' },
        ],
        replies: [{ text: 'Put on the big singalong one.', another: true }, { text: 'Whale noises it is.', another: true }],
      },
    ],
  },
  {
    id: 'group-danceoff', kind: 'group', group: true, stage: 2,
    nodes: [
      {
        id: 'call',
        say: [
          { text: 'Dance-off. On the milk crates. Winner picks the next beer.', expr: 'animated' },
          { who: 'guest', text: "I've trained my whole life for this." },
        ],
        replies: [{ text: "I'll judge. It's safer.", next: 'worm' }, { text: "I'm in. Stack 'em.", next: 'worm' }],
      },
      {
        id: 'worm',
        say: [
          { text: '{guest} just did the worm. On a milk crate. How?', expr: 'laughing', quote: true },
          { who: 'guest', text: 'Core strength. And bad decisions.' },
        ],
        replies: [{ text: 'Ten out of ten. No notes.', next: 'sit' }, { text: 'Someone get the first aid kit.', next: 'sit' }],
      },
      {
        id: 'sit',
        say: [
          { text: "That's enough cardio for one decade.", expr: 'relaxed' },
          { who: 'guest', text: 'Same time next week?', expr: 'animated' },
        ],
        replies: [{ text: 'Grab a beer, champion.', another: true }, { text: 'Sit down before you fall down.' }],
      },
    ],
  },
  {
    id: 'group-photo', kind: 'group', group: true, stage: 2,
    nodes: [
      {
        id: 'squeeze',
        say: [
          { text: 'Group photo. Now. Before we forget what we look like.', expr: 'animated' },
          { who: 'guest', text: "Get the router in. It's family." },
        ],
        replies: [{ text: 'Timer on. Everyone squeeze in.', next: 'snap' }, { text: "Hang on, I've got sawdust in my hair.", next: 'snap' }],
      },
      {
        id: 'snap',
        say: [
          { text: "Everyone say 'knock-off'!" },
          { who: 'guest', text: "{host}'s got their eyes shut. Again.", expr: 'laughing' },
          { text: "That's my good side." },
        ],
        replies: [{ text: "That one's going on the wall.", another: true }, { text: 'One more. Properly.', next: 'frame' }],
      },
      {
        id: 'frame',
        say: [
          { text: 'Look at us. Best-looking shed in the inner north.', expr: 'misty' },
          { who: 'guest', text: 'Print it. Cut a frame for it on the router.', quote: true },
        ],
        replies: [{ text: "I'll do it tomorrow. First job.", another: true }, { text: 'Oak frame. Only the best.', another: true }],
      },
    ],
  },
  {
    id: 'group-band', kind: 'group', group: true, stage: 2,
    nodes: [
      {
        id: 'name',
        say: [
          { who: 'guest', text: 'If we were a band. What are we called?', expr: 'animated' },
          { text: 'Router and the Offcuts.', expr: 'laughing', quote: true },
          { who: 'guest', text: 'Milk Crate Monday.' },
        ],
        replies: [{ text: 'Router and the Offcuts. Signed.', next: 'roles' }, { text: 'The Knock-Offs. Obviously.', next: 'roles' }],
      },
      {
        id: 'roles',
        say: [
          { text: "I'm on drums. Bucket drums. {guest} does vocals. You play the router." },
          { who: 'guest', text: 'First gig: right here. Capacity three.', expr: 'laughing' },
        ],
        replies: [{ text: 'Sold out already.', another: true }, { text: 'I want a rider. Chips.', another: true }],
      },
    ],
  },
  {
    id: 'group-howwemet', kind: 'group', group: true, stage: 3,
    nodes: [
      {
        id: 'remember',
        say: [
          { text: 'Do you remember how we all met?', expr: 'misty' },
          { who: 'guest', text: "{host} was asleep in a hammock at Meredith. On a stranger's campsite.", expr: 'laughing' },
          { text: 'It was a very inviting hammock.' },
        ],
        replies: [{ text: 'And I brought the bacon over.', next: 'years' }, { text: 'I thought you were a lost tourist.', next: 'years' }],
      },
      {
        id: 'years',
        say: [
          { who: 'guest', text: 'All these years and we still sit on milk crates.' },
          { text: 'Honestly? Best thing I ever did, finding you two.', expr: 'misty', quote: true },
          { who: 'guest', text: "Don't. You'll set me off." },
        ],
        replies: [{ text: 'Love you, mates. Seriously.', another: true }, { text: 'Group hug. Mind the fridge.', another: true }],
      },
    ],
  },
  {
    id: 'group-love', kind: 'group', group: true, stage: 3,
    nodes: [
      {
        id: 'speech',
        say: [
          { who: 'guest', text: 'Can I say something? Without anyone laughing?', expr: 'misty' },
          { text: 'No promises.', expr: 'laughing' },
          { who: 'guest', text: "This shed's the best room in Melbourne. Because of who's in it." },
        ],
        replies: [{ text: "Stop it, you'll make me cry.", next: 'cry' }, { text: "It's the fridge, isn't it.", next: 'cry' }],
      },
      {
        id: 'cry',
        say: [
          { text: "I'm not crying. There's sawdust in my eye. Shed sawdust. It's emotional sawdust.", expr: 'misty', quote: true },
        ],
        replies: [{ text: 'Love you, ya big softy.', another: true }, { text: 'Bring it in.', another: true }],
      },
    ],
  },
];
