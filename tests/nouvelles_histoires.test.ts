// Tests des deux histoires courtes : « Seize Mesures » (le rappeur) et
// « Six Suspects » (l'enquête). Contenu, parties simulées complètes, toutes
// les fins atteintes, coupable tiré au sort et résoluble, mémoire d'une
// partie à l'autre (precedent) et accords de l'entourage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileUniverse } from '../src/core/runtime/compile';
import { simulate, simulateOne, type Persona } from '../src/core/runtime/simulate';
import { GameSession } from '../src/core/runtime/session';
import { StoryRunner, type Step } from '../src/core/runtime/runner';
import { Rng } from '../src/core/rng';
import { loadUniverseFolder } from '../tools/build-content';
import { testUniverse } from './fixtures';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (id: string) => {
  const { def, errors } = loadUniverseFolder(join(root, 'content', id));
  assert.deepEqual(errors, []);
  return def;
};
const SUSPECTS = ['helene', 'julien', 'roussel', 'ami', 'morel', 'delorme'];

/** Joue un événement jusqu'au bout (choix : le premier disponible, ou celui demandé) et renvoie ses répliques. */
function play(g: GameSession, id: string, pick: (opts: { text: string; index: number; enabled: boolean }[]) => number = (o) => o.find((x) => x.enabled)!.index): string[] {
  const r = new StoryRunner(g, true);
  r.start(id);
  const out: string[] = [];
  for (let i = 0; i < 400; i++) {
    const st: Step = r.next();
    if (st.type === 'end') break;
    if (st.type === 'line') out.push(st.text);
    if (st.type === 'choices') r.choose(pick(st.options));
  }
  return out;
}

const RAPPEUR_PERSONAS: Persona[] = [
  { id: 'hasard', label: 'hasard', curiosity: 0.6 },
  { id: 'artiste', label: 'artiste', curiosity: 0.9, tags: { sincere: 3, plume: 2, loyal: 3, independant: 3, prudent: 2, quartier: 2, argent: -0.9, danger: -0.9, ambition: -0.5 }, activities: { ecrire: 4, enregistrer: 5, prod: 3, open_mic: 3, freestyle: 2 } },
  { id: 'ambitieux', label: 'ambitieux', curiosity: 0.85, tags: { ambition: 4, argent: 3, showman: 3, ego: 2, clash: 2, independant: -0.9, loyal: -0.5 }, activities: { poster: 4, open_mic: 3, clip: 4, enregistrer: 3, ecrire: 3 } },
  { id: 'rue', label: 'rue', curiosity: 0.85, tags: { danger: 5, argent: 4, loyal: 2, prudent: -0.9 }, activities: { freestyle: 3 } },
  { id: 'famille', label: 'famille', curiosity: 0.9, tags: { famille: 5, sacrifice: 3, prudent: 2, mentor: 3 }, activities: { famille: 5, taf: 4 } },
  { id: 'paix', label: 'paix', curiosity: 0.95, tags: { paix: 5, calme: 3, sincere: 3, loyal: 4, independant: 3, preuve: 3, mentor: 3, argent: -0.9, danger: -0.9, ambition: -0.5, sacrifice: -0.9 }, activities: { open_mic: 4, enregistrer: 5, ecrire: 4, prod: 3 } },
  { id: 'genereux', label: 'genereux', curiosity: 0.85, tags: { genereux: 5, ambition: 2, jaloux: -0.9, sacrifice: -0.9 }, activities: { prod: 3, enregistrer: 3, ecrire: 3 } },
  { id: 'coeur', label: 'coeur', curiosity: 0.95, tags: { romance: 5, confiance: 3, sincere: 2, jalousie: -0.9 }, activities: { open_mic: 3, reseauter: 3, ecrire: 2 } },
];
const ENQUETE_PERSONAS: Persona[] = [
  { id: 'hasard', label: 'hasard', curiosity: 0.6 },
  { id: 'methodique', label: 'methodique', curiosity: 0.95, tags: { methode: 3, prudent: 3, solide: 6, cible: 5, devoir: 2, intuition: -0.5, illegal: -0.9, fuite: -0.9, clemence: -0.9 }, activities: { examiner_scene: 4, labo: 5, releves: 4, archives: 3, fouiller_bureau: 3, fouiller_scierie: 3, perquisition: 3, rapport: 2, arreter: 2, rumeurs: 3, comparer: 4 } },
  { id: 'impulsif', label: 'impulsif', curiosity: 0.8, tags: { direct: 3, aplomb: 3, intuition: 3, prudent: -0.9 }, activities: { arreter: 5, perquisition: 3 } },
  { id: 'cowboy', label: 'cowboy', curiosity: 0.8, tags: { illegal: 5, fuite: 5, aplomb: 3, prudent: -0.9 }, activities: { perquisition: 5 } },
  { id: 'coeur', label: 'coeur', curiosity: 0.95, tags: { romance: 4, amitie: 4, clemence: 6, solide: 4, cible: 4 }, activities: { labo: 4, examiner_scene: 3, releves: 3, perquisition: 2, arreter: 2, comparer: 3, rumeurs: 3 } },
  { id: 'prudent', label: 'prudent', curiosity: 0.7, tags: { prudent: 5, solide: -0.5, intuition: -0.9 }, activities: { relire_notes: 3, flaner: 2, arreter: -0.9 } },
  { id: 'verite', label: 'verite', curiosity: 0.95, tags: { solide: 6, cible: 5, verite: 4, methode: 3, devoir: 3, intuition: -0.5, illegal: -0.9, fuite: -0.9, clemence: -0.9 }, activities: { fouiller_bureau: 4, archives: 4, examiner_portrait: 5, labo: 5, examiner_scene: 4, releves: 4, perquisition: 3, arreter: 2, comparer: 4, rumeurs: 3 } },
];

