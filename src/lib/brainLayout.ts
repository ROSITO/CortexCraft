import {
  Snapper,
  indicesForLobe,
  indicesMedial,
  outlinePoints,
  partitionPool,
  regionByName,
  rng,
  type Pool,
  type Vec3,
} from "./anatomy";
import {
  ATLAS_AREAS,
  atlasAreaMeta,
  atlasAreaOf,
  isSpineNote,
  type AtlasAreaId,
} from "./atlas";
import { getMeshCortexPool } from "./brainMesh";
import type { SemanticModel } from "./semantic";
import type { BrainPoint, LayoutMode, NoteEntry } from "./types";
import { getDataPalette } from "./themes";

function cortexSource(_seed: number, _noteCount: number): Pool {
  // Snap onto real-brain surface samples (dot silhouette, no GLB shell)
  return getMeshCortexPool();
}

export function PALETTE(): string[] {
  return getDataPalette();
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unitFrom(note: NoteEntry, model?: SemanticModel | null, index = 0): Vec3 {
  if (model?.coords[index]) {
    const c = model.coords[index];
    return [c[0], c[1], c[2]];
  }
  const h = hash(note.id);
  return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000, ((h >>> 20) % 1000) / 1000];
}

/**
 * Anatomy-first layout (mindcorpus / Brainiac):
 * - big spaces → cortical patches
 * - remaining spaces → nerve tree (torso)
 * - chats + oldest slice → dense spine column
 */
export function layoutBrain(
  notes: NoteEntry[],
  mode: LayoutMode = "semantic",
  model?: SemanticModel | null
): BrainPoint[] {
  if (notes.length === 0) return [];

  const r = rng(7);
  const indexOf = new Map(notes.map((n, i) => [n.id, i]));

  const groupOf = (n: NoteEntry) => {
    if (mode === "semantic" && model) {
      const i = indexOf.get(n.id) ?? 0;
      return model.clusterLabels[model.clusterIds[i]] ?? n.folder;
    }
    return n.folder.split("/")[0] || "root";
  };

  // Spine = record axis only: chats + Journal/Record + CORTEX/daily.
  // CORTEX/CURSOR and bring-in roots (Apple Notes, Health, …) stay as cortex spaces.
  const byTime = [...notes].sort((a, b) => a.modifiedMs - b.modifiedMs);
  const spineSet = new Set<string>();
  for (const n of notes) {
    const folder = n.folder.toLowerCase().replace(/\\/g, "/");
    const root = folder.split("/")[0] || "";
    const isSpineFolder =
      root === "record" ||
      root === "journal" ||
      folder === "cortex/daily" ||
      folder.startsWith("cortex/daily/");
    if (n.kind === "chat" || isSpineFolder) spineSet.add(n.id);
  }
  const bodyNotes = notes.filter((n) => !spineSet.has(n.id));
  const groups = new Map<string, NoteEntry[]>();
  for (const n of bodyNotes) {
    const g = groupOf(n);
    const list = groups.get(g) ?? [];
    list.push(n);
    groups.set(g, list);
  }

  const groupNames = [...groups.keys()].sort(
    (a, b) => (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0)
  );

  // ALL body notes stay inside the cranial cortex pool — no orphan fiches under the skull.
  const cortexGroups = groupNames.length ? groupNames : ["root"];

  // Prefer Grab3D mesh surface samples; fall back to procedural pool
  const pool = cortexSource(3, bodyNotes.length);
  const weights = cortexGroups.map((g) => groups.get(g)?.length ?? 1);
  const parts = partitionPool(pool.pts, weights.length ? weights : [1]);
  const snappers = parts.map((idx) => new Snapper(pool.pts, idx));
  const colorOf = (name: string) => {
    const pal = getDataPalette();
    return pal[hash(name) % pal.length];
  };

  const out: BrainPoint[] = [];

  cortexGroups.forEach((name, gi) => {
    const snap = snappers[gi] ?? snappers[0];
    for (const note of groups.get(name) ?? []) {
      const i = indexOf.get(note.id) ?? 0;
      const u = unitFrom(note, model, i);
      const target = snap.at(u);
      const pos = snap.take(target[0], target[1], target[2]);
      out.push({ ...note, position: pos, color: colorOf(name), region: name, clusterId: gi });
    }
  });

  // Dense spine column (record)
  const spine = regionByName("spine");
  const brainstem = regionByName("brainstem");
  const spineNotes = byTime.filter((n) => spineSet.has(n.id));
  spineNotes.forEach((note, i) => {
    const t =
      spineNotes.length <= 1
        ? 0.5
        : (Math.floor((i / spineNotes.length) * 18) + 0.45) / 18;
    const u: Vec3 = [(hash(note.id) % 1000) / 1000, (hash(note.id + "y") % 1000) / 1000, 0.5];
    const pos = (t < 0.1 ? brainstem : spine).sample(
      [u[0], t, u[2]],
      r
    );
    const space = groupOf(note);
    out.push({
      ...note,
      position: pos,
      color: note.kind === "chat" ? "#ff9a4a" : colorOf(space),
      // Keep space identity (Veille stays Veille) — spine is placement, not a fake space
      region: space,
      clusterId: 99,
    });
  });

  const byId = new Map(out.map((p) => [p.id, p]));
  return notes.map((n) => byId.get(n.id)!).filter(Boolean);
}

