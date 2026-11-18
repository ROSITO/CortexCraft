/**
 * Mesh-backed cortex pool from Grab3D CC0 brain surface samples.
 *
 * Orientation is derived from the mesh itself:
 *   1. Find the narrow brainstem tip (smallest cross-section slab)
 *   2. Rotate so tip direction = −Y
 *   3. Translate tip to (0, STEM_Y, 0) — rachis docks here
 *
 * Used as a point-cloud silhouette + note snap pool (no fleshy GLB shell).
 */
import * as THREE from "three";
import type { Pool } from "./anatomy";
import { BRAIN_SURFACE_B64 } from "./brainSurfaceGenerated";

export const STEM_Y = 0.08;

/**
 * Raw → anatomical (x,y,z,w).
 * Stem −Y, yaw +90° (face +Z), pitch −20° (vers le bas).
 */
export const BRAIN_MESH_QUAT: [number, number, number, number] = [
  0.49625353, 0.50099951, 0.50289508, 0.49982843,
];

/** After quat: inferior/foramen mass on rachis axis, bottom at STEM_Y. */
export const BRAIN_MESH_OFFSET: [number, number, number] = [
  0.560826, 0.659458, -0.149757,
];

const _q = new THREE.Quaternion(
  BRAIN_MESH_QUAT[0],
  BRAIN_MESH_QUAT[1],
  BRAIN_MESH_QUAT[2],
  BRAIN_MESH_QUAT[3]
);
const _o = new THREE.Vector3(...BRAIN_MESH_OFFSET);
const _v = new THREE.Vector3();

export function gltfToAnatomical(gx: number, gy: number, gz: number): [number, number, number] {
  _v.set(gx, gy, gz).applyQuaternion(_q).add(_o);
  return [_v.x, _v.y, _v.z];
}

function lobeOfMesh(x: number, y: number, z: number): string {
  const ax = Math.abs(x);
  if (y < 0.42 && ax > 0.28 && z > -0.2) return "temporal";
  if (z > 0.28 && y > 0.35) return "prefrontal";
  if (z > 0.02 && y > 0.4) return "frontal";
  if (z < -0.28) return "occipital";
  return "parietal";
}

function parseSurfaceBin(buf: ArrayBuffer): Pool {
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const pts = new Float32Array(n * 3);
  const lobe: string[] = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 12;
    const [x, y, z] = gltfToAnatomical(
      view.getFloat32(o, true),
      view.getFloat32(o + 4, true),
      view.getFloat32(o + 8, true)
    );
    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = z;
    lobe.push(lobeOfMesh(x, y, z));
  }
  return { pts, lobe };
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const cached: Pool = parseSurfaceBin(b64ToBuf(BRAIN_SURFACE_B64));

export function getMeshCortexPool(): Pool {
  return cached;
}

export function loadMeshCortexPool(): Promise<Pool> {
  return Promise.resolve(cached);
}

export const BRAIN_MESH_CENTER: [number, number, number] = (() => {
  const { pts } = cached;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
    minZ = Math.min(minZ, pts[i + 2]);
    maxZ = Math.max(maxZ, pts[i + 2]);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
})();
