// Mini-univers de test (volontairement NON footballistique) : prouve que le
// moteur est générique et sert de banc d'essai à toutes les mécaniques.
import type { UniverseDef } from '../src/core/model/types';

export function testUniverse(): UniverseDef {
  return {
    id: 'test_village',
    name: 'Village de test',
    config: { actionsPerTick: 2, randomEventChance: 0, maxStoryEventsPerTick: 2, tickLabel: 'Jour' },
    stats: [
      { id: 'force', label: 'Force', initial: 50, category: 'competence' },
      { id: 'or', label: 'Or', initial: 10, format: 'argent', max: 100000 },
      { id: 'energie', label: 'Énergie', initial: 100 },
      { id: 'secret', label: 'Secret', visible: false },
    ],
    vars: { jours: 0 },
    traits: [
      { id: 'rancunier', label: 'Rancunier', gain: 1, loss: 2 },
      { id: 'genereux', label: 'Généreux', gain: 1.5, loss: 0.5 },
    ],
    characters: [
      { id: 'ana', name: 'Ana Forge', traits: ['rancunier'], look: {}, barks: [{ text: 'Bonjour.' }, { text: 'Tu es riche !', if: 'stat.or > 50' }] },
      { id: 'bo', name: 'Bo', traits: ['genereux'], look: {}, relation: 10 },
    ],
    locations: [
      { id: 'place', name: 'Place', exits: [{ to: 'forge', x: 300 }], npcs: [{ id: 'bo', x: 100 }], hotspots: [{ id: 'puits', x: 50, label: 'Puits', activities: ['travailler', 'dormir'], endTick: true }] },
      { id: 'forge', name: 'Forge', npcs: [{ id: 'ana', x: 120, when: 'temps.semaine >= 1' }] },
    ],
    activities: [
      { id: 'travailler', label: 'Travailler', cost: { actions: 1, energie: 30 }, effects: 'stat.or += 5', maxPerTick: 2 },
      { id: 'dormir', label: 'Dormir', cost: { actions: 1 }, effects: 'stat.energie += 50' },
    ],
    chapters: [
      { id: 'c1', title: 'Printemps', weeks: 2, onStart: 'var.saison = "printemps"' },
      { id: 'c2', title: 'Été', weeks: 2, onStart: 'var.saison = "ete"' },
    ],
    creation: { defaultName: 'Héros', fields: [{ id: 'metier', label: 'Métier', options: [{ id: 'forgeron', label: 'Forgeron', effects: 'stat.force += 10' }, { id: 'marchand', label: 'Marchand', effects: 'stat.or += 40' }] }] },
    start: { location: 'place', event: 'intro' },
    onTickEnd: 'var.jours += 1; stat.energie += 10',
    events: [
      {
        id: 'intro', trigger: 'manual', title: 'Arrivée',
        script: `> Tu arrives au village.
bo: Bienvenue, {joueur.nom} !
* Saluer poliment #gentil ~ rel.bo += 10
  bo (content): Quelle politesse.
* Ignorer #froid ~ rel.bo -= 10
* [stat.or >= 50] Offrir de l'or ~ stat.or -= 20; rel.bo += 20 -> riche
> Fin de l'intro.

@riche
bo: Tu es généreux !
-> fin`,
      },
      {
        id: 'forge_entree', trigger: 'enter:forge', once: true, priority: 10, title: 'La forge',
        script: `ana: Qu'est-ce que tu veux ?
* Demander de l'aide #cle
  test stat.force vs 50
  si reussite
    ana: D'accord.
    ~ var.aide_ana = vrai
  sinon
    ana: Trop faible.
* L'insulter
  ~ rel.ana -= 10
  ~ souvenir(ana, insulte, "Tu l'as insultée")
  ~ planifier(vengeance_ana, 2)`,
      },
      {
        id: 'vengeance_ana', trigger: 'scheduled', title: 'Vengeance',
        script: `!rappel ana.insulte
ana (colere): Je n'ai pas oublié !
~ stat.or -= 5; var.vengee = vrai`,
      },
      { id: 'bo_talk', trigger: 'talk:bo', once: true, title: 'Bo', script: `bo: Une question ?
-> menu
@menu
* Le village ?
  bo: Calme.
  -> menu
* Le travail ?
  bo: Au puits.
  -> menu
+ Au revoir
  -> fin` },
      { id: 'debut_jour', trigger: 'tick_start', when: 'temps.semaine == 2', title: 'Matin', script: `> Un nouveau jour se lève.` },
      { id: 'pool_a', trigger: 'pool:p', title: 'A', script: `~ var.tirages += 1` },
      { id: 'pool_b', trigger: 'pool:p', title: 'B', script: `~ var.tirages += 1` },
      { id: 'tirage', trigger: 'manual', script: `tirer p 2\n~ var.fini = vrai` },
      { id: 'appel', trigger: 'manual', script: `appel sous\n> retour\n-> fin\n> jamais` },
      { id: 'sous', trigger: 'manual', script: `> dans le sous-événement\n-> fin\n> jamais non plus` },
      { id: 'boucle', trigger: 'manual', script: `@a\n-> a` },
      { id: 'fin_force', trigger: 'manual', script: `~ fin("fin_secrete")\n> dernière ligne` },
    ],
    endings: [
      { id: 'fin_secrete', title: 'Secret', type: 'secrete', when: 'faux', priority: 100, script: '> secret' },
      { id: 'fin_riche', title: 'Riche', type: 'heureuse', when: 'stat.or >= 60', priority: 10, script: '> Tu es riche, {joueur.nom}.' },
      { id: 'fin_normale', title: 'Normale', type: 'neutre', script: '> La vie continue.' },
    ],
  };
}
