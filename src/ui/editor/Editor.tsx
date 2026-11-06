// ─────────────────────────────────────────────────────────────────────────────
// Éditeur d'histoires intégré : bibliothèque des univers créés, puis espace de
// travail (sections, validation en direct, simulation, test en jeu, sauvegarde,
// publication, import/export). Aucun code du moteur n'est modifié : un univers
// n'est qu'un fichier de données.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Look, UniverseDef } from '../../core/model/types';
import { compileUniverse } from '../../core/runtime/compile';
import { GameSession } from '../../core/runtime/session';
import { validateUniverse, type ValidationReport } from '../../core/runtime/validate';
import { NAMED_COLORS } from '../../engine/gfx/character';
import { envFromColors, type SceneEnv } from '../../engine/gfx/scenery';
import { resolveLookWith, sessionEnv } from '../../game/env';
import { builtinUniverses } from '../../game/registry';
import { deleteCustomUniverse, listCustomUniverses, readCustomUniverse, writeCustomUniverse, type CustomMeta } from '../../game/saves';
import { LocalKV, cloudActive, offerDownload, pickTextFile } from '../../platform/storage';
import { SceneThumb } from '../components';
import { clone, type EdCtx, type SectionId, type UiState } from './common';
import { val } from './fields';
import { newUniverseTemplate, uniqueId } from './templates';
import {
  ActivitiesSection, ChaptersSection, CharactersSection, CreationSection, LocationsSection, StatsSection, TraitsSection, UniverseSection,
} from './sections1';
import { DataSection, EndingsSection, EventsSection, HelpSection, JsonSection, SimulationSection, ValidationSection, shapeError } from './sections2';

export interface Draft { def: UniverseDef; dirty: boolean }
type TestFrom = { event?: string; ending?: string };

// Brouillon de secours (local uniquement) en cas de fermeture de la page
const recoveryKV = new LocalKV();
const RECOVERY_KEY = 'editor:recovery';
async function readRecovery(): Promise<{ def: UniverseDef; savedAt: number } | null> {
  try { const v = await recoveryKV.get(RECOVERY_KEY); return v ? JSON.parse(v) as { def: UniverseDef; savedAt: number } : null; } catch { return null; }
}
const writeRecovery = (def: UniverseDef) => recoveryKV.set(RECOVERY_KEY, JSON.stringify({ def, savedAt: Date.now() })).catch(() => undefined);
const clearRecovery = () => recoveryKV.del(RECOVERY_KEY).catch(() => undefined);

// L'état de navigation survit au passage en mode test
let uiMemo: (UiState & { univers: string }) | null = null;

export function Editor(p: { draft: Draft | null; onDraft: (d: Draft | null) => void; onExit: () => void; onTest: (def: UniverseDef, from?: TestFrom) => void }) {
  if (!p.draft) return <Library onOpen={(def, dirty) => p.onDraft({ def, dirty })} onExit={p.onExit} />;
  return <Workspace draft={p.draft} onDraft={p.onDraft} onExit={p.onExit} onTest={p.onTest} />;
}

// ───────────────────────────── Bibliothèque ────────────────────────────────

const fmtDate = (t: number) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

