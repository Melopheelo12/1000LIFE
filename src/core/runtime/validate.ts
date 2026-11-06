// Validation approfondie d'un univers : erreurs de syntaxe (via la compilation)
// + références cassées (personnages, lieux, stats, événements, nœuds…).
// Utilisée par l'éditeur, le build du contenu et les tests.
import { walkExpr, type Expr, type Stmt, type TextPart } from '../expr/expr';
import { eachInstr, type Script } from '../trame/trame';
import { compileUniverse, TRIGGERS_WITH_TARGET, type CompiledUniverse, type Issue } from './compile';
import { EFFECT_FUNCTIONS, EXPR_FUNCTIONS, NAMESPACES } from './session';
import type { UniverseDef } from '../model/types';

const FN_FR = new Set([...EXPR_FUNCTIONS, ...EFFECT_FUNCTIONS, 'round', 'floor', 'ceil', 'clamp', 'rand', 'odds', 'seen', 'count', 'since', 'chose', 'pick', 'list', 'listPick', 'size', 'level', 'between', 'remember', 'forget', 'meet', 'schedule', 'cancel', 'end', 'notify', 'news', 'objective', 'complete', 'fail', 'travel', 'nextChapter', 'format', 'drift']);
export const STAGE_COMMANDS = new Set([
  'lieu', 'moment', 'placer', 'aller', 'courir', 'anim', 'face', 'emote', 'entrer', 'sortir', 'figurant', 'retirer',
  'objet', 'ballon', 'camera', 'fx', 'son', 'pause', 'titre', 'fondu', 'preset', 'equipe', 'rappel', 'echo', 'meteo', 'tenue',
]);
const SPECIAL_SYMBOLS = new Set(['reussite', 'réussite', 'succes', 'succès', 'echec', 'échec', 'lieu', 'chapitre', 'actions']);

export interface ValidationReport {
  issues: Issue[];
  errors: number;
  warnings: number;
  compiled: CompiledUniverse;
}

