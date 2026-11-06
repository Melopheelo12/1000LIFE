import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpr, parseEffects, evaluate, parseTemplate, renderTemplate, type Scope } from '../src/core/expr/expr';
import { parseTrame } from '../src/core/trame/trame';
import { compileUniverse } from '../src/core/runtime/compile';
import { GameSession } from '../src/core/runtime/session';
import { StoryRunner, type Step } from '../src/core/runtime/runner';
import { validateUniverse } from '../src/core/runtime/validate';
import { simulate } from '../src/core/runtime/simulate';
import { testUniverse } from './fixtures';

const scope = (vals: Record<string, unknown>): Scope => ({
  get: (p) => (vals[p.join('.')] as never) ?? (p.length === 1 ? p[0] : 0),
  call: (f, a) => (f === 'max' ? Math.max(...(a as number[])) : 0),
});

test('expressions : priorités, mots-clés français, ternaire', () => {
  const s = scope({ 'stat.frappe': 62, 'rel.karim': 25, 'var.blesse': false, 'joueur.poste': 'attaquant' });
  assert.equal(evaluate(parseExpr('stat.frappe >= 60 et rel.karim > 20'), s), true);
  assert.equal(evaluate(parseExpr('stat.frappe > 70 ou non var.blesse'), s), true);
  assert.equal(evaluate(parseExpr('2 + 3 * 4'), s), 14);
  assert.equal(evaluate(parseExpr('(2 + 3) * 4'), s), 20);
  assert.equal(evaluate(parseExpr('joueur.poste == "attaquant" ? 1 : 2'), s), 1);
  assert.equal(evaluate(parseExpr('joueur.poste == attaquant'), s), true, 'symbole nu');
  assert.equal(evaluate(parseExpr('var.inconnue == ""'), scope({})), true, 'variable absente = vide');
  assert.equal(evaluate(parseExpr('max(1, 5, 3)'), s), 5);
  assert.equal(evaluate(parseExpr('stat.frappe ≥ 62'), s), true);
  assert.throws(() => parseExpr('stat.frappe >= '), /incomplète/);
  assert.throws(() => parseExpr('(1 + 2'), /attendu/);
});

test('effets : affectations multiples et appels', () => {
  const st = parseEffects('stat.moral += 5; rel.karim -= 10; souvenir(karim, trahi, "Tu l\'as dénoncé")');
  assert.equal(st.length, 3);
  assert.deepEqual(st[0].k === 'assign' && st[0].target, ['stat', 'moral']);
  assert.equal(st[2].k === 'call' && st[2].f, 'souvenir');
  assert.throws(() => parseEffects('stat.moral 5'), /attendu/);
});

test('interpolation et accord en genre', () => {
  const parts = parseTemplate('Bravo {joueur.nom}, tu es [[prêt|prête]] ! {{ok}}');
  const s = scope({ 'joueur.nom': 'Léa' });
  assert.equal(renderTemplate(parts, s, true), 'Bravo Léa, tu es prête ! {ok}');
  assert.equal(renderTemplate(parts, s, false), 'Bravo Léa, tu es prêt ! {ok}');
});

test('Trame : structure, choix, conditions, sauts, erreurs', () => {
  const sc = parseTrame(`moreau (colere): Tu es en retard.
[rel.karim >= 30] karim: Je suis avec toi.
* Faire une passe #collectif #cle ~ rel.karim += 5 -> suite
* (stat.confiance >= 30) Dribbler
  test stat.technique vs 55
  si reussite
    > Magnifique.
  sinon si stat.mental > 50
    > Raté, mais tu restes calme.
  sinon
    > Raté.
+ [Rester silencieux]
> Après les choix.

@suite
!anim moi frappe
-> fin`);
  assert.equal(sc.errors.filter((e) => e.severity === 'error').length, 0, JSON.stringify(sc.errors));
  assert.deepEqual(sc.order, ['debut', 'suite']);
  const choices = sc.nodes.debut.find((i) => i.k === 'choices');
  assert.ok(choices && choices.k === 'choices');
  assert.equal(choices.opts.length, 3);
  assert.deepEqual(choices.opts[0].tags, ['collectif', 'cle']);
  assert.equal(choices.opts[0].to, 'suite');
  assert.ok(choices.opts[1].lock, 'choix verrouillable');
  assert.equal(choices.opts[2].raw, '[Rester silencieux]', 'un mot nu entre crochets reste du texte');
  assert.equal(choices.opts[2].sticky, true);
  const bad = parseTrame(`-> nulle_part\n* \nsinon\n~ stat.x +=`);
  assert.ok(bad.errors.some((e) => /introuvable/.test(e.msg)));
  assert.ok(bad.errors.some((e) => /sans « si »/.test(e.msg)));
  assert.ok(bad.errors.some((e) => /Effet invalide/.test(e.msg)));
});

