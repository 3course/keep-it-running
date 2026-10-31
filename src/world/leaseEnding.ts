// How a lease ended, from the spare at day 20 (cash in the bank less the rent). Plain: the sim's --lease report uses it.
//   short       more than graceShort under the rent
//   scraped     within graceShort under (the landlord takes what's there; the rest rides to the next lease) up to scrapedUnder over
//   made        made it, a bit left over
//   comfortable comfortably
//   flying      flying (Jess goes full time on the spot; Dennis has a spreadsheet ready)
import { CONFIG } from '../config.js';

export type Ending = 'flying' | 'comfortable' | 'made' | 'scraped' | 'short';
/** Best first. */
export const ENDINGS: Ending[] = ['flying', 'comfortable', 'made', 'scraped', 'short'];

export function outcome(cash: number, rent: number): Ending {
  const L = CONFIG.lease.endings, spare = cash - rent;
  if (spare < -L.graceShort) return 'short';
  if (spare < L.scrapedUnder) return 'scraped';
  if (spare < L.comfortableFrom) return 'made';
  if (spare < L.flyingFrom) return 'comfortable';
  return 'flying';
}

/** What rides over to the next lease: the shortfall the landlord let go (scraped, short of the rent). */
export const owedAfter = (cash: number, rent: number) => (outcome(cash, rent) === 'scraped' ? Math.max(0, Math.round(rent - cash)) : 0);
