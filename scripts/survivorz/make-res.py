# SURVIVORZ: the residential wing's own furniture (2026-10-27; docs/survivorz/REFERENCES.md round six).
# Free furniture is either domestic or a game-kit's sci-fi; a corporate lab's built-ins are plain and
# made to one kit, so they're modelled here at their real sizes. Each faces -y (Blender) = +z in the game.
#
#   blender -b --factory-startup --python scripts/survivorz/make-res.py
#   -> assets/downloads/survivorz/originals/inbox/ready/<id>.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from make_lib import fresh, mat, palette, Builder, export
from mathutils import Matrix

# ---- canteen-table: 1.8 x 0.8 m, white compact-laminate top on two steel T-legs, 0.75 high ------------------
fresh(); M = palette(); b = Builder("canteen-table", M)
b.box(-0.9, -0.4, 0.72, 0.9, 0.4, 0.75, "white")
b.box(-0.9, -0.4, 0.715, 0.9, 0.4, 0.72, "dark")                       # the edge band underneath
for x in (-0.72, 0.72):
    b.box(x - 0.03, -0.03, 0.0, x + 0.03, 0.03, 0.715, "steel")         # the column
    b.box(x - 0.035, -0.34, 0.0, x + 0.035, 0.34, 0.025, "steel")       # the foot
    b.box(x - 0.03, -0.32, 0.69, x + 0.03, 0.32, 0.715, "steel")        # the top bearer
b.box(-0.72, -0.02, 0.66, 0.72, 0.02, 0.69, "steel")                    # the rail between
export([b.done()], "canteen-table")

# ---- canteen-chair: a stacking chair, white shell on a steel sled; seat 0.46 high, faces -y ----------------
fresh(); M = palette(); b = Builder("canteen-chair", M)
W, D = 0.46, 0.44
b.box(-W / 2, -D / 2, 0.44, W / 2, D / 2, 0.465, "white")                                    # the seat
b.box(-W / 2 + 0.02, D / 2 - 0.03, 0.5, W / 2 - 0.02, D / 2 - 0.005, 0.84, "white",
      Matrix.Translation((0, D / 2, 0.5)) @ Matrix.Rotation(math.radians(-8), 4, "X") @ Matrix.Translation((0, -D / 2, -0.5)))   # the back, raked
for s in (-1, 1):
    x = s * (W / 2 - 0.03)
    b.tube((x, -D / 2 + 0.02, 0.01), (x, D / 2 - 0.02, 0.01), 0.011, "steel")               # the sled runner
    b.tube((x, -D / 2 + 0.03, 0.01), (x, -D / 2 + 0.05, 0.44), 0.011, "steel")             # front leg
    b.tube((x, D / 2 - 0.03, 0.01), (x, D / 2 - 0.04, 0.44), 0.011, "steel")               # back leg
    b.tube((x, D / 2 - 0.04, 0.44), (x, D / 2 - 0.02, 0.62), 0.011, "steel")               # back post
export([b.done()], "canteen-chair")

# ---- servery: one 2.4 m section of the serving line: a stainless counter 0.9 high, 0.75 deep, four hot
# wells in the top, a sneeze guard on steel posts, the tray rail along the customer's side (-y) ----------
fresh(); M = palette(); b = Builder("servery", M)
L2, D2, H2 = 2.4, 0.75, 0.9
b.box(-L2 / 2, -D2 / 2, 0.1, L2 / 2, D2 / 2, H2 - 0.03, "white")                            # the body
b.box(-L2 / 2, -D2 / 2 + 0.04, 0, L2 / 2, D2 / 2 - 0.04, 0.1, "dark")                       # the plinth
b.box(-L2 / 2 - 0.01, -D2 / 2 - 0.01, H2 - 0.03, L2 / 2 + 0.01, D2 / 2 + 0.01, H2, "steel")  # the top
for i in range(4):   # the wells, dark and empty
    x = -L2 / 2 + 0.33 + i * 0.58
    b.box(x - 0.25, -0.16, H2 - 0.002, x + 0.25, 0.2, H2 + 0.001, "dark")
for x in (-L2 / 2 + 0.06, 0.0, L2 / 2 - 0.06):
    b.tube((x, -0.2, H2), (x, -0.2, H2 + 0.45), 0.012, "steel")                            # the guard's posts