function play(runner: StoryRunner, picks: number[] = []): Step[] {
  const out: Step[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const st = runner.next();
    out.push(st);
    if (st.type === 'end') return out;
    if (st.type === 'choices') {
      const want = picks.shift();
      const opt = st.options.find((o) => o.index === want) ?? st.options.find((o) => o.enabled)!;
      runner.choose(opt.index);
    }
  }
  throw new Error('trop d\'étapes');
}

test('session : création, effets de création, intro, choix et historique', () => {
  const u = compileUniverse(testUniverse());
  assert.equal(u.issues.filter((i) => i.severity === 'error').length, 0, JSON.stringify(u.issues));
  const g = GameSession.create(u, { name: 'Zoé', fields: { metier: 'marchand' }, seed: 42 });
  assert.equal(g.s.stats.or, 50, 'marchand : +40 or');
  assert.equal(g.s.vars.saison, 'printemps', 'onStart du chapitre 1');
  const j1 = g.nextJob();
  assert.deepEqual(j1, { t: 'chapter', index: 0 });
  const j2 = g.nextJob();
  assert.ok(j2 && j2.t === 'event' && j2.id === 'intro');
  const r = new StoryRunner(g, true);
  r.start('intro');
  const steps = play(r, [2]);
  const lines = steps.filter((s) => s.type === 'line').map((s) => (s as { text: string }).text);
  assert.ok(lines.includes('Bienvenue, Zoé !'));
  assert.ok(lines.includes('Tu es généreux !'));
  assert.ok(!lines.includes('Fin de l\'intro.'), 'saut -> fin depuis @riche');
  assert.equal(g.s.stats.or, 30);
  assert.equal(g.s.rel.bo, 10 + Math.round(20 * 1.5), 'trait généreux : gains ×1,5');
  assert.equal(g.s.history.length, 1);
  assert.match(g.s.history[0].fx.join(' '), /Bo apprécie/);
});

test('session : convergence narrative après les choix', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', fields: { metier: 'forgeron' }, seed: 1 });
  const r = new StoryRunner(g, true);
  r.start('intro');
  const steps = play(r, [1]);
  const lines = steps.filter((s) => s.type === 'line').map((s) => (s as { text: string }).text);
  assert.ok(lines.includes('Fin de l\'intro.'), 'le flux reprend après le bloc de choix');
  assert.equal(g.s.rel.bo, 5, 'trait généreux : pertes ×0,5');
  const choices = steps.find((s) => s.type === 'choices');
  assert.ok(choices && choices.type === 'choices' && choices.options.length === 2, 'choix conditionnel masqué (or < 50)');
});

test('choix « une fois » et menu de conversation', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 3 });
  const r = new StoryRunner(g, true);
  r.start('bo_talk');
  const counts: number[] = [];
  for (let i = 0; i < 50; i++) {
    const st = r.next();
    if (st.type === 'end') break;
    if (st.type === 'choices') { counts.push(st.options.length); r.choose(st.options[0].index); }
  }
  assert.deepEqual(counts, [3, 2, 1], 'les choix * disparaissent, le + reste');
});

