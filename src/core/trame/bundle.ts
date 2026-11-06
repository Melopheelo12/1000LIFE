// Format de fichier « .trame » regroupant plusieurs événements (et fins) :
//
//   === identifiant
//   titre: Premier entraînement
//   declencheur: enter:terrain
//   quand: temps.semaine == 1
//   unique: oui
//   ---
//   (script Trame)
//
//   === fin:legende
//   titre: Légende du football
//   type: heureuse
//   ---
//   (épilogue)
import type { EndingDef, EventDef } from '../model/types';

const KEYS: Record<string, string> = {
  titre: 'title', title: 'title', declencheur: 'trigger', déclencheur: 'trigger', trigger: 'trigger', quand: 'when', when: 'when', condition: 'when',
  chapitres: 'chapters', chapters: 'chapters', priorite: 'priority', priorité: 'priority', priority: 'priority', unique: 'once', once: 'once',
  recharge: 'cooldown', cooldown: 'cooldown', chance: 'chance', poids: 'weight', weight: 'weight', tags: 'tags', notes: 'notes',
  type: 'type', resume: 'summary', résumé: 'summary', summary: 'summary', lieu: 'location', location: 'location',
};

export interface TrameBundle { events: EventDef[]; endings: EndingDef[]; errors: { line: number; msg: string }[] }

export function parseTrameBundle(src: string, file = ''): TrameBundle {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const events: EventDef[] = [];
  const endings: EndingDef[] = [];
  const errors: { line: number; msg: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^===\s*(\S+)\s*$/.exec(lines[i]);
    if (!m) { if (lines[i].trim() && !lines[i].trim().startsWith('//')) errors.push({ line: i + 1, msg: `${file} : texte hors d'un bloc « === id »` }); i++; continue; }
    const id = m[1];
    const startLine = i + 1;
    i++;
    const head: Record<string, string> = {};
    while (i < lines.length && lines[i].trim() !== '---') {
      const l = lines[i].trim();
      if (/^===/.test(l)) break;
      if (l && !l.startsWith('//')) {
        const k = l.indexOf(':');
        if (k < 0) errors.push({ line: i + 1, msg: `${file} : en-tête invalide « ${l} » (attendu « clé: valeur »)` });
        else head[KEYS[l.slice(0, k).trim().toLowerCase()] ?? l.slice(0, k).trim()] = l.slice(k + 1).trim();
      }
      i++;
    }
    if (lines[i]?.trim() !== '---') { errors.push({ line: startLine, msg: `${file} : « --- » manquant après l'en-tête de ${id}` }); continue; }
    i++;
    const body: string[] = [];
    while (i < lines.length && !/^===\s*\S+\s*$/.test(lines[i])) body.push(lines[i++]);
    while (body.length && !body[body.length - 1].trim()) body.pop();
    const script = body.join('\n');
    const num = (v?: string) => (v === undefined ? undefined : Number.isNaN(Number(v)) ? v : Number(v));
    const list = (v?: string) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
    if (id.startsWith('fin:')) {
      endings.push({
        id: id.slice(4), title: head.title ?? id, type: (head.type as EndingDef['type']) ?? 'neutre', when: head.when || undefined,
        priority: Number(head.priority ?? 0), summary: head.summary, location: head.location, script,
      });
    } else {
      const ev: EventDef = { id, trigger: head.trigger ?? 'manual', script };
      if (head.title) ev.title = head.title;
      if (head.when) ev.when = head.when;
      if (head.chapters) ev.chapters = list(head.chapters);
      if (head.priority) ev.priority = Number(head.priority);
      if (head.once) ev.once = /^(oui|vrai|true|1)$/i.test(head.once);
      if (head.cooldown) ev.cooldown = Number(head.cooldown);
      if (head.chance) ev.chance = num(head.chance);
      if (head.weight) ev.weight = num(head.weight);
      if (head.tags) ev.tags = list(head.tags);
      if (head.notes) ev.notes = head.notes;
      events.push(ev);
    }
  }
  return { events, endings, errors };
}

/** Sérialise des événements au format .trame (export depuis l'éditeur). */
export function toTrameBundle(events: EventDef[], endings: EndingDef[] = []): string {
  const out: string[] = [];
  for (const e of events) {
    out.push(`=== ${e.id}`);
    if (e.title) out.push(`titre: ${e.title}`);
    out.push(`declencheur: ${e.trigger}`);
    if (e.when) out.push(`quand: ${e.when}`);
    if (e.chapters?.length) out.push(`chapitres: ${e.chapters.join(', ')}`);
    if (e.priority) out.push(`priorite: ${e.priority}`);
    if (e.once) out.push('unique: oui');
    if (e.cooldown) out.push(`recharge: ${e.cooldown}`);
    if (e.chance !== undefined) out.push(`chance: ${e.chance}`);
    if (e.weight !== undefined) out.push(`poids: ${e.weight}`);
    if (e.tags?.length) out.push(`tags: ${e.tags.join(', ')}`);
    out.push('---', e.script, '');
  }
  for (const f of endings) {
    out.push(`=== fin:${f.id}`, `titre: ${f.title}`, `type: ${f.type ?? 'neutre'}`);
    if (f.when) out.push(`quand: ${f.when}`);
    if (f.priority) out.push(`priorite: ${f.priority}`);
    if (f.summary) out.push(`resume: ${f.summary}`);
    if (f.location) out.push(`lieu: ${f.location}`);
    out.push('---', f.script, '');
  }
  return out.join('\n');
}
