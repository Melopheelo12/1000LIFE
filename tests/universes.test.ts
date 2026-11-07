// Tests des univers livrés : validation stricte, parties simulées complètes,
// toutes les fins atteignables, et garde-fous sur les lieux verrouillés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateUniverse } from '../src/core/runtime/validate';
import { compileUniverse } from '../src/core/runtime/compile';
import { simulate, type Persona } from '../src/core/runtime/simulate';
import { GameSession } from '../src/core/runtime/session';
import { StoryRunner, type Step } from '../src/core/runtime/runner';
import { loadUniverseFolder } from '../tools/build-content';
import { testUniverse } from './fixtures';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (id: string) => {
  const { def, errors } = loadUniverseFolder(join(root, 'content', id));
  assert.deepEqual(errors, []);
  return def;
};

for (const id of ['football', 'ombrelune', 'rappeur', 'enquete']) {
  test(`univers « ${id} » : aucune erreur ni avertissement`, () => {
    const rep = validateUniverse(load(id));
    const list = rep.issues.map((i) => `${i.severity} ${i.where}: ${i.msg}`).join('\n');
    assert.equal(rep.errors, 0, list);
    assert.equal(rep.warnings, 0, list);
  });
}

test('Ombrelune : contenu complet (≥ 150 événements, 13 fins, 18 lieux)', () => {
  const def = load('ombrelune');
  assert.ok(def.events.length >= 150, `${def.events.length} événements`);
  assert.equal(def.endings.length, 13);
  assert.equal(def.locations.length, 18);
  assert.ok(def.endings.some((e) => !e.when), 'une fin par défaut');
});

test('Ombrelune : 450 parties simulées, toutes les fins atteintes, aucun blocage', async () => {
  const def = load('ombrelune');
  const u = compileUniverse(def);
  const personas: Persona[] = [
    { id: 'hasard', label: 'hasard', curiosity: 0.6 },
    { id: 'studieux', label: 'studieux', curiosity: 0.9, tags: { etude: 3, lumiere: 2, ombre: -0.9, peur: -0.7 }, activities: { etudier: 3, pratiquer_sorts: 2, preparer_potion: 2 } },
    { id: 'duelliste', label: 'duelliste', curiosity: 0.85, tags: { duel: 3, courage: 3, peur: -0.7 }, activities: { entrainement_duel: 4 } },
    { id: 'sombre', label: 'sombre', curiosity: 0.9, tags: { ombre: 4, ruse: 2, lumiere: -0.9 }, activities: { lire_grimoire: 4, explorer: 2 } },
    { id: 'coeur', label: 'coeur', curiosity: 0.95, tags: { romance: 4, ecoute: 3, loyal: 2, ombre: -0.5, peur: -0.7 }, activities: { veillee: 3, chocolat: 3 } },
    { id: 'nature', label: 'nature', curiosity: 0.9, tags: { creature: 4, aventure: 3, ombre: -0.5, peur: -0.7 }, activities: { soigner_creatures: 4, cueillette_foret: 3 } },
    { id: 'loyal', label: 'loyal', curiosity: 0.95, tags: { loyal: 4, famille: 2, lumiere: 2, ombre: -0.5, peur: -0.7 }, activities: { veillee: 3, ecrire_lettre: 2 } },
    { id: 'potions', label: 'potions', curiosity: 0.85, tags: { etude: 2 }, activities: { preparer_potion: 5, acheter_ingredients: 2 } },
    { id: 'rebelle', label: 'rebelle', curiosity: 0.7, tags: { rebelle: 4, provocation: 3, ruse: 2, regle: -0.9 }, activities: { explorer: 3, travailler_auberge: 2 } },
  ];
  const rep = await simulate(u, { runs: 450, seed: 11, personas });
  assert.equal(rep.crashed, 0, JSON.stringify(rep.errors.slice(0, 5)));
  assert.equal(rep.stuck, 0);
  assert.deepEqual(rep.errors, [], 'aucune erreur d\'exécution');
  const missing = def.endings.filter((e) => !rep.endings[e.id]).map((e) => e.id);
  assert.deepEqual(missing, [], `fins jamais atteintes : ${missing.join(', ')}`);
  // aucune fin ne doit écraser les autres
  for (const [id, n] of Object.entries(rep.endings)) assert.ok(n / 450 < 0.4, `fin « ${id} » trop fréquente (${n}/450)`);
});

