// ─────────────────────────────────────────────────────────────────────────────
// Décors procéduraux : murs, sols, ciels, arrière-plans et une bibliothèque de
// « props » paramétrables (portes, lits, casiers, tribunes, buts, immeubles…).
// Un lieu est décrit en JSON ; il est rendu en calques (lointain / principal /
// premier plan) + éléments animés (foule, écrans, néons) + halos lumineux.
// ─────────────────────────────────────────────────────────────────────────────
import type { LocationDef, PropDef } from '../../core/model/types';
import { col, NAMED_COLORS } from './character';
import { FLOOR_TOP, Gfx, mix, shade, srand, VIEW_H, VIEW_W, drawTinyText } from './pixel';

export type TimeOfDay = 'aube' | 'jour' | 'soir' | 'nuit';
export const PARALLAX = 0.35;

export interface Glow { x: number; y: number; r: number; color: string; alpha: number; night?: boolean }
export interface AnimatedProp { layer: 'far' | 'main' | 'front'; draw(ctx: CanvasRenderingContext2D, t: number): void }

export interface RenderedLocation {
  width: number;
  far: HTMLCanvasElement | null;
  farWidth: number;
  main: HTMLCanvasElement;
  front: HTMLCanvasElement;
  anim: AnimatedProp[];
  glows: Glow[];
  time: TimeOfDay;
  interior: boolean;
}

export interface SceneEnv {
  /** couleur (gère « $variable » et les noms français) */
  color(v: unknown, fallback: string): string;
  num(v: unknown, fallback: number): number;
  text(v: unknown): string;
  test(cond: string | undefined): boolean;
}

interface Ctx {
  g: Gfx; env: SceneEnv; time: TimeOfDay; rnd: () => number; width: number; interior: boolean;
  anim: AnimatedProp[]; glows: Glow[]; layer: 'far' | 'main' | 'front'; base: number;
}

const night = (t: TimeOfDay) => t === 'nuit';
export const SKY: Record<TimeOfDay, [string, string]> = {
  aube: ['#f2a37f', '#ffe1b0'], jour: ['#6fb8ea', '#cdeeff'], soir: ['#5a3c7a', '#f08a52'], nuit: ['#0a1028', '#1f2d5e'],
};

// ───────────────────────────── Murs et sols ────────────────────────────────

function drawWall(c: Ctx, style: string, color: string, color2: string) {
  const { g, width } = c;
  const H = FLOOR_TOP;
  g.rect(0, 0, width, H, color);
  switch (style) {
    case 'briques': {
      const m = shade(color, -0.22);
      for (let y = 8; y < H; y += 6) {
        g.rect(0, y, width, 1, m);
        const off = (y / 6) % 2 ? 0 : 6;
        for (let x = off; x < width; x += 12) g.rect(x, y + 1, 1, 5, m);
      }
      for (let i = 0; i < width / 6; i++) g.px(c.rnd() * width, 8 + c.rnd() * (H - 8), shade(color, 0.1));
      break;
    }
    case 'carrelage': {
      const m = shade(color, -0.12);
      for (let y = 10; y < H; y += 8) g.rect(0, y, width, 1, m);
      for (let x = 0; x < width; x += 8) g.rect(x, 10, 1, H - 10, m);
      if (color2 !== color) g.rect(0, H - 34, width, 2, color2);
      break;
    }
    case 'lambris': {
      const top = H - 46;
      g.rect(0, top, width, 46, color2);
      g.rect(0, top, width, 2, shade(color2, 0.25));
      for (let x = 0; x < width; x += 16) { g.rect(x, top + 6, 1, 36, shade(color2, -0.2)); g.rect(x + 3, top + 8, 10, 30, shade(color2, 0.06)); }
      break;
    }
    case 'papier':
      for (let x = 0; x < width; x += 10) g.rect(x, 8, 4, H - 8, shade(color, 0.07));
      for (let x = 5; x < width; x += 10) for (let y = 14; y < H; y += 12) g.px(x + 2, y, color2);
      break;
    case 'beton': {
      const m = shade(color, -0.12);
      for (let y = 20; y < H; y += 24) g.rect(0, y, width, 1, m);
      for (let y = 20, r = 0; y < H; y += 24, r++) for (let x = r % 2 ? 0 : 24; x < width; x += 48) g.rect(x, y, 1, 24, m);
      for (let i = 0; i < width / 3; i++) g.px(c.rnd() * width, c.rnd() * H, shade(color, (c.rnd() - 0.5) * 0.12));
      break;
    }
    case 'bois':
      for (let x = 0; x < width; x += 7) { g.rect(x, 0, 1, H, shade(color, -0.2)); if (c.rnd() < 0.4) g.px(x + 3, c.rnd() * H, shade(color, -0.25)); }
      break;
    case 'vitre': {
      const [a, b] = SKY[c.time];
      g.rect(0, 0, width, H, shade(color, -0.1));
      for (let x = 4; x < width - 4; x += 40) {
        g.gradient(x, 14, 36, H - 30, a, b, 6);
        g.rect(x + 4, 18, 2, H - 40, 'rgba(255,255,255,0.25)');
      }
      break;
    }
    case 'sombre':
      for (let x = 0; x < width; x += 20) g.rect(x, 0, 10, H, shade(color, 0.04));
      break;
    case 'moderne':
      g.rect(0, H - 40, width, 40, shade(color, -0.08));
      g.rect(0, H - 42, width, 3, color2);
      break;
    default:
      for (let i = 0; i < width / 4; i++) g.px(c.rnd() * width, 8 + c.rnd() * (H - 8), shade(color, (c.rnd() - 0.5) * 0.06));
  }
  // plafond + plinthe
  g.rect(0, 0, width, 6, shade(color, -0.35));
  g.rect(0, 6, width, 1, shade(color, -0.2));
  g.rect(0, H - 4, width, 4, shade(color2 !== color ? color2 : color, -0.3));
  g.rect(0, H - 4, width, 1, shade(color2 !== color ? color2 : color, -0.1));
}

function drawFloor(c: Ctx, style: string, color: string, color2: string, top: number) {
  const { g, width } = c;
  const h = VIEW_H - top;
  g.rect(0, top, width, h, color);
  switch (style) {
    case 'parquet': {
      let y = top; let step = 3;
      while (y < VIEW_H) { g.rect(0, y, width, 1, shade(color, -0.18)); const off = Math.floor(c.rnd() * 30); for (let x = off; x < width; x += 30 + step * 4) g.rect(x, y, 1, step, shade(color, -0.18)); y += step; step += 1; }
      break;
    }
    case 'carrelage': {
      let y = top; let step = 4; let row = 0;
      while (y < VIEW_H) {
        for (let x = 0, i = 0; x < width; x += 14, i++) if ((i + row) % 2 && color2 !== color) g.rect(x, y, 14, step, color2);
        g.rect(0, y, width, 1, shade(color, -0.15));
        y += step; step += 2; row++;
      }
      for (let x = 0; x < width; x += 14) g.rect(x, top, 1, h, shade(color, -0.12));
      break;
    }
    case 'moquette': g.dither(0, top, width, h, shade(color, -0.08), 3); break;
    case 'beton': case 'lino': {
      for (let y = top + 6; y < VIEW_H; y += 10) g.rect(0, y, width, 1, shade(color, -0.1));
      for (let i = 0; i < width / 2; i++) g.px(c.rnd() * width, top + c.rnd() * h, shade(color, (c.rnd() - 0.5) * 0.15));
      break;
    }
    case 'herbe': case 'terrain': case 'synthetique': {
      const stripe = style === 'herbe' ? 0 : 32;
      if (stripe) for (let x = 0; x < width; x += stripe * 2) g.rect(x, top, stripe, h, shade(color, 0.07));
      for (let i = 0; i < width * 1.2; i++) g.px(c.rnd() * width, top + c.rnd() * h, shade(color, c.rnd() < 0.5 ? -0.14 : 0.12));
      if (style !== 'herbe') {
        const lineC = style === 'synthetique' ? '#f4f4f4' : '#eef5ea';
        g.rect(0, top + 3, width, 1, lineC);
        g.rect(0, VIEW_H - 3, width, 1, lineC);
        if (width >= 560 && style === 'terrain') {
          g.rect(Math.round(width / 2), top + 3, 1, h - 6, lineC);
          g.rect(width - 70, top + 12, 70, 1, lineC); g.rect(width - 70, top + 12, 1, h - 20, lineC);
          g.rect(0, top + 12, 70, 1, lineC); g.rect(70, top + 12, 1, h - 20, lineC);
        }
      }
      break;
    }
    case 'bitume': case 'trottoir': {
      const sw = style === 'trottoir' ? 14 : 0;
      if (sw) {
        g.rect(0, top, width, sw, color2);
        for (let x = 0; x < width; x += 12) g.rect(x, top, 1, sw, shade(color2, -0.15));
        g.rect(0, top + sw, width, 2, shade(color2, -0.3));
      }
      for (let i = 0; i < width; i++) g.px(c.rnd() * width, top + sw + 2 + c.rnd() * (h - sw), shade(color, (c.rnd() - 0.5) * 0.2));
      if (style === 'trottoir') for (let x = 10; x < width; x += 40) g.rect(x, top + sw + 18, 18, 2, '#e8e2c8');
      break;
    }
    case 'sable': g.dither(0, top, width, h, shade(color, 0.08), 3); break;
  }
  g.rect(0, top, width, 1, shade(color, -0.25));
}

