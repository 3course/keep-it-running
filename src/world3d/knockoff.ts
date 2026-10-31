// Knock-off beers. At 5 the machine stops and one of the three mates is at the roller door: "Grab a beer" or "Head
// home". Grab a beer and the camera comes down from the 40° view to a close two-shot — you and them on upturned milk
// crates by the bar fridge, the roller door up and the evening behind you. The conversation runs on the night director
// (src/people/night.ts); this shows it: speech bubbles, faces, idles, the light going (fluoros off, the fridge doing
// the work by turn ~8), a tram, a dog, a can cracking. Ring someone and they walk in through the door with more beers
// and the shot widens to three. "Wind it up" and the camera goes back to the shed, and the day's done.
import * as THREE from 'three';
import type { Game } from '../sim/Game.js';
import { friendById, pickFriend } from '../people/friends.js';
import { SCRIPTS } from '../people/dialogue/index.js';
import type { FriendId } from '../people/dialogue/types.js';
import { endNight, Night, type DayFacts, type Said, type Turn } from '../people/night.js';
import { slur } from '../people/slur.js';
import { people } from '../people/state.js';
import { scatterCans } from '../world/cans.js';
import { absMinute, logEvent, type WorldState } from '../world/state.js';
import { Talk } from '../ui/talk.js';
import { Figure, type FigureLook } from './figures.js';
import type { ShedLighting } from './lighting.js';
import type { Sfx } from './sfx.js';
import { boxAt, toon } from './build.js';
import { LsgVignette } from './lsg.js';

/** How each mate looks up close (their shirt is the one they always wear: src/data/mates.ts). */
const LOOKS: Record<FriendId, Omit<FigureLook, 'shirt'>> = {
  eggby: { hair: 'short', hairColour: 0x6a4a2a, canColour: 0xd9a23a },
  courtney: { hair: 'bun', hairColour: 0x2a1a14, canColour: 0x8fd37a },
  tim: { hair: 'beanie', hairColour: 0x4a5a6a, canColour: 0xc0281e },
};
const YOU: FigureLook = { shirt: 0xe8892e, hair: 'cap', hairColour: 0x2f4f6f, canColour: 0x2f8f6f };

// the set, in metres: crates in front of the fridge (dock, east wall), the roller door just north of it
const SPOT = {
  you: new THREE.Vector3(13.1, 0, 17.85),
  host: new THREE.Vector3(13.55, 0, 17.05),
  guest: new THREE.Vector3(13.95, 0, 16.55),
  door: new THREE.Vector3(14.1, 0, 15.4),     // where the mate stands at 5, just inside the door
  fridgeFront: new THREE.Vector3(13.85, 0.6, 18.0),
};
/** From the look point out to the camera: west, a little up, a touch south. */
const CAM_DIR = new THREE.Vector3(-0.98, 0.14, 0.1).normalize();
const SKY = { dusk: new THREE.Color(0xe8946a), night: new THREE.Color(0x141a30) };

export interface KnockOffDeps {
  scene: THREE.Scene;
  g: Game;
  w: WorldState;
  pointLights: boolean;
  talkParent: HTMLElement;
  project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean };
  setHud: (visible: boolean) => void;
  hidePlayer: (hidden: boolean) => void;
  lights: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; lighting: ShedLighting | null };
  sfx: Sfx;
  facts: () => DayFacts;
  /** The after-hours cut: run the tracing, then call done with how close it was (0..1). */
  cut: (design: string, by: FriendId, beers: number, done: (accuracy: number) => void) => void;
  knockOff: () => void;
  save: () => void;
  canvas: HTMLCanvasElement;
  /** Post-processing allowed (the rare late one's soft, saturated picture). */
  rich: boolean;
  /** Today's pieces (design ids). */
  designs: () => string[];
}

type Mode = 'off' | 'door' | 'leaving' | 'night' | 'ending' | 'cutting' | 'lsg';

export class KnockOff {
  mode: Mode = 'off';
  /** The night being had (public for tests). */
  night: Night | null = null;
  friend: FriendId | null = null;
  readonly talk: Talk;
  private set = new THREE.Group();
  private figures = new Map<string, Figure>();
  private fridgeLight: THREE.PointLight | null = null;
  private glow: THREE.Mesh;
  private radio: THREE.Mesh;
  private empties = new THREE.Group();
  private doneDay = -1;
  // camera
  private shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private weight = 0;
  private weightTo = 0;
  // the lines being shown, one at a time
  private queue: Said[] = [];
  private lineLeft = 0;
  private turnShown: Turn | null = null;
  private pendingEvent: Turn['event'];
  private t = 0;
  private dusk = 0;
  private ambient = { tram: 18, dog: 30 };
  private base: { sky: THREE.Color | null; hemi: number; sun: number; hemiColour: THREE.Color } | null = null;
  private walkIn: { fig: Figure; t: number } | null = null;
  private endAt = 0;
  /** The fluoro over the router flicks on for an after-hours cut. */
  private workLight = false;

