/**
 * Wikilink synapses.
 * Simple rule: one cranial hub (hypothalamus). Cord traffic climbs vertebra
 * ring centers, reaches the hub, then fans to brain notes — never multi-stage shoulders.
 */
import {
  nearestSpineParam,
  vertebraAt,
  vertebraCentersBetween,
  type Vec3,
} from "./anatomy";
import type { BrainPoint } from "./types";

/** Single cranial hub — on the stem axis above the docked tip. */
export const BRAIN_HUB: Vec3 = [0, 0.38, 0];
const HUB_SPINE_T = 0.0;

export type Segment = {
  a: [number, number, number];
  b: [number, number, number];
  kind: "hub";
  color: string;
};

/** Short cortex hub whiskers — point sparks only. */
export function buildConnections(points: BrainPoint[]): Segment[] {
  const segs: Segment[] = [];
  const cortexish = points.filter((p) => p.position[1] > 0.05 && p.clusterId !== 99);
  const byRegion = new Map<string, BrainPoint[]>();
  for (const p of cortexish) {
    const list = byRegion.get(p.region) ?? [];
    if (list.length < 18) list.push(p);
    byRegion.set(p.region, list);
  }
  for (const [, list] of byRegion) {
    if (list.length < 6) continue;
    const c: [number, number, number] = [0, 0, 0];
    for (const p of list) {
      c[0] += p.position[0];
      c[1] += p.position[1];
      c[2] += p.position[2];
    }
    c[0] /= list.length;
    c[1] /= list.length;
    c[2] /= list.length;
    for (const p of list.slice(0, 4)) {
      const mx = (c[0] + p.position[0]) * 0.5;
      const my = (c[1] + p.position[1]) * 0.5;
      const mz = (c[2] + p.position[2]) * 0.5;
      segs.push({
        a: [mx, my, mz],
        b: p.position,
        kind: "hub",
        color: p.color,
      });
    }
  }
  return segs;
}

export function hubSparkCloud(points: BrainPoint[], samplesPerSeg = 7): Float32Array {
  const segs = buildConnections(points);
  const n = segs.length * samplesPerSeg;
  const out = new Float32Array(n * 3);
  let i = 0;
  for (const s of segs) {
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = (k + 0.35) / samplesPerSeg;
      const j =
        0.012 *
        (((Math.sin(k * 12.9898 + s.a[0] * 78.23) * 43758.5453) % 1) - 0.5);
      out[i++] = s.a[0] + (s.b[0] - s.a[0]) * t + j;
      out[i++] = s.a[1] + (s.b[1] - s.a[1]) * t + j * 0.6;
      out[i++] = s.a[2] + (s.b[2] - s.a[2]) * t - j;
    }
  }
  return out;
}

export type SynapseSeg = {
  a: [number, number, number];
  b: [number, number, number];
  focused: boolean;
  sameRegion: boolean;
  /** Touches a 00-Index / tag:index hub — keep in ambient draw. */
  structural: boolean;
};

