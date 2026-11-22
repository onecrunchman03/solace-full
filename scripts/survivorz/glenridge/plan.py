# SURVIVORZ, GLENRIDGE HALL: the plan. Rooms are rects in their block's frame; the walls are worked out from
# them (auto_walls): where two rooms of a block and level share an edge there's a partition, anywhere else an
# outside wall. Sources (docs/survivorz/GLENRIDGE.md): the 1982 National Register nomination's room-by-room
# description and its 27 photos, and Jeff Herr's 35 photos. No measured plan survives online: the Great Hall's
# 45 x 30 ft is the one stated size, everything else is proportioned from the photos.
import math, os
GAME = bool(os.environ.get("GLEN_GAME"))          # the game build: the floors that open have their holes (design.py)
from geo import *

GF, UF, EAVE, BF = 0.0, 3.4, 6.1, -3.0
T_EXT, T_INT = 0.34, 0.14
HALL_Z = -0.36          # the Great Hall is two steps down
HW = 3.8                # a primary wing's half width

OAK = [(2.45, "oakpanel"), (None, "plaster")]
OAKHI = [(2.9, "oakpanel"), (None, "plaster")]
HALLFIN = [(3.76, "oakwall"), (None, "ochre")]        # the Great Hall: oak to the gallery floor, rough ochre plaster above (hall.py panels it)
PLAS = "plaster"
CREAM = "cream"
KIT = [(0.12, "blacktile"), (None, "kitchenyellow")]
SUN = [(0.12, "blacktile"), (None, "sunyellow")]                  # the sun room and the arcade: pale yellow over a black skirting (photos 11, 29)            # yellow walls over a black skirting (photo 23)
TILE = [(1.5, "blacktile"), (None, "cream")]

# the blocks: name -> (origin x, origin y, turn in degrees, outside finish by level)
BLOCKS = {
    "C": (0.0, 0.0, 0.0, {0: "brick", 1: "ht:nogging", -1: "brick"}),
    "W": (-12.813, 0.313, 225.0, {0: "brick", 1: "ht:nogging", -1: "brick"}),   # x' runs out along the wing (south-west), +y' is its forecourt side
    "E": (15.563, 0.313, -45.0, {0: "brick", 1: "ht:nogging", -1: "brick"}),    # x' runs out (south-east), -y' is its forecourt side
    "S": (-15.5, 12.1, 180.0, {0: "brick", 1: "ht:nogging", -1: "brick"}),  # the solarium wing, in line with the main range: x' runs out (west), y'=0 is its rear (arcade) wall
}

USHIFT = {"E": -5.5}

class Room:
    def __init__(s, blk, id, name, x0, y0, x1, y1, lvl=0, z=None, h=None, top=None, fin=PLAS, floor="oakfloor", ceil="ceil", ops=(), skip="", xfin=None, tops=None, light=1.0, zone=""):
        du = USHIFT.get(blk, 0.0); x0 += du; x1 += du
        ops = [(o[0], o[1] + du, *o[2:]) if o[0] in "SN" else o for o in ops]
        s.blk, s.id, s.name, s.x0, s.y0, s.x1, s.y1, s.lvl = blk, id, name, x0, y0, x1, y1, lvl
        s.z = z if z is not None else {0: GF, 1: UF, -1: BF}[lvl]
        s.h = h if h is not None else {0: 3.0, 1: 2.6, -1: 2.5}[lvl]
        s.top = top if top is not None else {0: UF, 1: EAVE, -1: -0.5}[lvl]
        s.fin, s.floor, s.ceil, s.ops, s.skip, s.xfin, s.tops, s.light, s.zone = fin, floor, ceil, list(ops), skip, xfin or {}, tops or {}, light, zone or blk
    def edge(s, e):   # axis, line, from, to
        return {"S": ("x", s.y0, s.x0, s.x1), "N": ("x", s.y1, s.x0, s.x1), "W": ("y", s.x0, s.y0, s.y1), "E": ("y", s.x1, s.y0, s.y1)}[e]
    def topof(s, e): return s.tops.get(e, s.top)
    def opsof(s, e):
        out = []
        for o in s.ops:
            if o[0] != e: continue
            ex = o[6] if len(o) > 6 else {}
            out.append(dict(u0=o[1] - o[2] / 2, u1=o[1] + o[2] / 2, z0=s.z + o[4], z1=s.z + o[4] + o[5], kind=o[3], **ex))
        return out

