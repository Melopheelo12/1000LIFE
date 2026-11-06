// Sections de l'éditeur : univers, statistiques, traits, personnages, lieux,
// activités, chapitres, création du personnage.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type {
  ActivityDef, ChapterDef, CharacterDef, ExitDef, HotspotDef, LocationDef, Look, NpcPlacement, PropDef, StatDef, TraitDef, UniverseDef,
} from '../../core/model/types';
import {
  ACCESSORIES, ANIMS, BEARDS, BOTTOM_STYLES, HAIR_COLORS, HAIR_STYLES, SKINS, SPR_H, TOP_STYLES, getFrame, randomLook,
} from '../../engine/gfx/character';
import { EMOTIONS } from '../../engine/gfx/portrait';
import { BACKDROP_TYPES, FLOOR_STYLES, PROP_TYPES, WALL_STYLES, renderLocation, type TimeOfDay } from '../../engine/gfx/scenery';
import { VIEW_H, VIEW_W, LANE_Y, drawTinyText } from '../../engine/gfx/pixel';
import { PortraitView, SceneThumb, SpriteView } from '../components';
import { Area, Check, Chips, Code, ColorIn, F, Fold, IdEdit, Num, Rows, Sel, TagList, Txt, opt, val, type Opt } from './fields';
import { ListDetail, issuesOf, IssueBox, type EdCtx } from './common';
import { uniqueId } from './templates';

const statOpts = (d: UniverseDef): [string, string][] => d.stats.map((s) => [s.id, s.label]);
const charOpts = (d: UniverseDef): [string, string][] => d.characters.map((c) => [c.id, c.name]);
const locOpts = (d: UniverseDef): [string, string][] => d.locations.map((l) => [l.id, l.name]);
const actOpts = (d: UniverseDef): [string, string][] => (d.activities ?? []).map((a) => [a.id, a.label]);
const evOpts = (d: UniverseDef): [string, string][] => d.events.map((e) => [e.id, e.title ? `${e.title} (${e.id})` : e.id]);
const ANIM_NAMES = Object.keys(ANIMS).filter((a) => !['walk', 'jump', 'clap', 'muscu'].includes(a));

// ───────────────────────────── Univers ─────────────────────────────────────

export function UniverseSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const up = (patch: Partial<UniverseDef>) => c.set((x) => ({ ...x, ...patch }));
  const cfg = d.config ?? {};
  const upCfg = (patch: Partial<NonNullable<UniverseDef['config']>>) => c.set((x) => ({ ...x, config: { ...(x.config ?? {}), ...patch } }));
  const theme = d.theme ?? {};
  const upTheme = (patch: Partial<NonNullable<UniverseDef['theme']>>) => c.set((x) => ({ ...x, theme: { ...(x.theme ?? {}), ...patch } }));
  const cover = d.locations.find((l) => l.id === theme.cover) ?? d.locations[0];
  const iss = c.report?.issues.filter((i) => i.kind === 'univers') ?? [];
  return (
    <div class="ed-form">
      <IssueBox issues={iss} />
      <h3 class="ed-h">Identité</h3>
      <div class="ed-grid">
        <F label="Nom de l'univers"><Txt value={d.name} onChange={(v) => up({ name: v })} maxLength={60} /></F>
        <F label="Identifiant" hint="Fixé à la création (clé de sauvegarde)."><code class="ed-code-inline">{d.id}</code></F>
        <F label="Version"><Txt value={d.version} onChange={(v) => up({ version: opt(v) })} placeholder="0.1" /></F>
        <F label="Accroche" span={2}><Txt value={d.tagline} onChange={(v) => up({ tagline: opt(v) })} placeholder="Une phrase qui donne envie" /></F>
        <F label="Auteur"><Txt value={d.author} onChange={(v) => up({ author: opt(v) })} /></F>
        <F label="Description" span={2}><Area value={d.description} onChange={(v) => up({ description: opt(v) })} rows={3} /></F>
        <F label="Étiquettes" hint="Séparées par des virgules (ex. Sport, Drame)."><TagList value={d.tags} onChange={(v) => up({ tags: v })} /></F>
      </div>

      <h3 class="ed-h">Apparence</h3>
      <div class="ed-grid">
        <F label="Couleur d'accent"><ColorIn value={theme.accent} onChange={(v) => upTheme({ accent: v })} /></F>
        <F label="Couleur secondaire"><ColorIn value={theme.accent2} onChange={(v) => upTheme({ accent2: v })} /></F>
        <F label="Lieu de couverture"><Sel value={theme.cover} onChange={(v) => upTheme({ cover: v })} options={locOpts(d)} empty="(premier lieu)" /></F>
        <div class="ed-cover span3"><SceneThumb key={JSON.stringify(cover)} loc={cover} env={c.env} /></div>
      </div>

      <h3 class="ed-h">Départ</h3>
      <div class="ed-grid">
        <F label="Lieu de départ"><Sel value={d.start.location} onChange={(v) => up({ start: { ...d.start, location: v ?? '' } })} options={locOpts(d)} /></F>
        <F label="Événement d'ouverture" hint="Joué au tout début de la partie."><Sel value={d.start.event} onChange={(v) => up({ start: { ...d.start, event: v } })} options={evOpts(d)} empty="(aucun)" /></F>
      </div>

      <h3 class="ed-h">Rythme de jeu</h3>
      <div class="ed-grid">
        <F label="Unité de temps" hint="ex. Semaine, Jour, Mois"><Txt value={cfg.tickLabel} onChange={(v) => upCfg({ tickLabel: opt(v) })} placeholder="Semaine" /></F>
        <F label="Actions par unité de temps"><Num value={cfg.actionsPerTick} onChange={(v) => upCfg({ actionsPerTick: v })} min={0} max={12} step={1} placeholder="3" /></F>
        <F label="Nom des actions"><Txt value={cfg.actionsLabel} onChange={(v) => upCfg({ actionsLabel: opt(v) })} placeholder="Actions" /></F>
        <F label="Texte « terminer la semaine »"><Txt value={cfg.endTickLabel} onChange={(v) => upCfg({ endTickLabel: opt(v) })} placeholder="Terminer la semaine" /></F>
        <F label="Chance d'événement aléatoire (%)" hint="Tirée à chaque début de semaine."><Num value={cfg.randomEventChance} onChange={(v) => upCfg({ randomEventChance: v })} min={0} max={100} step={1} /></F>
        <F label="Événements d'histoire max. par semaine"><Num value={cfg.maxStoryEventsPerTick} onChange={(v) => upCfg({ maxStoryEventsPerTick: v })} min={1} max={10} step={1} /></F>
        <F label="Échelle des tests de compétence" hint="Plus grand = résultats moins tranchés (défaut 10)."><Num value={cfg.checkScale} onChange={(v) => upCfg({ checkScale: v })} min={1} max={50} step={1} /></F>
        <F label="Ligne sous la date (HUD)" hint="Texte interpolé, ex. {var.age} ans"><Code kind="tpl" value={cfg.dateLine} onChange={(v) => upCfg({ dateLine: v })} /></F>
        <F label="Valeurs chiffrées" group><Check checked={cfg.showValues !== false} onChange={(v) => upCfg({ showValues: v })} label="Afficher les chiffres des jauges et des gains" /></F>
        <F label="Statistiques affichées en jeu (HUD)" span={3} group><Chips options={statOpts(d)} value={cfg.hud} onChange={(v) => upCfg({ hud: v })} /></F>
      </div>

      <h3 class="ed-h">Niveaux de relation</h3>
      <p class="muted small">Libellés affichés selon la valeur de la relation (−100 à 100), du plus bas au plus haut.</p>
      <Rows<{ min: number; label: string; color?: string }> items={cfg.relationLevels} onChange={(v) => upCfg({ relationLevels: v })} addLabel="Niveau" empty="Niveaux par défaut (Hostile → Proche)."
        create={() => ({ min: 0, label: 'Neutre' })}
        render={(r, set) => (
          <div class="ed-grid tight">
            <F label="À partir de"><Num value={r.min} onChange={(v) => set({ ...r, min: v ?? 0 })} min={-100} max={100} step={1} /></F>
            <F label="Libellé"><Txt value={r.label} onChange={(v) => set({ ...r, label: v })} /></F>
            <F label="Couleur"><ColorIn value={r.color} onChange={(v) => set({ ...r, color: v })} /></F>
          </div>
        )} />

      <h3 class="ed-h">Règles de chaque semaine</h3>
      <div class="ed-grid">
        <F label="Effets en début de semaine" span={3}><Code kind="fx" rows={2} value={d.onTickStart} onChange={(v) => up({ onTickStart: v })} placeholder="ex. var.entraine = faux" /></F>
        <F label="Effets en fin de semaine" span={3} hint="Récupération, salaire, usure des relations (eloigner)…"><Code kind="fx" rows={2} value={d.onTickEnd} onChange={(v) => up({ onTickEnd: v })} placeholder="ex. stat.energie += 20; eloigner(alex, 1)" /></F>
      </div>

      <h3 class="ed-h">Fiche du personnage</h3>
      <p class="muted small">Sections affichées dans le menu « Personnage » et sur l'écran de fin. Les valeurs sont des textes interpolés.</p>
      <Rows items={d.sheet} onChange={(v) => up({ sheet: v })} addLabel="Section" create={() => ({ title: 'Nouvelle section', rows: [] })}
        render={(sec, set) => (
          <div class="col">
            <F label="Titre"><Txt value={sec.title} onChange={(v) => set({ ...sec, title: v })} /></F>
            <Rows<{ label: string; value: string; when?: string }> items={sec.rows} compact onChange={(v) => set({ ...sec, rows: v ?? [] })} addLabel="Ligne" create={() => ({ label: 'Libellé', value: '{var.x}' })}
              render={(r, setR) => (
                <div class="ed-grid tight">
                  <F label="Libellé"><Txt value={r.label} onChange={(v) => setR({ ...r, label: v })} /></F>
                  <F label="Valeur"><Code kind="tpl" value={r.value} onChange={(v) => setR({ ...r, value: v ?? '' })} /></F>
                  <F label="Visible si"><Code kind="cond" value={r.when} onChange={(v) => setR({ ...r, when: v })} /></F>
                </div>
              )} />
          </div>
        )} />
    </div>
  );
}

