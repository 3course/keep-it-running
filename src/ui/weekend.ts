// The weekend between lease weeks, in the summary's panel: Saturday's market (optional: sell what you cut after hours)
// and Sunday, skipped with a one-line postcard. Then Monday.
import { LEASE_LINES } from '../people/lines/lease.js';
import type { Keepsake } from '../people/state.js';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(n) % xs.length];

/** What a piece fetches at the market: bigger is more, and wonky's a selling point (folk art). */
export function marketPrice(k: Keepsake): number {
  const size = Math.max(k.design.sheet.w, k.design.sheet.h);
  return Math.round(30 + size / 12 + (1 - k.accuracy) * 50 + (k.sheet === 'sheet' ? 40 : 0));
}

export interface WeekendDeps {
  week: number;                       // which week just ended (1-based)
  pieces: () => Keepsake[];
  sell: (k: Keepsake, price: number) => void;
  fill: (text: string) => string;     // run templates
  monday: () => void;
}

export function renderWeekend(el: HTMLElement, d: WeekendDeps) {
  const L = LEASE_LINES;
  const saturday = () => {
    const ps = d.pieces();
    el.innerHTML = `<h1>Saturday</h1>
      <p class="story">${esc(d.fill(pick(L.market.open, d.week)))}</p>
      <section class="market"><h2>The market</h2>${ps.length ? ps.map((k, i) => `<div class="upg"><div><b>${esc(k.design.name)}</b><br><small>${k.beers} beer${k.beers === 1 ? '' : 's'} deep${k.accuracy < 0.6 ? ', wonky (they love that)' : ''}</small></div>
        <button data-i="${i}">Sell ${money(marketPrice(k))}</button></div>`).join('') : `<p>${esc(d.fill(pick(L.market.nothing, d.week)))}</p>`}
      <p class="dim small sold"></p></section>
      <button class="next">${ps.length ? 'Pack up, home for Sunday' : 'Home for Sunday'}</button>
      <a class="skip">Sleep in instead</a>`;
    const said = el.querySelector('.sold')!;
    el.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach(b => b.addEventListener('click', () => {
      const k = ps[Number(b.dataset.i)], price = marketPrice(k);
      d.sell(k, price);
      b.disabled = true; b.textContent = 'Sold';
      said.textContent = d.fill(pick(L.market.sold, Number(b.dataset.i) + d.week)).replace('{piece}', k.design.name.toLowerCase()).replace('{price}', money(price)).replace('{buyer}', 'a bloke with a pram');
    }));
    el.querySelector('.next')!.addEventListener('click', sunday);
    el.querySelector('.skip')!.addEventListener('click', () => { el.innerHTML = `<p class="story">${esc(d.fill(pick(L.market.skip, d.week)))}</p>`; setTimeout(sunday, 900); });
  };
  const sunday = () => {
    el.innerHTML = `<h1>Sunday</h1><p class="story postcard">${esc(d.fill(pick(L.postcards, d.week * 7 + 3)))}</p><button class="next">Monday</button>`;
    el.querySelector('.next')!.addEventListener('click', () => d.monday());
  };
  saturday();
}
