"""Blender asset generation for Zombie Survival.

Run headless from the repository root:

    blender --background --python tools/blender/export_assets.py

Writes GLB files into assets/models/. The game currently builds its geometry
procedurally in TypeScript; these exports are the upgrade path for replacing
individual pieces without touching gameplay code.
"""

import math
import os
import random
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


def export_glb(objects, filename, animations=False):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=not animations,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
    )
    if animations:
        kwargs.update(
            export_animations=True,
            export_nla_strips=False,
            export_anim_single_armature=True,
            export_skins=True,
            export_all_influences=False,
        )
    bpy.ops.export_scene.gltf(**kwargs)
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


ZOMBIE_DECIMATE = 0.34

ZOMBIE_VARIANTS = {
    "walker": {
        "height": 1.82,
        "shoulder": 0.215,
        "chest": 0.152,
        "waist": 0.132,
        "hip": 0.150,
        "arm": 0.052,
        "forearm": 0.044,
        "thigh": 0.082,
        "shin": 0.060,
        "neck": 0.049,
        "head": 0.107,
        "hunch": 0.20,
        "belly": 1.0,
        "skin": (0.455, 0.487, 0.352),
        "cloth": (0.212, 0.204, 0.170),
        "tatter": 0.85,
        "wounds": 5,
    },
    "runner": {
        "height": 1.74,
        "shoulder": 0.188,
        "chest": 0.126,
        "waist": 0.107,
        "hip": 0.126,
        "arm": 0.040,
        "forearm": 0.034,
        "thigh": 0.068,
        "shin": 0.050,
        "neck": 0.042,
        "head": 0.100,
        "hunch": 0.34,
        "belly": 0.80,
        "skin": (0.512, 0.463, 0.328),
        "cloth": (0.180, 0.157, 0.135),
        "tatter": 1.25,
        "wounds": 7,
    },
    "brute": {
        "height": 2.06,
        "shoulder": 0.292,
        "chest": 0.212,
        "waist": 0.196,
        "hip": 0.206,
        "arm": 0.079,
        "forearm": 0.066,
        "thigh": 0.116,
        "shin": 0.086,
        "neck": 0.078,
        "head": 0.118,
        "hunch": 0.12,
        "belly": 1.32,
        "skin": (0.382, 0.428, 0.318),
        "cloth": (0.165, 0.180, 0.152),
        "tatter": 0.55,
        "wounds": 9,
    },
}

ZOMBIE_BONES = [
    ("hips", None, (0.0, 0.0, 0.530), (0.0, 0.0, 0.620)),
    ("spine", "hips", (0.0, 0.0, 0.620), (0.0, 0.0, 0.735)),
    ("chest", "spine", (0.0, 0.0, 0.735), (0.0, 0.0, 0.842)),
    ("neck", "chest", (0.0, 0.0, 0.842), (0.0, 0.0, 0.898)),
    ("head", "neck", (0.0, 0.0, 0.898), (0.0, 0.0, 0.988)),
    ("shoulder.L", "chest", (0.0, 0.0, 0.826), (-0.074, 0.0, 0.826)),
    ("upperarm.L", "shoulder.L", (-0.074, 0.0, 0.826), (-0.074, 0.0, 0.660)),
    ("forearm.L", "upperarm.L", (-0.074, 0.0, 0.660), (-0.074, 0.0, 0.512)),
    ("hand.L", "forearm.L", (-0.074, 0.0, 0.512), (-0.074, 0.0, 0.448)),
    ("shoulder.R", "chest", (0.0, 0.0, 0.826), (0.074, 0.0, 0.826)),
    ("upperarm.R", "shoulder.R", (0.074, 0.0, 0.826), (0.074, 0.0, 0.660)),
    ("forearm.R", "upperarm.R", (0.074, 0.0, 0.660), (0.074, 0.0, 0.512)),
    ("hand.R", "forearm.R", (0.074, 0.0, 0.512), (0.074, 0.0, 0.448)),
    ("thigh.L", "hips", (-0.041, 0.0, 0.520), (-0.041, 0.0, 0.286)),
    ("shin.L", "thigh.L", (-0.041, 0.0, 0.286), (-0.041, 0.0, 0.055)),
    ("foot.L", "shin.L", (-0.041, 0.0, 0.055), (-0.041, -0.072, 0.012)),
    ("thigh.R", "hips", (0.041, 0.0, 0.520), (0.041, 0.0, 0.286)),
    ("shin.R", "thigh.R", (0.041, 0.0, 0.286), (0.041, 0.0, 0.055)),
    ("foot.R", "shin.R", (0.041, 0.0, 0.055), (0.041, -0.072, 0.012)),
]