b.box(-L2 / 2 + 0.04, -0.33, H2 + 0.36, L2 / 2 - 0.04, -0.2, H2 + 0.372, "glass",
      Matrix.Translation((0, -0.2, H2 + 0.36)) @ Matrix.Rotation(math.radians(25), 4, "X") @ Matrix.Translation((0, 0.2, -(H2 + 0.36))))   # the sneeze guard
for k in range(3):   # the tray rail: three tubes out front, at counter-top height less a little
    b.tube((-L2 / 2, -D2 / 2 - 0.08 - k * 0.07, H2 - 0.06), (L2 / 2, -D2 / 2 - 0.08 - k * 0.07, H2 - 0.06), 0.014, "steel")
for x in (-L2 / 2 + 0.1, L2 / 2 - 0.1):
    b.tube((x, -D2 / 2 - 0.15, H2 - 0.06), (x, -D2 / 2, H2 - 0.2), 0.012, "steel")         # its brackets
export([b.done()], "servery")

# ---- steel-counter: a 1.5 m stainless kitchen run with doors and an upstand, 0.9 high ------------------------
fresh(); M = palette(); b = Builder("steel-counter", M)
b.box(-0.75, -0.35, 0.12, 0.75, 0.35, 0.87, "steel")
b.box(-0.75, -0.32, 0.0, 0.75, 0.32, 0.12, "dark")
b.box(-0.76, -0.36, 0.87, 0.76, 0.36, 0.9, "steel")
b.box(-0.76, 0.33, 0.9, 0.76, 0.36, 1.05, "steel")                                          # the upstand
for x in (-0.375, 0.375):
    b.box(x - 0.36, -0.352, 0.16, x + 0.36, -0.35, 0.83, "steel")                           # the doors
    b.box(x - 0.15, -0.37, 0.76, x + 0.15, -0.352, 0.775, "dark")                          # their pulls
export([b.done()], "steel-counter")

# ---- prep-table: a stainless prep bench 1.8 x 0.75, 0.9 high, an undershelf, round legs ---------------------
fresh(); M = palette(); b = Builder("prep-table", M)
b.box(-0.9, -0.375, 0.86, 0.9, 0.375, 0.9, "steel")
b.box(-0.86, -0.34, 0.2, 0.86, 0.34, 0.215, "steel")
for x in (-0.85, 0.85):
    for y in (-0.33, 0.33):
        b.cyl(x, y, 0.0, 0.86, 0.02, "steel")
export([b.done()], "prep-table")

# ---- shower-stall: one cubicle, 1.0 x 1.0 x 2.1: compact-laminate side walls, a frosted door left open,
# a fixed head and mixer on the back wall (the room's wall stands behind it at y +0.5) --------------------------
fresh(); M = palette(); b = Builder("shower-stall", M)
for x in (-0.5, 0.5):
    b.box(x - 0.012, -0.5, 0.15, x + 0.012, 0.5, 2.05, "white")                              # the side walls, raised off the floor
    b.box(x - 0.02, -0.52, 0.0, x + 0.02, -0.48, 2.1, "steel")                               # the front post
b.box(-0.5, -0.51, 2.05, 0.5, -0.49, 2.1, "steel")                                          # the head rail
hinge = Matrix.Translation((-0.48, -0.5, 0)) @ Matrix.Rotation(math.radians(-55), 4, "Z") @ Matrix.Translation((0.48, 0.5, 0))
b.box(-0.48, -0.51, 0.15, 0.4, -0.5, 1.95, "frosted", hinge)                                 # the door, swung open
b.tube((0.0, 0.48, 1.95), (0.0, 0.38, 1.95), 0.01, "steel")                                  # the arm
b.cyl(0.0, 0.36, 1.9, 1.95, 0.08, "steel")                                                   # the head
b.box(-0.08, 0.47, 1.05, 0.08, 0.5, 1.2, "steel")                                            # the mixer plate
b.box(-0.06, -0.06, 0.0, 0.06, 0.06, 0.004, "dark")                                          # the drain
export([b.done()], "shower-stall")

