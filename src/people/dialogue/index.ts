// Everything the night director reads, gathered from the content files. Add a thread to a friend's file (or the shared
// ones) and it's in: tests/dialogue.test.mjs checks the shape and plays nights through.
import type { FriendId, FriendScript, Thread } from './types.js';
import * as eggby from './eggby.js';
import * as courtney from './courtney.js';
import * as tim from './tim.js';
import { IDEA_THREADS, BIG_IDEAS } from './bigIdeas.js';
import { TOPIC_THREADS, TOPICS } from './topics.js';
import { GROUP_THREADS } from './group.js';

export { BIG_IDEAS, TOPICS };
export const SCRIPTS: Record<FriendId, FriendScript> = { eggby: eggby.SCRIPT, courtney: courtney.SCRIPT, tim: tim.SCRIPT };
export const THREADS: Thread[] = [...eggby.THREADS, ...courtney.THREADS, ...tim.THREADS, ...IDEA_THREADS, ...TOPIC_THREADS, ...GROUP_THREADS];
