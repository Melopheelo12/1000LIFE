// ─────────────────────────────────────────────────────────────────────────────
// StoryRunner : exécute un script Trame pas à pas.
// La présentation (jeu, test, simulateur) appelle next() et reçoit des « étapes » :
//   line     → afficher une réplique puis rappeler next()
//   choices  → afficher les choix puis appeler choose(i)
//   stage    → jouer une mise en scène (animation, déplacement…) puis next()
//   echo     → bandeau « conséquence » d'une décision passée
//   end      → fin de l'événement (et de ses sous-événements)
// ─────────────────────────────────────────────────────────────────────────────
import { toNum, type Expr } from '../expr/expr';
import type { ChoiceOpt, Instr, Script } from '../trame/trame';
import type { GameSession } from './session';

export type Step =
  | { type: 'line'; who: string | null; emo?: string; text: string; event: string }
  | { type: 'choices'; options: ChoiceView[]; event: string }
  | { type: 'stage'; cmd: string; args: string[]; event: string }
  | { type: 'echo'; text: string; event: string }
  | { type: 'end' };

export interface ChoiceView {
  index: number;
  text: string;
  enabled: boolean;
  reason?: string;
  odds?: number;
  tags: string[];
}

interface RunEvent { id: string; title: string; script: Script; picked: Set<string> }
interface Frame {
  kind: 'node' | 'body' | 'draw';
  ev: RunEvent;
  list: Instr[];
  pc: number;
  draw?: { pool: string; left: number; drawn: Set<string> };
}

export class RunnerError extends Error {}

export class StoryRunner {
  private stack: Frame[] = [];
  private pending: { frame: Frame; opts: ChoiceOpt[]; views: ChoiceView[]; ev: RunEvent } | null = null;
  /** En mode headless, les mises en scène sont ignorées (simulation, tests). */
  constructor(private g: GameSession, private headless = false) {}

  get running() { return this.stack.length > 0 || this.pending !== null; }
  get waitingChoice() { return this.pending !== null; }

  start(eventId: string): boolean {
    const ev = this.g.u.events.get(eventId);
    if (!ev) { this.g.issue(`Événement inconnu « ${eventId} »`); return false; }
    this.g.markFired(eventId);
    this.push(eventId, ev.def.title ?? eventId, ev.script);
    return true;
  }

  /** Lance un script arbitraire (épilogue de fin, test d'éditeur). */
  startScript(id: string, title: string, script: Script, entry?: string) {
    this.push(id, title, script, entry);
  }

  private push(id: string, title: string, script: Script, entry?: string) {
    const ev: RunEvent = { id, title, script, picked: new Set() };
    const list = script.nodes[entry ?? script.entry] ?? [];
    this.stack.push({ kind: 'node', ev, list, pc: 0 });
  }

  private finish(ev: RunEvent) {
    this.g.endDecisionScope();
    void ev;
  }

  private jump(ev: RunEvent, to: string) {
    while (this.stack.length) {
      const f = this.stack.pop()!;
      if (f.ev === ev && f.kind === 'node') break;
    }
    if (to === 'fin') { this.finish(ev); return; }
    const list = ev.script.nodes[to];
    if (!list) { this.g.issue(`Nœud « @${to} » introuvable dans ${ev.id}`); this.finish(ev); return; }
    this.stack.push({ kind: 'node', ev, list, pc: 0 });
  }