test('lieux verrouillés : la Réserve et la tour n\'apparaissent pas sur la carte avant d\'être ouvertes', () => {
  const u = compileUniverse(load('ombrelune'));
  const g = GameSession.create(u, { name: 'Test', fields: { affinite: 'onde', origine: 'lignee', caractere: 'curieux' }, seed: 4 });
  assert.equal(g.locationAvailable('section_interdite'), false);
  assert.equal(g.locationAvailable('tour_ouest'), false);
  g.s.vars.cle_reserve = true;
  g.s.vars.tour_ouverte = true;
  assert.equal(g.locationAvailable('section_interdite'), true);
  assert.equal(g.locationAvailable('tour_ouest'), true);
});

test('validation : une porte verrouillée vers un lieu ouvert sur la carte est signalée', () => {
  const def = testUniverse();
  const [a, b] = def.locations;
  a.exits = [...(a.exits ?? []).filter((e) => e.to !== b.id), { to: b.id, x: 40, when: 'var.cle' }];
  for (const l of def.locations) l.exits = (l.exits ?? []).map((e) => (e.to === b.id ? { ...e, when: 'var.cle' } : e));
  b.when = undefined;
  if (def.start.location === b.id) def.start.location = a.id;
  const msgs = validateUniverse(def).issues.map((i) => i.msg).join('\n');
  assert.match(msgs, /reste accessible depuis la carte/);
  b.when = 'var.cle';
  const msgs2 = validateUniverse(def).issues.map((i) => i.msg).join('\n');
  assert.doesNotMatch(msgs2, /reste accessible depuis la carte/);
});

/** Joue un événement jusqu'au bout (premier choix disponible) et renvoie ses répliques. */
function playLines(g: GameSession, id: string): string[] {
  const r = new StoryRunner(g, true);
  r.start(id);
  const out: string[] = [];
  for (let i = 0; i < 300; i++) {
    const st: Step = r.next();
    if (st.type === 'end') break;
    if (st.type === 'line') out.push(st.text);
    if (st.type === 'choices') r.choose(st.options.find((o) => o.enabled)!.index);
  }
  return out;
}

test('entourage : chaque univers propose famille, amis, rival et amour personnalisables', () => {
  for (const id of ['football', 'ombrelune', 'rappeur', 'enquete']) {
    const slots = load(id).creation?.cast ?? [];
    const groups = new Set(slots.map((s) => s.group));
    assert.ok(groups.has('Famille') && groups.has('Amis et rivaux') && groups.has('Cœur'), id);
    assert.ok(slots.some((s) => s.genderChoice && s.group === 'Cœur'), `${id} : genre de l'amour au choix`);
    assert.ok(slots.some((s) => s.optional), `${id} : proches facultatifs`);
  }
});

test('entourage : prénoms et accords appliqués au vrai texte des histoires', () => {
  const om = compileUniverse(load('ombrelune'));
  const g = GameSession.create(om, { name: 'Lou', gender: 'f', seed: 2, cast: { ayla: { name: 'Aylan', genre: 'h' }, noe: { name: 'Sacha' } } });
  const aveu = playLines(g, 'ch3_ayla_aveu').join('\n');
  assert.match(aveu, /Aylan est là, comme s'il t'attendait\./);
  assert.doesNotMatch(aveu, /Ayla\b|\[\[/);
  assert.equal(g.charName('noe'), 'Sacha Lambert');
  const foot = compileUniverse(load('football'));
  const f = GameSession.create(foot, { name: 'Inès', gender: 'f', seed: 2, cast: { yanis: { name: 'Yasmine', genre: 'f' }, maman: { name: 'Fatima' } } });
  const intro = playLines(f, 'intro').join('\n');
  assert.match(intro, /Ta sœur t'a fait ça\. Elle a passé la soirée dessus\./);
  assert.match(intro, /MA SŒUR LA CHAMPIONNE/);
  assert.doesNotMatch(intro, /\[\[|\{/);
});

test('entourage : sans les proches facultatifs, leurs scènes ne se déclenchent jamais', async () => {
  for (const id of ['ombrelune', 'football', 'rappeur', 'enquete']) {
    const def = load(id);
    const u = compileUniverse(def);
    const absent = Object.fromEntries((def.creation?.cast ?? []).filter((s) => s.optional).map((s) => [s.id, { absent: true }]));
    const g = GameSession.create(u, { name: 'Lou', seed: 9, cast: absent });
    for (const ev of u.events.values()) {
      const mentions = (def.creation?.cast ?? []).some((s) => s.optional && (ev.def.when ?? '').includes(`present(${s.id})`));
      if (mentions) assert.equal(g.isEligible(ev), false, `${id} : ${ev.def.id} ne doit pas être possible`);
    }
  }
});
