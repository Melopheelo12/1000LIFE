// Sections de l'éditeur : événements, fins, variables et listes, JSON et
// fichiers, validation, simulation, aide.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EndingDef, EventDef, UniverseDef, Value } from '../../core/model/types';
import { TRIGGERS, TRIGGERS_WITH_TARGET, TRIGGER_LABELS, compileUniverse, parseTrigger, type Issue } from '../../core/runtime/compile';
import { simulate, type Persona, type SimReport } from '../../core/runtime/simulate';
import { eachInstr } from '../../core/trame/trame';
import { parseTrameBundle, toTrameBundle } from '../../core/trame/bundle';
import { copyText, offerDownload, pickTextFile } from '../../platform/storage';
import { Area, Check, Chips, Code, F, Fold, IdEdit, Num, Rows, Sel, TagList, Txt, codeError, opt, val } from './fields';
import { ListDetail, clone, issuesOf, type EdCtx, type SectionId } from './common';
import { ScriptEditor, TrameHelp } from './script';
import { uniqueId } from './templates';

const trigLabel = (t: string) => { const { trig, target } = parseTrigger(t); return `${TRIGGER_LABELS[trig] ?? trig}${target ? ` : ${target}` : ''}`; };
const numOrExpr = (v: string): number | string | undefined => (v.trim() === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : v.trim());

// ───────────────────────────── Événements ──────────────────────────────────

export function EventsSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const [trig, setTrig] = useState<string | undefined>(undefined);
  const [chap, setChap] = useState<string | undefined>(undefined);
  const filter = (e: EventDef) => (!trig || parseTrigger(e.trigger).trig === trig) && (!chap || (chap === '*' ? !e.chapters?.length : !!e.chapters?.includes(chap)));
  return (
    <ListDetail<EventDef> c={c} section="evenements" kind="evenement" issueKind="evenement" noun="Événement" items={d.events}
      onChange={(events) => c.set((x) => ({ ...x, events }))}
      label={(e) => e.title ?? e.id} sub={(e) => `${e.id} · ${trigLabel(e.trigger)}`} filter={filter}
      toolbar={(
        <div class="col" style={{ gap: 6 }}>
          <Sel value={trig} onChange={setTrig} options={TRIGGERS.map((t) => [t, TRIGGER_LABELS[t]])} empty="Tous les déclencheurs" ariaLabel="Filtrer par déclencheur" />
          <Sel value={chap} onChange={setChap} options={[['*', 'Tous chapitres (non limités)'], ...d.chapters.map((ch) => [ch.id, ch.title] as [string, string])]} empty="Tous les chapitres" ariaLabel="Filtrer par chapitre" />
        </div>
      )}
      create={(ids) => {
        const who = d.characters[0]?.id;
        return {
          id: uniqueId('evenement', ids), title: 'Nouvel événement', trigger: who ? `talk:${who}` : 'tick_start', once: true,
          script: who ? `${who}: Bonjour !\n* Le saluer. ~ rel.${who} += 2\n  ${who} (content): Content de te voir.\n* L'ignorer. ~ rel.${who} -= 3\n> La journée continue.` : '> Il se passe quelque chose.',
        };
      }}
      intro={<p class="muted small">Un événement = un déclencheur (lieu, personnage, activité, semaine, hasard, conséquence planifiée…), des conditions, et un script Trame (dialogues, choix, conséquences). Les événements les plus prioritaires et éligibles passent en premier.</p>}
      actions={(e) => <button type="button" class="pbtn small primary" onClick={() => c.onTest(c.def, { event: e.id })} title="Lance une partie de test qui commence par cet événement">▶ Tester d'ici</button>}>
      {(e, set, rename) => <EventForm c={c} e={e} set={set} rename={rename} />}
    </ListDetail>
  );
}

