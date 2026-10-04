"""Stage A: anatomy check. One character, three views, studio light."""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

OUT = os.path.join(HERE, "renders")
st.clear_scene()
scene = bpy.context.scene

char = lh.build_character("hero_f", cloth="both", hair="bun")
pose = lh.Pose(char["armature"])

# neutral relaxed stance: feet planted, light bend, arms hanging
pose.ik("thigh.L", "shin.L", (0.10, -0.03, 0.10), pole=(0, 1, 0.5))
pose.ik("thigh.R", "shin.R", (-0.10, 0.07, 0.10), pole=(0, 1, 0.5))
pose.aim("foot.L", (0, -1, -0.04))
pose.aim("foot.R", (0, -1, -0.04))
bpy.context.view_layer.update()

st.world(strength=0.45)
st.area("key", (1.7, -2.3, 2.7), 420, 1.7, (1.0, 0.95, 0.88), target=(0, 0, 1.05))
st.area("fill", (-2.1, -1.5, 1.5), 110, 2.2, (0.78, 0.85, 1.0), target=(0, 0, 1.1))
st.area("rim", (-0.9, 2.5, 2.3), 300, 1.1, (0.92, 0.95, 1.0), target=(0, 0, 1.3))
st.plane("floor", 30.0, mat=lh.cloth_material("floor", (0.055, 0.055, 0.062), rough=0.5))

views = [
    ("front", (0.0, -4.30, 1.02), (0, 0, 0.95), 85.0),
    ("three_quarter", (2.55, -3.35, 1.28), (0, 0, 1.02), 85.0),
    ("side", (4.20, -0.35, 1.05), (0, 0, 0.98), 85.0),
    ("head", (0.62, -1.05, 1.72), (0, -0.01, 1.66), 85.0),
]
for name, loc, tgt, lens in views:
    st.camera(loc=loc, target=tgt, lens=lens)
    st.render(os.path.join(OUT, "a_%s.png" % name),
              res=(620, 860) if name == "head" else (700, 1000), samples=40)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "blend", "stage_a.blend"))
print("STAGE_A_DONE")