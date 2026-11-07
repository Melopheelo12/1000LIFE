// Entourage personnalisable : prénoms, apparence, genre, présence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, renderTemplate } from '../src/core/expr/expr';
import { compileUniverse } from '../src/core/runtime/compile';
import { GameSession, buildNameSub, cleanCast } from '../src/core/runtime/session';
import { StoryRunner, type Step } from '../src/core/runtime/runner';
import { validateUniverse } from '../src/core/runtime/validate';
import type { UniverseDef } from '../src/core/model/types';
import { testUniverse } from './fixtures';

/** Univers de test avec un entourage : Ana (amie), Bo (frère ou sœur, facultatif). */
function castUniverse(): UniverseDef {
  const def = testUniverse();
  def.characters.push({ id: 'ines', name: 'Inès Duval', look: { gender: 'f' } });
  def.creation = {
    ...def.creation,
    cast: [
      { id: 'ana', label: 'Ta meilleure amie', group: 'Amis' },
      { id: 'bo', label: 'Ton frère', labels: ['Ton frère', 'Ta sœur'], group: 'Famille', genderChoice: true, optional: true, alt: { name: 'Bea', look: { gender: 'f' } } },
      { id: 'ines', label: "L'amour", group: 'Cœur', genderChoice: true, alt: { name: 'Noah', look: { gender: 'h' } } },
    ],
  };
  def.events.push(
    { id: 'scene_ines', trigger: 'manual', script: '> [[ines:Il|Elle]] s\'appelle Inès. Tu parles d\'Inès à Ana Forge.\nines: Je suis [[ines:prêt|prête]].' },
    { id: 'scene_bo', trigger: 'manual', when: 'present(bo)', script: 'bo: Salut, c\'est Bo.\n> Fin.' },
    { id: 'scene_bo_garde', trigger: 'manual', script: 'si present(bo)\n  bo: Je suis là.\n> Toujours là.' },
  );
  return def;
}

const linesOf = (g: GameSession, id: string): string[] => {
  const r = new StoryRunner(g, true);
  r.start(id);
  const out: string[] = [];
  for (let i = 0; i < 50; i++) {
    const st: Step = r.next();
    if (st.type === 'end') break;
    if (st.type === 'line') out.push(`${st.who ?? '>'}: ${st.text}`);
    if (st.type === 'choices') r.choose(st.options[0].index);
  }
  return out;
};

test('accords : [[id:masculin|féminin]] suit le genre du personnage, [[a|b]] celui du joueur', () => {
  const parts = parseTemplate('[[ines:Il|Elle]] est [[prêt|prête]].');
  assert.deepEqual(parts[0], { g: ['Il', 'Elle'], who: 'ines' });
  const fem = (who?: string) => (who === 'ines' ? false : true);
  assert.equal(renderTemplate(parts, { get: () => 0, call: () => 0 }, fem), 'Il est prête.');
  assert.equal(renderTemplate(parts, { get: () => 0, call: () => 0 }, true), 'Il est prête.', 'booléen : seul le joueur est accordé');
});

test('prénoms : remplacement par mot entier, nom de famille conservé, élision corrigée', () => {
  const def = castUniverse();
  const sub = buildNameSub(def, { ines: { name: 'Noah' }, ana: { name: 'Lou Martin' } })!;
  assert.equal(sub("Tu parles d'Inès à Ana Forge."), 'Tu parles de Noah à Lou Martin.');
  assert.equal(sub('Inès Duval arrive. Inèsa ne change pas.'), 'Noah Duval arrive. Inèsa ne change pas.');
  assert.equal(sub("Le carnet d'Ana et la veste de Forge."), "Le carnet de Lou et la veste de Martin.");
  const sub2 = buildNameSub(def, { ana: { name: 'Elsa' } })!;
  assert.equal(sub2('Le sac de Ana Forge, le sac de Ana.'), "Le sac d'Elsa Forge, le sac d'Elsa.");
  assert.equal(buildNameSub(def, { ana: { name: 'Ana Forge' } }), null, 'rien à remplacer');
});

