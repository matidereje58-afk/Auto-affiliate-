import os, sys
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

st.clear_scene()
c = lh.build_character("hero_f", cloth="shorts", hair="bun")
arm = c["armature"]; pb = arm.pose.bones

def show(tag):
    bpy.context.view_layer.update()
    print(tag,
          "elbow(%.3f,%.3f,%.3f)" % tuple(pb["forearm.R"].head),
          "wrist(%.3f,%.3f,%.3f)" % tuple(pb["hand.R"].head),
          "loc=", tuple(round(v,3) for v in pb["upperarm.R"].location))

p = lh.Pose(arm)
show("rest  ")
p.aim("upperarm.R", (0, -1, 0))
show("aim-arm")
p2 = lh.Pose(arm)
p2.aim("forearm.R", (0, -1, 0))
bpy.context.view_layer.update()
print("aim-forearm elbow(%.3f,%.3f,%.3f) wrist(%.3f,%.3f,%.3f)" % (
    tuple(pb["forearm.R"].head), tuple(pb["hand.R"].head)))
print("  upperarm quat", tuple(round(v,3) for v in pb["upperarm.R"].rotation_quaternion))
print("  forearm  quat", tuple(round(v,3) for v in pb["forearm.R"].rotation_quaternion))
print("  forearm  loc ", tuple(round(v,3) for v in pb["forearm.R"].location))
