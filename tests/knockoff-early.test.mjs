// Knock off early: once the last order call's handled and the board's been idle, close before 5.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const { Game } = await server.ssrLoadModule('/src/sim/Game.ts');
const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
const { newDennis } = await server.ssrLoadModule('/src/sim/dennis.ts');

function deadAir(day = 3) {
  const g = new Game(42, day);
  g.maybeDistraction = () => {};
  g.maybeFault = () => {};
  g.maybeFire = () => {};
  g.minute = CONFIG.ui.knockOffEarlyFromHour * 60;
  g.orderCalls = [];
  g.dennis = newDennis();
  for (const j of g.jobs) j.status = 'done';
  g.machine = 'idle';
  g.current = null;
  return g;
}

describe('knock off early', () => {
  it('is only offered after the board has sat idle with nothing on it', () => {
    const g = deadAir();
    assert.equal(g.canKnockOffEarly(), false);
    for (let i = 0; i < CONFIG.ui.knockOffEarlyIdleMinutes; i++) g.tick();
    assert.equal(g.canKnockOffEarly(), true);
    g.knockOffEarly();
    assert.equal(g.phase, 'endOfDayPrompt');
  });

  it('waits till every scheduled order call has rung', () => {
    const g = deadAir();
    g.orderCalls = [{ minute: g.minute + 30, sheets: 2 }];
    for (let i = 0; i < CONFIG.ui.knockOffEarlyIdleMinutes + 1; i++) g.tick();
    assert.equal(g.canKnockOffEarly(), false);
  });
});