  next(): Step {
    if (this.pending) {
      return { type: 'choices', options: this.pending.views, event: this.pending.ev.id };
    }
    let guard = 0;
    for (;;) {
      if (++guard > 50000) {
        const top = this.stack[this.stack.length - 1];
        this.stack = [];
        throw new RunnerError(`Boucle infinie probable dans « ${top?.ev.id ?? '?'} »`);
      }
      const f = this.stack[this.stack.length - 1];
      if (!f) return { type: 'end' };
      this.g.setContext(`${f.ev.id}`);

      if (f.kind === 'draw') {
        const d = f.draw!;
        if (d.left <= 0) { this.stack.pop(); continue; }
        d.left--;
        const ev = this.g.drawFromPool(d.pool, d.drawn);
        if (!ev) { d.left = 0; continue; }
        d.drawn.add(ev.def.id);
        this.g.markFired(ev.def.id);
        this.push(ev.def.id, ev.def.title ?? ev.def.id, ev.script);
        continue;
      }

      if (f.pc >= f.list.length) {
        this.stack.pop();
        if (f.kind === 'node') this.finish(f.ev);
        continue;
      }

      const ins = f.list[f.pc++];
      if ('cond' in ins && ins.cond && !this.g.test(ins.cond)) continue;

      switch (ins.k) {
        case 'line':
          // filet de sécurité : un proche retiré de l'histoire ne parle pas (la validation le signale)
          if (ins.who && ins.who !== 'moi' && !this.g.present(ins.who)) continue;
          return { type: 'line', who: ins.who, emo: ins.emo, text: this.g.render(ins.parts), event: f.ev.id };

        case 'fx':
          this.g.exec(ins.stmts, `${f.ev.id} (ligne ${ins.ln})`);
          continue;

        case 'jump':
          this.jump(f.ev, ins.to);
          continue;

        case 'if':
          for (const b of ins.branches) {
            if (!b.cond || this.g.test(b.cond)) {
              if (b.body.length) this.stack.push({ kind: 'body', ev: f.ev, list: b.body, pc: 0 });
              break;
            }
          }
          continue;

        case 'test':
          this.g.doTest(ins.skill, ins.diff);
          continue;

        case 'call': {
          const ev = this.g.u.events.get(ins.event);
          if (!ev) { this.g.issue(`Événement appelé inconnu « ${ins.event} »`); continue; }
          this.g.markFired(ins.event);
          this.push(ins.event, ev.def.title ?? ins.event, ev.script);
          continue;
        }

        case 'draw':
          this.stack.push({ kind: 'draw', ev: f.ev, list: [], pc: 0, draw: { pool: ins.pool, left: Math.max(0, Math.round(toNum(this.g.eval(ins.count, 1)))), drawn: new Set() } });
          continue;

        case 'stage': {
          const args = ins.args.map((a) => this.g.render(a));
          if (ins.cmd === 'lieu' && args[0]) this.g.setLocation(args[0]);
          if (ins.cmd === 'rappel' || ins.cmd === 'echo') {
            const text = this.g.echo(ins.cmd, args);
            if (text) return { type: 'echo', text, event: f.ev.id };
            continue;
          }
          if (this.headless) continue;
          return { type: 'stage', cmd: ins.cmd, args, event: f.ev.id };
        }

        case 'choices': {
          const views: ChoiceView[] = [];
          ins.opts.forEach((o, index) => {
            if (!o.sticky && f.ev.picked.has(o.id)) return;
            if (o.show && !this.g.test(o.show)) return;
            const enabled = !o.lock || this.g.test(o.lock);
            const first = o.body[0];
            const odds = first && first.k === 'test' ? this.g.odds(first.skill as Expr, first.diff as Expr) : undefined;
            views.push({
              index, text: this.g.render(o.parts), enabled, tags: o.tags, odds,
              reason: enabled ? undefined : o.lock ? this.g.humanize(o.lock) : undefined,
            });
          });
          if (!views.length) continue;
          if (!views.some((v) => v.enabled)) {
            // Tous verrouillés : on débloque le dernier pour éviter un blocage.
            views[views.length - 1].enabled = true;
            views[views.length - 1].reason = undefined;
          }
          this.pending = { frame: f, opts: ins.opts, views, ev: f.ev };
          return { type: 'choices', options: views, event: f.ev.id };
        }
      }
    }
  }

  choose(index: number): void {
    const p = this.pending;
    if (!p) throw new RunnerError('Aucun choix en attente');
    const view = p.views.find((v) => v.index === index);
    if (!view) throw new RunnerError(`Choix ${index} indisponible`);
    if (!view.enabled) throw new RunnerError(`Choix ${index} verrouillé`);
    const opt = p.opts[index];
    this.pending = null;
    p.ev.picked.add(opt.id);
    this.g.recordDecision(p.ev.id, p.ev.title, view.text, opt.tags);
    if (opt.stmts) this.g.exec(opt.stmts, `${p.ev.id} (ligne ${opt.ln})`);
    const body: Instr[] = opt.to ? [...opt.body, { k: 'jump', to: opt.to, ln: opt.ln }] : opt.body;
    if (body.length) this.stack.push({ kind: 'body', ev: p.ev, list: body, pc: 0 });
  }

  /** Abandonne l'exécution en cours (retour menu, chargement). */
  abort() { this.stack = []; this.pending = null; this.g.endDecisionScope(); }
}