def _ring(bm, center, radius_x, radius_y, segments, z_axis=True, squash=None):
    import bmesh as _bm

    verts = []
    for i in range(segments):
        a = (i / segments) * math.tau
        cx = math.cos(a) * radius_x
        cy = math.sin(a) * radius_y
        if squash:
            cy *= squash(a)
        if z_axis:
            v = bm.verts.new((center[0] + cx, center[1] + cy, center[2]))
        else:
            v = bm.verts.new((center[0] + cx, center[1], center[2] + cy))
        verts.append(v)
    return verts


def _bridge(bm, ring_a, ring_b):
    n = len(ring_a)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ring_a[i], ring_a[j], ring_b[j], ring_b[i]))


def _cap(bm, ring, center):
    hub = bm.verts.new(center)
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ring[i], ring[j], hub))
    return hub


def _loft(bm, profiles, segments, squash=None):
    rings = []
    for (cx, cy, cz, rx, ry) in profiles:
        rings.append(_ring(bm, (cx, cy, cz), rx, ry, segments, squash=squash))
    for i in range(len(rings) - 1):
        _bridge(bm, rings[i], rings[i + 1])
    return rings


def _limb(bm, top, bottom, r_top, r_bottom, segments, bulge=1.15):
    ax, ay, az = top
    bx, by, bz = bottom
    profiles = []
    steps = 4
    for i in range(steps + 1):
        t = i / steps
        cx = ax + (bx - ax) * t
        cy = ay + (by - ay) * t
        cz = az + (bz - az) * t
        r = r_top + (r_bottom - r_top) * t
        m = 1.0 + (bulge - 1.0) * math.sin(t * math.pi)
        profiles.append((cx, cy, cz, r * m, r * m * 0.94))
    rings = _loft(bm, profiles, segments)
    _cap(bm, list(reversed(rings[0])), (ax, ay, az + r_top * 0.5))
    _cap(bm, rings[-1], (bx, by, bz - r_bottom * 0.6))
    return rings


