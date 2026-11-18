"""
Headless Blender: import Grab3D brain GLB, orient anatomically, decimate, export.

Scene frame (after glTF load in Three.js, Y-up):
  +Y = superior (crown up), brainstem toward -Y
  +Z = anterior (face / frontal)
  +X = right

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/prepare_brain_mesh.py
"""
from __future__ import annotations

import base64
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "brain-raw.glb"
OUT = ROOT / "public" / "models" / "brain.glb"
TARGET_TRIS = 70_000
TARGET_WIDTH = 1.15  # left-right span in scene units


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.images):
        bpy.data.images.remove(block)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def triangle_count() -> int:
    total = 0
    for o in mesh_objects():
        me = o.data
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
    return total


def join_meshes() -> bpy.types.Object:
    meshes = mesh_objects()
    if not meshes:
        raise RuntimeError("No mesh after GLB import")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def apply_all_transforms(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def world_bbox(obj: bpy.types.Object):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [v.x for v in corners]
    ys = [v.y for v in corners]
    zs = [v.z for v in corners]
    return (
        (min(xs), min(ys), min(zs)),
        (max(xs), max(ys), max(zs)),
    )


def axis_span(mn, mx, axis: int) -> float:
    return mx[axis] - mn[axis]


def slice_radius(obj: bpy.types.Object, axis: int, t: float, band=0.04) -> float:
    """Mean radial extent in a thin slab along axis at normalized t∈[0,1]."""
    me = obj.data
    mn, mx = world_bbox(obj)
    lo = mn[axis] + (mx[axis] - mn[axis]) * (t - band)
    hi = mn[axis] + (mx[axis] - mn[axis]) * (t + band)
    # center of other two axes
    c = [(mn[i] + mx[i]) * 0.5 for i in range(3)]
    rads = []
    for v in me.vertices:
        w = obj.matrix_world @ v.co
        if w[axis] < lo or w[axis] > hi:
            continue
        d2 = 0.0
        for i in range(3):
            if i == axis:
                continue
            d2 += (w[i] - c[i]) ** 2
        rads.append(math.sqrt(d2))
    if not rads:
        return 0.0
    rads.sort()
    return rads[len(rads) // 2]


def normalize_orientation(obj: bpy.types.Object) -> None:
    """
    Anatomical rest pose in Blender Y-up (will become Three Y-up via glTF):
      Y = superior-inferior (SHORTEST) — crown +Y, brainstem -Y
      Z = anterior-posterior (LONGEST) — face +Z
      X = left-right
    """
    apply_all_transforms(obj)

    # Center at origin first
    mn, mx = world_bbox(obj)
    c = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    obj.location -= c
    apply_all_transforms(obj)

    mn, mx = world_bbox(obj)
    spans = [
        (axis_span(mn, mx, 0), 0, "X"),
        (axis_span(mn, mx, 1), 1, "Y"),
        (axis_span(mn, mx, 2), 2, "Z"),
    ]
    spans.sort(reverse=True)
    # longest → AP (world Z), mid → LR (world X), shortest → SI (world Y)
    long_ax = spans[0][1]
    mid_ax = spans[1][1]
    short_ax = spans[2][1]
    print(f"axes spans: long={spans[0][2]} mid={spans[1][2]} short={spans[2][2]}")

    # Build rotation that maps short→Y, mid→X, long→Z
    # Start from identity basis; permute axes via rotations
    # Map short_ax → Y (1), mid_ax → X (0), long_ax → Z (2)
    def basis_from_perm(sx, mx_, lx):
        # columns are where X,Y,Z unit vectors go
        m = Matrix.Identity(3)
        # We want: input axis sx becomes output Y, etc.
        # output = R * input. Column i of R is image of unit axis i.
        # Unit e_sx should map to e_y = (0,1,0)
        R = Matrix.Identity(3)
        R.zero()
        # image of mid (LR) → +X
        R[0][mx_] = 1.0
        # image of short (SI) → +Y
        R[1][sx] = 1.0
        # image of long (AP) → +Z
        R[2][lx] = 1.0
        # ensure right-handed
        if R.determinant() < 0:
            R[0][mx_] = -1.0
        return R.to_4x4()

    R = basis_from_perm(short_ax, mid_ax, long_ax)
    obj.matrix_world = R @ obj.matrix_world
    apply_all_transforms(obj)

    # Brainstem = narrower end along Y → put at bottom (-Y)
    r_lo = slice_radius(obj, 1, 0.08)
    r_hi = slice_radius(obj, 1, 0.92)
    print(f"Y-end radii: lo={r_lo:.3f} hi={r_hi:.3f}")
    if r_hi < r_lo:
        # crown currently at -Y — flip 180 around X
        obj.rotation_euler[0] = math.pi
        apply_all_transforms(obj)

    # Face +Z: fuller / more bilateral end of Z as anterior is hard;
    # Grab3D brainstem hangs slightly posterior — prefer the Z end nearer the
    # brainstem (low Y) as posterior (-Z). Measure centroid Z of low-Y verts.
    me = obj.data
    mn, mx = world_bbox(obj)
    y_cut = mn[1] + (mx[1] - mn[1]) * 0.2
    zs = []
    for v in me.vertices:
        w = obj.matrix_world @ v.co
        if w.y <= y_cut:
            zs.append(w.z)
    if zs:
        z_stem = sum(zs) / len(zs)
        z_mid = (mn[2] + mx[2]) / 2
        print(f"brainstem mean Z={z_stem:.3f} midZ={z_mid:.3f}")
        if z_stem > z_mid:
            # brainstem on +Z — rotate 180 around Y so it goes to -Z (posterior)
            obj.rotation_euler[1] = math.pi
            apply_all_transforms(obj)

    # Scale: left-right ≈ TARGET_WIDTH
    mn, mx = world_bbox(obj)
    sx = mx[0] - mn[0]
    if sx < 1e-6:
        raise RuntimeError("Degenerate bbox")
    scale = TARGET_WIDTH / sx
    obj.scale = (scale, scale, scale)
    apply_all_transforms(obj)

    # Sit brainstem just above y=0, center XZ
    mn, mx = world_bbox(obj)
    cx = (mn[0] + mx[0]) / 2
    cz = (mn[2] + mx[2]) / 2
    obj.location = (-cx, -mn[1] + 0.06, -cz)
    apply_all_transforms(obj)

    mn, mx = world_bbox(obj)
    print(
        "anatomical bbox (Blender Y-up)",
        f"X[{mn[0]:.2f},{mx[0]:.2f}] Y[{mn[1]:.2f},{mx[1]:.2f}] Z[{mn[2]:.2f},{mx[2]:.2f}]",
        f"size=({mx[0]-mn[0]:.2f},{mx[1]-mn[1]:.2f},{mx[2]-mn[2]:.2f})",
    )

    # Counter the Blender→glTF remap (bx,by,bz)→(bx,bz,-by) so Three.js Y stays superior.
    # rot X +90°: (x,y,z)→(x,-z,y); then glTF yields (x,y,z) anatomical again.
    obj.rotation_euler[0] = math.pi / 2
    apply_all_transforms(obj)
    mn, mx = world_bbox(obj)
    print(
        "pre-export (compensated)",
        f"size=({mx[0]-mn[0]:.2f},{mx[1]-mn[1]:.2f},{mx[2]-mn[2]:.2f})",
    )


def decimate(obj: bpy.types.Object, target_tris: int) -> None:
    current = triangle_count()
    if current <= target_tris:
        print(f"Already {current} tris, skip decimate")
        return
    ratio = max(0.05, min(1.0, target_tris / current))
    mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
    mod.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print(f"Decimated {current} -> {triangle_count()} tris (ratio={ratio:.3f})")


def style_material(obj: bpy.types.Object) -> None:
    # Keep imported materials if present; only ensure blend for transparency in app
    if obj.data.materials:
        return
    mat = bpy.data.materials.new(name="BrainShell")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.75, 0.62, 0.58, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.append(mat)


def export_surface_from_glb(glb_path: Path, out_bin: Path, max_points: int = 20000) -> None:
    """
    Sample POSITIONS from the exported GLB binary (Three.js / glTF frame).
    Do NOT re-import in Blender — that re-applies axis conversion and desyncs notes.
    """
    import json as json_mod

    data = glb_path.read_bytes()
    if data[0:4] != b"glTF":
        raise RuntimeError("Not a GLB")
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    meta = json_mod.loads(data[json_start : json_start + json_len])
    json_pad = (4 - (json_len % 4)) % 4
    bin_off = json_start + json_len + json_pad + 8  # skip chunk len+type
    prim = meta["meshes"][0]["primitives"][0]
    acc = meta["accessors"][prim["attributes"]["POSITION"]]
    view = meta["bufferViews"][acc["bufferView"]]
    base = (view.get("byteOffset") or 0) + (acc.get("byteOffset") or 0)
    count = acc["count"]
    pts: list[tuple[float, float, float]] = []
    for i in range(count):
        o = bin_off + base + i * 12
        x, y, z = struct.unpack_from("<fff", data, o)
        pts.append((x, y, z))
    if len(pts) > max_points:
        step = len(pts) / max_points
        pts = [pts[int(i * step)] for i in range(max_points)]
    out_bin.parent.mkdir(parents=True, exist_ok=True)
    with out_bin.open("wb") as f:
        f.write(struct.pack("<I", len(pts)))
        for x, y, z in pts:
            f.write(struct.pack("<fff", x, y, z))
    mn = [min(p[i] for p in pts) for i in range(3)]
    mx = [max(p[i] for p in pts) for i in range(3)]
    print(f"surface glTF bbox: {mn} .. {mx} size={[mx[i]-mn[i] for i in range(3)]} n={len(pts)}")


def main() -> None:
    if not SRC.exists():
        print(f"Missing source: {SRC}", file=sys.stderr)
        sys.exit(1)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    obj = join_meshes()
    normalize_orientation(obj)
    decimate(obj, TARGET_TRIS)
    style_material(obj)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    surf = ROOT / "public" / "models" / "brain-surface.bin"
    # Sample from exported GLB (= Three.js / glTF frame)
    export_surface_from_glb(OUT, surf)
    b64 = base64.b64encode(surf.read_bytes()).decode("ascii")
    gen = ROOT / "src" / "lib" / "brainSurfaceGenerated.ts"
    gen.write_text(
        "/* Auto-generated from public/models/brain-surface.bin — do not edit */\n"
        f'export const BRAIN_SURFACE_B64 = "{b64}";\n',
        encoding="utf-8",
    )
    print(f"Wrote {gen}")
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT} ({size_mb:.2f} MB, {triangle_count()} tris)")


if __name__ == "__main__":
    main()
