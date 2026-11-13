// Which layout the screen gets, by its shape alone (never by device): portrait when it's taller than it's wide (a phone
// held up), landscape otherwise (a phone on its side, a monitor, a TV at 1280×720 or 1920×1080). Portrait is the phone
// game as it's always been. Landscape is a first-class layout for a 16:9 screen across a room: the HUD is scaled from
// the screen's height so the smallest text is still readable from the couch at 720p, and everything sits inside a 5%
// safe area on every edge (TV overscan).
//
// The numbers go on the document root as CSS variables, so every card picks them up wherever it's mounted:
//   --s     HUD scale (1 on the reference phone)
//   --tvx   the horizontal safe inset (5% of the width in landscape, else 0)
//   --tvy   the vertical safe inset (5% of the height in landscape, else 0)
//   --fmin  the smallest font size before scaling (landscape: 12px, so ×--s it's 16px at 720p, 24px at 1080p)

export type ViewLayout = 'portrait' | 'landscape';

export const LANDSCAPE = {
  safe: 0.05,         // of each edge
  scaleFromHeight: 540, // --s = height / this (720p → 1.33, 1080p → 2)
  maxScale: 2,
  minFontPx: 12,      // before --s
} as const;

/** Portrait unless the screen is wider than it's tall. */
export function layoutFor(w: number, h: number): ViewLayout {
  return w > h ? 'landscape' : 'portrait';
}

/** The HUD scale for a w×h screen: 1 on a phone; in landscape, from the height (so 720p and 1080p read the same). */
export function hudScale(w: number, h: number): number {
  if (layoutFor(w, h) === 'portrait') return Math.min(1.8, Math.max(1, Math.min(w, h) / 600));
  return Math.min(LANDSCAPE.maxScale, Math.max(1, h / LANDSCAPE.scaleFromHeight));
}

/** Set the layout's CSS variables on the document root (and a class for layout-specific rules). */
export function applyViewLayout(w: number, h: number): ViewLayout {
  const lay = layoutFor(w, h), root = document.documentElement, land = lay === 'landscape';
  root.style.setProperty('--s', String(hudScale(w, h)));
  root.style.setProperty('--tvx', land ? `${Math.round(w * LANDSCAPE.safe)}px` : '0px');
  root.style.setProperty('--tvy', land ? `${Math.round(h * LANDSCAPE.safe)}px` : '0px');
  root.style.setProperty('--fmin', land ? `${LANDSCAPE.minFontPx}px` : '0px');
  root.classList.toggle('kir-land', land);
  root.dataset.layout = lay;
  return lay;
}
