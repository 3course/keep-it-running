import Phaser from 'phaser';

export const PALETTE = {
  bg: 0x14110f,
  panel: 0x241f1a,
  panelLine: 0x4a3f33,
  ink: '#efe6d8',
  dim: '#a2937f',
  good: '#8fd37a',
  bad: '#f08a6b',
  money: '#f2c76b',
  accent: 0xd48a3c,
  accentDark: 0x8f5a22,
  blue: 0x3d6f9e,
  red: 0x9e3d3d,
  green: 0x4e8a46,
  grey: 0x4a4540,
};

export const FONT = 'Courier New, monospace';

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, title?: string) {
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.panel, 1).fillRect(x, y, w, h);
  g.lineStyle(2, PALETTE.panelLine, 1).strokeRect(x, y, w, h);
  if (title) {
    scene.add.text(x + 8, y + 5, title.toUpperCase(), { fontFamily: FONT, fontSize: '11px', color: PALETTE.dim });
  }
  return g;
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 13, color = PALETTE.ink, wrap?: number) {
  const t = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color });
  if (wrap) t.setWordWrapWidth(wrap);
  return t;
}

export interface ButtonOpts {
  color?: number;
  disabled?: boolean;
  size?: number;
}

export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string,
  onClick: () => void, opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const color = opts.disabled ? PALETTE.grey : (opts.color ?? PALETTE.accentDark);
  const rect = scene.add.rectangle(0, 0, w, h, color).setOrigin(0);
  rect.setStrokeStyle(1, 0x000000, 0.5);
  const t = scene.add.text(w / 2, h / 2, text, {
    fontFamily: FONT, fontSize: `${opts.size ?? 12}px`, color: opts.disabled ? PALETTE.dim : PALETTE.ink,
    wordWrap: { width: w - 12 }, align: 'center',
  }).setOrigin(0.5);
  const c = scene.add.container(x, y, [rect, t]);
  if (!opts.disabled) {
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => rect.setFillStyle(Phaser.Display.Color.ValueToColor(color).brighten(15).color));
    rect.on('pointerout', () => rect.setFillStyle(color));
    rect.on('pointerdown', () => onClick());
  }
  return c;
}

export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, frac: number, color: number) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.4).fillRect(x, y, w, h);
  const f = Math.max(0, Math.min(1, frac));
  g.fillStyle(color, 1).fillRect(x, y, w * f, h);
  g.lineStyle(1, PALETTE.panelLine, 1).strokeRect(x, y, w, h);
  return g;
}

export function healthColor(frac: number): number {
  if (frac > 0.6) return PALETTE.green;
  if (frac > 0.3) return PALETTE.accent;
  return PALETTE.red;
}

export const BUILD_TAG = 'v0.1 — playtest build';

/** Small build label in the bottom-right corner of every scene. */
export function buildTag(scene: Phaser.Scene) {
  return label(scene, 1020, 638, BUILD_TAG, 9, PALETTE.dim).setOrigin(1, 1).setDepth(10);
}

/** Copy text to the clipboard; falls back to execCommand where the async API isn't allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const money =(n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-AU');
export const pct = (f: number) => `${(f * 100).toFixed(0)}%`;