ROOMS = []
def R(*a, **k):
    r = Room(*a, **k); ROOMS.append(r); return r

OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}
win = lambda e, c, w, sill=0.9, h=1.5, **x: (e, c, w, "win", sill, h, x)
door = lambda e, c, w=0.95, h=2.1, **x: (e, c, w, "door", 0.0, h, x)
french = lambda e, c, w=1.5, h=2.4, **x: (e, c, w, "french", 0.0, h, x)
arch = lambda e, c, w, h=2.6, kind="tudor", **x: (e, c, w, kind, 0.0, h, x)
opening = lambda e, c, w, sill=0.0, h=2.4, **x: (e, c, w, "open", sill, h, x)

# ============ THE CENTRAL BLOCK ======================================================================
# The front (the nomination's "southeast facade") faces -y. The Great Hall lies east-west behind the long gallery.
R("C", "great-hall", "Great Hall", -6.85, 3.0, 6.85, 12.1, z=HALL_Z, h=10.0, top=EAVE, fin=HALLFIN, ceil=None, tops={"S": UF}, light=0,
  ops=[win("N", -4.9, 1.9, 1.0, 3.6), win("N", 4.9, 1.9, 1.0, 3.6), arch("N", 0, 4.2, 3.0),
       arch("S", 0, 2.4, 2.9), arch("S", -4.7, 1.6, 2.7), arch("S", 4.7, 1.6, 2.7), arch("W", 7.55, 3.0, 3.0), arch("E", 7.55, 3.0, 3.0)])
R("C", "inglenook", "Inglenook", -2.3, 12.1, 2.3, 14.3, z=HALL_Z, h=3.2, top=UF + 0.2, fin=[(1.72, "oakwall"), (None, "ochre")], floor=None if GAME else "flag", light=0.5,
  ops=[win("W", 13.2, 0.7, 1.1, 1.7, light=0.7), win("E", 13.2, 0.7, 1.1, 1.7, light=0.7)])
R("C", "gallery-w", "Long Gallery (west end)", -15.5, 0.0, -7.75, 3.0, fin=OAK, ceil="beamceil", skip="SWE", light=0.8)
R("C", "gallery", "Long Gallery", -7.75, 0.0, 10.5, 3.0, fin=OAK, ceil="beamceil", light=1.2)
R("C", "gallery-e", "Long Gallery (east end)", 10.5, 0.0, 18.25, 3.0, fin=OAK, ceil="beamceil", skip="SEW", light=0.8, xfin={"N": "plaster"}, ops=[door("N", 15.9, 1.0)])
R("C", "vestibule", "Entrance Vestibule", -2.0, -3.6, 2.4, 0.0, h=2.6, top=3.0, fin="plaster", ceil="beamceil", tops={"N": UF},
  ops=[(("S"), 0.2, 1.5, "archdoor", 0.0, 2.7, dict(id="front-door")), arch("N", 0.2, 1.8, 2.4)])
R("C", "stair-hall", "Stair Hall", -7.7, -4.4, -2.0, 0.0, h=3.4, fin=OAK, ceil=None,
  ops=[opening("N", -4.85, 4.4, 0, 2.7), win("S", -4.85, 2.2, 1.9, 1.5)])
