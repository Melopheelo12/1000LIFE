// Contrôles de formulaire de l'éditeur (champs, listes, couleurs, code vérifié en direct).
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { parseEffects, parseExpr, parseTemplate } from '../../core/expr/expr';
import { col } from '../../engine/gfx/character';
import { ID_PATTERN } from './templates';

export const val = (e: Event) => (e.target as HTMLInputElement).value;
/** Champ optionnel : chaîne vide → undefined */
export const opt = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v);

export function F({ label, hint, error, children, span, group }: {
  label: string; hint?: ComponentChildren; error?: string | null; children: ComponentChildren; span?: 2 | 3; group?: boolean;
}) {
  const cls = `ed-f ${span ? `span${span}` : ''} ${error ? 'bad' : ''}`;
  const inner = (
    <>
      <span class="ed-l">{label}</span>
      {children}
      {error ? <span class="ed-err" role="alert">{error}</span> : hint ? <span class="ed-hint">{hint}</span> : null}
    </>
  );
  return group ? <div class={cls} role="group" aria-label={label}>{inner}</div> : <label class={cls}>{inner}</label>;
}

export function Txt({ value, onChange, placeholder, mono, list, autoFocus, maxLength }: {
  value: string | undefined; onChange: (v: string) => void; placeholder?: string; mono?: boolean; list?: string; autoFocus?: boolean; maxLength?: number;
}) {
  return (
    <input type="text" class={`txt ${mono ? 'mono' : ''}`} value={value ?? ''} placeholder={placeholder} list={list} autoFocus={autoFocus}
      maxLength={maxLength} spellcheck={!mono} onInput={(e) => onChange(val(e))} />
  );
}

export function Num({ value, onChange, min, max, step, placeholder }: {
  value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  return (
    <input type="number" class="txt" value={value ?? ''} min={min} max={max} step={step ?? 'any'} placeholder={placeholder}
      onInput={(e) => { const v = val(e); if (v === '') onChange(undefined); else { const n = Number(v); if (Number.isFinite(n)) onChange(n); } }} />
  );
}

export function Area({ value, onChange, rows = 3, mono, placeholder }: { value: string | undefined; onChange: (v: string) => void; rows?: number; mono?: boolean; placeholder?: string }) {
  return <textarea class={`txt ${mono ? 'mono' : ''}`} rows={rows} value={value ?? ''} placeholder={placeholder} spellcheck={!mono} onInput={(e) => onChange(val(e))} />;
}

export type Opt = string | [string, string];
export function Sel({ value, onChange, options, empty, ariaLabel }: {
  value: string | undefined; onChange: (v: string | undefined) => void; options: Opt[]; empty?: string; ariaLabel?: string;
}) {
  const vals = options.map((o) => (Array.isArray(o) ? o[0] : o));
  return (
    <select class="txt" value={value ?? ''} aria-label={ariaLabel} onChange={(e) => { const v = val(e); onChange(v === '' ? undefined : v); }}>
      {empty !== undefined && <option value="">{empty}</option>}
      {value && !vals.includes(value) && <option value={value}>{value} (introuvable)</option>}
      {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
    </select>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean | undefined; onChange: (v: boolean) => void; label: ComponentChildren }) {
  return (
    <label class="ed-check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Sélection multiple sous forme de pastilles. */
export function Chips({ options, value, onChange, empty }: { options: [string, string][]; value: string[] | undefined; onChange: (v: string[] | undefined) => void; empty?: string }) {
  const set = new Set(value ?? []);
  const known = new Set(options.map((o) => o[0]));
  const toggle = (v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    const list = [...options.map((o) => o[0]).filter((x) => n.has(x)), ...[...n].filter((x) => !known.has(x))];
    onChange(list.length ? list : undefined);
  };
  if (!options.length && !set.size) return <span class="muted small">{empty ?? 'Rien à choisir pour l\'instant.'}</span>;
  return (
    <div class="ed-chips">
      {options.map(([v, l]) => (
        <button type="button" key={v} class={`ed-chip ${set.has(v) ? 'on' : ''}`} aria-pressed={set.has(v)} onClick={() => toggle(v)}>{l}</button>
      ))}
      {[...set].filter((x) => !known.has(x)).map((x) => (
        <button type="button" key={x} class="ed-chip on bad" title="Identifiant introuvable : clique pour le retirer" onClick={() => toggle(x)}>{x} ✕</button>
      ))}
    </div>
  );
}

/** Liste séparée par des virgules (validée en quittant le champ). */
export function TagList({ value, onChange, placeholder }: { value: string[] | undefined; onChange: (v: string[] | undefined) => void; placeholder?: string }) {
  const joined = (value ?? []).join(', ');
  const [raw, setRaw] = useState(joined);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setRaw(joined); }, [joined, focus]);
  const commit = () => {
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.join(', ') !== joined) onChange(list.length ? list : undefined);
  };
  return (
    <input type="text" class="txt" value={raw} placeholder={placeholder}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit(); }}
      onInput={(e) => setRaw(val(e))} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
  );
}

