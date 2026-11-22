# SURVIVORZ: the research labs' own furniture and the bought chem-lab kit's instruments, dressed
# (2026-10-27; docs/survivorz/REFERENCES.md round seven). A lab's built-ins are made to one system (the
# benches, their service spines, the reagent shelves), so they're modelled here at their real sizes; the kit
# (VadymHetiuk's Modular Modern Chemical Research Laboratory) ships untextured, so its instruments take the
# house palette by their material names. Each faces -y (Blender) = +z in the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-lab.py [-- <id> ...]
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math, bpy
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export, ROOT
from mathutils import Matrix, Vector

ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def want(name): return not ONLY or name in ONLY

def lab_palette():
    M = palette()
    M.update({
        "epoxy": mat("epoxy_black", (0.012, 0.013, 0.014), 0.28),          # the bench tops: black epoxy resin
        "service": mat("service_grey", (0.16, 0.17, 0.175), 0.45),         # the service spine's panels
        "yellow": mat("safety_yellow", (0.62, 0.36, 0.01), 0.5),
        "hose": mat("hose_yellow", (0.7, 0.42, 0.015), 0.55),
        "red": mat("signal_red", (0.45, 0.02, 0.015), 0.45),
        "green": mat("signal_green", (0.02, 0.3, 0.06), 0.45),
        "blue": mat("signal_blue", (0.01, 0.08, 0.35), 0.45),
        "orange": mat("signal_orange", (0.6, 0.15, 0.01), 0.45),
        "grey": mat("plastic_grey", (0.2, 0.21, 0.215), 0.5),
        "oak": mat("white_oak", (0.32, 0.2, 0.1), 0.55),
        "quartz": mat("quartz_grey", (0.3, 0.31, 0.31), 0.3),
        "screen": mat("screen_off", (0.004, 0.005, 0.006), 0.06),
    })
    return M

# ---- lab-bench-island: a 3.6 x 1.5 m peninsula, both sides worked: white carcasses (doors and drawers), a
# black epoxy top, a service spine down the middle (sockets, gas and vacuum taps) carrying two steel reagent
# shelves (references L: the casework system every modern lab is fitted with) --------------------------------
if want("lab-bench-island"):
    fresh(); M = lab_palette(); b = Builder("lab-bench-island", M)
    L, D, H = 3.6, 1.5, 0.9
    for s in (-1, 1):
        y0, y1 = (-D / 2, -0.09) if s < 0 else (0.09, D / 2)
        b.box(-L / 2, y0 + (0.05 if s < 0 else 0), 0.1, L / 2, y1 - (0.05 if s > 0 else 0), H - 0.03, "white")
        b.box(-L / 2, y0 + 0.06, 0.0, L / 2, y1 - 0.06, 0.1, "dark")
        fy = y0 + 0.049 if s < 0 else y1 - 0.049
        for i in range(6):   # six 0.6 m bays a side: a drawer over a door, or a drawer stack
            x = -L / 2 + 0.3 + i * 0.6
            b.box(x - 0.29, fy - 0.002, 0.13, x + 0.29, fy + 0.002, 0.68, "white")
            b.box(x - 0.29, fy - 0.002, 0.7, x + 0.29, fy + 0.002, H - 0.05, "white")
            for z in ((0.62, 0.8) if i % 2 else (0.8,)):
                b.box(x - 0.1, fy - s * 0.02, z, x + 0.1, fy + s * 0.0, z + 0.012, "dark")   # the pulls
        b.box(-L / 2 - 0.02, y0 - (0.02 if s < 0 else 0), H - 0.03, L / 2 + 0.02, y1 + (0.02 if s > 0 else 0), H, "epoxy")
    b.box(-L / 2 - 0.02, -0.09, H - 0.03, L / 2 + 0.02, 0.09, H, "epoxy")
    # the spine: 0.12 wide, to 1.65, its faces carrying sockets and taps every 0.6 m
    b.box(-L / 2 + 0.05, -0.06, H, L / 2 - 0.05, 0.06, 1.62, "service")
    b.box(-L / 2 + 0.05, -0.065, 1.62, L / 2 - 0.05, 0.065, 1.65, "steel")
    for i in range(6):
        x = -L / 2 + 0.3 + i * 0.6
        for s in (-1, 1):
            b.box(x - 0.09, s * 0.06 - 0.003, 1.02, x + 0.09, s * 0.06 + 0.003, 1.1, "white")   # a double socket
            b.tube((x + 0.17, s * 0.06, 1.06), (x + 0.17, s * 0.1, 1.06), 0.01, "steel")       # a tap
            b.box(x + 0.15, s * 0.1 - 0.012, 1.04, x + 0.19, s * 0.1 + 0.012, 1.08, ("blue", "orange", "green")[i % 3])
    # the reagent shelves: steel, on uprights at the ends and the middle, one each side at 1.25 and 1.6
    for x in (-L / 2 + 0.08, 0.0, L / 2 - 0.08):
        b.box(x - 0.015, -0.015, 1.65, x + 0.015, 0.015, 2.05, "steel")
    for z in (1.3, 1.65, 2.0):
        b.box(-L / 2 + 0.06, -0.17, z, L / 2 - 0.06, 0.17, z + 0.02, "steel")
        b.box(-L / 2 + 0.06, -0.175, z + 0.02, L / 2 - 0.06, -0.165, z + 0.06, "steel")   # the lip
        b.box(-L / 2 + 0.06, 0.165, z + 0.02, L / 2 - 0.06, 0.175, z + 0.06, "steel")
    export([b.done()], "lab-bench-island")

