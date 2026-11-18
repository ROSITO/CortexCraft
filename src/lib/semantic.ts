import type { NoteEntry } from "./types";

const STOP = new Set(
  `a an the and or but if in on at to for of as is was are were be been being this that these those it its with from by into about over after before between under again further then once here there when where why how all any both each few more most other some such no nor not only own same so than too very can will just should now
   le la les un une des de du et ou mais si dans sur pour au aux en ce cette ces il elle ils elles son sa ses avec par sur sous entre apres avant plus moins tres aussi comme dont qui que quoi dont
   i you he she we they my your their me him her us them not no yes do does did done have has had`.split(
    /\s+/
  )
);

export type SemanticModel = {
  vectors: number[][];
  coords: [number, number, number][];
  clusterIds: number[];
  clusterLabels: string[];
  topTerms: string[][];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\-_\s]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

function buildTfidf(docs: string[][]): { vocab: string[]; matrix: number[][] } {
  const df = new Map<string, number>();
  const tfs: Map<string, number>[] = docs.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });

  const vocab = [...df.entries()]
    .filter(([, c]) => c >= 2 || docs.length < 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 600)
    .map(([t]) => t);

  const n = docs.length;
  const matrix = tfs.map((tf) => {
    const row = new Array(vocab.length).fill(0);
    const len = Math.max(1, [...tf.values()].reduce((a, b) => a + b, 0));
    vocab.forEach((term, j) => {
      const f = tf.get(term) ?? 0;
      if (!f) return;
      const idf = Math.log((n + 1) / ((df.get(term) ?? 1) + 1)) + 1;
      row[j] = (f / len) * idf;
    });
    return l2normalize(row);
  });

  return { vocab, matrix };
}

function l2normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function mul(mat: number[][], vec: number[]): number[] {
  return mat.map((row) => row.reduce((s, x, i) => s + x * vec[i], 0));
}

function powerIteration(mat: number[][], iters = 24): number[] {
  const dim = mat[0]?.length ?? 0;
  let v = Array.from({ length: dim }, (_, i) => ((i * 17) % 97) / 97);
  v = l2normalize(v);
  for (let k = 0; k < iters; k++) {
    // A^T A v via mat rows
    const Av = mul(mat, v);
    const AtAv = new Array(dim).fill(0);
    for (let i = 0; i < mat.length; i++) {
      for (let j = 0; j < dim; j++) AtAv[j] += mat[i][j] * Av[i];
    }
    v = l2normalize(AtAv);
  }
  return v;
}

function deflate(mat: number[][], component: number[], scores: number[]) {
  // mat_ij -= scores_i * component_j
  for (let i = 0; i < mat.length; i++) {
    for (let j = 0; j < component.length; j++) {
      mat[i][j] -= scores[i] * component[j];
    }
  }
}

function pca3(matrix: number[][]): [number, number, number][] {
  if (matrix.length === 0) return [];
  const work = matrix.map((r) => r.slice());
  const comps: number[][] = [];
  const scoreCols: number[][] = [];

  for (let c = 0; c < 3; c++) {
    const comp = powerIteration(work);
    const scores = mul(work, comp);
    comps.push(comp);
    scoreCols.push(scores);
    deflate(work, comp, scores);
  }

  const coords = matrix.map((_, i) => {
    const x = scoreCols[0][i];
    const y = scoreCols[1][i];
    const z = scoreCols[2][i];
    return [x, y, z] as [number, number, number];
  });

  // normalize each axis to [0,1]
  for (let axis = 0; axis < 3; axis++) {
    let min = Infinity;
    let max = -Infinity;
    for (const c of coords) {
      min = Math.min(min, c[axis]);
      max = Math.max(max, c[axis]);
    }
    const span = Math.max(1e-6, max - min);
    for (const c of coords) c[axis] = (c[axis] - min) / span;
  }
  return coords;
}

function kmeans(points: number[][], k: number, iters = 18): number[] {
  const n = points.length;
  if (n === 0) return [];
  const dim = points[0].length;
  const kk = Math.max(1, Math.min(k, n));
  const centroids: number[][] = [];
  for (let i = 0; i < kk; i++) {
    centroids.push(points[Math.floor((i * n) / kk)].slice());
  }
  let assign = new Array(n).fill(0);

  for (let iter = 0; iter < iters; iter++) {
    // assign
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) {
          const diff = points[i][j] - centroids[c][j];
          d += diff * diff;
        }
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    // update
    const sums = Array.from({ length: kk }, () => new Array(dim).fill(0));
    const counts = new Array(kk).fill(0);
    for (let i = 0; i < n; i++) {
      const a = assign[i];
      counts[a]++;
      for (let j = 0; j < dim; j++) sums[a][j] += points[i][j];
    }
    for (let c = 0; c < kk; c++) {
      if (!counts[c]) continue;
      for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
  }
  return assign;
}

function topTermsForDoc(vec: number[], vocab: string[], n = 5): string[] {
  return vec
    .map((w, i) => [w, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, n)
    .filter(([w]) => w > 0)
    .map(([, i]) => vocab[i]);
}

export function buildSemanticModel(notes: NoteEntry[]): SemanticModel {
  const docs = notes.map((n) =>
    tokenize(`${n.title}\n${n.folder}\n${n.tags.join(" ")}\n${n.corpus || n.preview}`)
  );
  const { vocab, matrix } = buildTfidf(docs);
  const coords = pca3(matrix);
  const k = Math.max(2, Math.min(8, Math.round(Math.sqrt(Math.max(notes.length, 1) / 2))));
  const clusterIds = kmeans(matrix, k);
  const clusterLabels = Array.from({ length: k }, (_, c) => {
    const memberIdx = clusterIds
      .map((id, i) => (id === c ? i : -1))
      .filter((i) => i >= 0);
    const centroid = new Array(vocab.length).fill(0);
    for (const i of memberIdx) {
      for (let j = 0; j < vocab.length; j++) centroid[j] += matrix[i][j];
    }
    const terms = topTermsForDoc(centroid, vocab, 2);
    return terms.length ? terms.join("-") : `topic-${c + 1}`;
  });

  const topTerms = matrix.map((vec) => topTermsForDoc(vec, vocab, 5));

  return { vectors: matrix, coords, clusterIds, clusterLabels, topTerms };
}

export function proposeAgentTags(
  notes: NoteEntry[],
  model: SemanticModel
): { path: string; agentTags: string[] }[] {
  return notes.map((note, i) => {
    const cluster = model.clusterLabels[model.clusterIds[i]] ?? "topic";
    const terms = model.topTerms[i] ?? [];
    const tags = Array.from(
      new Set(
        [cluster, ...terms, note.kind === "chat" ? "chat" : "", note.source]
          .map((t) => t.toLowerCase().replace(/\s+/g, "-"))
          .filter((t) => t && t.length > 1)
      )
    ).slice(0, 8);
    return { path: note.path, agentTags: tags };
  });
}


/** No-AI tagging from folder / kind rules. */
export function proposeRulesTags(notes: NoteEntry[]): { path: string; agentTags: string[] }[] {
  return notes.map((note) => {
    const root = (note.folder.split("/")[0] || "inbox").toLowerCase();
    const sub = note.folder.includes("/") ? (note.folder.split("/")[1] || "").toLowerCase() : "";
    const tags = Array.from(
      new Set(
        [root, note.kind === "chat" ? "chat" : "note", note.source || "", sub]
          .map((x) => x.replace(/\s+/g, "-"))
          .filter((x) => x && x.length > 1)
      )
    ).slice(0, 6);
    return { path: note.path, agentTags: tags };
  });
}
