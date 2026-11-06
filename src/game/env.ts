// Environnement visuel lié à l'état d'une partie : couleurs « $variable »,
// textes interpolés, conditions d'apparition des décors.
import type { Look, UniverseDef, Value } from '../core/model/types';
import { GameSession } from '../core/runtime/session';
import { col } from '../engine/gfx/character';
import type { SceneEnv } from '../engine/gfx/scenery';
import { compiled } from './registry';

export function sessionEnv(g: GameSession): SceneEnv {
  return {
    color: (v, f) => {
      if (typeof v !== 'string') return f;
      if (v.startsWith('$')) { const r = g.s.vars[v.slice(1)]; return col(typeof r === 'string' ? r : undefined, f); }
      if (v.includes('{')) return col(g.render(v), f);
      return col(v, f);
    },
    num: (v, f) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        if (v.startsWith('$')) { const r = Number(g.s.vars[v.slice(1)]); return Number.isFinite(r) ? r : f; }
        const n = Number(g.render(v)); return Number.isFinite(n) ? n : f;
      }
      return f;
    },
    text: (v) => (v === undefined || v === null ? '' : g.render(String(v))),
    test: (c) => g.testSrc(c),
  };
}

export function resolveLookWith(g: GameSession, l: Look | undefined): Look {
  const out: Look = { ...(l ?? {}) };
  for (const k of ['skin', 'hairColor', 'topColor', 'topColor2', 'bottomColor', 'shoes', 'socks', 'eyes'] as const) {
    const v = out[k];
    if (typeof v === 'string' && v.startsWith('$')) { const r = g.s.vars[v.slice(1)]; out[k] = typeof r === 'string' ? r : undefined; }
  }
  return out;
}

/** Session « vitrine » (état initial) pour les aperçus hors partie. */
export function previewSession(def: UniverseDef, vars?: Record<string, Value>): GameSession {
  const g = GameSession.create(compiled(def), { name: def.creation?.defaultName ?? 'Joueur', seed: 1, look: def.creation?.baseLook });
  if (vars) Object.assign(g.s.vars, vars);
  return g;
}