# ---- lab-bench-wall: a 3.0 m wall run, 0.75 deep: carcasses, epoxy top with a 0.15 upstand, a service
# trunk along the wall at 1.0 and a steel reagent shelf above it -----------------------------------------------
if want("lab-bench-wall"):
    fresh(); M = lab_palette(); b = Builder("lab-bench-wall", M)
    L, D, H = 3.0, 0.75, 0.9
    b.box(-L / 2, -D / 2 + 0.05, 0.1, L / 2, D / 2, H - 0.03, "white")
    b.box(-L / 2, -D / 2 + 0.11, 0, L / 2, D / 2, 0.1, "dark")
    for i in range(5):
        x = -L / 2 + 0.3 + i * 0.6
        b.box(x - 0.29, -D / 2 + 0.048, 0.13, x + 0.29, -D / 2 + 0.052, H - 0.05, "white")
        b.box(x - 0.1, -D / 2 + 0.03, 0.8, x + 0.1, -D / 2 + 0.05, 0.812, "dark")
    b.box(-L / 2 - 0.01, -D / 2 + 0.03, H - 0.03, L / 2 + 0.01, D / 2, H, "epoxy")
    b.box(-L / 2 - 0.01, D / 2 - 0.02, H, L / 2 + 0.01, D / 2, H + 0.15, "epoxy")
    b.box(-L / 2, D / 2 - 0.1, 0.98, L / 2, D / 2, 1.14, "service")     # the trunk, sockets on it
    for i in range(5):
        x = -L / 2 + 0.3 + i * 0.6
        b.box(x - 0.09, D / 2 - 0.103, 1.02, x + 0.09, D / 2 - 0.097, 1.1, "white")
    for z in (1.45, 1.8):
        b.box(-L / 2 + 0.02, D / 2 - 0.3, z, L / 2 - 0.02, D / 2, z + 0.02, "steel")
        b.box(-L / 2 + 0.02, D / 2 - 0.305, z + 0.02, L / 2 - 0.02, D / 2 - 0.295, z + 0.06, "steel")
    for x in (-L / 2 + 0.05, 0.0, L / 2 - 0.05):
        b.box(x - 0.015, D / 2 - 0.3, 1.45, x + 0.015, D / 2 - 0.28, 1.82, "steel")
    export([b.done()], "lab-bench-wall")

