// ─────────────────────────────────────────────────────────────────────────────
// Langage d'expressions sûr (aucun eval) utilisé partout :
//   conditions   : stat.frappe >= 60 et rel.karim > 20 ou non var.blesse
//   effets       : stat.moral += 5; rel.karim -= 10; souvenir(karim, "trahi", "Tu l'as dénoncé")
//   interpolation: « Bravo {joueur.nom} ! »
// Lexer → parser de Pratt → AST → évaluation via un Scope fourni par la session.
// ─────────────────────────────────────────────────────────────────────────────
import type { Value } from '../model/types';

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'path'; p: string[] }
  | { k: 'un'; op: '!' | '-'; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'tern'; c: Expr; a: Expr; b: Expr }
  | { k: 'call'; f: string; args: Expr[] };

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=';
export type Stmt =
  | { k: 'assign'; target: string[]; op: AssignOp; e: Expr }
  | { k: 'call'; f: string; args: Expr[] };

export class ExprError extends Error {
  constructor(message: string, public pos = 0) { super(message); }
}

interface Tok { t: 'num' | 'str' | 'id' | 'op' | 'eof'; v: string; pos: number }

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '+', '-', '*', '/', '%', '(', ')', ',', '?', ':', '!', '<', '>', '=', ';'];
const ID_START = /[A-Za-z_À-ɏ]/;
const ID_PART = /[A-Za-z0-9_À-ɏ]/;
const KEYWORD_OPS: Record<string, string> = { et: '&&', and: '&&', ou: '||', or: '||', non: '!', not: '!' };
const KEYWORD_BOOL: Record<string, boolean> = { vrai: true, true: true, faux: false, false: false };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: 'num', v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === '«') {
      const close = c === '«' ? '»' : c;
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== close) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
        s += src[j++];
      }
      if (j >= src.length) throw new ExprError('Chaîne de texte non fermée', i);
      toks.push({ t: 'str', v: close === '»' ? s.trim() : s, pos: i });
      i = j + 1;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < src.length && (ID_PART.test(src[j]) || (src[j] === '.' && ID_START.test(src[j + 1] ?? '') ) || (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')))) j++;
      const word = src.slice(i, j);
      const low = word.toLowerCase();
      if (KEYWORD_OPS[low]) toks.push({ t: 'op', v: KEYWORD_OPS[low], pos: i });
      else if (low in KEYWORD_BOOL) toks.push({ t: 'id', v: KEYWORD_BOOL[low] ? '#true' : '#false', pos: i });
      else toks.push({ t: 'id', v: word, pos: i });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { toks.push({ t: 'op', v: op, pos: i }); i += op.length; continue; }
    if (c === '≥') { toks.push({ t: 'op', v: '>=', pos: i }); i++; continue; }
    if (c === '≤') { toks.push({ t: 'op', v: '<=', pos: i }); i++; continue; }
    if (c === '≠') { toks.push({ t: 'op', v: '!=', pos: i }); i++; continue; }
    throw new ExprError(`Caractère inattendu « ${c} »`, i);
  }
  toks.push({ t: 'eof', v: '', pos: src.length });
  return toks;
}

const PREC: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

class Parser {
  i = 0;
  constructor(public toks: Tok[]) {}
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  isOp(v: string) { const t = this.peek(); return t.t === 'op' && t.v === v; }
  expect(v: string) {
    const t = this.next();
    if (t.t !== 'op' || t.v !== v) throw new ExprError(`« ${v} » attendu${t.t === 'eof' ? ' (fin inattendue)' : ` au lieu de « ${t.v} »`}`, t.pos);
  }
  expr(): Expr {
    const c = this.binary(0);
    if (this.isOp('?')) {
      this.next();
      const a = this.expr();
      this.expect(':');
      const b = this.expr();
      return { k: 'tern', c, a, b };
    }
    return c;
  }
  binary(minPrec: number): Expr {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op') break;
      const p = PREC[t.v];
      if (p === undefined || p <= minPrec) break;
      this.next();
      const right = this.binary(p);
      left = { k: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  }
  unary(): Expr {
    if (this.isOp('!')) { this.next(); return { k: 'un', op: '!', e: this.unary() }; }
    if (this.isOp('-')) { this.next(); return { k: 'un', op: '-', e: this.unary() }; }
    if (this.isOp('+')) { this.next(); return this.unary(); }
    return this.primary();
  }
  primary(): Expr {
    const t = this.next();
    if (t.t === 'num') {
      const v = Number(t.v);
      if (Number.isNaN(v)) throw new ExprError(`Nombre invalide « ${t.v} »`, t.pos);
      return { k: 'num', v };
    }
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'id') {
      if (t.v === '#true') return { k: 'bool', v: true };
      if (t.v === '#false') return { k: 'bool', v: false };
      if (this.isOp('(')) {
        this.next();
        const args: Expr[] = [];
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.expr());
            if (this.isOp(',')) { this.next(); continue; }
            break;
          }
        }
        this.expect(')');
        return { k: 'call', f: t.v, args };
      }
      return { k: 'path', p: t.v.split('.') };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = this.expr();
      this.expect(')');
      return e;
    }
    if (t.t === 'eof') throw new ExprError('Expression incomplète', t.pos);
    throw new ExprError(`Symbole inattendu « ${t.v} »`, t.pos);
  }
}

