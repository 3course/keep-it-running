// Before work: out the side door and down the strip to the cafe (the one whose menu board you cut; CONFIG.cafe). One
// screen — the cafe, a closed op shop, the tram stop, a dog tied up outside, magpies — in morning light. The barista
// knows your order by the third visit. Regular, large (a bit quicker till 11) or shout the sparky at the next table his.
// Then you overhear a thing or two (a job lead that rings at 10, the weather, the landlord with a real estate bloke,
// yesterday's customer, Dennis at the window, the part-timer, a mate looking rough after a group night — and after
// the rare late one, the barista just looks at you). Walking back, the notepad picks up what you heard and the day
// starts. Speech bubbles only. It's 6:45 when you get there; the factory's clock waits till 7 and not a minute more,
// and it's 90 real seconds at most.
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
import type { Sfx } from './sfx.js';

/** The strip, out past the side yard (metres). */
const O = new THREE.Vector3(-14, 0, 8);
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
  private weight = 0;
  private birds: THREE.Group[] = [];

  constructor(private d: CafeDeps) {
    this.talk = new Talk(d.parent, 'day');
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
    this.fig('mai', { shirt: 0xf4efe0, hair: 'bun', hairColour: 0x1a1414 }, new THREE.Vector3(-0.4, 0, -1.0), false); // at the counter window
    this.fig('sparky', { shirt: 0x3a6fb0, hair: 'cap', hairColour: 0xe9d23a }, new THREE.Vector3(2.6, 0, 0.4), true);
    const you = this.fig('you', { shirt: 0xe8892e, hair: 'cap', hairColour: 0x2f4f6f }, new THREE.Vector3(0.9, 0, -0.2), false);
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
    // the shot
    this.shot.look.copy(O).add(new THREE.Vector3(0.9, 1.15, -0.9));
    this.shot.pos.copy(this.shot.look).add(new THREE.Vector3(0.3, 0.9, 7.6));
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
      const m = this.fig('mate', { shirt: friendById(id).shirt, hair: id === 'courtney' ? 'bun' : id === 'tim' ? 'beanie' : 'short' }, new THREE.Vector3(3.6, 0, 0.6), true);
      m.setExpr('misty');
      out.push({ who: 'mate', name: friendById(id).name, text: this.fill(pick(L.rough[id as FriendId], day), f) });
      if (p.lastIdea?.dayIndex === day - 1) out.push({ who: 'mate', name: friendById(id).name, text: this.fill(pick(L.menu, day), f) });
    }
    // the part-timer on her days: she walks back with you
    if (this.d.jessIn() && out.length < 2) {
      this.fig('jess', { shirt: PEOPLE.partTimer.shirt, hair: 'pony', hairColour: 0x6a3a22 }, new THREE.Vector3(-0.4, 0, 0.6), false);
      out.push({ who: 'jess', name: PEOPLE.partTimer.name, text: this.fill(pick(L.jess.arrive, day), f), note: `Walked in with ${PEOPLE.partTimer.name}`,
        apply: () => { p.trust += 1; } });
    }
    // Dennis at the window with a laptop: he'll ring at ten
    if (g.dennis.call && out.length < 2) {
      this.fig('dennis', { shirt: 0xb8902e, hair: 'short', hairColour: 0x9a9aa0 }, new THREE.Vector3(-1.6, 0, -0.6), true);
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
      const c = this.fig('customer', { shirt: 0x8fb06a, hair: 'pony' }, new THREE.Vector3(-0.6, 0, -0.4), false);
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
    this.active = false;
    this.talk.clear();
    this.set.visible = false;
    this.d.setHud(true);
    this.d.arrive();
    this.d.save();
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
    const r = this.d.project(this.set.position.clone().add(O).add(new THREE.Vector3(3.2, 2.6, -1.2)));
    this.talk.place('radio', r.x, r.y, !r.behind);
    // the dog's tail, the magpies
    const dog = this.set.getObjectByName('tail'); if (dog) dog.rotation.y = Math.sin(this.t * 9) * 0.6;
    this.birds.forEach((b, i) => { b.position.y = Math.abs(Math.sin(this.t * 3 + i * 2)) * 0.12; b.rotation.y = Math.sin(this.t * 0.7 + i) * 1.5; });
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
    this.talk.ask([{ text: 'Walk back', cls: 'door' }], () => this.leave());
  }

  applyCamera(camera: THREE.PerspectiveCamera, dt: number) {
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
    const sign = signTex(CONFIG.cafe.name);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
    sm.position.set(0, 2.62, 0.23); cafe.add(sm);
    cafe.position.copy(at(0.4, -1.6)); g.add(cafe);
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
    // magpies on the footpath
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      b.add(boxAt(0.18, 0.12, 0.1, toon(0x14110f), 0, 0.06, 0), boxAt(0.1, 0.08, 0.1, toon(0xf4f4f0), 0.05, 0.12, 0), boxAt(0.08, 0.08, 0.08, toon(0x14110f), 0.12, 0.18, 0));
      const holder = new THREE.Group(); holder.add(b); holder.position.copy(at(-3 + i * 1.3, 0.8 + (i % 2) * 0.4));
      this.birds.push(b); g.add(holder);
    }
  }

  dispose() { this.talk.clear(); this.chip?.remove(); this.d.scene.remove(this.set); }
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
