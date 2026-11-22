# SURVIVORZ, GLENRIDGE HALL: builds the mansion and its grounds in Blender from plan.py.
#   blender -b --factory-startup --python scripts/survivorz/glenridge/build.py -- [--renders day|storm|all] [--res 1280] [--samples 96]
# Out: assets/downloads/survivorz/set/glenridge.blend, and with --renders docs/survivorz/plans/glenridge-*.png
# Blender coords: x east, y north, z up, metres; the front of the house faces -y. (The game's world is x east,
# y up, z south: the glTF exporter's Y-up conversion gives exactly that.)
import bpy, bmesh, math, os, sys, random, json
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import geo
from geo import *
import plan
from plan import *

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSETS = os.environ.get("SURVIVORZ_ASSETS") or os.path.join(ROOT, "assets", "downloads", "survivorz")
PH = os.path.join(ASSETS, "free", "polyhaven")
PLANS = os.path.join(ROOT, "docs", "survivorz", "plans")
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
RENDERS = opt("--renders"); RES = int(opt("--res", "1280")); SAMPLES = int(opt("--samples", "96")); ONLY = opt("--only")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
random.seed(1929)

# ---- materials ----------------------------------------------------------------------------------------
# name: (Poly Haven id, metres one repeat covers, tint or None, roughness scale) or a flat (r, g, b, roughness)
TEX = {
    "brick": ("red_brick_03", 2.0, (0.80, 0.62, 0.55), 1.0), "brickint": ("red_brick_03", 2.0, (0.6, 0.55, 0.5), 1.0),
    "nogging": ("herringbone_brick", 1.1, (2.7, 1.6, 1.6), 1.0), "brickpav": ("red_brick_pavers", 1.6, None, 1.0),
    "slate": ("roof_slates_02", 2.4, (0.62, 0.68, 0.72), 0.55), "stucco": ("white_stucco_02", 2.0, (0.93, 0.87, 0.72), 1.0),
    "cream": ("painted_plaster_wall", 2.5, (0.95, 0.88, 0.62), 1.0),
    "oakpanel": ("oak_veneer_01", 1.0, (0.36, 0.23, 0.15), 0.75), "plaster": ("white_stucco_02", 2.0, (0.84, 0.74, 0.52), 1.0), "oakfloor": ("old_wood_floor", 2.4, (0.62, 0.48, 0.38), 0.8),
    "oakdoor": ("oak_veneer_01", 1.0, (0.2, 0.11, 0.06), 0.7), "pierstone": ("sandstone_blocks_05", 1.4, (0.9, 0.86, 0.78), 1.0), "flag": ("mixed_stone_tiles", 2.4, None, 0.6),
    "slatefloor": ("slate_floor_02", 2.0, None, 0.8), "checker": ("checkered_pavement_tiles", 1.2, (0.55, 0.75, 0.6), 0.6),
    "greentile": ("terracotta_floor_tiles", 1.5, (0.35, 0.6, 0.42), 0.7), "stoneblock": ("large_sandstone_blocks", 2.5, (0.8, 0.78, 0.72), 1.0),
    "stone": ("stacked_stone_wall", 2.0, None, 1.0), "gravel": ("gravel_floor", 3.0, (0.62, 0.6, 0.58), 0.55),
    "grass": ("leafy_grass", 3.0, (0.75, 0.95, 0.6), 1.0), "forest": ("forest_leaves_02", 4.0, (0.8, 0.7, 0.6), 1.0),
    "bark": ("bark_brown_02", 1.2, None, 1.0), "deck": ("dark_wooden_planks", 1.6, None, 1.0),
    "beamdark": ("oak_veneer_01", 1.0, (0.2, 0.12, 0.075), 0.8), "boardceil": ("oak_veneer_01", 1.0, (0.2, 0.125, 0.08), 0.8), "porchceil": ("oak_veneer_01", 1.0, (0.85, 0.62, 0.42), 0.7), "dineyellow": ("painted_plaster_wall", 2.5, (1.0, 0.76, 0.34), 1.0), "oakwall": ("oak_veneer_01", 1.0, (0.36, 0.23, 0.15), 0.75), "oakdark": ("mocha_oak_veneer", 1.0, (0.3, 0.18, 0.11), 0.7), "ochre": ("yellow_plaster", 2.0, None, 1.0),
    "carvedstone": ("white_stucco_02", 1.2, (0.7, 0.66, 0.58), 1.0), "hoodstone": ("white_stucco_02", 1.2, (0.6, 0.54, 0.43), 1.0), "fireback": ("herringbone_brick", 1.0, (1.0, 0.75, 0.6), 1.0),
    "kitchenyellow": ("painted_plaster_wall", 2.5, (0.92, 0.8, 0.28), 0.8), "timber": ("black_oak_veneer", 1.0, (0.34, 0.25, 0.2), 0.85), "brickdark": ("red_brick_03", 1.0, (0.5, 0.36, 0.32), 1.0), "reveal": ("black_oak_veneer", 1.0, (0.6, 0.48, 0.4), 0.9), "corbel": ("black_oak_veneer", 1.0, (0.6, 0.45, 0.36), 0.7),
}
FLAT = {
    "brassware": (0.6, 0.42, 0.14, 0.35),
    "soot": (0.012, 0.011, 0.01, 0.95),
    "ivy": (0.03, 0.08, 0.025, 0.85),
    "timber": (0.10, 0.065, 0.045, 0.7), "plaster": (0.80, 0.72, 0.53, 0.92), "corbel": (0.14, 0.09, 0.06, 0.6), "reveal": (0.16, 0.11, 0.08, 0.8), "limestone": (0.62, 0.58, 0.5, 0.85), "terracotta": (0.62, 0.25, 0.14, 0.8),
    "ceil": (0.85, 0.82, 0.74, 0.9), "beamceil": (0.8, 0.76, 0.64, 0.9), "boardceil": (0.2, 0.14, 0.1, 0.7), "boardblue": (0.2, 0.42, 0.55, 0.7),
    "strapwork": (0.86, 0.84, 0.78, 0.9), "pinktrim": (0.78, 0.5, 0.48, 0.6), "quiltpeach": (0.72, 0.45, 0.28, 0.9), "lace": (0.8, 0.76, 0.58, 0.95), "canopypink": (0.7, 0.3, 0.26, 0.9), "vault": (0.9, 0.88, 0.8, 0.9), "sunyellow": (0.84, 0.7, 0.36, 0.6), "parasol": (0.16, 0.07, 0.03, 0.8), "grille": (0.7, 0.6, 0.36, 0.6), "lining": (0.87, 0.82, 0.68, 0.9), "greenpaint": (0.13, 0.3, 0.09, 0.45),
    "kitchenyellow": (0.85, 0.8, 0.42, 0.7), "blacktile": (0.03, 0.035, 0.07, 0.25), "whitepaint": (0.85, 0.84, 0.8, 0.6), "peach": (0.93, 0.68, 0.52, 0.8),
    "wallpaper": (0.78, 0.8, 0.76, 0.9), "lead": (0.32, 0.34, 0.36, 0.45), "steel": (0.45, 0.46, 0.48, 0.35), "concrete": (0.42, 0.42, 0.4, 0.9),
    "leaves": (0.05, 0.11, 0.03, 0.9), "iron": (0.02, 0.02, 0.02, 0.5), "glazed": (0.1, 0.1, 0.1, 0.3), "red": (0.4, 0.02, 0.04, 0.8), "hedge": (0.04, 0.1, 0.03, 0.95),
    "water": (0.02, 0.03, 0.035, 0.05),
}
MATS = {}
GAME = bool(os.environ.get("GLEN_GAME"))        # the show's build: a scan keeps its plain picture (a GLB cannot carry the node tints laid over it)
BOARDS = {"plankwall": (2.6, 0.08), "beamdark": (3.2, 0.15), "boardceil": (3.0, 0.14), "porchceil": (3.0, 0.14, (0.1, 0.4, 0.6, 1), (1.0, 0.95, 0.88, 1))}      # (length, width[, the two tones the boards run between])        # boarded surfaces: (board length, board width as the UV sees it)
# what one repeat of each scan really covers, from Poly Haven's own figures (texture-sizes.mjs): brick is brick-sized
SIZES = json.load(open(os.path.join(HERE, "texture-sizes.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "texture-sizes.json")) else {}

def material_of(name):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if name in ("leaded", "frosted"):
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); bk = nt.nodes.new("ShaderNodeTexBrick")
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(45)); mp.inputs["Scale"].default_value = (12, 8, 1)      # diamonds 12 cm wide, 18 tall
        bk.offset = 0.0; bk.inputs["Mortar Size"].default_value = 0.08; bk.inputs["Brick Width"].default_value = 1.0; bk.inputs["Row Height"].default_value = 1.0
        bk.inputs["Color1"].default_value = (0, 0, 0, 1); bk.inputs["Color2"].default_value = (0, 0, 0, 1); bk.inputs["Mortar"].default_value = (1, 1, 1, 1)
        nt.links.new(tc.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], bk.inputs["Vector"])
        tr = nt.nodes.new("ShaderNodeBsdfTransparent"); tr.inputs["Color"].default_value = (0.86, 0.9, 0.84, 1) if name == "leaded" else (0.5, 0.5, 0.48, 1)
        gl = nt.nodes.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.04 if name == "leaded" else 0.5
        mx = nt.nodes.new("ShaderNodeMixShader"); mx.inputs[0].default_value = 0.24 if name == "leaded" else 0.5
        # old glass: every quarry sits at its own slight tilt, so each catches the sky or a lamp differently
        fl = nt.nodes.new("ShaderNodeVectorMath"); fl.operation = "FLOOR"; nt.links.new(mp.outputs["Vector"], fl.inputs[0])
        wn = nt.nodes.new("ShaderNodeTexWhiteNoise"); wn.noise_dimensions = "3D"; nt.links.new(fl.outputs[0], wn.inputs["Vector"])
        sb = nt.nodes.new("ShaderNodeVectorMath"); sb.operation = "SUBTRACT"; sb.inputs[1].default_value = (0.5, 0.5, 0.5); nt.links.new(wn.outputs["Color"], sb.inputs[0])
        sc = nt.nodes.new("ShaderNodeVectorMath"); sc.operation = "SCALE"; sc.inputs["Scale"].default_value = 0.09; nt.links.new(sb.outputs[0], sc.inputs[0])
        gn = nt.nodes.new("ShaderNodeNewGeometry"); ad = nt.nodes.new("ShaderNodeVectorMath"); ad.operation = "ADD"; nt.links.new(gn.outputs["Normal"], ad.inputs[0]); nt.links.new(sc.outputs[0], ad.inputs[1])
        nr = nt.nodes.new("ShaderNodeVectorMath"); nr.operation = "NORMALIZE"; nt.links.new(ad.outputs[0], nr.inputs[0]); nt.links.new(nr.outputs[0], gl.inputs["Normal"])
        nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2])
        b.inputs["Base Color"].default_value = (0.1, 0.1, 0.11, 1); b.inputs["Roughness"].default_value = 0.45; b.inputs["Metallic"].default_value = 0.7
        m2 = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(bk.outputs["Color"], m2.inputs[0]); nt.links.new(mx.outputs[0], m2.inputs[1]); nt.links.new(b.outputs[0], m2.inputs[2])
        nt.links.new(m2.outputs[0], out.inputs["Surface"])
    elif name.startswith("img:"):
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(os.path.join(ASSETS, "free", "art", name[4:]), check_existing=True)
        nt.links.new(n.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.92
    elif name == "wallpaper":                          # the bedrooms' paper: a pale blue ground sprigged in red (photo 32)
        tc = nt.nodes.new("ShaderNodeTexCoord"); vo = nt.nodes.new("ShaderNodeTexVoronoi"); vo.voronoi_dimensions = "2D"; vo.inputs["Scale"].default_value = 11.0; vo.inputs["Randomness"].default_value = 0.25
        nt.links.new(tc.outputs["UV"], vo.inputs["Vector"])
        cr = nt.nodes.new("ShaderNodeValToRGB"); e2 = cr.color_ramp.elements; e2[0].position = 0.14; e2[0].color = (0.5, 0.2, 0.22, 1); e2[1].position = 0.22; e2[1].color = (0.56, 0.68, 0.7, 1)
        nt.links.new(vo.outputs["Distance"], cr.inputs[0]); nt.links.new(cr.outputs[0], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.9
    elif name == "latticecarpet":                      # the bedroom carpet: a pink trellis on navy
        tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); bk = nt.nodes.new("ShaderNodeTexBrick")
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(45)); mp.inputs["Scale"].default_value = (9, 9, 1)
        bk.offset = 0.0; bk.inputs["Mortar Size"].default_value = 0.1; bk.inputs["Brick Width"].default_value = 1.0; bk.inputs["Row Height"].default_value = 1.0
        bk.inputs["Color1"].default_value = (0.02, 0.03, 0.1, 1); bk.inputs["Color2"].default_value = (0.035, 0.04, 0.13, 1); bk.inputs["Mortar"].default_value = (0.5, 0.22, 0.27, 1)
        nt.links.new(tc.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], bk.inputs["Vector"]); nt.links.new(bk.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.96
    elif name == "bluestone":                          # the sun room's and the arcade's floor: blue-grey and near-black slate flags
        tc = nt.nodes.new("ShaderNodeTexCoord"); bk = nt.nodes.new("ShaderNodeTexBrick"); bk.offset = 0.5; bk.inputs["Scale"].default_value = 1.0
        bk.inputs["Brick Width"].default_value = 0.62; bk.inputs["Row Height"].default_value = 0.41; bk.inputs["Mortar Size"].default_value = 0.006
        bk.inputs["Color1"].default_value = (0.035, 0.042, 0.055, 1); bk.inputs["Color2"].default_value = (0.13, 0.16, 0.19, 1); bk.inputs["Mortar"].default_value = (0.02, 0.02, 0.02, 1)
        nt.links.new(tc.outputs["UV"], bk.inputs["Vector"])
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 9.0; nz.inputs["Detail"].default_value = 6.0; nt.links.new(tc.outputs["UV"], nz.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[3].default_value = 0.7; mr.inputs[4].default_value = 1.2; nt.links.new(nz.outputs[0], mr.inputs[0])
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
        nt.links.new(bk.outputs["Color"], mx.inputs["A"]); nt.links.new(mr.outputs[0], mx.inputs["B"]); nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
        rr = nt.nodes.new("ShaderNodeMapRange"); rr.inputs[3].default_value = 0.22; rr.inputs[4].default_value = 0.5; nt.links.new(nz.outputs[0], rr.inputs[0]); nt.links.new(rr.outputs[0], b.inputs["Roughness"])
        bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.5; bp.inputs["Distance"].default_value = 0.006
        sb = nt.nodes.new("ShaderNodeMath"); sb.operation = "SUBTRACT"; nt.links.new(nz.outputs[0], sb.inputs[0]); nt.links.new(bk.outputs["Fac"], sb.inputs[1])
        nt.links.new(sb.outputs[0], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    elif name == "kitchenfloor":                       # the kitchen's linoleum: black and green squares, a soft shine
        tc = nt.nodes.new("ShaderNodeTexCoord"); ck = nt.nodes.new("ShaderNodeTexChecker"); ck.inputs["Scale"].default_value = 1 / 0.23
        ck.inputs["Color1"].default_value = (0.012, 0.016, 0.016, 1); ck.inputs["Color2"].default_value = (0.1, 0.27, 0.18, 1); nt.links.new(tc.outputs["UV"], ck.inputs["Vector"])
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6.0; nz.inputs["Detail"].default_value = 6.0; nt.links.new(tc.outputs["UV"], nz.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[3].default_value = 0.75; mr.inputs[4].default_value = 1.15; nt.links.new(nz.outputs[0], mr.inputs[0])
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
        nt.links.new(ck.outputs["Color"], mx.inputs["A"]); nt.links.new(mr.outputs[0], mx.inputs["B"]); nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
        rr = nt.nodes.new("ShaderNodeMapRange"); rr.inputs[3].default_value = 0.2; rr.inputs[4].default_value = 0.42; nt.links.new(nz.outputs[0], rr.inputs[0]); nt.links.new(rr.outputs[0], b.inputs["Roughness"])
    elif name == "slate":
        # The real roof is thick slates of mixed quarries: grey-blue, green, purple, a few rusty. Each slate takes its
        # own colour and its own height (so every lower edge catches the light); rows run along the ridge (the UV's u).
        L = nt.links.new; tc = nt.nodes.new("ShaderNodeTexCoord"); bk = nt.nodes.new("ShaderNodeTexBrick")
        bk.offset = 0.5; bk.inputs["Scale"].default_value = 1.0; bk.inputs["Brick Width"].default_value = 0.27; bk.inputs["Row Height"].default_value = 0.17
        bk.inputs["Mortar Size"].default_value = 0.006; bk.inputs["Color1"].default_value = (0, 0, 0, 1); bk.inputs["Color2"].default_value = (1, 1, 1, 1); bk.inputs["Mortar"].default_value = (0.0, 0.0, 0.0, 1)
        L(tc.outputs["UV"], bk.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.interpolation = "CONSTANT"; el = ramp.color_ramp.elements
        cols = [(0.0, (0.105, 0.125, 0.15)), (0.22, (0.115, 0.145, 0.125)), (0.4, (0.085, 0.095, 0.115)), (0.55, (0.14, 0.12, 0.155)), (0.7, (0.13, 0.14, 0.15)), (0.84, (0.1, 0.125, 0.115)), (0.95, (0.16, 0.125, 0.1))]
        el[0].position = 0.0; el[0].color = (*cols[0][1], 1); el[1].position = cols[1][0]; el[1].color = (*cols[1][1], 1)
        for p_, c_ in cols[2:]: e_ = el.new(p_); e_.color = (*c_, 1)
        L(bk.outputs["Color"], ramp.inputs[0])
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 22.0; nz.inputs["Detail"].default_value = 4.0; L(tc.outputs["UV"], nz.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[3].default_value = 0.72; mr.inputs[4].default_value = 1.2; L(nz.outputs[0], mr.inputs[0])
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
        L(ramp.outputs[0], mx.inputs["A"]); L(mr.outputs[0], mx.inputs["B"])
        gap = nt.nodes.new("ShaderNodeMix"); gap.data_type = "RGBA"; gap.blend_type = "MIX"                # dark in the joints between slates
        L(bk.outputs["Fac"], gap.inputs["Factor"]); L(mx.outputs["Result"], gap.inputs["A"]); gap.inputs["B"].default_value = (0.015, 0.015, 0.02, 1)
        L(gap.outputs["Result"], b.inputs["Base Color"])
        rr = nt.nodes.new("ShaderNodeMapRange"); rr.inputs[3].default_value = 0.22; rr.inputs[4].default_value = 0.5; L(nz.outputs[0], rr.inputs[0]); L(rr.outputs[0], b.inputs["Roughness"])
        hs = nt.nodes.new("ShaderNodeMath"); hs.operation = "MULTIPLY_ADD"; hs.inputs[1].default_value = 0.5; L(bk.outputs["Color"], hs.inputs[0])   # each slate's own height, + grain
        ns = nt.nodes.new("ShaderNodeMath"); ns.operation = "MULTIPLY"; ns.inputs[1].default_value = 0.12; L(nz.outputs[0], ns.inputs[0]); L(ns.outputs[0], hs.inputs[2])
        jn = nt.nodes.new("ShaderNodeMath"); jn.operation = "SUBTRACT"; L(hs.outputs[0], jn.inputs[0]); L(bk.outputs["Fac"], jn.inputs[1])
        bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.9; bp.inputs["Distance"].default_value = 0.012
        L(jn.outputs[0], bp.inputs["Height"]); L(bp.outputs["Normal"], b.inputs["Normal"])
    elif name in TEX:
        pid, size, tint, rs = TEX[name]
        if max(SIZES.get(pid, (0, 0))) > 0.05: size = max(SIZES[pid])
        tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / size, 1 / size, 1)
        nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
        def img(suffix, colour):
            p = os.path.join(PH, pid, "%s_%s_2k.jpg" % (pid, suffix))
            if not os.path.exists(p): return None
            n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(p, check_existing=True)
            if not colour: n.image.colorspace_settings.name = "Non-Color"
            nt.links.new(mp.outputs["Vector"], n.inputs["Vector"]); return n
        d = img("diff", True)
        if d:
            if tint:                                          # (a plain multiply by one colour reaches a GLB as the material's colour factor: checked Nov 12)
                mixn = nt.nodes.new("ShaderNodeMix"); mixn.data_type = "RGBA"; mixn.blend_type = "MULTIPLY"; mixn.inputs["Factor"].default_value = 1.0
                nt.links.new(d.outputs["Color"], mixn.inputs["A"]); mixn.inputs["B"].default_value = (*tint, 1)
                col_ = mixn.outputs["Result"]
            else: col_ = d.outputs["Color"]
            if name in ("brick", "brickdark") and not GAME:   # hand-made brick: patches burnt darker, patches paler, a few purple
                nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1.7; nz.inputs["Detail"].default_value = 5.0; nt.links.new(tc.outputs["UV"], nz.inputs["Vector"])
                cr = nt.nodes.new("ShaderNodeValToRGB"); e2 = cr.color_ramp.elements; e2[0].position = 0.3; e2[0].color = (0.55, 0.48, 0.52, 1); e2[1].position = 0.72; e2[1].color = (1.12, 1.0, 0.94, 1)
                nt.links.new(nz.outputs[0], cr.inputs[0])
                m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "MULTIPLY"; m2.inputs["Factor"].default_value = 1.0
                nt.links.new(col_, m2.inputs["A"]); nt.links.new(cr.outputs[0], m2.inputs["B"]); col_ = m2.outputs["Result"]
            if name in BOARDS:                                # boarding: every board its own tone, a dark joint between
                bk = nt.nodes.new("ShaderNodeTexBrick"); bk.offset = 0.5; bk.inputs["Scale"].default_value = 1.0
                bk.inputs["Brick Width"].default_value = BOARDS[name][0]; bk.inputs["Row Height"].default_value = BOARDS[name][1]; bk.inputs["Mortar Size"].default_value = 0.004
                bk.inputs["Color1"].default_value = BOARDS[name][2] if len(BOARDS[name]) > 2 else (0.7, 0.7, 0.7, 1); bk.inputs["Color2"].default_value = BOARDS[name][3] if len(BOARDS[name]) > 2 else (1.1, 1.05, 1.0, 1); bk.inputs["Mortar"].default_value = (0.07, 0.05, 0.04, 1)
                nt.links.new(tc.outputs["UV"], bk.inputs["Vector"])
                m3 = nt.nodes.new("ShaderNodeMix"); m3.data_type = "RGBA"; m3.blend_type = "MULTIPLY"; m3.inputs["Factor"].default_value = 1.0
                nt.links.new(col_, m3.inputs["A"]); nt.links.new(bk.outputs["Color"], m3.inputs["B"]); col_ = m3.outputs["Result"]
            if name in ("grass", "forest") and not GAME:      # a lawn is never one green: worn and lush patches a few metres across
                nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.3; nz.inputs["Detail"].default_value = 6.0; nt.links.new(tc.outputs["UV"], nz.inputs["Vector"])
                cr = nt.nodes.new("ShaderNodeValToRGB"); e2 = cr.color_ramp.elements; e2[0].position = 0.32; e2[0].color = (0.62, 0.6, 0.42, 1); e2[1].position = 0.7; e2[1].color = (1.08, 1.12, 0.9, 1)
                nt.links.new(nz.outputs[0], cr.inputs[0])
                m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "MULTIPLY"; m2.inputs["Factor"].default_value = 1.0
                nt.links.new(col_, m2.inputs["A"]); nt.links.new(cr.outputs[0], m2.inputs["B"]); col_ = m2.outputs["Result"]
            nt.links.new(col_, b.inputs["Base Color"])
        r = img("rough", False)
        if r:
            mt = nt.nodes.new("ShaderNodeMath"); mt.operation = "MULTIPLY"; mt.inputs[1].default_value = rs
            nt.links.new(r.outputs["Color"], mt.inputs[0]); nt.links.new(mt.outputs[0], b.inputs["Roughness"])
        nn = img("nor_gl", False); last = None
        if nn:
            nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(nn.outputs["Color"], nm.inputs["Color"]); last = nm.outputs["Normal"]
        dp = img("disp", False)
        if dp:                                          # the scan's height as a bump over its normal map: mortar joints and grain catch the light
            bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.45; bp.inputs["Distance"].default_value = 0.02
            nt.links.new(dp.outputs["Color"], bp.inputs["Height"])
            if last: nt.links.new(last, bp.inputs["Normal"])
            last = bp.outputs["Normal"]
        if last: nt.links.new(last, b.inputs["Normal"])
    else:
        r, g_, bl, ro = FLAT.get(name, (0.8, 0.0, 0.8, 0.5))
        b.inputs["Base Color"].default_value = (r, g_, bl, 1); b.inputs["Roughness"].default_value = ro
        if name in ("lead", "steel", "iron", "brassware"): b.inputs["Metallic"].default_value = 0.9
    MATS[name] = m
    return m

def emissive(name, rgb, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Emission Color"].default_value = (*rgb, 1); b.inputs["Emission Strength"].default_value = strength
    MATS[name] = m

emissive("glow", (1.0, 0.62, 0.3), 14.0); emissive("shade", (1.0, 0.5, 0.2), 1.1)

LIGHTS = []; PLINTH = 0.6
emissive("ember", (1.0, 0.2, 0.03), 2.4)
def flame_mat():
    """Flame: hot and yellow at the foot, red and thinning to nothing at the tip (the height rides in the UV's v)."""
    m = bpy.data.materials.new("fireflame"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"); L = nt.links.new
    tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); L(tc.outputs["UV"], sp.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); el = ramp.color_ramp.elements
    el[0].position = 0.0; el[0].color = (1.0, 0.6, 0.2, 1); el[1].position = 1.0; el[1].color = (0.55, 0.05, 0.0, 1)
    e = el.new(0.45); e.color = (1.0, 0.28, 0.03, 1)
    L(sp.outputs[1], ramp.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission"); L(ramp.outputs[0], em.inputs[0])
    st = nt.nodes.new("ShaderNodeMath"); st.operation = "MULTIPLY_ADD"; st.inputs[1].default_value = -9.0; st.inputs[2].default_value = 10.0
    L(sp.outputs[1], st.inputs[0]); L(st.outputs[0], em.inputs[1])
    geo_ = nt.nodes.new("ShaderNodeNewGeometry"); nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 11.0
    L(geo_.outputs["Position"], nz.inputs["Vector"])
    fac = nt.nodes.new("ShaderNodeMath"); fac.operation = "MULTIPLY_ADD"; fac.inputs[1].default_value = 1.2; fac.inputs[2].default_value = -0.42
    L(sp.outputs[1], fac.inputs[0])
    nsc = nt.nodes.new("ShaderNodeMath"); nsc.operation = "MULTIPLY"; nsc.inputs[1].default_value = 0.6; L(nz.outputs[0], nsc.inputs[0])
    add = nt.nodes.new("ShaderNodeMath"); add.operation = "ADD"; add.use_clamp = True; L(fac.outputs[0], add.inputs[0]); L(nsc.outputs[0], add.inputs[1])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mx = nt.nodes.new("ShaderNodeMixShader")
    L(add.outputs[0], mx.inputs[0]); L(em.outputs[0], mx.inputs[1]); L(tr.outputs[0], mx.inputs[2]); L(mx.outputs[0], out.inputs["Surface"])
    MATS["fireflame"] = m
flame_mat()
def fire(x, y, z, w=0.9, watts=240, along="x"):
    """A burning fire in a grate at (x, y, z), w wide: three logs, embers, flames, and the light it throws."""
    g = G("fires"); rnd = random.Random(int((x * 31 + y * 17) * 100))
    ax = (1, 0) if along == "x" else (0, 1); px = (-ax[1], ax[0])
    for k, (off, lift) in enumerate(((-0.11, 0.07), (0.11, 0.07), (0.0, 0.2))):
        a = Vector((x - ax[0] * w / 2 + px[0] * off, y - ax[1] * w / 2 + px[1] * off, z + lift)); b = Vector((x + ax[0] * w / 2 + px[0] * off, y + ax[1] * w / 2 + px[1] * off, z + lift + rnd.uniform(-0.03, 0.05)))
        d = (b - a).normalized(); s1 = d.cross(Vector((0, 0, 1))).normalized(); s2 = d.cross(s1)
        for i in range(7):
            t0, t1 = 2 * math.pi * i / 7, 2 * math.pi * (i + 1) / 7
            e0, e1 = s1 * math.cos(t0) + s2 * math.sin(t0), s1 * math.cos(t1) + s2 * math.sin(t1)
            g.face([tuple(a + e0 * 0.07), tuple(a + e1 * 0.07), tuple(b + e1 * 0.07), tuple(b + e0 * 0.07)], "bark" if k < 2 or i % 2 else "ember", tuple(e0 + e1))
    hw_, hd_ = (w * 0.42, 0.15) if along == "x" else (0.15, w * 0.42)
    g.box(x - hw_, y - hd_, z, x + hw_, y + hd_, z + 0.03, "ember")
    gfl = G("flames"); gfl.smooth = True
    for k in range(int(15 * w) + 6):                           # tongues of flame: soft teardrops that sway, the tall ones in the middle
        t = rnd.uniform(-0.44, 0.44) * w; o = rnd.uniform(-0.09, 0.09); h = rnd.uniform(0.2, 0.52) * (1 - 0.6 * (abs(t) / (0.5 * w)) ** 2); R = rnd.uniform(0.05, 0.095)
        cx, cy = x + ax[0] * t + px[0] * o, y + ax[1] * t + px[1] * o; sw = (rnd.uniform(-0.07, 0.07), rnd.uniform(-0.05, 0.05)); ph = rnd.uniform(0, 6.28)
        rings = []
        for j in range(9):
            tt = j / 8; r = max(0.003, R * (1 - tt) ** 0.75 * min(1.0, 0.45 + tt * 5))
            ox = sw[0] * tt * tt + 0.014 * math.sin(ph + tt * 7); oy = sw[1] * tt * tt + 0.014 * math.cos(ph + tt * 6)
            rings.append([(cx + ox + r * math.cos(2 * math.pi * i / 8), cy + oy + r * math.sin(2 * math.pi * i / 8), z + 0.1 + h * tt) for i in range(8)])
        for j in range(8):
            for i in range(8):
                i2 = (i + 1) % 8; am = 2 * math.pi * (i + 0.5) / 8
                gfl.face([rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]], "fireflame", (math.cos(am), math.sin(am), 0.3), uvs=[(i / 8, j / 8), ((i + 1) / 8, j / 8), ((i + 1) / 8, (j + 1) / 8), (i / 8, (j + 1) / 8)])
    lamp(x, y, z + 0.32, watts, colour=(1.0, 0.42, 0.13), radius=0.18, name="fire", bulb=False)

WARM = (1.0, 0.66, 0.36)
def lamp(x, y, z, watts, colour=WARM, radius=0.12, name="lamp", bulb=True):
    wx, wy = T(x, y); LIGHTS.append((name, wx, wy, z, watts, colour, radius))
    if bulb: G("glowbits").box(x - 0.045, y - 0.045, z - 0.06, x + 0.045, y + 0.045, z + 0.06, "glow")

# ---- the house ----------------------------------------------------------------------------------------
auto_walls()

def C(): return frame(*BLOCKS["C"][:3])
def Wf(): return frame(*BLOCKS["W"][:3])
def Ef(): return frame(*BLOCKS["E"][:3])
def Sf(): return frame(*BLOCKS["S"][:3])

# -- the Great Hall: the walls above the ground storey, the lining, the hammerbeam trusses ---------------
HX0, HX1, HY0, HY1 = -6.85, 6.85, 3.0, 12.1
HYM = (HY0 + HY1) / 2; PLATE = 5.9; APEX = PLATE + (HY1 - HYM)      # the lining is a 45-degree ceiling, symmetric about the hall
with C():
    wall_x(HY1, -2.3 - 0.07, 2.3 + 0.07, UF + 0.2, EAVE, T_EXT, "brick", "ochre", lvl="1")           # over the inglenook's arch
    for xe, ops in ((HX0, [dict(u0=HYM - 1.7, u1=HYM + 1.7, z0=UF, z1=UF + 2.45, kind="tudor")]), (HX1, [])):
        wall_y(xe, HY0, HY1, UF, PLATE, 0.2, "ochre" if xe < 0 else "plaster", "plaster" if xe < 0 else "ochre", ops, lvl="1")
        with frame(xe, 0, 90):
            G("wall1").prism([(HY0, PLATE), (HY1, PLATE), (HYM, APEX)], -0.1, 0.1, "ochre", "ochre", "ochre")
    gl = G("ceil1")
    for ya, yb in ((HY1, HYM), (HY0, HYM)):
        gl.face([(HX0, ya, PLATE), (HX1, ya, PLATE), (HX1, yb, APEX), (HX0, yb, APEX)], "lining", (0, 0, -1))
    gt = G("hallroof")
    n = 24
    for i in range(n + 1):                                   # the common rafters, dark against the cream boards
        x = HX0 + 0.15 + (HX1 - HX0 - 0.3) * i / n
        for ya in (HY1, HY0): gt.beam((x, ya, PLATE - 0.07), (x, HYM, APEX - 0.07), 0.09, 0.13, "timber", up=(1, 0, 0))
    gt.beam((HX0, HYM, APEX - 0.2), (HX1, HYM, APEX - 0.2), 0.2, 0.3, "timber")
    for ya in (HY0 + 0.12, HY1 - 0.12): gt.beam((HX0, ya, PLATE - 0.15), (HX1, ya, PLATE - 0.15), 0.3, 0.3, "timber")
    for frac in (0.34, 0.67):                                # purlins
        for sg in (-1, 1):
            y = HYM + sg * (HY1 - HYM) * (1 - frac); gt.beam((HX0, y, PLATE + (HY1 - HYM) * frac - 0.2), (HX1, y, PLATE + (HY1 - HYM) * frac - 0.2), 0.2, 0.24, "timber")
    def arc(p0, p1, bulge, w, h, n=6, up=(1, 0, 0)):
        p0, p1 = Vector(p0), Vector(p1); mid = (p0 + p1) / 2; d = p1 - p0
        nrm = Vector((0, -d.z, d.y)); nrm.normalize()
        pts = [p0.lerp(p1, i / n) + nrm * bulge * math.sin(math.pi * i / n) for i in range(n + 1)]
        for a, b in zip(pts, pts[1:]): gt.beam(tuple(a), tuple(b), w, h, "timber", up=up)
    for tx in (HX0 + (HX1 - HX0) * f for f in (0.25, 0.5, 0.75)):
        for sg, yw in ((1, HY1 - 0.1), (-1, HY0 + 0.1)):
            run = lambda d: yw - sg * d                       # d metres in from the wall
            rise = lambda d: PLATE + d                        # the lining's height there
            gt.beam((tx, yw, PLATE - 0.3), (tx, HYM, APEX - 0.3), 0.26, 0.34, "timber", up=(1, 0, 0))      # principal rafter
            gt.beam((tx, yw, 3.6), (tx, yw, PLATE - 0.2), 0.26, 0.26, "timber", up=(1, 0, 0))             # wall post
            gt.beam((tx, yw, PLATE - 0.45), (tx, run(1.5), PLATE - 0.45), 0.26, 0.3, "timber", up=(1, 0, 0))  # hammer beam
            gt.beam((tx, run(1.38), PLATE - 0.4), (tx, run(1.38), rise(1.38) - 0.4), 0.24, 0.24, "timber", up=(1, 0, 0))  # hammer post
            arc((tx, yw - sg * 0.1, 3.9), (tx, run(1.4), PLATE - 0.6), -0.28 * sg, 0.2, 0.2)                 # brace under the hammer beam
            arc((tx, run(1.5), PLATE - 0.3), (tx, run(3.3), rise(3.3) - 0.45), -0.35 * sg, 0.2, 0.22)        # arch brace up to the collar
            gt.box(tx - 0.15, min(yw, run(0.22)), 3.42, tx + 0.15, max(yw, run(0.22)), 3.62, "corbel")      # corbel
        zc = PLATE + 3.3
        gt.beam((tx, HYM - (APEX - zc) + 0.2, zc - 0.35), (tx, HYM + (APEX - zc) - 0.2, zc - 0.35), 0.24, 0.3, "timber", up=(1, 0, 0))   # collar
        gt.beam((tx, HYM, zc - 0.3), (tx, HYM, APEX - 0.3), 0.22, 0.22, "timber", up=(1, 0, 0))             # king post
    # (the two chandeliers and the chimneypiece are built in hall.py)
    # (the gallery's balustrade over the hall is built in stair.py)
    # the two steps down from the gallery and the arches
    gs = G("floor0")
    for xc, w in ((0, 2.4), (-4.7, 1.6), (4.7, 1.6)):
        gs.box(xc - w / 2, HY0 + 0.07, HALL_Z, xc + w / 2, HY0 + 0.07 + 0.32, HALL_Z + 0.18, "oakfloor")
    for xe, sg in ((HX0, 1), (HX1, -1)):
        gs.box(min(xe + sg * 0.07, xe + sg * 0.39), HYM - 1.5, HALL_Z, max(xe + sg * 0.07, xe + sg * 0.39), HYM + 1.5, HALL_Z + 0.18, "oakfloor")
    # sconces and standing lamps
    for x in (-5.9, 5.9): lamp(x, HY1 - 0.35, 2.3, 60, name="sconce")
    for x in (-3.4, 3.4): lamp(x, HY0 + 0.6, 1.5, 70, name="lamp")

# -- the main stair (two flights round a landing under the tall window) ----------------------------------
with C():
    gs = G("joinery0"); RISE = UF / 20
    for i in range(10):       # up the east side, going south
        y1 = -0.35 - i * 0.29; gs.box(-3.35, y1 - 0.29, 0, -2.07, y1, RISE * (i + 1), "oakfloor")
    gs.box(-7.63, -4.33, 0, -2.07, -3.25, RISE * 10, "oakfloor")
    for i in range(10):       # back up the west side, going north
        y0 = -3.25 + i * 0.29; gs.box(-7.63, y0, 0, -6.35, y0 + 0.29, RISE * (11 + i), "oakfloor")
    G("floor1").box(-7.63, -0.35, UF - 0.2, -6.35, 0.0, UF, "oakfloor")
    # (the balustrades, the newels, the carpet and the lantern are built in stair.py)
    lamp(-4.85, -2.0, UF + 0.22, 190, colour=(1.0, 0.6, 0.28), radius=0.15, name="lantern", bulb=False)

# -- the octagonal breakfast room in the east hinge, and the hinges' own walls and floors ----------------
def hinge_poly(pts, lvl, floor="oakfloor", ceil="ceil", z=None, h=None):
    z = z if z is not None else (GF if lvl == 0 else UF); h = h or (3.0 if lvl == 0 else 2.6)
    if floor: G("floor%d" % lvl).face([(x, y, z + 0.001) for x, y in pts], floor, (0, 0, 1))
    if ceil: G("ceil%d" % lvl).face([(x, y, z + h) for x, y in pts], ceil, (0, 0, -1))

OC = (15.9, 5.4); ORAD = 2.4
with Ef():   # the east hinge: where the gallery turns 45 degrees into the service wing
    for lvl, z0, z1, ext in ((0, GF, UF, "brick"), (1, UF, EAVE, "ht:nogging")):
        L = str(lvl); wins = lambda *cs: [dict(u0=c - 0.7, u1=c + 0.7, z0=z0 + 0.9, z1=z0 + 2.2, kind="win") for c in cs]
        wall_x(-HW, -3.36, 2.2 + 0.07, z0 - (0 if lvl else PLINTH), z1, T_EXT, CREAM, ext, wins(-0.6), lvl=L, floor_pos=z0, floor_neg=z0)       # forecourt side
        wall_x(HW, 0.0, 2.2 + 0.07, z0 - (0 if lvl else PLINTH), z1, T_EXT, ext, CREAM, wins(1.1), lvl=L, floor_pos=z0, floor_neg=z0)          # north-east side
        hinge_poly([(0, HW), (2.2, HW), (2.2, -HW), (-3.36, -HW), (2.12, 1.68)], lvl)
    lamp(0.6, -1.2, 2.5, 60); lamp(0.6, -1.2, UF + 2.2, 60)
with C():    # the octagonal breakfast room, between the dining room and the service wing
    a8 = [math.radians(22.5 + 45 * i) for i in range(8)]; rr = ORAD / math.cos(math.radians(22.5))
    pts = [(OC[0] + rr * math.cos(a), OC[1] + rr * math.sin(a)) for a in a8]
    for i in range(8):
        p0, p1 = pts[i], pts[(i + 1) % 8]; L_ = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ang = round(45 * (i + 1)) % 360
        if ang in (270, 180): continue                        # the gallery's wall and the dining room's wall (their doors are in the plan)
        ops = [dict(u0=L_ / 2 - 0.62, u1=L_ / 2 + 0.62, z0=GF + 0.8, z1=GF + 2.3, kind="win")] if ang in (45, 90, 135) else []
        if ang == 0: ops = [dict(u0=L_ / 2 - 0.45, u1=L_ / 2 + 0.45, z0=GF, z1=GF + 2.1, kind="door", id="breakfast-garden")]
        seg_wall(p0, p1, GF - PLINTH, UF + 0.3, T_EXT if ang not in (225,) else T_INT, "mural", "brick", ops, lvl="0", floor_pos=GF, floor_neg=GF)
    G("floor0").face([(x, y, GF + 0.004) for x, y in pts], "bslate", (0, 0, 1))
    for i in range(8):                                        # the tented ceiling and the roof over it
        p0, p1 = pts[i], pts[(i + 1) % 8]
        for k in range(8):                                    # the tent: teal and cream stripes running up to the crown (photo 18)
            a_, b_ = [(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t) for t in (k / 8, (k + 1) / 8)]
            G("ceil0").face([(a_[0], a_[1], 2.75), (b_[0], b_[1], 2.75), (OC[0], OC[1], 3.9)], "tentcream" if k % 2 == 0 else "tent", (0, 0, -1))
        G("joinery0").beam((p0[0], p0[1], 2.74), (OC[0], OC[1], 3.88), 0.07, 0.03, "tent")
        q0, q1 = [(OC[0] + (p[0] - OC[0]) * 1.14, OC[1] + (p[1] - OC[1]) * 1.14) for p in (p0, p1)]
        G("roofR").face([(q0[0], q0[1], UF + 0.15), (q1[0], q1[1], UF + 0.15), (OC[0], OC[1], UF + 2.9)], "slate", (0, 0, 1))
    lamp(OC[0], OC[1], 2.3, 95, colour=(1.0, 0.68, 0.36), radius=0.12, name="lantern", bulb=False)
FLAT["mural"] = (0.62, 0.68, 0.56, 0.9); FLAT["tent"] = (0.02, 0.3, 0.27, 0.8); FLAT["tentcream"] = (0.8, 0.72, 0.45, 0.9)
TEX["bslate"] = ("slate_floor_02", 2.0, (0.5, 0.78, 0.66), 0.6)

with Wf():   # the west hinge
    for lvl, z0, z1, ext in ((0, GF, UF, "brick"), (1, UF, EAVE, "ht:nogging")):
        L = str(lvl); wins = lambda *cs: [dict(u0=c - 0.7, u1=c + 0.7, z0=z0 + 0.9, z1=z0 + 2.2, kind="win") for c in cs]
        wall_x(HW, -3.36, 2.2 + 0.07, z0 - (0 if lvl else PLINTH), z1, T_EXT, ext, OAK, wins(-0.6), lvl=L, floor_pos=z0, floor_neg=z0)          # forecourt side
        wall_x(-HW, 0.0, 2.2 + 0.07, z0 - (0 if lvl else PLINTH), z1, T_EXT, OAK, ext, wins(1.1), lvl=L, floor_pos=z0, floor_neg=z0)           # garden-court side
        hinge_poly([(0, -HW), (2.2, -HW), (2.2, HW), (-3.36, HW), (2.12, -1.68)], lvl)
    lamp(0.6, 1.2, 2.5, 70); lamp(0.6, 1.2, UF + 2.2, 60)

with Sf():   # the solarium wing: Mr. Glenn's "gym" in the roof, and the arcade's ribs
    G("floor1").face([(0, 0, UF + 0.2), (9.5, 0, UF + 0.2), (9.5, 9.1, UF + 0.2), (0, 9.1, UF + 0.2)], "oakfloor", (0, 0, 1))
    gv = G("joinery0")
    for u in (0.15, 3.2, 6.3, 9.4):
        for sg in (-1, 1):
            p0 = Vector((u, 1.45 + sg * 1.36, 2.1)); p1 = Vector((u, 1.45, 3.3))
            pts_ = [p0.lerp(p1, i / 5) + Vector((0, sg * 0.22 * math.sin(math.pi * i / 5), 0.0)) for i in range(6)]
            for a, b in zip(pts_, pts_[1:]): gv.beam(tuple(a), tuple(b), 0.07, 0.07, "gilt", up=(1, 0, 0))
    for u in (1.6, 4.75, 7.9): lamp(u, 1.45, 2.9, 45, name="lantern")
FLAT["gilt"] = (0.75, 0.55, 0.2, 0.4)

# -- roofs ----------------------------------------------------------------------------------------------
with C():
    RIDGE = gable(-15.5, 0.0, 13.4, 12.1, EAVE, hips=(6.0, 6.0))
    gable(11.0, 0.0, 18.6, 3.0, EAVE, hips=(0.0, 1.5))                                    # over the gallery where it runs on to the east wing                         # the great enfolding roof
    lean(-2.0 + T_EXT / 2 + 0.35, -3.9, 6.2, 0.0, 2.95, EAVE + 0.25, low="y0")                              # ...swept down over the vestibule and the cloakrooms
    gable(-8.4, -4.4, -2.0, 2.2, EAVE, ends=("ht:stucco", None)) if False else None
    with frame(0, 0, 90):                                                                # ridges running north-south (x' = +y, y' = -x)
        gable(-4.4, 2.0, 3.2, 7.7, EAVE, ends=("ht:stucco", None))                       # the stair gable, its tall window at the landing
        gable(-2.6, -9.4, -T_EXT / 2 - 0.3, -6.0, 2.8, ends=("brick", None), over=0.3)                # the garden entry's brick gable
        gable(-10.2, -4.3, -4.4 - 0.45, 4.3, 3.05, pitch=40, ends=("ht:stucco", None), lvl="P") # the porte-cochere, as far as the stair gable's front
        gable(12.1 + T_EXT / 2 + 0.45, -13.4, 14.9, -6.85, 3.0, pitch=35, ends=(None, "ht:stucco"))         # the dining porch
        gable(12.1 + T_EXT / 2 + 0.2, -2.3, 14.3, 2.3, UF + 0.2, ends=(None, "brick"), over=0.2)           # the inglenook's own gable
    kp = math.tan(math.radians(40)); zr_ = 3.05 + 4.3 * kp                                # ...and on to the vestibule's wall, stopping at the stair hall's side
    G("roofP").face([(4.75, -4.4, 3.05 - 0.45 * kp), (4.75, -3.6, 3.05 - 0.45 * kp), (0, -3.6, zr_), (0, -4.4, zr_)], "slate", (kp, 0, 1))
    G("roofP").face([(0, -4.4, zr_), (0, -3.6, zr_), (-2.0 - T_EXT / 2, -3.6, 3.05 + (2.3 - T_EXT / 2) * kp), (-2.0 - T_EXT / 2, -4.4, 3.05 + (2.3 - T_EXT / 2) * kp)], "slate", (-kp, 0, 1))
    for x, y, r in ((-2.6, 2.6, 1.25), (2.3, 2.6, 1.25)):                                # the eyelid dormers
        g = G("roofR"); n = 10; zb = EAVE + y
        for i in range(n):
            a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
            g.face([(x - r * math.cos(a0), y - 0.85, zb - 0.85 + 0.55 * math.sin(a0)), (x - r * math.cos(a1), y - 0.85, zb - 0.85 + 0.55 * math.sin(a1)),
                    (x - r * math.cos(a1) * 0.2, y + 0.55 * math.sin(a1) + 0.3, zb + 0.55 * math.sin(a1) + 0.3), (x - r * math.cos(a0) * 0.2, y + 0.55 * math.sin(a0) + 0.3, zb + 0.55 * math.sin(a0) + 0.3)], "slate", (0, -1, 1))
        G("glass1").face([(x - r, y - 0.86, zb - 0.84), (x + r, y - 0.86, zb - 0.84), (x, y - 0.86, zb - 0.3)], "leaded", (0, -1, 0))
    chimney(0.0, 13.3, 2.4, 1.3, UF, 14.3, 3); chimney(-14.9, 6.1, 1.0, 1.7, EAVE - 0.08, 13.0, 2); chimney(7.4, -0.7, 1.5, 1.2, 0, 12.6, 3); chimney(10.1, 11.9, 1.2, 1.0, EAVE, 11.2, 2)
# (each wing's roof runs back under the great roof to meet it: full width only from the wing's own start; the part
# behind that is kept above the bedroom ceilings, or its eaves show inside the rooms it passes over)
with Wf():
    gable(0.3, -HW, 22.0, HW, EAVE, ends=(None, "ht:stucco")); gable(-3.36, -HW + 1.1, 0.75, HW - 1.1, EAVE + 1.1, over=0.0)
    # (a wing's stacks START AT THE EAVES: built up from the ground they stood as brick columns in the rooms below
    # and in two doorways, lit as the outdoors is — the review, Nov 13 2026)
    chimney(19.0, 0.0, 1.4, 1.1, EAVE - 0.08, 12.0, 2)
    G("floor1").box(19.0, -HW, UF - 0.25, 22.0, HW, UF, "deck")
with Ef():
    gable(0.3, -HW, 21.5, HW, EAVE, ends=(None, "ht:nogging")); gable(-3.36, -HW + 1.1, 0.75, HW - 1.1, EAVE + 1.1, over=0.0)
    chimney(12.1, 2.9, 1.3, 1.1, EAVE - 0.08, 12.2, 3); chimney(21.1, 0.5, 1.1, 0.9, EAVE - 0.08, 11.2, 2)
with Sf():
    gable(T_EXT / 2 + 0.45, 0.0, 9.5, 9.1, 3.6, ends=(None, "ht:nogging"))      # stopping at the main house's wall, not inside Mr. Glenn's bedroom
    gable(9.5, 0.0, 10.6, 2.9, 3.6, ends=(None, "brick"), over=0.2)        # the arcade's own little gable over its door

# -- the porte-cochere: stone piers, timber posts and braces, the lanterns --------------------------------
def brace(g, p0, p1, w=0.16, n=6):
    """A curved brace from a post (p0) up to a beam (p1): a quarter of an arch, as the porte-cochere's are."""
    a, b = Vector(p0), Vector(p1); pts = []
    for i in range(n + 1):
        t = math.pi / 2 * i / n; pts.append(Vector((a.x + (b.x - a.x) * (1 - math.cos(t)), a.y + (b.y - a.y) * (1 - math.cos(t)), a.z + (b.z - a.z) * math.sin(t))))
    for q0, q1 in zip(pts, pts[1:]): g.beam(tuple(q0), tuple(q1), w, w + 0.04, "timber")
with C():
    gp = G("porte")
    for x in (-4.1, 4.1):
        for y in (-10.0, -6.9, -3.8):
            gp.box(x - 0.36, y - 0.36, -0.55, x + 0.36, y + 0.36, 0.82, "pierstone"); gp.box(x - 0.4, y - 0.4, 0.82, x + 0.4, y + 0.4, 0.92, "pierstone"); gp.box(x - 0.15, y - 0.15, 0.92, x + 0.15, y + 0.15, 3.05, "timber")
        gp.beam((x, -10.2, 2.95), (x, -3.6, 2.95), 0.26, 0.3, "timber")
        for ya, yb in ((-10.0, -6.9), (-6.9, -3.8)):
            for s_ in (0, 1):
                y0_, y1_ = (ya, ya + 0.9) if s_ == 0 else (yb, yb - 0.9)
                brace(gp, (x, y0_, 1.75), (x, y1_ + (0.5 if s_ == 0 else -0.5), 2.84))
    for y in (-10.0, -3.8): gp.beam((-4.2, y, 2.95), (4.2, y, 2.95), 0.26, 0.3, "timber")
    for s_ in (-1, 1): brace(gp, (s_ * 4.1, -10.0, 1.75), (s_ * 2.2, -10.0, 2.84)); brace(gp, (s_ * 4.1, -3.8, 1.75), (s_ * 2.2, -3.8, 2.84))
    G("ceil0").face([(-4.2, -10.2, 3.02), (4.2, -10.2, 3.02), (4.2, -3.6, 3.02), (-4.2, -3.6, 3.02)], "boardceil", (0, 0, -1))
    lamp(0.2, -6.9, 2.55, 90, name="lantern"); lamp(-1.3, -3.9, 2.0, 35, name="sconce"); lamp(1.7, -3.9, 2.0, 35, name="sconce")
    G("ground").box(-0.9, -4.6, -0.3, 1.3, -3.77, -0.02, "brickpav")

# -- room lamps -------------------------------------------------------------------------------------------
for r in ROOMS:
    if not r.light: continue
    ox, oy, deg, _ = BLOCKS[r.blk]
    with frame(ox, oy, deg):
        area = (r.x1 - r.x0) * (r.y1 - r.y0)
        lamp((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.z + min(r.h, 3.2) - 0.45, (10 + area * 1.2) * r.light, name="room-" + r.id, bulb=False)

# ---- the grounds ------------------------------------------------------------------------------------------
def ground_h(x, y):
    h = -0.3
    if y > 24: h -= 0.14 * (y - 24)
    if x > 52: h -= 0.07 * (x - 52)
    if x < -60: h -= 0.05 * (-60 - x)
    sm = lambda t: max(0.0, min(1.0, t)) ** 2 * (3 - 2 * max(0.0, min(1.0, t)))
    h -= 2.5 * sm((-30.0 - x) / 5.0) * sm((y + 8.0) / 6.0)          # the garden falls away west of the sun room: the stone steps go down it (photo 27)
    return h + 0.25 * math.sin(x * 0.045) * math.cos(y * 0.05) * min(1, max(0, (math.hypot(x, y + 5) - 45) / 30))

gg = G("terrain"); gg.smooth = True; STEP = 5.0; EXT = 210        # shaded smooth: flat, each cell's fold showed as bands in a hard light
i = -EXT
while i < EXT:
    j = -EXT
    while j < EXT:
        if -20 <= i < 15 and 20 <= j < 45: j += STEP; continue                     # the rock garden is built by grounds.py
        gg.face([(i, j, ground_h(i, j)), (i + STEP, j, ground_h(i + STEP, j)), (i + STEP, j + STEP, ground_h(i + STEP, j + STEP)), (i, j + STEP, ground_h(i, j + STEP))], "forest", (0, 0, 1),
                uvs=[(i, j), (i + STEP, j), (i + STEP, j + STEP), (i, j + STEP)])
        j += STEP
    i += STEP

def disc(g, cx, cy, r0, r1, z, mat, n=64, a0=0.0, a1=2 * math.pi):
    for k in range(n):
        p, q = a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n
        o = [(cx + r1 * math.cos(p), cy + r1 * math.sin(p), z), (cx + r1 * math.cos(q), cy + r1 * math.sin(q), z)]
        inner = [(cx + r0 * math.cos(q), cy + r0 * math.sin(q), z), (cx + r0 * math.cos(p), cy + r0 * math.sin(p), z)] if r0 > 0 else [(cx, cy, z)]
        g.face(o + inner, mat, (0, 0, 1))

gr = G("ground")
FC = (0.0, -19.5)                                            # the forecourt: a round lawn, the drive round it and through the porte-cochere
gr.face([(-60, -44, -0.29), (60, -44, -0.29), (60, 0, -0.29), (-60, 0, -0.29)], "grass", (0, 0, 1))
disc(gr, FC[0], FC[1], 9.5, 15.6, -0.27, "gravel"); disc(gr, FC[0], FC[1], 0, 9.5, -0.26, "grass")
gr.face([(-2.6, -34.5, -0.27), (2.6, -34.5, -0.27), (9.5, -70, -0.27), (4.0, -70, -0.27)], "gravel", (0, 0, 1))
gr.face([(4.0, -70, -0.27), (9.5, -70, -0.27), (32, -150, ground_h(32, -150) + 0.03), (26, -150, ground_h(26, -150) + 0.03)], "gravel", (0, 0, 1))
gr.face([(-15.5, 12.1, -0.28), (9, 12.1, -0.28), (9, 22.8, -0.28), (-15.5, 22.8, -0.28)], "flag", (0, 0, 1))                    # the rear terrace
with C():                                                    # the forecourt's well head and lamp posts
    gr.box(1.8, -17.3, -0.3, 2.9, -16.2, 0.45, "stone")
    for x in (-1.6, 0.2):
        gr.beam((x, -15.2, -0.3), (x, -15.2, 2.3), 0.07, 0.07, "iron"); lamp(x, -15.2, 2.4, 28, name="post")

# trees: hardwoods, tall and bare-trunked, thinned round the house, the drive and the lawns
gt_ = G("trees"); gl_ = G("leaves")
def tree(x, y, s):
    z = ground_h(x, y) - 0.2; H = 20 * s; r = 0.34 * s
    n = 7
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        gt_.face([(x + r * math.cos(a0), y + r * math.sin(a0), z), (x + r * math.cos(a1), y + r * math.sin(a1), z),
                  (x + r * 0.45 * math.cos(a1), y + r * 0.45 * math.sin(a1), z + H), (x + r * 0.45 * math.cos(a0), y + r * 0.45 * math.sin(a0), z + H)], "bark", (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0),
                 uvs=[(k * 0.3, 0), (k * 0.3 + 0.3, 0), (k * 0.3 + 0.3, H), (k * 0.3, H)])
    for k in range(7):
        cx, cy, cz = x + random.uniform(-3.5, 3.5) * s, y + random.uniform(-3.5, 3.5) * s, z + H * random.uniform(0.62, 1.05)
        rad = random.uniform(2.6, 4.6) * s
        for (a, b, c) in ICO:
            pa, pb, pc = (Vector(ICOV[i]) * rad * random.uniform(0.85, 1.1) for i in (a, b, c))
            gl_.face([(cx + pa.x, cy + pa.y, cz + pa.z * 0.75), (cx + pb.x, cy + pb.y, cz + pb.z * 0.75), (cx + pc.x, cy + pc.y, cz + pc.z * 0.75)], "leaves", tuple((pa + pb + pc)))

t_ = (1 + 5 ** 0.5) / 2
ICOV = [Vector(v).normalized() for v in [(-1, t_, 0), (1, t_, 0), (-1, -t_, 0), (1, -t_, 0), (0, -1, t_), (0, 1, t_), (0, -1, -t_), (0, 1, -t_), (t_, 0, -1), (t_, 0, 1), (-t_, 0, -1), (-t_, 0, 1)]]
ICO = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]

def clear_of_house(x, y):
    if -48 < x < 46 and -12 < y < 26: return False                         # the house, its courts and terrace
    if math.hypot(x - FC[0], y - FC[1]) < 17.5: return False                # the forecourt
    if -24 < x < 19 and 20 < y < 48: return False                           # the rock garden
    if math.hypot(x + 24, y + 96) < 24: return False                        # the cottage and its court
    if -96 < y < -68 and abs(x - (6.7 + (y + 70) * 1.23)) < 6: return False  # the spur to the garage
    if y < -30 and abs(x - (0 + (-y - 34) * 0.19)) < 5.5: return False      # the drive
    return True
placed = []; TREES = []
for _ in range(2600):
    x, y = random.uniform(-190, 190), random.uniform(-190, 190)
    if not clear_of_house(x, y): continue
    near = math.hypot(x, y + 8)
    if near < 62 and random.random() < 0.72: continue                     # the lawns and garden are open, with a few big specimen trees
    if any((x - px) ** 2 + (y - py) ** 2 < 36 for px, py in placed): continue
    placed.append((x, y)); TREES.append((x, y, random.uniform(0.85, 1.3)))
    if len(placed) >= 420: break

# hedges and foundation planting along the front
with C():
    gh = G("ground")
    gh.box(9.5, -1.2, -0.3, 10.4, -0.4, 0.7, "hedge")

exec(compile(open(os.path.join(HERE, "details.py"), encoding="utf-8").read(), "details.py", "exec"))
exec(compile(open(os.path.join(HERE, "furnish.py"), encoding="utf-8").read(), "furnish.py", "exec"))
exec(compile(open(os.path.join(HERE, "rooms.py"), encoding="utf-8").read(), "rooms.py", "exec"))
exec(compile(open(os.path.join(HERE, "grounds.py"), encoding="utf-8").read(), "grounds.py", "exec"))
exec(compile(open(os.path.join(HERE, "service.py"), encoding="utf-8").read(), "service.py", "exec"))
exec(compile(open(os.path.join(HERE, "polish.py"), encoding="utf-8").read(), "polish.py", "exec"))
exec(compile(open(os.path.join(HERE, "tvd.py"), encoding="utf-8").read(), "tvd.py", "exec"))
exec(compile(open(os.path.join(HERE, "hall.py"), encoding="utf-8").read(), "hall.py", "exec"))
HOLES = []
exec(compile(open(os.path.join(HERE, "stair.py"), encoding="utf-8").read(), "stair.py", "exec"))
exec(compile(open(os.path.join(HERE, "design.py"), encoding="utf-8").read(), "design.py", "exec"))

# ---- finish the meshes ----------------------------------------------------------------------------------
coll = bpy.data.collections.new("glenridge"); scene.collection.children.link(coll)
OBJ = {}
for n_ in ("shrubs", "shrubs2"):
    if n_ in GEOS: GEOS[n_].smooth = True
for name, g in list(GEOS.items()):
    OBJ[name] = g.finish(coll, material_of, solidify=0.1 if name.startswith("roof") else 0.0)
for n_ in ("ground", "terrain", "shrubs", "leafage"): OBJ[n_].location.z = -0.2      # the ground sits below the Great Hall floor (two steps down)
for name, wx, wy, z, watts, colour, radius in LIGHTS:
    L = bpy.data.lights.new(name, "POINT"); L.energy = watts; L.color = colour; L.shadow_soft_size = radius
    o = bpy.data.objects.new(name, L); o.location = (wx, wy, z); coll.objects.link(o)
for r in ROOMS:
    ox, oy, deg, _ = BLOCKS[r.blk]
    with frame(ox, oy, deg):
        e = bpy.data.objects.new("ROOM_" + r.id, None); e.location = (*T((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), r.z); e.empty_display_size = 0.3; coll.objects.link(e)
        e["name"] = r.name; e["level"] = r.lvl; e["size"] = (r.x1 - r.x0, r.y1 - r.y0, r.h); e["turn"] = deg

print("GLENRIDGE: %d rooms, %d lamps, %d doors, %d objects" % (len(ROOMS), len(LIGHTS), len(geo.DOORS), len(OBJ)))
for name, o in OBJ.items(): print("  %-12s %7d faces" % (name, len(o.data.polygons)))

# ---- the sky, the storm, the cameras ---------------------------------------------------------------------
HDRI = os.path.join(PH, "kloppenheim_07_puresky", "kloppenheim_07_puresky_2k.hdr")     # an overcast night sky with breaks of moonlight (CC0)
SKY = {"storm": float(opt("--sky", "0.035")), "flash": float(opt("--skyflash", "0.035"))}       # the scan is far too bright for a storm night as it comes (1.0 reads as an overcast day)
def world(mode):
    w = bpy.data.worlds.new(mode); w.use_nodes = True; scene.world = w
    nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    if mode == "day": bg.inputs["Color"].default_value = (0.75, 0.8, 0.9, 1); bg.inputs["Strength"].default_value = 0.9; return
    if os.path.exists(HDRI):        # the real night sky: cloud to light the wet roofs and to stand behind the trees
        env = nt.nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(HDRI, check_existing=True)
        tint = nt.nodes.new("ShaderNodeMix"); tint.data_type = "RGBA"; tint.blend_type = "MULTIPLY"; tint.inputs["Factor"].default_value = 1.0
        tint.inputs["B"].default_value = (0.55, 0.7, 1.0, 1) if mode == "storm" else (0.6, 0.72, 1.0, 1)
        nt.links.new(env.outputs["Color"], tint.inputs["A"]); nt.links.new(tint.outputs["Result"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = SKY[mode]
    elif mode == "flash": bg.inputs["Color"].default_value = (0.1, 0.14, 0.3, 1); bg.inputs["Strength"].default_value = 0.07
    else: bg.inputs["Color"].default_value = (0.045, 0.06, 0.1, 1); bg.inputs["Strength"].default_value = 0.035

# mist in the rain: a thin haze over the estate, so every lamp has a halo and the lightning has air to light
def make_mist():
    me = bpy.data.meshes.new("mist"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("mist", me); o.scale = (260, 300, 46); o.location = (0, -40, 20); coll.objects.link(o)
    m = bpy.data.materials.new("mist"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    global MIST_VS
    vs = nt.nodes.new("ShaderNodeVolumeScatter"); MIST_VS = vs; vs.inputs["Density"].default_value = float(opt("--mist", "0.0035")); vs.inputs["Anisotropy"].default_value = 0.55
    nt.links.new(vs.outputs[0], out.inputs["Volume"]); me.materials.append(m)
    return o
MIST = make_mist()

sun = bpy.data.lights.new("sky", "SUN"); sun_o = bpy.data.objects.new("sky", sun); coll.objects.link(sun_o)
# IT IS ALWAYS NIGHT (Josh, Nov 12 2026: "night but thundering / lightning, raining"). "storm" is the night between
# flashes: lamps, lit windows, rain. "flash" is the same night in the instant of a lightning stroke: a hard cold light
# from where the bolt is, deep shadows, the bolt itself in the sky behind the house. Never dusk, never day (the "day"
# renders are for checking shapes only).
emissive("boltglow", (0.8, 0.86, 1.0), 420.0)
def make_bolt():
    """The stroke: a thin white channel that jinks every few metres on its way down, with thinner forks."""
    g = Geo("bolt"); random.seed(31)
    def run(p, top, bottom, w, forks, drift=(0.0, 0.0)):
        z = top
        while z > bottom:
            q = (p[0] + random.uniform(-3.5, 3.5) + drift[0], p[1] + random.uniform(-3.5, 3.5) + drift[1], z - random.uniform(4, 9))
            for ax in ((w, 0), (0, w)):
                g.face([(p[0] - ax[0], p[1] - ax[1], z), (p[0] + ax[0], p[1] + ax[1], z), (q[0] + ax[0], q[1] + ax[1], q[2]), (q[0] - ax[0], q[1] - ax[1], q[2])], "boltglow", None)
            if forks and random.random() < 0.16:
                a_ = random.uniform(0, 6.28); run((p[0], p[1]), z, z - random.uniform(25, 70), w * 0.4, 0, (2.2 * math.cos(a_), 2.2 * math.sin(a_)))
            p = (q[0], q[1]); z = q[2]
    run((0.0, 0.0), 240.0, 14.0, 0.55, 1)
    return g.finish(coll, material_of)
def make_glow():
    """The cloud lit from inside round the stroke: a great soft disc of light in the sky behind it, fading to nothing."""
    me = bpy.data.meshes.new("cloudglow"); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("cloudglow", me); coll.objects.link(o)
    m = bpy.data.materials.new("cloudglow"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"); L = nt.links.new
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Location"].default_value = (-0.5, -0.5, 0); mp.inputs["Scale"].default_value = (2, 2, 2)
    gr = nt.nodes.new("ShaderNodeTexGradient"); gr.gradient_type = "SPHERICAL"; L(tc.outputs["Generated"], mp.inputs["Vector"]); L(mp.outputs["Vector"], gr.inputs["Vector"])
    pw = nt.nodes.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 3.0; L(gr.outputs[0], pw.inputs[0])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 5.0; nz.inputs["Detail"].default_value = 5.0; L(tc.outputs["Generated"], nz.inputs["Vector"])
    ml = nt.nodes.new("ShaderNodeMath"); ml.operation = "MULTIPLY"; L(pw.outputs[0], ml.inputs[0]); L(nz.outputs[0], ml.inputs[1])
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs[0].default_value = (0.55, 0.68, 1.0, 1); em.inputs[1].default_value = 7.0
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mx = nt.nodes.new("ShaderNodeMixShader")
    L(ml.outputs[0], mx.inputs[0]); L(tr.outputs[0], mx.inputs[1]); L(em.outputs[0], mx.inputs[2]); L(mx.outputs[0], out.inputs["Surface"])
    me.materials.append(m); o.visible_shadow = False
    return o
GLOW = make_glow()
BOLT = make_bolt()
FLASH_FROM = {"garden": 150.0, "terrace": 150.0, "cottage": -25.0}      # which way the stroke's light falls, by camera (degrees about z)

def sky(mode, cam=None):
    world(mode)
    BOLT.hide_render = GLOW.hide_render = mode != "flash"; MIST.hide_render = mode == "day" or "--nomist" in args
    MIST_VS.inputs["Density"].default_value = float(opt("--mist", "0.0035")) * (0.3 if mode == "flash" else 1.0)      # the stroke lights the wet air: less of it, or the night goes grey
    if mode == "flash" and cam is not None:                      # the bolt stands in the sky behind the house, off to one side of the view
        f = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1)); f.z = 0; f.normalize()
        side = Vector((-f.y, f.x, 0))
        BOLT.location = cam.location + f * 330 + side * 70; BOLT.location.z = 0
        GLOW.location = cam.location + f * 350 + side * 70; GLOW.location.z = 100; GLOW.scale = (170, 170, 170)
        GLOW.rotation_euler = (math.radians(90), 0, math.atan2(f.y, f.x) + math.radians(90))
    if mode == "day": sun.energy = 2.2; sun.color = (1, 0.96, 0.9); sun.angle = math.radians(25); sun_o.rotation_euler = (math.radians(50), 0, math.radians(-25))
    elif mode == "flash": sun.energy = 2.4; sun.color = (0.7, 0.8, 1.0); sun.angle = math.radians(2); sun_o.rotation_euler = (math.radians(62), 0, math.radians(FLASH_FROM.get(cam.name if cam else "", -60.0)))
    else: sun.energy = 0.012; sun.color = (0.55, 0.68, 1.0); sun.angle = math.radians(40); sun_o.rotation_euler = (math.radians(40), 0, math.radians(30))

def camera(name, pos, look, lens=28, ortho=None):
    c = bpy.data.cameras.new(name); c.lens = lens; c.clip_end = 900; c.clip_start = 0.05
    if ortho: c.type = "ORTHO"; c.ortho_scale = ortho
    o = bpy.data.objects.new(name, c); o.location = pos; coll.objects.link(o)
    d = Vector(look) - Vector(pos); o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o

CAMS = {
    "front": (camera("front", (20, -64, 1.9), (-1, 0, 5.0), 30), "storm"),
    "front-flash": (camera("front-flash", (20, -64, 1.9), (-1, 0, 5.0), 30), "flash"),
    "front-day": (camera("front-day", (20, -64, 1.9), (-1, 0, 5.0), 30), "day"),
    "aerial": (camera("aerial", (-58, -78, 62), (-3, 4, 2), 35), "day"),
    "aerial-night": (camera("aerial-night", (-58, -78, 62), (-3, 4, 2), 35), "storm"),
    "garden-night": (camera("garden-night", (-17, 50, -1.6), (-4, 14, 3.5), 26), "storm"),
    "aerial-rear": (camera("aerial-rear", (-62, 70, 48), (-6, 6, 2), 35), "day"),
    "court": (camera("court", (-46, -6, 1.7), (-18, 6, 4.5), 30), "day"),
    "rear": (camera("rear", (-22, 52, -3.5), (-2, 12, 5), 30), "day"),
    "porte": (camera("porte", (9, -13.5, 1.6), (0, -3.5, 2.2), 28), "storm"),
    "hall": (camera("hall", (-6.1, 6.4, 1.25), (6.5, 8.2, 3.6), 17), "storm"),
    "hall-gallery": (camera("hall-gallery", (-5.5, 2.2, UF + 1.6), (3.5, 11.5, 1.0), 16), "storm"),
    "library": (camera("library", (-7.6, 4.0, 1.5), (-15.5, 6.5, 1.7), 17), "storm"),
    "dining": (camera("dining", (7.5, 3.7, 1.55), (12.6, 10.8, 1.1), 17), "storm"),
    "plan-ground": (camera("plan-ground", (-3, 4, 80), (-3, 4, 0), ortho=84), "plan0"),
    "plan-upper": (camera("plan-upper", (-3, 4, 80), (-3, 4, 0), ortho=84), "plan1"),
}

with Ef(): CAMS["kitchen"] = (camera("kitchen", (*T(6.3, -3.1), 1.55), (*T(11.6, 3.2), 1.15), 16), "storm")
with Ef(): CAMS["pantry"] = (camera("pantry", (*T(3.95, -3.35), 1.55), (*T(3.95, 3.5), 1.35), 16), "storm")
with Sf(): CAMS["arcade"] = (camera("arcade", (*T(0.5, 1.45), 1.5), (*T(10.0, 1.45), 1.7), 18), "storm")
CAMS["upper-gallery"] = (camera("upper-gallery", (-7.2, 1.6, UF + 1.5), (10.0, 1.3, UF + 1.35), 18), "storm")
CAMS["breakfast"] = (camera("breakfast", (16.5, 7.1, 1.55), (15.3, 3.4, 1.7), 14), "storm")
CAMS["garden"] = (camera("garden", (-17, 50, -1.6), (-4, 14, 3.5), 26), "flash")
CAMS["terrace"] = (camera("terrace", (-13.5, 21.5, 1.3), (4, 13, 3.2), 24), "flash")
with frame(*COT): CAMS["cottage"] = (camera("cottage", (*T(4, -24), 1.6), (*T(13, 3), 2.4), 28), "flash")
with Ef(): CAMS["basement"] = (camera("basement", (*T(11.6, -3.2), BF + 1.5), (*T(7.5, 1.6), BF + 1.0), 16), "storm")
with Ef(): CAMS["service-stair"] = (camera("service-stair", (*T(13.4, -3.5), 1.55), (*T(13.2, 0.6), 1.6), 15), "storm")
with Sf(): CAMS["stefan"] = (camera("stefan", (*T(8.9, 6.7), UF + 1.75), (*T(1.5, 3.0), UF + 1.3), 16), "storm")
with Sf(): CAMS["stefan-desk"] = (camera("stefan-desk", (*T(0.9, 6.9), UF + 1.75), (*T(8.6, 4.2), UF + 1.4), 16), "storm")
with Ef(): CAMS["cell"] = (camera("cell", (*T(13.4, 0.7), BF + 1.5), (*T(13.4, 3.6), BF + 1.1), 15), "storm")
CAMS["stair"] = (camera("stair", (-7.2, -0.75, UF + 1.65), (-4.3, -3.4, 1.3), 17), "storm")
CAMS["stair-hall"] = (camera("stair-hall", (-2.5, -0.6, 1.55), (-6.6, -3.6, 2.1), 16), "storm")
CAMS["front-left"] = (camera("front-left", (-10.5, -15.5, 1.6), (1.5, -3.0, 3.2), 26), "storm")
CAMS["front-left-day"] = (camera("front-left-day", (-10.5, -15.5, 1.6), (1.5, -3.0, 3.2), 26), "day")
CAMS["gallery"] = (camera("gallery", (9.6, 1.25, 1.5), (-7.0, 1.6, 1.55), 20), "storm")
with Sf(): CAMS["solarium"] = (camera("solarium", (*T(0.9, 8.4), 1.55), (*T(8.6, 3.9), 1.45), 16), "storm")
CAMS["vestibule"] = (camera("vestibule", (1.9, -0.45, 1.5), (-1.0, -3.4, 1.45), 16), "storm")
CAMS["bedroom"] = (camera("bedroom", (-11.0, 3.6, UF + 1.55), (-14.6, 11.2, UF + 1.2), 16), "storm")
CAMS["west-end-day"] = (camera("west-end-day", (-45.0, 8.6, -1.55), (-26.0, 9.4, 3.0), 30), "day")
CAMS["west-end"] = (camera("west-end", (-45.0, 8.6, -1.55), (-26.0, 9.4, 3.0), 30), "storm")
CAMS["boys-bedroom"] = (camera("boys-bedroom", (10.8, 3.5, UF + 1.55), (8.2, 10.8, UF + 1.0), 16), "storm")
CAMS["porch"] = (camera("porch", (-7.5, 10.9, 1.45), (-14.6, 10.3, 1.75), 16), "storm")
with Wf(): CAMS["wing-end-day"] = (camera("wing-end-day", (*T(33.0, -9.0), 0.4), (*T(20.5, 0.5), 3.4), 30), "day")
with Wf(): CAMS["wing-end"] = (camera("wing-end", (*T(33.0, -9.0), 0.4), (*T(20.5, 0.5), 3.4), 30), "storm")
CAMS["car"] = (camera("car", (14.5, -13.5, 1.5), (7.6, -7.2, 0.4), 30), "storm")
CAMS["gate"] = (camera("gate", (6.5, -71.0, 1.7), (4.8, -58.0, 1.4), 26), "storm")
CAMS["study"] = (camera("study", (-4.2, 5.7, BF + 1.6), (1.5, 9.5, BF + 0.9), 17), "storm")
CAMS["hearth-stair"] = (camera("hearth-stair", (-1.9, 12.45, HALL_Z + 1.7), (0.6, 13.1, HALL_Z - 1.2), 16), "storm")
CAMS["great-room"] = (camera("great-room", (0.0, 3.9, HALL_Z + 1.55), (0.0, 13.5, HALL_Z + 2.3), 15), "storm")
scene.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dt in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = dt; prefs.get_devices()
            if any(d.type == dt for d in prefs.devices):
                for d in prefs.devices: d.use = d.type == dt
                scene.cycles.device = "GPU"; print("cycles on", dt); break
        except Exception as e: print("no", dt, e)
except Exception as e: print("cycles prefs:", e)
scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True; scene.cycles.max_bounces = 6; scene.cycles.volume_bounces = 1
scene.render.resolution_x = RES; scene.render.resolution_y = int(RES * 9 / 16); scene.render.image_settings.file_format = "PNG"
try: scene.view_settings.view_transform = "AgX"
except Exception: pass

# ---- the map file: the rooms, the ways between them and the stairs, in the GAME's coords (x east, y up, z south) ----
import json
def gm(x, y, z): return [round(x, 3), round(z, 3), round(-y, 3)]
MAPJ = {"id": "glenridge", "name": "Glenridge Hall", "note": "Written by scripts/survivorz/glenridge/build.py. Metres; x east, y up, z south. A room is a rect turned by its block: `corners` are its four floor corners.",
        "levels": {"-1": BF, "0": GF, "1": UF}, "rooms": [], "ways": [], "stairs": [], "doors": []}
for r in ROOMS:
    with frame(*BLOCKS[r.blk][:3]):
        cs = [gm(*T(x, y), r.z) for x, y in ((r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1))]
        MAPJ["rooms"].append(dict(id=r.id, name=r.name, level=r.lvl, block=r.blk, turn=BLOCKS[r.blk][2], floor=r.z, height=r.h, corners=cs, centre=gm(*T((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), r.z)))
with C(): MAPJ["rooms"].append(dict(id="breakfast-room", name="Breakfast Room", level=0, block="C", turn=0, floor=GF, height=2.75, octagon=dict(centre=gm(OC[0], OC[1], GF), across=ORAD * 2), centre=gm(OC[0], OC[1], GF)))
for nm, blk_, pts_ in (("west-hinge", "W", [(0, -HW), (2.2, -HW), (2.2, HW), (-3.36, HW), (2.12, -1.68)]), ("east-hinge", "E", [(0, HW), (2.2, HW), (2.2, -HW), (-3.36, -HW), (2.12, 1.68)])):
    for lv_, z_ in ((0, GF), (1, UF)):
        with frame(*BLOCKS[blk_][:3]): MAPJ["rooms"].append(dict(id="%s-%d" % (nm, lv_), name="%s Gallery (%s bend)" % ("Long" if lv_ == 0 else "Upper", nm.split("-")[0]), level=lv_, block=blk_, turn=BLOCKS[blk_][2], floor=z_, height=3.0 if lv_ == 0 else 2.6, polygon=[gm(*T(x, y), z_) for x, y in pts_]))
# the grounds a body can walk: yards, each an outline at the ground's own height
YARD_Z = -0.5
for id_, nm_, pts_ in plan.YARDS:
    MAPJ["rooms"].append(dict(id=id_, name=nm_, level=0, block="Y", turn=0, floor=YARD_Z, height=0, outdoor=True, polygon=[gm(x, y, YARD_Z) for x, y in pts_], centre=gm(sum(p[0] for p in pts_) / len(pts_), sum(p[1] for p in pts_) / len(pts_), YARD_Z)))
with frame(*COT):          # the garage court, and the garage itself (a room: its middle door stands open)
    MAPJ["rooms"].append(dict(id="garage-court", name="The Garage Court", level=0, block="Y", turn=COT[2], floor=YARD_Z, height=0, outdoor=True, polygon=[gm(*T(x, y), YARD_Z) for x, y in ((-2, -12.5), (22, -12.5), (22, 0.3), (-2, 0.3))], centre=gm(*T(10, -6), YARD_Z)))
    MAPJ["rooms"].append(dict(id="garage", name="The Garage", level=0, block="Y", turn=COT[2], floor=-0.44, height=3.3, polygon=[gm(*T(x, y), -0.44) for x, y in ((0, 0.3), (16, 0.3), (16, 7.3), (0, 7.3))], centre=gm(*T(8, 3.8), -0.44)))
    YARD_POLY = [("garage", [T(x, y) for x, y in ((0, 0.3), (16, 0.3), (16, 7.3), (0, 7.3))]), ("garage-court", [T(x, y) for x, y in ((-2, -12.5), (22, -12.5), (22, 0.3), (-2, 0.3))])]
YARD_POLY = [(id_, list(pts_)) for id_, nm_, pts_ in plan.YARDS] + YARD_POLY
# what lies beyond a way marked "outside": a wall the plan calls an outside wall may back onto a hinge, the octagon or
# another block's room, so each is looked up by where it leads (half a metre past the wall, either side)
POLY = []     # (id, level, [(x, y), ...]) in Blender coords
for r in ROOMS:
    with frame(*BLOCKS[r.blk][:3]): POLY.append((r.id, r.lvl, [T(x, y) for x, y in ((r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1))]))
POLY.append(("breakfast-room", 0, [(OC[0] + ORAD * 1.08 * math.cos(math.radians(22.5 + 45 * i)), OC[1] + ORAD * 1.08 * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]))
for nm, blk_, pts_ in (("west-hinge", "W", [(0, -HW), (2.2, -HW), (2.2, HW), (-3.36, HW), (2.12, -1.68)]), ("east-hinge", "E", [(0, HW), (2.2, HW), (2.2, -HW), (-3.36, -HW), (2.12, 1.68)])):
    for lv_ in (0, 1):
        with frame(*BLOCKS[blk_][:3]): POLY.append(("%s-%d" % (nm, lv_), lv_, [T(x, y) for x, y in pts_]))
def inside(p, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > p[1]) != (y2 > p[1]) and p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1: c = not c
    return c
LEVEL = {id_: lv_ for id_, lv_, _ in POLY}
for c_ in plan.CONNS:
    b_ = c_["b"]
    if b_ == "outside":
        nx, ny = -math.sin(math.radians(c_["turn"])), math.cos(math.radians(c_["turn"]))
        for sg in (1, -1):
            p = (c_["x"] + sg * 0.5 * nx, c_["y"] + sg * 0.5 * ny)
            hit = next((id_ for id_, lv_, poly in POLY if id_ != c_["a"] and lv_ == LEVEL[c_["a"]] and inside(p, poly)), None)
            if hit: b_ = hit; break
        if b_ == "outside" and LEVEL[c_["a"]] == 0 and c_["id"] != "service-door":      # then the grounds: a metre out, whichever side is not a room
            for sg in (1, -1):
                p = (c_["x"] + sg * 1.0 * nx, c_["y"] + sg * 1.0 * ny)
                if any(lv_ == 0 and inside(p, poly) for id_, lv_, poly in POLY): continue
                hit = next((id_ for id_, poly in YARD_POLY if inside(p, poly)), None)
                if hit: b_ = hit; break
    kind_ = c_["kind"]
    if b_ == "outside" and c_["a"] in ("hall-balcony", "upper-gallery"): b_, kind_ = "great-hall", "overlook"      # a balustrade over the hall, not a way through
    if b_ == "outside" and c_["a"] == "mr-glenn-bedroom": b_ = "stefans-bedroom"
    if b_ == "outside" and c_["id"] == "service-door": b_ = "scullery"
    c_ = dict(c_, kind=kind_)
    MAPJ["ways"].append(dict(kind=c_["kind"], a=c_["a"], b=b_, at=gm(c_["x"], c_["y"], c_["z"]), width=round(c_["width"], 2), height=round(c_["height"], 2), turn=round(c_["turn"], 1), id=c_["id"], **({"sill": c_["sill"]} if c_["kind"] == "window" else {})))
# where rooms run into each other with no wall between (the gallery's three stretches, the hinges, the porch and the arcade)
for a_, b_ in (("gallery-w", "gallery"), ("gallery", "gallery-e"), ("gallery-w", "west-hinge-0"), ("west-hinge-0", "w-corridor"), ("gallery-e", "east-hinge-0"), ("library-porch", "arcade"),
               ("upper-gallery-w", "upper-gallery"), ("upper-gallery", "upper-gallery-e"), ("upper-gallery-w", "west-hinge-1"), ("west-hinge-1", "w-upper-corridor"),
               ("upper-gallery-e", "east-hinge-1"), ("east-hinge-1", "e-upper-corridor")):
    MAPJ["ways"].append(dict(kind="open", a=a_, b=b_))
# the two outside doors built by hand (the octagon's garden door, the scullery's yard door), and the garage's open door: placed from the door list
for id_, a_ in (("breakfast-garden", "breakfast-room"), ("yard-door", "scullery"), ("garage-8", "garage")):
    dr_ = next((d_ for d_ in geo.DOORS if d_[0] == id_), None)
    if dr_ is None: MAPJ["ways"].append(dict(kind="door", a=a_, b="outside", id=id_)); continue
    _, (wx_, wy_), z_, deg_, w_ = dr_; nx, ny = -math.sin(math.radians(deg_)), math.cos(math.radians(deg_)); b_ = "outside"
    for sg in (1, -1):
        p = (wx_ + sg * 1.0 * nx, wy_ + sg * 1.0 * ny)
        if any(lv_ == 0 and inside(p, poly) for id2_, lv_, poly in POLY): continue
        hit = next((id2_ for id2_, poly in YARD_POLY if id2_ != a_ and inside(p, poly)), None)
        if hit: b_ = hit; break
    MAPJ["ways"].append(dict(kind="door", a=a_, b=b_, at=gm(wx_, wy_, 0.0 if a_ != "garage" else -0.44), width=round(w_, 2), height=2.1, turn=round(deg_ % 360, 1), id=id_))
with Sf(): MAPJ["rooms"].append(dict(id="stefans-bedroom", name="Stefan's Bedroom", level=1, block="S", turn=180.0, floor=UF + 0.2, height=2.4, corners=[gm(*T(x, y), UF + 0.2) for x, y in ((0, 1.5), (9.5, 1.5), (9.5, 7.6), (0, 7.6))], centre=gm(*T(4.75, 4.55), UF + 0.2)))
with Ef(): MAPJ["rooms"].append(dict(id="scullery", name="Scullery", level=0, block="E", turn=-45.0, floor=GF, height=2.6, corners=[gm(*T(x, y), GF) for x, y in ((21.5, -2.7), (24.6, -2.7), (24.6, 2.7), (21.5, 2.7))], centre=gm(*T(23.05, 0), GF)))
# (rooms built outside the plan have outlines too: a lamp in Stefan's bedroom was filed under the arcade below it,
# and the garage's and the scullery's under "outside" — the review, Nov 13 2026)
with Sf(): POLY.append(("stefans-bedroom", 1, [T(x, y) for x, y in ((0, 1.5), (9.5, 1.5), (9.5, 7.6), (0, 7.6))]))
with Ef(): POLY.append(("scullery", 0, [T(x, y) for x, y in ((21.5, -2.7), (24.6, -2.7), (24.6, 2.7), (21.5, 2.7))]))
POLY += [(id_, 0, pts_) for id_, pts_ in YARD_POLY if id_ == "garage"]
ENDS = {"main-stair": ("stair-hall", "stair-landing"), "service-stair": ("service-stair", "service-stair-up"), "basement-stair": ("service-stair", "basement-stair"), "hearth-stair": ("inglenook", "hearth-stair")}
for nm, a_, b_, pts_ in STAIRS: MAPJ["stairs"].append(dict(id=nm, fromLevel=a_, toLevel=b_, rooms=list(ENDS[nm]), line=[gm(*p) for p in pts_], **({"gate": "hearth-stone"} if nm == "hearth-stair" else {})))
MAPJ["spots"] = [dict(id=s_[0], kind=s_[1], room=s_[2], at=gm(*s_[3]), stand=[round(s_[4][0], 3), round(-s_[4][1], 3)]) for s_ in SPOTS]      # what a body works at, and where it stands to
for w_ in MAPJ["ways"]:                                         # each broken window is boarded from inside: stood at 0.8 m in, towards the room's middle
    if w_["kind"] != "window": continue
    c_ = next(r_["centre"] for r_ in MAPJ["rooms"] if r_["id"] == w_["a"]); dx_, dz_ = c_[0] - w_["at"][0], c_[2] - w_["at"][2]; t_ = math.radians(w_["turn"])
    nx_, nz_ = math.sin(t_), math.cos(t_)                       # the wall's own normal in the page's (x, z), one way or the other
    if nx_ * dx_ + nz_ * dz_ < 0: nx_, nz_ = -nx_, -nz_
    MAPJ["spots"].append(dict(id="board-" + w_["id"], kind="board", room=w_["a"], at=[w_["at"][0], round(w_["at"][1] + w_.get("sill", 0) + w_["height"] / 2, 3), w_["at"][2]], stand=[round(w_["at"][0] + nx_ * 0.8, 3), round(w_["at"][2] + nz_ * 0.8, 3)], window=w_["id"]))
MAPJ["holes"] = [dict(id=h_[0], level=h_[1], corners=[gm(x, y, h_[2]) for x, y in h_[3]]) for h_ in HOLES]      # floor that opens: never walked over
for id_, (wx, wy), z_, deg_, w_ in geo.DOORS: MAPJ["doors"].append(dict(id=id_, at=gm(wx, wy, z_), turn=round(deg_ % 360, 1), width=round(w_, 2)))
# every room must be reachable on foot from the front door
adj = {}
for w_ in MAPJ["ways"]:
    if w_["kind"] != "overlook": adj.setdefault(w_["a"], set()).add(w_["b"]); adj.setdefault(w_["b"], set()).add(w_["a"])
for st_ in MAPJ["stairs"]: a_, b_ = st_["rooms"]; adj.setdefault(a_, set()).add(b_); adj.setdefault(b_, set()).add(a_)
seen = {"vestibule"}; todo = ["vestibule"]
while todo:
    for n_ in adj.get(todo.pop(), ()):
        if n_ not in seen and n_ != "outside": seen.add(n_); todo.append(n_)
lost = [r_["id"] for r_ in MAPJ["rooms"] if r_["id"] not in seen and not r_.get("outdoor") and r_["id"] != "garage"]      # (the grounds join where their floors meet: the walk map checks those)
print("REACHABLE from the front door: %d of %d rooms%s" % (len(MAPJ["rooms"]) - len(lost), len(MAPJ["rooms"]), "" if not lost else "; NOT reachable: " + ", ".join(lost)))
print("ways to the outside:", sorted(set((w_["a"], w_.get("id") or w_["kind"]) for w_ in MAPJ["ways"] if w_["b"] == "outside")))
json.dump(MAPJ, open(os.path.join(ROOT, "docs", "survivorz", "glenridge-map.json"), "w", encoding="utf-8"), indent=1)
# THE LAMPS AND THE ROOMS' OUTLINES, PER ZONE, for the show's page (client/src/survivorz/room/glenridge.ts): every
# lamp the stills are lit by becomes a "lamp" the page can hand one of its real-time lights to, so furniture and
# people in a room are lit by that room's own lamps; a room is its outline, since the wings stand at 45 degrees.
ZONE_OF_LVL = {0: "glen-ground", 1: "glen-upper", -1: "glen-basement"}; FLOOR_OF_LVL = {0: -0.4, 1: UF, -1: BF}
LAY = {z: {"fixtures": [], "roomPolys": {}} for z in ("glen-ground", "glen-upper", "glen-basement", "glen-outside")}
for id_, lv_, poly in POLY: LAY[ZONE_OF_LVL[lv_]]["roomPolys"][id_] = [[round(x, 2), round(-y, 2)] for x, y in poly]
for name, wx, wy, z, watts, colour, radius in LIGHTS:
    under = [(FLOOR_OF_LVL[lv_], id_, lv_) for id_, lv_, poly in POLY if FLOOR_OF_LVL[lv_] <= z + 0.1 and inside((wx, wy), poly)]
    if under: _, rid, lv_ = max(under); zn = ZONE_OF_LVL[lv_]
    else: rid, zn = "outside", "glen-outside"
    LAY[zn]["fixtures"].append({"kind": "lamp", "at": [round(wx, 2), round(z, 2), round(-wy, 2)], "room": rid, "circuit": "battery", "watts": round(watts)})
json.dump(LAY, open(os.path.join(ROOT, "client", "src", "survivorz", "room", "glenridge-layout.json"), "w", encoding="utf-8"), separators=(",", ":"))
print("lamps for the page:", {z: len(v["fixtures"]) for z, v in LAY.items()})
print("map file: %d rooms, %d ways, %d stairs, %d door leaves" % (len(MAPJ["rooms"]), len(MAPJ["ways"]), len(MAPJ["stairs"]), len(MAPJ["doors"])))

os.makedirs(os.path.join(ASSETS, "set"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ASSETS, "set", os.environ.get("GLEN_BLEND", "glenridge.blend")))      # GLEN_BLEND=glenridge-game.blend keeps the lighter build apart from the stills'

if "--export" in args:
    OBJ["rain"].hide_viewport = True; OBJ["rain"].hide_render = True
    for o in list(coll.objects):
        if o.type == "CAMERA": o.hide_viewport = True
    out = os.path.join(ASSETS, "set", "glenridge.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_lights=True, use_visible=True, export_cameras=False, export_yup=True, export_image_format="JPEG", export_jpeg_quality=85)
    print("exported", out, "%.0f MB" % (os.path.getsize(out) / 1e6))

def show(pred):
    for name, o in OBJ.items(): o.hide_render = not pred(name)

if RENDERS:
    os.makedirs(PLANS, exist_ok=True)
    for name, (cam, mode) in CAMS.items():
        if ONLY and name not in ONLY.split(","): continue
        if RENDERS != "all" and not ONLY and RENDERS != ("storm" if mode in ("storm", "flash") else "day"): continue
        scene.camera = cam; tcoll.hide_render = mode.startswith("plan")
        for k_, c_ in FURN.items(): c_.hide_render = mode.startswith("plan") and str(k_) != mode[-1]
        if mode.startswith("plan"):
            lv = mode[-1]; sky("day"); MIST.hide_render = True; sun.energy = 3.0; sun_o.rotation_euler = (0.25, 0, 0.6)
            keep = ("wall0", "floor0", "frame0", "doors0", "joinery0", "glass0", "ground", "porte") if lv == "0" else ("wall1", "floor1", "frame1", "doors1", "joinery1", "glass1", "wall0", "floor0")
            show(lambda n: n in keep); scene.view_settings.exposure = 0.0; scene.render.resolution_y = RES
        else:
            sky(mode, cam); show(lambda n: True); scene.render.resolution_y = int(RES * 9 / 16)
            OBJ["rain"].hide_render = mode not in ("storm", "flash")
            inside = mode == "storm" and name not in ("front", "porte", "front-left", "aerial-night", "garden-night", "west-end", "wing-end", "gate", "car")
            scene.view_settings.exposure = -0.3 if inside else {"day": 0.0, "storm": 3.2, "flash": 0.9}[mode]
        scene.render.filepath = os.path.join(PLANS, "glenridge-%s.png" % name)
        bpy.ops.render.render(write_still=True); print("rendered", name)