const exprCache = new Map<string, Expr>();

export function parseExpr(src: string): Expr {
  const cached = exprCache.get(src);
  if (cached) return cached;
  const p = new Parser(tokenize(src));
  const e = p.expr();
  const t = p.peek();
  if (t.t !== 'eof') throw new ExprError(`Symbole en trop « ${t.v} »`, t.pos);
  if (exprCache.size < 5000) exprCache.set(src, e);
  return e;
}

export function parseEffects(src: string): Stmt[] {
  const p = new Parser(tokenize(src));
  const out: Stmt[] = [];
  while (p.peek().t !== 'eof') {
    if (p.isOp(';')) { p.next(); continue; }
    const t = p.next();
    if (t.t !== 'id') throw new ExprError(`Instruction invalide près de « ${t.v || 'fin'} »`, t.pos);
    if (p.isOp('(')) {
      p.i--;
      const e = p.primary();
      if (e.k !== 'call') throw new ExprError('Appel de fonction attendu', t.pos);
      out.push({ k: 'call', f: e.f, args: e.args });
    } else {
      const opTok = p.next();
      if (opTok.t !== 'op' || !['=', '+=', '-=', '*=', '/='].includes(opTok.v)) {
        throw new ExprError(`« = », « += » ou « -= » attendu après « ${t.v} »`, opTok.pos);
      }
      out.push({ k: 'assign', target: t.v.split('.'), op: opTok.v as AssignOp, e: p.expr() });
    }
    if (!p.isOp(';') && p.peek().t !== 'eof') throw new ExprError(`« ; » attendu entre deux effets`, p.peek().pos);
  }
  return out;
}

// ───────────────────────────── Évaluation ──────────────────────────────────

export interface Scope {
  get(path: string[]): Value;
  call(name: string, args: Value[]): Value;
}

export function toNum(v: Value | undefined | null): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}
export function toBool(v: Value | undefined | null): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '' && v !== '0' && v !== 'false' && v !== 'faux';
  return false;
}
export function toStr(v: Value | undefined | null): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10).replace('.', ',');
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  return v;
}

function looseEq(a: Value, b: Value): boolean {
  if (typeof a === typeof b) return a === b;
  // Une variable jamais définie vaut 0 : on la considère égale à "" et à faux.
  const emptyA = a === '' || a === 0 || a === false;
  const emptyB = b === '' || b === 0 || b === false;
  if (emptyA && emptyB) return true;
  if (typeof a === 'string' || typeof b === 'string') {
    const s = (typeof a === 'string' ? a : b) as string;
    const o = typeof a === 'string' ? b : a;
    const n = Number(s);
    return s.trim() !== '' && !Number.isNaN(n) && n === toNum(o);
  }
  return toNum(a) === toNum(b);
}

export function evaluate(e: Expr, s: Scope): Value {
  switch (e.k) {
    case 'num': return e.v;
    case 'str': return e.v;
    case 'bool': return e.v;
    case 'path': return s.get(e.p);
    case 'un': return e.op === '!' ? !toBool(evaluate(e.e, s)) : -toNum(evaluate(e.e, s));
    case 'tern': return toBool(evaluate(e.c, s)) ? evaluate(e.a, s) : evaluate(e.b, s);
    case 'call': return s.call(e.f, e.args.map((a) => evaluate(a, s)));
    case 'bin': {
      if (e.op === '&&') return toBool(evaluate(e.l, s)) && toBool(evaluate(e.r, s));
      if (e.op === '||') return toBool(evaluate(e.l, s)) || toBool(evaluate(e.r, s));
      const a = evaluate(e.l, s);
      const b = evaluate(e.r, s);
      switch (e.op) {
        case '==': return looseEq(a, b);
        case '!=': return !looseEq(a, b);
        case '<': return toNum(a) < toNum(b);
        case '<=': return toNum(a) <= toNum(b);
        case '>': return toNum(a) > toNum(b);
        case '>=': return toNum(a) >= toNum(b);
        case '+': return typeof a === 'string' || typeof b === 'string' ? toStr(a) + toStr(b) : toNum(a) + toNum(b);
        case '-': return toNum(a) - toNum(b);
        case '*': return toNum(a) * toNum(b);
        case '/': { const d = toNum(b); return d === 0 ? 0 : toNum(a) / d; }
        case '%': { const d = toNum(b); return d === 0 ? 0 : toNum(a) % d; }
      }
      throw new ExprError(`Opérateur inconnu ${e.op}`);
    }
  }
}

