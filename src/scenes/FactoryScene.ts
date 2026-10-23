import Phaser from 'phaser';
import { CONFIG, type ConsumableKey } from '../config.js';
import { Game } from '../sim/Game.js';
import type { Job } from '../sim/types.js';
import { PALETTE, bar, buildTag, button, healthColor, label, money, panel, pct } from '../ui/widgets.js';

const W = 1024, H = 640;
/** Exhaust duct: rises from the back of the bed to the roof, top-right of the machine panel. */
const DUCT = { x: 272, w: 18, top: 60, bottom: 109 };

export class FactoryScene extends Phaser.Scene {
  private game_!: Game;
  private acc = 0;
  private lastReal = 0;
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private dirty = true;
  private paused = false;
  private faultLight!: Phaser.GameObjects.Arc;
  private lastPhase = '';
  // exhaust duct: smoke puffs and a glow that animate on their own, shown/hidden each render
  private smoke: Phaser.GameObjects.Arc[] = [];
  private glow!: Phaser.GameObjects.Arc;
  private eKey?: Phaser.Input.Keyboard.Key;
  private sprayPointer = false;

  constructor() { super('factory'); }

  create() {
    this.game_ = this.registry.get('game') as Game;
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    // static frames
    panel(this, 10, 50, 330, 330, 'The machine');
    panel(this, 350, 50, 340, 330, 'Bench');
    panel(this, 700, 50, 314, 330, "Today's board");
    panel(this, 10, 390, 500, 240, 'Shed');
    panel(this, 520, 390, 494, 240, 'People');

    this.faultLight = this.add.circle(308, 121, 7, 0xff3b1f).setVisible(false);
    this.tweens.add({ targets: this.faultLight, alpha: { from: 1, to: 0.2 }, duration: 350, yoyo: true, repeat: -1 });
    this.glow = this.add.circle(DUCT.x + DUCT.w / 2, DUCT.top + 18, 10, 0xff8a1f).setVisible(false).setDepth(2);
    this.tweens.add({ targets: this.glow, alpha: { from: 0.9, to: 0.35 }, duration: 260, yoyo: true, repeat: -1 });
    for (let i = 0; i < 3; i++) {
      const puff = this.add.circle(DUCT.x + DUCT.w / 2, DUCT.top, 5, 0x9a948c, 0.7).setVisible(false).setDepth(2);
      this.tweens.add({
        targets: puff, y: DUCT.top - 26, x: `+=${(i - 1) * 6}`, scale: { from: 0.6, to: 1.8 }, alpha: { from: 0.7, to: 0 },
        duration: 1400, delay: i * 460, repeat: -1,
      });
      this.smoke.push(puff);
    }
    buildTag(this);
    this.input.keyboard?.on('keydown-SPACE', () => { this.paused = !this.paused; this.dirty = true; });
    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.input.on('pointerup', () => { this.sprayPointer = false; });
    this.lastReal = 0;
    this.acc = 0;
    this.render();
  }

  update() {
    const g = this.game_;
    if (g.phase === 'daySummary') { this.scene.start('daySummary'); return; }
    if (g.phase === 'weekSummary') { this.scene.start('weekSummary'); return; }
    // Wall-clock based so a slow or throttled tab doesn't slow the shed down.
    const now = performance.now();
    const dt = this.lastReal ? Math.min(now - this.lastReal, CONFIG.clock.realMsPerGameMinute * 5) : 0;
    this.lastReal = now;
    // holding E (or the spray button) only does anything with the extinguisher at the duct
    const holding = !!this.eKey?.isDown || this.sprayPointer;
    if (holding !== g.spraying) { g.setSpraying(holding); this.dirty = true; }
    if (g.phase === 'day' && !this.paused) {
      this.acc += dt;
      while (this.acc >= CONFIG.clock.realMsPerGameMinute) {
        this.acc -= CONFIG.clock.realMsPerGameMinute;
        g.tick();
        this.dirty = true;
      }
    }
    if (g.phase !== this.lastPhase) { this.lastPhase = g.phase; this.dirty = true; }
    if (this.dirty) { this.render(); this.dirty = false; }
  }

