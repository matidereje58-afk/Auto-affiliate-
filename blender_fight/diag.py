"""Diagnostic: shoulder closeups with garment on/off."""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_human as lh
import studio as st

OUT = os.path.join(HERE, "renders")
st.clear_scene()
char = lh.build_character("hero_f", cloth="both", hair="bun")
st.world(0.5)
st.area("key", (1.4, -1.8, 2.2), 300, 1.4, (1, 0.96, 0.9), target=(0.15, 0, 1.35))
st.area("fill", (-1.6, -1.2, 1.6), 90, 1.6, (0.8, 0.86, 1.0), target=(0.1, 0, 1.3))

cam_pos = (0.75, -0.85, 1.62)
st.camera(loc=cam_pos, target=(0.16, 0.0, 1.36), lens=85.0)
st.render(os.path.join(OUT, "diag_shoulder_full.png"), res=(520, 460), samples=12)

char["gear"].hide_render = True
st.render(os.path.join(OUT, "diag_shoulder_nogarment.png"), res=(520, 460), samples=12)

char["gear"].hide_render = False
body = char["body"]
for m in body.modifiers:
    body.modifiers.remove(m)
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_add(type="SUBSURF")
body.modifiers["Subdivision"].levels = 1
body.modifiers["Subdivision"].render_levels = 1
st.render(os.path.join(OUT, "diag_shoulder_nosculpt.png"), res=(520, 460), samples=12)
print("DIAG_DONE")