R("C", "ladies", "Ladies' Room", 2.4, -2.6, 4.2, 0.0, h=2.6, top=3.0, fin=TILE, floor="checker", tops={"N": UF}, ops=[door("N", 3.3, 0.8), win("S", 3.3, 0.7, 1.3, 0.9)])
R("C", "gents", "Gentlemen's Room", 4.2, -2.6, 6.0, 0.0, h=2.6, top=3.0, fin=TILE, floor="checker", tops={"N": UF}, ops=[door("N", 5.1, 0.8), win("S", 5.1, 0.7, 1.3, 0.9)])
R("C", "garden-entry", "Garden Entry", 6.0, -2.6, 9.4, 0.0, h=2.6, top=2.8, fin=CREAM, floor="flag", tops={"N": UF},
  ops=[("S", 7.7, 1.2, "archdoor", 0.0, 2.5, dict(id="garden-door")), door("N", 7.7, 1.0)])
R("C", "library", "Library", -15.5, 3.0, -6.85, 9.2, h=3.2, fin=[(3.2, "oakpanel")], ceil="strapwork", xfin={"W": "plaster"},
  ops=[french("N", -13.6, 1.5), french("N", -11.2, 1.5), french("N", -8.8, 1.5), door("W", 3.75, 0.9), door("W", 8.45, 0.9), door("S", -11.2, 1.1)])
R("C", "library-porch", "Library Porch", -15.5, 9.2, -6.85, 12.1, h=2.9, fin="brick", floor="brickpav", ceil="porchceil", skip="W", light=0.4,
  ops=[opening("N", -13.9, 2.4, 0.6, 1.9), opening("N", -11.2, 2.4, 0.6, 1.9, broken="library-window"), opening("N", -8.5, 2.4, 0.6, 1.9)])
R("C", "dining-room", "Dining Room", 6.85, 3.0, 13.4, 12.1, h=3.1, fin="dineyellow", ceil="beamdark", xfin={"E": "brick"},
  ops=[french("N", 8.5, 1.1, 2.3), french("N", 11.75, 1.1, 2.3), win("E", 9.9, 3.4, 0.7, 1.9, broken="dining-window"), door("E", 5.4, 0.9), door("S", 10.1, 1.2)])
R("C", "dining-porch", "Dining Porch", 6.85, 12.1, 13.4, 14.9, h=2.8, top=3.0, fin="brick", xfin={"N": [(0.6, "brick"), (None, "ht:stucco")], "E": [(0.6, "brick"), (None, "ht:stucco")], "W": [(0.6, "brick"), (None, "ht:stucco")]}, floor="brickpav", ceil="porchceil", light=0.4,
  ops=[opening("N", 8.6, 2.6, 0.6, 1.9), opening("N", 11.7, 2.6, 0.6, 1.9), opening("E", 13.5, 2.0, 0.6, 1.9), opening("W", 13.5, 2.0, 0.0, 2.3)])
# upstairs
R("C", "upper-gallery-w", "Upper Gallery (west end)", -15.5, 0.0, -7.75, 3.0, 1, fin=OAK, ceil="boardceil", skip="SWE", light=0.6)
R("C", "upper-gallery", "Upper Gallery", -7.75, 0.0, 10.5, 3.0, 1, fin=OAK, ceil="boardceil", xfin={"N": "plaster"}, light=1.0,
  ops=[win("S", 7.7, 1.6, 0.8, 1.3), opening("N", 0, 13.7, 0, 2.5)])
R("C", "upper-gallery-e", "Upper Gallery (east end)", 10.5, 0.0, 18.25, 3.0, 1, fin=OAK, ceil="boardceil", skip="SEW", light=0.6, ops=[win("N", 15.9, 1.6, 0.8, 1.3)])
R("C", "stair-landing", "Stair Landing", -7.7, -4.4, -2.0, 0.0, 1, fin=OAK, floor=None, ceil="boardceil", xfin={"S": "ht:stucco", "E": "ht:stucco", "W": "ht:stucco"},
  ops=[opening("N", -4.85, 4.4, 0, 2.4), win("S", -4.85, 2.2, 0.0, 2.0)])
R("C", "mr-glenn-bedroom", "Mr. Glenn's Bedroom", -15.5, 3.0, -10.6, 12.1, 1, fin=CREAM, xfin={"W": "ht:nogging"},
  ops=[win("N", -13.0, 2.2, 0.8, 1.3), door("S", -13.0), door("W", 7.0, 0.9)])