# ---- vanity: a 2.4 m washroom counter with two basins in a white solid surface, a long mirror over it ------
fresh(); M = palette(); M["mirror"] = mat("mirror", (0.55, 0.57, 0.58), 0.04, 1.0)
b = Builder("vanity", M)
b.box(-1.2, -0.25, 0.8, 1.2, 0.25, 0.86, "white")                                            # the counter
b.box(-1.2, -0.25, 0.7, 1.2, -0.22, 0.8, "white")                                            # its apron
for x in (-0.6, 0.6):
    b.box(x - 0.22, -0.16, 0.81, x + 0.22, 0.14, 0.861, "dark")                              # the basin (read as its shadowed bowl)
    b.cyl(x, 0.19, 0.86, 1.02, 0.015, "steel")                                               # the tap
    b.tube((x, 0.19, 1.02), (x, 0.08, 1.0), 0.012, "steel")
b.box(-1.2, 0.235, 0.98, 1.2, 0.25, 1.98, "mirror")                                          # the mirror
b.box(-1.21, 0.23, 0.97, 1.21, 0.25, 0.98, "steel"); b.box(-1.21, 0.23, 1.98, 1.21, 0.25, 1.99, "steel")
export([b.done()], "vanity")

# ---- bunk-pod: a built-in two-high sleeping pod, 2.1 long x 1.0 deep x 2.3 high, open on the aisle side (-y):
# a mattress in each berth, the aisle-side curtain half drawn, a reading light and a shelf inside, a ladder
# (references R6: the Navy rack's curtain, light and shelf; R1: one warm material, the berth's back panel) -----
fresh(); M = palette(); M["oak"] = mat("oak_veneer", (0.28, 0.17, 0.09), 0.55)
b = Builder("bunk-pod", M)
L3, D3, H3 = 2.1, 1.0, 2.3
b.box(-L3 / 2, -D3 / 2, 0.0, L3 / 2, D3 / 2, 0.08, "dark")                                   # the plinth
b.box(-L3 / 2 - 0.03, -D3 / 2, 0.0, -L3 / 2, D3 / 2, H3, "white")                            # the end panels
b.box(L3 / 2, -D3 / 2, 0.0, L3 / 2 + 0.03, D3 / 2, H3, "white")
b.box(-L3 / 2, D3 / 2 - 0.03, 0.08, L3 / 2, D3 / 2, H3, "oak")                               # the back panel, warm
b.box(-L3 / 2 - 0.03, -D3 / 2, H3 - 0.03, L3 / 2 + 0.03, D3 / 2, H3, "white")                # the top
for k, z in enumerate((0.08, 1.2)):   # two berths
    b.box(-L3 / 2, -D3 / 2, z, L3 / 2, D3 / 2 - 0.03, z + 0.06, "white")                       # the berth deck
    b.box(-L3 / 2 + 0.02, -D3 / 2 + 0.06, z + 0.06, L3 / 2 - 0.02, D3 / 2 - 0.05, z + 0.2, "mattress")
    b.box(-L3 / 2 + 0.04, D3 / 2 - 0.2, z + 0.62, L3 / 2 - 0.5, D3 / 2 - 0.03, z + 0.64, "white")   # the shelf
    b.box(L3 / 2 - 0.4, D3 / 2 - 0.06, z + 0.66, L3 / 2 - 0.3, D3 / 2 - 0.03, z + 0.7, "dark")     # the reading light
    b.box(-L3 / 2, -D3 / 2 - 0.01, z + 0.06, -L3 / 2 + 0.9 + k * 0.3, -D3 / 2, z + 1.05, "fabric")  # the curtain, part drawn
    b.box(-L3 / 2, -D3 / 2 - 0.015, z + 1.05, L3 / 2, -D3 / 2, z + 1.07, "steel")              # its track
b.box(-L3 / 2, -D3 / 2, 1.2 + 0.06, L3 / 2, -D3 / 2 + 0.08, 1.2 + 0.32, "white")              # the upper berth's guard rail
for x in (L3 / 2 - 0.08, L3 / 2 - 0.42):
    b.tube((x, -D3 / 2 - 0.06, 0.08), (x, -D3 / 2 - 0.06, 1.55), 0.014, "steel")            # the ladder's stiles
for z in (0.45, 0.8, 1.15):
    b.tube((L3 / 2 - 0.08, -D3 / 2 - 0.06, z), (L3 / 2 - 0.42, -D3 / 2 - 0.06, z), 0.012, "steel")
