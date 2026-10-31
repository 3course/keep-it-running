// The knock-off beers conversation, as data. A night is a run of short threads; each thread is a little branching
// graph of nodes. Every turn the friend (and, once they've turned up, the friend you called) says a line or two, and
// you get exactly two replies — the director adds "Wind it up" (and "Should we call…?" from beer 2). Text is a
// template ({design}, {customer}, {side}…: see TEMPLATE_KEYS in ../night.ts); the slur filter goes over it on screen.

export type FriendId = 'eggby' | 'courtney' | 'tim' | 'dennis';

/** Faces the friend can pull. Tag a line with one; untagged lines are relaxed. */
export type Expr = 'relaxed' | 'laughing' | 'thoughtful' | 'misty' | 'animated';

/** 1: shop talk (today), 2: life (family, the business, what you'd do differently), 3: the big stuff. */
export type Stage = 1 | 2 | 3;

/**
 * Who says it: the night's friend (`host`), the friend you called once they've arrived (`guest`; the line is skipped
 * if nobody's been called), `you`, or a friend by id (only said if they're there).
 */
export type Speaker = 'host' | 'guest' | 'you' | FriendId;

export interface Line {
  who?: Speaker;           // default: host
  text: string;
  expr?: Expr;
  /** Worth remembering: the day summary's "Last night" can quote it. */
  quote?: boolean;
}

export interface Reply {
  text: string;
  /** Node id in the same thread. Omit: the thread's done after this reply. */
  next?: string;
  /** "Another one?" comes next: say yes and it's one more each. */
  another?: boolean;
  /** Starts the after-hours cut (a `cut` thread's yes). */
  cut?: boolean;
}

export interface Node {
  id: string;
  say: Line[];
  /** Exactly two. */
  replies: [Reply, Reply];
}

export type ThreadKind = 'shop' | 'life' | 'deep' | 'bigIdea' | 'topic' | 'cut' | 'group';

/** Things that happened today, for shop talk that only makes sense if they did. */
export type Fact = 'fire' | 'gift' | 'late' | 'pickup' | 'busy' | 'quiet' | 'scrap' | 'jess' | 'fullTime' | 'lastIdea' | 'keepsake';

export type TopicId = 'festival' | 'craftBeer' | 'pubs' | 'suburbs' | 'housePrices'
  | 'band' | 'cycling' | 'footy' | 'coffee' | 'bunnings' | 'kids' | 'ferment' | 'uteTarago' | 'aches' | 'wine' | 'radio' | 'parents';
export type BigIdeaId = 'restaurant' | 'foodTruck' | 'podcast' | 'boat' | 'brewery' | 'castlemaine';

export interface Thread {
  id: string;
  kind: ThreadKind;
  /** Only on this friend's nights. Omit: anyone's. */
  friend?: FriendId;
  stage: Stage;
  /** Only when every one of these happened today. */
  needs?: Fact[];
  topic?: TopicId;
  bigIdea?: BigIdeaId;
  /** kind 'cut': the design the friend's suggesting (src/designs, afterHours), or 'freehand'. */
  cut?: string;
  /**
   * Topics: when the night's already at the big stuff (stage 3), the thread ends on one line that turns it sincere
   * ("I miss making something that wasn't for a customer") and one that recovers with a joke.
   */
  sincere?: { turn: Line; recover: Line };
  /** Only once the friend you called is here (group threads). */
  group?: boolean;
  /** nodes[0] is where it starts. */
  nodes: Node[];
}

/** The set pieces round the threads, per friend. Lines are templates too. */
export interface FriendScript {
  /** At the roller door at 5. */
  greet: string[];
  /** You said "Grab a beer". */
  grabBeer: string[];
  /** You said "Head home". */
  headHome: string[];
  /** After a reply that leads to "Another one?". */
  another: { ask: Line[]; yes: Line[]; no: Line[] };
  /** "Wind it up": always warm. One is picked. */
  windUp: Line[][];
  /** Rung up ("Should we call {name}?"): they answer. */
  phone: Line[];
  /** Through the roller door with more beers. */
  arrive: Line[];
  /** Cutting in once they've arrived (said before the host's line some turns). */
  cutIn: Line[];
  /** Group nights: the soppy bit. */
  love: Line[];
  /** Group nights: putting music on. */
  music: Line[];
  /** Live comments while you trace an after-hours cut. */
  trace: { start: string[]; wobbly: string[]; good: string[]; done: string[] };
  /** Next night, if last night's friend pitched a big idea with someone else: "Heard you two were opening {lastIdea}". */
  heardIdea: string[];
}
