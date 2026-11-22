# SURVIVORZ: the staff security hall's own pieces (Josh, 2026-10-26: "a multi billion dollar secret
# laboratory"; the references' rules in docs/survivorz/REFERENCES.md round five). Nothing free fitted:
# the free lockers are school/gym steel, the free screens are office beige. Each piece is modelled at its
# real size and written for pack-props.mjs (props-spec src "file:...").
#
#   blender -b --factory-startup --python scripts/survivorz/make-hall.py
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
#
#   staff-lockers        a bank of four full-height lockers in white compact laminate, flush doors with 3 mm
#                        gaps, a finger-pull slot and a steel number plate each, a dark recessed plinth
#                        (references 12: run them up, flush pulls, no dust ledge). 1.6 x 0.55 x 2.15 m.
#   staff-lockers-open   the same bank with its second door left standing open (somebody left in a hurry):
#                        a shelf, a hook, the door's inside face
#   stepover-bench       the stainless step-over bench that marks the clean/dirty line (references 11):
#                        1.2 m, open tube frame, a slatted top
#   device-lockers       the phone and device lockers by the airlock: a 4 x 3 grid of small stainless doors,
#                        each with a black keypad
#   flat-monitor         a 24-inch flat screen on a slim stand, black glass, power off
#   touch-panel          a wall touch panel in a brushed frame (the airlock's control), black glass, off
#   bio-reader           the wall card + palm reader beside a secure door: a black head on a steel plate
import bpy, bmesh, os, math
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox", "ready")
os.makedirs(OUT, exist_ok=True)

def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)

