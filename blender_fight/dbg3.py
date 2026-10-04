import os, sys, math
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

st.clear_scene()
hero = lh.build_character("hero_f", cloth="both", hair="tail")
hp = lh.Pose(hero["armature"])
spec = hero["spec"]
print("SPEC shoulder_z=%.3f elbow_z=%.3f wrist_z=%.3f" % (spec["shoulder_z"], spec["elbow_z"], spec["wrist_z"]))
arm = hero["armature"]
pb = arm.pose.bones
def show(label):
    bpy.context.view_layer.update()
    out = []
    for n in ["pelvis", "chest", "head", "upperarm.R", "forearm.R", "hand.R", "hand.L", "shin.L"]:
        out.append("%s(%.2f,%.2f,%.2f)" % (n, pb[n].head.x, pb[n].head.y, pb[n].head.z))
    print(label, " ".join(out))

show("REST ")
hp.ik("thigh.R", "shin.R", (-0.135, -0.235, 0.045), pole=(0, 1, 0.45))
show("LEGS ")
hp.rot("pelvis", (-4, -14, 0))
hp.aim("spine", (0, -0.10, 1.0))
hp.aim("chest", (0, -0.20, 0.98))
show("SPINE")
hp.ik("upperarm.R", "forearm.R", (-0.150, -0.415, 1.398), pole=(-1, -0.25, -0.15))
show("ARM_R")
hp.ik("upperarm.L", "forearm.L", (0.115, -0.150, 1.520), pole=(1, -0.15, 0.10))
show("ARM_L")
hp.aim("hand.R", (0, -1, 0.04))
hp.aim("hand.L", (-0.25, -0.9, 0.35))
hp.aim("neck", (0, -0.06, 1.0))
hp.aim("head", (0, -0.55, 0.84))
show("FINAL")