function Library({ onOpen, onExit }: { onOpen: (def: UniverseDef, dirty: boolean) => void; onExit: () => void }) {
  const [list, setList] = useState<CustomMeta[] | null>(null);
  const [recover, setRecover] = useState<{ def: UniverseDef; savedAt: number } | null>(null);
  const [name, setName] = useState('');
  const builtins = builtinUniverses();
  const [base, setBase] = useState(builtins[0] ? `b:${builtins[0].id}` : '');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const refresh = () => listCustomUniverses().then((l) => setList(l.sort((a, b) => b.updated - a.updated))).catch(() => setList([]));
  useEffect(() => { void refresh(); void readRecovery().then(setRecover); }, []);
  const taken = async () => new Set([...builtins.map((u) => u.id), ...(await listCustomUniverses().catch(() => [] as CustomMeta[])).map((m) => m.id)]);

  const create = async () => {
    const n = name.trim() || 'Mon univers';
    onOpen(newUniverseTemplate(uniqueId(n, await taken()), n), true);
  };
  const copyFrom = async () => {
    const src = base.startsWith('b:') ? builtins.find((u) => `b:${u.id}` === base) ?? null : await readCustomUniverse(base.slice(2));
    if (!src) { setMsg('Univers introuvable.'); return; }
    const copy = clone(src);
    copy.id = uniqueId(`${src.id}_copie`, await taken());
    copy.name = `${src.name} (copie)`;
    copy.published = false;
    onOpen(copy, true);
  };
  const open = async (id: string) => {
    const def = await readCustomUniverse(id);
    if (def) onOpen(def, false); else setMsg('Cet univers est illisible.');
  };
  const del = async (id: string) => { await deleteCustomUniverse(id); setConfirmDel(null); void refresh(); };
  const importJson = async () => {
    setMsg('');
    const text = await pickTextFile('.json,application/json');
    if (text === null) return;
    let def: UniverseDef;
    try { def = JSON.parse(text) as UniverseDef; } catch { setMsg('Ce fichier n\'est pas un JSON valide.'); return; }
    const err = shapeError(def);
    if (err) { setMsg(`Fichier d'univers invalide : ${err}`); return; }
    const ids = await taken();
    if (ids.has(def.id)) { const old = def.id; def.id = uniqueId(def.id, ids); setMsg(`L'identifiant « ${old} » existait déjà : l'univers importé devient « ${def.id} ».`); }
    def.published = false;
    onOpen(def, true);
  };

  return (
    <div class="screen ed-screen">
      <div class="page">
        <div class="page-head">
          <button type="button" class="pbtn small" onClick={onExit}>← Menu</button>
          <h1>Éditeur d'histoires</h1>
        </div>
        <p class="muted" style={{ margin: 0 }}>Crée tes propres univers (personnages, lieux, événements, choix, conséquences et fins), teste-les, simule des centaines de parties, puis publie-les dans « Nouvelle vie ». {cloudActive ? 'Tes univers sont enregistrés dans ton compte.' : 'Tes univers sont enregistrés dans ce navigateur.'}</p>
        {msg && <div class="err-box" role="alert">{msg}</div>}
        {recover && (
          <div class="pbox ed-recover">
            <div class="grow"><b>Brouillon non enregistré récupéré</b><div class="muted small">« {recover.def.name} » · {fmtDate(recover.savedAt)}</div></div>
            <button type="button" class="pbtn small primary" onClick={() => onOpen(recover.def, true)}>Reprendre</button>
            <button type="button" class="pbtn small" onClick={() => { void clearRecovery(); setRecover(null); }}>Jeter</button>
          </div>
        )}
        <div class="ed-lib">
          <section class="pbox ed-lib-card">
            <h2>Nouvel univers</h2>
            <p class="muted small">Part d'un petit univers complet et jouable (2 personnages, 3 lieux, 6 événements, 4 fins) à transformer.</p>
            <label class="ed-f"><span class="ed-l">Nom</span><input class="txt" value={name} placeholder="Mon univers" maxLength={60} onInput={(e) => setName(val(e))} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} /></label>
            <button type="button" class="pbtn primary" onClick={() => void create()}>Créer</button>
          </section>
          <section class="pbox ed-lib-card">
            <h2>Partir d'un univers existant</h2>
            <p class="muted small">Copie modifiable d'un univers (l'original n'est jamais touché).</p>
            <label class="ed-f"><span class="ed-l">Univers</span>
              <select class="txt" value={base} onChange={(e) => setBase(val(e))}>
                {builtins.map((u) => <option key={u.id} value={`b:${u.id}`}>{u.name} (intégré)</option>)}
                {(list ?? []).map((m) => <option key={m.id} value={`c:${m.id}`}>{m.name}</option>)}
              </select>
            </label>
            <button type="button" class="pbtn" onClick={() => void copyFrom()} disabled={!base}>Copier et ouvrir</button>
          </section>
          <section class="pbox ed-lib-card">
            <h2>Importer</h2>
            <p class="muted small">Ouvre un fichier d'univers <code>.json</code> exporté depuis l'éditeur.</p>
            <button type="button" class="pbtn" onClick={() => void importJson()}>Choisir un fichier…</button>
          </section>
        </div>
        <h2 style={{ margin: '8px 0 0' }}>Mes univers</h2>
        {!list && <p class="muted">Chargement…</p>}
        {list && list.length === 0 && <p class="muted">Aucun univers créé pour l'instant.</p>}
        <div class="slots">
          {list?.map((m) => (
            <div class="slot pbox" key={m.id}>
              <div class="info">
                <div class="row" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{m.name}</b><span class={`badge ${m.published ? 't-heureuse' : ''}`}>{m.published ? 'Publié' : 'Brouillon'}</span></div>
                <div class="muted small">{m.id} · modifié le {fmtDate(m.updated)}</div>
              </div>
              {confirmDel === m.id ? (
                <div class="row"><span class="small">Supprimer définitivement ?</span><button type="button" class="pbtn small danger" onClick={() => void del(m.id)}>Supprimer</button><button type="button" class="pbtn small" onClick={() => setConfirmDel(null)}>Annuler</button></div>
              ) : (
                <div class="row">
                  <button type="button" class="pbtn primary" onClick={() => void open(m.id)}>Ouvrir</button>
                  <button type="button" class="pbtn small danger" onClick={() => setConfirmDel(m.id)}>Supprimer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Espace de travail ───────────────────────────

const NAV: { id: SectionId; label: string; group?: string }[] = [
  { id: 'univers', label: 'Univers', group: 'Monde' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'traits', label: 'Traits de personnalité' },
  { id: 'personnages', label: 'Personnages' },
  { id: 'lieux', label: 'Lieux' },
  { id: 'activites', label: 'Activités' },
  { id: 'chapitres', label: 'Chapitres' },
  { id: 'creation', label: 'Création du joueur' },
  { id: 'evenements', label: 'Événements', group: 'Histoire' },
  { id: 'fins', label: 'Fins' },
  { id: 'donnees', label: 'Variables et listes' },
  { id: 'json', label: 'JSON et fichiers' },
  { id: 'validation', label: 'Validation', group: 'Vérifier' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'aide', label: 'Aide' },
];

function buildPreview(def: UniverseDef, rep: ValidationReport | null): { env: SceneEnv; resolveLook: (l: Look) => Look } {
  try {
    const u = rep?.compiled ?? compileUniverse(def);
    const g = GameSession.create(u, { name: def.creation?.defaultName ?? 'Joueur', seed: 1, look: def.creation?.baseLook });
    return { env: sessionEnv(g), resolveLook: (l: Look) => resolveLookWith(g, l) };
  } catch {
    return { env: envFromColors(), resolveLook: (l: Look) => l };
  }
}

function Workspace({ draft, onDraft, onExit, onTest }: { draft: Draft; onDraft: (d: Draft | null) => void; onExit: () => void; onTest: (def: UniverseDef, from?: TestFrom) => void }) {
  const def = draft.def;
  const defRef = useRef(def);
  defRef.current = def;
  const [ui, setUi] = useState<UiState>(() => (uiMemo && uiMemo.univers === def.id ? { section: uiMemo.section, sel: uiMemo.sel, jump: null } : { section: 'univers', sel: {}, jump: null }));
  useEffect(() => { uiMemo = { ...ui, univers: def.id }; }, [ui, def.id]);
  const [stable, setStable] = useState(def);
  useEffect(() => { if (stable === def) return; const t = setTimeout(() => setStable(def), 350); return () => clearTimeout(t); }, [def]);
  const report = useMemo(() => { try { return validateUniverse(stable); } catch { return null; } }, [stable]);
  const preview = useMemo(() => buildPreview(stable, report), [stable, report]);
  const [toastMsg, setToast] = useState('');
  const toastTimer = useRef(0);
  const toast = (m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(''), 4200); };
  const [closing, setClosing] = useState(false);
  const [testWarn, setTestWarn] = useState<{ from?: TestFrom; errors: number } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const set = (fn: (d: UniverseDef) => UniverseDef) => { const next = fn(defRef.current); defRef.current = next; onDraft({ def: next, dirty: true }); };
  const replace = (d: UniverseDef) => { defRef.current = d; onDraft({ def: d, dirty: true }); };
  const select = (section: SectionId, id: string | undefined) => setUi((u) => ({ ...u, section, sel: { ...u.sel, [section]: id }, jump: null }));
  const goto = (section: SectionId, id?: string, line?: number) => {
    setUi((u) => ({ section, sel: id ? { ...u.sel, [section]: id } : u.sel, jump: line ? { line, n: Date.now() } : null }));
    setNavOpen(false);
    requestAnimationFrame(() => document.querySelector('.ed-main')?.scrollTo({ top: 0 }));
  };

  // Brouillon de secours + avertissement à la fermeture de la page
  useEffect(() => {
    if (!draft.dirty) return;
    const t = setTimeout(() => void writeRecovery(def), 1500);
    return () => clearTimeout(t);
  }, [def, draft.dirty]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (draft.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [draft.dirty]);

  const save = async (publish?: boolean): Promise<boolean> => {
    let d = defRef.current;
    if (publish === true) {
      const rep = validateUniverse(d);
      if (rep.errors > 0) { toast(`Publication impossible : ${rep.errors} erreur(s) à corriger (section Validation).`); goto('validation'); return false; }
    }
    if (publish !== undefined) d = { ...d, published: publish };
    try {
      await writeCustomUniverse(d);
      void clearRecovery();
      defRef.current = d;
      onDraft({ def: d, dirty: false });
      toast(publish === true ? 'Publié : l\'univers apparaît maintenant dans « Nouvelle vie ».' : publish === false ? 'Retiré de « Nouvelle vie » (reste dans tes univers).' : 'Enregistré.');
      return true;
    } catch (e) { toast(`Enregistrement impossible : ${(e as Error).message}`); return false; }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const test = (from?: TestFrom) => {
    const rep = validateUniverse(defRef.current);
    if (rep.errors > 0 && !testWarn) { setTestWarn({ from, errors: rep.errors }); return; }
    setTestWarn(null);
    onTest(defRef.current, from);
  };
  const close = () => { void clearRecovery(); uiMemo = null; onDraft(null); };

  const c: EdCtx = { def, set, replace, report, env: preview.env, resolveLook: preview.resolveLook, ui, select, goto, onTest: (_d, from) => test(from), toast };
  const counts: Partial<Record<SectionId, number>> = {
    stats: def.stats.length, traits: def.traits?.length ?? 0, personnages: def.characters.length, lieux: def.locations.length,
    activites: def.activities?.length ?? 0, chapitres: def.chapters.length, evenements: def.events.length, fins: def.endings.length,
  };
  const kindToSection: Record<string, SectionId> = { evenement: 'evenements', fin: 'fins', personnage: 'personnages', lieu: 'lieux', activite: 'activites', chapitre: 'chapitres', stat: 'stats', creation: 'creation', univers: 'univers' };
  const navIssues = useMemo(() => {
    const m: Partial<Record<SectionId, { e: number; w: number }>> = {};
    for (const i of report?.issues ?? []) {
      const s = kindToSection[i.kind] ?? 'univers';
      const cur = m[s] ?? { e: 0, w: 0 };
      if (i.severity === 'error') cur.e++; else cur.w++;
      m[s] = cur;
    }
    return m;
  }, [report]);
  const strVars = Object.entries(def.vars ?? {}).filter(([, v]) => typeof v === 'string').map(([k]) => `$${k}`);
  const cur = NAV.find((n) => n.id === ui.section) ?? NAV[0];

  return (
    <div class="ed-shell">
      <header class="ed-top">
        <button type="button" class="pbtn small" onClick={() => (draft.dirty ? setClosing(true) : close())}>← Mes univers</button>
        <div class="ed-title grow">
          <b>{def.name || def.id}</b>
          <span class={`badge ${def.published ? 't-heureuse' : ''}`}>{def.published ? 'Publié' : 'Brouillon'}</span>
          <span class={`ed-dirty ${draft.dirty ? 'on' : ''}`} aria-live="polite">{draft.dirty ? 'Modifications non enregistrées' : 'Enregistré'}</span>
        </div>
        <button type="button" class={`ed-pill btn ${report?.errors ? 'bad' : report?.warnings ? 'warn' : 'ok'}`} onClick={() => goto('validation')} title="Voir la validation">
          {report ? (report.errors ? `${report.errors} erreur${report.errors > 1 ? 's' : ''}` : report.warnings ? `${report.warnings} avert.` : 'Valide ✓') : '…'}
        </button>
        <button type="button" class="pbtn small" onClick={() => test()} title="Jouer le brouillon depuis le début (F2 en jeu : débogage)">▶ Tester</button>
        <button type="button" class="pbtn small" onClick={() => void save()} title="Ctrl+S">Enregistrer</button>
        {def.published
          ? <button type="button" class="pbtn small" onClick={() => void save(false)}>Dépublier</button>
          : <button type="button" class="pbtn small primary" onClick={() => void save(true)}>Publier</button>}
        <button type="button" class="pbtn small ghost" onClick={() => void offerDownload(`${def.id}.json`, JSON.stringify(defRef.current, null, 2)).then((r) => toast(r === 'ok' ? 'Fichier proposé au téléchargement.' : r === 'refuse' ? 'Téléchargement refusé.' : 'Téléchargement indisponible ici.'))}>Exporter</button>
      </header>
      {closing && (
        <div class="ed-confirm top" role="alertdialog" aria-label="Fermer l'univers">
          <span>Des modifications ne sont pas enregistrées.</span>
          <div class="row">
            <button type="button" class="pbtn small primary" onClick={() => void save().then((ok) => { if (ok) close(); })}>Enregistrer et fermer</button>
            <button type="button" class="pbtn small danger" onClick={close}>Fermer sans enregistrer</button>
            <button type="button" class="pbtn small" onClick={() => setClosing(false)}>Annuler</button>
          </div>
        </div>
      )}
      {testWarn && (
        <div class="ed-confirm top" role="alertdialog" aria-label="Tester malgré les erreurs">
          <span>Le brouillon contient {testWarn.errors} erreur(s) : certaines scènes peuvent se comporter bizarrement.</span>
          <div class="row">
            <button type="button" class="pbtn small primary" onClick={() => { const f = testWarn.from; setTestWarn(null); onTest(defRef.current, f); }}>Tester quand même</button>
            <button type="button" class="pbtn small" onClick={() => { setTestWarn(null); goto('validation'); }}>Voir les erreurs</button>
            <button type="button" class="pbtn small" onClick={() => setTestWarn(null)}>Annuler</button>
          </div>
        </div>
      )}
      <div class="ed-body">
        <nav class={`ed-nav ${navOpen ? 'open' : ''}`} aria-label="Sections de l'éditeur">
          <button type="button" class="ed-nav-toggle" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>{cur.label} ▾</button>
          <div class="ed-nav-items">
            <div class="ed-nav-cover"><SceneThumb key={JSON.stringify(def.locations.find((l) => l.id === def.theme?.cover) ?? def.locations[0] ?? null)} loc={def.locations.find((l) => l.id === def.theme?.cover) ?? def.locations[0]} env={preview.env} /></div>
            {NAV.map((n) => {
              const iss = navIssues[n.id];
              return (
                <div key={n.id}>
                  {n.group && <div class="ed-nav-group">{n.group}</div>}
                  <button type="button" class={`ed-nav-btn ${ui.section === n.id ? 'on' : ''}`} aria-current={ui.section === n.id ? 'page' : undefined} onClick={() => goto(n.id, ui.sel[n.id])}>
                    <span class="grow">{n.label}</span>
                    {counts[n.id] !== undefined && <small class="muted">{counts[n.id]}</small>}
                    {iss && n.id !== 'validation' && (iss.e ? <span class="ed-badge bad">{iss.e}</span> : <span class="ed-badge warn">{iss.w}</span>)}
                    {n.id === 'validation' && report && (report.errors ? <span class="ed-badge bad">{report.errors}</span> : report.warnings ? <span class="ed-badge warn">{report.warnings}</span> : <span class="ed-badge ok">✓</span>)}
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
        <main class="ed-main">
          <h2 class="ed-section-title">{cur.label}</h2>
          {ui.section === 'univers' && <UniverseSection c={c} />}
          {ui.section === 'stats' && <StatsSection c={c} />}
          {ui.section === 'traits' && <TraitsSection c={c} />}
          {ui.section === 'personnages' && <CharactersSection c={c} />}
          {ui.section === 'lieux' && <LocationsSection c={c} />}
          {ui.section === 'activites' && <ActivitiesSection c={c} />}
          {ui.section === 'chapitres' && <ChaptersSection c={c} />}
          {ui.section === 'creation' && <CreationSection c={c} />}
          {ui.section === 'evenements' && <EventsSection c={c} />}
          {ui.section === 'fins' && <EndingsSection c={c} />}
          {ui.section === 'donnees' && <DataSection c={c} />}
          {ui.section === 'json' && <JsonSection c={c} />}
          {ui.section === 'validation' && <ValidationSection c={c} />}
          {ui.section === 'simulation' && <SimulationSection c={c} />}
          {ui.section === 'aide' && <HelpSection c={c} />}
        </main>
      </div>
      <datalist id="ed-colors">
        {Object.keys(NAMED_COLORS).map((k) => <option key={k} value={k} />)}
        {strVars.map((k) => <option key={k} value={k} />)}
      </datalist>
      <datalist id="ed-prop-keys">
        {['color', 'color2', 'text', 'texte', 'label', 'rideaux', 'lampe', 'variante', 'contenu', 'count', 'dir', 'coussin', 'lueur', 'taille', 'nombre', 'motif', 'niveau', 'lumiere', 'creature', 'nappe'].map((k) => <option key={k} value={k} />)}
      </datalist>
      <div class={`ed-toast ${toastMsg ? 'on' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </div>
  );
}
