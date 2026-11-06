// Tests de la logique de l'éditeur : modèle d'univers, renommage global, bundles .trame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUniverseTemplate, slugify, uniqueId } from '../src/ui/editor/templates';
import { renameRef, countRefs } from '../src/ui/editor/refactor';
import { validateUniverse } from '../src/core/runtime/validate';
import { compileUniverse } from '../src/core/runtime/compile';
import { simulate } from '../src/core/runtime/simulate';
import { parseTrameBundle, toTrameBundle } from '../src/core/trame/bundle';
import { loadUniverseFolder } from '../tools/build-content';
import type { UniverseDef } from '../src/core/model/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const football = (): UniverseDef => {
  const { def, errors } = loadUniverseFolder(join(root, 'content', 'football'));
  assert.equal(errors.length, 0);
  return def;
};

test('identifiants : slug et unicité', () => {
  assert.equal(slugify('Élise Ménard'), 'elise_menard');
  assert.equal(slugify('3e mi-temps !'), '_3e_mi_temps');
  assert.equal(slugify('   '), 'element');
  assert.equal(uniqueId('Karim', ['karim', 'karim_2']), 'karim_3');
});

test('modèle « univers vierge » : valide et jouable jusqu\'au bout', async () => {
  const def = newUniverseTemplate('mon_univers', 'Mon univers');
  const rep = validateUniverse(def);
  assert.equal(rep.errors, 0, rep.issues.map((i) => `${i.where} : ${i.msg}`).join('\n'));
  assert.equal(rep.warnings, 0, rep.issues.map((i) => `${i.where} : ${i.msg}`).join('\n'));
  const sim = await simulate(compileUniverse(def), { runs: 80, seed: 3 });
  assert.equal(sim.stuck, 0);
  assert.equal(sim.crashed, 0);
  assert.deepEqual(sim.errors, []);
  assert.ok(Object.keys(sim.endings).length >= 3, `fins atteintes : ${JSON.stringify(sim.endings)}`);
  assert.deepEqual(sim.neverFired, [], 'tous les événements du modèle se déclenchent');
});

test('renommage d\'un personnage : scripts, conditions, déclencheurs, PNJ, mais pas les textes', () => {
  const def = newUniverseTemplate('t', 'T');
  const { def: d, count } = renameRef(def, 'personnage', 'alex', 'alexandre');
  assert.ok(count >= 15, `références : ${count}`);
  const intro = d.events.find((e) => e.id === 'intro')!.script;
  assert.match(intro, /^alexandre \(content\): Debout/m);
  assert.match(intro, /souvenir\(alexandre, "promesse", "Tu as promis de l'aider à repeindre son café"\)/);
  assert.match(intro, /!entrer alexandre gauche/);
  assert.match(d.events.find((e) => e.id === 'alex_cafe')!.script, /!rappel alexandre\.promesse/);
  assert.equal(d.events.find((e) => e.id === 'alex_discussion')!.trigger, 'talk:alexandre');
  assert.equal(d.locations.find((l) => l.id === 'place')!.npcs![0].id, 'alexandre');
  assert.equal(d.endings.find((e) => e.id === 'inseparables')!.when, 'rel.alexandre >= 55');
  assert.equal(d.onTickEnd, 'stat.energie += 20; stat.moral -= 1; eloigner(alexandre, 1)');
  assert.equal(d.characters[0].name, 'Alex Martin', 'le nom affiché ne change pas');
  assert.equal(validateUniverse(d).errors, 0);
  assert.equal(countRefs(d, 'personnage', 'alex'), 0, 'plus aucune référence à l\'ancien identifiant');
});

test('renommage d\'un lieu, d\'un événement et d\'une statistique', () => {
  const def = newUniverseTemplate('t', 'T');
  let d = renameRef(def, 'lieu', 'atelier', 'boutique').def;
  assert.equal(d.events.find((e) => e.id === 'rencontre_morgane')!.trigger, 'enter:boutique');
  assert.match(d.events.find((e) => e.id === 'proposition')!.script, /^!lieu boutique$/m);
  assert.ok(d.locations.find((l) => l.id === 'place')!.exits!.some((x) => x.to === 'boutique'));
  assert.equal(d.endings.find((e) => e.id === 'associe')!.location, 'boutique');
  d = renameRef(d, 'evenement', 'alex_cafe', 'cafe').def;
  assert.match(d.events.find((e) => e.id === 'intro')!.script, /planifier\(cafe, 3\)/);
  assert.match(d.events.find((e) => e.id === 'alex_discussion')!.script, /non vu\(cafe\)/);
  d = renameRef(d, 'stat', 'energie', 'vitalite').def;
  assert.deepEqual(d.config!.hud, ['vitalite', 'moral', 'argent']);
  assert.equal(d.activities!.find((a) => a.id === 'travailler')!.cost!.vitalite, 20);
  assert.match(d.events.find((e) => e.id === 'cafe')!.script, /\* \(stat\.vitalite >= 30\) J'arrive/);
  const rep = validateUniverse(d);
  assert.equal(rep.errors, 0, rep.issues.map((i) => `${i.where} : ${i.msg}`).join('\n'));
  assert.equal(rep.warnings, 0);
});

test('renommage dans le grand univers football : aucune référence cassée', () => {
  const base = football();
  const before = validateUniverse(base);
  assert.equal(before.errors, 0);
  const cases: [Parameters<typeof renameRef>[1], string, string][] = [
    ['personnage', 'karim', 'karim_benali'], ['lieu', 'terrain', 'terrain_entrainement'], ['stat', 'frappe', 'tir'],
    ['chapitre', 'ch1', 'chapitre_un'], ['evenement', 'intro', 'introduction'], ['activite', 'entrainement_sup', 'seance_sup'],
  ];
  for (const [kind, from, to] of cases) {
    const { def, count } = renameRef(base, kind, from, to);
    assert.ok(count > 0, `${kind} ${from} : au moins une référence`);
    const rep = validateUniverse(def);
    assert.equal(rep.errors, 0, `${kind} ${from} → ${to}\n` + rep.issues.filter((i) => i.severity === 'error').map((i) => `${i.where} : ${i.msg}`).join('\n'));
    assert.equal(rep.warnings, before.warnings, `${kind} ${from} : avertissements inchangés`);
    assert.equal(countRefs(def, kind, from), 0, `${kind} ${from} : plus de référence`);
  }
});

test('format .trame : aller-retour événements et fins', () => {
  const def = newUniverseTemplate('t', 'T');
  const txt = toTrameBundle(def.events, def.endings);
  const back = parseTrameBundle(txt);
  assert.deepEqual(back.errors, []);
  assert.equal(back.events.length, def.events.length);
  assert.equal(back.endings.length, def.endings.length);
  for (const e of def.events) {
    const b = back.events.find((x) => x.id === e.id)!;
    assert.equal(b.script, e.script);
    assert.equal(b.trigger, e.trigger);
    assert.equal(b.when, e.when);
  }
});