function EventForm({ c, e, set, rename }: { c: EdCtx; e: EventDef; set: (e: EventDef) => void; rename: (to: string, refs: boolean) => void }) {
  const d = c.def;
  const { trig, target } = parseTrigger(e.trigger);
  const hotspots = d.locations.flatMap((l) => (l.hotspots ?? []).map((h) => [h.id, `${l.name} › ${h.label}`] as [string, string]));
  const pools = [...new Set(d.events.map((x) => parseTrigger(x.trigger)).filter((x) => x.trig === 'pool' && x.target).map((x) => x.target))];
  const targets: [string, string][] | null = trig === 'enter' ? d.locations.map((l) => [l.id, l.name])
    : trig === 'talk' ? d.characters.map((ch) => [ch.id, ch.name])
      : trig === 'activity' ? (d.activities ?? []).map((a) => [a.id, a.label])
        : trig === 'hotspot' ? hotspots : null;
  const targetLabel: Record<string, string> = { enter: 'Lieu', talk: 'Personnage', activity: 'Activité', hotspot: 'Élément du décor', pool: 'Nom de la réserve' };
  const setTrig = (t: string, tg: string) => set({ ...e, trigger: TRIGGERS_WITH_TARGET.has(t) ? `${t}:${tg}` : t });
  const firstTarget = (t: string) => (t === 'enter' ? d.locations[0]?.id : t === 'talk' ? d.characters[0]?.id : t === 'activity' ? d.activities?.[0]?.id : t === 'hotspot' ? hotspots[0]?.[0] : pools[0] ?? 'reserve') ?? '';
  const scheduledBy = trig === 'scheduled' ? d.events.filter((x) => x.script.includes(`planifier(${e.id}`)) : [];
  const chanceErr = typeof e.chance === 'string' ? codeError(e.chance, 'expr') : null;
  const weightErr = typeof e.weight === 'string' ? codeError(e.weight, 'expr') : null;
  return (
    <div class="ed-form">
      <div class="ed-grid">
        <F label="Identifiant" group><IdEdit id={e.id} taken={d.events.map((x) => x.id)} onRename={rename} /></F>
        <F label="Titre" hint="Affiché dans l'historique des décisions."><Txt value={e.title} onChange={(v) => set({ ...e, title: opt(v) })} /></F>
        <F label="Déclencheur"><Sel value={trig} onChange={(v) => setTrig(v ?? 'manual', firstTarget(v ?? 'manual'))} options={TRIGGERS.map((t) => [t, TRIGGER_LABELS[t]])} /></F>
        {TRIGGERS_WITH_TARGET.has(trig) && (
          <F label={targetLabel[trig] ?? 'Cible'}>
            {targets ? <Sel value={target} onChange={(v) => setTrig(trig, v ?? '')} options={targets} empty="(choisir)" />
              : <><Txt value={target} mono list="ed-pools" onChange={(v) => setTrig(trig, v.replace(/[^\w-]/g, ''))} /><datalist id="ed-pools">{pools.map((p) => <option key={p} value={p} />)}</datalist></>}
          </F>
        )}
        <F label="Condition" span={TRIGGERS_WITH_TARGET.has(trig) ? 2 : 3} hint="Vide = toujours possible. ex. rel.alex >= 30 et non vu(dispute)"><Code kind="cond" value={e.when} onChange={(v) => set({ ...e, when: v })} /></F>
        <F label="Chapitres" span={3} group hint="Aucun = tous les chapitres.">
          <Chips options={d.chapters.map((ch) => [ch.id, ch.title])} value={e.chapters} onChange={(v) => set({ ...e, chapters: v })} />
        </F>
        <F label="Priorité" hint="Plus haut = passe avant."><Num value={e.priority} onChange={(v) => set({ ...e, priority: v || undefined })} step={1} placeholder="0" /></F>
        <F label="Répétition" group><Check checked={e.once} onChange={(v) => set({ ...e, once: v || undefined })} label="Ne se produit qu'une fois" /></F>
        <F label="Délai avant de revenir" hint="En semaines."><Num value={e.cooldown} onChange={(v) => set({ ...e, cooldown: v || undefined })} min={0} step={1} placeholder="0" /></F>
        <F label="Probabilité (%)" hint="Nombre ou expression (ex. 20 + stat.fame / 4)." error={chanceErr}><Txt value={e.chance === undefined ? '' : String(e.chance)} mono onChange={(v) => set({ ...e, chance: numOrExpr(v) })} placeholder="100" /></F>
        <F label="Poids du tirage" hint="Entre événements de même priorité." error={weightErr}><Txt value={e.weight === undefined ? '' : String(e.weight)} mono onChange={(v) => set({ ...e, weight: numOrExpr(v) })} placeholder="1" /></F>
        <F label="Étiquettes" hint="« important » : signalé comme nouveauté sur la carte."><TagList value={e.tags} onChange={(v) => set({ ...e, tags: v })} /></F>
        <F label="Notes d'auteur" span={3}><Area value={e.notes} onChange={(v) => set({ ...e, notes: opt(v) })} rows={2} placeholder="Intentions, rappels… (jamais montré au joueur)" /></F>
      </div>
      {trig === 'scheduled' && (
        <div class="muted small">Conséquence différée planifiée par : {scheduledBy.length ? scheduledBy.map((x) => <button type="button" key={x.id} class="ed-link" onClick={() => c.goto('evenements', x.id)}>{x.title ?? x.id}</button>) : <b class="warn">aucun script (ajoute « ~ planifier({e.id}, 3) » dans un choix)</b>}</div>
      )}
      <ScriptEditor value={e.script} onChange={(v) => set({ ...e, script: v })} def={d} issues={issuesOf(c, 'evenement', e.id)} jump={c.ui.sel.evenements === e.id ? c.ui.jump : null} />
    </div>
  );
}

