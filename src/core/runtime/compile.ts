// Compilation d'un univers : parse une fois tous les scripts et expressions,
// indexe les événements par déclencheur, et collecte les erreurs (avec leur
// emplacement) pour l'éditeur et les tests.
import { parseExpr, parseEffects, type Expr, type Stmt } from '../expr/expr';
import { parseTrame, type Script } from '../trame/trame';
import type {
  ActivityDef, ChapterDef, CharacterDef, EndingDef, EventDef, LocationDef, StatDef, TraitDef, UniverseDef,
} from '../model/types';

export interface CEvent {
  def: EventDef;
  trig: string;
  target: string;
  key: string;
  when?: Expr;
  chance?: Expr;
  weight?: Expr;
  script: Script;
  chapters?: Set<string>;
}
export interface CActivity { def: ActivityDef; when?: Expr; fx: Stmt[] }
export interface CEnding { def: EndingDef; when?: Expr; script: Script }
export interface CChapter { def: ChapterDef; onStart: Stmt[]; onEnd: Stmt[] }

export interface Issue {
  where: string;
  kind: 'univers' | 'stat' | 'personnage' | 'lieu' | 'activite' | 'chapitre' | 'evenement' | 'fin' | 'creation' | 'execution';
  id?: string;
  line?: number;
  msg: string;
  severity: 'error' | 'warning';
}

export const TRIGGERS = [
  'enter', 'talk', 'activity', 'hotspot', 'tick_start', 'tick_end', 'random', 'scheduled',
  'chapter_start', 'chapter_end', 'pool', 'manual',
] as const;
export const TRIGGERS_WITH_TARGET = new Set(['enter', 'talk', 'activity', 'hotspot', 'pool']);

export const TRIGGER_LABELS: Record<string, string> = {
  enter: 'En entrant dans un lieu',
  talk: 'En parlant à un personnage',
  activity: 'Après une activité',
  hotspot: 'En utilisant un élément du décor',
  tick_start: 'Début de semaine',
  tick_end: 'Fin de semaine',
  random: 'Aléatoire (chaque semaine)',
  scheduled: 'Planifié (conséquence différée)',
  chapter_start: 'Début de chapitre',
  chapter_end: 'Fin de chapitre',
  pool: 'Réserve (tirage)',
  manual: 'Manuel (appel depuis un script)',
};

export interface CompiledUniverse {
  def: UniverseDef;
  stats: Map<string, StatDef>;
  chars: Map<string, CharacterDef>;
  traits: Map<string, TraitDef>;
  locs: Map<string, LocationDef>;
  acts: Map<string, CActivity>;
  events: Map<string, CEvent>;
  byKey: Map<string, CEvent[]>;
  endings: CEnding[];
  chapters: CChapter[];
  onTickStart: Stmt[];
  onTickEnd: Stmt[];
  creationFx: Map<string, Stmt[]>;
  issues: Issue[];
  cond(src: string | undefined, where?: string): Expr | undefined;
}

export function parseTrigger(t: string): { trig: string; target: string } {
  const i = t.indexOf(':');
  if (i < 0) return { trig: t.trim(), target: '' };
  return { trig: t.slice(0, i).trim(), target: t.slice(i + 1).trim() };
}

