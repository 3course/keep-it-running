// The knock-off night, run as turns. Headless (no DOM, no Three.js): the view shows each Turn as speech bubbles and
// reply options, and calls choose(). The arc follows turns and beers — shop talk, then life, then the big stuff — with
// a big idea around beer 3, one topic argument a night (rotated so nights don't repeat), maybe an after-hours cut, and
// from beer 2 the option to ring someone. "Wind it up" is always there and always ends it warmly.
import { PEOPLE } from './config.js';
import { FRIENDS, friendById } from './friends.js';
import { SCRIPTS, THREADS, TOPICS, BIG_IDEAS } from './dialogue/index.js';
import type { BigIdeaId, Expr, Fact, FriendId, Line, Node, Reply, Thread, TopicId } from './dialogue/types.js';
import type { PeopleState } from './state.js';

/** What happened today, for the templates. */
export interface DayFacts {
  sheets: number; late: number; scrapped: number; fires: number;
  designs: string[];       // names of what was cut today (src/designs)
  customers: string[];     // who they were for
  gift: { phrase: string; from: string } | null; // a gift that came in today
  jess: string;            // the part-timer's name
  jessIn: boolean;
  fullTimeToday: boolean;  // she went full time today
  keepsake: string | null; // the last thing cut after hours
}

export interface NightContext { dayIndex: number; host: FriendId; facts: DayFacts; people: PeopleState }

export type Who = FriendId | 'you';
export interface Said { who: Who; name: string; text: string; expr: Expr; phone?: boolean }
export type ReplyKind = 'reply' | 'call' | 'wind' | 'yes' | 'no';
export interface Option { text: string; kind: ReplyKind; call?: FriendId }
export interface Turn {
  lines: Said[];
  options: Option[];
  /** Something for the view to do as this turn shows. */
  event?: { kind: 'arrive'; who: FriendId } | { kind: 'music' } | { kind: 'cut'; design: string; by: FriendId } | { kind: 'end' } | { kind: 'crack' };
}

export const TEMPLATE_KEYS = ['host', 'guest', 'eggby', 'courtney', 'tim', 'absent', 'jess', 'sheets', 'design', 'design2', 'customer', 'gift',
  'giver', 'late', 'fires', 'side', 'otherSide', 'take', 'guestSide', 'lastIdea', 'lastIdeaWith', 'keepsake', 'beers', 'idea'] as const;

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

type State =
  | { kind: 'thread'; thread: Thread; node: Node }
  | { kind: 'another'; then: Resume }
  | { kind: 'phone'; who: FriendId; then: Resume }
  | { kind: 'cut'; design: string; by: FriendId; then: Resume }
  | { kind: 'end' };
type Resume = { thread: Thread; node: Node } | null;

export class Night {
  host: FriendId;
  guest: FriendId | null = null;     // the friend you called, once they're through the door
  calling: { who: FriendId; at: number } | null = null; // rung, on their way: arrives at turn `at`
  beers = 1;                         // each (you and the host crack one each to start)
  turn = 0;
  musicOn = false;
  /** Threads had tonight (ids). */
  readonly had: string[] = [];
  topic: TopicId | null = null;
  idea: BigIdeaId | null = null;
  cut = false;
  /** The best line of the night, for the day summary. */
  quote: { text: string; by: string } | null = null;
  private state: State;
  private current: Turn;
  private pre: Said[] = [];          // lines to lead the next turn with
  private ideaWith: FriendId[] = [];
  private lastAnother = 0;           // the turn "Another one?" last came up

  constructor(private ctx: NightContext) {
    this.host = ctx.host;
    const s = SCRIPTS[this.host];
    this.pre.push(this.say('host', this.pick(s.grabBeer, 'grab')));
    // last night's big idea, if someone else was in on it: word gets around
    const li = ctx.people.lastIdea;
    if (li && li.dayIndex === ctx.dayIndex - 1 && !li.with.includes(this.host) && s.heardIdea.length) {
      this.pre.push(this.say('host', this.pick(s.heardIdea, 'heard'), 'laughing'));
    }
    const first = this.nextThread();
    this.state = first ? { kind: 'thread', thread: first, node: first.nodes[0] } : { kind: 'end' };
    if (first) this.had.push(first.id);
    this.current = this.build({ kind: 'crack' });
  }

  get turnNow(): Turn { return this.current; }
  get over() { return this.state.kind === 'end'; }
  get present(): FriendId[] { return this.guest ? [this.host, this.guest] : [this.host]; }
  get stage(): 1 | 2 | 3 {
    const n = PEOPLE.night;
    if (this.turn >= n.deepFromTurn && this.beers >= n.deepFromBeers) return 3;
    if (this.turn >= n.lifeFromTurn || this.beers >= n.lifeFromBeers) return 2;
    return 1;
  }
  get ideaPartners() { return this.ideaWith; }

