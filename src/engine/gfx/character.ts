// ─────────────────────────────────────────────────────────────────────────────
// Personnages procéduraux (vue latérale, tournés vers la droite).
// Un « squelette » de membres articulés est posé image par image puis rendu
// en pixel art avec vêtements, coiffure, accessoires et contour automatique.
// → n'importe quelle apparence décrite en JSON est animée sans aucun dessin.
// ─────────────────────────────────────────────────────────────────────────────
import type { Look } from '../../core/model/types';
import { Gfx, shade, mix } from './pixel';

export const SPR_W = 32;
export const SPR_H = 46;
const CX = 15;
const GROUND = 44;
const OUTLINE = '#17131f';

export const SKINS: Record<string, string> = {
  peau0: '#fbe7da', peau1: '#f7d9c4', peau2: '#efc29e', peau3: '#d9a57c', peau4: '#b97d55', peau5: '#8e5a39', peau6: '#5f3b26', peau7: '#3f271b',
};
export const HAIR_COLORS: Record<string, string> = {
  noir: '#1e1a20', brun: '#4b3023', chatain: '#7b5433', roux: '#b4532c', blond: '#e1b95b', platine: '#efe3b4',
  gris: '#9b9ba4', blanc: '#e9e9ef', bleu: '#3a6fd8', rose: '#e46aa8', vert: '#3fb36b', violet: '#8a52d6',
  acajou: '#7a2a24', cuivre: '#d07a3a', argente: '#c8ccd8', turquoise: '#2fb5b0', rouge: '#c8323a', nuit: '#2a2f5e',
};
export const NAMED_COLORS: Record<string, string> = {
  rouge: '#d63c3c', bleu: '#2f62c9', marine: '#1d2f5e', ciel: '#7cc3ef', vert: '#2f9a4c', kaki: '#6b7a43', jaune: '#f0c63a',
  orange: '#ec8a2e', violet: '#7d4bc4', rose: '#e477a9', blanc: '#eef0f4', noir: '#25222b', gris: '#8b8f99', anthracite: '#3b3e47',
  bordeaux: '#7c2236', beige: '#d8c3a0', marron: '#6e4a31', or: '#e2b440', argent: '#c4cad3', turquoise: '#2fb5b0', creme: '#efe6cf',
};
export const HAIR_STYLES = ['court', 'rase', 'boucle', 'bouclecourt', 'afro', 'long', 'mi_long', 'frange', 'queue', 'couettes', 'chignon', 'catogan', 'crete', 'undercut', 'tresses', 'dreads', 'meche', 'carre', 'herisse', 'chauve'];
export const TOP_STYLES = ['maillot', 'gardien', 'tshirt', 'debardeur', 'polo', 'survet', 'sweat', 'chemise', 'costume', 'veste', 'blouse', 'robe', 'toge'];
export const BOTTOM_STYLES = ['short', 'pantalon', 'jean', 'survet', 'jupe'];
export const BEARDS = ['', 'barbe', 'barbe3j', 'bouc', 'moustache'];
export const ACCESSORIES = ['lunettes', 'casquette', 'bandeau', 'chapeau', 'capuche', 'casque', 'echarpe', 'cape', 'sac', 'baguette', 'montre', 'gants', 'brassard', 'collier', 'boucles', 'piercing', 'taches', 'cicatrice'];
export const BEARD_STYLES = ['', 'barbe3j', 'bouc', 'moustache', 'barbe', 'barbe_longue'];
/** Libellés affichés pour chaque option d'apparence. */
export const LOOK_LABELS: Record<string, string> = {
  court: 'Court', rase: 'Rasé', boucle: 'Bouclé', bouclecourt: 'Bouclé court', afro: 'Afro', long: 'Long', mi_long: 'Mi-long', frange: 'Frange', queue: 'Queue-de-cheval',
  couettes: 'Couettes', chignon: 'Chignon', catogan: 'Chignon haut', crete: 'Crête', undercut: 'Undercut', tresses: 'Tresses', dreads: 'Dreadlocks', meche: 'Mèche', carre: 'Carré',
  herisse: 'Hérissé', chauve: 'Chauve',
  maillot: 'Maillot', gardien: 'Maillot de gardien', tshirt: 'T-shirt', debardeur: 'Débardeur', polo: 'Polo', survet: 'Survêtement', sweat: 'Sweat', chemise: 'Chemise',
  costume: 'Costume', veste: 'Veste', blouse: 'Blouse', robe: 'Robe', toge: 'Robe de sorcier', short: 'Short', pantalon: 'Pantalon', jean: 'Jean', jupe: 'Jupe',
  '': 'Aucune', barbe3j: 'Barbe de 3 jours', bouc: 'Bouc', moustache: 'Moustache', barbe: 'Barbe', barbe_longue: 'Longue barbe',
  lunettes: 'Lunettes', casquette: 'Casquette', bandeau: 'Bandeau', chapeau: 'Chapeau pointu', capuche: 'Capuche', casque: 'Casque audio', echarpe: 'Écharpe', cape: 'Cape',
  sac: 'Sac à dos', baguette: 'Baguette', montre: 'Montre', gants: 'Gants', brassard: 'Brassard', collier: 'Collier', boucles: 'Boucles d\'oreilles', piercing: 'Piercing',
  taches: 'Taches de rousseur', cicatrice: 'Cicatrice', h: 'Masculin', f: 'Féminin', mince: 'Mince', normal: 'Normal', costaud: 'Costaud', petit: 'Petit', grand: 'Grand', enfant: 'Enfant',
};
export const lookLabel = (k: string) => LOOK_LABELS[k] ?? k;