// ─── Contenu ────────────────────────────────────────────────────────────

for (const id of ['rappeur', 'enquete']) {
  test(`« ${id} » : histoire courte complète (50 à 60 événements, 6 à 8 fins, 2 chapitres)`, () => {
    const def = load(id);
    assert.ok(def.events.length >= 50 && def.events.length <= 60, `${def.events.length} événements`);
    assert.ok(def.endings.length >= 6 && def.endings.length <= 8, `${def.endings.length} fins`);
    assert.equal(def.chapters.length, 2);
    assert.ok(def.endings.some((e) => !e.when), 'une fin par défaut');
    assert.equal(def.published, true);
    // décors réutilisés : uniquement des objets de la bibliothèque existante
    assert.ok(def.locations.every((l) => (l.props ?? []).length > 0), 'chaque lieu a un décor');
  });
}

// ─── Le rappeur ─────────────────────────────────────────────────────────

test('Seize Mesures : 600 parties simulées, toutes les fins et tous les événements, aucun blocage', async () => {
  const def = load('rappeur');
  const rep = await simulate(compileUniverse(def), { runs: 600, seed: 21, personas: RAPPEUR_PERSONAS });
  assert.equal(rep.crashed, 0, JSON.stringify(rep.errors.slice(0, 5)));
  assert.equal(rep.stuck, 0);
  assert.deepEqual(rep.errors, [], 'aucune erreur d\'exécution');
  const missing = def.endings.filter((e) => !rep.endings[e.id]).map((e) => e.id);
  assert.deepEqual(missing, [], `fins jamais atteintes : ${missing.join(', ')}`);
  assert.deepEqual(rep.neverFired, [], `événements jamais déclenchés : ${rep.neverFired.join(', ')}`);
  for (const [e, n] of Object.entries(rep.endings)) assert.ok(n / 600 < 0.4, `fin « ${e} » trop fréquente (${n}/600)`);
});

test('Seize Mesures : le label douteux, le sac de Dris et le blaze changent vraiment la suite', () => {
  const u = compileUniverse(load('rappeur'));
  // Signer chez Diamant Noir : l'argent arrive, le contrat est enregistré, et la fin « Le produit » devient la fin choisie
  const g = GameSession.create(u, { name: 'Nassim', seed: 3 });
  g.s.vars.label_ouvert = true;
  play(g, 'ch1_contrat', (o) => o[0].index);
  assert.equal(g.s.vars.contrat_diamant, true);
  assert.ok(g.s.stats.argent >= 5000);
  assert.equal(g.resolveEnding(), 'fin_produit');
  // Cacher deux fois le sac de Dris mène à la chute (fin forcée)
  const h = GameSession.create(u, { name: 'Nassim', seed: 4 });
  h.s.vars.dris_deal = 2; h.s.vars.dris_sac = true;
  h.s.time.chapter = 1;
  play(h, 'ch2_descente');
  assert.equal(h.s.vars.chute, true);
  assert.equal(h.resolveEnding(), 'fin_chute');
  // Le blaze choisi au studio apparaît dans le texte
  const k = GameSession.create(u, { name: 'Nassim', seed: 5 });
  play(k, 'ch1_blaze', (o) => o[0].index);
  assert.equal(k.s.vars.blaze, 'Sillage');
  assert.match(play(k, 'ch1_open_mic').join('\n'), /Sillage/);
});

