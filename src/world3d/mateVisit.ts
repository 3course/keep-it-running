// A mate who's dropped in, past "Flat out, sorry" (src/data/mates.ts; Game's visitor is a Distraction of kind friend):
// - "Yeah, what's up?": a short yarn in the knock-off style — their line over their head, two replies of yours and a
//   way out — 2–4 turns that know what kind of day it's been, then the offer of a hand or a beer;
// - "Give us a hand?": 1–4 of whatever's actually pending (Game.askHelp decides how many), walked to and done at their
//   own pace (slower, and sillier, a beer in), each with a line, and on the notepad ("Tim: stacking (2 of 3)");
// - "Grab you a beer?": you fetch a can from the fridge and hand it over (the "Give" prompt on them, Game.giveBeer);
//   before the fridge opens it's "Beer after two?" — a happy mate stays and helps till then, otherwise he's back at two.
// Their lines go through the drunk-spelling filter once they've had a beer.
import * as THREE from 'three';
import type { Game } from '../sim/Game.js';
import type { Distraction } from '../sim/types.js';
import { Talk } from '../ui/talk.js';
import { WORLD } from '../world/worldConfig.js';
import { slur } from '../people/slur.js';
import { TASK_WORDS, VISIT_LINES, type ChatTurn, type HelpTask } from '../people/lines/visitors.js';
import type { FriendId } from '../people/dialogue/types.js';
import { designForJob } from '../designs/index.js';
import { objectById, type ObjectId } from '../world/layout.js';
import { logEvent, offcutsBagAt, type WorldState } from '../world/state.js';
import type { VisitorWalker } from './visitor.js';

export interface MateVisitDeps {
  g: Game; w: WorldState; parent: HTMLElement; walker: VisitorWalker;
  /** Screen position of the mate's head, and of yours. */
  mateAt: () => { x: number; y: number; behind: boolean };
  youAt: () => { x: number; y: number; behind: boolean };
  save: () => void;
}

/** Each job: where he goes first and what happens there, then where he takes it and what happens then. */
const ROUTES: Record<HelpTask, [ObjectId, ObjectId]> = {
  stack: ['machine', 'finishedPallet'], offcuts: ['offcutBin', 'skip'], bag: ['extractor', 'skip'], unload: ['rollerDoor', 'plyPallet'], ply: ['plyPallet', 'machine'],
};
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(n) % xs.length];

export class MateVisit {
  readonly talk: Talk;
  /** The yarn on now. */
  chat: { id: number; turns: ChatTurn[]; i: number } | null = null;
  /** The jobs he's doing for you. */
  help: { id: number; task: HelpTask | null; leg: 0 | 1; dwell: number; idle: number; carried: number } | null = null;
  /** "Grab you a beer?": he's waiting on one. */
  beerFor: number | null = null;
  /** The mate who'll help once he's had the beer he asked for. */
  private helpAfterBeer: number | null = null;
  private timers: number[] = [];

  constructor(private d: MateVisitDeps) { this.talk = new Talk(d.parent, 'visit'); this.talk.autoHold = true; }

  private get g() { return this.d.g; }
  private mate(): Distraction | undefined { return this.g.distractions.find(x => x.kind === 'friend'); }
  private lines(m: Distraction) { return VISIT_LINES[(m.mate ?? 'tim') as FriendId] ?? VISIT_LINES.tim; }
  private name(m: Distraction) { return this.g.mateName(m); }
  /** Their words, through the beer. */
  private his(m: Distraction, text: string) { return slur(this.fill(text), (m.beers ?? 0) + 1, `${m.id}|${text.length}`); }
  private mine(text: string) { return slur(text, 1 + Math.round(this.g.alcohol * 2), `you|${text.length}`); }