# ---- lab-sink: a 1.5 m wall unit with a deep epoxy sink, a gooseneck tap and an eyewash on its swivel -------
if want("lab-sink"):
    fresh(); M = lab_palette(); b = Builder("lab-sink", M)
    L, D, H = 1.5, 0.75, 0.9
    b.box(-L / 2, -D / 2 + 0.05, 0.1, L / 2, D / 2, H - 0.03, "white")
    b.box(-L / 2, -D / 2 + 0.11, 0, L / 2, D / 2, 0.1, "dark")
    for x in (-0.37, 0.37):
        b.box(x - 0.36, -D / 2 + 0.048, 0.13, x + 0.36, -D / 2 + 0.052, H - 0.05, "white")
    b.box(-L / 2 - 0.01, -D / 2 + 0.03, H - 0.03, L / 2 + 0.01, D / 2, H, "epoxy")
    b.box(-L / 2 - 0.01, D / 2 - 0.02, H, L / 2 + 0.01, D / 2, H + 0.15, "epoxy")
    b.box(-0.3, -0.22, H - 0.002, 0.3, 0.2, H + 0.001, "dark")          # the bowl's mouth
    b.tube((0, 0.3, H), (0, 0.3, H + 0.42), 0.014, "steel")             # the gooseneck
    b.tube((0, 0.3, H + 0.42), (0, 0.1, H + 0.36), 0.012, "steel")
    b.tube((0.45, 0.3, H), (0.45, 0.3, H + 0.18), 0.012, "steel")       # the eyewash
    b.box(0.39, 0.12, H + 0.17, 0.51, 0.3, H + 0.2, "green")
    export([b.done()], "lab-sink")

# ---- fume-hood: 1.5 wide, 0.9 deep, 2.4 to the top of its stack: a base cabinet, the chamber with its sash
# half up, the airflow monitor, the exhaust duct rising out of the top -------------------------------------------
if want("fume-hood"):
    fresh(); M = lab_palette(); b = Builder("fume-hood", M)
    W, D = 1.5, 0.9
    b.box(-W / 2, -D / 2 + 0.05, 0.1, W / 2, D / 2, 0.87, "white")       # the base cabinet
    b.box(-W / 2, -D / 2 + 0.11, 0, W / 2, D / 2, 0.1, "dark")
    for x in (-0.37, 0.37):
        b.box(x - 0.36, -D / 2 + 0.048, 0.13, x + 0.36, -D / 2 + 0.052, 0.84, "white")
    b.box(-W / 2, -D / 2, 0.87, W / 2, D / 2, 0.9, "epoxy")
    b.box(-W / 2, -D / 2 + 0.06, 0.9, -W / 2 + 0.1, D / 2, 2.25, "white")   # the side cheeks
    b.box(W / 2 - 0.1, -D / 2 + 0.06, 0.9, W / 2, D / 2, 2.25, "white")
    b.box(-W / 2, D / 2 - 0.04, 0.9, W / 2, D / 2, 2.25, "white")           # the back baffle
    b.box(-W / 2 + 0.1, -D / 2 + 0.25, 0.9, W / 2 - 0.1, D / 2 - 0.04, 0.905, "dark")   # the work surface
    b.box(-W / 2, -D / 2 + 0.06, 1.85, W / 2, D / 2, 2.25, "white")         # the head
    b.box(-W / 2 + 0.1, -D / 2 + 0.07, 1.25, W / 2 - 0.1, -D / 2 + 0.085, 1.85, "glass")   # the sash, half up
    b.box(-W / 2 + 0.1, -D / 2 + 0.06, 1.23, W / 2 - 0.1, -D / 2 + 0.09, 1.27, "steel")    # its handle rail
    b.box(W / 2 - 0.09, -D / 2 + 0.055, 1.9, W / 2 - 0.02, -D / 2 + 0.06, 2.05, "screen")  # the airflow monitor
    b.box(W / 2 - 0.08, -D / 2 + 0.054, 1.94, W / 2 - 0.03, -D / 2 + 0.056, 1.96, "red")    # its alarm lamp
    b.cyl(0, 0.1, 2.25, 2.4, 0.16, "steel", 20)                             # the duct stub to the ceiling
    export([b.done()], "fume-hood")

# ---- freezer-80: an upright -80 freezer, 0.85 x 0.9 x 1.98: white, the control panel at the top, a heavy
# latch handle, the kick plate (the labs' most valuable box: the samples) -----------------------------------------
if want("freezer-80"):
    fresh(); M = lab_palette(); b = Builder("freezer-80", M)
    W, D, H = 0.85, 0.9, 1.98
    b.box(-W / 2, -D / 2 + 0.06, 0.1, W / 2, D / 2, H, "white")
    b.box(-W / 2 + 0.01, -D / 2 + 0.01, 0.12, W / 2 - 0.01, -D / 2 + 0.07, 1.68, "white")   # the door
    b.box(-W / 2, -D / 2 + 0.06, 1.7, W / 2, -D / 2 + 0.065, H - 0.02, "grey")              # the panel strip
    b.box(-0.12, -D / 2 + 0.055, 1.78, 0.12, -D / 2 + 0.061, 1.88, "screen")
    b.box(W / 2 - 0.1, -D / 2 - 0.02, 0.8, W / 2 - 0.05, -D / 2 + 0.01, 1.25, "grey")     # the latch handle
    b.box(-W / 2, -D / 2 + 0.08, 0, W / 2, D / 2, 0.1, "dark")
    for x in (-W / 2 + 0.06, W / 2 - 0.06):
        b.cyl(x, -D / 2 + 0.14, 0, 0.06, 0.03, "dark")
    export([b.done()], "freezer-80")