test('Seize Mesures : entourage personnalisé (rivale, amour, petite sœur) dans le vrai texte', () => {
  const u = compileUniverse(load('rappeur'));
  const g = GameSession.create(u, { name: 'Lou', gender: 'f', seed: 2, cast: { rival: { genre: 'f', name: 'Nova' }, lina: { genre: 'h', name: 'Ilan' }, cadet: { genre: 'f', name: 'Inaya' }, momo: { name: 'Bilal' } } });
  assert.equal(g.charName('rival'), 'Nova');
  assert.equal(g.charName('lina'), 'Ilan Ferhat');
  const open = play(g, 'ch1_open_mic').join('\n');
  assert.match(open, /Nova, la reine des open mics/);
  assert.match(open, /un garçon lève un vieil appareil photo/);
  assert.match(open, /Fais-nous voyager, petite\./);
  assert.doesNotMatch(open, /\[\[|\{/);
  const intro = play(g, 'intro').join('\n');
  assert.match(intro, /Bilal/);
  assert.doesNotMatch(intro, /Momo/);
});

// ─── L'enquête ──────────────────────────────────────────────────────────

/** Démarre une enquête et joue l'introduction (qui tire le coupable). */
function nouvelleEnquete(seed: number, last?: Record<string, unknown>) {
  const u = compileUniverse(load('enquete'));
  const g = GameSession.create(u, { name: 'Alex', seed }, { endings: new Set(), last });
  play(g, 'intro');
  return g;
}

test('Six Suspects : le coupable est tiré au sort parmi les six suspects', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 80; seed++) {
    const g = nouvelleEnquete(seed);
    const c = String(g.s.vars.coupable);
    assert.ok(SUSPECTS.includes(c), c);
    assert.ok(SUSPECTS.includes(String(g.s.vars.leurre)) && g.s.vars.leurre !== c, 'la fausse piste désigne un autre suspect');
    seen.add(c);
  }
  assert.deepEqual([...seen].sort(), [...SUSPECTS].sort(), 'chacun des six peut être coupable');
});

test('Six Suspects : jamais le même coupable que la partie précédente (precedent)', () => {
  for (let k = 0; k < 6; k++) {
    for (let seed = 1; seed <= 40; seed++) {
      const g = nouvelleEnquete(seed, { n_coupable: k });
      assert.notEqual(g.s.vars.n_coupable, k, `partie précédente : ${SUSPECTS[k]}`);
    }
  }
  // sans partie précédente, la valeur par défaut est utilisée
  const g = nouvelleEnquete(7);
  assert.equal(g.testSrc('precedent("n_coupable", -1) == -1'), true);
  assert.deepEqual(g.rememberedValues(), { n_coupable: g.s.vars.n_coupable });
});

test('Six Suspects : 700 parties simulées, toutes les fins et tous les événements, aucun blocage', async () => {
  const def = load('enquete');
  const rep = await simulate(compileUniverse(def), { runs: 700, seed: 13, personas: ENQUETE_PERSONAS });
  assert.equal(rep.crashed, 0, JSON.stringify(rep.errors.slice(0, 5)));
  assert.equal(rep.stuck, 0);
  assert.deepEqual(rep.errors, [], 'aucune erreur d\'exécution');
  const missing = def.endings.filter((e) => !rep.endings[e.id]).map((e) => e.id);
  assert.deepEqual(missing, [], `fins jamais atteintes : ${missing.join(', ')}`);
  assert.deepEqual(rep.neverFired, [], `événements jamais déclenchés : ${rep.neverFired.join(', ')}`);
  // les arrestations au hasard échouent souvent, c'est voulu, mais aucune fin ne doit tout écraser
  for (const [e, n] of Object.entries(rep.endings)) assert.ok(n / 700 < 0.5, `fin « ${e} » trop fréquente (${n}/700)`);
});

test('Six Suspects : chaque coupable peut être confondu, et un innocent ne dépasse jamais deux éléments', () => {
  const u = compileUniverse(load('enquete'));
  const metho = ENQUETE_PERSONAS.find((p) => p.id === 'methodique')!;
  const solved: Record<string, number> = {};
  const rng = new Rng(17);
  for (let i = 0; i < 420; i++) {
    let vars: Record<string, unknown> = {};
    const r = simulateOne(u, new Rng(rng.int(1, 2 ** 31)), metho, 60000, undefined, (g) => { vars = { ...g.s.vars }; });
    const c = String(vars.coupable);
    if (['fin_resolue', 'fin_ami', 'fin_verite'].includes(r.ending ?? '')) solved[c] = (solved[c] ?? 0) + 1;
    for (const s of SUSPECTS) {
      if (s === c) { assert.equal(vars[`faux_${s}`], 0, 'le coupable n\'a pas de fausse piste'); assert.equal(vars[`alibi_${s}`], false, 'son alibi n\'est jamais confirmé'); continue; }
      assert.equal(vars[`ind_${s}`], 0, `${s} innocent·e : aucun vrai élément`);
      assert.ok(Number(vars[`faux_${s}`]) <= 2, `${s} innocent·e : au plus deux fausses pistes (${vars[`faux_${s}`]})`);
      assert.equal(vars[`brise_${s}`], false, `${s} innocent·e : alibi jamais brisé`);
    }
  }
  assert.deepEqual(Object.keys(solved).sort(), [...SUSPECTS].sort(), `affaires résolues par coupable : ${JSON.stringify(solved)}`);
});

test('Six Suspects : un dossier solide mène à « Affaire résolue », une erreur à « L\'erreur judiciaire »', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = nouvelleEnquete(seed);
    const c = String(g.s.vars.coupable);
    if (c === 'ami') continue;
    g.s.time.chapter = 1;
    g.s.vars[`ind_${c}`] = 3;
    const lines = play(g, 'en_choix_arrestation', (o) => (o.find((x) => x.enabled && x.text.includes('(Dossier solide.)')) ?? o.find((x) => x.enabled)!).index).join('\n');
    assert.ok(lines.length > 0);
    assert.equal(g.s.vars.accuse, c);
    assert.equal(g.resolveEnding(), 'fin_resolue');
    const h = nouvelleEnquete(seed);
    h.s.time.chapter = 1;
    const autre = SUSPECTS.find((s) => s !== h.s.vars.coupable && s !== 'ami')!;
    const label = { helene: 'Hélène', julien: 'Julien', roussel: 'Roussel', morel: 'Morel', delorme: 'Delorme' }[autre]!;
    play(h, 'en_choix_arrestation', (o) => (o.find((x) => x.enabled && x.text.includes(label)) ?? o.find((x) => x.enabled)!).index);
    assert.equal(h.resolveEnding(), 'fin_erreur');
    return;
  }
});

