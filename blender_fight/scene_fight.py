"""Fight scene: two characters, choreography, arena, cinematic lighting.

Author poses in each character's local space (they face -Y), then rotate and
place the armatures to stage the exchange.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

RENDERS = os.path.join(HERE, "renders")
DEBUG = os.environ.get("POSE_DEBUG") == "1"
random.seed(7)


# --------------------------------------------------------------------------
# choreography
# --------------------------------------------------------------------------

def pose_hero(pose, spec):
    """Right cross landing on the jaw, left hand high, stepping in."""
    z = spec
    # stance: right foot forward, left foot planted behind
    pose.ik("thigh.R", "shin.R", (-0.135, -0.235, 0.045), pole=(0, 1, 0.45))
    pose.ik("thigh.L", "shin.L", (0.145, 0.155, 0.040), pole=(0, 1, 0.45))
    pose.aim("foot.R", (0, -1, -0.02))
    pose.aim("foot.L", (0, -1, -0.02))

    # hips drive forward and turn into the punch
    pose.rot("pelvis", (-4, -14, 0))
    pose.aim("spine", (0, -0.10, 1.0))
    pose.aim("chest", (0, -0.20, 0.98))

    # right arm fully extended into the jaw; elbow tucked
    pose.ik("upperarm.R", "forearm.R", (-0.150, -0.415, 1.398), pole=(-1, -0.25, -0.15))
    pose.aim("hand.R", (0, -1, 0.04))
    # left hand guarding the cheek
    pose.ik("upperarm.L", "forearm.L", (0.115, -0.150, 1.520), pole=(1, -0.15, 0.10))
    pose.aim("hand.L", (-0.25, -0.9, 0.35))

    # chin tucked, eyes on the target
    pose.aim("neck", (0, -0.06, 1.0))
    pose.aim("head", (0, -0.55, 0.84))


def pose_opponent(pose, spec):
    """Head snapped back off the punch, feet scrambling backwards."""
    # stance: weight thrown onto the back foot
    pose.ik("thigh.R", "shin.R", (-0.115, 0.215, 0.045), pole=(0, 1, 0.45))
    pose.ik("thigh.L", "shin.L", (0.120, -0.190, 0.040), pole=(0, 1, 0.45))
    pose.aim("foot.R", (0, -1, 0.10))
    pose.aim("foot.L", (0, -1, -0.02))

    # torso recoiling: shoulders rotate away, chest opens up
    pose.rot("pelvis", (6, 18, 0))
    pose.aim("spine", (0, 0.14, 0.99))
    pose.aim("chest", (0, 0.30, 0.95))

    # right arm flung wide and low, left arm collapsing across the body
    pose.ik("upperarm.R", "forearm.R", (-0.235, 0.145, 1.235), pole=(-1, 0.2, 0.1))
    pose.aim("hand.R", (-0.4, 0.85, -0.3))
    pose.ik("upperarm.L", "forearm.L", (0.075, -0.215, 1.415), pole=(1, 0.1, -0.2))
    pose.aim("hand.L", (0.2, -0.9, 0.35))

    # head snapped back and to the side
    pose.aim("neck", (0, 0.22, 0.97))
    pose.aim("head", (0.18, 0.52, 0.84))


def stage_fight():
    """Build both fighters and place them for the exchange."""
    hero = lh.build_character("hero_f", cloth="both", hair="tail")
    foe = lh.build_character("hero_m", cloth="shorts", hair="bun")

    hp = lh.Pose(hero["armature"])
    fp = lh.Pose(foe["armature"])
    pose_hero(hp, hero["spec"])
    pose_opponent(fp, foe["spec"])

    # hero steps in from the left, opponent reeling to the right
    hero["armature"].rotation_euler = (0, 0, math.radians(96))
    hero["armature"].location = (-0.40, 0.02, 0.0)
    foe["armature"].rotation_euler = (0, 0, math.radians(-104))
    foe["armature"].location = (0.34, 0.12, 0.0)
    bpy.context.view_layer.update()
    return hero, foe


# --------------------------------------------------------------------------
# arena
# --------------------------------------------------------------------------

def build_arena(centre=(0.0, 0.05)):
    cx, cy = centre
    dark = lh.simple_material("arena_dark", (0.020, 0.020, 0.024), rough=0.65)
    steel = lh.simple_material("steel", (0.055, 0.056, 0.060), rough=0.38, metallic=0.85)
    mat = lh.cloth_material("canvas", (0.055, 0.048, 0.045), rough=0.75)
    crowd_mat = lh.simple_material("crowd", (0.008, 0.008, 0.010), rough=0.9)

    floor = st.plane("mat", 9.0, mat=mat, center=(cx, cy))
    st.plane("apron", 40.0, z=-0.02, mat=dark)

    # cage: vertical wires plus horizontal rails on three sides
    verts, faces = [], []

    def strut(p0, p1, r=0.011, segs=6):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        up = Vector((0, 0, 1)) if abs(d.normalized().z) < 0.9 else Vector((1, 0, 0))
        a = d.normalized().cross(up).normalized()
        b = d.normalized().cross(a).normalized()
        base = len(verts)
        for p in (p0, p1):
            for i in range(segs):
                ang = 2 * math.pi * i / segs
                verts.append(p + a * (math.cos(ang) * r) + b * (math.sin(ang) * r))
        for i in range(segs):
            faces.append((base + i, base + (i + 1) % segs,
                          base + segs + (i + 1) % segs, base + segs + i))

    half = 2.35
    height = 1.95
    for side in ("front", "back", "left", "right"):
        if side == "front":
            a = Vector((cx - half, cy - half, 0))
            b = Vector((cx + half, cy - half, 0))
        elif side == "back":
            a = Vector((cx - half, cy + half, 0))
            b = Vector((cx + half, cy + half, 0))
        elif side == "left":
            a = Vector((cx - half, cy - half, 0))
            b = Vector((cx - half, cy + half, 0))
        else:
            a = Vector((cx + half, cy - half, 0))
            b = Vector((cx + half, cy + half, 0))
        n = 17
        for i in range(n + 1):
            t = i / n
            p = a.lerp(b, t)
            strut((p.x, p.y, 0.0), (p.x, p.y, height), r=0.010)
        for k in range(1, 6):
            z = height * k / 6.0
            strut((a.x, a.y, z), (b.x, b.y, z), r=0.013)
    cage = lh.mesh_object("cage", verts, faces)
    cage.data.materials.append(steel)

    # corner posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            st.box("post", (cx + sx * half, cy + sy * half, height / 2),
                   (0.10, 0.10, height), mat=steel)

    # crowd: dark silhouettes on rising tiers behind the cage
    cverts, cfaces = [], []
    for row, (dist, scale, count) in enumerate([(4.6, 1.0, 16), (5.9, 1.06, 18),
                                               (7.3, 1.12, 20)]):
        for i in range(count):
            px = cx - 6.0 + 12.0 * (i + 0.5) / count + random.uniform(-0.18, 0.18)
            py = cy + dist + random.uniform(-0.25, 0.25)
            pz = -0.02 + 0.32 * row
            hgt = random.uniform(0.95, 1.15) * scale
            v, f = lh.ico_sphere((px, py, pz + hgt * 0.52), 0.30 * scale, subdiv=2,
                                 squash=(1.0, 0.75, 1.75))
            off = len(cverts)
            cverts.extend(v)
            cfaces.extend([tuple(x + off for x in face) for face in f])
            v, f = lh.ico_sphere((px, py, pz + hgt * 0.95), 0.135 * scale, subdiv=2)
            off = len(cverts)
            cverts.extend(v)
            cfaces.extend([tuple(x + off for x in face) for face in f])
    crowd = lh.mesh_object("crowd", cverts, cfaces)
    crowd.data.materials.append(crowd_mat)

    return floor


def add_haze(density=0.012):
    """Volumetric haze for light shafts (expensive: enable deliberately)."""
    mat = bpy.data.materials.new("haze")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumeScatter")
    vol.inputs["Color"].default_value = (0.62, 0.66, 0.78, 1.0)
    vol.inputs["Density"].default_value = density
    vol.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    ob = st.box("haze", (0.0, 0.4, 2.4), (13.0, 13.0, 5.0), mat=mat)
    ob.visible_shadow = False
    return ob


# --------------------------------------------------------------------------
# lighting
# --------------------------------------------------------------------------

def fight_lighting():
    st.world(0.22, color=(0.020, 0.022, 0.030))
    # overhead key, slightly warm
    st.spot("key", (0.35, -1.35, 4.30), 2600, 46, blend=0.42,
            color=(1.0, 0.94, 0.84), target=(0.0, 0.05, 1.15), radius=0.30)
    # cool rim from behind-left
    st.spot("rim_cool", (-2.60, 2.30, 2.85), 1500, 60, blend=0.55,
            color=(0.42, 0.62, 1.0), target=(-0.20, 0.10, 1.25), radius=0.25)
    # warm rim from behind-right
    st.spot("rim_warm", (2.90, 2.05, 2.60), 1350, 58, blend=0.55,
            color=(1.0, 0.44, 0.20), target=(0.25, 0.10, 1.20), radius=0.25)
    # low practical from the front, keeps the faces readable
    st.area("front_fill", (-0.30, -3.00, 1.15), 260, 2.4,
            color=(0.95, 0.94, 1.0), target=(0.0, 0.05, 1.20))
    st.area("bounce", (0.0, -1.20, 0.10), 90, 3.0,
            color=(1.0, 0.86, 0.70), target=(0.0, 0.05, 1.30))


SHOTS = {
    "hero_low": dict(loc=(-1.05, -3.35, 0.62), target=(-0.30, 0.02, 1.24),
                     lens=42.0, roll=-4.0, dof=(-0.10, 0.02, 1.30), fstop=2.2),
    "impact": dict(loc=(1.55, -1.85, 1.62), target=(0.16, 0.06, 1.44),
                   lens=70.0, roll=6.0, dof=(0.30, 0.05, 1.44), fstop=2.8),
    "wide": dict(loc=(-0.35, -4.60, 1.30), target=(-0.02, 0.05, 1.05),
                 lens=35.0, roll=0.0, dof=(-0.05, 0.05, 1.20), fstop=4.0),
    "hero_close": dict(loc=(-0.62, -1.55, 1.58), target=(-0.36, 0.02, 1.44),
                       lens=85.0, roll=-2.0, dof=(-0.38, 0.02, 1.45), fstop=2.0),
}


def shoot(shot, res=(900, 620), samples=64, tag=""):
    cfg = SHOTS[shot]
    st.camera(loc=cfg["loc"], target=cfg["target"], lens=cfg["lens"],
              roll=cfg.get("roll", 0.0), dof_target=cfg.get("dof"), fstop=cfg.get("fstop", 2.8))
    return st.render(os.path.join(RENDERS, "fight_%s%s.png" % (shot, tag)),
                     res=res, samples=samples)


def main():
    st.clear_scene()
    hero, foe = stage_fight()
    if not DEBUG:
        build_arena()
        fight_lighting()
        if os.environ.get("HAZE") == "1":
            add_haze()
        tag = os.environ.get("TAG", "")
        res = (900, 620)
        samples = int(os.environ.get("SAMPLES", "64"))
        for shot in os.environ.get("SHOTS", "hero_low,impact,wide,hero_close").split(","):
            shoot(shot, res=res, samples=samples, tag=tag)
        print("FIGHT_DONE")
    else:
        st.world(0.4)
        st.area("k", (-1.5, -2.5, 2.6), 500, 1.8, (1, 0.96, 0.9), target=(0, 0, 1.2))
        st.area("f", (2.2, -1.8, 1.6), 160, 2.0, (0.8, 0.87, 1.0), target=(0, 0, 1.1))
        st.plane("floor", 20.0, mat=lh.simple_material("floor", (0.06, 0.06, 0.07)))
        st.camera(loc=(-0.55, -3.10, 1.35), target=(-0.03, 0.06, 1.15), lens=45.0)
        st.render(os.path.join(RENDERS, "pose_debug.png"), res=(760, 560), samples=14)
        print("POSE_DEBUG_DONE")


main()