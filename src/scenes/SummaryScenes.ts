import Phaser from 'phaser';
import { CONFIG, type UpgradeId } from '../config.js';
import { Game } from '../sim/Game.js';
import type { DayStats } from '../sim/types.js';
import { PALETTE, buildTag, button, copyText, label, money, panel, pct } from '../ui/widgets.js';
import { saveFromRegistry } from '../world/save.js';

// Portrait (390 wide): the same panels as before, stacked instead of side by side.
const W = 390;
const X = 10, PW = W - 2 * X;  // panel x and width
const IX = X + 14, VX = X + PW - 14; // label x, right-aligned value x

function pnlLines(d: DayStats): [string, number, string][] {
  const margin = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : 0;
  return [
    ['Revenue', d.revenue, PALETTE.money],
    ['  Materials', -d.materials, PALETTE.dim],
    ['  Labour', -d.labour, PALETTE.dim],
    ['  Consumables', -d.consumables, PALETTE.dim],
    ['  Fault fixes', -d.fixes, PALETTE.dim],
    ['  Beer', -d.beer, PALETTE.dim],
    ['  Fees', -d.fees, PALETTE.dim],
    ['Operating profit', d.revenue - d.costs, d.revenue - d.costs >= 0 ? PALETTE.good : PALETTE.bad],
    ['Operating margin', margin * 100, margin >= 0.15 ? PALETTE.good : margin >= 0 ? PALETTE.money : PALETTE.bad],
    ['Capex (upgrades)', -d.upgrades, PALETTE.dim],
  ];
}

function drawPnl(scene: Phaser.Scene, y: number, d: DayStats) {
  for (const [name, val, col] of pnlLines(d)) {
    const isPct = name === 'Operating margin';
    label(scene, IX, y, name, 13, col);
    label(scene, VX, y, isPct ? `${val.toFixed(0)}%` : money(val), 13, col).setOrigin(1, 0);
    y += 20;
  }
  return y;
}

export class DaySummaryScene extends Phaser.Scene {
  constructor() { super('daySummary'); }
  create() {
    const g = this.registry.get('game') as Game;
    saveFromRegistry(this.registry);
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const d = g.today;
    label(this, 15, 14, `End of day ${d.day}`, 22);
    label(this, 15, 44, `Cash ${money(g.cash)}   ·   Rapport ${g.rapport}`, 13, PALETTE.dim);

    panel(this, X, 66, PW, 232, 'P&L');
    drawPnl(this, 90, d);

    panel(this, X, 306, PW, 212, 'Shop floor');
    const lines = [
      [`Sheets delivered`, `${d.sheetsDone}`],
      [`  of which late (${Math.round(CONFIG.economy.latePayFraction * 100)}%)`, `${d.sheetsLate}`],
      [`Sheets scrapped`, `${d.sheetsScrapped}`],
      [`Faults`, `${d.faults}`],
      [`Wrong diagnoses`, `${d.wrongCalls}`],
      [`Beers`, `${d.beers}`],
      [`Fires (duct/extr.)`, `${d.firesSpot} (${d.firesDuct}/${d.firesExtractor})`],
    ];
    let y = 330;
    for (const [k, v] of lines) { label(this, IX, y, k, 13, PALETTE.dim); label(this, VX, y, v, 13).setOrigin(1, 0); y += 20; }
    label(this, IX, y + 6, this.verdict(d), 12, PALETTE.ink, PW - 28);

    panel(this, X, 526, PW, 196, 'Upgrade shop');
    y = 550;
    for (const u of CONFIG.upgrades) {
      const owned = g.upgrades.has(u.id as UpgradeId);
      const can = !owned && g.cash >= u.cost;
      label(this, IX, y, u.name, 12, owned ? PALETTE.good : PALETTE.ink);
      label(this, IX, y + 15, u.desc, 10, PALETTE.dim, 240);
      button(this, VX - 80, y, 80, 28, owned ? 'Owned' : money(u.cost), () => {
        if (g.buyUpgrade(u.id as UpgradeId)) { saveFromRegistry(this.registry); this.scene.restart(); }
      }, { disabled: !can, size: 11, color: PALETTE.green });
      y += 42;
    }

    const last = d.day >= CONFIG.week.days;
    button(this, W / 2 - 110, 730, 220, 36, last ? 'Close out the week' : `Start day ${d.day + 1}`, () => {
      g.nextDay();
      saveFromRegistry(this.registry);
      this.scene.start(g.phase === 'weekSummary' ? 'weekSummary' : 'world');
    }, { color: PALETTE.accentDark, size: 15 });

    // playtest feedback
    label(this, W / 2, 772, 'Thoughts? Copy the day log and send it to Courtney.', 12, PALETTE.ink, PW).setOrigin(0.5, 0).setAlign('center');
    const status = label(this, W / 2, 824, '', 10, PALETTE.dim).setOrigin(0.5, 0);
    button(this, W / 2 - 80, 794, 160, 26, 'Copy day log', () => {
      void copyText(g.dayReport()).then(ok => status.setText(ok ? 'Copied — paste it into a message.' : "Couldn't reach the clipboard."));
    }, { color: PALETTE.blue, size: 12 });
    buildTag(this);
  }