test('relations : personnalité, mémoire, conséquence différée planifiée', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 7 });
  const r = new StoryRunner(g, true);
  while (g.nextJob()) { /* consomme la file initiale */ }
  g.travel('forge');
  const job = g.nextJob();
  assert.ok(job && job.t === 'event' && job.id === 'forge_entree');
  r.start('forge_entree');
  play(r, [1]);
  assert.equal(g.s.rel.ana, -20, 'trait rancunier : pertes ×2');
  assert.ok(g.s.mem.ana?.insulte, 'souvenir enregistré');
  assert.equal(g.s.scheduled.length, 1);
  assert.equal(g.s.scheduled[0].due, 2);
  // L'événement d'entrée « once » ne se redéclenche pas
  g.travel('place'); g.travel('forge');
  assert.equal(g.nextJob(), null);
  // Avance de deux jours → la vengeance arrive avec son rappel
  const seen: string[] = [];
  let echo = '';
  for (let day = 0; day < 2; day++) {
    g.endTick();
    let j;
    while ((j = g.nextJob())) {
      if (j.t === 'event') {
        seen.push(j.id);
        r.start(j.id);
        for (const st of play(r)) if (st.type === 'echo') echo = st.text;
      }
    }
  }
  assert.ok(seen.includes('vengeance_ana'), `vengeance planifiée exécutée (${seen})`);
  assert.match(echo, /Ana se souvient : « Tu l'as insultée »/);
  assert.equal(g.s.vars.vengee, true);
});

test('temps : semaines, chapitres, fin de partie et choix de la fin', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', fields: { metier: 'marchand' }, seed: 9 });
  const r = new StoryRunner(g, true);
  const kinds: string[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const j = g.nextJob();
    if (!j) { g.doActivity('travailler'); g.endTick(); continue; }
    kinds.push(j.t === 'event' ? `e:${j.id}` : j.t);
    if (j.t === 'event') { r.start(j.id); play(r, [0]); }
    if (j.t === 'ending') break;
  }
  assert.equal(g.s.vars.saison, 'ete');
  assert.equal(g.s.vars.jours, 4);
  assert.ok(kinds.includes('e:debut_jour'));
  assert.equal(kinds.filter((k) => k === 'chapter').length, 2);
  assert.equal(kinds[kinds.length - 1], 'ending');
  assert.equal(g.s.ending, 'fin_riche', 'fin choisie par priorité/condition (or >= 60)');
});

test('fin forcée par un effet', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 2 });
  while (g.nextJob()) { /* */ }
  const r = new StoryRunner(g, true);
  r.start('fin_force');
  const steps = play(r);
  assert.ok(steps.some((s) => s.type === 'line' && s.text === 'dernière ligne'), 'l\'événement se termine');
  const j = g.nextJob();
  assert.deepEqual(j, { t: 'ending', id: 'fin_secrete' });
});

test('activités : coûts, limites, raisons de verrouillage', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 2 });
  while (g.nextJob()) { /* */ }
  assert.equal(g.s.actions, 2);
  assert.ok(g.doActivity('travailler').ok);
  assert.equal(g.s.stats.or, 15);
  assert.equal(g.s.stats.energie, 70);
  assert.ok(g.doActivity('travailler').ok);
  const third = g.activityOption('travailler');
  assert.equal(third.enabled, false);
  assert.match(third.reason!, /Plus assez|Déjà fait/);
  const hub = g.hub();
  assert.equal(hub.hotspots[0].options.some((o) => o.kind === 'end'), true);
  assert.equal(hub.npcs[0].id, 'bo');
  assert.equal(hub.npcs[0].hasNew, true, 'Bo a une conversation d\'histoire disponible');
});

test('sous-événements (appel) et tirages dans une réserve', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 5 });
  const r = new StoryRunner(g, true);
  r.start('appel');
  const lines = play(r).filter((s) => s.type === 'line').map((s) => (s as { text: string }).text);
  assert.deepEqual(lines, ['dans le sous-événement', 'retour']);
  r.start('tirage');
  play(r);
  assert.equal(g.s.vars.tirages, 2);
  assert.equal(g.s.vars.fini, true);
});