  private fill(text: string) {
    const g = this.g, cur = g.current, des = cur ? designForJob(cur) : null;
    return text.replace(/\{sheets\}/g, String(g.today.sheetsDone)).replace(/\{piece\}/g, des ? des.name.toLowerCase() : 'job')
      .replace(/\{customer\}/g, des ? des.customer.replace(/[,(].*$/, '').trim() : 'the customer');
  }

  /** (How long it stays is Talk's: max(2.5 s, 0.9 s + 0.06 s a character), tap to dismiss, kept while you're near him.) */
  private say(who: 'mate' | 'you', text: string, _secs = 0) {
    const m = this.mate();
    this.talk.say(who, who === 'you' ? 'You' : m ? this.name(m) : '', text, who === 'you' ? 'you' : '');
  }
  private later(ms: number, f: () => void) { this.timers.push(window.setTimeout(f, ms)); }

  // ---------- the yarn ----------

  /** "Yeah, what's up?": he opens with something about today, then 2–4 turns. */
  startChat(id: number) {
    const m = this.mate();
    if (!m || m.id !== id || !this.g.yarn(id)) return;
    const L = this.lines(m), g = this.g;
    const kind = g.today.faults > 0 || g.today.firesSpot > 0 ? 'fault' : g.current ? 'cutting' : g.today.sheetsDone >= 3 ? 'busy' : 'quiet';
    const seed = hash(`${g.seed}|${g.dayIndex}|${m.id}|${m.approaches ?? 0}`);
    const n = 2 + (seed % 3), pool = [...L.turns], turns: ChatTurn[] = [];
    for (let i = 0; i < n && pool.length; i++) turns.push(pool.splice((seed >>> (i * 3)) % pool.length, 1)[0]);
    this.chat = { id, turns, i: 0 };
    this.say('you', this.mine("Yeah, what's up?"), 2);
    this.later(900, () => { this.say('mate', this.his(m, pick(L.open[kind], seed))); this.later(2200, () => this.turn()); });
  }

  private turn() {
    const c = this.chat, m = this.mate();
    if (!c || !m || m.id !== c.id) { this.chat = null; return; }
    if (c.i >= c.turns.length) { this.offer(m); return; }
    const t = c.turns[c.i];
    this.say('mate', this.his(m, t.say), 6);
    this.talk.ask([{ text: this.mine(t.replies[0]) }, { text: this.mine(t.replies[1]) }, { text: 'Better get back to it', cls: 'wind' }], i => {
      if (i === 2) { this.endChat("Righto. I'll let you get on."); return; }
      this.say('you', this.mine(t.replies[i]), 2.4);
      this.later(1000, () => { this.say('mate', this.his(m, t.answers[i]), 4); c.i += 1; this.later(2000, () => this.turn()); });
    });
  }

  /** Winding up: a hand, a beer (or "beer after two?"), or back to work. */
  private offer(m: Distraction) {
    const L = this.lines(m);
    this.say('mate', this.his(m, pick(L.close, m.id)), 6);
    const beer = this.beerReply(m);
    const opts = [{ text: 'Give us a hand?' }, ...(beer ? [{ text: beer }] : []), { text: 'Back to work', cls: 'wind' }];
    this.talk.ask(opts, i => {
      const t = opts[i].text;
      this.g.endYarn(m.id); this.chat = null;
      if (t === 'Give us a hand?') this.startHelp(m.id);
      else if (t === 'Grab you a beer?') this.waitForBeer(m.id);
      else if (t === 'Beer after two?') this.afterTwo(m.id);
      else this.say('mate', this.his(m, "Righto. I'll let you get on."));
    });
  }

  /** The beer on offer from you, if any: after two (within the caps), or the promise of one. */
  beerReply(m: Distraction): string | null {
    if (!this.g.fridgeOpen) return 'Beer after two?';
    return this.g.visitorMayHaveBeer(m) ? 'Grab you a beer?' : null;
  }

  private endChat(line: string) {
    const m = this.mate();
    this.talk.hideReplies();
    if (m && this.chat) { this.g.endYarn(m.id); this.say('mate', this.his(m, line)); }
    this.chat = null;
  }

  // ---------- a beer ----------

  waitForBeer(id: number) {
    const m = this.mate();
    if (!m || m.id !== id) return;
    this.beerFor = id; m.ask = null; this.d.w.mateBeerFor = this.name(m);
    this.say('mate', this.his(m, pick(this.lines(m).waiting, m.id)));
    logEvent(this.d.w, `Getting ${this.name(m)} a beer`);
  }

  /** You've handed it over. */
  give(id: number): boolean {
    const m = this.mate();
    if (!m || m.id !== id || !this.g.giveBeer(id)) return false;
    this.beerFor = null; this.d.w.mateBeerFor = null;
    this.say('mate', this.his(m, pick(this.lines(m).thanks, m.beers ?? 0)));
    // that was the beer he wanted before giving you a hand: on to it
    if (this.helpAfterBeer === id) { this.helpAfterBeer = null; this.later(1200, () => this.startHelp(id, true)); }
    this.d.save();
    return true;
  }

  afterTwo(id: number) {
    const m = this.mate();
    if (!m || m.id !== id) return;
    const name = this.name(m), L = this.lines(m);
    if (this.g.beerAfterTwo(id) === 'help') {
      this.say('mate', this.his(m, pick(L.afterTwoStays, m.id)));
      this.later(1600, () => this.startHelp(id, true));
    } else logEvent(this.d.w, `${name}'ll be back after two`);
  }

  // ---------- a hand ----------

  startHelp(id: number, quiet = false) {
    const m = this.mate();
    if (!m || m.id !== id) return;
    const n = this.g.askHelp(id);
    if (!n) {
      // after two: a beer first (the "Give <name> the beer" prompt's on him once you've got one; then he starts)
      if (m.beerFirst) { this.say('mate', this.his(m, pick(this.lines(m).helpBeerFirst, m.id))); this.beerFor = id; this.d.w.mateBeerFor = this.name(m); this.helpAfterBeer = id; }
      return;
    }
    if (!quiet) this.say('mate', this.his(m, pick(this.lines(m).helpYes, m.id)));
    this.help = { id, task: null, leg: 0, dwell: 0, idle: 0, carried: 0 };
    logEvent(this.d.w, `${this.name(m)}'s giving you a hand (${n} job${n > 1 ? 's' : ''})`);
    this.next();
  }

  /** What's pending that he could do, in order of what helps most. */
  pending(): HelpTask[] {
    const g = this.g, w = this.d.w, out: HelpTask[] = [];
    if (g.bedPile > 0 && !g.palletFull && w.carrying !== 'cut') out.push('stack');
    const truck = g.truckOnApron;
    if (truck?.stage === 'unloading' && truck.bundles.length > (w.carrying === 'bundle' ? 1 : 0)) out.push('unload');
    if (w.oldBagWaiting) out.push('bag');
    if (g.offcutBin >= offcutsBagAt(g) && g.offcutPile === 0 && w.carrying !== 'offcuts') out.push('offcuts');
    if (w.bed === 'empty' && w.carrying !== 'sheet' && g.inHand === null && g.nextUp() && !g.bedFull && g.machine === 'idle' && !g.machineDown) out.push('ply');
    return out;
  }

  private next() {
    const h = this.help, m = this.mate();
    if (!h || !m) return;
    const task = this.pending()[0] ?? null;
    h.task = task; h.leg = 0; h.carried = 0;
    this.d.walker.errand = task ? this.errandTo(ROUTES[task][0]) : null;
    this.note();
  }

  private errandTo(id: ObjectId) {
    const goal = this.d.walker.standNear(objectById(id).rect);
    return goal ? { goal, key: `help:${id}` } : null;
  }

  /** The notepad line: "Tim: stacking (2 of 3)". */
  private note() {
    const h = this.help, m = this.mate(), w = this.d.w;
    w.mateHelp = h && m && h.task ? { who: this.name(m), word: TASK_WORDS[h.task], n: (m.helped ?? 0) + 1, of: m.helping ?? 1 } : null;
  }

  /** Every frame: bubbles follow; he walks his jobs. */
  update(dt: number, paused: boolean) {
    const m = this.mate();
    if (paused) dt = 0;
    this.talk.update(dt, () => !!m && Math.hypot(this.d.walker.x - this.d.w.px, this.d.walker.z - this.d.w.py) < WORLD.bubble.nearMetres);
    const at = this.d.mateAt(), you = this.d.youAt();
    this.talk.place('mate', at.x, at.y, !at.behind && !!m);
    this.talk.place('you', you.x, you.y, !you.behind);
    if (!m) { this.stop(); return; }
    if (this.chat && (m.id !== this.chat.id || this.g.phase !== 'day')) { this.chat = null; this.talk.hideReplies(); }
    if (this.chat) this.g.holdYarn(m.id); // mid-conversation: he's not going anywhere
    if (this.beerFor !== null && m.id !== this.beerFor) { this.beerFor = null; this.d.w.mateBeerFor = null; }
    this.d.walker.speedMult = this.help ? 0.8 / (1 + 0.25 * (m.beers ?? 0)) : 1;
    const h = this.help;
    if (!h || h.id !== m.id) { if (h) this.stop(); return; }
    if (!h.task) {
      // nothing pending: he waits a bit for something to turn up, then calls it
      h.idle += dt;
      if (h.idle > 1 && Math.floor(h.idle) % 2 === 0) { const t = this.pending()[0]; if (t) { h.idle = 0; this.next(); return; } }
      if (h.idle > 12) { this.say('mate', this.his(m, pick(this.lines(m).nothingToDo, m.id))); this.g.helperStop(m.id); this.finish(); }
      return;
    }
    if (!this.d.walker.onErrand) return;
    // there: a moment to do it (longer a beer or two in)
    h.dwell += dt;
    if (h.dwell < 1.0 * (1 + 0.3 * (m.beers ?? 0))) return;
    h.dwell = 0;
    if (h.leg === 0) {
      if (!this.pickUp(h.task)) { this.next(); return; } // someone beat him to it
      h.leg = 1;
      this.d.walker.errand = this.errandTo(ROUTES[h.task][1]);
      return;
    }
    this.putDown(h.task);
    const L = this.lines(m), tipsy = (m.beers ?? 0) > 0 ? 1 : 0;
    this.say('mate', this.his(m, pick(L.done[h.task][tipsy], (m.helped ?? 0) + m.id)));
    logEvent(this.d.w, `${this.name(m)}: done ${TASK_WORDS[h.task]}`);
    this.d.save();
    if (this.g.helperDid(m.id)) { this.later(1800, () => { const mm = this.mate(); if (mm) this.say('mate', this.his(mm, pick(L.allDone, mm.id))); }); this.finish(); }
    else this.next();
  }

  /** The first stop: pick it up (or do it). False if it's no longer there to do. */
  private pickUp(task: HelpTask): boolean {
    const g = this.g, w = this.d.w, h = this.help!;
    switch (task) {
      case 'stack': { const before = g.bedPile; if (!g.helperTask('stack')) return false; h.carried = before - g.bedPile; return true; }
      case 'offcuts': return g.helperTask('offcuts');
      case 'bag': if (!w.oldBagWaiting) return false; w.oldBagWaiting = false; return true;
      case 'unload': { const t = g.truckOnApron; return !!t && t.stage === 'unloading' && t.bundles.length > 0; }
      case 'ply': return w.bed === 'empty' && g.inHand === null && !!g.takeSheet();
    }
  }

  /** The second stop: put it where it goes. */
  private putDown(task: HelpTask) {
    const g = this.g, w = this.d.w, h = this.help!;
    if (task === 'stack') w.finishedStack += h.carried;
    else if (task === 'unload') g.helperTask('unload');
    else if (task === 'ply' && w.bed === 'empty') { w.bed = 'placed'; w.clamps = 0; }
  }

  private finish() {
    this.help = null; this.d.walker.errand = null; this.d.w.mateHelp = null;
  }

  /** He's gone (the visit's over): drop everything. */
  stop() {
    if (this.help) this.finish();
    this.chat = null; this.beerFor = null; this.d.w.mateBeerFor = null; this.talk.hideReplies();
  }

  /** What the visitor's labels should be while this has hold of him (the chat's replies are the UI). */
  get holding() { return !!this.chat; }

  dispose() { for (const t of this.timers) window.clearTimeout(t); this.talk.clear(); }
}

/** The beer can in a visiting mate's hand (drawn while he's got one on the go). */
export function mateCan(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), new THREE.MeshToonMaterial({ color: 0xd9a23a }));
  m.position.set(0.24, 0.95, 0.08); m.visible = false; m.name = 'mateCan';
  return m;
}

