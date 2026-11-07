// ─────────────────────────────────────────────────────────────────────────────
// Simulateur : joue automatiquement des parties complètes, sans affichage.
// Sert à vérifier qu'un univers est jouable de bout en bout : fins atteintes,
// événements jamais déclenchés, erreurs d'exécution, parties bloquées.
// Des « profils de joueur » orientent les choix grâce aux #tags des choix.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng } from '../rng';
import type { CompiledUniverse } from './compile';
import type { CastChoice } from '../model/types';
import { StoryRunner } from './runner';
import { GameSession, type MetaInfo } from './session';

export interface Persona {
  id: string;
  label: string;
  /** poids ajouté aux choix portant ces tags (négatif = évite) */
  tags?: Record<string, number>;
  /** préférence d'activités */
  activities?: Record<string, number>;
  /** probabilité d'aller voir les personnages/lieux qui ont du nouveau (!) */
  curiosity?: number;
}

export const DEFAULT_PERSONAS: Persona[] = [
  { id: 'hasard', label: 'Joueur au hasard', curiosity: 0.6 },
  { id: 'curieux', label: 'Joueur curieux', curiosity: 0.95 },
];

export interface SimRunResult {
  ending: string | null;
  ticks: number;
  decisions: number;
  stuck: boolean;
  error?: string;
  fired: Record<string, number>;
  persona: string;
}

export interface SimReport {
  runs: number;
  endings: Record<string, number>;
  avgTicks: number;
  avgDecisions: number;
  fired: Record<string, number>;
  neverFired: string[];
  errors: { msg: string; count: number }[];
  stuck: number;
  crashed: number;
  durationMs: number;
}

export interface SimOptions {
  runs: number;
  seed?: number;
  personas?: Persona[];
  maxSteps?: number;
  meta?: MetaInfo;
}

function pickWeighted<T>(rng: Rng, items: T[], w: (t: T) => number): T {
  return rng.weighted(items, w) ?? items[0];
}

export function simulateOne(u: CompiledUniverse, rng: Rng, persona: Persona, maxSteps = 60000, meta?: MetaInfo, onEnd?: (g: GameSession) => void): SimRunResult & { issues: string[] } {
  const def = u.def;
  const fields: Record<string, string> = {};
  for (const f of def.creation?.fields ?? []) fields[f.id] = rng.pick(f.options)!.id;
  // Entourage tiré au hasard : proches facultatifs présents ou non, genre choisi au hasard,
  // pour que la simulation couvre toutes les combinaisons possibles à la création.
  const cast: Record<string, CastChoice> = {};
  for (const sl of def.creation?.cast ?? []) {
    const ch: CastChoice = {};
    if (sl.optional && rng.chance(sl.defaultAbsent ? 50 : 25)) ch.absent = !sl.defaultAbsent;
    if (sl.genderChoice && rng.chance(50)) ch.genre = (def.characters.find((c) => c.id === sl.id)?.look.gender === 'f' ? 'h' : 'f');
    if (Object.keys(ch).length) cast[sl.id] = ch;
  }
  const g = GameSession.create(u, { name: 'Test', fields, seed: rng.int(1, 2 ** 31), cast }, meta);
  const runner = new StoryRunner(g, true);
  let decisions = 0;
  let steps = 0;
  const choose = () => {
    const step = runner.next();
    return step;
  };
  const runEvent = () => {
    for (;;) {
      if (++steps > maxSteps) throw new Error('STUCK');
      const st = choose();
      if (st.type === 'end') return;
      if (st.type === 'choices') {
        const enabled = st.options.filter((o) => o.enabled);
        const pick = pickWeighted(rng, enabled, (o) => {
          let w = 1;
          for (const t of o.tags) w += persona.tags?.[t] ?? 0;
          return Math.max(0.05, w);
        });
        runner.choose(pick.index);
        decisions++;
      }
    }
  };

  try {
    for (;;) {
      if (++steps > maxSteps) throw new Error('STUCK');
      const job = g.nextJob();
      if (job) {
        if (job.t === 'event') { if (runner.start(job.id)) runEvent(); continue; }
        if (job.t === 'ending') {
          const en = u.endings.find((e) => e.def.id === job.id);
          if (en) { runner.startScript(`fin:${en.def.id}`, en.def.title, en.script); runEvent(); }
          break;
        }
        continue; // chapter, summary, autosave
      }
      // Phase libre : le joueur agit dans le monde
      hubTurn(g, rng, persona);
    }
  } catch (e) {
    const msg = (e as Error).message;
    return { ending: g.s.ending, ticks: g.s.time.tick, decisions, stuck: msg === 'STUCK', error: msg === 'STUCK' ? undefined : msg, fired: countFired(g), persona: persona.id, issues: g.issues.map((i) => `${i.where} : ${i.msg}`) };
  }
  onEnd?.(g);
  return { ending: g.s.ending, ticks: g.s.time.tick, decisions, stuck: false, fired: countFired(g), persona: persona.id, issues: g.issues.map((i) => `${i.where} : ${i.msg}`) };
}

function countFired(g: GameSession): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(g.s.fired)) out[k] = v.n;
  return out;
}

