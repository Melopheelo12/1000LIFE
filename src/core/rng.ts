// Générateur pseudo-aléatoire déterministe (sfc32) à état sérialisable :
// une sauvegarde rechargée reproduit exactement les mêmes tirages.
export class Rng {
  private a = 0; private b = 0; private c = 0; private d = 0;

  constructor(seed: number | number[] = Date.now()) {
    if (Array.isArray(seed) && seed.length === 4) {
      [this.a, this.b, this.c, this.d] = seed.map((x) => x >>> 0);
    } else {
      const s = (Array.isArray(seed) ? seed[0] ?? 1 : seed) >>> 0;
      this.a = 0x9e3779b9; this.b = 0x243f6a88; this.c = 0xb7e15162; this.d = s ^ 0xdeadbeef;
      for (let i = 0; i < 15; i++) this.next();
    }
  }

  next(): number {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }

  /** entier dans [min, max] inclus */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return Math.floor(min + this.next() * (Math.floor(max) - Math.ceil(min) + 1));
  }

  chance(percent: number): boolean { return this.next() * 100 < percent; }

  pick<T>(arr: readonly T[]): T | undefined { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    let total = 0;
    const ws = items.map((it) => { const w = Math.max(0, weight(it)); total += w; return w; });
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  }

  poisson(lambda: number): number {
    const L = Math.exp(-Math.max(0, Math.min(lambda, 20)));
    let k = 0; let p = 1;
    do { k++; p *= this.next(); } while (p > L && k < 50);
    return k - 1;
  }

  state(): number[] { return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]; }
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