  constructor(private d: KnockOffDeps) {
    this.talk = new Talk(d.talkParent);
    // crates, a radio on the fridge, the fridge's light (a real one where the tier has point lights, a glow where not)
    const crateCols = [0x2f6f9e, 0xc0402a, 0xe0b030];
    [SPOT.you, SPOT.host, SPOT.guest].forEach((p, i) => {
      const c = new THREE.Group();
      c.add(boxAt(0.42, 0.36, 0.42, toon(crateCols[i])));
      for (const sx of [-0.12, 0, 0.12]) c.add(boxAt(0.03, 0.3, 0.43, 0x1a1414, sx, 0.03)); // the slots
      c.position.set(p.x, 0, p.z);
      c.name = `crate${i}`;
      this.set.add(c);
    });
    this.radio = boxAt(0.3, 0.16, 0.14, toon(0x6a4a3a), 14.25, 0.9, 17.7);
    this.set.add(this.radio);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.position.set(13.4, 0.02, 18.0);
    this.set.add(this.glow);
    this.set.add(this.empties);
    if (d.pointLights) {
      this.fridgeLight = new THREE.PointLight(0xdcecff, 0, 5, 1.4);
      this.fridgeLight.position.copy(SPOT.fridgeFront);
      d.scene.add(this.fridgeLight); // always there (intensity 0 by day): no shader recompile when it comes on
    }
    this.set.visible = false;
    d.scene.add(this.set);
    this.lsg = new LsgVignette({ scene: d.scene, canvas: d.canvas, parent: d.talkParent, talk: this.talk, sfx: d.sfx, rich: d.rich,
      fridgeLight: this.fridgeLight, figures: this.figures, project: d.project, designs: d.designs });
  }

  get active() { return this.mode !== 'off'; }
  /** The scene owns the camera and the player (no walking, no labels). */
  get inScene() { return this.mode === 'night' || this.mode === 'ending' || this.mode === 'cutting' || this.mode === 'lsg'; }
  /** Tests: offer the rare late one as soon as it's allowed. */
  forceLsg = false;
  /** The rare late one (public for tests). */
  lsg!: LsgVignette;

  // ---------- 5pm ----------

  /** It's 5: someone's at the door (once a day). */
  atFive() {
    const g = this.d.g, w = this.d.w, p = people(w);
    if (this.mode !== 'off' || this.doneDay === g.dayIndex) return;
    this.doneDay = g.dayIndex;
    const id = this.friend = pickFriend(p.lastFriend, g.dayIndex);
    const f = this.figure(id, { shirt: friendById(id).shirt, ...LOOKS[id] });
    f.setSeated(false);
    f.root.position.copy(SPOT.door);
    f.root.rotation.y = Math.PI / 2; // facing into the shed
    f.setExpr('animated');
    this.set.visible = true;
    for (const c of this.set.children) if (c.name.startsWith('crate')) c.visible = false;
    w.rollerUpUntil = absMinute(g) + 600;
    if (g.current) logEvent(w, `${g.current.name} won't finish: scrap at knock-off`);
    this.mode = 'door';
    this.sayNow(id, this.pickLine(SCRIPTS[id].greet));
    this.talk.ask([{ text: 'Grab a beer', cls: 'door' }, { text: 'Head home', cls: 'home' }], i => (i === 0 ? this.grabBeer() : this.headHome()));
  }

  private headHome() {
    const id = this.friend!;
    this.sayNow(id, this.pickLine(SCRIPTS[id].headHome));
    this.mode = 'leaving';
    this.endAt = this.t + 1.8;
  }

  private grabBeer() {
    const g = this.d.g, w = this.d.w, id = this.friend!;
    this.d.sfx.crack();
    this.d.setHud(false);
    this.d.hidePlayer(true);
    for (const c of this.set.children) if (c.name.startsWith('crate')) c.visible = c.name !== 'crate2';
    const host = this.figures.get(id)!;
    host.setSeated(true); host.root.position.copy(SPOT.host); host.setExpr('relaxed');
    const you = this.figure('you', YOU);
    you.root.position.copy(SPOT.you);
    this.night = new Night({ dayIndex: g.dayIndex, host: id, facts: this.d.facts(), people: people(w), forceLsg: this.forceLsg });
    this.mode = 'night';
    this.base = { sky: (this.d.scene.background as THREE.Color | null)?.clone() ?? null, hemi: this.d.lights.hemi.intensity, sun: this.d.lights.sun.intensity, hemiColour: this.d.lights.hemi.color.clone() };
    this.frame(false);
    this.weightTo = 1;
    this.talk.hush();
    this.showTurn(this.night.turnNow);
  }

