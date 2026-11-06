// ─────────────────────────────────────────────────────────────────────────────
// GameSession : l'état d'une partie et les règles génériques du moteur.
//   • statistiques, variables, relations (modulées par la personnalité),
//     mémoire des personnages, objectifs, journal, historique des décisions
//   • temps : semaines (« ticks »), actions par semaine, chapitres
//   • événements : sélection par déclencheur/priorité/conditions/probabilité,
//     événements aléatoires pondérés, planificateur (conséquences différées)
//   • fins multiples évaluées par priorité
// Totalement indépendante de l'affichage : utilisée par le jeu, les tests,
// l'éditeur et le simulateur.
// ─────────────────────────────────────────────────────────────────────────────
import { evaluate, exprToString, parseTemplate, renderTemplate, toBool, toNum, toStr, type Expr, type Scope, type Stmt, type TextPart } from '../expr/expr';
import { Rng, hashString } from '../rng';
import type { CEvent, CompiledUniverse, Issue } from './compile';
import type { Decision, GameState, HotspotDef, JournalKind, LocationDef, Look, Value } from '../model/types';

export type Job =
  | { t: 'event'; id: string }
  | { t: 'phase'; name: 'tickEnd' | 'tickEndFx' | 'advance' | 'nextChapter' | 'tickStart' | 'ending' }
  | { t: 'chapter'; index: number }
  | { t: 'summary'; data: WeekSummary }
  | { t: 'ending'; id: string }
  | { t: 'autosave' };

export interface Note {
  kind: 'stat' | 'rel' | 'mem' | 'info' | 'actu' | 'objectif' | 'echo';
  text: string;
  good?: boolean;
  id?: string;
}

export interface WeekSummary {
  tick: number; ch: number; wk: number;
  chapterTitle: string;
  stats: { id: string; label: string; delta: number; value: number; format?: string }[];
  rels: { id: string; name: string; delta: number; value: number }[];
  entries: { kind: JournalKind; text: string }[];
}

export interface HubOption {
  kind: 'activity' | 'event' | 'end';
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  reason?: string;
  cost?: string;
}
export interface HubInfo {
  location: LocationDef;
  npcs: { id: string; x: number; face?: 'gauche' | 'droite'; anim?: string; lane?: number; look?: Look; hasNew: boolean }[];
  exits: { to: string; x: number; label: string; kind: 'porte' | 'bord'; spawn?: number }[];
  hotspots: { def: HotspotDef; options: HubOption[] }[];
}

export interface NewGameOptions {
  name: string;
  look?: Look;
  fields?: Record<string, string>;
  seed?: number;
  gender?: 'h' | 'f';
}

export interface MetaInfo { endings: Set<string> }

const FN_ALIASES: Record<string, string> = {
  round: 'arrondi', floor: 'plancher', ceil: 'plafond', clamp: 'borne', rand: 'hasard', odds: 'cote',
  seen: 'vu', count: 'nb', since: 'depuis', chose: 'choisi', pick: 'choix', list: 'liste', listPick: 'listeHasard',
  size: 'taille', level: 'niveau', between: 'entre', remember: 'souvenir', forget: 'oublier', meet: 'rencontrer',
  schedule: 'planifier', cancel: 'annuler', end: 'fin', notify: 'notifier', news: 'actu', objective: 'objectif',
  complete: 'objectifReussi', fail: 'objectifEchoue', travel: 'aller', nextChapter: 'chapitreSuivant', format: 'nombre', drift: 'eloigner',
};
export const EXPR_FUNCTIONS = [
  'min', 'max', 'abs', 'arrondi', 'plancher', 'plafond', 'borne', 'hasard', 'chance', 'test', 'cote', 'vu', 'nb',
  'depuis', 'choisi', 'trait', 'choix', 'liste', 'listeHasard', 'taille', 'poisson', 'niveau', 'entre', 'nombre', 'planifie',
];
export const EFFECT_FUNCTIONS = [
  'souvenir', 'oublier', 'rencontrer', 'planifier', 'annuler', 'fin', 'notifier', 'actu', 'journal', 'objectif',
  'objectifReussi', 'objectifEchoue', 'aller', 'chapitreSuivant', 'eloigner',
];
export const NAMESPACES = ['stat', 'var', 'flag', 'rel', 'mem', 'connu', 'joueur', 'temps', 'chapitre', 'lieu', 'actions', 'reussite', 'echec', 'meta', 'objectif', 'tag'];

export class SessionError extends Error {}