// ───────────────────────────── Statistiques ────────────────────────────────

export function StatsSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const hud = new Set(d.config?.hud ?? []);
  return (
    <ListDetail<StatDef> c={c} section="stats" kind="stat" issueKind="stat" noun="Statistique" items={d.stats}
      onChange={(stats) => c.set((x) => ({ ...x, stats }))}
      label={(s) => s.label} sub={(s) => `${s.id}${s.category ? ` · ${s.category}` : ''}${hud.has(s.id) ? ' · HUD' : ''}`}
      thumb={(s) => <i class="ed-dot" style={{ background: s.color ?? 'var(--accent)' }} />}
      create={(ids) => ({ id: uniqueId('stat', ids), label: 'Nouvelle statistique', min: 0, max: 100, initial: 50 })}
      intro={<p class="muted small">Les statistiques mesurent le personnage joué (compétences, ressources, état). On les lit avec <code>stat.id</code> et on les modifie avec <code>~ stat.id += 5</code>.</p>}>
      {(s, set, rename) => (
        <div class="ed-form">
          <div class="ed-grid">
            <F label="Identifiant" group><IdEdit id={s.id} taken={d.stats.map((x) => x.id)} onRename={rename} /></F>
            <F label="Nom"><Txt value={s.label} onChange={(v) => set({ ...s, label: v })} /></F>
            <F label="Nom court (HUD)"><Txt value={s.short} onChange={(v) => set({ ...s, short: opt(v) })} maxLength={10} /></F>
            <F label="Catégorie" hint="Regroupe les stats dans le menu."><Txt value={s.category} onChange={(v) => set({ ...s, category: opt(v) })} /></F>
            <F label="Format"><Sel value={s.format ?? 'nombre'} onChange={(v) => set({ ...s, format: v === 'nombre' ? undefined : v as StatDef['format'] })} options={[['nombre', 'Nombre'], ['argent', 'Argent (€)'], ['pourcent', 'Pourcentage']]} /></F>
            <F label="Couleur"><ColorIn value={s.color} onChange={(v) => set({ ...s, color: v })} /></F>
            <F label="Minimum"><Num value={s.min} onChange={(v) => set({ ...s, min: v })} placeholder="0" /></F>
            <F label="Maximum"><Num value={s.max} onChange={(v) => set({ ...s, max: v })} placeholder="100" /></F>
            <F label="Valeur de départ"><Num value={s.initial} onChange={(v) => set({ ...s, initial: v })} /></F>
            <F label="Description" span={3}><Area value={s.description} onChange={(v) => set({ ...s, description: opt(v) })} rows={2} /></F>
            <F label="Affichage" span={3} group>
              <div class="row">
                <Check checked={s.visible !== false} onChange={(v) => set({ ...s, visible: v ? undefined : false })} label="Visible par le joueur" />
                <Check checked={hud.has(s.id)} onChange={(v) => c.set((x) => ({ ...x, config: { ...(x.config ?? {}), hud: v ? [...(x.config?.hud ?? []), s.id] : (x.config?.hud ?? []).filter((h) => h !== s.id) } }))} label="Jauge permanente en jeu (HUD)" />
              </div>
            </F>
          </div>
          <IssueBox issues={issuesOf(c, 'stat', s.id)} />
        </div>
      )}
    </ListDetail>
  );
}

// ───────────────────────────── Traits ──────────────────────────────────────