# ---- incubator-stack: two CO2 incubators on a steel stand, 0.7 x 0.75, 1.85 high --------------------------------
if want("incubator-stack"):
    fresh(); M = lab_palette(); b = Builder("incubator-stack", M)
    W, D = 0.7, 0.75
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        for y in (-D / 2 + 0.05, D / 2 - 0.05):
            b.box(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, 0.3, "steel")
    b.box(-W / 2, -D / 2, 0.28, W / 2, D / 2, 0.3, "steel")
    for k in range(2):
        z0 = 0.3 + k * 0.78
        b.box(-W / 2, -D / 2 + 0.05, z0, W / 2, D / 2, z0 + 0.76, "white")
        b.box(-W / 2 + 0.01, -D / 2 + 0.01, z0 + 0.02, W / 2 - 0.01, -D / 2 + 0.06, z0 + 0.74, "white")
        b.box(-W / 2 + 0.05, -D / 2 + 0.005, z0 + 0.6, -W / 2 + 0.25, -D / 2 + 0.011, z0 + 0.7, "screen")
        b.box(W / 2 - 0.06, -D / 2 - 0.02, z0 + 0.25, W / 2 - 0.03, -D / 2 + 0.01, z0 + 0.5, "grey")
    export([b.done()], "incubator-stack")

# ---- autoclave: a floor-standing steriliser 0.9 x 0.9 x 1.7, steel shell, the round door, its panel -------------
if want("autoclave"):
    fresh(); M = lab_palette(); b = Builder("autoclave", M)
    W, D, H = 0.9, 0.9, 1.7
    b.box(-W / 2, -D / 2 + 0.05, 0.08, W / 2, D / 2, H, "steel")
    b.box(-W / 2, -D / 2 + 0.07, 0, W / 2, D / 2, 0.08, "dark")
    b.box(-W / 2 + 0.02, -D / 2 + 0.045, 1.42, W / 2 - 0.02, -D / 2 + 0.05, H - 0.03, "white")   # the panel
    b.box(-0.2, -D / 2 + 0.04, 1.5, 0.12, -D / 2 + 0.046, 1.62, "screen")
    door = Matrix.Translation((0, -D / 2 + 0.05, 0.85)) @ Matrix.Rotation(math.radians(90), 4, "X")
    b.tube((0, -D / 2 + 0.05, 0.85), (0, -D / 2 - 0.03, 0.85), 0.33, "steel", 32)          # the door
    b.tube((0, -D / 2 - 0.03, 0.85), (0, -D / 2 - 0.05, 0.85), 0.1, "grey", 20)            # its wheel hub
    for a in range(4):
        t = math.radians(45 + a * 90)
        b.tube((0, -D / 2 - 0.05, 0.85), (0.22 * math.cos(t), -D / 2 - 0.05, 0.85 + 0.22 * math.sin(t)), 0.012, "grey")
    export([b.done()], "autoclave")

# ---- ln2-dewar: a 160 L liquid-nitrogen supply dewar on its dolly: steel, domed, the valves and gauge ---------
if want("ln2-dewar"):
    fresh(); M = lab_palette(); b = Builder("ln2-dewar", M)
    b.cyl(0, 0, 0.0, 0.08, 0.27, "dark", 24)
    for a in range(4):
        t = math.radians(a * 90 + 45); b.cyl(0.24 * math.cos(t), 0.24 * math.sin(t), 0.0, 0.05, 0.03, "dark")
    b.cyl(0, 0, 0.08, 1.38, 0.25, "steel", 32)
    b.cyl(0, 0, 1.38, 1.44, 0.2, "steel", 32)
    b.cyl(0, 0, 1.44, 1.5, 0.09, "steel", 20)
    b.tube((0.06, 0, 1.5), (0.06, 0, 1.58), 0.012, "steel"); b.tube((0.06, 0, 1.58), (0.16, 0, 1.58), 0.012, "steel")
    b.tube((-0.06, 0, 1.5), (-0.06, 0, 1.6), 0.012, "steel")
    b.cyl(-0.06, 0, 1.6, 1.63, 0.035, "blue", 16)                       # the vent valve's wheel
    b.tube((0, -0.09, 1.5), (0, -0.13, 1.54), 0.008, "steel")
    b.tube((0, -0.13, 1.54), (0, -0.16, 1.54), 0.04, "white", 18)        # the gauge's face
    for t in (0, math.pi):   # the handling hoops
        b.tube((0.25 * math.cos(t), 0.0, 1.3), (0.32 * math.cos(t), 0.0, 1.3), 0.012, "steel")
    export([b.done()], "ln2-dewar")

