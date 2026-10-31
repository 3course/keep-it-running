// The three mates who turn up at the roller door at 5. Edit freely: names, the voice notes, and where each one
// stands on the arguments (the topic threads in dialogue/topics.ts put {side} and {otherSide} from here).
import type { FriendId, TopicId } from './dialogue/types.js';

export interface Friend {
  id: FriendId;            // matches src/data/mates.ts (the same people drop in during the day)
  name: string;
  /** For whoever writes their lines: how they talk. */
  voiceNotes: string;
  shirt: number;
  /** Their side of each argument. `side` is their pick; `take` is how they'd put it. */
  stances: Record<TopicId, { side: string; take: string }>;
  /** After-hours cuts they suggest (src/designs, afterHours designs), in their words. */
  cutIdeas: { design: string; line: string }[];
}

export const FRIENDS: Friend[] = [
  {
    id: 'eggby', name: 'Eggby', shirt: 0x3d6f9e,
    voiceNotes: '[VOICE NOTES]',
    stances: {
      festival: { side: 'Meredith', take: "Meredith. The Sup, the trees, the boot. It's a church." },
      craftBeer: { side: 'crisp', take: 'Give me something crisp I can see through. Beer should not be soup.' },
      pubs: { side: 'the front bar', take: 'Front bar. Telly on mute, footy tipping sheet on the wall. Civilisation.' },
      suburbs: { side: 'stay put', take: "I'm not moving further north. I'd need a passport." },
      housePrices: { side: 'still might buy', take: "There's a two-bed somewhere with my name on it. Probably in Bendigo." },
    },
    cutIdeas: [
      { design: 'ah-dunny-moon', line: 'We should make a sign for the dunny door. A moon. Proper old-school.' },
      { design: 'ah-trophy', line: "Let's make a trophy for the best customer. Bit of ceremony. Nan Doreen'd cry." },
      { design: 'ah-coaster', line: 'Cut me a coaster the size of a dinner plate. For the big nights.' },
    ],
  },
  {
    id: 'courtney', name: 'Courtney', shirt: 0x8e3b5a,
    voiceNotes: '[VOICE NOTES]',
    stances: {
      festival: { side: 'Golden Plains', take: "Golden Plains. Bigger sky, better sunrise. I will die on this hill. It's a literal hill." },
      craftBeer: { side: 'hazy', take: "Hazy. If I can see through it, what's it hiding? Nothing. Boring." },
      pubs: { side: 'the beer garden', take: 'Beer garden. Fairy lights, someone’s dog under the table. Heaven.' },
      suburbs: { side: 'go further north', take: "Further north is the only way. Bron and I are basically pioneers." },
      housePrices: { side: 'never buying', take: "Never buying. I've made peace with it. Mostly. On Tuesdays." },
    },
    cutIdeas: [
      { design: 'ah-fin', line: 'Cut me a surfboard fin. I want to tell people I shaped my own.' },
      { design: 'ah-boomerang', line: "Let's cut a boomerang. One that actually comes back. Unlike my ex." },
      { design: 'ah-dog', line: "Make a little cut-out of Bron's dog for the fridge. She'll lose it." },
    ],
  },
  {
    id: 'tim', name: 'Tim Baker', shirt: 0x4e8a46,
    voiceNotes: '[VOICE NOTES]',
    stances: {
      festival: { side: 'Meredith', take: "Meredith. Golden Plains is Meredith's cousin who did a gap year." },
      craftBeer: { side: 'plain lager on principle', take: "I'll drink whatever. But I order the plain lager on principle. Somebody has to." },
      pubs: { side: 'trivia night', take: "The pub is wherever trivia is. Loyalty is a team called 'Quiz Team Aguilera'." },
      suburbs: { side: 'Coburg forever', take: 'Coburg is the new Brunswick and I was here first. Write that down.' },
      housePrices: { side: "should've bought", take: "Should've bought in 2012. I say it every year. It's tradition." },
    },
    cutIdeas: [
      { design: 'ah-parma', line: "Let's cut a sign for the trivia team. Shaped like a parma. Obviously." },
      { design: 'ah-pick', line: 'Cut me a guitar pick the size of a dinner plate. For the band I will one day start.' },
      { design: 'ah-trophy', line: "Trophy. For the best customer. We present it. There's a speech. I'll write it." },
    ],
  },
];

export const friendById = (id: FriendId) => FRIENDS.find(f => f.id === id)!;

/** Who's at the door tonight: rotate, and never the same friend two days running. */
export function pickFriend(last: FriendId | null, dayIndex: number): FriendId {
  const order = FRIENDS.map(f => f.id);
  const pool = order.filter(id => id !== last);
  return pool[dayIndex % pool.length];
}