/** Un tour de « phase libre » : déplacements, discussions, activités, fin de semaine. */
function hubTurn(g: GameSession, rng: Rng, p: Persona) {
  const curiosity = p.curiosity ?? 0.7;
  const u = g.u;
  const locs = u.def.locations.filter((l) => g.locationAvailable(l.id));
  // 1. Lieux avec un événement d'histoire en attente
  if (rng.next() < curiosity) {
    const withStory = locs.filter((l) => g.hasEligible(`enter:${l.id}`, true) && l.id !== g.s.location);
    if (withStory.length) { g.travel(rng.pick(withStory)!.id); return; }
    // éléments du décor avec un événement d'histoire (« hotspot:id »)
    for (const l of locs) {
      const hs = (l.hotspots ?? []).filter((h) => g.testSrc(h.when) && g.hasEligible(`hotspot:${h.id}`, true));
      if (hs.length) {
        if (g.s.location !== l.id) { g.travel(l.id); return; }
        g.useHotspot(rng.pick(hs)!.id);
        return;
      }
    }
    // personnages présents dans un lieu accessible avec du nouveau
    for (const l of rng.next() < 0.5 ? locs : [...locs].reverse()) {
      const here = (l.npcs ?? []).filter((n) => g.testSrc(n.when) && g.hasEligible(`talk:${n.id}`, true));
      if (here.length) {
        if (g.s.location !== l.id) { g.travel(l.id); return; }
        g.talk(rng.pick(here)!.id);
        return;
      }
    }
    // objectifs en cours : activités qui font avancer une quête (événements marqués « important »),
    // comme le ferait un joueur qui lit son journal
    if (g.s.actions > 0) {
      for (const l of locs) for (const h of l.hotspots ?? []) {
        if (!g.testSrc(h.when)) continue;
        const act = (h.activities ?? []).find((a) => g.activityOption(a).enabled && (g.u.byKey.get(`activity:${a}`) ?? []).some((ev) => ev.def.tags?.includes('important') && g.isEligible(ev)));
        if (act) {
          if (g.s.location !== l.id) { g.travel(l.id); return; }
          g.doActivity(act);
          return;
        }
      }
    }
  }
  // 2. Activités
  if (g.s.actions > 0 && rng.next() < 0.85) {
    const options: { loc: string; act: string }[] = [];
    for (const l of locs) for (const h of l.hotspots ?? []) {
      if (!g.testSrc(h.when)) continue;
      for (const a of h.activities ?? []) if (g.activityOption(a).enabled) options.push({ loc: l.id, act: a });
    }
    if (options.length) {
      const o = pickWeighted(rng, options, (x) => 1 + (p.activities?.[x.act] ?? 0));
      if (g.s.location !== o.loc) { g.travel(o.loc); return; }
      g.doActivity(o.act);
      return;
    }
  }
  // 3. Discussion libre ou balade
  const r = rng.next();
  if (r < 0.25) {
    const l = u.locs.get(g.s.location);
    const npcs = (l?.npcs ?? []).filter((n) => g.testSrc(n.when));
    if (npcs.length) { g.talk(rng.pick(npcs)!.id); return; }
  }
  if (r < 0.4 && locs.length > 1) { g.travel(rng.pick(locs)!.id); return; }
  g.endTick();
}

export async function simulate(u: CompiledUniverse, opts: SimOptions, onProgress?: (done: number) => void): Promise<SimReport> {
  const t0 = Date.now();
  const rng = new Rng(opts.seed ?? 12345);
  const personas = opts.personas?.length ? opts.personas : DEFAULT_PERSONAS;
  const endings: Record<string, number> = {};
  const fired: Record<string, number> = {};
  const errors = new Map<string, number>();
  let ticks = 0; let decisions = 0; let stuck = 0; let crashed = 0;
  for (let i = 0; i < opts.runs; i++) {
    const persona = personas[i % personas.length];
    const r = simulateOne(u, new Rng(rng.int(1, 2 ** 31)), persona, opts.maxSteps, opts.meta);
    const key = r.ending ?? (r.stuck ? '(bloquée)' : '(interrompue)');
    endings[key] = (endings[key] ?? 0) + 1;
    for (const [k, n] of Object.entries(r.fired)) fired[k] = (fired[k] ?? 0) + n;
    for (const msg of r.issues) errors.set(msg, (errors.get(msg) ?? 0) + 1);
    if (r.error) { crashed++; errors.set(`PLANTAGE : ${r.error}`, (errors.get(`PLANTAGE : ${r.error}`) ?? 0) + 1); }
    if (r.stuck) stuck++;
    ticks += r.ticks; decisions += r.decisions;
    if (onProgress && i % 5 === 4) { onProgress(i + 1); await new Promise((res) => setTimeout(res, 0)); }
  }
  const neverFired = [...u.events.keys()].filter((id) => !fired[id]);
  return {
    runs: opts.runs, endings, avgTicks: ticks / Math.max(1, opts.runs), avgDecisions: decisions / Math.max(1, opts.runs), fired, neverFired,
    errors: [...errors.entries()].map(([msg, count]) => ({ msg, count })).sort((a, b) => b.count - a.count),
    stuck, crashed, durationMs: Date.now() - t0,
  };
}