// ───────────────────────────── Fins ────────────────────────────────────────

const ENDING_TYPES: [string, string][] = [['heureuse', 'Heureuse'], ['tragique', 'Tragique'], ['neutre', 'Neutre'], ['inattendue', 'Inattendue'], ['secrete', 'Secrète']];

export function EndingsSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const order = [...d.endings].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return (
    <ListDetail<EndingDef> c={c} section="fins" kind="fin" issueKind="fin" noun="Fin" items={d.endings}
      onChange={(endings) => c.set((x) => ({ ...x, endings }))}
      label={(en) => en.title} sub={(en) => `${en.id} · ${ENDING_TYPES.find((t) => t[0] === (en.type ?? 'neutre'))?.[1]} · priorité ${en.priority ?? 0}${en.when ? '' : ' · par défaut'}`}
      create={(ids) => ({ id: uniqueId('fin', ids), title: 'Nouvelle fin', type: 'neutre', priority: 1, when: 'stat.x >= 50', summary: '', script: '> Ainsi s\'achève cette vie.' })}
      intro={(
        <Fold title="Ordre d'évaluation des fins">
          <p class="muted small">À la fin du dernier chapitre, la première fin (priorité la plus haute) dont la condition est vraie est jouée. Une fin sans condition sert de filet de sécurité. Un script peut aussi forcer une fin avec <code>~ fin(id)</code>.</p>
          <ol class="ed-order">{order.map((en) => <li key={en.id}><button type="button" class="ed-link" onClick={() => c.select('fins', en.id)}>{en.title}</button> <span class="muted small">[{en.priority ?? 0}]</span> <code class="small">{en.when || 'toujours'}</code></li>)}</ol>
        </Fold>
      )}
      actions={(en) => <button type="button" class="pbtn small primary" onClick={() => c.onTest(c.def, { ending: en.id })} title="Joue directement cet épilogue">▶ Tester cette fin</button>}>
      {(en, set, rename) => (
        <div class="ed-form">
          <div class="ed-grid">
            <F label="Identifiant" group><IdEdit id={en.id} taken={d.endings.map((x) => x.id)} onRename={rename} /></F>
            <F label="Titre"><Txt value={en.title} onChange={(v) => set({ ...en, title: v })} /></F>
            <F label="Type"><Sel value={en.type ?? 'neutre'} onChange={(v) => set({ ...en, type: (v ?? 'neutre') as EndingDef['type'] })} options={ENDING_TYPES} /></F>
            <F label="Condition" span={2} hint="Vide = fin par défaut."><Code kind="cond" value={en.when} onChange={(v) => set({ ...en, when: v })} /></F>
            <F label="Priorité"><Num value={en.priority} onChange={(v) => set({ ...en, priority: v })} step={1} placeholder="0" /></F>
            <F label="Résumé (galerie des fins)" span={2}><Txt value={en.summary} onChange={(v) => set({ ...en, summary: opt(v) })} /></F>
            <F label="Lieu de l'épilogue"><Sel value={en.location} onChange={(v) => set({ ...en, location: v })} options={d.locations.map((l) => [l.id, l.name])} empty="(lieu courant)" /></F>
          </div>
          <ScriptEditor label="Épilogue (Trame)" value={en.script} onChange={(v) => set({ ...en, script: v })} def={d} issues={issuesOf(c, 'fin', en.id)} jump={c.ui.sel.fins === en.id ? c.ui.jump : null} />
        </div>
      )}
    </ListDetail>
  );
}

