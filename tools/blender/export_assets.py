"""Blender asset generation for Zombie Survival.

Run headless from the repository root:

    blender --background --python tools/blender/export_assets.py

Writes GLB files into assets/models/. The game currently builds its geometry
procedurally in TypeScript; these exports are the upgrade path for replacing
individual pieces without touching gameplay code.
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "models")
OUT_DIR = os.path.normpath(OUT_DIR)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, base_color, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
    return mat


def shade_smooth(obj, angle_deg=35.0):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    mod = obj.modifiers.new("Smooth", "EDGE_SPLIT")
    mod.split_angle = math.radians(angle_deg)


def displace_verts(obj, strength, seed):
    """Push vertices along their normals with value noise for organic shapes."""
    import random

    rng = random.Random(seed)
    mesh = obj.data
    for v in mesh.vertices:
        n = v.normal
        f = 1.0 + (rng.random() - 0.5) * strength
        v.co = Vector((v.co.x * f, v.co.y * f, v.co.z * f))
    mesh.update()


def export_glb(objects, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
    )
    print("exported", path)


def build_conifer(seed=1):
    reset_scene()
    bark = make_material("Bark", (0.30, 0.21, 0.14), roughness=0.92)
    needles = make_material("Needles", (0.16, 0.29, 0.12), roughness=0.78)

    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.22, depth=7.0, location=(0, 0, 3.5))
    trunk = bpy.context.active_object
    trunk.name = "Trunk"
    trunk.data.materials.append(bark)
    displace_verts(trunk, 0.12, seed)

    tiers = []
    for i in range(5):
        t = i / 4.0
        radius = 2.6 * (1.0 - t * 0.7)
        height = 3.2 * (1.0 - t * 0.3)
        z = 3.6 + i * 1.5
        bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=radius, depth=height, location=(0, 0, z))
        tier = bpy.context.active_object
        tier.name = f"Needles{i}"
        tier.data.materials.append(needles)
        displace_verts(tier, 0.18, seed + i)
        shade_smooth(tier, 50)
        tiers.append(tier)

    export_glb([trunk] + tiers, "tree_conifer.glb")


def build_broadleaf(seed=2):
    reset_scene()
    bark = make_material("Bark", (0.33, 0.24, 0.16), roughness=0.9)
    leaves = make_material("Leaves", (0.24, 0.36, 0.14), roughness=0.72)

    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.26, depth=5.4, location=(0, 0, 2.7))
    trunk = bpy.context.active_object
    trunk.name = "Trunk"
    trunk.data.materials.append(bark)
    displace_verts(trunk, 0.14, seed)

    blobs = []
    for i, (x, y, z, r) in enumerate(
        [(0, 0, 6.4, 2.9), (1.5, 0.6, 5.6, 2.1), (-1.4, -0.8, 5.8, 2.0), (0.3, -1.1, 7.4, 1.8)]
    ):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
        blob = bpy.context.active_object
        blob.name = f"Canopy{i}"
        blob.scale = (1.0, 1.0, 0.82)
        blob.data.materials.append(leaves)
        displace_verts(blob, 0.3, seed + i * 13)
        shade_smooth(blob, 45)
        blobs.append(blob)

    export_glb([trunk] + blobs, "tree_broadleaf.glb")


def build_rock(seed=3):
    reset_scene()
    stone = make_material("Stone", (0.42, 0.42, 0.40), roughness=0.88)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0, 0, 0))
    rock = bpy.context.active_object
    rock.name = "Rock"
    rock.scale = (1.0, 0.9, 0.7)
    rock.data.materials.append(stone)
    displace_verts(rock, 0.55, seed)
    bpy.context.view_layer.objects.active = rock
    bpy.ops.object.shade_flat()
    export_glb([rock], "rock.glb")


def build_bush(seed=4):
    reset_scene()
    foliage = make_material("Foliage", (0.21, 0.33, 0.13), roughness=0.8)
    parts = []
    for i, (x, y, z, r) in enumerate(
        [(0, 0, 0.5, 0.62), (0.4, 0.2, 0.42, 0.5), (-0.35, 0.25, 0.45, 0.48), (0.05, -0.4, 0.4, 0.45)]
    ):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, z))
        b = bpy.context.active_object
        b.name = f"Bush{i}"
        b.scale = (1.2, 1.2, 0.85)
        b.data.materials.append(foliage)
        displace_verts(b, 0.35, seed + i * 7)
        shade_smooth(b, 55)
        parts.append(b)
    export_glb(parts, "bush.glb")


def build_barrel():
    reset_scene()
    rust = make_material("Rust", (0.34, 0.20, 0.12), roughness=0.78, metallic=0.4)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.29, depth=0.88, location=(0, 0, 0.44))
    body = bpy.context.active_object
    body.name = "Barrel"
    body.data.materials.append(rust)
    shade_smooth(body, 40)

    rings = []
    for i, z in enumerate([0.62, 0.26]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.295, minor_radius=0.022, major_segments=16, minor_segments=6,
            location=(0, 0, z),
        )
        ring = bpy.context.active_object
        ring.name = f"Ring{i}"
        ring.data.materials.append(rust)
        rings.append(ring)

    export_glb([body] + rings, "barrel.glb")


def build_zombie():
    """A blocked-out humanoid matching the proportions the game animates."""
    reset_scene()
    skin = make_material("Skin", (0.42, 0.47, 0.30), roughness=0.76)
    cloth = make_material("Cloth", (0.24, 0.22, 0.18), roughness=0.94)

    parts = []

    def box(name, size, loc, mat):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
        o = bpy.context.active_object
        o.name = name
        o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
        o.data.materials.append(mat)
        parts.append(o)
        return o

    def cyl(name, radius, depth, loc, mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=depth, location=loc)
        o = bpy.context.active_object
        o.name = name
        o.data.materials.append(mat)
        shade_smooth(o, 45)
        parts.append(o)
        return o

    box("Hips", (0.36, 0.24, 0.20), (0, 0, 0.94), cloth)
    box("Torso", (0.46, 0.26, 0.52), (0, 0, 1.32), cloth)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.125, location=(0, 0, 1.72))
    head = bpy.context.active_object
    head.name = "Head"
    head.scale = (0.94, 1.02, 1.08)
    head.data.materials.append(skin)
    shade_smooth(head, 50)
    parts.append(head)

    for side, sx in (("L", -1), ("R", 1)):
        cyl(f"UpperArm{side}", 0.07, 0.30, (sx * 0.245, 0, 1.42), cloth)
        cyl(f"Forearm{side}", 0.055, 0.30, (sx * 0.245, 0, 1.12), skin)
        cyl(f"Thigh{side}", 0.09, 0.42, (sx * 0.105, 0, 0.70), cloth)
        cyl(f"Shin{side}", 0.07, 0.42, (sx * 0.105, 0, 0.28), cloth)
        box(f"Foot{side}", (0.11, 0.22, 0.06), (sx * 0.105, -0.045, 0.04), cloth)

    export_glb(parts, "zombie_base.glb")


BUILDERS = {
    "tree_conifer": build_conifer,
    "tree_broadleaf": build_broadleaf,
    "rock": build_rock,
    "bush": build_bush,
    "barrel": build_barrel,
    "zombie": build_zombie,
}


def main():
    argv = sys.argv
    wanted = []
    if "--" in argv:
        wanted = argv[argv.index("--") + 1 :]
    targets = wanted if wanted else list(BUILDERS.keys())

    for name in targets:
        builder = BUILDERS.get(name)
        if not builder:
            print(f"unknown asset '{name}'; known: {', '.join(BUILDERS)}")
            continue
        print(f"--- building {name} ---")
        builder()

    print("done. output:", OUT_DIR)


if __name__ == "__main__":
    main()