_mats = {}
def mat(name, rgb, rough=0.5, metal=0.0, alpha=1.0):
    """colours are LINEAR (0.32 renders near-white on screen; the white laminate here is 0.62)"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*rgb, 1); bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if alpha < 1: bs.inputs["Alpha"].default_value = alpha
    return m
def mats():
    return {
        "white": mat("laminate_white", (0.45, 0.46, 0.465), 0.42),   # props take the fill light on top; 0.62 read as paper
        "dark": mat("plinth_dark", (0.018, 0.019, 0.021), 0.55),
        "steel": mat("brushed_steel", (0.55, 0.56, 0.57), 0.32, 0.6),
        "black": mat("black_glass", (0.008, 0.009, 0.011), 0.08),
        "rubber": mat("rubber", (0.02, 0.02, 0.02), 0.85),
    }

class Builder:
    """boxes (and tubes) into one mesh, each face carrying its material slot"""
    def __init__(self, name, M):
        self.bm = bmesh.new(); self.name = name; self.slots = []; self.M = M
    def slot(self, key):
        if key not in self.slots: self.slots.append(key)
        return self.slots.index(key)
    def box(self, x0, y0, z0, x1, y1, z1, key, xf=None):
        """Blender axes: x across, y depth (+y is the BACK), z up"""
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r["verts"]
        for v in vs:
            v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
            if xf: v.co = xf @ v.co
        i = self.slot(key)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = i
    def tube(self, a, b, r, key, seg=10):
        a, b = Vector(a), Vector(b)
        d = b - a; L = d.length
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=L)
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        for v in res["verts"]: v.co = (Matrix.Translation((a + b) / 2) @ rot) @ v.co
        i = self.slot(key)
        for f in {f for v in res["verts"] for f in v.link_faces}: f.material_index = i
    def done(self):
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for k in self.slots: me.materials.append(self.M[k])
        o = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(o)
        return o

def export(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=True)
    print("wrote", name)

# ---- the staff lockers: front faces -y, standing on z 0, centred on x ----------------------------------------
def lockers(name, open_door=None):
    fresh(); M = mats()
    W, D, H, N, PL = 1.6, 0.55, 2.15, 4, 0.1
    b = Builder(name, M)
    b.box(-W / 2, -D / 2 + 0.04, 0, W / 2, D / 2, PL, "dark")                 # the recessed plinth
    b.box(-W / 2, -D / 2 + 0.02, PL, W / 2, D / 2, H, "white")               # the carcass
    cw, g = W / N, 0.003
    for i in range(N):
        x0, x1 = -W / 2 + i * cw + g, -W / 2 + (i + 1) * cw - g
        z0, z1 = PL + g, H - g
        front = -D / 2
        if i == open_door:
            # an open door: the dark inside, a shelf and a hook, the door swung 105 degrees on its left hinge
            b.box(x0, front + 0.012, z0, x1, D / 2 - 0.02, z1, "dark")       # the cavity, its face 8 mm proud of the carcass's (never coplanar)
            b.box(x0 + 0.01, front + 0.015, z1 - 0.42, x1 - 0.01, D / 2 - 0.03, z1 - 0.40, "white")   # the shelf
            b.tube((x0 + cw / 2, D / 2 - 0.05, z1 - 0.55), (x0 + cw / 2, D / 2 - 0.12, z1 - 0.58), 0.006, "steel")  # the hook
            hinge = Matrix.Translation((x0, front, 0)) @ Matrix.Rotation(math.radians(-105), 4, "Z") @ Matrix.Translation((-x0, -front, 0))
            b.box(x0, front - 0.018, z0, x1, front, z1, "white", hinge)
            b.box(x0 + 0.02, front - 0.02, z1 - 0.62, x0 + 0.06, front - 0.018, z1 - 0.40, "dark", hinge)  # the pull slot
            continue
        b.box(x0, front - 0.018, z0, x1, front, z1, "white")                 # the door, flush, 18 mm
        # a finger-pull slot on the opening edge, and a small steel number plate up top
        b.box(x1 - 0.06, front - 0.0185, z1 - 0.62, x1 - 0.02, front - 0.012, z1 - 0.40, "dark")
        b.box((x0 + x1) / 2 - 0.05, front - 0.020, z1 - 0.14, (x0 + x1) / 2 + 0.05, front - 0.018, z1 - 0.09, "steel")
    o = b.done()
    export([o], name)

lockers("staff-lockers")
lockers("staff-lockers-open", open_door=1)

# ---- the step-over bench: across x, the top at 0.45 ---------------------------------------------------------
fresh(); M = mats(); b = Builder("stepover-bench", M)
L_, Wd, Ht = 1.2, 0.4, 0.45
for i in range(6):   # the slatted top, 6 slats
    y0 = -Wd / 2 + i * (Wd / 6) + 0.006
    b.box(-L_ / 2, y0, Ht - 0.03, L_ / 2, y0 + Wd / 6 - 0.012, Ht, "steel")
for sx in (-L_ / 2 + 0.06, L_ / 2 - 0.06):
    for sy in (-Wd / 2 + 0.05, Wd / 2 - 0.05):
        b.tube((sx, sy, 0.0), (sx, sy, Ht - 0.03), 0.019, "steel")
    b.tube((sx, -Wd / 2 + 0.05, 0.12), (sx, Wd / 2 - 0.05, 0.12), 0.012, "steel")
b.tube((-L_ / 2 + 0.06, 0, 0.12), (L_ / 2 - 0.06, 0, 0.12), 0.012, "steel")
for sx in (-L_ / 2 + 0.06, L_ / 2 - 0.06):
    for sy in (-Wd / 2 + 0.05, Wd / 2 - 0.05):
        b.box(sx - 0.022, sy - 0.022, 0, sx + 0.022, sy + 0.022, 0.012, "rubber")
export([b.done()], "stepover-bench")

# ---- the device lockers: a 4 x 3 grid on the wall, its back at y +0.0 ---------------------------------------
fresh(); M = mats(); b = Builder("device-lockers", M)
C, R, S, D2, Z0 = 4, 3, 0.32, 0.36, 0.9
b.box(-C * S / 2 - 0.02, 0, Z0 - 0.02, C * S / 2 + 0.02, D2, Z0 + R * S + 0.02, "steel")
for i in range(C):
    for j in range(R):
        x0 = -C * S / 2 + i * S + 0.004; x1 = x0 + S - 0.008
        z0 = Z0 + j * S + 0.004; z1 = z0 + S - 0.008
        b.box(x0, -0.012, z0, x1, 0, z1, "steel")
        b.box(x1 - 0.085, -0.016, z1 - 0.13, x1 - 0.025, -0.012, z1 - 0.03, "black")   # its keypad
export([b.done()], "device-lockers")

# ---- the flat monitor: the screen faces -y, its foot on z 0 -------------------------------------------------
fresh(); M = mats(); b = Builder("flat-monitor", M)
SW, SH, LIFT = 0.545, 0.32, 0.12
b.box(-SW / 2, -0.012, LIFT, SW / 2, 0.012, LIFT + SH, "dark")                       # the body
b.box(-SW / 2 + 0.008, -0.0125, LIFT + 0.018, SW / 2 - 0.008, -0.012, LIFT + SH - 0.008, "black")   # the glass
b.box(-0.03, 0.012, 0.02, 0.03, 0.04, LIFT + 0.14, "steel")                            # the neck
b.box(-0.12, -0.08, 0, 0.12, 0.10, 0.02, "steel")                                    # the foot
export([b.done()], "flat-monitor")

# ---- the touch panel (on a wall, its back at y 0, facing -y; its middle at z 0) -----------------------------
fresh(); M = mats(); b = Builder("touch-panel", M)
b.box(-0.17, -0.02, -0.24, 0.17, 0, 0.24, "steel")
b.box(-0.15, -0.0205, -0.20, 0.15, -0.02, 0.22, "black")
b.box(-0.03, -0.022, -0.226, 0.03, -0.02, -0.214, "dark")   # the home key
export([b.done()], "touch-panel")

# ---- the bio reader (on a wall, facing -y): a steel plate, a black head with the palm plate --------------------
fresh(); M = mats(); b = Builder("bio-reader", M)
b.box(-0.07, -0.01, -0.16, 0.07, 0, 0.16, "steel")
b.box(-0.055, -0.045, -0.02, 0.055, -0.01, 0.13, "dark")
b.box(-0.045, -0.0455, 0.02, 0.045, -0.045, 0.12, "black")                            # the card face
b.box(-0.05, -0.09, -0.14, 0.05, -0.01, -0.06, "dark")                                # the palm rest, sloped out
export([b.done()], "bio-reader")

# ---- the speed gates: five stainless cabinets, four lanes (0.6 / 0.6 / 0.9 accessible / 0.6), glass wings
# shut (the lockdown locked them). You walk through along y (Blender) = +z in the game; centred on x 0.
# References 5: cabinets about 120 mm wide x 1.0 m high, glass wings, a reader at the entry end, a status
# LED strip along the top (dead now).
fresh(); M = mats()
M["wing"] = mat("wing_glass", (0.7, 0.8, 0.76), 0.05, 0.0, alpha=0.22)
M["wing_edge"] = mat("wing_edge", (0.16, 0.3, 0.24), 0.1, 0.0, alpha=0.85)
b = Builder("speed-gates", M)
CW, CL, CH, LANES = 0.12, 1.4, 1.0, [0.6, 0.6, 0.9, 0.6]
total = CW * (len(LANES) + 1) + sum(LANES)
xs = [-total / 2 + CW / 2]
for w in LANES: xs.append(xs[-1] + CW + w)
for i, x in enumerate(xs):
    b.box(x - CW / 2 - 0.02, -CL / 2 - 0.02, 0, x + CW / 2 + 0.02, CL / 2 + 0.02, 0.012, "steel")      # the floor plate
    b.box(x - CW / 2, -CL / 2, 0.012, x + CW / 2, CL / 2, CH - 0.02, "steel")                          # the body
    b.box(x - CW / 2 - 0.002, -CL / 2 - 0.002, CH - 0.02, x + CW / 2 + 0.002, CL / 2 + 0.002, CH, "black")   # black glass top
    for side in (-1, 1):   # the status LED strips, dark, along each upper edge
        b.box(x + side * CW / 2 - (0.004 if side > 0 else 0), -CL / 2 + 0.06, CH - 0.07, x + side * CW / 2 + (0.004 if side < 0 else 0), CL / 2 - 0.06, CH - 0.06, "dark")
    # the reader at the entry end (-y is where you come from): a dark plate sloped up on the top glass
    b.box(x - 0.045, -CL / 2 + 0.05, CH, x + 0.045, -CL / 2 + 0.17, CH + 0.025, "dark")
    b.box(x - 0.038, -CL / 2 + 0.058, CH + 0.025, x + 0.038, -CL / 2 + 0.162, CH + 0.027, "black")
# the wings: from each cabinet's face into the lane, meeting in the middle, 12 mm glass with green edges
for i, w in enumerate(LANES):
    x0 = xs[i] + CW / 2; x1 = xs[i + 1] - CW / 2; mid = (x0 + x1) / 2
    for a, c in ((x0, mid - 0.008), (mid + 0.008, x1)):
        b.box(a, -0.006, 0.18, c, 0.006, 1.08, "wing")
        b.box(c - 0.006 if c > a else c, -0.0065, 0.18, c, 0.0065, 1.08, "wing_edge")
export([b.done()], "speed-gates")

# ---- the walk-through detector: the screening arch the references' halls use -- two white composite panels
# (each 0.6 m deep) with a black-glass header carrying its status bar, on steel feet. Inner 0.76 x 2.05 m.
# You walk through along y (Blender) = +z in the game; the bought one read as weathered concrete.
fresh(); M = mats(); b = Builder("walk-detector", M)
IW, IH, PW, PD = 0.76, 2.05, 0.09, 0.6
for side in (-1, 1):
    x0 = side * IW / 2 if side > 0 else -IW / 2 - PW
    b.box(x0, -PD / 2, 0.03, x0 + PW, PD / 2, IH, "white")                                   # the panel
    b.box(x0 - 0.01, -PD / 2 - 0.02, 0, x0 + PW + 0.01, PD / 2 + 0.02, 0.03, "steel")        # its foot
    b.box(x0 + (PW if side < 0 else 0) - 0.002, -PD / 2 + 0.06, 0.25, x0 + (PW if side < 0 else 0) + 0.002, PD / 2 - 0.06, 1.85, "dark")   # the sensor strip, inside face
b.box(-IW / 2 - PW, -PD / 2, IH, IW / 2 + PW, PD / 2, IH + 0.22, "white")                     # the header
b.box(-IW / 2 - PW + 0.03, -PD / 2 - 0.002, IH + 0.05, IW / 2 + PW - 0.03, -PD / 2, IH + 0.17, "black")  # its display, facing whoever comes
b.box(-IW / 2 - PW + 0.03, PD / 2, IH + 0.05, IW / 2 + PW - 0.03, PD / 2 + 0.002, IH + 0.17, "black")
export([b.done()], "walk-detector")

# ---- the security control room (behind the booth) ---------------------------------------------------------
# video-wall: a 4 x 2 wall of 55-inch screens (1.21 x 0.68 m each) on a black steel frame, 5 mm bezels,
# all dark (power out). Faces -y (+z in the game); its back on y 0, its bottom edge at z 0 (hang it ~0.9 m up).
fresh(); M = mats(); b = Builder("video-wall", M)
SW, SH, C, R, G = 1.21, 0.68, 4, 2, 0.006
W = C * SW + (C - 1) * G; H = R * SH + (R - 1) * G
b.box(-W / 2 - 0.03, 0.0, -0.03, W / 2 + 0.03, 0.09, H + 0.03, "dark")          # the frame behind them
for i in range(C):
    for j in range(R):
        x0 = -W / 2 + i * (SW + G); z0 = j * (SH + G)
        b.box(x0, -0.03, z0, x0 + SW, 0.0, z0 + SH, "dark")                   # each screen's body
        b.box(x0 + 0.004, -0.0305, z0 + 0.004, x0 + SW - 0.004, -0.03, z0 + SH - 0.004, "black")   # its glass
export([b.done()], "video-wall")

# control-console: the twin-operator desk facing the wall: a dark solid-surface top 3.6 x 0.9 m at 0.75,
# a white front modesty panel with a cable trough, two 3-screen arrays on a rear rail. The operators sit
# on the -y side and look toward +y (in the game: sit at -z, face +z).
fresh(); M = mats(); b = Builder("control-console", M)
L2, D2, H2 = 3.6, 0.9, 0.75
b.box(-L2 / 2, -D2 / 2, H2 - 0.04, L2 / 2, D2 / 2, H2, "dark")                 # the top
b.box(-L2 / 2 + 0.03, D2 / 2 - 0.06, 0.06, L2 / 2 - 0.03, D2 / 2 - 0.03, H2 - 0.04, "white")   # the modesty panel (far side)
for x in (-L2 / 2 + 0.05, 0.0, L2 / 2 - 0.05):
    b.box(x - 0.025, -D2 / 2 + 0.1, 0.0, x + 0.025, D2 / 2 - 0.06, H2 - 0.04, "white")   # the leg panels
b.box(-L2 / 2 + 0.05, D2 / 2 - 0.2, H2 - 0.12, L2 / 2 - 0.05, D2 / 2 - 0.06, H2 - 0.04, "steel")   # the cable trough
b.box(-L2 / 2 + 0.1, D2 / 2 - 0.16, H2, L2 / 2 - 0.1, D2 / 2 - 0.12, H2 + 0.04, "steel")         # the monitor rail
for cx in (-0.9, 0.9):
    for k, (dx, turn) in enumerate(((-0.56, 0.35), (0.0, 0.0), (0.56, -0.35))):
        m = Matrix.Translation((cx + dx, D2 / 2 - 0.2, H2 + 0.12)) @ Matrix.Rotation(turn, 4, "Z")
        b.box(-0.27, -0.012, 0.0, 0.27, 0.012, 0.32, "dark", m)                  # a 24-inch screen
        b.box(-0.265, -0.0125, 0.012, 0.265, -0.012, 0.31, "black", m)
        b.box(-0.02, 0.012, -0.12, 0.02, 0.05, 0.1, "steel", m)                   # its arm
    b.box(cx - 0.22, -D2 / 2 + 0.1, H2, cx + 0.22, -D2 / 2 + 0.25, H2 + 0.02, "dark")     # a keyboard
export([b.done()], "control-console")

# server-rack: a 42U cabinet, 0.6 x 1.07 x 2.0 m, perforated black front door (dark slots), a steel frame
# edge; dead status LEDs. Its door faces -y.
fresh(); M = mats(); b = Builder("server-rack", M)
RW, RD, RH = 0.6, 1.07, 2.0
b.box(-RW / 2, -RD / 2, 0.03, RW / 2, RD / 2, RH, "dark")
b.box(-RW / 2 + 0.02, -RD / 2 - 0.004, 0.08, RW / 2 - 0.02, -RD / 2, RH - 0.05, "black")
for k in range(36):   # the perforation, read as rows of slots
    z = 0.14 + k * 0.05
    b.box(-RW / 2 + 0.06, -RD / 2 - 0.006, z, RW / 2 - 0.06, -RD / 2 - 0.004, z + 0.02, "dark")
b.box(-RW / 2, -RD / 2, 0, RW / 2, RD / 2, 0.03, "steel")
export([b.done()], "server-rack")

# ---- the decon entry's PPE wall and bins ----------------------------------------------------------------------
# glove-dispenser: a brushed steel wall rack holding three glove boxes (S / M / L: blue, purple, white nitrile),
# each box's dispensing slot facing -y; its back on y 0, its bottom on z 0 (hang it ~1.2 m up)
fresh(); M = mats()
M["blue"] = mat("box_blue", (0.04, 0.12, 0.42), 0.6); M["purple"] = mat("box_purple", (0.18, 0.06, 0.32), 0.6); M["boxwhite"] = mat("box_white", (0.6, 0.6, 0.58), 0.6)
b = Builder("glove-dispenser", M)
BW, BD, BH = 0.25, 0.13, 0.135
b.box(-0.42, 0, 0, 0.42, 0.012, 0.42, "steel")                                    # the back plate
for i, col in enumerate(("blue", "purple", "boxwhite")):
    x = -0.27 + i * 0.27
    b.box(x - BW / 2 - 0.006, -BD - 0.006, 0.04, x + BW / 2 + 0.006, 0.0, 0.05, "steel")   # its shelf lip
    for k in range(2):   # two boxes stacked in each bay
        z = 0.05 + k * (BH + 0.004)
        b.box(x - BW / 2 + 0.004, -BD, z, x + BW / 2 - 0.004, -0.002, z + BH, col)
    b.box(x - 0.06, -BD - 0.0005, 0.05 + BH + 0.004 + 0.05, x + 0.06, -BD, 0.05 + 2 * BH - 0.03, "dark")   # the top box's slot
export([b.done()], "glove-dispenser")

# biohazard-bin: a red pedal bin, 0.42 x 0.36 x 0.68 m, a black lid and pedal; front faces -y
fresh(); M = mats(); M["red"] = mat("bin_red", (0.42, 0.02, 0.02), 0.45)
b = Builder("biohazard-bin", M)
b.box(-0.21, -0.18, 0.02, 0.21, 0.18, 0.62, "red")
b.box(-0.215, -0.185, 0.62, 0.215, 0.185, 0.66, "dark")       # the lid
b.box(-0.07, -0.24, 0.0, 0.07, -0.18, 0.03, "dark")          # the pedal
b.box(-0.2, -0.17, 0.0, 0.2, 0.17, 0.02, "dark")              # the base
export([b.done()], "biohazard-bin")