  /** Pick option `i` of the current turn. */
  choose(i: number) {
    const opt = this.current.options[i];
    if (!opt || this.state.kind === 'end') return;
    this.turn++;
    let event: Turn['event'];
    const st = this.state;
    if (opt.kind === 'wind') {
      const s = SCRIPTS[this.host];
      const lines = this.pick(s.windUp, 'wind');
      for (const l of lines) this.pre.push(this.line(l));
      if (this.guest) this.pre.push(this.line(this.pick(SCRIPTS[this.guest].love, 'gwind'), 'guest'));
      this.state = { kind: 'end' };
      this.current = this.build({ kind: 'end' });
      return;
    }
    if (opt.kind === 'call' && opt.call) {
      this.pre.push(this.say('you', `Should we ring ${friendById(opt.call).name}?`));
      this.state = { kind: 'phone', who: opt.call, then: st.kind === 'thread' ? this.after(st, undefined) : null };
      this.current = this.build();
      return;
    }
    if (st.kind === 'phone') {
      this.calling = { who: st.who, at: this.turn + PEOPLE.night.arriveAfter };
      this.resume(st.then);
    } else if (st.kind === 'another') {
      const s = SCRIPTS[this.host];
      if (opt.kind === 'yes') { this.beers++; this.pre.push(this.line(this.pick(s.another.yes, 'ay'))); event = { kind: 'crack' }; }
      else this.pre.push(this.line(this.pick(s.another.no, 'an')));
      this.resume(st.then);
    } else if (st.kind === 'thread') {
      const r = st.node.replies[i] as Reply | undefined;
      if (r) {
        this.pre.push(this.say('you', r.text));
        if (r.cut && st.thread.cut) {
          this.cut = true;
          this.state = { kind: 'cut', design: st.thread.cut, by: this.host, then: null };
          this.current = this.build({ kind: 'cut', design: st.thread.cut, by: this.host });
          return;
        }
        const then = this.after(st, r.next);
        // "Another one?": when the reply asks for it, or between threads when nobody's offered in a while
        if (r.another || (!then && this.turn - this.lastAnother >= 4)) {
          this.lastAnother = this.turn;
          this.state = { kind: 'another', then }; this.current = this.build(); return;
        }
        this.resume(then);
      } else this.resume(this.after(st, undefined));
    }
    // the friend you rang walks in
    if (this.calling && this.turn >= this.calling.at && !this.guest) {
      const who = this.calling.who;
      this.guest = who; this.calling = null;
      this.beers++; // they brought more
      for (const l of SCRIPTS[who].arrive) this.pre.push(this.line(l, 'guest'));
      event = { kind: 'arrive', who };
    } else if (this.guest && !this.musicOn && this.beers >= 4) {
      this.musicOn = true;
      const by = this.pickOf([this.host, this.guest], 'mus');
      this.pre.push(this.line(this.pick(SCRIPTS[by].music, 'music'), by === this.host ? 'host' : 'guest'));
      event = { kind: 'music' };
    }
    this.current = this.build(event);
  }

  /** The after-hours cut's done: carry on. `accuracy` 0..1. */
  cutDone(accuracy: number) {
    if (this.state.kind !== 'cut') return;
    const s = SCRIPTS[this.host];
    this.pre.push(this.say('host', this.pick(s.trace.done, 'tdone'), accuracy > 0.7 ? 'animated' : 'laughing'));
    this.resume(null);
    this.current = this.build();
  }

  private after(st: { thread: Thread; node: Node }, next: string | undefined): Resume {
    const n = next ? st.thread.nodes.find(x => x.id === next) : undefined;
    return n ? { thread: st.thread, node: n } : null;
  }

  private resume(r: Resume) {
    if (r) { this.state = { kind: 'thread', ...r }; return; }
    const t = this.nextThread();
    if (!t) { this.state = { kind: 'thread', thread: FALLBACK, node: FALLBACK.nodes[0] }; return; }
    this.had.push(t.id);
    this.state = { kind: 'thread', thread: t, node: t.nodes[0] };
  }

