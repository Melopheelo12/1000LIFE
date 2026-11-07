// Renommage d'un identifiant PARTOUT dans un univers : champs structurés
// (sorties, déclencheurs, PNJ, HUD, coûts…) et code (conditions, effets,
// scripts Trame, textes interpolés). Les textes affichés au joueur ne sont
// jamais modifiés, seul le code l'est (y compris dans les « {…} »).
import type { UniverseDef } from '../../core/model/types';
import { looksLikeCondition, matchBracket } from '../../core/trame/trame';

export type RefKind = 'stat' | 'personnage' | 'lieu' | 'evenement' | 'activite' | 'chapitre' | 'fin' | 'trait';

interface Ctx { from: string; to: string; kind: RefKind; count: number }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NAMESPACES: Partial<Record<RefKind, string[]>> = { stat: ['stat'], personnage: ['rel', 'mem', 'connu', 'met'] };
/** Les statistiques ne sont référencées que par « stat.x » : pas de remplacement de mots nus. */
const BARE: Record<RefKind, boolean> = { stat: false, personnage: true, lieu: true, evenement: true, activite: true, chapitre: true, fin: true, trait: true };

/** Remplace dans un fragment de CODE sans chaîne. */
function codeSegment(src: string, c: Ctx): string {
  const f = esc(c.from);
  let out = src;
  for (const ns of NAMESPACES[c.kind] ?? []) {
    out = out.replace(new RegExp(`\\b${ns}\\.${f}(?!\\w)`, 'g'), () => { c.count++; return `${ns}.${c.to}`; });
  }
  if (BARE[c.kind]) {
    // mot nu : ni précédé de « . » / « $ » / lettre, ni suivi d'une lettre ou d'une parenthèse (appel de fonction)
    out = out.replace(new RegExp(`(^|[^\\w.$])${f}(?!\\w|\\s*\\()`, 'g'), (_m, p1: string) => { c.count++; return `${p1}${c.to}`; });
  }
  return out;
}

/** Code complet (avec chaînes) : les chaînes ne sont remplacées que si elles valent exactement l'identifiant. */
export function codeReplace(src: string, c: Ctx): string {
  let out = '';
  let buf = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      out += codeSegment(buf, c); buf = '';
      const j = src.indexOf(ch, i + 1);
      if (j < 0) { out += src.slice(i); i = src.length; break; }
      const inner = src.slice(i + 1, j);
      if (inner === c.from && c.kind !== 'stat') { c.count++; out += ch + c.to + ch; } else out += ch + inner + ch;
      i = j + 1;
      continue;
    }
    buf += ch;
    i++;
  }
  return out + codeSegment(buf, c);
}

