// Écran de jeu : canvas du monde + couches d'interface (HUD, dialogues, choix,
// notifications, bilans, chapitres, fin, panneaux).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameController, LineView } from '../../game/controller';
import { audio } from '../../engine/audio';
import { useStore } from '../store';
import { Meter, PortraitView, fmtStat } from '../components';
import { Panels } from './panels';

function rich(text: string) {
  const parts = text.split('**');
  return parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));
}

function Typewriter({ c, line, speed }: { c: GameController; line: LineView; speed: number }) {
  const [n, setN] = useState(0);
  const text = line.text;
  useEffect(() => {
    setN(0);
    c.typing = true;
    let i = 0;
    const voice = line.who ? c.u.chars.get(line.who)?.voice ?? (line.who === 'moi' ? 1.15 : 1) : 0.8;
    const step = Math.max(8, 26 / speed);
    const timer = setInterval(() => {
      i += 1;
      setN(i);
      if (i % 2 === 0 && text[i] && text[i] !== ' ') audio.blip(voice);
      if (i >= text.length) { clearInterval(timer); c.typing = false; c.skipTyping = null; }
    }, step);
    c.skipTyping = () => { clearInterval(timer); setN(text.length); c.typing = false; c.skipTyping = null; };
    return () => { clearInterval(timer); c.typing = false; c.skipTyping = null; };
  }, [text, line.who]);
  const done = n >= text.length;
  const shown = done ? text : text.slice(0, n);
  return (<><div class="text">{rich(shown)}</div>{done && <span class="next" aria-hidden="true" />}</>);
}

