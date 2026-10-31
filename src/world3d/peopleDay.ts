// People during the day, in the world (speech bubbles and objects, never pop-ups):
// - the part-timer: in two days a week at first, she wanders the floor, does simple chores when she's near them
//   (stacking the finished boards, bagging offcuts), chats in short lines, asks you things. A hidden trust rises when
//   sheets go out on time, the floor stays safe, you answer her and show her things. Past a point she asks to go full
//   time; you say yes; the next morning she brings a cake to smoko and everyone cheers.
// - customers at pickup: they see the finished piece (its after-render) and say so — kindly, even when it's late;
//   some come back the next day with something (a slab, a slice, a card, a kid's drawing, a plant, coffees).
import * as THREE from 'three';
import type { Game } from '../sim/Game.js';
import { designById } from '../designs/index.js';
import type { Design } from '../designs/types.js';
import { PEOPLE } from '../people/config.js';
import { JESS } from '../people/lines/jess.js';
import { GIFT_LINES, PICKUP } from '../people/lines/customers.js';
import { people, type GiftKind, type PeopleState } from '../people/state.js';
import { friendById, pickFriend } from '../people/friends.js';
import { COLS, ROWS, MACHINE_SPOT, objectById, type ObjectId } from '../world/layout.js';
import { findPath, smooth, type P, type Walkable } from '../world/pathfind.js';
import { logEvent, type WorldState } from '../world/state.js';
import { offcutsBagAt } from '../world/state.js';
import { WORLD } from '../world/worldConfig.js';
import { Talk } from '../ui/talk.js';
import { Figure } from './figures.js';
import { measure, type Plan } from '../world/layoutPlan.js';
import { JESS_LAYOUT, type LayoutGripe } from '../people/lines/layout.js';
import type { Sfx } from './sfx.js';

const C = WORLD.cell;
const J = PEOPLE.partTimer;
const cellOf = (x: number, z: number): P => ({ x: Math.floor(x / C), y: Math.floor(z / C) });
const centre = (p: P) => ({ x: (p.x + 0.5) * C, z: (p.y + 0.5) * C });
/** Where she hangs about between jobs (cells). */
const WANDER: P[] = [{ x: 18, y: 31 }, { x: 13, y: 34 }, { x: 16, y: 29 }, { x: 25, y: 40 }, { x: 10, y: 30 }, { x: 18, y: 25 }];
const DOOR_IN: P = { x: 27, y: 31 };
const GIFT_KINDS: GiftKind[] = ['beer', 'slice', 'card', 'drawing', 'plant', 'coffees'];

export interface PeopleDayDeps {
  scene: THREE.Scene;
  g: Game;
  w: WorldState;
  parent: HTMLElement;
  walkable: Walkable;
  project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean };
  player: () => { x: number; z: number };
  sfx: Sfx;
  /** The finished piece's picture (the after-render), for the customer's bubble. */
  thumb: (d: Design) => string | null;
  /** Where the customer's ute is (world), for their bubble. */
  ute: () => THREE.Vector3 | null;
  save: () => void;
  /** The factory as it's laid out now. */
  plan: () => Plan;
}

interface Walker { fig: Figure; x: number; z: number; path: { x: number; z: number }[]; speed: number }

export class PeopleDay {
  readonly talk: Talk;
  /** The part-timer, when she's in (public for tests). */
  jess: Walker | null = null;
  private visitor: (Walker & { leaveAt: number; name: string }) | null = null;
  private cakeMate: (Walker & { leaveAt: number }) | null = null;
  private task: 'stack' | 'offcuts' | 'ask' | 'leave' | null = null;
  private carrying = 0;            // boards she's carrying to the finished pallet
  private nextChat = 0;
  private nextAsk = 0;
  private nextChore = 0;
  private asked: { q: string; a: [string, string] } | null = null;
  private seen = { sheetsOk: -1, replacing: '' as string, fault: false, fire: false, fireStage: '' as string, day: -1, safeDone: -1 };
  private askingLines: string[] = [];
  private lineT = 0;
  private bubbleT = new Map<string, number>();
  private t = 0;
  private nextTempt = 0;

  constructor(private d: PeopleDayDeps) {
    this.talk = new Talk(d.parent, 'day');
  }

