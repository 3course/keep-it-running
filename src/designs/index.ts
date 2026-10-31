// Which design a job is: picked from the job's kind by a hash of the order, so every sheet of one order (and the
// same order on every reload) is the same design, without the economy (src/sim) knowing designs exist.
import type { Job } from '../sim/types.js';
import { DESIGNS } from './catalogue.js';
import { KIND_FOR_JOB, type Design, type DesignKind } from './types.js';

export { DESIGNS } from './catalogue.js';
export * from './types.js';
export * from './path.js';

export const designById = (id: string): Design | undefined => DESIGNS.find(d => d.id === id);
export const designsOfKind = (k: DesignKind) => DESIGNS.filter(d => d.kind === k && !d.afterHours);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The order a sheet belongs to: its name without the "(2/3)", and when it's due. */
export function orderKey(j: Pick<Job, 'name' | 'dueDay' | 'deadlineMinute' | 'type'>) {
  return `${j.type}|${j.name.replace(/ \(\d+\/\d+\)$/, '')}|${j.dueDay}|${j.deadlineMinute}`;
}

export function designForJob(j: Pick<Job, 'name' | 'dueDay' | 'deadlineMinute' | 'type'>): Design {
  const pool = designsOfKind(KIND_FOR_JOB[j.type]);
  return pool[hash(orderKey(j)) % pool.length];
}
