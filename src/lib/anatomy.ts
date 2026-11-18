// Procedural anatomy: point samplers for brain regions, brainstem, spine, nerves.
// Coordinates: y up, z forward (face), x left-right. Brain spans roughly [-1,1].

export type Vec3 = [number, number, number];

// small deterministic RNG so the brain looks the same every open
export function rng(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13; s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5; s >>>= 0;
		return s / 4294967296;
	};
}

function gauss(r: () => number) {
	return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
}

// cheap 3D value noise for gyri bumps
function hash(x: number, y: number, z: number) {
	const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
	return h - Math.floor(h);
}
function noise(x: number, y: number, z: number) {
	const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
	const xf = x - xi, yf = y - yi, zf = z - zi;
	const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
	let acc = 0;
	for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
		const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
		acc += wgt * hash(xi + dx, yi + dy, zi + dz);
	}
	return acc;
}
function gyri(x: number, y: number, z: number) {
	return 0.6 * noise(x * 6, y * 6, z * 6) + 0.3 * noise(x * 13, y * 13, z * 13) + 0.1 * noise(x * 27, y * 27, z * 27);
}

export interface Region {
	name: string;
	// returns a point inside the region; u in [0,1]^3 lets callers place
	// semantically-close notes in nearby spots
	sample(u: Vec3, r: () => number): Vec3;
}

const cerebellum: Region = {
	name: "cerebellum",
	sample(u, r) {
		const a = (u[0] - 0.5) * Math.PI * 1.2;
		const b = (u[1] - 0.5) * Math.PI * 0.9;
		const d = 1 - Math.pow(r(), 2) * 0.5;
		const fold = 1 + 0.12 * Math.sin(b * 22);
		return [
			Math.sin(a) * 0.48 * d,
			-0.32 + Math.sin(b) * 0.2 * d * fold,
			-0.62 + Math.cos(a) * Math.cos(b) * 0.22 * d,
		];
	},
};

// brainstem + spinal cord as a curve going down
/** Spine axis t∈[0,1] (0 = just under docked stem, 1 = caudal end). */
export function spinePoint(t: number): Vec3 {
	const u = Math.max(0, Math.min(1, t));
	// Mild ease-in: first rings hug the stem tip (0, STEM_Y, 0).
	const e = Math.pow(u, 1.35);
	const y = 0.07 - e * 2.7;
	return [0, y, 0];
}

