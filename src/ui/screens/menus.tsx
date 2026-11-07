// Écrans de menu : titre, choix de l'univers, chargement, création du personnage, fins découvertes.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CastChoice, CastSlot, Look, UniverseDef } from '../../core/model/types';
import { allUniverses, type UniverseEntry } from '../../game/registry';
import { getEndings, listSaves, readSave, type SaveMeta, type SaveFile } from '../../game/saves';
import { AppearanceEditor, LookPreview } from '../appearance';
import { renderLocation, type SceneEnv } from '../../engine/gfx/scenery';
import { getFrame, SPR_H } from '../../engine/gfx/character';
import { audio } from '../../engine/audio';
import { PortraitView, SceneThumb, SpriteView, fmtTime } from '../components';
import { cloudActive } from '../../platform/storage';
import { previewSession, resolveLookWith, sessionEnv } from '../../game/env';

/** Environnement visuel « statique » d'un univers (état initial d'une partie). */
export function staticEnv(def: UniverseDef, vars?: Record<string, string | number | boolean>): SceneEnv {
  return sessionEnv(previewSession(def, vars));
}
export function resolveStaticLook(def: UniverseDef, l: Look, fields?: Record<string, string>): Look {
  return resolveLookWith(previewSession(def, undefined, fields), l);
}

// ───────────────────────────── Titre ───────────────────────────────────────

export function TitleScreen({ onPlay, onContinue, onLoad, onEditor, onEndings, onOptions, featured, hasContinue }: {
  onPlay: () => void; onContinue: () => void; onLoad: () => void; onEditor: () => void; onEndings: () => void; onOptions: () => void;
  featured: UniverseDef | null; hasContinue: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!featured) return;
    const loc = featured.locations.find((l) => l.id === featured.theme?.cover) ?? featured.locations[0];
    const r = renderLocation(loc, staticEnv(featured, { stade_taille: 3 }), 'nuit');
    (globalThis as unknown as { __crowdHype?: number }).__crowdHype = 0.55;
    const runners = featured.characters.slice(0, 4).map((c, i) => ({ look: resolveStaticLook(featured, { ...c.look, top: 'maillot', bottom: 'short', bottomColor: '#ffffff', socks: c.look.topColor }), x: -40 - i * 70, speed: 30 + i * 6 }));
    let raf = 0; const t0 = performance.now();
    const draw = (t: number) => {
      const c = ref.current; if (!c) return;
      const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
      const time = (t - t0) / 1000;
      const cam = Math.max(0, Math.min(r.width - 320, (r.width - 320) / 2 + Math.sin(time * 0.05) * 120));
      x.fillStyle = '#000'; x.fillRect(0, 0, 320, 180);
      if (r.far) { x.save(); x.translate(-Math.round(cam * 0.35), 0); x.drawImage(r.far, 0, 0); for (const a of r.anim) if (a.layer === 'far') a.draw(x, time); x.restore(); }
      x.save(); x.translate(-Math.round(cam), 0); x.drawImage(r.main, 0, 0); for (const a of r.anim) if (a.layer === 'main') a.draw(x, time);
      for (const p of runners) {
        const px = ((p.x + time * p.speed * 2) % (r.width + 120)) - 40;
        const f = getFrame(p.look, 'course', Math.floor(time * 12 + p.speed), 'content');
        x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(Math.round(px) - 6, 165, 13, 2);
        x.drawImage(f, Math.round(px) - 15, 166 - SPR_H + 2);
      }
      x.restore();
      x.globalCompositeOperation = 'multiply'; x.fillStyle = '#6d78b0'; x.fillRect(0, 0, 320, 180); x.globalCompositeOperation = 'screen';
      for (const g of r.glows) { const gx = g.x - cam; const grad = x.createRadialGradient(gx, g.y, 0, gx, g.y, g.r); grad.addColorStop(0, 'rgba(255,240,200,0.45)'); grad.addColorStop(1, 'rgba(255,240,200,0)'); x.fillStyle = grad; x.fillRect(gx - g.r, g.y - g.r, g.r * 2, g.r * 2); }
      x.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [featured]);
  return (
    <div class="screen title-screen" onPointerDown={() => audio.unlock()}>
      <div class="title-bg"><canvas ref={ref} width={320} height={180} /></div>
      <div class="title-veil" />
      <div class="title-box">
        <h1 class="logo">MILLE VIES<span>CHAQUE CHOIX COMPTE</span></h1>
        <p class="tagline">Choisis un univers, incarne un destin, et découvre où te mènent tes décisions.</p>
        <nav class="menu" aria-label="Menu principal">
          {hasContinue && <button class="pbtn primary" onClick={onContinue}>Continuer</button>}
          <button class={`pbtn ${hasContinue ? '' : 'primary'}`} onClick={onPlay}>Nouvelle vie</button>
          <button class="pbtn" onClick={onLoad}>Charger une partie</button>
          <button class="pbtn" onClick={onEditor}>Éditeur d'histoires</button>
          <button class="pbtn" onClick={onEndings}>Fins découvertes</button>
          <button class="pbtn ghost" onClick={onOptions}>Options</button>
        </nav>
      </div>
      <div class="foot">{cloudActive ? 'Sauvegardes synchronisées avec ton compte' : 'Sauvegardes enregistrées dans ce navigateur'}</div>
    </div>
  );
}