// ───────────────────────────── Variables et listes ─────────────────────────

/** Éditeur JSON avec vérification (appliqué en quittant le champ). */
function JsonField({ value, onChange, rows = 6 }: { value: unknown; onChange: (v: unknown) => void; rows?: number }) {
  const text = useMemo(() => JSON.stringify(value ?? null, null, 2), [value]);
  const [raw, setRaw] = useState(text);
  const [err, setErr] = useState('');
  useEffect(() => { setRaw(text); setErr(''); }, [text]);
  const apply = () => {
    try { const v = JSON.parse(raw); setErr(''); if (JSON.stringify(v) !== JSON.stringify(value ?? null)) onChange(v); } catch (e) { setErr(`JSON invalide : ${(e as Error).message}`); }
  };
  return (
    <>
      <textarea class={`txt mono ${err ? 'bad' : ''}`} rows={rows} value={raw} spellcheck={false} onInput={(e) => setRaw(val(e))} onBlur={apply} />
      {err && <span class="ed-err">{err}</span>}
    </>
  );
}

type VarType = 'nombre' | 'texte' | 'booleen';
const typeOf = (v: Value): VarType => (typeof v === 'number' ? 'nombre' : typeof v === 'boolean' ? 'booleen' : 'texte');

export function DataSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const vars = Object.entries(d.vars ?? {});
  const lists = Object.entries(d.lists ?? {});
  return (
    <div class="ed-form">
      <h3 class="ed-h">Variables</h3>
      <p class="muted small">Mémoire de l'histoire : faits, compteurs, choix marquants. Lecture <code>var.nom</code>, écriture <code>~ var.nom = vrai</code>. Les variables jamais déclarées valent 0. Une couleur stockée en texte peut colorer décors et tenues avec <code>$nom</code>.</p>
      <Rows<[string, Value]> items={vars} onChange={(v) => c.set((x) => ({ ...x, vars: v && v.length ? Object.fromEntries(v) : undefined }))} addLabel="Variable"
        create={() => [uniqueId('variable', vars.map(([k]) => k)), 0]}
        render={([k, v], set) => (
          <div class="ed-grid tight">
            <F label="Nom"><Txt value={k} mono onChange={(nk) => set([nk.replace(/[^\w]/g, ''), v])} /></F>
            <F label="Type"><Sel value={typeOf(v)} onChange={(t) => set([k, t === 'nombre' ? Number(v) || 0 : t === 'booleen' ? !!v && v !== 'faux' : String(v)])} options={[['nombre', 'Nombre'], ['texte', 'Texte'], ['booleen', 'Vrai / faux']]} /></F>
            <F label="Valeur de départ">
              {typeOf(v) === 'nombre' ? <Num value={v as number} onChange={(n) => set([k, n ?? 0])} />
                : typeOf(v) === 'booleen' ? <Check checked={v as boolean} onChange={(b) => set([k, b])} label={v ? 'vrai' : 'faux'} />
                  : <Txt value={v as string} onChange={(s) => set([k, s])} />}
            </F>
          </div>
        )} />
      <h3 class="ed-h">Listes de données</h3>
      <p class="muted small">Tableaux d'objets réutilisables (clubs, villes, adversaires…). Lecture : <code>liste("nom", index, "champ")</code>, <code>listeHasard("nom")</code>, <code>taille("nom")</code>.</p>
      <Rows<[string, Record<string, Value>[]]> items={lists} onChange={(v) => c.set((x) => ({ ...x, lists: v && v.length ? Object.fromEntries(v) : undefined }))} addLabel="Liste"
        create={() => [uniqueId('liste', lists.map(([k]) => k)), [{ id: 'a', nom: 'Premier' }]]}
        render={([k, arr], set) => (
          <div class="col">
            <F label="Nom de la liste"><Txt value={k} mono onChange={(nk) => set([nk.replace(/[^\w]/g, ''), arr])} /></F>
            <F label={`Contenu (${arr.length} élément${arr.length > 1 ? 's' : ''}, JSON)`}><JsonField value={arr} onChange={(v) => { if (Array.isArray(v)) set([k, v as Record<string, Value>[]]); else c.toast('Une liste doit être un tableau JSON [ … ].'); }} /></F>
          </div>
        )} />
      <h3 class="ed-h">Mises en scène prédéfinies</h3>
      <p class="muted small">Placements d'acteurs réutilisables avec <code>!preset nom</code> (ex. composition d'équipe). Format : {'{ "nom": [ { "actor": "id", "x": 120, "team": "nous" } ] }'}.</p>
      <JsonField value={d.presets ?? {}} rows={8} onChange={(v) => { if (v && typeof v === 'object' && !Array.isArray(v)) c.set((x) => ({ ...x, presets: Object.keys(v).length ? v as UniverseDef['presets'] : undefined })); else c.toast('Les mises en scène doivent être un objet JSON { … }.'); }} />
    </div>
  );
}

