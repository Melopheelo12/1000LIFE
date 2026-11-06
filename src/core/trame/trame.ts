// ─────────────────────────────────────────────────────────────────────────────
// TRAME — langage de script narratif (français, indenté, inspiré d'Ink/Yarn).
//
//   @debut                       ← nœud (le premier est l'entrée)
//   moreau (colere): Tu es en retard.          ← réplique (id du personnage, émotion)
//   > Le vestiaire se tait.      ← narration
//   ~ rel.moreau -= 5; stat.moral -= 3          ← effets
//   [rel.karim >= 30] karim: Je suis avec toi.  ← ligne conditionnelle
//   si stat.frappe >= 60 / sinon si … / sinon   ← blocs conditionnels (indentés)
//   * Faire une passe #collectif ~ rel.karim += 5 -> suite   ← choix (disparaît une fois pris)
//   + [cond] Choix permanent      * (cond) Choix visible mais verrouillé
//   test stat.frappe vs 60        ← jet de compétence → si reussite / sinon
//   !anim moi frappe              ← mise en scène (ignorée en simulation)
//   appel autre_evenement         tirer pool_matchs 3       -> fin
// ─────────────────────────────────────────────────────────────────────────────
import { parseExpr, parseEffects, parseTemplate, ExprError, type Expr, type Stmt, type TextPart } from '../expr/expr';

export type Instr =
  | { k: 'line'; who: string | null; emo?: string; parts: TextPart[]; cond?: Expr; ln: number }
  | { k: 'fx'; stmts: Stmt[]; src: string; cond?: Expr; ln: number }
  | { k: 'jump'; to: string; cond?: Expr; ln: number }
  | { k: 'choices'; opts: ChoiceOpt[]; ln: number }
  | { k: 'if'; branches: { cond: Expr | null; body: Instr[] }[]; ln: number }
  | { k: 'stage'; cmd: string; args: TextPart[][]; cond?: Expr; ln: number }
  | { k: 'test'; skill: Expr; diff: Expr; cond?: Expr; ln: number }
  | { k: 'call'; event: string; cond?: Expr; ln: number }
  | { k: 'draw'; pool: string; count: Expr; cond?: Expr; ln: number };

export interface ChoiceOpt {
  id: string;
  parts: TextPart[];
  raw: string;
  show?: Expr;
  lock?: Expr;
  lockSrc?: string;
  stmts?: Stmt[];
  fxSrc?: string;
  to?: string;
  tags: string[];
  sticky: boolean;
  body: Instr[];
  ln: number;
}

export interface ParseError { line: number; msg: string; severity: 'error' | 'warning' }

export interface Script {
  nodes: Record<string, Instr[]>;
  entry: string;
  order: string[];
  errors: ParseError[];
}

interface Line { n: number; indent: number; text: string }

const SPECIAL_BARE = new Set(['reussite', 'réussite', 'succes', 'succès', 'echec', 'échec']);
const NODE_RE = /^@([\w-]+)\s*(\/\/.*)?$/;
export const SPEAKER_RE = /^([A-Za-z_][\w-]*)\s*(?:\(([^)]*)\))?\s*:\s?(.*)$/;

