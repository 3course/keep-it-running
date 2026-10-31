// What the people side remembers between days, saved with the world (WorldState.people) in the same localStorage
// save: the part-timer's trust and whether she's full time, who came to knock-off and what you talked about, gifts on
// the walls, the keepsakes you cut after hours, and the cans the morning after.
import type { Design } from '../designs/types.js';
import type { BigIdeaId, FriendId, TopicId } from './dialogue/types.js';

export type GiftKind = 'beer' | 'slice' | 'card' | 'drawing' | 'plant' | 'coffees' | 'cake';

export interface Gift {
  kind: GiftKind;
  from: string;            // who gave it
  design?: string;         // the job it was for (src/designs)
  dayIndex: number;
  /** Where it went (index into its kind's spots). Food and coffees are gone the next day. */
  slot: number;
}

export interface Keepsake {
  design: Design;          // the traced design (its outline is your traced path)
  suggestedBy: FriendId | 'you';
  beers: number;
  accuracy: number;        // 0..1, celebrated whatever it is
  dayIndex: number;
  slot: number;            // where it's hung (wall, door, shelf: KEEPSAKE_SPOTS)
  sheet: 'offcut' | 'sheet';
}

export interface MorningCan { id: number; spot: string; x: number; y: number; z: number }

export interface LastNight { dayIndex: number; who: FriendId[]; beers: number; quote: string; quoteBy: string; group: boolean; lsg?: boolean }

export interface PeopleState {
  v: 1;
  // the part-timer
  trust: number;
  fullTime: boolean;
  fullTimeDay: number | null;     // the dayIndex she said yes
  cakeDay: number | null;         // the dayIndex she brings the cake
  shownToday: string[];           // things you showed her today (a bit change…), once each
  // knock-off
  lastFriend: FriendId | null;
  nights: number;
  usedThreads: string[];          // thread ids already had, oldest first (they come round again once all are used)
  topicHistory: TopicId[];        // newest last
  ideaHistory: BigIdeaId[];
  lastIdea: { id: BigIdeaId; with: FriendId[]; dayIndex: number } | null;
  lastNight: LastNight | null;
  // gifts
  gifts: Gift[];
  pendingGifts: { dayIndex: number; design: string; kind: GiftKind; from: string; minute: number }[];
  /** Gifted cans in the fridge (slabs), drunk first at knock-off. */
  fridgeGifted: number;
  // after hours
  keepsakes: Keepsake[];
  // the morning after
  cans: MorningCan[];
  bagged: number;                 // cans in the refund bag by the door
  /** The night someone had "LSG" in their wallet (it's at most once a week). */
  lsgDay?: number | null;
  /** The morning after that: one odd thing somewhere silly. */
  oddObject?: 'crateOnBed' | 'extinguisherInFridge' | null;
}

export function newPeople(): PeopleState {
  return {
    v: 1, trust: 0, fullTime: false, fullTimeDay: null, cakeDay: null, shownToday: [],
    lastFriend: null, nights: 0, usedThreads: [], topicHistory: [], ideaHistory: [], lastIdea: null, lastNight: null,
    gifts: [], pendingGifts: [], fridgeGifted: 0, keepsakes: [], cans: [], bagged: 0,
  };
}

/** The people state on a world, made if it's an older save that hasn't got one. */
export function people(w: { people?: PeopleState }): PeopleState {
  return (w.people ??= newPeople());
}
