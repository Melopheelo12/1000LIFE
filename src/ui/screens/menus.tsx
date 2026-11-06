// Écrans de menu : titre, choix de l'univers, chargement, création du personnage, fins découvertes.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Look, UniverseDef } from '../../core/model/types';
import { allUniverses, type UniverseEntry } from '../../game/registry';
import { getEndings, listSaves, readSave, type SaveMeta, type SaveFile } from '../../game/saves';
import { HAIR_COLORS, HAIR_STYLES, SKINS } from '../../engine/gfx/character';
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
export function resolveStaticLook(def: UniverseDef, l: Look): Look {
  return resolveLookWith(previewSession(def), l);
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
        {metas && metas.length === 0 && <p class="muted">Aucune sauvegarde pour l'instant. Une sauvegarde automatique est créée au début de chaque semaine de jeu.</p>}
        <div class="slots">
          {metas?.map((m) => (
            <div class="slot pbox" key={m.slot}>
              <div class="info">
                <div class="label">{m.slot === 'auto' ? 'Sauvegarde automatique' : `Emplacement ${m.slot}`}{m.ending ? ' · partie terminée' : ''}</div>
                <div style={{ fontSize: 17 }}><b>{m.player}</b> — {m.universeName}</div>
                <div class="muted">{m.chapter}, semaine {m.week} · {m.location} · {fmtTime(m.playtime)} · {new Date(m.updated).toLocaleString('fr-FR')}</div>
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

export function CreationScreen({ def, onBack, onStart }: { def: UniverseDef; onBack: () => void; onStart: (o: { name: string; look: Look; fields: Record<string, string> }) => void }) {
  const cr = def.creation ?? {};
  const [name, setName] = useState(cr.defaultName ?? '');
  const [look, setLook] = useState<Look>({ ...(cr.baseLook ?? {}) });
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries((cr.fields ?? []).map((f) => [f.id, f.options[0]?.id ?? ''])));
  const shown = useMemo(() => resolveStaticLook(def, look), [look]);
  const hairIdx = HAIR_STYLES.indexOf(look.hair ?? 'court');
  const cycleHair = (d: number) => setLook({ ...look, hair: HAIR_STYLES[(hairIdx + d + HAIR_STYLES.length) % HAIR_STYLES.length] });
  const ready = name.trim().length > 0;
  return (
    <div class="screen">
      <div class="page">
        <div class="page-head"><button class="pbtn small" onClick={onBack}>← Univers</button><h1>{def.name}</h1></div>
        <div class="creation">
          <div class="preview-box pbox">
            <div class="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 18 }}>
              <SpriteView look={shown} anim="marche" scale={5} />
              <div style={{ width: 120, height: 120, background: '#0e1018' }}><PortraitView look={shown} emo="content" size={40} /></div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{name || '…'}</div>
            <div class="muted" style={{ textAlign: 'center' }}>{(cr.fields ?? []).map((f) => f.options.find((o) => o.id === fields[f.id])?.label).filter(Boolean).join(' · ')}</div>
          </div>
          <div class="col pbox" style={{ padding: 18, gap: 18 }}>
            <label class="field">{cr.nameLabel ?? 'Nom'}
              <input type="text" id="creation-name" maxLength={24} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </label>
            {cr.look !== false && (
              <>
                <div class="field">Teint
                  <div class="swatches">{Object.entries(SKINS).map(([k, v]) => <button key={k} class={`swatch ${look.skin === k ? 'on' : ''}`} style={{ background: v }} aria-label={`Teint ${k}`} onClick={() => setLook({ ...look, skin: k })} />)}</div>
                </div>
                <div class="field">Coiffure
                  <div class="row"><button class="pbtn small" onClick={() => cycleHair(-1)} aria-label="Coiffure précédente">◀</button><span style={{ minWidth: 110, textAlign: 'center' }}>{look.hair ?? 'court'}</span><button class="pbtn small" onClick={() => cycleHair(1)} aria-label="Coiffure suivante">▶</button></div>
                </div>
                <div class="field">Couleur des cheveux
                  <div class="swatches">{Object.entries(HAIR_COLORS).map(([k, v]) => <button key={k} class={`swatch ${look.hairColor === k ? 'on' : ''}`} style={{ background: v }} aria-label={`Cheveux ${k}`} onClick={() => setLook({ ...look, hairColor: k })} />)}</div>
                </div>
                <div class="field">Pilosité
                  <div class="row">{[['', 'Aucune'], ['barbe3j', 'Barbe de 3 jours'], ['bouc', 'Bouc'], ['moustache', 'Moustache'], ['barbe', 'Barbe']].map(([k, l]) => <button key={k} class={`pbtn small ${(look.beard ?? '') === k ? 'primary' : ''}`} onClick={() => setLook({ ...look, beard: k })}>{l}</button>)}</div>
                </div>
              </>
            )}
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
            <button class="pbtn primary" disabled={!ready} onClick={() => { audio.unlock(); onStart({ name: name.trim(), look, fields }); }} style={{ fontSize: 18, textAlign: 'center' }}>Commencer cette vie</button>
          </div>
        </div>
      </div>
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
                      <div style={{ fontWeight: 700, marginTop: 6 }}>{secret ? '???' : en.title}</div>
                      <div class="muted" style={{ fontSize: 13 }}>{ok ? en.summary ?? '' : secret ? 'Fin secrète. À toi de la trouver.' : 'Pas encore vécue.'}</div>
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