/** Nearest parameter t on the spine axis to a world point (coarse + refine). */
export function nearestSpineParam(p: Vec3): number {
	let bestT = 0;
	let bestD = Infinity;
	for (let i = 0; i <= 48; i++) {
		const t = i / 48;
		const c = spinePoint(t);
		const d =
			(c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
		if (d < bestD) {
			bestD = d;
			bestT = t;
		}
	}
	const lo = Math.max(0, bestT - 1 / 48);
	const hi = Math.min(1, bestT + 1 / 48);
	for (let i = 0; i <= 16; i++) {
		const t = lo + ((hi - lo) * i) / 16;
		const c = spinePoint(t);
		const d =
			(c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
		if (d < bestD) {
			bestD = d;
			bestT = t;
		}
	}
	return bestT;
}

export const VERTEBRA_COUNT = 18;

/**
 * Centers of successive vertebral rings between spine params t0→t1.
 * Synapses must visit these (middle of each anneau), not chord through empty gaps.
 */
export function vertebraCentersBetween(t0: number, t1: number): Vec3[] {
	const ascending = t1 >= t0;
	const lo = Math.min(t0, t1);
	const hi = Math.max(t0, t1);
	const i0 = Math.max(0, Math.floor(lo * VERTEBRA_COUNT));
	const i1 = Math.min(VERTEBRA_COUNT - 1, Math.ceil(hi * VERTEBRA_COUNT - 1e-6));
	const pts: Vec3[] = [];
	for (let i = i0; i <= i1; i++) {
		// Same disc center as the rendered anneau (mid-slot local=0.5)
		const c = vertebraAt((i + 0.5) / VERTEBRA_COUNT).center;
		pts.push([c[0], c[1], c[2]]);
	}
	if (!ascending) pts.reverse();
	return pts.length ? pts : [spinePoint((t0 + t1) / 2)];
}

/** Map continuous spine t∈[0,1] onto a discrete vertebra index + local disc coords. */
export function vertebraAt(t: number): { index: number; local: number; center: Vec3; rad: number; thick: number } {
	const clamped = Math.max(0, Math.min(0.999, t));
	const index = Math.min(VERTEBRA_COUNT - 1, Math.floor(clamped * VERTEBRA_COUNT));
	const local = clamped * VERTEBRA_COUNT - index; // 0..1 within slot
	// disc sits in the middle of each slot; gaps between vertebrae
	// Tight disc in the middle of each slot → clear intervertebral gaps
	const disc = 0.38 + local * 0.24;
	const tDisc = (index + disc) / VERTEBRA_COUNT;
	const center = spinePoint(tDisc);
	const flare = 0.8 + 0.45 * Math.sin((index / (VERTEBRA_COUNT - 1)) * Math.PI);
	const rad = (0.12 + 0.04 * flare) * (index < 2 ? 0.7 : 1);
	const thick = 0.028 + 0.01 * flare;
	return { index, local, center, rad, thick };
}

function sampleDisc(center: Vec3, rad: number, thick: number, u: Vec3, r: () => number): Vec3 {
	// annulus / vertebral body: denser toward the rim, flat disc
	const ang = u[0] * Math.PI * 2;
	const ring = 0.35 + 0.65 * Math.sqrt(r()); // hollow-ish body
	const rr = rad * ring;
	const yJ = (u[1] - 0.5) * thick + gauss(r) * thick * 0.15;
	// slight oval (wider side-to-side like a vertebra)
	return [
		center[0] + Math.cos(ang) * rr * 1.15,
		center[1] + yJ,
		center[2] + Math.sin(ang) * rr * 0.85 + gauss(r) * 0.008,
	];
}

const brainstem: Region = {
	name: "brainstem",
	sample(u, r) {
		const t = u[1] * 0.14;
		const v = vertebraAt(t);
		return sampleDisc(v.center, v.rad * 1.15, v.thick * 1.3, u, r);
	},
};

const spine: Region = {
	name: "spine",
	sample(u, r) {
		const t = 0.12 + u[1] * 0.86;
		const v = vertebraAt(t);
		return sampleDisc(v.center, v.rad, v.thick, u, r);
	},
};

/** Scaffold point-cloud of stacked vertebrae (no lines). */
export function vertebraCloud(count = 4200, seed = 9): Float32Array {
	const r = rng(seed);
	const out = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const t = r();
		const v = vertebraAt(0.08 + t * 0.9);
		const u: Vec3 = [r(), r(), r()];
		const p = sampleDisc(v.center, v.rad, v.thick, u, r);
		out.set(p, i * 3);
	}
	return out;
}

// Discrete branching nerve fibers (nervures), not a torso volume fill.
export type NerveFiber = {
	id: number;
	side: -1 | 1;
	rootT: number;
	points: Vec3[];
};

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function fiberPoint(pts: Vec3[], t: number): Vec3 {
	const u = Math.max(0, Math.min(0.999, t)) * (pts.length - 1);
	const i = Math.floor(u);
	const f = u - i;
	return lerp3(pts[i], pts[i + 1] ?? pts[i], f);
}

function makeFiber(
	id: number,
	side: -1 | 1,
	rootT: number,
	len: number,
	lift: number,
	yaw: number,
	r: () => number
): NerveFiber {
	const root = spinePoint(rootT);
	const segs = 16;
	const wave = 0.08 + r() * 0.14;
	const phase = r() * Math.PI * 2;
	const pts: Vec3[] = [root];
	for (let i = 1; i <= segs; i++) {
		const t = i / segs;
		// ease-out reach so roots stay tight to the spine
		const ease = 1 - Math.pow(1 - t, 1.65);
		const reach = len * ease;
		const droop = ease * ease * (0.28 + 0.65 * rootT);
		const sweep = Math.sin(ease * Math.PI) * yaw + Math.sin(ease * Math.PI * 2 + phase) * wave * 0.35;
		const forward = 0.05 + ease * 0.28 + lift * (1 - ease) * 0.4;
		const wiggle = Math.sin(ease * Math.PI * 3 + phase) * wave;
		pts.push([
			root[0] + side * (reach * Math.cos(sweep) + wiggle * 0.12),
			root[1] - droop + Math.sin(ease * Math.PI) * lift * 0.2 + wiggle * 0.04,
			root[2] + forward + Math.sin(sweep) * 0.08,
		]);
	}
	return { id, side, rootT, points: pts };
}

/** Stable nerve tree: primary roots + short distal twigs. */
export function buildNerveTree(seed = 11): NerveFiber[] {
	const r = rng(seed);
	const fibers: NerveFiber[] = [];
	let id = 0;
	const roots = 16;
	for (let i = 0; i < roots; i++) {
		// Cervical roots start just under the skull — no bare neck
		const rootT = 0.04 + (i / (roots - 1)) * 0.88;
		// shoulders longer, mid torso medium, hips shorter
		const shoulder = Math.exp(-Math.pow((rootT - 0.28) / 0.14, 2));
		const hip = Math.exp(-Math.pow((rootT - 0.88) / 0.1, 2));
		const len = 0.55 + 0.95 * shoulder + 0.35 * hip;
		for (const side of [-1, 1] as const) {
			const yaw = (0.15 + r() * 0.35) * (0.6 + shoulder);
			const lift = 0.05 + r() * 0.12;
			const main = makeFiber(id++, side, rootT, len, lift, yaw, r);
			fibers.push(main);
			// one distal twig ~60% along the main fiber
			if (r() > 0.15) {
				const forkAt = 0.45 + r() * 0.25;
				const fork = fiberPoint(main.points, forkAt);
				const twigLen = len * (0.28 + r() * 0.22);
				const twig: Vec3[] = [fork];
				const twigYaw = yaw * (0.6 + r() * 0.8) * (r() > 0.5 ? 1 : -0.4);
				for (let k = 1; k <= 6; k++) {
					const t = k / 6;
					twig.push([
						fork[0] + side * twigLen * t * Math.cos(twigYaw) + gauss(r) * 0.006,
						fork[1] - t * t * 0.22 - t * 0.05,
						fork[2] + twigLen * t * 0.35 * Math.sin(twigYaw + 0.4) + gauss(r) * 0.005,
					]);
				}
				fibers.push({ id: id++, side, rootT, points: twig });
			}
		}
	}
	return fibers;
}

const NERVE_TREE = buildNerveTree(11);

export function getNerveTree(): NerveFiber[] {
	return NERVE_TREE;
}

export function sampleOnFiber(fiber: NerveFiber, along: number, r: () => number, jitter = 0.012): Vec3 {
	const p = fiberPoint(fiber.points, Math.max(0.04, Math.min(0.98, along)));
	return [
		p[0] + gauss(r) * jitter,
		p[1] + gauss(r) * jitter * 0.7,
		p[2] + gauss(r) * jitter,
	];
}

export type FiberHit = {
	fiber: NerveFiber;
	along: number;
	point: Vec3;
	dist: number;
};

/** Nearest point on the nerve tree to `p` (for synapse arcs that follow nervures). */
export function nearestFiberHit(p: Vec3): FiberHit {
	let best: FiberHit | null = null;
	for (const fiber of NERVE_TREE) {
		for (let i = 0; i <= 28; i++) {
			const along = i / 28;
			const point = fiberPoint(fiber.points, along);
			const d =
				(point[0] - p[0]) ** 2 +
				(point[1] - p[1]) ** 2 +
				(point[2] - p[2]) ** 2;
			if (!best || d < best.dist) {
				best = { fiber, along, point, dist: d };
			}
		}
	}
	return best!;
}

/**
 * Polyline along a fiber from `along` down to the spine root (aesthetic arc).
 * Order: distal → root.
 */
export function fiberPathToRoot(fiber: NerveFiber, along: number): Vec3[] {
	const a = Math.max(0.02, Math.min(0.98, along));
	const steps = Math.max(4, Math.ceil(a * 14));
	const out: Vec3[] = [];
	for (let i = steps; i >= 0; i--) {
		out.push(fiberPoint(fiber.points, (a * i) / steps));
	}
	return out;
}

/** Soft point clouds along nerve fibers — no strokes. */
export function nerveCloudPoints(count = 9000, seed = 13): Float32Array {
	const r = rng(seed);
	const fibers = NERVE_TREE;
	const out = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const f = fibers[Math.floor(r() * fibers.length)];
		// denser near the root (proximal), thinner toward tip
		const along = Math.pow(r(), 0.55);
		// Tight along the fiber — reads as nervures, not a torso fog cloud
		const puff = 0.01 + along * 0.035;
		out.set(sampleOnFiber(f, 0.05 + along * 0.9, r, puff), i * 3);
	}
	return out;
}

