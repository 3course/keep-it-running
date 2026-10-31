// End-of-day and end-of-week screens as DOM: same P&L, shop floor, upgrade shop and verdicts as before.
import { CONFIG, type UpgradeId } from '../config.js';
import type { Game } from '../sim/Game.js';
import type { DayStats } from '../sim/types.js';
import { startOver } from '../world/save.js';
import { copyText } from './clipboard.js';
import { perf } from '../world3d/perf.js';
import type { Design } from '../designs/types.js';
import { sketchSvg, SKETCH_CSS } from '../designs/sketch.js';

/** One thing made today, for the gallery: the design, how many sheets of it, and its "after" picture (null: none). */
export interface MadeEntry { design: Design; count: number; after: string | null; tag?: string }

/** The people side of the day, for the summary: last night and what got cut after hours. */
export interface DayPeople {
  lastNight: { who: string; beers: number; quote: string; quoteBy: string; dontAsk?: boolean } | null;
  afterHours: MadeEntry[];
  /** The Lease: day of 20, the rent, what's in the bank; on day 20, the ending card. */
  lease?: { day: number; of: number; rent: number; cash: number; ending?: { headline: string; lines: string[]; again: () => void } };
  /** Metres walked today, and the minutes the layout cost (negative: it saved them). */
  walking?: { metres: number; layoutMinutes: number };
}

const GALLERY_CSS = `
#kir-hud .summary .gallery { display: grid; gap: 10px; }
#kir-hud .summary .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-items: stretch; }
#kir-hud .summary .pair .before, #kir-hud .summary .pair .after { position: relative; border-radius: 4px; overflow: hidden; aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; }
#kir-hud .summary .pair .before svg { width: 100%; height: 100%; display: block; }
#kir-hud .summary .pair .after { background: radial-gradient(circle at 50% 40%, #5a4632, #241f1a 75%); }
#kir-hud .summary .pair .after img { width: 100%; height: 100%; object-fit: contain; image-rendering: auto; }
#kir-hud .summary .pair .cap { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 8px; }
#kir-hud .summary .pair .tagline { position: absolute; left: 4px; bottom: 3px; font-size: 10px; padding: 1px 5px; border-radius: 3px; background: rgba(20,17,15,.75); color: #efe6d8; text-transform: uppercase; letter-spacing: 1px; }
${SKETCH_CSS.replace('.sketch', '#kir-hud .summary .sketch')}
`;

/** "Made today": each design cut today, its sketch beside the finished piece. */
function galleryHtml(made: MadeEntry[], title = 'Made today', extra = ''): string {
  if (!made.length) return '';
  if (!document.getElementById('kir-gallery-css')) {
    const st = document.createElement('style'); st.id = 'kir-gallery-css'; st.textContent = GALLERY_CSS; document.head.appendChild(st);
  }
  return `<section class="made${title === 'Made today' ? '' : ' afterhours'}"><h2>${title}</h2>${extra}<div class="gallery">${made.map(m => `
    <div class="pair" data-design="${m.design.id}">
      <div class="cap"><span><b>${escapeHtml(m.design.name)}</b>${m.count > 1 ? ` ×${m.count}` : ''}</span><span class="dim small">${escapeHtml(m.tag ?? m.design.customer)}</span></div>
      <div class="before">${sketchSvg(m.design, { width: 200, height: 150, note: false })}<span class="tagline">Before</span></div>
      <div class="after">${m.after ? `<img alt="${escapeHtml(m.design.name)}, finished" src="${m.after}">` : '<span class="dim small">(no picture)</span>'}<span class="tagline">After</span></div>
    </div>`).join('')}</div></section>`;
}