test('entourage : prénom, genre et accords appliqués partout dans la partie', () => {
  const u = compileUniverse(castUniverse());
  const g = GameSession.create(u, { name: 'Sam', seed: 1, cast: { ines: { name: 'Noah', genre: 'h' }, ana: { name: 'Lou' } } });
  assert.equal(g.charName('ines'), 'Noah Duval');
  assert.equal(g.firstName('ines'), 'Noah');
  assert.equal(g.charGenre('ines'), 'h');
  assert.deepEqual(linesOf(g, 'scene_ines'), [">: Il s'appelle Noah. Tu parles de Noah à Lou Forge.", 'ines: Je suis prêt.']);
  // par défaut : l'histoire telle qu'elle est écrite
  const g2 = GameSession.create(u, { name: 'Sam', seed: 1 });
  assert.deepEqual(linesOf(g2, 'scene_ines'), [">: Elle s'appelle Inès. Tu parles d'Inès à Ana Forge.", 'ines: Je suis prête.']);
});

test('entourage : un proche retiré n\'apparaît plus (condition, lieux, répliques)', () => {
  const u = compileUniverse(castUniverse());
  const g = GameSession.create(u, { name: 'Sam', seed: 1, cast: { bo: { absent: true } } });
  assert.equal(g.present('bo'), false);
  assert.equal(g.testSrc('present(bo)'), false);
  assert.equal(g.hub().npcs.some((n) => n.id === 'bo'), false, 'Bo n\'est plus sur la place');
  assert.deepEqual(linesOf(g, 'scene_bo_garde'), ['>: Toujours là.']);
  const g2 = GameSession.create(u, { name: 'Sam', seed: 1 });
  assert.equal(g2.hub().npcs.some((n) => n.id === 'bo'), true);
  assert.deepEqual(linesOf(g2, 'scene_bo_garde'), ['bo: Je suis là.', '>: Toujours là.']);
});

test('entourage : seuls les choix valides sont gardés et sauvegardés', () => {
  const def = castUniverse();
  const c = cleanCast(def, { ana: { name: '  {Lou}  ', absent: true, genre: 'f' }, inconnu: { name: 'X' }, bo: { absent: true, genre: 'f', name: '' } })!;
  assert.deepEqual(c, { ana: { name: 'Lou' }, bo: { absent: true, genre: 'f' } }, 'Ana n\'est ni facultative ni à genre choisi');
  const g = GameSession.create(compileUniverse(def), { name: 'Sam', seed: 1, cast: c });
  const saved = g.serialize();
  assert.deepEqual(saved.cast, c);
  const g2 = GameSession.restore(compileUniverse(def), saved);
  assert.equal(g2.charName('ana'), 'Lou Forge');
  assert.equal(g2.present('bo'), false);
});

test('validation : accord sur un personnage inconnu et proche facultatif non protégé', () => {
  const def = castUniverse();
  def.events.push(
    { id: 'mauvais_accord', trigger: 'manual', script: '> [[zorro:il|elle]] arrive.' },
    { id: 'bo_sans_garde', trigger: 'manual', script: 'bo: Je parle sans condition.' },
  );
  const msgs = validateUniverse(def).issues.map((i) => `${i.where}: ${i.msg}`);
  assert.ok(msgs.some((m) => m.includes('mauvais_accord') && m.includes('« zorro »')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.includes('bo_sans_garde') && m.includes('present(bo)')), msgs.join('\n'));
  assert.ok(!msgs.some((m) => m.includes('scene_bo') && m.includes('present(bo)')), 'les scènes protégées ne sont pas signalées');
});

test('entourage : un proche « absent par défaut » reste absent sans choix explicite (ancienne sauvegarde, partie de test)', () => {
  const def = castUniverse();
  def.characters.push({ id: 'oncle', name: 'Oncle Paul', look: {} });
  def.creation!.cast!.push({ id: 'oncle', label: 'Ton oncle', optional: true, defaultAbsent: true });
  const u = compileUniverse(def);
  assert.equal(GameSession.create(u, { name: 'Sam', seed: 1 }).present('oncle'), false);
  assert.deepEqual(cleanCast(def, { oncle: { absent: true } }), undefined, 'absent par défaut : rien à retenir');
  const g = GameSession.create(u, { name: 'Sam', seed: 1, cast: { oncle: { absent: false } } });
  assert.equal(g.present('oncle'), true, 'ajouté par le joueur');
  assert.equal(g.present('ana'), true, 'non facultatif : toujours là');
});
