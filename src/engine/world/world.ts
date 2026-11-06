// ─────────────────────────────────────────────────────────────────────────────
// Le monde 2D : un lieu rendu en calques, des acteurs animés (joueur, PNJ,
// figurants), un ballon/objet, des effets, une caméra, et l'exécution des
// commandes de mise en scène (!aller, !anim, !ballon, !preset…).
// ─────────────────────────────────────────────────────────────────────────────
import type { LocationDef, Look, StagePlacement } from '../../core/model/types';
import type { HubInfo } from '../../core/runtime/session';
import { animDef, col, getFrame, lookKey, randomLook, SPR_H, SPR_W } from '../gfx/character';
import { drawTinyText, LANE_Y, VIEW_H, VIEW_W, mix } from '../gfx/pixel';
import { PARALLAX, renderLocation, type RenderedLocation, type SceneEnv, type TimeOfDay } from '../gfx/scenery';

export interface WorldEnv extends SceneEnv {
  charLook(id: string, override?: Look): Look | null;
  charName(id: string): string;
  playerLook(loc: LocationDef): Look;
  playerName(): string;
  presets(): Record<string, StagePlacement[]>;
}

export type Focus =
  | { kind: 'npc'; id: string; x: number; label: string }
  | { kind: 'hotspot'; id: string; x: number; label: string }
  | { kind: 'exit'; id: string; x: number; label: string; to: string; spawn?: number };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / ((globalThis as unknown as { __mvFast?: number }).__mvFast ?? 1)));
const flipCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function flipped(c: HTMLCanvasElement): HTMLCanvasElement {
  let f = flipCache.get(c);
  if (!f) {
    f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    const x = f.getContext('2d')!; x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
    flipCache.set(c, f);
  }
  return f;
}

export class Actor {
  lookKey: string;
  x = 160;
  lane = 0;
  face: 1 | -1 = 1;
  anim = 'idle';
  baseAnim = 'idle';
  animT = 0;
  once: { name: string; done: () => void } | null = null;
  target: number | null = null;
  running = false;
  onArrive: (() => void) | null = null;
  emo = 'neutre';
  emote: { kind: string; t: number } | null = null;
  speaking = false;
  marker = false;
  label = false;
  staged = false;
  isPlayer = false;
  rot = 0;
  constructor(public id: string, public name: string, public look: Look) { this.lookKey = lookKey(look); }

  setLook(l: Look) { this.look = l; this.lookKey = lookKey(l); }
  get laneY() { return LANE_Y[Math.max(0, Math.min(2, this.lane))]; }

  playOnce(name: string): Promise<void> {
    return new Promise((res) => {
      this.once?.done();
      this.anim = name; this.animT = 0;
      this.once = { name, done: res };
    });
  }
  setEmote(kind: string) { this.emote = { kind, t: 0 }; }

  update(dt: number) {
    this.animT += dt;
    if (this.emote) { this.emote.t += dt; if (this.emote.t > 1.6) this.emote = null; }
    if (this.target !== null) {
      const speed = this.running ? 92 : 44;
      const d = this.target - this.x;
      if (Math.abs(d) <= speed * dt + 0.1) {
        this.x = this.target; this.target = null;
        if (!this.once) this.anim = this.speaking ? 'parle' : this.baseAnim;
        const cb = this.onArrive; this.onArrive = null; cb?.();
      } else {
        this.face = d > 0 ? 1 : -1;
        this.x += Math.sign(d) * speed * dt;
        if (!this.once) this.anim = this.running ? 'course' : 'marche';
      }
    } else if (!this.once) {
      this.anim = this.speaking ? 'parle' : this.baseAnim;
    }
    if (this.once) {
      const def = animDef(this.once.name);
      if (this.animT >= def.frames.length / def.fps + 0.12) {
        const cb = this.once.done; this.once = null; this.anim = this.speaking ? 'parle' : this.baseAnim; this.animT = 0; cb();
      }
    }
  }

  frameIndex(): number {
    const def = animDef(this.anim);
    const i = Math.floor(this.animT * def.fps);
    return def.loop ? i % def.frames.length : Math.min(def.frames.length - 1, i);
  }
}

interface Ball { x: number; h: number; lane: number; holder: Actor | null; flight: null | { x0: number; x1: number; h0: number; h1: number; arc: number; t: number; dur: number; done: () => void; after?: () => void }; visible: boolean; spin: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; kind: 'p' | 'rain' | 'snow' | 'flash' }