// Region API kept for outline / cerebellum fallback — samples thin fibers only
const nerves: Region = {
	name: "nerves",
	sample(u, r) {
		const fiber = NERVE_TREE[Math.floor(u[0] * NERVE_TREE.length) % NERVE_TREE.length];
		return sampleOnFiber(fiber, 0.08 + u[1] * 0.88, r, 0.01);
	},
};

// cortex: anatomical two-hemisphere brain (not a sphere colander).
// +Y up, +Z face/nose, X left-right. Notes snap onto this pool.
export const LOBES = ["frontal", "prefrontal", "parietal", "temporal", "occipital"] as const;

function lobeOf(x: number, y: number, z: number): string {
	const ax = Math.abs(x);
	// Temporal poles hang low on the sides
	if (y < 0.28 && ax > 0.22 && z > -0.35 && z < 0.55) return "temporal";
	if (z > 0.42 && y > 0.28) return "prefrontal";
	if (z > 0.08 && y > 0.32) return "frontal";
	if (z < -0.35) return "occipital";
	return "parietal";
}

export interface Pool { pts: Float32Array; lobe: string[]; }

/** Indices of cortex pool points labelled with a given lobe. */
export function indicesForLobe(pool: Pool, lobe: string): number[] {
	const out: number[] = [];
	for (let i = 0; i < pool.lobe.length; i++) {
		if (pool.lobe[i] === lobe) out.push(i);
	}
	return out;
}

