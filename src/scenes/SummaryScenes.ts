import Phaser from 'phaser';
import { CONFIG, type UpgradeId } from '../config.js';
import { Game } from '../sim/Game.js';
import type { DayStats } from '../sim/types.js';
import { PALETTE, button, label, money, panel, pct } from '../ui/widgets.js';

const W = 1024;

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

function drawPnl(scene: Phaser.Scene, x: number, y: number, d: DayStats) {
  for (const [name, val, col] of pnlLines(d)) {
    const isPct = name === 'Operating margin';
    label(scene, x, y, name, 13, col);
    label(scene, x + 230, y, isPct ? `${val.toFixed(0)}%` : money(val), 13, col).setOrigin(1, 0);
    y += 20;
  }
  return y;
}

export class DaySummaryScene extends Phaser.Scene {
  constructor() { super('daySummary'); }
  create() {
    const g = this.registry.get('game') as Game;
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const d = g.today;
    label(this, 30, 20, `End of day ${d.day}`, 24);
    label(this, 30, 52, `Cash ${money(g.cash)}   ·   Rapport ${g.rapport}`, 14, PALETTE.dim);

    panel(this, 30, 90, 300, 260, 'P&L');
    drawPnl(this, 45, 115, d);

    panel(this, 350, 90, 300, 260, 'Shop floor');
    const lines = [
      [`Sheets delivered`, `${d.sheetsDone}`],
      [`  of which late (70%)`, `${d.sheetsLate}`],
      [`Sheets scrapped`, `${d.sheetsScrapped}`],
      [`Faults`, `${d.faults}`],
      [`Wrong diagnoses`, `${d.wrongCalls}`],
      [`Beers`, `${d.beers}`],
    ];
    let y = 115;
    for (const [k, v] of lines) { label(this, 365, y, k, 13, PALETTE.dim); label(this, 630, y, v, 13).setOrigin(1, 0); y += 22; }
    const verdict = this.verdict(d);
    label(this, 365, y + 14, verdict, 12, PALETTE.ink, 270);

    panel(this, 670, 90, 324, 260, 'Upgrade shop');
    y = 115;
    for (const u of CONFIG.upgrades) {
      const owned = g.upgrades.has(u.id as UpgradeId);
      const can = !owned && g.cash >= u.cost;
      label(this, 685, y, u.name, 12, owned ? PALETTE.good : PALETTE.ink);
      label(this, 685, y + 15, u.desc, 10, PALETTE.dim, 200);
      button(this, 900, y, 80, 30, owned ? 'Owned' : money(u.cost), () => { if (g.buyUpgrade(u.id as UpgradeId)) this.scene.restart(); }, { disabled: !can, size: 11, color: PALETTE.green });
      y += 54;
    }

    const last = d.day >= CONFIG.week.days;
    button(this, W / 2 - 110, 400, 220, 40, last ? 'Close out the week' : `Start day ${d.day + 1}`, () => {
      g.nextDay();
      this.scene.start(g.phase === 'weekSummary' ? 'weekSummary' : 'factory');
    }, { color: PALETTE.accentDark, size: 15 });
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
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const total = g.week.reduce<DayStats>((acc, d) => {
      for (const k of Object.keys(acc) as (keyof DayStats)[]) (acc as unknown as Record<string, number>)[k] += d[k];
      return acc;
    }, { day: 0, revenue: 0, costs: 0, materials: 0, labour: 0, consumables: 0, fixes: 0, beer: 0, fees: 0, upgrades: 0, sheetsDone: 0, sheetsLate: 0, sheetsScrapped: 0, beers: 0, faults: 0, wrongCalls: 0 });

    label(this, 30, 20, 'Week closed', 24);
    label(this, 30, 52, `Cash in the bank: ${money(g.cash)}`, 14, g.cash >= 0 ? PALETTE.money : PALETTE.bad);
    panel(this, 30, 90, 300, 280, 'Week P&L');
    total.fees += g.weekOverheads; // rent, power, insurance
    total.costs += g.weekOverheads;
    const endY = drawPnl(this, 45, 115, total);
    label(this, 45, endY + 4, `Fees include ${money(g.weekOverheads)} weekly overheads.`, 10, PALETTE.dim);

    panel(this, 350, 90, 420, 260, 'By day');
    let y = 115;
    label(this, 365, y, 'Day   Rev     Cost    Margin  Done  Scrap', 12, PALETTE.dim); y += 22;
    for (const d of g.week) {
      const m = d.revenue > 0 ? (d.revenue - d.costs) / d.revenue : 0;
      label(this, 365, y, `${String(d.day).padEnd(5)} ${money(d.revenue).padEnd(7)} ${money(d.costs).padEnd(7)} ${pct(m).padStart(5)}   ${String(d.sheetsDone).padEnd(5)} ${d.sheetsScrapped}`, 12, m >= 0.15 ? PALETTE.good : m >= 0 ? PALETTE.ink : PALETTE.bad);
      y += 20;
    }
    const wm = total.revenue > 0 ? (total.revenue - total.costs) / total.revenue : 0;
    const verdict = g.cash < 0 ? "You're overdrawn. The bank will be calling all next week."
      : wm >= 0.3 ? 'Thirty-plus percent in a one-man shed. Mick from the joinery would like a word about buying you out.'
      : wm >= 0.15 ? 'A real business, just. One bad week from not being one.'
      : 'Alive, but you worked a week for very little. Scrap and overtime are the usual suspects.';
    label(this, 365, y + 16, verdict, 12, PALETTE.ink, 390);

    button(this, W / 2 - 110, 400, 220, 40, 'Run another week', () => { g.nextWeek(); this.scene.start('factory'); }, { color: PALETTE.accentDark, size: 15 });
  }
}
