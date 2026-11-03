// Before work: out the side door and down the strip to the cafe (the one whose menu board you cut; CONFIG.cafe). One
// screen — the cafe, a closed op shop, the tram stop, a dog tied up outside, magpies — in morning light. The barista
// knows your order by the third visit. Regular, large (a bit quicker till 11) or shout the sparky at the next table his.
// Then you overhear a thing or two (a job lead that rings at 10, the weather, the landlord with a real estate bloke,
// yesterday's customer, Dennis at the window, the part-timer, a mate looking rough after a group night — and after
// the rare late one, the barista just looks at you). Walking back, the notepad picks up what you heard and the day
// starts. Speech bubbles only. It's 6:45 when you get there; the factory's clock waits till 7 and not a minute more,
// and it's 90 real seconds at most.
import { SETTINGS } from '../settings.js';
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { designById } from '../designs/index.js';
import { CAFE_LINES } from '../people/lines/cafe.js';
import { LEASE_LINES } from '../people/lines/lease.js';
import { friendById } from '../people/friends.js';
import type { FriendId } from '../people/dialogue/types.js';
import { PEOPLE } from '../people/config.js';
import { people } from '../people/state.js';
import { leaseDay, leaseLength, outcome, projectedCash, quietWeek } from '../world/lease.js';
import { logEvent, type WorldState } from '../world/state.js';
import { Talk } from '../ui/talk.js';
import { boxAt, toon } from './build.js';
import { Figure } from './figures.js';
import { friendLook, NAMED, randomLook } from './looks.js';
import { snapToPixels } from './pixelSnap.js';
import type { Sfx } from './sfx.js';

/** The strip, out past the side yard (metres). */
const O = new THREE.Vector3(-14, 0, 8);
/** The sparrows: how many, how often they peck and hop (s), how far off you they go (m). Cosmetic: Math.random is fine. */
const SPARROWS = { count: 3, peckEvery: [1, 2] as const, peckSeconds: 0.25, hopEvery: [4, 8] as const, hopSeconds: 0.3, hopHeight: 0.1, apart: 1.5, fleeWithin: 1.5, fleeSeconds: 1.4 };
interface Sparrow {
  root: THREE.Group; head: THREE.Group; home: THREE.Vector3;
  state: 'peck' | 'hop' | 'flee' | 'gone';
  nextHop: number; nextPeck: number; peckLeft: number; hopT: number; fleeT: number;
  from: THREE.Vector3; to: THREE.Vector3;
}
const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(Math.floor(n)) % xs.length];

export interface CafeDeps {
  scene: THREE.Scene;
  g: Game;
  w: WorldState;
  parent: HTMLElement;
  project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean };
  setHud: (on: boolean) => void;
  sfx: Sfx;
  /** Is the part-timer in today? */
  jessIn: () => boolean;
  /** Back in the shed: stand just inside the side door. */
  arrive: () => void;
  /** The first morning's intro is over (walked over, or skipped): the shed's day 1 starts (the tour, the landlord's letter). */
  introDone?: () => void;
  save: () => void;
}

type Heard = { who: string; name: string; text: string; note?: string; apply?: () => void };

export class Cafe {
  active = false;
  /** 6:45 → the cafe's own minute (the factory's clock waits till this passes 7:00). */
  minute = 0;
  private t = 0;
  private set = new THREE.Group();
  private figs = new Map<string, Figure>();
  private queue: Heard[] = [];
  private lineLeft = 0;
  private heard: Heard[] = [];
  private ordered = false;
  readonly talk: Talk;
  private chip: HTMLButtonElement | null = null;
  private offeredDay = -1;
  private shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  /**
   * What the shot has to hold (metres, from O): the footpath to the cornice (the name's up on the upper façade) and
   * everyone from the regular by the window to the mate at the far table. It's fitted to the camera's field of view
   * and aspect every frame, so a portrait phone and a landscape desktop both see the sign and all of them.
   */
  private static readonly FRAME = { left: -1.5, right: 3.8, bottom: -0.5, top: 6.1, z: -0.6, margin: 0.45 }; // (bottom: the sparrows on the front of the footpath)
  private static readonly SHOT_DIR = new THREE.Vector3(0.3, 1.2, 10.5).normalize();
  /** Sparrows on the footpath (cosmetic): pecking, an occasional hop, off when you come near. */
  private sparrows: Sparrow[] = [];
  private weight = 0;
  private birdsHopAt = 0; // the last hop (so two never hop together)
  /** The cafe's name, crisp: DOM lettering over the sign board (a 3D texture is a few pixels at the render resolution). */
  private signEl: HTMLDivElement;
  private signAt = new THREE.Vector3();
  /** The first morning: three beats, then walk over to the shed (no order, nothing overheard). */
  private introMode = false;
  private skipChip: HTMLButtonElement | null = null;
  /** Intro lines wait for a tap: a moment before the first, then `introAdvance` (Next, or a tap anywhere) brings each one. */
  private introWait = 0;
  private introAdvance = false;
  private nextBtn: HTMLButtonElement | null = null;

