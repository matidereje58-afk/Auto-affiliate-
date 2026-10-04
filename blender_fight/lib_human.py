"""Procedural human character builder for Blender (bpy).

Anatomy-driven body mesh -> voxel union -> muscle definition -> armature +
distance-based skin weights -> realistic-ish materials -> small posing DSL.

Metric units. The character faces -Y (Blender front-view convention).
"""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

TAU = math.pi * 2


# --------------------------------------------------------------------------
# math helpers
# --------------------------------------------------------------------------

def catmull(p0, p1, p2, p3, t):
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    )


def sample_path(ctrl, sub=4):
    pts = [Vector(c) for c in ctrl]
    n = len(pts)
    out = []
    for i in range(n - 1):
        p0 = pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(i + 2, n - 1)]
        for s in range(sub):
            out.append(catmull(p0, p1, p2, p3, s / sub))
    out.append(pts[-1])
    return out


def sample_arr(vals, sub=4, lo=None):
    n = len(vals)
    out = []
    for i in range(n - 1):
        v0 = vals[max(i - 1, 0)]
        v1 = vals[i]
        v2 = vals[i + 1]
        v3 = vals[min(i + 2, n - 1)]
        for s in range(sub):
            r = catmull(v0, v1, v2, v3, s / sub)
            out.append(max(lo, r) if lo is not None else r)
    r = vals[-1]
    out.append(max(lo, r) if lo is not None else r)
    return out


def parallel_frames(pts, ref_normal=None):
    """Rotation-minimising frames along a polyline."""
    n = len(pts)
    tans = []
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        tans.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))

    ref = Vector(ref_normal) if ref_normal else Vector((1, 0, 0))
    if abs(ref.dot(tans[0])) > 0.95:
        ref = Vector((0, 1, 0))
    nrm = (ref - tans[0] * ref.dot(tans[0])).normalized()
    normals = [nrm]
    for i in range(1, n):
        prev_t, cur_t = tans[i - 1], tans[i]
        axis = prev_t.cross(cur_t)
        if axis.length < 1e-8:
            nn = normals[-1]
        else:
            nn = Quaternion(axis.normalized(), prev_t.angle(cur_t)) @ normals[-1]
        nn = nn - cur_t * nn.dot(cur_t)
        normals.append(nn.normalized() if nn.length > 1e-8 else normals[-1])
    bins = [tans[i].cross(normals[i]).normalized() for i in range(n)]
    return tans, normals, bins


# --------------------------------------------------------------------------
# mesh primitives
# --------------------------------------------------------------------------

def tube(ctrl, rx, ry, segs=20, sub=4, rolls=None, ref_normal=None,
         cap_start=True, cap_end=True):
    """Swept elliptical tube along a spline."""
    pts = sample_path(ctrl, sub)
    rxs = sample_arr(rx, sub, lo=0.004)
    rys = sample_arr(ry, sub, lo=0.004)
    rls = sample_arr(rolls, sub) if rolls else [0.0] * len(pts)
    _t, nrm, bin_ = parallel_frames(pts, ref_normal)

    verts, faces = [], []
    rings = len(pts)
    for i in range(rings):
        for j in range(segs):
            a = TAU * j / segs + rls[i]
            verts.append(pts[i] + nrm[i] * (math.cos(a) * rxs[i])
                         + bin_[i] * (math.sin(a) * rys[i]))
    for i in range(rings - 1):
        for j in range(segs):
            a = i * segs + j
            b = i * segs + (j + 1) % segs
            c = (i + 1) * segs + (j + 1) % segs
            d = (i + 1) * segs + j
            faces.append((a, b, c, d))
    if cap_start:
        faces.append(tuple(range(segs - 1, -1, -1)))
    if cap_end:
        base = (rings - 1) * segs
        faces.append(tuple(base + j for j in range(segs)))
    return verts, faces