function fmtNumber(n: number): string {
  const s = Math.round(n).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export class GameSession {
  readonly u: CompiledUniverse;
  s: GameState;
  rng: Rng;
  queue: Job[] = [];
  notes: Note[] = [];
  issues: Issue[] = [];
  lastTest = false;
  locationChanged = false;
  meta: MetaInfo;
  private currentDecision: Decision | null = null;
  private context = '';

  constructor(u: CompiledUniverse, state: GameState, meta?: MetaInfo) {
    this.u = u;
    this.s = state;
    this.rng = new Rng(state.rng);
    this.meta = meta ?? { endings: new Set() };
  }

  // ───────────────────────────── Création ────────────────────────────────

  static create(u: CompiledUniverse, opts: NewGameOptions, meta?: MetaInfo): GameSession {
    const def = u.def;
    const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    const stats: Record<string, number> = {};
    for (const st of def.stats) stats[st.id] = st.initial ?? 0;
    const rel: Record<string, number> = {};
    for (const c of def.characters) rel[c.id] = c.relation ?? 0;
    const player: Record<string, Value> = { nom: opts.name || def.creation?.defaultName || 'Toi', genre: opts.gender ?? opts.look?.gender ?? 'h' };
    for (const [k, v] of Object.entries(opts.fields ?? {})) player[k] = v;
    const state: GameState = {
      v: 1, universe: def.id, universeVersion: def.version, seed, rng: new Rng(seed).state(),
      player, look: { ...(def.creation?.baseLook ?? {}), ...(opts.look ?? {}) },
      stats, vars: { ...(def.vars ?? {}) }, rel, met: {}, mem: {},
      time: { tick: 0, chapter: 0, week: 1 }, actions: def.config?.actionsPerTick ?? 3,
      location: def.start.location, fired: {}, scheduled: [], history: [], journal: [], objectives: {},
      tags: {}, actDone: {}, ending: null, pendingEnding: null,
      snapshot: { stats: {}, rel: {}, journal: 0, tick: 0 }, playtime: 0, started: Date.now(),
    };
    const g = new GameSession(u, state, meta);
    // Effets des choix de création (poste, origine, personnalité…)
    for (const [field, opt] of Object.entries(opts.fields ?? {})) {
      const fx = u.creationFx.get(`${field}:${opt}`);
      if (fx) g.exec(fx, `création ${field}`);
    }
    const ch = u.chapters[0];
    if (ch) {
      g.exec(ch.onStart, `chapitre ${ch.def.id}`);
      if (ch.def.location) state.location = ch.def.location;
    }
    state.location = def.start.location || state.location;
    g.notes = [];
    g.takeSnapshot();
    g.queue.push({ t: 'chapter', index: 0 });
    if (def.start.event && u.events.has(def.start.event)) g.queue.push({ t: 'event', id: def.start.event });
    for (const ev of g.eligibleList('chapter_start')) g.queue.push({ t: 'event', id: ev.def.id });
    g.queue.push({ t: 'phase', name: 'tickStart' });
    return g;
  }

  static restore(u: CompiledUniverse, state: GameState, meta?: MetaInfo): GameSession {
    const g = new GameSession(u, state, meta);
    // Nouveaux éléments ajoutés à l'univers depuis la sauvegarde
    for (const st of u.def.stats) if (!(st.id in state.stats)) state.stats[st.id] = st.initial ?? 0;
    for (const c of u.def.characters) if (!(c.id in state.rel)) state.rel[c.id] = c.relation ?? 0;
    return g;
  }

  /** Copie sérialisable (JSON) de l'état complet. */
  serialize(): GameState {
    this.s.rng = this.rng.state();
    return JSON.parse(JSON.stringify(this.s));
  }

  // ───────────────────────────── Accès ───────────────────────────────────

  get config() { return this.u.def.config ?? {}; }
  get chapter() { return this.u.chapters[Math.min(this.s.time.chapter, this.u.chapters.length - 1)]; }
  charName(id: string): string {
    if (id === 'moi') return toStr(this.s.player.nom);
    const c = this.u.chars.get(id);
    return c ? this.render(c.name) : id;
  }
  firstName(id: string): string {
    const c = this.u.chars.get(id);
    if (c?.short) return this.render(c.short);
    return this.charName(id).split(' ')[0];
  }

  relationLevel(v: number): { label: string; color?: string } {
    const levels = this.config.relationLevels ?? DEFAULT_LEVELS;
    let best = levels[0];
    for (const l of levels) if (v >= l.min) best = l;
    return best;
  }

  // ───────────────────────────── Expressions ─────────────────────────────

  readonly scope: Scope = {
    get: (p) => this.resolve(p),
    call: (f, args) => this.callFn(f, args),
  };

  private resolve(p: string[]): Value {
    const s = this.s;
    const [ns, a, b] = p;
    switch (ns) {
      case 'stat': return s.stats[a] ?? 0;
      case 'var': case 'flag': return s.vars[a] ?? 0;
      case 'rel': return s.rel[a] ?? 0;
      case 'mem': return !!s.mem[a]?.[b];
      case 'connu': case 'met': return !!s.met[a];
      case 'joueur': case 'player': return s.player[a] ?? '';
      case 'temps': case 'time':
        switch (a) {
          case 'semaine': case 'week': return s.time.week;
          case 'tick': case 'total': return s.time.tick;
          case 'chapitre': case 'chapter': return s.time.chapter + 1;
          case 'semaines': case 'weeks': return this.chapter?.def.weeks ?? 0;
          case 'restantes': return Math.max(0, (this.chapter?.def.weeks ?? 0) - s.time.week);
        }
        return 0;
      case 'chapitre': case 'chapter': return this.chapter?.def.id ?? '';
      case 'lieu': case 'location': return s.location;
      case 'actions': return s.actions;
      case 'reussite': case 'réussite': case 'succes': case 'succès': return this.lastTest;
      case 'echec': case 'échec': return !this.lastTest;
      case 'meta':
        if (a === 'fins') return this.meta.endings.size;
        if (a === 'fin') return this.meta.endings.has(b);
        return 0;
      case 'objectif': return s.objectives[a]?.status ?? '';
      case 'tag': return s.tags[a] ?? 0;
    }
    if (p.length === 1) return ns; // symbole nu : karim, ch2, attaquant…
    return 0;
  }

  private checkOdds(skill: number, diff: number): number {
    const scale = this.config.checkScale ?? 12;
    const p = 1 / (1 + Math.exp(-(skill - diff) / scale));
    return Math.max(0.03, Math.min(0.97, p));
  }

  private callFn(name: string, a: Value[]): Value {
    const f = FN_ALIASES[name] ?? name;
    const n = (i: number) => toNum(a[i]);
    switch (f) {
      case 'min': return Math.min(...a.map(toNum));
      case 'max': return Math.max(...a.map(toNum));
      case 'abs': return Math.abs(n(0));
      case 'arrondi': return Math.round(n(0));
      case 'plancher': return Math.floor(n(0));
      case 'plafond': return Math.ceil(n(0));
      case 'borne': return Math.max(n(1), Math.min(n(2), n(0)));
      case 'entre': return n(0) >= n(1) && n(0) <= n(2);
      case 'hasard': return this.rng.int(n(0), n(1));
      case 'chance': return this.rng.chance(n(0));
      case 'test': return this.rng.next() < this.checkOdds(n(0), n(1));
      case 'cote': return Math.round(this.checkOdds(n(0), n(1)) * 100);
      case 'vu': return (this.s.fired[toStr(a[0])]?.n ?? 0) > 0;
      case 'nb': return this.s.fired[toStr(a[0])]?.n ?? 0;
      case 'depuis': { const f2 = this.s.fired[toStr(a[0])]; return f2 ? this.s.time.tick - f2.last : 9999; }
      case 'planifie': return this.s.scheduled.some((x) => x.event === toStr(a[0]));
      case 'choisi': return this.s.tags[toStr(a[0])] ?? 0;
      case 'trait': return (this.u.chars.get(toStr(a[0]))?.traits ?? []).includes(toStr(a[1]));
      case 'choix': return a.length ? a[Math.floor(this.rng.next() * a.length)] : '';
      case 'liste': {
        const list = this.u.def.lists?.[toStr(a[0])] ?? [];
        const row = list[Math.max(0, Math.min(list.length - 1, Math.floor(n(1))))];
        return row ? (row[toStr(a[2])] ?? '') : '';
      }
      case 'listeHasard': { const list = this.u.def.lists?.[toStr(a[0])] ?? []; return list.length ? this.rng.int(0, list.length - 1) : 0; }
      case 'taille': return (this.u.def.lists?.[toStr(a[0])] ?? []).length;
      case 'poisson': return this.rng.poisson(n(0));
      case 'niveau': return this.relationLevel(this.s.rel[toStr(a[0])] ?? 0).label;
      case 'nombre': return fmtNumber(n(0));
    }
    this.issue(`Fonction inconnue « ${name} »`);
    return 0;
  }

  eval(e: Expr | undefined, fallback: Value = true): Value {
    if (!e) return fallback;
    try { return evaluate(e, this.scope); } catch (err) { this.issue((err as Error).message); return fallback === true ? false : fallback; }
  }
  test(e: Expr | undefined): boolean { return e ? toBool(this.eval(e, false)) : true; }
  testSrc(src: string | undefined, where?: string): boolean { return src ? this.test(this.u.cond(src, where)) : true; }

  render(src: string | TextPart[]): string {
    try {
      if (typeof src === 'string') {
        if (!src.includes('{') && !src.includes('[[')) return src;
        return renderTemplate(parseTemplateCached(src), this.scope, this.s.player.genre === 'f');
      }
      return renderTemplate(src, this.scope, this.s.player.genre === 'f');
    } catch (err) {
      this.issue(`Texte : ${(err as Error).message}`);
      return typeof src === 'string' ? src : src.map((p) => (typeof p === 'string' ? p : '…')).join('');
    }
  }

  odds(skill: Expr, diff: Expr): number {
    return Math.round(this.checkOdds(toNum(this.eval(skill, 0)), toNum(this.eval(diff, 0))) * 100);
  }
  doTest(skill: Expr, diff: Expr): boolean {
    const p = this.checkOdds(toNum(this.eval(skill, 0)), toNum(this.eval(diff, 0)));
    this.lastTest = this.rng.next() < p;
    return this.lastTest;
  }

  issue(msg: string) {
    if (this.issues.length < 500) this.issues.push({ where: this.context || 'exécution', kind: 'execution', msg, severity: 'error' });
  }
  setContext(ctx: string) { this.context = ctx; }

  // ───────────────────────────── Effets ──────────────────────────────────

  exec(stmts: Stmt[] | undefined, ctx?: string): void {
    if (!stmts || stmts.length === 0) return;
    const prev = this.context;
    if (ctx) this.context = ctx;
    const statDelta = new Map<string, number>();
    const relDelta = new Map<string, number>();
    for (const st of stmts) {
      try {
        if (st.k === 'call') this.execCall(st.f, st.args.map((x) => evaluate(x, this.scope)));
        else this.assign(st.target, st.op, evaluate(st.e, this.scope), statDelta, relDelta);
      } catch (err) {
        this.issue((err as Error).message);
      }
    }
    const statTexts: { text: string; good: boolean; id: string }[] = [];
    for (const [id, d] of statDelta) {
      if (!d) continue;
      const def = this.u.stats.get(id);
      if (!def || def.visible === false) continue;
      const txt = def.format === 'argent' ? `${d > 0 ? '+' : '−'}${fmtNumber(Math.abs(d))} €` : `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 10) / 10)}`;
      statTexts.push({ id, text: `${def.label} ${txt}`, good: d > 0 });
    }
    // Plus de deux statistiques modifiées d'un coup : une seule notification groupée
    if (statTexts.length > 2) {
      const goods = statTexts.filter((t) => t.good).length;
      this.note({ kind: 'stat', text: statTexts.map((t) => t.text).join(' · '), good: goods >= statTexts.length - goods });
    } else for (const t of statTexts) this.note({ kind: 'stat', id: t.id, text: t.text, good: t.good });
    for (const [id, d] of relDelta) {
      if (!d) continue;
      const nm = this.firstName(id);
      const showVal = this.config.showValues !== false;
      const txt = d > 0 ? `${nm} apprécie${showVal ? ` (+${d})` : ''}` : `${nm} n'apprécie pas${showVal ? ` (−${Math.abs(d)})` : ''}`;
      this.note({ kind: 'rel', id, text: txt, good: d > 0 });
    }
    this.context = prev;
  }

  private assign(target: string[], op: string, v: Value, statDelta: Map<string, number>, relDelta: Map<string, number>) {
    const s = this.s;
    const [ns, key] = target;
    const apply = (old: Value): Value => {
      switch (op) {
        case '=': return v;
        case '+=': return typeof old === 'string' && typeof v === 'string' ? old + v : toNum(old) + toNum(v);
        case '-=': return toNum(old) - toNum(v);
        case '*=': return toNum(old) * toNum(v);
        case '/=': return toNum(v) === 0 ? old : toNum(old) / toNum(v);
      }
      return v;
    };
    switch (ns) {
      case 'stat': {
        const def = this.u.stats.get(key);
        if (!def) { this.issue(`Statistique inconnue « ${key} »`); return; }
        const old = s.stats[key] ?? 0;
        const min = def.min ?? 0;
        const max = def.max ?? (def.format === 'argent' ? 1e12 : 100);
        let nv = toNum(apply(old));
        nv = Math.max(min, Math.min(max, Math.round(nv * 100) / 100));
        s.stats[key] = nv;
        statDelta.set(key, (statDelta.get(key) ?? 0) + (nv - old));
        return;
      }
      case 'var': case 'flag':
        s.vars[key] = apply(s.vars[key] ?? 0);
        return;
      case 'rel': {
        if (!this.u.chars.has(key)) { this.issue(`Personnage inconnu « ${key} »`); return; }
        const old = s.rel[key] ?? 0;
        let nv: number;
        if (op === '+=' || op === '-=') {
          let d = toNum(v) * (op === '-=' ? -1 : 1);
          for (const tid of this.u.chars.get(key)?.traits ?? []) {
            const t = this.u.traits.get(tid);
            if (t) d *= d > 0 ? (t.gain ?? 1) : (t.loss ?? 1);
          }
          nv = old + Math.round(d);
        } else nv = toNum(apply(old));
        nv = Math.max(-100, Math.min(100, Math.round(nv)));
        s.rel[key] = nv;
        s.met[key] = true;
        relDelta.set(key, (relDelta.get(key) ?? 0) + (nv - old));
        return;
      }
      case 'joueur': case 'player': s.player[key] = apply(s.player[key] ?? ''); return;
      case 'actions': s.actions = Math.max(0, Math.round(toNum(apply(s.actions)))); return;
      case 'connu': s.met[key] = toBool(v); return;
    }
    this.issue(`Impossible de modifier « ${target.join('.')} »`);
  }

  private execCall(name: string, a: Value[]) {
    const f = FN_ALIASES[name] ?? name;
    const s = this.s;
    const str = (i: number) => toStr(a[i]);
    // textes affichés au joueur : « {var.club} », « {joueur.nom} »… sont interpolés
    const txt = (i: number) => this.render(str(i));
    const stamp = { tick: s.time.tick, ch: s.time.chapter + 1, wk: s.time.week };
    switch (f) {
      case 'souvenir': {
        const c = str(0); const key = str(1); const text = a.length > 2 ? txt(2) : key;
        if (!this.u.chars.has(c)) { this.issue(`Personnage inconnu « ${c} »`); return; }
        (s.mem[c] ??= {})[key] = { text, ...stamp };
        s.met[c] = true;
        this.note({ kind: 'mem', id: c, text: `${this.firstName(c)} s'en souviendra.` });
        this.addJournal('souvenir', `${this.charName(c)} se souviendra : ${text}`);
        return;
      }
      case 'oublier': { const c = str(0); if (s.mem[c]) delete s.mem[c][str(1)]; return; }
      case 'eloigner': {
        // érosion naturelle d'une relation négligée : silencieuse (pas de notification)
        const c = str(0);
        if (!this.u.chars.has(c)) { this.issue(`Personnage inconnu « ${c} »`); return; }
        s.rel[c] = Math.max(-100, (s.rel[c] ?? 0) - Math.abs(toNum(a[1] ?? 1)));
        return;
      }
      case 'rencontrer': s.met[str(0)] = true; return;
      case 'planifier': {
        const ev = str(0);
        if (!this.u.events.has(ev)) { this.issue(`Événement planifié inconnu « ${ev} »`); return; }
        s.scheduled.push({ event: ev, due: s.time.tick + Math.max(1, Math.round(toNum(a[1] ?? 1))), from: s.time.tick });
        return;
      }
      case 'annuler': { const ev = str(0); s.scheduled = s.scheduled.filter((x) => x.event !== ev); return; }
      case 'fin': s.pendingEnding = a.length ? str(0) || '*' : '*'; return;
      case 'notifier': this.note({ kind: 'info', text: txt(0) }); return;
      case 'actu': { const t = txt(0); this.addJournal('actu', t); this.note({ kind: 'actu', text: t }); return; }
      case 'journal': this.addJournal('journal', txt(0)); return;
      case 'objectif':
        s.objectives[str(0)] = { text: txt(1), status: 'actif', tick: s.time.tick };
        this.note({ kind: 'objectif', text: `Nouvel objectif : ${s.objectives[str(0)].text}` });
        this.addJournal('objectif', `Objectif : ${s.objectives[str(0)].text}`);
        return;
      case 'objectifReussi': case 'objectifEchoue': {
        const o = s.objectives[str(0)];
        if (o && o.status === 'actif') {
          o.status = f === 'objectifReussi' ? 'reussi' : 'echoue';
          this.note({ kind: 'objectif', text: `${o.status === 'reussi' ? 'Objectif atteint' : 'Objectif manqué'} : ${o.text}`, good: o.status === 'reussi' });
          this.addJournal('objectif', `${o.status === 'reussi' ? '✔' : '✘'} ${o.text}`);
        }
        return;
      }
      case 'aller': {
        const loc = str(0);
        if (!this.u.locs.has(loc)) { this.issue(`Lieu inconnu « ${loc} »`); return; }
        s.location = loc; this.locationChanged = true; return;
      }
      case 'chapitreSuivant': s.time.week = Math.max(s.time.week, this.chapter.def.weeks); s.vars.__finChapitre = true; return;
    }
    this.issue(`Effet inconnu « ${name} »`);
  }

  note(n: Note) {
    this.notes.push(n);
    if (this.currentDecision && n.kind !== 'actu') this.currentDecision.fx.push(n.text);
  }
  takeNotes(): Note[] { const n = this.notes; this.notes = []; return n; }

  addJournal(kind: JournalKind, text: string) {
    const s = this.s;
    s.journal.push({ tick: s.time.tick, ch: s.time.chapter + 1, wk: s.time.week, kind, text });
    if (s.journal.length > 600) s.journal.splice(0, s.journal.length - 600);
  }

  // ───────────────────────────── Décisions ───────────────────────────────

  recordDecision(eventId: string, title: string, choice: string, tags: string[]) {
    const s = this.s;
    const d: Decision = {
      tick: s.time.tick, ch: s.time.chapter + 1, wk: s.time.week, event: eventId, title, choice, tags, fx: [],
      key: tags.includes('cle') || tags.includes('important') || undefined,
    };
    s.history.push(d);
    if (s.history.length > 1500) s.history.splice(0, s.history.length - 1500);
    for (const t of tags) s.tags[t] = (s.tags[t] ?? 0) + 1;
    this.currentDecision = d;
  }
  endDecisionScope() { this.currentDecision = null; }

  /** Phrase de « rappel » quand une décision passée ressurgit. */
  echo(cmd: string, args: string[]): string | null {
    if (cmd === 'rappel') {
      const [c, key] = (args[0] ?? '').split('.');
      const m = this.s.mem[c]?.[key];
      if (!m) return null;
      const text = `${this.firstName(c)} se souvient : « ${m.text} » (chapitre ${m.ch}, ${this.config.tickLabel?.toLowerCase() ?? 'semaine'} ${m.wk})`;
      this.addJournal('echo', text);
      return text;
    }
    const text = args.join(' ');
    if (!text) return null;
    this.addJournal('echo', text);
    return text;
  }

  // ───────────────────────────── Événements ──────────────────────────────

  isEligible(ev: CEvent, rollChance = false): boolean {
    const f = this.s.fired[ev.def.id];
    if (ev.def.once && f && f.n > 0) return false;
    if (ev.def.cooldown && f && this.s.time.tick - f.last < ev.def.cooldown) return false;
    if (ev.chapters && !ev.chapters.has(this.chapter?.def.id ?? '')) return false;
    if (ev.when && !this.test(ev.when)) return false;
    if (rollChance && ev.chance && !this.rng.chance(toNum(this.eval(ev.chance, 100)))) return false;
    return true;
  }

  hasEligible(key: string, storyOnly = false): boolean {
    return (this.u.byKey.get(key) ?? []).some((ev) => (!storyOnly || ev.def.once || ev.def.tags?.includes('important')) && this.isEligible(ev));
  }

  eligibleList(key: string): CEvent[] {
    return (this.u.byKey.get(key) ?? []).filter((ev) => this.isEligible(ev, true));
  }

  pickEvent(key: string): CEvent | null {
    const list = (this.u.byKey.get(key) ?? []).filter((ev) => this.isEligible(ev));
    if (!list.length) return null;
    // Par priorité décroissante ; à priorité égale, tirage pondéré ; la probabilité est tirée à ce moment.
    const groups = new Map<number, CEvent[]>();
    for (const ev of list) { const p = ev.def.priority ?? 0; if (!groups.has(p)) groups.set(p, []); groups.get(p)!.push(ev); }
    for (const p of [...groups.keys()].sort((a, b) => b - a)) {
      let pool = groups.get(p)!.slice();
      while (pool.length) {
        const ev = this.rng.weighted(pool, (e) => this.weightOf(e))!;
        if (!ev) break;
        if (!ev.chance || this.rng.chance(toNum(this.eval(ev.chance, 100)))) return ev;
        pool = pool.filter((x) => x !== ev);
      }
    }
    return null;
  }

  weightOf(ev: CEvent): number { return ev.weight ? Math.max(0, toNum(this.eval(ev.weight, 1))) : 1; }

  drawFromPool(pool: string, exclude: Set<string>): CEvent | null {
    const list = (this.u.byKey.get(`pool:${pool}`) ?? []).filter((ev) => !exclude.has(ev.def.id) && this.isEligible(ev, true));
    return this.rng.weighted(list, (e) => this.weightOf(e)) ?? null;
  }

  markFired(id: string) {
    const f = this.s.fired[id] ?? { n: 0, last: 0 };
    f.n++; f.last = this.s.time.tick;
    this.s.fired[id] = f;
  }

  setLocation(loc: string) {
    if (!this.u.locs.has(loc)) { this.issue(`Lieu inconnu « ${loc} »`); return; }
    this.s.location = loc;
    this.locationChanged = true;
  }

  // ───────────────────────────── Le monde (hub) ──────────────────────────

  locationAvailable(id: string): boolean {
    const l = this.u.locs.get(id);
    return !!l && this.testSrc(l.when, `lieu ${id}`);
  }

  hub(): HubInfo {
    const loc = this.u.locs.get(this.s.location) ?? this.u.def.locations[0];
    const npcs = (loc.npcs ?? [])
      .filter((n) => this.u.chars.has(n.id) && this.testSrc(n.when, `lieu ${loc.id}`))
      .map((n) => ({ id: n.id, x: n.x, face: n.face, anim: n.anim, lane: n.lane, look: n.look, hasNew: this.hasEligible(`talk:${n.id}`, true) }));
    const exits = (loc.exits ?? [])
      .filter((e) => this.testSrc(e.when, `lieu ${loc.id}`) && this.locationAvailable(e.to))
      .map((e) => ({ to: e.to, x: e.x, label: e.label ?? this.render(this.u.locs.get(e.to)?.name ?? e.to), kind: e.kind ?? 'porte', spawn: e.spawn }));
    const hotspots = (loc.hotspots ?? [])
      .filter((h) => this.testSrc(h.when, `lieu ${loc.id}`))
      .map((h) => ({ def: h, options: this.hotspotOptions(h) }));
    return { location: loc, npcs, exits, hotspots };
  }

  hotspotOptions(h: HotspotDef): HubOption[] {
    const out: HubOption[] = [];
    for (const aid of h.activities ?? []) {
      const a = this.u.acts.get(aid);
      if (a) out.push(this.activityOption(aid));
    }
    if (h.event && this.u.events.has(h.event)) {
      const ev = this.u.events.get(h.event)!;
      out.push({ kind: 'event', id: h.event, label: ev.def.title ?? h.label, enabled: this.isEligible(ev) });
    }
    if (h.endTick) {
      out.push({ kind: 'end', id: 'end', label: this.config.endTickLabel ?? `Terminer la ${this.config.tickLabel?.toLowerCase() ?? 'semaine'}`, enabled: true });
    }
    return out;
  }

  activityOption(aid: string): HubOption {
    const a = this.u.acts.get(aid)!;
    const d = a.def;
    const cost = d.cost ?? {};
    const parts: string[] = [];
    let reason: string | undefined;
    const needActions = cost.actions ?? 0;
    if (needActions) parts.push(`${needActions} ${this.config.actionsLabel?.toLowerCase() ?? 'action'}${needActions > 1 && !this.config.actionsLabel ? 's' : ''}`);
    if (needActions > this.s.actions) reason = `Plus assez d'${this.config.actionsLabel?.toLowerCase() ?? 'actions'} cette ${this.config.tickLabel?.toLowerCase() ?? 'semaine'}`;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'actions') continue;
      const st = this.u.stats.get(k);
      const label = st?.label ?? k;
      parts.push(st?.format === 'argent' ? `${fmtNumber(v)} €` : `${v} ${label.toLowerCase()}`);
      if (!reason && (this.s.stats[k] ?? 0) < v) reason = `${label} insuffisant${label.endsWith('e') ? 'e' : ''} (${v} requis)`;
    }
    if (!reason && d.maxPerTick && (this.s.actDone[aid] ?? 0) >= d.maxPerTick) reason = `Déjà fait cette ${this.config.tickLabel?.toLowerCase() ?? 'semaine'}`;
    if (!reason && a.when && !this.test(a.when)) reason = d.lockedText ?? this.humanize(a.when);
    return { kind: 'activity', id: aid, label: this.render(d.label), description: d.description ? this.render(d.description) : undefined, enabled: !reason, reason, cost: parts.join(' · ') || undefined };
  }

  /** Arriver dans un lieu : renvoie l'événement d'entrée éventuel (ajouté à la file). */
  travel(loc: string): CEvent | null {
    if (!this.u.locs.has(loc)) { this.issue(`Lieu inconnu « ${loc} »`); return null; }
    this.s.location = loc;
    const ev = this.pickEvent(`enter:${loc}`);
    if (ev) this.queue.push({ t: 'event', id: ev.def.id });
    return ev;
  }

  /** Parler à un personnage : événement prioritaire, sinon une réplique d'ambiance. */
  talk(charId: string): { event?: CEvent; bark?: string } {
    this.s.met[charId] = true;
    const ev = this.pickEvent(`talk:${charId}`);
    if (ev) { this.queue.push({ t: 'event', id: ev.def.id }); return { event: ev }; }
    const c = this.u.chars.get(charId);
    const barks = (c?.barks ?? []).filter((b) => this.testSrc(b.if, `personnage ${charId}`));
    const b = this.rng.pick(barks);
    return { bark: b ? this.render(b.text) : '…' };
  }

  doActivity(aid: string): { ok: boolean; reason?: string; feedback?: string; event?: CEvent } {
    const opt = this.activityOption(aid);
    if (!opt.enabled) return { ok: false, reason: opt.reason };
    const a = this.u.acts.get(aid)!;
    const cost = a.def.cost ?? {};
    const statFx: Stmt[] = [];
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'actions') this.s.actions -= v;
      else statFx.push({ k: 'assign', target: ['stat', k], op: '-=', e: { k: 'num', v } });
    }
    this.s.actDone[aid] = (this.s.actDone[aid] ?? 0) + 1;
    this.exec([...statFx, ...a.fx], `activité ${aid}`);
    const ev = this.pickEvent(`activity:${aid}`);
    if (ev) this.queue.push({ t: 'event', id: ev.def.id });
    return { ok: true, feedback: a.def.feedback ? this.render(a.def.feedback) : undefined, event: ev ?? undefined };
  }

  /** Utiliser un élément du décor : un événement « hotspot:id » éligible passe avant le menu d'activités. */
  useHotspot(hotspotId: string): CEvent | null {
    const ev = this.pickEvent(`hotspot:${hotspotId}`);
    if (ev) this.queue.push({ t: 'event', id: ev.def.id });
    return ev;
  }

  useHotspotEvent(eventId: string): boolean {
    const ev = this.u.events.get(eventId);
    if (!ev || !this.isEligible(ev, true)) return false;
    this.queue.push({ t: 'event', id: eventId });
    return true;
  }

  endTick() { this.queue.push({ t: 'phase', name: 'tickEnd' }); }

  // ───────────────────────────── Déroulement du temps ────────────────────

  nextJob(): Job | null {
    for (let guard = 0; guard < 2000; guard++) {
      if (this.s.pendingEnding && !this.s.ending && !this.queue.some((j) => j.t === 'ending')) {
        this.queue = [];
        this.runPhase('ending');
      }
      const job = this.queue.shift();
      if (!job) return null;
      if (job.t === 'phase') { this.runPhase(job.name); continue; }
      if (job.t === 'event') {
        const ev = this.u.events.get(job.id);
        if (!ev) { this.issue(`Événement inconnu « ${job.id} »`); continue; }
        if (!this.isEligible(ev)) continue;
        return job;
      }
      return job;
    }
    throw new SessionError('Boucle de phases infinie');
  }

  private runPhase(name: Extract<Job, { t: 'phase' }>['name']) {
    const s = this.s;
    const u = this.u;
    const ev = (list: CEvent[]): Job[] => list.map((e) => ({ t: 'event', id: e.def.id }));
    switch (name) {
      case 'tickEnd':
        this.queue.unshift(...ev(this.eligibleList('tick_end').slice(0, 4)), { t: 'phase', name: 'tickEndFx' });
        return;
      case 'tickEndFx':
        this.exec(u.onTickEnd, 'fin de semaine');
        this.queue.unshift({ t: 'summary', data: this.buildSummary() }, { t: 'phase', name: 'advance' });
        return;
      case 'advance': {
        s.time.tick++;
        s.time.week++;
        const ch = this.chapter;
        if (s.time.week > ch.def.weeks || s.vars.__finChapitre) {
          delete s.vars.__finChapitre;
          this.queue.unshift(...ev(this.eligibleList('chapter_end')), { t: 'phase', name: 'nextChapter' });
        } else this.queue.unshift({ t: 'phase', name: 'tickStart' });
        return;
      }
      case 'nextChapter': {
        const ch = this.chapter;
        this.exec(ch.onEnd, `chapitre ${ch.def.id}`);
        if (s.time.chapter + 1 >= u.chapters.length) { this.queue.unshift({ t: 'phase', name: 'ending' }); return; }
        s.time.chapter++;
        s.time.week = 1;
        const nc = this.chapter;
        this.exec(nc.onStart, `chapitre ${nc.def.id}`);
        if (nc.def.location) { s.location = nc.def.location; this.locationChanged = true; }
        this.queue.unshift({ t: 'chapter', index: s.time.chapter }, ...ev(this.eligibleList('chapter_start')), { t: 'phase', name: 'tickStart' });
        return;
      }
      case 'tickStart': {
        s.actions = this.config.actionsPerTick ?? 3;
        s.actDone = {};
        this.takeSnapshot();
        this.exec(u.onTickStart, 'début de semaine');
        const jobs: Job[] = [];
        const due = s.scheduled.filter((x) => x.due <= s.time.tick);
        s.scheduled = s.scheduled.filter((x) => x.due > s.time.tick);
        for (const d of due) {
          const e = u.events.get(d.event);
          if (e && this.isEligible(e, true)) jobs.push({ t: 'event', id: e.def.id });
        }
        jobs.push(...ev(this.eligibleList('tick_start').slice(0, this.config.maxStoryEventsPerTick ?? 2)));
        if (this.rng.chance(this.config.randomEventChance ?? 35)) {
          const pool = this.eligibleList('random');
          const r = this.rng.weighted(pool, (e) => this.weightOf(e));
          if (r) jobs.push({ t: 'event', id: r.def.id });
        }
        this.queue.unshift(...jobs, { t: 'autosave' });
        return;
      }
      case 'ending': {
        const id = this.resolveEnding();
        s.ending = id;
        s.pendingEnding = null;
        this.queue = [{ t: 'ending', id }];
        return;
      }
    }
  }

  resolveEnding(): string {
    const forced = this.s.pendingEnding;
    if (forced && forced !== '*' && this.u.endings.some((e) => e.def.id === forced)) return forced;
    for (const en of this.u.endings) if (!en.when || this.test(en.when)) return en.def.id;
    return this.u.endings[this.u.endings.length - 1]?.def.id ?? 'fin';
  }

  takeSnapshot() {
    this.s.snapshot = { stats: { ...this.s.stats }, rel: { ...this.s.rel }, journal: this.s.journal.length, tick: this.s.time.tick };
  }

  buildSummary(): WeekSummary {
    const s = this.s;
    const snap = s.snapshot;
    const stats = this.u.def.stats
      .filter((st) => st.visible !== false)
      .map((st) => ({ id: st.id, label: st.label, value: s.stats[st.id] ?? 0, delta: (s.stats[st.id] ?? 0) - (snap.stats[st.id] ?? st.initial ?? 0), format: st.format }))
      .filter((x) => Math.abs(x.delta) >= 0.5);
    const rels = this.u.def.characters
      .map((c) => ({ id: c.id, name: this.charName(c.id), value: s.rel[c.id] ?? 0, delta: (s.rel[c.id] ?? 0) - (snap.rel[c.id] ?? c.relation ?? 0) }))
      .filter((x) => x.delta !== 0);
    const entries = s.journal.slice(snap.journal).map((j) => ({ kind: j.kind, text: j.text }));
    return { tick: s.time.tick, ch: s.time.chapter + 1, wk: s.time.week, chapterTitle: this.chapter.def.title, stats, rels, entries };
  }

  // ───────────────────────────── Aide à l'affichage ──────────────────────

  humanize(e: Expr): string {
    const SYM: Record<string, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '==': '=', '!=': '≠' };
    const label = (p: string[]): string => {
      const [ns, a, b] = p;
      if (ns === 'stat') return this.u.stats.get(a)?.label ?? a;
      if (ns === 'rel') return `Relation avec ${this.firstName(a)}`;
      if (ns === 'mem') return `${this.firstName(a)} se souvient (${b})`;
      if (ns === 'connu') return `Connaître ${this.firstName(a)}`;
      if (ns === 'joueur') return a;
      if (ns === 'var' || ns === 'flag') return a.replace(/_/g, ' ');
      return p.join('.');
    };
    const val = (x: Expr): string => (x.k === 'num' ? String(x.v) : x.k === 'str' ? x.v : x.k === 'bool' ? (x.v ? 'oui' : 'non') : exprToString(x));
    if (e.k === 'bin' && (e.op === '&&' || e.op === '||')) return `${this.humanize(e.l)}${e.op === '&&' ? ' et ' : ' ou '}${this.humanize(e.r)}`;
    if (e.k === 'bin' && SYM[e.op] && e.l.k === 'path') return `${label(e.l.p)} ${SYM[e.op]} ${val(e.r)}`;
    if (e.k === 'path') return label(e.p);
    if (e.k === 'un' && e.op === '!') return `Pas : ${this.humanize(e.e)}`;
    return exprToString(e);
  }

  dateLine(): string {
    const tpl = this.config.dateLine ?? '{chapitre_titre} · Semaine {temps.semaine}/{temps.semaines}';
    return this.render(tpl.replace('{chapitre_titre}', this.chapter.def.title));
  }
}

const DEFAULT_LEVELS = [
  { min: -100, label: 'Ennemi', color: '#e0524a' },
  { min: -60, label: 'Hostile', color: '#e07a4a' },
  { min: -25, label: 'Froid', color: '#c9a25a' },
  { min: -5, label: 'Neutre', color: '#9aa3b5' },
  { min: 6, label: 'Cordial', color: '#8fc46a' },
  { min: 25, label: 'Ami', color: '#5fcf7d' },
  { min: 60, label: 'Fidèle', color: '#4fd6c4' },
];

const tplCache = new Map<string, TextPart[]>();
function parseTemplateCached(src: string): TextPart[] {
  let t = tplCache.get(src);
  if (!t) { t = parseTemplate(src); if (tplCache.size < 3000) tplCache.set(src, t); }
  return t;
}

export function seedFromString(s: string) { return hashString(s); }