/** Medial / underside cortex band — stand-in for limbic placement. */
export function indicesMedial(pool: Pool): number[] {
	const out: number[] = [];
	for (let i = 0; i < pool.lobe.length; i++) {
		const x = pool.pts[i * 3];
		const y = pool.pts[i * 3 + 1];
		if (Math.abs(x) < 0.18 && y < 0.48 && y > 0.18) out.push(i);
	}
	return out;
}

/** Light gyral displacement on a surface point (keeps silhouette readable). */
function gyriWarp(x: number, y: number, z: number): number {
	return (
		1 +
		0.045 * (gyri(x * 2.2, y * 2.2, z * 2.2) - 0.5) +
		0.025 * (gyri(x * 5.5, y * 5.5, z * 5.5) - 0.5)
	);
}

/**
 * Sample one point on the anatomical cortex.
 * Built from explicit lobe primitives so the silhouette reads as a brain
 * (two hemispheres + temporal hang), not a sphere colander.
 * @param maxInset 0 = pure surface shell; higher = fill toward centers (notes).
 */
function sampleCortexPoint(r: () => number, maxInset = 0.18): Vec3 {
	const side: -1 | 1 = r() < 0.5 ? -1 : 1;
	const roll = r();
	// Unit sphere direction
	const z0 = r() * 2 - 1;
	const th = r() * Math.PI * 2;
	const s0 = Math.sqrt(Math.max(0, 1 - z0 * z0));
	const ux = s0 * Math.cos(th);
	const uy = z0;
	const uz = s0 * Math.sin(th);
	const inset = Math.pow(r(), 2.8) * maxInset;
	const s = (1 - inset) * gyriWarp(ux + side, uy, uz);

	// --- Temporal lobe (~22%): distinct lateral "ear" hanging down ---
	if (roll < 0.22) {
		return [
			side * (0.4 + ux * 0.24 * s),
			0.2 + uy * 0.17 * s,
			0.06 + uz * 0.34 * s,
		];
	}

	// --- Occipital pole (~12%): rear bulge ---
	if (roll < 0.34) {
		return [
			side * (0.14 + ux * 0.28 * s),
			0.44 + uy * 0.26 * s,
			-0.48 + uz * 0.26 * s,
		];
	}

	// --- Prefrontal / frontal pole (~16%): forward ---
	if (roll < 0.5) {
		return [
			side * (0.16 + ux * 0.3 * s),
			0.5 + uy * 0.26 * s,
			0.42 + uz * 0.28 * s,
		];
	}

	// --- Main hemisphere dome (~50%): parietal / superior frontal ---
	// Centers offset from midline → clear longitudinal fissure from the front
	const cx = side * 0.26;
	const cy = 0.52;
	const cz = 0.02;
	// Prefer outer face of this hemisphere
	const ox = Math.abs(ux) * side;
	return [
		cx + ox * 0.4 * s + ux * 0.08 * s,
		cy + uy * 0.36 * s,
		cz + uz * 0.5 * s,
	];
}