  get p(): PeopleState { return people(this.d.w); }
  /** In today? Her two days at first, every day once she's full time. */
  get jessDay() { return this.p.fullTime || (J.days as readonly number[]).includes(this.d.g.day); }

  // ---------- every frame ----------

  update(dt: number, paused: boolean) {
    const g = this.d.g, p = this.p;
    if (paused) dt = 0;
    this.t += dt;
    if (this.seen.day !== g.dayIndex) this.newDay();
    const live = g.phase === 'day';
    const hour = g.minute / 60;
    // she comes in through the roller door at her start, leaves at her finish
    if (live && this.jessDay && !this.jess && hour >= J.startHour && hour < J.endHour && this.task !== 'leave') this.arrive();
    if (this.jess && (hour >= J.endHour || !live) && this.task !== 'leave') {
      if (live) { this.say('jess', pick(JESS.bye, g.minute)); this.task = 'leave'; this.walkTo(this.jess, [DOOR_IN]); }
      else this.removeJess();
    }
    if (this.jess) this.updateJess(dt);
    this.updateVisitor(dt);
    this.updateCake(dt);
    // trust from the day: sheets out on time (while she's in), a safe floor at knock-off
    if (this.jess || this.jessDay) {
      const ok = g.today.sheetsDone - g.today.sheetsLate;
      if (this.seen.sheetsOk >= 0 && ok > this.seen.sheetsOk && this.jess) {
        p.trust += J.trust.onTimeSheet * (ok - this.seen.sheetsOk);
        if (Math.random() < 0.4) this.say('jess', pick(JESS.onTime, g.minute));
      }
      this.seen.sheetsOk = ok;
    }
    if (g.phase === 'endOfDayPrompt' && this.seen.safeDone !== g.dayIndex && this.jessDay) {
      this.seen.safeDone = g.dayIndex;
      if (g.today.firesDuct === 0 && g.today.firesExtractor === 0 && g.today.sheetsScrapped === 0) p.trust += J.trust.safeDay;
    }
    // bubbles follow people, and go after a while
    for (const [who, left] of this.bubbleT) {
      const l = left - dt;
      if (l <= 0) { this.talk.hush(who); this.bubbleT.delete(who); } else this.bubbleT.set(who, l);
    }
    this.place('jess', this.jess?.fig);
    this.place('cust', this.visitor?.fig);
    this.place('mate', this.cakeMate?.fig);
    const ute = this.d.ute();
    if (ute) { const s = this.d.project(ute.clone().add(new THREE.Vector3(0, 1.4, 0))); this.talk.place('ute', s.x, s.y, !s.behind); }
    // the fridge in sight of the router after 2 (the layout): "grab one?" now and then
    if (live && g.layout.beerTemptation > 1 && g.minute >= 14 * 60 && g.fridgeOpen && !g.heldCan && g.minute >= this.nextTempt) {
      const m = objectById('machine').rect, pl = this.d.player();
      if (Math.hypot(pl.x - (m.x + m.w / 2) * C, pl.z - (m.y + m.h / 2) * C) < 4) {
        this.say('you', pick(['Grab one?', 'The fridge is right there…', 'Just the one?'], g.minute), 2.5);
        this.nextTempt = g.minute + Math.round(40 / g.layout.beerTemptation);
      }
    }
    // her question, unanswered, goes if you walk off
    if (this.asked && this.jess && this.dist(this.jess) > 6) { this.talk.hideReplies(); this.asked = null; }
  }

  private newDay() {
    const g = this.d.g;
    this.seen = { ...this.seen, day: g.dayIndex, sheetsOk: g.today.sheetsDone - g.today.sheetsLate };
    this.p.shownToday = [];
    this.removeJess();
    this.task = null;
    this.nextChat = g.minute + 20; this.nextAsk = g.minute + 45; this.nextChore = g.minute + 5;
  }

  // ---------- the part-timer ----------

  private arrive() {
    const f = new Figure({ shirt: J.shirt, hair: 'pony', hairColour: 0x6a3a22, canColour: 0xf4efe0 });
    f.setSeated(false); f.can.visible = false;
    const at = centre(DOOR_IN);
    this.jess = { fig: f, x: at.x, z: at.z, path: [], speed: 1.5 };
    f.root.position.set(at.x, 0, at.z);
    this.d.scene.add(f.root);
    this.say('jess', pick(JESS.hello, this.d.g.dayIndex));
    this.task = null;
  }