# ---- air-hose: a coiled yellow breathing-air hose dropping 0.9 from its ceiling coupler (references L: the
# suit labs' hoses hang every two metres). The prop's TOP is its coupler: place it at ceiling height minus 1.0 -----
if want("air-hose"):
    fresh(); M = lab_palette(); b = Builder("air-hose", M)
    b.cyl(0, 0, 0.93, 1.0, 0.05, "steel", 16)                            # the ceiling coupler
    b.tube((0, 0, 0.93), (0, 0, 0.86), 0.012, "steel")
    turns, top, drop, r = 22, 0.86, 0.62, 0.075
    pts = []
    for i in range(turns * 10 + 1):
        u = i / (turns * 10); t = u * turns * 2 * math.pi
        rr = r * (1 - 0.15 * u)
        pts.append((rr * math.cos(t), rr * math.sin(t), top - u * drop))
    for a, c in zip(pts, pts[1:]):
        b.tube(a, c, 0.009, "hose", 6)
    b.tube(pts[-1], (0, 0, 0.12), 0.009, "hose", 6)                      # the free tail
    b.cyl(0, 0, 0.04, 0.12, 0.016, "steel", 12)                         # the quick-connect
    export([b.done()], "air-hose")

# ---- suit-rail: the suit room's wall rail, 2.4 m, five hooks with their hose couplers above ------------------------
if want("suit-rail"):
    fresh(); M = lab_palette(); b = Builder("suit-rail", M)
    b.box(-1.2, 0.0, 1.95, 1.2, 0.04, 2.0, "steel")
    for i in range(5):
        x = -0.96 + i * 0.48
        b.tube((x, 0.0, 1.97), (x, -0.12, 1.97), 0.01, "steel")
        b.tube((x, -0.12, 1.97), (x, -0.13, 2.02), 0.01, "steel")
        b.box(x - 0.04, 0.0, 2.12, x + 0.04, 0.04, 2.2, "yellow")          # the air coupler
    export([b.done()], "suit-rail")

# ---- decon-shower-rig: the chemical shower's ceiling: a steel pipe frame 1.8 x 1.8 with spray nozzles down
# its sides and from the top, mounted 2.35 up (place it at y 0, its frame reaches the floor on four posts) ---------
if want("decon-shower-rig"):
    fresh(); M = lab_palette(); b = Builder("decon-shower-rig", M)
    S, Z = 0.9, 2.35
    for (x, y) in ((-S, -S), (S, -S), (S, S), (-S, S)):
        b.tube((x, y, 0.0), (x, y, Z), 0.025, "steel", 12)
    for (a, c) in (((-S, -S), (S, -S)), ((S, -S), (S, S)), ((S, S), (-S, S)), ((-S, S), (-S, -S))):
        for z in (0.6, 1.3, Z):
            b.tube((a[0], a[1], z), (c[0], c[1], z), 0.02, "steel", 10)
    for k in range(5):   # the top grid's spray bars and their nozzles
        y = -S + 0.3 + k * 0.3
        b.tube((-S, y, Z), (S, y, Z), 0.015, "steel", 8)
        for j in range(5):
            x = -S + 0.3 + j * 0.3
            b.cyl(x, y, Z - 0.05, Z, 0.012, "grey", 8)
    for (a, c) in (((-S, -S), (S, -S)), ((S, S), (-S, S))):   # side nozzles
        for z in (0.6, 1.3):
            for j in range(4):
                u = (j + 0.5) / 4
                x = a[0] + (c[0] - a[0]) * u; y = a[1]
                b.tube((x, y, z), (x, y + (0.05 if y < 0 else -0.05), z), 0.012, "grey", 8)
    b.box(-S, -S, 0.0, S, S, 0.03, "steel")                                 # the floor grate's frame
    for k in range(18):
        x = -S + 0.05 + k * 0.1
        b.box(x - 0.008, -S + 0.02, 0.03, x + 0.008, S - 0.02, 0.05, "steel")
    export([b.done()], "decon-shower-rig")

