# SURVIVORZ, GLENRIDGE HALL: THE FLOOR UNDER EACH ROOM, for its footsteps (the review, Nov 13 2026: "the floor
# heard is not the floor drawn in 31 of 77 rooms"). The page used to guess a room's floor from its id; now the build
# says what it laid, and this file turns the build's floor material into the page's surface
# (client/src/survivorz/audio/rules.ts Surface). Pure Python: walkmap.py imports it inside Blender, and it runs by
# itself to write the surfaces into the data files without a rebuild:
#
#   python scripts/survivorz/glenridge/floors.py        (reads plan.py as text; writes glenridge-site.json and
#                                                         docs/survivorz/glenridge-map.json)
import io, json, os, re

# the build's floor material -> what a foot sounds like on it
BY_MAT = {
    "oakfloor": "wood", "deck": "wood",
    "flag": "stone", "bluestone": "stone", "brickpav": "stone",
    "checker": "vinyl", "kitchenfloor": "vinyl",
    "concrete": "concrete",
    "latticecarpet": "carpet",
}
# rooms the plan doesn't floor itself (built elsewhere, or dressed over): by id
BY_ID = {
    "boys-bedroom-a": "carpet",                 # the lattice carpet (photo 32)
    "scullery": "vinyl", "garage": "concrete", "stefans-bedroom": "wood", "breakfast-room": "wood",
    "inglenook": "stone",                       # the hearth's flags (the game build opens the floor there, so the plan says None)
    "terrace": "stone",
    "gate": "gravel", "drive": "gravel", "forecourt": "gravel", "garage-road": "gravel", "garage-court": "gravel",
    "east-lawn": "carpet", "west-lawn": "carpet",        # wet grass: the soft step stands in for it
}

def surface_of(id_, mat=None, outdoor=False):
    """The surface for a room: its own entry, else the build's floor material, else boards indoors and gravel out."""
    if id_ in BY_ID: return BY_ID[id_]
    if mat in BY_MAT: return BY_MAT[mat]
    return "gravel" if outdoor else "wood"

def plan_floors(plan_path):
    """room id -> the floor material the plan gives it (read as text: plan.py needs Blender to import)."""
    out = {}
    for line in io.open(plan_path, encoding="utf-8"):
        m = re.match(r'\s*R\("[A-Z]",\s*"([a-z0-9-]+)"', line)
        if not m: continue
        f = re.search(r'\bfloor=(None(?: if GAME else "([a-z]+)")?|"([a-z]+)")', line)
        out[m.group(1)] = (f.group(2) or f.group(3)) if f else "oakfloor"
    return out

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, "..", "..", "..")
    mats = plan_floors(os.path.join(here, "plan.py"))
    for rel, compact in (("src/survivorz/glenridge-site.json", True), ("docs/survivorz/glenridge-map.json", False)):
        p = os.path.join(root, rel); j = json.load(io.open(p, encoding="utf-8")); n = {}
        for r in j["rooms"]:
            s = surface_of(r["id"], mats.get(r["id"]), bool(r.get("outdoor")))
            r["surface"] = s; n[s] = n.get(s, 0) + 1
        with io.open(p, "w", encoding="utf-8", newline="\n") as f:
            if compact: json.dump(j, f, separators=(",", ":"))
            else: json.dump(j, f, indent=1)
        print(rel, n)
