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

const personas: Persona[] = [
  { id: 'hasard', label: 'Au hasard', curiosity: 0.6 },
  { id: 'pro', label: 'Professionnel modèle', curiosity: 0.9, tags: { discipline: 3, collectif: 2, loyal: 3, famille: 2, prudent: 1, fete: -0.9, triche: -0.9, impulsif: -0.9, trahison: -0.9 }, activities: { entrainement_sup: 3, video: 2, etirements: 2, soin: 1, reviser: 2, boite_nuit: -0.9, sortir: -0.5 } },
  { id: 'star', label: 'Ambitieux individualiste', curiosity: 0.8, tags: { individuel: 3, ambition: 3, artiste: 2, frappe: 2, provoc: 1 }, activities: { entrainement_sup: 2, reseaux: 3, boite_nuit: 1, musculation: 1 } },
  { id: 'fetard', label: 'Fêtard', curiosity: 0.7, tags: { fete: 4, impulsif: 2, provoc: 2, cynique: 1 }, activities: { boite_nuit: 4, sortir: 3, jeux_video: 2, reseaux: 2 } },
  { id: 'coeur', label: 'Romantique', curiosity: 0.95, tags: { romance: 4, sincere: 3, ecoute: 3, famille: 1, soutien: 2 }, activities: { voir_ines: 4, diner: 1 } },
  { id: 'famille', label: 'Proche des siens', curiosity: 0.9, tags: { famille: 4, loyal: 3, genereux: 2, humble: 2 }, activities: { voir_famille: 3, appeler_maman: 3, charite: 2, foot_quartier: 2, reviser: 2 } },
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
