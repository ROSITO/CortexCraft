
export function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function b64bytes(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", T = {};
  const out = new Uint8Array(Math.floor(s.replace(/=+$/, "").length * 3 / 4));
  let acc = 0, bits = 0, o = 0;
  for (let i = 0; i < 64; i++) T[A.charAt(i)] = i;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === "=") break;
    acc = (acc << 6 | T[c]) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = acc >> bits & 255; }
  }
  return out;
}

export function decodeBrain(b64) {
  const u = b64bytes(b64), n = u.length / 8 | 0, v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const pos = new Float32Array(n * 3), reg = new Uint8Array(n), sid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    pos[i * 3] = v.getInt16(o, true) / 32767;
    pos[i * 3 + 1] = v.getInt16(o + 2, true) / 32767;
    pos[i * 3 + 2] = v.getInt16(o + 4, true) / 32767;
    reg[i] = v.getUint8(o + 6); sid[i] = v.getUint8(o + 7);
  }
  return { n, pos, reg, sid };
}

export function decodeBody(b64) {
  const u = b64bytes(b64), n = u.length / 14 | 0, v = new DataView(u.buffer, u.byteOffset, u.byteLength), U = 1024;
  const pos = new Float32Array(n * 3), part = new Uint8Array(n), sid = new Uint8Array(n), prev = new Int32Array(n), out = new Float32Array(n), from = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 14, p = v.getUint16(o + 8, true);
    pos[i * 3] = v.getInt16(o, true) / U;
    pos[i * 3 + 1] = v.getInt16(o + 2, true) / U;
    pos[i * 3 + 2] = v.getInt16(o + 4, true) / U;
    part[i] = v.getUint8(o + 6); sid[i] = v.getUint8(o + 7); prev[i] = p === 65535 ? -1 : p;
    out[i] = v.getUint16(o + 10, true) / U; from[i] = v.getInt16(o + 12, true) / U;
  }
  return { n, pos, part, sid, prev, out, from };
}

export const BODY_REGION = 8;
export function joinAtlas(brain, body) {
  const n = brain.n + body.n, pos = new Float32Array(n * 3), reg = new Uint8Array(n);
  pos.set(brain.pos); pos.set(body.pos, brain.n * 3); reg.set(brain.reg);
  for (let i = 0; i < body.n; i++) reg[brain.n + i] = BODY_REGION + body.part[i];
  return { n, pos, reg, base: brain.n, body };
}

export const VISUAL_PARTS = [6, 7];
export const isVisualPart = (part) => part >= 6;
export const isSpinePart = (part) => part <= 1;
export const STEM = .15, GATE = .15, SPEED = 5, CORD_WEIGHT = .25, ROOT_WEIGHT = .5;
export function bodyGrowth(body, structs = body.structs, edges = null) {
  const B = body.n, grow = new Float32Array(B), ear = hearingRank(body, structs), apart = (i) => isVisualPart(body.part[i]) || ear(i) !== undefined;
  let stemTop = -Infinity, stemLow = Infinity, cordTop = -Infinity, cordLow = Infinity;
  for (let i = 0; i < B; i++) {
    const y = body.pos[i * 3 + 1];
    if (body.part[i] === 0) { stemTop = Math.max(stemTop, y); stemLow = Math.min(stemLow, y); }
    if (body.part[i] === 1) { cordTop = Math.max(cordTop, y); cordLow = Math.min(cordLow, y); }
  }
  const unit = (v, a, b) => Math.max(0, Math.min(1, (a - v) / ((a - b) || 1)));
  const cordAt = (y) => STEM + unit(y, cordTop, cordLow);
  const time = new Float32Array(B), list = [];
  for (let i = 0; i < B; i++) {
    if (apart(i)) { grow[i] = 2; continue; }
    const y = body.pos[i * 3 + 1], part = body.part[i];
    if (part === 0) time[i] = STEM * unit(y, stemTop, stemLow);
    else if (part === 1) time[i] = cordAt(y);
    else {
      const out = body.out ? body.out[i] : 0, from = body.from ? body.from[i] : y;
      time[i] = Math.max(cordAt(from), STEM + GATE) + out / SPEED;
    }
    list.push(i);
  }
  list.sort((a, b) => time[a] - time[b] || a - b);
  const order = Int32Array.from(list), N = order.length, last = N ? time[order[N - 1]] || 1 : 1;
  for (let k = 0; k < N; k++) grow[order[k]] = Math.min(1, time[order[k]] / last);
  if (!edges) edges = bodyEdges(body);
  const weight = new Float32Array(B);
  for (let i = 0; i < B; i++) weight[i] = edgeWeight(edges, i) * (isSpinePart(body.part[i]) ? CORD_WEIGHT : body.part[i] === 3 ? ROOT_WEIGHT : 1);
  const start = new Float32Array(B).fill(-1), end = new Float32Array(B).fill(2);
  let spineEnd = 0;
  for (let i = 0; i < B; i++) if (grow[i] <= 1 && isSpinePart(body.part[i])) spineEnd = Math.max(spineEnd, grow[i]);
  for (let i = 0; i < B; i++) {
    if (grow[i] > 1) continue;
    if (isSpinePart(body.part[i])) { start[i] = 0; end[i] = spineEnd; }
    else { const from = body.from ? body.from[i] : body.pos[i * 3 + 1]; start[i] = Math.min(grow[i], Math.max(cordAt(from), STEM + GATE) / last); }
  }
  return { grow, order, time, edges, weight, start, end };
}
export const HEARING = ["Vestibulocochlear nerve (VIII)", "Cochlear nerve", "Vestibular nerve"];
function hearingRank(body, structs) {
  const rank = new Map();
  if (Array.isArray(structs)) HEARING.forEach((name, k) => { const s = structs.indexOf(name); if (s >= 0) rank.set(s, k); });
  return (i) => rank.get(body.sid[i]);
}
export function visualOrder(body, structs) {
  const optic = Array.isArray(structs) ? structs.indexOf("Optic nerve (II)") : -1, ear = hearingRank(body, structs), out = [];
  for (let i = 0; i < body.n; i++) if (isVisualPart(body.part[i]) && ear(i) === undefined) out.push(i);
  const rank = (i) => (body.sid[i] === optic ? 0 : body.part[i] === 6 ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || a - b);
  return Int32Array.from(out);
}
export function hearingOrder(body, structs) {
  const ear = hearingRank(body, structs), out = [];
  for (let i = 0; i < body.n; i++) if (ear(i) !== undefined) out.push(i);
  out.sort((a, b) => ear(a) - ear(b) || a - b);
  return Int32Array.from(out);
}
export function regionFor(node) {
  if (!node) return null;
  const medium = String(node.medium || ""), kind = node.kind, source = String(node.source || "");
  if (medium === "image" || medium === "video" || medium === "visual") return "visual";
  if (kind === "image" || kind === "video" || kind === "screenshot" || kind === "drawing" || kind === "photo") return "visual";
  if (/^(camera|glasses|screen-?capture)/.test(source)) return "visual";
  if (/^audio(\/|$)/.test(medium) || medium === "voice" || kind === "audio" || kind === "voice_memo") return "audio";
  if (/^(voice-?memos?|enhance|microphone)/.test(source)) return "audio";
  return null;
}
export const WHOLE = 300000, PACE = .75;
export function reachedCount(growth, reach) {
  const order = growth.order, N = order.length;
  if (!growth.grow) return Math.min(N, Math.max(1, Math.ceil(reach * N)));
  let lo = 0, hi = N;
  while (lo < hi) { const m = (lo + hi) >> 1; if (growth.grow[order[m]] < reach) lo = m + 1; else hi = m; }
  return Math.max(1, lo);
}
export function reachOf(count, growth) { const c = Math.max(0, Number(count) || 0); return Math.min(1, Math.max(.002, Math.pow(c / WHOLE, PACE))); }