  /** The next thread for tonight: the big idea, the night's argument, a cut, a group bit, or the host's next. */
  private nextThread(): Thread | null {
    const p = this.ctx.people, stage = this.stage, n = PEOPLE.night;
    const ok = (t: Thread) => !this.had.includes(t.id) && (!t.friend || t.friend === this.host) && (!t.group || !!this.guest)
      && (t.needs ?? []).every(f => this.fact(f));
    const lru = (ts: Thread[]) => ts.sort((a, b) => p.usedThreads.lastIndexOf(a.id) - p.usedThreads.lastIndexOf(b.id))[0] ?? null;
    // the big idea, around beer 3
    if (!this.idea && this.beers >= n.bigIdeaAtBeers) {
      const ideas = THREADS.filter(t => t.kind === 'bigIdea' && ok(t));
      const order = (Object.keys(BIG_IDEAS) as BigIdeaId[]).sort((a, b) => p.ideaHistory.lastIndexOf(a) - p.ideaHistory.lastIndexOf(b));
      for (const id of order) {
        const t = ideas.find(x => x.bigIdea === id && x.friend === this.host) ?? ideas.find(x => x.bigIdea === id && !x.friend);
        if (t) { this.idea = id; this.ideaWith = [...this.present]; return t; }
      }
    }
    // one argument a night, the one least recently had
    if (!this.topic && this.turn >= 2 && stage <= 2) {
      const order = (Object.keys(TOPICS) as TopicId[]).sort((a, b) => p.topicHistory.lastIndexOf(a) - p.topicHistory.lastIndexOf(b));
      for (const id of order) {
        const t = THREADS.find(x => x.kind === 'topic' && x.topic === id && ok(x));
        if (t) { this.topic = id; return t; }
      }
    }
    // an after-hours cut, once a night
    if (!this.cut && stage >= 2 && this.beers >= 2 && (this.turn + this.ctx.dayIndex) % 3 === 0) {
      const t = lru(THREADS.filter(x => x.kind === 'cut' && ok(x)));
      if (t) return t;
    }
    // a group bit, every other thread once someone's turned up
    if (this.guest && this.had.length % 2 === 0) {
      const t = lru(THREADS.filter(x => x.kind === 'group' && ok(x)));
      if (t) return t;
    }
    const kind = stage === 1 ? 'shop' : stage === 2 ? 'life' : 'deep';
    return lru(THREADS.filter(x => x.kind === kind && ok(x)))
      ?? lru(THREADS.filter(x => (x.kind === 'life' || x.kind === 'deep' || x.kind === 'shop') && ok(x)));
  }

  private fact(f: Fact): boolean {
    const d = this.ctx.facts, p = this.ctx.people;
    switch (f) {
      case 'fire': return d.fires > 0;
      case 'gift': return !!d.gift;
      case 'late': return d.late > 0;
      case 'pickup': return d.sheets > 0 && d.designs.length > 0;
      case 'busy': return d.sheets >= 6;
      case 'quiet': return d.sheets <= 2;
      case 'scrap': return d.scrapped > 0;
      case 'jess': return d.jessIn;
      case 'fullTime': return d.fullTimeToday;
      case 'lastIdea': return !!p.lastIdea;
      case 'keepsake': return !!d.keepsake;
    }
  }

  /** The turn as shown: lead-in lines, a cut-in from the guest, the node's lines; its two replies, the call, wind it up. */
  private build(event?: Turn['event']): Turn {
    const lines = this.pre.splice(0);
    const options: Option[] = [];
    const st = this.state;
    if (st.kind === 'thread') {
      if (this.guest && this.turn > 0 && hash(`${this.ctx.dayIndex}|${this.turn}|cut`) % 3 === 0 && !lines.some(l => l.who === this.guest)) {
        lines.push(this.line(this.pick(SCRIPTS[this.guest].cutIn, `ci${this.turn}`), 'guest'));
      }
      if (this.guest && this.beers >= 5 && hash(`${this.ctx.dayIndex}|${this.turn}|love`) % 5 === 0) {
        lines.push(this.line(this.pick(SCRIPTS[this.host].love, `lv${this.turn}`)));
      }
      for (const l of st.node.say) { const s = this.lineOrSkip(l); if (s) { lines.push(s); if (l.quote) this.quote = { text: s.text, by: s.name }; } }
      for (const r of st.node.replies) options.push({ text: this.fill(r.text, 'you'), kind: 'reply' });
      // from beer 2: ring someone who isn't here
      if (this.beers >= PEOPLE.night.callFromBeers && !this.calling) {
        for (const f of FRIENDS) if (!this.present.includes(f.id)) options.push({ text: `Should we call ${f.name}?`, kind: 'call', call: f.id });
      }
    } else if (st.kind === 'another') {
      lines.push(this.line(this.pick(SCRIPTS[this.host].another.ask, 'aa')));
      options.push({ text: 'Go on then.', kind: 'yes' }, { text: "Nah, I'm right.", kind: 'no' });
    } else if (st.kind === 'phone') {
      for (const l of SCRIPTS[st.who].phone) { const s = this.line(l, st.who); s.phone = true; lines.push(s); }
      options.push({ text: 'Bring beers.', kind: 'reply' }, { text: 'Get down here, ya goose.', kind: 'reply' });
    } else if (st.kind === 'cut') {
      lines.push(this.say('host', this.pick(SCRIPTS[this.host].trace.start, 'tstart'), 'animated'));
    }
    if (st.kind === 'thread' || st.kind === 'phone' || st.kind === 'another') options.push({ text: 'Wind it up.', kind: 'wind' });
    if (!this.quote && st.kind === 'end') { const l = lines.find(x => x.who !== 'you'); if (l) this.quote = { text: l.text, by: l.name }; }
    return { lines, options, event };
  }