export function matchBracket(s: string, open: string, close: string): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Une condition entre crochets/parenthèses ? (un simple mot nu reste du texte, ex. « [Mentir] ») */
export function looksLikeCondition(inner: string): boolean {
  const t = inner.trim();
  if (!t) return false;
  if (SPECIAL_BARE.has(t.toLowerCase())) return true;
  if (/[=<>!&|(≥≤≠]/.test(t)) return true;
  if (/[A-Za-z_]\.[A-Za-z_]/.test(t)) return true;
  if (/^(non|not)\s/.test(t)) return true;
  return false;
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let brace = 0;
  for (const c of s) {
    if (quote) { if (c === quote) { quote = null; continue; } cur += c; continue; }
    if ((c === '"' || c === '«') && brace === 0) { quote = c === '«' ? '»' : '"'; continue; }
    if (c === '{') brace++;
    if (c === '}') brace--;
    if (/\s/.test(c) && brace === 0) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseTrame(source: string, lineOffset = 0): Script {
  const errors: ParseError[] = [];
  const err = (line: number, msg: string, severity: 'error' | 'warning' = 'error') =>
    errors.push({ line: line + lineOffset, msg, severity });

  const tryExpr = (src: string, ln: number): Expr | undefined => {
    try { return parseExpr(src); } catch (e) { err(ln, `Condition invalide « ${src} » : ${(e as Error).message}`); return undefined; }
  };
  const tryFx = (src: string, ln: number): Stmt[] => {
    try { return parseEffects(src); } catch (e) { err(ln, `Effet invalide « ${src} » : ${(e as Error).message}`); return []; }
  };
  const tryTpl = (src: string, ln: number): TextPart[] => {
    try { return parseTemplate(src); } catch (e) { err(ln, `Texte invalide : ${(e as ExprError).message}`); return [src]; }
  };

  // 1. Découpage en lignes significatives
  const raw = source.replace(/\r\n?/g, '\n').split('\n');
  const lines: Line[] = [];
  raw.forEach((l, idx) => {
    const expanded = l.replace(/\t/g, '  ');
    const text = expanded.trim();
    if (!text || text.startsWith('//')) return;
    lines.push({ n: idx + 1, indent: expanded.length - expanded.trimStart().length, text });
  });

  // 2. Regroupement par nœuds
  const nodeLines = new Map<string, Line[]>();
  const order: string[] = [];
  let current = 'debut';
  for (const line of lines) {
    const m = NODE_RE.exec(line.text);
    if (m) {
      current = m[1];
      if (nodeLines.has(current)) err(line.n, `Nœud « @${current} » défini deux fois`);
      else { nodeLines.set(current, []); order.push(current); }
      if (line.indent > 0) err(line.n, `Un nœud doit commencer en début de ligne`, 'warning');
      continue;
    }
    if (!nodeLines.has(current)) { nodeLines.set(current, []); order.push(current); }
    nodeLines.get(current)!.push(line);
  }

  // 3. Parsing d'un bloc indenté
  const parseCond = (text: string, ln: number): { cond?: Expr; rest: string } => {
    if (text.startsWith('[')) {
      const end = matchBracket(text, '[', ']');
      if (end > 0) {
        const inner = text.slice(1, end);
        if (looksLikeCondition(inner)) return { cond: tryExpr(inner, ln), rest: text.slice(end + 1).trim() };
      }
    }
    return { rest: text };
  };

  const parseSimple = (line: Line): Instr | null => {
    const ln = line.n;
    const { cond, rest } = parseCond(line.text, ln);
    const t = rest;
    if (t.startsWith('~')) {
      const src = t.slice(1).trim();
      return { k: 'fx', stmts: tryFx(src, ln), src, cond, ln };
    }
    if (t.startsWith('->')) {
      const to = t.slice(2).trim();
      if (!/^[\w-]+$/.test(to)) err(ln, `Cible de saut invalide « ${to} »`);
      return { k: 'jump', to, cond, ln };
    }
    if (t.startsWith('!')) {
      const parts = splitArgs(t.slice(1));
      const cmd = (parts.shift() ?? '').toLowerCase();
      if (!cmd) { err(ln, 'Commande de mise en scène vide'); return null; }
      return { k: 'stage', cmd, args: parts.map((a) => tryTpl(a, ln)), cond, ln };
    }
    if (/^test\s/i.test(t)) {
      const body = t.slice(5);
      const m = /^(.*?)\s+(?:vs|contre)\s+(.*)$/i.exec(body);
      if (!m) { err(ln, 'Syntaxe : test <compétence> vs <difficulté>'); return null; }
      const skill = tryExpr(m[1], ln);
      const diff = tryExpr(m[2], ln);
      if (!skill || !diff) return null;
      return { k: 'test', skill, diff, cond, ln };
    }
    if (/^appel\s/i.test(t)) {
      const ev = t.slice(6).trim();
      if (!/^[\w-]+$/.test(ev)) err(ln, `Identifiant d'événement invalide « ${ev} »`);
      return { k: 'call', event: ev, cond, ln };
    }
    if (/^tirer\s/i.test(t)) {
      const [pool, ...cnt] = t.slice(6).trim().split(/\s+/);
      let cs = cnt.join(' ').trim();
      if (cs.startsWith('{') && cs.endsWith('}')) cs = cs.slice(1, -1);
      const count = cs ? tryExpr(cs, ln) : { k: 'num', v: 1 } as Expr;
      return { k: 'draw', pool, count: count ?? { k: 'num', v: 1 }, cond, ln };
    }
    if (t.startsWith('>')) return { k: 'line', who: null, parts: tryTpl(t.slice(1).trim(), ln), cond, ln };
    const m = SPEAKER_RE.exec(t);
    if (m) {
      const who = m[1] === 'narrateur' ? null : m[1] === 'joueur' ? 'moi' : m[1];
      return { k: 'line', who, emo: m[2]?.trim() || undefined, parts: tryTpl(m[3], ln), cond, ln };
    }
    return { k: 'line', who: null, parts: tryTpl(t, ln), cond, ln };
  };

  const parseChoice = (line: Line): ChoiceOpt => {
    const ln = line.n;
    const sticky = line.text.startsWith('+');
    let rest = line.text.slice(1).trim();
    let show: Expr | undefined;
    let lock: Expr | undefined;
    let lockSrc: string | undefined;
    if (rest.startsWith('[')) {
      const end = matchBracket(rest, '[', ']');
      if (end > 0 && looksLikeCondition(rest.slice(1, end))) { show = tryExpr(rest.slice(1, end), ln); rest = rest.slice(end + 1).trim(); }
    } else if (rest.startsWith('(')) {
      const end = matchBracket(rest, '(', ')');
      if (end > 0) {
        const inner = rest.slice(1, end);
        if (looksLikeCondition(inner)) {
          try { lock = parseExpr(inner); lockSrc = inner; rest = rest.slice(end + 1).trim(); } catch { /* texte entre parenthèses */ }
        }
      }
    }
    let to: string | undefined;
    const arrow = rest.lastIndexOf('->');
    if (arrow >= 0 && /^\s*[\w-]+\s*$/.test(rest.slice(arrow + 2))) { to = rest.slice(arrow + 2).trim(); rest = rest.slice(0, arrow).trim(); }
    let stmts: Stmt[] | undefined;
    let fxSrc: string | undefined;
    const tilde = rest.indexOf(' ~ ');
    const tildeEnd = rest.endsWith(' ~') ? rest.length - 2 : -1;
    if (tilde >= 0) { fxSrc = rest.slice(tilde + 3).trim(); stmts = tryFx(fxSrc, ln); rest = rest.slice(0, tilde).trim(); }
    else if (tildeEnd >= 0) rest = rest.slice(0, tildeEnd).trim();
    const tags: string[] = [];
    const tagRe = /\s+#([\w-]+)\s*$/;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(' ' + rest))) { tags.unshift(tm[1]); rest = (' ' + rest).slice(0, tm.index).trim(); }
    if (!rest) err(ln, 'Choix sans texte');
    return { id: `L${ln}`, parts: tryTpl(rest, ln), raw: rest, show, lock, lockSrc, stmts, fxSrc, to, tags, sticky, body: [], ln };
  };

  const isChoice = (t: string) => /^[*+](\s|$)/.test(t);

  const parseBlock = (L: Line[], start: number, indent: number): [Instr[], number] => {
    const out: Instr[] = [];
    let i = start;
    while (i < L.length) {
      const line = L[i];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        err(line.n, 'Indentation inattendue (rattachée au bloc précédent)', 'warning');
      }
      const lvl = line.indent;
      if (isChoice(line.text)) {
        const opts: ChoiceOpt[] = [];
        while (i < L.length && L[i].indent === lvl && isChoice(L[i].text)) {
          const opt = parseChoice(L[i]);
          i++;
          if (i < L.length && L[i].indent > lvl) {
            const [body, ni] = parseBlock(L, i, L[i].indent);
            opt.body = body;
            i = ni;
          }
          opts.push(opt);
        }
        out.push({ k: 'choices', opts, ln: line.n });
        continue;
      }
      const siM = /^si\s+(.+?):?$/.exec(line.text);
      if (siM && !SPEAKER_RE.test(line.text.replace(/:$/, '')) ) {
        const branches: { cond: Expr | null; body: Instr[] }[] = [];
        const c0 = tryExpr(siM[1], line.n);
        i++;
        let body: Instr[] = [];
        if (i < L.length && L[i].indent > lvl) [body, i] = parseBlock(L, i, L[i].indent);
        else err(line.n, '« si » sans bloc indenté en dessous', 'warning');
        branches.push({ cond: c0 ?? { k: 'bool', v: false }, body });
        while (i < L.length && L[i].indent === lvl && /^sinon\b/.test(L[i].text)) {
          const t = L[i].text.replace(/:$/, '');
          const ln = L[i].n;
          i++;
          const m = /^sinon\s+si\s+(.+)$/.exec(t);
          let b: Instr[] = [];
          if (i < L.length && L[i].indent > lvl) [b, i] = parseBlock(L, i, L[i].indent);
          else err(ln, '« sinon » sans bloc indenté en dessous', 'warning');
          if (m) branches.push({ cond: tryExpr(m[1], ln) ?? { k: 'bool', v: false }, body: b });
          else { branches.push({ cond: null, body: b }); break; }
        }
        out.push({ k: 'if', branches, ln: line.n });
        continue;
      }
      if (/^sinon\b/.test(line.text)) { err(line.n, '« sinon » sans « si » correspondant'); i++; continue; }
      const ins = parseSimple(line);
      if (ins) out.push(ins);
      i++;
      // Lignes plus indentées sous une ligne simple : on les rattache (avec avertissement)
      if (i < L.length && L[i].indent > lvl && !isChoice(line.text)) {
        const [extra, ni] = parseBlock(L, i, L[i].indent);
        out.push(...extra);
        i = ni;
      }
    }
    return [out, i];
  };

  const nodes: Record<string, Instr[]> = {};
  for (const name of order) {
    const L = nodeLines.get(name)!;
    if (L.length === 0) { nodes[name] = []; continue; }
    const [instrs] = parseBlock(L, 0, L[0].indent);
    nodes[name] = instrs;
  }
  if (order.length === 0) { nodes.debut = []; order.push('debut'); }

  // 4. Vérification des sauts (un nœud doit être atteint depuis un AUTRE nœud, ou être l'entrée)
  const used = new Set<string>([order[0]]);
  const checkTarget = (to: string, ln: number, from: string) => {
    if (to === 'fin') return;
    if (!nodes[to]) err(ln, `Nœud « @${to} » introuvable`);
    if (to !== from) used.add(to);
  };
  const visit = (list: Instr[], from: string) => {
    for (const ins of list) {
      if (ins.k === 'jump') checkTarget(ins.to, ins.ln, from);
      else if (ins.k === 'choices') ins.opts.forEach((o) => { if (o.to) checkTarget(o.to, o.ln, from); visit(o.body, from); });
      else if (ins.k === 'if') ins.branches.forEach((b) => visit(b.body, from));
    }
  };
  for (const name of order) visit(nodes[name], name);
  for (const name of order) {
    if (!used.has(name)) err(nodeLines.get(name)?.[0]?.n ?? 1, `Nœud « @${name} » jamais atteint (un nœud s'arrête à sa dernière ligne : ajoute « -> ${name} » là où il doit s'enchaîner)`, 'warning');
  }

  return { nodes, entry: order[0], order, errors };
}

/** Liste plate de toutes les instructions (pour la validation et l'éditeur). */
export function eachInstr(script: Script, visit: (ins: Instr, node: string) => void): void {
  const rec = (list: Instr[], node: string) => {
    for (const ins of list) {
      visit(ins, node);
      if (ins.k === 'choices') ins.opts.forEach((o) => rec(o.body, node));
      else if (ins.k === 'if') ins.branches.forEach((b) => rec(b.body, node));
    }
  };
  for (const n of script.order) rec(script.nodes[n], n);
}