  private removeJess() {
    if (this.jess) this.d.scene.remove(this.jess.fig.root);
    this.jess = null; this.carrying = 0;
    this.talk.hush('jess'); this.talk.hideReplies(); this.asked = null; this.askingLines = [];
  }

  private updateJess(dt: number) {
    const g = this.d.g, w = this.d.w, p = this.p, j = this.jess!;
    const arrived = this.step(j, dt);
    if (this.task === 'leave') { if (arrived) this.removeJess(); return; }
    if (g.phase !== 'day') return;
    // the full-time ask: lines one at a time beside you, then your answer
    if (this.task === 'ask') {
      if (this.dist(j) > 1.6 && arrived) this.walkTo(j, this.nearPlayer());
      if (this.dist(j) <= 2.2 && this.askingLines.length) {
        this.lineT -= dt;
        if (this.lineT <= 0) { const l = this.askingLines.shift()!; this.say('jess', l, 3.4, 'thoughtful'); this.lineT = 2.8; }
      } else if (this.dist(j) <= 2.2 && !this.askingLines.length && !this.talk.asking && this.lineT <= 0) {
        this.talk.ask([{ text: 'Yes. Full time. Of course.', cls: 'door' }, { text: "Mate. YES. You're a legend.", cls: 'door' }], () => this.fullTime());
      } else this.lineT -= dt;
      return;
    }
    // finishing a chore
    if (arrived && this.task === 'stack') {
      if (this.carrying === 0) {
        const n = g.bedPile;
        if (n > 0 && g.clearBed(true)) { this.carrying = n; j.fig.armsUp = true; this.walkTo(j, [{ x: 18, y: 29 }, { x: 18, y: 30 }]); }
        else this.task = null;
      } else {
        w.finishedStack += this.carrying; w.utePresent = true; this.carrying = 0; j.fig.armsUp = false;
        this.say('jess', pick(JESS.chores.stack, g.minute)); logEvent(w, `${J.name} stacked the finished boards`);
        this.task = null; this.d.save();
      }
      return;
    }
    if (arrived && this.task === 'offcuts') {
      if (g.offcutPile === 0 && g.emptyOffcutBin(true)) { this.say('jess', pick(JESS.chores.offcuts, g.minute)); logEvent(w, `${J.name} bagged the offcuts`); this.d.save(); }
      this.task = null;
      return;
    }
    if (this.task) return;
    // time to ask?
    if (!p.fullTime && p.trust >= J.askAt && g.minute >= J.askHour * 60) {
      this.talk.hideReplies(); this.asked = null; // this matters more than whatever she asked before
      this.task = 'ask'; this.askingLines = [...JESS.ask]; this.lineT = 0.5;
      this.walkTo(j, this.nearPlayer());
      return;
    }
    // a chore she's near
    if (g.minute >= this.nextChore && g.canAct) {
      const m = this.objCentre('machine'), bin = this.objCentre('offcutBin');
      if (g.bedPile > 0 && w.carrying !== 'cut' && Math.hypot(m.x - j.x, m.z - j.z) < J.choreReach) {
        this.task = 'stack'; this.walkTo(j, [MACHINE_SPOT, { x: 14, y: 28 }, { x: 15, y: 28 }]); this.nextChore = g.minute + J.choreEvery; return;
      }
      if (g.offcutBin >= offcutsBagAt(g) && g.offcutPile === 0 && w.carrying !== 'offcuts' && Math.hypot(bin.x - j.x, bin.z - j.z) < J.choreReach) {
        this.task = 'offcuts'; this.walkTo(j, [{ x: 18, y: 22 }, { x: 18, y: 23 }, { x: 19, y: 24 }]); this.nextChore = g.minute + J.choreEvery; return;
      }
    }
    // things she sees you do: a bit change, a bag, a spoilboard, a fault fixed, a fire out
    this.watch();
    // a question, if you're close
    if (g.minute >= this.nextAsk && this.dist(j) < 3.5 && !this.asked && !this.talk.asking) {
      const q = JESS.questions[(g.dayIndex * 3 + Math.floor(g.minute / 60)) % JESS.questions.length] as { q: string; a: [string, string] };
      this.asked = q; this.nextAsk = g.minute + J.askEvery;
      this.say('jess', q.q, 6, 'thoughtful');
      this.talk.ask([{ text: q.a[0] }, { text: q.a[1] }], i => {
        this.say('you', q.a[i], 3); this.asked = null;
        p.trust += J.trust.answered;
        window.setTimeout(() => this.say('jess', pick(JESS.thanks, this.d.g.minute), 3, 'laughing'), 1200);
      });
      return;
    }
    // a line, if you're about (once she trusts you, now and then it's about the layout: she's usually right)
    if (g.minute >= this.nextChat && this.dist(j) < 4.5) {
      const gripe = p.trust >= J.askAt / 2 && !p.shownToday.includes('layout') ? this.gripe() : null;
      if (gripe) { p.shownToday.push('layout'); this.say('jess', pick(JESS_LAYOUT[gripe], g.dayIndex), 4, 'thoughtful'); }
      else this.say('jess', pick(JESS.chat, g.minute + g.dayIndex));
      this.nextChat = g.minute + J.chatEvery;
    }
    // otherwise wander
    if (arrived && Math.random() < dt * 0.15) this.walkTo(j, [WANDER[Math.floor(Math.random() * WANDER.length)]]);
  }

