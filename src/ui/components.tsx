// Composants d'interface partagés (aperçus pixel, jauges, panneaux).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { LocationDef, Look } from '../core/model/types';
import { animDef, getFrame, SPR_H, SPR_W } from '../engine/gfx/character';
import { getPortrait, PORTRAIT } from '../engine/gfx/portrait';
import { renderLocation, envFromColors, type SceneEnv } from '../engine/gfx/scenery';
import { VIEW_H, VIEW_W } from '../engine/gfx/pixel';

export function PortraitView({ look, emo = 'neutre', className, size = PORTRAIT }: { look: Look; emo?: string; className?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(getPortrait(look, emo), 0, 0, size, size);
  }, [JSON.stringify(look), emo, size]);
  return <canvas ref={ref} width={size} height={size} class={`pix ${className ?? 'fill'}`} />;
}

export function SpriteView({ look, anim = 'marche', scale = 4, face = 1 }: { look: Look; anim?: string; scale?: number; face?: 1 | -1 }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(look);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const draw = (t: number) => {
      const c = ref.current; if (!c) return;
      const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, c.width, c.height);
      const def = animDef(anim);
      const fi = Math.floor(((t - t0) / 1000) * def.fps) % def.frames.length;
      const f = getFrame(look, anim, fi, 'content', key);
      x.save();
      if (face < 0) { x.translate(c.width, 0); x.scale(-1, 1); }
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect((SPR_W / 2 - 6) * scale, (SPR_H - 2) * scale, 13 * scale, 2 * scale);
      x.drawImage(f, 0, 0, SPR_W * scale, SPR_H * scale);
      x.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [key, anim, scale, face]);
  return <canvas ref={ref} width={SPR_W * scale} height={SPR_H * scale} class="pix" />;
}

/** Vignette statique d'un lieu (avec ses éléments animés figés). */
export function SceneThumb({ loc, env, time, actors }: { loc: LocationDef | undefined; env?: SceneEnv; time?: 'aube' | 'jour' | 'soir' | 'nuit'; actors?: { look: Look; x: number; anim?: string; face?: 1 | -1 }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !loc) return;
    const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
    const r = renderLocation(loc, env ?? envFromColors(), time);
    const cam = Math.max(0, Math.min(r.width - VIEW_W, (loc.spawn ?? r.width / 2) - VIEW_W / 2));
    x.fillStyle = '#000'; x.fillRect(0, 0, VIEW_W, VIEW_H);
    if (r.far) { x.drawImage(r.far, -Math.round(cam * 0.35), 0); x.save(); x.translate(-Math.round(cam * 0.35), 0); for (const a of r.anim) if (a.layer === 'far') a.draw(x, 2); x.restore(); }
    x.save(); x.translate(-cam, 0); x.drawImage(r.main, 0, 0); for (const a of r.anim) if (a.layer === 'main') a.draw(x, 2);
    for (const a of actors ?? []) {
      const f = getFrame(a.look, a.anim ?? 'idle', 0);
      if ((a.face ?? 1) < 0) { x.save(); x.translate(a.x * 2, 0); x.scale(-1, 1); x.drawImage(f, a.x - 16, 166 - SPR_H + 2); x.restore(); }
      else x.drawImage(f, a.x - 15, 166 - SPR_H + 2);
    }
    x.drawImage(r.front, 0, 0);
    x.restore();
    if (r.time === 'nuit' || r.time === 'soir') { x.globalCompositeOperation = 'multiply'; x.fillStyle = r.time === 'nuit' ? (r.interior ? '#9aa0c8' : '#5d6aa8') : '#f2b892'; x.fillRect(0, 0, VIEW_W, VIEW_H); x.globalCompositeOperation = 'source-over'; }
  }, [loc, time]);
  return <canvas ref={ref} width={VIEW_W} height={VIEW_H} class="pix" />;
}

export function Meter({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return <div class="meter" style={{ '--c': color ?? 'var(--accent)' } as Record<string, string>}><i style={{ width: `${pct}%` }} /></div>;
}

export function PanelShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  return (
    <div class="panel-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="panel pbox" style={wide ? { width: 'min(100%, 1100px)' } : undefined} role="dialog" aria-label={title}>
        <div class="panel-head">
          <h2>{title}</h2>
          <button class="pbtn small" onClick={onClose} aria-label="Fermer">Fermer <span class="kbd">Échap</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function fmtMoney(n: number) { return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`; }
export function fmtStat(v: number, format?: string) { return format === 'argent' ? fmtMoney(v) : format === 'pourcent' ? `${Math.round(v)} %` : String(Math.round(v * 10) / 10).replace('.', ','); }
export function fmtTime(sec: number) { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; }