def ico_sphere(center, radius, subdiv=3, squash=(1, 1, 1)):
    verts, faces = [], []
    t = (1 + math.sqrt(5)) / 2
    base = [
        (-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
        (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
        (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1),
    ]
    faces0 = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    pts = [Vector(v).normalized() for v in base]
    faces = list(faces0)
    for _ in range(subdiv):
        cache, new_faces = {}, []

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                cache[key] = len(pts)
                pts.append((pts[a] + pts[b]).normalized())
            return cache[key]

        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new_faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new_faces
    c = Vector(center)
    sx, sy, sz = squash
    verts = [c + Vector((p.x * radius * sx, p.y * radius * sy, p.z * radius * sz))
             for p in pts]
    return verts, faces


def shell(verts, faces, keep_fn, xform):
    """Keep a subset of an icosphere and remap its faces (fixes index drift)."""
    out, remap = [], {}
    for i, v in enumerate(verts):
        if keep_fn(Vector(v)):
            remap[i] = len(out)
            out.append(xform(Vector(v)))
    new_faces = [tuple(remap[i] for i in f) for f in faces if all(i in remap for i in f)]
    return out, new_faces


def mesh_object(name, verts, faces, collection=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def pick(parts, kind):
    """Filter tagged (kind, verts, faces) parts down to merge() pairs."""
    return [(v, f) for k, v, f in parts if k == kind]


def merge(parts):
    verts, faces = [], []
    for pv, pf in parts:
        off = len(verts)
        verts.extend(pv)
        faces.extend([tuple(i + off for i in f) for f in pf])
    return verts, faces


# --------------------------------------------------------------------------
# head
# --------------------------------------------------------------------------

def _g(x, c, w):
    return math.exp(-((x - c) / w) ** 2)


HEAD_DIMS = {"hero_f": (0.0790, 0.0955, 0.1090),
             "hero_m": (0.0860, 0.1020, 0.1120)}


def head_sculpt(u):
    """unit-sphere point -> shaped head. z up, face towards -Y."""
    x, y, z = u.x, u.y, u.z
    front = max(0.0, -y)
    back = max(0.0, y)
    low = max(0.0, -z)
    out = Vector((x, y, z))

    # cranium slightly narrower than the face mass, jaw tapering to the chin
    out.x *= (1.0 - 0.05 * max(0.0, z - 0.10) - 0.36 * (low ** 2.0))
    out.y *= 1.0 - 0.30 * (low ** 2.1)

    # face sits forward of the skull centre
    out.y -= 0.050 * front

    # jaw: soft angle rather than a point
    out.x += math.copysign(0.028 * _g(z, -0.34, 0.20) * front, x if x else 1.0)
    # chin
    out.y -= 0.150 * _g(z, -0.66, 0.26) * front * max(0.0, 1.0 - abs(x) * 1.4)
    out.y += 0.030 * _g(z, -0.80, 0.14) * front * math.exp(-(x / 0.30) ** 2)

    # eye sockets, then brow ridge above them
    out.y += 0.085 * _g(z, 0.01, 0.15) * math.exp(-((abs(x) - 0.40) / 0.28) ** 2) * front
    out.y -= 0.085 * _g(z, 0.23, 0.11) * front * math.exp(-(x / 0.48) ** 2)
    # upper eyelid fold
    out.y -= 0.038 * _g(z, 0.075, 0.048) * front * math.exp(-((abs(x) - 0.40) / 0.26) ** 2)

    # nose: soft bridge, rounded tip, nostril wings
    out.y -= 0.185 * _g(z, 0.07, 0.21) * front * math.exp(-(x / 0.160) ** 2)
    out.y -= 0.150 * _g(z, -0.155, 0.130) * front * math.exp(-(x / 0.200) ** 2)
    # nostril creases under the tip
    out.y += 0.035 * _g(z, -0.245, 0.045) * front * math.exp(-((abs(x) - 0.105) / 0.055) ** 2)
    out.x += math.copysign(
        0.042 * _g(z, -0.20, 0.10) * front * math.exp(-((abs(x) - 0.145) / 0.060) ** 2),
        x if x else 1.0)

    # mouth: small, neutral
    out.y -= 0.082 * _g(z, -0.255, 0.090) * front * math.exp(-(x / 0.21) ** 2)
    out.y += 0.022 * _g(z, -0.145, 0.050) * front * math.exp(-(x / 0.13) ** 2)
    out.y += 0.020 * _g(z, -0.335, 0.055) * front * math.exp(-(x / 0.25) ** 2)

    # cheekbones and temples
    out.x += math.copysign(0.034 * _g(z, -0.06, 0.16) * _g(abs(y), 0.18, 0.48), x if x else 1.0)
    out.x *= 1.0 - 0.09 * _g(z, 0.34, 0.24)

    # occiput and crown
    out.y += 0.055 * _g(z, 0.16, 0.42) * back
    out.z -= 0.055 * _g(z, 0.86, 0.30)
    out.y += 0.12 * max(0.0, -z - 0.55) * back   # blends into the neck
    return out


def head_parts(center, key="hero_f", elong=1.0):
    rx, ry, rz = HEAD_DIMS[key]
    sx, sy, sz = rx * elong, ry * elong, rz
    verts, faces = ico_sphere((0, 0, 0), 1.0, subdiv=5)
    out = [Vector(center) + Vector((u.x * sx, u.y * sy, u.z * sz))
           for u in (head_sculpt(Vector(v)) for v in verts)]
    return [(out, faces)]


def head_surface(center, dims, u):
    """Point on the sculpted head surface for a unit direction u."""
    rx, ry, rz = dims
    s = head_sculpt(Vector(u))
    return Vector(center) + Vector((s.x * rx, s.y * ry, s.z * rz))


def eye_center(center, dims, side, radius=0.0126):
    """Eyeball seated in the socket: mostly inside, slightly proud."""
    c = Vector(center)
    u = Vector((side * 0.40, -0.88, 0.045)).normalized()
    p = head_surface(c, dims, u)
    outward = p - c
    outward = outward.normalized() if outward.length > 1e-6 else Vector((0, -1, 0))
    return p - outward * (radius * 1.02)


def face_parts(center, dims, key="hero_f"):
    """Eyes, irises, pupils, lids and brows as tagged parts."""
    rx, ry, rz = dims
    parts = []
    er = 0.0126
    for side in (-1, 1):
        eye = eye_center(center, dims, side)
        v, f = ico_sphere(eye, er, subdiv=3, squash=(1.0, 0.94, 1.0))
        parts.append(("eye", v, f))
        # iris + pupil sit just proud of the cornea so they read through the lid gap
        iv, ifc = ico_sphere((0, 0, 0), er * 0.46, subdiv=3, squash=(1, 0.30, 1))
        parts.append(("iris", [eye + Vector((p.x, p.y - er * 0.80, p.z)) for p in iv], ifc))
        pv, pfc = ico_sphere((0, 0, 0), er * 0.20, subdiv=2, squash=(1, 0.30, 1))
        parts.append(("pupil", [eye + Vector((p.x, p.y - er * 0.87, p.z)) for p in pv], pfc))

        # lids: thin arcs hugging the eyeball, forming the eye aperture
        up = [eye + Vector((-0.0150, -er * 0.42, 0.0028)),
              eye + Vector((-0.0075, -er * 0.76, 0.0086)),
              eye + Vector((0.0035, -er * 0.84, 0.0092)),
              eye + Vector((0.0135, -er * 0.62, 0.0042))]
        uv, uf = tube(up, [0.0030, 0.0042, 0.0044, 0.0030],
                      [0.0026, 0.0038, 0.0040, 0.0026], segs=10, sub=5,
                      ref_normal=(0, 0, 1))
        parts.append(("lid", uv, uf))
        low = [eye + Vector((-0.0140, -er * 0.46, -0.0050)),
               eye + Vector((-0.0055, -er * 0.80, -0.0086)),
               eye + Vector((0.0055, -er * 0.82, -0.0082)),
               eye + Vector((0.0140, -er * 0.58, -0.0044))]
        lv, lf = tube(low, [0.0022, 0.0030, 0.0030, 0.0022],
                      [0.0020, 0.0026, 0.0026, 0.0020], segs=10, sub=5,
                      ref_normal=(0, 0, 1))
        parts.append(("lid", lv, lf))

        # brow ridge arc
        brow = [eye + Vector((-0.0225, -0.0060, 0.0140)),
                eye + Vector((-0.0085, -0.0110, 0.0195)),
                eye + Vector((0.0080, -0.0118, 0.0195)),
                eye + Vector((0.0210, -0.0075, 0.0135))]
        bv, bf = tube(brow, [0.0035, 0.0055, 0.0050, 0.0030],
                      [0.0028, 0.0042, 0.0040, 0.0024], segs=8, sub=4,
                      ref_normal=(0, 0, 1))
        parts.append(("brow", bv, bf))
    return parts


def hair_parts(center, dims, style="bun"):
    """Scalp shell plus an optional bun / ponytail, following the skull."""
    rx, ry, rz = dims
    c = Vector(center)
    verts, faces = ico_sphere((0, 0, 0), 1.0, subdiv=5)

    def keep(u):
        front = max(0.0, -u.y)
        line = 0.05 + 0.30 * front + 0.045 * math.sin(u.x * 6.5 + u.y * 2.0)
        if u.z < line:
            return False
        if u.z < -0.34 and front > 0.35:      # keep the face clear below the temples
            return False
        return True

    def xform(u):
        grow = 1.045 + 0.022 * math.sin(u.x * 8.0) * math.sin(u.z * 6.0 + u.y * 4.0)
        return c + Vector((u.x * rx * grow, u.y * ry * grow, u.z * rz * grow))

    hv, hf = shell(verts, faces,
                   lambda v: keep(head_sculpt(Vector(v))), xform)
    parts = [("hair", hv, hf)]
    if style == "bun":
        bv, bf = ico_sphere((0, 0, 0), 1.0, subdiv=3)
        bun_c = c + Vector((0, ry * 0.90, rz * 0.58))
        parts.append(("hair", [bun_c + Vector((p.x * 0.043, p.y * 0.042, p.z * 0.042))
                               for p in bv], bf))
    elif style == "tail":
        ctrl = [c + Vector((0, ry * 0.80, rz * 0.60)),
                c + Vector((0, ry * 1.25, rz * 0.30)),
                c + Vector((0, ry * 1.45, -rz * 0.60)),
                c + Vector((0, ry * 1.15, -rz * 1.45))]
        v, f = tube(ctrl, [0.038, 0.034, 0.022, 0.008], [0.038, 0.034, 0.022, 0.008],
                    segs=14, sub=6)
        parts.append(("hair", v, f))
    return parts


# --------------------------------------------------------------------------
# specs
# --------------------------------------------------------------------------

def make_spec(kind="hero_f"):
    base = {
        "kind": kind, "head_key": kind, "head_elong": 1.0,
        "hip_z": 0.930, "waist_z": 1.080, "chest_z": 1.300,
        "neck_z": 1.438, "head_z": 1.615, "shoulder_z": 1.425,
        "elbow_z": 1.098, "wrist_z": 0.858, "knee_z": 0.478,
        "ankle_z": 0.088, "hip_off": 0.084,
        "shoulder_w": 0.176,
        "hip_rx": 0.132, "hip_ry": 0.108, "waist_rx": 0.108, "waist_ry": 0.092,
        "chest_rx": 0.150, "chest_ry": 0.112,
        "neck_rx": 0.043, "neck_ry": 0.045,
        "deltoid_r": 0.080, "upperarm_r": 0.054, "elbow_r": 0.045,
        "forearm_r": 0.050, "wrist_r": 0.030, "palm_rx": 0.036, "palm_ry": 0.026,
        "thigh_r": 0.106, "knee_r": 0.072, "calf_r": 0.078, "ankle_r": 0.040,
        "cloth_offset": 0.016, "muscle": 1.0,
    }
    if kind == "hero_f":
        base["head_elong"] = 0.99
        base["muscle"] = 0.85
        return base
    # heavier, taller opponent
    base.update({
        "head_key": "hero_m", "head_elong": 1.02, "muscle": 1.25,
        "hip_z": 0.975, "waist_z": 1.135, "chest_z": 1.375,
        "neck_z": 1.515, "head_z": 1.730, "shoulder_z": 1.495,
        "elbow_z": 1.150, "wrist_z": 0.882, "knee_z": 0.505,
        "ankle_z": 0.092, "hip_off": 0.092, "shoulder_w": 0.212,
        "hip_rx": 0.146, "hip_ry": 0.118, "waist_rx": 0.126, "waist_ry": 0.104,
        "chest_rx": 0.172, "chest_ry": 0.128,
        "neck_rx": 0.056, "neck_ry": 0.058,
        "deltoid_r": 0.094, "upperarm_r": 0.065, "elbow_r": 0.053,
        "forearm_r": 0.058, "wrist_r": 0.034, "palm_rx": 0.041, "palm_ry": 0.029,
        "thigh_r": 0.118, "knee_r": 0.081, "calf_r": 0.087, "ankle_r": 0.045,
        "cloth_offset": 0.017,
    })
    return base


# --------------------------------------------------------------------------
# body + garments
# --------------------------------------------------------------------------

def body_parts(spec):
    s = spec["shoulder_w"]
    parts = []

    torso = [
        (0, 0, spec["hip_z"] - 0.02),
        (0, 0, spec["waist_z"]),
        (0, 0, spec["waist_z"] + 0.11),
        (0, 0, spec["chest_z"]),
        (0, 0, spec["chest_z"] + 0.075),
        (0, 0, spec["neck_z"] - 0.02),
    ]
    trx = [spec["hip_rx"] * 0.94, spec["waist_rx"], spec["waist_rx"] * 1.14,
           spec["chest_rx"], spec["chest_rx"] * 0.98, spec["neck_rx"] * 1.60]
    tr_y = [spec["hip_ry"] * 0.96, spec["waist_ry"], spec["waist_ry"] * 1.12,
            spec["chest_ry"], spec["chest_ry"] * 1.02, spec["neck_ry"] * 1.50]
    parts.append(tube(torso, trx, tr_y, segs=26, sub=6, ref_normal=(1, 0, 0)))

    # neck: flares at the base to blend into the trapezius
    parts.append(tube([(0, 0.012, spec["neck_z"] - 0.075), (0, 0.004, spec["neck_z"] - 0.01),
                       (0, -0.002, spec["neck_z"] + 0.055), (0, -0.006, spec["neck_z"] + 0.105)],
                      [spec["neck_rx"] * 1.72, spec["neck_rx"] * 1.12,
                       spec["neck_rx"] * 0.98, spec["neck_rx"] * 0.95],
                      [spec["neck_ry"] * 1.60, spec["neck_ry"] * 1.08,
                       spec["neck_ry"] * 0.97, spec["neck_ry"] * 0.95],
                      segs=18, sub=6, ref_normal=(1, 0, 0)))

    parts += head_parts((0, -0.006, spec["head_z"]), spec["head_key"],
                        spec.get("head_elong", 1.0))

    for side in (-1, 1):
        # trapezius bridge: fuses the neck base into the deltoid, no shoulder shelf
        bridge = [
            (side * 0.020, 0.010, spec["neck_z"] - 0.048),
            (side * 0.075, 0.004, spec["shoulder_z"] - 0.010),
            (side * 0.135, 0.000, spec["shoulder_z"] - 0.018),
            (side * 0.192, 0.000, spec["shoulder_z"] - 0.028),
        ]
        parts.append(tube(bridge,
                          [spec["neck_rx"] * 1.35, 0.046, 0.044, 0.044],
                          [0.070, 0.084, 0.080, 0.064],
                          segs=18, sub=6, ref_normal=(0, 0, 1)))

        arm = [
            (side * s * 0.99, 0, spec["shoulder_z"] - 0.058),
            (side * s * 1.035, 0, spec["shoulder_z"] - 0.118),
            (side * s * 1.055, 0.002, spec["shoulder_z"] - 0.172),
            (side * s * 1.07, 0.004, spec["elbow_z"]),
            (side * s * 1.07, -0.004, spec["elbow_z"] - 0.105),
            (side * s * 1.06, -0.018, spec["wrist_z"]),
            (side * s * 1.05, -0.034, spec["wrist_z"] - 0.032),
            (side * s * 1.04, -0.052, spec["wrist_z"] - 0.068),
            (side * s * 1.03, -0.062, spec["wrist_z"] - 0.092),
        ]
        arx = [0.068, 0.074, spec["upperarm_r"] * 1.04,
               spec["elbow_r"], spec["forearm_r"], spec["wrist_r"], spec["palm_rx"],
               spec["palm_rx"] * 0.96, spec["palm_rx"] * 0.74]
        ary = [0.068, 0.074, spec["upperarm_r"] * 0.98,
               spec["elbow_r"] * 0.96, spec["forearm_r"] * 0.90, spec["wrist_r"] * 0.88,
               spec["palm_ry"], spec["palm_ry"] * 0.94, spec["palm_ry"] * 0.70]
        parts.append(tube(arm, arx, ary, segs=18, sub=6, ref_normal=(1, 0, 0)))

        thumb = [
            (side * (s * 0.94), -0.026, spec["wrist_z"] - 0.028),
            (side * (s * 1.02), -0.056, spec["wrist_z"] - 0.054),
            (side * (s * 1.05), -0.072, spec["wrist_z"] - 0.072),
        ]
        parts.append(tube(thumb, [0.019, 0.016, 0.012], [0.019, 0.016, 0.012],
                          segs=10, sub=5, ref_normal=(0, 0, 1)))

        leg = [
            (side * spec["hip_off"], 0, spec["hip_z"] + 0.02),
            (side * (spec["hip_off"] + 0.007), 0.004, spec["hip_z"] - 0.13),
            (side * (spec["hip_off"] + 0.011), 0.012, spec["knee_z"] + 0.12),
            (side * (spec["hip_off"] + 0.009), 0.016, spec["knee_z"]),
            (side * (spec["hip_off"] + 0.004), -0.004, spec["knee_z"] - 0.13),
            (side * (spec["hip_off"] + 0.002), -0.014, spec["knee_z"] - 0.28),
            (side * spec["hip_off"], -0.004, spec["ankle_z"] + 0.02),
        ]
        lrx = [spec["hip_rx"] * 0.80, spec["thigh_r"], spec["thigh_r"] * 0.86,
               spec["knee_r"], spec["calf_r"], spec["calf_r"] * 0.70, spec["ankle_r"]]
        lry = [spec["hip_ry"] * 0.82, spec["thigh_r"] * 0.98, spec["thigh_r"] * 0.92,
               spec["knee_r"] * 0.98, spec["calf_r"] * 0.94, spec["calf_r"] * 0.64,
               spec["ankle_r"] * 0.96]
        parts.append(tube(leg, lrx, lry, segs=18, sub=6, ref_normal=(1, 0, 0)))

        foot = [
            (side * spec["hip_off"], 0.012, spec["ankle_z"] - 0.018),
            (side * spec["hip_off"], -0.050, spec["ankle_z"] - 0.045),
            (side * spec["hip_off"], -0.130, spec["ankle_z"] - 0.055),
            (side * spec["hip_off"], -0.190, spec["ankle_z"] - 0.060),
            (side * spec["hip_off"], -0.225, spec["ankle_z"] - 0.064),
        ]
        parts.append(tube(foot, [0.072, 0.046, 0.036, 0.032, 0.028],
                          [0.048, 0.050, 0.052, 0.046, 0.030],
                          segs=16, sub=6, ref_normal=(0, 0, 1)))
    return parts


def garment_parts(spec, kind="both"):
    """Fight gear: a scoop-neck sports top with tapered shoulder straps, plus
    mid-thigh shorts. Strap ends taper to nothing inside the torso shell so no
    open caps are ever visible."""
    parts = []
    off = spec["cloth_offset"]
    s = spec["shoulder_w"]
    crx = spec["chest_rx"] + off
    cry = spec["chest_ry"] + off

    if kind in ("top", "both"):
        top = [
            (0, 0, spec["waist_z"] - 0.035),
            (0, 0, spec["waist_z"] + 0.090),
            (0, 0, spec["chest_z"] + 0.010),
            (0, 0, spec["chest_z"] + 0.060),
        ]
        gx = [spec["waist_rx"] * 1.02 + off, spec["waist_rx"] * 1.13 + off,
              spec["chest_rx"] + off, spec["chest_rx"] * 0.99 + off]
        gy = [spec["waist_ry"] * 1.02 + off, spec["waist_ry"] * 1.11 + off,
              spec["chest_ry"] + off, spec["chest_ry"] * 1.02 + off]
        parts.append(tube(top, gx, gy, segs=26, sub=6, ref_normal=(1, 0, 0)))

        # neckline trim: a tilted ring, low at the front, high at the back
        ring = [
            (0.00 * crx, -1.00 * cry, spec["chest_z"] - 0.010),
            (-0.55 * crx, -0.85 * cry, spec["chest_z"] + 0.030),
            (-0.95 * crx, -0.30 * cry, spec["shoulder_z"] - 0.050),
            (-1.00 * crx, 0.25 * cry, spec["shoulder_z"] - 0.035),
            (-0.80 * crx, 0.75 * cry, spec["chest_z"] + 0.060),
            (-0.35 * crx, 1.00 * cry, spec["chest_z"] + 0.070),
            (0.20 * crx, 1.00 * cry, spec["chest_z"] + 0.070),
            (0.70 * crx, 0.80 * cry, spec["chest_z"] + 0.055),
            (1.00 * crx, 0.25 * cry, spec["shoulder_z"] - 0.040),
            (0.95 * crx, -0.30 * cry, spec["shoulder_z"] - 0.055),
            (0.55 * crx, -0.85 * cry, spec["chest_z"] + 0.030),
            (0.10 * crx, -1.00 * cry, spec["chest_z"] - 0.005),
        ]
        parts.append(tube(ring, [0.017] * 12, [0.011] * 12, segs=12, sub=5,
                          ref_normal=(0, 0, 1)))

        # clean hem band at the bottom edge
        parts.append(tube([(0, 0, spec["waist_z"] - 0.030),
                           (0, 0, spec["waist_z"] - 0.062)],
                          [spec["waist_rx"] * 1.02 + off, spec["waist_rx"] * 1.02 + off],
                          [spec["waist_ry"] * 1.02 + off, spec["waist_ry"] * 1.02 + off],
                          segs=26, sub=4, ref_normal=(1, 0, 0)))

    if kind in ("shorts", "both"):
        hips = [
            (0, 0, spec["waist_z"] + 0.010),
            (0, 0, spec["waist_z"] - 0.080),
            (0, 0, spec["hip_z"] - 0.040),
            (0, 0, spec["hip_z"] - 0.110),
        ]
        hx = [spec["waist_rx"] * 1.04 + off, spec["hip_rx"] * 1.00 + off,
              spec["hip_rx"] * 0.93 + off, spec["hip_rx"] * 0.86 + off]
        hy = [spec["waist_ry"] * 1.04 + off, spec["hip_ry"] * 1.04 + off,
              spec["hip_ry"] * 1.06 + off, spec["hip_ry"] * 1.10 + off]
        parts.append(tube(hips, hx, hy, segs=26, sub=6, ref_normal=(1, 0, 0)))
        parts.append(tube([(0, 0, spec["waist_z"] + 0.035), (0, 0, spec["waist_z"] - 0.015)],
                          [spec["waist_rx"] * 1.05 + off] * 2,
                          [spec["waist_ry"] * 1.05 + off] * 2,
                          segs=26, sub=4, ref_normal=(1, 0, 0)))
        for side in (-1, 1):
            leg = [
                (side * spec["hip_off"] * 0.92, 0.004, spec["hip_z"] + 0.060),
                (side * (spec["hip_off"] + 0.004), 0.008, spec["hip_z"] - 0.020),
                (side * (spec["hip_off"] + 0.010), 0.012, spec["hip_z"] - 0.140),
                (side * (spec["hip_off"] + 0.011), 0.013, spec["knee_z"] + 0.235),
                (side * (spec["hip_off"] + 0.011), 0.013, spec["knee_z"] + 0.175),
            ]
            lx = [spec["thigh_r"] * 1.12 + off, spec["thigh_r"] * 1.06 + off,
                  spec["thigh_r"] * 1.00 + off, spec["thigh_r"] * 0.94 + off,
                  spec["thigh_r"] * 0.90 + off]
            ly = [spec["thigh_r"] * 1.10 + off, spec["thigh_r"] * 1.04 + off,
                  spec["thigh_r"] * 0.98 + off, spec["thigh_r"] * 0.92 + off,
                  spec["thigh_r"] * 0.88 + off]
            parts.append(tube(leg, lx, ly, segs=18, sub=6, ref_normal=(1, 0, 0)))
    return parts


def muscle_sculpt(obj, spec, strength=1.0):
    """Push anatomical definition into the fused body along vertex normals."""
    s = spec["shoulder_w"] / 0.176
    chest, sh = spec["chest_z"], spec["shoulder_z"]
    hip, knee = spec["hip_z"], spec["knee_z"]
    off = spec["hip_off"]
    elb, wri = spec["elbow_z"], spec["wrist_z"]

    bumps = []
    for sgn in (-1, 1):
        bumps += [
            ((sgn * 0.058 * s, -0.100, chest + 0.030), (0.080, 0.055, 0.050), 0.012),
            ((sgn * 0.118 * s, 0.012, chest - 0.065), (0.055, 0.085, 0.110), 0.010),
            ((sgn * 0.055 * s, 0.038, sh - 0.012), (0.055, 0.070, 0.048), 0.009),
            ((sgn * 0.160 * s, -0.010, sh - 0.055), (0.058, 0.060, 0.062), 0.007),
            ((sgn * 0.130 * s, -0.020, sh - 0.042), (0.062, 0.075, 0.058), 0.011),
            ((sgn * 0.070 * s, 0.000, sh - 0.006), (0.058, 0.072, 0.048), 0.009),
            ((sgn * 0.192 * s, -0.022, (sh + elb) * 0.5 + 0.03), (0.046, 0.048, 0.090), 0.009),
            ((sgn * 0.196 * s, -0.020, (elb + wri) * 0.5), (0.040, 0.040, 0.075), 0.005),
            ((sgn * (off + 0.010), -0.038, hip - 0.150), (0.070, 0.070, 0.135), 0.011),
            ((sgn * (off + 0.046), -0.022, knee + 0.150), (0.045, 0.060, 0.125), 0.009),
            ((sgn * (off - 0.018), -0.048, knee - 0.150), (0.036, 0.050, 0.095), 0.009),
            ((sgn * (off + 0.024), -0.032, knee - 0.145), (0.032, 0.045, 0.090), 0.006),
            ((sgn * 0.068 * s, 0.072, hip - 0.005), (0.075, 0.070, 0.090), 0.010),
        ]
    for i, z in enumerate((spec["waist_z"] + 0.050, spec["waist_z"] + 0.120,
                           spec["waist_z"] + 0.190)):
        depth = 0.011 if i < 2 else 0.008
        for sgn in (-1, 1):
            bumps.append(((sgn * 0.023, -0.092, z), (0.027, 0.045, 0.036), depth))
    bumps.append(((0.0, -0.102, chest + 0.040), (0.015, 0.040, 0.095), 0.006))

    me = obj.data
    for v in me.vertices:
        p, n = v.co, v.normal
        total = 0.0
        for (c, r, amt) in bumps:
            d = (((p.x - c[0]) / r[0]) ** 2 + ((p.y - c[1]) / r[1]) ** 2
                 + ((p.z - c[2]) / r[2]) ** 2)
            if d < 4.0:
                total += amt * math.exp(-d * 1.35)
        if total:
            v.co = p + n * (total * strength)
    me.update()


# --------------------------------------------------------------------------
# armature + skinning
# --------------------------------------------------------------------------

def bone_table(spec):
    """Bones derived from the spec so they line up with the generated mesh."""
    z = spec
    s = spec["shoulder_w"]
    rows = [
        ("root", None, (0, 0, z["hip_z"] - 0.09), (0, 0, z["hip_z"] - 0.01)),
        ("pelvis", "root", (0, 0, z["hip_z"] - 0.03), (0, 0, z["waist_z"] + 0.01)),
        ("spine", "pelvis", (0, 0, z["waist_z"] - 0.01), (0, 0, z["chest_z"] - 0.05)),
        ("chest", "spine", (0, 0, z["chest_z"] - 0.05), (0, 0, z["shoulder_z"] + 0.03)),
        ("neck", "chest", (0, 0, z["shoulder_z"] + 0.02), (0, 0, z["neck_z"] + 0.09)),
        ("head", "neck", (0, 0, z["neck_z"] + 0.08), (0, 0, z["head_z"] + 0.12)),
        ("clavicle.L", "chest", (0.025, 0.015, z["shoulder_z"] + 0.01),
         (s * 0.90, 0.020, z["shoulder_z"] + 0.015)),
        ("upperarm.L", "clavicle.L", (s * 0.92, 0.015, z["shoulder_z"]),
         (s * 1.07, 0.004, z["elbow_z"])),
        ("forearm.L", "upperarm.L", (s * 1.07, 0.004, z["elbow_z"]),
         (s * 1.06, -0.018, z["wrist_z"])),
        ("hand.L", "forearm.L", (s * 1.06, -0.018, z["wrist_z"]),
         (s * 1.04, -0.062, z["wrist_z"] - 0.092)),
        ("thigh.L", "pelvis", (z["hip_off"], 0, z["hip_z"] + 0.02),
         (z["hip_off"] + 0.009, 0.016, z["knee_z"])),
        ("shin.L", "thigh.L", (z["hip_off"] + 0.009, 0.016, z["knee_z"]),
         (z["hip_off"], -0.004, z["ankle_z"] + 0.01)),
        ("foot.L", "shin.L", (z["hip_off"], -0.004, z["ankle_z"] + 0.01),
         (z["hip_off"], -0.150, 0.032)),
        ("toe.L", "foot.L", (z["hip_off"], -0.150, 0.032),
         (z["hip_off"], -0.222, 0.028)),
    ]
    out = []
    for name, parent, h, t in rows:
        out.append((name, parent, h, t))
        if name.endswith(".L"):
            mirror = name[:-2] + ".R"
            mparent = (parent[:-2] + ".R") if parent else None
            out.append((mirror, mparent, (-h[0], h[1], h[2]), (-t[0], t[1], t[2])))
    return out


def build_armature(spec, name="armature"):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    table = bone_table(spec)
    for bname, parent, h, t in table:
        eb = arm.edit_bones.new(bname)
        eb.head, eb.tail = Vector(h), Vector(t)
        eb.roll = 0.0
        made[bname] = eb
    for bname, parent, h, t in table:
        if parent and parent in made:
            made[bname].parent = made[parent]
            made[bname].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def _dist_seg(p, a, b):
    ab = b - a
    denom = ab.dot(ab)
    if denom < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def skin_weights(body, spec, top=4):
    """Distance-to-bone weights: smooth and predictable through the joints."""
    groups, table = {}, []
    for bname, _p, h, t in bone_table(spec):
        if bname == "root":
            continue
        table.append((bname, Vector(h), Vector(t)))
        groups[bname] = body.vertex_groups.new(name=bname)

    mw = body.matrix_world
    for v in body.data.vertices:
        p = mw @ v.co
        scored = []
        for bname, h, t in table:
            d = _dist_seg(p, h, t)
            sigma = max(0.042, (t - h).length * 0.52)
            scored.append((math.exp(-(d / sigma) ** 2), bname))
        scored.sort(reverse=True)
        total = sum(s for s, _n in scored[:top]) or 1.0
        for s, n in scored[:top]:
            if s > 0.001:
                groups[n].add([v.index], s / total, "REPLACE")


# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------

def _set(node, names, value):
    for n in (names if isinstance(names, (list, tuple)) else [names]):
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


def principled(name, base, rough=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    _set(bsdf, "Base Color", (*base, 1.0))
    _set(bsdf, "Roughness", rough)
    _set(bsdf, "Metallic", metallic)
    return mat, bsdf


def skin_material(name="skin", tone=(0.30, 0.14, 0.092), warm=(0.42, 0.215, 0.145)):
    mat, bsdf = principled(name, tone, rough=0.42)
    nt = mat.node_tree
    _set(bsdf, ["Specular IOR Level", "Specular"], 0.45)
    _set(bsdf, ["Subsurface Weight", "Subsurface"], 0.20)
    _set(bsdf, "Subsurface Radius", (1.0, 0.32, 0.18))
    _set(bsdf, "Subsurface Scale", 0.013)
    _set(bsdf, "IOR", 1.42)

    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 6.0
    tex.inputs["Detail"].default_value = 6.0
    tex.location = (-820, 320)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.location = (-620, 320)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*tone, 1.0)
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = (*warm, 1.0)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    micro = nt.nodes.new("ShaderNodeTexNoise")
    micro.inputs["Scale"].default_value = 240.0
    micro.inputs["Detail"].default_value = 4.0
    micro.location = (-820, -160)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.10
    bump.inputs["Distance"].default_value = 0.0012
    bump.location = (-420, -160)
    nt.links.new(micro.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    rmap = nt.nodes.new("ShaderNodeMapRange")
    rmap.inputs["To Min"].default_value = 0.36
    rmap.inputs["To Max"].default_value = 0.54
    rmap.location = (-420, 40)
    nt.links.new(micro.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def cloth_material(name="cloth", color=(0.26, 0.018, 0.024), rough=0.58):
    mat, bsdf = principled(name, color, rough=rough)
    _set(bsdf, ["Sheen Weight", "Sheen"], 0.32)
    _set(bsdf, "Sheen Roughness", 0.32)
    _set(bsdf, ["Specular IOR Level", "Specular"], 0.35)
    nt = mat.node_tree
    weave = nt.nodes.new("ShaderNodeTexNoise")
    weave.inputs["Scale"].default_value = 380.0
    weave.inputs["Detail"].default_value = 2.0
    weave.location = (-620, -200)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.0009
    bump.location = (-380, -200)
    nt.links.new(weave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def hair_material(name="hair", color=(0.030, 0.018, 0.014)):
    mat, bsdf = principled(name, color, rough=0.32)
    for key in ("Anisotropic IOR Level", "Anisotropic"):
        if _set(bsdf, key, 0.7):
            break
    _set(bsdf, ["Specular IOR Level", "Specular"], 0.55)
    return mat


def simple_material(name, color, rough=0.15, metallic=0.0):
    mat, bsdf = principled(name, color, rough=rough, metallic=metallic)
    return mat


# --------------------------------------------------------------------------
# assembly
# --------------------------------------------------------------------------

def build_character(kind="hero_f", cloth="both", hair="bun", cloth_color=None,
                    voxel=0.0105):
    spec = make_spec(kind)
    if cloth_color is None:
        cloth_color = (0.26, 0.018, 0.024) if kind == "hero_f" else (0.020, 0.045, 0.16)

    skin_tone = (0.300, 0.140, 0.092) if kind == "hero_f" else (0.215, 0.098, 0.064)
    skin_warm = (0.430, 0.222, 0.150) if kind == "hero_f" else (0.320, 0.155, 0.100)
    skin_mat = skin_material("skin_" + kind, tone=skin_tone, warm=skin_warm)
    hair_mat = hair_material("hair_" + kind,
                             (0.030, 0.018, 0.014) if kind == "hero_f" else (0.022, 0.016, 0.013))
    cloth_mat = cloth_material("gear_" + kind, cloth_color)
    eye_mat = simple_material("sclera_" + kind, (0.72, 0.70, 0.68), rough=0.10)
    iris_mat = simple_material("iris_" + kind,
                               (0.055, 0.085, 0.115) if kind == "hero_f" else (0.10, 0.07, 0.04),
                               rough=0.16)
    pupil_mat = simple_material("pupil_" + kind, (0.004, 0.004, 0.005), rough=0.30)

    body = mesh_object("body_" + kind, *merge(body_parts(spec)))
    body.data.materials.append(skin_mat)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    body.data.remesh_voxel_size = voxel
    body.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()

    smooth = body.modifiers.new("smooth", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 2
    muscle_sculpt(body, spec, strength=spec.get("muscle", 1.0))
    sub = body.modifiers.new("subdiv", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    bpy.ops.object.shade_smooth()

    dims = HEAD_DIMS[spec["head_key"]]
    center = (0, -0.006, spec["head_z"])
    face = face_parts(center, dims, spec["head_key"])

    eyes = mesh_object("eyes_" + kind, *merge(pick(face, "eye")))
    eyes.data.materials.append(eye_mat)
    iris = mesh_object("iris_" + kind, *merge(pick(face, "iris")))
    iris.data.materials.append(iris_mat)
    pupil = mesh_object("pupil_" + kind, *merge(pick(face, "pupil")))
    pupil.data.materials.append(pupil_mat)
    lids = mesh_object("lids_" + kind, *merge(pick(face, "lid")))
    lids.data.materials.append(skin_mat)
    brows = mesh_object("brows_" + kind, *merge(pick(face, "brow")))
    brows.data.materials.append(hair_mat)
    for ob in (eyes, iris, pupil, lids):
        bpy.ops.object.shade_smooth()

    hair_ob = mesh_object("hair_" + kind, *merge(pick(hair_parts(center, dims, hair), "hair")))
    hair_ob.data.materials.append(hair_mat)

    gear = mesh_object("gear_" + kind, *merge(garment_parts(spec, cloth)))
    gear.data.materials.append(cloth_mat)
    bpy.context.view_layer.objects.active = gear
    bpy.ops.object.shade_smooth()

    arm = build_armature(spec, "armature_" + kind)
    parts = [body, gear, hair_ob, eyes, iris, pupil, lids, brows]
    inv = arm.matrix_world.inverted()
    for ob in parts:
        ob.parent = arm
        ob.matrix_parent_inverse = inv.copy()
        mod = ob.modifiers.new("armature", "ARMATURE")
        mod.object = arm
        mod.use_vertex_groups = True
        mod.use_bone_envelopes = False
        skin_weights(ob, spec)
        # deform before subdivision so weights act on the base mesh
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        try:
            bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
        except RuntimeError:
            pass
        ob.select_set(False)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)

    return {"spec": spec, "body": body, "gear": gear, "hair": hair_ob,
            "eyes": eyes, "iris": iris, "pupil": pupil, "lids": lids,
            "brows": brows, "armature": arm}


# --------------------------------------------------------------------------
# posing
# --------------------------------------------------------------------------

class Pose:
    """aim / 2-bone IK / FK over an armature, in armature space."""

    def __init__(self, arm_ob):
        self.arm = arm_ob
        self.pose = arm_ob.pose
        for pb in self.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = (1, 0, 0, 0)

    def _parent_chain(self, name):
        """Accumulated parent transform (4x4) from the root down to `name`."""
        pb = self.pose.bones[name]
        acc = Matrix.Identity(4)
        while pb.parent:
            par = pb.parent
            acc = par.matrix @ par.bone.matrix_local.inverted() @ acc
            pb = par
        return acc

    def aim(self, name, direction, roll=0.0):
        bpy.context.view_layer.update()   # parent chains must be current
        pb = self.pose.bones[name]
        d = Vector(direction)
        if d.length < 1e-9:
            return
        d.normalize()
        ref = Vector((0, 1, 0)) if abs(d.z) > 0.9 else Vector((0, 0, 1))
        x = ref.cross(d)
        if x.length < 1e-6:
            x = Vector((1, 0, 0))
        x.normalize()
        z = x.cross(d)
        R = Matrix((x, d, z)).transposed().to_4x4()
        if roll:
            R = R @ Matrix.Rotation(roll, 4, "Y")
        # pose.matrix = A @ B @ basis, so solve for the basis exactly
        desired = Matrix.Translation(pb.bone.head_local) @ R
        A = self._parent_chain(name)
        basis = (A @ pb.bone.matrix_local).inverted() @ desired
        pb.location = basis.translation
        pb.rotation_quaternion = basis.to_quaternion()

    def rot(self, name, euler_deg=(0, 0, 0)):
        bpy.context.view_layer.update()
        pb = self.pose.bones[name]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = tuple(math.radians(a) for a in euler_deg)
        pb.rotation_quaternion = pb.rotation_euler.to_quaternion()
        pb.rotation_mode = "QUATERNION"

    def ik(self, root_name, mid_name, target, pole=(0, 1, 0), roll=0.0):
        bpy.context.view_layer.update()
        b1, b2 = self.pose.bones[root_name], self.pose.bones[mid_name]
        S = b1.head.copy()
        l1 = (b1.head - b1.tail).length
        l2 = (b2.head - b2.tail).length
        T = Vector(target)
        raw = T - S
        reach = raw.length
        d = raw.normalized() if raw.length > 1e-9 else Vector((0, 0, -1))
        fold = abs(l1 - l2) + 0.012
        if reach < fold:                      # too close: fold back on itself
            self.aim(root_name, d, roll)
            self.aim(mid_name, -d)
            return
        if reach > l1 + l2 - 0.008:           # out of reach: straighten towards it
            self.aim(root_name, d, roll)
            self.aim(mid_name, d)
            return
        cos_a = (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach)
        a = math.acos(max(-1.0, min(1.0, cos_a)))
        axis = d.cross(Vector(pole))
        if axis.length < 1e-6:
            axis = Vector((1, 0, 0))
        axis.normalize()
        e_dir = Quaternion(axis, a) @ d
        self.aim(root_name, e_dir, roll)
        self.aim(mid_name, (T - (S + e_dir * l1)).normalized())

    def twist(self, name, degrees):
        pb = self.pose.bones[name]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, math.radians(degrees), 0.0)
        pb.rotation_quaternion = pb.rotation_euler.to_quaternion()
        pb.rotation_mode = "QUATERNION"