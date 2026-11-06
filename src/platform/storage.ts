// ─────────────────────────────────────────────────────────────────────────────
// Stockage persistant : sauvegardes, univers créés dans l'éditeur, réglages,
// fins découvertes.
//   • Publié sur claude.ai : base privée par joueur (capacité « db »), qui suit
//     le joueur d'un appareil à l'autre, avec copie locale.
//   • Ailleurs (fichier local) : localStorage, avec repli en mémoire.
// Les documents volumineux (univers) sont découpés en morceaux.
// ─────────────────────────────────────────────────────────────────────────────

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

const PREFIX = 'mv:';
const memory = new Map<string, string>();

export class LocalKV implements KV {
  async get(key: string) {
    try { const v = localStorage.getItem(PREFIX + key); if (v !== null) return v; } catch { /* stockage bloqué */ }
    return memory.get(key) ?? null;
  }
  async set(key: string, value: string) {
    memory.set(key, value);
    try { localStorage.setItem(PREFIX + key, value); } catch { /* quota ou stockage bloqué : la mémoire prend le relais */ }
  }
  async del(key: string) {
    memory.delete(key);
    try { localStorage.removeItem(PREFIX + key); } catch { /* */ }
  }
  async keys(prefix: string) {
    const out = new Set<string>([...memory.keys()].filter((k) => k.startsWith(prefix)));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) out.add(k.slice(PREFIX.length));
      }
    } catch { /* */ }
    return [...out];
  }
}

// Types minimaux de la capacité « db » (voir la documentation de la plateforme).
interface DocSnap { exists: boolean; id: string; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface ColRef { doc(id: string): DocRef; get(): Promise<{ docs: DocSnap[] }> }
interface DB { collection(path: string): ColRef }

const CHUNK = 180_000;
const safeId = (k: string) => k.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');

export class CloudKV implements KV {
  constructor(private db: DB, private uid: string) {}
  private col() { return this.db.collection(`data/users/${this.uid}`); }
  async get(key: string) {
    const meta = await this.col().doc(safeId(key)).get();
    if (!meta.exists) return null;
    const d = meta.data() ?? {};
    if (typeof d.v === 'string') return d.v;
    const n = Number(d.chunks ?? 0);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const c = await this.col().doc(`${safeId(key)}~${i}`).get();
      parts.push(String(c.data()?.v ?? ''));
    }
    return parts.join('');
  }
  async set(key: string, value: string) {
    const id = safeId(key);
    if (value.length <= CHUNK) { await this.col().doc(id).set({ k: key, v: value, t: Date.now() }); return; }
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await this.col().doc(`${id}~${i}`).set({ v: value.slice(i * CHUNK, (i + 1) * CHUNK) });
    await this.col().doc(id).set({ k: key, chunks: n, t: Date.now() });
  }
  async del(key: string) {
    const id = safeId(key);
    const meta = await this.col().doc(id).get();
    const n = Number(meta.data()?.chunks ?? 0);
    for (let i = 0; i < n; i++) await this.col().doc(`${id}~${i}`).delete();
    await this.col().doc(id).delete();
  }
  async keys(prefix: string) {
    const snap = await this.col().get();
    return snap.docs.map((d) => String(d.data()?.k ?? '')).filter((k) => k && k.startsWith(prefix));
  }
}

/** Écrit partout, lit d'abord dans le nuage puis en local. */
class CompositeKV implements KV {
  cloud: KV | null = null;
  constructor(private local: KV) {}
  async get(key: string) {
    if (this.cloud) {
      try { const v = await this.cloud.get(key); if (v !== null) { void this.local.set(key, v); return v; } } catch { /* repli local */ }
    }
    return this.local.get(key);
  }
  async set(key: string, value: string) {
    await this.local.set(key, value);
    if (this.cloud) { try { await this.cloud.set(key, value); } catch (e) { console.warn('Sauvegarde distante impossible', e); } }
  }
  async del(key: string) {
    await this.local.del(key);
    if (this.cloud) { try { await this.cloud.del(key); } catch { /* */ } }
  }
  async keys(prefix: string) {
    const set = new Set(await this.local.keys(prefix));
    if (this.cloud) { try { for (const k of await this.cloud.keys(prefix)) set.add(k); } catch { /* */ } }
    return [...set];
  }
}

export const storage = new CompositeKV(new LocalKV());
export let cloudActive = false;

/** Tente d'activer la base privée par joueur (quand la page est publiée sur claude.ai). */
export async function initCloudStorage(onReady?: () => void): Promise<void> {
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!claude?.use) return;
  try {
    const [db, user] = await Promise.all([claude.use('db') as Promise<DB | null>, claude.use('user') as Promise<{ id(): Promise<string | null> } | null>]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    storage.cloud = new CloudKV(db, uid);
    cloudActive = true;
    onReady?.();
  } catch { /* fonctionnement local */ }
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try { const v = await storage.get(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export async function setJSON(key: string, value: unknown) { await storage.set(key, JSON.stringify(value)); }

// ───────────────────────────── Fichiers ────────────────────────────────────

/** Propose un fichier au joueur (capacité « downloads » sur claude.ai, lien local sinon). */
export async function offerDownload(filename: string, data: string): Promise<'ok' | 'refuse' | 'indisponible'> {
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (claude?.use) {
    try {
      const dl = (await claude.use('downloads')) as { save(r: { filename: string; data: string }): Promise<unknown> } | null;
      if (dl) { await dl.save({ filename, data }); return 'ok'; }
    } catch (e) { const code = (e as { code?: string }).code; if (code === 'declined') return 'refuse'; }
  }
  try {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'ok';
  } catch { return 'indisponible'; }
}

export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) { res(null); return; }
      const r = new FileReader();
      r.onload = () => res(String(r.result ?? ''));
      r.onerror = () => res(null);
      r.readAsText(f);
    };
    input.click();
  });
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
