// Compile chaque univers de content/<id>/ (universe.json + story/*.trame)
// en un paquet JSON unique, le valide, et l'écrit dans src/data/universes.gen.json.
// Le build échoue s'il reste des erreurs bloquantes.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTrameBundle } from '../src/core/trame/bundle';
import { validateUniverse } from '../src/core/runtime/validate';
import type { UniverseDef } from '../src/core/model/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content');
const out: UniverseDef[] = [];
let failed = false;
const verbose = process.argv.includes('--verbose');

export function loadUniverseFolder(dir: string): { def: UniverseDef; errors: string[] } {
  const def = JSON.parse(readFileSync(join(dir, 'universe.json'), 'utf8')) as UniverseDef;
  def.events = def.events ?? [];
  def.endings = def.endings ?? [];
  const errors: string[] = [];
  const storyDir = join(dir, 'story');
  if (existsSync(storyDir)) {
    for (const f of readdirSync(storyDir).filter((x) => x.endsWith('.trame')).sort()) {
      const b = parseTrameBundle(readFileSync(join(storyDir, f), 'utf8'), f);
      def.events.push(...b.events);
      def.endings.push(...b.endings);
      errors.push(...b.errors.map((e) => `${f}:${e.line} ${e.msg}`));
    }
  }
  return { def, errors };
}

if (process.argv[1] && process.argv[1].endsWith('build-content.ts')) {
  for (const id of readdirSync(contentDir)) {
    const dir = join(contentDir, id);
    if (!existsSync(join(dir, 'universe.json'))) continue;
    const { def, errors } = loadUniverseFolder(dir);
    const rep = validateUniverse(def);
    const errs = rep.issues.filter((i) => i.severity === 'error');
    const warns = rep.issues.filter((i) => i.severity === 'warning');
    console.log(`• ${def.name} (${def.id}) : ${def.events.length} événements, ${def.endings.length} fins, ${def.locations.length} lieux, ${def.characters.length} personnages`);
    for (const e of errors) { console.log(`  ✘ ${e}`); failed = true; }
    for (const e of errs) console.log(`  ✘ ${e.where}${e.line ? ` (ligne ${e.line})` : ''} : ${e.msg}`);
    if (verbose) for (const w of warns) console.log(`  ⚠ ${w.where}${w.line ? ` (ligne ${w.line})` : ''} : ${w.msg}`);
    else if (warns.length) console.log(`  ⚠ ${warns.length} avertissement(s) (--verbose pour le détail)`);
    if (errs.length) failed = true;
    out.push(def);
  }
  mkdirSync(join(root, 'src/data'), { recursive: true });
  writeFileSync(join(root, 'src/data/universes.gen.json'), JSON.stringify(out));
  if (failed) { console.error('Contenu invalide : corrige les erreurs ci-dessus.'); process.exit(1); }
  console.log('✔ src/data/universes.gen.json');
}