export function TraitsSection({ c }: { c: EdCtx }) {
  const d = c.def;
  return (
    <ListDetail<TraitDef> c={c} section="traits" kind="trait" issueKind="personnage" noun="Trait" items={d.traits ?? []}
      onChange={(traits) => c.set((x) => ({ ...x, traits }))}
      label={(t) => t.label} sub={(t) => `${t.id} · gains ×${t.gain ?? 1} · pertes ×${t.loss ?? 1}`}
      create={(ids) => ({ id: uniqueId('trait', ids), label: 'Nouveau trait', gain: 1, loss: 1 })}
      intro={<p class="muted small">Les traits de personnalité modulent la façon dont un personnage réagit à tes choix : un « rancunier » perd plus vite confiance, un « généreux » pardonne. Ils sont aussi lisibles dans les scripts avec <code>trait(perso, trait)</code>.</p>}>
      {(t, set, rename) => {
        const users = d.characters.filter((ch) => ch.traits?.includes(t.id));
        return (
          <div class="ed-form">
            <div class="ed-grid">
              <F label="Identifiant" group><IdEdit id={t.id} taken={(d.traits ?? []).map((x) => x.id)} onRename={rename} /></F>
              <F label="Nom"><Txt value={t.label} onChange={(v) => set({ ...t, label: v })} /></F>
              <F label="Gains de relation ×" hint="1 = normal, 1.5 = s'attache vite, 0.5 = méfiant"><Num value={t.gain} onChange={(v) => set({ ...t, gain: v })} min={0} max={5} step={0.1} placeholder="1" /></F>
              <F label="Pertes de relation ×" hint="1 = normal, 2 = rancunier, 0.5 = indulgent"><Num value={t.loss} onChange={(v) => set({ ...t, loss: v })} min={0} max={5} step={0.1} placeholder="1" /></F>
              <F label="Description" span={2}><Area value={t.description} onChange={(v) => set({ ...t, description: opt(v) })} rows={2} /></F>
            </div>
            <div class="muted small">Personnages avec ce trait : {users.length ? users.map((u) => <button type="button" key={u.id} class="ed-link" onClick={() => c.goto('personnages', u.id)}>{u.name}</button>).reduce((a, b) => <>{a}, {b}</>) : 'aucun'}</div>
          </div>
        );
      }}
    </ListDetail>
  );
}

// ───────────────────────────── Apparence ───────────────────────────────────