const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-AU');
const pct = (f: number) => `${(f * 100).toFixed(0)}%`;
const escapeHtml = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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
    + (d.lostJobsValue > 0 ? row('Pulled jobs cost you', money(d.lostJobsValue), 'bad lost-pulled') : '')
    // chores skipped: the boards they ruined (in "Boards used" above), with the work that went with them
    + ((d.sheetsShifted ?? 0) > 0 ? row(`Missed clamps: ${d.sheetsShifted} sheet${d.sheetsShifted > 1 ? 's' : ''} shifted`, money(choreShare(d, 'shift')), 'bad lost-shift') : '')
    + ((d.sheetsLifted ?? 0) > 0 ? row(`Undrained compressor: ${d.sheetsLifted} sheet${d.sheetsLifted > 1 ? 's' : ''} lifted`, money(choreShare(d, 'lift')), 'bad lost-lift') : '');
  return row('Revenue', money(d.revenue), 'money')
    + ((d.walkIns ?? 0) > 0 ? row(`&nbsp;&nbsp;Walk-ins (${d.walkInCount ?? 0})`, money(d.walkIns), 'dim walkins') : '')
    + row('&nbsp;&nbsp;Boards used', money(-d.materials), 'dim') + row('&nbsp;&nbsp;Delivery fees', money(-d.deliveryFees), 'dim')
    + row('&nbsp;&nbsp;Labour', money(-d.labour), 'dim')
    + row('&nbsp;&nbsp;Other costs', money(-other), 'dim') + overdraft
    + ((d.afterHours ?? 0) > 0 ? row('&nbsp;&nbsp;After hours (boards)', money(-d.afterHours), 'dim') : '')
    + ((d.coffee ?? 0) > 0 ? row('&nbsp;&nbsp;Coffee', money(-d.coffee), 'dim coffee') : '')
    + ((d.bets ?? 0) > 0 ? row(`&nbsp;&nbsp;${CONFIG.dennis.name}'s bets (costs, losses)`, money(-d.bets), 'dim bets') : '')
    + row('Operating profit', money(d.revenue - d.costs), d.revenue - d.costs >= 0 ? 'good' : 'bad')
    + row('Operating margin', pct(margin), mcls) + lost
    + ((d.canRefund ?? 0) > 0 ? row('Can refund (10c a can)', `+$${d.canRefund.toFixed(2)}`, 'good can-refund') : '') + row('Capex (upgrades)', money(-d.upgrades), 'dim')
    + row('Ply on hand', `${money(ply.value)} (${ply.sheets} sheet${ply.sheets === 1 ? '' : 's'})`, 'money')
    + `<p class="dim small">Other: parts ${money(d.consumables)}, fixes ${money(d.fixes)}, beer ${money(d.beer)}, mate had a beer ${money(d.mateBeer)}, fees ${money(d.fees)}. Ply on hand is stock you've paid for, not a cost yet.</p>`;
}

/** "2 served, 1 turned away": today's walk-ins at the roller door. */
function walkInsLine(g: Game): string {
  const served = g.walkIns.filter(w => w.status === 'served').length, gone = g.walkIns.length - served;
  return [served ? `${served} served` : '', gone ? `${gone} turned away` : ''].filter(Boolean).join(', ');
}

/** The boards ruined by one chore: the day's chore-ruined board cost, split by how many sheets each ruined. */
function choreShare(d: DayStats, by: 'shift' | 'lift') {
  const n = (d.sheetsShifted ?? 0) + (d.sheetsLifted ?? 0);
  return n ? d.choreBoards * ((by === 'shift' ? d.sheetsShifted : d.sheetsLifted) / n) : 0;
}

function dayVerdict(d: DayStats): string {
  const m = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : -1;
  if ((d.sheetsShifted ?? 0) >= 1) return 'Four clamps. Every sheet. A sheet that walks is a sheet in the skip.';
  if ((d.sheetsLifted ?? 0) >= 1) return 'When the compressor hiss drops, drain it. The vacuum is all that holds the sheet down.';
  if (d.sheetsScrapped >= 2) return "Two sheets in the skip. That's where the margin went.";
  if (d.wrongCalls >= 3) return 'Guessing at faults costs minutes. Minutes cost sheets.';
  if (d.beers >= 3) return 'The fridge won today.';
  if (m >= 0.3) return 'Tidy. Keep running it like that.';
  if (m >= 0.15) return 'Solid day. Overheads still want $900 at the end of the week.';
  if (m >= 0) return 'Barely. Look at where the time went.';
  return 'Lost money today. Something has to change.';
}

