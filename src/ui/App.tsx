// Routeur principal : titre → univers → création → jeu ; chargement ; éditeur ; fins.
import { useEffect, useState } from 'preact/hooks';
import type { CastChoice, Look, UniverseDef } from '../core/model/types';
import { GameSession } from '../core/runtime/session';
import { GameController } from '../game/controller';
import { builtinUniverses, compiled, findUniverse } from '../game/registry';
import { getEndings, getLastValues, listSaves, loadSettings, readSave, saveSettings, DEFAULT_SETTINGS, type SaveFile, type Settings } from '../game/saves';
import { audio } from '../engine/audio';
import { compileUniverse } from '../core/runtime/compile';
import { GameScreen } from './game/GameScreen';
import { CreationScreen, EndingsScreen, LoadScreen, TitleScreen, UniverseSelect } from './screens/menus';
import { OptionsForm } from './game/panels';
import { Editor } from './editor/Editor';

type Screen =
  | { k: 'title' }
  | { k: 'select' }
  | { k: 'load' }
  | { k: 'endings' }
  | { k: 'options' }
  | { k: 'create'; def: UniverseDef }
  | { k: 'game'; ctrl: GameController; key: number }
  | { k: 'editor' };

function applyTheme(def: UniverseDef | null) {
  const root = document.documentElement;
  if (def?.theme?.accent) root.style.setProperty('--accent', def.theme.accent); else root.style.removeProperty('--accent');
  if (def?.theme?.accent2) root.style.setProperty('--accent2', def.theme.accent2); else root.style.removeProperty('--accent2');
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ k: 'title' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasContinue, setHasContinue] = useState(false);
  const [editorDraft, setEditorDraft] = useState<{ def: UniverseDef; dirty: boolean } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadSettings().then((s) => { setSettings(s); audio.setVolume(s.volume); audio.setMuted(s.muted); });
  }, []);
  useEffect(() => {
    if (screen.k === 'title') void listSaves().then((m) => setHasContinue(m.some((x) => !x.ending))).catch(() => undefined);
    if (screen.k === 'title' || screen.k === 'select' || screen.k === 'editor') applyTheme(null);
  }, [screen.k]);

  const changeSettings = (s: Settings) => { setSettings(s); void saveSettings(s); };

  const startGame = async (def: UniverseDef, o: { name: string; look: Look; fields: Record<string, string>; cast?: Record<string, CastChoice> }) => {
    const u = compiled(def);
    const meta = { endings: new Set((await getEndings())[def.id] ?? []), last: await getLastValues(def.id).catch(() => ({})) };
    u.def.config = { ...(u.def.config ?? {}), showValues: settings.showValues };
    const g = GameSession.create(u, { name: o.name, look: o.look, fields: o.fields, cast: o.cast }, meta);
    launch(def, g, false);
  };

  const launch = (def: UniverseDef, g: GameSession, test: boolean) => {
    applyTheme(def);
    const ctrl: GameController = new GameController(g.u, g, {
      test, settings,
      onExit: () => setScreen(test ? { k: 'editor' } : { k: 'title' }),
      onNewLife: () => setScreen(test ? { k: 'editor' } : { k: 'create', def }),
      onSettings: changeSettings,
    });
    setScreen({ k: 'game', ctrl, key: Date.now() });
  };

  const loadGame = async (f: SaveFile) => {
    const def = await findUniverse(f.meta.universe);
    if (!def) { setNotice(`L'univers « ${f.meta.universeName} » de cette sauvegarde est introuvable.`); return; }
    const u = compiled(def);
    const meta = { endings: new Set((await getEndings())[def.id] ?? []) };
    const g = GameSession.restore(u, f.state, meta);
    launch(def, g, false);
  };

  const continueGame = async () => {
    const metas = (await listSaves()).filter((m) => !m.ending).sort((a, b) => b.updated - a.updated);
    if (!metas.length) return;
    const f = await readSave(metas[0].slot);
    if (f) await loadGame(f);
  };

  /** Mode test de l'éditeur : partie jetable (aucune sauvegarde), panneau de débogage (F2). */
  const testUniverse = (def: UniverseDef, from?: { event?: string; ending?: string }) => {
    const u = compileUniverse(JSON.parse(JSON.stringify(def)) as UniverseDef);
    const fields: Record<string, string> = {};
    for (const f of def.creation?.fields ?? []) fields[f.id] = f.options[0]?.id ?? '';
    const g = GameSession.create(u, { name: def.creation?.defaultName ?? 'Testeur', look: def.creation?.baseLook, fields });
    if (from?.event) { g.queue = g.queue.filter((j) => j.t !== 'event'); g.queue.splice(1, 0, { t: 'event', id: from.event }); }
    if (from?.ending) { g.s.ending = from.ending; g.queue = [{ t: 'ending', id: from.ending }]; }
    launch(def, g, true);
  };

  const featured = builtinUniverses()[0] ?? null;

  return (
    <>
      {notice && (
        <div class="panel-wrap" style={{ zIndex: 50 }}>
          <div class="panel pbox col" style={{ maxWidth: 480 }}><div>{notice}</div><button class="pbtn" onClick={() => setNotice('')}>D'accord</button></div>
        </div>
      )}
      {screen.k === 'title' && (
        <TitleScreen featured={featured} hasContinue={hasContinue}
          onPlay={() => setScreen({ k: 'select' })} onContinue={continueGame} onLoad={() => setScreen({ k: 'load' })}
          onEditor={() => setScreen({ k: 'editor' })} onEndings={() => setScreen({ k: 'endings' })} onOptions={() => setScreen({ k: 'options' })} />
      )}
      {screen.k === 'select' && <UniverseSelect onBack={() => setScreen({ k: 'title' })} onPick={(def) => setScreen({ k: 'create', def })} onEditor={() => setScreen({ k: 'editor' })} />}
      {screen.k === 'load' && <LoadScreen onBack={() => setScreen({ k: 'title' })} onLoad={loadGame} />}
      {screen.k === 'endings' && <EndingsScreen onBack={() => setScreen({ k: 'title' })} />}
      {screen.k === 'options' && (
        <div class="screen"><div class="page" style={{ maxWidth: 560 }}>
          <div class="page-head"><button class="pbtn small" onClick={() => setScreen({ k: 'title' })}>← Retour</button><h1>Options</h1></div>
          <div class="pbox" style={{ padding: 18 }}><OptionsForm settings={settings} onChange={changeSettings} /></div>
        </div></div>
      )}
      {screen.k === 'create' && <CreationScreen def={screen.def} onBack={() => setScreen({ k: 'select' })} onStart={(o) => void startGame(screen.def, o)} />}
      {screen.k === 'game' && <GameScreen key={screen.key} c={screen.ctrl} />}
      {screen.k === 'editor' && <Editor draft={editorDraft} onDraft={setEditorDraft} onExit={() => setScreen({ k: 'title' })} onTest={testUniverse} />}
    </>
  );
}