export const TAPER = .25, TAPER_AHEAD = .06, TAPER_SCATTER = .3;
export function taperOf(grow, start, end, reach, seed = -1) {
  if (start < 0) return grow < reach ? 1 : 0;
  const e = Math.min(reach, end), L = Math.max(e - start, 1e-4);
  if (grow <= e) { const u = Math.min(1, (e - grow) / (TAPER * L)); return u * u * (3 - 2 * u); }
  if (seed < 0 || end <= reach) return 0;
  const a = (grow - e) / (TAPER_AHEAD * L);
  return a < 1 && seed < TAPER_SCATTER * (1 - a) * (1 - a) ? .5 * (1 - a) : 0;
}


export const EDGE_K = 12, EDGE_LO = .5, EDGE_HI = .97;
const runSteps = (steps) => { for (;;) { const r = steps.next(); if (r.done) return r.value; } };
export function edgeField(pos, n, grp, cell = .08) { return runSteps(edgeFieldSteps(pos, n, grp, cell)); }
export function* edgeFieldSteps(pos, n, grp, cell = .08) {
  const dir = new Float32Array(n * 3), feather = new Float32Array(n), side = new Float32Array(n);
  const H = 1 << 16, mask = H - 1, cellOf = new Int32Array(n * 3), head = new Int32Array(H + 1), byCell = new Int32Array(n);
  const hash = (x, y, z) => ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & mask;
  for (let i = 0; i < n; i++) {
    const X = Math.floor(pos[i * 3] / cell), Y = Math.floor(pos[i * 3 + 1] / cell), Z = Math.floor(pos[i * 3 + 2] / cell);
    cellOf[i * 3] = X; cellOf[i * 3 + 1] = Y; cellOf[i * 3 + 2] = Z; head[hash(X, Y, Z) + 1]++;
  }
  for (let h = 0; h < H; h++) head[h + 1] += head[h];
  const fill = head.slice(0, H);
  for (let i = 0; i < n; i++) byCell[fill[hash(cellOf[i * 3], cellOf[i * 3 + 1], cellOf[i * 3 + 2])]++] = i;
  yield;
  const near = new Float32Array(EDGE_K), who = new Int32Array(EDGE_K);
  for (let i = 0; i < n; i++) {
    if ((i & 511) === 511) yield;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], g = grp[i], X = cellOf[i * 3], Y = cellOf[i * 3 + 1], Z = cellOf[i * 3 + 2];
    let have = 0, worst = 0;
    for (let ring = 1; ring <= 3 && have < EDGE_K; ring++) {
      have = 0; worst = 0;
      for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) for (let c = -ring; c <= ring; c++) {
        const h = hash(X + a, Y + b, Z + c);
        for (let q = head[h], e = head[h + 1]; q < e; q++) {
          const j = byCell[q];
          if (j === i || grp[j] !== g) continue;
          const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
          if (d > 9 * cell * cell * ring * ring) continue;   
          if (have < EDGE_K) { near[have] = d; who[have] = j; if (d > near[worst]) worst = have; have++; continue; }
          if (d < near[worst]) { near[worst] = d; who[worst] = j; worst = 0; for (let m = 1; m < EDGE_K; m++) if (near[m] > near[worst]) worst = m; }
        }
      }
    }
    if (have < 3) { side[i] = 1; continue; }   
    let mx = 0, my = 0, mz = 0, md = 0;
    for (let m = 0; m < have; m++) { const j = who[m]; mx += pos[j * 3]; my += pos[j * 3 + 1]; mz += pos[j * 3 + 2]; md += Math.sqrt(near[m]); }
    mx = x - mx / have; my = y - my / have; mz = z - mz / have; md /= have;
    const L = Math.hypot(mx, my, mz);
    side[i] = md > 0 ? L / md : 0;
    if (L > 0) { dir[i * 3] = mx / L; dir[i * 3 + 1] = my / L; dir[i * 3 + 2] = mz / L; }
  }
  yield;
  const groups = new Map();
  for (let i = 0; i < n; i++) { let l = groups.get(grp[i]); if (!l) groups.set(grp[i], (l = [])); l.push(i); }
  for (const l of groups.values()) {
    const v = Float32Array.from(l, (i) => side[i]).sort(), q = (t) => v[Math.min(v.length - 1, Math.floor(t * v.length))];
    const lo = q(EDGE_LO), hi = Math.max(q(EDGE_HI), lo + 1e-6);
    for (const i of l) { const f = smooth(lo, hi, side[i]); feather[i] = f; dir[i * 3] *= f; dir[i * 3 + 1] *= f; dir[i * 3 + 2] *= f; }
    yield;
  }
  return { dir, feather };
}
export function brainEdges(brain) { return runSteps(brainEdgesSteps(brain)); }
export function* brainEdgesSteps(brain) { return yield* edgeFieldSteps(brain.pos, brain.n, Int32Array.from(brain.reg)); }
export const JUNCTION_BAND = .45, JUNCTION_MOST = .85;
export function bodyEdges(body) { return runSteps(bodyEdgesSteps(body)); }
export function* bodyEdgesSteps(body) {
  const grp = new Int32Array(body.n);
  for (let i = 0; i < body.n; i++) grp[i] = body.part[i] <= 1 ? -1 : body.sid[i];
  const E = yield* edgeFieldSteps(body.pos, body.n, grp, .1), junction = new Float32Array(body.n);
  let top = -Infinity;
  for (let i = 0; i < body.n; i++) if (body.part[i] === 0 && body.pos[i * 3 + 1] > top) top = body.pos[i * 3 + 1];
  for (let i = 0; i < body.n; i++) if (body.part[i] <= 1) junction[i] = JUNCTION_MOST * (1 - smooth(0, JUNCTION_BAND, top - body.pos[i * 3 + 1]));
  return Object.assign(E, { junction });
}
export function edgeWeight(E, i) { return Math.max(.12, 1 - .55 * E.feather[i] - .9 * E.junction[i]); }

