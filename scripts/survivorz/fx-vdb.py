# SURVIVORZ EFFECTS — renders a JangaFX (EmberGen) VDB simulation to frames for a
# flipbook sheet (docs/survivorz/EFFECTS.md §3, step F3). Run by fx-vdb.mjs, never by
# hand:
#   blender -b --factory-startup -P scripts/survivorz/fx-vdb.py -- <job.json>
#
# The job says which files, which frames, how the volume is turned, where the camera
# looks from, and what the volume is made of:
#   fire  — density is soot (dark), `flames` glows through a blackbody ramp
#   dust  — density only, lit by a soft key from above and the room's fill
# The camera is ORTHOGRAPHIC and fitted to the union of the volume's bounds over the
# frames the sheet uses, so the effect never leaves its card and its scale holds from
# frame to frame (the engine sizes the card, not the render). The film is transparent;
# the packer premultiplies.
import bpy, json, math, os, sys
import mathutils

job = json.load(open(sys.argv[sys.argv.index("--") + 1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---- the renderer: Cycles on the GPU ------------------------------------------------
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            break
    except Exception:
        pass
for d in prefs.devices:
    d.use = d.type != "CPU"
sc.cycles.device = "GPU"
sc.cycles.samples = job.get("samples", 96)
sc.cycles.use_denoising = True
sc.cycles.volume_bounces = job.get("bounces", 2)
sc.cycles.volume_step_rate = job.get("stepRate", 1.0)
sc.cycles.volume_max_steps = 2048
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.image_settings.color_depth = "8"
sc.view_settings.view_transform = job.get("view", "AgX")
sc.view_settings.look = "None"
sc.view_settings.exposure = job.get("exposure", 0.0)

# ---- the volume -------------------------------------------------------------------------
files = job["files"]
bpy.ops.object.volume_import(filepath=files[0])
vol = bpy.context.selected_objects[0]
vol.rotation_euler = [math.radians(a) for a in job.get("rot", [90, 0, 0])]
vol.scale = (1, 1, 1)
vol.data.render.space = "OBJECT"
vol.data.render.step_size = 0.0

def show(path):
    # let the last frame's grids go first: the shockwave's late frames are ~90 MB each, and
    # keeping them all ran a 32 GB machine out of memory 60 frames in
    vol.data.grids.unload()
    vol.data.filepath = path
    vol.data.grids.load()
    bpy.context.view_layer.update()

# ---- what it's made of -------------------------------------------------------------------
mat = bpy.data.materials.new("vol")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputMaterial")
pv = nt.nodes.new("ShaderNodeVolumePrincipled")
nt.links.new(pv.outputs[0], out.inputs["Volume"])
dens = nt.nodes.new("ShaderNodeAttribute"); dens.attribute_name = "density"; dens.attribute_type = "GEOMETRY"
dmul = nt.nodes.new("ShaderNodeMath"); dmul.operation = "MULTIPLY"; dmul.inputs[1].default_value = job.get("density", 1.0)
nt.links.new(dens.outputs["Fac"], dmul.inputs[0])
nt.links.new(dmul.outputs[0], pv.inputs["Density"])
pv.inputs["Density Attribute"].default_value = ""
pv.inputs["Color"].default_value = (*job.get("color", [0.5, 0.5, 0.5]), 1)
pv.inputs["Anisotropy"].default_value = job.get("anisotropy", 0.3)
if job["kind"] == "fire":
    fl = nt.nodes.new("ShaderNodeAttribute"); fl.attribute_name = job.get("flameGrid", "flames"); fl.attribute_type = "GEOMETRY"
    # strength rises steeply with the flame value, so the core burns and the edges only glow
    pw = nt.nodes.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = job.get("flamePower", 1.5)
    nt.links.new(fl.outputs["Fac"], pw.inputs[0])
    sm = nt.nodes.new("ShaderNodeMath"); sm.operation = "MULTIPLY"; sm.inputs[1].default_value = job.get("flame", 20.0)
    nt.links.new(pw.outputs[0], sm.inputs[0])
    nt.links.new(sm.outputs[0], pv.inputs["Emission Strength"])
    # colour: a blackbody, hotter where the flame is stronger
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = job.get("flameMax", 1.0)
    mr.inputs["To Min"].default_value = job.get("kelvin", [900, 2400])[0]
    mr.inputs["To Max"].default_value = job.get("kelvin", [900, 2400])[1]
    nt.links.new(fl.outputs["Fac"], mr.inputs["Value"])
    bb = nt.nodes.new("ShaderNodeBlackbody")
    nt.links.new(mr.outputs[0], bb.inputs[0])
    nt.links.new(bb.outputs[0], pv.inputs["Emission Color"])
vol.data.materials.append(mat)

# ---- light: a dim fill, and a soft key from above and in front ---------------------------
world = bpy.data.worlds.new("w")
sc.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (*([job.get("fill", 0.25)] * 3), 1)
if job.get("key", 3.0) > 0:
    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    sun.data.energy = job.get("key", 3.0)
    sun.data.angle = math.radians(25)
    sun.rotation_euler = (math.radians(40), 0, math.radians(20))
    sc.collection.objects.link(sun)
    # the film is transparent, but a sun lights the volume only — nothing else is in the scene

# ---- the camera, fitted to the volume over the frames used -------------------------------
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
yaw, elev = math.radians(job.get("yaw", 0)), math.radians(job.get("elev", 0))
fwd = mathutils.Vector((math.sin(yaw) * math.cos(elev), math.cos(yaw) * math.cos(elev), -math.sin(elev)))  # looking along +Y by default
up = mathutils.Vector((0, 0, 1))
right = fwd.cross(up).normalized()
upv = right.cross(fwd).normalized()
lo = [1e9, 1e9, 1e9]; hi = [-1e9, -1e9, -1e9]
xs, ys, ds = [], [], []
for f in job.get("fit", files):
    show(f)
    for c in vol.bound_box:
        w = vol.matrix_world @ mathutils.Vector(c)
        xs.append(w.dot(right)); ys.append(w.dot(upv)); ds.append(w.dot(fwd))
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
wx, wy = (max(xs) - min(xs)) * job.get("margin", 1.06), (max(ys) - min(ys)) * job.get("margin", 1.06)
centre = right * cx + upv * cy
cam.location = centre + fwd * (min(ds) - 50)
cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
cam.data.clip_end = (max(ds) - min(ds)) + 200
W = job.get("width", 512)
H = max(8, int(round(W * wy / wx / 2)) * 2)
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.resolution_percentage = 100
cam.data.ortho_scale = max(wx, wy)
cam.data.sensor_fit = "AUTO"

os.makedirs(job["out"], exist_ok=True)
info = {"width": W, "height": H, "metresPerPixel": None, "worldWidth": wx, "worldHeight": wy, "frames": []}
for i, f in enumerate(files):
    sc.render.filepath = os.path.join(job["out"], f"frame_{i:03d}.png")
    info["frames"].append(os.path.basename(f))
    if job.get("resume") and os.path.exists(sc.render.filepath):
        continue
    show(f)
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as e:
        # the shockwave's frames are huge, and the card is shared with the house's language
        # model: a frame the GPU can't hold is rendered on the CPU instead
        if "memory" not in str(e).lower() or sc.cycles.device == "CPU":
            raise
        print("GPU out of memory, this frame on the CPU", flush=True)
        sc.cycles.device = "CPU"
        bpy.ops.render.render(write_still=True)
        sc.cycles.device = "GPU"
    print(f"RENDERED {i + 1}/{len(files)}", flush=True)
# where the volume's own origin sits in the frame (0..1), so the engine knows where on the
# card the blast starts (the base of a fireball, the middle of a ring)
o = vol.matrix_world.translation
info["origin"] = [((o.dot(right) - cx) / wx) + 0.5, ((o.dot(upv) - cy) / wy) + 0.5]
json.dump(info, open(os.path.join(job["out"], "render.json"), "w"), indent=1)
print("DONE", json.dumps(info["origin"]))
