// What people think of the layout. The part-timer, once she trusts you, is usually right; the mates at knock-off are
// mostly wrong (but very sure).
import type { FriendId } from '../dialogue/types.js';

/** Hers, by what's worst about the floor right now. */
export const JESS_LAYOUT = {
  fix: ["If the bits were by the bed you wouldn't be running.", 'Bit rack over by the router? Just saying. Nicely.'],
  load: ["The raw sheets are miles from the bed. My arms have opinions.", 'Could the ply live closer to the machine?'],
  pickup: ['Finished pallet by the roller door, maybe? The utes would love you.', 'Every pickup is a little hike. Just noticing.'],
  clutter: ["It's a bit crowded round the router. I keep doing a little dance.", 'Too much stuff hugging the machine. I bumped the bin twice.'],
  path: ["There's no straight run from the door to the bed any more.", 'I had to go round the compressor to get to the pallet. Twice.'],
  fridge: ['The fridge is RIGHT there. Staring. After two.', "Can we turn the fridge round? It's watching me."],
  circuit: ["The compressor's on the extractor's circuit, I think? That's why it keeps tripping.", 'Breaker again. Is it the compressor?'],
  fire: ["The extinguisher's a long way from anything that catches fire.", 'Extinguisher closer to the machine? For my nerves.'],
} as const;
export type LayoutGripe = keyof typeof JESS_LAYOUT;

/** The mates, at knock-off, after you've moved things round. Mostly wrong. */
export const MATE_LAYOUT: Record<FriendId, string[]> = {
  eggby: ['Moved things round, I see. The fridge should face the door. Feng shui. Or something.', "Bold. I'd have put the router in the middle. I know you can't move it."],
  courtney: ['Okay, new layout. Love it. Hate the bin. Love the bin. Put the crates IN the office.', "The fridge should be on wheels. On WHEELS. Think about it."],
  dennis: ["New layout! I've modelled it. You're up eleven seconds a sheet. Or down. One of those.", 'If you put the fridge by the door you save four steps a beer. Over a year that is… a lot of beers.'],
  tim: ["New layout. Extractor's further away. Quieter. That's efficiency. Write that down.", "Have you tried putting everything near everything else? Works in my kitchen."],
};
