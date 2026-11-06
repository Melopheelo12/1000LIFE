// ─────────────────────────────────────────────────────────────────────────────
// GameController : relie le moteur narratif (session + runner), le monde 2D
// et l'interface. Il déroule la file des « jobs » (événements, bilans,
// chapitres, fins), présente répliques/choix/mises en scène, et gère les
// interactions du joueur dans le monde (parler, utiliser, voyager).
// ─────────────────────────────────────────────────────────────────────────────
import type { CompiledUniverse } from '../core/runtime/compile';
import { StoryRunner, type ChoiceView, type Step } from '../core/runtime/runner';
import type { GameSession, HubOption, Note, WeekSummary } from '../core/runtime/session';
import type { Look, LocationDef } from '../core/model/types';
import { toStr } from '../core/expr/expr';
import { audio } from '../engine/audio';
import { col } from '../engine/gfx/character';
import { normEmotion } from '../engine/gfx/portrait';
import { Engine } from '../engine/engine';
import { World, type Focus, type WorldEnv } from '../engine/world/world';
import { Store } from '../ui/store';
import { unlockEnding, writeSave, type Settings } from './saves';

export interface Toast { id: number; kind: Note['kind']; text: string; good?: boolean }
export interface LineView { who: string | null; name: string; emo: string; text: string; look: Look | null; color: string; bark?: boolean }
export type Panel = 'journal' | 'stats' | 'relations' | 'map' | 'saves' | 'menu' | 'debug' | 'options' | 'apparence' | null;

export interface GameUI {
  mode: 'loading' | 'hub' | 'busy' | 'line' | 'choices' | 'echo' | 'summary' | 'chapter' | 'ending';
  line: LineView | null;
  choices: ChoiceView[] | null;
  echo: string | null;
  toasts: Toast[];
  summary: WeekSummary | null;
  chapter: { index: number; title: string; subtitle?: string; intro?: string } | null;
  ending: { id: string; title: string; type: string; summary?: string } | null;
  title: string | null;
  prompt: Focus | null;
  hotspot: { id: string; title: string; options: HubOption[] } | null;
  confirm: { text: string; yes: string; no: string; resolve: (ok: boolean) => void } | null;
  panel: Panel;
  tick: number;
  error: string | null;
  locationName: string;
}

const SPEAKER_COLORS = ['#ffd166', '#7bdff2', '#f7a072', '#b2f7ef', '#f4a6ff', '#a3e635', '#fca5a5', '#93c5fd'];
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / ((globalThis as unknown as { __mvFast?: number }).__mvFast ?? 1)));

export interface ControllerOptions {
  test?: boolean;
  settings: Settings;
  onExit: () => void;
  onNewLife: () => void;
  onSettings?: (s: Settings) => void;
}

export class GameController {
  readonly ui = new Store<GameUI>({
    mode: 'loading', line: null, choices: null, echo: null, toasts: [], summary: null, chapter: null, ending: null,
    title: null, prompt: null, hotspot: null, confirm: null, panel: null, tick: 0, error: null, locationName: '',
  });
  readonly runner: StoryRunner;
  readonly world: World;
  engine: Engine | null = null;
  busy = false;
  private advanceResolve: (() => void) | null = null;
  private choiceResolve: ((i: number) => void) | null = null;
  private toastId = 0;
  private lastSound = 0;
  private colorOf = new Map<string, string>();
  typing = false;
  skipTyping: (() => void) | null = null;
  destroyed = false;
  private playStart = Date.now();

  constructor(public u: CompiledUniverse, public g: GameSession, public opts: ControllerOptions) {
    this.runner = new StoryRunner(g, false);
    const self = this;
    const env: WorldEnv = {
      color: (v, f) => self.color(v, f),
      num: (v, f) => self.num(v, f),
      text: (v) => (v === undefined || v === null ? '' : g.render(String(v))),
      test: (c) => g.testSrc(c),
      charLook: (id, override) => self.charLook(id, override),
      charName: (id) => g.charName(id),
      playerLook: (loc) => self.playerLook(loc),
      playerName: () => toStr(g.s.player.nom),
      presets: () => u.def.presets ?? {},
    };
    this.world = new World(env);
    this.world.onInteract = (f) => void this.interact(f);
    (globalThis as unknown as { __mv?: GameController }).__mv = this;
    u.def.characters.forEach((c, i) => this.colorOf.set(c.id, SPEAKER_COLORS[i % SPEAKER_COLORS.length]));
  }

  // ───────────────────────────── Environnement visuel ────────────────────