  /** Things you did near her: shown once each a day, and she says so. */
  private watch() {
    const g = this.d.g, p = this.p, j = this.jess!;
    const near = this.dist(j) < 5;
    const show = (key: string, lines: readonly string[], fire = false) => {
      if (!near || p.shownToday.includes(key)) return;
      p.shownToday.push(key); p.trust += J.trust.showed + (fire ? J.trust.quickFire : 0);
      this.say('jess', pick(lines, g.minute), 3.5, 'animated');
    };
    const rep = g.replacing?.key ?? '';
    if (rep && rep !== this.seen.replacing) show(rep === 'bit' ? 'bit' : rep === 'filter' ? 'filter' : 'spoilboard', rep === 'bit' ? JESS.shown.bit : rep === 'filter' ? JESS.shown.filter : JESS.shown.spoilboard);
    this.seen.replacing = rep;
    if (this.seen.fault && !g.fault) show('fault', JESS.shown.fault);
    this.seen.fault = !!g.fault;
    if (this.seen.fire && !g.fire) { show('fire', JESS.shown.fire, this.seen.fireStage === 'spot'); }
    this.seen.fire = !!g.fire; this.seen.fireStage = g.fire?.stage ?? '';
  }

  /** What's worst about the floor, if anything's bad enough to mention. */
  private gripe(): LayoutGripe | null {
    const m = measure(this.d.plan());
    if (m.sharedCircuit && this.d.g.today.layoutMinutes > 0) return 'circuit';
    if (!m.clearPath) return 'path';
    if (m.fix > 6) return 'fix';
    if (m.load > 6) return 'load';
    if (m.clutter > 4) return 'clutter';
    if (m.pickup > 9) return 'pickup';
    if (m.fire > 22) return 'fire';
    if (m.fridgeInSight && this.d.g.minute >= 14 * 60) return 'fridge';
    return null;
  }

  /** You said yes. Tomorrow: cake. */
  private fullTime() {
    const g = this.d.g, p = this.p;
    p.fullTime = true; p.fullTimeDay = g.dayIndex; p.cakeDay = g.dayIndex + 1;
    this.task = null;
    JESS.yes.forEach((l, i) => window.setTimeout(() => this.say('jess', l, 3, i === 0 ? 'misty' : 'laughing'), i * 2600));
    this.d.sfx.cheer();
    logEvent(this.d.w, `${J.name}'s going full time`);
    this.d.save();
  }

  // ---------- cake day ----------