export function col(c: string | undefined, fallback: string, table?: Record<string, string>): string {
  if (!c) return fallback;
  if (table?.[c]) return table[c];
  if (NAMED_COLORS[c]) return NAMED_COLORS[c];
  return /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

interface Pose {
  aB: [number, number]; aF: [number, number]; lB: [number, number]; lF: [number, number];
  dy?: number; lean?: number; hd?: number; sh?: number; mouth?: 'open' | 'o';
}
export interface AnimDef { fps: number; loop: boolean; frames: Pose[] }
const P = (aB: [number, number], aF: [number, number], lB: [number, number], lF: [number, number], x: Partial<Pose> = {}): Pose => ({ aB, aF, lB, lF, ...x });

export const ANIMS: Record<string, AnimDef> = {
  idle: { fps: 1.6, loop: true, frames: [P([5, 8], [-6, 8], [-3, 0], [4, 0]), P([5, 10], [-6, 10], [-3, 0], [4, 0], { sh: 1 })] },
  marche: { fps: 8, loop: true, frames: [
    P([18, 10], [-18, 10], [-20, 8], [22, 4]), P([4, 10], [-4, 10], [-2, 30], [2, 2]),
    P([-18, 10], [18, 10], [22, 4], [-20, 8]), P([-4, 10], [4, 10], [2, 2], [-2, 30])] },
  course: { fps: 12, loop: true, frames: [
    P([50, 80], [-45, 85], [-42, 55], [40, 15], { lean: 2, dy: -1 }), P([10, 90], [-8, 90], [-4, 8], [28, 95], { lean: 2 }),
    P([-45, 85], [50, 80], [40, 15], [-42, 55], { lean: 2, dy: -1 }), P([-8, 90], [10, 90], [28, 95], [-4, 8], { lean: 2 })] },
  parle: { fps: 5, loop: true, frames: [P([5, 8], [38, 45], [-3, 0], [4, 0], { mouth: 'open' }), P([5, 8], [24, 30], [-3, 0], [4, 0])] },
  frappe: { fps: 10, loop: false, frames: [
    P([-35, 20], [35, 20], [6, 4], [-42, 70], { lean: -1 }), P([-10, 20], [10, 20], [4, 4], [8, 40]),
    P([45, 25], [-45, 25], [-6, 6], [78, 5], { lean: -2 }), P([20, 20], [-20, 20], [-4, 4], [50, 15], { lean: -1 })] },
  passe: { fps: 9, loop: false, frames: [P([-15, 15], [15, 15], [3, 2], [-28, 35]), P([12, 15], [-12, 15], [-3, 3], [35, 8]), P([5, 10], [-5, 10], [-2, 2], [15, 5])] },
  joie: { fps: 6, loop: true, frames: [P([212, 10], [138, 12], [-4, 0], [4, 0]), P([218, 10], [132, 12], [-12, 35], [12, 35], { dy: -4 })] },
  saut: { fps: 4, loop: false, frames: [P([125, 20], [140, 20], [-15, 40], [15, 40], { dy: -5 })] },
  triste: { fps: 1, loop: true, frames: [P([2, 4], [-2, 4], [-2, 0], [2, 0], { hd: 1, sh: 1, lean: 1 })] },
  interagir: { fps: 4, loop: false, frames: [P([5, 8], [60, 25], [-3, 0], [4, 0]), P([5, 8], [82, 5], [-3, 0], [5, 0])] },
  montrer: { fps: 1, loop: true, frames: [P([5, 8], [92, 0], [-3, 0], [4, 0])] },
  assis: { fps: 1, loop: true, frames: [P([20, 45], [30, 55], [85, 88], [90, 90])] },
  tacle: { fps: 8, loop: false, frames: [P([-55, 20], [-35, 30], [55, 45], [82, 5], { lean: -3 }), P([-70, 20], [-40, 30], [62, 40], [86, 0], { lean: -4 })] },
  tete: { fps: 8, loop: false, frames: [P([-20, 30], [20, 30], [-10, 30], [10, 30], { dy: -2 }), P([-30, 20], [30, 20], [-15, 40], [12, 40], { dy: -6, lean: 3, hd: 1 }), P([-10, 20], [10, 20], [-6, 20], [6, 20], { dy: -2 })] },
  plongeon: { fps: 1, loop: true, frames: [P([172, 0], [188, 0], [-6, 0], [6, 0])] },
  chute: { fps: 1, loop: true, frames: [P([30, 10], [50, 10], [-10, 10], [20, 10], { mouth: 'o' })] },
  applaudir: { fps: 8, loop: true, frames: [P([70, 75], [62, 62], [-3, 0], [4, 0]), P([62, 85], [72, 92], [-3, 0], [4, 0])] },
  bras_croises: { fps: 1, loop: true, frames: [P([40, 115], [52, 105], [-4, 0], [5, 0])] },
  reflechir: { fps: 1, loop: true, frames: [P([20, 95], [28, 150], [-3, 0], [4, 0])] },
  telephone: { fps: 1, loop: true, frames: [P([8, 10], [196, -42], [-3, 0], [4, 0])] },
  saluer: { fps: 6, loop: true, frames: [P([5, 8], [160, 20], [-3, 0], [4, 0]), P([5, 8], [140, 45], [-3, 0], [4, 0])] },
  danse: { fps: 6, loop: true, frames: [
    P([30, 40], [150, 30], [-8, 10], [8, 25]), P([60, 40], [120, 40], [-6, 20], [6, 10], { dy: -1 }),
    P([150, 30], [30, 40], [-8, 25], [8, 10]), P([120, 40], [60, 40], [-6, 10], [6, 20], { dy: -1 })] },
  garde: { fps: 2, loop: true, frames: [P([45, 50], [50, 55], [-16, 18], [16, 18]), P([45, 55], [50, 60], [-16, 22], [16, 22])] },
  etirement: { fps: 1, loop: true, frames: [P([178, 0], [182, 0], [-5, 0], [5, 0])] },
  souleve: { fps: 2, loop: true, frames: [P([25, 140], [25, 140], [-6, 4], [6, 4]), P([172, 6], [172, 6], [-6, 4], [6, 4])] },
  ecrire: { fps: 6, loop: true, frames: [P([60, 40], [70, 35], [85, 88], [90, 90]), P([66, 34], [64, 42], [85, 88], [90, 90])] },
};
export const ANIM_ALIASES: Record<string, string> = {
  walk: 'marche', run: 'course', talk: 'parle', kick: 'frappe', tir: 'frappe', celebration: 'joie', celebrer: 'joie',
  jump: 'saut', sad: 'triste', interact: 'interagir', point: 'montrer', sit: 'assis', dive: 'plongeon', fall: 'chute',
  clap: 'applaudir', think: 'reflechir', phone: 'telephone', wave: 'saluer', dance: 'danse', header: 'tete', tackle: 'tacle',
  muscu: 'souleve', taper: 'ecrire', attente: 'idle', repos: 'idle',
};
export function animDef(name: string): AnimDef { return ANIMS[name] ?? ANIMS[ANIM_ALIASES[name] ?? ''] ?? ANIMS.idle; }

// ───────────────────────────── Rendu d'une image ─────────────────────────────

interface Resolved {
  skin: string; hair: string; hairColor: string; eyes: string; beard: string;
  top: string; topColor: string; topColor2: string; bottom: string; bottomColor: string;
  shoes: string; socks: string | null; build: string; height: string; acc: Set<string>; female: boolean; accColor: string | null;
}

export function resolveLook(l: Look): Resolved {
  const top = l.top ?? 'tshirt';
  return {
    skin: col(l.skin, SKINS.peau2, SKINS),
    hair: l.hair ?? 'court',
    hairColor: col(l.hairColor, HAIR_COLORS.brun, HAIR_COLORS),
    eyes: col(l.eyes, '#2b2230'),
    beard: l.beard ?? '',
    top,
    topColor: col(l.topColor, '#3b6fc4'),
    topColor2: col(l.topColor2, top === 'costume' ? '#b33a3a' : '#f1f1f1'),
    bottom: l.bottom ?? (top === 'maillot' || top === 'gardien' ? 'short' : 'jean'),
    bottomColor: col(l.bottomColor, l.bottom === 'jean' || (!l.bottom && top !== 'maillot') ? '#3a5584' : '#222631'),
    shoes: col(l.shoes, '#2a2a33'),
    socks: l.socks ? col(l.socks, '#eeeeee') : top === 'maillot' || top === 'gardien' ? col(l.topColor, '#eeeeee') : null,
    build: l.build ?? 'normal',
    height: l.height ?? 'normal',
    acc: new Set(l.acc ?? []),
    female: l.gender === 'f',
    accColor: l.accColor ? col(l.accColor, '#7a1f2a') : null,
  };
}

const rad = (d: number) => (d * Math.PI) / 180;

function limbPoints(x0: number, y0: number, a1: number, l1: number, a2: number, l2: number) {
  const x1 = x0 + Math.sin(rad(a1)) * l1; const y1 = y0 + Math.cos(rad(a1)) * l1;
  const x2 = x1 + Math.sin(rad(a2)) * l2; const y2 = y1 + Math.cos(rad(a2)) * l2;
  return { x1, y1, x2, y2 };
}

function drawLimb(g: Gfx, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number, colorAt: (d: number) => string) {
  const L1 = Math.hypot(x1 - x0, y1 - y0); const L2 = Math.hypot(x2 - x1, y2 - y1);
  const total = L1 + L2;
  const off = Math.floor((t - 1) / 2);
  for (let d = 0; d <= total; d += 0.5) {
    let x: number; let y: number;
    if (d <= L1) { const k = L1 ? d / L1 : 0; x = x0 + (x1 - x0) * k; y = y0 + (y1 - y0) * k; }
    else { const k = L2 ? (d - L1) / L2 : 0; x = x1 + (x2 - x1) * k; y = y1 + (y2 - y1) * k; }
    g.rect(Math.round(x) - off, Math.round(y) - off, t, t, colorAt(d));
  }
}

export function renderFrame(look: Look, pose: Pose, emo = 'neutre'): HTMLCanvasElement {
  const r = resolveLook(look);
  const g = new Gfx(SPR_W, SPR_H);
  const kid = r.height === 'enfant';
  const legLen = kid ? 7 : r.height === 'petit' ? 9 : r.height === 'grand' ? 11 : 10;
  const torso = kid ? 8 : r.height === 'petit' ? 10 : r.height === 'grand' ? 12 : 11;
  const tw = r.build === 'mince' ? 6 : r.build === 'costaud' ? 9 : 7;
  const armT = r.build === 'mince' ? 2 : 3;
  const legT = r.build === 'costaud' ? 4 : 3;
  const headH = kid ? 9 : 10;
  const headW = 9;
  const thigh = Math.ceil(legLen / 2); const shin = legLen - thigh;
  const upper = kid ? 4 : 5; const fore = kid ? 3 : 4;

  // Pose « au sol » : on calcule la position du bassin pour que le pied le plus bas touche le sol.
  const lean = pose.lean ?? 0;
  const legB = limbPoints(0, 0, pose.lB[0], thigh, pose.lB[0] - pose.lB[1], shin);
  const legF = limbPoints(0, 0, pose.lF[0], thigh, pose.lF[0] - pose.lF[1], shin);
  const lowest = Math.max(legB.y2, legF.y2, 0);
  const hipY = Math.round(GROUND - 1 - lowest) + (pose.dy ?? 0);
  const hipX = CX;
  const shY = hipY - torso + (pose.sh ?? 0);
  const leanAt = (y: number) => Math.round(lean * (hipY - y) / torso);

  const skinD = shade(r.skin, -0.18);
  const longSleeves = ['gardien', 'survet', 'sweat', 'chemise', 'costume', 'veste', 'blouse', 'toge'].includes(r.top);
  const noSleeves = r.top === 'debardeur';
  const fullPants = ['pantalon', 'jean', 'survet'].includes(r.bottom);
  const skirt = r.bottom === 'jupe' || r.top === 'robe';
  const gloves = r.acc.has('gants') || r.top === 'gardien';

  const armColor = (dark: boolean, front: boolean) => (d: number) => {
    const total = upper + fore;
    let c: string;
    if (d >= total - 0.6) c = gloves ? '#f3f3f3' : r.skin;
    else if (noSleeves) c = r.skin;
    else if (longSleeves) c = d >= total - 2 && (r.top === 'survet' || r.top === 'gardien') ? r.topColor2 : r.topColor;
    else c = d < 3.6 ? (d >= 3 ? r.topColor2 : r.topColor) : r.skin;
    if (front && r.acc.has('brassard') && d >= 1.5 && d < 2.6) c = '#f2c230';
    return dark ? shade(c, -0.22) : c;
  };
  const legColor = (dark: boolean) => (d: number) => {
    let c: string;
    if (fullPants) c = r.bottom === 'survet' && d > 1 && d < 3 ? r.bottomColor : r.bottomColor;
    else if (skirt) c = r.skin;
    else if (d < 3.4) c = r.bottomColor;
    else if (r.socks && d >= thigh + 0.5) c = r.socks;
    else c = r.skin;
    return dark ? shade(c, -0.22) : c;
  };
  const drawArm = (p: [number, number], dark: boolean, front: boolean) => {
    const sx = hipX + leanAt(shY) + (front ? 0 : -1);
    const sy = shY + 1;
    const a = limbPoints(sx, sy, p[0], upper, p[0] + p[1], fore);
    drawLimb(g, sx, sy, a.x1, a.y1, a.x2, a.y2, armT, armColor(dark, front));
    g.rect(Math.round(a.x2) - 1, Math.round(a.y2) - 1, 2, 2, dark ? shade(gloves ? '#f3f3f3' : r.skin, -0.22) : gloves ? '#f3f3f3' : r.skin);
    return a;
  };
  const drawLeg = (p: [number, number], dark: boolean) => {
    const lp = limbPoints(hipX, hipY, p[0], thigh, p[0] - p[1], shin);
    drawLimb(g, hipX, hipY, lp.x1, lp.y1, lp.x2, lp.y2, legT, legColor(dark));
    const fx = Math.round(lp.x2); const fy = Math.round(lp.y2);
    const sc = dark ? shade(r.shoes, -0.25) : r.shoes;
    g.rect(fx - 1, fy - 1, 4, 2, sc);
    g.px(fx + 2, fy - 1, shade(sc, 0.2));
  };

  const accC = (fallback: string) => r.accColor ?? fallback;
  // 0. Cape et sac (derrière le corps)
  if (r.acc.has('cape')) {
    const cc = accC('#7a1f2a');
    for (let y = shY; y < GROUND - 3; y++) {
      const w = 3 + Math.floor((y - shY) / 4);
      const x0 = hipX - Math.floor(tw / 2) + leanAt(Math.min(y, hipY)) - w + 2;
      g.rect(x0, y, w, 1, y >= GROUND - 4 ? shade(cc, -0.3) : cc);
      g.px(x0, y, shade(cc, -0.25));
    }
  }
  if (r.acc.has('sac')) {
    const sc = accC('#5a4a3a');
    const x0 = hipX - Math.floor(tw / 2) + leanAt(shY + 3) - 3;
    g.rect(x0, shY + 1, 4, 8, sc); g.rect(x0, shY + 1, 4, 1, shade(sc, 0.2)); g.rect(x0 + 1, shY + 5, 2, 1, shade(sc, -0.3));
  }
  // 1. Cheveux longs derrière la tête / bras et jambe du fond
  drawArm(pose.aB, true, false);
  drawLeg(pose.lB, true);
  drawLeg(pose.lF, false);

  // 2. Torse
  for (let y = shY; y < hipY; y++) {
    const off = leanAt(y);
    const x0 = hipX - Math.floor(tw / 2) + off;
    const extra = r.build === 'costaud' && y > shY + 3 && y < hipY - 2 ? 1 : 0;
    g.rect(x0, y, tw + extra, 1, r.topColor);
    g.px(x0, y, shade(r.topColor, -0.2));
    g.px(x0 + tw + extra - 1, y, shade(r.topColor, 0.15));
  }
  const fx = (y: number) => hipX - Math.floor(tw / 2) + leanAt(y) + tw - 1; // bord avant
  const bx = (y: number) => hipX - Math.floor(tw / 2) + leanAt(y); // bord arrière
  switch (r.top) {
    case 'maillot': case 'gardien':
      g.rect(bx(shY + 4), shY + 4, tw, 2, r.topColor2);
      g.px(fx(shY), shY, r.topColor2); g.px(fx(shY) - 1, shY, r.topColor2);
      break;
    case 'costume': {
      for (let y = shY; y < shY + 6; y++) g.px(fx(y), y, '#f4f4f4');
      for (let y = shY + 1; y < shY + 7; y++) g.px(fx(y), y, r.topColor2);
      for (let y = shY; y < shY + 5; y++) g.px(fx(y) - 1, y, shade(r.topColor, -0.3));
      break;
    }
    case 'chemise': case 'polo':
      g.rect(fx(shY) - 2, shY, 3, 1, r.topColor2);
      for (let y = shY + 2; y < hipY - 1; y += 3) g.px(fx(y), y, shade(r.topColor, -0.25));
      break;
    case 'survet':
      for (let y = shY; y < hipY; y++) g.px(hipX + leanAt(y), y, r.topColor2);
      break;
    case 'sweat':
      g.rect(bx(shY) - 1, shY - 2, 3, 3, r.topColor); g.px(bx(shY) - 1, shY - 2, shade(r.topColor, -0.25));
      g.rect(fx(hipY - 3) - 3, hipY - 3, 3, 1, shade(r.topColor, -0.2));
      break;
    case 'veste':
      for (let y = shY; y < hipY; y++) g.px(fx(y), y, r.topColor2);
      break;
    case 'debardeur':
      g.rect(bx(shY) + 1, shY, tw - 2, 1, r.skin);
      break;
  }
  if (fullPants) g.rect(bx(hipY - 1), hipY - 1, tw, 1, shade(r.bottomColor, -0.35));
  else if (!skirt) g.rect(bx(hipY - 1), hipY - 1, tw, 2, r.bottomColor);
  if (r.top === 'blouse') for (let y = hipY; y < hipY + 6; y++) g.rect(bx(y), y, tw, 1, y === hipY + 5 ? shade(r.topColor, -0.15) : r.topColor);
  if (skirt) {
    const sc = r.top === 'robe' ? r.topColor : r.bottomColor;
    for (let y = hipY - 1; y < hipY + 6; y++) { const w = tw + Math.floor((y - hipY + 1) / 2); g.rect(hipX - Math.floor(w / 2) + leanAt(y), y, w, 1, y === hipY + 5 ? shade(sc, -0.2) : sc); }
  }
  if (r.top === 'toge') {
    // Robe de sorcier : tombe jusqu'aux chevilles, col et liseré
    const bottomY = GROUND - 3;
    for (let y = hipY - 1; y < bottomY; y++) {
      const w = tw + Math.min(4, Math.floor((y - hipY + 1) / 3));
      const x0 = hipX - Math.floor(w / 2) + leanAt(Math.min(y, hipY));
      g.rect(x0, y, w, 1, y >= bottomY - 1 ? shade(r.topColor, -0.25) : r.topColor);
      g.px(x0, y, shade(r.topColor, -0.2));
      g.px(x0 + w - 2, y, r.topColor2);
    }
    for (let y = shY; y < hipY; y++) g.px(fx(y) - 1, y, r.topColor2);
    g.rect(bx(shY), shY, tw, 1, r.topColor2);
  }
  if (r.acc.has('collier')) g.px(fx(shY) - 1, shY + 1, '#f2c94c');
  if (r.acc.has('echarpe')) { const ec = accC(r.topColor2 === '#f1f1f1' ? '#c23b3b' : r.topColor2); g.rect(bx(shY) - 1, shY - 1, tw + 1, 2, ec); g.rect(bx(shY) - 1, shY + 1, 2, 4, ec); g.px(bx(shY) - 1, shY + 4, shade(ec, -0.3)); }

  // 3. Tête
  const hd = pose.hd ?? 0;
  const hx = hipX - Math.floor(headW / 2) + leanAt(shY) + hd;
  const hy = shY - headH - 1 + hd;
  // cou
  g.rect(hipX + leanAt(shY) - 1 + hd, shY - 1, 3, 2, skinD);
  // volumes de coiffure derrière la tête
  const hc = r.hairColor; const hdk = shade(hc, -0.3); const hl = shade(hc, 0.22);
  if (r.hair === 'boucle') g.ellipse(hx + 3, hy + 3, 6, 6, hc);
  if (r.hair === 'long') g.rect(hx - 1, hy + 1, 4, headH + 5, hc);
  if (r.hair === 'queue') { g.rect(hx - 3, hy + 2, 4, 2, hc); g.rect(hx - 4, hy + 3, 2, 6, hc); }
  if (r.hair === 'tresses') for (let i = 0; i < 3; i++) for (let y = 0; y < 8 - i; y++) g.px(hx - 1 + i, hy + 3 + i + y, (y + i) % 2 ? hdk : hc);
  if (r.hair === 'chignon') g.disc(hx + 1, hy - 1, 2, hc);
  if (r.hair === 'afro') g.ellipse(hx + 4, hy + 2, 7, 7, hc);
  if (r.hair === 'mi_long') g.rect(hx - 1, hy + 1, 4, headH, hc);
  if (r.hair === 'catogan') g.disc(hx + 1, hy - 2, 2, hc);
  if (r.hair === 'couettes') { g.rect(hx - 3, hy + 3, 3, 3, hc); g.rect(hx - 4, hy + 5, 2, 4, hdk); }
  if (r.hair === 'dreads') for (let i = 0; i < 4; i++) for (let y = 0; y < 9 - i; y++) g.px(hx - 1 + i, hy + 2 + y, (y + i) % 3 ? hc : hdk);
  // crâne
  g.rect(hx, hy, headW, headH, r.skin);
  g.ctx.clearRect(hx, hy, 1, 1); g.ctx.clearRect(hx + headW - 1, hy, 1, 1); g.ctx.clearRect(hx, hy + headH - 1, 1, 1); g.ctx.clearRect(hx + headW - 1, hy + headH - 1, 1, 1);
  g.rect(hx, hy + 1, 1, headH - 2, skinD);
  // visage (vers la droite)
  const eyeX = hx + headW - 3; const eyeY = hy + Math.floor(headH * 0.45);
  g.rect(eyeX, eyeY, 1, 2, r.eyes);
  if (r.female) g.px(eyeX + 1, eyeY - 1, '#1e1a20');
  const brow = shade(hc, -0.15);
  if (emo === 'colere') { g.px(eyeX - 1, eyeY - 2, brow); g.px(eyeX, eyeY - 1, brow); }
  else if (emo === 'triste' || emo === 'inquiet') { g.px(eyeX - 1, eyeY - 1, brow); g.px(eyeX, eyeY - 2, brow); }
  else if (emo === 'surpris') { g.rect(eyeX - 1, eyeY - 3, 2, 1, brow); }
  else g.rect(eyeX - 1, eyeY - 2, 2, 1, brow);
  g.px(hx + headW, eyeY + 2, r.skin); g.px(hx + headW, eyeY + 3, skinD);
  g.rect(hx + 3, eyeY, 2, 2, skinD);
  if (r.female) g.px(eyeX - 1, eyeY + 3, mix(r.skin, '#ff7a7a', 0.35));
  // barbe
  const my = hy + headH - 3;
  if (r.beard === 'barbe') { g.rect(hx + 2, hy + headH - 4, headW - 2, 4, hc); g.rect(hx + 1, hy + headH - 5, 2, 2, hc); }
  if (r.beard === 'barbe3j') g.dither(hx + 2, hy + headH - 4, headW - 2, 4, shade(r.skin, -0.3));
  if (r.beard === 'bouc') g.rect(hx + headW - 3, hy + headH - 2, 3, 2, hc);
  if (r.beard === 'moustache') g.rect(hx + headW - 4, my - 1, 3, 1, hc);
  if (r.beard === 'barbe_longue') { g.rect(hx + 2, hy + headH - 4, headW - 2, 4, hc); g.rect(hx + 1, hy + headH - 5, 2, 2, hc); for (let y = 0; y < 6; y++) g.rect(hx + headW - 5 + Math.floor(y / 2), hy + headH + y, Math.max(1, 5 - Math.floor(y / 2)), 1, y % 2 ? hc : hdk); }
  // bouche
  const mouthC = r.beard === 'barbe' ? shade(r.skin, -0.1) : shade(r.skin, -0.38);
  if (pose.mouth === 'open' || emo === 'surpris') { g.rect(hx + headW - 3, my, 2, 2, '#5a1f2a'); }
  else if (pose.mouth === 'o') g.rect(hx + headW - 2, my, 1, 2, '#5a1f2a');
  else {
    g.rect(hx + headW - 3, my, 2, 1, mouthC);
    if (emo === 'content' || emo === 'rire' || emo === 'fier') g.px(hx + headW - 1, my - 1, mouthC);
    if (emo === 'triste' || emo === 'colere') g.px(hx + headW - 1, my + 1, mouthC);
  }
  if (r.acc.has('taches')) { g.px(hx + 4, eyeY + 2, shade(r.skin, -0.3)); g.px(hx + 6, eyeY + 2, shade(r.skin, -0.3)); }
  if (r.acc.has('cicatrice')) { g.px(eyeX - 1, eyeY - 1, '#c97a7a'); g.px(eyeX, eyeY + 2, '#c97a7a'); }
  if (r.acc.has('piercing')) g.px(hx + headW, eyeY + 3, '#d8dde6');
  // coiffure (dessus)
  const cap = (h = 3) => { g.rect(hx, hy - 1, headW, h, hc); g.rect(hx + 2, hy - 1, 3, 1, hl); };
  switch (r.hair) {
    case 'court': cap(); g.rect(hx, hy, 3, 6, hc); g.px(hx + headW - 1, hy + 2, hc); break;
    case 'rase': g.rect(hx, hy, headW, 2, mix(hc, r.skin, 0.35)); g.rect(hx, hy, 2, 5, mix(hc, r.skin, 0.35)); break;
    case 'boucle': { g.rect(hx, hy - 2, headW - 1, 3, hc); for (let i = 0; i < headW - 1; i += 2) g.px(hx + i, hy - 3, hc); g.rect(hx, hy, 3, 7, hc); g.dither(hx, hy - 2, headW - 1, 2, hdk, 3); break; }
    case 'bouclecourt': cap(3); g.dither(hx, hy - 1, headW, 3, hdk, 2); g.rect(hx, hy, 3, 5, hc); for (let i = 1; i < headW; i += 2) g.px(hx + i, hy - 2, hc); break;
    case 'long': cap(); g.rect(hx, hy, 3, headH, hc); g.px(hx + headW - 1, hy + 2, hc); break;
    case 'queue': cap(); g.rect(hx, hy, 3, 5, hc); break;
    case 'chignon': cap(); g.rect(hx, hy, 3, 5, hc); break;
    case 'crete': g.rect(hx + 2, hy - 3, headW - 3, 3, hc); g.rect(hx + 3, hy - 3, 2, 1, hl); g.rect(hx, hy, headW, 1, mix(hc, r.skin, 0.5)); break;
    case 'tresses': cap(); g.rect(hx, hy, 3, 6, hc); break;
    case 'meche': cap(); g.rect(hx + headW - 5, hy - 3, 5, 2, hc); g.px(hx + headW, hy - 2, hc); g.rect(hx, hy, 3, 6, hc); break;
    case 'carre': cap(); g.rect(hx, hy, 4, headH - 1, hc); g.rect(hx + headW - 3, hy, 3, 2, hc); break;
    case 'herisse': cap(); for (let i = 0; i < 4; i++) { g.px(hx + 1 + i * 2, hy - 2, hc); g.px(hx + 1 + i * 2, hy - 3, hdk); } g.rect(hx, hy, 3, 5, hc); break;
    case 'chauve': g.px(hx + 3, hy + 1, shade(r.skin, 0.3)); break;
    case 'afro': { g.rect(hx - 1, hy - 3, headW + 1, 4, hc); g.dither(hx - 1, hy - 3, headW + 1, 4, hdk, 3); g.rect(hx - 1, hy, 4, 7, hc); break; }
    case 'mi_long': cap(); g.rect(hx, hy, 3, headH - 2, hc); g.px(hx + headW - 1, hy + 2, hc); break;
    case 'frange': cap(3); g.rect(hx + 3, hy + 1, headW - 3, 2, hc); g.rect(hx, hy, 3, 7, hc); break;
    case 'couettes': cap(); g.rect(hx, hy, 3, 5, hc); break;
    case 'catogan': cap(); g.rect(hx, hy, 3, 4, hc); break;
    case 'undercut': g.rect(hx + 2, hy - 2, headW - 1, 3, hc); g.rect(hx + 4, hy - 3, 4, 1, hl); g.rect(hx, hy, 3, 4, mix(hc, r.skin, 0.45)); break;
    case 'dreads': cap(); g.rect(hx, hy, 3, 8, hc); for (let i = 0; i < headW; i += 2) g.px(hx + i, hy - 2, hdk); break;
  }
  if (r.acc.has('bandeau')) g.rect(hx, hy + 2, headW, 1, r.topColor2);
  if (r.acc.has('casquette')) { g.rect(hx - 1, hy - 2, headW + 1, 3, r.topColor2 === '#f1f1f1' ? '#c23b3b' : r.topColor2); g.rect(hx + headW - 1, hy, 4, 1, shade(r.topColor2 === '#f1f1f1' ? '#c23b3b' : r.topColor2, -0.25)); }
  if (r.acc.has('lunettes')) { g.rect(eyeX - 1, eyeY - 1, 3, 3, '#1b1b22'); g.px(eyeX, eyeY, '#bfe3ff'); g.rect(hx + 4, eyeY, eyeX - hx - 5, 1, '#1b1b22'); }
  if (r.acc.has('boucles')) g.px(hx + 3, eyeY + 2, '#f2c94c');
  if (r.acc.has('casque') && !r.acc.has('chapeau')) { const cq = accC('#2a2a33'); g.rect(hx + 1, hy - 2, headW - 2, 1, cq); g.rect(hx + 2, eyeY, 3, 3, cq); g.px(hx + 3, eyeY + 1, shade(cq, 0.3)); }
  if (r.acc.has('capuche') && !r.acc.has('chapeau')) { const hc2 = accC(shade(r.topColor, -0.1)); g.rect(hx - 1, hy - 2, headW + 1, 3, hc2); g.rect(hx - 1, hy, 3, headH, hc2); }
  if (r.acc.has('chapeau')) {
    // Chapeau pointu : bord, cône incliné vers l'arrière, bande
    const hatC = accC(shade(r.topColor, -0.12));
    g.rect(hx - 2, hy - 1, headW + 4, 2, shade(hatC, -0.15));
    for (let i = 0; i < 9; i++) { const w = Math.max(1, headW - 1 - i); g.rect(hx + Math.floor(i / 3) - Math.floor(i / 2) + (headW - 1 - w) / 2, hy - 2 - i, w, 1, hatC); }
    g.rect(hx, hy - 3, headW - 1, 1, r.topColor2);
  }

  // 4. Bras de devant (+ baguette)
  const hand = drawArm(pose.aF, false, true);
  if (r.acc.has('montre')) { const wx = Math.round(hand.x1 + (hand.x2 - hand.x1) * 0.7); const wy = Math.round(hand.y1 + (hand.y2 - hand.y1) * 0.7); g.px(wx, wy, '#d8c060'); }
  if (r.acc.has('baguette')) {
    const dx = hand.x2 - hand.x1; const dy = hand.y2 - hand.y1; const L = Math.hypot(dx, dy) || 1;
    const ex = hand.x2 + (dx / L) * 5; const ey = hand.y2 + (dy / L) * 5;
    g.line(Math.round(hand.x2), Math.round(hand.y2), Math.round(ex), Math.round(ey), '#5a3a22');
    g.px(Math.round(ex), Math.round(ey), '#fff6c8');
  }

  g.outline(OUTLINE);
  return g.canvas;
}

// ───────────────────────────── Cache des sprites ─────────────────────────────

const cache = new Map<string, HTMLCanvasElement>();
export function lookKey(l: Look): string { return JSON.stringify(l); }

export function getFrame(look: Look, anim: string, frame: number, emo = 'neutre', key?: string): HTMLCanvasElement {
  const def = animDef(anim);
  const fi = ((frame % def.frames.length) + def.frames.length) % def.frames.length;
  const k = `${key ?? lookKey(look)}|${anim}|${fi}|${emo}`;
  let c = cache.get(k);
  if (!c) {
    c = renderFrame(look, def.frames[fi], emo);
    if (cache.size > 4000) cache.clear();
    cache.set(k, c);
  }
  return c;
}

/** Apparence aléatoire reproductible (figurants, supporters…) */
export function randomLook(seed: number, base: Look = {}): Look {
  let s = seed >>> 0 || 7;
  const r = () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 16777216; };
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const female = base.gender ? base.gender === 'f' : r() < 0.3;
  return {
    skin: pick(Object.keys(SKINS)),
    hair: female ? pick(['long', 'queue', 'chignon', 'carre', 'boucle', 'tresses', 'mi_long', 'frange', 'couettes', 'afro', 'catogan']) : pick(['court', 'rase', 'bouclecourt', 'boucle', 'meche', 'herisse', 'chauve', 'tresses', 'court', 'afro', 'undercut', 'dreads', 'catogan']),
    hairColor: pick(['noir', 'noir', 'brun', 'brun', 'chatain', 'blond', 'roux', 'gris']),
    beard: female ? '' : pick(['', '', '', 'barbe3j', 'barbe', 'bouc', 'moustache']),
    top: pick(['tshirt', 'sweat', 'polo', 'veste', 'chemise']),
    topColor: pick(Object.values(NAMED_COLORS)),
    topColor2: pick(Object.values(NAMED_COLORS)),
    bottom: pick(['jean', 'pantalon', 'jean']),
    build: pick(['mince', 'normal', 'normal', 'costaud']),
    height: pick(['petit', 'normal', 'normal', 'grand']),
    gender: female ? 'f' : 'h',
    ...base,
  };
}
