// Panneaux de jeu : journal des décisions, personnage, relations, plan,
// sauvegardes, menu/options et débogage (mode test de l'éditeur).
import { useEffect, useState } from 'preact/hooks';
import type { GameController, Panel } from '../../game/controller';
import { deleteSave, listSaves, parseSaveFile, readSave, writeSaveFile, type SaveMeta } from '../../game/saves';
import { offerDownload, pickTextFile } from '../../platform/storage';
import { audio } from '../../engine/audio';
import { toStr } from '../../core/expr/expr';
import { Meter, PanelShell, PortraitView, fmtStat, fmtTime } from '../components';

export function Panels({ c, panel }: { c: GameController; panel: Panel }) {
  const close = () => c.closePanel();
  switch (panel) {
    case 'journal': return <PanelShell title="Journal" onClose={close}><Journal c={c} /></PanelShell>;
    case 'stats': return <PanelShell title="Personnage" onClose={close}><Stats c={c} /></PanelShell>;
    case 'relations': return <PanelShell title="Relations" onClose={close} wide><Relations c={c} /></PanelShell>;
    case 'map': return <PanelShell title="Plan" onClose={close}><MapPanel c={c} /></PanelShell>;
    case 'saves': return <PanelShell title="Sauvegardes" onClose={close}><Saves c={c} /></PanelShell>;
    case 'options': return <PanelShell title="Options" onClose={close}><Options c={c} /></PanelShell>;
    case 'debug': return <PanelShell title="Débogage (mode test)" onClose={close} wide><Debug c={c} /></PanelShell>;
    case 'menu': return <PanelShell title="Pause" onClose={close}><Menu c={c} /></PanelShell>;
  }
  return null;
}

