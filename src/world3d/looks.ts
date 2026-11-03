// How people look. Named people have a hand-set look (the mates, Dennis, Jess, Mai, the sparky, the regulars); everyone
// else — customers, walk-ins, whoever's at the cafe — gets a seeded random one, so the same customer looks the same every
// time and different customers look different from each other. Low-poly toon, like the rest: the pieces are in figures.ts.
import { PEOPLE } from '../people/config.js';
import { friendById } from '../people/friends.js';
import { Rng } from '../sim/rng.js';
import type { Beard, Build, FigureLook, Hair, Top } from './figures.js';

export const SKINS = [0xf6d7b8, 0xf0c9a0, 0xe0ac7e, 0xc98e5f, 0xa8703f, 0x8a5a38, 0x6a4128, 0x4a2c1c] as const;
export const HAIR_COLOURS = [0x1a1414, 0x3a2a20, 0x6a4a2a, 0x8a3a1e, 0xc0561e, 0xd9b45a] as const;
const GREYS = [0xbfbfc4, 0xe0e0e4, 0x9a9aa0] as const;
const SHIRTS = [0x7a6ab0, 0xb0886a, 0x6ab09a, 0xa0a05a, 0x6a8fb0, 0xb06a8f, 0x8fb06a, 0xb08f6a, 0xa84a3a, 0x4a6a8a, 0x5a7a4a, 0xc9b25a, 0x8a8a96, 0xd9d2c0] as const;
const TROUSERS = [0x2e3440, 0x3a3a44, 0x2a2f44, 0x44382e, 0x4a4a3a] as const;
const HAIRS: [Hair, number][] = [['bald', 0.08], ['buzz', 0.1], ['short', 0.2], ['cap', 0.14], ['beanie', 0.1], ['bun', 0.1], ['pony', 0.1], ['long', 0.1], ['mullet', 0.08]];
const TOPS: [Top, number][] = [['tee', 0.2], ['hivis', 0.14], ['flannie', 0.16], ['hoodie', 0.14], ['work', 0.14], ['footy', 0.1], ['apron', 0.12]];
const BEARDS: [Beard, number][] = [['none', 0.55], ['stubble', 0.17], ['moustache', 0.08], ['beard', 0.2]];

/** A stable 32-bit hash of a name, so a customer's look follows their name. */
export function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * A random person, the same every time for the same seed. `age` pins an older bloke or a young apprentice; otherwise most
 * are in between. Older: grey (or no) hair, a stoop and bushy brows; younger: shorter and slighter.
 */
export function randomLook(seed: number | string, age?: 'young' | 'adult' | 'old'): FigureLook {
  const n = (typeof seed === 'string' ? hashName(seed) : seed) >>> 0;
  const r = Rng.derive(n || 1, 'look');
  const a = age ?? r.weighted(['young', 'adult', 'old'] as const, x => (x === 'adult' ? 0.6 : 0.2))!;
  const build: Build = a === 'young' ? r.weighted(['slim', 'medium'] as const, b => (b === 'slim' ? 0.7 : 0.3))! : r.weighted(['slim', 'medium', 'broad'] as const, b => (b === 'medium' ? 0.45 : b === 'slim' ? 0.3 : 0.25))!;
  const height = a === 'young' ? 0.92 + r.next() * 0.04 : 0.94 + r.next() * 0.12;
  let hair = r.weighted(HAIRS.map(h => h[0]), h => HAIRS.find(x => x[0] === h)![1])!;
  if (a === 'old') hair = r.weighted(['bald', 'short', 'buzz', 'cap'] as const, h => (h === 'bald' ? 0.4 : 0.2))!;
  const hairColour = a === 'old' ? r.pick(GREYS) : r.pick(HAIR_COLOURS);
  const top = r.weighted(TOPS.map(t => t[0]), t => TOPS.find(x => x[0] === t)![1])!;
  const shirt = r.pick(SHIRTS);
  const top2 = top === 'flannie' ? 0x2a1a14 : top === 'footy' ? r.pick([0xf1f1ea, 0xe8d23a, 0x1d3a8a]) : top === 'apron' ? r.pick([0x7a5a3a, 0x2f4f6f, 0x3a3a40]) : top === 'hivis' ? r.pick([0xc6e32c, 0xe8892e]) : r.pick([0x2a2a2e, 0x3a4a5a]);
  return {
    shirt, hair, hairColour, build, height, skin: r.pick(SKINS), age: a,
    beard: a === 'young' ? r.weighted(['none', 'stubble'] as const, b => (b === 'none' ? 0.8 : 0.2))! : r.weighted(BEARDS.map(b => b[0]), b => BEARDS.find(x => x[0] === b)![1])!,
    top, top2, legs: r.chance(0.2) ? 'shorts' : 'trousers', legColour: r.chance(0.2) ? 0x8a7a55 : r.pick(TROUSERS),
    shoes: r.chance(a === 'young' ? 0.65 : 0.3) ? 'runners' : 'boots',
    glasses: r.chance(a === 'old' ? 0.45 : 0.18), pencil: r.chance(0.12), earmuffs: r.chance(0.07), phone: r.chance(0.15),
    canColour: r.pick([0x2f8f6f, 0xc0281e, 0xd9a23a, 0x8fd37a, 0xf4efe0]),
  };
}