# ---- conference-table: 4.8 x 1.4, a white-oak top on two dark steel pedestals, a power rail down the middle ------
if want("conference-table"):
    fresh(); M = lab_palette(); b = Builder("conference-table", M)
    L, D = 4.8, 1.4
    b.box(-L / 2, -D / 2, 0.72, L / 2, D / 2, 0.75, "oak")
    b.box(-L / 2 + 0.6, -0.06, 0.749, L / 2 - 0.6, 0.06, 0.752, "black")   # the power rail
    for x in (-L / 2 + 0.9, L / 2 - 0.9):
        b.box(x - 0.25, -0.4, 0.0, x + 0.25, 0.4, 0.04, "dark")
        b.box(x - 0.08, -0.3, 0.04, x + 0.08, 0.3, 0.72, "dark")
    export([b.done()], "conference-table")

# ---- kitchenette: the break room's 3.6 m run: base units, a grey quartz top and upstand, a sink, wall units -------
if want("kitchenette"):
    fresh(); M = lab_palette(); b = Builder("kitchenette", M)
    L, D, H = 3.6, 0.65, 0.9
    b.box(-L / 2, -D / 2 + 0.05, 0.1, L / 2, D / 2, H - 0.03, "white")
    b.box(-L / 2, -D / 2 + 0.11, 0, L / 2, D / 2, 0.1, "dark")
    for i in range(6):
        x = -L / 2 + 0.3 + i * 0.6
        b.box(x - 0.29, -D / 2 + 0.048, 0.13, x + 0.29, -D / 2 + 0.052, H - 0.05, "white")
        b.box(x - 0.1, -D / 2 + 0.03, 0.8, x + 0.1, -D / 2 + 0.05, 0.812, "steel")
    b.box(-L / 2 - 0.01, -D / 2 + 0.02, H - 0.03, L / 2 + 0.01, D / 2, H, "quartz")
    b.box(-L / 2 - 0.01, D / 2 - 0.02, H, L / 2 + 0.01, D / 2, H + 0.12, "quartz")
    b.box(-0.9, -0.2, H - 0.002, -0.4, 0.18, H + 0.001, "steel")            # the sink
    b.tube((-0.65, 0.25, H), (-0.65, 0.25, H + 0.3), 0.012, "steel"); b.tube((-0.65, 0.25, H + 0.3), (-0.65, 0.05, H + 0.25), 0.01, "steel")
    for i in range(6):   # the wall units, 0.35 deep, from 1.45 to 2.15
        x = -L / 2 + 0.3 + i * 0.6
        b.box(x - 0.3, D / 2 - 0.35, 1.45, x + 0.3, D / 2, 2.15, "white")
        b.box(x - 0.29, D / 2 - 0.352, 1.47, x + 0.29, D / 2 - 0.348, 2.13, "white")
        b.box(x - 0.1, D / 2 - 0.37, 1.5, x + 0.1, D / 2 - 0.352, 1.512, "steel")
    export([b.done()], "kitchenette")

# ---- crac-unit: the server room's precision air conditioner, 1.8 x 0.9 x 1.95, grey with louvred doors ------------
if want("crac-unit"):
    fresh(); M = lab_palette(); b = Builder("crac-unit", M)
    W, D, H = 1.8, 0.9, 1.95
    b.box(-W / 2, -D / 2 + 0.03, 0.05, W / 2, D / 2, H, "grey")
    b.box(-W / 2, -D / 2 + 0.05, 0, W / 2, D / 2, 0.05, "dark")
    for k in range(3):
        x = -W / 2 + 0.3 + k * 0.6
        b.box(x - 0.29, -D / 2 + 0.02, 0.08, x + 0.29, -D / 2 + 0.03, H - 0.05, "white")
        for j in range(18):   # the louvres
            z = 0.2 + j * 0.09
            b.box(x - 0.25, -D / 2 + 0.005, z, x + 0.25, -D / 2 + 0.02, z + 0.03, "grey")
    b.box(-0.15, -D / 2 + 0.0, H - 0.3, 0.15, -D / 2 + 0.005, H - 0.15, "screen")
    export([b.done()], "crac-unit")

