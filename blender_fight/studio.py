"""Studio / arena helpers: cameras, lights, render presets, multi-view output."""

import math
import os

import bpy
from mathutils import Vector

RES = (760, 1000)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def world(strength=0.5, color=(0.030, 0.033, 0.040)):
    w = bpy.data.worlds.new("world")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*color, 1.0)
    bg.inputs[1].default_value = strength
    return w


def area(name, loc, energy, size, color=(1, 1, 1), target=(0, 0, 1.0),
         shape="SQUARE", size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = shape
    data.size = size
    if size_y is not None:
        data.size_y = size_y
    data.color = color
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def spot(name, loc, energy, size_deg, blend=0.35, color=(1, 1, 1),
         target=(0, 0, 1.2), radius=0.12):
    data = bpy.data.lights.new(name, "SPOT")
    data.energy = energy
    data.spot_size = math.radians(size_deg)
    data.spot_blend = blend
    data.color = color
    data.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def camera(name="cam", loc=(1.2, -3.0, 1.4), target=(0, 0, 1.05), lens=85.0,
           dof_target=None, fstop=2.8, roll=0.0):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if roll:
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = cam.rotation_euler.to_quaternion() @ __import__(
            "mathutils").Quaternion((0, 0, 1), math.radians(roll))
    if dof_target is not None:
        data.dof.use_dof = True
        data.dof.focus_distance = (Vector(dof_target) - Vector(loc)).length
        data.dof.aperture_fstop = fstop
    bpy.context.scene.camera = cam
    return cam


def plane(name, size=24.0, z=0.0, mat=None, center=(0, 0)):
    h = size / 2
    me = bpy.data.meshes.new(name)
    me.from_pydata([(center[0] - h, center[1] - h, z), (center[0] + h, center[1] - h, z),
                    (center[0] + h, center[1] + h, z), (center[0] - h, center[1] + h, z)],
                   [], [(0, 1, 2, 3)])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def box(name, center, size, mat=None, rot=(0, 0, 0)):
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    me = bpy.data.meshes.new(name)
    me.from_pydata([(cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
                    (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
                    (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
                    (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz)],
                   [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                    (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = rot
    if mat:
        ob.data.materials.append(mat)
    return ob


def look_at(ob, target, roll=0.0):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()
    if roll:
        from mathutils import Quaternion
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = ob.rotation_euler.to_quaternion() @ Quaternion(
            (0, 0, 1), math.radians(roll))


def render(path, res=RES, samples=48, denoise=True, exposure=0.0):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = denoise
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = exposure
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path