def build_zombie_variant(name, spec):
    reset_scene()
    rng = random.Random(hash(name) & 0xFFFF)

    h = spec["height"]
    seg = 10

    bm = bmesh.new()

    hip_z = 0.520 * h
    waist_z = 0.620 * h
    chest_z = 0.760 * h
    shoulder_z = 0.842 * h
    neck_z = 0.895 * h

    hunch = spec["hunch"]
    belly = spec["belly"]

    torso_profiles = [
        (0.0, 0.010 * h, hip_z - 0.055 * h, spec["hip"] * 0.92, spec["hip"] * 0.70),
        (0.0, 0.006 * h, hip_z, spec["hip"], spec["hip"] * 0.76),
        (0.0, 0.004 * h * belly, waist_z, spec["waist"] * belly, spec["waist"] * 0.78 * belly),
        (0.0, -0.012 * h * hunch, chest_z, spec["chest"], spec["chest"] * 0.72),
        (0.0, -0.022 * h * hunch, shoulder_z, spec["shoulder"], spec["shoulder"] * 0.60),
        (0.0, -0.026 * h * hunch, shoulder_z + 0.022 * h, spec["shoulder"] * 0.66, spec["shoulder"] * 0.46),
    ]

    def torso_squash(a):
        return 1.0 - 0.16 * max(0.0, math.cos(a))

    torso_rings = _loft(bm, torso_profiles, seg, squash=torso_squash)
    _cap(bm, list(reversed(torso_rings[0])), (0.0, 0.010 * h, hip_z - 0.085 * h))

    neck_rings = _loft(
        bm,
        [
            (0.0, -0.026 * h * hunch, shoulder_z + 0.020 * h, spec["neck"] * 1.25, spec["neck"] * 1.1),
            (0.0, -0.030 * h * hunch, neck_z, spec["neck"], spec["neck"]),
        ],
        seg,
    )

    hz = spec["head"]
    head_cz = neck_z + hz * 0.92
    head_y = -0.034 * h * hunch
    head_profiles = [
        (0.0, head_y, neck_z + hz * 0.10, hz * 0.62, hz * 0.66),
        (0.0, head_y - hz * 0.06, neck_z + hz * 0.42, hz * 0.80, hz * 0.92),
        (0.0, head_y - hz * 0.07, head_cz, hz * 0.94, hz * 1.02),
        (0.0, head_y - hz * 0.04, head_cz + hz * 0.52, hz * 0.84, hz * 0.90),
        (0.0, head_y + hz * 0.02, head_cz + hz * 0.88, hz * 0.44, hz * 0.46),
    ]

    def head_squash(a):
        return 1.0 - 0.10 * max(0.0, math.cos(a))

    head_rings = _loft(bm, head_profiles, seg, squash=head_squash)
    _cap(bm, head_rings[-1], (0.0, head_y + hz * 0.04, head_cz + hz * 1.04))
    _bridge(bm, neck_rings[-1], head_rings[0])

    jaw_y = head_y - hz * 0.55
    jaw_rings = _loft(
        bm,
        [
            (0.0, jaw_y + hz * 0.20, neck_z + hz * 0.30, hz * 0.44, hz * 0.30),
            (0.0, jaw_y, neck_z + hz * 0.46, hz * 0.40, hz * 0.26),
            (0.0, jaw_y + hz * 0.06, neck_z + hz * 0.66, hz * 0.46, hz * 0.30),
        ],
        seg,
    )
    _cap(bm, list(reversed(jaw_rings[0])), (0.0, jaw_y + hz * 0.22, neck_z + hz * 0.22))
    _cap(bm, jaw_rings[-1], (0.0, jaw_y + hz * 0.08, neck_z + hz * 0.74))

    for sx in (-1, 1):
        sh_x = sx * spec["shoulder"] * 0.88
        el_x = sx * (spec["shoulder"] * 0.94 + 0.012 * h)
        wr_x = sx * (spec["shoulder"] * 0.90 + 0.020 * h)
        arm_drop = 0.030 * h * hunch
        _limb(
            bm,
            (sh_x, -0.020 * h * hunch, shoulder_z - 0.012 * h),
            (el_x, -0.040 * h * hunch - arm_drop, 0.660 * h),
            spec["arm"] * 1.22,
            spec["arm"] * 0.90,
            seg - 2,
            bulge=1.18,
        )
        _limb(
            bm,
            (el_x, -0.040 * h * hunch - arm_drop, 0.660 * h),
            (wr_x, -0.062 * h * hunch - arm_drop * 1.6, 0.512 * h),
            spec["forearm"] * 1.10,
            spec["forearm"] * 0.78,
            seg - 2,
            bulge=1.12,
        )
        hand_top = (wr_x, -0.062 * h * hunch - arm_drop * 1.6, 0.512 * h)
        palm = _loft(
            bm,
            [
                (hand_top[0], hand_top[1], hand_top[2], spec["forearm"] * 0.82, spec["forearm"] * 0.58),
                (hand_top[0], hand_top[1] - 0.006 * h, hand_top[2] - 0.026 * h, spec["forearm"] * 0.92, spec["forearm"] * 0.52),
                (hand_top[0], hand_top[1] - 0.010 * h, hand_top[2] - 0.050 * h, spec["forearm"] * 0.70, spec["forearm"] * 0.40),
            ],
            seg - 2,
        )
        _cap(bm, list(reversed(palm[0])), (hand_top[0], hand_top[1], hand_top[2] + 0.006 * h))
        _cap(bm, palm[-1], (hand_top[0], hand_top[1] - 0.014 * h, hand_top[2] - 0.062 * h))
        for f in range(3):
            fx = hand_top[0] + sx * (f - 1) * spec["forearm"] * 0.46
            fz = hand_top[2] - 0.052 * h
            fr = spec["forearm"] * 0.24
            _limb(
                bm,
                (fx, hand_top[1] - 0.008 * h, fz),
                (fx + sx * 0.004 * h, hand_top[1] - 0.030 * h, fz - 0.040 * h),
                fr,
                fr * 0.70,
                5,
                bulge=1.05,
            )

        lx = sx * spec["hip"] * 0.46
        _limb(
            bm,
            (lx, 0.004 * h, hip_z - 0.020 * h),
            (lx, 0.002 * h, 0.286 * h),
            spec["thigh"] * 1.18,
            spec["thigh"] * 0.86,
            seg - 2,
            bulge=1.16,
        )
        _limb(
            bm,
            (lx, 0.002 * h, 0.286 * h),
            (lx, 0.004 * h, 0.058 * h),
            spec["shin"] * 1.16,
            spec["shin"] * 0.74,
            seg - 2,
            bulge=1.20,
        )
        foot = _loft(
            bm,
            [
                (lx, 0.004 * h, 0.058 * h, spec["shin"] * 0.82, spec["shin"] * 0.80),
                (lx, -0.020 * h, 0.028 * h, spec["shin"] * 0.88, spec["shin"] * 1.30),
                (lx, -0.034 * h, 0.012 * h, spec["shin"] * 0.80, spec["shin"] * 1.55),
            ],
            seg - 2,
        )
        _cap(bm, list(reversed(foot[0])), (lx, 0.010 * h, 0.070 * h))
        _cap(bm, foot[-1], (lx, -0.044 * h, 0.010 * h))

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    for v in bm.verts:
        n = v.normal
        lump = (
            math.sin(v.co.z * 21.0 + v.co.x * 9.0) * 0.5
            + math.sin(v.co.z * 47.0 + v.co.y * 13.0) * 0.3
            + (rng.random() - 0.5) * 0.6
        )
        amt = lump * 0.0065 * (h / 1.82)
        v.co += n * amt

    mesh = bpy.data.meshes.new(f"ZombieMesh_{name}")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(f"Zombie_{name}", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    sub = obj.modifiers.new("Subdivide", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)

    dec = obj.modifiers.new("Decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = ZOMBIE_DECIMATE
    bpy.ops.object.modifier_apply(modifier=dec.name)

    _paint_zombie_colors(obj, spec, rng, h)

    mat = bpy.data.materials.new(f"ZombieSkin_{name}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    nt = mat.node_tree
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    attr.location = (-320, 120)
    if bsdf:
        nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.86
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
        bump = nt.nodes.new("ShaderNodeBump")
        bump.location = (-320, -160)
        bump.inputs["Strength"].default_value = 0.28
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.location = (-560, -160)
        noise.inputs["Scale"].default_value = 42.0
        noise.inputs["Detail"].default_value = 6.0
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mesh.materials.append(mat)

    bpy.ops.object.shade_smooth()

    arm = _build_zombie_armature(name, h)
    _bind_zombie_skin(obj, arm)
    _build_zombie_actions(arm, name, spec)

    export_glb([obj, arm], f"zombie_{name}.glb", animations=True)
    return obj, arm


def _paint_zombie_colors(obj, spec, rng, h):
    mesh = obj.data
    if not mesh.vertex_colors:
        mesh.vertex_colors.new(name="Col")
    layer = mesh.vertex_colors["Col"]

    skin = spec["skin"]
    cloth = spec["cloth"]
    tatter = spec["tatter"]

    shirt_lo = 0.560 * h
    shirt_hi = 0.870 * h
    trouser_hi = 0.545 * h
    trouser_lo = 0.120 * h

    wounds = []
    for _ in range(spec["wounds"]):
        wounds.append(
            (
                (rng.random() - 0.5) * 0.5 * h,
                (rng.random() - 0.5) * 0.3 * h,
                rng.uniform(0.18, 0.92) * h,
                rng.uniform(0.030, 0.072) * h,
            )
        )

    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            co = mesh.vertices[vi].co
            z = co.z

            edge = math.sin(co.x * 37.0 + z * 23.0) * 0.5 + math.sin(z * 61.0) * 0.5
            shirt = shirt_lo < z < shirt_hi + edge * 0.02 * tatter
            trousers = trouser_lo - edge * 0.02 * tatter < z < trouser_hi

            rip = math.sin(co.x * 18.0 + z * 31.0) + math.sin(co.y * 24.0 - z * 19.0)
            if rip > 1.72 - tatter * 0.55:
                shirt = False
                trousers = False

            if shirt or trousers:
                base = cloth
                grime = 0.72 + 0.28 * (math.sin(co.x * 51.0 + z * 33.0) * 0.5 + 0.5)
                r, g, b = base[0] * grime, base[1] * grime, base[2] * grime
            else:
                mottle = math.sin(co.x * 44.0 + z * 28.0) * 0.5 + math.sin(z * 73.0 + co.y * 31.0) * 0.5
                m = 1.0 + mottle * 0.13
                r, g, b = skin[0] * m, skin[1] * m, skin[2] * m
                vein = max(0.0, math.sin(co.x * 90.0 + z * 55.0))
                r += vein * 0.035
                b += vein * 0.055
                g -= vein * 0.012

            for (wx, wy, wz, wr) in wounds:
                d = math.sqrt((co.x - wx) ** 2 + (co.y - wy) ** 2 + (co.z - wz) ** 2)
                if d < wr:
                    t = 1.0 - (d / wr)
                    deep = t * t
                    r = r * (1.0 - t) + (0.30 + 0.22 * (1.0 - deep)) * t
                    g = g * (1.0 - t) + (0.035 + 0.045 * (1.0 - deep)) * t
                    b = b * (1.0 - t) + (0.030 + 0.040 * (1.0 - deep)) * t

            drip = math.sin(co.x * 27.0) * math.sin(co.y * 23.0)
            if drip > 0.78 and z < 0.80 * h:
                streak = (drip - 0.78) / 0.22
                r = r * (1.0 - streak * 0.8) + 0.24 * streak * 0.8
                g = g * (1.0 - streak * 0.8) + 0.028 * streak * 0.8
                b = b * (1.0 - streak * 0.8) + 0.022 * streak * 0.8

            ao = min(1.0, 0.62 + z / (h * 1.25))
            layer.data[li].color = (
                max(0.0, min(1.0, r * ao)),
                max(0.0, min(1.0, g * ao)),
                max(0.0, min(1.0, b * ao)),
                1.0,
            )


def _build_zombie_armature(name, h):
    arm_data = bpy.data.armatures.new(f"ZombieArm_{name}")
    arm = bpy.data.objects.new(f"Rig_{name}", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")

    created = {}
    for (bname, parent, head, tail) in ZOMBIE_BONES:
        eb = arm_data.edit_bones.new(bname)
        eb.head = (head[0] * h, head[1] * h, head[2] * h)
        eb.tail = (tail[0] * h, tail[1] * h, tail[2] * h)
        if parent:
            eb.parent = created[parent]
            eb.use_connect = False
        created[bname] = eb

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def _bind_zombie_skin(obj, arm):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


ZOMBIE_CLIPS = ("idle", "walk", "chase", "attack", "stagger", "hit", "death")


def _kf(pbone, frame, rot=None, loc=None):
    if rot is not None:
        pbone.rotation_mode = "XYZ"
        pbone.rotation_euler = rot
        pbone.keyframe_insert("rotation_euler", frame=frame)
    if loc is not None:
        pbone.location = loc
        pbone.keyframe_insert("location", frame=frame)


def _build_zombie_actions(arm, name, spec):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    hunch = spec["hunch"]

    for clip in ZOMBIE_CLIPS:
        action = bpy.data.actions.new(f"{clip}")
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        _pose_clip(arm, clip, hunch, spec)

    bpy.ops.object.mode_set(mode="OBJECT")
    arm.animation_data.action = None


def _pose_clip(arm, clip, hunch, spec):
    pb = arm.pose.bones

    def B(n):
        return pb[n]

    if clip == "idle":
        length = 96
        for i in range(5):
            f = 1 + i * (length // 4)
            t = i / 4.0
            s = math.sin(t * math.tau)
            _kf(B("hips"), f, rot=(-0.04 - hunch * 0.10, 0.0, s * 0.020), loc=(0, 0, s * 0.006))
            _kf(B("spine"), f, rot=(0.06 + hunch * 0.16, 0.0, -s * 0.024))
            _kf(B("chest"), f, rot=(0.05 + hunch * 0.20, s * 0.030, 0.0))
            _kf(B("neck"), f, rot=(-0.06 - hunch * 0.16, 0.0, 0.0))
            _kf(B("head"), f, rot=(-0.10 - hunch * 0.10, s * 0.10, 0.09))
            for sd, sg in (("L", -1), ("R", 1)):
                _kf(B(f"upperarm.{sd}"), f, rot=(-0.28 - hunch * 0.30, 0.0, sg * (0.16 + s * 0.03)))
                _kf(B(f"forearm.{sd}"), f, rot=(-0.55 - hunch * 0.35, 0.0, 0.0))
                _kf(B(f"hand.{sd}"), f, rot=(-0.20, 0.0, 0.0))
                _kf(B(f"thigh.{sd}"), f, rot=(0.02 * sg, 0.0, 0.0))
                _kf(B(f"shin.{sd}"), f, rot=(-0.06, 0.0, 0.0))
                _kf(B(f"foot.{sd}"), f, rot=(0.04, 0.0, 0.0))

    elif clip in ("walk", "chase"):
        fast = clip == "chase"
        length = 32 if fast else 48
        amp = 0.92 if fast else 0.52
        lean = (0.34 if fast else 0.12) + hunch * 0.30
        for i in range(9):
            f = 1 + i * (length // 8)
            t = i / 8.0
            a = t * math.tau
            s = math.sin(a)
            c = math.cos(a)
            _kf(
                B("hips"),
                f,
                rot=(-0.05 - lean * 0.30, s * 0.10 * amp, c * 0.07 * amp),
                loc=(0, 0, abs(math.sin(a * 2)) * (0.020 if fast else 0.012)),
            )
            _kf(B("spine"), f, rot=(lean * 0.45, -s * 0.12 * amp, 0.0))
            _kf(B("chest"), f, rot=(lean * 0.40, -s * 0.10 * amp, c * 0.04))
            _kf(B("neck"), f, rot=(-lean * 0.50, 0.0, 0.0))
            _kf(B("head"), f, rot=(-lean * 0.30, s * 0.05, 0.06))
            for sd, sg in (("L", -1), ("R", 1)):
                ph = a if sd == "L" else a + math.pi
                sw = math.sin(ph)
                _kf(B(f"thigh.{sd}"), f, rot=(sw * 0.62 * amp - lean * 0.14, 0.0, 0.0))
                knee = max(0.0, math.sin(ph - 0.85)) * (1.25 if fast else 0.85)
                _kf(B(f"shin.{sd}"), f, rot=(-knee * amp - 0.06, 0.0, 0.0))
                _kf(B(f"foot.{sd}"), f, rot=(max(0.0, -sw) * 0.35 + 0.06, 0.0, 0.0))
                asw = math.sin(ph + math.pi)
                _kf(
                    B(f"upperarm.{sd}"),
                    f,
                    rot=(-0.30 - lean * 0.9 + asw * 0.34 * amp, 0.0, sg * (0.18 + lean * 0.10)),
                )
                _kf(B(f"forearm.{sd}"), f, rot=(-0.70 - lean * 0.55 - abs(asw) * 0.20, 0.0, 0.0))
                _kf(B(f"hand.{sd}"), f, rot=(-0.18, 0.0, 0.0))

    elif clip == "attack":
        length = 26
        keys = [
            (1, 0.0),
            (7, -0.55),
            (13, 1.0),
            (20, 0.35),
            (26, 0.0),
        ]
        for (f, r) in keys:
            _kf(B("hips"), f, rot=(-0.10 - r * 0.12, 0.0, 0.0), loc=(0, 0, -abs(r) * 0.012))
            _kf(B("spine"), f, rot=(0.16 + r * 0.26, 0.0, 0.0))
            _kf(B("chest"), f, rot=(0.14 + r * 0.22, 0.0, 0.0))
            _kf(B("neck"), f, rot=(-0.18 - r * 0.10, 0.0, 0.0))
            _kf(B("head"), f, rot=(-0.20 - r * 0.16, 0.0, 0.05))
            for sd, sg in (("L", -1), ("R", 1)):
                bias = 1.0 if sd == "R" else 0.86
                _kf(
                    B(f"upperarm.{sd}"),
                    f,
                    rot=(-1.15 - r * 1.05 * bias, 0.0, sg * (0.30 - r * 0.16)),
                )
                _kf(B(f"forearm.{sd}"), f, rot=(-0.85 + r * 0.62, 0.0, 0.0))
                _kf(B(f"hand.{sd}"), f, rot=(-0.30 + r * 0.40, 0.0, 0.0))
                _kf(B(f"thigh.{sd}"), f, rot=(r * 0.16 * sg, 0.0, 0.0))
                _kf(B(f"shin.{sd}"), f, rot=(-0.12 - abs(r) * 0.10, 0.0, 0.0))
                _kf(B(f"foot.{sd}"), f, rot=(0.06, 0.0, 0.0))

    elif clip == "stagger":
        keys = [(1, 0.0), (5, 1.0), (12, 0.45), (20, 0.12), (28, 0.0)]
        for (f, r) in keys:
            _kf(B("hips"), f, rot=(0.16 * r, 0.0, 0.10 * r), loc=(0, 0, -0.030 * r))
            _kf(B("spine"), f, rot=(-0.34 * r, 0.10 * r, 0.0))
            _kf(B("chest"), f, rot=(-0.26 * r, 0.0, -0.08 * r))
            _kf(B("neck"), f, rot=(0.30 * r, 0.0, 0.0))
            _kf(B("head"), f, rot=(0.36 * r, -0.12 * r, 0.0))
            for sd, sg in (("L", -1), ("R", 1)):
                _kf(B(f"upperarm.{sd}"), f, rot=(-0.45 - r * 0.85, 0.0, sg * (0.24 + r * 0.34)))
                _kf(B(f"forearm.{sd}"), f, rot=(-0.70 - r * 0.55, 0.0, 0.0))
                _kf(B(f"hand.{sd}"), f, rot=(-0.22, 0.0, 0.0))
                _kf(B(f"thigh.{sd}"), f, rot=(-0.18 * r * sg, 0.0, 0.0))
                _kf(B(f"shin.{sd}"), f, rot=(-0.10 - 0.22 * r, 0.0, 0.0))
                _kf(B(f"foot.{sd}"), f, rot=(0.05, 0.0, 0.0))

    elif clip == "hit":
        keys = [(1, 0.0), (3, 1.0), (9, 0.30), (16, 0.0)]
        for (f, r) in keys:
            _kf(B("hips"), f, rot=(0.06 * r, 0.0, 0.05 * r), loc=(0, 0, -0.010 * r))
            _kf(B("spine"), f, rot=(-0.18 * r, 0.06 * r, 0.0))
            _kf(B("chest"), f, rot=(-0.14 * r, 0.0, -0.05 * r))
            _kf(B("neck"), f, rot=(0.16 * r, 0.0, 0.0))
            _kf(B("head"), f, rot=(0.22 * r, -0.08 * r, 0.04))
            for sd, sg in (("L", -1), ("R", 1)):
                _kf(B(f"upperarm.{sd}"), f, rot=(-0.36 - r * 0.34, 0.0, sg * (0.20 + r * 0.14)))
                _kf(B(f"forearm.{sd}"), f, rot=(-0.66 - r * 0.22, 0.0, 0.0))
                _kf(B(f"hand.{sd}"), f, rot=(-0.20, 0.0, 0.0))
                _kf(B(f"thigh.{sd}"), f, rot=(0.0, 0.0, 0.0))
                _kf(B(f"shin.{sd}"), f, rot=(-0.08, 0.0, 0.0))
                _kf(B(f"foot.{sd}"), f, rot=(0.05, 0.0, 0.0))

    elif clip == "death":
        keys = [(1, 0.0), (10, 0.26), (24, 0.72), (38, 0.95), (48, 1.0)]
        for (f, r) in keys:
            e = r * r * (3 - 2 * r)
            _kf(
                B("hips"),
                f,
                rot=(-0.06 - e * 1.34, e * 0.30, e * 0.26),
                loc=(0, -e * 0.030, -e * 0.300),
            )
            _kf(B("spine"), f, rot=(0.10 + e * 0.42, -e * 0.18, e * 0.10))
            _kf(B("chest"), f, rot=(0.08 + e * 0.30, 0.0, -e * 0.14))
            _kf(B("neck"), f, rot=(-0.08 + e * 0.44, 0.0, 0.0))
            _kf(B("head"), f, rot=(-0.10 + e * 0.62, e * 0.24, e * 0.20))
            for sd, sg in (("L", -1), ("R", 1)):
                _kf(B(f"upperarm.{sd}"), f, rot=(-0.32 + e * 1.15, 0.0, sg * (0.20 + e * 0.42)))
                _kf(B(f"forearm.{sd}"), f, rot=(-0.62 + e * 0.30, 0.0, 0.0))
                _kf(B(f"hand.{sd}"), f, rot=(-0.18 + e * 0.20, 0.0, 0.0))
                _kf(B(f"thigh.{sd}"), f, rot=(e * (0.42 if sd == "L" else -0.22), 0.0, 0.0))
                _kf(B(f"shin.{sd}"), f, rot=(-0.08 - e * (0.52 if sd == "L" else 0.30), 0.0, 0.0))
                _kf(B(f"foot.{sd}"), f, rot=(0.05 + e * 0.20, 0.0, 0.0))


def build_zombie():
    for name, spec in ZOMBIE_VARIANTS.items():
        print(f"--- zombie variant {name} ---")
        build_zombie_variant(name, spec)


def build_city_car():
    reset_scene()
    paint = make_material("CarPaint", (0.22, 0.24, 0.27), roughness=0.55, metallic=0.5)
    glass = make_material("CarGlass", (0.10, 0.13, 0.15), roughness=0.22, metallic=0.1)
    rubber = make_material("Tyre", (0.05, 0.05, 0.06), roughness=0.95, metallic=0.0)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.62))
    body = bpy.context.active_object
    body.name = "CarBody"
    body.scale = (2.05, 0.86, 0.36)
    body.data.materials.append(paint)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.16, 0, 1.12))
    cabin = bpy.context.active_object
    cabin.name = "CarCabin"
    cabin.scale = (1.06, 0.78, 0.34)
    cabin.data.materials.append(glass)

    wheels = []
    for i, (x, y) in enumerate([(1.32, 0.86), (1.32, -0.86), (-1.3, 0.86), (-1.3, -0.86)]):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=14, radius=0.33, depth=0.24, rotation=(1.5708, 0, 0), location=(x, y, 0.33)
        )
        w = bpy.context.active_object
        w.name = f"Wheel{i}"
        w.data.materials.append(rubber)
        shade_smooth(w, 40)
        wheels.append(w)

    export_glb([body, cabin] + wheels, "city_car.glb")


def build_city_dumpster():
    reset_scene()
    steel = make_material("DumpsterSteel", (0.16, 0.26, 0.20), roughness=0.72, metallic=0.45)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.62))
    body = bpy.context.active_object
    body.name = "DumpsterBody"
    body.scale = (1.9, 1.05, 1.15)
    body.data.materials.append(steel)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.24))
    lid = bpy.context.active_object
    lid.name = "DumpsterLid"
    lid.scale = (1.96, 1.12, 0.1)
    lid.rotation_euler = (0, 0.06, 0)
    lid.data.materials.append(steel)

    export_glb([body, lid], "city_dumpster.glb")


