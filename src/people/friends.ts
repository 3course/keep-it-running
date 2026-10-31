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
      band: { side: 'leave it in the past', take: "Leave it. Some things belong on a CD-R in a drawer. Ours belongs in a lake." },
      cycling: { side: 'the tram', take: "The tram. Somebody else drives, there's a bell. That's civilisation." },
      footy: { side: 'the footy', take: "The footy. Scarf, thermos, tipping sheet. You don't go for the tacos. You go for the footy." },
      coffee: { side: 'instant at home', take: 'Instant. In a mug from the 1998 tipping comp. Every morning. It works.' },
      bunnings: { side: 'Saturday morning', take: 'Saturday morning. Eight sharp. Snag at ten. It is a ritual and I observe it.' },
      kids: { side: 'the cool godparent', take: "Godfather to three. I take it very seriously. There was an oath. I wrote it." },
      ferment: { side: 'never started', take: 'Never started. Bread comes from a baker. That is the arrangement.' },
      uteTarago: { side: 'ute', take: "Ute. Tray, tow bar, a dog's nose in the mirror. It's a proper vehicle." },
      aches: { side: 'push through it', take: "Push through it. I don't acknowledge pain. It's undignified." },
      wine: { side: 'wine person now', take: "I'll admit it. I have a cellar. It's a cupboard. But I call it the cellar." },
      radio: { side: 'only the countdown', take: 'Only the countdown. Once a year, with a pen and a ballot. Like voting.' },
      parents: { side: 'ring them Sundays', take: "Sundays at six. Mum reads me the tipping ladder. It's our thing." },
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
      band: { side: 'reform for the 40th', take: "Reform for the 40th! One night only! I'll make shirts! I've already made shirts!" },
      cycling: { side: 'the gravel bike', take: "Gravel bike! Haven't ridden it on gravel. Or much. But look at it. LOOK at it." },
      footy: { side: 'the tacos at the ground', take: "I go for the tacos. The footy's the bit between tacos. Very loud between tacos." },
      coffee: { side: 'the new café', take: "The new place! The barista remembered Bikkie's name. Not mine. Bikkie's!" },
      bunnings: { side: 'Sunday arvo', take: "Sunday arvo. Empty aisles, golden light, just me and the garden hoses. Romance." },
      kids: { side: 'no kids', take: "No kids. Bron and I have Bikkie. Bikkie has an Instagram. That's enough admin." },
      ferment: { side: 'still going', take: "Still going! Bron's sourdough Kevin is thriving. I've moved on to chillies. Danger!" },
      uteTarago: { side: 'Tarago', take: "Tarago! Eight seats, one working cupholder, it's carried me to every Golden Plains!" },
      aches: { side: 'see a physio', take: "My physio's called Dane and I tell him everything. He's a therapist with elbows." },
      wine: { side: "whatever's open", take: "Whatever's open! Red, white, orange, cask at a wedding. I'm not fussy, I'm joyful." },
      radio: { side: 'still listening', take: "Still listening! I don't know any of it! I love all of it! I sing along wrong!" },
      parents: { side: 'drop round unannounced', take: "I just turn up with a lasagne. Mum pretends she's annoyed. She's thrilled." },
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
      band: { side: 'start a new band', take: "Forget the old band. Start a new one. I've got a name. Just need the instruments. And skill." },
      cycling: { side: 'the old fixie', take: 'Still on the fixie. One gear. Like me.' },
      footy: { side: 'the pie at half time', take: "I'm there for the pie. Footy's what happens between pies." },
      coffee: { side: 'the old café', take: "The old place. It's gone downhill, but it's our hill." },
      bunnings: { side: 'avoid it', take: 'Avoid it. Went in for a hinge once. Came out with a hobby.' },
      kids: { side: 'kids', take: "Kids. Asleep by nine on New Year's. Best night I've had in years. Write that down." },
      ferment: { side: 'gave it up', take: 'Gave it up. Had a starter called Bread Pitt. He passed in 2021.' },
      uteTarago: { side: 'a borrowed trailer', take: "I don't own a car. I own a friendship with a bloke who has a trailer." },
      aches: { side: 'stretch every morning', take: 'Stretch every morning. Mostly I lie on the floor. Same thing.' },
      wine: { side: 'beer forever', take: "Beer forever. Wine's just beer that went to uni." },
      radio: { side: 'stopped, and fine with it', take: "Stopped in 2014. Heard a man whisper over a kazoo and thought: that's me done." },
      parents: { side: 'let them do their thing', take: "Dad's taken up lawn bowls. Calls it a contact sport. Let him live." },
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