// ───────────────────────────── Ciel et lointain ─────────────────────────────

function drawSky(c: Ctx, w: number) {
  const { g, time } = c;
  const [a, b] = SKY[time];
  g.gradient(0, 0, w, 140, a, b, 9);
  if (time === 'nuit') {
    for (let i = 0; i < w / 4; i++) g.px(c.rnd() * w, c.rnd() * 90, c.rnd() < 0.3 ? '#ffffff' : '#9fb0d8');
    g.disc(w * 0.75, 26, 7, '#f3efd8'); g.disc(w * 0.75 + 3, 24, 6, mix(a, '#f3efd8', 0.15));
  } else if (time === 'jour') {
    g.disc(w * 0.82, 24, 9, '#fff3c4'); g.disc(w * 0.82, 24, 7, '#fffbe6');
  } else {
    g.disc(w * 0.7, 92, 13, time === 'soir' ? '#ffb46b' : '#ffd29a');
  }
}

function cloudAnim(c: Ctx, farW: number) {
  if (c.time === 'nuit') return;
  const rnd = srand(77);
  const clouds = Array.from({ length: Math.ceil(farW / 70) }, () => ({ x: rnd() * farW, y: 12 + rnd() * 40, w: 18 + rnd() * 26, s: 0.6 + rnd() * 1.2 }));
  const colr = c.time === 'jour' ? '#ffffff' : '#ffd8c0';
  c.anim.push({
    layer: 'far',
    draw(ctx, t) {
      for (const cl of clouds) {
        const x = Math.round(((cl.x + t * cl.s) % (farW + 60)) - 40);
        ctx.fillStyle = colr;
        ctx.fillRect(x, Math.round(cl.y), Math.round(cl.w), 4);
        ctx.fillRect(x + 4, Math.round(cl.y) - 3, Math.round(cl.w * 0.5), 3);
        ctx.fillRect(x + Math.round(cl.w * 0.45), Math.round(cl.y) - 5, Math.round(cl.w * 0.35), 5);
        ctx.fillStyle = 'rgba(160,180,210,0.35)';
        ctx.fillRect(x, Math.round(cl.y) + 3, Math.round(cl.w), 1);
      }
    },
  });
}

// ───────────────────────────── Bibliothèque de props ────────────────────────

type PropFn = (c: Ctx, p: PropDef, x: number) => void;

const windowLit = (c: Ctx) => (night(c.time) || c.time === 'soir') && c.rnd() < 0.55;

function people(c: Ctx, x0: number, y0: number, w: number, rows: number, colors: string[], density = 0.85) {
  // Foule de tribune animée (têtes + corps qui sautillent)
  const seats: { x: number; y: number; c: string; skin: string; ph: number }[] = [];
  const skins = ['#f1c9a8', '#d9a57c', '#b97d55', '#8e5a39', '#5f3b26', '#efc29e'];
  for (let r = 0; r < rows; r++) for (let x = x0 + (r % 2) * 2; x < x0 + w - 2; x += 4) {
    if (c.rnd() > density) continue;
    seats.push({ x, y: y0 + r * 6, c: colors[Math.floor(c.rnd() * colors.length)], skin: skins[Math.floor(c.rnd() * skins.length)], ph: c.rnd() * 6 });
  }
  c.anim.push({
    layer: c.layer,
    draw(ctx, t) {
      const hype = (globalThis as unknown as { __crowdHype?: number }).__crowdHype ?? 0.3;
      for (const s of seats) {
        const bob = Math.sin(t * (2 + hype * 6) + s.ph) > 1 - hype * 1.6 ? -1 : 0;
        ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y + 2 + bob, 3, 3);
        ctx.fillStyle = s.skin; ctx.fillRect(s.x + 1, s.y + bob, 2, 2);
        if (hype > 0.75 && bob) { ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y - 2, 1, 2); ctx.fillRect(s.x + 3, s.y - 2, 1, 2); }
      }
    },
  });
}

