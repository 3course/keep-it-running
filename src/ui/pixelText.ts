// Chunky pixel lettering, like the signs: a bold monospace drawn tiny, its alpha hardened to whole pixels, an outline and a
// one-pixel drop shade added, then shown scaled up with nearest-neighbour (the caller sets the CSS width as a multiple of
// the canvas width). Crisp at any size, and the same look as the cafe's sign.
export interface PixelTextOptions { size?: number; colour?: string; shade?: string; outline?: string; gap?: number }

export function pixelText(text: string, o: PixelTextOptions = {}): HTMLCanvasElement {
  const size = o.size ?? 12, gap = o.gap ?? 1, pad = 2;
  const font = `bold ${size}px "Courier New", Courier, monospace`;
  const probe = document.createElement('canvas').getContext('2d')!; probe.font = font;
  const cw = Math.max(4, Math.ceil(probe.measureText('M').width));          // monospace: every glyph this wide
  const w = text.length * (cw + gap) - gap + pad * 2 + 2, h = Math.ceil(size * 1.2) + pad * 2 + 2;
  // the glyphs, hardened to on/off pixels
  const m = document.createElement('canvas'); m.width = w; m.height = h;
  const mx = m.getContext('2d', { willReadFrequently: true })!;
  mx.font = font; mx.textBaseline = 'top'; mx.fillStyle = '#000';
  [...text].forEach((ch, i) => mx.fillText(ch, pad + 1 + i * (cw + gap), pad));
  const src = mx.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = src[i * 4 + 3] > 110 ? 1 : 0;
  // compose: outline (the mask grown a pixel), the shade (down a pixel), then the letters
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ox = out.getContext('2d')!;
  const paint = (col: string, f: (x: number, y: number) => boolean) => { ox.fillStyle = col; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f(x, y)) ox.fillRect(x, y, 1, 1); };
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x] === 1;
  paint(o.outline ?? '#14110f', (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy - 1) || at(x + dx, y + dy)) return true; return false; });
  paint(o.shade ?? '#c0561e', (x, y) => at(x, y - 1) && !at(x, y));
  paint(o.colour ?? '#fbe9b8', (x, y) => at(x, y));
  return out;
}

/** Show a pixelText canvas at a whole-number scale that fits `maxWidth` CSS px (at least 2×). */
export function fitPixelText(c: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  const scale = Math.max(2, Math.floor(maxWidth / c.width));
  c.style.width = `${c.width * scale}px`; c.style.height = `${c.height * scale}px`;
  c.style.imageRendering = 'pixelated'; c.style.display = 'block';
  return c;
}