R("C", "hall-balcony", "Hall Balcony", -10.6, 3.0, -6.85, 9.2, 1, fin=OAK, xfin={"E": "plaster", "N": "plaster"}, ops=[opening("E", 7.55, 3.2, 0, 2.3), door("S", -8.7), door("W", 6.0)])
R("C", "mr-glenn-bath", "Mr. Glenn's Bath", -10.6, 9.2, -6.85, 12.1, 1, fin=TILE, floor="checker", xfin={"E": "plaster"}, ops=[win("N", -8.7, 1.2, 1.0, 1.1), door("W", 10.6, 0.8)])
R("C", "boys-bedroom-a", "Boys' Bedroom (east)", 6.85, 3.0, 13.4, 12.1, 1, fin=[(0.14, "pinktrim"), (None, "wallpaper")],
  ops=[win("N", 10.1, 2.2, 0.8, 1.3), win("E", 9.9, 3.0, 0.8, 1.3), door("S", 10.1)])

# ============ THE WEST WING (bedrooms; Mr. and Mrs. Glenn's suites over) ==============================
# In this frame: "S" is the garden-court side (north-west), "N" the forecourt side, "E" the wing's far end.
R("W", "w-corridor", "West Corridor", 2.2, -HW, 13.8, -2.2, fin=OAK, skip="W", light=0.8, ops=[win("S", 5.0, 1.6), win("S", 9.0, 1.6), win("S", 12.4, 1.2)])
R("W", "panelled-bedroom", "Panelled Bedroom", 2.2, -2.2, 7.0, HW, fin=[(3.0, "oakpanel")], xfin={"W": "plaster"}, ops=[door("S", 3.2), win("N", 4.6, 2.2), door("E", 2.6, 0.8)])
R("W", "panelled-bath", "Bath", 7.0, -2.2, 9.0, HW, fin=TILE, floor="checker", ops=[win("N", 8.0, 0.9, 1.2, 1.0)])
R("W", "suite-bath", "Suite Bath", 9.0, -2.2, 11.0, HW, fin=TILE, floor="checker", ops=[win("N", 10.0, 0.9, 1.2, 1.0), door("E", 0.6, 0.8)])
R("W", "boudoir", "Boudoir", 11.0, -2.2, 13.8, HW, fin=CREAM, ops=[win("N", 12.4, 1.8), opening("E", 0.8, 2.4, 0, 2.3), door("S", 11.8)])
R("W", "guest-suite", "Guest Suite", 13.8, -HW, 19.0, HW, fin=CREAM, ops=[win("N", 16.4, 2.4, broken="guest-window"), win("S", 16.4, 2.4), french("E", -2.4, 1.4), french("E", 2.4, 1.4), door("W", -3.0)])
R("W", "west-porch", "West Porch", 19.0, -HW, 22.0, HW, h=3.0, fin="brick", floor="brickpav", ceil="porchceil", light=0.4,
  ops=[arch("S", 20.5, 2.0, 2.6, "arch"), arch("N", 20.5, 2.0, 2.6, "arch"), arch("E", -2.2, 2.0, 2.6, "arch"), arch("E", 0.0, 2.0, 2.6, "arch"), arch("E", 2.2, 2.0, 2.6, "arch")])
