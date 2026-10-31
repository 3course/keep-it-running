// Drunk spelling. Beer 1: perfect. From beer 2, a seeded filter roughs words up — swapped letters, doubled letters,
// dropped vowels, "mate" → "maaaate", apostrophes gone, the odd emotional word in CAPS — more with every beer, capped
// so it stays readable. Deterministic: the same text, beers and seed always come out the same.
import { PEOPLE } from './config.js';

const EMOTIONAL = new Set(['love', 'mate', 'mates', 'proud', 'best', 'beautiful', 'legend', 'legends', 'brilliant', 'always', 'never',
  'everything', 'friend', 'friends', 'mean', 'means', 'meant', 'genius', 'serious', 'seriously', 'amazing', 'family', 'honestly', 'perfect', 'ever']);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const unit = (s: string) => hash(s) / 4294967296;

/** How rough it gets at this many beers: 0 at one beer, rising, capped. */
export function slurStrength(beers: number) {
  return beers <= 1 ? 0 : Math.min(PEOPLE.night.slurMax, (beers - 1) * PEOPLE.night.slurPerBeer);
}

const isVowel = (c: string) => 'aeiouAEIOU'.includes(c);

function roughen(word: string, r: number): string {
  // keep the first and last letters; mess with the middle
  if (word.length < 4) return word.length === 3 && r < 0.3 ? word[0] + word[1] + word[1] + word[2] : word;
  const mid = 1 + Math.floor(r * 997) % (word.length - 2);
  if (!/[A-Za-z]/.test(word[mid]) || !/[A-Za-z]/.test(word[mid + 1] ?? '')) return word; // letters only, never an apostrophe
  const kind = Math.floor(r * 7919) % 3;
  if (kind === 0) return word.slice(0, mid) + word[mid + 1] + word[mid] + word.slice(mid + 2);       // swap
  if (kind === 1) return word.slice(0, mid) + word[mid] + word.slice(mid);                            // double
  for (let i = mid; i < word.length - 1; i++) if (isVowel(word[i])) return word.slice(0, i) + word.slice(i + 1); // drop a vowel
  return word.slice(0, mid) + word[mid] + word.slice(mid);
}

/** `text` after this many beers. `seed`: anything stable for this line (so it doesn't shimmer frame to frame). */
export function slur(text: string, beers: number, seed: string | number = 0): string {
  const s = slurStrength(beers);
  if (s <= 0) return text;
  let wi = 0, touched = 0;
  const words = text.match(/[A-Za-z']+|[^A-Za-z']+/g) ?? [];
  const total = words.filter(w => /[A-Za-z]/.test(w)).length || 1;
  return words.map(tok => {
    if (!/[A-Za-z]/.test(tok)) return tok;
    const i = wi++;
    const r = unit(`${seed}|${i}|${tok}`);
    let w = tok;
    // apostrophes go first and often
    if (w.includes("'") && unit(`${seed}|a|${i}`) < s * 2.2) w = w.replace(/'/g, '');
    const lower = w.toLowerCase();
    // "mate" stretches with every beer
    if (lower === 'mate' || lower === 'maaate') {
      const n = Math.min(5, 1 + Math.round(s * 14));
      return w[0] + 'a'.repeat(n) + 'te';
    }
    // never touch more than a third of the words: it has to stay readable
    if (touched / total >= 0.34) return w;
    if (EMOTIONAL.has(lower) && r < s * 1.6) { touched++; return w.toUpperCase(); }
    if (r < s) { touched++; return roughen(w, unit(`${seed}|r|${i}`)); }
    return w;
  }).join('');
}
