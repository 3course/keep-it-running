// Sal, Mick and Priya — the neighbours along the yard and the street. Short, dry, Melbourne.

import type { NeighbourId } from '../../sim/neighbours.js';

export const NEIGHBOUR_NAMES: Record<NeighbourId, string> = {
  sal: 'Sal Fletcher',
  mick: 'Mick O\'Reilly',
  priya: 'Priya Shah',
};

export const NEIGHBOUR_SHOPS: Record<NeighbourId, string> = {
  sal: 'Fletcher Joinery',
  mick: 'O\'Reilly Fabrication',
  priya: 'Northside Signs',
};

/** A line or two when you first walk over (notepad / tour). */
export const NEIGHBOUR_INTRO: Record<NeighbourId, string[]> = {
  sal: ['Cabinet shop. Sal does kitchens when he\'s not lending you formply.', 'He\'ll take your overflow when he\'s slammed — at his price.'],
  mick: ['Welder across the back. Shares a skip if you\'re civil.', 'Full bag on your extractor and he hears about it.'],
  priya: ['Sign shop up the street. Buys acrylic scraps.', 'Rush jobs you knock back might still walk past her door.'],
};

export const NEIGHBOUR_PERSONALITY: Record<NeighbourId, string[]> = {
  sal: [
    'Sal: "Truck\'s gone. You want two sheets or you want sympathy?"',
    'Sal: "I\'ll shout you ply. You shout me back before Friday or we\'re not mates."',
    'Sal: "Got a kitchen in Brunswick I can\'t fit. You want the crumbs?"',
    'Sal: "Can I borrow your extinguisher? Mine\'s dead. I\'ll bring it back. Probably."',
  ],
  mick: [
    'Mick: "Your bag\'s making it snow on my side. Sort it."',
    'Mick: "I\'ve got room in the skip if you stop the dust."',
    'Mick: "Your router sounds like a Harley. I\'m on the phone to a client."',
    'Mick: "One more complaint and I ring the council myself."',
  ],
  priya: [
    'Priya: "Any clear acrylic offcuts? I pay cash, same day."',
    'Priya: "Send me vinyl work, I kick you eight percent. Fair?"',
    'Priya: "You passed on that rush? Might land here. No finders fee."',
    'Priya: "I\'m not stealing your customers. They\'re just impatient."',
  ],
};