export function GameScreen({ c }: { c: GameController }) {
  const ui = useStore(c.ui);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const g = c.g;

  useEffect(() => {
    if (!frameRef.current || !stageRef.current) return;
    c.mount(frameRef.current, stageRef.current);
    void c.start();
    return () => c.destroy();
  }, [c]);

  const cfg = c.u.def.config ?? {};
  const maxActions = cfg.actionsPerTick ?? 3;
  const hudStats = (cfg.hud ?? []).map((id) => c.u.stats.get(id)).filter(Boolean);
  const showHud = ui.mode !== 'chapter' && ui.mode !== 'ending' && ui.mode !== 'loading' && ui.mode !== 'line' && ui.mode !== 'choices';
  const lastLine = ui.line;

  return (
    <div class="game-shell" onPointerDown={() => audio.unlock()}>
      <div class="stage" ref={stageRef}>
        <div class="frame" ref={frameRef}>
          <div class="ui-layer">
            {showHud && (
              <div class="hud">
                <div class="hud-date">
                  <div><b>{g.chapter.def.title}</b> · {cfg.tickLabel ?? 'Semaine'} {g.s.time.week}/{g.chapter.def.weeks}</div>
                  <div class="loc">{ui.locationName}{cfg.dateLine ? ` · ${g.render(cfg.dateLine)}` : ''}</div>
                </div>
                <div class="hud-right">
                  <div class="hud-btns" role="toolbar" aria-label="Menus">
                    <button onClick={() => c.openPanel('journal')} title="Journal (J)">JOURNAL</button>
                    <button onClick={() => c.openPanel('stats')} title="Personnage (C)">PERSO</button>
                    <button onClick={() => c.openPanel('relations')} title="Relations (R)">LIENS</button>
                    <button onClick={() => c.openPanel('map')} title="Plan (M)">PLAN</button>
                    <button onClick={() => c.openPanel('menu')} title="Menu (Échap)">MENU</button>
                  </div>
                  {hudStats.length > 0 && (
                    <div class="hud-stats">
                      {hudStats.map((st) => (
                        <div class="hud-stat" key={st!.id}>
                          <span class="label">{st!.short ?? st!.label}<b>{fmtStat(g.s.stats[st!.id] ?? 0, st!.format)}</b></span>
                          {st!.format !== 'argent' && <Meter value={g.s.stats[st!.id] ?? 0} max={st!.max ?? 100} color={st!.color} />}
                        </div>
                      ))}
                    </div>
                  )}
                  <div class="pips" title={cfg.actionsLabel ?? 'Actions'}>
                    {(cfg.actionsLabel ?? 'Actions').toUpperCase()}&nbsp;
                    {Array.from({ length: maxActions }, (_, i) => <i key={i} class={i < g.s.actions ? '' : 'off'} />)}
                  </div>
                </div>
              </div>
            )}

            <div class="toasts" aria-live="polite">
              {ui.toasts.map((t) => <div key={t.id} class={`toast k-${t.kind} ${t.good === false ? 'bad' : 'good'}`}>{t.kind === 'mem' ? '⟲ ' : ''}{t.text}</div>)}
            </div>

            {ui.mode === 'hub' && ui.prompt && !ui.hotspot && !ui.panel && (
              <div class="prompt" onClick={() => ui.prompt && c.interact(ui.prompt)}>
                <span class="kbd">E</span>
                {ui.prompt.kind === 'npc' ? `Parler à ${ui.prompt.label}` : ui.prompt.kind === 'exit' ? `Aller : ${ui.prompt.label}` : ui.prompt.label}
              </div>
            )}

            {ui.hotspot && (
              <div class="hotspot-menu pbox">
                <h3>{ui.hotspot.title}</h3>
                {ui.hotspot.options.map((o, i) => (
                  <button key={o.id + i} class={`pbtn ${o.kind === 'end' ? 'primary' : ''}`} disabled={!o.enabled && o.kind !== 'activity'} aria-disabled={!o.enabled} onClick={() => c.chooseHotspot(o)} style={!o.enabled ? { opacity: 0.55 } : undefined}>
                    <span class="kbd">{i + 1}</span> {o.label}
                    {(o.description || o.cost) && <span class="opt-meta">{[o.cost, o.description].filter(Boolean).join(' — ')}</span>}
                    {!o.enabled && o.reason && <span class="opt-meta bad">🔒 {o.reason}</span>}
                  </button>
                ))}
                <button class="pbtn ghost small" onClick={() => c.ui.set({ hotspot: null })}>Annuler <span class="kbd">Échap</span></button>
              </div>
            )}

            {(ui.mode === 'line' || ui.mode === 'choices') && (
              <div class="talk">
                {ui.mode === 'line' && lastLine && (
                  <div class={`dialog pbox ${lastLine.who ? '' : 'narration'}`} onClick={() => c.advance()}>
                    {lastLine.look && <div class="portrait"><PortraitView look={lastLine.look} emo={lastLine.emo} /></div>}
                    <div class="body">
                      {lastLine.who && <div class="name" style={{ color: lastLine.color }}>{lastLine.name}{lastLine.who !== 'moi' && c.u.chars.get(lastLine.who)?.role && <span class="role">{g.render(c.u.chars.get(lastLine.who)!.role!)}</span>}</div>}
                      <Typewriter c={c} line={lastLine} speed={c.opts.settings.textSpeed} />
                    </div>
                  </div>
                )}
                {ui.mode === 'choices' && ui.choices && (
                  <div class="choices pbox" role="listbox" aria-label="Choix">
                    {ui.choices.map((ch, i) => (
                      <button key={ch.index} class="pbtn choice" disabled={!ch.enabled} onClick={() => c.choose(ch.index)}>
                        <span class="n">{i + 1}</span>
                        <span class="t">{rich(ch.text)}{!ch.enabled && ch.reason && <span class="lock">🔒 {ch.reason}</span>}</span>
                        {ch.odds !== undefined && <span class={`odds ${ch.odds >= 65 ? 'hi' : ch.odds >= 40 ? 'mid' : 'lo'}`}>{ch.odds} %</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ui.echo && (
              <div class="echo" onClick={() => c.advance()} role="status">
                <div class="label">⟲ Une décision passée ressurgit</div>
                <p>{ui.echo}</p>
              </div>
            )}

            {ui.title && <div class="big-title"><span>{ui.title}</span></div>}

            {ui.summary && (
              <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) c.advance(); }}>
                <div class="summary pbox">
                  <div class="label">Bilan · {ui.summary.chapterTitle}</div>
                  <h2>{cfg.tickLabel ?? 'Semaine'} {ui.summary.wk} terminée</h2>
                  {ui.summary.stats.length > 0 ? (
                    <div class="delta-list">
                      {ui.summary.stats.map((s) => (
                        <div key={s.id} class={s.delta > 0 ? 'up' : 'down'}>{s.delta > 0 ? '▲' : '▼'} {s.label} {s.delta > 0 ? '+' : '−'}{fmtStat(Math.abs(s.delta), s.format)} <span class="muted">({fmtStat(s.value, s.format)})</span></div>
                      ))}
                    </div>
                  ) : <p class="muted">Une semaine sans grand changement.</p>}
                  {ui.summary.rels.length > 0 && (
                    <div class="delta-list">
                      {ui.summary.rels.map((r) => <div key={r.id} class={r.delta > 0 ? 'up' : 'down'}>{r.delta > 0 ? '♥' : '♡'} {r.name} {r.delta > 0 ? '+' : '−'}{Math.abs(r.delta)}</div>)}
                    </div>
                  )}
                  {ui.summary.entries.length > 0 && (
                    <div class="entries">{ui.summary.entries.slice(-8).map((e, i) => <div key={i} class={`e k-${e.kind}`}>{e.text}</div>)}</div>
                  )}
                  <button class="pbtn primary" onClick={() => c.advance()} autoFocus>Continuer <span class="kbd">Espace</span></button>
                </div>
              </div>
            )}

            {ui.chapter && (
              <div class="chapter-card" onClick={() => c.advance()}>
                <div>
                  <div class="label">Chapitre {ui.chapter.index + 1}</div>
                  <h1>{ui.chapter.title}</h1>
                  {ui.chapter.subtitle && <p>{ui.chapter.subtitle}</p>}
                  {ui.chapter.intro && <p>{ui.chapter.intro}</p>}
                </div>
              </div>
            )}

            {ui.confirm && (
              <div class="overlay">
                <div class="confirm pbox" role="alertdialog">
                  <div>{ui.confirm.text}</div>
                  <div class="row">
                    <button class="pbtn primary" onClick={() => ui.confirm!.resolve(true)}>{ui.confirm.yes}</button>
                    <button class="pbtn" onClick={() => ui.confirm!.resolve(false)}>{ui.confirm.no}</button>
                  </div>
                </div>
              </div>
            )}

            {ui.error && (
              <div class="overlay">
                <div class="confirm pbox">
                  <div class="label">Erreur de script</div>
                  <div class="err-box">{ui.error}</div>
                  <div class="muted">La partie continue depuis le monde. Si tu testes un univers, corrige le script dans l'éditeur.</div>
                  <button class="pbtn" onClick={() => c.ui.set({ error: null })}>Continuer</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {ui.mode === 'ending' && ui.ending && <EndingScreen c={c} />}
      {ui.panel && <Panels c={c} panel={ui.panel} />}
    </div>
  );
}

function EndingScreen({ c }: { c: GameController }) {
  const ui = c.ui.get();
  const en = ui.ending!;
  const g = c.g;
  const typeLabel: Record<string, string> = { heureuse: 'Fin heureuse', tragique: 'Fin tragique', neutre: 'Fin neutre', inattendue: 'Fin inattendue', secrete: 'Fin secrète' };
  const keyDecisions = [...g.s.history.filter((d) => d.key), ...g.s.history.filter((d) => !d.key && d.fx.length >= 3)].slice(0, 7);
  const discovered = g.meta.endings.size;
  const total = c.u.def.endings.length;
  return (
    <div class="ending">
      <div class="card pbox col">
        <div><span class={`badge t-${en.type}`}>{typeLabel[en.type] ?? en.type}</span></div>
        <h1>{en.title}</h1>
        {en.summary && <p style={{ margin: 0, fontSize: 18, lineHeight: 1.45 }}>{en.summary}</p>}
        <div class="row muted" style={{ fontSize: 14 }}>
          <span>{String(g.s.player.nom)}</span>·<span>{g.s.history.length} décisions</span>·<span>{g.s.time.tick} semaines vécues</span>·<span>Fins découvertes : {discovered}/{total}</span>
        </div>
        {(c.u.def.sheet ?? []).map((sec) => (
          <div key={sec.title}>
            <div class="label">{sec.title}</div>
            <div class="delta-list">
              {sec.rows.filter((r) => g.testSrc(r.when)).map((r) => <div key={r.label}><span class="muted">{r.label} :</span> {g.render(r.value)}</div>)}
            </div>
          </div>
        ))}
        {keyDecisions.length > 0 && (
          <div>
            <div class="label">Les décisions qui ont compté</div>
            <div class="list" style={{ marginTop: 8 }}>
              {keyDecisions.map((d, i) => (
                <div key={i} class={`item ${d.key ? 'key' : ''}`}>
                  <div class="meta">CHAPITRE {d.ch} · SEMAINE {d.wk} · {d.title.toUpperCase()}</div>
                  <div>{d.choice}</div>
                  {d.fx.length > 0 && <div class="fx">{d.fx.slice(0, 5).join(' · ')}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div class="row" style={{ marginTop: 8 }}>
          <button class="pbtn primary" onClick={() => c.opts.onNewLife()}>Vivre une autre vie</button>
          <button class="pbtn" onClick={() => c.opts.onExit()}>Menu principal</button>
        </div>
      </div>
    </div>
  );
}
