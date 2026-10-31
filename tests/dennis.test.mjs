// Dennis, the accountant: his calls and bets on Game (no browser), then answering him in the shed and reading his ledger.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startBrowser, freshGame, walkTo, tapLabel } from './browser.mjs';

const env = await startBrowser();
after(() => env.close());
const { Game } = await env.load('/src/sim/Game.ts');
const D = await env.load('/src/sim/dennis.ts');
const { CONFIG } = await env.load('/src/config.ts');

/** A game on `day`, with his call due now. */
function ringing(day, kind = 'prebuy') {
  const g = new Game(7, day);
  g.dennis.ringing = { until: g.minute + 30, bet: D.makeBet(g, kind) };
  return g;
}

describe('his bets', () => {
  it('no call on day 1; at most one a day after', () => {
    const g = new Game(3, 1);
    assert.equal(g.dennis.call, null);
    let calls = 0;
    for (let s = 1; s <= 30; s++) { const h = new Game(s, 5); if (h.dennis.call) calls++; }
    assert.ok(calls > 5 && calls < 30, `rings on some days: ${calls}/30`);
  });
  it('honest odds, plain numbers; yes puts the pre-bought ply on the pallet', () => {
    const g = ringing(4), bet = g.answerDennis();
    assert.ok(bet.hit >= 0.7 && bet.hit <= 0.9); assert.match(D.oddsWords(bet.hit), /in/);
    const before = g.stock.formwork;
    g.decideDennis('yes');
    assert.equal(g.stock.formwork, before + CONFIG.dennis.bets.prebuy.sheets);
    assert.equal(g.dennis.bets[0].status, 'open');
  });
  it('three no’s and he goes quiet; back humbler with better odds and smaller numbers', () => {
    const g = new Game(7, 4);
    const first = D.makeBet(g, 'prebuy');
    for (let i = 0; i < 3; i++) { g.dennis.ringing = { until: g.minute + 30, bet: D.makeBet(g, 'prebuy') }; g.answerDennis(); g.decideDennis('no'); }
    assert.ok(g.dennis.quietUntil > g.dayIndex, 'quiet a few days');
    const humbler = D.makeBet(g, 'prebuy');
    assert.ok(humbler.hit > first.hit && humbler.stake < first.stake);
  });
  it('"give me a minute": he rings back later (or it’s gone)', () => {
    const g = ringing(4); g.answerDennis(); g.decideDennis('later');
    assert.ok(g.dennis.call?.back || g.dennis.bets.at(-1)?.status === 'gone');
  });
  it('a job on terms: the pay waits on the bet, then it settles at his odds', () => {
    const g = ringing(4, 'terms'); g.answerDennis(); g.decideDennis('yes');
    const bet = g.dennis.bets[0];
    assert.equal(bet.jobs.length, CONFIG.dennis.bets.terms.sheets);
    for (const id of bet.jobs) { const j = g.jobs.find(x => x.id === id); j.status = 'cutting'; g.current = j; j.progress = j.cutMinutes; g['finishJob'](); }
    assert.ok(bet.held > 0, 'pay held');
    bet.settleDay = g.dayIndex;
    const cash = g.cash;
    D.dennisStartDay(g);
    assert.ok(bet.status === 'won' || bet.status === 'lost');
    assert.ok(g.cash > cash, 'paid (all, or the slow half)');
  });
});

describe('Dennis in the shed', () => {
  it('answer at the phone, his pitch in a bubble, yes; how it went; his ledger', async () => {
    const game = await freshGame(env);
    await game.eval(async (g, w, s) => {
      const D = await import(new URL('src/sim/dennis.ts', document.baseURI).href);
      w.tour = null; s.jobCard.hide(); g.dayIndex = 4; g.day = 4;
      g.dennis.ringing = { until: g.minute + 30, bet: D.makeBet(g, 'prebuy') };
    });
    await walkTo(game, 'phone');
    await tapLabel(game, 'Answer (Dennis)');
    const pitch = await game.page.evaluate(() => [document.querySelector('#kir-hud .talk.day[data-who="dennis"]')?.textContent, [...document.querySelectorAll('#kir-hud .replies.day button')].map(b => b.textContent)]);
    assert.match(pitch[0], /\$[\d,]+/); assert.deepEqual(pitch[1], ['Yes', 'No', 'Give me a minute']);
    await game.page.evaluate(() => document.querySelector('#kir-hud .replies.day button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await game.eval(async g => { const D = await import(new URL('src/sim/dennis.ts', document.baseURI).href); g.dennis.bets[0].settleDay = g.dayIndex; D.dennisStartDay(g); g.dennis.call = null; });
    await game.page.waitForTimeout(300);
    await tapLabel(game, "Read Dennis's ledger");
    assert.match(await game.page.evaluate(() => document.querySelector('#kir-hud .ledgercard').innerText), /Pre-buy ply.*(came good|didn't)/s);
    await game.close();
  });
});
