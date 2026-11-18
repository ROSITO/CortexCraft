import { sphereCenter, spherePoint, rng, type Vec3 } from "./anatomy";
import { layoutAtlas, layoutBrain } from "./brainLayout";
import { getDataPalette } from "./themes";
import { functionOf } from "./functions";
import type { SemanticModel } from "./semantic";
import type { BrainPoint, GroupBy, NoteEntry, VizShape } from "./types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorOf(name: string) {
  const pal = getDataPalette();
  return pal[hash(name) % pal.length];
}

function groupKey(
  n: NoteEntry,
  groupBy: GroupBy,
  model: SemanticModel | null | undefined,
  index: number
): string {
  if (groupBy === "function") return functionOf(n).key;
  if (groupBy === "semantic" && model) {
    const label = model.clusterLabels[model.clusterIds[index]];
    if (label) return label;
  }
  const folder = n.folder.split("/")[0];
  return folder ? folder : "root";
}

function unitFrom(note: NoteEntry, model?: SemanticModel | null, index = 0): Vec3 {
  if (model?.coords[index]) {
    const c = model.coords[index];
    return [c[0], c[1], c[2]];
  }
  const h = hash(note.id);
  return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000, ((h >>> 20) % 1000) / 1000];
}

/** One glowing sphere per group (MindCorpus Layout → Spheres). */
export function layoutSpheres(
  notes: NoteEntry[],
  groupBy: GroupBy,
  model?: SemanticModel | null
): BrainPoint[] {
  if (!notes.length) return [];
  const r = rng(19);
  const buckets = new Map<string, NoteEntry[]>();
  notes.forEach((n, i) => {
    const g = groupKey(n, groupBy, model, i);
    const list = buckets.get(g) ?? [];
    list.push(n);
    buckets.set(g, list);
  });
  const names = [...buckets.keys()].sort(
    (a, b) => (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0)
  );
  const out: BrainPoint[] = [];
  names.forEach((name, gi) => {
    const members = buckets.get(name) ?? [];
    const center = sphereCenter(gi, names.length);
    const radius = 0.28 + Math.min(0.55, Math.sqrt(members.length) * 0.045);
    members.forEach((note, mi) => {
      const i = notes.indexOf(note);
      const u = unitFrom(note, model, i);
      out.push({
        ...note,
        position: spherePoint(center, radius, u, r),
        color: colorOf(name),
        region: name,
        clusterId: gi,
      });
      void mi;
    });
  });
  const byId = new Map(out.map((p) => [p.id, p]));
  return notes.map((n) => byId.get(n.id)!).filter(Boolean);
}

/** Semantic / loose cluster cloud (MindCorpus Layout → Clusters). */
export function layoutClusters(
  notes: NoteEntry[],
  groupBy: GroupBy,
  model?: SemanticModel | null
): BrainPoint[] {
  if (!notes.length) return [];
  const buckets = new Map<string, NoteEntry[]>();
  notes.forEach((n, i) => {
    const g = groupKey(n, groupBy, model, i);
    const list = buckets.get(g) ?? [];
    list.push(n);
    buckets.set(g, list);
  });
  const names = [...buckets.keys()].sort(
    (a, b) => (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0)
  );
  const out: BrainPoint[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  names.forEach((name, gi) => {
    const members = buckets.get(name) ?? [];
    const orbit = 0.9 + Math.sqrt(gi) * 0.85;
    const th = golden * gi;
    const cy = Math.sin(th * 0.7) * 0.55;
    const cx = Math.cos(th) * orbit;
    const cz = Math.sin(th) * orbit * 0.7;
    members.forEach((note) => {
      const i = notes.indexOf(note);
      const u = unitFrom(note, model, i);
      const jitter = 0.55 + Math.min(0.9, Math.sqrt(members.length) * 0.04);
      out.push({
        ...note,
        position: [
          cx + (u[0] - 0.5) * jitter,
          cy + (u[1] - 0.5) * jitter * 0.7,
          cz + (u[2] - 0.5) * jitter,
        ],
        color: colorOf(name),
        region: name,
        clusterId: gi,
      });
    });
  });
  const byId = new Map(out.map((p) => [p.id, p]));
  return notes.map((n) => byId.get(n.id)!).filter(Boolean);
}

/** Hierarchical folder tree hanging in space. */
export function layoutTree(
  notes: NoteEntry[],
  groupBy: GroupBy,
  model?: SemanticModel | null
): BrainPoint[] {
  if (!notes.length) return [];
  const r = rng(23);
  // Build folder path nodes
  const byPath = new Map<string, NoteEntry[]>();
  for (const n of notes) {
    const path =
      groupBy === "function"
        ? functionOf(n).key
        : groupBy === "semantic" && model
          ? (model.clusterLabels[model.clusterIds[notes.indexOf(n)]] ?? n.folder)
          : (n.folder || "root");
    const list = byPath.get(path) ?? [];
    list.push(n);
    byPath.set(path, list);
  }
  const paths = [...byPath.keys()].sort();
  const out: BrainPoint[] = [];
  paths.forEach((path, pi) => {
    const parts = path.split("/").filter(Boolean);
    const depth = Math.max(1, parts.length);
    const angle = (pi / Math.max(1, paths.length)) * Math.PI * 2;
    const rad = 0.4 + depth * 0.55;
    const trunk: Vec3 = [
      Math.cos(angle) * rad * 0.35,
      1.1 - depth * 0.55,
      Math.sin(angle) * rad * 0.35,
    ];
    const members = byPath.get(path) ?? [];
    const label = parts[parts.length - 1] || path;
    members.forEach((note, mi) => {
      const spread = 0.35 + Math.min(0.8, members.length * 0.01);
      const a = angle + ((mi / Math.max(1, members.length)) - 0.5) * 0.9;
      const denom = members.length > 1 ? members.length - 1 : 1;
      const u = mi / denom;
      out.push({
        ...note,
        position: [
          trunk[0] + Math.cos(a) * spread * (0.3 + u) + (r() - 0.5) * 0.04,
          trunk[1] - u * 0.45 + (r() - 0.5) * 0.03,
          trunk[2] + Math.sin(a) * spread * (0.3 + u) + (r() - 0.5) * 0.04,
        ],
        color: colorOf(label),
        region: label,
        clusterId: pi,
      });
    });
  });
  const byId = new Map(out.map((p) => [p.id, p]));
  return notes.map((n) => byId.get(n.id)!).filter(Boolean);
}

/**
 * MindCorpus-style viz dispatcher.
 * - atlas: notes → cognitive brain areas (lobes / limbic / cerebellum / spine)
 * - brain: anatomical cortex/spine/nerves (groupBy drives colour patches)
 * - spheres / clusters / tree: alternate layouts
 */
export function layoutNotes(
  notes: NoteEntry[],
  shape: VizShape,
  groupBy: GroupBy,
  model?: SemanticModel | null
): BrainPoint[] {
  if (shape === "atlas") return layoutAtlas(notes, model);
  if (shape === "spheres") return layoutSpheres(notes, groupBy, model);
  if (shape === "clusters") return layoutClusters(notes, groupBy, model);
  if (shape === "tree") return layoutTree(notes, groupBy, model);
  // brain shape: reuse anatomical layout; map mode from groupBy
  const mode = groupBy === "semantic" ? "semantic" : "folder";
  const points = layoutBrain(notes, mode, model);
  if (groupBy !== "function") return points;
  // recolour / relabel by cognitive function while keeping anatomy positions
  return points.map((p) => {
    const f = functionOf(p);
    return { ...p, color: colorOf(f.key), region: f.label };
  });
}