/** Fill `el` with the end-of-day screen. onNext runs after Game.nextDay(); onChange after a purchase. */
export function renderDaySummary(el: HTMLElement, g: Game, onNext: () => void, onChange: () => void, onResetHints?: () => void, made: MadeEntry[] = [], ppl?: DayPeople) {
  const d = g.today;
  const last = d.day >= CONFIG.week.days;
  const floor: [string, string][] = [
    ['Sheets delivered', `${d.sheetsDone}`], [`&nbsp;&nbsp;of which late (${Math.round(CONFIG.economy.latePayFraction * 100)}%)`, `${d.sheetsLate}`],
    ['Sheets scrapped', `${d.sheetsScrapped}`], ['Faults', `${d.faults}`], ['Wrong diagnoses', `${d.wrongCalls}`], ['Beers', `${d.beers}`],
    ['Fires (duct/extr.)', `${d.firesSpot} (${d.firesDuct}/${d.firesExtractor})`],
    ...(CONFIG.chores ? [['Sheets shifted (clamps)', `${d.sheetsShifted ?? 0}`], ['Sheets lifted (compressor)', `${d.sheetsLifted ?? 0}`],
      ['Offcut bin overflowed', `${d.binOverflows ?? 0}`]] as [string, string][] : []),
    ...(g.walkIns?.length ? [['Walk-ins', walkInsLine(g)]] as [string, string][] : []),
  ];
  el.innerHTML = `
    <h1>End of day ${d.day}</h1>
    <p class="sub">Cash ${money(g.cash)} · Rapport ${g.rapport}</p>
    ${ppl?.lease?.ending ? `<section class="ending"><h2>The Lease</h2><h1>${escapeHtml(ppl.lease.ending.headline)}</h1>${ppl.lease.ending.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}<button class="again">Start another lease</button></section>` : ''}
    ${ppl?.lease && !ppl.lease.ending ? `<p class="story leaseline"><b>The Lease:</b> day ${ppl.lease.day} of ${ppl.lease.of}. Rent ${money(ppl.lease.rent)} due on day ${ppl.lease.of}; ${money(ppl.lease.cash)} in the bank${ppl.lease.cash >= ppl.lease.rent ? ' — on track.' : ` — ${money(ppl.lease.rent - ppl.lease.cash)} to go.`}</p>` : ''}
    ${g.story ? `<p class="story"><b>Story of the day:</b> ${escapeHtml(g.story)}</p>` : ''}
    ${ppl?.lastNight?.dontAsk ? `<p class="story lastnight"><b>Last night:</b> don't ask.</p>` : ppl?.lastNight ? `<p class="story lastnight"><b>Last night:</b> ${escapeHtml(ppl.lastNight.who)}, ${ppl.lastNight.beers} beer${ppl.lastNight.beers === 1 ? '' : 's'} each. “${escapeHtml(ppl.lastNight.quote)}” — ${escapeHtml(ppl.lastNight.quoteBy)}</p>` : ''}
    <section><h2>P&amp;L</h2>${pnl(d, { value: d.plyOnHandValue, sheets: d.plyOnHandSheets })}</section>
    <section><h2>Shop floor</h2>${floor.map(([k, v]) => `<div class="row"><span class="dim">${k}</span><span>${v}</span></div>`).join('')}
      ${ppl?.walking ? `<div class="row walking"><span class="dim">Walking today</span><span>${ppl.walking.metres.toLocaleString('en-AU')} m</span></div>
      <div class="row layoutcost ${ppl.walking.layoutMinutes > 0 ? 'bad' : ppl.walking.layoutMinutes < 0 ? 'good' : ''}"><span class="dim">Time lost to layout</span><span>${ppl.walking.layoutMinutes >= 0 ? `${ppl.walking.layoutMinutes} min` : `${-ppl.walking.layoutMinutes} min saved`}</span></div>` : ''}
      <p class="verdict">${dayVerdict(d)}</p></section>
    ${galleryHtml(made)}
    ${galleryHtml(ppl?.afterHours ?? [], 'After hours', (d.afterHours ?? 0) > 0 ? `<p class="dim small">Boards used: ${money(d.afterHours)}. Worth it.</p>` : '<p class="dim small">Cut from offcuts. Free, and better for it.</p>')}
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
  el.querySelector('.again')?.addEventListener('click', () => ppl?.lease?.ending?.again());
  el.querySelectorAll<HTMLButtonElement>('button[data-upg]').forEach(b => b.addEventListener('click', () => {
    if (g.buyUpgrade(b.dataset.upg as UpgradeId)) { onChange(); renderDaySummary(el, g, onNext, onChange, onResetHints, made, ppl); }
  }));
  const reset = el.querySelector<HTMLAnchorElement>('.reset');
  if (reset && onResetHints) reset.addEventListener('click', () => { onResetHints(); reset.textContent = 'Hints will show again.'; });
  el.querySelector('.next')!.addEventListener('click', () => { g.nextDay(); onNext(); });
  const status = el.querySelector('.status')!;
  el.querySelector('.copy')!.addEventListener('click', () => {
    const frames = perf.report(); // how the renderer's coping, for a playtester's report
    void copyText(frames ? `${g.dayReport()}\n\n${frames}` : g.dayReport()).then(ok => { status.textContent = ok ? 'Copied — paste it into a message.' : "Couldn't reach the clipboard."; });
  });
}