function normKey(s: string): string {
  return s
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

/** Vault MOC / index notes — their wikilinks must stay visible as synapses. */
function isIndexNote(p: BrainPoint): boolean {
  const path = p.relativePath.toLowerCase();
  if (/(^|\/)00-index/.test(path)) return true;
  return p.tags.some((t) => /^index$/i.test(t));
}

export function resolveSynapseSegments(
  points: BrainPoint[],
  selectedId?: string | null,
  maxEdges = 4000
): SynapseSeg[] {
  const byKey = new Map<string, BrainPoint>();
  for (const p of points) {
    byKey.set(normKey(p.id), p);
    byKey.set(normKey(p.relativePath), p);
    byKey.set(normKey(p.title), p);
    const base = p.relativePath.split("/").pop();
    if (base) byKey.set(normKey(base), p);
  }

  const segs: SynapseSeg[] = [];
  const seen = new Set<string>();
  for (const src of points) {
    const links = src.linksOut;
    if (!links?.length) continue;
    for (const raw of links) {
      const target = byKey.get(normKey(raw));
      if (!target || target.id === src.id) continue;
      const a = src.id < target.id ? src.id : target.id;
      const b = src.id < target.id ? target.id : src.id;
      const key = `${a}→${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const focused =
        !!selectedId && (src.id === selectedId || target.id === selectedId);
      segs.push({
        a: src.position,
        b: target.position,
        focused,
        sameRegion: src.region === target.region,
        structural: isIndexNote(src) || isIndexNote(target),
      });
      if (segs.length >= maxEdges) return segs;
    }
  }
  return segs;
}

function dist2(a: Vec3, b: Vec3): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function isBrainNote(p: Vec3): boolean {
  return p[1] > 0.02;
}

/** On-axis ring center — never a lateral chord through the column. */
function axisCenter(t: number): Vec3 {
  const c = vertebraAt(t).center;
  return [c[0], c[1], c[2]];
}

/**
 * Point → BRAIN_HUB.
 * Brain: direct spoke to hub (fan).
 * Cord: radial spoke onto ring middle, then climb ring→ring on the axis, then hub.
 */
function pathToHub(p: Vec3): Vec3[] {
  if (isBrainNote(p)) return [p, BRAIN_HUB];
  const t = nearestSpineParam(p);
  const first = axisCenter(t);
  const rings = vertebraCentersBetween(t, HUB_SPINE_T).map(
    (c): Vec3 => [c[0], c[1], c[2]]
  );
  // p (rim) → first ring middle → each anneau middle → hub
  const path: Vec3[] = [p, first];
  for (const c of rings) {
    const last = path[path.length - 1];
    if (dist2(last, c) > 1e-8) path.push(c);
  }
  const last = path[path.length - 1];
  if (dist2(last, BRAIN_HUB) > 1e-8) path.push(BRAIN_HUB);
  return path;
}

/**
 * A → hub → B (or short cranial arc for nearby same-group brain notes).
 * Rachis traffic always climbs the ring axis into the single hub, then fans out.
 */
export function routeNervousSynapse(
  a: Vec3,
  b: Vec3,
  sameRegion = false
): Vec3[] {
  const d = Math.sqrt(dist2(a, b));
  // Keep only tight local cortex links off-hub; everything else through the hub
  if (isBrainNote(a) && isBrainNote(b) && sameRegion && d < 0.55) {
    const mid = lerp3(a, b, 0.5);
    const inward: Vec3 = [
      mid[0] * 0.85,
      mid[1] * 0.9 + 0.04,
      mid[2] * 0.85,
    ];
    return [a, inward, b];
  }

  const toHubA = pathToHub(a);
  const toHubB = pathToHub(b);
  const out = [...toHubA];
  for (let i = toHubB.length - 2; i >= 0; i--) out.push(toHubB[i]);
  return out;
}

function polylinesToLinePositions(routes: Vec3[][]): Float32Array {
  let segs = 0;
  for (const r of routes) segs += Math.max(0, r.length - 1);
  if (!segs) return new Float32Array(0);
  const out = new Float32Array(segs * 6);
  let i = 0;
  for (const r of routes) {
    for (let k = 0; k < r.length - 1; k++) {
      const p = r[k];
      const q = r[k + 1];
      out[i++] = p[0];
      out[i++] = p[1];
      out[i++] = p[2];
      out[i++] = q[0];
      out[i++] = q[1];
      out[i++] = q[2];
    }
  }
  return out;
}

function sampleRouteGlow(routes: Vec3[][], density = 10): Float32Array {
  const chunks: number[] = [];
  for (const r of routes) {
    for (let k = 0; k < r.length - 1; k++) {
      const p = r[k];
      const q = r[k + 1];
      const len = Math.sqrt(dist2(p, q));
      const n = Math.max(2, Math.ceil(len * density));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        chunks.push(
          p[0] + (q[0] - p[0]) * t,
          p[1] + (q[1] - p[1]) * t,
          p[2] + (q[2] - p[2]) * t
        );
      }
    }
  }
  return new Float32Array(chunks);
}

function buildRouted(points: BrainPoint[], selectedId?: string | null) {
  const segs = resolveSynapseSegments(points, selectedId);
  const routed = segs.map((s) => ({
    path: routeNervousSynapse(s.a, s.b, s.sameRegion),
    focused: s.focused,
    sameRegion: s.sameRegion,
    structural: s.structural,
  }));
  return { segs, routed };
}

export function synapseLines(
  points: BrainPoint[],
  selectedId?: string | null
): {
  ambient: Float32Array;
  focus: Float32Array;
  ambientGlow: Float32Array;
  focusGlow: Float32Array;
  edgeCount: number;
} {
  const empty = {
    ambient: new Float32Array(0),
    focus: new Float32Array(0),
    ambientGlow: new Float32Array(0),
    focusGlow: new Float32Array(0),
    edgeCount: 0,
  };
  const { segs, routed } = buildRouted(points, selectedId);
  if (!segs.length) return empty;

  type R = (typeof routed)[number];
  const isLocal = (r: R) => {
    const a = r.path[0];
    const b = r.path[r.path.length - 1];
    return (
      r.sameRegion &&
      isBrainNote(a) &&
      isBrainNote(b) &&
      dist2(a, b) < 0.55 * 0.55
    );
  };
  const touchesCord = (r: R) => r.path.some((p) => !isBrainNote(p));
  const local = routed.filter(isLocal);
  const cord = routed.filter(touchesCord);
  const viaHub = routed.filter((r) => !isLocal(r) && !touchesCord(r));
  // Index/MOC fan-out always kept; remaining via-hub = longest only
  const structural = viaHub.filter((r) => r.structural);
  const otherVia = viaHub
    .filter((r) => !r.structural)
    .sort((a, b) => {
      const da = dist2(a.path[0], a.path[a.path.length - 1]);
      const db = dist2(b.path[0], b.path[b.path.length - 1]);
      return db - da;
    });
  const draw = selectedId
    ? routed
    : [
        ...cord.slice(0, 280),
        ...local.slice(0, 400),
        ...structural.slice(0, 240),
        ...otherVia.slice(0, 80),
      ];
  const amb = selectedId ? draw.filter((r) => !r.focused) : draw;
  const foc = selectedId ? draw.filter((r) => r.focused) : [];
  const ambPaths = amb.map((r) => r.path);
  const focPaths = foc.map((r) => r.path);

  return {
    ambient: polylinesToLinePositions(ambPaths),
    focus: polylinesToLinePositions(focPaths),
    ambientGlow: sampleRouteGlow(ambPaths, selectedId ? 5 : 8),
    focusGlow: sampleRouteGlow(focPaths, 12),
    edgeCount: segs.length,
  };
}

export function synapseClouds(
  points: BrainPoint[],
  selectedId?: string | null
) {
  return synapseLines(points, selectedId);
}

export function countSynapses(points: BrainPoint[]): number {
  return resolveSynapseSegments(points, null, 50_000).length;
}
