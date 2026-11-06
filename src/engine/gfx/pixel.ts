// Primitives de dessin pixel art sur canvas hors-écran + couleurs + mini police.

export const VIEW_W = 320;
export const VIEW_H = 180;
export const FLOOR_TOP = 136;
export const FEET_Y = 166;
export const LANE_Y = [166, 158, 151];

type RGB = [number, number, number];

const hexCache = new Map<string, RGB>();
export function rgb(c: string): RGB {
  let v = hexCache.get(c);
  if (v) return v;
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  v = Number.isNaN(n) ? [255, 0, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(c, v);
  return v;
}
export function hex([r, g, b]: RGB): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** amt > 0 éclaircit, amt < 0 assombrit (avec légère teinte froide dans l'ombre). */
export function shade(c: string, amt: number): string {
  const [r, g, b] = rgb(c);
  if (amt >= 0) return hex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]);
  const k = 1 + amt;
  return hex([r * k, g * k, b * k + (1 - k) * 18]);
}
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a); const B = rgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Petit générateur déterministe pour les détails de décor. */
export function srand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export class Gfx {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  constructor(public w: number, public h: number, canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.ctx.imageSmoothingEnabled = false;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  px(x: number, y: number, c: string) { this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  /** Rectangle avec contour */
  box(x: number, y: number, w: number, h: number, fill: string, line: string) {
    this.rect(x, y, w, h, line);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }
  /** Rectangle ombré : haut clair, bas sombre */
  bevel(x: number, y: number, w: number, h: number, c: string, outline = true) {
    if (outline) this.rect(x, y, w, h, shade(c, -0.55));
    const o = outline ? 1 : 0;
    this.rect(x + o, y + o, w - 2 * o, h - 2 * o, c);
    this.rect(x + o, y + o, w - 2 * o, 1, shade(c, 0.25));
    this.rect(x + o, y + h - o - 1, w - 2 * o, 1, shade(c, -0.25));
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, t = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    this.ctx.fillStyle = c;
    const off = Math.floor((t - 1) / 2);
    for (let guard = 0; guard < 2000; guard++) {
      this.ctx.fillRect(x0 - off, y0 - off, t, t);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    this.ctx.fillStyle = c;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.0001))));
      this.ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  }
  disc(cx: number, cy: number, r: number, c: string) { this.ellipse(cx, cy, r, r, c); }
  /** Damier de deux couleurs (tramage) */
  dither(x: number, y: number, w: number, h: number, c: string, step = 2) {
    this.ctx.fillStyle = c;
    for (let j = 0; j < h; j++) for (let i = (j % 2); i < w; i += step) this.ctx.fillRect(x + i, y + j, 1, 1);
  }
  /** Dégradé vertical en bandes tramées */
  gradient(x: number, y: number, w: number, h: number, top: string, bottom: string, bands = 8) {
    const bh = h / bands;
    for (let i = 0; i < bands; i++) {
      const c = mix(top, bottom, i / (bands - 1 || 1));
      this.rect(x, y + i * bh, w, Math.ceil(bh) + 1, c);
      if (i < bands - 1) this.dither(x, Math.round(y + (i + 1) * bh) - 1, w, 1, mix(top, bottom, (i + 1) / (bands - 1 || 1)));
    }
  }
  /** Ajoute un contour sombre autour des pixels opaques (style sprite). */
  outline(color: string, mode: 'outer' | 'all' = 'outer') {
    const { w, h } = this;
    const img = this.ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const [r, g, b] = rgb(color);
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
    const marks: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) marks.push(y * w + x);
    }
    for (const i of marks) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
    void mode;
    this.ctx.putImageData(img, 0, 0);
  }
  text(s: string, x: number, y: number, c: string, opts: { align?: 'left' | 'center' | 'right'; shadow?: string; scale?: number } = {}) {
    drawTinyText(this.ctx, s, x, y, c, opts);
  }
}

// ─────────────────────────── Mini police 3×5 ────────────────────────────────
// Pour les textes dans le décor : enseignes, tableau d'affichage, noms.
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010',
  '?': '110001010000010', '-': '000000111000000', ':': '000010000010000', "'": '010010000000000', '/': '001001010100100',
  '+': '000010111010000', '%': '101001010100101', '&': '010101010101011', '#': '101111101111101', '€': '011100110100011',
  '(': '010100100100010', ')': '010001001001010', '"': '101101000000000', '*': '000101010101000', '=': '000111000111000',
  '♥': '000101111111010', '>': '100010001010100', '<': '001010100010001', '_': '000000000000111',
};
const ACCENTS: Record<string, string> = { À: 'A', Â: 'A', Ä: 'A', Ç: 'C', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Î: 'I', Ï: 'I', Ô: 'O', Ö: 'O', Ù: 'U', Û: 'U', Ü: 'U', Œ: 'O', Ÿ: 'Y' };

export function tinyTextWidth(s: string, scale = 1) { return (s.length * 4 - 1) * scale; }

export function drawTinyText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, c: string, opts: { align?: 'left' | 'center' | 'right'; shadow?: string; scale?: number } = {}) {
  const scale = opts.scale ?? 1;
  const str = s.toUpperCase();
  const w = tinyTextWidth(str, scale);
  let cx = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
  const cy = Math.round(y);
  for (const ch0 of str) {
    const ch = ACCENTS[ch0] ?? ch0;
    const g = GLYPHS[ch] ?? GLYPHS['?'];
    for (let i = 0; i < 15; i++) {
      if (g[i] !== '1') continue;
      const gx = cx + (i % 3) * scale;
      const gy = cy + Math.floor(i / 3) * scale;
      if (opts.shadow) { ctx.fillStyle = opts.shadow; ctx.fillRect(gx + scale, gy + scale, scale, scale); }
      ctx.fillStyle = c;
      ctx.fillRect(gx, gy, scale, scale);
    }
    cx += 4 * scale;
  }
}