function Journal({ c }: { c: GameController }) {
  const [tab, setTab] = useState<'decisions' | 'actus' | 'objectifs'>('decisions');
  const s = c.g.s;
  const objectives = Object.entries(s.objectives);
  return (
    <div>
      <div class="tabs">
        <button class={`pbtn small ${tab === 'decisions' ? 'on' : ''}`} onClick={() => setTab('decisions')}>Décisions ({s.history.length})</button>
        <button class={`pbtn small ${tab === 'actus' ? 'on' : ''}`} onClick={() => setTab('actus')}>Événements</button>
        <button class={`pbtn small ${tab === 'objectifs' ? 'on' : ''}`} onClick={() => setTab('objectifs')}>Objectifs ({objectives.filter(([, o]) => o.status === 'actif').length})</button>
      </div>
      {tab === 'decisions' && (
        <div class="list">
          {s.history.length === 0 && <p class="muted">Aucune décision pour l'instant. Chaque choix important sera noté ici, avec ses conséquences.</p>}
          {[...s.history].reverse().slice(0, 150).map((d, i) => (
            <div key={i} class={`item ${d.key ? 'key' : ''}`}>
              <div class="meta">CH. {d.ch} · SEMAINE {d.wk} · {d.title.toUpperCase()}{d.key ? ' · DÉCISION CLÉ' : ''}</div>
              <div>{d.choice}</div>
              {d.fx.length > 0 && <div class="fx">{d.fx.join(' · ')}</div>}
            </div>
          ))}
        </div>
      )}
      {tab === 'actus' && (
        <div class="entries">
          {s.journal.length === 0 && <p class="muted">Rien à signaler pour l'instant.</p>}
          {[...s.journal].reverse().slice(0, 200).map((e, i) => <div key={i} class={`e k-${e.kind}`}><span class="label">Ch.{e.ch} S{e.wk}</span> {e.text}</div>)}
        </div>
      )}
      {tab === 'objectifs' && (
        <div class="list">
          {objectives.length === 0 && <p class="muted">Aucun objectif.</p>}
          {objectives.sort((a, b) => (a[1].status === 'actif' ? -1 : 1) - (b[1].status === 'actif' ? -1 : 1)).map(([id, o]) => (
            <div key={id} class="item"><span class={`badge ${o.status === 'reussi' ? 't-heureuse' : o.status === 'echoue' ? 't-tragique' : 't-neutre'}`}>{o.status === 'actif' ? 'En cours' : o.status === 'reussi' ? 'Atteint' : 'Manqué'}</span> {o.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stats({ c }: { c: GameController }) {
  const g = c.g;
  const def = c.u.def;
  const cats = new Map<string, typeof def.stats>();
  for (const st of def.stats) { if (st.visible === false) continue; const k = st.category ?? 'Général'; if (!cats.has(k)) cats.set(k, []); cats.get(k)!.push(st); }
  const catLabel: Record<string, string> = { competence: 'Compétences', etat: 'État', carriere: 'Carrière', social: 'Social' };
  const fields = def.creation?.fields ?? [];
  return (
    <div class="col" style={{ gap: 16 }}>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 96, height: 96, background: '#0e1018' }}><PortraitView look={c.playerLook(c.world.loc ?? undefined)} emo="fier" size={40} /></div>
        <div class="col" style={{ gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{toStr(g.s.player.nom)}</div>
          <div class="muted">{fields.map((f) => f.options.find((o) => o.id === g.s.player[f.id])?.label).filter(Boolean).join(' · ')}</div>
          <div class="muted">{g.chapter.def.title} — {c.u.def.config?.tickLabel ?? 'Semaine'} {g.s.time.week} · temps de jeu {fmtTime(g.s.playtime)}</div>
        </div>
      </div>
      {[...cats.entries()].map(([cat, list]) => (
        <div key={cat}>
          <div class="label" style={{ marginBottom: 6 }}>{catLabel[cat] ?? cat}</div>
          <div class="stat-grid">
            {list.map((st) => (
              <div class="stat-row" key={st.id} title={st.description}>
                <div class="top"><span>{st.label}</span><b>{fmtStat(g.s.stats[st.id] ?? 0, st.format)}</b></div>
                {st.format !== 'argent' && <Meter value={g.s.stats[st.id] ?? 0} max={st.max ?? 100} color={st.color} />}
              </div>
            ))}
          </div>
        </div>
      ))}
      {(def.sheet ?? []).map((sec) => (
        <div key={sec.title}>
          <div class="label" style={{ marginBottom: 6 }}>{sec.title}</div>
          <div class="delta-list">{sec.rows.filter((r) => g.testSrc(r.when)).map((r) => <div key={r.label}><span class="muted">{r.label} :</span> {g.render(r.value)}</div>)}</div>
        </div>
      ))}
    </div>
  );
}

function Relations({ c }: { c: GameController }) {
  const g = c.g;
  const chars = c.u.def.characters.filter((ch) => g.s.met[ch.id] || (!ch.hidden && g.s.rel[ch.id] !== (ch.relation ?? 0)));
  if (!chars.length) return <p class="muted">Tu n'as encore rencontré personne. Parle aux gens autour de toi.</p>;
  const traitLabel = (id: string) => c.u.traits.get(id)?.label ?? id;
  return (
    <div class="list">
      {chars.map((ch) => {
        const v = g.s.rel[ch.id] ?? 0;
        const lvl = g.relationLevel(v);
        const mems = Object.values(g.s.mem[ch.id] ?? {});
        return (
          <div class="rel-card" key={ch.id}>
            <PortraitView look={c.charLook(ch.id) ?? {}} emo={v >= 25 ? 'content' : v <= -25 ? 'colere' : 'neutre'} />
            <div class="grow">
              <div class="row" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{g.charName(ch.id)}</b><span class="muted">{ch.role ? g.render(ch.role) : ''}</span><span class="badge" style={{ color: lvl.color }}>{lvl.label}</span></div>
              <div class="rel-bar" title={`${ch.relationLabel ?? 'Relation'} : ${v}`}>
                <i style={{ left: v >= 0 ? '50%' : `${50 + v / 2}%`, width: `${Math.abs(v) / 2}%`, background: lvl.color ?? 'var(--accent)' }} />
              </div>
              <div class="muted" style={{ fontSize: 13 }}>{ch.relationLabel ?? 'Relation'} : {v > 0 ? '+' : ''}{v}</div>
              {ch.description && <div style={{ fontSize: 14, marginTop: 4 }}>{g.render(ch.description)}</div>}
              <div>{(ch.traits ?? []).map((t) => <span key={t} class="tag" title={c.u.traits.get(t)?.description}>{traitLabel(t)}</span>)}</div>
              {ch.goals && <div class="muted" style={{ fontSize: 13, marginTop: 4 }}>Ce qui compte pour {g.firstName(ch.id)} : {g.render(ch.goals)}</div>}
              {mems.map((m, i) => <div key={i} class="mem">⟲ Se souvient : {m.text} <span class="muted">(ch. {m.ch}, sem. {m.wk})</span></div>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MapPanel({ c }: { c: GameController }) {
  const g = c.g;
  const locs = c.u.def.locations.filter((l) => g.locationAvailable(l.id));
  const groups = new Map<string, typeof locs>();
  for (const l of locs) { const k = l.group ? g.render(l.group) : 'Lieux'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); }
  const busy = c.busy || c.ui.get().mode !== 'hub';
  return (
    <div class="col">
      <p class="muted" style={{ margin: 0 }}>Se déplacer ne coûte pas d'action. <span class="dot-new">!</span> indique une histoire qui t'attend.</p>
      {[...groups.entries()].map(([grp, list]) => (
        <div key={grp}>
          <div class="label" style={{ marginBottom: 6 }}>{grp}</div>
          <div class="map-grid">
            {list.map((l) => {
              const story = g.hasEligible(`enter:${l.id}`, true) || (l.npcs ?? []).some((n) => g.testSrc(n.when) && g.hasEligible(`talk:${n.id}`, true)) || (l.hotspots ?? []).some((h) => g.testSrc(h.when) && g.hasEligible(`hotspot:${h.id}`, true));
              const here = g.s.location === l.id;
              return (
                <button key={l.id} class="pbtn" disabled={here || busy} onClick={() => { c.closePanel(); void c.travel(l.id); }}>
                  <span>{g.render(l.name)}{here ? ' (ici)' : ''}</span>{story && <span class="dot-new">!</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Saves({ c }: { c: GameController }) {
  const [metas, setMetas] = useState<SaveMeta[] | null>(null);
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const refresh = () => listSaves().then(setMetas).catch(() => setMetas([]));
  useEffect(() => { void refresh(); }, []);
  const canSave = c.canSave() || c.ui.get().panel === 'saves';
  const save = async (slot: string) => { await c.save(slot); audio.play('confirm'); setMsg(`Partie sauvegardée dans l'emplacement ${slot}.`); void refresh(); };
  const exportSlot = async (slot: string) => {
    const f = await readSave(slot);
    if (!f) return;
    const r = await offerDownload(`mille-vies-${f.meta.universe}-${f.meta.player}-${slot}.json`, JSON.stringify(f));
    setMsg(r === 'ok' ? 'Fichier de sauvegarde proposé au téléchargement.' : r === 'refuse' ? 'Téléchargement annulé.' : 'Téléchargement indisponible ici.');
  };
  const importFile = async (slot: string) => {
    const text = await pickTextFile();
    if (!text) return;
    const f = parseSaveFile(text);
    if (!f) { setMsg('Ce fichier n\'est pas une sauvegarde Mille Vies valide.'); return; }
    await writeSaveFile(slot, f);
    setMsg(`Sauvegarde importée dans l'emplacement ${slot}. Charge-la depuis le menu principal.`);
    void refresh();
  };
  return (
    <div class="col">
      {msg && <div class="item">{msg}</div>}
      <div class="slots">
        {['1', '2', '3', '4', '5', '6'].map((slot) => {
          const m = metas?.find((x) => x.slot === slot);
          return (
            <div class="slot" key={slot}>
              <div class="info">
                <div class="label">Emplacement {slot}</div>
                {m ? <div>{m.player} — {m.universeName} · {m.chapter}, sem. {m.week} <span class="muted">· {new Date(m.updated).toLocaleString('fr-FR')}</span></div> : <div class="muted">Vide</div>}
              </div>
              <button class="pbtn small primary" disabled={!canSave} onClick={() => save(slot)}>Sauvegarder ici</button>
              {m && <button class="pbtn small" onClick={() => exportSlot(slot)}>Exporter</button>}
              <button class="pbtn small" onClick={() => importFile(slot)}>Importer</button>
              {m && (confirmDel === slot
                ? <button class="pbtn small danger" onClick={async () => { await deleteSave(slot); setConfirmDel(null); void refresh(); }}>Confirmer la suppression</button>
                : <button class="pbtn small ghost" onClick={() => setConfirmDel(slot)}>Supprimer</button>)}
            </div>
          );
        })}
      </div>
      <p class="muted" style={{ fontSize: 13 }}>Une sauvegarde automatique est faite au début de chaque semaine. Pour charger une partie, passe par le menu principal.</p>
    </div>
  );
}

export function OptionsForm({ settings, onChange }: { settings: import('../../game/saves').Settings; onChange: (s: import('../../game/saves').Settings) => void }) {
  return (
    <div class="col" style={{ gap: 14 }}>
      <label class="field">Vitesse du texte : {settings.textSpeed}×
        <input type="range" min="0.5" max="3" step="0.5" value={settings.textSpeed} onInput={(e) => onChange({ ...settings, textSpeed: Number((e.target as HTMLInputElement).value) })} />
      </label>
      <label class="field">Volume : {Math.round(settings.volume * 100)} %
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); audio.setVolume(v); onChange({ ...settings, volume: v }); }} />
      </label>
      <label class="row"><input type="checkbox" checked={settings.muted} onChange={(e) => { const m = (e.target as HTMLInputElement).checked; audio.setMuted(m); onChange({ ...settings, muted: m }); }} /> Couper le son</label>
      <label class="row"><input type="checkbox" checked={settings.showValues} onChange={(e) => onChange({ ...settings, showValues: (e.target as HTMLInputElement).checked })} /> Afficher les valeurs exactes des conséquences</label>
    </div>
  );
}

function Options({ c }: { c: GameController }) {
  const [s, setS] = useState(c.opts.settings);
  const change = (n: typeof s) => { setS(n); c.opts.settings = n; c.u.def.config = { ...(c.u.def.config ?? {}), showValues: n.showValues }; c.opts.onSettings?.(n); };
  return <OptionsForm settings={s} onChange={change} />;
}

function Menu({ c }: { c: GameController }) {
  const [confirmQuit, setConfirmQuit] = useState(false);
  const inHub = c.canSave();
  return (
    <div class="col" style={{ maxWidth: 380 }}>
      <button class="pbtn primary" onClick={() => c.closePanel()}>Reprendre</button>
      <button class="pbtn" disabled={!inHub} onClick={() => c.ui.set({ panel: 'saves' })}>Sauvegarder / exporter{!inHub ? ' (après la scène)' : ''}</button>
      <button class="pbtn" onClick={() => c.ui.set({ panel: 'options' })}>Options</button>
      <button class="pbtn" onClick={() => c.ui.set({ panel: 'journal' })}>Journal</button>
      {c.opts.test && <button class="pbtn" onClick={() => c.ui.set({ panel: 'debug' })}>Débogage</button>}
      {!confirmQuit
        ? <button class="pbtn ghost" onClick={() => setConfirmQuit(true)}>{c.opts.test ? 'Retour à l\'éditeur' : 'Quitter vers le menu'}</button>
        : <div class="item col"><span>La progression depuis la dernière sauvegarde sera perdue{c.opts.test ? '' : ' (sauvegarde auto en début de semaine)'}.</span><div class="row"><button class="pbtn danger" onClick={() => c.opts.onExit()}>Quitter</button><button class="pbtn" onClick={() => setConfirmQuit(false)}>Rester</button></div></div>}
      <div class="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        Clavier : <span class="kbd">←</span> <span class="kbd">→</span> se déplacer (<span class="kbd">Maj</span> pour courir), <span class="kbd">E</span> interagir, <span class="kbd">Espace</span> continuer, <span class="kbd">1</span>–<span class="kbd">9</span> choisir, <span class="kbd">J</span> journal, <span class="kbd">C</span> personnage, <span class="kbd">R</span> relations, <span class="kbd">M</span> plan. Souris ou toucher : clique pour te déplacer et interagir.
      </div>
    </div>
  );
}

function Debug({ c }: { c: GameController }) {
  const g = c.g;
  const [, force] = useState(0);
  const [filter, setFilter] = useState('');
  const setStat = (id: string, v: number) => { g.s.stats[id] = v; force((n) => n + 1); };
  const setRel = (id: string, v: number) => { g.s.rel[id] = v; force((n) => n + 1); };
  const setVar = (id: string, raw: string) => { const n = Number(raw); g.s.vars[id] = raw === 'vrai' || raw === 'true' ? true : raw === 'faux' || raw === 'false' ? false : raw !== '' && !Number.isNaN(n) ? n : raw; force((x) => x + 1); };
  const events = [...c.u.events.values()].filter((e) => !filter || e.def.id.includes(filter) || (e.def.title ?? '').toLowerCase().includes(filter.toLowerCase()));
  return (
    <div class="col" style={{ gap: 14 }}>
      <div class="row">
        <button class="pbtn small" onClick={() => c.debugEndWeek()}>Finir la semaine</button>
        <button class="pbtn small" onClick={() => c.debugNextChapter()}>Chapitre suivant</button>
        <button class="pbtn small" onClick={() => { g.s.actions = (c.u.def.config?.actionsPerTick ?? 3); force((n) => n + 1); }}>Recharger les actions</button>
        <span class="muted">Ch. {g.s.time.chapter + 1} · sem. {g.s.time.week} · lieu {g.s.location} · tick {g.s.time.tick}</span>
      </div>
      {g.issues.length > 0 && <div class="err-box">{g.issues.slice(-8).map((i, k) => <div key={k}>{i.where} : {i.msg}</div>)}</div>}
      <div class="stat-grid">
        {c.u.def.stats.map((st) => <label key={st.id} class="field">{st.label} <input type="number" value={g.s.stats[st.id] ?? 0} onChange={(e) => setStat(st.id, Number((e.target as HTMLInputElement).value))} /></label>)}
      </div>
      <div class="label">Relations</div>
      <div class="stat-grid">
        {c.u.def.characters.map((ch) => <label key={ch.id} class="field">{ch.name} <input type="number" min="-100" max="100" value={g.s.rel[ch.id] ?? 0} onChange={(e) => setRel(ch.id, Number((e.target as HTMLInputElement).value))} /></label>)}
      </div>
      <div class="label">Variables</div>
      <div class="stat-grid">
        {Object.entries(g.s.vars).filter(([k]) => !k.startsWith('__')).map(([k, v]) => <label key={k} class="field">{k} <input type="text" value={String(v)} onChange={(e) => setVar(k, (e.target as HTMLInputElement).value)} /></label>)}
      </div>
      <div class="label">Déclencher un événement</div>
      <input class="txt" placeholder="Filtrer…" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      <div class="map-grid">
        {events.slice(0, 80).map((e) => <button key={e.def.id} class="pbtn small" onClick={() => c.debugFire(e.def.id)} title={e.def.trigger}>{e.def.title ?? e.def.id}<span class="muted">{g.s.fired[e.def.id]?.n ? ` ×${g.s.fired[e.def.id].n}` : ''}</span></button>)}
      </div>
      {g.s.scheduled.length > 0 && <div class="muted">Planifiés : {g.s.scheduled.map((x) => `${x.event} (tick ${x.due})`).join(', ')}</div>}
    </div>
  );
}
