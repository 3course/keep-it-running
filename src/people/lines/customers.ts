// What customers say at pickup, and the gifts they drop round the next day. {name} is the piece's name (lowercase).
// Speech bubbles: keep each line short (under ~80 characters). Kind, even when it's late.
import type { DesignKind } from '../../designs/types.js';
import type { GiftKind } from '../state.js';

export const PICKUP: Record<DesignKind, { onTime: string[]; late: string[] }> = {
  formwork: {
    onTime: [
      'Look at that. Crisp as. The curve is spot on.',
      'Solid! Feels like it could hold up a house.',
      "That {name} is dead square. You don't see that much.",
      'The edges are so clean. Not a splinter on it.',
      "On time AND it's perfect? Who are you?",
      "That curve's exactly right. I was worried about the curve.",
      "Heavy, sharp, true. That's a proper {name}.",
      'Brilliant. The concrete is going to look a treat in this.',
      "Ha! It's real. I drew it on a napkin and now it's real.",
    ],
    late: [
      "Worth the wait. That curve's dead right.",
      'Honestly, take the time. Look how solid that is.',
      "No stress. I'd rather it right than rushed.",
      "A bit late, a lot good. I'll take that trade.",
      "The concrete wasn't going anywhere. Neither was I.",
      'Oh, that {name} was worth an extra day, easy.',
      'Late? Mate, look at those edges. All forgiven.',
    ],
  },
  mdf: {
    onTime: [
      'Smooth as! I could paint this tonight.',
      'Look at those edges. Not a fuzzy bit on them.',
      'That {name} is so clean. Paint-ready, no sanding!',
      'On the dot! And it looks even better than the drawing.',
      'Oh, the corners! So crisp.',
      'The colour is perfect. I could just stare at it.',
      "Feels lovely. Smooth like a river stone.",
      "It's exactly what I pictured. That never happens.",
      "Ha! The little details came out. Even the tiny bits!",
    ],
    late: [
      'Worth the wait. Those edges are like butter.',
      "Honestly, take the time. It's beautiful.",
      "No rush at all. Smooth as anything, look.",
      "A day late and it's perfect? That's a great deal.",
      "Totally fine. Good things take a minute.",
      "Late's fine. Wonky's not. And this isn't wonky.",
      "That {name} was worth every extra hour.",
    ],
  },
  acrylic: {
    onTime: [
      'Look at it shine! Oh, that colour.',
      'The edges glow! How do they glow like that?',
      'That {name} looks like a lolly. A very fancy lolly.',
      "Not a scratch on it. It's like glass, but happy.",
      "Hold it up to the window. Oh! Look at the light!",
      "On time and it gleams. I'm a bit emotional.",
      "The colour's so bright. People are going to stop and look.",
      "Clean edges, no melty bits. You're a wizard.",
      "It's so shiny I can see my face. Good hair day, too.",
    ],
    late: [
      'Worth every minute. Look at that glow.',
      "Honestly, take the time. It's gorgeous.",
      'No stress! Shiny things need patience.',
      "A bit late but it's sparkling. Fair trade.",
      "The light through it! I'd have waited a week.",
      'That {name} was worth the wait. Look at the edges!',
      "Totally fine. I'd rather clear than rushed.",
    ],
  },
};

export const GIFT_PHRASE: Record<GiftKind, string> = {
  beer: 'a slab',
  slice: 'a lemon slice',
  card: 'a thank-you card',
  drawing: 'a drawing',
  plant: 'a pot plant',
  coffees: 'a tray of coffees',
  cake: 'a cake',
};

export const GIFT_LINES: Record<GiftKind, string[]> = {
  beer: [
    'Slab for the fridge. You earned it.',
    'Brought you a slab. Knock-off drinks are on me this week.',
    "Couple of cold ones for the fridge. Well, twenty-four.",
    "Here. For the fridge. Don't drink them all at once. Or do.",
    "Slab! Figured a shed like this runs on beer and sawdust.",
  ],
  slice: [
    "Made you a slice. There's heaps, share it round.",
    'Lemon slice! Still a bit warm. Eat it before smoko.',
    "Baked this last night. It's my nan's recipe. Mostly.",
    "Slice for you and the crew. Don't let the dust get it.",
    "Brought a slice. I wanted to say thanks with my hands.",
  ],
  card: [
    'Just a card. But I meant every word.',
    "Wrote you a card. Couldn't fit all the thank-yous in.",
    "A card for the wall. The whole family signed it.",
    "Little thank-you card. Stick it up near the fridge?",
    "Card! I'm not good at speeches, so I wrote it down.",
  ],
  drawing: [
    'The kids drew you a picture. That one is you. Smiling.',
    'She drew the piece you made. For your wall!',
    "A drawing for the shed. He insisted. Many crayons died.",
    "This is your machine. Apparently it has a face.",
    "For the fridge door. She made me promise you'd hang it.",
  ],
  plant: [
    'Brought you a plant. A bit of green for the windowsill.',
    "Little pot plant. Water it once a week. Or whenever.",
    "Cutting from my garden. It's very hard to kill. Promise.",
    'For the window. Sawdust and a plant. Very cosy.',
    "A plant for the shed. It'll love the morning sun in here.",
  ],
  coffees: [
    "Coffees! One's a flat white, one's a mystery.",
    'Tray of coffees for you. Still hot. Go, go.',
    "Brought coffees round. Figured you'd be flat out.",
    "Coffee run! I didn't know how you have it, so I guessed.",
    'Coffees on us. Thanks again for the beautiful job.',
  ],
  cake: [
    'Cake! Grab a slice before it goes.',
    "There's cake at smoko. Big slices. Don't be shy.",
    'Made a cake. It only sank a little. Tastes great though.',
    'Cake for the whole shed. Get in quick!',
  ],
};

/** A walk-in at the roller door with a small job (Game.walkIns): the ask, your answer, and how they take it. */
export const WALK_IN = {
  ask: [
    'Can you do this today?',
    "Can you do this today? It's only a small one.",
    "Saw the door open. Can you do this today? I'll pay cash.",
    'Can you do this today? Everyone else said next week.',
  ],
  yes: 'Sure. Leave it with me.',
  no: 'Not today, sorry.',
  thanks: [
    "Legend. I'll be back at five to grab it. Thank you!",
    "You're a lifesaver. Back at five, I'll square up then.",
    "Oh, brilliant. Thank you. I'll grab it on the way home.",
    "Thank you! I owe you one. Well, I owe you money. See you at five.",
  ],
  declined: [
    'No worries. Another time.',
    "All good. I'll try up the road.",
    "Fair enough. You look flat out.",
  ],
  gaveUp: [
    "I'll try somewhere else. No stress.",
    'Looks like a busy one. Another day.',
  ],
};