/** True if (x,y,z) sits inside the cranial cortex volume. */
export function inCortex(x: number, y: number, z: number): boolean {
	const ax = Math.abs(x);
	if (ax < 0.055 && y > 0.32 && z > -0.45 && z < 0.55) return false; // fissure
	if (ax < 0.12 && y < 0.1) return false; // brainstem notch
	if (y < 0.02 || y > 0.95) return false;
	if (ax > 0.78) return false;
	if (z < -0.85 || z > 0.85) return false;
	// Rough containment: either main dome or temporal ear
	const side: -1 | 1 = x < 0 ? -1 : 1;
	const mx = (x - side * 0.26) / 0.42;
	const my = (y - 0.52) / 0.38;
	const mz = (z - 0.02) / 0.55;
	const main = mx * mx + my * my + mz * mz;
	const tx = (x - side * 0.4) / 0.28;
	const ty = (y - 0.2) / 0.2;
	const tz = (z - 0.06) / 0.38;
	const temporal = tx * tx + ty * ty + tz * tz;
	return main <= 1.05 || temporal <= 1.05;
}

/**
 * Anatomical cortex point cloud: two hemispheres, fissure, temporal lobes,
 * surface-biased shell with light gyri — reads as a brain, not a colander.
 */
export function cortexPool(count: number, seed = 3, maxInset = 0.16): Pool {
	const r = rng(seed);
	const pts = new Float32Array(count * 3);
	const lobe: string[] = [];
	let i = 0;
	let guard = 0;
	while (i < count && guard++ < count * 60) {
		const [x, y, z] = sampleCortexPoint(r, maxInset);
		if (!inCortex(x, y, z)) continue;
		// Reinforce midline cleft on the crown
		if (Math.abs(x) < 0.055 && y > 0.38) continue;
		pts[i * 3] = x;
		pts[i * 3 + 1] = y;
		pts[i * 3 + 2] = z;
		lobe.push(lobeOf(x, y, z));
		i++;
	}
	const filled = Math.max(1, i);
	while (i < count) {
		const j = (i % filled) * 3;
		pts[i * 3] = pts[j] + (r() - 0.5) * 0.015;
		pts[i * 3 + 1] = pts[j + 1] + (r() - 0.5) * 0.015;
		pts[i * 3 + 2] = pts[j + 2] + (r() - 0.5) * 0.015;
		lobe.push(lobeOf(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
		i++;
	}
	return { pts, lobe };
}

/** Dense surface-only shell for the anatomy backdrop (no volume fill). */
export function cortexSurface(count: number, seed = 9): Float32Array {
	return cortexPool(count, seed, 0.04).pts;
}

// split pool indices into contiguous chunks along a Morton curve, sized by weight,
// so each group gets one compact patch of cortex
export function partitionPool(pts: Float32Array, weights: number[]): number[][] {
	const n = pts.length / 3;
	const keys = new Array<[number, number]>(n);
	const spread = (v: number) => {
		let x = v & 0x3ff;
		x = (x | (x << 16)) & 0x30000ff; x = (x | (x << 8)) & 0x300f00f;
		x = (x | (x << 4)) & 0x30c30c3; x = (x | (x << 2)) & 0x9249249;
		return x;
	};
	for (let i = 0; i < n; i++) {
		// hemisphere first so patches do not straddle the fissure
		const side = pts[i * 3] < 0 ? 0 : 1;
		const qx = Math.floor((Math.abs(pts[i * 3]) / 0.7) * 1023);
		const qy = Math.floor(((pts[i * 3 + 1] + 0.5) / 1.4) * 1023);
		const qz = Math.floor(((pts[i * 3 + 2] + 1) / 2) * 1023);
		keys[i] = [side * 2 ** 34 + spread(qz) * 4 + spread(qy) * 2 + spread(qx), i];
	}
	keys.sort((a, b) => a[0] - b[0]);
	const total = weights.reduce((a, b) => a + b, 0) || 1;
	const out: number[][] = [];
	let at = 0;
	weights.forEach((w, gi) => {
		const take = gi === weights.length - 1 ? n - at : Math.round((w / total) * n);
		out.push(keys.slice(at, at + take).map(k => k[1]));
		at += take;
	});
	return out;
}

// uniform grid for nearest-free-point lookup
export class Snapper {
	private cells = new Map<string, number[]>();
	private used: Uint8Array;
	min: Vec3 = [Infinity, Infinity, Infinity];
	max: Vec3 = [-Infinity, -Infinity, -Infinity];
	constructor(private pts: Float32Array, private idx: number[], private cell = 0.035) {
		this.used = new Uint8Array(pts.length / 3);
		for (const i of idx) {
			const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
			for (let a = 0; a < 3; a++) { this.min[a] = Math.min(this.min[a], pts[i * 3 + a]); this.max[a] = Math.max(this.max[a], pts[i * 3 + a]); }
			const k = this.key(x, y, z);
			let c = this.cells.get(k);
			if (!c) this.cells.set(k, c = []);
			c.push(i);
		}
	}
	get size() { return this.idx.length; }
	private key(x: number, y: number, z: number) {
		return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`;
	}
	// nearest unused pool point to (x,y,z); reuses points once the pool runs dry
	take(x: number, y: number, z: number): Vec3 {
		const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
		for (let ring = 0; ring < 40; ring++) {
			let best = -1, bestD = Infinity;
			for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) for (let c = -ring; c <= ring; c++) {
				if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== ring) continue;
				const list = this.cells.get(`${cx + a},${cy + b},${cz + c}`);
				if (!list) continue;
				for (const i of list) {
					if (this.used[i]) continue;
					const d = (this.pts[i * 3] - x) ** 2 + (this.pts[i * 3 + 1] - y) ** 2 + (this.pts[i * 3 + 2] - z) ** 2;
					if (d < bestD) { bestD = d; best = i; }
				}
			}
			if (best >= 0) {
				this.used[best] = 1;
				return [this.pts[best * 3], this.pts[best * 3 + 1], this.pts[best * 3 + 2]];
			}
		}
		this.used.fill(0); // exhausted: allow reuse
		const i = this.idx[Math.floor(Math.random() * this.idx.length)];
		return [this.pts[i * 3] + (Math.random() - 0.5) * 0.02, this.pts[i * 3 + 1] + (Math.random() - 0.5) * 0.02, this.pts[i * 3 + 2] + (Math.random() - 0.5) * 0.02];
	}
	// map a unit-cube coordinate into this region's bounding box
	at(u: Vec3): Vec3 {
		return [0, 1, 2].map(a => this.min[a] + u[a] * (this.max[a] - this.min[a])) as Vec3;
	}
}

export const REGIONS: Region[] = [cerebellum, brainstem, spine, nerves];

export function regionByName(n: string) {
	return REGIONS.find(r => r.name === n)!;
}

// Sparse silhouette: cortex + vertebrae discs + nerve point-clouds (no strokes).
export function outlinePoints(count: number, seed = 7): Float32Array {
	const cortexN = Math.floor(count * 0.55);
	const nerveN = Math.floor(count * 0.28);
	const vertN = count - cortexN - nerveN;
	const cortex = cortexPool(cortexN, seed + 1).pts;
	const nerves = nerveCloudPoints(nerveN, seed + 3);
	const verts = vertebraCloud(Math.max(200, vertN), seed + 5);
	const out = new Float32Array(count * 3);
	out.set(cortex, 0);
	out.set(nerves, cortexN * 3);
	out.set(verts, (cortexN + nerveN) * 3);
	return out;
}

// sphere layout: one ball per group arranged on a ring-ish spiral
// sphere layout: biggest group in the middle, the rest on a sunflower spiral
export function sphereCenter(i: number, _n: number): Vec3 {
	if (i === 0) return [0, 0, 0];
	const golden = Math.PI * (3 - Math.sqrt(5));
	const r = 0.75 + 0.62 * Math.sqrt(i);
	const th = golden * i;
	return [Math.cos(th) * r, Math.sin(th) * r * 0.8, (i % 2 ? 0.25 : -0.25)];
}

export function spherePoint(center: Vec3, radius: number, u: Vec3, r: () => number): Vec3 {
	const x = u[0] * 2 - 1, y = u[1] * 2 - 1, z = u[2] * 2 - 1;
	const sx = x * Math.sqrt(1 - y * y / 2 - z * z / 2 + y * y * z * z / 3);
	const sy = y * Math.sqrt(1 - z * z / 2 - x * x / 2 + z * z * x * x / 3);
	const sz = z * Math.sqrt(1 - x * x / 2 - y * y / 2 + x * x * y * y / 3);
	const j = 0.04 * radius;
	return [center[0] + sx * radius + (r() - 0.5) * j, center[1] + sy * radius + (r() - 0.5) * j, center[2] + sz * radius + (r() - 0.5) * j];
}