  private verdict(d: DayStats): string {
    const m = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : -1;
    if (d.sheetsScrapped >= 2) return "Two sheets in the skip. That's where the margin went.";
    if (d.wrongCalls >= 3) return 'Guessing at faults costs minutes. Minutes cost sheets.';
    if (d.beers >= 3) return 'The fridge won today.';
    if (m >= 0.3) return 'Tidy. Keep running it like that.';
    if (m >= 0.15) return 'Solid day. Overheads still want $900 at the end of the week.';
    if (m >= 0) return 'Barely. Look at where the time went.';
    return 'Lost money today. Something has to change.';
  }
}

export class WeekSummaryScene extends Phaser.Scene {
  constructor() { super('weekSummary'); }
  create() {
    const g = this.registry.get('game') as Game;
    saveFromRegistry(this.registry);
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const total = g.week.reduce<DayStats>((acc, d) => {
      for (const k of Object.keys(acc) as (keyof DayStats)[]) (acc as unknown as Record<string, number>)[k] += d[k];
      return acc;
    }, { day: 0, revenue: 0, costs: 0, materials: 0, labour: 0, consumables: 0, fixes: 0, beer: 0, fees: 0, upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, sheetsDemanded: 0, sheetsMissed: 0, sheetsDeclined: 0, sheetsLost: 0, beers: 0, firesSpot: 0, firesDuct: 0, firesExtractor: 0, faults: 0, wrongCalls: 0 });

    label(this, 15, 14, 'Week closed', 22);
    label(this, 15, 44, `Cash in the bank: ${money(g.cash)}`, 13, g.cash >= 0 ? PALETTE.money : PALETTE.bad);
    panel(this, X, 66, PW, 250, 'Week P&L');
    total.fees += g.weekOverheads; // rent, power, insurance
    total.costs += g.weekOverheads;
    const endY = drawPnl(this, 90, total);
    label(this, IX, endY + 4, `Fees include ${money(g.weekOverheads)} weekly overheads.`, 10, PALETTE.dim);

    panel(this, X, 324, PW, 200, 'By day');
    let y = 348;
    label(this, IX, y, 'Day  Rev     Cost    Margin Done Scrap', 11, PALETTE.dim); y += 20;
    for (const d of g.week) {
      const m = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : 0;
      label(this, IX, y, `${String(d.day).padEnd(4)} ${money(d.revenue).padEnd(7)} ${money(d.costs).padEnd(7)} ${pct(m).padStart(5)}  ${String(d.sheetsDone).padEnd(4)} ${d.sheetsScrapped}`, 11, m >= 0.15 ? PALETTE.good : m >= 0 ? PALETTE.ink : PALETTE.bad);
      y += 18;
    }
    const wm = total.revenue > 0 ? (total.revenue - total.costs) / total.revenue : 0;
    const verdict = g.cash < 0 ? "You're overdrawn. The bank will be calling all next week."
      : wm >= 0.3 ? 'Thirty-plus percent in a one-man shed. Mick from the joinery would like a word about buying you out.'
      : wm >= 0.15 ? 'A real business, just. One bad week from not being one.'
      : 'Alive, but you worked a week for very little. Scrap and overtime are the usual suspects.';
    label(this, IX, y + 10, verdict, 12, PALETTE.ink, PW - 28);

    button(this, W / 2 - 110, 540, 220, 40, 'Run another week', () => {
      g.nextWeek();
      saveFromRegistry(this.registry);
      this.scene.start('world');
    }, { color: PALETTE.accentDark, size: 15 });
    buildTag(this);
  }
}
