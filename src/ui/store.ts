// Mini « store » observable + hook Preact.
import { useEffect, useState } from 'preact/hooks';

export class Store<T extends object> {
  private s: T;
  private subs = new Set<() => void>();
  constructor(initial: T) { this.s = initial; }
  get(): T { return this.s; }
  set(patch: Partial<T> | ((s: T) => Partial<T>)) {
    const p = typeof patch === 'function' ? patch(this.s) : patch;
    this.s = { ...this.s, ...p };
    for (const f of this.subs) f();
  }
  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
}

export function useStore<T extends object>(store: Store<T>): T {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
  return store.get();
}
