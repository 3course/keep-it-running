// Player settings, kept in localStorage and shared by the title screen and the pause card: sound and music volume, text
// speed (how long speech bubbles stay), graphics (Auto, or the plain pipelines the ?safe tiers already give), and reduce
// motion. Reading is safe anywhere (blocked storage: the defaults); changing one saves it and tells whoever's listening.
import { TEXT } from './ui/talk.js';
import { WORLD } from './world/worldConfig.js';
import { getJson, isObject, KEYS, setItem } from './storage.js';

export type TextSpeed = 'slow' | 'normal' | 'fast';
/** auto: whatever the GPU probe says. low: the plain pipeline (?safe=1). bare: and no shadows (?safe=2). */
export type Graphics = 'auto' | 'low' | 'bare';
export interface Settings { sound: number; music: number; textSpeed: TextSpeed; graphics: Graphics; reduceMotion: boolean }

export const DEFAULT_SETTINGS: Settings = { sound: 1, music: 1, textSpeed: 'normal', graphics: 'auto', reduceMotion: false };

function load(): Settings {
  try {
    const raw = (getJson(KEYS.settings, isObject) ?? {}) as Partial<Settings>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
    return {
      sound: num(raw.sound, DEFAULT_SETTINGS.sound), music: num(raw.music, DEFAULT_SETTINGS.music),
      textSpeed: raw.textSpeed === 'slow' || raw.textSpeed === 'fast' ? raw.textSpeed : 'normal',
      graphics: raw.graphics === 'low' || raw.graphics === 'bare' ? raw.graphics : 'auto',
      reduceMotion: raw.reduceMotion === true,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

/** The live settings (read them where you need them; change them with setSetting). */
export const SETTINGS: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function apply() { TEXT.holdMult = WORLD.textSpeedMult[SETTINGS.textSpeed]; }
apply();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  SETTINGS[key] = value;
  setItem(KEYS.settings, JSON.stringify(SETTINGS)); // (blocked: it holds for this session)
  apply();
  for (const f of listeners) f(SETTINGS);
}

/** Be told when a setting changes (sound and music volume apply live). Returns the unsubscribe. */
export function onSettings(f: (s: Settings) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/**
 * The query string the GPU probe should read: the graphics setting stands in for ?safe= (an explicit ?safe= in the URL
 * still wins, so test links and bug reports behave as they always did).
 */
export function graphicsSearch(search: string, graphics: Graphics = SETTINGS.graphics): string {
  const q = new URLSearchParams(search);
  if (!q.has('safe') && graphics !== 'auto') q.set('safe', graphics === 'bare' ? '2' : '1');
  const s = q.toString();
  return s ? `?${s}` : '';
}