R("W", "w-upper-corridor", "Upper West Corridor", 2.2, -HW, 13.0, -2.2, 1, fin=CREAM, skip="W", light=0.8, ops=[win("S", 5.0, 1.6, 0.8, 1.3), win("S", 9.0, 1.6, 0.8, 1.3)])
R("W", "mrs-glenn-bedroom", "Mrs. Glenn's Bedroom", 2.2, -2.2, 7.6, HW, 1, fin=[(0.9, "whitepaint"), (None, "wallpaper")], xfin={"W": "plaster"}, ops=[door("S", 3.2), win("N", 4.9, 2.4, 0.8, 1.3)])
R("W", "mrs-glenn-bath", "Mrs. Glenn's Bath", 7.6, -2.2, 10.2, HW, 1, fin=TILE, floor="checker", ops=[win("N", 8.9, 1.0, 1.1, 1.0), door("W", 0.5, 0.8)])
R("W", "mrs-glenn-closets", "Dressing Room", 10.2, -2.2, 13.0, HW, 1, fin=[(2.6, "peach")], ops=[win("N", 11.6, 1.2, 0.8, 1.3), door("S", 11.0), door("E", 1.5, 0.9)])
R("W", "mrs-glenn-sitting", "Mrs. Glenn's Sitting Room", 13.0, -0.6, 19.0, HW, 1, fin=CREAM, ops=[win("N", 16.0, 2.4, 0.8, 1.3), french("E", 1.6, 1.4, 2.1), door("S", 13.8)])
R("W", "secretary-office", "Secretary's Office", 13.0, -HW, 19.0, -0.6, 1, fin=CREAM, ops=[win("S", 16.0, 2.0, 0.8, 1.3), door("W", -3.0)])
R("W", "sleeping-porch-w", "Sleeping Porch", 19.0, -HW, 22.0, HW, 1, fin="ht:stucco", ceil=None, floor="deck", light=0.3, xfin={"S": "ht:stucco", "N": "ht:stucco", "E": "ht:stucco"},
  ops=[opening("S", 20.5, 2.5, 1.0, 1.4), opening("N", 20.5, 2.5, 1.0, 1.4), opening("E", 0.0, 6.6, 1.0, 1.4)])