/** Parcourt un AST (pour la validation : chemins et fonctions référencés). */
export function walkExpr(e: Expr, visit: (n: Expr) => void): void {
  visit(e);
  switch (e.k) {
    case 'un': walkExpr(e.e, visit); break;
    case 'bin': walkExpr(e.l, visit); walkExpr(e.r, visit); break;
    case 'tern': walkExpr(e.c, visit); walkExpr(e.a, visit); walkExpr(e.b, visit); break;
    case 'call': e.args.forEach((a) => walkExpr(a, visit)); break;
  }
}

/** Reconstitue une expression lisible (pour l'affichage des conditions). */
export function exprToString(e: Expr): string {
  switch (e.k) {
    case 'num': return String(e.v);
    case 'str': return JSON.stringify(e.v);
    case 'bool': return e.v ? 'vrai' : 'faux';
    case 'path': return e.p.join('.');
    case 'un': return (e.op === '!' ? 'non ' : '-') + exprToString(e.e);
    case 'tern': return `${exprToString(e.c)} ? ${exprToString(e.a)} : ${exprToString(e.b)}`;
    case 'call': return `${e.f}(${e.args.map(exprToString).join(', ')})`;
    case 'bin': return `${exprToString(e.l)} ${e.op === '&&' ? 'et' : e.op === '||' ? 'ou' : e.op} ${exprToString(e.r)}`;
  }
}

// ─────────────────────────── Interpolation de texte ─────────────────────────

export type TextPart = string | Expr | { g: [string, string]; who?: string };

/**
 * Découpe « Salut {joueur.nom} » en morceaux.
 * [[prêt|prête]] = accord selon le genre du joueur ;
 * [[ines:il|elle]] = accord selon le genre du personnage « ines » (choisi à la création).
 */
export function parseTemplate(src: string): TextPart[] {
  const parts: TextPart[] = [];
  let buf = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '{' && src[i + 1] === '{') { buf += '{'; i += 2; continue; }
    if (c === '}' && src[i + 1] === '}') { buf += '}'; i += 2; continue; }
    if (c === '[' && src[i + 1] === '[') {
      const end = src.indexOf(']]', i + 2);
      const inner = end > 0 ? src.slice(i + 2, end) : '';
      const bar = inner.indexOf('|');
      if (end > 0 && bar >= 0) {
        if (buf) { parts.push(buf); buf = ''; }
        const left = inner.slice(0, bar);
        const m = /^([a-z_][a-z0-9_]*):(.*)$/s.exec(left);
        parts.push(m ? { g: [m[2], inner.slice(bar + 1)], who: m[1] } : { g: [left, inner.slice(bar + 1)] });
        i = end + 2;
        continue;
      }
    }
    if (c === '{') {
      let depth = 1;
      let j = i + 1;
      let inStr: string | null = null;
      while (j < src.length && depth > 0) {
        const d = src[j];
        if (inStr) { if (d === inStr) inStr = null; }
        else if (d === '"' || d === "'") inStr = d;
        else if (d === '{') depth++;
        else if (d === '}') depth--;
        j++;
      }
      if (depth !== 0) throw new ExprError('Accolade « { » non fermée dans le texte', i);
      if (buf) { parts.push(buf); buf = ''; }
      parts.push(parseExpr(src.slice(i + 1, j - 1)));
      i = j;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf) parts.push(buf);
  return parts;
}

/** feminine : genre du joueur (booléen) ou fonction (personnage → féminin ?) pour les accords [[id:…|…]]. */
export function renderTemplate(parts: TextPart[], s: Scope, feminine: boolean | ((who?: string) => boolean) = false): string {
  let out = '';
  const fem = typeof feminine === 'function' ? feminine : (who?: string) => (who && who !== 'moi' ? false : feminine);
  for (const p of parts) {
    if (typeof p === 'string') out += p;
    else if ('g' in p) out += fem(p.who) ? p.g[1] : p.g[0];
    else out += toStr(evaluate(p, s));
  }
  return out;
}
