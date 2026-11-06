// Contexte partagé de l'éditeur + liste maître/détail générique.
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { Look, UniverseDef } from '../../core/model/types';
import type { Issue } from '../../core/runtime/compile';
import type { ValidationReport } from '../../core/runtime/validate';
import type { SceneEnv } from '../../engine/gfx/scenery';
import { countRefs, renameRef, type RefKind } from './refactor';
import { uniqueId } from './templates';
import { val } from './fields';

export type SectionId =
  | 'univers' | 'stats' | 'traits' | 'personnages' | 'lieux' | 'activites' | 'chapitres' | 'creation'
  | 'evenements' | 'fins' | 'donnees' | 'json' | 'validation' | 'simulation' | 'aide';

export interface UiState {
  section: SectionId;
  sel: Partial<Record<SectionId, string>>;
  jump: { line: number; n: number } | null;
}

export interface EdCtx {
  def: UniverseDef;
  /** applique une modification (sur la dernière version du brouillon) */
  set: (fn: (d: UniverseDef) => UniverseDef) => void;
  replace: (d: UniverseDef) => void;
  report: ValidationReport | null;
  env: SceneEnv;
  resolveLook: (l: Look) => Look;
  ui: UiState;
  select: (section: SectionId, id: string | undefined) => void;
  goto: (section: SectionId, id?: string, line?: number) => void;
  onTest: (def: UniverseDef, from?: { event?: string; ending?: string }) => void;
  toast: (msg: string) => void;
}

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Problèmes de validation d'un élément. */
export function issuesOf(c: EdCtx, kind: Issue['kind'], id: string): Issue[] {
  return c.report?.issues.filter((i) => i.kind === kind && i.id === id) ?? [];
}

type Item = { id: string };