  private updateCake(dt: number) {
    const g = this.d.g, p = this.p;
    if (p.cakeDay === g.dayIndex && g.phase === 'day' && g.minute >= J.smokoHour * 60 && !p.gifts.some(x => x.kind === 'cake' && x.dayIndex === g.dayIndex)) {
      p.gifts.push({ kind: 'cake', from: J.name, dayIndex: g.dayIndex, slot: 0 });
      // tonight's mate drops in early for it, and everyone cheers
      const id = pickFriend(p.lastFriend, g.dayIndex), f = friendById(id);
      const fig = new Figure({ shirt: f.shirt, hair: id === 'courtney' ? 'bun' : id === 'tim' ? 'beanie' : 'short' });
      fig.setSeated(false); fig.can.visible = false;
      const at = centre({ x: 24, y: 40 });
      this.cakeMate = { fig, x: at.x, z: at.z, path: [], speed: 1.4, leaveAt: g.minute + 40 };
      fig.root.position.set(at.x, 0, at.z); fig.setExpr('laughing');
      this.d.scene.add(fig.root);
      JESS.cake.forEach((l, i) => window.setTimeout(() => this.say('jess', l, 3, 'laughing'), i * 2400));
      const cheers = [...JESS.cheer];
      window.setTimeout(() => { this.d.sfx.cheer(); this.say('mate', cheers[0] ?? 'Speech!', 3.5, 'animated', f.name); }, JESS.cake.length * 2400);
      window.setTimeout(() => this.say('you', cheers[1] ?? 'To the new full-timer!', 3.5), JESS.cake.length * 2400 + 1500);
      window.setTimeout(() => this.say('mate', cheers[2] ?? 'Hooray!', 3, 'laughing', f.name), JESS.cake.length * 2400 + 3200);
      logEvent(this.d.w, `${J.name} brought a cake to smoko`);
      this.d.save();
    }
    if (this.cakeMate) {
      this.cakeMate.fig.update(dt);
      if (g.minute >= this.cakeMate.leaveAt || g.phase !== 'day') { this.d.scene.remove(this.cakeMate.fig.root); this.cakeMate = null; this.talk.hush('mate'); }
    }
  }

  // ---------- customers ----------