  color(v: unknown, fallback: string): string {
    if (typeof v !== 'string') return fallback;
    if (v.startsWith('$')) { const r = this.g.s.vars[v.slice(1)]; return col(typeof r === 'string' ? r : undefined, fallback); }
    if (v.includes('{')) return col(this.g.render(v), fallback);
    return col(v, fallback);
  }
  num(v: unknown, fallback: number): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      if (v.startsWith('$')) { const r = Number(this.g.s.vars[v.slice(1)]); return Number.isFinite(r) ? r : fallback; }
      const n = Number(this.g.render(v)); return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  }
  resolveLook(l: Look | undefined): Look {
    const out: Look = { ...(l ?? {}) };
    for (const k of ['skin', 'hairColor', 'topColor', 'topColor2', 'bottomColor', 'shoes', 'socks', 'eyes'] as const) {
      const v = out[k];
      if (typeof v === 'string' && v.startsWith('$')) { const r = this.g.s.vars[v.slice(1)]; out[k] = typeof r === 'string' ? r : undefined; }
    }
    return out;
  }
  charLook(id: string, override?: Look): Look | null {
    if (id === 'moi') return this.resolveLook(this.g.s.look);
    const c = this.u.chars.get(id);
    if (!c) return null;
    return this.resolveLook({ ...c.look, ...(override ?? {}) });
  }
  /** Garde-robe : nouvelle apparence du joueur, appliquée immédiatement et sauvegardée avec la partie. */
  setPlayerLook(look: Look) {
    this.g.s.look = look;
    if (this.world.loc) this.world.player.setLook(this.playerLook(this.world.loc));
  }

  playerLook(loc?: LocationDef): Look {
    return this.resolveLook({ ...this.g.s.look, ...(loc?.playerLook ?? {}) });
  }

  // ───────────────────────────── Démarrage ───────────────────────────────

  mount(host: HTMLElement, measure?: HTMLElement) {
    this.engine = new Engine(this.world, host, measure ?? host);
    this.engine.onFrame = (dt) => this.frame(dt);
    this.engine.start();
  }

  async start() {
    const loc = this.u.locs.get(this.g.s.location) ?? this.u.def.locations[0];
    this.world.load(loc, this.g.hub());
    this.ui.set({ locationName: this.g.render(loc.name) });
    audio.setAmbient(loc.ambient);
    await this.pump();
  }

  destroy() {
    this.destroyed = true;
    this.engine?.stop();
    this.runner.abort();
    this.advanceResolve?.();
    audio.setAmbient(undefined);
  }

  // ───────────────────────────── Boucle de jeu ───────────────────────────

  private frame(_dt: number) {
    const inp = this.engine!.input;
    const ui = this.ui.get();
    this.g.s.playtime += _dt;
    if (ui.confirm) return;
    if (ui.panel) { if (inp.hit('Escape')) this.closePanel(); return; }
    if (ui.mode === 'hub' && !ui.hotspot) {
      if (inp.hit('e', 'Enter', ' ') && this.world.focus) void this.interact(this.world.focus);
      else if (inp.hit('j')) this.openPanel('journal');
      else if (inp.hit('c')) this.openPanel('stats');
      else if (inp.hit('r')) this.openPanel('relations');
      else if (inp.hit('m')) this.openPanel('map');
      else if (inp.hit('Escape')) this.openPanel('menu');
      else if (inp.hit('F2') && this.opts.test) this.openPanel('debug');
      const f = this.world.focus;
      if ((f?.id ?? null) !== (ui.prompt?.id ?? null) || f?.kind !== ui.prompt?.kind) this.ui.set({ prompt: f });
    } else if (ui.mode === 'hub' && ui.hotspot) {
      if (inp.hit('Escape')) this.ui.set({ hotspot: null });
      const n = '123456789'.indexOf([...inp.pressed].find((k) => /^[1-9]$/.test(k)) ?? 'x');
      if (n >= 0 && ui.hotspot.options[n]) void this.chooseHotspot(ui.hotspot.options[n]);
    } else if (ui.mode === 'line' || ui.mode === 'echo' || ui.mode === 'summary' || ui.mode === 'chapter') {
      if (inp.hit(' ', 'Enter', 'e')) this.advance();
      if (inp.hit('Escape') && ui.mode !== 'line') this.advance();
    } else if (ui.mode === 'choices' && ui.choices) {
      const k = [...inp.pressed].find((x) => /^[1-9]$/.test(x));
      if (k) { const v = ui.choices.filter((c) => true)[Number(k) - 1]; if (v?.enabled) this.choose(v.index); }
    }
    // avance rapide des mises en scène
    this.world.timeScale = ui.mode === 'busy' && inp.down(' ', 'Enter') ? 3 : 1;
  }

  advance() {
    if (this.typing && this.skipTyping) { this.skipTyping(); return; }
    const r = this.advanceResolve;
    this.advanceResolve = null;
    r?.();
  }
  waitAdvance(): Promise<void> { return new Promise((res) => { this.advanceResolve = res; }); }

  choose(index: number) {
    const r = this.choiceResolve;
    if (!r) return;
    this.choiceResolve = null;
    audio.play('confirm');
    r(index);
  }

  async pump() {
    if (this.busy || this.destroyed) return;
    this.busy = true;
    this.world.inputEnabled = false;
    this.ui.set({ mode: 'busy', prompt: null, hotspot: null });
    try {
      for (let guard = 0; guard < 400; guard++) {
        if (this.destroyed) return;
        const job = this.g.nextJob();
        if (!job) break;
        switch (job.t) {
          case 'event':
            if (this.runner.start(job.id)) await this.runSteps();
            break;
          case 'chapter': await this.showChapter(job.index); break;
          case 'summary': await this.showSummary(job.data); break;
          case 'autosave': if (!this.opts.test) await this.save('auto').catch(() => undefined); break;
          case 'ending': await this.runEnding(job.id); return;
        }
        this.flushNotes();
      }
    } catch (e) {
      console.error(e);
      this.ui.set({ error: (e as Error).message });
      this.runner.abort();
    } finally {
      this.busy = false;
    }
    if (!this.destroyed && this.ui.get().mode !== 'ending') this.toHub();
  }

  private toHub() {
    const g = this.g;
    if (g.locationChanged || this.world.loc?.id !== g.s.location) {
      g.locationChanged = false;
      const loc = this.u.locs.get(g.s.location);
      if (loc) { this.world.load(loc, g.hub(), this.world.player.x); this.ui.set({ locationName: g.render(loc.name) }); audio.setAmbient(loc.ambient); }
    } else this.world.syncHub(g.hub());
    this.world.camLock = null;
    for (const a of this.world.actors.values()) a.speaking = false;
    this.world.inputEnabled = true;
    this.ui.set({ mode: 'hub', line: null, choices: null, echo: null, tick: this.ui.get().tick + 1 });
  }

  // ───────────────────────────── Présentation des étapes ─────────────────

  async runSteps() {
    for (let guard = 0; guard < 5000; guard++) {
      if (this.destroyed) return;
      const step: Step = this.runner.next();
      this.flushNotes();
      if (step.type === 'end') break;
      if (step.type === 'line') await this.showLine(step.who, step.emo, step.text);
      else if (step.type === 'choices') {
        const i = await this.showChoices(step.options);
        this.runner.choose(i);
        this.flushNotes();
      } else if (step.type === 'stage') await this.stage(step.cmd, step.args);
      else if (step.type === 'echo') await this.showEcho(step.text);
      if (this.g.locationChanged) await this.followLocation();
    }
    for (const a of this.world.actors.values()) a.speaking = false;
    this.world.camLock = null;
    this.ui.set({ line: null, choices: null, echo: null, mode: 'busy' });
  }

  private async followLocation(spawnX?: number) {
    const g = this.g;
    g.locationChanged = false;
    const loc = this.u.locs.get(g.s.location);
    if (!loc || this.world.loc?.id === loc.id) return;
    this.ui.set({ line: null });
    await this.world.fadeTo(1);
    this.world.load(loc, g.hub(), spawnX);
    this.ui.set({ locationName: g.render(loc.name) });
    audio.setAmbient(loc.ambient);
    await this.world.fadeTo(0);
  }

  async showLine(who: string | null, emo: string | undefined, text: string, bark = false) {
    const e = normEmotion(emo);
    const actor = who ? this.world.actor(who) : undefined;
    for (const a of this.world.actors.values()) a.speaking = false;
    if (actor) {
      actor.speaking = true;
      actor.emo = e;
      if (!actor.isPlayer && Math.abs(actor.x - this.world.player.x) < 90 && !actor.staged) {
        actor.face = this.world.player.x < actor.x ? -1 : 1;
        this.world.player.face = actor.x < this.world.player.x ? -1 : 1;
      }
      if (!actor.isPlayer) this.world.camLock = (actor.x + this.world.player.x) / 2 - 160;
    }
    const name = who ? this.g.charName(who) : '';
    const look = who ? (actor?.look ?? this.charLook(who)) : null;
    this.ui.set({
      mode: 'line', choices: null, echo: null,
      line: { who, name, emo: e, text, look, color: who === 'moi' ? '#ffffff' : this.colorOf.get(who ?? '') ?? '#ffd166', bark },
    });
    await this.waitAdvance();
    if (actor) actor.speaking = false;
  }

  async showChoices(options: ChoiceView[]): Promise<number> {
    this.ui.set({ mode: 'choices', choices: options, echo: null });
    audio.play('select');
    return new Promise((res) => { this.choiceResolve = res; });
  }

  async showEcho(text: string) {
    audio.play('souvenir');
    this.ui.set({ mode: 'echo', echo: text });
    await this.waitAdvance();
    this.ui.set({ echo: null });
  }

  async stage(cmd: string, args: string[]) {
    switch (cmd) {
      case 'titre': {
        this.ui.set({ title: args.join(' '), line: null });
        await Promise.race([wait(1600), this.waitAdvance()]);
        this.advanceResolve = null;
        this.ui.set({ title: null });
        return;
      }
      case 'son': audio.play(args[0]); return;
      case 'lieu': {
        const x = args[1] !== undefined ? Number(args[1]) : undefined;
        if (args[2]) this.world.timeOverride = null;
        await this.followLocation(Number.isFinite(x) ? x : undefined);
        if (args[2] && ['aube', 'jour', 'soir', 'nuit'].includes(args[2])) await this.world.exec('moment', [args[2]]);
        return;
      }
    }
    this.ui.set({ mode: 'busy', line: null });
    await Promise.race([this.world.exec(cmd, args), wait(9000)]);
  }

  async showChapter(index: number) {
    const ch = this.u.chapters[index];
    if (!ch) return;
    audio.play('cloche');
    this.ui.set({ mode: 'chapter', chapter: { index, title: ch.def.title, subtitle: ch.def.subtitle ? this.g.render(ch.def.subtitle) : undefined, intro: ch.def.intro ? this.g.render(ch.def.intro) : undefined }, line: null });
    await Promise.race([this.waitAdvance(), wait(index === 0 ? 4200 : 6000)]);
    this.advanceResolve = null;
    this.ui.set({ chapter: null });
    if (this.g.locationChanged) await this.followLocation();
  }

  async showSummary(data: WeekSummary) {
    audio.play('page');
    this.ui.set({ mode: 'summary', summary: data, line: null });
    await this.waitAdvance();
    this.ui.set({ summary: null });
  }

  async runEnding(id: string) {
    const en = this.u.endings.find((e) => e.def.id === id);
    if (!this.opts.test) await unlockEnding(this.u.def.id, id).catch(() => undefined);
    this.g.meta.endings.add(id);
    if (en?.def.location && this.u.locs.has(en.def.location)) { this.g.s.location = en.def.location; this.g.locationChanged = true; await this.followLocation(); }
    if (en) { this.runner.startScript(`fin:${id}`, en.def.title, en.script); await this.runSteps(); }
    this.g.addJournal('fin', `Fin : ${en?.def.title ?? id}`);
    if (!this.opts.test) await this.save('auto').catch(() => undefined);
    this.world.inputEnabled = false;
    audio.play(en?.def.type === 'tragique' ? 'deception' : 'cloche');
    this.ui.set({ mode: 'ending', line: null, choices: null, ending: { id, title: en?.def.title ?? id, type: en?.def.type ?? 'neutre', summary: en?.def.summary ? this.g.render(en.def.summary) : undefined } });
  }

  // ───────────────────────────── Notifications ───────────────────────────

  flushNotes() {
    const notes = this.g.takeNotes();
    if (!notes.length) return;
    const now = Date.now();
    const toasts = notes.map((n) => ({ id: ++this.toastId, kind: n.kind, text: n.text, good: n.good }));
    this.ui.set((s) => ({ toasts: [...s.toasts, ...toasts].slice(-6) }));
    if (now - this.lastSound > 250) {
      this.lastSound = now;
      if (notes.some((n) => n.kind === 'mem')) audio.play('souvenir');
      else if (notes.some((n) => n.kind === 'objectif')) audio.play('notif');
      else if (notes.some((n) => (n.kind === 'stat' || n.kind === 'rel') && n.good === false)) audio.play('negatif');
      else if (notes.some((n) => n.kind === 'stat' || n.kind === 'rel')) audio.play('positif');
    }
    for (const t of toasts) setTimeout(() => this.ui.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), t.kind === 'mem' || t.kind === 'objectif' ? 5200 : 3800);
  }

  // ───────────────────────────── Interactions dans le monde ──────────────

  async interact(f: Focus) {
    if (this.busy || this.ui.get().mode !== 'hub') return;
    audio.unlock();
    const w = this.world;
    if (f.kind === 'npc') {
      const a = w.actor(f.id);
      if (a) { a.face = w.player.x < a.x ? -1 : 1; w.player.face = a.x < w.player.x ? -1 : 1; }
      const r = this.g.talk(f.id);
      if (r.event) { await this.pump(); return; }
      this.busy = true; w.inputEnabled = false;
      await this.showLine(f.id, undefined, r.bark ?? '…', true);
      this.flushNotes();
      this.busy = false;
      this.toHub();
      return;
    }
    if (f.kind === 'exit') { await this.travel(f.to, f.spawn); return; }
    if (f.kind === 'hotspot') {
      const hs = w.hub?.hotspots.find((h) => h.def.id === f.id);
      if (!hs) return;
      if (this.g.useHotspot(hs.def.id)) { await this.pump(); return; }
      const opts = this.g.hotspotOptions(hs.def);
      if (opts.length === 1 && opts[0].kind === 'event') { if (this.g.useHotspotEvent(opts[0].id)) await this.pump(); return; }
      if (!opts.length) return;
      audio.play('select');
      this.ui.set({ hotspot: { id: hs.def.id, title: this.g.render(hs.def.label), options: opts } });
    }
  }

  async chooseHotspot(o: HubOption) {
    // Un double-clic ne doit jamais lancer deux fois la même action (ni sauter une semaine) :
    // le premier clic ferme le menu de l'élément, le second est ignoré.
    if (this.busy || this.ui.get().mode !== 'hub' || !this.ui.get().hotspot) return;
    if (!o.enabled) { audio.play('back'); return; }
    this.ui.set({ hotspot: null });
    if (o.kind === 'end') {
      if (this.g.s.actions > 0) {
        const ok = await this.confirm(`Il te reste ${this.g.s.actions} action${this.g.s.actions > 1 ? 's' : ''} cette ${this.u.def.config?.tickLabel?.toLowerCase() ?? 'semaine'}. Passer à la suite quand même ?`, 'Oui, continuer', 'Non');
        if (!ok || this.busy) return;
      }
      this.g.endTick();
      await this.pump();
      return;
    }
    if (o.kind === 'event') { if (this.g.useHotspotEvent(o.id)) await this.pump(); return; }
    const r = this.g.doActivity(o.id);
    if (!r.ok) { audio.play('back'); return; }
    this.world.player.playOnce('interagir');
    audio.play('confirm');
    if (r.feedback) this.g.note({ kind: 'info', text: r.feedback });
    this.flushNotes();
    if (r.event) await this.pump(); else this.ui.set({ tick: this.ui.get().tick + 1 });
  }

  async travel(to: string, spawn?: number) {
    if (this.busy) return;
    const prev = this.g.s.location;
    const loc = this.u.locs.get(to);
    if (!loc) return;
    this.busy = true;
    this.world.inputEnabled = false;
    audio.play('porte');
    await this.world.fadeTo(1);
    this.g.travel(to);
    const back = (loc.exits ?? []).find((e) => e.to === prev);
    this.world.load(loc, this.g.hub(), spawn ?? back?.x ?? loc.spawn);
    this.ui.set({ locationName: this.g.render(loc.name), prompt: null });
    audio.setAmbient(loc.ambient);
    await this.world.fadeTo(0);
    this.busy = false;
    await this.pump();
  }

  confirm(text: string, yes = 'Oui', no = 'Annuler'): Promise<boolean> {
    return new Promise((resolve) => this.ui.set({ confirm: { text, yes, no, resolve: (ok) => { this.ui.set({ confirm: null }); resolve(ok); } } }));
  }

  openPanel(p: Panel) { if (this.ui.get().mode === 'hub' || p === 'menu' || p === 'options') { audio.play('page'); this.ui.set({ panel: p }); } }
  closePanel() { audio.play('back'); this.ui.set({ panel: null }); }

  async save(slot: string) {
    this.g.s.playtime = Math.max(this.g.s.playtime, 0);
    return writeSave(slot, this.g);
  }

  canSave() { return !this.busy && this.ui.get().mode === 'hub'; }

  // ───────────────────────────── Débogage (mode test de l'éditeur) ───────

  debugFire(eventId: string) {
    if (this.busy) return;
    this.g.queue.push({ t: 'event', id: eventId });
    this.closePanel();
    void this.pump();
  }
  debugEndWeek() { if (this.busy) return; this.closePanel(); this.g.endTick(); void this.pump(); }
  debugNextChapter() { if (this.busy) return; this.closePanel(); this.g.s.time.week = this.g.chapter.def.weeks; this.g.endTick(); void this.pump(); }
}