  // ---------- the turns ----------

  private showTurn(t: Turn) {
    this.turnShown = t;
    this.queue = [...t.lines];
    this.pendingEvent = t.event;
    this.lineLeft = 0;
    this.talk.hideReplies();
    if (t.event?.kind === 'crack') { this.d.sfx.crack(); for (const f of this.figures.values()) f.play('sip'); this.addEmpty(); }
    if (t.event?.kind === 'arrive') this.arrive(t.event.who);
    if (t.event?.kind === 'music') this.d.sfx.startMusic(!!this.night?.guest);
    this.talk.onTap = () => { if (this.queue.length || this.lineLeft > 0.35) this.lineLeft = Math.min(this.lineLeft, 0.05); };
  }

  /** Show the next queued line; when they're all out, the replies (or the event the turn's waiting on). */
  private nextLine() {
    const n = this.night!;
    const l = this.queue.shift();
    if (l) {
      const shown = slur(l.text, n.beers, `${this.d.g.dayIndex}|${n.turn}|${l.text.length}`);
      this.talk.say(l.who, l.phone ? `📱 ${l.name}` : l.name, shown, l.who === 'you' ? 'you' : l.phone ? 'phone' : '');
      const fig = this.figures.get(l.phone ? 'you' : l.who);
      if (fig) { if (l.who !== 'you' && !l.phone) fig.setExpr(l.expr); fig.talking = 1.2; }
      this.lineLeft = Math.min(4.2, Math.max(1.5, 0.9 + shown.length * 0.045));
      return;
    }
    const t = this.turnShown!;
    if (t.event?.kind === 'cut') { this.startCut(t.event.design, t.event.by); return; }
    if (t.event?.kind === 'lsg') {
      this.mode = 'lsg';
      this.talk.hush();
      this.lsg.start(() => { this.mode = 'night'; n.lsgDone(); this.showTurn(n.turnNow); });
      return;
    }
    if (n.over) { this.mode = 'ending'; this.endAt = this.t + 1.4; return; }
    const opts = t.options.map(o => ({ text: slur(o.text, n.beers, `${this.d.g.dayIndex}|${n.turn}|o${o.text.length}`), cls: o.kind === 'call' ? 'call' : o.kind === 'wind' ? 'wind' : '' }));
    this.talk.ask(opts, i => { n.choose(i); this.showTurn(n.turnNow); });
  }

  private startCut(design: string, by: FriendId) {
    const n = this.night!;
    this.mode = 'cutting';
    this.talk.hush();
    this.d.cut(design, by, n.beers, accuracy => {
      this.mode = 'night';
      n.cutDone(accuracy);
      this.showTurn(n.turnNow);
    });
  }

  private arrive(who: FriendId) {
    const f = this.figure(who, { shirt: friendById(who).shirt, ...LOOKS[who] });
    f.setSeated(false);
    f.root.position.copy(SPOT.door);
    f.walking = true;
    this.walkIn = { fig: f, t: 0 };
    this.d.sfx.crack();
    const crate = this.set.getObjectByName('crate2'); if (crate) crate.visible = true;
  }

  // ---------- each frame ----------

