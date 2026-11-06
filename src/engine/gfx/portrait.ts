// Portraits de face (dialogues, relations) générés depuis la même apparence
// que le sprite, avec expressions : neutre, content, rire, triste, colere,
// surpris, inquiet, pensif, fier.
import type { Look } from '../../core/model/types';
import { resolveLook } from './character';
import { Gfx, shade, mix } from './pixel';

export const PORTRAIT = 40;

export const EMOTIONS = ['neutre', 'content', 'rire', 'triste', 'colere', 'surpris', 'inquiet', 'pensif', 'fier'];
const EMO_ALIASES: Record<string, string> = {
  joie: 'content', heureux: 'content', heureuse: 'content', sourire: 'content', souriant: 'content', ravi: 'content',
  rit: 'rire', hilare: 'rire', deçu: 'triste', decu: 'triste', déçu: 'triste', abattu: 'triste', pleure: 'triste',
  fache: 'colere', fâché: 'colere', enerve: 'colere', énervé: 'colere', furieux: 'colere', colère: 'colere', agace: 'colere',
  choque: 'surpris', choqué: 'surpris', etonne: 'surpris', étonné: 'surpris', peur: 'inquiet', stresse: 'inquiet', stressé: 'inquiet',
  gene: 'inquiet', gêné: 'inquiet', serieux: 'neutre', sérieux: 'neutre', calme: 'neutre', songeur: 'pensif', doute: 'pensif',
  malicieux: 'fier', arrogant: 'fier', confiant: 'fier', moqueur: 'fier', froid: 'neutre', ému: 'triste', emu: 'triste',
};
export function normEmotion(e?: string): string {
  if (!e) return 'neutre';
  const k = e.toLowerCase().trim();
  return EMOTIONS.includes(k) ? k : EMO_ALIASES[k] ?? 'neutre';
}

const cache = new Map<string, HTMLCanvasElement>();

export function getPortrait(look: Look, emo = 'neutre', key?: string): HTMLCanvasElement {
  const e = normEmotion(emo);
  const k = `${key ?? JSON.stringify(look)}|${e}`;
  let c = cache.get(k);
  if (!c) { c = renderPortrait(look, e); if (cache.size > 600) cache.clear(); cache.set(k, c); }
  return c;
}