  /** The stack's gone into the customer's ute: they see what they got. */
  pickup(n: number) {
    const g = this.d.g, w = this.d.w, p = this.p;
    const made = w.made ?? [];
    const start = w.pickedUp ?? 0;
    const these = made.slice(start, start + n);
    w.pickedUp = Math.min(made.length, start + n);
    const first = these[0];
    if (!first) return;
    const d = designById(first.design);
    if (!d) return;
    const job = g.jobs.find(j => j.id === first.job);
    const late = !!job?.paidLate;
    const pool = !late && d.pickup?.length ? d.pickup : PICKUP[d.kind][late ? 'late' : 'onTime'];
    const line = pool[(g.minute + first.job) % pool.length].replace(/\{name\}/g, d.name.toLowerCase());
    const who = d.customer.replace(/[,(].*$/, '').trim();
    this.say('ute', line, 6, 'relaxed', who, this.d.thumb(d));
    // some come back tomorrow with something
    for (const m of these) {
      const dd = designById(m.design);
      if (!dd || p.pendingGifts.some(x => x.design === dd.id && x.dayIndex === g.dayIndex + 1)) continue;
      const roll = ((m.job * 2654435761) >>> 0) / 4294967296;
      if (!dd.thanks && roll > PEOPLE.gifts.chance) continue;
      const kind = dd.thanks?.kind ?? GIFT_KINDS[Math.floor(roll * 997) % GIFT_KINDS.length];
      const minute = Math.round((PEOPLE.gifts.fromHour + roll * (PEOPLE.gifts.toHour - PEOPLE.gifts.fromHour)) * 60);
      p.pendingGifts.push({ dayIndex: g.dayIndex + 1, design: dd.id, kind, from: dd.customer.replace(/[,(].*$/, '').trim(), minute });
    }
    this.d.save();
  }

  private updateVisitor(dt: number) {
    const g = this.d.g, p = this.p;
    if (!this.visitor && g.phase === 'day') {
      const due = p.pendingGifts.find(x => x.dayIndex <= g.dayIndex && g.minute >= x.minute);
      if (due) {
        p.pendingGifts = p.pendingGifts.filter(x => x !== due);
        const d = designById(due.design);
        // it goes where it goes straight away; they stand at the door a while to say why
        const slot = p.gifts.filter(x => x.kind === due.kind).length;
        p.gifts.push({ kind: due.kind, from: due.from, design: due.design, dayIndex: g.dayIndex, slot });
        if (due.kind === 'beer') p.fridgeGifted += PEOPLE.gifts.slab;
        const fig = new Figure({ shirt: [0x6a8fb0, 0xb06a8f, 0x8fb06a, 0xb08f6a][slot % 4], hair: (['short', 'bun', 'cap', 'pony'] as const)[(slot + due.from.length) % 4] });
        fig.setSeated(false); fig.can.visible = false; fig.setExpr('relaxed');
        const at = centre({ x: 27, y: 32 });
        fig.root.position.set(at.x, 0, at.z); fig.root.rotation.y = Math.PI / 2;
        this.d.scene.add(fig.root);
        this.visitor = { fig, x: at.x, z: at.z, path: [], speed: 1.2, leaveAt: g.minute + PEOPLE.gifts.stayMinutes, name: due.from };
        const line = d?.thanks && d.thanks.kind === due.kind ? d.thanks.line : pick(GIFT_LINES[due.kind], g.minute);
        this.say('cust', line, 7, 'animated', due.from);
        logEvent(this.d.w, `${due.from} dropped round ${({ beer: 'a slab', slice: 'a lemon slice', card: 'a card', drawing: 'a drawing', plant: 'a plant', coffees: 'coffees', cake: 'a cake' } as const)[due.kind]}`);
        this.d.save();
      }
    }
    if (this.visitor) {
      this.visitor.fig.update(dt);
      if (g.minute >= this.visitor.leaveAt || g.phase !== 'day') { this.d.scene.remove(this.visitor.fig.root); this.visitor = null; this.talk.hush('cust'); }
    }
  }

  // ---------- bits ----------

  private say(who: string, text: string, secs = 3.2, expr: 'relaxed' | 'laughing' | 'thoughtful' | 'misty' | 'animated' = 'relaxed', name?: string, img?: string | null) {
    const label = name ?? (who === 'jess' ? J.name : who === 'you' ? 'You' : who === 'mate' ? 'Mate' : '');
    this.talk.say(who, label, text, who === 'you' ? 'you' : '', img);
    this.bubbleT.set(who, secs + text.length * 0.03);
    const f = who === 'jess' ? this.jess?.fig : who === 'cust' ? this.visitor?.fig : who === 'mate' ? this.cakeMate?.fig : undefined;
    if (f) { f.setExpr(expr); f.talking = 1.2; }
  }

  private place(who: string, f: Figure | undefined) {
    if (!f) return;
    const s = this.d.project(f.headWorld(new THREE.Vector3()));
    this.talk.place(who, s.x, s.y, !s.behind);
  }

  private dist(wk: Walker) { const pl = this.d.player(); return Math.hypot(pl.x - wk.x, pl.z - wk.z); }
  private nearPlayer(): P[] { const c = cellOf(this.d.player().x, this.d.player().z); return [{ x: c.x + 2, y: c.y }, { x: c.x - 2, y: c.y }, { x: c.x, y: c.y + 2 }, { x: c.x, y: c.y - 2 }, { x: c.x + 1, y: c.y + 1 }]; }
  private objCentre(id: ObjectId) { const r = objectById(id).rect; return { x: (r.x + r.w / 2) * C, z: (r.y + r.h / 2) * C }; }

  private walkTo(wk: Walker, goals: P[]) {
    const path = findPath(COLS, ROWS, this.d.walkable, cellOf(wk.x, wk.z), goals);
    wk.path = path ? smooth(this.d.walkable, path).slice(1).map(centre) : [];
  }

  /** Walk a step along the path. True once there. */
  private step(wk: Walker, dt: number): boolean {
    wk.fig.update(dt);
    const next = wk.path[0];
    wk.fig.walking = !!next;
    if (!next) return true;
    const dx = next.x - wk.x, dz = next.z - wk.z, l = Math.hypot(dx, dz), s = wk.speed * dt;
    if (l <= s) { wk.x = next.x; wk.z = next.z; wk.path.shift(); }
    else { wk.x += dx / l * s; wk.z += dz / l * s; wk.fig.root.rotation.y = Math.atan2(-dx, -dz); }
    wk.fig.root.position.set(wk.x, 0, wk.z);
    return wk.path.length === 0;
  }

  dispose() {
    this.removeJess();
    if (this.visitor) this.d.scene.remove(this.visitor.fig.root);
    if (this.cakeMate) this.d.scene.remove(this.cakeMate.fig.root);
    this.talk.clear();
  }
}

const pick = <T,>(xs: readonly T[], n: number): T => xs[Math.abs(Math.floor(n)) % xs.length];