  update(dt: number, paused: boolean) {
    if (this.mode === 'off') return;
    if (paused) dt = 0;
    this.t += dt;
    for (const [id, f] of this.figures) {
      f.update(dt);
      // bubbles follow heads
      const p = this.d.project(f.headWorld(new THREE.Vector3()));
      this.talk.place(id, p.x, p.y, !p.behind);
    }
    if (this.mode === 'leaving' && this.t >= this.endAt) { this.finish(false); return; }
    if (this.mode === 'door') return;
    // the friend you rang, walking in from the door to their crate
    if (this.walkIn) {
      const w = this.walkIn; w.t += dt;
      const k = Math.min(1, w.t / 2.2);
      w.fig.root.position.lerpVectors(SPOT.door, SPOT.guest, k);
      w.fig.root.rotation.y = Math.atan2(-(SPOT.guest.x - SPOT.door.x), -(SPOT.guest.z - SPOT.door.z));
      if (k >= 1) { w.fig.walking = false; w.fig.setSeated(true); this.walkIn = null; this.frame(true); }
    }
    // the light going: fluoros off from the start, the sky darkening by turn, the fridge taking over by ~8
    const n = this.night;
    if (n) {
      const want = Math.min(1, (n.turn + 1) / 8) * (this.workLight ? 0.45 : 1);
      this.dusk += (want - this.dusk) * Math.min(1, dt * 0.6);
      this.applyLight(this.dusk);
      // the street: a tram now and then, a dog somewhere
      this.ambient.tram -= dt; this.ambient.dog -= dt;
      if (this.ambient.tram <= 0) { this.d.sfx.tram(); this.ambient.tram = 22 + Math.random() * 20; }
      if (this.ambient.dog <= 0) { this.d.sfx.dog(); this.ambient.dog = 28 + Math.random() * 30; }
    }
    (this.radio.material as THREE.MeshToonMaterial).emissive?.setHex(this.d.sfx.musicOn ? 0x553311 : 0);
    if (this.mode === 'lsg') { this.lsg.update(dt); return; }
    if (this.mode === 'cutting') return;
    // lines
    if (this.mode === 'night' && !this.talk.asking) {
      this.lineLeft -= dt;
      if (this.lineLeft <= 0) this.nextLine();
    }
    if (this.mode === 'ending' && this.t >= this.endAt) { this.weightTo = 0; if (this.weight < 0.02) this.finish(true); }
  }

  /** After the view's camera: blend toward the shot. */
  applyCamera(camera: THREE.PerspectiveCamera, baseLook: THREE.Vector3, dt: number) {
    if (this.mode === 'off' && this.weight <= 0) return;
    this.weight += (this.weightTo - this.weight) * Math.min(1, dt * 2.2);
    if (Math.abs(this.weightTo - this.weight) < 0.003) this.weight = this.weightTo;
    if (this.weight <= 0) return;
    const e = this.weight * this.weight * (3 - 2 * this.weight);
    // a slow breathe so the shot isn't dead still
    const look = this.shot.look.clone().add(new THREE.Vector3(0, Math.sin(this.t * 0.4) * 0.015, 0));
    camera.position.lerp(this.shot.pos, e);
    camera.lookAt(baseLook.clone().lerp(look, e));
  }

