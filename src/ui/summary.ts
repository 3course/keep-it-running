// End-of-day and end-of-week screens as DOM: same P&L, shop floor, upgrade shop and verdicts as before.
import { CONFIG, type UpgradeId } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { DayStats } from '../sim/types.js';
import { startOver } from '../world/save.js';
import { copyText } from './clipboard.js';

const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-AU');
const pct = (f: number) => `${(f * 100).toFixed(0)}%`;

/** Two-tap "Start over": the first tap arms it, the second wipes the save and reloads. Disarms itself after a few seconds. */
function wireStartOver(el: HTMLElement, g: Game) {
  const btn = el.querySelector<HTMLElement>('.startover');
  if (!btn) return;
  const label = btn.textContent ?? '';
  let armed: number | undefined;
  btn.addEventListener('click', () => {
    if (armed === undefined) {
      btn.textContent = 'Tap again to wipe this game and start fresh';
      btn.classList.add('armed');
      armed = window.setTimeout(() => { armed = undefined; btn.textContent = label; btn.classList.remove('armed'); }, 4000);
      return;
    }
    window.clearTimeout(armed);
    startOver(g.cash, g.dayIndex);
  });
}

/** The P&L: boards are charged as they're cut, not when they're bought; what's left on the pallet is stock. */
function pnl(d: DayStats, ply: { value: number; sheets: number }): string {
  const margin = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : 0;
  const row = (k: string, v: string, cls = '') => `<div class="row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const mcls = margin >= 0.15 ? 'good' : margin >= 0 ? 'money' : 'bad';
  const other = d.consumables + d.fixes + d.beer + d.mateBeer + d.fees;
  const overdraft = d.overdraftFees ? row('&nbsp;&nbsp;Overdraft fee', money(-d.overdraftFees), 'bad') : '';
  // money that never came in: shown only when there was some
  const lost = (d.latePayLost > 0 ? row('Late jobs cost you', money(d.latePayLost), 'bad lost-late') : '')
    + (d.lostJobsValue > 0 ? row('Pulled jobs cost you', money(d.lostJobsValue), 'bad lost-pulled') : '');
  return row('Revenue', money(d.revenue), 'money')
    + row('&nbsp;&nbsp;Boards used', money(-d.materials), 'dim') + row('&nbsp;&nbsp;Delivery fees', money(-d.deliveryFees), 'dim')
    + row('&nbsp;&nbsp;Labour', money(-d.labour), 'dim')
    + row('&nbsp;&nbsp;Other costs', money(-other), 'dim') + overdraft
    + row('Operating profit', money(d.revenue - d.costs), d.revenue - d.costs >= 0 ? 'good' : 'bad')
    + row('Operating margin', pct(margin), mcls) + lost + row('Capex (upgrades)', money(-d.upgrades), 'dim')
    + row('Ply on hand', `${money(ply.value)} (${ply.sheets} sheet${ply.sheets === 1 ? '' : 's'})`, 'money')
    + `<p class="dim small">Other: parts ${money(d.consumables)}, fixes ${money(d.fixes)}, beer ${money(d.beer)}, mate had a beer ${money(d.mateBeer)}, fees ${money(d.fees)}. Ply on hand is stock you've paid for, not a cost yet.</p>`;
}

function dayVerdict(d: DayStats): string {
  const m = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : -1;
  if (d.sheetsScrapped >= 2) return "Two sheets in the skip. That's where the margin went.";
  if (d.wrongCalls >= 3) return 'Guessing at faults costs minutes. Minutes cost sheets.';
  if (d.beers >= 3) return 'The fridge won today.';
  if (m >= 0.3) return 'Tidy. Keep running it like that.';
  if (m >= 0.15) return 'Solid day. Overheads still want $900 at the end of the week.';
  if (m >= 0) return 'Barely. Look at where the time went.';
  return 'Lost money today. Something has to change.';
}