test('élément du décor : un événement « hotspot:id » passe avant les activités', () => {
  const def = testUniverse();
  def.events.push({ id: 'puits_secret', trigger: 'hotspot:puits', once: true, script: '> Un écho monte du puits.' });
  const g = GameSession.create(compileUniverse(def), { name: 'Test', seed: 4 });
  g.queue = [];
  const ev = g.useHotspot('puits');
  assert.equal(ev?.def.id, 'puits_secret');
  assert.ok(g.queue.some((j) => j.t === 'event' && j.id === 'puits_secret'));
  g.s.fired.puits_secret = { n: 1, last: g.s.time.tick };
  assert.equal(g.useHotspot('puits'), null, 'événement unique déjà vu');
});

test('protection contre les boucles infinies', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 5 });
  const r = new StoryRunner(g, true);
  r.start('boucle');
  assert.throws(() => r.next(), /Boucle infinie/);
});

test('sauvegarde : sérialisation, reprise et déterminisme', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'A', seed: 99 });
  while (g.nextJob()) { /* */ }
  const saved = JSON.stringify(g.serialize());
  const a = GameSession.restore(u, JSON.parse(saved));
  const b = GameSession.restore(u, JSON.parse(saved));
  const ra = new StoryRunner(a, true); const rb = new StoryRunner(b, true);
  ra.start('forge_entree'); rb.start('forge_entree');
  play(ra, [0]); play(rb, [0]);
  assert.deepEqual(a.serialize(), b.serialize(), 'mêmes choix → même résultat (RNG sauvegardé)');
});

test('validation : références cassées détectées', () => {
  const def = testUniverse();
  def.events.push({ id: 'casse', trigger: 'talk:inconnu', script: 'fantome: Bouh\n~ stat.magie += 1\n!lieu nulle_part\nappel rien\n-> trou' });
  def.locations[0].exits!.push({ to: 'lune', x: 10 });
  const rep = validateUniverse(def);
  const msgs = rep.issues.map((i) => i.msg).join('\n');
  for (const re of [/Personnage inconnu « inconnu »/, /Statistique inconnue « magie »/, /Lieu inconnu « nulle_part »/, /Événement appelé inconnu/, /introuvable/, /lieu inconnu « lune »/i, /Personnage inconnu « fantome »/]) {
    assert.match(msgs, re);
  }
  const clean = validateUniverse(testUniverse());
  assert.equal(clean.errors, 0, clean.issues.map((i) => `${i.where}: ${i.msg}`).join('\n'));
});

test('simulateur : parties complètes sans plantage', async () => {
  const u = compileUniverse(testUniverse());
  const rep = await simulate(u, { runs: 40, seed: 1 });
  assert.equal(rep.crashed, 0, JSON.stringify(rep.errors));
  assert.equal(rep.stuck, 0);
  const total = Object.values(rep.endings).reduce((a, b) => a + b, 0);
  assert.equal(total, 40);
  assert.ok(rep.endings.fin_normale || rep.endings.fin_riche);
});

test('effets : les textes d\'actu, de journal, d\'objectif et de souvenir sont interpolés', () => {
  const u = compileUniverse(testUniverse());
  const g = GameSession.create(u, { name: 'Lina', seed: 3 });
  g.s.vars.club = 'Le Club';
  const charId = u.def.characters[0].id;
  g.exec(parseEffects(`actu("{var.club} gagne ! {joueur.nom} héros."); journal("Note de {joueur.nom}"); objectif("o1", "Battre {var.club}"); souvenir(${charId}, k, "Souvenir de {joueur.nom}")`));
  const texts = g.s.journal.map((j) => j.text);
  assert.ok(texts.includes('Le Club gagne ! Lina héros.'), texts.join(' | '));
  assert.ok(texts.includes('Note de Lina'));
  assert.equal(g.s.objectives.o1.text, 'Battre Le Club');
  assert.equal(g.s.mem[charId].k.text, 'Souvenir de Lina');
  assert.ok(!texts.some((t) => t.includes('{')), 'plus aucune accolade brute');
});
