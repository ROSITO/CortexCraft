/**
 * Quasi-realistic cognitive atlas: map vault notes → anatomical areas.
 * Placement uses cortex lobe pools (or cerebellum / spine samplers).
 * Override: tag `atlas:<id>` or `atlas/<id>` (e.g. atlas:temporal).
 *
 * Callers: layoutAtlas in brainLayout.ts; layoutNotes in layouts.ts;
 * HUD counts in App.tsx. No existing module maps folders→lobes for placement
 * (functions.ts only recolors). Reads NoteEntry; writes no files.
 * User: "ok! tu implémente! j'adore! et je veux une fiche d'atlas"
 */
import { functionOf } from "./functions";
import type { NoteEntry } from "./types";

export type AtlasAreaId =
  | "prefrontal"
  | "frontal"
  | "temporal"
  | "parietal"
  | "occipital"
  | "limbic"
  | "cerebellum"
  | "spine";

export type AtlasArea = {
  id: AtlasAreaId;
  label: string;
  short: string;
  color: string;
  role: string;
  /** Matching key in cortexPool.lobe, if cortical. */
  cortexLobe?: "prefrontal" | "frontal" | "temporal" | "parietal" | "occipital";
};

export const ATLAS_AREAS: AtlasArea[] = [
  {
    id: "prefrontal",
    label: "Préfrontal",
    short: "PF",
    color: "#5ec8ff",
    role: "Projets, décisions, Travaux, CerCo",
    cortexLobe: "prefrontal",
  },
  {
    id: "frontal",
    label: "Frontal",
    short: "F",
    color: "#7aa2ff",
    role: "Brouillons, systèmes, outils, Pipeline",
    cortexLobe: "frontal",
  },
  {
    id: "temporal",
    label: "Temporal",
    short: "T",
    color: "#c084fc",
    role: "Personnes, mails, captures, mémoire épisodique",
    cortexLobe: "temporal",
  },
  {
    id: "parietal",
    label: "Pariétal",
    short: "P",
    color: "#34d399",
    role: "Agenda, lieux, cartes, organisation",
    cortexLobe: "parietal",
  },
  {
    id: "occipital",
    label: "Occipital",
    short: "O",
    color: "#fbbf24",
    role: "Veille, médias, Readwise, imports visuels",
    cortexLobe: "occipital",
  },
  {
    id: "limbic",
    label: "Limbique",
    short: "L",
    color: "#fb7185",
    role: "Santé, introspection, corporel",
  },
  {
    id: "cerebellum",
    label: "Cervelet",
    short: "Cbl",
    color: "#94a3b8",
    role: "How-to, runbooks, correctifs, automatismes",
  },
  {
    id: "spine",
    label: "Moelle",
    short: "M",
    color: "#ff9a4a",
    role: "Chats, Journal/Record, CORTEX/daily — axe temps",
  },
];

const BY_ID = new Map(ATLAS_AREAS.map((a) => [a.id, a]));

export function atlasAreaMeta(id: AtlasAreaId): AtlasArea {
  return BY_ID.get(id) ?? ATLAS_AREAS[2];
}

/** Top-level vault folder → atlas area (Bring-in + domaines). */
const ROOT_TO_AREA: Record<string, AtlasAreaId> = {
  travaux: "prefrontal",
  cerco: "prefrontal",
  clients: "prefrontal",
  projets: "prefrontal",
  projects: "prefrontal",
  pipeline: "frontal",
  cortex: "frontal",
  systems: "frontal",
  tools: "frontal",
  outils: "frontal",
  cercle: "temporal",
  personnes: "temporal",
  mails: "temporal",
  mail: "temporal",
  youtube: "temporal",
  notes: "temporal",
  "apple notes": "temporal",
  notion: "temporal",
  markdown: "temporal",
  day: "temporal",
  "day one": "temporal",
  chats: "spine",
  agenda: "parietal",
  lieux: "parietal",
  maps: "parietal",
  moc: "parietal",
  veille: "occipital",
  readwise: "occipital",
  media: "occipital",
  images: "occipital",
  sante: "limbic",
  santé: "limbic",
  health: "limbic",
  record: "spine",
  journal: "spine",
  howto: "cerebellum",
  guides: "cerebellum",
  runbooks: "cerebellum",
};

const FUNCTION_LOBE_TO_AREA: Record<string, AtlasAreaId> = {
  Prefrontal: "prefrontal",
  Frontal: "frontal",
  Parietal: "parietal",
  Temporal: "temporal",
  Limbic: "limbic",
  Brainstem: "frontal",
  Cerebellum: "cerebellum",
};

const AREA_IDS = new Set(ATLAS_AREAS.map((a) => a.id));

function normalizeRoot(folder: string): string {
  const norm = folder.toLowerCase().replace(/\\/g, "/").trim();
  return (norm.split("/")[0] || "").trim();
}

function tagAtlasOverride(n: NoteEntry): AtlasAreaId | null {
  for (const raw of [...n.tags, ...n.agentTags]) {
    const t = raw.toLowerCase().trim();
    const m = t.match(/^atlas[:/-]([a-z]+)$/);
    if (m && AREA_IDS.has(m[1] as AtlasAreaId)) return m[1] as AtlasAreaId;
  }
  return null;
}

export function isSpineNote(n: NoteEntry): boolean {
  const folder = n.folder.toLowerCase().replace(/\\/g, "/");
  const root = folder.split("/")[0] || "";
  if (n.kind === "chat") return true;
  if (root === "record" || root === "journal") return true;
  if (folder === "cortex/daily" || folder.startsWith("cortex/daily/")) return true;
  return false;
}

/** Resolve atlas area for a note (spine wins, then tag, root, function). */
export function atlasAreaOf(n: NoteEntry): AtlasAreaId {
  if (isSpineNote(n)) return "spine";
  const tagged = tagAtlasOverride(n);
  if (tagged) return tagged;
  const root = normalizeRoot(n.folder);
  if (root && ROOT_TO_AREA[root]) return ROOT_TO_AREA[root];
  const f = functionOf(n);
  return FUNCTION_LOBE_TO_AREA[f.lobe] ?? "temporal";
}

export function atlasCounts(ids: AtlasAreaId[]): Record<AtlasAreaId, number> {
  const counts = Object.fromEntries(ATLAS_AREAS.map((a) => [a.id, 0])) as Record<
    AtlasAreaId,
    number
  >;
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
