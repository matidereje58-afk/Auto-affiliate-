import os, sys, math
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

st.clear_scene()
c = lh.build_character("hero_f", cloth="both", hair="tail")
arm = c["armature"]; body = c["body"]
dg = bpy.context.evaluated_depsgraph_get()
rest = [v.co.copy() for v in body.data.vertices]

def maxdisp():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    m = max(((Vector(me.vertices[i].co) - rest[i]).length) for i in range(len(rest)))
    ev.to_mesh_clear()
    return m

p = lh.Pose(arm)
print("BONES:", [b.name for b in arm.pose.bones])
for name in ["forearm.R", "shin.L", "chest", "head", "hand.L"]:
    p2 = lh.Pose(arm)   # fresh identity pose
    p2.aim(name, (0, -1, 0.2))
    d = maxdisp()
    print("ROTATE %-10s maxdisp=%.3f" % (name, d))