// ───────────────────────────── JSON et fichiers ────────────────────────────

export function shapeError(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Le fichier doit contenir un objet JSON.';
  const o = v as Record<string, unknown>;
  for (const k of ['id', 'name']) if (typeof o[k] !== 'string' || !o[k]) return `Champ « ${k} » manquant.`;
  for (const k of ['stats', 'characters', 'locations', 'chapters', 'events', 'endings']) if (!Array.isArray(o[k])) return `Champ « ${k} » manquant (tableau attendu).`;
  if (!o.start || typeof o.start !== 'object') return 'Champ « start » manquant ({ "location": "…" }).';
  return null;
}

export function JsonSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const text = useMemo(() => JSON.stringify(d, null, 2), [d]);
  const [raw, setRaw] = useState(text);
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!touched) setRaw(text); }, [text, touched]);
  const apply = () => {
    try {
      const v = JSON.parse(raw) as UniverseDef;
      const se = shapeError(v);
      if (se) { setErr(se); return; }
      if (v.id !== d.id) { setErr(`L'identifiant doit rester « ${d.id} » (pour un autre identifiant, importe le fichier depuis « Mes univers »).`); return; }
      c.replace(v); setTouched(false); setErr(''); c.toast('JSON appliqué au brouillon.');
    } catch (e) { setErr(`JSON invalide : ${(e as Error).message}`); }
  };
  const exportTrame = () => void offerDownload(`${d.id}.trame`, toTrameBundle(d.events, d.endings));
  const importTrame = async () => {
    const txt = await pickTextFile('.trame,.txt,text/plain');
    if (txt === null) return;
    const b = parseTrameBundle(txt);
    if (b.errors.length) { c.toast(`Fichier .trame : ${b.errors.length} erreur(s), ligne ${b.errors[0].line} : ${b.errors[0].msg}`); return; }
    let added = 0; let replaced = 0;
    c.set((x) => {
      const events = [...x.events]; const endings = [...x.endings];
      for (const e of b.events) { const i = events.findIndex((y) => y.id === e.id); if (i >= 0) { events[i] = e; replaced++; } else { events.push(e); added++; } }
      for (const e of b.endings) { const i = endings.findIndex((y) => y.id === e.id); if (i >= 0) { endings[i] = e; replaced++; } else { endings.push(e); added++; } }
      return { ...x, events, endings };
    });
    c.toast(`Scripts importés : ${added} ajouté(s), ${replaced} remplacé(s).`);
  };
  return (
    <div class="ed-form">
      <p class="muted small">L'univers entier est un simple fichier de données (format <code>mille-vies/universe@1</code>) : le moteur n'a besoin d'aucun code spécifique. Tu peux l'éditer ici directement, ou échanger les scripts au format texte <code>.trame</code>.</p>
      <div class="row">
        <button type="button" class="pbtn small" onClick={() => void offerDownload(`${d.id}.json`, text)}>Télécharger le JSON</button>
        <button type="button" class="pbtn small" onClick={() => void copyText(text).then((ok) => c.toast(ok ? 'JSON copié dans le presse-papiers.' : 'Copie impossible ici : utilise le téléchargement.'))}>Copier le JSON</button>
        <button type="button" class="pbtn small" onClick={exportTrame}>Exporter les scripts (.trame)</button>
        <button type="button" class="pbtn small" onClick={() => void importTrame()}>Importer des scripts (.trame)</button>
      </div>
      <textarea class={`txt mono ed-json ${err ? 'bad' : ''}`} value={raw} spellcheck={false} wrap="off" aria-label="JSON de l'univers"
        onInput={(e) => { setRaw(val(e)); setTouched(true); }} />
      {err && <div class="ed-err">{err}</div>}
      <div class="row">
        <button type="button" class="pbtn primary" disabled={!touched} onClick={apply}>Appliquer les modifications</button>
        <button type="button" class="pbtn" disabled={!touched} onClick={() => { setRaw(text); setTouched(false); setErr(''); }}>Annuler</button>
        {touched && <span class="warn small">Modifications non appliquées</span>}
      </div>
    </div>
  );
}