# ---- ups-cabinet: 0.6 x 1.0 x 1.95, black, its display -------------------------------------------------------------
if want("ups-cabinet"):
    fresh(); M = lab_palette(); b = Builder("ups-cabinet", M)
    b.box(-0.3, -0.5, 0, 0.3, 0.5, 1.95, "dark")
    b.box(-0.29, -0.505, 0.05, 0.29, -0.5, 1.9, "grey")
    b.box(-0.12, -0.51, 1.55, 0.12, -0.505, 1.7, "screen")
    for k in range(24):
        z = 0.15 + k * 0.05
        b.box(-0.25, -0.51, z, 0.25, -0.505, z + 0.02, "dark")
    export([b.done()], "ups-cabinet")

# ---- cable-tray: a 3 m steel ladder tray, 0.3 wide, with a run of cable in it (hung under the server room's slab) ---
if want("cable-tray"):
    fresh(); M = lab_palette(); b = Builder("cable-tray", M)
    for y in (-0.15, 0.15):
        b.box(-1.5, y - 0.005, 0, 1.5, y + 0.005, 0.08, "steel")
    for k in range(13):
        x = -1.44 + k * 0.24
        b.box(x - 0.012, -0.15, 0, x + 0.012, 0.15, 0.012, "steel")
    for j in range(6):
        y = -0.1 + j * 0.04
        b.tube((-1.5, y, 0.03), (1.5, y, 0.03), 0.012, ("blue", "dark", "grey", "blue", "dark", "orange")[j], 8)
    export([b.done()], "cable-tray")

# ---- chemical-cabinet: a yellow flammables safety cabinet, 1.1 x 0.46 x 1.65, two doors, the warning panel ----------
if want("chemical-cabinet"):
    fresh(); M = lab_palette(); b = Builder("chemical-cabinet", M)
    W, D, H = 1.1, 0.46, 1.65
    b.box(-W / 2, -D / 2 + 0.03, 0.05, W / 2, D / 2, H, "yellow")
    b.box(-W / 2 + 0.02, -D / 2 + 0.05, 0, W / 2 - 0.02, D / 2, 0.05, "dark")
    for x in (-W / 4, W / 4):
        b.box(x - W / 4 + 0.005, -D / 2 + 0.01, 0.07, x + W / 4 - 0.005, -D / 2 + 0.03, H - 0.03, "yellow")
    b.box(-0.04, -D / 2 - 0.02, 0.8, -0.02, -D / 2 + 0.01, 1.05, "dark"); b.box(0.02, -D / 2 - 0.02, 0.8, 0.04, -D / 2 + 0.01, 1.05, "dark")
    b.box(-0.4, -D / 2 + 0.005, 1.25, 0.4, -D / 2 + 0.01, 1.45, "red")       # the warning panel
    export([b.done()], "chemical-cabinet")

# ---- lab-stool: a round lab stool on a five-star base, gas lift, a foot ring (seat 0.62) ----------------------------
if want("lab-stool"):
    fresh(); M = lab_palette(); b = Builder("lab-stool", M)
    for a in range(5):
        t = math.radians(a * 72 + 90)
        b.tube((0, 0, 0.07), (0.28 * math.cos(t), 0.28 * math.sin(t), 0.05), 0.02, "dark")
        b.cyl(0.28 * math.cos(t), 0.28 * math.sin(t), 0.0, 0.05, 0.025, "dark")
    b.cyl(0, 0, 0.07, 0.6, 0.025, "steel")
    b.cyl(0, 0, 0.6, 0.66, 0.19, "dark", 24)
    for a in range(24):
        t0, t1 = 2 * math.pi * a / 24, 2 * math.pi * (a + 1) / 24
        b.tube((0.2 * math.cos(t0), 0.2 * math.sin(t0), 0.32), (0.2 * math.cos(t1), 0.2 * math.sin(t1), 0.32), 0.008, "steel", 6)
    for a in range(3):
        t = math.radians(a * 120)
        b.tube((0, 0, 0.32), (0.2 * math.cos(t), 0.2 * math.sin(t), 0.32), 0.008, "steel", 6)
    export([b.done()], "lab-stool")

