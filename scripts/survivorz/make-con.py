# SURVIVORZ: specimen containment's own pieces (2026-10-27; docs/survivorz/REFERENCES.md round eleven). The cells'
# glazed fronts, the restraint beds inside them, and the cryo hall's storage dewars. Each faces -y (Blender) = +z in
# the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-con.py [-- <id> ...]
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export

ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def want(name): return not ONLY or name in ONLY

def con_palette():
    M = palette()
    M.update({
        "frame": mat("cell_frame", (0.3, 0.31, 0.32), 0.45, 0.6),
        "gunmetal": mat("gunmetal", (0.16, 0.17, 0.18), 0.45, 0.5),
        "armour": mat("glass_armoured", (0.55, 0.68, 0.7), 0.04, 0.0, alpha=0.28),
        "yellow": mat("hazard_yellow", (0.62, 0.42, 0.01), 0.5),
        "red": mat("signal_red", (0.45, 0.02, 0.015), 0.45),
        "lamp-red": mat("lamp_red", (0.5, 0.03, 0.02), 0.3),
        "pad": mat("vinyl_pad", (0.2, 0.23, 0.22), 0.7),
        "strap": mat("strap_black", (0.02, 0.02, 0.02), 0.8),
        "dewar": mat("dewar_white", (0.62, 0.63, 0.62), 0.35, 0.05),   # white like the Cryonics Institute's cryostats (C17)
        "frost": mat("frost", (0.75, 0.8, 0.83), 0.9),
    })
    return M

# ---- cell-front: one cell's front, 3.0 wide x 3.2 tall, 0.25 deep: a steel frame, two laminated glass panes either
# side of a steel door with a vision panel and a food hatch, the interlock lamp over it, a number frame (the plate is
# a decal). The door is the game's to open; this is its frame and leaf, shut ------------------------------------------
if want("cell-front"):
    fresh(); M = con_palette(); b = Builder("cell-front", M)
    W, H, D = 3.0, 3.2, 0.25
    dw, dh = 0.95, 2.15                                                              # the door
    b.box(-W / 2, -D / 2, 0, W / 2, D / 2, 0.15, "frame")                             # the kerb
    b.box(-W / 2, -D / 2, H - 0.25, W / 2, D / 2, H, "frame")                         # the head
    for x in (-W / 2, -dw / 2 - 0.08, dw / 2, W / 2 - 0.08):
        b.box(x, -D / 2, 0.15, x + 0.08, D / 2, H - 0.25, "frame")                    # the mullions
    for (x0, x1) in ((-W / 2 + 0.08, -dw / 2 - 0.08), (dw / 2 + 0.08, W / 2 - 0.08)):
        b.box(x0, -0.025, 0.15, x1, 0.025, H - 0.25, "armour")                         # 50 mm laminated glass
        b.box(x0, -0.03, 1.0, x1, -0.026, 1.06, "frame")                               # a transom bar at hip height
    b.box(-dw / 2, -0.05, 0.15, dw / 2, 0.05, 0.15 + dh, "gunmetal")                  # the door leaf
    b.box(-dw / 2, -D / 2, 0.15 + dh, dw / 2, D / 2, H - 0.25, "frame")               # over the door
    b.box(-0.15, -0.052, 1.45, 0.15, 0.052, 1.85, "armour")                           # the vision panel
    b.box(-0.17, -0.06, 1.43, 0.17, -0.052, 1.45, "frame"); b.box(-0.17, -0.06, 1.85, 0.17, -0.052, 1.87, "frame")
    b.box(-0.22, -0.07, 0.95, 0.22, -0.05, 1.12, "frame")                             # the food hatch
    b.box(0.3, -0.09, 1.05, 0.36, -0.05, 1.25, "steel")                               # the lever handle
    b.box(-dw / 2 - 0.08, -0.08, 2.55, -dw / 2 + 0.08, -0.05, 2.65, "black")          # the interlock lamp's housing
    b.tube((0.0, -0.13, 2.6), (0.0, -0.06, 2.6), 0.05, "lamp-red", 12)
    b.box(dw / 2 + 0.12, -0.13, 2.4, dw / 2 + 0.52, -0.125, 2.6, "white")             # the number frame
    export([b.done()], "cell-front")

# ---- restraint-bed: a bolted steel frame bed with a padded vinyl mattress and four straps, 0.9 x 2.0, head at +y ------
if want("restraint-bed"):
    fresh(); M = con_palette(); b = Builder("restraint-bed", M)
    b.box(-0.45, -1.0, 0.42, 0.45, 1.0, 0.5, "frame")
    for (x, y) in ((-0.4, -0.95), (0.4, -0.95), (0.4, 0.95), (-0.4, 0.95)):
        b.box(x - 0.03, y - 0.03, 0, x + 0.03, y + 0.03, 0.42, "frame")
        b.box(x - 0.08, y - 0.08, 0, x + 0.08, y + 0.08, 0.01, "frame")
    b.box(-0.42, -0.97, 0.5, 0.42, 0.97, 0.62, "pad")
    for y in (-0.7, -0.2, 0.25, 0.7):
        b.box(-0.46, y - 0.04, 0.49, 0.46, y + 0.04, 0.635, "strap")
    b.box(0.46, 0.2, 0.3, 0.5, 0.3, 0.5, "strap")                                     # a cut strap hanging off the side
    export([b.done()], "restraint-bed")

# ---- cryo-dewar: a long-term cryostorage dewar, 1.6 diameter x 2.6 tall: a vacuum-jacketed steel vessel on a ring
# base, its lid and fill line, the level controller on the front (-y) with a status lamp, frost at the fill ------------
if want("cryo-dewar"):
    fresh(); M = con_palette(); b = Builder("cryo-dewar", M)
    R, H = 0.8, 2.3
    b.cyl(0, 0, 0, 0.12, R + 0.05, "gunmetal", 32)                                    # the base ring
    b.cyl(0, 0, 0.12, H, R, "dewar", 32)
    for z in (0.5, H - 0.4):
        b.cyl(0, 0, z, z + 0.04, R + 0.012, "steel", 32)                              # the jacket's seams
    b.cyl(0, 0, H, H + 0.12, R * 0.92, "dewar", 32)                                   # the dome lid
    b.cyl(0, 0, H + 0.12, H + 0.2, 0.25, "steel", 20)                                 # the neck
    b.box(-0.08, -0.08, H + 0.2, 0.08, 0.08, H + 0.3, "frost")
    b.tube((0.15, 0, H + 0.25), (0.6, 0, H + 0.25), 0.03, "frost", 10)                # the fill line, frosted
    b.tube((0.6, 0, H + 0.25), (0.6, 0, H + 0.5), 0.03, "steel", 10)
    b.box(-0.25, -R - 0.12, 1.2, 0.25, -R + 0.02, 1.7, "white")                       # the level controller
    b.box(-0.18, -R - 0.121, 1.45, 0.18, -R - 0.12, 1.62, "black")                    # its display
    b.tube((0.15, -R - 0.12, 1.3), (0.15, -R - 0.15, 1.3), 0.025, "lamp-red", 10)
    b.box(-0.3, -R - 0.001, 0.75, 0.3, -R + 0.01, 0.95, "white")                      # the number plate frame
    export([b.done()], "cryo-dewar")