export function ListDetail<T extends Item>(p: {
  c: EdCtx; section: SectionId; kind: RefKind; issueKind: Issue['kind'];
  items: T[]; onChange: (items: T[]) => void;
  label: (t: T) => string; sub?: (t: T) => string | undefined; thumb?: (t: T) => ComponentChildren;
  create: (ids: string[]) => T; filter?: (t: T) => boolean; toolbar?: ComponentChildren; noun: string;
  intro?: ComponentChildren;
  actions?: (item: T) => ComponentChildren;
  children: (item: T, set: (t: T) => void, rename: (to: string, refs: boolean) => void) => ComponentChildren;
}) {
  const { c, section, items } = p;
  const [q, setQ] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const selId = c.ui.sel[section];
  const found = items.findIndex((x) => x.id === selId);
  const idx = found >= 0 ? found : 0;
  const item = items[idx] as T | undefined;
  const ids = items.map((x) => x.id);
  const counts = useMemo(() => {
    const m = new Map<string, { e: number; w: number }>();
    for (const i of c.report?.issues ?? []) {
      if (i.kind !== p.issueKind || !i.id) continue;
      const cur = m.get(i.id) ?? { e: 0, w: 0 };
      if (i.severity === 'error') cur.e++; else cur.w++;
      m.set(i.id, cur);
    }
    return m;
  }, [c.report, p.issueKind]);
  const ql = q.trim().toLowerCase();
  const shown = items.filter((x) => (!p.filter || p.filter(x)) && (!ql || `${x.id} ${p.label(x)} ${p.sub?.(x) ?? ''}`.toLowerCase().includes(ql)));

  const set = (t: T) => p.onChange(items.map((x, k) => (k === idx ? t : x)));
  const add = () => { const n = p.create(ids); p.onChange([...items, n]); c.select(section, n.id); };
  const dup = () => {
    if (!item) return;
    const copy = clone(item);
    copy.id = uniqueId(`${item.id}_copie`, ids);
    const n = [...items]; n.splice(idx + 1, 0, copy);
    p.onChange(n); c.select(section, copy.id);
  };
  const del = () => {
    if (!item) return;
    const n = items.filter((_, k) => k !== idx);
    p.onChange(n); c.select(section, n[Math.min(idx, n.length - 1)]?.id);
    setConfirmDel(null);
    c.toast(`« ${p.label(item)} » supprimé.`);
  };
  const move = (d: number) => {
    const j = idx + d;
    if (!item || j < 0 || j >= items.length) return;
    const n = [...items]; [n[idx], n[j]] = [n[j], n[idx]]; p.onChange(n);
  };
  const rename = (to: string, refs: boolean) => {
    if (!item) return;
    if (refs) {
      const r = renameRef(c.def, p.kind, item.id, to);
      c.replace(r.def);
      c.toast(`« ${item.id} » → « ${to} » : ${r.count} référence${r.count > 1 ? 's' : ''} mise${r.count > 1 ? 's' : ''} à jour.`);
    } else set({ ...item, id: to });
    c.select(section, to);
  };
  const refCount = confirmDel && item ? countRefs(c.def, p.kind, item.id) : 0;

  return (
    <div class="ed-md">
      <aside class="ed-list" aria-label={`Liste : ${p.noun}`}>
        {p.toolbar}
        <input class="txt" type="search" placeholder="Rechercher…" value={q} onInput={(e) => setQ(val(e))} aria-label="Rechercher" />
        <div class="ed-list-items">
          {shown.map((x) => {
            const n = counts.get(x.id);
            return (
              <button type="button" key={x.id} class={`ed-li ${item && x.id === item.id ? 'on' : ''}`} onClick={() => c.select(section, x.id)} aria-current={item && x.id === item.id}>
                {p.thumb?.(x)}
                <span class="grow"><b>{p.label(x) || x.id}</b>{p.sub && <small>{p.sub(x)}</small>}</span>
                {n && (n.e ? <span class="ed-badge bad" title={`${n.e} erreur(s)`}>{n.e}</span> : <span class="ed-badge warn" title={`${n.w} avertissement(s)`}>{n.w}</span>)}
              </button>
            );
          })}
          {shown.length === 0 && <div class="muted small" style={{ padding: 8 }}>{items.length ? 'Aucun résultat.' : `Aucun élément pour l'instant.`}</div>}
        </div>
        <button type="button" class="pbtn small primary" onClick={add}>+ {p.noun}</button>
        <div class="muted small">{items.length} au total</div>
      </aside>
      <section class="ed-detail">
        {p.intro}
        {item ? (
          <>
            <div class="ed-detail-head">
              <h3 class="grow">{p.label(item) || item.id}</h3>
              {p.actions?.(item)}
              <button type="button" class="ed-ico" onClick={() => move(-1)} disabled={idx === 0} title="Monter dans la liste" aria-label="Monter">↑</button>
              <button type="button" class="ed-ico" onClick={() => move(1)} disabled={idx === items.length - 1} title="Descendre dans la liste" aria-label="Descendre">↓</button>
              <button type="button" class="pbtn small" onClick={dup}>Dupliquer</button>
              <button type="button" class="pbtn small danger" onClick={() => setConfirmDel(item.id)}>Supprimer</button>
            </div>
            {confirmDel === item.id && (
              <div class="ed-confirm" role="alertdialog" aria-label="Confirmer la suppression">
                <span>Supprimer « {p.label(item) || item.id} » ?{refCount > 0 ? ` Il est encore utilisé à ${refCount} endroit${refCount > 1 ? 's' : ''} : la validation te montrera les références à corriger.` : ''}</span>
                <div class="row"><button type="button" class="pbtn small danger" onClick={del}>Supprimer</button><button type="button" class="pbtn small" onClick={() => setConfirmDel(null)}>Annuler</button></div>
              </div>
            )}
            {p.children(item, set, rename)}
          </>
        ) : <p class="muted">Aucun élément. Utilise « + {p.noun} » pour commencer.</p>}
      </section>
    </div>
  );
}

/** Liste des problèmes d'un élément (cliquables pour les scripts). */
export function IssueBox({ issues, onLine }: { issues: Issue[]; onLine?: (n: number) => void }) {
  if (!issues.length) return null;
  return (
    <ul class="ed-issues">
      {issues.map((i, k) => (
        <li key={k} class={i.severity}>
          {i.line && onLine ? <button type="button" class="ed-link" onClick={() => onLine(i.line!)}>Ligne {i.line}</button> : null} {i.msg}
        </li>
      ))}
    </ul>
  );
}