const PROPS: Record<string, PropFn> = {
  // ── Structure intérieure
  porte(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 20); const h = c.env.num(p.h, 36);
    const frame = c.env.color(p.color2, '#5b4636');
    const door = c.env.color(p.color, '#8a6646');
    const x0 = Math.round(x - w / 2); const y0 = base - h;
    g.rect(x0 - 2, y0 - 2, w + 4, h + 2, frame);
    if (p.style === 'vitre') { g.rect(x0, y0, w, h, '#9cc8df'); g.rect(x0 + w / 2, y0, 1, h, frame); g.rect(x0 + 3, y0 + 3, 2, h - 8, 'rgba(255,255,255,0.4)'); }
    else if (p.style === 'metal') { g.rect(x0, y0, w, h, door); g.rect(x0 + 2, y0 + 4, w - 4, 10, shade(door, 0.15)); g.rect(x0 + 2, y0 + 18, w - 4, 1, shade(door, -0.2)); }
    else { g.rect(x0, y0, w, h, door); g.rect(x0 + 3, y0 + 4, w - 6, 12, shade(door, -0.12)); g.rect(x0 + 3, y0 + 20, w - 6, 12, shade(door, -0.12)); }
    g.rect(x0 + w - 5, y0 + h / 2, 2, 2, '#e3c26a');
    if (p.label) {
      const t = c.env.text(p.label);
      const tw = Math.max(20, t.length * 4 + 4);
      g.rect(x - tw / 2, y0 - 11, tw, 8, '#2a2e3a'); g.rect(x - tw / 2 + 1, y0 - 10, tw - 2, 6, '#f2efe6');
      drawTinyText(g.ctx, t, x, y0 - 9, '#2a2e3a', { align: 'center' });
    }
  },
  fenetre(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 32); const h = c.env.num(p.h, 26); const y0 = c.env.num(p.y, 40);
    const x0 = Math.round(x - w / 2);
    const [a, b] = SKY[c.time];
    g.rect(x0 - 2, y0 - 2, w + 4, h + 4, c.env.color(p.color, '#e8e4dc'));
    g.gradient(x0, y0, w, h, a, b, 4);
    if (c.time === 'nuit') for (let i = 0; i < 4; i++) g.px(x0 + c.rnd() * w, y0 + c.rnd() * h * 0.6, '#ffffff');
    else g.rect(x0 + 3, y0 + h - 8, w - 6, 8, shade(b, -0.25));
    g.rect(x0 + w / 2, y0, 1, h, c.env.color(p.color, '#e8e4dc')); g.rect(x0, y0 + h / 2, w, 1, c.env.color(p.color, '#e8e4dc'));
    g.rect(x0 + 2, y0 + 2, 2, h / 2 - 3, 'rgba(255,255,255,0.45)');
    g.rect(x0 - 3, y0 + h + 2, w + 6, 2, shade(c.env.color(p.color, '#e8e4dc'), -0.2));
    if (p.rideaux) { const rc = c.env.color(p.rideaux, '#b04848'); g.rect(x0 - 5, y0 - 4, 6, h + 8, rc); g.rect(x0 + w - 1, y0 - 4, 6, h + 8, rc); g.rect(x0 - 5, y0 - 5, w + 10, 2, shade(rc, -0.3)); }
    if (!c.interior) return;
    if (c.time !== 'nuit') c.glows.push({ x, y: y0 + h / 2, r: w, color: '#fff6d8', alpha: 0.12 });
  },
  affiche(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 16); const h = c.env.num(p.h, 22); const y0 = c.env.num(p.y, 46);
    const bg = c.env.color(p.color, '#d94f4f'); const fg = c.env.color(p.color2, '#f6e7c8');
    const x0 = Math.round(x - w / 2);
    g.box(x0, y0, w, h, bg, shade(bg, -0.4));
    const v = String(p.variante ?? 'joueur');
    if (v === 'joueur') { g.disc(x0 + w / 2, y0 + 6, 2, fg); g.rect(x0 + w / 2 - 1, y0 + 8, 3, 6, fg); g.line(x0 + w / 2, y0 + 13, x0 + w / 2 + 4, y0 + 17, fg); g.line(x0 + w / 2, y0 + 13, x0 + w / 2 - 3, y0 + 18, fg); g.disc(x0 + w - 4, y0 + h - 4, 1, '#ffffff'); }
    else if (v === 'groupe') { for (let i = 0; i < 3; i++) g.rect(x0 + 3 + i * 4, y0 + 6 + (i % 2), 3, 8, fg); g.rect(x0 + 2, y0 + h - 5, w - 4, 2, fg); }
    else if (v === 'texte') { for (let y = y0 + 4; y < y0 + h - 3; y += 3) g.rect(x0 + 3, y, w - 6, 1, fg); }
    else { g.disc(x0 + w / 2, y0 + h / 2, Math.min(w, h) / 3, fg); }
  },
  cadre(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 22); const h = c.env.num(p.h, 16); const y0 = c.env.num(p.y, 48);
    const x0 = Math.round(x - w / 2);
    g.rect(x0 - 2, y0 - 2, w + 4, h + 4, c.env.color(p.color, '#8a6a3a'));
    g.gradient(x0, y0, w, h, '#8cc6e6', '#d8eef8', 3);
    g.rect(x0, y0 + h - 5, w, 5, '#5f9a4a'); g.disc(x0 + w - 6, y0 + 4, 2, '#fff2b0');
    for (let i = 0; i < w; i += 5) g.rect(x0 + i, y0 + h - 7 - (i % 3), 4, 3, '#4a8040');
  },
  tableau_blanc(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 48); const h = c.env.num(p.h, 28); const y0 = c.env.num(p.y, 46);
    const x0 = Math.round(x - w / 2);
    g.box(x0, y0, w, h, '#f3f5f7', '#8f96a3');
    g.rect(x0, y0 + h, w, 2, '#8f96a3');
    if (p.tactique !== false) {
      g.rect(x0 + w / 2, y0 + 3, 1, h - 6, '#9bb5d6');
      for (let i = 0; i < 4; i++) { g.px(x0 + 6 + i * 4, y0 + 6 + (i % 2) * 8, '#2f62c9'); g.px(x0 + w - 8 - i * 3, y0 + 8 + (i % 2) * 7, '#d63c3c'); }
      g.line(x0 + 8, y0 + 18, x0 + 20, y0 + 10, '#2f62c9'); g.px(x0 + 20, y0 + 9, '#2f62c9');
      g.line(x0 + 26, y0 + 20, x0 + 34, y0 + 14, '#d63c3c');
    } else for (let y = y0 + 5; y < y0 + h - 4; y += 4) g.rect(x0 + 4, y, w * 0.6, 1, '#7d8aa0');
  },
  horloge(c, p, x) {
    const { g } = c; const y = c.env.num(p.y, 26);
    g.disc(x, y, 6, '#3a3a44'); g.disc(x, y, 5, '#f6f3ea');
    g.rect(x, y - 4, 1, 4, '#222'); g.rect(x, y, 3, 1, '#222');
  },
  lampe_plafond(c, p, x) {
    const { g } = c;
    g.rect(x, 6, 1, 10, '#333');
    g.rect(x - 5, 16, 11, 3, c.env.color(p.color, '#e9e1c8')); g.rect(x - 3, 19, 7, 1, '#fff7d6');
    c.glows.push({ x, y: 24, r: 60, color: '#fff2c8', alpha: 0.22 });
  },
  neon(c, p, x) {
    const { g } = c;
    const t = c.env.text(p.text ?? 'OPEN');
    const y = c.env.num(p.y, 40);
    const nc = c.env.color(p.color, '#ff4fd8');
    drawTinyText(g.ctx, t, x, y, shade(nc, -0.5), { align: 'center', scale: 2 });
    c.anim.push({ layer: 'main', draw(ctx, tt) { const on = Math.sin(tt * 7) > -0.92; if (on) drawTinyText(ctx, t, x, y, nc, { align: 'center', scale: 2 }); } });
    c.glows.push({ x, y: y + 5, r: 40, color: nc, alpha: 0.35 });
  },
  drapeau(c, p, x) {
    const { g } = c;
    const y = c.env.num(p.y, 24);
    const a = c.env.color(p.color, '#1f4e9c'); const b = c.env.color(p.color2, '#f2c230');
    g.rect(x - 9, y, 18, 4, '#5a4a3a');
    for (let i = 0; i < 18; i++) g.rect(x - 9 + i, y + 4, 1, 22 - Math.abs(9 - i) / 3, i % 6 < 3 ? a : b);
  },
  etagere(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 34); const y0 = c.env.num(p.y, 52);
    const x0 = Math.round(x - w / 2);
    for (let s = 0; s < 2; s++) {
      const yy = y0 + s * 14;
      g.rect(x0, yy + 10, w, 2, '#6a4a32');
      for (let i = 2; i < w - 3; i += 3 + Math.floor(c.rnd() * 2)) g.rect(x0 + i, yy + 3 + Math.floor(c.rnd() * 3), 2, 7 - Math.floor(c.rnd() * 2), Object.values(NAMED_COLORS)[Math.floor(c.rnd() * 12)]);
    }
  },
  tableau_affichage(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 38); const h = c.env.num(p.h, 26); const y0 = c.env.num(p.y, 48);
    const x0 = Math.round(x - w / 2);
    g.box(x0, y0, w, h, '#c99b62', '#6b4a2a');
    for (let i = 0; i < 6; i++) { const px = x0 + 3 + c.rnd() * (w - 12); const py = y0 + 3 + c.rnd() * (h - 12); g.rect(px, py, 8, 9, i % 3 ? '#f5f2e8' : '#fff1a8'); g.rect(px + 1, py + 2, 5, 1, '#999'); g.rect(px + 1, py + 4, 6, 1, '#999'); g.px(px + 4, py, '#d63c3c'); }
    if (p.text) { g.rect(x0 + 2, y0 - 8, w - 4, 7, '#2a2e3a'); drawTinyText(g.ctx, c.env.text(p.text), x, y0 - 7, '#f2c230', { align: 'center' }); }
  },
  ecran(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 36); const h = c.env.num(p.h, 22); const y0 = c.env.num(p.y, 44);
    const x0 = Math.round(x - w / 2);
    g.rect(x0 - 2, y0 - 2, w + 4, h + 4, '#1b1c22');
    const contenu = String(p.contenu ?? 'match');
    c.anim.push({ layer: 'main', draw(ctx, t) {
      if (contenu === 'match') {
        ctx.fillStyle = '#2f8a3c'; ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = '#3fa04c'; for (let i = 0; i < w; i += 8) ctx.fillRect(x0 + i, y0, 4, h);
        const bx = x0 + 4 + ((t * 9) % (w - 8)); ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(bx), y0 + h - 7, 1, 1);
        ctx.fillStyle = '#d63c3c'; ctx.fillRect(Math.round(bx) - 3, y0 + h - 10, 1, 3); ctx.fillStyle = '#2f62c9'; ctx.fillRect(Math.round(bx) + 4, y0 + h - 9, 1, 3);
      } else {
        ctx.fillStyle = '#233a6b'; ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = '#d63c3c'; ctx.fillRect(x0, y0 + h - 6, w, 4);
        ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 3 + Math.round((t * 12) % 6), y0 + h - 5, 10, 1);
        ctx.fillStyle = '#e8c9a6'; ctx.fillRect(x0 + w / 2 - 3, y0 + 4, 6, 6); ctx.fillStyle = '#334'; ctx.fillRect(x0 + w / 2 - 5, y0 + 10, 10, 6);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0, y0 + ((Math.floor(t * 20)) % h), w, 1);
    } });
    c.glows.push({ x, y: y0 + h / 2, r: 30, color: '#9fd0ff', alpha: 0.15 });
  },
  trophees(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 40); const n = Math.max(0, Math.min(12, Math.round(c.env.num(p.count, 3))));
    const x0 = Math.round(x - w / 2);
    g.bevel(x0, base - 50, w, 50, '#5a3e28');
    g.rect(x0 + 2, base - 48, w - 4, 34, 'rgba(160,200,230,0.25)');
    for (let s = 0; s < 2; s++) g.rect(x0 + 2, base - 32 + s * 16 - 16, w - 4, 1, '#3a2a1c');
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 4); const k = i % 4;
      const tx = x0 + 5 + k * ((w - 10) / 4); const ty = base - 33 - row * 16;
      const gold = i % 3 !== 2; const cc = gold ? '#e8b84a' : '#c4cad3';
      g.rect(tx, ty - 6, 5, 4, cc); g.rect(tx + 2, ty - 2, 1, 2, cc); g.rect(tx + 1, ty, 3, 1, shade(cc, -0.3)); g.px(tx, ty - 6, shade(cc, 0.4));
    }
    g.rect(x0 + 3, base - 12, w - 6, 8, '#4a3220');
  },
  // ── Mobilier
  lit(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 44); const color = c.env.color(p.color, '#3f6fb0');
    const x0 = Math.round(x - w / 2);
    g.bevel(x0 - 2, base - 26, 5, 26, '#7a5638');
    g.bevel(x0, base - 12, w, 8, '#8a6646');
    g.rect(x0 + 1, base - 16, w - 2, 6, '#f2f0ea');
    g.rect(x0 + 2, base - 19, 10, 5, '#ffffff'); g.rect(x0 + 2, base - 15, 10, 1, '#d8d6d0');
    g.rect(x0 + 12, base - 17, w - 13, 7, color); g.rect(x0 + 12, base - 17, w - 13, 1, shade(color, 0.25)); g.rect(x0 + 12, base - 11, w - 13, 1, shade(color, -0.3));
    g.rect(x0, base - 4, 2, 4, '#5a3e28'); g.rect(x0 + w - 2, base - 4, 2, 4, '#5a3e28');
  },
  bureau(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 36); const color = c.env.color(p.color, '#8a6646');
    const x0 = Math.round(x - w / 2);
    g.bevel(x0, base - 16, w, 4, color);
    g.rect(x0 + 1, base - 12, 2, 12, shade(color, -0.3)); g.rect(x0 + w - 3, base - 12, 2, 12, shade(color, -0.3));
    g.bevel(x0 + w - 13, base - 12, 10, 9, shade(color, -0.08));
    if (p.ordinateur !== false) {
      g.rect(x0 + 6, base - 30, 16, 12, '#20222a'); g.rect(x0 + 7, base - 29, 14, 9, '#3d6ea8'); g.rect(x0 + 13, base - 18, 3, 2, '#20222a');
      g.rect(x0 + 8, base - 28, 6, 1, '#cfe3ff'); g.rect(x0 + 8, base - 26, 9, 1, '#9fc0e8');
      g.rect(x0 + 5, base - 17, 18, 1, '#55575f');
      c.glows.push({ x: x0 + 14, y: base - 24, r: 18, color: '#8fc1ff', alpha: 0.18 });
    }
    if (p.lampe) { g.rect(x0 + w - 8, base - 26, 1, 10, '#333'); g.rect(x0 + w - 11, base - 28, 7, 3, '#e2b440'); c.glows.push({ x: x0 + w - 8, y: base - 22, r: 22, color: '#ffe0a0', alpha: 0.25 }); }
    if (p.livres !== false) for (let i = 0; i < 3; i++) g.rect(x0 + w - 6 - i * 3, base - 21 - i, 2, 5 + i, ['#c23b3b', '#2f62c9', '#e2b440'][i]);
  },
  chaise(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#5a4636');
    const dir = p.face === 'gauche' ? -1 : 1;
    g.rect(x - 4, base - 10, 9, 2, color); g.rect(x - 4, base - 8, 1, 8, shade(color, -0.3)); g.rect(x + 4, base - 8, 1, 8, shade(color, -0.3));
    g.rect(dir > 0 ? x - 5 : x + 4, base - 22, 2, 14, color);
  },
  fauteuil(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#2c2f3a');
    g.bevel(x - 6, base - 26, 12, 14, color); g.bevel(x - 7, base - 13, 14, 5, color); g.rect(x, base - 8, 1, 6, '#444'); g.rect(x - 5, base - 2, 11, 2, '#333');
  },
  canape(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 50); const color = c.env.color(p.color, '#7a4a8c');
    const x0 = Math.round(x - w / 2);
    g.bevel(x0 + 3, base - 24, w - 6, 12, shade(color, -0.08));
    g.bevel(x0, base - 14, w, 10, color);
    g.bevel(x0 - 1, base - 18, 6, 14, shade(color, 0.05)); g.bevel(x0 + w - 5, base - 18, 6, 14, shade(color, 0.05));
    for (let i = 1; i < 3; i++) g.rect(x0 + (w * i) / 3, base - 13, 1, 7, shade(color, -0.25));
    g.rect(x0 + 2, base - 4, 2, 4, '#3a2a20'); g.rect(x0 + w - 4, base - 4, 2, 4, '#3a2a20');
    if (p.coussin) g.bevel(x0 + 6, base - 21, 8, 7, c.env.color(p.coussin, '#f2c230'));
  },
  table(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 40); const color = c.env.color(p.color, '#c9c2b4');
    const x0 = Math.round(x - w / 2);
    g.bevel(x0, base - 14, w, 4, color);
    g.rect(x0 + 3, base - 10, 2, 10, shade(color, -0.35)); g.rect(x0 + w - 5, base - 10, 2, 10, shade(color, -0.35));
    if (p.plateaux) for (let i = 4; i < w - 8; i += 14) { g.rect(x0 + i, base - 16, 9, 2, '#e46a3a'); g.rect(x0 + i + 2, base - 18, 3, 2, '#f2d27a'); g.rect(x0 + i + 6, base - 17, 2, 1, '#6fbf5a'); }
    if (p.verres) for (let i = 6; i < w - 4; i += 12) { g.rect(x0 + i, base - 19, 2, 5, 'rgba(220,240,255,0.7)'); g.px(x0 + i, base - 18, '#e8b440'); }
    if (p.nappe) g.rect(x0, base - 14, w, 6, c.env.color(p.nappe, '#f4f0e6'));
  },
  comptoir(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 64); const color = c.env.color(p.color, '#5a3a2a');
    const x0 = Math.round(x - w / 2);
    if (p.bouteilles !== false) {
      g.rect(x0 + 4, base - 52, w - 8, 2, '#3a2a20'); g.rect(x0 + 4, base - 38, w - 8, 2, '#3a2a20');
      for (let i = x0 + 6; i < x0 + w - 6; i += 4) { const bc = ['#3f8a4c', '#a53c2a', '#e2b440', '#6fb8ea', '#d8d8d8'][Math.floor(c.rnd() * 5)]; g.rect(i, base - 60, 2, 8, bc); g.px(i, base - 62, bc); g.rect(i + 1, base - 46, 2, 8, ['#f0e6c8', '#c96a3a', '#8a52d6'][Math.floor(c.rnd() * 3)]); }
    }
    g.bevel(x0, base - 22, w, 22, color);
    g.rect(x0 - 2, base - 24, w + 4, 3, shade(color, 0.3));
    for (let i = x0 + 6; i < x0 + w - 4; i += 10) g.rect(i, base - 18, 6, 14, shade(color, -0.1));
    if (p.machine) { g.bevel(x0 + w - 18, base - 34, 12, 10, '#9aa0aa'); g.rect(x0 + w - 15, base - 30, 6, 3, '#222'); }
  },
  cuisine(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 60); const color = c.env.color(p.color, '#e8e2d4');
    const x0 = Math.round(x - w / 2);
    g.bevel(x0, base - 66, w, 18, color);
    for (let i = x0 + 2; i < x0 + w - 4; i += 15) g.rect(i + 6, base - 58, 2, 3, '#888');
    g.rect(x0, base - 48, w, 26, c.env.color(p.color2, '#d8e4ea'));
    for (let i = 0; i < w; i += 6) g.rect(x0 + i, base - 48, 1, 26, shade(c.env.color(p.color2, '#d8e4ea'), -0.08));
    g.bevel(x0, base - 22, w, 22, color);
    g.rect(x0 - 1, base - 23, w + 2, 2, '#6a6a72');
    for (let i = x0 + 2; i < x0 + w - 4; i += 15) { g.rect(i, base - 19, 13, 17, shade(color, -0.06)); g.rect(i + 6, base - 12, 2, 2, '#888'); }
    g.rect(x0 + 6, base - 27, 10, 4, '#333'); g.rect(x0 + 8, base - 30, 6, 3, '#888');
  },
  frigo(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#e9edf2');
    g.bevel(x - 9, base - 46, 18, 46, color); g.rect(x - 8, base - 30, 16, 1, shade(color, -0.3)); g.rect(x + 5, base - 42, 1, 8, '#888'); g.rect(x + 5, base - 26, 1, 10, '#888');
    for (let i = 0; i < 3; i++) g.rect(x - 6 + i * 4, base - 40 + (i % 2) * 3, 3, 3, ['#e46a3a', '#3f8a4c', '#2f62c9'][i]);
  },
  armoire(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 26); const color = c.env.color(p.color, '#8a6646');
    g.bevel(x - w / 2, base - 52, w, 52, color); g.rect(x, base - 50, 1, 48, shade(color, -0.35)); g.rect(x - 3, base - 30, 1, 5, '#e3c26a'); g.rect(x + 2, base - 30, 1, 5, '#e3c26a');
  },
  plante(c, p, x) {
    const { g, base } = c; const big = p.taille === 'grande';
    const pot = c.env.color(p.color, '#b5653a');
    g.bevel(x - 5, base - 9, 10, 9, pot);
    const lc = ['#3f8a4c', '#2f7a3c', '#57a85a'];
    const n = big ? 14 : 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI - Math.PI; const len = (big ? 18 : 10) * (0.6 + c.rnd() * 0.5); g.line(x, base - 9, x + Math.cos(a) * len * 0.6, base - 9 + Math.sin(a) * len, lc[i % 3], 2); }
  },
  casiers(c, p, x) {
    const { g, base } = c;
    const n = c.env.num(p.count, 5); const color = c.env.color(p.color, '#4f78a8');
    const w = n * 11; const x0 = Math.round(x - w / 2);
    for (let i = 0; i < n; i++) {
      const lx = x0 + i * 11;
      g.bevel(lx, base - 40, 11, 40, color);
      for (let k = 0; k < 3; k++) g.rect(lx + 3, base - 36 + k * 2, 5, 1, shade(color, -0.35));
      g.rect(lx + 8, base - 22, 1, 3, '#d8d8d8');
      if (p.noms) g.rect(lx + 2, base - 30, 7, 3, '#f2efe6');
    }
    if (p.maillots) for (let i = 0; i < n; i += 2) { const jc = c.env.color(p.maillots, '#1f4e9c'); const lx = x0 + i * 11 + 2; g.rect(lx, base - 46, 7, 6, jc); g.rect(lx - 1, base - 46, 9, 2, jc); }
  },
  banc(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 44); const color = c.env.color(p.color, '#a07a4a');
    g.bevel(x - w / 2, base - 10, w, 3, color); g.rect(x - w / 2 + 3, base - 7, 2, 7, shade(color, -0.35)); g.rect(x + w / 2 - 5, base - 7, 2, 7, shade(color, -0.35));
    if (p.sacs) { g.bevel(x - w / 2 + 6, base - 16, 10, 6, '#2c3a5a'); g.bevel(x + 4, base - 15, 9, 5, '#8a2c2c'); }
    if (p.serviettes) g.rect(x - 4, base - 12, 8, 2, '#f4f4f4');
  },
  portemanteau_maillots(c, p, x) {
    const { g } = c; const w = c.env.num(p.w, 60); const y0 = c.env.num(p.y, 54);
    const jc = c.env.color(p.color, '#1f4e9c'); const jc2 = c.env.color(p.color2, '#f2c230');
    g.rect(x - w / 2, y0, w, 2, '#6a6a72');
    for (let i = x - w / 2 + 4; i < x + w / 2 - 8; i += 14) {
      g.rect(i + 4, y0 + 2, 1, 2, '#888');
      g.rect(i, y0 + 4, 10, 12, jc); g.rect(i - 2, y0 + 4, 14, 4, jc); g.rect(i, y0 + 8, 10, 2, jc2);
      drawTinyText(g.ctx, String((i % 9) + 2), i + 5, y0 + 10, '#ffffff', { align: 'center' });
    }
  },
  distributeur(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#c23b3b');
    g.bevel(x - 10, base - 46, 20, 46, color);
    g.rect(x - 8, base - 42, 12, 26, '#1d2230');
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.rect(x - 7 + k * 4, base - 40 + r * 6, 3, 4, ['#e2b440', '#2f9a4c', '#2f62c9', '#e46aa8'][(r + k) % 4]);
    g.rect(x + 6, base - 40, 2, 10, '#dddddd'); g.rect(x - 8, base - 12, 12, 5, '#111');
    c.glows.push({ x, y: base - 30, r: 22, color: '#ffd0d0', alpha: 0.18 });
  },
  table_massage(c, p, x) {
    const { g, base } = c;
    g.bevel(x - 22, base - 16, 44, 5, c.env.color(p.color, '#3b6fa8')); g.rect(x - 22, base - 17, 10, 2, '#f4f4f4');
    g.rect(x - 18, base - 11, 2, 11, '#888'); g.rect(x + 16, base - 11, 2, 11, '#888');
  },
  halteres(c, _p, x) {
    const { g, base } = c;
    g.rect(x - 16, base - 22, 32, 2, '#555'); g.rect(x - 16, base - 10, 32, 2, '#555'); g.rect(x - 16, base - 22, 2, 22, '#444'); g.rect(x + 14, base - 22, 2, 22, '#444');
    for (let i = -12; i < 12; i += 6) { g.rect(x + i, base - 26, 4, 4, '#2a2a30'); g.rect(x + i + 1, base - 24, 2, 1, '#888'); g.rect(x + i, base - 14, 5, 4, '#2a2a30'); }
  },
  banc_muscu(c, _p, x) {
    const { g, base } = c;
    g.rect(x - 14, base - 34, 2, 34, '#555'); g.rect(x + 12, base - 34, 2, 34, '#555');
    g.rect(x - 20, base - 34, 40, 2, '#c4cad3'); g.rect(x - 22, base - 38, 4, 10, '#1d1d24'); g.rect(x + 18, base - 38, 4, 10, '#1d1d24');
    g.bevel(x - 10, base - 12, 22, 4, '#a32c2c'); g.rect(x - 6, base - 8, 2, 8, '#555'); g.rect(x + 6, base - 8, 2, 8, '#555');
  },
  tapis_course(c, _p, x) {
    const { g, base } = c;
    g.bevel(x - 18, base - 8, 36, 6, '#2a2a30'); g.rect(x - 16, base - 9, 32, 1, '#444');
    g.rect(x + 14, base - 34, 2, 26, '#666'); g.bevel(x + 8, base - 38, 14, 6, '#3a3a44'); g.rect(x + 10, base - 36, 6, 2, '#5fcf7d');
  },
  velo(c, _p, x) {
    const { g, base } = c;
    g.rect(x - 10, base - 4, 22, 3, '#333'); g.line(x - 6, base - 4, x - 2, base - 20, '#c23b3b', 2); g.line(x + 6, base - 4, x + 2, base - 18, '#c23b3b', 2);
    g.rect(x - 6, base - 22, 8, 2, '#222'); g.rect(x + 2, base - 26, 2, 8, '#555'); g.rect(x, base - 28, 7, 2, '#222'); g.disc(x + 2, base - 10, 4, '#555');
  },
  mur_sponsors(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 90); const h = c.env.num(p.h, 64);
    const a = c.env.color(p.color, '#1f4e9c'); const b = c.env.color(p.color2, '#f2c230');
    const x0 = Math.round(x - w / 2); const y0 = base - h;
    g.rect(x0, y0, w, h, '#f4f5f8');
    const logos = ['VORTEX', 'NOVA', 'RIVEMONT', 'SOLEO'];
    let k = 0;
    for (let y = y0 + 4; y < base - 6; y += 12) for (let xx = x0 + 4 + ((y / 12) % 2) * 10; xx < x0 + w - 18; xx += 22) {
      drawTinyText(g.ctx, logos[k % 4].slice(0, 5), xx, y, k % 2 ? a : b === '#f2c230' ? '#c99a14' : b); k++;
    }
    g.rect(x0, y0, w, 1, '#c9ccd4'); g.rect(x0, base - 1, w, 1, '#c9ccd4');
  },
  table_conference(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 50);
    g.rect(x - w / 2, base - 16, w, 16, c.env.color(p.color, '#1f2433')); g.rect(x - w / 2, base - 16, w, 2, '#3a4258');
    drawTinyText(g.ctx, c.env.text(p.text ?? 'CONFERENCE'), x, base - 10, '#c9ccd4', { align: 'center' });
    for (let i = -1; i <= 1; i++) { g.rect(x + i * 14, base - 26, 1, 10, '#222'); g.rect(x + i * 14 - 1, base - 28, 3, 3, '#444'); }
  },
  micro(c, _p, x) {
    const { g, base } = c; g.rect(x, base - 30, 1, 30, '#333'); g.rect(x - 3, base - 1, 7, 1, '#333'); g.rect(x - 1, base - 33, 3, 4, '#555');
  },
  tapis(c, p, x) {
    const { g } = c; const w = c.env.num(p.w, 50); const color = c.env.color(p.color, '#a8463a');
    const y = FLOOR_TOP + 14;
    g.rect(x - w / 2, y, w, 10, color); g.rect(x - w / 2 + 2, y + 2, w - 4, 6, shade(color, 0.12)); g.dither(x - w / 2 + 3, y + 3, w - 6, 4, shade(color, -0.15), 3);
  },
  lampadaire_int(c, p, x) {
    const { g, base } = c; g.rect(x, base - 44, 1, 44, '#333'); g.rect(x - 4, base - 1, 9, 1, '#333'); g.rect(x - 5, base - 50, 11, 6, c.env.color(p.color, '#efe6cf'));
    c.glows.push({ x, y: base - 44, r: 40, color: '#ffe8b8', alpha: 0.25 });
  },
  piste_danse(c, p, x) {
    const w = c.env.num(p.w, 120);
    const x0 = Math.round(x - w / 2); const y0 = FLOOR_TOP + 6;
    const colors = ['#ff4fd8', '#4fd8ff', '#ffe14f', '#7dff6a'];
    c.anim.push({ layer: 'main', draw(ctx, t) {
      for (let r = 0; r < 4; r++) for (let k = 0; k < w / 12; k++) {
        const ci = (k + r + Math.floor(t * 3)) % 4;
        ctx.fillStyle = colors[ci]; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 4 + k + r);
        ctx.fillRect(x0 + k * 12, y0 + r * 6, 11, 5);
      }
      ctx.globalAlpha = 1;
    } });
    c.glows.push({ x, y: y0 + 10, r: w * 0.7, color: '#c84fff', alpha: 0.2 });
  },
  dj(c, _p, x) {
    const { g, base } = c;
    g.bevel(x - 18, base - 22, 36, 22, '#24242e'); g.rect(x - 16, base - 24, 32, 3, '#3a3a48');
    g.disc(x - 9, base - 25, 3, '#111'); g.disc(x + 9, base - 25, 3, '#111');
    c.anim.push({ layer: 'main', draw(ctx, t) { for (let i = 0; i < 6; i++) { const h = 2 + Math.abs(Math.sin(t * 6 + i)) * 6; ctx.fillStyle = ['#ff4fd8', '#4fd8ff', '#ffe14f'][i % 3]; ctx.fillRect(x - 12 + i * 4, base - 6 - h, 3, h); } } });
  },
  sieges(c, p, x) {
    const { g, base } = c; const n = c.env.num(p.count, 4); const color = c.env.color(p.color, '#3a5f9a');
    const x0 = Math.round(x - (n * 12) / 2);
    g.rect(x0, base - 4, n * 12, 2, '#777');
    for (let i = 0; i < n; i++) { g.bevel(x0 + i * 12 + 1, base - 14, 10, 4, color); g.bevel(x0 + i * 12 + 1, base - 24, 3, 12, color); }
  },
  panneau_depart(c, p, x) {
    const { g } = c; const y0 = c.env.num(p.y, 30); const w = 70;
    g.rect(x - w / 2 - 2, y0 - 2, w + 4, 40, '#111'); g.rect(x - w / 2, y0, w, 36, '#1a1c24');
    drawTinyText(g.ctx, 'DEPARTS', x, y0 + 2, '#f2c230', { align: 'center' });
    const lines = ['LONDRES 10:40', 'MADRID  11:05', 'MILAN   11:30', 'MUNICH  12:15'];
    c.anim.push({ layer: 'main', draw(ctx, t) { lines.forEach((l, i) => drawTinyText(ctx, l, x - w / 2 + 4, y0 + 10 + i * 6, (Math.floor(t * 2) + i) % 7 === 0 ? '#ffffff' : '#e8a440')); } });
  },
  grande_baie(c, p, x) {
    const { g } = c; const w = c.env.num(p.w, 120); const y0 = 18; const h = 100;
    const [a, b] = SKY[c.time];
    g.rect(x - w / 2 - 3, y0 - 3, w + 6, h + 6, '#9aa3ae');
    g.gradient(x - w / 2, y0, w, h, a, b, 6);
    g.rect(x - w / 2, y0 + h - 18, w, 18, '#7f8a96');
    if (p.avion !== false) {
      c.anim.push({ layer: 'main', draw(ctx, t) {
        const px = x - w / 2 + ((t * 8) % (w + 40)) - 30;
        ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, y0, w, h); ctx.clip();
        ctx.fillStyle = '#eef2f6'; ctx.fillRect(Math.round(px), y0 + h - 30, 30, 5); ctx.fillRect(Math.round(px) + 8, y0 + h - 36, 8, 14); ctx.fillRect(Math.round(px) + 24, y0 + h - 37, 4, 7);
        ctx.fillStyle = '#2f62c9'; ctx.fillRect(Math.round(px) + 2, y0 + h - 29, 26, 1);
        ctx.restore();
      } });
    }
    for (let i = 1; i < 4; i++) g.rect(x - w / 2 + (w * i) / 4, y0, 2, h, '#9aa3ae');
  },
  bagages(c, _p, x) {
    const { g, base } = c; g.bevel(x - 6, base - 16, 12, 16, '#2c3a5a'); g.rect(x - 2, base - 20, 5, 4, '#555'); g.bevel(x + 7, base - 10, 10, 10, '#8a2c2c');
  },
  cartons(c, _p, x) {
    const { g, base } = c; g.bevel(x - 10, base - 12, 14, 12, '#c9a06a'); g.bevel(x + 3, base - 9, 10, 9, '#b98f5a'); g.bevel(x - 7, base - 21, 10, 9, '#d4ad78');
  },
  // ── Extérieur
  immeuble(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 70); const h = c.env.num(p.h, 90); const color = c.env.color(p.color, '#c9b8a0');
    const x0 = Math.round(x - w / 2); const y0 = base - h;
    g.rect(x0, y0, w, h, color); g.rect(x0, y0, w, 3, shade(color, -0.3)); g.rect(x0 + w - 3, y0, 3, h, shade(color, -0.15));
    for (let y = y0 + 8; y < base - 22; y += 14) for (let xx = x0 + 6; xx < x0 + w - 10; xx += 13) {
      const lit = windowLit(c);
      g.rect(xx, y, 7, 8, lit ? '#ffd98a' : night(c.time) ? '#22304e' : '#7fb0d8');
      g.rect(xx, y + 8, 7, 1, shade(color, -0.3));
      if (lit) c.glows.push({ x: xx + 3, y: y + 4, r: 8, color: '#ffcf7a', alpha: 0.35, night: true });
    }
    g.rect(x - 7, base - 18, 14, 18, '#5a4636'); g.rect(x - 6, base - 17, 12, 17, '#7a5e46'); g.rect(x - 9, base - 20, 18, 2, shade(color, -0.35));
    if (p.text) drawTinyText(g.ctx, c.env.text(p.text), x, base - 26, '#2a2e3a', { align: 'center' });
  },
  centre(c, p, x) {
    const { g, base } = c;
    const w = c.env.num(p.w, 140); const h = c.env.num(p.h, 56);
    const color = c.env.color(p.color, '#e9e6df'); const accent = c.env.color(p.color2, '#1f4e9c');
    const x0 = Math.round(x - w / 2); const y0 = base - h;
    g.rect(x0, y0, w, h, color); g.rect(x0, y0, w, 6, accent); g.rect(x0, y0 + 6, w, 1, shade(accent, -0.3));
    for (let xx = x0 + 6; xx < x0 + w - 12; xx += 16) { g.rect(xx, y0 + 14, 12, 16, night(c.time) ? '#ffd98a' : '#8ec3e6'); g.rect(xx, y0 + 30, 12, 1, shade(color, -0.25)); }
    g.rect(x - 10, base - 22, 20, 22, '#9cc8df'); g.rect(x, base - 22, 1, 22, '#5b6b7a');
    if (p.text) { g.rect(x - c.env.text(p.text).length * 2 - 4, y0 - 9, c.env.text(p.text).length * 4 + 7, 8, accent); drawTinyText(g.ctx, c.env.text(p.text), x, y0 - 8, '#ffffff', { align: 'center' }); }
  },
  maison(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#e6d6b8'); const roof = c.env.color(p.color2, '#a8463a');
    g.rect(x - 26, base - 34, 52, 34, color);
    for (let i = 0; i < 18; i++) g.rect(x - 30 + i * 1.5, base - 34 - i, 60 - i * 3, 1, roof);
    g.rect(x - 6, base - 18, 12, 18, '#6a4a32'); g.rect(x - 22, base - 26, 10, 9, night(c.time) ? '#ffd98a' : '#8ec3e6'); g.rect(x + 12, base - 26, 10, 9, '#8ec3e6');
  },
  arbre(c, p, x) {
    const { g, base } = c; const big = c.env.num(p.taille, 1);
    const leaf = c.env.color(p.color, c.time === 'soir' ? '#4a6a3a' : '#3f8a4c');
    if (p.variante === 'sapin') {
      g.rect(x - 1, base - 8, 3, 8, '#5a3e28');
      for (let i = 0; i < 4; i++) for (let y = 0; y < 8; y++) g.rect(x - (y + i * 2) * big * 0.8, base - 10 - i * 7 * big - (8 - y), ((y + i * 2) * 1.6 + 1) * big, 1, y % 3 ? leaf : shade(leaf, -0.2));
      return;
    }
    g.rect(x - 2, base - 22 * big, 4, 22 * big, '#6a4a32');
    const r = 13 * big;
    g.ellipse(x, base - 22 * big - r * 0.6, r, r * 0.9, shade(leaf, -0.18));
    g.ellipse(x - 2, base - 24 * big - r * 0.6, r - 2, r * 0.8, leaf);
    for (let i = 0; i < 18 * big; i++) g.px(x - r + c.rnd() * r * 2, base - 22 * big - r * 1.4 + c.rnd() * r * 1.6, shade(leaf, 0.18));
  },
  buisson(c, p, x) {
    const { g, base } = c; const leaf = c.env.color(p.color, '#3f8a4c');
    g.ellipse(x, base - 6, 12, 6, shade(leaf, -0.15)); g.ellipse(x - 2, base - 7, 10, 5, leaf);
  },
  lampadaire(c, _p, x) {
    const { g, base } = c;
    g.rect(x, base - 60, 2, 60, '#3a3d48'); g.rect(x - 1, base - 2, 4, 2, '#2a2d38'); g.rect(x - 8, base - 60, 10, 2, '#3a3d48'); g.rect(x - 10, base - 58, 6, 3, '#f6e8a8');
    c.glows.push({ x: x - 7, y: base - 50, r: 42, color: '#ffe3a0', alpha: 0.45, night: true });
  },
  banc_public(c, _p, x) {
    const { g, base } = c;
    g.rect(x - 16, base - 12, 32, 2, '#7a5a3a'); g.rect(x - 16, base - 20, 32, 2, '#7a5a3a'); g.rect(x - 14, base - 22, 1, 22, '#333'); g.rect(x + 13, base - 22, 1, 22, '#333');
  },
  voiture(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#c23b3b'); const luxe = !!p.luxe;
    const w = luxe ? 54 : 48;
    g.bevel(x - w / 2, base - 16, w, 10, color);
    g.rect(x - w / 2 + 10, base - 24 + (luxe ? 2 : 0), w - 22, 9 - (luxe ? 2 : 0), color);
    g.rect(x - w / 2 + 12, base - 22 + (luxe ? 2 : 0), w - 26, 6 - (luxe ? 2 : 0), '#9cc8df'); g.rect(x - 1, base - 22, 1, 6, color);
    g.disc(x - w / 2 + 10, base - 5, 4, '#1d1d22'); g.disc(x + w / 2 - 10, base - 5, 4, '#1d1d22'); g.disc(x - w / 2 + 10, base - 5, 2, '#aaa'); g.disc(x + w / 2 - 10, base - 5, 2, '#aaa');
    g.rect(x + w / 2 - 3, base - 14, 2, 2, '#ffe7a0'); g.rect(x - w / 2 + 1, base - 14, 2, 2, '#d63c3c');
  },
  arret_bus(c, _p, x) {
    const { g, base } = c;
    g.rect(x - 18, base - 40, 36, 3, '#3a3d48'); g.rect(x - 18, base - 37, 1, 37, '#3a3d48'); g.rect(x + 17, base - 37, 1, 37, '#3a3d48');
    g.rect(x - 17, base - 37, 34, 26, 'rgba(170,210,230,0.35)'); g.rect(x - 14, base - 12, 28, 2, '#666');
    g.rect(x + 22, base - 46, 2, 46, '#555'); g.disc(x + 23, base - 48, 5, '#2f62c9'); drawTinyText(g.ctx, 'BUS', x + 23, base - 50, '#fff', { align: 'center' });
  },
  cloture(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 120); const h = c.env.num(p.h, 18); const color = c.env.color(p.color, '#7d8590');
    for (let xx = x - w / 2; xx < x + w / 2; xx += 2) for (let y = base - h; y < base; y += 2) if ((xx + y) % 4 === 0) g.px(xx, y, color);
    for (let xx = x - w / 2; xx <= x + w / 2; xx += 24) g.rect(xx, base - h - 2, 2, h + 2, shade(color, -0.25));
    g.rect(x - w / 2, base - h - 2, w, 1, shade(color, -0.2));
  },
  grillage(c, p, x) { PROPS.cloture(c, { ...p, h: p.h ?? 46 }, x); },
  mur_tag(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 80); const h = c.env.num(p.h, 40);
    const x0 = Math.round(x - w / 2);
    g.rect(x0, base - h, w, h, '#9a9184');
    for (let y = base - h + 6; y < base; y += 6) g.rect(x0, y, w, 1, '#857c70');
    const tc = ['#e4463a', '#3a8ee4', '#f2c230', '#8a52d6', '#2fb36b'];
    for (let i = 0; i < w / 14; i++) { const tx = x0 + 4 + i * 14; const ty = base - h + 8 + c.rnd() * 14; g.line(tx, ty + 10, tx + 5, ty, tc[i % 5], 2); g.line(tx + 5, ty, tx + 10, ty + 8, tc[i % 5], 2); g.line(tx + 2, ty + 6, tx + 9, ty + 5, '#ffffff'); }
  },
  poubelle(c, _p, x) { const { g, base } = c; g.bevel(x - 5, base - 14, 10, 14, '#3f6a4a'); g.rect(x - 6, base - 15, 12, 2, '#2c4a34'); },
  panneau(c, p, x) {
    const { g, base } = c; const t = c.env.text(p.text ?? '');
    const w = Math.max(24, t.length * 4 + 6);
    g.rect(x - 1, base - 34, 2, 34, '#555'); g.box(x - w / 2, base - 46, w, 12, c.env.color(p.color, '#2f62c9'), '#1a1a22');
    drawTinyText(g.ctx, t, x, base - 42, '#ffffff', { align: 'center' });
  },
  // ── Football
  tribune(c, p, x) {
    const { g } = c;
    const w = c.env.num(p.w, 200); const h = c.env.num(p.h, 56); const y0 = c.env.num(p.y, 70);
    const color = c.env.color(p.color, '#5a6070');
    const x0 = Math.round(x - w / 2);
    g.rect(x0, y0, w, h, shade(color, -0.25));
    for (let y = y0 + 4; y < y0 + h; y += 6) g.rect(x0, y + 4, w, 1, shade(color, -0.4));
    if (p.toit !== false) { g.rect(x0 - 4, y0 - 10, w + 8, 4, '#c4c9d2'); for (let xx = x0; xx < x0 + w; xx += 40) g.rect(xx, y0 - 6, 2, 8, '#8d939e'); }
    const fans = Array.isArray(p.couleurs) ? (p.couleurs as unknown[]).map((v) => c.env.color(v, '#c23b3b')) : [c.env.color(p.couleur ?? p.color2, '#1f4e9c'), c.env.color(p.couleur2 ?? '#ffffff', '#ffffff')];
    const density = c.env.num(p.densite, 0.85);
    if (density > 0) people(c, x0 + 2, y0 + 2, w - 4, Math.floor(h / 6), [...fans, ...fans, '#d8d8d8', '#2a2a30'], density);
    g.rect(x0, y0 + h, w, 3, '#3a3d48');
  },
  projecteur(c, _p, x) {
    const { g } = c;
    g.rect(x, 8, 2, 120, '#5a5f6a'); g.rect(x - 10, 4, 22, 10, '#3a3d48');
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) g.rect(x - 8 + i * 5, 6 + k * 4, 4, 3, '#fff8d8');
    c.glows.push({ x: x + 1, y: 10, r: 70, color: '#fff6d0', alpha: 0.5, night: true });
  },
  panneaux_pub(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 300);
    const x0 = Math.round(x - w / 2);
    const brands = [['VORTEX', '#1d1d24', '#f2c230'], ['NOVA BANK', '#2f62c9', '#ffffff'], ['SOLEO', '#e46a3a', '#ffffff'], ['FRESHY', '#2f9a4c', '#ffffff'], ['ORBITEL', '#7d4bc4', '#ffffff']];
    for (let xx = x0, i = 0; xx < x0 + w; xx += 50, i++) {
      const [t, bg, fg] = brands[i % brands.length];
      g.rect(xx, base - 10, 50, 10, bg); g.rect(xx, base - 10, 50, 1, shade(bg, 0.3));
      drawTinyText(g.ctx, t, xx + 25, base - 7, fg, { align: 'center' });
    }
  },
  but(c, p, x) {
    const { g } = c;
    const dir = p.dir === 'gauche' ? -1 : 1; // 1 = but à droite (ouverture vers la gauche)
    const base = c.env.num(p.y, 168); const h = 40; const depth = 24;
    const front = x - dir * depth / 2; const back = x + dir * depth / 2;
    for (let y = base - h; y < base; y += 3) g.rect(Math.min(front, back), y, depth, 1, 'rgba(240,240,240,0.55)');
    for (let xx = Math.min(front, back); xx < Math.max(front, back); xx += 3) g.line(xx, base - h, xx + dir * 2, base, 'rgba(240,240,240,0.45)');
    g.line(front, base - h, back, base - h + 6, '#e9eef2', 1);
    g.rect(back - 1, base - h + 6, 2, h - 6, '#cfd6dc');
    g.rect(front - 1, base - h, 3, h, '#ffffff'); g.rect(front - 1, base - h, 3, 1, '#dfe5ea');
  },
  petit_but(c, p, x) {
    const { g } = c; const dir = p.dir === 'gauche' ? -1 : 1; const base = c.env.num(p.y, 166);
    g.rect(x, base - 16, 2, 16, '#ffffff'); g.rect(x, base - 16, dir * 10, 2, '#ffffff');
    for (let y = base - 14; y < base; y += 3) g.rect(dir > 0 ? x + 2 : x - 10, y, 8, 1, 'rgba(255,255,255,0.5)');
  },
  plots(c, p, x) {
    const { g } = c; const n = c.env.num(p.count, 4); const color = c.env.color(p.color, '#ff8a2e'); const base = c.env.num(p.y, 160);
    for (let i = 0; i < n; i++) { const cx = x - (n - 1) * 9 + i * 18; g.rect(cx - 3, base - 1, 7, 1, shade(color, -0.3)); g.rect(cx - 2, base - 3, 5, 2, color); g.rect(cx - 1, base - 6, 3, 3, color); g.px(cx, base - 7, shade(color, 0.3)); }
  },
  ballons(c, _p, x) {
    const { g, base } = c;
    g.rect(x - 9, base - 14, 18, 14, 'rgba(40,40,50,0.6)');
    for (let i = 0; i < 6; i++) { const bx = x - 6 + (i % 3) * 5; const by = base - 4 - Math.floor(i / 3) * 5; g.disc(bx, by, 2, '#f4f4f4'); g.px(bx, by, '#222'); }
    g.rect(x - 10, base - 15, 20, 1, '#444');
  },
  banc_touche(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 50);
    g.rect(x - w / 2, base - 30, w, 3, '#c4c9d2'); g.rect(x - w / 2, base - 28, 2, 28, '#8d939e'); g.rect(x + w / 2 - 2, base - 28, 2, 28, '#8d939e');
    g.rect(x - w / 2 + 2, base - 27, w - 4, 20, 'rgba(160,200,230,0.3)');
    for (let i = x - w / 2 + 4; i < x + w / 2 - 6; i += 9) g.bevel(i, base - 12, 8, 4, c.env.color(p.color, '#1f4e9c'));
  },
  drapeau_corner(c, p, x) {
    const { g } = c; const base = c.env.num(p.y, 164);
    g.rect(x, base - 20, 1, 20, '#f4f4f4');
    c.anim.push({ layer: 'main', draw(ctx, t) { const w = Math.sin(t * 4) > 0 ? 0 : 1; ctx.fillStyle = c.env.color(p.color, '#f2c230'); ctx.fillRect(x + 1, base - 20 + w, 6, 4); } });
  },
  tableau_score(c, p, x) {
    const { g } = c; const y0 = c.env.num(p.y, 22);
    g.rect(x - 34, y0 - 2, 68, 22, '#111'); g.rect(x - 32, y0, 64, 18, '#1a1d26');
    g.rect(x - 2, y0 + 20, 4, 30, '#444');
    const tpl = p.texte;
    c.anim.push({ layer: c.layer, draw(ctx) {
      const t = c.env.text(tpl ?? '0 - 0');
      drawTinyText(ctx, t, x, y0 + 7, '#ffcf3a', { align: 'center', scale: 1 });
      if (p.titre) drawTinyText(ctx, c.env.text(p.titre), x, y0 + 1, '#9fd0ff', { align: 'center' });
    } });
    c.glows.push({ x, y: y0 + 9, r: 36, color: '#ffd27a', alpha: 0.25 });
  },
  tunnel(c, p, x) {
    const { g, base } = c; const color = c.env.color(p.color, '#3a3d48');
    g.rect(x - 16, base - 34, 32, 34, color); g.rect(x - 12, base - 30, 24, 30, '#0d0e12');
    for (let i = 0; i < 4; i++) g.rect(x - 12, base - 30 + i * 8, 24, 1, '#1d1f28');
    g.rect(x - 18, base - 38, 36, 4, c.env.color(p.color2, '#1f4e9c'));
  },
  city(c, p, x) {
    const { g, base } = c; const w = c.env.num(p.w, 220);
    const x0 = Math.round(x - w / 2);
    g.rect(x0, base - 14, w, 14, '#4a6a8a'); for (let xx = x0; xx < x0 + w; xx += 8) g.rect(xx, base - 14, 1, 14, '#3a5a7a');
    PROPS.cloture(c, { type: 'cloture', x, w, h: 30, color: '#9aa3ae' }, x);
  },
  // ── Arrière-plans lointains
  collines(c, p, x) {
    const { g, width } = c; const color = c.env.color(p.color, c.time === 'nuit' ? '#1f3a3a' : c.time === 'soir' ? '#5a4a6a' : '#7fae7a');
    void x;
    for (let xx = 0; xx < width; xx++) { const h = 22 + Math.sin(xx / 37) * 9 + Math.sin(xx / 13) * 3; g.rect(xx, 130 - h, 1, h, color); }
    for (let xx = 0; xx < width; xx++) { const h = 12 + Math.sin(xx / 23 + 2) * 6; g.rect(xx, 130 - h, 1, h, shade(color, -0.12)); }
  },
  ville(c, p, _x) {
    const { g, width } = c; const color = c.env.color(p.color, c.time === 'nuit' ? '#1b2440' : c.time === 'soir' ? '#4a3a5a' : '#8fa6c0');
    let xx = 0;
    while (xx < width) {
      const bw = 12 + Math.floor(c.rnd() * 22); const bh = 26 + Math.floor(c.rnd() * 50);
      g.rect(xx, 130 - bh, bw, bh, color);
      for (let y = 130 - bh + 4; y < 126; y += 5) for (let k = xx + 2; k < xx + bw - 2; k += 4) if (c.rnd() < (c.time === 'nuit' ? 0.4 : 0.15)) g.px(k, y, c.time === 'nuit' ? '#ffd98a' : shade(color, 0.2));
      xx += bw + Math.floor(c.rnd() * 3);
    }
  },
  tours(c, p, _x) {
    const { g, width } = c; const color = c.env.color(p.color, c.time === 'nuit' ? '#262c44' : '#b8b0a6');
    for (let xx = 4; xx < width; xx += 46 + Math.floor(c.rnd() * 30)) {
      const bw = 26 + Math.floor(c.rnd() * 10); const bh = 70 + Math.floor(c.rnd() * 40);
      g.rect(xx, 132 - bh, bw, bh, color); g.rect(xx + bw - 3, 132 - bh, 3, bh, shade(color, -0.15));
      for (let y = 132 - bh + 4; y < 128; y += 6) for (let k = xx + 3; k < xx + bw - 4; k += 5) g.rect(k, y, 3, 3, c.time === 'nuit' ? (c.rnd() < 0.45 ? '#ffd98a' : '#1a2034') : shade(color, -0.2));
    }
  },
  arbres(c, p, _x) {
    const { g, width } = c; const color = c.env.color(p.color, c.time === 'nuit' ? '#163024' : c.time === 'soir' ? '#3a4a3a' : '#4f8a4f');
    for (let xx = 0; xx < width; xx += 6) { const h = 18 + Math.abs(Math.sin(xx * 0.7)) * 10 + c.rnd() * 6; g.ellipse(xx, 132 - h * 0.6, 6, h * 0.6, xx % 12 ? color : shade(color, -0.1)); }
  },
  montagnes(c, p, _x) {
    const { g, width } = c; const color = c.env.color(p.color, '#7d8aa8');
    for (let xx = 0; xx < width; xx++) { const h = 40 + Math.abs(((xx * 0.9) % 80) - 40) * 1.2; g.rect(xx, 132 - h, 1, h, color); if (h > 78) g.rect(xx, 132 - h, 1, 4, '#f4f6fa'); }
  },
  tribune_loin(c, p, _x) {
    const { g, width } = c; const color = c.env.color(p.color, '#4a505e');
    g.rect(0, 70, width, 62, shade(color, -0.2));
    for (let y = 72; y < 130; y += 5) g.rect(0, y, width, 1, shade(color, -0.35));
    const fans = Array.isArray(p.couleurs) ? (p.couleurs as unknown[]).map((v) => c.env.color(v, '#c23b3b')) : [c.env.color(p.couleur, '#1f4e9c'), '#ffffff', '#d8d8d8'];
    people(c, 0, 72, width, 9, [...fans, '#2a2a30'], c.env.num(p.densite, 0.8));
    g.rect(0, 64, width, 6, '#c4c9d2');
  },
  mer(c, _p, _x) {
    const { g, width } = c;
    g.rect(0, 104, width, 28, c.time === 'nuit' ? '#13204a' : '#3f8fc8');
    for (let i = 0; i < width / 3; i++) g.rect(c.rnd() * width, 106 + c.rnd() * 24, 3, 1, 'rgba(255,255,255,0.5)');
  },
};

