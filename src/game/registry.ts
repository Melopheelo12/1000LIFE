// Registre des univers : intégrés (compilés au build) + créés dans l'éditeur.
import builtin from '../data/universes.gen.json';
import type { UniverseDef } from '../core/model/types';
import { compileUniverse, type CompiledUniverse } from '../core/runtime/compile';
import { listCustomUniverses, readCustomUniverse } from './saves';

export interface UniverseEntry { def: UniverseDef; builtin: boolean; published: boolean }

const BUILTIN = builtin as unknown as UniverseDef[];
const compiledCache = new Map<UniverseDef, CompiledUniverse>();

export function builtinUniverses(): UniverseDef[] { return BUILTIN; }

export async function allUniverses(includeDrafts = false): Promise<UniverseEntry[]> {
  const out: UniverseEntry[] = BUILTIN.map((def) => ({ def, builtin: true, published: true }));
  try {
    for (const m of await listCustomUniverses()) {
      if (!includeDrafts && !m.published) continue;
      const def = await readCustomUniverse(m.id);
      if (def) out.push({ def, builtin: false, published: !!def.published });
    }
  } catch { /* stockage indisponible */ }
  return out;
}

export async function findUniverse(id: string): Promise<UniverseDef | null> {
  const b = BUILTIN.find((u) => u.id === id);
  if (b) return b;
  return readCustomUniverse(id);
}

export function compiled(def: UniverseDef): CompiledUniverse {
  let c = compiledCache.get(def);
  if (!c) { c = compileUniverse(def); compiledCache.set(def, c); }
  return c;
}

export function cloneDef<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T; }