# ============ THE EAST (SERVICE) WING: kitchen and servants; the boys' rooms over; the basement under ==
# In this frame: "S" is the forecourt side, "N" the north-east (service yard) side, "E" the far end.
R("E", "butlers-pantry", "Butler's Pantry", 7.7, -HW, 11.2, HW, fin=KIT, floor="kitchenfloor", xfin={"W": "plaster"}, ops=[win("S", 9.45, 1.4, 1.2, 1.2), win("N", 9.45, 1.4, 1.2, 1.2), door("W", 0.0, 0.9), door("E", 0.0, 0.95)])
R("E", "kitchen", "Kitchen", 11.2, -HW, 17.6, HW, fin=KIT, floor="kitchenfloor", ops=[win("N", 12.8, 1.3, 1.25, 1.25, frame="greenpaint"), win("N", 14.4, 1.3, 1.25, 1.25, frame="greenpaint"), win("N", 16.0, 1.3, 1.25, 1.25, frame="greenpaint"), win("S", 14.4, 2.2, 1.2, 1.3, frame="greenpaint", broken="kitchen-window"), door("E", -3.1, 0.9)])
R("E", "e-corridor", "Service Corridor", 17.6, -HW, 27.0, -2.4, fin=CREAM, floor="checker", light=0.6, ops=[win("S", 21.0, 1.2), win("S", 25.0, 1.2)])
R("E", "service-stair", "Service Stair", 17.6, -2.4, 20.2, 1.6, fin=CREAM, floor=None, ceil=None, light=0, ops=[opening("S", 18.9, 1.6, 0, 2.3)])
R("E", "vault", "The Vault", 17.6, 1.6, 20.2, HW, fin="lead", floor="concrete", ceil="lead", light=0.4, ops=[door("W", 2.7, 0.9, id="vault-door", leafmat="steel")])
R("E", "larder", "Larder", 20.2, -2.4, 22.6, HW, fin=CREAM, floor="checker", ops=[door("S", 21.4, 0.85), win("N", 21.4, 0.8, 1.4, 0.8)])
R("E", "servants-sitting", "Servants' Sitting Room", 22.6, -2.4, 27.0, HW, fin=CREAM, ops=[door("S", 23.6, 0.9), win("N", 24.8, 2.0), door("E", 0.6, 0.95, id="service-door")])      # through to the scullery (the walk map found the corridor's end door opened onto the scullery's wall end: Nov 13)
R("E", "e-upper-corridor", "Upper East Corridor", 7.7, -HW, 22.6, -2.2, 1, fin=CREAM, skip="W", light=0.8, ops=[win("S", 9.5, 1.4, 0.8, 1.3), win("S", 14.4, 1.4, 0.8, 1.3), win("S", 20.0, 1.4, 0.8, 1.3)])
R("E", "boys-bath-a", "Boys' Bath (east)", 7.7, -2.2, 11.2, HW, 1, fin=TILE, floor="checker", xfin={"W": "plaster"}, ops=[win("N", 9.45, 1.0, 1.1, 1.0), door("S", 9.45, 0.8)])
R("E", "boys-bedroom-b", "Boys' Bedroom (kitchen side)", 11.2, -2.2, 17.6, HW, 1, fin="wallpaper", ops=[win("N", 14.4, 2.4, 0.8, 1.3), door("S", 12.2)])
R("E", "service-stair-up", "Service Stair (upper)", 17.6, -2.2, 20.2, 1.6, 1, fin=CREAM, floor=None, light=0, ops=[opening("S", 19.5, 1.2, 0, 2.2)])
R("E", "boys-bath-b", "Boys' Bath (kitchen side)", 17.6, 1.6, 20.2, HW, 1, fin=TILE, floor="checker", ops=[win("N", 18.9, 0.9, 1.1, 1.0), door("E", 2.7, 0.8)])
R("E", "nursery", "Nursery", 20.2, -2.2, 22.6, HW, 1, fin="wallpaper", ops=[win("N", 21.4, 1.2, 0.8, 1.3), door("S", 21.4, 0.85)])
R("E", "sleeping-porch-e", "Boys' Sleeping Porch", 22.6, -HW, 27.0, HW, 1, fin=CREAM, ops=[win("S", 24.8, 3.4, 0.8, 1.4, glass="frosted"), win("N", 24.8, 3.4, 0.8, 1.4, glass="frosted"), win("E", 0.0, 5.6, 0.8, 1.4, glass="frosted"), door("W", -3.0)])
R("E", "coal-store", "Coal Store", 7.7, -HW, 11.2, HW, -1, fin="brickint", floor="concrete", ceil="concrete", light=0.3, ops=[door("E", 0.0, 1.0)])
R("E", "furnace-room", "Furnace Room", 11.2, -HW, 17.6, HW, -1, fin="brickint", floor="concrete", ceil="concrete", light=0.5, ops=[door("E", -1.0, 1.0)])
R("E", "basement-stair", "Basement Stair", 17.6, -HW, 20.2, 1.6, -1, fin="brickint", floor="concrete", ceil=None, light=0.4, ops=[opening("N", 18.9, 0.9, 0, 2.2, id="cell-gate")])
R("E", "cellar-cell", "The Cell", 17.6, 1.6, 20.2, HW, -1, fin="stoneblock", floor="flag", ceil="concrete", light=0.25)       # the show's barred cell (tvd.py hangs the bars)
R("E", "laundry", "Laundry", 20.2, -HW, 27.0, 0.0, -1, fin=[(2.5, "whitepaint")], floor="concrete", ceil="concrete", ops=[door("N", 21.2, 0.9), door("W", -2.9, 0.9)])
R("E", "servant-bedroom-1", "Servant's Bedroom (first)", 20.2, 0.0, 23.6, HW, -1, fin=CREAM, ceil="concrete", ops=[door("E", 1.0, 0.8)])
R("E", "servant-bedroom-2", "Servant's Bedroom (second)", 23.6, 0.0, 27.0, HW, -1, fin=CREAM, ceil="concrete", ops=[door("S", 26.0, 0.8)])

# ============ THE SOLARIUM WING (in line with the main range, off the library's end) ===============
# In this frame x' runs west and y' south: "S" (y'=0) is the rear wall with the arcade's windows, "N" the garden-court
# side, "E" the wing's gable end. The arcade carries on the line of the library's porch.
R("S", "arcade", "Vaulted Arcade", 0.0, 0.0, 10.6, 2.9, h=3.4, top=3.6, fin=SUN, floor="bluestone", ceil="vault", skip="W", light=0.7,
  ops=[win("S", 1.6, 1.7, 0.75, 1.75, frame="whitepaint"), win("S", 4.75, 1.7, 0.75, 1.75, frame="whitepaint"), win("S", 7.9, 1.7, 0.75, 1.75, frame="whitepaint"), ("E", 1.45, 1.7, "archdoor", 0.0, 3.0, dict(id="arcade-door", leafmat="leaded")),
       arch("N", 1.6, 2.3, 2.9, "tudor", soffit="whitepaint"), arch("N", 4.75, 2.3, 2.9, "tudor", soffit="whitepaint"), arch("N", 7.9, 2.3, 2.9, "tudor", soffit="whitepaint")])
