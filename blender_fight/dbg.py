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
print("PARENT:", body.parent, "type:", type(body.parent))
print("BODY_LOC:", tuple(round(v,3) for v in body.location),
      "PARENT_INV:", tuple(round(v,3) for v in body.matrix_parent_inverse.to_translation()))
print("VGROUPS:", len(body.vertex_groups), [g.name for g in body.vertex_groups[:5]])
print("ARM_LOC:", tuple(round(v,3) for v in arm.location))
p = lh.Pose(arm)
p.ik("upperarm.R", "forearm.R", (-0.15, -0.42, 1.40), pole=(-1,-0.25,-0.15))
bpy.context.view_layer.update()
pb = arm.pose.bones["hand.R"]
print("HAND_WORLD:", tuple(round(v,3) for v in pb.tail))
print("QUAT:", tuple(round(v,3) for v in pb.rotation_quaternion))
dg = bpy.context.evaluated_depsgraph_get()
be = body.evaluated_get(dg)
print("BODY_EVAL_LOC:", tuple(round(v,3) for v in be.matrix_world.translation))
mw = body.matrix_world
zs = [ (mw @ v.co).z for v in body.data.vertices ]
print("BODY_Z_RANGE:", round(min(zs),3), round(max(zs),3))
print("HAND_VGROUP_W:", body.vertex_groups["hand.R"].index if "hand.R" in body.vertex_groups else None)