const hex6 = (c: string) => (/^#[0-9a-f]{3}$/i.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c.slice(0, 7));

/** Couleur : sélecteur natif + saisie libre (#hex, nom de couleur, $variable). */
export function ColorIn({ value, onChange, placeholder }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string }) {
  const isVar = !!value && value.startsWith('$');
  const shown = hex6(col(value, '#000000'));
  return (
    <div class={`ed-color ${isVar ? 'var' : ''}`}>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(shown) ? shown : '#000000'} onInput={(e) => onChange(val(e))} aria-label="Choisir une couleur" title={isVar ? 'Couleur tirée d\'une variable' : 'Choisir une couleur'} />
      <input type="text" class="txt mono" value={value ?? ''} placeholder={placeholder ?? '#rrggbb, nom ou $variable'} list="ed-colors"
        onInput={(e) => onChange(opt(val(e)))} spellcheck={false} />
    </div>
  );
}

export type CodeKind = 'cond' | 'fx' | 'tpl' | 'expr';
export function codeError(value: string | undefined, kind: CodeKind): string | null {
  if (!value || !value.trim()) return null;
  try {
    if (kind === 'fx') parseEffects(value);
    else if (kind === 'tpl') parseTemplate(value);
    else parseExpr(value);
    return null;
  } catch (e) { return (e as Error).message; }
}

/** Saisie de code (condition, effets, expression ou texte interpolé) vérifiée à chaque frappe. */
export function Code({ value, onChange, kind, placeholder, rows }: { value: string | undefined; onChange: (v: string | undefined) => void; kind: CodeKind; placeholder?: string; rows?: number }) {
  const error = useMemo(() => codeError(value, kind), [value, kind]);
  const common = { class: `txt ${kind === 'tpl' ? '' : 'mono'} ${error ? 'bad' : ''}`, value: value ?? '', placeholder, spellcheck: kind === 'tpl', 'aria-invalid': !!error };
  return (
    <>
      {rows ? <textarea {...common} rows={rows} onInput={(e) => onChange(opt(val(e)))} /> : <input type="text" {...common} onInput={(e) => onChange(opt(val(e)))} />}
      {error && <span class="ed-err" role="alert">{error}</span>}
    </>
  );
}

/** Liste de lignes éditables (ajout, ordre, suppression). */
export function Rows<T>({ items, onChange, render, create, addLabel, empty, compact }: {
  items: T[] | undefined; onChange: (v: T[] | undefined) => void; render: (it: T, set: (v: T) => void, i: number) => ComponentChildren;
  create: () => T; addLabel: string; empty?: string; compact?: boolean;
}) {
  const list = items ?? [];
  const set = (i: number, v: T) => onChange(list.map((x, k) => (k === i ? v : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  const del = (i: number) => { const n = list.filter((_, k) => k !== i); onChange(n.length ? n : undefined); };
  return (
    <div class={`ed-rows ${compact ? 'compact' : ''}`}>
      {list.length === 0 && empty && <div class="muted small">{empty}</div>}
      {list.map((it, i) => (
        <div class="ed-row" key={i}>
          <div class="ed-row-body">{render(it, (v) => set(i, v), i)}</div>
          <div class="ed-row-tools">
            <button type="button" class="ed-ico" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" title="Monter">↑</button>
            <button type="button" class="ed-ico" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Descendre" title="Descendre">↓</button>
            <button type="button" class="ed-ico danger" onClick={() => del(i)} aria-label="Supprimer" title="Supprimer">✕</button>
          </div>
        </div>
      ))}
      <div><button type="button" class="pbtn small" onClick={() => onChange([...list, create()])}>+ {addLabel}</button></div>
    </div>
  );
}

/** Identifiant affiché + renommage contrôlé (avec mise à jour des références). */
export function IdEdit({ id, taken, onRename }: { id: string; taken: string[]; onRename: (to: string, refs: boolean) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [refs, setRefs] = useState(true);
  useEffect(() => setEdit(null), [id]);
  const err = edit === null ? null
    : !ID_PATTERN.test(edit) ? 'Minuscules, chiffres et « _ » uniquement, sans accent ni espace, ne commençant pas par un chiffre.'
      : edit !== id && taken.includes(edit) ? 'Cet identifiant est déjà utilisé.' : null;
  if (edit === null) {
    return (
      <div class="ed-id">
        <code>{id}</code>
        <button type="button" class="pbtn small" onClick={() => setEdit(id)}>Renommer…</button>
      </div>
    );
  }
  const go = () => { if (!err && edit !== id) onRename(edit, refs); };
  return (
    <div class="ed-id col">
      <input class="txt mono" value={edit} autoFocus aria-label="Nouvel identifiant" spellcheck={false}
        onInput={(e) => setEdit(val(e).trim())} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') setEdit(null); }} />
      <Check checked={refs} onChange={setRefs} label="Mettre à jour toutes les références (scripts, conditions, lieux, déclencheurs…)" />
      {err && <span class="ed-err">{err}</span>}
      <div class="row">
        <button type="button" class="pbtn small primary" disabled={!!err || edit === id} onClick={go}>Renommer</button>
        <button type="button" class="pbtn small" onClick={() => setEdit(null)}>Annuler</button>
      </div>
    </div>
  );
}

/** Bloc repliable. */
export function Fold({ title, children, open: initial = false, badge }: { title: string; children: ComponentChildren; open?: boolean; badge?: ComponentChildren }) {
  const [open, setOpen] = useState(initial);
  return (
    <section class={`ed-fold ${open ? 'open' : ''}`}>
      <button type="button" class="ed-fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="ed-caret">{open ? '▾' : '▸'}</span><span class="grow">{title}</span>{badge}
      </button>
      {open && <div class="ed-fold-body">{children}</div>}
    </section>
  );
}