export class World {
  loc: LocationDef | null = null;
  r: RenderedLocation | null = null;
  actors = new Map<string, Actor>();
  player: Actor;
  camX = 0;
  camLock: number | null = null;
  ball: Ball = { x: 0, h: 0, lane: 0, holder: null, flight: null, visible: false, spin: 0 };
  particles: Particle[] = [];
  weather: string | null = null;
  fade = 0;
  fadeTarget = 0;
  flash = 0;
  shake = 0;
  netShake = 0;
  time = 0;
  timeScale = 1;
  timeOverride: TimeOfDay | null = null;
  teams: Record<string, { c1: string; c2: string; shorts: string; socks: string; gk: string }> = {
    nous: { c1: '#1f4e9c', c2: '#f2c230', shorts: '#ffffff', socks: '#1f4e9c', gk: '#2fb36b' },
    eux: { c1: '#d63c3c', c2: '#ffffff', shorts: '#222631', socks: '#d63c3c', gk: '#f0c63a' },
  };
  hub: HubInfo | null = null;
  focus: Focus | null = null;
  inputEnabled = true;
  pendingInteract: Focus | null = null;
  private fadeResolve: (() => void) | null = null;

  constructor(public env: WorldEnv) {
    this.player = new Actor('moi', '', {});
    this.player.isPlayer = true;
  }

  // ───────────────────────────── Chargement ──────────────────────────────

  load(loc: LocationDef, hub: HubInfo | null, spawnX?: number) {
    this.loc = loc;
    this.timeOverride = null;
    this.weather = null;
    this.ball.visible = false; this.ball.holder = null; this.ball.flight = null;
    this.particles = [];
    this.rerender();
    this.actors.clear();
    this.player.setLook(this.env.playerLook(loc));
    this.player.name = this.env.playerName();
    this.player.x = Math.max(10, Math.min((this.r?.width ?? 320) - 10, spawnX ?? loc.spawn ?? 60));
    this.player.target = null; this.player.lane = 0; this.player.speaking = false; this.player.rot = 0;
    this.player.baseAnim = 'idle'; this.player.anim = 'idle'; this.player.once = null;
    this.actors.set('moi', this.player);
    this.syncHub(hub, true);
    this.snapCamera();
  }

  rerender() {
    if (!this.loc) return;
    this.r = renderLocation(this.loc, this.env, this.timeOverride ?? undefined);
  }

  /** Synchronise les PNJ présents avec l'état du jeu (après un événement). */
  syncHub(hub: HubInfo | null, reset = false) {
    this.hub = hub;
    if (!hub) return;
    const want = new Set(hub.npcs.map((n) => n.id));
    for (const [id, a] of this.actors) {
      if (id === 'moi') continue;
      if (!want.has(id) && (reset || a.staged || !a.staged)) this.actors.delete(id);
    }
    for (const n of hub.npcs) {
      let a = this.actors.get(n.id);
      const look = this.env.charLook(n.id, n.look);
      if (!look) continue;
      if (!a) {
        a = new Actor(n.id, this.env.charName(n.id), look);
        a.x = n.x;
        this.actors.set(n.id, a);
      } else {
        a.setLook(look);
        a.staged = false;
        if (reset || Math.abs(a.x - n.x) > 2) { a.x = n.x; a.target = null; }
      }
      a.lane = n.lane ?? 0;
      a.face = n.face === 'gauche' ? -1 : n.face === 'droite' ? 1 : n.x > this.player.x ? -1 : 1;
      a.baseAnim = n.anim ?? 'idle';
      if (!a.once) a.anim = a.baseAnim;
      a.marker = n.hasNew;
      a.rot = 0;
      a.speaking = false;
    }
  }

  snapCamera() {
    const w = this.r?.width ?? VIEW_W;
    this.camX = Math.max(0, Math.min(w - VIEW_W, Math.round(this.player.x - VIEW_W / 2)));
  }

  actor(id: string): Actor | undefined {
    if (id === 'joueur' || id === 'moi') return this.player;
    return this.actors.get(id);
  }

  ensureActor(id: string): Actor {
    let a = this.actor(id);
    if (a) return a;
    const look = this.env.charLook(id) ?? randomLook([...id].reduce((s, c) => s * 31 + c.charCodeAt(0), 3));
    a = new Actor(id, this.env.charName(id), look);
    a.staged = true;
    a.x = this.player.x + 30;
    a.face = -1;
    this.actors.set(id, a);
    return a;
  }

  // ───────────────────────────── Mise à jour ─────────────────────────────