  constructor(private d: CafeDeps) {
    this.talk = new Talk(d.parent, 'day');
    this.signEl = document.createElement('div');
    this.signEl.className = 'sign cafesign';
    this.signEl.textContent = CONFIG.cafe.name.toUpperCase();
    this.signEl.style.display = 'none';
    d.parent.appendChild(this.signEl);
    this.build();
    this.set.visible = false;
    d.scene.add(this.set);
  }

  /** The factory's clock waits while you're here, until the cafe's clock passes 7. */
  get holdsClock() { return this.active && this.minute < CONFIG.clock.startHour * 60; }

  // ---------- the offer (a chip under the clock, first thing) ----------

  offer() {
    const g = this.d.g;
    const open = g.phase === 'day' && !this.active && g.dayIndex > 1 && g.minute <= CONFIG.clock.startHour * 60 + 2 && !g.current && this.offeredDay !== g.dayIndex;
    if (open && !this.chip) {
      const b = this.chip = document.createElement('button');
      b.className = 'cafechip'; b.textContent = `☕ ${CONFIG.cafe.name} first?`;
      Object.assign(b.style, { position: 'absolute', right: 'calc(10px + env(safe-area-inset-right, 0px))', top: 'calc(160px + env(safe-area-inset-top, 0px))', zIndex: '6',
        font: "14px 'Courier New', monospace", padding: '6px 10px', background: '#f4e2c4', color: '#14110f', border: '2px solid #14110f', borderRadius: '12px', pointerEvents: 'auto' });
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this.enter(); });
      this.d.parent.appendChild(b);
    } else if (!open && this.chip) { this.chip.remove(); this.chip = null; }
  }

  // ---------- the first morning (before day 1) ----------

  /**
   * Before day 1: you start at the cafe across the road. Mai, then three beats — the mate on the landlord's rent, the
   * sparky on the shed's fires, a regular who'll send work your way — then walk over and the tour starts. `skippable`:
   * you've seen it before (another run): a chip to skip it.
   */
  intro(skippable: boolean) {
    const g = this.d.g, w = this.d.w, L = CAFE_LINES.intro;
    this.offeredDay = g.dayIndex;
    this.active = true; this.introMode = true; this.ordered = true; this.t = 0; this.heard = [];
    this.minute = CONFIG.clock.startHour * 60 - 15;
    this.d.setHud(false);
    this.set.visible = true;
    for (const f of this.figs.values()) this.set.remove(f.root);
    this.figs.clear();
    this.fig('mai', NAMED.mai, new THREE.Vector3(-0.4, 0, -1.0), false);
    this.fig('sparky', NAMED.sparky, new THREE.Vector3(2.6, 0, 0.4), true);
    const mate = friendById('eggby');
    this.fig('mate', friendLook('eggby'), new THREE.Vector3(3.05, 0, 0.6), true);
    const reg = this.fig('regular', NAMED.regular, new THREE.Vector3(-0.95, 0, -0.2), false);
    reg.setExpr('animated');
    const you = this.fig('you', NAMED.you, new THREE.Vector3(0.9, 0, -0.2), false);
    you.root.rotation.y = -0.35;
    const f = { ...this.facts(), rent: `$${CONFIG.lease.rentDue.toLocaleString('en-AU')}`, due: String(CONFIG.lease.dueDay) };
    this.queue = [
      { who: 'mai', name: CONFIG.cafe.barista, text: this.fill(L.mai, f) },
      { who: 'mate', name: mate.name, text: this.fill(L.rent, f), note: `${mate.name}: the rent's ${f.rent} in ${f.due} days` },
      { who: 'sparky', name: 'The sparky', text: this.fill(L.fires, f), note: "The sparky: the shed's had fires. Keep the bag empty" },
      { who: 'regular', name: 'A regular', text: this.fill(L.work, f), note: "A regular'll send work your way" },
      { who: 'you', name: 'You', text: L.youWalk },
    ];
    this.heard = this.queue.filter(h => h.note);
    this.introWait = 0.8; this.introAdvance = false;
    this.talk.onTap = () => { if (this.introWait <= 0) this.introAdvance = true; }; // tap anywhere advances
    // a wider shot than a usual morning: five of them in it
    this.resetBirds();
    this.d.sfx.unlock();
    if (skippable) {
      const b = this.skipChip = document.createElement('button');
      b.className = 'cafechip skip'; b.textContent = 'Skip intro ›';
      Object.assign(b.style, { position: 'absolute', right: 'calc(10px + env(safe-area-inset-right, 0px))', top: 'calc(20px + env(safe-area-inset-top, 0px))', zIndex: '8',
        font: "14px 'Courier New', monospace", padding: '6px 10px', background: '#f4e2c4', color: '#14110f', border: '2px solid #14110f', borderRadius: '12px', pointerEvents: 'auto' });
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); this.leave(); });
      this.d.parent.appendChild(b);
    }
    logEvent(w, `First morning at ${CONFIG.cafe.name}`);
  }

  // ---------- the visit ----------

  enter() {
    const g = this.d.g, w = this.d.w, p = people(w);
    this.offeredDay = g.dayIndex;
    this.chip?.remove(); this.chip = null;
    this.active = true; this.ordered = false; this.t = 0; this.heard = [];
    this.minute = CONFIG.clock.startHour * 60 - 15;
    this.d.setHud(false);
    this.set.visible = true;
    for (const f of this.figs.values()) this.set.remove(f.root);
    this.figs.clear();
    // who's here: the barista and the sparky always; the rest if today's like that
    this.fig('mai', NAMED.mai, new THREE.Vector3(-0.4, 0, -1.0), false); // at the counter window
    this.fig('sparky', NAMED.sparky, new THREE.Vector3(2.6, 0, 0.4), true);
    const you = this.fig('you', NAMED.you, new THREE.Vector3(0.9, 0, -0.2), false);
    you.root.rotation.y = -0.35; // a bit toward the window
    const visits = (w.cafeVisits = (w.cafeVisits ?? 0) + 1);
    const ln = p.lastNight, lastNight = ln && ln.dayIndex === g.dayIndex - 1 ? ln : null;
    const f = this.facts();
    const q: Heard[] = [];
    // Mai: the long look after the rare late one; the usual from the third visit; day 20, are you staying on
    const mn = CONFIG.cafe.barista;
    const lease = w.lease;
    if (lease && leaseDay(lease, g) === leaseLength()) q.push({ who: 'mai', name: mn, text: this.fill(pick(CAFE_LINES.mai.stayingOn[outcome(projectedCash(g), lease.rentDue)], g.dayIndex), f) });
    else if (lastNight?.lsg) q.push({ who: 'mai', name: mn, text: pick(CAFE_LINES.mai.lsgLook, g.dayIndex) });
    else q.push({ who: 'mai', name: mn, text: this.fill(pick(visits >= 3 ? CAFE_LINES.mai.usual : CAFE_LINES.mai.hello, g.dayIndex), f) });
    this.queue = q;
    // what's going to be overheard after you order
    this.heard = this.overheard(lastNight);
    this.lineLeft = 0.8;
    this.talk.onTap = () => { this.lineLeft = Math.min(this.lineLeft, 0.05); };
    // the shot: wide enough for the upstairs, so the name on the upper façade is in it (above the bubbles)
    this.resetBirds();
    this.d.sfx.unlock();
    logEvent(w, `Coffee at ${CONFIG.cafe.name}`);
  }

  /** One or two things overheard, by what's true today; rotating. */
  private overheard(lastNight: ReturnType<typeof people>['lastNight']): Heard[] {
    const g = this.d.g, w = this.d.w, p = people(w), f = this.facts(), day = g.dayIndex, L = CAFE_LINES;
    const out: Heard[] = [];
    if (lastNight?.lsg) return out; // the look is the line
    // the morning after a group night: a mate here looking rough, then the bit about the big idea
    if (lastNight?.group) {
      const id = lastNight.who.find(x => x !== 'dennis') ?? lastNight.who[0];
      const m = this.fig('mate', friendLook(id), new THREE.Vector3(3.6, 0, 0.6), true);
      m.setExpr('misty');
      out.push({ who: 'mate', name: friendById(id).name, text: this.fill(pick(L.rough[id as FriendId], day), f) });
      if (p.lastIdea?.dayIndex === day - 1) out.push({ who: 'mate', name: friendById(id).name, text: this.fill(pick(L.menu, day), f) });
    }
    // the part-timer on her days: she walks back with you
    if (this.d.jessIn() && out.length < 2) {
      this.fig('jess', NAMED.jess, new THREE.Vector3(-0.4, 0, 0.6), false);
      out.push({ who: 'jess', name: PEOPLE.partTimer.name, text: this.fill(pick(L.jess.arrive, day), f), note: `Walked in with ${PEOPLE.partTimer.name}`,
        apply: () => { p.trust += 1; } });
    }
    // Dennis at the window with a laptop: he'll ring at ten
    if (g.dennis.call && out.length < 2) {
      this.fig('dennis', NAMED.dennis, new THREE.Vector3(-1.6, 0, -0.6), true);
      out.push({ who: 'dennis', name: CONFIG.dennis.name, text: this.fill(pick(L.dennis, day), f), note: `${CONFIG.dennis.name}'s ringing at 10`,
        apply: () => { if (g.dennis.call) g.dennis.call.minute = CONFIG.cafe.leadHour * 60; } });
    }
    // a quiet week: Mai says it's dead, the radio's on about the long weekend
    if (quietWeek(w.lease, g)) {
      if (out.length < 2) out.push({ who: 'mai', name: CONFIG.cafe.barista, text: this.fill(pick(L.quiet.mai, day), f) });
      if (out.length < 2) out.push({ who: 'radio', name: '📻 Radio', text: this.fill(pick(L.quiet.radio, day), f) });
    }
    if (out.length >= 2) return out;
    // one more, rotating: a lead, the weather, the landlord, yesterday's customer
    const lease = w.lease;
    const rumour = lease && !lease.wobble.fired && lease.wobble.dayIndex - day >= 0 && lease.wobble.dayIndex - day <= 2;
    const customer = p.pendingGifts.find(x => x.dayIndex === day);
    const kinds = rumour ? ['landlord'] : customer && day % 2 ? ['customer'] : ['lead', 'weather', 'lead', 'customer', 'weather'];
    const kind = kinds[day % kinds.length];
    if (kind === 'landlord') out.push({ who: 'mai', name: CONFIG.cafe.barista, text: this.fill(pick(L.landlord, day), f), note: 'Mai saw the landlord with a real estate bloke' });
    else if (kind === 'customer' && customer) {
      const c = this.fig('customer', randomLook(customer.from), new THREE.Vector3(-0.6, 0, -0.4), false);
      c.setExpr('animated');
      const piece = designById(customer.design)?.name.toLowerCase() ?? 'sign';
      out.push({ who: 'customer', name: customer.from, text: this.fill(pick(L.customer, day), { ...f, name: customer.from, piece }) });
    } else if (kind === 'lead' || kind === 'customer') {
      const lead = pick(L.leads, day + g.seed);
      out.push({ who: 'mai', name: CONFIG.cafe.barista, text: this.fill(pick(L.lead, day), { ...f, business: lead.business, want: lead.want }),
        note: `Lead: ${lead.business} wants ${lead.want} (rings at 10)`, apply: () => g.leadCall(CONFIG.cafe.leadHour * 60, 1 + (day % 2)) });
    } else out.push({ who: 'radio', name: '📻 Radio', text: this.fill(pick(L.weather, day), f) });
    return out;
  }

  private facts(): Record<string, string> {
    const p = people(this.d.w), ln = p.lastIdea;
    return { cafe: CONFIG.cafe.name, mai: CONFIG.cafe.barista, jess: PEOPLE.partTimer.name, landlord: LEASE_LINES.landlord,
      idea: ln ? ({ restaurant: 'the restaurant', foodTruck: 'the food truck', podcast: 'the podcast', boat: 'the boat', brewery: 'the brewery', castlemaine: 'Castlemaine' } as Record<string, string>)[ln.id] : 'the restaurant',
      mate: p.lastFriend ? friendById(p.lastFriend).name : 'Eggby', name: 'someone', piece: 'sign', business: 'the florist next door', want: 'a sign', forecast: 'fine' };
  }
  private fill(t: string, f: Record<string, string>) { return t.replace(/\{(\w+)\}/g, (m, k) => f[k] ?? m); }

  private fig(id: string, look: ConstructorParameters<typeof Figure>[0], at: THREE.Vector3, seated: boolean) {
    const f = new Figure(look);
    f.setSeated(seated);
    f.root.position.copy(O).add(at);
    f.root.rotation.y = 0;
    if (id !== 'you' && id !== 'mai') f.can.visible = false;
    f.can.scale.setScalar(0.8);
    this.set.add(f.root);
    this.figs.set(id, f);
    return f;
  }

  /** Your order: what it costs (real money, in the summary) and what it does. */
  private order(kind: 'regular' | 'large' | 'shout') {
    const g = this.d.g, L = CAFE_LINES;
    g.buyCoffee(kind);
    this.ordered = true;
    this.queue.push({ who: 'you', name: 'You', text: kind === 'regular' ? 'Regular, ta.' : kind === 'large' ? 'Large, please.' : `And one for the sparky.` });
    this.queue.push({ who: 'mai', name: CONFIG.cafe.barista, text: this.fill(pick(kind === 'regular' ? L.mai.regular : kind === 'large' ? L.mai.large : L.mai.shout, g.dayIndex), this.facts()) });
    if (kind === 'shout') this.queue.push({ who: 'sparky', name: 'The sparky', text: pick(L.sparky.thanks, g.dayIndex) });
    this.queue.push(...this.heard);
    this.d.save();
  }

  /** Walk back: what you heard goes on the notepad, and the day's on. */
  leave() {
    if (!this.active) return;
    const g = this.d.g, w = this.d.w;
    for (const h of this.heard) { h.apply?.(); if (h.note) logEvent(w, h.note); }
    const j = this.heard.find(h => h.who === 'jess');
    if (j) logEvent(w, `${PEOPLE.partTimer.name}: "${pick(CAFE_LINES.jess.walk, g.dayIndex)}"`);
    const wasIntro = this.introMode;
    this.introMode = false;
    this.skipChip?.remove(); this.skipChip = null; this.showNext(false);
    if (wasIntro) { w.introDone = true; try { localStorage.setItem('kir-intro-seen', '1'); } catch { /* fine */ } }
    this.active = false;
    this.talk.clear();
    this.signEl.style.display = 'none';
    this.set.visible = false;
    this.d.setHud(true);
    this.d.arrive();
    this.d.save();
    if (wasIntro) this.d.introDone?.();
  }

  update(dt: number, paused: boolean) {
    if (!this.active) return;
    if (paused) dt = 0;
    this.t += dt;
    this.minute += dt * 1000 / CONFIG.clock.realMsPerGameMinute;
    for (const [id, f] of this.figs) {
      f.update(dt);
      const s = this.d.project(f.headWorld(new THREE.Vector3()));
      this.talk.place(id, s.x, s.y, !s.behind);
    }
    const sp = this.d.project(this.signAt);
    this.signEl.style.display = sp.behind ? 'none' : 'block';
    this.signEl.style.left = `${Math.round(sp.x)}px`; this.signEl.style.top = `${Math.round(sp.y)}px`;
    const r = this.d.project(this.set.position.clone().add(O).add(new THREE.Vector3(3.2, 2.6, -1.2)));
    this.talk.place('radio', r.x, r.y, !r.behind);
    // the dog's tail, the magpies
    const dog = this.set.getObjectByName('tail'); if (dog) dog.rotation.y = Math.sin(this.t * 9) * 0.6;
    this.updateSparrows(dt);
    if (this.introMode) { this.updateIntro(dt); return; }
    if (this.t >= CONFIG.cafe.maxSeconds) { this.leave(); return; }
    if (this.talk.asking) return;
    this.lineLeft -= dt;
    if (this.lineLeft > 0) return;
    const l = this.queue.shift();
    if (l) {
      this.talk.say(l.who, l.name, l.text, l.who === 'you' ? 'you' : l.who === 'radio' ? 'phone' : '');
      const f = this.figs.get(l.who); if (f) f.talking = 1.2;
      this.lineLeft = Math.min(4.5, Math.max(1.6, 0.9 + l.text.length * 0.045));
      return;
    }
    if (!this.ordered) {
      this.talk.ask([{ text: 'Regular' }, { text: 'Large' }, { text: 'Shout the sparky', cls: 'call' }], i => this.order((['regular', 'large', 'shout'] as const)[i]));
      return;
    }
    this.talk.ask([{ text: this.introMode ? 'Walk over to the shed' : 'Walk back', cls: 'door' }], () => this.leave());
  }

  /**
   * The first morning's lines: no auto-advance. The first comes up after a moment; each next one when you tap "Next"
   * (bottom-right) or anywhere; the last comes with "Walk over to the shed" in place of Next. No time limit.
   */
  private updateIntro(dt: number) {
    if (this.talk.asking) return;
    if (this.introWait > 0) { this.introWait -= dt; if (this.introWait > 0) return; this.introAdvance = true; }
    if (!this.introAdvance) return;
    this.introAdvance = false;
    const l = this.queue.shift();
    if (!l) return;
    for (const id of this.figs.keys()) if (id !== l.who) this.talk.hush(id); // one voice at a time: five of them, one screen
    this.talk.say(l.who, l.name, l.text, l.who === 'you' ? 'you' : '');
    const f = this.figs.get(l.who); if (f) f.talking = 1.2;
    if (this.queue.length) this.showNext(true);
    else { this.showNext(false); this.talk.ask([{ text: 'Walk over to the shed', cls: 'door' }], () => this.leave()); }
  }

  /** The "Next ›" button, bottom-right of the dialogue area. */
  private showNext(on: boolean) {
    if (!on) { this.nextBtn?.remove(); this.nextBtn = null; return; }
    if (this.nextBtn) return;
    const b = this.nextBtn = document.createElement('button');
    b.className = 'cafenext'; b.textContent = 'Next ›';
    Object.assign(b.style, { position: 'absolute', right: 'calc(14px + env(safe-area-inset-right, 0px))', bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))', zIndex: '8',
      font: "bold 18px 'Courier New', monospace", padding: '12px 20px', background: '#8fd37a', color: '#14110f', border: '3px solid #14110f', borderRadius: '14px', boxShadow: '0 4px 0 #14110f', pointerEvents: 'auto' });
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.introAdvance = true; });
    this.d.parent.appendChild(b);
  }

  /** The shot that holds FRAME at this camera's field of view and aspect (portrait: the width decides; landscape: the height). */
  private fitShot(camera: THREE.PerspectiveCamera) {
    const F = Cafe.FRAME, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
    const halfH = (F.top - F.bottom) / 2 + F.margin, halfW = (F.right - F.left) / 2 + F.margin;
    const d = Math.max(halfH / tanV, halfW / tanH);
    this.shot.look.copy(O).add(new THREE.Vector3((F.left + F.right) / 2, (F.top + F.bottom) / 2, F.z));
    this.shot.pos.copy(this.shot.look).addScaledVector(Cafe.SHOT_DIR, d);
  }

  applyCamera(camera: THREE.PerspectiveCamera, dt: number) {
    if (this.active) this.fitShot(camera);
    this.weight += ((this.active ? 1 : 0) - this.weight) * Math.min(1, dt * 4);
    if (this.weight < 0.002) return;
    const e = this.weight >= 0.98 ? 1 : this.weight * this.weight * (3 - 2 * this.weight);
    camera.position.lerp(this.shot.pos, e);
    const look = new THREE.Vector3(); camera.getWorldDirection(look).add(camera.position);
    camera.lookAt(look.lerp(this.shot.look, e));
  }

  /** The strip: cafe, closed op shop, tram stop, a dog tied up, magpies. */
  private build() {
    const g = this.set;
    const at = (x: number, z: number) => new THREE.Vector3(O.x + x, 0, O.z + z);
    const road = boxAt(16, 0.02, 4, toon(0x3a3a3e), 0, 0, 0); road.position.copy(at(0, 3.2)); g.add(road);
    const path = boxAt(16, 0.06, 2.6, toon(0xb8b2a6), 0, 0, 0); path.position.copy(at(0, 0)); g.add(path);
    // the cafe: shopfront, window, a striped awning, its name
    const cafe = new THREE.Group();
    cafe.add(boxAt(4.2, 3, 0.4, toon(0x2e5e4e), 0, 0, 0), boxAt(2.4, 1.3, 0.05, toon(0xf6e2a8, true, { emissive: 0x6a5020 }), -0.4, 0.8, 0.22), boxAt(0.9, 2, 0.05, toon(0x5a3a28), 1.4, 0, 0.22));
    for (let i = 0; i < 6; i++) cafe.add(boxAt(0.7, 0.06, 1.1, toon(i % 2 ? 0xf4efe0 : 0xd9643a), -1.75 + i * 0.7, 2.3, 0.7));
    // two storeys: the flat upstairs, brick, two sash windows, a cornice. The name's up there, on the upper façade under
    // the cornice — in the sky of a portrait shot, clear of the speech bubbles over the regulars' heads
    cafe.add(boxAt(4.2, 2.9, 0.36, toon(0xa85a40), 0, 3, -0.02));                          // upstairs, brick
    for (const wx of [-1.15, 1.15]) {
      cafe.add(boxAt(0.9, 1.25, 0.05, toon(0xe9dcc0), wx, 3.35, 0.17));                     // sash frame
      cafe.add(boxAt(0.74, 1.09, 0.05, toon(0x3a4a5a, true, { emissive: 0x1a2430 }), wx, 3.43, 0.19)); // the glass
      cafe.add(boxAt(0.74, 0.05, 0.06, toon(0xe9dcc0), wx, 3.95, 0.2));                     // the meeting rail
    }
    cafe.add(boxAt(4.4, 0.16, 0.5, toon(0xe9dcc0), 0, 5.9, 0));                              // cornice
    cafe.add(boxAt(4.2, 0.08, 0.42, toon(0xe9dcc0), 0, 2.98, 0));                            // string course between the floors
    // the sign board; its name is DOM lettering laid over it (signEl), crisp at any render resolution
    cafe.add(boxAt(2.6, 0.55, 0.05, toon(0x1f3f34), 0, 5.12, 0.18));
    cafe.position.copy(at(0.4, -1.6)); g.add(cafe);
    this.signAt.copy(cafe.position).add(new THREE.Vector3(0, 5.4, 0.22));
    // a chalkboard A-frame by the door: squiggles, nothing to read
    const board = new THREE.Group();
    for (const sz of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.add(boxAt(0.46, 0.62, 0.03, toon(0x6a4a30), 0, 0, 0), boxAt(0.38, 0.5, 0.01, toon(0x2a2e2c), 0, 0.06, sz * 0.02));
      for (let k = 0; k < 3; k++) leaf.add(boxAt(0.24 - k * 0.05, 0.02, 0.01, toon(0xe9e6dc), -0.03 + k * 0.02, 0.42 - k * 0.11, sz * 0.03));
      leaf.rotation.x = sz * 0.22; leaf.position.z = sz * 0.07;
      board.add(leaf);
    }
    board.position.copy(at(2.05, -0.75)); board.rotation.y = -0.4; g.add(board);
    // the op shop next door, shut
    const op = new THREE.Group();
    op.add(boxAt(3.4, 3, 0.4, toon(0x8a6a5a), 0, 0, 0), boxAt(2.8, 1.8, 0.05, toon(0x9aa0a6), 0, 0.3, 0.22));
    for (let i = 0; i < 7; i++) op.add(boxAt(2.8, 0.03, 0.06, toon(0x6a6f74), 0, 0.4 + i * 0.25, 0.25)); // the roller shutter's ribs
    const closed = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: signTex('CLOSED', '#c0281e'), transparent: true }));
    closed.position.set(0, 2.3, 0.23); op.add(closed);
    op.position.copy(at(4.6, -1.6)); g.add(op);
    // tables out front
    for (const x of [2.6, 3.6]) { const t = new THREE.Group(); t.add(boxAt(0.6, 0.7, 0.6, toon(0x6a4a3a), 0, 0, 0)); t.position.copy(at(x, -0.3)); g.add(t); }
    // the tram stop: a pole and its sign, and the tracks
    const stop = new THREE.Group();
    stop.add(boxAt(0.08, 2.4, 0.08, toon(0x2f8f6f), 0, 0, 0), boxAt(0.5, 0.35, 0.05, toon(0x2f8f6f), 0.2, 2.1, 0));
    stop.position.copy(at(-4.2, 1.1)); g.add(stop);
    for (const z of [2.6, 3.8]) { const rail = boxAt(16, 0.03, 0.08, toon(0x9aa0a6), 0, 0.02, 0); rail.position.copy(at(0, z)); g.add(rail); }
    // a dog tied up outside, tail going
    const dog = new THREE.Group();
    dog.add(boxAt(0.5, 0.25, 0.22, toon(0xb08a58), 0, 0.2, 0), boxAt(0.2, 0.2, 0.2, toon(0xb08a58), 0.3, 0.38, 0));
    for (const [x, z] of [[-0.18, -0.08], [-0.18, 0.08], [0.18, -0.08], [0.18, 0.08]]) dog.add(boxAt(0.06, 0.2, 0.06, toon(0x8a6a40), x, 0, z));
    const tail = boxAt(0.2, 0.05, 0.05, toon(0x8a6a40), -0.3, 0.38, 0); tail.name = 'tail'; dog.add(tail);
    dog.position.copy(at(-1.9, -0.7)); g.add(dog);
    // sparrows on the footpath: grey-brown, a lighter belly, a beak and a tail; they peck, now and then hop, and
    // they're off when you come near (updateSparrows)
    for (let i = 0; i < SPARROWS.count; i++) {
      const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
      body.add(boxAt(0.3, 0.16, 0.18, toon(0x8a745c), 0, 0.06, 0));            // back and wings
      body.add(boxAt(0.22, 0.08, 0.16, toon(0xd2c4a8), 0.02, 0.04, 0));          // the lighter belly, under
      body.add(boxAt(0.14, 0.04, 0.1, toon(0x5a4a3a), -0.2, 0.15, 0));           // tail, cocked up behind
      for (const z of [-0.05, 0.05]) body.add(boxAt(0.02, 0.06, 0.02, toon(0xb08a5a), 0.02, 0, z)); // legs
      head.add(boxAt(0.12, 0.12, 0.12, toon(0x6a5644), 0, 0, 0), boxAt(0.07, 0.04, 0.04, toon(0xd9a23a), 0.09, 0.03, 0)); // head, beak
      head.add(boxAt(0.02, 0.025, 0.13, toon(0x14110f), 0.04, 0.06, 0));         // the eyes
      head.position.set(0.15, 0.17, 0);
      body.add(head);
      root.add(body);
      g.add(root);
      snapToPixels(root); // on whole render pixels, like the people
      this.sparrows.push({ root, head, home: at(-1.3 + i * 0.8, 0.55 + (i % 2) * 0.25), state: 'peck', nextHop: 0, nextPeck: 0, peckLeft: 0, hopT: 0, fleeT: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
  }

  /** A new scene: the sparrows back on the footpath, each on its own clock (staggered, so they never hop together). */
  private resetBirds() {
    this.birdsHopAt = 0;
    this.sparrows.forEach((b, i) => {
      b.state = 'peck'; b.root.visible = true; b.root.position.copy(b.home); b.root.rotation.set(0, (i % 2 ? 1 : -1) * 0.8 + i, 0);
      b.nextHop = 3 + i * 2.3 + Math.random() * 2; b.nextPeck = Math.random() * 1.5; b.peckLeft = 0;
    });
  }

  /**
   * Mostly pecking in place (a held head-dip every 1–2 s, no bob); a small hop to a new spot every 4–8 s each, never two
   * at once, and none while anyone's speaking. Within reach of you: off they go, up and out of shot, not back this scene.
   */
  private updateSparrows(dt: number) {
    const speaking = this.talk.speaking;
    const youFig = this.figs.get('you'), you = youFig?.walking ? youFig.root.position : null; // they go when you walk up, not when they hop near you
    for (const b of this.sparrows) {
      if (b.state === 'gone') continue;
      if (b.state === 'flee') {
        b.fleeT += dt;
        const k = Math.min(1, b.fleeT / SPARROWS.fleeSeconds);
        b.root.position.lerpVectors(b.from, b.to, k);
        if (k >= 1) { b.state = 'gone'; b.root.visible = false; }
        continue;
      }
      if (you && Math.hypot(b.root.position.x - you.x, b.root.position.z - you.z) < SPARROWS.fleeWithin) {
        b.state = 'flee'; b.fleeT = 0; b.head.rotation.z = 0; b.from.copy(b.root.position);
        b.to.copy(b.root.position).add(new THREE.Vector3(b.root.position.x < you.x ? -6 : 6, 6, -3));
        continue;
      }
      if (b.state === 'hop') {
        b.hopT += dt;
        const k = Math.min(1, b.hopT / SPARROWS.hopSeconds);
        b.root.position.lerpVectors(b.from, b.to, k);
        b.root.position.y = Math.sin(k * Math.PI) * SPARROWS.hopHeight;
        if (k >= 1) { b.state = 'peck'; b.root.position.y = 0; b.nextHop = this.t + SPARROWS.hopEvery[0] + Math.random() * (SPARROWS.hopEvery[1] - SPARROWS.hopEvery[0]); }
        continue;
      }
      // pecking: the head's either up or down (held, not tweened)
      if (b.peckLeft > 0) { b.peckLeft -= dt; b.head.rotation.z = -0.9; }
      else {
        b.head.rotation.z = 0;
        b.nextPeck -= dt;
        if (b.nextPeck <= 0) { b.peckLeft = SPARROWS.peckSeconds; b.nextPeck = SPARROWS.peckEvery[0] + Math.random() * (SPARROWS.peckEvery[1] - SPARROWS.peckEvery[0]); }
      }
      // a hop: due, nobody talking, and no other bird just hopped
      if (!speaking && !SETTINGS.reduceMotion && this.t >= b.nextHop) {
        if (this.t - this.birdsHopAt < SPARROWS.apart) { b.nextHop = this.birdsHopAt + SPARROWS.apart + 0.2; continue; }
        const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.35;
        b.from.copy(b.root.position);
        b.to.copy(b.home).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.5));
        b.root.rotation.y = Math.atan2(-(b.to.z - b.from.z), b.to.x - b.from.x);
        b.state = 'hop'; b.hopT = 0; b.peckLeft = 0; this.birdsHopAt = this.t;
      }
    }
  }

  dispose() { this.talk.clear(); this.chip?.remove(); this.skipChip?.remove(); this.nextBtn?.remove(); this.signEl.remove(); this.d.scene.remove(this.set); }
}

function signTex(text: string, colour = '#f4efe0') {
  const c = document.createElement('canvas'); c.width = 96; c.height = 20;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, 96, 20);
  x.fillStyle = colour; x.font = 'bold 14px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 48, 11);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