R("S", "solarium", "Solarium", 0.0, 2.9, 9.5, 9.1, h=3.3, top=3.6, fin=SUN, floor="bluestone", ceil="ceil", skip="W", light=1.2,
  ops=[win("E", 6.0, 3.2, 0.7, 2.0, frame="whitepaint"), win("N", 1.8, 2.2, 0.7, 1.9, frame="whitepaint"), win("N", 4.75, 2.2, 0.7, 1.9, frame="whitepaint", broken="solarium-window"), win("N", 7.7, 2.2, 0.7, 1.9, frame="whitepaint")])

# ============ UNDER THE HALL (the design, Nov 13 2026: "uncover the secret of the mansion") ==============================
# The hearth stone in the inglenook sinks into a stair (built in design.py) down to a room the plans never showed.
R("C", "hearth-stair", "The Stair Under the Hearth", -2.3, 12.1, 2.3, 14.3, -1, h=2.5, fin="stoneblock", floor="flag", ceil=None, light=0.3, ops=[door("S", 1.8, 0.8)])
R("C", "hidden-study", "The Study Under the Hall", -5.0, 5.2, 5.0, 12.1, -1, h=2.5, fin=[(2.5, "oakpanel")], floor="flag", ceil="beamdark", light=0.9)

# ============ THE GROUNDS A BODY CAN WALK (level 0, in the world's own x, y: front is -y) ==================================
# Each is an outline; the house's rooms come first where they overlap. Flat ground only: the west garden's drop and the
# slope north of the terrace are left out.
YARDS = [
    ("gate", "The Gate", [(0.0, -76.0), (13.0, -76.0), (12.0, -62.0), (-1.0, -62.0)]),
    ("drive", "The Drive", [(-1.0, -62.0), (12.0, -62.0), (7.0, -36.0), (-7.0, -36.0)]),
    ("forecourt", "The Forecourt", [(-12.8, 0.3), (-29.5, -16.4), (-30.0, -36.0), (27.0, -36.0), (29.0, -13.0), (15.5, 0.3)]),
    ("west-lawn", "The West Lawn", [(-13.0, 1.5), (-29.5, -16.4), (-30.0, -36.0), (-42.0, -36.0), (-42.0, -9.0), (-30.0, -7.0), (-30.0, 3.0)]),
    ("terrace", "The Terrace", [(-30.0, 3.0), (-30.0, 20.0), (16.0, 20.0), (16.0, 3.0)]),
    ("east-lawn", "The East Lawn", [(16.0, 3.0), (16.0, 20.0), (44.0, 20.0), (44.0, -36.0), (27.0, -36.0), (29.0, -13.0), (15.5, 0.3)]),
    ("garage-road", "The Garage Road", [(4.0, -70.0), (9.5, -70.0), (-14.6, -95.5), (-13.0, -89.3)]),
]

CONNS = []      # every way through a wall: kind, the rooms either side ("outside" beyond an outside wall), where, how wide

def note(o, a, b, axis, c, z):
    mid = (o["u0"] + o["u1"]) / 2
    wx, wy = T(mid, c) if axis == "x" else T(c, mid)
    CONNS.append(dict(kind=o["kind"], a=a, b=b, x=wx, y=wy, z=z, width=o["u1"] - o["u0"], height=o["z1"] - o["z0"], turn=(frame_deg() + (0 if axis == "x" else 90)) % 360, id=o.get("id"), sill=round(o["z0"] - z, 3)))