const ATLAS_CLUSTER: Record<AtlasAreaId, number> = {
  prefrontal: 0,
  frontal: 1,
  temporal: 2,
  parietal: 3,
  occipital: 4,
  limbic: 5,
  cerebellum: 6,
  spine: 99,
};

/**
 * Cognitive atlas layout: notes snap into anatomical areas (lobes / limbic /
 * cerebellum / spine) instead of Morton patches by folder size.
 */
export function layoutAtlas(
  notes: NoteEntry[],
  model?: SemanticModel | null
): BrainPoint[] {
  if (notes.length === 0) return [];

  const r = rng(11);
  const indexOf = new Map(notes.map((n, i) => [n.id, i]));
  const byTime = [...notes].sort((a, b) => a.modifiedMs - b.modifiedMs);

  // Structural spine + explicit atlas:spine overrides (must not vanish).
  const spineIds = new Set<string>();
  for (const n of notes) {
    if (isSpineNote(n) || atlasAreaOf(n) === "spine") spineIds.add(n.id);
  }
  const spineNotes = byTime.filter((n) => spineIds.has(n.id));
  const bodyNotes = notes.filter((n) => !spineIds.has(n.id));

  const buckets = new Map<AtlasAreaId, NoteEntry[]>();
  for (const n of bodyNotes) {
    const area = atlasAreaOf(n);
    const list = buckets.get(area) ?? [];
    list.push(n);
    buckets.set(area, list);
  }

  const pool = cortexSource(5, bodyNotes.length);
  const snapFor = (idx: number[]) =>
    idx.length ? new Snapper(pool.pts, idx) : null;

  const medial = new Set(indicesMedial(pool));
  const lobeIdx = (lobe: string) =>
    indicesForLobe(pool, lobe).filter((i) => !medial.has(i));

  const snappers: Partial<Record<AtlasAreaId, Snapper | null>> = {
    prefrontal: snapFor(lobeIdx("prefrontal")),
    frontal: snapFor(lobeIdx("frontal")),
    temporal: snapFor(lobeIdx("temporal")),
    parietal: snapFor(lobeIdx("parietal")),
    occipital: snapFor(lobeIdx("occipital")),
    limbic: snapFor([...medial]),
  };
  // Fallback if a lobe pool is empty
  const allCranial = [...Array(pool.lobe.length).keys()];
  const anyCortex =
    snappers.frontal ??
    snappers.prefrontal ??
    snappers.parietal ??
    snappers.temporal ??
    snappers.occipital ??
    snapFor(allCranial);

  const spine = regionByName("spine");
  const brainstem = regionByName("brainstem");
  const out: BrainPoint[] = [];

  const placeCortical = (area: AtlasAreaId, list: NoteEntry[]) => {
    const meta = atlasAreaMeta(area);
    const snap = snappers[area] ?? anyCortex;
    if (!snap) return;
    for (const note of list) {
      const i = indexOf.get(note.id) ?? 0;
      const u = unitFrom(note, model, i);
      const target = snap.at(u);
      const pos = snap.take(target[0], target[1], target[2]);
      out.push({
        ...note,
        position: pos,
        color: meta.color,
        region: meta.label,
        clusterId: ATLAS_CLUSTER[area],
      });
    }
  };

  for (const area of ATLAS_AREAS) {
    if (area.id === "spine") continue;
    const list = buckets.get(area.id) ?? [];
    if (!list.length) continue;
    // How-to / cerebellum domain: keep label, snap into occipital cranial pool
    if (area.id === "cerebellum") {
      const meta = atlasAreaMeta("cerebellum");
      const snap = snappers.occipital ?? anyCortex;
      if (!snap) continue;
      for (const note of list) {
        const i = indexOf.get(note.id) ?? 0;
        const u = unitFrom(note, model, i);
        const target = snap.at(u);
        const pos = snap.take(target[0], target[1], target[2]);
        out.push({
          ...note,
          position: pos,
          color: meta.color,
          region: meta.label,
          clusterId: ATLAS_CLUSTER.cerebellum,
        });
      }
      continue;
    }
    placeCortical(area.id, list);
  }

  const spineMeta = atlasAreaMeta("spine");
  spineNotes.forEach((note, i) => {
    const t =
      spineNotes.length <= 1
        ? 0.5
        : (Math.floor((i / spineNotes.length) * 18) + 0.45) / 18;
    const u: Vec3 = [
      (hash(note.id) % 1000) / 1000,
      (hash(note.id + "y") % 1000) / 1000,
      0.5,
    ];
    const pos = (t < 0.1 ? brainstem : spine).sample([u[0], t, u[2]], r);
    out.push({
      ...note,
      position: pos,
      color: note.kind === "chat" ? "#ff9a4a" : spineMeta.color,
      region: spineMeta.label,
      clusterId: ATLAS_CLUSTER.spine,
    });
  });

  const byId = new Map(out.map((p) => [p.id, p]));
  return notes.map((n) => byId.get(n.id)!).filter(Boolean);
}

export { outlinePoints };
