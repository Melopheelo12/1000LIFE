// Éditeur de scripts Trame : coloration, numéros de ligne, erreurs en direct,
// plan des nœuds, assistants d'insertion (réplique, choix, effet, test, condition)
// et aide-mémoire du langage.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { UniverseDef } from '../../core/model/types';
import type { Issue } from '../../core/runtime/compile';
import { parseTrame, matchBracket, looksLikeCondition, type Instr, type Script } from '../../core/trame/trame';
import { EMOTIONS } from '../../engine/gfx/portrait';
import { ANIMS } from '../../engine/gfx/character';
import { codeError, val } from './fields';

const LH = 20; // hauteur de ligne (px), identique en CSS

// ───────────────────────────── Coloration ─────────────────────────────────

const escH = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sp = (cls: string, s: string) => (s ? `<i class="t-${cls}">${escH(s)}</i>` : '');
const hlText = (s: string) => s.split(/(\{[^{}]*\}|\[\[[^\]]*\]\])/).map((p, i) => (i % 2 ? sp('x', p) : escH(p))).join('');

export function highlightLine(line: string, chars: Set<string>): string {
  const m = /^(\s*)(.*)$/.exec(line)!;
  let out = escH(m[1]);
  let t = m[2];
  if (!t) return out;
  if (t.startsWith('//')) return out + sp('c', t);
  if (t.startsWith('@')) return out + sp('n', t);
  const choice = /^[*+](\s|$)/.test(t);
  if (choice) { const mk = /^[*+]\s*/.exec(t)![0]; out += sp('ch', mk); t = t.slice(mk.length); }
  const brackets: [string, string][] = choice ? [['[', ']'], ['(', ')']] : [['[', ']']];
  for (const [o, c] of brackets) {
    if (!t.startsWith(o)) continue;
    const end = matchBracket(t, o, c);
    if (end > 0 && looksLikeCondition(t.slice(1, end))) { out += sp(o === '(' ? 'lock' : 'k', t.slice(0, end + 1)); t = t.slice(end + 1); }
    break;
  }
  if (choice) {
    let target = '';
    const a = t.lastIndexOf('->');
    if (a >= 0 && /^\s*[\w-]+\s*$/.test(t.slice(a + 2))) { target = t.slice(a); t = t.slice(0, a); }
    let fx = '';
    const ti = t.indexOf(' ~ ');
    if (ti >= 0) { fx = t.slice(ti); t = t.slice(0, ti); }
    let tags = '';
    const tm = /((?:\s+#[\w-]+)+)\s*$/.exec(t);
    if (tm) { tags = t.slice(tm.index); t = t.slice(0, tm.index); }
    return out + hlText(t) + sp('tag', tags) + sp('fx', fx) + sp('j', target);
  }
  if (t.startsWith('~')) return out + sp('fx', t);
  if (t.startsWith('->')) return out + sp('j', t);
  if (t.startsWith('!')) { const cmd = /^!\S*/.exec(t)![0]; return out + sp('s', cmd) + hlText(t.slice(cmd.length)); }
  const kw = /^(sinon\s+si\s|si\s)/.exec(t) ?? /^(test\s|appel\s|tirer\s)/i.exec(t);
  if (kw) return out + sp('kw', kw[1]) + sp('k', t.slice(kw[1].length));
  if (/^sinon\b/.test(t)) return out + sp('kw', t);
  if (t.startsWith('>')) return out + sp('nar', '>') + `<i class="t-nar">${hlText(t.slice(1))}</i>`;
  const s2 = /^([A-Za-z_][\w-]*)(\s*(?:\([^)]*\))?)(\s*:)(.*)$/.exec(t);
  if (s2) {
    const known = chars.has(s2[1]) || ['moi', 'joueur', 'narrateur'].includes(s2[1]);
    return out + sp(known ? 'sp' : 'spx', s2[1]) + sp('emo', s2[2]) + escH(s2[3]) + hlText(s2[4]);
  }
  return out + hlText(t);
}

// ───────────────────────────── Plan du script ─────────────────────────────

interface OutlineNode { name: string; ln: number; choices: { text: string; to?: string; ln: number; locked: boolean; hidden: boolean }[]; jumps: { to: string; ln: number }[]; lines: number }

function outline(sc: Script): OutlineNode[] {
  return sc.order.map((name) => {
    const n: OutlineNode = { name, ln: 0, choices: [], jumps: [], lines: 0 };
    const walk = (list: Instr[]) => {
      for (const ins of list) {
        if (!n.ln || ins.ln < n.ln) n.ln = ins.ln;
        if (ins.k === 'line') n.lines++;
        if (ins.k === 'jump') n.jumps.push({ to: ins.to, ln: ins.ln });
        if (ins.k === 'choices') ins.opts.forEach((o) => { n.choices.push({ text: o.raw, to: o.to, ln: o.ln, locked: !!o.lock, hidden: !!o.show }); walk(o.body); });
        if (ins.k === 'if') ins.branches.forEach((b) => walk(b.body));
      }
    };
    walk(sc.nodes[name] ?? []);
    return n;
  });
}

// ───────────────────────────── Éditeur ────────────────────────────────────

export interface ScriptEditorProps {
  value: string;
  onChange: (v: string) => void;
  def: UniverseDef;
  /** problèmes de validation liés à ce script (avec numéro de ligne) */
  issues: Issue[];
  /** demande de positionnement sur une ligne (n change à chaque demande) */
  jump?: { line: number; n: number } | null;
  label?: string;
}

export function ScriptEditor({ value, onChange, def, issues, jump, label = 'Script Trame' }: ScriptEditorProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLDivElement>(null);
  const gut = useRef<HTMLDivElement>(null);
  const escaped = useRef(false);
  const [tool, setTool] = useState<string | null>(null);
  const [side, setSide] = useState<'plan' | 'aide' | null>('plan');
  const [cursorLine, setCursorLine] = useState(1);

  const parsed = useMemo(() => parseTrame(value), [value]);
  const chars = useMemo(() => new Set(def.characters.map((c) => c.id)), [def.characters]);
  const lineIssues = useMemo(() => {
    const m = new Map<number, { sev: 'error' | 'warning'; msgs: string[] }>();
    const add = (line: number, sev: 'error' | 'warning', msg: string) => {
      const cur = m.get(line);
      if (!cur) m.set(line, { sev, msgs: [msg] });
      else { if (!cur.msgs.includes(msg)) cur.msgs.push(msg); if (sev === 'error') cur.sev = 'error'; }
    };
    parsed.errors.forEach((e) => add(e.line, e.severity, e.msg));
    issues.forEach((i) => { if (i.line) add(i.line, i.severity, i.msg); });
    return m;
  }, [parsed, issues]);
  const general = issues.filter((i) => !i.line);
  const lines = value.split('\n');
  const html = useMemo(() => lines.map((l, i) => {
    const iss = lineIssues.get(i + 1);
    return `<div class="l${iss ? (iss.sev === 'error' ? ' le' : ' lw') : ''}">${highlightLine(l, chars) || ' '}</div>`;
  }).join(''), [value, lineIssues, chars]);
  const plan = useMemo(() => outline(parsed), [parsed]);
  const nodeNames = parsed.order;

  const sync = () => {
    const t = ta.current; if (!t) return;
    if (pre.current) { pre.current.scrollTop = t.scrollTop; pre.current.scrollLeft = t.scrollLeft; }
    if (gut.current) gut.current.scrollTop = t.scrollTop;
  };
  const updateCursor = () => {
    const t = ta.current; if (!t) return;
    setCursorLine(value.slice(0, t.selectionStart).split('\n').length);
  };
  const gotoLine = (n: number) => {
    const t = ta.current; if (!t) return;
    let pos = 0;
    for (let i = 1; i < n && pos >= 0; i++) { const k = value.indexOf('\n', pos); pos = k < 0 ? value.length : k + 1; }
    const end = value.indexOf('\n', pos);
    t.focus();
    t.setSelectionRange(pos, end < 0 ? value.length : end);
    t.scrollTop = Math.max(0, (n - 5) * LH);
    sync();
    setCursorLine(n);
  };
  useEffect(() => { if (jump) requestAnimationFrame(() => gotoLine(jump.line)); }, [jump?.n]);
  useEffect(sync, [value]);

  /** Insère un fragment à la ligne du curseur, avec l'indentation courante. */
  const insert = (snippet: string, opts: { indentBody?: boolean } = {}) => {
    const t = ta.current;
    const s = t ? t.selectionStart : value.length;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const lineEnd = value.indexOf('\n', s) < 0 ? value.length : value.indexOf('\n', s);
    const curLine = value.slice(lineStart, lineEnd);
    const indent = /^\s*/.exec(curLine)![0] + (opts.indentBody ? '  ' : '');
    const block = snippet.split('\n').map((l) => (l ? indent + l : l)).join('\n');
    let next: string; let caret: number;
    if (!curLine.trim()) { next = value.slice(0, lineStart) + block + value.slice(lineEnd); caret = lineStart + block.length; }
    else { next = value.slice(0, lineEnd) + '\n' + block + value.slice(lineEnd); caret = lineEnd + 1 + block.length; }
    onChange(next);
    requestAnimationFrame(() => { const x = ta.current; if (x) { x.focus(); x.setSelectionRange(caret, caret); updateCursor(); sync(); } });
  };

  /** Insère un mot à la position du curseur (identifiants de l'aide). */
  const insertInline = (text: string) => {
    const t = ta.current;
    const s = t ? t.selectionStart : value.length;
    const en = t ? t.selectionEnd : value.length;
    onChange(value.slice(0, s) + text + value.slice(en));
    requestAnimationFrame(() => { const x = ta.current; if (x) { x.focus(); x.setSelectionRange(s + text.length, s + text.length); updateCursor(); } });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.currentTarget as HTMLTextAreaElement;
    if (e.key === 'Escape') { escaped.current = true; return; }
    if (e.key === 'Tab' && !escaped.current) {
      e.preventDefault();
      const s = t.selectionStart; const en = t.selectionEnd;
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(ls, en);
      const changed = e.shiftKey ? block.split('\n').map((l) => l.replace(/^ {1,2}/, '')).join('\n') : block.split('\n').map((l) => '  ' + l).join('\n');
      const next = value.slice(0, ls) + changed + value.slice(en);
      onChange(next);
      const delta = changed.length - block.length;
      requestAnimationFrame(() => { if (s === en) t.setSelectionRange(Math.max(ls, s + (e.shiftKey ? Math.min(0, delta) : 2)), Math.max(ls, s + (e.shiftKey ? Math.min(0, delta) : 2))); else t.setSelectionRange(ls, en + delta); });
      return;
    }
    escaped.current = false;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const s = t.selectionStart;
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      const cur = value.slice(ls, s);
      let indent = /^\s*/.exec(cur)![0];
      if (/^\s*(si\s|sinon\b)/.test(cur)) indent += '  ';
      if (!indent) return;
      e.preventDefault();
      const next = value.slice(0, s) + '\n' + indent + value.slice(t.selectionEnd);
      onChange(next);
      requestAnimationFrame(() => t.setSelectionRange(s + 1 + indent.length, s + 1 + indent.length));
    }
  };

  const errCount = [...lineIssues.values()].filter((x) => x.sev === 'error').length;
  const warnCount = [...lineIssues.values()].filter((x) => x.sev === 'warning').length + general.length;
  const curIssue = lineIssues.get(cursorLine);

  const snippets: [string, string, boolean?][] = [
    ['Nœud', '@nouveau_noeud'],
    ['Narration', '> Texte de narration.'],
    ['Saut', '-> nouveau_noeud'],
    ['Fin de l\'événement', '-> fin'],
    ['Mise en scène', '!anim moi joie'],
    ['Changer de lieu', `!lieu ${def.locations[0]?.id ?? 'lieu'}`],
    ['Rappel d\'un souvenir', `!rappel ${def.characters[0]?.id ?? 'perso'}.cle`],
    ['Appeler un événement', 'appel autre_evenement'],
  ];

  return (
    <div class="ed-script">
      <div class="ed-script-bar">
        <span class="ed-l">{label}</span>
        <span class={`ed-pill ${errCount ? 'bad' : warnCount ? 'warn' : 'ok'}`}>{errCount ? `${errCount} erreur${errCount > 1 ? 's' : ''}` : warnCount ? `${warnCount} avertissement${warnCount > 1 ? 's' : ''}` : 'Aucune erreur'}</span>
        <span class="muted small">{lines.length} lignes · {parsed.order.length} nœud{parsed.order.length > 1 ? 's' : ''} · {plan.reduce((n, x) => n + x.choices.length, 0)} choix</span>
        <span class="grow" />
        <button type="button" class={`pbtn small ${side === 'plan' ? 'primary' : ''}`} onClick={() => setSide(side === 'plan' ? null : 'plan')}>Plan</button>
        <button type="button" class={`pbtn small ${side === 'aide' ? 'primary' : ''}`} onClick={() => setSide(side === 'aide' ? null : 'aide')}>Aide Trame</button>
      </div>
      <div class="ed-script-tools" role="toolbar" aria-label="Assistants d'écriture">
        {[['ligne', 'Réplique'], ['choix', 'Choix'], ['effet', 'Effet'], ['test', 'Test de compétence'], ['si', 'Condition']].map(([k, l]) => (
          <button key={k} type="button" class={`pbtn small ${tool === k ? 'primary' : ''}`} onClick={() => setTool(tool === k ? null : k)}>+ {l}</button>
        ))}
        <span class="ed-sep" />
        {snippets.map(([l, s]) => <button key={l} type="button" class="pbtn small ghost" onClick={() => insert(s)} title={s}>{l}</button>)}
      </div>
      {tool && (
        <div class="ed-builder pbox">
          {tool === 'ligne' && <LineBuilder def={def} onInsert={(s) => insert(s)} />}
          {tool === 'choix' && <ChoiceBuilder def={def} nodes={nodeNames} onInsert={(s) => insert(s)} />}
          {tool === 'effet' && <EffectBuilder def={def} onInsert={(s) => insert(s)} />}
          {tool === 'test' && <TestBuilder def={def} onInsert={(s) => insert(s)} />}
          {tool === 'si' && <CondBuilder def={def} onInsert={(s) => insert(s)} />}
        </div>
      )}
      <div class={`ed-script-main ${side ? 'with-side' : ''}`}>
        <div class="ed-code" style={{ '--lh': `${LH}px` } as Record<string, string>}>
          <div class="ed-gutter" ref={gut} aria-hidden="true">
            {lines.map((_, i) => {
              const iss = lineIssues.get(i + 1);
              return <div key={i} class={iss ? (iss.sev === 'error' ? 'ge' : 'gw') : ''} title={iss?.msgs.join('\n')}>{i + 1}</div>;
            })}
            <div>&nbsp;</div>
          </div>
          <div class="ed-code-area">
            <div class="ed-hl" ref={pre} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html + '<div class="l"> </div>' }} />
            <textarea ref={ta} class="ed-ta" value={value} spellcheck={false} wrap="off" aria-label={label}
              autocomplete="off" autocapitalize="off"
              onInput={(e) => { onChange(val(e)); updateCursor(); }}
              onScroll={sync} onKeyDown={onKeyDown} onKeyUp={updateCursor} onClick={updateCursor} />
          </div>
        </div>
        {side === 'plan' && (
          <aside class="ed-side" aria-label="Plan du script">
            <div class="ed-l">Plan des nœuds</div>
            {plan.map((n) => (
              <div key={n.name} class="ed-plan-node">
                <button type="button" class="ed-link" onClick={() => n.ln && gotoLine(n.ln)}>@{n.name}</button>
                <span class="muted small"> {n.lines} ligne{n.lines > 1 ? 's' : ''}</span>
                {n.choices.map((ch, i) => (
                  <button type="button" key={i} class="ed-plan-ch" onClick={() => gotoLine(ch.ln)}>
                    <span class="t-ch">{ch.locked ? '🔒' : ch.hidden ? '◌' : '•'}</span> {ch.text.slice(0, 46)}{ch.text.length > 46 ? '…' : ''}{ch.to && <b class="t-j"> → {ch.to}</b>}
                  </button>
                ))}
                {n.jumps.map((j, i) => <button type="button" key={`j${i}`} class="ed-plan-ch" onClick={() => gotoLine(j.ln)}><b class="t-j">→ {j.to}</b></button>)}
              </div>
            ))}
            <p class="muted small">Un nœud s'arrête à sa dernière ligne : enchaîne avec « -&gt; nœud ». Après un bloc de choix, l'histoire reprend à la ligne suivante (convergence).</p>
          </aside>
        )}
        {side === 'aide' && <aside class="ed-side"><TrameHelp def={def} compact onInsert={insertInline} /></aside>}
      </div>
      <div class="ed-script-status" aria-live="polite">
        Ligne {cursorLine}
        {curIssue && <span class={curIssue.sev === 'error' ? 'bad' : 'warn'}> · {curIssue.msgs.join(' · ')}</span>}
      </div>
      {(lineIssues.size > 0 || general.length > 0) && (
        <ul class="ed-issues">
          {[...lineIssues.entries()].sort((a, b) => a[0] - b[0]).map(([ln, x]) => x.msgs.map((msg, k) => (
            <li key={`${ln}-${k}`} class={x.sev}><button type="button" class="ed-link" onClick={() => gotoLine(ln)}>Ligne {ln}</button> {msg}</li>
          )))}
          {general.map((i, k) => <li key={`g${k}`} class={i.severity}>{i.msg}</li>)}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────── Assistants ─────────────────────────────────

function Preview({ code, onInsert }: { code: string; onInsert: () => void }) {
  const errs = useMemo(() => parseTrame(code).errors.filter((e) => e.severity === 'error'), [code]);
  return (
    <div class="ed-bpreview">
      <pre class="mono" dangerouslySetInnerHTML={{ __html: code.split('\n').map((l) => highlightLine(l, new Set())).join('\n') }} />
      {errs.length > 0 && <div class="ed-err">{errs[0].msg}</div>}
      <button type="button" class="pbtn small primary" disabled={errs.length > 0} onClick={onInsert}>Insérer à la ligne du curseur</button>
    </div>
  );
}

const speakerOpts = (def: UniverseDef) => [['>', 'Narration'], ['moi', 'Le joueur (moi)'], ...def.characters.map((c) => [c.id, `${c.name} (${c.id})`])] as [string, string][];

function SpeakerSel({ def, value, onChange }: { def: UniverseDef; value: string; onChange: (v: string) => void }) {
  return <select class="txt" value={value} onChange={(e) => onChange(val(e))} aria-label="Qui parle">{speakerOpts(def).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
function EmoSel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <select class="txt" value={value} onChange={(e) => onChange(val(e))} aria-label="Émotion"><option value="">(neutre)</option>{EMOTIONS.filter((x) => x !== 'neutre').map((x) => <option key={x} value={x}>{x}</option>)}</select>;
}
const lineOf = (who: string, emo: string, text: string, cond = '') =>
  `${cond.trim() ? `[${cond.trim()}] ` : ''}${who === '>' ? `> ${text}` : `${who}${emo ? ` (${emo})` : ''}: ${text}`}`;

function B({ label, children, wide }: { label: string; children: ComponentChildren; wide?: boolean }) {
  return <label class={`ed-f ${wide ? 'span2' : ''}`}><span class="ed-l">{label}</span>{children}</label>;
}

function LineBuilder({ def, onInsert }: { def: UniverseDef; onInsert: (s: string) => void }) {
  const [who, setWho] = useState(def.characters[0]?.id ?? '>');
  const [emo, setEmo] = useState('');
  const [cond, setCond] = useState('');
  const [text, setText] = useState('');
  const code = lineOf(who, emo, text || '…', cond);
  return (
    <div class="ed-grid">
      <B label="Qui parle"><SpeakerSel def={def} value={who} onChange={setWho} /></B>
      {who !== '>' && <B label="Émotion (portrait)"><EmoSel value={emo} onChange={setEmo} /></B>}
      <B label="Texte" wide><input class="txt" value={text} onInput={(e) => setText(val(e))} placeholder="Ce que dit le personnage. {joueur.nom} insère le prénom." /></B>
      <B label="Condition (facultative)" wide><input class="txt mono" value={cond} onInput={(e) => setCond(val(e))} placeholder="ex. rel.alex >= 30" />{codeError(cond, 'cond') && <span class="ed-err">{codeError(cond, 'cond')}</span>}</B>
      <div class="span3"><Preview code={code} onInsert={() => { onInsert(code); setText(''); }} /></div>
    </div>
  );
}

function ChoiceBuilder({ def, nodes, onInsert }: { def: UniverseDef; nodes: string[]; onInsert: (s: string) => void }) {
  const [text, setText] = useState('');
  const [sticky, setSticky] = useState(false);
  const [mode, setMode] = useState<'hide' | 'lock'>('hide');
  const [cond, setCond] = useState('');
  const [fx, setFx] = useState('');
  const [tags, setTags] = useState('');
  const [to, setTo] = useState('');
  const [rWho, setRWho] = useState(def.characters[0]?.id ?? '>');
  const [rEmo, setREmo] = useState('');
  const [reply, setReply] = useState('');
  const c = cond.trim();
  const tagStr = tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean).map((t) => ` #${t}`).join('');
  let code = `${sticky ? '+' : '*'} ${c ? (mode === 'hide' ? `[${c}] ` : `(${c}) `) : ''}${text || '…'}${tagStr}${fx.trim() ? ` ~ ${fx.trim()}` : ''}${to ? ` -> ${to}` : ''}`;
  if (reply.trim()) code += `\n  ${lineOf(rWho, rEmo, reply)}`;
  return (
    <div class="ed-grid">
      <B label="Texte du choix" wide><input class="txt" value={text} onInput={(e) => setText(val(e))} placeholder="ex. Accepter la proposition" /></B>
      <B label="Type">
        <select class="txt" value={sticky ? '+' : '*'} onChange={(e) => setSticky(val(e) === '+')}>
          <option value="*">Disparaît une fois choisi (*)</option>
          <option value="+">Toujours proposé (+)</option>
        </select>
      </B>
      <B label="Condition d'apparition" wide><input class="txt mono" value={cond} onInput={(e) => setCond(val(e))} placeholder="ex. stat.argent >= 50" />{codeError(cond, 'cond') && <span class="ed-err">{codeError(cond, 'cond')}</span>}</B>
      <B label="Si la condition est fausse">
        <select class="txt" value={mode} onChange={(e) => setMode(val(e) as 'hide' | 'lock')}>
          <option value="hide">Masquer le choix</option>
          <option value="lock">Afficher verrouillé</option>
        </select>
      </B>
      <B label="Conséquences (effets)" wide><input class="txt mono" value={fx} onInput={(e) => setFx(val(e))} placeholder="ex. rel.alex += 5; stat.moral -= 3; planifier(suite, 2)" />{codeError(fx, 'fx') && <span class="ed-err">{codeError(fx, 'fx')}</span>}</B>
      <B label="Destination">
        <select class="txt" value={to} onChange={(e) => setTo(val(e))}>
          <option value="">Continuer après les choix</option>
          {nodes.map((n) => <option key={n} value={n}>@{n}</option>)}
          <option value="fin">Terminer l'événement</option>
        </select>
      </B>
      <B label="Étiquettes (personnalité, profils de simulation)" wide><input class="txt" value={tags} onInput={(e) => setTags(val(e))} placeholder="ex. loyal, risque" /></B>
      <B label="Réponse : qui"><SpeakerSel def={def} value={rWho} onChange={setRWho} /></B>
      {rWho !== '>' && <B label="Émotion"><EmoSel value={rEmo} onChange={setREmo} /></B>}
      <B label="Réponse (facultative)" wide><input class="txt" value={reply} onInput={(e) => setReply(val(e))} placeholder="Réplique jouée juste après ce choix" /></B>
      <div class="span3"><Preview code={code} onInsert={() => { onInsert(code); setText(''); setReply(''); }} /></div>
    </div>
  );
}

function EffectBuilder({ def, onInsert }: { def: UniverseDef; onInsert: (s: string) => void }) {
  const [kind, setKind] = useState('stat');
  const [id, setId] = useState('');
  const [op, setOp] = useState('+=');
  const [v, setV] = useState('5');
  const [a2, setA2] = useState('');
  const [a3, setA3] = useState('');
  const ids: [string, string][] = kind === 'stat' ? def.stats.map((s) => [s.id, s.label])
    : kind === 'rel' || kind === 'souvenir' || kind === 'eloigner' ? def.characters.map((c) => [c.id, c.name])
      : kind === 'planifier' ? def.events.map((e) => [e.id, e.title ?? e.id])
        : kind === 'aller' ? def.locations.map((l) => [l.id, l.name])
          : kind === 'fin' ? def.endings.map((e) => [e.id, e.title]) : [];
  const cur = id && ids.some((x) => x[0] === id) ? id : ids[0]?.[0] ?? '';
  const q = (s: string) => `"${s.replace(/"/g, '\'')}"`;
  const code = '~ ' + ({
    stat: `stat.${cur} ${op} ${v || 0}`,
    rel: `rel.${cur} ${op} ${v || 0}`,
    var: `var.${id || 'nom'} ${op} ${v || 'vrai'}`,
    souvenir: `souvenir(${cur}, ${a2 || 'cle'}, ${q(a3 || 'Ce dont le personnage se souviendra')})`,
    eloigner: `eloigner(${cur}, ${v || 1})`,
    planifier: `planifier(${cur}, ${v || 2})`,
    objectif: `objectif(${q(a2 || 'id_objectif')}, ${q(a3 || 'Texte de l\'objectif')})`,
    actu: `actu(${q(a3 || 'Une nouvelle tombe…')})`,
    aller: `aller(${cur})`,
    fin: `fin(${cur})`,
  } as Record<string, string>)[kind];
  return (
    <div class="ed-grid">
      <B label="Type d'effet">
        <select class="txt" value={kind} onChange={(e) => { setKind(val(e)); setId(''); }}>
          <option value="stat">Modifier une statistique</option>
          <option value="rel">Modifier une relation</option>
          <option value="var">Modifier une variable</option>
          <option value="souvenir">Le personnage s'en souviendra</option>
          <option value="eloigner">Éloignement silencieux d'une relation</option>
          <option value="planifier">Conséquence différée (planifier un événement)</option>
          <option value="objectif">Nouvel objectif</option>
          <option value="actu">Actualité (journal + notification)</option>
          <option value="aller">Déplacer le joueur</option>
          <option value="fin">Déclencher une fin</option>
        </select>
      </B>
      {ids.length > 0 && <B label="Cible"><select class="txt" value={cur} onChange={(e) => setId(val(e))}>{ids.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></B>}
      {kind === 'var' && <B label="Nom de la variable"><input class="txt mono" value={id} onInput={(e) => setId(val(e))} placeholder="ex. promesse" /></B>}
      {['stat', 'rel', 'var'].includes(kind) && (
        <B label="Opération"><select class="txt" value={op} onChange={(e) => setOp(val(e))}><option value="+=">ajouter (+=)</option><option value="-=">retirer (-=)</option><option value="=">fixer (=)</option></select></B>
      )}
      {['stat', 'rel', 'var', 'eloigner', 'planifier'].includes(kind) && (
        <B label={kind === 'planifier' ? 'Dans combien de semaines' : 'Valeur'}><input class="txt mono" value={v} onInput={(e) => setV(val(e))} /></B>
      )}
      {['souvenir', 'objectif'].includes(kind) && <B label={kind === 'souvenir' ? 'Clé du souvenir' : 'Identifiant de l\'objectif'}><input class="txt mono" value={a2} onInput={(e) => setA2(val(e))} /></B>}
      {['souvenir', 'objectif', 'actu'].includes(kind) && <B label="Texte" wide><input class="txt" value={a3} onInput={(e) => setA3(val(e))} /></B>}
      <div class="span3"><Preview code={code} onInsert={() => onInsert(code)} /></div>
    </div>
  );
}

function TestBuilder({ def, onInsert }: { def: UniverseDef; onInsert: (s: string) => void }) {
  const [skill, setSkill] = useState(def.stats[0] ? `stat.${def.stats[0].id}` : '50');
  const [diff, setDiff] = useState('50');
  const code = `test ${skill} vs ${diff}\nsi reussite\n  > Réussite !\nsinon\n  > Échec…`;
  return (
    <div class="ed-grid">
      <B label="Compétence (expression)">
        <select class="txt" value={skill} onChange={(e) => setSkill(val(e))}>
          {def.stats.map((s) => <option key={s.id} value={`stat.${s.id}`}>{s.label}</option>)}
          {def.characters.map((c) => <option key={c.id} value={`rel.${c.id}`}>Relation : {c.name}</option>)}
        </select>
      </B>
      <B label="Difficulté"><input class="txt mono" value={diff} onInput={(e) => setDiff(val(e))} /></B>
      <p class="muted small span3">La chance de réussite dépend de l'écart compétence − difficulté (échelle « checkScale » de l'univers). Placé en première ligne sous un choix, le pourcentage s'affiche sur ce choix.</p>
      <div class="span3"><Preview code={code} onInsert={() => onInsert(code)} /></div>
    </div>
  );
}

function CondBuilder({ def, onInsert }: { def: UniverseDef; onInsert: (s: string) => void }) {
  const [cond, setCond] = useState(def.characters[0] ? `rel.${def.characters[0].id} >= 30` : 'stat.x >= 50');
  const [elif, setElif] = useState('');
  const [els, setEls] = useState(true);
  const code = `si ${cond || 'vrai'}\n  > …${elif.trim() ? `\nsinon si ${elif.trim()}\n  > …` : ''}${els ? '\nsinon\n  > …' : ''}`;
  return (
    <div class="ed-grid">
      <B label="Si…" wide><input class="txt mono" value={cond} onInput={(e) => setCond(val(e))} />{codeError(cond, 'cond') && <span class="ed-err">{codeError(cond, 'cond')}</span>}</B>
      <B label="Sinon si… (facultatif)" wide><input class="txt mono" value={elif} onInput={(e) => setElif(val(e))} /></B>
      <label class="ed-check"><input type="checkbox" checked={els} onChange={(e) => setEls((e.target as HTMLInputElement).checked)} /> <span>Bloc « sinon »</span></label>
      <div class="span3"><Preview code={code} onInsert={() => onInsert(code)} /></div>
    </div>
  );
}

// ───────────────────────────── Aide-mémoire ───────────────────────────────

const HELP: { title: string; rows: [string, string][] }[] = [
  { title: 'Structure', rows: [
    ['@nom_du_noeud', 'Début d\'un nœud. Le premier nœud est l\'entrée de l\'événement.'],
    ['-> nom_du_noeud', 'Saut vers un nœud. Un nœud s\'arrête à sa dernière ligne (pas d\'enchaînement implicite).'],
    ['-> fin', 'Termine l\'événement.'],
    ['// commentaire', 'Ligne ignorée.'],
  ] },
  { title: 'Dialogues', rows: [
    ['alex: Bonjour !', 'Réplique d\'un personnage (son identifiant).'],
    ['alex (colere): Encore toi ?', 'Avec une émotion (portrait) : neutre, content, rire, triste, colere, surpris, inquiet, pensif, fier.'],
    ['moi: Salut.', 'Réplique du joueur.'],
    ['> Il pleut sur la ville.', 'Narration.'],
    ['[rel.alex >= 30] alex: Merci.', 'Ligne jouée seulement si la condition est vraie.'],
    ['Salut {joueur.nom} !', 'Expression insérée dans le texte.'],
    ['Tu es [[prêt|prête]].', 'Accord selon le genre du personnage joué.'],
  ] },
  { title: 'Choix', rows: [
    ['* Accepter', 'Choix (disparaît une fois pris, utile pour les menus qui reviennent).'],
    ['+ Partir', 'Choix toujours proposé.'],
    ['* [stat.argent >= 50] Payer', 'Masqué si la condition est fausse.'],
    ['* (stat.force >= 60) Forcer la porte', 'Affiché verrouillé si la condition est fausse.'],
    ['* Mentir #mensonge ~ rel.alex -= 5 -> suite', 'Étiquettes, conséquences immédiates et destination.'],
    ['  alex: Vraiment ?', 'Lignes indentées sous un choix : la réponse. Ensuite l\'histoire reprend après le bloc de choix.'],
  ] },
  { title: 'Conditions et blocs', rows: [
    ['si stat.moral < 20', 'Bloc conditionnel (lignes indentées en dessous).'],
    ['sinon si … / sinon', 'Alternatives.'],
    ['test stat.technique vs 60', 'Jet de compétence, suivi de « si reussite » / « sinon ».'],
    ['et · ou · non · == != < <= > >= · a ? b : c', 'Opérateurs.'],
  ] },
  { title: 'Valeurs lisibles', rows: [
    ['stat.x · rel.perso · var.nom', 'Statistique, relation (−100 à 100), variable.'],
    ['mem.perso.cle · connu.perso', 'Souvenir existant, personnage rencontré.'],
    ['joueur.nom · joueur.<champ>', 'Prénom et choix de création (ex. joueur.caractere).'],
    ['temps.semaine · temps.chapitre · temps.total', 'Calendrier.'],
    ['chapitre · lieu · actions', 'Chapitre courant, lieu courant, actions restantes.'],
    ['objectif.id · tag.x · meta.fins', 'Statut d\'objectif, nombre de choix étiquetés x, fins déjà découvertes.'],
  ] },
  { title: 'Effets (~ …, séparés par « ; »)', rows: [
    ['stat.x += 5 · rel.perso -= 10', 'Ajouter / retirer (les traits du personnage modulent les relations).'],
    ['var.nom = vrai · actions -= 1', 'Variables, actions de la semaine.'],
    ['souvenir(perso, cle, "texte")', 'Le personnage s\'en souviendra (rappels, conditions mem.perso.cle).'],
    ['planifier(evenement, 3)', 'Conséquence différée : l\'événement se déclenche dans 3 semaines.'],
    ['eloigner(perso, 1)', 'Érosion silencieuse d\'une relation négligée.'],
    ['objectif("id", "texte") · objectifReussi("id")', 'Objectifs du joueur.'],
    ['actu("…") · journal("…") · notifier("…")', 'Actualité, journal, notification.'],
    ['aller(lieu) · chapitreSuivant() · fin(id)', 'Déplacer, sauter au chapitre suivant, forcer une fin.'],
  ] },
  { title: 'Fonctions', rows: [
    ['hasard(1, 6) · chance(30)', 'Nombre aléatoire, vrai dans 30 % des cas.'],
    ['vu(evt) · nb(evt) · depuis(evt)', 'Événement déjà vécu, combien de fois, depuis combien de semaines.'],
    ['choisi(tag) · trait(perso, trait) · niveau(perso)', 'Choix étiquetés, trait de caractère, niveau de relation.'],
    ['min · max · abs · arrondi · borne(x, a, b) · entre(x, a, b)', 'Calcul.'],
    ['cote(compétence, difficulté) · nombre(x)', 'Chance de réussite en %, nombre formaté.'],
  ] },
  { title: 'Mise en scène (!…)', rows: [
    ['!lieu id [x] [moment]', 'Changer de lieu.'],
    ['!placer perso x [gauche|droite]', 'Placer un acteur (x, autre perso, ou ±décalage).'],
    ['!aller perso cible · !courir perso cible', 'Déplacer.'],
    ['!entrer perso gauche · !sortir perso', 'Entrée / sortie de scène.'],
    ['!anim perso animation [boucle]', `Animations : ${Object.keys(ANIMS).filter((a) => !['walk', 'jump', 'clap', 'muscu'].includes(a)).join(', ')}.`],
    ['!face perso gauche|droite|autre', 'Orientation.'],
    ['!emote perso ! | ? | coeur | colere | zzz', 'Bulle d\'émotion.'],
    ['!moment aube|jour|soir|nuit · !meteo pluie|neige|clair', 'Ambiance.'],
    ['!fx confettis|flash|tremblement|flashs|etincelles', 'Effets visuels.'],
    ['!camera perso · !pause 500 · !fondu · !titre Texte', 'Caméra, pause, fondu, grand titre.'],
    ['!tenue perso haut [couleur] [couleur2]', 'Changer de tenue.'],
    ['!ballon pied perso · !ballon vers cible tir', 'Ballon / objet : pied, vers (passe, tir, lob, centre, rate), placer, cacher.'],
    ['!son nom', 'Son : positif, negatif, souvenir, sifflet, but, porte, telephone, tension…'],
    ['!rappel perso.cle · !echo Texte', 'Bandeau « conséquence » d\'un choix passé.'],
  ] },
  { title: 'Sous-événements', rows: [
    ['appel evenement', 'Joue un autre événement puis reprend ici.'],
    ['tirer reserve 2', 'Tire 2 événements éligibles de la réserve « pool:reserve ».'],
  ] },
];

export function TrameHelp({ def, compact, onInsert }: { def: UniverseDef; compact?: boolean; onInsert?: (s: string) => void }) {
  const [q, setQ] = useState('');
  const ql = q.toLowerCase();
  const groups = HELP.map((g) => ({ ...g, rows: g.rows.filter(([a, b]) => !ql || a.toLowerCase().includes(ql) || b.toLowerCase().includes(ql)) })).filter((g) => g.rows.length);
  const idList = (title: string, items: [string, string][]) => items.length > 0 && (
    <div class="ed-help-ids">
      <div class="ed-l">{title}</div>
      <div class="ed-chips">{items.map(([id, label]) => (
        <button type="button" key={id} class="ed-chip mono" title={label} onClick={() => onInsert?.(id)} disabled={!onInsert}>{id}</button>
      ))}</div>
    </div>
  );
  return (
    <div class={`ed-help ${compact ? 'compact' : ''}`}>
      <input class="txt" placeholder="Chercher dans l'aide…" value={q} onInput={(e) => setQ(val(e))} />
      {groups.map((g) => (
        <section key={g.title}>
          <h4>{g.title}</h4>
          <dl>{g.rows.map(([a, b]) => <div key={a}><dt><code>{a}</code></dt><dd>{b}</dd></div>)}</dl>
        </section>
      ))}
      {!ql && (
        <>
          {idList('Personnages', def.characters.map((c) => [c.id, c.name]))}
          {idList('Statistiques', def.stats.map((s) => [`stat.${s.id}`, s.label]))}
          {idList('Lieux', def.locations.map((l) => [l.id, l.name]))}
          {idList('Événements', def.events.map((e) => [e.id, e.title ?? e.id]))}
        </>
      )}
    </div>
  );
}