test('Six Suspects : meilleure amie renommée et rivale, accords dans le texte', () => {
  const u = compileUniverse(load('enquete'));
  const g = GameSession.create(u, { name: 'Sam', gender: 'f', seed: 1, cast: { ami: { genre: 'f', name: 'Inès' }, rival: { genre: 'f', name: 'Pauline Garnier' } } });
  const intro = play(g, 'intro').join('\n');
  assert.match(intro, /Ta meilleure amie/);
  assert.match(intro, /revenue/);
  assert.match(intro, /Inès Girard/);
  assert.doesNotMatch(intro, /Thomas|\[\[|\{/);
  assert.equal(g.charName('rival'), 'Pauline Garnier');
});

// ─── Moteur : mémoire d'une partie à l'autre ────────────────────────────

test('precedent() : valeur retenue de la partie précédente, ou valeur par défaut', () => {
  const def = testUniverse();
  def.config = { ...def.config, remember: ['jours'] };
  const u = compileUniverse(def);
  const neuf = GameSession.create(u, { name: 'A', seed: 1 });
  assert.equal(neuf.testSrc('precedent("jours") == ""'), true);
  assert.equal(neuf.testSrc('precedent("jours", 42) == 42'), true);
  const suite = GameSession.create(u, { name: 'A', seed: 1 }, { endings: new Set(), last: { jours: 5 } });
  assert.equal(suite.testSrc('precedent("jours") == 5'), true);
  suite.s.vars.jours = 9;
  assert.deepEqual(suite.rememberedValues(), { jours: 9 });
  assert.equal(GameSession.create(compileUniverse(testUniverse()), { name: 'A', seed: 1 }).rememberedValues(), null, 'rien à retenir sans config.remember');
});

test('unité de temps : « Journée », « Semaine », « Jour »… accordés partout dans l\'interface', async () => {
  const { tickWords } = await import('../src/core/runtime/session');
  assert.deepEqual(tickWords({ tickLabel: 'Journée' }), { one: 'journée', many: 'journées', fem: true, ce: 'cette', le: 'la ', un: 'une' });
  assert.equal(tickWords({}).one, 'semaine');
  assert.equal(tickWords({ tickLabel: 'Jour' }).ce, 'ce');
  assert.equal(tickWords({ tickLabel: 'Mois' }).many, 'mois');
  assert.equal(tickWords({ tickLabel: 'Année' }).le, "l'");
  // raisons de verrouillage des activités, avec l'unité « Jour » de l'univers de test
  const g = GameSession.create(compileUniverse(testUniverse()), { name: 'A', seed: 1 });
  g.doActivity('travailler'); g.doActivity('travailler');
  assert.match(g.activityOption('travailler').reason ?? '', /ce jour/);
});

test('entourage : un proche retiré ne déclenche aucune notification de relation', () => {
  const u = compileUniverse(load('enquete'));
  const g = GameSession.create(u, { name: 'Alex', seed: 1, cast: { cadet: { absent: true } } });
  g.s.location = 'maison';
  g.notes = [];
  g.doActivity('diner_famille');
  const texts = g.notes.map((n) => n.text).join(' | ');
  assert.match(texts, /Maman apprécie/);
  assert.doesNotMatch(texts, /Hugo/);
});