def auto_walls():
    for bname, (ox, oy, deg, ext) in BLOCKS.items():
        rooms = [r for r in ROOMS if r.blk == bname]
        with frame(ox, oy, deg):
            for r in rooms:
                lv = str(r.lvl)
                if r.floor: G("floor" + lv).face([(r.x0, r.y0, r.z), (r.x1, r.y0, r.z), (r.x1, r.y1, r.z), (r.x0, r.y1, r.z)], r.floor, (0, 0, 1))
                if r.ceil: G("ceil" + lv).face([(r.x0, r.y0, r.z + r.h), (r.x1, r.y0, r.z + r.h), (r.x1, r.y1, r.z + r.h), (r.x0, r.y1, r.z + r.h)], r.ceil, (0, 0, -1))
                for e in "SNWE":
                    if e in r.skip: continue
                    axis, c, a, b = r.edge(e)
                    shared = []
                    for n in rooms:
                        if n is r or n.lvl != r.lvl: continue
                        ax2, c2, a2, b2 = n.edge(OPP[e])
                        if abs(c2 - c) > 1e-3: continue
                        lo, hi = max(a, a2), min(b, b2)
                        if hi - lo > 0.02: shared.append((lo, hi, n))
                    shared.sort(key=lambda s: s[0])
                    W_ = wall_x if axis == "x" else wall_y
                    for lo, hi, n in shared:
                        if e not in "NE" or OPP[e] in n.skip: continue
                        ops = [o for o in r.opsof(e) + n.opsof(OPP[e]) if lo - 0.01 <= (o["u0"] + o["u1"]) / 2 <= hi + 0.01]
                        W_(c, lo, hi, min(r.z, n.z), min(r.topof(e), n.topof(OPP[e])), T_INT, n.fin, r.fin, ops, lvl=lv, floor_pos=n.z, floor_neg=r.z)
                        for o in ops:
                            if o["kind"] != "win": note(o, r.id, n.id, axis, c, max(r.z, n.z))
                    cur = a
                    gaps = []
                    for lo, hi, n in shared:
                        if lo - cur > 0.02: gaps.append((cur, lo))
                        cur = max(cur, hi)
                    if b - cur > 0.02: gaps.append((cur, b))
                    xf = r.xfin.get(e, ext[r.lvl])
                    t = T_EXT if xf not in ("plaster",) else 0.2
                    for lo, hi in gaps:
                        ops = [o for o in r.opsof(e) if lo - 0.01 <= (o["u0"] + o["u1"]) / 2 <= hi + 0.01]
                        lo2 = lo - t / 2 if abs(lo - a) < 1e-6 else lo
                        hi2 = hi + t / 2 if abs(hi - b) < 1e-6 else hi
                        inside_pos = e in "SW"
                        for o in ops:
                            if o.get("broken"): note(dict(o, kind="window", id=o["broken"]), r.id, "outside", axis, c, r.z); continue      # a broken window: a way in for the dead
                            if o["kind"] == "win" or o["z0"] > r.z + 0.05: continue
                            note(o, r.id, "outside", axis, c, r.z)
                            if r.lvl == 0 and o["kind"] in ("door", "archdoor", "french"):       # two stone steps down to the ground
                                sg = -1 if e in "SW" else 1; gs = G("steps")
                                for d0, d1, zt in ((0.17, 0.6, -0.04), (0.6, 0.98, -0.27)):
                                    lo_, hi_ = sorted((c + sg * d0, c + sg * d1))
                                    if axis == "x": gs.box(o["u0"] - 0.15, lo_, -0.62, o["u1"] + 0.15, hi_, zt, "flag")
                                    else: gs.box(lo_, o["u0"] - 0.15, -0.62, hi_, o["u1"] + 0.15, zt, "flag")
                        W_(c, lo2, hi2, r.z - (0.6 if r.lvl == 0 and xf != "plaster" else 0.0), r.topof(e), t, r.fin if inside_pos else xf, xf if inside_pos else r.fin, ops, lvl=lv, floor_pos=r.z, floor_neg=r.z)