export([b.done()], "bunk-pod")

# ---- shelter-bunk: a three-tier steel shelter bunk (references R12: Swiss shelters, always three high), 2.0 x
# 0.85 m, tiers at 0.3 / 1.0 / 1.7 m, olive frame, canvas mattresses ----------------------------------------------
fresh(); M = palette(); b = Builder("shelter-bunk", M)
for x in (-1.0, 1.0):
    for y in (-0.42, 0.42):
        b.box(x - 0.025, y - 0.025, 0.0, x + 0.025, y + 0.025, 2.0, "olive")
for z in (0.3, 1.0, 1.7):
    for y in (-0.42, 0.42):
        b.box(-1.0, y - 0.02, z, 1.0, y + 0.02, z + 0.05, "olive")                            # the side rails
    for x in (-1.0, 1.0):
        b.box(x - 0.02, -0.42, z, x + 0.02, 0.42, z + 0.05, "olive")
    b.box(-0.98, -0.4, z + 0.05, 0.98, 0.4, z + 0.16, "canvas")                               # the mattress
for z in (0.6, 1.3):
    b.tube((1.0, -0.42, z), (1.0, 0.42, z), 0.012, "olive")                                    # end bars as a ladder
export([b.done()], "shelter-bunk")

# ---- air-filter: the shelter's NBC air unit on the wall: a grey-green cabinet with a hand crank, two gauges,
# a duct up into the ceiling (references: Swiss Schutzraum ventilation units). Its back on y 0, faces -y ----------
fresh(); M = palette(); M["gauge"] = mat("gauge_face", (0.6, 0.6, 0.55), 0.4)
b = Builder("air-filter", M)
b.box(-0.45, -0.38, 0.6, 0.45, 0.0, 1.5, "olive")
b.box(-0.2, -0.3, 1.5, 0.2, -0.08, 2.8, "olive")                                              # the duct
for x in (-0.25, 0.25):
    b.tube((x, -0.38, 1.25), (x, -0.4, 1.25), 0.07, "dark", 20)                               # a gauge bezel
    b.tube((x, -0.4, 1.25), (x, -0.401, 1.25), 0.06, "gauge", 20)                             # its face
b.tube((0.0, -0.38, 0.85), (0.0, -0.46, 0.85), 0.03, "steel")                                 # the crank's shaft
b.tube((0.0, -0.46, 0.85), (0.22, -0.46, 0.85), 0.015, "steel")                               # its arm
b.tube((0.22, -0.46, 0.85), (0.22, -0.56, 0.85), 0.02, "dark")                                # its handle
export([b.done()], "air-filter")

# ---- water-point: the shelter's water point on the long wall: a steel trough, three taps, a cup rack ----------
fresh(); M = palette(); b = Builder("water-point", M)
b.box(-0.8, -0.35, 0.8, 0.8, 0.0, 0.9, "steel")                                               # the trough
b.box(-0.78, -0.33, 0.83, 0.78, -0.02, 0.9, "dark")                                           # its inside
for x in (-0.8, 0.8):
    b.box(x - 0.02, -0.3, 0.0, x + 0.02, 0.0, 0.8, "steel")                                   # the brackets to the floor
for x in (-0.5, 0.0, 0.5):
    b.tube((x, 0.0, 1.15), (x, -0.12, 1.15), 0.012, "steel"); b.tube((x, -0.12, 1.15), (x, -0.12, 1.05), 0.012, "steel")
b.box(-0.8, -0.12, 1.45, 0.8, 0.0, 1.47, "steel")                                             # the cup rack shelf
b.box(-0.8, -0.13, 1.47, 0.8, -0.12, 1.52, "steel")                                           # its lip
export([b.done()], "water-point")

# ---- window-screen: the canteen's big "window" (references R10, R23): a 2.4 x 1.35 m screen in a slim
# frame, dead black glass in the blackout. Its back on y 0, faces -y; hang its bottom ~1.0 m up -------------------
fresh(); M = palette(); b = Builder("window-screen", M)
b.box(-1.23, -0.05, -0.03, 1.23, 0.0, 1.38, "white")
b.box(-1.2, -0.051, 0.0, 1.2, -0.05, 1.35, "black")
export([b.done()], "window-screen")
