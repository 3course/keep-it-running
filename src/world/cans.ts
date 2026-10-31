// The morning after a group night: empties where they ended up. Most on the floor round the crates; some in silly
// places — the router bed (clear it before the first cut), on top of the extractor, in the toilet. You carry them
// (a few at a time) to the "Cans for refund" bag by the roller door; each full bag is the container deposit back.
import { PEOPLE } from '../people/config.js';
import type { MorningCan, PeopleState } from '../people/state.js';
import { objectById, type ObjectId } from './layout.js';
import { WORLD } from './worldConfig.js';

const C = WORLD.cell;
const top = (id: ObjectId, dx = 0, dz = 0) => {
  const o = objectById(id), r = o.rect;
  return { x: (r.x + r.w / 2) * C + dx, z: (r.y + r.h / 2) * C + dz, y: o.height };
};

/** The silly places, in the order they fill (the bed always gets one). */
const SILLY: { spot: string; at: () => { x: number; y: number; z: number } }[] = [
  { spot: 'bed', at: () => ({ ...top('machine', 0.3, -0.1), y: objectById('machine').height * 0.8 + 0.09 }) },
  { spot: 'extractor', at: () => top('extractor', 0.2, 0) },
  { spot: 'toilet', at: () => ({ ...top('toilet', 0, 0.05), y: 0.36 }) },
  { spot: 'fridge', at: () => top('fridge', 0, 0.2) },
  { spot: 'pallet', at: () => top('finishedPallet', -0.2, 0.1) },
  { spot: 'desk', at: () => top('desk', 0.5, 0) },
  { spot: 'compressor', at: () => top('compressor') },
  { spot: 'bitRack', at: () => top('bitRack') },
];

/** Where the refund bag stands: inside the roller door, south of the fridge. */
export const BAG_SPOT = { x: 13.9, z: 19.1 };

/** Scatter `n` empties for the morning (deterministic per day). */
export function scatterCans(p: PeopleState, beersDrunk: number, dayIndex: number) {
  const n = Math.min(PEOPLE.cans.max, Math.max(3, Math.round(beersDrunk * PEOPLE.cans.perBeer)));
  let s = dayIndex * 7919 + 13;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cans: MorningCan[] = [];
  const silly = Math.min(SILLY.length, 2 + Math.floor(n / 4));
  for (let i = 0; i < n; i++) {
    let at: { x: number; y: number; z: number }, spot: string;
    if (i < silly) { spot = SILLY[i].spot; at = SILLY[i].at(); }
    else { spot = 'floor'; at = { x: 12.6 + rnd() * 1.5, y: 0, z: 16.2 + rnd() * 2.4 }; } // round the crates
    cans.push({ id: i + 1, spot, ...at });
  }
  p.cans = cans;
}

/** A can on the router bed: no sheet goes on until it's off. */
export const canOnBed = (p: PeopleState | undefined) => !!p?.cans.some(c => c.spot === 'bed');