export function compileUniverse(def: UniverseDef): CompiledUniverse {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);
  const condCache = new Map<string, Expr | undefined>();

  const ex = (src: string | number | undefined, kind: Issue['kind'], id: string, what: string): Expr | undefined => {
    if (src === undefined || src === '') return undefined;
    if (typeof src === 'number') return { k: 'num', v: src };
    try { return parseExpr(String(src)); } catch (e) {
      add({ where: `${kind} ${id}`, kind, id, msg: `${what} invalide : ${(e as Error).message}`, severity: 'error' });
      return { k: 'bool', v: false };
    }
  };
  const fx = (src: string | undefined, kind: Issue['kind'], id: string, what: string): Stmt[] => {
    if (!src || !src.trim()) return [];
    try { return parseEffects(src); } catch (e) {
      add({ where: `${kind} ${id}`, kind, id, msg: `${what} invalide : ${(e as Error).message}`, severity: 'error' });
      return [];
    }
  };

  const stats = new Map<string, StatDef>();
  for (const s of def.stats ?? []) {
    if (stats.has(s.id)) add({ where: `stat ${s.id}`, kind: 'stat', id: s.id, msg: 'Identifiant de statistique en double', severity: 'error' });
    stats.set(s.id, s);
  }
  const chars = new Map<string, CharacterDef>();
  for (const c of def.characters ?? []) {
    if (chars.has(c.id)) add({ where: `personnage ${c.id}`, kind: 'personnage', id: c.id, msg: 'Identifiant de personnage en double', severity: 'error' });
    if (c.id === 'moi') add({ where: `personnage ${c.id}`, kind: 'personnage', id: c.id, msg: '« moi » est réservé au joueur', severity: 'error' });
    chars.set(c.id, c);
  }
  const traits = new Map<string, TraitDef>((def.traits ?? []).map((t) => [t.id, t]));
  const locs = new Map<string, LocationDef>();
  for (const l of def.locations ?? []) {
    if (locs.has(l.id)) add({ where: `lieu ${l.id}`, kind: 'lieu', id: l.id, msg: 'Identifiant de lieu en double', severity: 'error' });
    locs.set(l.id, l);
  }
  const acts = new Map<string, CActivity>();
  for (const a of def.activities ?? []) {
    acts.set(a.id, { def: a, when: ex(a.when, 'activite', a.id, 'Condition'), fx: fx(a.effects, 'activite', a.id, 'Effets') });
  }

  const events = new Map<string, CEvent>();
  const byKey = new Map<string, CEvent[]>();
  for (const e of def.events ?? []) {
    if (events.has(e.id)) add({ where: `événement ${e.id}`, kind: 'evenement', id: e.id, msg: 'Identifiant d\'événement en double', severity: 'error' });
    const { trig, target } = parseTrigger(e.trigger ?? 'manual');
    if (!(TRIGGERS as readonly string[]).includes(trig)) {
      add({ where: `événement ${e.id}`, kind: 'evenement', id: e.id, msg: `Déclencheur inconnu « ${trig} »`, severity: 'error' });
    }
    const script = parseTrame(e.script ?? '');
    for (const pe of script.errors) {
      add({ where: `événement ${e.id}`, kind: 'evenement', id: e.id, line: pe.line, msg: pe.msg, severity: pe.severity });
    }
    const ce: CEvent = {
      def: e, trig, target,
      key: TRIGGERS_WITH_TARGET.has(trig) ? `${trig}:${target}` : trig,
      when: ex(e.when, 'evenement', e.id, 'Condition'),
      chance: e.chance === undefined || e.chance === 100 ? undefined : ex(e.chance, 'evenement', e.id, 'Probabilité'),
      weight: e.weight === undefined ? undefined : ex(e.weight, 'evenement', e.id, 'Poids'),
      script,
      chapters: e.chapters && e.chapters.length ? new Set(e.chapters) : undefined,
    };
    events.set(e.id, ce);
    if (!byKey.has(ce.key)) byKey.set(ce.key, []);
    byKey.get(ce.key)!.push(ce);
  }
  for (const list of byKey.values()) list.sort((a, b) => (b.def.priority ?? 0) - (a.def.priority ?? 0));

  const endings: CEnding[] = (def.endings ?? []).map((en) => {
    const script = parseTrame(en.script ?? '');
    for (const pe of script.errors) add({ where: `fin ${en.id}`, kind: 'fin', id: en.id, line: pe.line, msg: pe.msg, severity: pe.severity });
    return { def: en, when: ex(en.when, 'fin', en.id, 'Condition'), script };
  }).sort((a, b) => (b.def.priority ?? 0) - (a.def.priority ?? 0));

  const chapters: CChapter[] = (def.chapters ?? []).map((c) => ({
    def: c, onStart: fx(c.onStart, 'chapitre', c.id, 'Effets de début'), onEnd: fx(c.onEnd, 'chapitre', c.id, 'Effets de fin'),
  }));
  if (chapters.length === 0) add({ where: 'univers', kind: 'univers', msg: 'Il faut au moins un chapitre', severity: 'error' });

  const creationFx = new Map<string, Stmt[]>();
  for (const f of def.creation?.fields ?? []) {
    for (const o of f.options) creationFx.set(`${f.id}:${o.id}`, fx(o.effects, 'creation', `${f.id}.${o.id}`, 'Effets'));
  }

  return {
    def, stats, chars, traits, locs, acts, events, byKey, endings, chapters,
    onTickStart: fx(def.onTickStart, 'univers', def.id, 'Effets de début de semaine'),
    onTickEnd: fx(def.onTickEnd, 'univers', def.id, 'Effets de fin de semaine'),
    creationFx, issues,
    cond(src, where = 'condition') {
      if (!src) return undefined;
      if (condCache.has(src)) return condCache.get(src);
      let e: Expr | undefined;
      try { e = parseExpr(src); } catch (err) {
        add({ where, kind: 'univers', msg: `Condition invalide « ${src} » : ${(err as Error).message}`, severity: 'error' });
        e = { k: 'bool', v: false };
      }
      condCache.set(src, e);
      return e;
    },
  };
}