/** `weekend`: between weeks of a lease, Saturday and Sunday come first (it calls `next` on Monday). `title`: the heading. */
export function renderWeekSummary(el: HTMLElement, g: Game, onNext: () => void, weekend?: (next: () => void) => void, title = 'Week closed') {
  const total = g.week.reduce<DayStats>((acc, d) => {
    for (const k of Object.keys(acc) as (keyof DayStats)[]) (acc as unknown as Record<string, number>)[k] += d[k] ?? 0; // a day saved before a field existed
    return acc;
  }, { day: 0, revenue: 0, costs: 0, materials: 0, labour: 0, consumables: 0, fixes: 0, beer: 0, fees: 0, upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, sheetsDemanded: 0, sheetsMissed: 0, sheetsDeclined: 0, sheetsLost: 0, latePayLost: 0, lostJobsValue: 0, beers: 0, firesSpot: 0, firesDuct: 0, firesExtractor: 0, faults: 0, wrongCalls: 0, stockOutMinutes: 0, fumbles: 0, looTrips: 0, deliveryFees: 0, overdraftFees: 0, mateBeer: 0, trucks: 0, plyOnHandValue: 0, plyOnHandSheets: 0, sheetsShifted: 0, sheetsLifted: 0, choreBoards: 0, walkIns: 0, walkInCount: 0, pickups: 0, palletBlocked: 0, binOverflows: 0, afterHours: 0, canRefund: 0, layoutMinutes: 0, bets: 0, coffee: 0 });
  total.fees += g.weekOverheads; // rent, power, insurance
  const last = g.week[g.week.length - 1]; // stock is a snapshot at close, not a sum
  total.costs += g.weekOverheads;
  const wm = total.revenue > 0 ? (total.revenue - total.costs) / total.revenue : 0;
  const verdict = g.cash < 0 ? "You're overdrawn. The bank will be calling all next week."
    : wm >= 0.3 ? 'Thirty-plus percent in a one-man shed. Mick from the joinery would like a word about buying you out.'
    : wm >= 0.15 ? 'A real business, just. One bad week from not being one.'
    : 'Alive, but you worked a week for very little. Scrap and overtime are the usual suspects.';
  el.innerHTML = `
    <h1>${title}</h1>
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
  const next = () => { g.nextWeek(); onNext(); };
  el.querySelector('.next')!.addEventListener('click', () => (weekend ? weekend(next) : next()));
}
