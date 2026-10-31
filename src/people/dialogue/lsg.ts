// The rare late one (group nights only, after beer 3, at most once a week, never the first night): somebody's got a
// tab of "LSG" in their wallet. Short, silly and kind — a punchline, not a feature. Lines are shown at full slur.
import type { FriendId, Line } from './types.js';

/** Whoever's got it in their wallet. */
export const LSG_OFFER: Record<FriendId, Line[]> = {
  eggby: [{ text: "Don't make a thing of it. I've got a tab of 'LSG' in my wallet.", expr: 'thoughtful' }, { text: 'Bloke at trivia. Said it was for "special occasions". This feels special.', expr: 'relaxed' }],
  courtney: [{ text: "OKAY. Confession. There's a tab of 'LSG' in my wallet. Since Golden Plains. Twenty nineteen.", expr: 'animated' }, { text: "It's probably just paper now. Probably.", expr: 'laughing' }],
  tim: [{ text: "Found a tab of 'LSG' in my wallet. Behind the library card. Both expired, probably.", expr: 'relaxed' }, { text: "LSG. Lysergic… something. Write that down.", expr: 'laughing' }],
};
export const LSG_YES = 'Go on then.';
export const LSG_NO = "Nah, I've got a 7am delivery.";
/** Said back when you pass: no fuss. */
export const LSG_DECLINED: Line[] = [
  { text: "Fair. Back in the wallet. Next to the library card.", expr: 'laughing' },
  { text: 'Responsible. Disgusting. Proud of you.', expr: 'laughing' },
  { text: "Yeah, nah, you're right. Seven am's a real time.", expr: 'relaxed' },
];
/** Things people say while it's on (shown at maximum slur). */
export const LSG_LINES: string[] = [
  'mate your hands', 'the router is breathing', 'is the dog here or did I make him up', 'the fridge loves us', 'the crate is so comfy, mate',
  'I can hear the colours of the MDF', 'we are all offcuts of the same sheet', 'the roller door is a mouth for the sky', 'mate. mate. MATE.',
  'my can is laughing at me in a nice way', 'the extractor is singing', 'everyone is a little bit a sign',
];
/** Each mate's laugh (and yours). */
export const LAUGHS: Record<FriendId | 'you', string[]> = {
  eggby: ['heh.', 'heh heh.', 'hhhh-heh.', '*wheeze*'],
  courtney: ['HAHAHAHA', 'AHAHA no STOP', 'hahahahaaa', 'HA!'],
  tim: ['pfft.', 'hehehe', 'hah. hah. hah.', 'snrk'],
  you: ['hahaha', 'hehe', 'ahaha', 'hah!'],
};
/** Coming back down: a long pause, then this, then everyone agrees and it's a warm goodbye. */
export const COME_DOWN: Line[] = [
  { who: 'host', text: '…we should probably go home.', expr: 'thoughtful' },
  { who: 'guest', text: 'Yeah.', expr: 'relaxed' },
  { who: 'you', text: 'Yeah.' },
  { who: 'host', text: 'Good night, that. Really good night.', expr: 'misty', quote: true },
];