  /** The two-shot (or, once someone's walked in, the three-shot). */
  private frame(three: boolean) {
    const heads = [SPOT.you, SPOT.host, ...(three ? [SPOT.guest] : [])];
    const look = heads.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / heads.length);
    look.y = 1.0;
    this.shot.look.copy(look);
    this.shot.pos.copy(look).addScaledVector(CAM_DIR, three ? 4.3 : 3.3);
    // everyone faces the camera, turned a little toward each other
    for (const [id, f] of this.figures) {
      if (!f.seated) continue;
      const p = f.root.position, cam = this.shot.pos;
      const toCam = Math.atan2(-(cam.x - p.x), -(cam.z - p.z));
      const toMid = Math.atan2(-(look.x - p.x), -(look.z - p.z));
      f.root.rotation.y = toCam + (((toMid - toCam + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.35;
      f.lookYaw = id === 'you' ? 0.7 : 0.9; // out the door, on their right
    }
  }

  private applyLight(k: number) {
    const L = this.d.lights, b = this.base!;
    if (b.sky) {
      const sky = this.d.scene.background as THREE.Color;
      if (k < 0.35) sky.copy(b.sky).lerp(SKY.dusk, k / 0.35); else sky.copy(SKY.dusk).lerp(SKY.night, (k - 0.35) / 0.65);
    }
    // the fridge becomes the key light (where there's a real light to do it); elsewhere keep enough fill to read faces
    const floor = this.d.pointLights ? 0.18 : 0.55;
    L.hemi.intensity = b.hemi * (1 - k) + floor * k;
    L.hemi.color.copy(b.hemiColour).lerp(new THREE.Color(0x9fb4e0), k * 0.6);
    L.sun.intensity = b.sun * Math.max(0.03, 1 - k * 1.1);
    if (L.lighting) L.lighting.night = Math.max(0.01, k);
    if (this.fridgeLight) this.fridgeLight.intensity = 0.8 + 3.2 * k;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = (this.d.pointLights ? 0.12 : 0.3) * (0.3 + k);
  }

  private restoreLight() {
    const L = this.d.lights, b = this.base;
    if (!b) return;
    if (b.sky) (this.d.scene.background as THREE.Color).copy(b.sky);
    L.hemi.intensity = b.hemi; L.hemi.color.copy(b.hemiColour); L.sun.intensity = b.sun;
    if (L.lighting) L.lighting.night = 0;
    if (this.fridgeLight) this.fridgeLight.intensity = 0;
    this.base = null;
  }

  /** Done: tidy up, remember the night, pay for the beers, knock off. */
  private finish(hadNight: boolean) {
    const g = this.d.g, w = this.d.w, p = people(w), n = this.night;
    if (n && hadNight) {
      endNight(n, p, g.dayIndex);
      // gifted slabs first, then the fridge's own (yours: the mates' are on you, it's your shed)
      const yours = n.beers;
      const fromGift = Math.min(p.fridgeGifted, yours);
      p.fridgeGifted -= fromGift;
      g.knockOffBeers(yours - fromGift);
      if (n.guest) scatterCans(p, n.beers * n.present.length + 1, g.dayIndex + 1);
      logEvent(w, `Knock-off beers with ${n.present.map(id => friendById(id).name).join(' and ')}`);
    }
    if (!hadNight && this.friend) people(w).lastFriend = this.friend;
    this.d.sfx.stopMusic();
    if (this.lsg.active) this.lsg.abort();
    this.restoreLight();
    this.talk.clear();
    for (const f of this.figures.values()) this.set.remove(f.root);
    this.figures.clear();
    this.empties.clear();
    this.set.visible = false;
    this.night = null; this.walkIn = null;
    this.weight = 0; this.weightTo = 0;
    this.mode = 'off';
    w.rollerUpUntil = null;
    this.d.hidePlayer(false);
    this.d.setHud(true);
    this.d.save();
    this.d.knockOff();
  }

  // ---------- after hours ----------

  /** Everyone up off the crates and round the router's bed (or back down). `machine`: the machine's group. */
  gather(atRouter: boolean, machine: THREE.Object3D) {
    this.weightTo = atRouter ? 0 : 1;          // the trace has its own shot
    this.workLight = atRouter;
    const ids = [...this.figures.keys()];
    if (atRouter) {
      // along the near (south) edge of the bed, looking at it
      const c = machine.localToWorld(new THREE.Vector3(0, 0, 0)), box = new THREE.Box3().setFromObject(machine);
      ids.forEach((id, i) => {
        const f = this.figures.get(id)!;
        f.setSeated(false);
        f.root.position.set(c.x - 0.7 + i * 0.7, 0, box.max.z + 0.35);
        f.root.rotation.y = 0;
      });
    } else {
      const spots: Record<string, THREE.Vector3> = { you: SPOT.you };
      if (this.night) { spots[this.night.host] = SPOT.host; if (this.night.guest) spots[this.night.guest] = SPOT.guest; }
      for (const id of ids) { const f = this.figures.get(id)!; f.setSeated(true); f.root.position.copy(spots[id] ?? SPOT.guest); }
      this.frame(!!this.night?.guest);
    }
  }

  /** A mate's line (the tracing's running commentary). */
  sayAs(who: FriendId, text: string) {
    const n = this.night;
    this.talk.say(who, friendById(who).name, n ? slur(text, n.beers, `${n.turn}|${text.length}`) : text);
    const f = this.figures.get(who);
    if (f) { f.talking = 1.3; f.setExpr(/wonk|wobbl|champ/i.test(text) ? 'laughing' : 'animated'); }
  }

  // ---------- bits ----------

  private figure(id: string, look: FigureLook) {
    let f = this.figures.get(id);
    if (!f) { f = new Figure(look); this.figures.set(id, f); this.set.add(f.root); }
    return f;
  }

  private sayNow(who: FriendId, text: string) {
    this.talk.say(who, friendById(who).name, text);
    const f = this.figures.get(who); if (f) f.talking = 1.4;
  }

  /** One of a set-piece's lines, templates filled (before the night starts, a throwaway night does the filling). */
  private pickLine(xs: string[]) {
    const text = xs[this.d.g.dayIndex % xs.length], id = this.friend!;
    const n = this.night ?? new Night({ dayIndex: this.d.g.dayIndex, host: id, facts: this.d.facts(), people: structuredClone(people(this.d.w)) });
    return n.fill(text, id);
  }

  /** An empty at each crate's feet per beer gone. */
  private addEmpty() {
    const n = this.night; if (!n || n.beers <= 1) return;
    for (const s of [SPOT.you, SPOT.host, ...(n.guest ? [SPOT.guest] : [])]) {
      if (this.empties.children.length > 18) break;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8), toon(0x9aa0a6));
      c.rotation.z = Math.PI / 2; c.rotation.y = Math.random() * 3;
      c.position.set(s.x - 0.3 + Math.random() * 0.15, 0.045, s.z + 0.15 + Math.random() * 0.2);
      this.empties.add(c);
    }
  }
}