// ───────────────────────────── Choix de l'univers ──────────────────────────

export function UniverseSelect({ onBack, onPick, onEditor }: { onBack: () => void; onPick: (d: UniverseDef) => void; onEditor: () => void }) {
  const [list, setList] = useState<UniverseEntry[] | null>(null);
  const [endings, setEndings] = useState<Record<string, string[]>>({});
  useEffect(() => { void allUniverses().then(setList); void getEndings().then(setEndings); }, []);
  return (
    <div class="screen">
      <div class="page">
        <div class="page-head">
          <button class="pbtn small" onClick={onBack}>← Retour</button>
          <h1>Choisis un univers</h1>
        </div>
        {!list && <p class="muted">Chargement des univers…</p>}
        <div class="uni-grid">
          {list?.map((e) => {
            const d = e.def;
            const cover = d.locations.find((l) => l.id === d.theme?.cover) ?? d.locations[0];
            const found = (endings[d.id] ?? []).length;
            return (
              <article class="uni-card pbox" key={d.id}>
                <div class="thumb"><SceneThumb loc={cover} env={staticEnv(d)} /></div>
                <div class="body">
                  <div class="row" style={{ gap: 6 }}>{(d.tags ?? []).map((t) => <span class="tag" key={t}>{t}</span>)}{!e.builtin && <span class="tag">Créé avec l'éditeur</span>}</div>
                  <h2>{d.name}</h2>
                  {d.tagline && <p><b style={{ color: 'var(--ink)' }}>{d.tagline}</b></p>}
                  {d.description && <p>{d.description}</p>}
                  <div class="foot2">
                    <span class="label">Fins : {found}/{d.endings.length}</span>
                    <button class="pbtn primary" onClick={() => onPick(d)}>Vivre cette vie</button>
                  </div>
                </div>
              </article>
            );
          })}
          <article class="uni-card pbox">
            <div class="body" style={{ justifyContent: 'center', minHeight: 220 }}>
              <h2>Ton propre univers</h2>
              <p>Crée personnages, lieux, événements, choix et fins avec l'éditeur intégré, teste-les, puis publie-les ici.</p>
              <div class="foot2"><span /><button class="pbtn" onClick={onEditor}>Ouvrir l'éditeur</button></div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Chargement ──────────────────────────────────

export function LoadScreen({ onBack, onLoad }: { onBack: () => void; onLoad: (f: SaveFile) => void }) {
  const [metas, setMetas] = useState<SaveMeta[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { void listSaves().then(setMetas).catch(() => setMetas([])); }, []);
  const load = async (slot: string) => {
    const f = await readSave(slot);
    if (!f) { setErr('Cette sauvegarde est illisible.'); return; }
    onLoad(f);
  };
  return (
    <div class="screen">
      <div class="page" style={{ maxWidth: 760 }}>
        <div class="page-head"><button class="pbtn small" onClick={onBack}>← Retour</button><h1>Charger une partie</h1></div>
        {err && <div class="err-box">{err}</div>}
        {metas && metas.length === 0 && <p class="muted">Aucune sauvegarde pour l'instant. Une sauvegarde automatique est créée au début de chaque semaine (ou journée) de jeu.</p>}
        <div class="slots">
          {metas?.map((m) => (
            <div class="slot pbox" key={m.slot}>
              <div class="info">
                <div class="label">{m.slot === 'auto' ? 'Sauvegarde automatique' : `Emplacement ${m.slot}`}{m.ending ? ' · partie terminée' : ''}</div>
                <div style={{ fontSize: 17 }}><b>{m.player}</b> — {m.universeName}</div>
                <div class="muted">{m.chapter}, {(m.tickLabel ?? 'semaine').toLowerCase()} {m.week} · {m.location} · {fmtTime(m.playtime)} · {new Date(m.updated).toLocaleString('fr-FR')}</div>
              </div>
              <button class="pbtn primary" onClick={() => load(m.slot)} disabled={!!m.ending}>Reprendre</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Création du personnage ──────────────────────

export function CreationScreen({ def, onBack, onStart }: { def: UniverseDef; onBack: () => void; onStart: (o: { name: string; look: Look; fields: Record<string, string>; cast?: Record<string, CastChoice> }) => void }) {
  const cr = def.creation ?? {};
  const [name, setName] = useState(cr.defaultName ?? '');
  const [look, setLook] = useState<Look>({ ...(cr.baseLook ?? {}) });
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries((cr.fields ?? []).map((f) => [f.id, f.options[0]?.id ?? ''])));
  const [tab, setTab] = useState<'moi' | 'entourage'>('moi');
  const pageRef = useRef<HTMLDivElement>(null);
  const firstTab = useRef(true);
  // en changeant d'onglet, on revient en haut de la page (utile sur téléphone)
  useEffect(() => { if (firstTab.current) { firstTab.current = false; return; } pageRef.current?.scrollIntoView({ block: 'start' }); }, [tab]);
  const [cast, setCast] = useState<Record<string, CastState>>(() => Object.fromEntries((cr.cast ?? []).map((sl) => [sl.id, initialCast(def, sl)])));
  const shown = useMemo(() => resolveStaticLook(def, look, fields), [look, fields]);
  const ready = name.trim().length > 0;
  const hasCast = (cr.cast ?? []).length > 0;
  const start = () => { audio.unlock(); onStart({ name: name.trim(), look, fields, cast: hasCast ? castChoices(def, cast) : undefined }); };
  return (
    <div class="screen">
      <div class="page" ref={pageRef}>
        <div class="page-head"><button class="pbtn small" onClick={onBack}>← Univers</button><h1>{def.name}</h1></div>
        {hasCast && (
          <div class="tabs creation-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'moi'} class={`pbtn ${tab === 'moi' ? 'on' : ''}`} onClick={() => setTab('moi')}>1. Toi</button>
            <button role="tab" aria-selected={tab === 'entourage'} class={`pbtn ${tab === 'entourage' ? 'on' : ''}`} onClick={() => setTab('entourage')}>2. Ton entourage</button>
          </div>
        )}
        {tab === 'moi' && (
          <div class="creation">
            <div class="preview-box pbox">
              <LookPreview look={shown} name={name} sub={(cr.fields ?? []).map((f) => f.options.find((o) => o.id === fields[f.id])?.label).filter(Boolean).join(' · ')} />
            </div>
            <div class="col pbox" style={{ padding: 18, gap: 18 }}>
              <label class="field">{cr.nameLabel ?? 'Nom'}
                <input type="text" id="creation-name" maxLength={24} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              </label>
              {cr.look !== false && <AppearanceEditor look={look} onChange={setLook} base={cr.baseLook ?? {}} />}
              {(cr.fields ?? []).map((f) => (
                <div class="field" key={f.id}>{f.label}
                  <div class="opts">
                    {f.options.map((o) => (
                      <button key={o.id} class={`pbtn opt ${fields[f.id] === o.id ? 'on' : ''}`} onClick={() => setFields({ ...fields, [f.id]: o.id })} aria-pressed={fields[f.id] === o.id}>
                        <b>{o.label}</b>{o.description && <small>{o.description}</small>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {hasCast
                ? <button class="pbtn primary" onClick={() => setTab('entourage')} style={{ fontSize: 18, textAlign: 'center' }}>Suivant : ton entourage →</button>
                : <button class="pbtn primary" disabled={!ready} onClick={start} style={{ fontSize: 18, textAlign: 'center' }}>Commencer cette vie</button>}
            </div>
          </div>
        )}
        {tab === 'entourage' && (
          <CastEditor def={def} fields={fields} cast={cast} setCast={setCast} playerName={name.trim()}>
            <div class="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button class="pbtn" onClick={() => setTab('moi')}>← Toi</button>
              <button class="pbtn primary grow" disabled={!ready} onClick={start} style={{ fontSize: 18, textAlign: 'center' }}>{ready ? 'Commencer cette vie' : 'Choisis d\'abord ton prénom'}</button>
            </div>
          </CastEditor>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Entourage ───────────────────────────────────

interface CastState { name: string; look: Look | null; genre: 'h' | 'f'; absent: boolean }

function defaultGenre(def: UniverseDef, id: string): 'h' | 'f' {
  return def.characters.find((c) => c.id === id)?.look.gender === 'f' ? 'f' : 'h';
}
function initialCast(def: UniverseDef, sl: CastSlot): CastState {
  return { name: '', look: null, genre: defaultGenre(def, sl.id), absent: !!(sl.optional && sl.defaultAbsent) };
}
/** Prénom et apparence « par défaut » d'un proche selon le genre choisi. */
function castDefaults(def: UniverseDef, sl: CastSlot, genre: 'h' | 'f'): { name: string; look: Look } {
  const c = def.characters.find((x) => x.id === sl.id);
  const base = { name: (c?.name ?? sl.id).split(' ')[0], look: c?.look ?? {} };
  if (genre === defaultGenre(def, sl.id)) return base;
  return sl.alt ? { name: sl.alt.name, look: sl.alt.look } : { name: base.name, look: { ...base.look, gender: genre } };
}
/** Ne transmet au jeu que ce que le joueur a réellement changé. */
function castChoices(def: UniverseDef, st: Record<string, CastState>): Record<string, CastChoice> | undefined {
  const out: Record<string, CastChoice> = {};
  for (const sl of def.creation?.cast ?? []) {
    const s = st[sl.id];
    if (!s) continue;
    const d = castDefaults(def, sl, s.genre);
    const switched = s.genre !== defaultGenre(def, sl.id);
    const ch: CastChoice = {};
    const typed = s.name.trim();
    if (typed && typed !== d.name) ch.name = typed;
    else if (switched) ch.name = d.name;
    if (s.look) ch.look = s.look;
    else if (switched) ch.look = d.look;
    if (switched) ch.genre = s.genre;
    if (sl.optional && s.absent !== !!sl.defaultAbsent) ch.absent = s.absent;
    if (Object.keys(ch).length) out[sl.id] = ch;
  }
  return Object.keys(out).length ? out : undefined;
}
function slotLabel(sl: CastSlot, genre: 'h' | 'f'): string {
  return sl.labels ? sl.labels[genre === 'f' ? 1 : 0] : sl.label;
}

function CastEditor({ def, fields, cast, setCast, playerName, children }: { def: UniverseDef; fields: Record<string, string>; cast: Record<string, CastState>; setCast: (c: Record<string, CastState>) => void; playerName: string; children?: ComponentChildren }) {
  const slots = def.creation?.cast ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const groups: [string, CastSlot[]][] = [];
  for (const sl of slots) {
    const gname = sl.group ?? 'Entourage';
    const g = groups.find(([n]) => n === gname);
    if (g) g[1].push(sl); else groups.push([gname, [sl]]);
  }
  const set = (id: string, patch: Partial<CastState>) => setCast({ ...cast, [id]: { ...cast[id], ...patch } });
  const shownName = (sl: CastSlot) => cast[sl.id].name.trim() || castDefaults(def, sl, cast[sl.id].genre).name;
  // deux proches (ou le joueur) avec le même prénom : on prévient, sans bloquer
  const names = slots.filter((sl) => !cast[sl.id].absent).map((sl) => shownName(sl).toLowerCase());
  const dup = names.some((n, i) => names.indexOf(n) !== i) || (!!playerName && names.includes(playerName.toLowerCase()));
  const ed = editing ? slots.find((sl) => sl.id === editing) : undefined;
  return (
    <div class="col pbox cast-editor" style={{ padding: 18, gap: 16 }}>
      <p class="muted" style={{ margin: 0 }}>Donne un prénom et un visage à tes proches. Tu peux aussi garder ceux de l'histoire : laisse simplement le prénom vide.</p>
      {groups.map(([gname, list]) => (
        <section key={gname} class="col" style={{ gap: 8 }}>
          <h3 class="cast-group">{gname}</h3>
          <div class="cast-grid">
            {list.map((sl) => {
              const s = cast[sl.id];
              const d = castDefaults(def, sl, s.genre);
              const lk = resolveStaticLook(def, s.look ?? d.look, fields);
              return (
                <div key={sl.id} class={`cast-card ${s.absent ? 'off' : ''} ${editing === sl.id ? 'editing' : ''}`} data-cast={sl.id}>
                  <div class="cast-top">
                    <div class="cast-portrait"><PortraitView look={lk} emo={s.absent ? 'triste' : 'content'} /></div>
                    <div class="grow col" style={{ gap: 4, minWidth: 0 }}>
                      <b class="cast-label">{slotLabel(sl, s.genre)}</b>
                      {sl.hint && <small class="muted">{sl.hint}</small>}
                      <input type="text" class="txt" maxLength={24} placeholder={d.name} value={s.name} disabled={s.absent} aria-label={`Prénom : ${slotLabel(sl, s.genre)}`} onInput={(e) => set(sl.id, { name: (e.target as HTMLInputElement).value })} />
                    </div>
                  </div>
                  <div class="cast-actions">
                    {sl.genderChoice && (
                      <div class="seg" role="group" aria-label="Genre">
                        {(['h', 'f'] as const).map((gk) => (
                          <button key={gk} class={`pbtn small ${s.genre === gk ? 'on' : ''}`} aria-pressed={s.genre === gk} disabled={s.absent}
                            onClick={() => set(sl.id, { genre: gk, look: s.look ? { ...s.look, gender: gk } : null })}>{gk === 'h' ? 'Garçon' : 'Fille'}</button>
                        ))}
                      </div>
                    )}
                    {sl.optional && (
                      <label class="check"><input type="checkbox" checked={!s.absent} onChange={(e) => set(sl.id, { absent: !(e.target as HTMLInputElement).checked })} /> Dans ma vie</label>
                    )}
                    <button class="pbtn small" disabled={s.absent} onClick={() => setEditing(editing === sl.id ? null : sl.id)}>{editing === sl.id ? 'Fermer' : 'Apparence'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {ed && (
        <div class="col pbox cast-look" style={{ padding: 14, gap: 10 }}>
          <div class="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <b>Apparence : {shownName(ed)}</b>
            <div class="row" style={{ gap: 6 }}>
              <button class="pbtn small" onClick={() => set(ed.id, { look: null })}>Apparence d'origine</button>
              <button class="pbtn small primary" onClick={() => setEditing(null)}>Terminé</button>
            </div>
          </div>
          <AppearanceEditor look={cast[ed.id].look ?? castDefaults(def, ed, cast[ed.id].genre).look} onChange={(l) => set(ed.id, { look: l, ...(ed.genderChoice && l.gender && l.gender !== cast[ed.id].genre ? { genre: l.gender } : {}) })} base={castDefaults(def, ed, cast[ed.id].genre).look} />
        </div>
      )}
      {dup && <p class="warn-note">Deux personnes portent le même prénom : ce sera vite confus dans l'histoire.</p>}
      {children}
    </div>
  );
}

// ───────────────────────────── Fins découvertes ────────────────────────────

export function EndingsScreen({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<UniverseEntry[] | null>(null);
  const [found, setFound] = useState<Record<string, string[]>>({});
  useEffect(() => { void allUniverses().then(setList); void getEndings().then(setFound); }, []);
  const typeLabel: Record<string, string> = { heureuse: 'Heureuse', tragique: 'Tragique', neutre: 'Neutre', inattendue: 'Inattendue', secrete: 'Secrète' };
  return (
    <div class="screen">
      <div class="page">
        <div class="page-head"><button class="pbtn small" onClick={onBack}>← Retour</button><h1>Fins découvertes</h1></div>
        {list?.map((e) => {
          const got = new Set(found[e.def.id] ?? []);
          // textes des fins : accords et variables rendus avec une partie « par défaut »
          const pv = previewSession(e.def);
          const txt = (s?: string) => (s ? pv.render(s) : '');
          return (
            <section key={e.def.id} class="col">
              <h2 style={{ margin: 0 }}>{e.def.name} <span class="muted" style={{ fontSize: 16 }}>{got.size}/{e.def.endings.length}</span></h2>
              <div class="gallery">
                {e.def.endings.map((en) => {
                  const ok = got.has(en.id);
                  const secret = en.type === 'secrete' && !ok;
                  return (
                    <div key={en.id} class={`item ${ok ? '' : 'locked'}`}>
                      <span class={`badge t-${en.type ?? 'neutre'}`}>{typeLabel[en.type ?? 'neutre']}</span>
                      <div style={{ fontWeight: 700, marginTop: 6 }}>{secret ? '???' : txt(en.title)}</div>
                      <div class="muted" style={{ fontSize: 13 }}>{ok ? txt(en.summary) : secret ? 'Fin secrète. À toi de la trouver.' : 'Pas encore vécue.'}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