/** Fill `el` with the end-of-day screen. onNext runs after Game.nextDay(); onChange after a purchase. */
export function renderDaySummary(el: HTMLElement, g: Game, onNext: () => void, onChange: () => void, onResetHints?: () => void) {
  const d = g.today;
  const last = d.day >= CONFIG.week.days;
  const floor: [string, string][] = [
    ['Sheets delivered', `${d.sheetsDone}`], [`&nbsp;&nbsp;of which late (${Math.round(CONFIG.economy.latePayFraction * 100)}%)`, `${d.sheetsLate}`],
    ['Sheets scrapped', `${d.sheetsScrapped}`], ['Faults', `${d.faults}`], ['Wrong diagnoses', `${d.wrongCalls}`], ['Beers', `${d.beers}`],
    ['Fires (duct/extr.)', `${d.firesSpot} (${d.firesDuct}/${d.firesExtractor})`],
  ];
  el.innerHTML = `
    <h1>End of day ${d.day}</h1>
    <p class="sub">Cash ${money(g.cash)} · Rapport ${g.rapport}</p>
    <section><h2>P&amp;L</h2>${pnl(d, { value: d.plyOnHandValue, sheets: d.plyOnHandSheets })}</section>
    <section><h2>Shop floor</h2>${floor.map(([k, v]) => `<div class="row"><span class="dim">${k}</span><span>${v}</span></div>`).join('')}
      <p class="verdict">${dayVerdict(d)}</p></section>
    <section><h2>Upgrade shop</h2>${CONFIG.upgrades.map(u => {
      const owned = g.upgrades.has(u.id as UpgradeId);
      return `<div class="upg"><div><b class="${owned ? 'good' : ''}">${u.name}</b><br><small>${u.desc}</small></div>
        <button data-upg="${u.id}" ${owned || g.cash < u.cost ? 'disabled' : ''}>${owned ? 'Owned' : money(u.cost)}</button></div>`;
    }).join('')}</section>
    <button class="next">${last ? 'Close out the week' : `Start day ${d.day + 1}`}</button>
    <p class="feedback">Thoughts? Copy the day log and send it to Courtney.</p>
    <button class="copy">Copy day log</button><p class="status"></p>
    ${onResetHints ? '<a class="reset">Reset hints</a>' : ''}
    <a class="startover ${g.cash < 0 ? 'debt' : ''}">${g.cash < 0 ? "Drowning in debt? Start over with a clean slate" : 'Start over'}</a>`;
  wireStartOver(el, g);
  el.querySelectorAll<HTMLButtonElement>('button[data-upg]').forEach(b => b.addEventListener('click', () => {
    if (g.buyUpgrade(b.dataset.upg as UpgradeId)) { onChange(); renderDaySummary(el, g, onNext, onChange, onResetHints); }
  }));
  const reset = el.querySelector<HTMLAnchorElement>('.reset');
  if (reset && onResetHints) reset.addEventListener('click', () => { onResetHints(); reset.textContent = 'Hints will show again.'; });
  el.querySelector('.next')!.addEventListener('click', () => { g.nextDay(); onNext(); });
  const status = el.querySelector('.status')!;
  el.querySelector('.copy')!.addEventListener('click', () => {
    void copyText(g.dayReport()).then(ok => { status.textContent = ok ? 'Copied — paste it into a message.' : "Couldn't reach the clipboard."; });
  });
}

export function renderWeekSummary(el: HTMLElement, g: Game, onNext: () => void) {
  const total = g.week.reduce<DayStats>((acc, d) => {
    for (const k of Object.keys(acc) as (keyof DayStats)[]) (acc as unknown as Record<string, number>)[k] += d[k] ?? 0; // a day saved before a field existed
    return acc;
  }, { day: 0, revenue: 0, costs: 0, materials: 0, labour: 0, consumables: 0, fixes: 0, beer: 0, fees: 0, upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, sheetsDemanded: 0, sheetsMissed: 0, sheetsDeclined: 0, sheetsLost: 0, latePayLost: 0, lostJobsValue: 0, beers: 0, firesSpot: 0, firesDuct: 0, firesExtractor: 0, faults: 0, wrongCalls: 0, stockOutMinutes: 0, fumbles: 0, looTrips: 0, deliveryFees: 0, overdraftFees: 0, mateBeer: 0, trucks: 0, plyOnHandValue: 0, plyOnHandSheets: 0 });
  total.fees += g.weekOverheads; // rent, power, insurance
  const last = g.week[g.week.length - 1]; // stock is a snapshot at close, not a sum
  total.costs += g.weekOverheads;
  const wm = total.revenue > 0 ? (total.revenue - total.costs) / total.revenue : 0;
  const verdict = g.cash < 0 ? "You're overdrawn. The bank will be calling all next week."
    : wm >= 0.3 ? 'Thirty-plus percent in a one-man shed. Mick from the joinery would like a word about buying you out.'
    : wm >= 0.15 ? 'A real business, just. One bad week from not being one.'
    : 'Alive, but you worked a week for very little. Scrap and overtime are the usual suspects.';
  el.innerHTML = `
    <h1>Week closed</h1>
    <p class="sub ${g.cash >= 0 ? 'money' : 'bad'}">Cash in the bank: ${money(g.cash)}</p>
    <section><h2>Week P&amp;L</h2>${pnl(total, { value: last?.plyOnHandValue ?? 0, sheets: last?.plyOnHandSheets ?? 0 })}<p class="dim small">Fees include ${money(g.weekOverheads)} weekly overheads.</p></section>
    <section><h2>By day</h2><div class="row dim small"><span>Day · Rev · Cost</span><span>Margin · Done · Scrap</span></div>
      ${g.week.map(d => {
        const m = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : 0;
        return `<div class="row small ${m >= 0.15 ? 'good' : m >= 0 ? '' : 'bad'}"><span>${d.day} · ${money(d.revenue)} · ${money(d.costs)}</span><span>${pct(m)} · ${d.sheetsDone} · ${d.sheetsScrapped}</span></div>`;
      }).join('')}
      <p class="verdict">${verdict}</p></section>
    <button class="next">${g.cash < 0 ? 'Run another week (still in debt)' : 'Run another week'}</button>
    <a class="startover ${g.cash < 0 ? 'debt' : ''}">${g.cash < 0 ? 'Start over with a clean slate' : 'Start over'}</a>`;
  wireStartOver(el, g);
  el.querySelector('.next')!.addEventListener('click', () => { g.nextWeek(); onNext(); });
}
