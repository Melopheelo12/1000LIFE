import { getFrame, ANIMS, SPR_W, SPR_H } from '../src/engine/gfx/character';
import { getPortrait, EMOTIONS } from '../src/engine/gfx/portrait';
import { renderLocation, envFromColors } from '../src/engine/gfx/scenery';
import type { Look, LocationDef } from '../src/core/model/types';

const looks: Look[] = [
  { skin: 'peau4', hair: 'bouclecourt', hairColor: 'noir', top: 'maillot', topColor: '#1f4e9c', topColor2: '#f2c230', bottom: 'short', bottomColor: '#ffffff', socks: '#1f4e9c' },
  { skin: 'peau1', hair: 'meche', hairColor: 'blond', top: 'survet', topColor: '#d63c3c', topColor2: '#ffffff', bottom: 'survet', bottomColor: '#25222b' },
  { skin: 'peau2', hair: 'court', hairColor: 'gris', beard: 'moustache', top: 'survet', topColor: '#1d2f5e', topColor2: '#f2c230', bottom: 'survet', bottomColor: '#1d2f5e', build: 'costaud' },
  { skin: 'peau3', hair: 'queue', hairColor: 'brun', top: 'chemise', topColor: '#7cc3ef', topColor2: '#ffffff', bottom: 'jean', gender: 'f', build: 'mince' },
  { skin: 'peau6', hair: 'rase', hairColor: 'noir', top: 'sweat', topColor: '#2f9a4c', bottom: 'jean', acc: ['casquette'] },
  { skin: 'peau2', hair: 'chauve', top: 'costume', topColor: '#25222b', topColor2: '#b33a3a', bottom: 'pantalon', bottomColor: '#25222b', build: 'costaud', beard: 'barbe' },
  { skin: 'peau5', hair: 'tresses', hairColor: 'noir', top: 'debardeur', topColor: '#f0c63a', bottom: 'short', bottomColor: '#222631', height: 'enfant' },
  { skin: 'peau1', hair: 'chignon', hairColor: 'roux', top: 'blouse', topColor: '#f4f4f4', bottom: 'pantalon', bottomColor: '#3a5584', gender: 'f', acc: ['lunettes'] },
  { skin: 'peau3', hair: 'boucle', hairColor: 'noir', top: 'robe', topColor: '#e477a9', gender: 'f' },
  { skin: 'peau2', hair: 'carre', hairColor: 'noir', top: 'costume', topColor: '#3b3e47', topColor2: '#f2f2f2', bottom: 'pantalon', bottomColor: '#3b3e47', gender: 'f', acc: ['lunettes'] },
];
const anims = Object.keys(ANIMS);
const S = 3;
const sheet = document.createElement('canvas');
sheet.width = (anims.length * 2 + 1) * SPR_W * S; sheet.height = looks.length * SPR_H * S;
const sc = sheet.getContext('2d')!; sc.imageSmoothingEnabled = false; sc.fillStyle = '#6a7a8a'; sc.fillRect(0,0,sheet.width, sheet.height);
looks.forEach((l, li) => {
  let col = 0;
  for (const a of ['idle','marche','course','parle','frappe','joie','triste','tacle','plongeon','assis','garde','bras_croises','telephone','souleve']) {
    const n = Math.min(4, ANIMS[a].frames.length);
    for (let f = 0; f < n; f++) { sc.drawImage(getFrame(l, a, f), col * SPR_W * S, li * SPR_H * S, SPR_W * S, SPR_H * S); col++; }
  }
});
document.body.appendChild(sheet);
const ps = document.createElement('canvas');
ps.width = EMOTIONS.length * 40 * S; ps.height = looks.length * 40 * S;
const pc = ps.getContext('2d')!; pc.imageSmoothingEnabled = false; pc.fillStyle = '#2a2f3e'; pc.fillRect(0,0,ps.width, ps.height);
looks.forEach((l, li) => EMOTIONS.forEach((e, ei) => pc.drawImage(getPortrait(l, e), ei * 40 * S, li * 40 * S, 40 * S, 40 * S)));
document.body.appendChild(ps);
(window as any).renderLoc = (loc: LocationDef, time?: any) => {
  const r = renderLocation(loc, envFromColors(), time);
  const c = document.createElement('canvas'); c.width = r.width; c.height = 180;
  const x = c.getContext('2d')!;
  if (r.far) x.drawImage(r.far, 0, 0);
  x.drawImage(r.main, 0, 0);
  for (const a of r.anim) a.draw(x, 1.3);
  x.drawImage(r.front, 0, 0);
  const big = document.createElement('canvas'); big.width = r.width * 2; big.height = 360; const bx = big.getContext('2d')!; bx.imageSmoothingEnabled = false; bx.drawImage(c, 0, 0, r.width*2, 360);
  big.id = 'loc'; document.body.appendChild(big);
};
