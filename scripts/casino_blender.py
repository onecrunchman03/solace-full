# Casino asset worker — runs INSIDE headless Blender (see export-casino.mjs).
#
# Two modes, chosen by argv after "--":
#   fbx  <src.fbx> <out.glb> <manifest.json>   import FBX, export GLB w/o images
#   blend <out.glb> <manifest.json>            export the OPENED .blend (embed images)
#
# Both write a manifest of every mesh object (name, dimensions, location,
# triangle count) so layout work reads MEASURED numbers, never guesses —
# the boat/asset rule.

import bpy, json, sys, os

argv = sys.argv[sys.argv.index("--") + 1 :]
mode = argv[0]

if mode == "fbx":
    src, out, manifest = argv[1], argv[2], argv[3]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    image_format = "NONE"  # atlases ship separately as WebP; materials keep names
else:
    out, manifest = argv[1], argv[2]
    image_format = "AUTO"  # bar-pack textures are tiny dithered PNGs — embed them

# Repair broken image links (the FBX references "Atlas 1.png"; we renamed the
# files to atlas-1.png). Harmless for image_format=NONE but keeps Blender quiet.
srcdir = os.path.dirname(bpy.data.filepath or (argv[1] if mode == "fbx" else out))
for img in bpy.data.images:
    if img.packed_file or not img.filepath:
        continue
    p = bpy.path.abspath(img.filepath)
    if not os.path.exists(p):
        alt = os.path.join(srcdir, os.path.basename(p).lower().replace(" ", "-"))
        if os.path.exists(alt):
            img.filepath = alt

rows = []
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    d = o.dimensions
    tris = sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    rows.append(
        {
            "name": o.name,
            "dim": [round(d.x, 3), round(d.y, 3), round(d.z, 3)],
            "loc": [round(v, 3) for v in o.location],
            "tris": tris,
            "mats": [m.name for m in o.data.materials if m],
        }
    )

os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_image_format=image_format,
    export_apply=True,
    export_yup=True,
)
with open(manifest, "w") as f:
    json.dump({"file": os.path.basename(out), "objects": rows}, f, indent=1)
print(f"[casino] {os.path.basename(out)}: {len(rows)} meshes, {os.path.getsize(out)} bytes")