// ───────────────────────────── Validation ──────────────────────────────────

export function issueTarget(i: Issue): [SectionId, string | undefined] {
  switch (i.kind) {
    case 'evenement': return ['evenements', i.id];
    case 'fin': return ['fins', i.id];
    case 'personnage': return ['personnages', i.id];
    case 'lieu': return ['lieux', i.id];
    case 'activite': return ['activites', i.id];
    case 'chapitre': return ['chapitres', i.id];
    case 'stat': return ['stats', i.id];
    case 'creation': return ['creation', undefined];
    default: return ['univers', undefined];
  }
}

export function ValidationSection({ c }: { c: EdCtx }) {
  const rep = c.report;
  const [sev, setSev] = useState<'tout' | 'error' | 'warning'>('tout');
  const stats = useMemo(() => {
    if (!rep) return null;
    let choices = 0; let decisions = 0; let lines = 0; let nodes = 0; let tests = 0;
    const all = [...rep.compiled.events.values()].map((e) => e.script).concat(rep.compiled.endings.map((e) => e.script));
    for (const sc of all) {
      nodes += sc.order.length;
      eachInstr(sc, (ins) => {
        if (ins.k === 'choices') { decisions++; choices += ins.opts.length; }
        if (ins.k === 'line') lines++;
        if (ins.k === 'test') tests++;
      });
    }
    return { choices, decisions, lines, nodes, tests };
  }, [rep]);
  if (!rep) return <p class="muted">Validation en cours…</p>;
  const list = rep.issues.filter((i) => sev === 'tout' || i.severity === sev).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  const d = c.def;
  return (
    <div class="ed-form">
      <div class="ed-kpis">
        <div><b>{d.events.length}</b><span>événements</span></div>
        <div><b>{stats?.decisions ?? 0}</b><span>décisions</span></div>
        <div><b>{stats?.choices ?? 0}</b><span>choix</span></div>
        <div><b>{stats?.lines ?? 0}</b><span>répliques</span></div>
        <div><b>{stats?.tests ?? 0}</b><span>tests de compétence</span></div>
        <div><b>{d.endings.length}</b><span>fins</span></div>
        <div><b>{d.characters.length}</b><span>personnages</span></div>
        <div><b>{d.locations.length}</b><span>lieux</span></div>
      </div>
      <div class="row">
        <span class={`ed-pill ${rep.errors ? 'bad' : 'ok'}`}>{rep.errors} erreur{rep.errors > 1 ? 's' : ''}</span>
        <span class={`ed-pill ${rep.warnings ? 'warn' : 'ok'}`}>{rep.warnings} avertissement{rep.warnings > 1 ? 's' : ''}</span>
        <span class="grow" />
        <Sel value={sev} onChange={(v) => setSev((v ?? 'tout') as typeof sev)} options={[['tout', 'Tout afficher'], ['error', 'Erreurs'], ['warning', 'Avertissements']]} ariaLabel="Filtrer" />
      </div>
      {rep.errors === 0 && <p class="ed-ok">Aucune erreur bloquante : l'univers peut être testé et publié.{rep.warnings ? ' Les avertissements signalent des oublis probables, à vérifier.' : ''}</p>}
      <ul class="ed-issues big">
        {list.map((i, k) => {
          const [sec, id] = issueTarget(i);
          return (
            <li key={k} class={i.severity}>
              <span class="ed-sev">{i.severity === 'error' ? 'Erreur' : 'Attention'}</span>
              <button type="button" class="ed-link" onClick={() => c.goto(sec, id, i.line)}>{i.where}{i.line ? `, ligne ${i.line}` : ''}</button>
              <span>{i.msg}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────────── Simulation ──────────────────────────────────

interface PersonaDraft { label: string; curiosity: number; likes?: string[]; avoids?: string[] }
const DEFAULT_PERSONAS: PersonaDraft[] = [{ label: 'Au hasard', curiosity: 0.6 }, { label: 'Curieux', curiosity: 0.95 }];
const simMemo: { univers: string; personas: PersonaDraft[]; runs: number; report: SimReport | null; at: number } = { univers: '', personas: DEFAULT_PERSONAS, runs: 100, report: null, at: 0 };

const toPersona = (p: PersonaDraft, i: number): Persona => ({
  id: `p${i}`, label: p.label, curiosity: p.curiosity,
  tags: Object.fromEntries([...(p.likes ?? []).map((t) => [t, 3]), ...(p.avoids ?? []).map((t) => [t, -0.9])]),
});

export function SimulationSection({ c }: { c: EdCtx }) {
  const d = c.def;
  if (simMemo.univers !== d.id) { simMemo.univers = d.id; simMemo.report = null; simMemo.personas = DEFAULT_PERSONAS; }
  const [personas, setPersonasState] = useState<PersonaDraft[]>(simMemo.personas);
  const [runs, setRunsState] = useState(simMemo.runs);
  const [report, setReport] = useState<SimReport | null>(simMemo.report);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const setPersonas = (p: PersonaDraft[]) => { simMemo.personas = p; setPersonasState(p); };
  const setRuns = (n: number) => { simMemo.runs = n; setRunsState(n); };
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    const rep = c.report;
    if (!rep) return [];
    for (const e of rep.compiled.events.values()) eachInstr(e.script, (ins) => { if (ins.k === 'choices') ins.opts.forEach((o) => o.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [c.report]);
  const run = async () => {
    setErr(''); setBusy(0);
    try {
      const u = compileUniverse(clone(d));
      const rep = await simulate(u, { runs, seed: (Date.now() % 1e6) + 1, personas: personas.map(toPersona) }, (n) => setBusy(n));
      simMemo.report = rep; simMemo.at = Date.now();
      setReport(rep);
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const r = report;
  const endingRows = r ? [...d.endings.map((en) => [en.id, en.title, r.endings[en.id] ?? 0] as [string, string, number]),
    ...Object.entries(r.endings).filter(([k]) => !d.endings.some((en) => en.id === k)).map(([k, n]) => [k, k, n] as [string, string, number])] : [];
  const top = r ? Object.entries(r.fired).sort((a, b) => b[1] - a[1]).slice(0, 10) : [];
  return (
    <div class="ed-form">
      <p class="muted small">Le simulateur joue automatiquement des parties complètes (choix, déplacements, activités, semaines) sans affichage. Il vérifie que l'univers se termine toujours, que chaque fin est atteignable et que chaque événement peut se produire. Des profils orientent les choix grâce aux étiquettes <code>#tag</code>.</p>
      {c.report && c.report.errors > 0 && <div class="ed-warnbox">Le brouillon contient {c.report.errors} erreur(s) : la simulation risque d'être faussée.</div>}
      <h3 class="ed-h">Profils de joueurs</h3>
      <Rows<PersonaDraft> items={personas} onChange={(v) => setPersonas(v ?? [])} addLabel="Profil" create={() => ({ label: 'Nouveau profil', curiosity: 0.8 })}
        render={(p, set) => (
          <div class="ed-grid tight">
            <F label="Nom"><Txt value={p.label} onChange={(v) => set({ ...p, label: v })} /></F>
            <F label={`Curiosité : ${Math.round(p.curiosity * 100)} %`} hint="Va voir ce qui est nouveau."><input type="range" min={0} max={1} step={0.05} value={p.curiosity} onInput={(e) => set({ ...p, curiosity: Number(val(e)) })} /></F>
            <F label="Préfère les choix…" hint="Étiquettes"><TagList value={p.likes} onChange={(v) => set({ ...p, likes: v })} placeholder="ex. loyal, romance" /></F>
            <F label="Évite les choix…"><TagList value={p.avoids} onChange={(v) => set({ ...p, avoids: v })} placeholder="ex. trahison" /></F>
          </div>
        )} />
      {tags.length > 0 && (
        <div class="row small"><span class="muted">Étiquettes les plus utilisées :</span>{tags.map(([t, n]) => (
          <button type="button" key={t} class="ed-chip" title={`Ajouter un profil qui préfère #${t}`} onClick={() => setPersonas([...personas, { label: `Aime #${t}`, curiosity: 0.85, likes: [t] }])}>#{t} <small>{n}</small></button>
        ))}</div>
      )}
      <div class="row">
        <label class="ed-f"><span class="ed-l">Nombre de parties</span>
          <select class="txt" value={runs} onChange={(e) => setRuns(Number(val(e)))}>{[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button type="button" class="pbtn primary" disabled={busy !== null || !personas.length} onClick={() => void run()}>{busy !== null ? `Simulation… ${busy}/${runs}` : 'Lancer la simulation'}</button>
        {busy !== null && <div class="ed-progress grow"><i style={{ width: `${(busy / runs) * 100}%` }} /></div>}
      </div>
      {err && <div class="ed-err">Erreur : {err}</div>}
      {r && (
        <div class="col">
          <div class="ed-kpis">
            <div><b>{r.runs}</b><span>parties</span></div>
            <div><b>{(r.durationMs / 1000).toFixed(1)} s</b><span>durée</span></div>
            <div><b>{r.avgTicks.toFixed(1)}</b><span>{(d.config?.tickLabel ?? 'semaine').toLowerCase()}s / partie</span></div>
            <div><b>{Math.round(r.avgDecisions)}</b><span>décisions / partie</span></div>
            <div class={r.stuck ? 'bad' : ''}><b>{r.stuck}</b><span>bloquées</span></div>
            <div class={r.crashed ? 'bad' : ''}><b>{r.crashed}</b><span>plantages</span></div>
          </div>
          <h3 class="ed-h">Fins obtenues</h3>
          <div class="ed-bars">
            {endingRows.map(([id, title, n]) => (
              <div key={id} class={`ed-bar ${n ? '' : 'zero'}`}>
                <button type="button" class="ed-link" onClick={() => d.endings.some((en) => en.id === id) && c.goto('fins', id)}>{n ? '✔' : '✘'} {title}</button>
                <div class="ed-bar-track"><i style={{ width: `${(n / r.runs) * 100}%` }} /></div>
                <span>{n} · {((n / r.runs) * 100).toFixed(1)} %</span>
              </div>
            ))}
          </div>
          <h3 class="ed-h">Événements jamais déclenchés ({r.neverFired.length}/{d.events.length})</h3>
          {r.neverFired.length ? <div class="ed-chips">{r.neverFired.map((id) => <button type="button" key={id} class="ed-chip bad" onClick={() => c.goto('evenements', id)}>{id}</button>)}</div> : <p class="ed-ok">Tous les événements se sont produits au moins une fois.</p>}
          <h3 class="ed-h">Événements les plus fréquents</h3>
          <div class="ed-chips">{top.map(([id, n]) => <button type="button" key={id} class="ed-chip" onClick={() => c.goto('evenements', id)}>{id} <small>×{n}</small></button>)}</div>
          {r.errors.length > 0 && (
            <>
              <h3 class="ed-h">Erreurs pendant les parties</h3>
              <ul class="ed-issues">{r.errors.slice(0, 30).map((e, k) => <li key={k} class="error">×{e.count} {e.msg}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Aide ────────────────────────────────────────

export function HelpSection({ c }: { c: EdCtx }) {
  return (
    <div class="ed-form">
      <h3 class="ed-h">Créer un univers en 8 étapes</h3>
      <ol class="ed-steps">
        <li><b>Univers</b> : nom, accroche, unité de temps, actions par semaine, jauges affichées.</li>
        <li><b>Statistiques, traits, personnages</b> : ce que le joueur mesure, la personnalité des personnages, leur apparence (aperçu en direct) et leur relation de départ.</li>
        <li><b>Lieux</b> : décor procédural, sorties, personnages présents et éléments interactifs (au moins un doit « terminer la semaine »).</li>
        <li><b>Activités</b> : ce que le joueur fait de son temps libre, leurs coûts et leurs effets.</li>
        <li><b>Chapitres</b> : les grandes périodes de la vie et leur durée.</li>
        <li><b>Événements</b> : déclencheur, conditions, puis le script (dialogues, choix, conséquences immédiates, conséquences différées avec <code>planifier</code>, souvenirs avec <code>souvenir</code>).</li>
        <li><b>Fins</b> : conditions et priorités, plus une fin par défaut.</li>
        <li><b>Validation, simulation, test</b> : corrige les erreurs, simule des centaines de parties, joue ton histoire (F2 en jeu : panneau de débogage), puis <b>Enregistrer</b> et <b>Publier</b> pour la voir dans « Nouvelle vie ».</li>
      </ol>
      <h3 class="ed-h">Langage Trame</h3>
      <TrameHelp def={c.def} />
    </div>
  );
}