export function LookEditor({ look, onChange, resolve, allowEmpty }: { look: Look; onChange: (l: Look) => void; resolve: (l: Look) => Look; allowEmpty?: boolean }) {
  const [anim, setAnim] = useState('marche');
  const [emo, setEmo] = useState('neutre');
  const shown = useMemo(() => resolve(look), [JSON.stringify(look), resolve]);
  const up = (patch: Partial<Look>) => {
    const n: Look = { ...look, ...patch };
    for (const k of Object.keys(n) as (keyof Look)[]) if (n[k] === undefined || n[k] === '') delete n[k];
    onChange(n);
  };
  const sel = (key: keyof Look, options: Opt[], label: string, empty = '(par défaut)') => (
    <F label={label}><Sel value={look[key] as string | undefined} onChange={(v) => up({ [key]: v } as Partial<Look>)} options={options} empty={empty} /></F>
  );
  return (
    <div class="ed-look">
      <div class="ed-look-preview">
        <div class="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 14 }}>
          <SpriteView look={shown} anim={anim} scale={4} />
          <div class="ed-portrait"><PortraitView look={shown} emo={emo} size={40} /></div>
        </div>
        <div class="row" style={{ justifyContent: 'center' }}>
          <select class="txt small" value={anim} onChange={(e) => setAnim(val(e))} aria-label="Animation de l'aperçu">{ANIM_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select class="txt small" value={emo} onChange={(e) => setEmo(val(e))} aria-label="Émotion du portrait">{EMOTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <button type="button" class="pbtn small" onClick={() => onChange(randomLook(Math.floor(Math.random() * 1e9), { gender: look.gender }))}>Apparence aléatoire</button>
        {allowEmpty && <button type="button" class="pbtn small ghost" onClick={() => onChange({})}>Tout réinitialiser</button>}
      </div>
      <div class="ed-grid">
        {sel('gender', [['h', 'Masculin'], ['f', 'Féminin']], 'Genre (accords, silhouette)')}
        {sel('build', [['mince', 'Mince'], ['normal', 'Normale'], ['costaud', 'Costaud']], 'Corpulence')}
        {sel('height', [['petit', 'Petit'], ['normal', 'Normal'], ['grand', 'Grand'], ['enfant', 'Enfant']], 'Taille')}
        <F label="Teint" group>
          <div class="swatches">{Object.entries(SKINS).map(([k, v]) => <button type="button" key={k} class={`swatch ${look.skin === k ? 'on' : ''}`} style={{ background: v }} aria-label={`Teint ${k}`} aria-pressed={look.skin === k} onClick={() => up({ skin: k })} />)}</div>
        </F>
        {sel('hair', HAIR_STYLES, 'Coiffure')}
        <F label="Cheveux" group>
          <div class="swatches">{Object.entries(HAIR_COLORS).map(([k, v]) => <button type="button" key={k} class={`swatch ${look.hairColor === k ? 'on' : ''}`} style={{ background: v }} aria-label={`Cheveux ${k}`} aria-pressed={look.hairColor === k} onClick={() => up({ hairColor: k })} />)}</div>
        </F>
        {sel('beard', BEARDS.filter(Boolean), 'Pilosité', '(aucune)')}
        <F label="Yeux"><ColorIn value={look.eyes} onChange={(v) => up({ eyes: v })} /></F>
        <F label="Accessoires" span={2} group><Chips options={ACCESSORIES.map((a) => [a, a])} value={look.acc} onChange={(v) => up({ acc: v })} /></F>
        {sel('top', TOP_STYLES, 'Haut')}
        <F label="Couleur du haut"><ColorIn value={look.topColor} onChange={(v) => up({ topColor: v })} /></F>
        <F label="Couleur secondaire"><ColorIn value={look.topColor2} onChange={(v) => up({ topColor2: v })} /></F>
        {sel('bottom', BOTTOM_STYLES, 'Bas')}
        <F label="Couleur du bas"><ColorIn value={look.bottomColor} onChange={(v) => up({ bottomColor: v })} /></F>
        <F label="Chaussures"><ColorIn value={look.shoes} onChange={(v) => up({ shoes: v })} /></F>
        <F label="Chaussettes"><ColorIn value={look.socks} onChange={(v) => up({ socks: v })} /></F>
      </div>
    </div>
  );
}

// ───────────────────────────── Personnages ─────────────────────────────────

export function CharactersSection({ c }: { c: EdCtx }) {
  const d = c.def;
  return (
    <ListDetail<CharacterDef> c={c} section="personnages" kind="personnage" issueKind="personnage" noun="Personnage" items={d.characters}
      onChange={(characters) => c.set((x) => ({ ...x, characters }))}
      label={(ch) => ch.name} sub={(ch) => `${ch.id}${ch.role ? ` · ${ch.role}` : ''}`}
      thumb={(ch) => <span class="ed-thumb"><PortraitView look={c.resolveLook(ch.look)} size={40} /></span>}
      create={(ids) => { const id = uniqueId('perso', ids); return { id, name: 'Nouveau personnage', relation: 0, look: randomLook(ids.length * 7919 + 13) }; }}
      intro={<p class="muted small">Chaque personnage a sa personnalité (traits), sa relation avec toi (−100 à 100), ses souvenirs de tes actes et ses objectifs. Dans un script : <code>{'id (emotion): texte'}</code>, <code>rel.id</code>, <code>souvenir(id, cle, "…")</code>.</p>}>
      {(ch, set, rename) => {
        const places = d.locations.filter((l) => l.npcs?.some((n) => n.id === ch.id));
        const talks = d.events.filter((e) => e.trigger === `talk:${ch.id}`);
        return (
          <div class="ed-form">
            <div class="ed-grid">
              <F label="Identifiant" group><IdEdit id={ch.id} taken={d.characters.map((x) => x.id)} onRename={rename} /></F>
              <F label="Nom complet"><Txt value={ch.name} onChange={(v) => set({ ...ch, name: v })} /></F>
              <F label="Nom court" hint="Utilisé dans les notifications."><Txt value={ch.short} onChange={(v) => set({ ...ch, short: opt(v) })} /></F>
              <F label="Rôle"><Txt value={ch.role} onChange={(v) => set({ ...ch, role: opt(v) })} placeholder="ex. Ton coach" /></F>
              <F label="Objectif personnel" span={2}><Txt value={ch.goals} onChange={(v) => set({ ...ch, goals: opt(v) })} placeholder="ce qu'il veut vraiment" /></F>
              <F label="Description" span={3}><Area value={ch.description} onChange={(v) => set({ ...ch, description: opt(v) })} rows={2} /></F>
              <F label="Traits de personnalité" span={3} group><Chips options={(d.traits ?? []).map((t) => [t.id, t.label])} value={ch.traits} onChange={(v) => set({ ...ch, traits: v })} empty="Définis des traits dans la section « Traits »." /></F>
              <F label={`Relation de départ : ${ch.relation ?? 0}`}>
                <input type="range" min={-100} max={100} value={ch.relation ?? 0} onInput={(e) => set({ ...ch, relation: Number(val(e)) })} />
              </F>
              <F label="Nom de la relation" hint="ex. Amitié, Confiance, Amour"><Txt value={ch.relationLabel} onChange={(v) => set({ ...ch, relationLabel: opt(v) })} /></F>
              <F label="Voix (hauteur des bips)"><Num value={ch.voice} onChange={(v) => set({ ...ch, voice: v })} min={0.5} max={2} step={0.05} placeholder="1" /></F>
              <F label="Carnet" group><Check checked={ch.hidden} onChange={(v) => set({ ...ch, hidden: v || undefined })} label="Caché du carnet tant qu'il n'est pas rencontré" /></F>
            </div>
            <Fold title="Apparence (aperçu animé)" open>
              <LookEditor look={ch.look} onChange={(look) => set({ ...ch, look })} resolve={c.resolveLook} />
            </Fold>
            <Fold title={`Répliques d'ambiance (${ch.barks?.length ?? 0})`} open={!!ch.barks?.length}>
              <p class="muted small">Dites quand on parle au personnage sans événement prévu. Condition facultative.</p>
              <Rows<{ text: string; if?: string }> items={ch.barks} onChange={(v) => set({ ...ch, barks: v })} addLabel="Réplique" create={() => ({ text: 'Salut !' })}
                render={(b, setB) => (
                  <div class="ed-grid tight">
                    <F label="Texte" span={2}><Code kind="tpl" value={b.text} onChange={(v) => setB({ ...b, text: v ?? '' })} /></F>
                    <F label="Si"><Code kind="cond" value={b.if} onChange={(v) => setB({ ...b, if: v })} placeholder="ex. rel.alex > 20" /></F>
                  </div>
                )} />
            </Fold>
            <div class="muted small ed-refs">
              <span>Présent dans : {places.length ? places.map((l) => <button type="button" key={l.id} class="ed-link" onClick={() => c.goto('lieux', l.id)}>{l.name}</button>) : 'aucun lieu (ajoute-le dans un lieu, section « Lieux »)'}</span>
              <span>Conversations : {talks.length ? talks.map((e) => <button type="button" key={e.id} class="ed-link" onClick={() => c.goto('evenements', e.id)}>{e.title ?? e.id}</button>) : 'aucune (événement déclenché « En parlant à un personnage »)'}</span>
            </div>
            <IssueBox issues={issuesOf(c, 'personnage', ch.id)} />
          </div>
        );
      }}
    </ListDetail>
  );
}

// ───────────────────────────── Lieux ───────────────────────────────────────

type PlaceTarget = { list: 'props' | 'exits' | 'npcs' | 'hotspots' | 'spawn'; index: number } | null;

function LocPreview({ loc, c, placing, onPlace }: { loc: LocationDef; c: EdCtx; placing: PlaceTarget; onPlace: (x: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cam, setCam] = useState(0);
  const [time, setTime] = useState<TimeOfDay | ''>('');
  const [marks, setMarks] = useState(true);
  const key = JSON.stringify(loc);
  const r = useMemo(() => {
    try { return { r: renderLocation(loc, c.env, time || undefined), err: '' }; } catch (e) { return { r: null, err: (e as Error).message }; }
  }, [key, time, c.env]);
  const width = r.r?.width ?? loc.width ?? VIEW_W;
  const maxCam = Math.max(0, width - VIEW_W);
  const camX = Math.min(cam, maxCam);
  useEffect(() => {
    const cv = ref.current; const R = r.r;
    if (!cv) return;
    const x = cv.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#000'; x.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!R) return;
    if (R.far) { x.save(); x.translate(-Math.round(camX * 0.35), 0); x.drawImage(R.far, 0, 0); for (const a of R.anim) if (a.layer === 'far') a.draw(x, 2); x.restore(); }
    x.save(); x.translate(-camX, 0);
    x.drawImage(R.main, 0, 0);
    for (const a of R.anim) if (a.layer === 'main') a.draw(x, 2);
    const actor = (look: Look, ax: number, face: number, anim = 'idle', lane = 0) => {
      const f = getFrame(look, ANIMS[anim] ? anim : 'idle', 0);
      const y = (LANE_Y[lane] ?? LANE_Y[0]) - SPR_H + 2;
      if (face < 0) { x.save(); x.translate(ax * 2, 0); x.scale(-1, 1); x.drawImage(f, ax - 16, y); x.restore(); } else x.drawImage(f, ax - 15, y);
    };
    for (const n of loc.npcs ?? []) {
      const ch = c.def.characters.find((k) => k.id === n.id);
      if (ch) actor(c.resolveLook({ ...ch.look, ...(n.look ?? {}) }), n.x, n.face === 'gauche' ? -1 : 1, n.anim, n.lane);
    }
    const spawn = loc.spawn ?? width / 2;
    actor(c.resolveLook({ ...(c.def.creation?.baseLook ?? {}), ...(loc.playerLook ?? {}) }), spawn, 1);
    for (const a of R.anim) if (a.layer === 'front') a.draw(x, 2);
    x.drawImage(R.front, 0, 0);
    x.restore();
    if (R.time === 'nuit' || R.time === 'soir') {
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = R.time === 'nuit' ? (R.interior ? '#9aa0c8' : '#5d6aa8') : '#f2b892';
      x.fillRect(0, 0, VIEW_W, VIEW_H);
      x.globalCompositeOperation = 'source-over';
    }
    if (!marks) return;
    const mx = (wx: number) => Math.round(wx - camX);
    for (const e of loc.exits ?? []) { const px = mx(e.x); x.fillStyle = '#000'; x.fillRect(px - 5, 168, 11, 5); x.fillStyle = '#4fd6c4'; x.fillRect(px - 4, 169, 9, 3); drawTinyText(x, `>${e.to}`.slice(0, 16), px, 174, '#4fd6c4', { align: 'center', shadow: '#000' }); }
    for (const h of loc.hotspots ?? []) { const px = mx(h.x); x.fillStyle = h.endTick ? '#b893ff' : '#ffd25a'; x.fillRect(px - 2, 112, 5, 5); drawTinyText(x, h.id.slice(0, 14), px, 104, h.endTick ? '#b893ff' : '#ffd25a', { align: 'center', shadow: '#000' }); }
    for (const n of loc.npcs ?? []) drawTinyText(x, n.id.slice(0, 12), mx(n.x), 110 - 20, '#ffffff', { align: 'center', shadow: '#000' });
    drawTinyText(x, 'TOI', mx(spawn), 92, '#f5c542', { align: 'center', shadow: '#000' });
  }, [r, camX, marks, key, c.resolveLook]);
  const click = (e: MouseEvent) => {
    if (!placing) return;
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    onPlace(Math.round(((e.clientX - rect.left) / rect.width) * VIEW_W + camX));
  };
  return (
    <div class="ed-locprev">
      <canvas ref={ref} width={VIEW_W} height={VIEW_H} class={`pix ${placing ? 'placing' : ''}`} onClick={click}
        aria-label={`Aperçu du lieu ${loc.name}`} role="img" />
      {r.err && <div class="ed-err">Rendu impossible : {r.err}</div>}
      {placing && <div class="ed-placing">Clique dans l'aperçu pour placer l'élément · <button type="button" class="ed-link" onClick={() => onPlace(-1)}>annuler</button></div>}
      <div class="row">
        {maxCam > 0 && <label class="ed-f grow"><span class="ed-l">Défiler ({camX} / {maxCam})</span><input type="range" min={0} max={maxCam} value={camX} onInput={(e) => setCam(Number(val(e)))} /></label>}
        <select class="txt small" value={time} onChange={(e) => setTime(val(e) as TimeOfDay | '')} aria-label="Moment de la journée de l'aperçu">
          <option value="">Moment du lieu</option><option value="aube">Aube</option><option value="jour">Jour</option><option value="soir">Soir</option><option value="nuit">Nuit</option>
        </select>
        <Check checked={marks} onChange={setMarks} label="Repères" />
      </div>
    </div>
  );
}

const PROP_ONLY = PROP_TYPES.filter((t) => !BACKDROP_TYPES.includes(t));
const KNOWN_PROP_KEYS = new Set(['type', 'x', 'y', 'w', 'h', 'when', 'layer']);
const parseAttr = (v: string): unknown => (v === 'vrai' || v === 'true' ? true : v === 'faux' || v === 'false' ? false : v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

function PropRow({ p, set, onPlace }: { p: PropDef; set: (p: PropDef) => void; onPlace: () => void }) {
  const extra = Object.entries(p).filter(([k]) => !KNOWN_PROP_KEYS.has(k));
  const setExtra = (list: [string, unknown][]) => {
    const base: PropDef = { type: p.type, x: p.x };
    for (const k of ['y', 'w', 'h', 'when', 'layer'] as const) if (p[k] !== undefined) (base as Record<string, unknown>)[k] = p[k];
    for (const [k, v] of list) if (k) base[k] = v;
    set(base);
  };
  return (
    <div class="col">
      <div class="ed-grid tight">
        <F label="Type"><Sel value={p.type} onChange={(v) => set({ ...p, type: v ?? 'plante' })} options={PROP_ONLY} /></F>
        <F label="x" group><div class="row nowrap"><Num value={p.x} onChange={(v) => set({ ...p, x: v ?? 0 })} step={1} /><button type="button" class="ed-ico" onClick={onPlace} title="Placer en cliquant dans l'aperçu" aria-label="Placer dans l'aperçu">📍</button></div></F>
        <F label="y"><Num value={p.y} onChange={(v) => set({ ...p, y: v })} step={1} /></F>
        <F label="Largeur"><Num value={p.w} onChange={(v) => set({ ...p, w: v })} step={1} /></F>
        <F label="Hauteur"><Num value={p.h} onChange={(v) => set({ ...p, h: v })} step={1} /></F>
        <F label="Plan"><Sel value={p.layer} onChange={(v) => set({ ...p, layer: v as PropDef['layer'] })} options={[['fond', 'Fond'], ['avant', 'Premier plan']]} empty="(normal)" /></F>
        <F label="Visible si" span={2}><Code kind="cond" value={p.when} onChange={(v) => set({ ...p, when: v })} /></F>
      </div>
      <Rows<[string, unknown]> items={extra} compact addLabel="Attribut (couleur, texte…)" onChange={(v) => setExtra(v ?? [])} create={() => ['color', '#888888']}
        render={([k, v], setKV) => (
          <div class="ed-grid tight">
            <F label="Attribut"><Txt value={k} mono list="ed-prop-keys" onChange={(nk) => setKV([nk.trim(), v])} /></F>
            <F label="Valeur" span={2}><Txt value={String(v)} onChange={(nv) => setKV([k, parseAttr(nv)])} /></F>
          </div>
        )} />
    </div>
  );
}

export function LocationsSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const [placing, setPlacingState] = useState<PlaceTarget>(null);
  const anchor = useRef<HTMLElement | null>(null);
  /** Arme le placement au clic : l'aperçu remonte à l'écran, puis on revient au bouton d'origine. */
  const setPlacing = (t: PlaceTarget) => {
    if (t) {
      anchor.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => document.querySelector('.ed-locprev canvas')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    } else if (anchor.current) {
      const el = anchor.current; anchor.current = null;
      requestAnimationFrame(() => { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); });
    }
    setPlacingState(t);
  };
  return (
    <ListDetail<LocationDef> c={c} section="lieux" kind="lieu" issueKind="lieu" noun="Lieu" items={d.locations}
      onChange={(locations) => c.set((x) => ({ ...x, locations }))}
      label={(l) => l.name} sub={(l) => `${l.id} · ${l.kind === 'exterieur' ? 'extérieur' : 'intérieur'} · ${l.width ?? 320} px`}
      create={(ids) => ({
        id: uniqueId('lieu', ids), name: 'Nouveau lieu', width: 360, kind: 'interieur', spawn: 60,
        wall: { style: 'peint', color: '#c9d6e3' }, floor: { style: 'parquet', color: '#a8794e' },
        props: [{ type: 'porte', x: 30, label: 'SORTIE' }, { type: 'fenetre', x: 150 }, { type: 'plante', x: 240 }],
        exits: d.locations[0] ? [{ to: d.locations[0].id, x: 30, kind: 'porte' }] : [],
      })}
      intro={<p class="muted small">Un lieu est une scène 2D défilante. Le décor est entièrement procédural : choisis murs, sols, fonds et objets, puis place sorties, personnages et éléments interactifs (activités, événements, fin de semaine).</p>}>
      {(l, set, rename) => {
        const place = (x: number) => {
          const t = placing; setPlacing(null);
          if (!t || x < 0) return;
          if (t.list === 'spawn') { set({ ...l, spawn: x }); return; }
          const list = [...((l[t.list] ?? []) as { x: number }[])];
          if (list[t.index]) list[t.index] = { ...list[t.index], x };
          set({ ...l, [t.list]: list });
        };
        const hotspotIds = d.locations.flatMap((x) => (x.hotspots ?? []).map((h) => h.id));
        return (
          <div class="ed-form">
            <LocPreview loc={l} c={c} placing={placing} onPlace={place} />
            <div class="ed-grid">
              <F label="Identifiant" group><IdEdit id={l.id} taken={d.locations.map((x) => x.id)} onRename={rename} /></F>
              <F label="Nom affiché"><Code kind="tpl" value={l.name} onChange={(v) => set({ ...l, name: v ?? '' })} /></F>
              <F label="Groupe (carte)" hint="Regroupe les lieux dans la carte."><Txt value={l.group} onChange={(v) => set({ ...l, group: opt(v) })} /></F>
              <F label="Type"><Sel value={l.kind ?? 'interieur'} onChange={(v) => set({ ...l, kind: v as LocationDef['kind'] })} options={[['interieur', 'Intérieur'], ['exterieur', 'Extérieur']]} /></F>
              <F label="Moment"><Sel value={l.time} onChange={(v) => set({ ...l, time: v as LocationDef['time'] })} options={[['aube', 'Aube'], ['jour', 'Jour'], ['soir', 'Soir'], ['nuit', 'Nuit']]} empty="(jour)" /></F>
              <F label="Largeur (px)" hint="320 = un écran"><Num value={l.width} onChange={(v) => set({ ...l, width: v })} min={320} max={2400} step={10} /></F>
              <F label="Apparition du joueur (x)" group><div class="row nowrap"><Num value={l.spawn} onChange={(v) => set({ ...l, spawn: v })} step={1} /><button type="button" class="ed-ico" onClick={() => setPlacing({ list: 'spawn', index: 0 })} title="Placer en cliquant" aria-label="Placer le point d'apparition">📍</button></div></F>
              <F label="Ambiance sonore"><Sel value={l.ambient} onChange={(v) => set({ ...l, ambient: v })} options={[['interieur', 'Intérieur'], ['ville', 'Ville'], ['nature', 'Nature'], ['foule', 'Foule'], ['club', 'Club'], ['pluie', 'Pluie'], ['aucun', 'Silence']]} empty="(intérieur)" /></F>
              <F label="Accessible si" hint="Vide = toujours accessible"><Code kind="cond" value={l.when} onChange={(v) => set({ ...l, when: v })} /></F>
            </div>
            <div class="ed-grid">
              {l.kind !== 'exterieur' && (
                <>
                  <F label="Murs"><Sel value={l.wall?.style} onChange={(v) => set({ ...l, wall: v ? { ...(l.wall ?? {}), style: v } : undefined })} options={WALL_STYLES} empty="(aucun)" /></F>
                  <F label="Couleur des murs"><ColorIn value={l.wall?.color} onChange={(v) => set({ ...l, wall: { style: l.wall?.style ?? 'peint', ...l.wall, color: v } })} /></F>
                  <F label="Couleur secondaire"><ColorIn value={l.wall?.color2} onChange={(v) => set({ ...l, wall: { style: l.wall?.style ?? 'peint', ...l.wall, color2: v } })} /></F>
                </>
              )}
              <F label="Sol"><Sel value={l.floor?.style} onChange={(v) => set({ ...l, floor: v ? { ...(l.floor ?? {}), style: v } : undefined })} options={FLOOR_STYLES} empty="(aucun)" /></F>
              <F label="Couleur du sol"><ColorIn value={l.floor?.color} onChange={(v) => set({ ...l, floor: { style: l.floor?.style ?? 'parquet', ...l.floor, color: v } })} /></F>
              <F label="Couleur secondaire"><ColorIn value={l.floor?.color2} onChange={(v) => set({ ...l, floor: { style: l.floor?.style ?? 'parquet', ...l.floor, color2: v } })} /></F>
            </div>
            {l.kind === 'exterieur' && (
              <Fold title={`Arrière-plans (${l.backdrop?.length ?? 0})`} open>
                <Rows items={l.backdrop} compact onChange={(v) => set({ ...l, backdrop: v })} addLabel="Arrière-plan" create={() => ({ type: 'collines', x: 0 })}
                  render={(b, setB) => (
                    <div class="ed-grid tight">
                      <F label="Type"><Sel value={b.type} onChange={(v) => setB({ ...b, type: v ?? 'collines' })} options={BACKDROP_TYPES} /></F>
                      <F label="x"><Num value={b.x} onChange={(v) => setB({ ...b, x: v ?? 0 })} step={1} /></F>
                    </div>
                  )} />
              </Fold>
            )}
            <Fold title={`Objets du décor (${l.props?.length ?? 0})`} open>
              <Rows items={l.props} onChange={(v) => set({ ...l, props: v })} addLabel="Objet" create={() => ({ type: 'plante', x: Math.round((l.width ?? 320) / 2) })}
                render={(p, setP, i) => <PropRow p={p} set={setP} onPlace={() => setPlacing({ list: 'props', index: i })} />} />
            </Fold>
            <Fold title={`Sorties (${l.exits?.length ?? 0})`} open>
              <Rows<ExitDef> items={l.exits} onChange={(v) => set({ ...l, exits: v })} addLabel="Sortie" create={() => ({ to: d.locations.find((x) => x.id !== l.id)?.id ?? l.id, x: 30 })}
                render={(e, setE, i) => (
                  <div class="ed-grid tight">
                    <F label="Vers"><Sel value={e.to} onChange={(v) => setE({ ...e, to: v ?? '' })} options={locOpts(d)} /></F>
                    <F label="x" group><div class="row nowrap"><Num value={e.x} onChange={(v) => setE({ ...e, x: v ?? 0 })} step={1} /><button type="button" class="ed-ico" onClick={() => setPlacing({ list: 'exits', index: i })} aria-label="Placer dans l'aperçu">📍</button></div></F>
                    <F label="Libellé"><Code kind="tpl" value={e.label} onChange={(v) => setE({ ...e, label: v })} /></F>
                    <F label="Forme"><Sel value={e.kind} onChange={(v) => setE({ ...e, kind: v as ExitDef['kind'] })} options={[['porte', 'Porte'], ['bord', 'Bord de l\'écran']]} empty="(automatique)" /></F>
                    <F label="Arrivée (x)"><Num value={e.spawn} onChange={(v) => setE({ ...e, spawn: v })} step={1} /></F>
                    <F label="Disponible si"><Code kind="cond" value={e.when} onChange={(v) => setE({ ...e, when: v })} /></F>
                  </div>
                )} />
            </Fold>
            <Fold title={`Personnages présents (${l.npcs?.length ?? 0})`} open>
              <Rows<NpcPlacement> items={l.npcs} onChange={(v) => set({ ...l, npcs: v })} addLabel="Personnage" create={() => ({ id: d.characters[0]?.id ?? '', x: Math.round((l.width ?? 320) / 2) })}
                render={(n, setN, i) => (
                  <div class="ed-grid tight">
                    <F label="Qui"><Sel value={n.id} onChange={(v) => setN({ ...n, id: v ?? '' })} options={charOpts(d)} /></F>
                    <F label="x" group><div class="row nowrap"><Num value={n.x} onChange={(v) => setN({ ...n, x: v ?? 0 })} step={1} /><button type="button" class="ed-ico" onClick={() => setPlacing({ list: 'npcs', index: i })} aria-label="Placer dans l'aperçu">📍</button></div></F>
                    <F label="Regarde"><Sel value={n.face} onChange={(v) => setN({ ...n, face: v as NpcPlacement['face'] })} options={[['gauche', 'À gauche'], ['droite', 'À droite']]} empty="(vers le joueur)" /></F>
                    <F label="Animation"><Sel value={n.anim} onChange={(v) => setN({ ...n, anim: v })} options={ANIM_NAMES} empty="(immobile)" /></F>
                    <F label="Profondeur"><Sel value={n.lane === undefined ? undefined : String(n.lane)} onChange={(v) => setN({ ...n, lane: v === undefined ? undefined : Number(v) })} options={[['0', 'Devant'], ['1', 'Milieu'], ['2', 'Fond']]} empty="(devant)" /></F>
                    <F label="Présent si"><Code kind="cond" value={n.when} onChange={(v) => setN({ ...n, when: v })} placeholder="ex. temps.semaine % 2 == 0" /></F>
                  </div>
                )} />
            </Fold>
            <Fold title={`Éléments interactifs (${l.hotspots?.length ?? 0})`} open>
              <p class="muted small">Un élément propose des activités et/ou un événement ; coche « Termine la semaine » sur au moins un élément de l'univers (ex. un lit). Un événement déclenché « En utilisant un élément du décor » passe avant ce menu.</p>
              <Rows<HotspotDef> items={l.hotspots} onChange={(v) => set({ ...l, hotspots: v })} addLabel="Élément interactif"
                create={() => ({ id: uniqueId('element', hotspotIds), x: Math.round((l.width ?? 320) / 2), label: 'Nouvel élément' })}
                render={(h, setH, i) => (
                  <div class="ed-grid tight">
                    <F label="Identifiant"><Txt value={h.id} mono onChange={(v) => setH({ ...h, id: v.replace(/[^\w-]/g, '') })} /></F>
                    <F label="x" group><div class="row nowrap"><Num value={h.x} onChange={(v) => setH({ ...h, x: v ?? 0 })} step={1} /><button type="button" class="ed-ico" onClick={() => setPlacing({ list: 'hotspots', index: i })} aria-label="Placer dans l'aperçu">📍</button></div></F>
                    <F label="Libellé"><Code kind="tpl" value={h.label} onChange={(v) => setH({ ...h, label: v ?? '' })} /></F>
                    <F label="Activités proposées" span={3} group><Chips options={actOpts(d)} value={h.activities} onChange={(v) => setH({ ...h, activities: v })} empty="Crée des activités dans la section « Activités »." /></F>
                    <F label="Événement lancé"><Sel value={h.event} onChange={(v) => setH({ ...h, event: v })} options={evOpts(d)} empty="(aucun)" /></F>
                    <F label="Fin de semaine" group><Check checked={h.endTick} onChange={(v) => setH({ ...h, endTick: v || undefined })} label="Termine la semaine" /></F>
                    <F label="Disponible si"><Code kind="cond" value={h.when} onChange={(v) => setH({ ...h, when: v })} /></F>
                  </div>
                )} />
            </Fold>
            <Fold title="Tenue du joueur dans ce lieu">
              <p class="muted small">Remplace une partie de l'apparence du joueur ici (ex. maillot au stade). Laisse vide pour garder sa tenue.</p>
              <LookEditor look={l.playerLook ?? {}} allowEmpty onChange={(lk) => set({ ...l, playerLook: Object.keys(lk).length ? lk : undefined })} resolve={(lk) => c.resolveLook({ ...(d.creation?.baseLook ?? {}), ...lk })} />
            </Fold>
            <IssueBox issues={issuesOf(c, 'lieu', l.id)} />
          </div>
        );
      }}
    </ListDetail>
  );
}

// ───────────────────────────── Activités ───────────────────────────────────

export function ActivitiesSection({ c }: { c: EdCtx }) {
  const d = c.def;
  return (
    <ListDetail<ActivityDef> c={c} section="activites" kind="activite" issueKind="activite" noun="Activité" items={d.activities ?? []}
      onChange={(activities) => c.set((x) => ({ ...x, activities }))}
      label={(a) => a.label} sub={(a) => `${a.id} · ${Object.entries(a.cost ?? {}).map(([k, v]) => `${v} ${k}`).join(', ') || 'gratuite'}`}
      create={(ids) => ({ id: uniqueId('activite', ids), label: 'Nouvelle activité', cost: { actions: 1 }, effects: '' })}
      intro={<p class="muted small">Les activités sont ce que le joueur fait de son temps libre (entraînement, sortie, travail…). Elles coûtent des actions ou des ressources et appliquent des effets. Propose-les via les éléments interactifs des lieux.</p>}>
      {(a, set, rename) => {
        const where = d.locations.flatMap((l) => (l.hotspots ?? []).filter((h) => h.activities?.includes(a.id)).map((h) => ({ l, h })));
        const cost = Object.entries(a.cost ?? {});
        const evs = d.events.filter((e) => e.trigger === `activity:${a.id}`);
        return (
          <div class="ed-form">
            <div class="ed-grid">
              <F label="Identifiant" group><IdEdit id={a.id} taken={(d.activities ?? []).map((x) => x.id)} onRename={rename} /></F>
              <F label="Nom"><Code kind="tpl" value={a.label} onChange={(v) => set({ ...a, label: v ?? '' })} /></F>
              <F label="Max. par semaine"><Num value={a.maxPerTick} onChange={(v) => set({ ...a, maxPerTick: v })} min={1} step={1} placeholder="illimité" /></F>
              <F label="Description" span={3}><Code kind="tpl" value={a.description} onChange={(v) => set({ ...a, description: v })} /></F>
              <F label="Coût" span={3} group>
                <Rows<[string, number]> items={cost} compact addLabel="Coût" onChange={(v) => set({ ...a, cost: v && v.length ? Object.fromEntries(v) : undefined })} create={() => ['actions', 1]}
                  render={([k, n], setKV) => (
                    <div class="ed-grid tight">
                      <F label="Ressource"><Sel value={k} onChange={(v) => setKV([v ?? 'actions', n])} options={[['actions', 'Actions'], ...statOpts(d)]} /></F>
                      <F label="Quantité"><Num value={n} onChange={(v) => setKV([k, v ?? 0])} step={1} /></F>
                    </div>
                  )} />
              </F>
              <F label="Effets" span={3} hint="ex. stat.forme += 3; rel.karim += 2"><Code kind="fx" rows={2} value={a.effects} onChange={(v) => set({ ...a, effects: v })} /></F>
              <F label="Message après l'activité" span={3}><Code kind="tpl" value={a.feedback} onChange={(v) => set({ ...a, feedback: v })} /></F>
              <F label="Disponible si" span={2}><Code kind="cond" value={a.when} onChange={(v) => set({ ...a, when: v })} /></F>
              <F label="Message si indisponible"><Code kind="tpl" value={a.lockedText} onChange={(v) => set({ ...a, lockedText: v })} /></F>
            </div>
            <div class="muted small ed-refs">
              <span>Proposée par : {where.length ? where.map(({ l, h }) => <button type="button" key={l.id + h.id} class="ed-link" onClick={() => c.goto('lieux', l.id)}>{l.name} › {h.label}</button>) : <b class="warn">aucun élément interactif (le joueur ne peut pas la faire)</b>}</span>
              <span>Événements après l'activité : {evs.length ? evs.map((e) => <button type="button" key={e.id} class="ed-link" onClick={() => c.goto('evenements', e.id)}>{e.title ?? e.id}</button>) : 'aucun'}</span>
            </div>
            <IssueBox issues={issuesOf(c, 'activite', a.id)} />
          </div>
        );
      }}
    </ListDetail>
  );
}

// ───────────────────────────── Chapitres ───────────────────────────────────

export function ChaptersSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const total = d.chapters.reduce((n, ch) => n + (ch.weeks || 0), 0);
  return (
    <ListDetail<ChapterDef> c={c} section="chapitres" kind="chapitre" issueKind="chapitre" noun="Chapitre" items={d.chapters}
      onChange={(chapters) => c.set((x) => ({ ...x, chapters }))}
      label={(ch) => ch.title} sub={(ch) => `${d.chapters.indexOf(ch) + 1}. ${ch.id} · ${ch.weeks} ${(d.config?.tickLabel ?? 'semaine').toLowerCase()}${ch.weeks > 1 ? 's' : ''}`}
      create={(ids) => ({ id: uniqueId('ch', ids), title: 'Nouveau chapitre', weeks: 4 })}
      intro={<p class="muted small">Les chapitres découpent la vie en grandes périodes, dans l'ordre de la liste (↑ ↓ pour réordonner). Durée totale : <b>{total}</b> {(d.config?.tickLabel ?? 'semaine').toLowerCase()}s. À la fin du dernier chapitre, la fin la plus prioritaire dont la condition est vraie est jouée.</p>}>
      {(ch, set, rename) => {
        const evs = d.events.filter((e) => e.chapters?.includes(ch.id));
        return (
          <div class="ed-form">
            <div class="ed-grid">
              <F label="Identifiant" group><IdEdit id={ch.id} taken={d.chapters.map((x) => x.id)} onRename={rename} /></F>
              <F label="Titre"><Txt value={ch.title} onChange={(v) => set({ ...ch, title: v })} /></F>
              <F label="Durée"><Num value={ch.weeks} onChange={(v) => set({ ...ch, weeks: Math.max(1, Math.round(v ?? 1)) })} min={1} max={200} step={1} /></F>
              <F label="Sous-titre" span={2}><Code kind="tpl" value={ch.subtitle} onChange={(v) => set({ ...ch, subtitle: v })} /></F>
              <F label="Lieu au début du chapitre"><Sel value={ch.location} onChange={(v) => set({ ...ch, location: v })} options={locOpts(d)} empty="(inchangé)" /></F>
              <F label="Texte d'introduction" span={3}><Code kind="tpl" rows={2} value={ch.intro} onChange={(v) => set({ ...ch, intro: v })} /></F>
              <F label="Effets au début" span={3}><Code kind="fx" rows={2} value={ch.onStart} onChange={(v) => set({ ...ch, onStart: v })} placeholder="ex. var.age = 18; stat.argent += 500" /></F>
              <F label="Effets à la fin" span={3}><Code kind="fx" rows={2} value={ch.onEnd} onChange={(v) => set({ ...ch, onEnd: v })} /></F>
            </div>
            <div class="muted small">Événements limités à ce chapitre : {evs.length} {evs.length > 0 && <>— {evs.slice(0, 12).map((e) => <button type="button" key={e.id} class="ed-link" onClick={() => c.goto('evenements', e.id)}>{e.title ?? e.id}</button>)}{evs.length > 12 ? ' …' : ''}</>}</div>
            <IssueBox issues={issuesOf(c, 'chapitre', ch.id)} />
          </div>
        );
      }}
    </ListDetail>
  );
}

// ───────────────────────────── Création du personnage ──────────────────────

export function CreationSection({ c }: { c: EdCtx }) {
  const d = c.def;
  const cr = d.creation ?? {};
  const up = (patch: Partial<NonNullable<UniverseDef['creation']>>) => c.set((x) => ({ ...x, creation: { ...(x.creation ?? {}), ...patch } }));
  const iss = c.report?.issues.filter((i) => i.kind === 'creation') ?? [];
  return (
    <div class="ed-form">
      <p class="muted small">L'écran de création propose un prénom, l'apparence et des choix de départ (origine, poste, caractère…) qui appliquent leurs effets dès le début. Dans les scripts : <code>joueur.nom</code>, <code>{'joueur.<champ>'}</code>.</p>
      <div class="ed-grid">
        <F label="Libellé du prénom"><Txt value={cr.nameLabel} onChange={(v) => up({ nameLabel: opt(v) })} placeholder="Ton prénom" /></F>
        <F label="Prénom proposé"><Txt value={cr.defaultName} onChange={(v) => up({ defaultName: opt(v) })} /></F>
        <F label="Apparence" group><Check checked={cr.look !== false} onChange={(v) => up({ look: v ? undefined : false })} label="Le joueur personnalise son apparence" /></F>
      </div>
      <Fold title="Apparence de base du joueur" open>
        <LookEditor look={cr.baseLook ?? {}} onChange={(baseLook) => up({ baseLook })} resolve={c.resolveLook} />
      </Fold>
      <h3 class="ed-h">Choix de départ</h3>
      <Rows items={cr.fields} onChange={(v) => up({ fields: v })} addLabel="Choix de départ"
        create={() => ({ id: uniqueId('origine', (cr.fields ?? []).map((f) => f.id)), label: 'Ton origine', options: [{ id: 'option_a', label: 'Option A' }, { id: 'option_b', label: 'Option B' }] })}
        render={(f, setF) => (
          <div class="col">
            <div class="ed-grid tight">
              <F label="Identifiant" hint={`Lu avec joueur.${f.id}`}><Txt value={f.id} mono onChange={(v) => setF({ ...f, id: v.replace(/[^\w]/g, '') })} /></F>
              <F label="Question" span={2}><Txt value={f.label} onChange={(v) => setF({ ...f, label: v })} /></F>
            </div>
            <Rows<{ id: string; label: string; description?: string; effects?: string }> items={f.options} compact onChange={(v) => setF({ ...f, options: v ?? [] })} addLabel="Option" create={() => ({ id: uniqueId('option', f.options.map((o) => o.id)), label: 'Nouvelle option' })}
              render={(o, setO) => (
                <div class="ed-grid tight">
                  <F label="Identifiant"><Txt value={o.id} mono onChange={(v) => setO({ ...o, id: v.replace(/[^\w]/g, '') })} /></F>
                  <F label="Libellé"><Txt value={o.label} onChange={(v) => setO({ ...o, label: v })} /></F>
                  <F label="Description"><Txt value={o.description} onChange={(v) => setO({ ...o, description: opt(v) })} /></F>
                  <F label="Effets" span={3}><Code kind="fx" value={o.effects} onChange={(v) => setO({ ...o, effects: v })} placeholder="ex. stat.force += 10" /></F>
                </div>
              )} />
          </div>
        )} />
      <IssueBox issues={iss} />
    </div>
  );
}