# ---- cryo-em: Lab B's big instrument (L8: imaging machines live inside containment): a cryo-electron microscope
# in its enclosure, 1.6 x 1.4, 2.7 high: white panels, the column showing through a dark window, the autoloader
# on its side, the vibration-isolated plinth. The operator's desk is separate (it faces it). ----------------------
if want("cryo-em"):
    fresh(); M = lab_palette(); b = Builder("cryo-em", M)
    W, D, H = 1.6, 1.4, 2.7
    b.box(-W / 2 - 0.1, -D / 2 - 0.1, 0, W / 2 + 0.1, D / 2 + 0.1, 0.12, "dark")          # the plinth
    b.box(-W / 2, -D / 2 + 0.02, 0.12, W / 2, D / 2, H, "white")                             # the enclosure
    b.box(-0.3, -D / 2 - 0.005, 0.5, 0.3, -D / 2 + 0.02, 2.3, "black")                        # the column window
    b.cyl(0, -D / 2 + 0.25, 0.6, 2.25, 0.16, "steel", 24)                                    # the column inside
    b.cyl(0, -D / 2 + 0.25, 1.2, 1.4, 0.24, "grey", 24)                                      # its stage
    b.box(-W / 2 + 0.06, -D / 2 - 0.004, 2.45, W / 2 - 0.06, -D / 2 + 0.02, 2.6, "grey")       # the name band
    b.box(W / 2 - 0.02, -0.3, 0.9, W / 2 + 0.28, 0.3, 1.5, "white")                          # the autoloader
    b.box(W / 2 + 0.28, -0.12, 1.1, W / 2 + 0.3, 0.12, 1.3, "screen")
    for x in (-W / 2 + 0.2, W / 2 - 0.2):
        b.box(x - 0.05, -D / 2 - 0.004, 0.2, x + 0.05, -D / 2 + 0.02, 0.4, "grey")           # the vents
    b.box(-W / 2 + 0.1, -D / 2 - 0.004, 2.2, -W / 2 + 0.3, -D / 2 + 0.02, 2.3, "green")       # the status lamp
    export([b.done()], "cryo-em")

# ---- the chem-lab kit's instruments, dressed: imported, joined, given the house palette by material name,
# stood on the origin; their faces are checked on the contact sheet (kit-<id>) -------------------------------------
KIT = os.path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox", "chemicallab", "ChemicalLabFBX", "FBX")
KIT_PIECES = {   # id -> FBX
    "kit-analyser": "SM_device_B.fbx", "kit-liquid-handler": "SM_device_BB.fbx", "kit-floor-unit": "SM_device_C.fbx",
    "kit-plate-reader": "SM_device_D.fbx", "kit-sequencer": "SM_device_E.fbx", "kit-meter": "SM_device_F.fbx",
    "kit-balance": "SM_device_G.fbx", "kit-mini-centrifuge": "SM_device_K.fbx", "kit-vortex": "SM_device_M.fbx",
    "kit-tablet": "SM_device_N.fbx", "kit-tube-rack": "SM_test_tubes_set_A.fbx", "kit-tube-rack-b": "SM_test_tubes_set_BA.fbx",
    "kit-monitor": "SM_device_AC.fbx",
}
KIT_MAT = {"white": "white", "plastic_white": "white", "black_plastic": "dark", "chrome": "steel", "metal": "steel",
           "metal_black": "dark", "display": "screen", "emissive": "screen", "monitor_01_emissive": "screen", "gray": "grey",
           "green": "green", "orange": "orange", "red": "red", "blue": "blue", "glass": "glass", "leather": "fabric"}
for kid, fbx in KIT_PIECES.items():
    if not want(kid): continue
    fresh(); M = lab_palette()
    bpy.ops.import_scene.fbx(filepath=os.path.join(KIT, fbx))
    ms = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in ms:
        for i, m in enumerate(o.data.materials):
            base = (m.name if m else "white").split(".")[0]
            o.data.materials[i] = M[KIT_MAT.get(base, "white")]
    bpy.ops.object.select_all(action="DESELECT")
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    cx = sum(p.x for p in pts) / 8; cy = sum(p.y for p in pts) / 8; z0 = min(p.z for p in pts)
    o.data.transform(Matrix.Translation((-cx, -cy, -z0)))
    o.data.transform(Matrix.Rotation(math.pi, 4, "Z"))   # the kit's fronts face +y (the four-side sheet): turn them to -y
    o.name = kid
    export([o], kid)
