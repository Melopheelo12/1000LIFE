// Simulation en ligne de commande : npm run simulate -- [runs] [universeId]
// Joue des centaines de parties avec différents profils de joueur et affiche
// la répartition des fins, les événements jamais déclenchés et les erreurs.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUniverseFolder } from './build-content';
import { compileUniverse } from '../src/core/runtime/compile';
import { simulate, type Persona } from '../src/core/runtime/simulate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runs = Number(process.argv[2] ?? 200);
const id = process.argv[3] ?? 'football';
const { def, errors } = loadUniverseFolder(join(root, 'content', id));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const u = compileUniverse(def);

const PERSONAS: Record<string, Persona[]> = {
  football: [
    { id: 'hasard', label: 'Au hasard', curiosity: 0.6 },
    { id: 'pro', label: 'Professionnel modèle', curiosity: 0.9, tags: { discipline: 3, collectif: 2, loyal: 3, famille: 2, prudent: 1, fete: -0.9, triche: -0.9, impulsif: -0.9, trahison: -0.9 }, activities: { entrainement_sup: 3, video: 2, etirements: 2, soin: 1, reviser: 2, boite_nuit: -0.9, sortir: -0.5 } },
    { id: 'star', label: 'Ambitieux individualiste', curiosity: 0.8, tags: { individuel: 3, ambition: 3, artiste: 2, frappe: 2, provoc: 1 }, activities: { entrainement_sup: 2, reseaux: 3, boite_nuit: 1, musculation: 1 } },
    { id: 'fetard', label: 'Fêtard', curiosity: 0.7, tags: { fete: 4, impulsif: 2, provoc: 2, cynique: 1 }, activities: { boite_nuit: 4, sortir: 3, jeux_video: 2, reseaux: 2 } },
    { id: 'coeur', label: 'Romantique', curiosity: 0.95, tags: { romance: 4, sincere: 3, ecoute: 3, famille: 1, soutien: 2 }, activities: { voir_ines: 4, diner: 1 } },
    { id: 'famille', label: 'Proche des siens', curiosity: 0.9, tags: { famille: 4, loyal: 3, genereux: 2, humble: 2 }, activities: { voir_famille: 3, appeler_maman: 3, charite: 2, foot_quartier: 2, reviser: 2 } },
  ],
  ombrelune: [
    { id: 'hasard', label: 'Au hasard', curiosity: 0.6 },
    { id: 'studieux', label: 'Élève modèle', curiosity: 0.9, tags: { etude: 3, regle: 2, lumiere: 2, honnete: 2, prudence: 1, ombre: -0.9, rebelle: -0.9, peur: -0.7 }, activities: { etudier: 3, pratiquer_sorts: 2, preparer_potion: 2, mediter: 1, aider_lia: 2, acheter_livre: 1 } },
    { id: 'duelliste', label: 'Duelliste téméraire', curiosity: 0.85, tags: { duel: 3, courage: 3, fierte: 1, provocation: 1, rebelle: 1, peur: -0.7 }, activities: { entrainement_duel: 4, pratiquer_sorts: 2, explorer: 1, se_reposer: 1 } },
    { id: 'sombre', label: "Attiré par l'ombre", curiosity: 0.9, tags: { ombre: 4, ruse: 2, curiosite: 2, lumiere: -0.9 }, activities: { lire_grimoire: 4, explorer: 2, pratiquer_sorts: 2, mediter: -0.9 } },
    { id: 'coeur', label: 'Romantique', curiosity: 0.95, tags: { romance: 4, ecoute: 3, loyal: 2, patience: 1, espoir: 2, ombre: -0.5, peur: -0.7 }, activities: { veillee: 3, chocolat: 3, divination: 1 } },
    { id: 'nature', label: 'Ami des bêtes', curiosity: 0.9, tags: { creature: 4, genereux: 2, aventure: 3, courage: 1, ombre: -0.5, peur: -0.7 }, activities: { soigner_creatures: 4, cueillette_foret: 3, cueillette: 1 } },
    { id: 'loyal', label: 'Ami fidèle', curiosity: 0.95, tags: { loyal: 4, famille: 2, genereux: 2, humour: 1, lumiere: 2, reconciliation: 2, ombre: -0.5, peur: -0.7 }, activities: { veillee: 3, ecrire_lettre: 2, aider_lia: 2, travailler_auberge: 1 } },
    { id: 'potions', label: 'Apprenti des potions', curiosity: 0.85, tags: { etude: 2, prudence: 1 }, activities: { preparer_potion: 5, acheter_ingredients: 2, cueillette: 2 } },
    { id: 'rebelle', label: 'Fauteur de troubles', curiosity: 0.7, tags: { rebelle: 4, provocation: 3, humour: 2, ruse: 2, regle: -0.9, honnete: -0.5 }, activities: { explorer: 3, travailler_auberge: 2, chocolat: 1, etudier: -0.8 } },
  ],
};
const personas: Persona[] = PERSONAS[id] ?? [
  { id: 'hasard', label: 'Au hasard', curiosity: 0.6 },
  { id: 'curieux', label: 'Curieux', curiosity: 0.95 },
];

const t0 = Date.now();
const rep = await simulate(u, { runs, seed: Number(process.argv[4] ?? 7), personas });
const pct = (n: number) => `${((n / runs) * 100).toFixed(1)} %`;
console.log(`\n${def.name} — ${runs} parties simulées en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`Durée moyenne : ${rep.avgTicks.toFixed(1)} semaines · ${rep.avgDecisions.toFixed(0)} décisions par partie`);
console.log(`Bloquées : ${rep.stuck} · Plantages : ${rep.crashed}`);
console.log('\nFins :');
for (const en of def.endings) console.log(`  ${(rep.endings[en.id] ?? 0) > 0 ? '✔' : '✘'} ${en.title.padEnd(32)} ${String(rep.endings[en.id] ?? 0).padStart(4)}  ${pct(rep.endings[en.id] ?? 0)}`);
for (const [k, v] of Object.entries(rep.endings)) if (!def.endings.some((e) => e.id === k)) console.log(`  ? ${k.padEnd(32)} ${String(v).padStart(4)}`);
console.log(`\nÉvénements jamais déclenchés (${rep.neverFired.length}/${u.events.size}) :`);
console.log('  ' + (rep.neverFired.join(', ') || 'aucun'));
if (rep.errors.length) {
  console.log('\nErreurs d\'exécution :');
  for (const e of rep.errors.slice(0, 25)) console.log(`  ×${e.count}  ${e.msg}`);
}