export function* placeRawSteps(atlas, raw, used, previous, growth, reach, newest = false) {
  const B = atlas.body.n, base = atlas.base, R = raw.length, point = new Int32Array(R).fill(-1);
  if (!R) return point;
  const often = (k) => (k & 1023) === 1023;
  const order = growth ? growth.order : null, N = order ? order.length : B, reachN = order ? reachedCount(growth, reach > 0 ? reach : 1) : N;
  const at = (k) => (order ? order[k] : k);
  const day = new Array(R);
  for (let i = 0; i < R; i++) { day[i] = (raw[i].date ? "0" + raw[i].date : "1") + "\u0000" + raw[i].id; if (often(i)) yield; }
  const turn = Array.from({ length: R }, (_, i) => i), oldest = (a, b) => (day[a] < day[b] ? -1 : 1);
  const first = newest ? (a, b) => (day[a][0] !== day[b][0] ? (day[a][0] < day[b][0] ? -1 : 1) : day[a] > day[b] ? -1 : 1) : oldest;
  if (R > 2048) yield* sortSteps(turn, first); else turn.sort(first);
  let fresh = R, lastKept = -1, firstKept = reachN;
  if (previous) {
    const rank = new Int32Array(B).fill(-1);
    for (let k = 0; k < reachN; k++) rank[at(k)] = k;
    for (let i = 0; i < R; i++) {
      const p = previous.get(raw[i].id);
      if (p !== undefined && p >= base && p < base + B && rank[p - base] >= 0) { point[i] = p; used[p] = 1; fresh--; lastKept = Math.max(lastKept, rank[p - base]); firstKept = Math.min(firstKept, rank[p - base]); }
      if (often(i)) yield;
    }
  }
  if (!fresh) return point;
  if (newest && lastKept >= 0) {
    let free = [];
    for (let k = 0; k < firstKept; k++) if (!used[base + at(k)]) free.push(base + at(k));
    if (free.length < fresh) { free = []; for (let k = 0; k < Math.max(1, Math.ceil(reachN * .1)) && free.length < fresh; k++) if (!used[base + at(k)]) free.push(base + at(k)); }
    for (let k = 0, j = 0; k < R; k++) {
      const i = turn[k];
      if (point[i] >= 0) continue;
      const p = j < free.length ? free[j] : base + at(Math.min(reachN - 1, j - free.length));
      j++; point[i] = p; used[p] = 1;
      if (often(k)) yield;
    }
    return point;
  }
  let free = [];
  for (let k = lastKept + 1; k < reachN; k++) if (!used[base + at(k)]) free.push(base + at(k));
  if (free.length < fresh && lastKept >= 0) {
    const all = [], near = Math.floor(reachN * .9);
    for (let k = near; k < reachN; k++) if (!used[base + at(k)]) all.push(base + at(k));
    free = all.length ? all.slice(Math.max(0, all.length - fresh)) : [];
    if (!free.length) for (let k = Math.max(0, reachN - fresh); k < reachN; k++) free.push(base + at(k));
  }
  if (!free.length) for (let k = 0; k < reachN; k++) free.push(base + at(k));
  const F = free.length, wt = growth && growth.weight, cum = new Float64Array(F);
  const tap = growth && growth.start ? (q) => Math.max(.03, taperOf(growth.grow[q], growth.start[q], growth.end[q], reach > 0 ? reach : 1)) : () => 1;
  for (let f = 0, s = 0; f < F; f++) { const q = free[f] - base; s += (wt ? wt[q] : 1) * tap(q); cum[f] = s; }
  const W = cum[F - 1];
  const own = fresh <= F;
  for (let k = 0, j = 0, f = 0, last = -1; k < R; k++) {
    const i = turn[k];
    if (point[i] >= 0) continue;
    const want = (j + .5) * W / fresh;
    while (f < F - 1 && cum[f] < want) f++;
    let at = f;
    if (own) at = Math.min(F - (fresh - j), Math.max(at, last + 1));
    last = at; j++;
    const p = free[at];
    point[i] = p; used[p] = 1;
    if (often(k)) yield;
  }
  return point;
}

const h1 = (n) => { const v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
export function inBall(seed) {
  const a = h1(seed * 7.3) * 6.2831853, c = h1(seed * 13.1) * 2 - 1, s = Math.sqrt(Math.max(0, 1 - c * c)), r = .92 * Math.pow(h1(seed * 29.7), .4);
  return [s * Math.cos(a) * r, c * r, s * Math.sin(a) * r];
}

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const idHash = (id) => { let h = 2166136261; const s = String(id); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296 * 997; };
export function seamBlend(x, y, z, below, id, top, band = .24, axis = .12) {
  const [sx, sy, sz] = top, d = below ? sy - y : y - sy;
  if (d < 0 || d >= band) return [x, y, z];
  const r = Math.hypot(x - sx, z - sz), w = (1 - smooth(0, band, d)) * (below ? 1 : 1 - smooth(axis, axis * 2.5, r));
  const k = idHash(id), u1 = h1(k + 1.7), u2 = h1(k + 3.1), u3 = h1(k + 5.3), u4 = h1(k + 7.9);
  if (u1 >= .55 * w) return [x, y, z];
  const t = u2 * u2, ny = below ? sy + band * t : sy - band * t, pull = below ? 1 + .8 * t : .6, sc = band * .25 * (.5 + t);
  return [sx + (x - sx) * pull + (u3 - .5) * sc, ny, sz + (z - sz) * pull + (u4 - .5) * sc];
}

export function sampleBrain(n, b64) {
  const b = decodeBrain(b64), k = Math.min(n, b.n), out = [];
  for (let i = 0; i < k; i++) out.push([b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2], b.reg[i], b.sid[i]]);
  return out;
}

export function frontOf(x, y, z) {
  return Math.max(0, Math.min(1, (1.15 - z + .2 * (Math.sin(x * 7.3 + y * 5.1) + Math.sin(y * 6.7 - z * 4.9 + 1.3))) / 2.35));
}

export function iconOpening(nodes, mark, timing) {
  const T = Object.assign({ form: 1.3, hold: 2.4, wave: 1.1, spread: .8, lead: .45, still: false,
    lock: (front, seed) => 4.6 + 1.6 * front + seed * .35 }, timing || {});
  const K = mark.nodes.length, N = nodes.length, M = mark.nodes.map((q) => [q[0], -q[1], q[2]]);
  let stem = 0;
  for (let k = 1; k < K; k++) if (M[k][1] < M[stem][1]) stem = k;
  const dist = new Array(K).fill(1e9), done = new Array(K).fill(false);
  dist[stem] = 0;
  for (let pass = 0; pass < K; pass++) {
    let u = -1;
    for (let k = 0; k < K; k++) if (!done[k] && (u < 0 || dist[k] < dist[u])) u = k;
    if (u < 0 || dist[u] >= 1e9) break;
    done[u] = true;
    for (const ed of mark.edges) {
      const v = ed[0] === u ? ed[1] : ed[1] === u ? ed[0] : -1;
      if (v < 0) continue;
      const d = dist[u] + Math.hypot(M[v][0] - M[u][0], M[v][1] - M[u][1]);
      if (d < dist[v]) dist[v] = d;
    }
  }
  let far = 0;
  for (let k = 0; k < K; k++) if (dist[k] < 1e9 && dist[k] > far) far = dist[k];
  const form = M.map((q, k) => T.still ? -10 : T.form * (dist[k] < 1e9 ? dist[k] : far) / (far || 1));
  const c = Math.cos(-.76), s = Math.sin(-.76);
  const P = nodes.map((n) => [n.bx * c + n.bz * s, n.by]);
  const lo = [1e9, 1e9], hi = [-1e9, -1e9], mlo = [1e9, 1e9], mhi = [-1e9, -1e9];
  for (const p of P) for (let a = 0; a < 2; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
  for (const q of M) for (let a = 0; a < 2; a++) { if (q[a] < mlo[a]) mlo[a] = q[a]; if (q[a] > mhi[a]) mhi[a] = q[a]; }
  const kx = (hi[0] - lo[0]) / ((mhi[0] - mlo[0]) || 1), ky = (hi[1] - lo[1]) / ((mhi[1] - mlo[1]) || 1);
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, icx = (mlo[0] + mhi[0]) / 2, icy = (mlo[1] + mhi[1]) / 2;
  const Q = P.map((p) => [icx + (p[0] - cx) / (kx || 1), icy + (p[1] - cy) / (ky || 1)]);
  const d2 = (q, k) => { const dx = q[0] - M[k][0], dy = q[1] - M[k][1]; return dx * dx + dy * dy; };
  const home = Q.map((q) => { let best = 0, bd = 1e9; for (let j = 0; j < K; j++) { const d = d2(q, j); if (d < bd) { bd = d; best = j; } } return best; });
  const orig = new Uint8Array(N);
  for (let k = 0; k < K; k++) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) { if (orig[i]) continue; const d = d2(Q[i], k); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) { orig[best] = 1; home[best] = k; }
  }
  const out = nodes.map((n, i) => {
    const k = home[i], q = M[k], original = orig[i] === 1, wave = frontOf(n.bx, n.by, n.bz);
    const depart = T.hold + .1 + T.wave * wave + T.spread * n.seed;
    const dx = Q[i][0] - q[0], dy = Q[i][1] - q[1], L = Math.hypot(dx, dy) || 1, r = original ? 0 : .01 + .025 * n.seed;
    return { origin: [q[0], q[1], 0], offset: [dx / L * r, dy / L * r, (n.seed - .5) * r * .5],
      birth: original ? form[k] : depart - T.lead, depart, lock: T.lock(wave, n.seed),
      original: original ? 1 : 0, depth: q[2], home: k, arc: q[0] < 0 ? 1 : -1 };
  });
  out.frame = [cx * c, cy, cx * s, kx, ky];
  out.timing = { form: T.form, hold: T.hold, wave: T.wave };
  return out;
}