  update(dtRaw: number) {
    const dt = Math.min(0.05, dtRaw) * this.timeScale * ((globalThis as unknown as { __mvFast?: number }).__mvFast ?? 1);
    this.time += dt;
    for (const a of this.actors.values()) a.update(dt);
    const w = this.r?.width ?? VIEW_W;
    this.player.x = Math.max(6, Math.min(w - 6, this.player.x));
    // Ballon
    const b = this.ball;
    if (b.flight) {
      const f = b.flight;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      b.x = f.x0 + (f.x1 - f.x0) * k;
      b.h = f.h0 + (f.h1 - f.h0) * k + f.arc * 4 * k * (1 - k);
      b.spin += dt * 20;
      if (k >= 1) { b.flight = null; f.after?.(); f.done(); }
    } else if (b.holder) {
      b.x = b.holder.x + b.holder.face * 5;
      b.h = 0; b.lane = b.holder.lane;
      if (b.holder.target !== null) b.spin += dt * 12;
    }
    // Caméra
    const want = this.camLock ?? this.player.x - VIEW_W / 2;
    const clamped = Math.max(0, Math.min(w - VIEW_W, want));
    this.camX += (clamped - this.camX) * Math.min(1, dt * 5);
    // Focus d'interaction
    this.focus = this.inputEnabled ? this.computeFocus() : null;
    for (const a of this.actors.values()) a.label = !!this.focus && this.focus.kind === 'npc' && this.focus.id === a.id;
    // Effets
    if (this.weather === 'pluie' && this.particles.length < 160) for (let i = 0; i < 4; i++) this.particles.push({ x: Math.random() * (VIEW_W + 40) - 20, y: -4, vx: -30, vy: 260, life: 1, color: 'rgba(170,200,255,0.7)', kind: 'rain' });
    if (this.weather === 'neige' && this.particles.length < 120) this.particles.push({ x: Math.random() * VIEW_W, y: -4, vx: Math.random() * 10 - 5, vy: 22, life: 8, color: '#ffffff', kind: 'snow' });
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.kind === 'p') p.vy += 60 * dt; }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < VIEW_H + 8);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dtRaw * 7);
    if (Math.abs(this.fade - this.fadeTarget) < 0.02) { this.fade = this.fadeTarget; if (this.fadeResolve) { const r = this.fadeResolve; this.fadeResolve = null; r(); } }
    this.flash = Math.max(0, this.flash - dtRaw * 2.5);
    this.shake = Math.max(0, this.shake - dtRaw * 2);
    this.netShake = Math.max(0, this.netShake - dtRaw);
    // Arrivée sur une cible d'interaction (clic)
    if (this.pendingInteract && this.player.target === null) {
      const f = this.pendingInteract; this.pendingInteract = null;
      if (Math.abs(this.player.x - f.x) < 22) this.onInteract?.(f);
    }
  }

  onInteract?: (f: Focus) => void;

  computeFocus(): Focus | null {
    const h = this.hub;
    if (!h) return null;
    const px = this.player.x;
    let best: Focus | null = null;
    let bd = 20;
    for (const a of this.actors.values()) {
      if (a.isPlayer || !h.npcs.some((n) => n.id === a.id)) continue;
      const d = Math.abs(a.x - px);
      if (d < bd) { bd = d; best = { kind: 'npc', id: a.id, x: a.x, label: a.name }; }
    }
    for (const hs of h.hotspots) {
      const d = Math.abs(hs.def.x - px);
      if (d < bd) { bd = d; best = { kind: 'hotspot', id: hs.def.id, x: hs.def.x, label: hs.def.label }; }
    }
    for (const e of h.exits) {
      const d = Math.abs(e.x - px);
      if (d < bd) { bd = d; best = { kind: 'exit', id: e.to, x: e.x, label: e.label, to: e.to, spawn: e.spawn }; }
    }
    return best;
  }

  /** Clic dans le monde : se déplacer, et interagir à l'arrivée si on a cliqué une cible. */
  clickAt(worldX: number) {
    if (!this.inputEnabled) return;
    const h = this.hub;
    let target: Focus | null = null;
    if (h) {
      for (const a of this.actors.values()) if (!a.isPlayer && h.npcs.some((n) => n.id === a.id) && Math.abs(a.x - worldX) < 9) target = { kind: 'npc', id: a.id, x: a.x, label: a.name };
      if (!target) for (const hs of h.hotspots) if (Math.abs(hs.def.x - worldX) < 12) target = { kind: 'hotspot', id: hs.def.id, x: hs.def.x, label: hs.def.label };
      if (!target) for (const e of h.exits) if (Math.abs(e.x - worldX) < 12) target = { kind: 'exit', id: e.to, x: e.x, label: e.label, to: e.to, spawn: e.spawn };
    }
    if (target) {
      const stand = target.kind === 'npc' ? target.x + (this.player.x < target.x ? -14 : 14) : target.x;
      if (Math.abs(this.player.x - stand) < 4 && target) { this.onInteract?.(target); return; }
      this.player.target = stand; this.player.running = Math.abs(stand - this.player.x) > 90;
      this.pendingInteract = target;
    } else {
      this.player.target = worldX; this.player.running = Math.abs(worldX - this.player.x) > 90;
      this.pendingInteract = null;
    }
  }

  // ───────────────────────────── Rendu ───────────────────────────────────

  render(ctx: CanvasRenderingContext2D) {
    const r = this.r;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!r) return;
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * 4 * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round((Math.random() - 0.5) * 3 * this.shake) : 0;
    const cam = Math.round(this.camX);
    if (r.far) {
      const fx = -Math.round(cam * PARALLAX) + sx;
      ctx.drawImage(r.far, fx, sy);
      ctx.save(); ctx.translate(fx, sy);
      for (const a of r.anim) if (a.layer === 'far') a.draw(ctx, this.time);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(-cam + sx, sy);
    ctx.drawImage(r.main, 0, 0);
    for (const a of r.anim) if (a.layer === 'main') a.draw(ctx, this.time);
    // repères d'interaction (éléments du décor, sorties)
    if (this.hub && this.inputEnabled) {
      for (const hs of this.hub.hotspots) {
        const near = this.focus?.kind === 'hotspot' && this.focus.id === hs.def.id;
        const bob = Math.round(Math.sin(this.time * 4) * 1.5);
        ctx.fillStyle = near ? '#ffe680' : 'rgba(255,230,128,0.45)';
        ctx.fillRect(hs.def.x - 1, 112 + bob, 3, 3); ctx.fillRect(hs.def.x, 111 + bob, 1, 5); ctx.fillRect(hs.def.x - 2, 113 + bob, 5, 1);
      }
      for (const e of this.hub.exits) {
        const near = this.focus?.kind === 'exit' && this.focus.to === e.to;
        if (!near && e.kind === 'porte') continue;
        const bob = Math.round(Math.sin(this.time * 5) * 1.5);
        const y = e.kind === 'porte' ? 96 : 150;
        ctx.fillStyle = near ? '#9ff0ff' : 'rgba(159,240,255,0.5)';
        if (e.kind === 'bord') {
          const dir = e.x < 40 ? -1 : 1;
          for (let i = 0; i < 4; i++) ctx.fillRect(e.x + dir * (i + bob) - (dir < 0 ? 0 : 0), y - i, 1, i * 2 + 1);
        } else { for (let i = 0; i < 4; i++) ctx.fillRect(e.x - i, y + i + bob, i * 2 + 1, 1); }
      }
    }
    // acteurs (fond → devant)
    const list = [...this.actors.values()].sort((a, b) => b.lane - a.lane || (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const a of list) this.drawActor(ctx, a);
    this.drawBall(ctx);
    if (this.netShake > 0) {
      const goal = (this.loc?.props ?? []).find((p) => p.type === 'but' && p.dir !== 'gauche');
      if (goal) for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(goal.x + (Math.random() - 0.3) * 14, 140 + Math.random() * 26, 1, 1); }
    }
    ctx.drawImage(r.front, 0, 0);
    for (const a of r.anim) if (a.layer === 'front') a.draw(ctx, this.time);
    for (const a of list) this.drawOverlay(ctx, a);
    ctx.restore();
    // particules (coordonnées écran)
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      if (p.kind === 'rain') ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 4);
      else if (p.kind === 'flash') { ctx.globalAlpha = Math.max(0, p.life * 4); ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3); ctx.globalAlpha = 1; }
      else ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    // éclairage selon le moment de la journée
    const t = r.time;
    const tint = t === 'nuit' ? (r.interior ? '#9aa0c8' : '#5d6aa8') : t === 'soir' ? '#f2b892' : t === 'aube' ? '#f6cdb8' : null;
    if (tint) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalCompositeOperation = 'screen';
    for (const g of r.glows) {
      if (g.night && t !== 'nuit' && t !== 'soir') continue;
      const gx = g.x - cam;
      if (gx < -g.r || gx > VIEW_W + g.r) continue;
      const grad = ctx.createRadialGradient(gx, g.y, 0, gx, g.y, g.r);
      const a = t === 'nuit' ? g.alpha : g.alpha * 0.5;
      grad.addColorStop(0, hexA(g.color, a)); grad.addColorStop(1, hexA(g.color, 0));
      ctx.fillStyle = grad; ctx.fillRect(gx - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.fade > 0) { ctx.fillStyle = `rgba(8,9,14,${this.fade})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }

  private drawActor(ctx: CanvasRenderingContext2D, a: Actor) {
    const y = a.laneY;
    const x = Math.round(a.x);
    ctx.fillStyle = 'rgba(10,10,20,0.28)';
    ctx.fillRect(x - 6, y - 1, 13, 2); ctx.fillRect(x - 4, y, 9, 1);
    let emo = a.emo;
    if (a.anim === 'joie') emo = 'content';
    if (a.anim === 'triste') emo = 'triste';
    const frame = getFrame(a.look, a.anim, a.frameIndex(), emo, a.lookKey);
    const img = a.face < 0 ? flipped(frame) : frame;
    const ox = a.face < 0 ? SPR_W - 16 : 15;
    if (a.anim === 'plongeon' || a.anim === 'chute' || a.rot) {
      const ang = a.anim === 'plongeon' ? -a.face * Math.PI * 0.42 : a.anim === 'chute' ? a.face * Math.PI * 0.5 : a.rot;
      ctx.save();
      ctx.translate(x, y - 10);
      ctx.rotate(ang);
      ctx.drawImage(img, -ox, -SPR_H + 12);
      ctx.restore();
    } else ctx.drawImage(img, x - ox, y - SPR_H + 2);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, a: Actor) {
    const x = Math.round(a.x);
    const top = a.laneY - 40;
    if (a.marker && !a.speaking && this.inputEnabled) {
      const bob = Math.round(Math.sin(this.time * 5) * 2);
      ctx.fillStyle = '#1b1420'; ctx.fillRect(x - 2, top - 12 + bob, 5, 9);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 1, top - 11 + bob, 3, 5); ctx.fillRect(x - 1, top - 5 + bob, 3, 1);
    }
    if (a.label && !a.isPlayer) {
      const name = a.name.toUpperCase();
      const w = name.length * 4 + 3;
      ctx.fillStyle = 'rgba(15,12,24,0.78)'; ctx.fillRect(x - Math.ceil(w / 2), top - 9, w, 8);
      drawTinyText(ctx, name, x, top - 7, '#ffffff', { align: 'center' });
    }
    if (a.emote) {
      const k = a.emote.kind;
      const bob = a.emote.t < 0.2 ? Math.round((0.2 - a.emote.t) * 20) : 0;
      const bx = x + a.face * 6; const by = top - 12 + bob;
      ctx.fillStyle = '#17131f'; ctx.fillRect(bx - 5, by - 1, 11, 10); ctx.fillStyle = '#ffffff'; ctx.fillRect(bx - 4, by, 9, 8);
      ctx.fillRect(bx - a.face * 2, by + 8, 2, 2);
      const map: Record<string, [string, string]> = { '!': ['!', '#d63c3c'], '?': ['?', '#2f62c9'], '...': ['...', '#555555'], coeur: ['♥', '#e0457b'], colere: ['#', '#d63c3c'], etoile: ['*', '#e2a400'], note: ['>', '#7d4bc4'], zzz: ['Z', '#555555'], sueur: ["'", '#3fa0e0'] };
      const [g, c] = map[k] ?? [k.slice(0, 1), '#333'];
      if (g === '...') { ctx.fillStyle = c; ctx.fillRect(bx - 3, by + 5, 1, 1); ctx.fillRect(bx, by + 5, 1, 1); ctx.fillRect(bx + 3, by + 5, 1, 1); }
      else drawTinyText(ctx, g, bx + 1, by + 2, c, { align: 'center' });
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    const b = this.ball;
    if (!b.visible) return;
    const gy = LANE_Y[b.lane] ?? LANE_Y[0];
    const x = Math.round(b.x);
    ctx.fillStyle = 'rgba(10,10,20,0.3)';
    const s = Math.max(1, 3 - Math.floor(b.h / 12));
    ctx.fillRect(x - s, gy - 1, s * 2 + 1, 1);
    const y = Math.round(gy - 4 - b.h);
    ctx.fillStyle = '#17131f'; ctx.fillRect(x - 2, y - 1, 5, 6); ctx.fillRect(x - 3, y, 7, 4);
    ctx.fillStyle = '#f6f6f6'; ctx.fillRect(x - 2, y, 5, 4); ctx.fillRect(x - 1, y - 1 + 1, 3, 4);
    ctx.fillStyle = '#2a2a33';
    const ph = Math.floor(b.spin) % 2;
    ctx.fillRect(x - 1 + ph, y + 1, 2, 1); ctx.fillRect(x + 1 - ph * 2, y + 2 + ph, 1, 1);
  }

  // ───────────────────────────── Mise en scène ───────────────────────────

  fadeTo(v: number): Promise<void> {
    this.fadeTarget = v;
    return new Promise((res) => { this.fadeResolve = res; setTimeout(() => { if (this.fadeResolve === res) { this.fadeResolve = null; this.fade = v; res(); } }, 600); });
  }

  moveTo(a: Actor, x: number, run: boolean): Promise<void> {
    const w = this.r?.width ?? VIEW_W;
    const tx = Math.max(-40, Math.min(w + 40, x));
    return new Promise((res) => {
      if (Math.abs(a.x - tx) < 1) { res(); return; }
      a.target = tx; a.running = run;
      const prev = a.onArrive;
      a.onArrive = () => { prev?.(); res(); };
      setTimeout(res, 6000);
    });
  }

  posOf(v: string | undefined, rel?: Actor): number {
    if (!v) return this.player.x;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
    if (v.startsWith('+') || v.startsWith('-')) return (rel?.x ?? this.player.x) + Number(v);
    const a = this.actor(v);
    if (a) return a.x + (rel && rel.x < a.x ? -14 : 14);
    if (v === 'but') return this.goalX(1);
    if (v === 'but_gauche') return this.goalX(-1);
    return this.player.x;
  }

  goalX(dir: 1 | -1): number {
    const g = (this.loc?.props ?? []).find((p) => p.type === 'but' && (dir > 0 ? p.dir !== 'gauche' : p.dir === 'gauche'));
    if (g) return g.x - dir * 4;
    return dir > 0 ? (this.r?.width ?? VIEW_W) - 20 : 20;
  }

  teamLook(team: string, seed: number, role?: string): Look {
    const t = this.teams[team] ?? this.teams.eux;
    const base = randomLook(seed);
    const gk = role === 'gardien' || role === 'gk';
    return { ...base, top: gk ? 'gardien' : 'maillot', topColor: gk ? t.gk : t.c1, topColor2: gk ? '#1d1d24' : t.c2, bottom: 'short', bottomColor: t.shorts, socks: gk ? t.gk : t.socks, shoes: '#1d1d22', acc: gk ? ['gants'] : [] };
  }

  spawnExtra(id: string, team: string, x: number, lane = 0, role?: string): Actor {
    const seed = [...id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 11) + Math.floor(x);
    const isTeam = team === 'nous' || team === 'eux' || !!this.teams[team];
    const look = isTeam ? this.teamLook(team, seed, role) : randomLook(seed);
    const a = new Actor(id, '', look);
    a.x = x; a.lane = lane; a.staged = true;
    a.face = x > this.player.x ? -1 : 1;
    if (role === 'gardien' || role === 'gk') a.baseAnim = 'garde';
    this.actors.set(id, a);
    return a;
  }

  applyPreset(name: string) {
    const list = this.env.presets()[name];
    if (!list) return;
    for (const [id, a] of this.actors) if (a.staged || (!a.isPlayer && !this.hub?.npcs.some((n) => n.id === id))) this.actors.delete(id);
    let holder: Actor | null = null;
    for (const p of list) {
      let a: Actor;
      if (p.actor === 'moi' || this.env.charLook(p.actor)) {
        a = this.ensureActor(p.actor);
        if (p.team && !a.isPlayer) { const t = this.teams[p.team]; if (t) a.setLook({ ...a.look, top: 'maillot', topColor: t.c1, topColor2: t.c2, bottom: 'short', bottomColor: t.shorts, socks: t.socks }); }
      } else a = this.spawnExtra(p.actor, p.team ?? 'eux', p.x, p.lane ?? 0, p.role);
      a.x = p.x; a.lane = p.lane ?? 0; a.target = null; a.staged = !a.isPlayer;
      a.face = p.face === 'gauche' ? -1 : p.face === 'droite' ? 1 : a.face;
      if (p.anim) { a.baseAnim = p.anim; a.anim = p.anim; }
      if (p.ball) holder = a;
    }
    if (holder) { this.ball.visible = true; this.ball.holder = holder; this.ball.flight = null; }
    this.camLock = null;
  }

  async ballCmd(a: string[]) {
    const b = this.ball;
    const [action, target, style] = a;
    if (action === 'cacher') { b.visible = false; b.holder = null; return; }
    if (action === 'placer') { b.visible = true; b.holder = null; b.flight = null; b.x = this.posOf(target); b.h = 0; return; }
    if (action === 'pied' || action === 'a') {
      const who = this.actor(target ?? 'moi');
      if (who) { b.visible = true; b.holder = who; b.flight = null; b.lane = who.lane; }
      return;
    }
    if (action !== 'vers') return;
    b.visible = true;
    const from = b.holder;
    const x0 = from ? from.x + from.face * 6 : b.x;
    b.holder = null;
    const st = style ?? 'passe';
    let x1: number; let h1 = 0; let toActor: Actor | undefined;
    if (target === 'but' || target === 'but_gauche') { x1 = this.goalX(target === 'but' ? 1 : -1) + (target === 'but' ? 6 : -6); h1 = st === 'rate' ? 38 : 9 + Math.random() * 8; }
    else if (target === 'dessus') { x1 = this.goalX(1) + 14; h1 = 40; }
    else if (target === 'poteau') { x1 = this.goalX(1) - 1; h1 = 12; }
    else { toActor = this.actor(target); x1 = toActor ? toActor.x - toActor.face * 4 : this.posOf(target); h1 = toActor && (toActor.anim === 'plongeon' || toActor.baseAnim === 'garde') ? 12 : 0; }
    const arc = st === 'lob' ? 42 : st === 'centre' ? 28 : st === 'tir' ? 5 : st === 'rate' ? 14 : 3;
    const speed = st === 'tir' || st === 'rate' ? 230 : st === 'lob' ? 95 : st === 'centre' ? 130 : 150;
    const dur = Math.max(0.25, Math.abs(x1 - x0) / speed);
    await new Promise<void>((res) => {
      b.flight = { x0, x1, h0: 2, h1, arc, t: 0, dur, done: res, after: () => {
        if (toActor) { b.holder = toActor; b.lane = toActor.lane; }
        else if (target === 'but' || target === 'but_gauche') { this.netShake = 0.7; b.h = 0; }
        else if (target === 'poteau') { b.flight = { x0: b.x, x1: b.x - 30, h0: b.h, h1: 0, arc: 6, t: 0, dur: 0.4, done: () => undefined }; }
        else b.h = 0;
      } };
      setTimeout(res, 4000);
    });
  }

  async cameraTo(v: string | undefined) {
    if (!v || v === 'suivre' || v === 'joueur') { this.camLock = null; await wait(300); return; }
    const x = this.posOf(v);
    this.camLock = x - VIEW_W / 2;
    await wait(450);
  }

  fx(kind: string, arg?: string) {
    switch (kind) {
      case 'confettis': for (let i = 0; i < 90; i++) this.particles.push({ x: Math.random() * VIEW_W, y: -Math.random() * 40, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, life: 3, color: ['#ffd23f', '#e0457b', '#3fa0e0', '#5fcf7d', '#ffffff'][i % 5], kind: 'p' }); break;
      case 'flash': this.flash = 0.8; break;
      case 'tremblement': this.shake = 1; break;
      case 'filet': this.netShake = 0.8; break;
      case 'flashs': for (let i = 0; i < 24; i++) this.particles.push({ x: Math.random() * VIEW_W, y: 60 + Math.random() * 60, vx: 0, vy: 0, life: Math.random() * 0.6, color: '#ffffff', kind: 'flash' }); break;
      case 'etincelles': for (let i = 0; i < 30; i++) this.particles.push({ x: this.player.x - this.camX, y: 130, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 1, color: '#ffe680', kind: 'p' }); break;
      case 'pluie': this.weather = 'pluie'; break;
      case 'neige': this.weather = 'neige'; break;
      case 'foule': (globalThis as unknown as { __crowdHype?: number }).__crowdHype = Math.max(0, Math.min(1, Number(arg ?? 0.9))); break;
      case 'magie': {
        // Tourbillon d'étincelles autour d'un acteur (ou du joueur)
        const src = arg && arg !== 'moi' ? this.actors.get(arg) ?? this.player : this.player;
        const sx = src.x - this.camX;
        const cols = ['#b46aff', '#7ad8ff', '#ffffff', '#ffd86a'];
        for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2; const r = 6 + Math.random() * 14; this.particles.push({ x: sx + Math.cos(a) * r, y: 150 - Math.random() * 34, vx: -Math.sin(a) * 30, vy: -18 - Math.random() * 30, life: 0.8 + Math.random() * 0.8, color: cols[i % cols.length], kind: 'p' }); }
        break;
      }
      case 'sort': {
        // Rayon de sort : de l'acteur arg vers la cible (« !fx sort moi lucas »)
        const [from, to, colr] = (arg ?? 'moi').split(/[|,]/);
        const a0 = from && from !== 'moi' ? this.actors.get(from) ?? this.player : this.player;
        const tx = this.posOf(to || '+60', a0);
        const x0 = a0.x - this.camX + a0.face * 8; const x1 = tx - this.camX;
        const c0 = colr ? this.env.color(colr, '#7ad8ff') : '#7ad8ff';
        for (let i = 0; i < 40; i++) { const k = i / 40; this.particles.push({ x: x0 + (x1 - x0) * k, y: 142 + Math.sin(k * 12) * 3, vx: (x1 - x0) * 0.4, vy: (Math.random() - 0.5) * 12, life: 0.25 + k * 0.5, color: i % 3 ? c0 : '#ffffff', kind: 'p' }); }
        for (let i = 0; i < 18; i++) this.particles.push({ x: x1, y: 140, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.8) * 70, life: 0.9, color: c0, kind: 'p' });
        this.flash = Math.max(this.flash, 0.25);
        break;
      }
      case 'fumee': {
        const src = arg && arg !== 'moi' ? this.actors.get(arg) ?? this.player : this.player;
        const sx = src.x - this.camX;
        for (let i = 0; i < 34; i++) this.particles.push({ x: sx + (Math.random() - 0.5) * 22, y: 160 - Math.random() * 30, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 18, life: 1 + Math.random(), color: i % 2 ? '#9a9aa8' : '#c8c8d0', kind: 'p' });
        break;
      }
      case 'eclair': this.flash = 1; this.shake = 0.8; break;
    }
  }

  async exec(cmd: string, a: string[]): Promise<void> {
    switch (cmd) {
      case 'moment': this.timeOverride = (['aube', 'jour', 'soir', 'nuit'].includes(a[0]) ? a[0] : null) as TimeOfDay | null; this.rerender(); return;
      case 'placer': {
        const act = this.ensureActor(a[0]);
        act.x = this.posOf(a[1], act); act.target = null;
        if (a[2]) act.face = a[2] === 'gauche' ? -1 : 1;
        if (a[3]) act.lane = Number(a[3]) || 0;
        return;
      }
      case 'aller': case 'courir': { const act = this.ensureActor(a[0]); await this.moveTo(act, this.posOf(a[1], act), cmd === 'courir'); return; }
      case 'anim': {
        const act = this.actor(a[0]); if (!act) return;
        const def = animDef(a[1] ?? 'idle');
        if (a[2] === 'boucle' || (def.loop && a[2] !== 'une')) { act.baseAnim = a[1]; if (!act.once) act.anim = a[1]; act.animT = 0; return; }
        await act.playOnce(a[1]);
        return;
      }
      case 'face': {
        const act = this.actor(a[0]); if (!act) return;
        const t = a[1];
        if (t === 'gauche') act.face = -1; else if (t === 'droite') act.face = 1;
        else { const o = this.actor(t); if (o) act.face = o.x < act.x ? -1 : 1; }
        return;
      }
      case 'emote': this.actor(a[0])?.setEmote(a[1] ?? '!'); return;
      case 'entrer': {
        const act = this.ensureActor(a[0]);
        const fromLeft = a[1] === 'gauche';
        act.x = fromLeft ? this.camX - 20 : this.camX + VIEW_W + 20;
        await this.moveTo(act, a[2] ? this.posOf(a[2], act) : this.player.x + (fromLeft ? -26 : 26), false);
        act.face = act.x < this.player.x ? 1 : -1;
        return;
      }
      case 'sortir': {
        const act = this.actor(a[0]); if (!act || act.isPlayer) return;
        const left = a[1] === 'gauche' || (a[1] !== 'droite' && act.x < this.camX + VIEW_W / 2);
        await this.moveTo(act, left ? this.camX - 30 : this.camX + VIEW_W + 30, a[2] === 'course');
        this.actors.delete(act.id);
        return;
      }
      case 'figurant': this.spawnExtra(a[0], a[1] ?? 'foule', this.posOf(a[2]), Number(a[3] ?? 0) || 0, a[4]); return;
      case 'retirer': if (a[0] !== 'moi') this.actors.delete(a[0]); return;
      case 'equipe': {
        const prev = this.teams[a[0]] ?? this.teams.eux;
        const c = (v: string | undefined, f: string) => (v ? this.env.color(v, f) : f);
        this.teams[a[0]] = { c1: c(a[1], prev.c1), c2: c(a[2], prev.c2), shorts: c(a[3], prev.shorts), socks: c(a[4], c(a[1], prev.socks)), gk: prev.gk };
        return;
      }
      case 'preset': this.applyPreset(a[0]); return;
      case 'ballon': case 'objet': await this.ballCmd(cmd === 'objet' ? a.slice(1) : a); return;
      case 'camera': await this.cameraTo(a[0]); return;
      case 'fx': this.fx(a[0], a[0] === 'sort' ? a.slice(1).join('|') : a[1]); if (['flash', 'tremblement', 'sort', 'eclair'].includes(a[0])) await wait(260); return;
      case 'meteo': this.weather = a[0] === 'clair' ? null : a[0]; if (!this.weather) this.particles = []; return;
      case 'pause': await wait(Math.min(5000, Number(a[0] ?? 500) || 500) / this.timeScale); return;
      case 'fondu': await this.fadeTo(1); await wait(200); await this.fadeTo(0); return;
      case 'tenue': {
        const act = this.actor(a[0]); if (!act) return;
        act.setLook({ ...act.look, top: a[1] ?? act.look.top, ...(a[2] ? { topColor: this.env.color(a[2], '#888888') } : {}), ...(a[3] ? { topColor2: this.env.color(a[3], '#ffffff') } : {}), ...(a[1] === 'maillot' ? { bottom: 'short' } : {}) });
        return;
      }
    }
  }
}

function hexA(c: string, a: number): string {
  const h = col(c, '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}
export { mix };
