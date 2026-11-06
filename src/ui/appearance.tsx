// Éditeur d'apparence du joueur : utilisé à la création du personnage et dans
// la garde-robe en cours de partie. Toutes les options du moteur de sprites
// (corps, visage, coiffure, tenue, accessoires, couleurs libres) sont exposées.
import { useMemo, useState } from 'preact/hooks';
import type { Look } from '../core/model/types';
import {
  ACCESSORIES, BEARD_STYLES, BOTTOM_STYLES, HAIR_COLORS, HAIR_STYLES, NAMED_COLORS, SKINS, TOP_STYLES, col, lookLabel, randomLook,
} from '../engine/gfx/character';
import { EMOTIONS } from '../engine/gfx/portrait';
import { PortraitView, SpriteView } from './components';

const FACE_MARKS = ['taches', 'cicatrice', 'piercing'];
const WEARABLES = ACCESSORIES.filter((a) => !FACE_MARKS.includes(a));
const EYES: Record<string, string> = {
  brun: '#2b2230', noisette: '#6b4a2a', ambre: '#b07a2a', vert: '#2f7a4a', bleu: '#2f62c9', gris: '#6f7a88', violet: '#6a3fa8', rouge: '#a8323a',
};
const SHOES: Record<string, string> = { noir: '#2a2a33', blanc: '#eef0f4', marron: '#6e4a31', rouge: '#c8323a', bleu: '#2f62c9', or: '#e2b440' };
const PREVIEW_ANIMS: [string, string][] = [['marche', 'Marche'], ['idle', 'Immobile'], ['course', 'Course'], ['saluer', 'Salut'], ['joie', 'Joie'], ['parle', 'Parle'], ['montrer', 'Pointe']];
const EMO_LABELS: Record<string, string> = { neutre: 'Neutre', content: 'Content', rire: 'Rire', triste: 'Triste', colere: 'Colère', surpris: 'Surpris', inquiet: 'Inquiet', pensif: 'Pensif', fier: 'Fier' };

/** Aperçu animé (sprite + portrait) avec choix de l'animation et de l'émotion. */
export function LookPreview({ look, name, sub }: { look: Look; name?: string; sub?: string }) {
  const [anim, setAnim] = useState('marche');
  const [emo, setEmo] = useState('content');
  return (
    <div class="look-preview">
      <div class="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 18 }}>
        <SpriteView look={look} anim={anim} scale={5} />
        <div class="look-portrait"><PortraitView look={look} emo={emo} size={40} /></div>
      </div>
      {name !== undefined && <div style={{ fontSize: 22, fontWeight: 700 }}>{name || '…'}</div>}
      {sub && <div class="muted" style={{ textAlign: 'center' }}>{sub}</div>}
      <div class="look-chips" role="group" aria-label="Animation de l'aperçu">
        {PREVIEW_ANIMS.map(([k, l]) => <button type="button" key={k} class={`chip ${anim === k ? 'on' : ''}`} onClick={() => setAnim(k)}>{l}</button>)}
      </div>
      <div class="look-chips" role="group" aria-label="Expression du portrait">
        {EMOTIONS.map((e) => <button type="button" key={e} class={`chip ${emo === e ? 'on' : ''}`} onClick={() => setEmo(e)}>{EMO_LABELS[e] ?? e}</button>)}
      </div>
    </div>
  );
}

function Palette({ value, palette, onChange, label, allowNone }: { value: string | undefined; palette: Record<string, string>; onChange: (v: string | undefined) => void; label: string; allowNone?: string }) {
  const resolved = value ? col(value, '#000000', palette) : '';
  const known = !value || Object.keys(palette).includes(value) || Object.values(palette).includes(value);
  const hex = /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : '#808080';
  return (
    <div class="field">{label}
      <div class="swatches">
        {allowNone && <button type="button" class={`swatch none ${!value ? 'on' : ''}`} aria-label={allowNone} title={allowNone} onClick={() => onChange(undefined)}>∅</button>}
        {Object.entries(palette).map(([k, v]) => (
          <button type="button" key={k} class={`swatch ${value === k || value === v ? 'on' : ''}`} style={{ background: v }} aria-label={`${label} : ${k}`} title={k} onClick={() => onChange(k in SKINS || k in HAIR_COLORS || k in NAMED_COLORS ? k : v)} />
        ))}
        <label class={`swatch custom ${!known ? 'on' : ''}`} title="Couleur libre" style={{ background: !known ? hex : undefined }}>
          <input type="color" value={hex} aria-label={`${label} : couleur libre`} onInput={(e) => onChange((e.target as HTMLInputElement).value)} />
          <span aria-hidden="true">+</span>
        </label>
      </div>
    </div>
  );
}

function Choice({ label, options, value, onChange }: { label: string; options: string[]; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div class="field">{label}
      <div class="look-chips">
        {options.map((o) => <button type="button" key={o} class={`chip ${(value ?? '') === o ? 'on' : ''}`} aria-pressed={(value ?? '') === o} onClick={() => onChange(o)}>{lookLabel(o)}</button>)}
      </div>
    </div>
  );
}