export const PROP_TYPES = Object.keys(PROPS);
export const BACKDROP_TYPES = ['collines', 'ville', 'tours', 'arbres', 'montagnes', 'tribune_loin', 'mer'];
export const WALL_STYLES = ['peint', 'briques', 'carrelage', 'lambris', 'papier', 'beton', 'bois', 'vitre', 'sombre', 'moderne'];
export const FLOOR_STYLES = ['parquet', 'carrelage', 'moquette', 'beton', 'lino', 'herbe', 'terrain', 'synthetique', 'bitume', 'trottoir', 'sable'];

// ───────────────────────────── Rendu d'un lieu ─────────────────────────────

export function renderLocation(loc: LocationDef, env: SceneEnv, timeOverride?: TimeOfDay): RenderedLocation {
  const width = Math.max(VIEW_W, loc.width ?? 480);
  const interior = loc.kind !== 'exterieur';
  const time: TimeOfDay = timeOverride ?? loc.time ?? 'jour';
  const anim: AnimatedProp[] = [];
  const glows: Glow[] = [];
  const seed = [...loc.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = srand(seed);

  let far: HTMLCanvasElement | null = null;
  const farWidth = Math.ceil(VIEW_W + (width - VIEW_W) * PARALLAX) + 2;
  if (!interior) {
    const fg = new Gfx(farWidth, VIEW_H);
    const fc: Ctx = { g: fg, env, time, rnd, width: farWidth, interior, anim, glows: [], layer: 'far', base: 132 };
    drawSky(fc, farWidth);
    cloudAnim(fc, farWidth);
    for (const p of loc.backdrop ?? []) {
      if (!env.test(p.when)) continue;
      const fn = PROPS[p.type];
      if (fn) fn(fc, p, Math.round(p.x * PARALLAX));
    }
    far = fg.canvas;
  }

  const main = new Gfx(width, VIEW_H);
  const front = new Gfx(width, VIEW_H);
  const mc: Ctx = { g: main, env, time, rnd, width, interior, anim, glows, layer: 'main', base: FLOOR_TOP + 10 };
  const wall = loc.wall ?? { style: 'peint', color: '#d9d2c3' };
  const floor = loc.floor ?? (interior ? { style: 'parquet', color: '#a8794e' } : { style: 'herbe', color: '#4c9a48' });
  if (interior) {
    drawWall(mc, wall.style, env.color(wall.color, '#d9d2c3'), env.color(wall.color2 ?? wall.color, '#a8794e'));
    drawFloor(mc, floor.style, env.color(floor.color, '#a8794e'), env.color(floor.color2 ?? floor.color, '#8a6040'), FLOOR_TOP);
  } else {
    drawFloor(mc, floor.style, env.color(floor.color, '#4c9a48'), env.color(floor.color2 ?? '#b9b2a6', '#b9b2a6'), FLOOR_TOP - 4);
  }
  for (const p of loc.props ?? []) {
    if (!env.test(p.when)) continue;
    const fn = PROPS[p.type];
    if (!fn) continue;
    const target = p.layer === 'avant' ? front : main;
    const c: Ctx = { ...mc, g: target, layer: p.layer === 'avant' ? 'front' : 'main', base: p.base !== undefined ? env.num(p.base, FLOOR_TOP + 10) : p.layer === 'avant' ? 178 : FLOOR_TOP + 10 };
    fn(c, p, p.x);
  }
  return { width, far, farWidth, main: main.canvas, front: front.canvas, anim, glows, time, interior };
}

export function envFromColors(): SceneEnv {
  return { color: (v, f) => col(typeof v === 'string' ? v : undefined, f), num: (v, f) => (typeof v === 'number' ? v : f), text: (v) => String(v ?? ''), test: () => true };
}