export function renderPortrait(look: Look, emo: string): HTMLCanvasElement {
  const r = resolveLook(look);
  const g = new Gfx(PORTRAIT, PORTRAIT);
  const kid = r.height === 'enfant';
  const skin = r.skin; const skinD = shade(skin, -0.16); const skinDD = shade(skin, -0.32); const skinL = shade(skin, 0.12);
  const hc = r.hairColor; const hdk = shade(hc, -0.3); const hl = shade(hc, 0.25);
  const cx = 20;
  const headTop = kid ? 9 : 7;
  const headH = kid ? 19 : 20;
  const rx = kid ? 8 : r.build === 'costaud' ? 9 : 8;

  // Cheveux derrière
  if (r.hair === 'long') { g.rect(cx - rx - 2, headTop + 4, rx * 2 + 5, 24, hc); g.rect(cx - rx - 2, headTop + 26, 3, 3, hdk); g.rect(cx + rx, headTop + 26, 3, 3, hdk); }
  if (r.hair === 'boucle') g.ellipse(cx, headTop + 7, rx + 5, 10, hc);
  if (r.hair === 'tresses') for (let i = -1; i <= 1; i += 2) for (let y = 0; y < 16; y++) g.rect(cx + i * (rx + 1) - 1, headTop + 8 + y, 3, 1, y % 2 ? hdk : hc);
  if (r.hair === 'queue') g.rect(cx + rx - 1, headTop + 6, 4, 12, hc);
  if (r.hair === 'carre') g.rect(cx - rx - 2, headTop + 3, rx * 2 + 5, 17, hc);

  // Épaules / tenue
  const shoulderY = headTop + headH + 3;
  const sw = r.build === 'costaud' ? 17 : r.build === 'mince' ? 13 : 15;
  for (let y = shoulderY; y < PORTRAIT; y++) {
    const w = Math.min(sw, sw - 4 + (y - shoulderY) * 2);
    g.rect(cx - w, y, w * 2 + 1, 1, r.topColor);
  }
  g.rect(cx - sw, PORTRAIT - 1, sw * 2 + 1, 1, shade(r.topColor, -0.25));
  // cou
  g.rect(cx - 3, headTop + headH - 3, 7, 6, skinD);
  g.rect(cx - 3, headTop + headH + 1, 7, 1, skinDD);
  // détails de col
  switch (r.top) {
    case 'maillot': case 'gardien': case 'tshirt':
      for (let i = 0; i < 4; i++) { g.px(cx - 4 + i, shoulderY + i - 1, r.topColor2); g.px(cx + 4 - i, shoulderY + i - 1, r.topColor2); }
      g.rect(cx - 2, shoulderY - 1, 5, 2, skinD);
      if (r.top !== 'tshirt') g.rect(cx - sw + 2, shoulderY + 6, sw * 2 - 3, 2, r.topColor2);
      break;
    case 'costume':
      g.rect(cx - 3, shoulderY - 1, 7, 9, '#f2f2f2');
      g.rect(cx, shoulderY, 1, 9, r.topColor2); g.px(cx - 1, shoulderY, r.topColor2); g.px(cx + 1, shoulderY, r.topColor2);
      for (let i = 0; i < 7; i++) { g.px(cx - 4 - Math.floor(i / 2), shoulderY + i, shade(r.topColor, -0.35)); g.px(cx + 4 + Math.floor(i / 2), shoulderY + i, shade(r.topColor, -0.35)); }
      break;
    case 'chemise': case 'polo':
      g.rect(cx - 5, shoulderY - 1, 4, 2, r.topColor2); g.rect(cx + 2, shoulderY - 1, 4, 2, r.topColor2);
      for (let y = shoulderY + 2; y < PORTRAIT; y += 3) g.px(cx, y, shade(r.topColor, -0.3));
      break;
    case 'sweat':
      g.rect(cx - 7, shoulderY - 2, 15, 3, shade(r.topColor, -0.15));
      g.rect(cx - 2, shoulderY + 1, 1, 5, '#e8e8e8'); g.rect(cx + 2, shoulderY + 1, 1, 5, '#e8e8e8');
      break;
    case 'survet': case 'veste':
      g.rect(cx, shoulderY, 1, PORTRAIT - shoulderY, r.topColor2);
      g.rect(cx - 4, shoulderY - 1, 3, 2, shade(r.topColor, 0.15)); g.rect(cx + 2, shoulderY - 1, 3, 2, shade(r.topColor, 0.15));
      break;
    case 'blouse':
      g.rect(cx - 5, shoulderY - 1, 11, 9, shade(r.topColor, -0.08));
      g.rect(cx - 1, shoulderY, 3, PORTRAIT - shoulderY, '#7aa7c7');
      break;
    case 'debardeur':
      g.rect(cx - sw + 3, shoulderY, sw * 2 - 5, 3, skinD); g.rect(cx - 6, shoulderY, 3, PORTRAIT - shoulderY, r.topColor); g.rect(cx + 4, shoulderY, 3, PORTRAIT - shoulderY, r.topColor);
      break;
    case 'robe':
      g.rect(cx - 5, shoulderY - 1, 11, 3, skinD);
      break;
  }
  if (r.acc.has('collier')) for (let i = -3; i <= 3; i++) g.px(cx + i, shoulderY + 1 + (Math.abs(i) < 2 ? 1 : 0), '#f2c94c');

  // Oreilles
  const earY = headTop + 9;
  g.rect(cx - rx - 2, earY, 2, 4, skinD); g.rect(cx + rx + 1, earY, 2, 4, skinD);
  if (r.acc.has('boucles')) { g.px(cx - rx - 2, earY + 4, '#f2c94c'); g.px(cx + rx + 2, earY + 4, '#f2c94c'); }

  // Visage (ovale + mâchoire)
  for (let y = 0; y < headH; y++) {
    const t = y / (headH - 1);
    let w = rx;
    if (t < 0.15) w = Math.round(rx * (0.7 + t * 2));
    else if (t > 0.65) w = Math.round(rx * (1 - (t - 0.65) * (r.female || kid ? 1.5 : 1.25)));
    g.rect(cx - w, headTop + y, w * 2 + 1, 1, skin);
    g.px(cx - w, headTop + y, skinD);
    if (w > 2) g.px(cx + w, headTop + y, shade(skin, -0.06));
  }
  g.rect(cx - rx + 2, headTop + 3, 3, 2, skinL);

  // Yeux et sourcils selon l'émotion
  const eyeY = headTop + 10;
  const lx = cx - 5; const rxE = cx + 3;
  const eye = (x: number, closed = false) => {
    if (closed) { g.rect(x, eyeY + 1, 3, 1, '#2a1f28'); return; }
    g.rect(x, eyeY, 3, 2, '#f4f4f6');
    g.rect(x + 1, eyeY, 2, 2, r.eyes);
    g.px(x + 1, eyeY, '#111');
    g.px(x + 2, eyeY, shade(r.eyes, 0.5));
    if (r.female) { g.px(x - 1, eyeY - 1, '#1d1820'); g.rect(x, eyeY - 1, 3, 1, '#1d1820'); }
  };
  const happyClosed = emo === 'rire';
  eye(lx, happyClosed); eye(rxE, happyClosed);
  if (emo === 'surpris') { g.rect(lx, eyeY - 1, 3, 1, '#f4f4f6'); g.rect(rxE, eyeY - 1, 3, 1, '#f4f4f6'); }
  const bc = shade(hc === '#e9e9ef' || hc === '#efe3b4' ? '#9a8a70' : hc, -0.1);
  const browY = eyeY - 3;
  const brow = (x: number, left: boolean) => {
    switch (emo) {
      case 'colere': g.px(x + (left ? 0 : 2), browY, bc); g.px(x + 1, browY + 1, bc); g.px(x + (left ? 2 : 0), browY + 2, bc); g.px(x + (left ? 3 : -1), browY + 2, bc); break;
      case 'triste': case 'inquiet': g.px(x + (left ? 0 : 2), browY + 2, bc); g.px(x + 1, browY + 1, bc); g.px(x + (left ? 2 : 0), browY, bc); break;
      case 'surpris': g.rect(x, browY - 1, 3, 1, bc); break;
      case 'pensif': g.rect(x, left ? browY - 1 : browY + 1, 3, 1, bc); break;
      case 'fier': g.rect(x, left ? browY : browY - 1, 3, 1, bc); break;
      default: g.rect(x, browY, 3, 1, bc);
    }
  };
  brow(lx, true); brow(rxE, false);
  // Nez
  g.rect(cx, eyeY + 2, 1, 3, skinD); g.px(cx - 1, eyeY + 5, skinDD); g.px(cx + 1, eyeY + 5, skinD);
  // Joues
  if (r.female || emo === 'content' || emo === 'rire') { g.px(cx - 6, eyeY + 4, mix(skin, '#ff6f6f', 0.3)); g.px(cx + 6, eyeY + 4, mix(skin, '#ff6f6f', 0.3)); }
  // Barbe
  const mouthY = eyeY + 8;
  if (r.beard === 'barbe') {
    for (let y = eyeY + 5; y < headTop + headH; y++) { const w = Math.max(2, rx - Math.max(0, y - (headTop + headH - 5))); g.rect(cx - w, y, w * 2 + 1, 1, hc); }
    g.rect(cx - 3, mouthY - 1, 7, 3, skin);
  }
  if (r.beard === 'barbe3j') g.dither(cx - rx + 1, eyeY + 5, rx * 2 - 1, headTop + headH - eyeY - 5, shade(skin, -0.28));
  if (r.beard === 'bouc') g.rect(cx - 2, mouthY + 2, 5, 3, hc);
  if (r.beard === 'moustache') g.rect(cx - 3, mouthY - 1, 7, 1, hc);
  // Bouche
  const lip = r.female ? mix(skinDD, '#c0505a', 0.45) : skinDD;
  switch (emo) {
    case 'content': case 'fier':
      g.rect(cx - 2, mouthY, 5, 1, lip); g.px(cx - 3, mouthY - 1, lip); g.px(cx + 3, mouthY - (emo === 'fier' ? 1 : 1), lip);
      if (emo === 'fier') g.px(cx - 3, mouthY - 1, skin);
      break;
    case 'rire': g.rect(cx - 3, mouthY - 1, 7, 3, '#5a1f2a'); g.rect(cx - 2, mouthY - 1, 5, 1, '#f4f4f4'); break;
    case 'triste': g.rect(cx - 2, mouthY, 5, 1, lip); g.px(cx - 3, mouthY + 1, lip); g.px(cx + 3, mouthY + 1, lip); break;
    case 'colere': g.rect(cx - 3, mouthY, 7, 2, '#5a1f2a'); g.rect(cx - 2, mouthY, 5, 1, '#e8e8e8'); break;
    case 'surpris': g.rect(cx - 1, mouthY - 1, 3, 3, '#5a1f2a'); break;
    case 'inquiet': g.rect(cx - 2, mouthY, 2, 1, lip); g.rect(cx, mouthY + 1, 3, 1, lip); break;
    case 'pensif': g.rect(cx - 1, mouthY, 4, 1, lip); break;
    default: g.rect(cx - 2, mouthY, 5, 1, lip);
  }

  // Cheveux (dessus)
  const top = headTop - 1;
  const capRows = (rows: number, sides: number) => {
    for (let y = 0; y < rows; y++) { const w = Math.round(rx * (0.75 + Math.min(1, y / 2) * 0.3)); g.rect(cx - w - 1, top + y, w * 2 + 3, 1, hc); }
    g.rect(cx - rx - 1, top + rows - 1, 2, sides, hc); g.rect(cx + rx, top + rows - 1, 2, sides, hc);
    g.rect(cx - 3, top, 5, 1, hl);
  };
  switch (r.hair) {
    case 'court': capRows(5, 4); g.rect(cx - rx + 1, top + 5, 5, 1, hc); break;
    case 'rase': for (let y = 0; y < 4; y++) g.rect(cx - rx + (y === 0 ? 2 : 0), top + 1 + y, rx * 2 + 1 - (y === 0 ? 4 : 0), 1, mix(hc, skin, 0.4)); break;
    case 'boucle': g.ellipse(cx, top + 3, rx + 4, 6, hc); g.dither(cx - rx - 3, top - 2, rx * 2 + 7, 8, hdk, 3); g.rect(cx - rx - 2, top + 5, 3, 7, hc); g.rect(cx + rx, top + 5, 3, 7, hc); break;
    case 'bouclecourt': capRows(5, 3); g.dither(cx - rx - 1, top, rx * 2 + 3, 5, hdk, 2); break;
    case 'long': capRows(5, 12); g.rect(cx - rx + 1, top + 4, 6, 2, hc); break;
    case 'queue': capRows(5, 4); g.rect(cx - 5, top + 4, 10, 1, hc); break;
    case 'chignon': capRows(5, 3); g.disc(cx, top - 3, 3, hc); g.px(cx - 1, top - 4, hl); break;
    case 'crete': g.rect(cx - 2, top - 3, 5, 7, hc); g.rect(cx - 1, top - 3, 2, 2, hl); g.dither(cx - rx, top + 2, rx * 2 + 1, 3, mix(hc, skin, 0.5)); break;
    case 'tresses': capRows(5, 5); for (let x = cx - rx; x <= cx + rx; x += 3) g.rect(x, top + 1, 1, 4, hdk); break;
    case 'meche': capRows(5, 4); g.rect(cx - 2, top - 3, rx + 3, 4, hc); g.rect(cx, top - 3, 4, 1, hl); break;
    case 'carre': capRows(6, 10); g.rect(cx - rx, top + 5, rx * 2 + 1, 2, hc); break;
    case 'herisse': capRows(5, 3); for (let i = -6; i <= 6; i += 3) { g.px(cx + i, top - 1, hc); g.px(cx + i, top - 2, hdk); } break;
    case 'chauve': g.rect(cx - 3, headTop + 1, 3, 1, shade(skin, 0.3)); break;
  }
  if (r.acc.has('bandeau')) g.rect(cx - rx - 1, top + 4, rx * 2 + 3, 2, r.topColor2);
  if (r.acc.has('casquette')) {
    const cc = r.topColor2 === '#f1f1f1' ? '#c23b3b' : r.topColor2;
    for (let y = 0; y < 5; y++) g.rect(cx - rx - 1 + (y === 0 ? 2 : 0), top - 1 + y, rx * 2 + 3 - (y === 0 ? 4 : 0), 1, cc);
    g.rect(cx - rx - 3, top + 4, rx * 2 + 7, 2, shade(cc, -0.25));
  }
  if (r.acc.has('lunettes')) {
    for (const x of [lx, rxE]) { g.rect(x - 1, eyeY - 1, 5, 4, '#1c1c24'); g.rect(x, eyeY, 3, 2, '#cfe8ff'); g.rect(x + 1, eyeY, 2, 2, r.eyes); }
    g.rect(lx + 4, eyeY, rxE - lx - 5, 1, '#1c1c24');
  }

  g.outline('#17131f');
  return g.canvas;
}