/** The people with names: hand-set, so you know them across the shed and the cafe. */
export const NAMED: Record<string, FigureLook> = {
  eggby: { shirt: 0x3d6f9e, hair: 'short', hairColour: 0x6a4a2a, canColour: 0xd9a23a, build: 'broad', height: 1.05, skin: 0xe0ac7e, beard: 'beard', top: 'flannie', top2: 0x1f3a56, legColour: 0x3a3a44 },
  courtney: { shirt: 0x8e3b5a, hair: 'bun', hairColour: 0x2a1a14, canColour: 0x8fd37a, build: 'slim', height: 0.96, skin: 0xc98e5f, top: 'hoodie', glasses: true, shoes: 'runners', legColour: 0x2a2f44 },
  tim: { shirt: 0x4e8a46, hair: 'beanie', hairColour: 0x6a7a8a, canColour: 0xc0281e, build: 'medium', age: 'old', height: 1.0, skin: 0xf0c9a0, beard: 'moustache', top: 'work', top2: 0x2f4f2c, pencil: true },
  dennis: { shirt: 0xb8902e, hair: 'short', hairColour: 0x9a9aa0, canColour: 0xf4efe0, build: 'medium', age: 'old', height: 0.99, skin: 0xf6d7b8, glasses: true, phone: true, top: 'work', top2: 0x6a5420, legColour: 0x3a3a44 },
  jess: { shirt: PEOPLE.partTimer.shirt, hair: 'pony', hairColour: 0x6a3a22, canColour: 0xf4efe0, build: 'slim', age: 'young', height: 0.94, skin: 0xe0ac7e, top: 'apron', top2: 0x5a4028, pencil: true, shoes: 'runners' },
  mai: { shirt: 0xf4efe0, hair: 'bun', hairColour: 0x1a1414, build: 'slim', height: 0.97, skin: 0xe9c19a, top: 'apron', top2: 0x3a3a40, shoes: 'runners' },
  sparky: { shirt: 0x3a6fb0, hair: 'cap', hairColour: 0xe9d23a, build: 'broad', height: 1.03, skin: 0xf0c9a0, beard: 'stubble', top: 'hivis', top2: 0xe8892e, earmuffs: true, pencil: true, legs: 'shorts', legColour: 0x6a5f3a },
  regular: { shirt: 0x8fb06a, hair: 'long', hairColour: 0x6a4a2a, build: 'medium', skin: 0xa8703f, top: 'flannie', top2: 0x3a5a2a, pencil: true, phone: true },
  apprentice: { shirt: 0x5a7a9a, hair: 'mullet', hairColour: 0x3a2a20, build: 'slim', age: 'young', height: 0.92, skin: 0xf0c9a0, top: 'footy', top2: 0xe8d23a, shoes: 'runners', phone: true },
  inspector: { shirt: 0xf1f1ea, hair: 'short', hairColour: 0xbfbfc4, build: 'medium', age: 'old', height: 1.0, skin: 0xf0c9a0, glasses: true, top: 'hivis', top2: 0xe9d23a, pencil: true, legColour: 0x2a2f44 },
  you: { shirt: 0xe8892e, hair: 'cap', hairColour: 0x2f4f6f, canColour: 0x2f8f6f, build: 'medium', height: 1.0, skin: 0xf0c9a0, top: 'hivis', top2: 0xf0a030 },
};

/** A mate's look: his shirt's the one he always wears (src/data/mates.ts). */
export function friendLook(id: string): FigureLook {
  const f = NAMED[id];
  return f ? { ...f, shirt: id === 'dennis' ? NAMED.dennis.shirt : friendById(id as never).shirt } : randomLook(id);
}