const PACK_HOME = 1.2, PACK_ROOM = .385, PACK_NEAR = .6, PACK_STEPS = 6000, PACK_STIFF = 60, PACK_SETTLE = 400, PACK_STILL = 1e-7, PACK_CARRY = .9;
function packHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const packShare = (h, k) => { let x = Math.imul(h ^ (k * 0x9E3779B9), 0x85EBCA6B) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; };
export function directionOf(key, axes) {
  const h = packHash(String(key)), a = 6.2831853 * packShare(h, 1), u = 1.6 * packShare(h, 2) - .8, c = Math.sqrt(1 - u * u);
  return [Math.cos(a) * c * axes[0], u * axes[1], Math.sin(a) * c * axes[2]];
}
const packed = new Map(), PACKED_MOST = 48;
export function packStable(r, keys, shape) {
  const key = JSON.stringify([r, keys.map(String), shape || null]), hit = packed.get(key);
  if (hit) { packed.delete(key); packed.set(key, hit); return hit.map((q) => q.slice()); }
  const at = packFresh(r, keys, shape);
  packed.set(key, at.map((q) => q.slice()));
  if (packed.size > PACKED_MOST) packed.delete(packed.keys().next().value);
  return at;
}
function packFresh(r, keys, shape) {
  const K = r.length, axes = (shape && shape.axes) || [1, .7, .55], gap = shape && shape.gap !== undefined ? shape.gap : .06;
  if (!K) return [];
  if (K === 1) return [[0, 0, 0]];
  const ord = Array.from({ length: K }, (_, i) => i).sort((a, b) => (String(keys[a]) < String(keys[b]) ? -1 : String(keys[a]) > String(keys[b]) ? 1 : a - b));
  const room = Math.cbrt(PACK_ROOM / (axes[0] * axes[1] * axes[2]));
  const most = Math.max(...r), mean = r.reduce((a, x) => a + x, 0) / K, whole = Math.cbrt(r.reduce((a, x) => a + x * x * x, 0)) * PACK_HOME * room;
  const home = r.map((x, i) => { const d = directionOf(keys[i], axes), at = whole * Math.max(.1, 1 - PACK_NEAR * (x - mean) / most); return [d[0] * at, d[1] * at, d[2] * at]; });
  const p = home.map((q) => q.slice()), mass = r.map((x) => x * x * x), across = axes.map((a) => 1 / (a * a));
  const g = r.map(() => [0, 0, 0]), v = r.map(() => [0, 0, 0]);
  const rate = 1 / (PACK_STIFF * 14);
  for (let step = 0; step < PACK_STEPS; step++) {
    for (const i of ord) for (let a = 0; a < 3; a++) g[i][a] = across[a] * (p[i][a] - home[i][a]);
    for (let x = 0; x < K; x++) {
      const i = ord[x];
      for (let y = x + 1; y < K; y++) {
        const j = ord[y], need = r[i] + r[j] + gap, dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1], dz = p[j][2] - p[i][2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= need || d < 1e-9) continue;
        const f = PACK_STIFF * (need - d) / d;
        g[i][0] += f * dx; g[i][1] += f * dy; g[i][2] += f * dz;
        g[j][0] -= f * dx; g[j][1] -= f * dy; g[j][2] -= f * dz;
      }
    }
    let moved = 0;
    for (const i of ord) {
      for (let a = 0; a < 3; a++) { v[i][a] = PACK_CARRY * v[i][a] - rate * g[i][a]; p[i][a] += v[i][a]; }
      moved = Math.max(moved, Math.abs(v[i][0]) + Math.abs(v[i][1]) + Math.abs(v[i][2]));
    }
    if (moved < PACK_STILL) break;
  }
  for (let pass = 0; pass < PACK_SETTLE; pass++) {
    let parted = false;
    for (let x = 0; x < K; x++) {
      const i = ord[x];
      for (let y = x + 1; y < K; y++) {
        const j = ord[y], need = r[i] + r[j] + gap;
        let dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1], dz = p[j][2] - p[i][2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= need - 1e-9) continue;
        parted = true;
        if (d < 1e-9) { const a = directionOf(keys[i], axes), b = directionOf(keys[j], axes); dx = b[0] - a[0] || 1e-3; dy = b[1] - a[1]; dz = b[2] - a[2]; d = Math.sqrt(dx * dx + dy * dy + dz * dz); }
        const over = (need - d) / d, mi = mass[j] / (mass[i] + mass[j]), mj = mass[i] / (mass[i] + mass[j]);
        p[i][0] -= dx * over * mi; p[i][1] -= dy * over * mi; p[i][2] -= dz * over * mi;
        p[j][0] += dx * over * mj; p[j][1] += dy * over * mj; p[j][2] += dz * over * mj;
      }
    }
    if (!parted) break;
  }
  return p;
}

