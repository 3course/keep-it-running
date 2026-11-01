// Seeded RNG so every run is reproducible: the same seed plays the same shift.
//
// One seed, many streams. A sequential stream is only reproducible if everything that draws from it draws in the same
// order, and the player's walking and timing decide when (and whether) most of the shed's rolls happen. So the world's
// rolls don't share one stream: each comes from `Rng.derive(seed, stream, ...keys)` — a fresh mulberry32 seeded by a
// hash of the game seed, the stream's name and where it's rolled (the day, the minute, an event's own key). A roll
// skipped at 10:14 because the machine was idle can't move the roll at 10:15. Rolls caused by the player (a misclick,
// a fumble) sit on their own sequential stream (`Game.actionRng`), so they can't move the world's either.

/** FNV-1a of a stream name, so streams can be named rather than numbered. */
function nameHash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Mix 32-bit keys into one seed (murmur3-style finaliser per key). Never 0. */
export function mixSeed(...keys: number[]): number {
  let h = 0x9e3779b9;
  for (const k of keys) {
    let x = Math.imul(k | 0, 0xcc9e2d51);
    x = (x << 15) | (x >>> 17);
    h ^= Math.imul(x, 0x1b873593);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) || 1;
}

export class Rng {
  private s: number;
  constructor(seed = Date.now() >>> 0) {
    this.s = seed >>> 0;
  }
  /** An independent stream: `stream` names what it's for, `keys` say where (day, minute, an event's id...). */
  static derive(seed: number, stream: string, ...keys: number[]): Rng {
    return new Rng(mixSeed(seed, nameHash(stream), ...keys));
  }
  /** A 32-bit seed for a later `new Rng(...)`: for an event that rolls its details when it's answered, not when it's made. */
  seed(): number {
    return Math.floor(this.next() * 4294967296) >>> 0 || 1;
  }
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | null {
    const total = items.reduce((s, it) => s + weight(it), 0);
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const it of items) {
      r -= weight(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
}
