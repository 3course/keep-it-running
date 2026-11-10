// The morning after a group night (src/world/cans.ts): every empty lands somewhere you can get to, within reach of
// floor you can walk on (not in a walled-off room). No browser.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { scatterCans } = await server.ssrLoadModule('/src/world/cans.ts');
const { newPeople } = await server.ssrLoadModule('/src/people/state.ts');
const { DEFAULT_PLAN, reachableFor } = await server.ssrLoadModule('/src/world/layoutPlan.ts');
const { COLS, ROWS } = await server.ssrLoadModule('/src/world/layout.ts');
const { WORLD } = await server.ssrLoadModule('/src/world/worldConfig.ts');

describe('the morning-after cans', () => {
  it('every can is within reach of floor you can get to, however many there are', () => {
    const reach = reachableFor(DEFAULT_PLAN), C = WORLD.cell, floor = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (reach(x, y)) floor.push({ x: (x + 0.5) * C, z: (y + 0.5) * C });
    for (let day = 1; day <= 40; day++) for (const beers of [0, 3, 8, 15, 30]) {
      const p = newPeople();
      scatterCans(p, beers, day);
      for (const c of p.cans) {
        // the same reach the shed uses to pick one up (app.ts morningArrive): up on things you can reach over
        const r = c.spot !== 'floor' ? 2.4 : WORLD.interactRange + 0.45;
        const near = Math.min(...floor.map(f => Math.hypot(f.x - c.x, f.z - c.z)));
        assert.ok(near <= r - C / 2, `day ${day}, ${beers} beers: the can on the ${c.spot} is ${near.toFixed(2)} m from floor you can reach`);
        assert.notEqual(c.spot, 'toilet', 'not in the walled-off toilet');
      }
    }
  });
});