export function monthOf(key) { const m = /(\d{4})-(\d{2})$/.exec(String(key === undefined || key === null ? "" : key)); return m ? [Number(m[1]), Number(m[2]) - 1] : null; }
function layoutCalendar(counts, months) {
  const years = [...new Set(months.filter(Boolean).map((m) => m[0]))].sort((a, b) => a - b);
  const N = counts.reduce((a, b) => a + b, 0) || 1, ARC = 2.4, HALF = ARC / 2, w = ARC / 12, H = 1.5;
  const rest = months.some((m) => !m), rows = years.length + (rest ? 1 : 0), per = new Array(rows).fill(0);
  for (let i = 0; i < counts.length; i++) per[months[i] ? years.indexOf(months[i][0]) : years.length] += counts[i];
  const minH = Math.min(.075, H / Math.max(1, rows)), weight = per.map((c) => Math.sqrt(c)), sum = weight.reduce((a, b) => a + b, 0) || 1;
  const hs = weight.map((wt) => Math.max(minH, (H - minH * rows) * wt / sum + minH)), total = hs.reduce((a, b) => a + b, 0), scale = total > H ? H / total : 1;
  const tops = []; let y = (total * scale) / 2;
  for (const hRow of hs) { tops.push(y); y -= hRow * scale; }
  const pl = [];
  for (let i = 0; i < counts.length; i++) {
    const m = months[i], row = m ? years.indexOf(m[0]) : years.length, col = m ? m[1] : 5.5, h = hs[row] * scale;
    const cap = .46 * Math.min(w, h), floor = Math.min(cap, Math.max(.025, .34 * cap));
    const u = -HALF + w * (col + .5), v = tops[row] - h / 2;
    pl.push([u, v, .18 * (1 - (u / HALF) * (u / HALF)), Math.min(cap, Math.max(floor, .5 * Math.cbrt(counts[i] / N)))]);
  }
  return pl;
}
export function layoutOf(counts, opts) {
  const O = Object.assign({ ordinal: false, seed: 3100, slots: 12 }, opts || {});
  const K = counts.length, N = counts.reduce((a, b) => a + b, 0) || 1, R = rng(O.seed);
  const r = counts.map((c) => Math.max(.12, .5 * Math.cbrt(c / N)));
  const out = [];
  for (let i = 0; i < Math.max(O.slots, K); i++) out.push([0, 0, 0, .3]);
  if (!K) return out;
  let pl = [];
  const months = O.ordinal && Array.isArray(O.keys) && O.keys.length === K ? O.keys.map(monthOf) : null;
  if (months && new Set(months.filter(Boolean).map((m) => m[0])).size > 1) {
    pl = layoutCalendar(counts, months);
  } else if (O.ordinal) {
    let x = 0;
    for (let i = 0; i < K; i++) { if (i) x += r[i - 1] + r[i] + .06; pl.push([x, 0, 0, r[i]]); }
    const span = x, ARC = 1.7, HALF = ARC / 2;
    let k = 1;
    if (K > 1) k = span > ARC ? ARC / span : 1;
    for (let i = 0; i < K; i++) {
      const u = K > 1 ? (span > ARC ? pl[i][0] * k - HALF : -HALF + ARC * pl[i][0] / span) : 0;
      pl[i] = [u, 0, .18 * (1 - (u / HALF) * (u / HALF)), r[i] * k];
    }
  } else {
    const keys = Array.isArray(O.keys) && O.keys.length === K ? O.keys : counts.map((c, i) => "slot " + i);
    const at = packStable(r, keys, { axes: [1, .7, .55], gap: .06 });
    for (let i = 0; i < K; i++) pl[i] = [at[i][0], at[i][1], at[i][2], r[i]];
  }
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const P of pl) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[a] - P[3]); hi[a] = Math.max(hi[a], P[a] + P[3]); }
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
  let rxz = 0, ry = 0;
  for (const P of pl) { rxz = Math.max(rxz, Math.hypot(P[0] - cx, P[2] - cz) + P[3]); ry = Math.max(ry, Math.abs(P[1] - cy) + P[3]); }
  const calendar = months && new Set(months.filter(Boolean).map((m) => m[0])).size > 1;
  const sc2 = calendar ? 1 / Math.max(1, rxz / 1.3, ry / .8) : 1 / Math.max(1, rxz / (O.ordinal ? .9 : .8), ry / .6);
  for (let i = 0; i < K; i++) out[i] = [(pl[i][0] - cx) * sc2, (pl[i][1] - cy) * sc2, (pl[i][2] - cz) * sc2, pl[i][3] * sc2];
  for (let i = K; i < out.length; i++) out[i] = out[0].slice();
  return out;
}

export function regionWalks(brain) {
  const { n, pos, reg } = brain, walks = [];
  const cell = .08, G = Math.ceil(2 / cell) + 1, cells = G * G * G;
  const cellOf = (v) => Math.max(0, Math.min(G - 1, Math.floor((v + 1) / cell)));
  const bd = new Float64Array(8), bq = new Int32Array(8);
  for (let r = 0; r < 8; r++) {
    const ids = [];
    for (let i = 0; i < n; i++) if (reg[i] === r) ids.push(i);
    const m = ids.length, start = new Int32Array(cells + 1), cellOfPoint = new Int32Array(m);
    for (let j = 0; j < m; j++) {
      const i = ids[j], k = (cellOf(pos[i * 3]) * G + cellOf(pos[i * 3 + 1])) * G + cellOf(pos[i * 3 + 2]);
      cellOfPoint[j] = k; start[k + 1]++;
    }
    for (let k = 0; k < cells; k++) start[k + 1] += start[k];
    const members = new Int32Array(m), fill = start.slice(0, cells);
    for (let j = 0; j < m; j++) members[fill[cellOfPoint[j]]++] = j;
    const near = new Int32Array(m * 8).fill(-1);
    for (let j = 0; j < m; j++) {
      const i = ids[j], kept = nearestEight(pos, ids, start, members, G, cells, j, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
        cellOf(pos[i * 3]), cellOf(pos[i * 3 + 1]), cellOf(pos[i * 3 + 2]), bd, bq);
      for (let k = 0; k < kept; k++) near[j * 8 + k] = bq[k];
    }
    const front = Array.from({ length: m }, (_, j) => j).sort((a, b) => pos[ids[b] * 3 + 2] - pos[ids[a] * 3 + 2] || a - b);
    const seen = new Uint8Array(m), order = [];
    let next = 0;
    while (order.length < m) {
      while (seen[front[next]]) next++;
      const seed = front[next];
      const queue = [seed]; seen[seed] = 1;
      for (let h = 0; h < queue.length; h++) {
        const u = queue[h]; order.push(ids[u]);
        for (let k = 0; k < 8; k++) { const v = near[u * 8 + k]; if (v >= 0 && !seen[v]) { seen[v] = 1; queue.push(v); } }
      }
    }
    walks.push(order);
  }
  return walks;
}

export function storedWalks(brain, n, hex) {
  if (!hex || brain.n !== n) return null;
  const u = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(2 * i, 2), 16);
  const v = new DataView(u.buffer), walks = [];
  let at = 16;
  for (let r = 0; r < 8; r++) {
    const w = new Array(v.getUint16(2 * r, true));
    for (let k = 0; k < w.length; k++, at += 2) w[k] = v.getUint16(at, true);
    walks.push(w);
  }
  return at === u.length ? walks : null;
}