function Toggles({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const set = new Set(value);
  return (
    <div class="field">{label}
      <div class="look-chips">
        {options.map((o) => (
          <button type="button" key={o} class={`chip ${set.has(o) ? 'on' : ''}`} aria-pressed={set.has(o)}
            onClick={() => { const n = new Set(set); if (n.has(o)) n.delete(o); else n.add(o); onChange([...n]); }}>{lookLabel(o)}</button>
        ))}
      </div>
    </div>
  );
}

const TABS: [string, string][] = [['corps', 'Corps'], ['visage', 'Visage'], ['cheveux', 'Cheveux'], ['tenue', 'Tenue'], ['acc', 'Accessoires']];

/** Contrôles d'apparence (sans aperçu). */
export function AppearanceEditor({ look, onChange, base }: { look: Look; onChange: (l: Look) => void; base?: Look }) {
  const [tab, setTab] = useState('corps');
  const up = (patch: Partial<Look>) => {
    const n: Look = { ...look, ...patch };
    for (const k of Object.keys(n) as (keyof Look)[]) if (n[k] === undefined) delete n[k];
    onChange(n);
  };
  const acc = look.acc ?? [];
  const marks = acc.filter((a) => FACE_MARKS.includes(a));
  const worn = acc.filter((a) => !FACE_MARKS.includes(a));
  return (
    <div class="appearance">
      <div class="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <div class="tabs" role="tablist" aria-label="Apparence">
          {TABS.map(([k, l]) => <button type="button" role="tab" key={k} aria-selected={tab === k} class={`pbtn small ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <span class="grow" />
        <button type="button" class="pbtn small" onClick={() => onChange({ ...randomLook(Math.floor(Math.random() * 1e9), { gender: look.gender }), ...(look.gender ? { gender: look.gender } : {}) })}>Au hasard</button>
        {base && <button type="button" class="pbtn small ghost" onClick={() => onChange({ ...base })}>Réinitialiser</button>}
      </div>
      <div class="col" style={{ gap: 14 }} role="tabpanel">
        {tab === 'corps' && (
          <>
            <Choice label="Genre (accords du texte, silhouette)" options={['h', 'f']} value={look.gender ?? 'h'} onChange={(v) => up({ gender: v as Look['gender'] })} />
            <Choice label="Corpulence" options={['mince', 'normal', 'costaud']} value={look.build ?? 'normal'} onChange={(v) => up({ build: v as Look['build'] })} />
            <Choice label="Taille" options={['petit', 'normal', 'grand', 'enfant']} value={look.height ?? 'normal'} onChange={(v) => up({ height: v as Look['height'] })} />
            <Palette label="Teint" palette={SKINS} value={look.skin} onChange={(v) => up({ skin: v })} />
          </>
        )}
        {tab === 'visage' && (
          <>
            <Palette label="Yeux" palette={EYES} value={look.eyes} onChange={(v) => up({ eyes: v })} />
            <Choice label="Pilosité" options={BEARD_STYLES} value={look.beard ?? ''} onChange={(v) => up({ beard: v })} />
            <Toggles label="Signes particuliers" options={FACE_MARKS} value={marks} onChange={(v) => up({ acc: [...worn, ...v] })} />
          </>
        )}
        {tab === 'cheveux' && (
          <>
            <Choice label="Coiffure" options={HAIR_STYLES} value={look.hair ?? 'court'} onChange={(v) => up({ hair: v })} />
            <Palette label="Couleur" palette={HAIR_COLORS} value={look.hairColor} onChange={(v) => up({ hairColor: v })} />
          </>
        )}
        {tab === 'tenue' && (
          <>
            <Choice label="Haut" options={TOP_STYLES} value={look.top ?? 'tshirt'} onChange={(v) => up({ top: v })} />
            <Palette label="Couleur du haut" palette={NAMED_COLORS} value={look.topColor} onChange={(v) => up({ topColor: v })} />
            <Palette label="Couleur secondaire (bandes, col, liserés)" palette={NAMED_COLORS} value={look.topColor2} onChange={(v) => up({ topColor2: v })} />
            <Choice label="Bas" options={BOTTOM_STYLES} value={look.bottom ?? 'jean'} onChange={(v) => up({ bottom: v })} />
            <Palette label="Couleur du bas" palette={NAMED_COLORS} value={look.bottomColor} onChange={(v) => up({ bottomColor: v })} />
            <Palette label="Chaussures" palette={SHOES} value={look.shoes} onChange={(v) => up({ shoes: v })} />
            <Palette label="Chaussettes" palette={NAMED_COLORS} value={look.socks} allowNone="Sans chaussettes visibles" onChange={(v) => up({ socks: v })} />
          </>
        )}
        {tab === 'acc' && (
          <>
            <Toggles label="Accessoires" options={WEARABLES} value={worn} onChange={(v) => up({ acc: [...v, ...marks] })} />
            <Palette label="Couleur des accessoires (chapeau, écharpe, cape, casque, sac)" palette={NAMED_COLORS} value={look.accColor} allowNone="Automatique" onChange={(v) => up({ accColor: v })} />
          </>
        )}
      </div>
    </div>
  );
}

/** Aperçu + éditeur côte à côte (garde-robe). */
export function Wardrobe({ look, resolve, onSave, onCancel, base, note }: { look: Look; resolve: (l: Look) => Look; onSave: (l: Look) => void; onCancel: () => void; base?: Look; note?: string }) {
  const [draft, setDraft] = useState<Look>({ ...look });
  const shown = useMemo(() => resolve(draft), [JSON.stringify(draft), resolve]);
  return (
    <div class="wardrobe">
      <div class="pbox wardrobe-preview"><LookPreview look={shown} /></div>
      <div class="col" style={{ gap: 14 }}>
        <AppearanceEditor look={draft} onChange={setDraft} base={base ?? look} />
        {note && <p class="muted small" style={{ margin: 0 }}>{note}</p>}
        <div class="row">
          <button type="button" class="pbtn primary" onClick={() => onSave(draft)}>Valider ce look</button>
          <button type="button" class="pbtn" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