/** Texte affiché : seules les expressions entre accolades sont touchées. */
function tplReplace(src: string, c: Ctx): string {
  let out = src;
  // accords selon un personnage : [[id:masculin|féminin]]
  if (c.kind === 'personnage' && out.includes('[[')) out = out.replace(/\[\[([a-z_][a-z0-9_]*):/g, (m, id: string) => (id === c.from ? (c.count++, `[[${c.to}:`) : m));
  if (!out.includes('{')) return out;
  return out.replace(/\{([^{}]*)\}/g, (_m, inner: string) => `{${codeReplace(inner, c)}}`);
}

const ACTOR_CMDS = new Set(['placer', 'aller', 'courir', 'anim', 'face', 'emote', 'entrer', 'sortir', 'retirer', 'tenue', 'ballon', 'objet', 'camera']);

function stageReplace(t: string, c: Ctx): string {
  const cmd = /^!(\S*)/.exec(t)?.[1]?.toLowerCase() ?? '';
  const parts = t.split(/(\s+)/);
  return parts.map((tok, i) => {
    if (i === 0 || /^\s+$/.test(tok)) return tok;
    if (c.kind === 'personnage' && ACTOR_CMDS.has(cmd) && tok === c.from) { c.count++; return c.to; }
    if (c.kind === 'personnage' && cmd === 'rappel' && tok.startsWith(`${c.from}.`)) { c.count++; return c.to + tok.slice(c.from.length); }
    if (c.kind === 'lieu' && cmd === 'lieu' && i === 2 && tok === c.from) { c.count++; return c.to; }
    return tplReplace(tok, c);
  }).join('');
}

function choiceRest(t: string, c: Ctx): string {
  let target = '';
  const arrow = t.lastIndexOf('->');
  if (arrow >= 0 && /^\s*[\w-]+\s*$/.test(t.slice(arrow + 2))) { target = t.slice(arrow); t = t.slice(0, arrow); }
  let fx = '';
  const tilde = t.indexOf(' ~ ');
  if (tilde >= 0) { fx = ` ~ ${codeReplace(t.slice(tilde + 3), c)}`; t = t.slice(0, tilde); }
  return tplReplace(t, c) + fx + target;
}

const SPEAKER = /^([A-Za-z_][\w-]*)(\s*(?:\([^)]*\))?\s*:\s?)(.*)$/;

function lineReplace(line: string, c: Ctx): string {
  const m = /^(\s*)(.*)$/.exec(line)!;
  const indent = m[1];
  let t = m[2];
  if (!t || t.startsWith('//') || t.startsWith('@')) return line;
  let prefix = '';
  const isChoice = /^[*+](\s|$)/.test(t);
  if (isChoice) {
    const sp = /^[*+]\s*/.exec(t)![0];
    prefix = sp; t = t.slice(sp.length);
  }
  const brackets: [string, string][] = isChoice ? [['[', ']'], ['(', ')']] : [['[', ']']];
  for (const [o, cl] of brackets) {
    if (!t.startsWith(o)) continue;
    const end = matchBracket(t, o, cl);
    if (end > 0 && looksLikeCondition(t.slice(1, end))) {
      prefix += o + codeReplace(t.slice(1, end), c) + cl;
      t = t.slice(end + 1);
      const sp = /^\s*/.exec(t)![0];
      prefix += sp; t = t.slice(sp.length);
    }
    break;
  }
  const head = indent + prefix;
  if (isChoice) return head + choiceRest(t, c);
  if (t.startsWith('~')) return head + '~' + codeReplace(t.slice(1), c);
  if (t.startsWith('->')) return head + t;
  if (t.startsWith('!')) return head + stageReplace(t, c);
  const kw = /^(sinon\s+si\s|si\s)/.exec(t) ?? /^(test\s)/i.exec(t);
  if (kw && !(kw[1].trim() === 'si' && SPEAKER.test(t.replace(/:$/, '')))) return head + kw[1] + codeReplace(t.slice(kw[1].length), c);
  if (/^appel\s/i.test(t)) {
    const ev = t.slice(6).trim();
    if (c.kind === 'evenement' && ev === c.from) { c.count++; return `${head}${t.slice(0, 6)}${c.to}`; }
    return head + t;
  }
  if (/^tirer\s/i.test(t) || /^sinon\b/.test(t)) return head + t;
  if (t.startsWith('>')) return head + tplReplace(t, c);
  const sm = SPEAKER.exec(t);
  if (sm) {
    let who = sm[1];
    if (c.kind === 'personnage' && who === c.from) { who = c.to; c.count++; }
    return head + who + sm[2] + tplReplace(sm[3], c);
  }
  return head + tplReplace(t, c);
}

export function scriptReplace(script: string, c: Ctx): string {
  return script.split('\n').map((l) => lineReplace(l, c)).join('\n');
}

const renameKey = <T,>(o: Record<string, T>, from: string, to: string): Record<string, T> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]));

