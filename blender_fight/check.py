"""Fast look-dev check: head closeup + full body, low resolution."""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

OUT = os.path.join(HERE, "renders")
kind = os.environ.get("KIND", "hero_f")
hair = os.environ.get("HAIR", "bun")
tag = os.environ.get("TAG", "")

st.clear_scene()
char = lh.build_character(kind, cloth="both", hair=hair)
pose = lh.Pose(char["armature"])
pose.ik("thigh.L", "shin.L", (0.09, -0.03, 0.09), pole=(0, 1, 0.5))
pose.ik("thigh.R", "shin.R", (-0.09, 0.07, 0.09), pole=(0, 1, 0.5))
pose.aim("foot.L", (0, -1, -0.04))
pose.aim("foot.R", (0, -1, -0.04))
bpy.context.view_layer.update()

st.world(0.45)
st.area("key", (1.7, -2.3, 2.7), 420, 1.7, (1.0, 0.95, 0.88), target=(0, 0, 1.05))
st.area("fill", (-2.1, -1.5, 1.5), 110, 2.2, (0.78, 0.85, 1.0), target=(0, 0, 1.1))
st.area("rim", (-0.9, 2.5, 2.3), 300, 1.1, (0.92, 0.95, 1.0), target=(0, 0, 1.3))
st.plane("floor", 30.0, mat=lh.simple_material("floor", (0.05, 0.05, 0.056), rough=0.5))

s = char["spec"]
hz = s["head_z"]
st.camera(loc=(0.0, -1.15, hz + 0.06), target=(0, -0.01, hz - 0.01), lens=85.0)
st.render(os.path.join(OUT, "chk_%sface.png" % tag), res=(440, 560), samples=16)

st.camera(loc=(0.55, -0.95, hz + 0.02), target=(0.01, -0.02, hz - 0.02), lens=85.0)
st.render(os.path.join(OUT, "chk_%sface34.png" % tag), res=(440, 560), samples=16)

st.camera(loc=(0.0, -4.60, 0.98), target=(0, 0, 0.90), lens=72.0)
st.render(os.path.join(OUT, "chk_%sbody.png" % tag), res=(520, 760), samples=16)
print("CHECK_DONE", kind)