// ─────────────────────────────────────────────────────────────────────────────
// Modèle de données d'un UNIVERS (format JSON « mille-vies/universe@1 »)
// et de l'ÉTAT d'une partie. Aucune notion spécifique à un univers ici :
// le football, la politique ou la fantasy ne sont que des données.
// ─────────────────────────────────────────────────────────────────────────────

export type Value = number | string | boolean;

export interface UniverseDef {
  format?: string;
  id: string;
  version?: string;
  name: string;
  tagline?: string;
  description?: string;
  author?: string;
  tags?: string[];
  published?: boolean;
  theme?: { accent?: string; accent2?: string; bg?: string; cover?: string };
  config?: UniverseConfig;
  stats: StatDef[];
  vars?: Record<string, Value>;
  traits?: TraitDef[];
  characters: CharacterDef[];
  locations: LocationDef[];
  activities?: ActivityDef[];
  chapters: ChapterDef[];
  creation?: CreationDef;
  start: { location: string; event?: string };
  onTickStart?: string;
  onTickEnd?: string;
  events: EventDef[];
  endings: EndingDef[];
  lists?: Record<string, Record<string, Value>[]>;
  sheet?: SheetSection[];
  presets?: Record<string, StagePlacement[]>;
}

export interface UniverseConfig {
  tickLabel?: string;
  actionsPerTick?: number;
  actionsLabel?: string;
  randomEventChance?: number;
  maxStoryEventsPerTick?: number;
  checkScale?: number;
  hud?: string[];
  dateLine?: string;
  relationLevels?: { min: number; label: string; color?: string }[];
  showValues?: boolean;
  endTickLabel?: string;
}

export interface StatDef {
  id: string;
  label: string;
  short?: string;
  category?: string;
  min?: number;
  max?: number;
  initial?: number;
  visible?: boolean;
  format?: 'nombre' | 'argent' | 'pourcent';
  color?: string;
  icon?: string;
  description?: string;
}

export interface TraitDef {
  id: string;
  label: string;
  description?: string;
  /** multiplicateur appliqué aux gains de relation */
  gain?: number;
  /** multiplicateur appliqué aux pertes de relation */
  loss?: number;
}

/** Apparence procédurale d'un personnage (aucun dessin nécessaire). */
export interface Look {
  skin?: string;
  hair?: string;
  hairColor?: string;
  eyes?: string;
  beard?: string;
  top?: string;
  topColor?: string;
  topColor2?: string;
  bottom?: string;
  bottomColor?: string;
  shoes?: string;
  socks?: string;
  build?: 'mince' | 'normal' | 'costaud';
  height?: 'petit' | 'normal' | 'grand' | 'enfant';
  acc?: string[];
  gender?: 'h' | 'f';
}

export interface CharacterDef {
  id: string;
  name: string;
  /** nom court utilisé dans les notifications (ex. « Moreau ») */
  short?: string;
  role?: string;
  description?: string;
  traits?: string[];
  goals?: string;
  relation?: number;
  relationLabel?: string;
  look: Look;
  voice?: number;
  barks?: { text: string; if?: string }[];
  hidden?: boolean;
}

export interface LocationDef {
  id: string;
  name: string;
  width?: number;
  kind?: 'interieur' | 'exterieur';
  time?: 'aube' | 'jour' | 'soir' | 'nuit';
  wall?: { style: string; color?: string; color2?: string };
  floor?: { style: string; color?: string; color2?: string };
  backdrop?: PropDef[];
  props?: PropDef[];
  exits?: ExitDef[];
  npcs?: NpcPlacement[];
  hotspots?: HotspotDef[];
  when?: string;
  ambient?: string;
  group?: string;
  spawn?: number;
  /** tenue du joueur dans ce lieu (ex. maillot au stade) */
  playerLook?: Look;
}

export interface PropDef {
  type: string;
  x: number;
  y?: number;
  w?: number;
  h?: number;
  when?: string;
  layer?: 'fond' | 'avant';
  [k: string]: unknown;
}

export interface ExitDef {
  to: string;
  x: number;
  label?: string;
  kind?: 'porte' | 'bord';
  when?: string;
  spawn?: number;
}

export interface NpcPlacement {
  id: string;
  x: number;
  when?: string;
  face?: 'gauche' | 'droite';
  anim?: string;
  lane?: number;
  /** tenue du personnage dans ce lieu */
  look?: Look;
}

export interface HotspotDef {
  id: string;
  x: number;
  label: string;
  activities?: string[];
  event?: string;
  endTick?: boolean;
  when?: string;
}

export interface ActivityDef {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  cost?: Record<string, number>;
  when?: string;
  lockedText?: string;
  effects?: string;
  feedback?: string;
  maxPerTick?: number;
}

export interface ChapterDef {
  id: string;
  title: string;
  subtitle?: string;
  weeks: number;
  onStart?: string;
  onEnd?: string;
  location?: string;
  intro?: string;
}

export interface CreationDef {
  nameLabel?: string;
  defaultName?: string;
  look?: boolean;
  baseLook?: Look;
  fields?: CreationField[];
}

export interface CreationField {
  id: string;
  label: string;
  options: { id: string; label: string; description?: string; effects?: string }[];
}

export interface EventDef {
  id: string;
  title?: string;
  trigger: string;
  when?: string;
  chapters?: string[];
  priority?: number;
  once?: boolean;
  cooldown?: number;
  chance?: number | string;
  weight?: number | string;
  tags?: string[];
  script: string;
  notes?: string;
}

export interface EndingDef {
  id: string;
  title: string;
  type?: 'heureuse' | 'tragique' | 'neutre' | 'inattendue' | 'secrete';
  when?: string;
  priority?: number;
  summary?: string;
  location?: string;
  script: string;
}

export interface SheetSection {
  title: string;
  rows: { label: string; value: string; when?: string }[];
}

export interface StagePlacement {
  actor: string;
  x: number;
  team?: string;
  lane?: number;
  face?: 'gauche' | 'droite';
  anim?: string;
  ball?: boolean;
  role?: string;
}

// ─────────────────────────────── ÉTAT DE PARTIE ─────────────────────────────

export interface Memory { text: string; tick: number; ch: number; wk: number }

export interface Decision {
  tick: number;
  ch: number;
  wk: number;
  event: string;
  title: string;
  choice: string;
  tags: string[];
  fx: string[];
  key?: boolean;
}

export type JournalKind = 'actu' | 'journal' | 'souvenir' | 'objectif' | 'echo' | 'fin';

export interface JournalEntry { tick: number; ch: number; wk: number; kind: JournalKind; text: string }

export interface GameState {
  v: 1;
  universe: string;
  universeVersion?: string;
  seed: number;
  rng: number[];
  player: Record<string, Value>;
  look: Look;
  stats: Record<string, number>;
  vars: Record<string, Value>;
  rel: Record<string, number>;
  met: Record<string, boolean>;
  mem: Record<string, Record<string, Memory>>;
  time: { tick: number; chapter: number; week: number };
  actions: number;
  location: string;
  fired: Record<string, { n: number; last: number }>;
  scheduled: { event: string; due: number; from: number }[];
  history: Decision[];
  journal: JournalEntry[];
  objectives: Record<string, { text: string; status: 'actif' | 'reussi' | 'echoue'; tick: number }>;
  tags: Record<string, number>;
  actDone: Record<string, number>;
  ending: string | null;
  pendingEnding: string | null;
  snapshot: { stats: Record<string, number>; rel: Record<string, number>; journal: number; tick: number };
  playtime: number;
  started: number;
}