  /** Player input goes through here so competence can add lag. */
  private act(fn: () => void) {
    const delay = this.game_.inputDelayMs();
    if (delay <= 0) { fn(); this.dirty = true; return; }
    this.time.delayedCall(delay, () => { fn(); this.dirty = true; });
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T { this.dyn.push(o); return o; }

  private render() {
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
    this.renderTopBar();
    this.renderMachine();
    this.renderBench();
    this.renderBoard();
    this.renderLog();
    this.renderPeople();
    if (this.game_.phase === 'endOfDayPrompt') this.renderEndOfDay();
    if (this.paused) this.keep(label(this, W / 2, H - 4, 'PAUSED — space to resume', 14, PALETTE.bad).setOrigin(0.5, 1));
  }

  private renderTopBar() {
    const g = this.game_;
    const ot = g.overtime ? '  OVERTIME x2' : '';
    this.keep(label(this, 12, 10, `Day ${g.day}/${CONFIG.week.days}   ${g.formatTime()}${ot}`, 16));
    const mcol = g.margin >= CONFIG.startingMarginHint ? PALETTE.good : g.margin >= 0 ? PALETTE.money : PALETTE.bad;
    this.keep(label(this, 330, 10, `Cash ${money(g.cash)}`, 16, g.cash < 0 ? PALETTE.bad : PALETTE.money));
    this.keep(label(this, 500, 10, `Margin ${g.today.revenue > 0 ? pct(g.margin) : '—'}`, 16, g.today.revenue > 0 ? mcol : PALETTE.dim));
    this.keep(label(this, 650, 6, 'Competence', 10, PALETTE.dim));
    this.keep(bar(this, 650, 20, 140, 12, g.competence / CONFIG.competence.max, healthColor(g.competence / 100)));
    this.keep(label(this, 810, 6, 'Rapport', 10, PALETTE.dim));
    this.keep(bar(this, 810, 20, 100, 12, g.rapport / 100, healthColor(g.rapport / 100)));
    this.keep(label(this, 925, 10, g.busy ? `(${g.busy.label})` : '', 11, PALETTE.dim));
  }

  private renderMachine() {
    const g = this.game_;
    const x = 20, y = 75;
    const stateColor: Record<string, string> = {
      idle: PALETTE.dim, loading: PALETTE.money, cutting: PALETTE.good, paused: PALETTE.money, fault: PALETTE.bad, estop: PALETTE.bad,
      fire: PALETTE.bad, down: PALETTE.bad,
    };
    const stateName: Record<string, string> = { fire: 'STOPPED', down: 'DOWN' };
    this.keep(label(this, x, y, stateName[g.machine] ?? g.machine.toUpperCase(), 22, stateColor[g.machine]));
    this.renderDuct();
    // machine picture: bed + gantry
    const bed = this.keep(this.add.graphics());
    bed.fillStyle(0x3a2f26, 1).fillRect(x, y + 34, 300, 110);
    bed.lineStyle(2, PALETTE.panelLine, 1).strokeRect(x, y + 34, 300, 110);
    if (g.current) {
      const prog = g.current.progress / g.current.cutMinutes;
      bed.fillStyle(0xcdb28a, 1).fillRect(x + 10, y + 44, 280, 90); // sheet
      bed.lineStyle(2, 0x2a1d12, 1);
      // cut lines creeping across the sheet
      const cols = 6, rows = 3;
      for (let i = 0; i < cols * rows; i++) {
        if (i / (cols * rows) > prog) break;
        const cx = x + 14 + (i % cols) * 46, cy = y + 48 + Math.floor(i / cols) * 28;
        bed.strokeRect(cx, cy, 42, 24);
      }
      const gx = x + 10 + 280 * prog;
      bed.fillStyle(g.machine === 'cutting' ? 0xd48a3c : 0x777777, 1).fillRect(gx - 4, y + 36, 8, 106); // gantry
    }
    this.faultLight.setVisible(g.machine === 'fault' || g.machine === 'estop');

    let yy = y + 152;
    if (g.current) {
      this.keep(label(this, x, yy, g.current.name, 12));
      this.keep(label(this, x, yy + 16, `${g.current.material}  ·  ${g.current.progress}/${g.current.cutMinutes} min`, 11, PALETTE.dim));
    } else if (g.machine === 'idle') {
      this.keep(label(this, x, yy, 'Bed is empty.', 12, PALETTE.dim));
    }
    yy += 44;
    const keys: ConsumableKey[] = ['bit', 'spoilboard', 'filter'];
    const names: Record<ConsumableKey, string> = { bit: 'Bit', spoilboard: 'Spoilboard', filter: 'Extraction filter' };
    for (const k of keys) {
      const h = g.wear[k];
      this.keep(label(this, x, yy + 1, names[k], 11, PALETTE.dim));
      this.keep(bar(this, x + 120, yy + 2, 110, 10, h, healthColor(h)));
      const c = CONFIG.consumables[k];
      const can = g.canAct && !g.replacing && !g.fault && g.machine !== 'loading' && g.machine !== 'down' && g.phase === 'day';
      const txt = g.replacing?.key === k ? `${g.replacing.remaining}m` : `Swap ${money(c.replaceCost)}`;
      this.keep(button(this, x + 240, yy - 3, 70, 18, txt, () => this.act(() => g.replaceConsumable(k)), { disabled: !can, size: 10 }));
      yy += 24;
    }
    // fridge
    const beerOk = g.fridgeOpen && g.canAct && g.phase === 'day';
    const beerTxt = g.fridgeOpen ? `Beer ${money(CONFIG.competence.beerCost)} (${g.beersToday} today)` : `Fridge locked till ${CONFIG.competence.fridgeUnlockHour - 12}pm`;
    this.keep(button(this, x, yy + 6, 200, 24, beerTxt, () => this.act(() => g.drinkBeer()), { disabled: !beerOk, color: PALETTE.blue, size: 11 }));
  }

  /** The exhaust duct. A fire shows only here: smoke first, then an orange glow; a duct fire glows bigger and redder. */
  private renderDuct() {
    const g = this.game_;
    const fire = g.fire;
    const d = this.keep(this.add.graphics());
    d.fillStyle(g.machineDown ? 0x1a1a1a : 0x6b6560, 1).fillRect(DUCT.x, DUCT.top, DUCT.w, DUCT.bottom - DUCT.top);
    d.lineStyle(1, 0x2a2622, 1).strokeRect(DUCT.x, DUCT.top, DUCT.w, DUCT.bottom - DUCT.top);
    const glowing = !!fire && (fire.stage === 'duct' || fire.minutes >= CONFIG.fire.smokeOnlyMinutes);
    for (const puff of this.smoke) puff.setVisible(!!fire || g.machineDown).setFillStyle(g.machineDown ? 0x222222 : 0x9a948c, 0.7);
    this.glow.setVisible(glowing);
    if (fire) this.glow.setRadius(fire.stage === 'duct' ? 16 : 9).setFillStyle(fire.stage === 'duct' ? 0xff4a1a : 0xff8a1f);

    // at the duct with the extinguisher: hold E, or hold this
    const r = g.fireResponse;
    if (r?.step === 'atDuct' && fire) {
      const need = CONFIG.fire.sprayMinutes[fire.stage];
      const bx = 110, by = DUCT.top + 2, bw = 150, bh = 24;
      const rect = this.keep(this.add.rectangle(bx, by, bw, bh, g.spraying ? PALETTE.green : PALETTE.blue).setOrigin(0).setDepth(3));
      rect.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.sprayPointer = true; });
      this.keep(label(this, bx + bw / 2, by + bh / 2, g.spraying ? 'Spraying…' : 'Hold E to spray', 11).setOrigin(0.5).setDepth(3));
      this.keep(bar(this, bx, by + bh + 2, bw, 5, fire.sprayed / need, PALETTE.green).setDepth(3));
    }
  }

  private renderBench() {
    const g = this.game_;
    const x = 360, y = 75, w = 320;
    const r = g.fireResponse;
    if (r) {
      const doing: Record<typeof r.step, string> = {
        toExtinguisher: 'walking to the extinguisher', grab: 'getting the extinguisher off the wall',
        toDuct: 'carrying it to the duct', atDuct: 'at the duct with the extinguisher', returning: 'hanging the extinguisher back up',
      };
      this.keep(label(this, x, y, `You're ${doing[r.step]}.`, 14, PALETTE.money, w));
      this.keep(label(this, x, y + 42, r.step === 'atDuct' ? 'Hold E to spray.' : `${r.remaining} min`, 12, PALETTE.dim));
      return;
    }
    if (g.busy) {
      this.keep(label(this, x, y, `You're ${g.busy.label}.`, 14, PALETTE.money, w));
      this.keep(label(this, x, y + 24, `${g.busy.remaining} min`, 12, PALETTE.dim));
      return;
    }
    const f = g.fault;
    if (!f) {
      if (g.machine === 'idle') {
        const next = g.nextUp();
        if (next) {
          const late = g.isLate(next);
          this.keep(label(this, x, y, 'Next up:', 12, PALETTE.dim));
          this.keep(label(this, x, y + 18, next.name, 14, PALETTE.ink, w));
          this.keep(label(this, x, y + 40, `${next.material} · ${next.cutMinutes} min · board ${money(next.materialCost)} · pays ${money(next.price)}`, 11, PALETTE.dim, w));
          this.keep(label(this, x, y + 56, `Due ${g.dueLabel(next)}${late ? '  (LATE)' : ''}`, 11, late ? PALETTE.bad : PALETTE.dim));
          this.keep(button(this, x, y + 84, 200, 32, 'Load sheet & run', () => this.act(() => g.loadNextSheet()), { color: PALETTE.green, size: 14 }));
        } else {
          this.keep(label(this, x, y, "Board's clear. Nothing else today.", 14, PALETTE.good, w));
        }
      } else if (g.machine === 'loading') {
        this.keep(label(this, x, y, `Loading sheet… ${g.loadingRemaining} min`, 14, PALETTE.money));
      } else if (g.machine === 'paused') {
        this.keep(label(this, x, y, 'Paused for a swap.', 14, PALETTE.money));
      } else if (g.machine === 'fire') {
        this.keep(label(this, x, y, "The cut's stopped.", 14, PALETTE.bad, w));
      } else if (g.machine === 'down') {
        this.keep(label(this, x, y, "The extractor's cooked. Nothing more cuts today.", 14, PALETTE.bad, w));
      } else {
        this.keep(label(this, x, y, 'Cutting. Keep an eye on it.', 14, PALETTE.good));
        const hint = g.friendPresent ? "You're half-listening to a mate. Fault odds up." : 'Watch the consumable bars — swap between sheets.';
        this.keep(label(this, x, y + 24, hint, 11, PALETTE.dim, w));
      }
      return;
    }

    // fault flow
    this.keep(label(this, x, y, f.def.name.toUpperCase(), 14, PALETTE.bad));
    const neglect = f.def.scrapAfterMinutes - f.minutesOpen;
    if (!f.sheetScrapped && g.current) {
      this.keep(label(this, x + 200, y + 1, `scrap in ${Math.max(0, neglect)}m`, 11, neglect < 5 ? PALETTE.bad : PALETTE.dim));
    } else if (f.sheetScrapped) {
      this.keep(label(this, x + 200, y + 1, 'sheet scrapped', 11, PALETTE.bad));
    }
    this.keep(label(this, x, y + 20, f.def.symptom, 12, PALETTE.ink, w));
    let yy = y + 78;
    switch (f.phase) {
      case 'diagnose': {
        this.keep(label(this, x, yy, "What's going on?", 12, PALETTE.dim)); yy += 20;
        for (const d of f.def.diagnoses) {
          const tried = f.triedDiagnoses.includes(d.id);
          this.keep(button(this, x, yy, 300, 28, tried ? `✗ ${d.label}` : d.label, () => this.act(() => g.diagnose(d.id)), { disabled: tried, color: PALETTE.blue }));
          yy += 34;
        }
        break;
      }
      case 'wrongCall':
        this.keep(label(this, x, yy, `${f.busyLabel} (${f.busyRemaining} min)`, 12, PALETTE.money, w));
        break;
      case 'choosePath': {
        this.keep(label(this, x, yy, 'How do you want to fix it?', 12, PALETTE.dim)); yy += 20;
        for (const p of g.availablePaths()) {
          const mins = p.steps.reduce((s, st) => s + st.minutes, 0);
          const cost = p.steps.reduce((s, st) => s + st.cost, 0);
          this.keep(button(this, x, yy, 300, 36, `${p.label}\n~${mins} min · ${money(cost)} · ${p.steps.length} step${p.steps.length > 1 ? 's' : ''}`,
            () => this.act(() => g.choosePath(p.id)), { color: PALETTE.accentDark, size: 11 }));
          yy += 42;
        }
        break;
      }
      case 'step':
      case 'working': {
        const path = f.path!;
        for (let i = 0; i < path.steps.length; i++) {
          const st = path.steps[i];
          const done = i < f.stepIndex, cur = i === f.stepIndex;
          const col = done ? PALETTE.good : cur ? PALETTE.ink : PALETTE.dim;
          const mark = done ? '✓' : cur ? '▶' : '·';
          this.keep(label(this, x, yy, `${mark} ${st.label}  (${st.minutes}m${st.cost ? ', ' + money(st.cost) : ''})`, 11, col, w));
          yy += 17;
        }
        yy += 8;
        if (f.phase === 'step') {
          this.keep(button(this, x, yy, 220, 30, `Do it: ${path.steps[f.stepIndex].label}`, () => this.act(() => g.doStep()), { color: PALETTE.green, size: 11 }));
        } else {
          this.keep(label(this, x, yy + 6, `Working… ${f.busyRemaining} min`, 12, PALETTE.money));
        }
        break;
      }
    }
  }

  private renderBoard() {
    const g = this.game_;
    const x = 710; let y = 75;
    // open work first (soonest due on top), then what's already done or binned
    const open = (j: Job) => j.status === 'queued' || j.status === 'cutting';
    const jobs = [...g.jobs].sort((a, b) => Number(open(b)) - Number(open(a)) || g.dueAt(a) - g.dueAt(b));
    const rows = 11;
    for (const j of jobs.slice(0, jobs.length > rows ? rows - 1 : rows)) {
      const late = g.isLate(j) && j.status === 'queued';
      let col = PALETTE.ink, mark = ' ';
      if (j.status === 'done') { col = j.paidLate ? PALETTE.money : PALETTE.good; mark = '✓'; }
      else if (j.status === 'scrapped') { col = PALETTE.bad; mark = '✗'; }
      else if (j.status === 'cutting') { col = PALETTE.money; mark = '▶'; }
      else if (late) { col = PALETTE.bad; }
      const name = j.name.length > 28 ? j.name.slice(0, 27) + '…' : j.name;
      this.keep(label(this, x, y, `${mark} ${name}`, 11, col));
      this.keep(label(this, x + 12, y + 13, `${g.dueLabel(j)} · ${j.material} · ${money(j.price)}`, 10, PALETTE.dim));
      y += 27;
    }
    if (jobs.length > rows) this.keep(label(this, x, y, `+ ${jobs.length - (rows - 1)} more`, 11, PALETTE.dim));
  }

  /** What needs doing, most urgent first. A fire goes on top and is otherwise only shown at the duct. */
  private todo(): string[] {
    const g = this.game_;
    if (g.phase !== 'day') return [];
    const items: string[] = [];
    if (g.fire) items.push('Put out the exhaust fire');
    if (g.fault) items.push(`Sort out the ${g.fault.def.name.toLowerCase()}`);
    for (const d of g.distractions) {
      if (d.kind === 'phone') items.push('Answer the phone');
      else if (d.kind === 'courier') items.push('Sign for the courier');
      else if (d.kind === 'bank') items.push('Call the bank back');
    }
    const names: Record<ConsumableKey, string> = { bit: 'bit', spoilboard: 'spoilboard', filter: 'extractor bag' };
    for (const k of ['bit', 'filter', 'spoilboard'] as ConsumableKey[]) if (g.wear[k] < CONFIG.ui.swapHintBelow) items.push(`Swap the ${names[k]}`);
    if (g.machine === 'idle' && !g.fault && g.queued.length) items.push('Load the next sheet');
    return items.slice(0, 4);
  }

  private renderLog() {
    const g = this.game_;
    const colors = { info: PALETTE.dim, good: PALETTE.good, bad: PALETTE.bad, money: PALETTE.money };
    let y = 412;
    // the to-do list sits on top of the shed log
    const todo = this.todo();
    if (todo.length) {
      this.keep(label(this, 20, y, 'TO DO', 10, PALETTE.dim));
      y += 15;
      for (const t of todo) { this.keep(label(this, 20, y, `[ ] ${t}`, 12, PALETTE.ink)); y += 17; }
      y += 6;
    }
    const room = Math.floor((616 - y) / 17);
    const lines = g.log.slice(-room);
    for (const l of lines) {
      const text = l.text.length > 62 ? l.text.slice(0, 61) + '…' : l.text;
      this.keep(label(this, 20, y, `${g.formatTime(l.minute).padStart(7)}  ${text}`, 11, colors[l.tone]));
      y += 17;
    }
  }

  private renderPeople() {
    const g = this.game_;
    const x = 530; let y = 412;
    // the extinguisher hangs on the wall by the roller door
    const ex = this.keep(this.add.graphics());
    const onWall = !g.fireResponse || g.fireResponse.step === 'toExtinguisher';
    if (onWall) ex.fillStyle(0xc0281e, 1).fillRoundedRect(990, 572, 12, 30, 3).fillStyle(0x222222, 1).fillRect(992, 566, 8, 7);
    else ex.lineStyle(1, PALETTE.panelLine, 1).strokeRoundedRect(990, 572, 12, 30, 3);
    this.keep(button(this, 830, 590, 150, 24, 'Extinguisher', () => this.act(() => g.fightFire()),
      { disabled: !g.canAct || g.phase !== 'day', color: PALETTE.red, size: 11 }));
    if (!g.distractions.length) {
      this.keep(label(this, x, y, 'Quiet. Just you and the radio.', 12, PALETTE.dim));
      return;
    }
    for (const d of g.distractions) {
      this.keep(label(this, x, y, d.title, 13, PALETTE.ink));
      this.keep(label(this, x, y + 17, d.line, 11, PALETTE.dim, 470));
      const bx = x + 300;
      if (d.kind === 'friend') {
        const f = CONFIG.distractions.friend;
        const status = d.engaged ? `Chatting. ${d.remaining} min to go — fixes are slower and you're not watching the bed.` : `Hovering. Starts talking in ${d.hover} min whether you like it or not.`;
        this.keep(label(this, x, y + 34, status, 10, d.engaged ? PALETTE.money : PALETTE.dim, 290));
        if (!d.engaged) this.keep(button(this, bx, y - 2, 170, 22, `Have a yarn (+${f.chatRapportGain} rapport)`, () => this.act(() => g.respond(d.id, 'chat')), { color: PALETTE.green, size: 10 }));
        this.keep(button(this, bx, y + (d.engaged ? 4 : 24), 170, 22, `"Flat out, sorry" (-${f.disengageRapportCost})`, () => this.act(() => g.respond(d.id, 'disengage')), { color: PALETTE.red, size: 10 }));
      } else {
        const verb = d.kind === 'courier' ? 'Sign for it' : 'Answer';
        const busy = d.kind === 'courier' ? CONFIG.distractions.courier.busyMinutes : d.kind === 'bank' ? CONFIG.distractions.bank.busyMinutes : CONFIG.distractions.phone.busyMinutes;
        this.keep(label(this, x, y + 34, `${d.remaining} min before they give up.`, 10, PALETTE.bad));
        if (d.order) {
          this.keep(button(this, bx, y - 2, 170, 22, `Take the order (${busy} min)`, () => this.act(() => g.respond(d.id, 'answer')), { disabled: !g.canAct, color: PALETTE.blue, size: 10 }));
          this.keep(button(this, bx, y + 24, 170, 22, `Turn it down (${busy} min)`, () => this.act(() => g.respond(d.id, 'decline')), { disabled: !g.canAct, color: PALETTE.accentDark, size: 10 }));
        } else {
          this.keep(button(this, bx, y + 4, 170, 24, `${verb} (${busy} min)`, () => this.act(() => g.respond(d.id, d.kind === 'courier' ? 'sign' : 'answer')), { disabled: !g.canAct, color: PALETTE.blue, size: 11 }));
        }
      }
      y += 60;
    }
  }

  private renderEndOfDay() {
    const g = this.game_;
    const ov = this.keep(this.add.graphics());
    ov.fillStyle(0x000000, 0.75).fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    this.keep(this.add.graphics()).fillStyle(PALETTE.panel, 1).fillRect(cx - 220, cy - 130, 440, 260).lineStyle(2, PALETTE.accent, 1).strokeRect(cx - 220, cy - 130, 440, 260);
    this.keep(label(this, cx, cy - 112, "It's 5 o'clock.", 20).setOrigin(0.5, 0));
    const left = g.queued.length + (g.current ? 1 : 0);
    const half = g.current ? `${g.current.name} is half-cut on the bed — knock off now and it's scrap. ` : '';
    this.keep(label(this, cx, cy - 78, `${half}${left} sheet${left === 1 ? '' : 's'} still on the board. Margin today: ${g.today.revenue > 0 ? pct(g.margin) : '—'}.`, 12, g.current ? PALETTE.bad : PALETTE.dim, 400).setOrigin(0.5, 0));
    this.keep(label(this, cx, cy - 36, `Overtime pays you nothing extra and costs ${money(CONFIG.labour.hourlyRate * CONFIG.labour.overtimeMultiplier)}/hr. Anything half-cut at ${CONFIG.clock.overtimeEndHour - 12}pm is scrap.`, 11, PALETTE.dim, 400).setOrigin(0.5, 0));
    this.keep(button(this, cx - 200, cy + 60, 180, 36, 'Knock off', () => { g.knockOff(); this.dirty = true; }, { color: PALETTE.green, size: 14 }));
    this.keep(button(this, cx + 20, cy + 60, 180, 36, `Overtime till ${CONFIG.clock.overtimeEndHour - 12}pm`, () => { g.startOvertime(); this.dirty = true; }, { color: PALETTE.red, size: 13 }));
  }
}