  private lineOrSkip(l: Line): Said | null {
    const who = l.who ?? 'host';
    if (who === 'guest' && !this.guest) return null;
    if (who !== 'host' && who !== 'guest' && who !== 'you' && !this.present.includes(who)) return null;
    return this.line(l);
  }

  private line(l: Line, as?: 'host' | 'guest' | FriendId): Said {
    const who = as ?? l.who ?? 'host';
    const id: Who = who === 'host' ? this.host : who === 'guest' ? (this.guest ?? this.calling?.who ?? this.host) : who;
    return { who: id, name: id === 'you' ? 'You' : friendById(id).name, text: this.fill(l.text, id), expr: l.expr ?? 'relaxed' };
  }
  private say(who: 'host' | 'guest' | 'you', text: string, expr: Expr = 'relaxed'): Said { return this.line({ who, text, expr }); }

  private pick<T>(xs: readonly T[], salt: string): T { return xs[hash(`${this.ctx.dayIndex}|${this.host}|${salt}|${this.turn}`) % xs.length]; }
  private pickOf<T>(xs: T[], salt: string): T { return this.pick(xs, salt); }

  /** Fill a template. `speaker`: whose stance {side} and {take} mean. */
  fill(text: string, speaker: Who): string {
    const d = this.ctx.facts, p = this.ctx.people;
    const absent = FRIENDS.find(f => !this.present.includes(f.id) && f.id !== this.calling?.who);
    const topic = this.topic ? TOPICS[this.topic] : null;
    const me = speaker === 'you' ? this.host : speaker;
    const side = topic ? friendById(me).stances[this.topic!].side : '';
    const vals: Record<string, string> = {
      host: friendById(this.host).name, guest: this.guest ? friendById(this.guest).name : (absent?.name ?? 'someone'),
      eggby: 'Eggby', courtney: 'Courtney', tim: 'Tim Baker', absent: absent?.name ?? 'the others', jess: d.jess,
      sheets: String(d.sheets), design: (d.designs[0] ?? 'that sign').toLowerCase(), design2: (d.designs[1] ?? d.designs[0] ?? 'that sign').toLowerCase(),
      customer: d.customers[0] ?? 'that customer', gift: d.gift?.phrase ?? 'a present', giver: d.gift?.from ?? 'someone',
      late: String(d.late), fires: String(d.fires), side, take: topic ? friendById(me).stances[this.topic!].take : '',
      otherSide: topic ? (topic.sides.find(s => s !== side) ?? topic.sides[0]) : '',
      guestSide: topic && this.guest ? friendById(this.guest).stances[this.topic!].side : '',
      lastIdea: p.lastIdea ? BIG_IDEAS[p.lastIdea.id] : 'a restaurant',
      lastIdeaWith: p.lastIdea ? p.lastIdea.with.map(x => friendById(x).name).join(' and ') : 'someone',
      keepsake: d.keepsake ?? 'the trophy', beers: String(this.beers), idea: this.idea ? BIG_IDEAS[this.idea] : 'it',
    };
    return text.replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m);
  }
}

/** When everything's been had: the friend fills a gap. */
const FALLBACK: Thread = {
  id: 'fallback', kind: 'life', stage: 2, nodes: [{
    id: 'a', say: [{ text: "Good spot, this. Best seat in the inner north.", expr: 'relaxed' }],
    replies: [{ text: 'Milk crate and a fridge. Living the dream.' }, { text: "Couldn't pay me to be anywhere else.", another: true }],
  }],
};

/** The night's over: remember what was talked about (so the next nights rotate) and the line for the day summary. */
export function endNight(n: Night, p: PeopleState, dayIndex: number) {
  p.nights++;
  p.lastFriend = n.host;
  p.usedThreads = [...p.usedThreads.filter(id => !n.had.includes(id)), ...n.had].slice(-200);
  if (n.topic) p.topicHistory = [...p.topicHistory, n.topic].slice(-20);
  if (n.idea) { p.ideaHistory = [...p.ideaHistory, n.idea].slice(-20); p.lastIdea = { id: n.idea, with: n.ideaPartners, dayIndex }; }
  const q = n.quote ?? { text: 'Good night, that.', by: friendById(n.host).name };
  p.lastNight = { dayIndex, who: n.present, beers: n.beers, quote: q.text, quoteBy: q.by, group: !!n.guest };
}