/** Renomme un identifiant et met à jour toutes ses références. Renvoie une copie. */
export function renameRef(def: UniverseDef, kind: RefKind, from: string, to: string): { def: UniverseDef; count: number } {
  const d = JSON.parse(JSON.stringify(def)) as UniverseDef;
  const c: Ctx = { from, to, kind, count: 0 };
  const eq = <T extends string | undefined>(v: T): T => { if (v === from) { c.count++; return to as T; } return v; };
  const code = (v: string | undefined) => (v ? codeReplace(v, c) : v);
  const tpl = (v: string | undefined) => (v ? tplReplace(v, c) : v);

  // 1. L'élément lui-même et les champs structurés
  switch (kind) {
    case 'stat':
      d.stats.forEach((s) => { if (s.id === from) s.id = to; });
      if (d.config?.hud) d.config.hud = d.config.hud.map((h) => eq(h));
      d.activities?.forEach((a) => { if (a.cost && from in a.cost) { a.cost = renameKey(a.cost, from, to); c.count++; } });
      break;
    case 'personnage':
      d.characters.forEach((x) => { if (x.id === from) x.id = to; });
      d.locations.forEach((l) => l.npcs?.forEach((n) => { n.id = eq(n.id); }));
      Object.values(d.presets ?? {}).forEach((list) => list.forEach((p) => { p.actor = eq(p.actor); }));
      break;
    case 'lieu':
      d.locations.forEach((l) => { if (l.id === from) l.id = to; l.exits?.forEach((x) => { x.to = eq(x.to); }); });
      d.start.location = eq(d.start.location);
      d.chapters.forEach((ch) => { ch.location = eq(ch.location); });
      d.endings.forEach((e) => { e.location = eq(e.location); });
      if (d.theme) d.theme.cover = eq(d.theme.cover);
      break;
    case 'evenement':
      d.events.forEach((e) => { if (e.id === from) e.id = to; });
      d.start.event = eq(d.start.event);
      d.locations.forEach((l) => l.hotspots?.forEach((h) => { h.event = eq(h.event); }));
      break;
    case 'activite':
      d.activities?.forEach((a) => { if (a.id === from) a.id = to; });
      d.locations.forEach((l) => l.hotspots?.forEach((h) => { if (h.activities) h.activities = h.activities.map((a) => eq(a)); }));
      break;
    case 'chapitre':
      d.chapters.forEach((ch) => { if (ch.id === from) ch.id = to; });
      d.events.forEach((e) => { if (e.chapters) e.chapters = e.chapters.map((x) => eq(x)); });
      break;
    case 'fin':
      d.endings.forEach((e) => { if (e.id === from) e.id = to; });
      break;
    case 'trait':
      d.traits?.forEach((t) => { if (t.id === from) t.id = to; });
      d.characters.forEach((ch) => { if (ch.traits) ch.traits = ch.traits.map((t) => eq(t)); });
      break;
  }
  // 2. Déclencheurs « type:cible »
  const trig = ({ personnage: 'talk', lieu: 'enter', activite: 'activity' } as Partial<Record<RefKind, string>>)[kind];
  if (trig) d.events.forEach((e) => { if (e.trigger.trim() === `${trig}:${from}`) { e.trigger = `${trig}:${to}`; c.count++; } });

  // 3. Code, scripts et textes interpolés
  for (const e of d.events) {
    e.when = code(e.when);
    if (typeof e.chance === 'string') e.chance = code(e.chance);
    if (typeof e.weight === 'string') e.weight = code(e.weight);
    if (e.title) e.title = tpl(e.title);
    e.script = scriptReplace(e.script ?? '', c);
  }
  for (const e of d.endings) { e.when = code(e.when); e.script = scriptReplace(e.script ?? '', c); }
  for (const a of d.activities ?? []) {
    a.when = code(a.when); a.effects = code(a.effects);
    a.label = tpl(a.label) ?? a.label; a.description = tpl(a.description); a.feedback = tpl(a.feedback); a.lockedText = tpl(a.lockedText);
  }
  for (const ch of d.chapters) { ch.onStart = code(ch.onStart); ch.onEnd = code(ch.onEnd); ch.subtitle = tpl(ch.subtitle); ch.intro = tpl(ch.intro); }
  for (const l of d.locations) {
    l.when = code(l.when);
    l.name = tpl(l.name) ?? l.name;
    for (const p of [...(l.props ?? []), ...(l.backdrop ?? [])]) {
      p.when = code(p.when);
      for (const [k, v] of Object.entries(p)) if (k !== 'when' && k !== 'type' && typeof v === 'string' && v.includes('{')) p[k] = tplReplace(v, c);
    }
    for (const x of l.exits ?? []) { x.when = code(x.when); x.label = tpl(x.label); }
    for (const n of l.npcs ?? []) n.when = code(n.when);
    for (const h of l.hotspots ?? []) { h.when = code(h.when); h.label = tpl(h.label) ?? h.label; }
  }
  for (const ch of d.characters) {
    for (const b of ch.barks ?? []) { b.if = code(b.if); b.text = tpl(b.text) ?? b.text; }
    ch.role = tpl(ch.role); ch.description = tpl(ch.description); ch.goals = tpl(ch.goals);
  }
  if (kind === 'personnage') for (const sl of d.creation?.cast ?? []) if (sl.id === from) { sl.id = to; c.count++; }
  for (const f of d.creation?.fields ?? []) for (const o of f.options) o.effects = code(o.effects);
  d.onTickStart = code(d.onTickStart);
  d.onTickEnd = code(d.onTickEnd);
  if (d.config?.dateLine) d.config.dateLine = tpl(d.config.dateLine);
  for (const sec of d.sheet ?? []) for (const r of sec.rows) { r.value = tpl(r.value) ?? r.value; r.when = code(r.when); }
  if (d.vars && kind !== 'stat') for (const [k, v] of Object.entries(d.vars)) if (v === from) { d.vars[k] = to; c.count++; }
  return { def: d, count: c.count };
}

/** Nombre de références à un identifiant (sans rien modifier). */
export function countRefs(def: UniverseDef, kind: RefKind, id: string): number {
  return renameRef(def, kind, id, `${id}__ref_probe`).count;
}