def build_city_lamp():
    reset_scene()
    metal = make_material("LampMetal", (0.13, 0.14, 0.15), roughness=0.55, metallic=0.75)
    lens = make_material("LampLens", (0.85, 0.82, 0.68), roughness=0.3, metallic=0.0)

    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.09, depth=5.4, location=(0, 0, 2.7))
    post = bpy.context.active_object
    post.name = "LampPost"
    post.data.materials.append(metal)
    shade_smooth(post, 40)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10, radius=0.07, depth=1.25, rotation=(0, 1.5708, 0), location=(0.55, 0, 5.32)
    )
    arm = bpy.context.active_object
    arm.name = "LampArm"
    arm.data.materials.append(metal)
    shade_smooth(arm, 40)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.12, 0, 5.2))
    head = bpy.context.active_object
    head.name = "LampHead"
    head.scale = (0.52, 0.26, 0.14)
    head.data.materials.append(lens)

    export_glb([post, arm, head], "city_lamp.glb")


def build_city_hydrant():
    reset_scene()
    paint = make_material("HydrantPaint", (0.52, 0.07, 0.06), roughness=0.62, metallic=0.2)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.17, depth=0.62, location=(0, 0, 0.31))
    body = bpy.context.active_object
    body.name = "HydrantBody"
    body.data.materials.append(paint)
    shade_smooth(body, 40)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=7, radius=0.17, location=(0, 0, 0.64))
    cap = bpy.context.active_object
    cap.name = "HydrantCap"
    cap.scale = (1, 1, 0.62)
    cap.data.materials.append(paint)
    shade_smooth(cap, 40)

    arms = []
    for i, ry in enumerate([1.5708, -1.5708]):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8, radius=0.07, depth=0.34, rotation=(0, 1.5708, 0), location=(0, 0, 0.42)
        )
        a = bpy.context.active_object
        a.name = f"HydrantArm{i}"
        a.rotation_euler = (0, 1.5708, ry)
        a.data.materials.append(paint)
        arms.append(a)

    export_glb([body, cap] + arms, "city_hydrant.glb")