export function validateUniverse(def: UniverseDef): ValidationReport {
  const u = compileUniverse(def);
  const issues: Issue[] = [...u.issues];
  const add = (i: Issue) => issues.push(i);

  // Variables écrites quelque part (pour signaler les lectures de variables jamais définies)
  const written = new Set<string>(Object.keys(def.vars ?? {}));
  const symbols = new Set<string>([
    ...u.chars.keys(), ...u.locs.keys(), ...u.events.keys(), ...u.stats.keys(), ...u.acts.keys(),
    ...def.chapters.map((c) => c.id), ...def.endings.map((e) => e.id), 'moi',
    ...(def.creation?.fields ?? []).flatMap((f) => f.options.map((o) => o.id)),
    ...Object.keys(def.lists ?? {}),
  ]);
  for (const v of Object.values(def.vars ?? {})) if (typeof v === 'string' && v) symbols.add(v);
  const collectWrites = (stmts: Stmt[]) => stmts.forEach((s) => {
    if (s.k === 'assign' && (s.target[0] === 'var' || s.target[0] === 'flag')) {
      written.add(s.target[1]);
      // les valeurs texte affectées deviennent des « symboles » connus (ex. var.club_id = "rivemont")
      walkExpr(s.e, (n) => { if (n.k === 'str' && /^[\w-]+$/.test(n.v)) symbols.add(n.v); });
    }
  });
  u.chapters.forEach((c) => { collectWrites(c.onStart); collectWrites(c.onEnd); });
  u.acts.forEach((a) => collectWrites(a.fx));
  collectWrites(u.onTickStart); collectWrites(u.onTickEnd);
  u.creationFx.forEach(collectWrites);
  const scripts: { kind: Issue['kind']; id: string; script: Script }[] = [
    ...[...u.events.values()].map((e) => ({ kind: 'evenement' as const, id: e.def.id, script: e.script })),
    ...u.endings.map((e) => ({ kind: 'fin' as const, id: e.def.id, script: e.script })),
  ];
  for (const sc of scripts) {
    eachInstr(sc.script, (ins) => {
      if (ins.k === 'fx') collectWrites(ins.stmts);
      if (ins.k === 'choices') ins.opts.forEach((o) => o.stmts && collectWrites(o.stmts));
    });
  }

  const pools = new Set<string>();
  for (const e of u.events.values()) if (e.trig === 'pool') pools.add(e.target);

  const checkExpr = (e: Expr | undefined, where: string, kind: Issue['kind'], id: string, line?: number) => {
    if (!e) return;
    walkExpr(e, (n) => {
      if (n.k === 'path') checkPath(n.p, where, kind, id, line);
      if (n.k === 'call' && !FN_FR.has(n.f)) add({ where, kind, id, line, msg: `Fonction inconnue « ${n.f} »`, severity: 'error' });
      if (n.k === 'call' && ['vu', 'nb', 'depuis', 'seen', 'count', 'since', 'planifie'].includes(n.f) && n.args[0]) {
        const a = n.args[0];
        const name = a.k === 'str' ? a.v : a.k === 'path' && a.p.length === 1 ? a.p[0] : null;
        if (name && !u.events.has(name)) add({ where, kind, id, line, msg: `Événement inconnu « ${name} » dans ${n.f}()`, severity: 'warning' });
      }
    });
  };
  const checkPath = (p: string[], where: string, kind: Issue['kind'], id: string, line?: number) => {
    const [ns, a] = p;
    const w = (msg: string, severity: 'error' | 'warning' = 'warning') => add({ where, kind, id, line, msg, severity });
    if (p.length === 1) {
      if (!NAMESPACES.includes(ns) && !SPECIAL_SYMBOLS.has(ns) && !symbols.has(ns)) w(`Mot inconnu « ${ns} » (guillemets oubliés ?)`);
      return;
    }
    switch (ns) {
      case 'stat': if (!u.stats.has(a)) w(`Statistique inconnue « ${a} »`, 'error'); return;
      case 'rel': case 'mem': case 'connu': if (!u.chars.has(a)) w(`Personnage inconnu « ${a} »`, 'error'); return;
      case 'var': case 'flag': if (!written.has(a)) w(`Variable « ${a} » jamais définie (vaut 0)`); return;
      case 'joueur': case 'temps': case 'meta': case 'objectif': case 'tag': case 'player': case 'time': case 'met': return;
    }
    w(`Chemin inconnu « ${p.join('.')} »`, 'error');
  };
  const checkStmts = (stmts: Stmt[] | undefined, where: string, kind: Issue['kind'], id: string, line?: number) => {
    for (const st of stmts ?? []) {
      if (st.k === 'assign') {
        const [ns, a] = st.target;
        if (ns === 'stat' && !u.stats.has(a)) add({ where, kind, id, line, msg: `Statistique inconnue « ${a} »`, severity: 'error' });
        else if (ns === 'rel' && !u.chars.has(a)) add({ where, kind, id, line, msg: `Personnage inconnu « ${a} »`, severity: 'error' });
        else if (!['stat', 'rel', 'var', 'flag', 'joueur', 'player', 'actions', 'connu'].includes(ns)) add({ where, kind, id, line, msg: `Cible non modifiable « ${st.target.join('.')} »`, severity: 'error' });
        checkExpr(st.e, where, kind, id, line);
      } else {
        if (!FN_FR.has(st.f)) { add({ where, kind, id, line, msg: `Effet inconnu « ${st.f} »`, severity: 'error' }); continue; }
        st.args.forEach((x) => { if (x.k !== 'path' || x.p.length > 1) checkExpr(x, where, kind, id, line); });
        const arg0 = st.args[0];
        const name = arg0 ? (arg0.k === 'str' ? arg0.v : arg0.k === 'path' && arg0.p.length === 1 ? arg0.p[0] : null) : null;
        if (name) {
          if (['souvenir', 'oublier', 'rencontrer', 'remember', 'forget', 'meet', 'eloigner', 'drift'].includes(st.f) && !u.chars.has(name)) add({ where, kind, id, line, msg: `Personnage inconnu « ${name} »`, severity: 'error' });
          if (['planifier', 'annuler', 'schedule', 'cancel'].includes(st.f) && !u.events.has(name)) add({ where, kind, id, line, msg: `Événement inconnu « ${name} »`, severity: 'error' });
          if (['aller', 'travel'].includes(st.f) && !u.locs.has(name)) add({ where, kind, id, line, msg: `Lieu inconnu « ${name} »`, severity: 'error' });
          if (['fin', 'end'].includes(st.f) && !u.endings.some((e) => e.def.id === name)) add({ where, kind, id, line, msg: `Fin inconnue « ${name} »`, severity: 'error' });
        }
      }
    }
  };
  const checkParts = (parts: TextPart[], where: string, kind: Issue['kind'], id: string, line?: number) => {
    for (const p of parts) if (typeof p !== 'string' && !('g' in p)) checkExpr(p, where, kind, id, line);
  };

  for (const sc of scripts) {
    const where = `${sc.kind === 'fin' ? 'fin' : 'événement'} ${sc.id}`;
    eachInstr(sc.script, (ins) => {
      const ln = ins.ln;
      if ('cond' in ins) checkExpr(ins.cond, where, sc.kind, sc.id, ln);
      switch (ins.k) {
        case 'line':
          if (ins.who && ins.who !== 'moi' && !u.chars.has(ins.who)) add({ where, kind: sc.kind, id: sc.id, line: ln, msg: `Personnage inconnu « ${ins.who} » (utilise « > » pour la narration)`, severity: 'warning' });
          checkParts(ins.parts, where, sc.kind, sc.id, ln);
          break;
        case 'fx': checkStmts(ins.stmts, where, sc.kind, sc.id, ln); break;
        case 'if': ins.branches.forEach((b) => checkExpr(b.cond ?? undefined, where, sc.kind, sc.id, ln)); break;
        case 'test': checkExpr(ins.skill, where, sc.kind, sc.id, ln); checkExpr(ins.diff, where, sc.kind, sc.id, ln); break;
        case 'call': if (!u.events.has(ins.event)) add({ where, kind: sc.kind, id: sc.id, line: ln, msg: `Événement appelé inconnu « ${ins.event} »`, severity: 'error' }); break;
        case 'draw': if (!pools.has(ins.pool)) add({ where, kind: sc.kind, id: sc.id, line: ln, msg: `Réserve « ${ins.pool} » vide (aucun événement « pool:${ins.pool} »)`, severity: 'error' }); break;
        case 'stage':
          if (!STAGE_COMMANDS.has(ins.cmd)) add({ where, kind: sc.kind, id: sc.id, line: ln, msg: `Mise en scène inconnue « !${ins.cmd} »`, severity: 'warning' });
          if (ins.cmd === 'lieu') {
            const a = ins.args[0];
            if (a && a.length === 1 && typeof a[0] === 'string' && !u.locs.has(a[0])) add({ where, kind: sc.kind, id: sc.id, line: ln, msg: `Lieu inconnu « ${a[0]} »`, severity: 'error' });
          }
          if (ins.cmd === 'rappel') {
            const a = ins.args[0];
            const txt = a && typeof a[0] === 'string' ? a[0] : '';
            const c = txt.split('.')[0];
            if (c && !u.chars.has(c)) add({ where, kind: sc.kind, id: sc.id, line: ln, msg: `Personnage inconnu dans !rappel « ${c} »`, severity: 'error' });
          }
          break;
        case 'choices':
          ins.opts.forEach((o) => {
            checkExpr(o.show, where, sc.kind, sc.id, o.ln);
            checkExpr(o.lock, where, sc.kind, sc.id, o.ln);
            checkStmts(o.stmts, where, sc.kind, sc.id, o.ln);
            checkParts(o.parts, where, sc.kind, sc.id, o.ln);
          });
          break;
      }
    });
  }

  // Événements : cibles des déclencheurs
  for (const e of u.events.values()) {
    const where = `événement ${e.def.id}`;
    checkExpr(e.when, where, 'evenement', e.def.id);
    if (TRIGGERS_WITH_TARGET.has(e.trig) && !e.target) add({ where, kind: 'evenement', id: e.def.id, msg: `Le déclencheur « ${e.trig} » demande une cible (ex. ${e.trig}:identifiant)`, severity: 'error' });
    if (e.trig === 'enter' && e.target && !u.locs.has(e.target)) add({ where, kind: 'evenement', id: e.def.id, msg: `Lieu inconnu « ${e.target} »`, severity: 'error' });
    if (e.trig === 'talk' && e.target && !u.chars.has(e.target)) add({ where, kind: 'evenement', id: e.def.id, msg: `Personnage inconnu « ${e.target} »`, severity: 'error' });
    if (e.trig === 'activity' && e.target && !u.acts.has(e.target)) add({ where, kind: 'evenement', id: e.def.id, msg: `Activité inconnue « ${e.target} »`, severity: 'error' });
    if (e.trig === 'hotspot' && e.target && !def.locations.some((l) => (l.hotspots ?? []).some((h) => h.id === e.target))) add({ where, kind: 'evenement', id: e.def.id, msg: `Élément du décor inconnu « ${e.target} »`, severity: 'error' });
    for (const c of e.def.chapters ?? []) if (!def.chapters.some((ch) => ch.id === c)) add({ where, kind: 'evenement', id: e.def.id, msg: `Chapitre inconnu « ${c} »`, severity: 'error' });
  }
  // Lieux
  for (const l of def.locations) {
    const where = `lieu ${l.id}`;
    for (const x of l.exits ?? []) if (!u.locs.has(x.to)) add({ where, kind: 'lieu', id: l.id, msg: `Sortie vers un lieu inconnu « ${x.to} »`, severity: 'error' });
    for (const n of l.npcs ?? []) if (!u.chars.has(n.id)) add({ where, kind: 'lieu', id: l.id, msg: `Personnage inconnu « ${n.id} »`, severity: 'error' });
    for (const h of l.hotspots ?? []) {
      for (const a of h.activities ?? []) if (!u.acts.has(a)) add({ where, kind: 'lieu', id: l.id, msg: `Activité inconnue « ${a} » (élément ${h.id})`, severity: 'error' });
      if (h.event && !u.events.has(h.event)) add({ where, kind: 'lieu', id: l.id, msg: `Événement inconnu « ${h.event} » (élément ${h.id})`, severity: 'error' });
    }
    for (const src of [l.when, ...(l.npcs ?? []).map((n) => n.when), ...(l.exits ?? []).map((n) => n.when), ...(l.hotspots ?? []).map((n) => n.when), ...(l.props ?? []).map((p) => p.when)]) {
      if (src) checkExpr(u.cond(src, where), where, 'lieu', l.id);
    }
  }
  // Activités, chapitres, création, fins
  for (const a of u.acts.values()) {
    checkExpr(a.when, `activité ${a.def.id}`, 'activite', a.def.id);
    checkStmts(a.fx, `activité ${a.def.id}`, 'activite', a.def.id);
    for (const k of Object.keys(a.def.cost ?? {})) if (k !== 'actions' && !u.stats.has(k)) add({ where: `activité ${a.def.id}`, kind: 'activite', id: a.def.id, msg: `Coût sur une statistique inconnue « ${k} »`, severity: 'error' });
  }
  for (const c of u.chapters) {
    checkStmts(c.onStart, `chapitre ${c.def.id}`, 'chapitre', c.def.id);
    checkStmts(c.onEnd, `chapitre ${c.def.id}`, 'chapitre', c.def.id);
    if (c.def.location && !u.locs.has(c.def.location)) add({ where: `chapitre ${c.def.id}`, kind: 'chapitre', id: c.def.id, msg: `Lieu inconnu « ${c.def.location} »`, severity: 'error' });
    if (!(c.def.weeks >= 1)) add({ where: `chapitre ${c.def.id}`, kind: 'chapitre', id: c.def.id, msg: 'Un chapitre dure au moins 1 semaine', severity: 'error' });
  }
  u.creationFx.forEach((fx, key) => checkStmts(fx, `création ${key}`, 'creation', key));
  for (const en of u.endings) checkExpr(en.when, `fin ${en.def.id}`, 'fin', en.def.id);
  if (!u.endings.length) add({ where: 'univers', kind: 'univers', msg: 'Aucune fin définie', severity: 'error' });
  else if (u.endings.every((e) => e.when)) add({ where: 'univers', kind: 'univers', msg: 'Aucune fin « par défaut » (sans condition) : ajoute-en une pour garantir une conclusion', severity: 'warning' });
  for (const l of def.locations) if (!(l.exits ?? []).length && def.locations.length > 1) add({ where: `lieu « ${l.id} »`, kind: 'lieu', id: l.id, msg: 'Aucune sortie : le joueur ne pourra quitter ce lieu qu\'avec la carte', severity: 'warning' });
  // Une porte verrouillée ne sert à rien si le lieu reste ouvert sur la carte :
  // on prévient quand TOUTES les portes qui mènent à un lieu sont conditionnelles
  // alors que le lieu lui-même n'a aucune condition (donc toujours sur la carte).
  for (const to of def.locations) {
    if (to.when?.trim() || to.id === def.start.location) continue;
    const doors = def.locations.flatMap((l) => (l.exits ?? []).filter((e) => e.to === to.id).map((e) => ({ from: l.id, when: e.when?.trim() })));
    if (doors.length && doors.every((d) => d.when)) add({ where: `lieu « ${to.id} »`, kind: 'lieu', id: to.id, msg: `Toutes les portes vers ce lieu sont verrouillées (« ${doors[0].when} »), mais il reste accessible depuis la carte : donne-lui la même condition`, severity: 'warning' });
  }
  if (!def.locations.some((l) => (l.hotspots ?? []).some((h) => h.endTick))) add({ where: 'univers', kind: 'univers', msg: 'Aucun élément de décor ne termine la semaine (case « Termine la semaine » d\'un élément interactif) : le joueur ne pourra pas avancer dans le temps', severity: 'error' });
  if (!u.locs.has(def.start.location)) add({ where: 'univers', kind: 'univers', msg: `Lieu de départ inconnu « ${def.start.location} »`, severity: 'error' });
  if (def.start.event && !u.events.has(def.start.event)) add({ where: 'univers', kind: 'univers', msg: `Événement de départ inconnu « ${def.start.event} »`, severity: 'error' });
  for (const id of def.config?.hud ?? []) if (!u.stats.has(id)) add({ where: 'univers', kind: 'univers', msg: `Statistique inconnue dans le HUD « ${id} »`, severity: 'warning' });
  // Événements planifiés jamais planifiés
  const scheduledRefs = new Set<string>();
  const scanSched = (stmts: Stmt[]) => stmts.forEach((s) => { if (s.k === 'call' && ['planifier', 'schedule'].includes(s.f) && s.args[0]) { const a = s.args[0]; scheduledRefs.add(a.k === 'str' ? a.v : a.k === 'path' ? a.p[0] : ''); } });
  for (const sc of scripts) eachInstr(sc.script, (ins) => { if (ins.k === 'fx') scanSched(ins.stmts); if (ins.k === 'choices') ins.opts.forEach((o) => o.stmts && scanSched(o.stmts)); });
  u.acts.forEach((a) => scanSched(a.fx));
  for (const e of u.events.values()) if (e.trig === 'scheduled' && !scheduledRefs.has(e.def.id)) add({ where: `événement ${e.def.id}`, kind: 'evenement', id: e.def.id, msg: 'Événement « planifié » que rien ne planifie', severity: 'warning' });

  // dédoublonnage
  const seen = new Set<string>();
  const unique = issues.filter((i) => { const k = `${i.where}|${i.line}|${i.msg}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { issues: unique, errors: unique.filter((i) => i.severity === 'error').length, warnings: unique.filter((i) => i.severity === 'warning').length, compiled: u };
}
