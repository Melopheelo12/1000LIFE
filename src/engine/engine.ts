// Boucle de jeu, mise à l'échelle « pixel parfait » du canvas, entrées clavier,
// souris et tactile. Le monde est rendu en 320×180 puis agrandi.
import { VIEW_H, VIEW_W } from './gfx/pixel';
import type { World } from './world/world';

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    target.addEventListener('blur', () => this.keys.clear());
  }
  down(...ks: string[]) { return ks.some((k) => this.keys.has(k)); }
  hit(...ks: string[]) { return ks.some((k) => this.pressed.has(k)); }
  endFrame() { this.pressed.clear(); }
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  scale = 3;
  private raf = 0;
  private last = 0;
  running = false;
  input: Input;
  onFrame?: (dt: number) => void;

  /** host : élément qui reçoit le canvas ; measure : zone disponible pour l'agrandissement. */
  constructor(public world: World, public host: HTMLElement, public measure: HTMLElement = host) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.canvas.className = 'game-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    host.appendChild(this.canvas);
    this.input = new Input(window);
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      this.world.clickAt(x + this.world.camX);
    });
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    const w = this.measure.clientWidth || window.innerWidth;
    const h = portrait ? Math.min(this.measure.clientHeight || window.innerHeight, w * 0.75) : this.measure.clientHeight || window.innerHeight;
    const s = Math.min(w / VIEW_W, h / VIEW_H);
    this.scale = s >= 2 ? Math.floor(s * 2) / 2 : Math.max(0.5, s);
    const gw = Math.round(VIEW_W * this.scale);
    const gh = Math.round(VIEW_H * this.scale);
    this.canvas.style.width = `${gw}px`;
    this.canvas.style.height = `${gh}px`;
    for (const el of [this.host, this.measure]) {
      el.style.setProperty('--px', `${this.scale}px`);
      el.style.setProperty('--gw', `${gw}px`);
      el.style.setProperty('--gh', `${gh}px`);
    }
    this.measure.dataset.layout = portrait ? 'portrait' : 'paysage';
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private onResize: () => void;

  stop() { this.running = false; cancelAnimationFrame(this.raf); window.removeEventListener('resize', this.onResize); this.canvas.remove(); }

  step(dt: number) {
    const w = this.world;
    const inp = this.input;
    if (w.inputEnabled) {
      const left = inp.down('ArrowLeft', 'q', 'a');
      const right = inp.down('ArrowRight', 'd');
      if (left || right) {
        w.pendingInteract = null;
        const run = inp.down('Shift');
        w.player.target = null;
        w.player.running = run;
        w.player.face = left ? -1 : 1;
        w.player.x += (left ? -1 : 1) * (run ? 92 : 46) * Math.min(0.05, dt);
        if (!w.player.once) w.player.anim = run ? 'course' : 'marche';
        w.player.animT += 0;
      } else if (w.player.target === null && !w.player.once && (w.player.anim === 'marche' || w.player.anim === 'course')) {
        w.player.anim = 'idle';
      }
    }
    this.onFrame?.(dt);
    w.update(dt);
    w.render(this.ctx);
    inp.endFrame();
  }
}