def build_city_barricade():
    reset_scene()
    wood = make_material("BarricadeWood", (0.42, 0.30, 0.18), roughness=0.92, metallic=0.0)
    stripe = make_material("BarricadeStripe", (0.62, 0.30, 0.06), roughness=0.85, metallic=0.0)

    planks = []
    for i, z in enumerate([0.42, 0.78]):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
        p = bpy.context.active_object
        p.name = f"BarricadePlank{i}"
        p.scale = (1.4, 0.06, 0.13)
        p.data.materials.append(stripe if i == 0 else wood)
        planks.append(p)

    legs = []
    for i, x in enumerate([-1.24, 1.24]):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.5))
        l = bpy.context.active_object
        l.name = f"BarricadeLeg{i}"
        l.scale = (0.08, 0.34, 1.0)
        l.data.materials.append(wood)
        legs.append(l)

    export_glb(planks + legs, "city_barricade.glb")


BUILDERS = {
    "tree_conifer": build_conifer,
    "tree_broadleaf": build_broadleaf,
    "rock": build_rock,
    "bush": build_bush,
    "barrel": build_barrel,
    "zombie": build_zombie,
    "city_car": build_city_car,
    "city_dumpster": build_city_dumpster,
    "city_lamp": build_city_lamp,
    "city_hydrant": build_city_hydrant,
    "city_barricade": build_city_barricade,
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