function nearestEight(pos, ids, start, members, G, cells, j, x, y, z, cx, cy, cz, bd, bq) {
  let found = 0, kept = 0;
  for (let reach = 1; reach <= 3 && found < 8; reach++) {
    found = 0; kept = 0;
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) for (let c = -reach; c <= reach; c++) {
      const k = ((cx + a) * G + (cy + b)) * G + (cz + c);
      if (k < 0 || k >= cells) continue;
      for (let at0 = start[k], end = start[k + 1]; at0 < end; at0++) {
        const q = members[at0];
        if (q === j) continue;
        const o = ids[q] * 3, dx = pos[o] - x, dy = pos[o + 1] - y, dz = pos[o + 2] - z, d = dx * dx + dy * dy + dz * dz;
        found++;
        if (kept === 8 && d >= bd[7]) continue;
        let at = kept;
        while (at > 0 && bd[at - 1] > d) at--;
        for (let s = kept < 8 ? kept : 7; s > at; s--) { bd[s] = bd[s - 1]; bq[s] = bq[s - 1]; }
        bd[at] = d; bq[at] = q; if (kept < 8) kept++;
      }
    }
  }
  return kept;
}

export const REGION_FILL_ORDER = [2, 4, 0, 1, 3, 6, 5, 7];

export function placeEntries(brain, walks, entries, links, opts) {
  const steps = placeEntriesSteps(brain, walks, entries, links, opts);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

export function* placeEntriesSteps(brain, walks, entries, links, opts) {
  const O = Object.assign({ previous: null }, opts || {});
  const E = entries.length, n = brain.n, idx = new Map();
  const often = (k) => (k & 1023) === 1023;
  for (let i = 0; i < E; i++) { idx.set(entries[i].id, i); if (often(i)) yield; }
  const parent = new Int32Array(E);
  for (let i = 0; i < E; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let j = 0; j < links.length; j++) {
    const l = links[j], a = idx.get(l.source), b = idx.get(l.target);
    if (often(j)) yield;
    if (a === undefined || b === undefined) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const groups = new Map(), size = new Int32Array(E);
  for (let i = 0; i < E; i++) size[find(i)]++;
  yield;
  for (let i = 0; i < E; i++) {
    const root = find(i);
    const key = size[root] === 1 ? "month:" + (entries[i].month || "undated") : "unit:" + root;
    let g = groups.get(key); if (!g) { g = []; groups.set(key, g); } g.push(i);
    if (often(i)) yield;
  }
  const dateKey = (e) => (e.date ? "0" + e.date : "1") + "\u0000" + e.id, day = new Array(E);
  for (let i = 0; i < E; i++) { day[i] = dateKey(entries[i]); if (often(i)) yield; }
  const units = [];
  let sorted = 0;
  for (const [key, ids] of groups) {
    if (ids.length > 2048) yield* sortSteps(ids, (a, b) => (day[a] < day[b] ? -1 : 1));
    else ids.sort((a, b) => (day[a] < day[b] ? -1 : 1));
    units.push({ key, ids });
    sorted += ids.length; if (sorted > 2048) { sorted = 0; yield; }
  }
  units.sort((a, b) => b.ids.length - a.ids.length || (a.key < b.key ? -1 : 1));
  yield;
  const used = new Uint8Array(n), point = new Int32Array(E).fill(-1), jitter = new Float32Array(E);
  if (O.previous) for (let i = 0; i < E; i++) { const p = O.previous.get(entries[i].id); if (p !== undefined && p >= 0 && p < n && !used[p]) { point[i] = p; used[p] = 1; } if (often(i)) yield; }
  const cursor = new Int32Array(8), remaining = () => { let s = 0; for (let r = 0; r < 8; r++) s += walks[r].length - cursor[r]; return s; };
  const claim = (r) => { const w = walks[r]; while (cursor[r] < w.length && used[w[cursor[r]]]) cursor[r]++; if (cursor[r] >= w.length) return -1; const p = w[cursor[r]++]; used[p] = 1; return p; };
  const free = (r) => { let s = 0; const w = walks[r]; for (let k = cursor[r]; k < w.length; k++) if (!used[w[k]]) s++; return s; };
  const nearestIn = (x, y, z, r) => {
    let best = -1, bd = 1e9; const w = walks[r];
    for (const p of w) { if (used[p]) continue; const dx = brain.pos[p * 3] - x, dy = brain.pos[p * 3 + 1] - y, dz = brain.pos[p * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const nearestFree = (x, y, z, r) => {
    let best = nearestIn(x, y, z, r);
    for (let rr = 0; rr < 8 && best < 0; rr++) if (rr !== r) best = nearestIn(x, y, z, rr);
    return best;
  };
  let reuse = 0, done = 0;
  const fresher = [];   
  for (const unit of units) {
    if (done > 1024) { done = 0; yield; }
    done += unit.ids.length;
    const placed = unit.ids.filter((i) => point[i] >= 0), fresh = unit.ids.filter((i) => point[i] < 0);
    if (!fresh.length) continue;
    if (placed.length) {
      let x = 0, y = 0, z = 0;
      for (const i of placed) { const p = point[i] * 3; x += brain.pos[p]; y += brain.pos[p + 1]; z += brain.pos[p + 2]; }
      x /= placed.length; y /= placed.length; z /= placed.length;
      const r = brain.reg[point[placed[0]]];
      for (const i of fresh) { const p = nearestFree(x, y, z, r); if (p >= 0) { point[i] = p; used[p] = 1; } done += 256; if (done > 1024) { done = 0; yield; } }
      continue;
    }
    if (remaining() <= 0) continue;
    fresher.push(unit, fresh);
  }
  const share = new Float64Array(8), room = new Float64Array(8), given = new Float64Array(8), lists = [[], [], [], [], [], [], [], []];
  let toPlace = 0, roomAll = 0;
  for (let k = 1; k < fresher.length; k += 2) toPlace += fresher[k].length;
  for (let r = 0; r < 8; r++) { room[r] = free(r); roomAll += room[r]; }
  for (let r = 0; r < 8; r++) share[r] = roomAll ? toPlace * room[r] / roomAll : 0;
  for (let k = 0; k < fresher.length; k += 2) {
    const fresh = fresher[k + 1];
    let r = -1, need = -Infinity;
    for (const cand of REGION_FILL_ORDER) { if (room[cand] - given[cand] < fresh.length) continue; const d = (share[cand] - given[cand]) / Math.max(1, share[cand]); if (d > need) { need = d; r = cand; } }
    if (r < 0) { let most = -Infinity; for (const cand of REGION_FILL_ORDER) { const f = room[cand] - given[cand]; if (f > most) { most = f; r = cand; } } }
    given[r] += fresh.length; lists[r].push(fresh);
    if ((k & 255) === 254) yield;
  }
  for (let r = 0; r < 8; r++) {
    const w = walks[r], freeAt = [];
    for (let k = 0; k < w.length; k++) if (!used[w[k]]) freeAt.push(w[k]);
    let m = 0;
    for (const fresh of lists[r]) m += fresh.length;
    if (!m) continue;
    const stride = freeAt.length / m;
    let j = 0;
    for (const fresh of lists[r]) {
      for (const i of fresh) {
        const want = Math.min(freeAt.length - 1, Math.floor((j + .5) * stride));
        j++;
        let p = -1;
        if (freeAt.length) for (let d = 0; d < 64 && p < 0; d++) { if (want + d < freeAt.length && !used[freeAt[want + d]]) p = freeAt[want + d]; else if (want - d >= 0 && !used[freeAt[want - d]]) p = freeAt[want - d]; }
        if (p < 0) { let rr = r, k = 0; while (p < 0 && k < 8) { p = claim(rr); if (p < 0) { rr = REGION_FILL_ORDER[(REGION_FILL_ORDER.indexOf(rr) + 1) % 8]; k++; } } }
        if (p >= 0) { point[i] = p; used[p] = 1; }
      }
      done += fresh.length; if (done > 1024) { done = 0; yield; }
    }
  }
  for (let i = 0; i < E; i++) { if (point[i] < 0) { point[i] = reuse % n; jitter[i] = .012 * (1 + (reuse / n | 0)); reuse++; } if (often(i)) yield; }
  return { point, jitter, used };
}

export const TERRITORY_ORDER = [0, 1, 2, 4, 5, 3, 6, 7];
export function* placeTerritorySteps(brain, walks, entries, links, opts) {
  const O = Object.assign({ previous: null }, opts || {});
  const E = entries.length, n = brain.n, often = (k) => (k & 1023) === 1023;
  const W = [];
  for (const r of TERRITORY_ORDER) for (const p of walks[r] || []) W.push(p);
  const at = new Int32Array(n).fill(-1);
  for (let k = 0; k < W.length; k++) at[W[k]] = k;
  const areas = new Map();
  for (let i = 0; i < E; i++) {
    const e = entries[i], key = e.area || "~none", fam = e.area ? e.family || key : "~none";
    let a = areas.get(key); if (!a) { a = { key, family: fam, ids: [] }; areas.set(key, a); } a.ids.push(i);
    if (often(i)) yield;
  }
  const families = new Map();
  for (const a of areas.values()) { let f = families.get(a.family); if (!f) { f = { key: a.family, size: 0, areas: [] }; families.set(a.family, f); } f.size += a.ids.length; f.areas.push(a); }
  const none = (f) => (f.key === "~none" ? 1 : 0);
  const famList = Array.from(families.values()).sort((x, y) => none(x) - none(y) || y.size - x.size || (x.key < y.key ? -1 : 1));
  for (const f of famList) f.areas.sort((x, y) => (x.key === f.key ? 0 : 1) - (y.key === f.key ? 0 : 1) || y.ids.length - x.ids.length || (x.key < y.key ? -1 : 1));
  const ordered = [];
  for (const f of famList) for (const a of f.areas) ordered.push(a);
  const total = Math.max(1, E), Lw = W.length, stretch = new Map();
  let start = 0;
  ordered.forEach((a, k) => {
    const len = k === ordered.length - 1 ? Lw - start : Math.max(1, Math.round(Lw * a.ids.length / total));
    const end = Math.min(Lw, start + len); stretch.set(a.key, [start, end]); start = end;
  });
  const used = new Uint8Array(n), point = new Int32Array(E).fill(-1), jitter = new Float32Array(E);
  const day = (e) => (e.date ? "0" + e.date : "1") + "\u0000" + e.id;
  for (const a of ordered) {
    const [s0, s1] = stretch.get(a.key), len = Math.max(1, s1 - s0), ids = a.ids.slice();
    if (ids.length > 2048) yield* sortSteps(ids, (x, y) => (day(entries[x]) < day(entries[y]) ? -1 : 1)); else ids.sort((x, y) => (day(entries[x]) < day(entries[y]) ? -1 : 1));
    for (const i of ids) { const p = O.previous ? O.previous.get(entries[i].id) : undefined; if (p !== undefined && p >= 0 && p < n && !used[p] && at[p] >= s0 && at[p] < s1) { point[i] = p; used[p] = 1; } }
    const stride = len / ids.length;
    for (let j = 0; j < ids.length; j++) {
      const i = ids[j];
      if (point[i] >= 0) continue;
      const want = s0 + Math.min(len - 1, Math.floor((j + .5) * stride));
      let p = -1;
      for (let d = 0; d < 24 && p < 0; d++) { if (want + d < s1 && !used[W[want + d]]) p = W[want + d]; else if (want - d >= s0 && !used[W[want - d]]) p = W[want - d]; }
      if (p >= 0) { point[i] = p; used[p] = 1; }
      if (often(j)) yield;
    }
    yield;
  }
  let reuse = 0;
  for (let i = 0; i < E; i++) { if (point[i] < 0) { point[i] = Lw ? W[reuse % Lw] : reuse % n; jitter[i] = .012 * (1 + (reuse / n | 0)); reuse++; } if (often(i)) yield; }
  return { point, jitter, used };
}

export function functionWalks(brain, walks, table, names) {
  const steps = functionWalksSteps(brain, walks, table, names);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}
export function* functionWalksSteps(brain, walks, table, names) {
  const sidOf = new Map(), owner = new Int16Array(brain.n).fill(-1), lists = table.map(() => []);
  names.forEach((s, i) => sidOf.set(Array.isArray(s) ? s[0] : s, i));
  const sids = (list) => new Set((list || []).map((name) => sidOf.get(name)).filter((s) => s !== undefined));
  const own = table.map((f) => sids(f.structs)), back = table.map((f) => sids(f.fallback));
  const drawn = new Uint8Array(brain.n);
  for (let r = 0; r < 8; r++) for (const p of walks[r] || []) drawn[p] = 1;
  for (let r = 0; r < 8; r++) for (const p of walks[r] || []) { const s = brain.sid[p]; for (let f = 0; f < table.length; f++) if (own[f].has(s)) { lists[f].push(p); owner[p] = f; break; } }
  for (let f = 0; f < table.length; f++) if (!lists[f].length && back[f].size) for (let r = 0; r < 8; r++) for (const p of walks[r] || []) if (owner[p] < 0 && back[f].has(brain.sid[p])) { lists[f].push(p); owner[p] = f; }
  yield;
  const out = new Map(), dist = new Float64Array(brain.n);
  for (let f = 0; f < table.length; f++) {
    yield;
    const mine = lists[f];
    if (!mine.length) { out.set(table[f].key, { own: 0, order: [] }); continue; }
    let cx = 0, cy = 0, cz = 0;
    const lobes = new Set();
    for (const p of mine) { cx += brain.pos[p * 3]; cy += brain.pos[p * 3 + 1]; cz += brain.pos[p * 3 + 2]; lobes.add(brain.reg[p]); }
    cx /= mine.length; cy /= mine.length; cz /= mine.length;
    const spill = [];
    for (const r of lobes) for (const p of walks[r] || []) if (owner[p] < 0 && drawn[p]) spill.push(p);
    for (const p of spill) { const x = brain.pos[p * 3] - cx, y = brain.pos[p * 3 + 1] - cy, z = brain.pos[p * 3 + 2] - cz; dist[p] = x * x + y * y + z * z; }
    spill.sort((a, b) => dist[a] - dist[b] || a - b);
    out.set(table[f].key, { own: mine.length, order: mine.concat(spill) });
  }
  return out;
}
export function* placeFunctionSteps(brain, walks, entries, links, opts) {
  const O = Object.assign({ previous: null, fnWalks: null, fallback: null, shares: null, lobes: null }, opts || {});
  const E = entries.length, n = brain.n, often = (k) => (k & 1023) === 1023, F = O.fnWalks || new Map();
  const groups = new Map();
  for (let i = 0; i < E; i++) {
    const key = F.has(entries[i].fn) ? entries[i].fn : O.fallback;
    let g = groups.get(key); if (!g) { g = []; groups.set(key, g); } g.push(i);
    if (often(i)) yield;
  }
  const used = new Uint8Array(n), point = new Int32Array(E).fill(-1), jitter = new Float32Array(E);
  const day = (e) => (e.date ? "0" + e.date : "1") + "\u0000" + e.id;
  const keys = Array.from(groups.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), spill = [];
  for (const key of keys) {
    const ids = groups.get(key), walk = F.get(key) || { own: 0, order: [] }, W = walk.order;
    if (ids.length > 2048) yield* sortSteps(ids, (x, y) => (day(entries[x]) < day(entries[y]) ? -1 : 1)); else ids.sort((x, y) => (day(entries[x]) < day(entries[y]) ? -1 : 1));
    const len = Math.min(W.length, Math.max(walk.own, ids.length));
    let stay = ids;
    if (O.shares && O.shares[key] && ids.length > len) {
      const keep = len / ids.length, out = [];
      stay = [];
      ids.forEach((i, j) => (Math.floor((j + 1) * keep) > Math.floor(j * keep) ? stay : out).push(i));
      spill.push([key, out]);
    }
    if (!len) continue;
    const at = new Map();
    for (let k = 0; k < len; k++) at.set(W[k], k);
    for (const i of stay) { const p = O.previous ? O.previous.get(entries[i].id) : undefined; if (p !== undefined && at.has(p) && !used[p]) { point[i] = p; used[p] = 1; } }
    const stride = len / stay.length;
    for (let j = 0; j < stay.length; j++) {
      const i = stay[j];
      if (point[i] >= 0) continue;
      const want = Math.min(len - 1, Math.floor((j + .5) * stride));
      let p = -1;
      for (let d = 0; d < 48 && p < 0; d++) { if (want + d < len && !used[W[want + d]]) p = W[want + d]; else if (want - d >= 0 && !used[W[want - d]]) p = W[want - d]; }
      if (p >= 0) { point[i] = p; used[p] = 1; } else { point[i] = W[want]; jitter[i] = .012 * (1 + (j % 3)); }
      if (often(j)) yield;
    }
    yield;
  }
  if (spill.length) {
    const size = walks.map((w) => (w ? w.length : 0)), total = size.reduce((a, b) => a + b, 0), level = Math.min(1, E / Math.max(1, total));
    const count = new Float64Array(walks.length);
    for (let i = 0; i < E; i++) if (point[i] >= 0) count[brain.reg[point[i]]]++;
    const room = (r, upTo) => Math.max(0, Math.floor(upTo * size[r]) - count[r]);
    const place = (r, ids) => {
      const f = walks[r].filter((p) => !used[p]), stride = f.length / Math.max(1, ids.length);
      ids.forEach((i, j) => { const q = Math.min(f.length - 1, Math.floor((j + .5) * stride)); let p = -1; for (let d = 0; d < 64 && p < 0 && f.length; d++) { if (q + d < f.length && !used[f[q + d]]) p = f[q + d]; else if (q - d >= 0 && !used[f[q - d]]) p = f[q - d]; } if (p >= 0) { point[i] = p; used[p] = 1; count[r]++; } });
    };
    const order = spill.map(([key, out]) => ({ out, lobes: (O.shares[key] || []).map((name) => (O.lobes || []).indexOf(name)).filter((r) => r >= 0 && size[r]) }));
    const deepest = Math.max(0, ...order.map((o) => o.lobes.length));
    for (let k = 0; k < deepest; k++) for (const o of order) { const r = o.lobes[k]; if (r === undefined || !o.out.length) continue; const n = Math.min(o.out.length, room(r, level)); if (n > 0) { place(r, o.out.slice(0, n)); o.out = o.out.slice(n); } }
    yield;
    for (const upTo of [level, 1]) for (const o of order) {
      if (!o.out.length) continue;
      const lobes = Array.from({ length: walks.length }, (_, r) => r).filter((r) => size[r]).sort((x, y) => (count[x] / size[x]) - (count[y] / size[y]));
      for (const r of lobes) { if (!o.out.length) break; const n = Math.min(o.out.length, room(r, upTo)); if (n > 0) { place(r, o.out.slice(0, n)); o.out = o.out.slice(n); } }
    }
    yield;
  }
  let reuse = 0;
  for (let i = 0; i < E; i++) { if (point[i] < 0) { point[i] = reuse % n; jitter[i] = .012 * (1 + (reuse / n | 0)); reuse++; } if (often(i)) yield; }
  return { point, jitter, used };
}

export function* sortSteps(list, order) {
  const n = list.length;
  let from = list.slice(), to = new Array(n), count = 0;
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width, n), hi = Math.min(lo + 2 * width, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) { to[k++] = order(from[j], from[i]) < 0 ? from[j++] : from[i++]; if ((++count & 2047) === 0) yield; }
      while (i < mid) to[k++] = from[i++];
      while (j < hi) to[k++] = from[j++];
    }
    const t = from; from = to; to = t;
    yield;
  }
  for (let k = 0; k < n; k++) list[k] = from[k];
  return list;
}

export function scaffoldOf(brain, used, entryCount, without) {
  const want = Math.max(0, Math.min(12000, 12000 - 3 * entryCount)), out = [], skip = without === undefined ? -1 : without;
  for (let i = 0; i < brain.n && out.length < want; i++) if (!used[i] && brain.reg[i] !== skip) out.push(i);
  return out;
}

export function growForest(brain, ids, seed) {
  const R = rng(seed || 20260926), pools = [[], [], [], [], [], [], [], []], edges = [];
  const d2 = (a, b) => { const o = a * 3, p = b * 3, x = brain.pos[o] - brain.pos[p], y = brain.pos[o + 1] - brain.pos[p + 1], z = brain.pos[o + 2] - brain.pos[p + 2]; return x * x + y * y + z * z; };
  ids.forEach((id, i) => {
    const pool = pools[brain.reg[id]];
    let par = -1, best = 1e9;
    if (pool.length) for (let s = 0; s < 14; s++) { const c = pool[Math.floor(R() * pool.length)], dd = d2(id, ids[c]); if (dd < best) { best = dd; par = c; } }
    if (par >= 0) edges.push([par, i]);
    if (pool.length > 2 && R() < .55) {
      let bb = -1, bd = 1e9;
      for (let s = 0; s < 8; s++) { const c2 = pool[Math.floor(R() * pool.length)]; if (c2 === par) continue; const d3 = d2(id, ids[c2]); if (d3 < bd) { bd = d3; bb = c2; } }
      if (bb >= 0) edges.push([bb, i]);
    }
    pool.push(i);
  });
  return edges;
}

export function attachRun(base, count, A, B, out, at) {
  const o = at || 0, last = (count - 1) * 3;
  const a0 = A[0] - base[0], a1 = A[1] - base[1], a2 = A[2] - base[2];
  const b0 = B[0] - base[last], b1 = B[1] - base[last + 1], b2 = B[2] - base[last + 2];
  for (let s = 0; s < count; s++) {
    const u = count > 1 ? s / (count - 1) : 0, v = 1 - u, i = s * 3;
    out[o + i] = base[i] + a0 * v + b0 * u; out[o + i + 1] = base[i + 1] + a1 * v + b1 * u; out[o + i + 2] = base[i + 2] + a2 * v + b2 * u;
  }
}
