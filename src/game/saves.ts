// Sauvegardes multiples, fins découvertes, réglages et univers personnalisés.
import type { GameState, UniverseDef } from '../core/model/types';
import type { GameSession } from '../core/runtime/session';
import { getJSON, setJSON, storage } from '../platform/storage';

export const SAVE_FORMAT = 'mille-vies/save@1';
export const SLOTS = ['auto', '1', '2', '3', '4', '5', '6'];

export interface SaveMeta {
  slot: string;
  universe: string;
  universeName: string;
  player: string;
  chapter: string;
  week: number;
  location: string;
  playtime: number;
  updated: number;
  ending?: string | null;
}
export interface SaveFile { format: string; meta: SaveMeta; state: GameState }

/** Réduit la taille d'une sauvegarde (historique très long). */
export function compactState(state: GameState): GameState {
  const s = { ...state };
  if (s.history.length > 700) {
    const keyOnes = s.history.slice(0, -500).filter((d) => d.key);
    s.history = [...keyOnes, ...s.history.slice(-500)];
  }
  if (s.journal.length > 350) s.journal = s.journal.slice(-350);
  return s;
}

export function makeSave(slot: string, g: GameSession): SaveFile {
  const state = compactState(g.serialize());
  const loc = g.u.locs.get(state.location);
  return {
    format: SAVE_FORMAT,
    meta: {
      slot, universe: g.u.def.id, universeName: g.u.def.name, player: String(state.player.nom ?? ''),
      chapter: g.chapter.def.title, week: state.time.week, location: loc ? g.render(loc.name) : state.location,
      playtime: Math.round(state.playtime), updated: Date.now(), ending: state.ending,
    },
    state,
  };
}

export async function listSaves(): Promise<SaveMeta[]> {
  const idx = await getJSON<Record<string, SaveMeta>>('saves:index', {});
  return SLOTS.map((s) => idx[s]).filter(Boolean);
}

export async function writeSave(slot: string, g: GameSession): Promise<SaveMeta> {
  const file = makeSave(slot, g);
  await storage.set(`save:${slot}`, JSON.stringify(file));
  const idx = await getJSON<Record<string, SaveMeta>>('saves:index', {});
  idx[slot] = file.meta;
  await setJSON('saves:index', idx);
  return file.meta;
}

export async function writeSaveFile(slot: string, file: SaveFile): Promise<void> {
  file.meta.slot = slot;
  await storage.set(`save:${slot}`, JSON.stringify(file));
  const idx = await getJSON<Record<string, SaveMeta>>('saves:index', {});
  idx[slot] = file.meta;
  await setJSON('saves:index', idx);
}

export async function readSave(slot: string): Promise<SaveFile | null> {
  const f = await getJSON<SaveFile | null>(`save:${slot}`, null);
  return f && f.state ? f : null;
}

export async function deleteSave(slot: string) {
  await storage.del(`save:${slot}`);
  const idx = await getJSON<Record<string, SaveMeta>>('saves:index', {});
  delete idx[slot];
  await setJSON('saves:index', idx);
}

export function parseSaveFile(text: string): SaveFile | null {
  try {
    const f = JSON.parse(text) as SaveFile;
    if (f && f.format === SAVE_FORMAT && f.state && f.meta) return f;
  } catch { /* */ }
  return null;
}

// ───────────────────────────── Fins découvertes ────────────────────────────

export async function getEndings(): Promise<Record<string, string[]>> { return getJSON('meta:endings', {}); }
export async function unlockEnding(universe: string, ending: string) {
  const all = await getEndings();
  const list = new Set(all[universe] ?? []);
  list.add(ending);
  all[universe] = [...list];
  await setJSON('meta:endings', all);
}

// ───────────────────────────── Réglages ────────────────────────────────────

export interface Settings { textSpeed: number; volume: number; muted: boolean; showValues: boolean; autoAdvance: boolean }
export const DEFAULT_SETTINGS: Settings = { textSpeed: 1, volume: 0.6, muted: false, showValues: true, autoAdvance: false };
export async function loadSettings(): Promise<Settings> { return { ...DEFAULT_SETTINGS, ...(await getJSON<Partial<Settings>>('settings', {})) }; }
export async function saveSettings(s: Settings) { await setJSON('settings', s); }

// ───────────────────────────── Univers personnalisés ───────────────────────

export interface CustomMeta { id: string; name: string; published: boolean; updated: number; base?: string }
export async function listCustomUniverses(): Promise<CustomMeta[]> { return Object.values(await getJSON<Record<string, CustomMeta>>('universes:index', {})); }
export async function readCustomUniverse(id: string): Promise<UniverseDef | null> { return getJSON<UniverseDef | null>(`universe:${id}`, null); }
export async function writeCustomUniverse(def: UniverseDef, base?: string) {
  await setJSON(`universe:${def.id}`, def);
  const idx = await getJSON<Record<string, CustomMeta>>('universes:index', {});
  idx[def.id] = { id: def.id, name: def.name, published: !!def.published, updated: Date.now(), base: base ?? idx[def.id]?.base };
  await setJSON('universes:index', idx);
}
export async function deleteCustomUniverse(id: string) {
  await storage.del(`universe:${id}`);
  const idx = await getJSON<Record<string, CustomMeta>>('universes:index', {});
  delete idx[id];
  await setJSON('universes:index', idx);
}
