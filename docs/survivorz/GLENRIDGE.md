# SOLACE SURVIVORZ — GLENRIDGE HALL (the next map, started Nov 12 2026)

Josh, Nov 12 2026: *"build a blender rendered version of this mansion as the next map for survivorz this also
includes the outside as well … I would like the map to be one for one in detail and look exactly like the
mansion."* His three rulings the same day: rooms nobody photographed are designed in matching period style;
the house is **pristine, as photographed**; outside it is **raining and storming, the lamps lit**.

Glenridge Hall: Tudor Revival, built 1929 for Thomas K. Glenn, Sandy Springs, Georgia; demolished 2015.

**The weather is fixed: night, raining, thunder and lightning** (Josh repeated it Nov 12: "remember i also want it to
be night but thundering / lightning, raining"). Every show render and the game's own lighting are a night storm:
"storm" = the dark between strokes (lamps, lit windows, rain); "flash" = the instant of a stroke (hard cold light,
the bolt in the sky). The "day" renders exist only to check shapes. The game side owes the same: rain, wet
surfaces, lightning flashes on a random clock with thunder after each, wind.

**THE BAR IS PHOTOREAL (Josh, Nov 12 2026):** *"i want this mansion to be photo realistic, i want fantastic 1 for 1
texturing and details, and i want proper lighting. we have to get this map ready to debut in front of a passionate
vampire diaries fan base."* Glenridge Hall is the Salvatore boarding house of the show's pilot; the audience knows
it. Stages 1-5 below are the LAYOUT (right rooms, right places, walkable); they are not the finish. Nothing is
"done" until a render of it can sit beside its photo. The realism pass, in order of what a viewer notices:
1. Surfaces at true scale with relief (done Nov 12: Poly Haven's own sizes in `texture-sizes.json`, height maps as
   bump, oak grain on every timber). Still owed: hand-made brick with the house's irregular bond and dark headers,
   weathered slate in diminishing courses, adzed beams, real plaster.
2. Real detail in place of boxes: moulded panelling and linenfold, the carved frieze, turned balusters and the
   carved newel, door ironwork, true diamond leading, brick arches with their voussoirs, bargeboards, chimney caps.
3. Lighting: lamps as real fittings with shades that glow, firelight, lightning through the windows, a night sky
   with cloud, mist in the rain, wet ground with puddles and reflections, glow round the lights (`bloom.mjs` for
   the stills). In the game: baked lightmaps per room, as the bunker's set was.
4. Vegetation: real trees, shrubs, ivy and lawn in place of the stand-ins.
5. The show's own furnishings where the photos show them (the red damask, the tapestries, the portraits).

**Credits owed (CC Attribution): must appear wherever the map is shown.** "Oak Tree" by BBARTS (Sketchfab,
https://sketchfab.com/3d-models/caf081828df84d7cbb07b4107991facc) — every tree in the wood; and "1967 Chevrolet Camaro SS" by adrianaflak09 (Sketchfab, CC BY), the car on the
forecourt. Both are credited in `ASSETS.md` and on the public page (`client/public/survivorz.html`). Everything
else is CC0 (Poly Haven; the Cleveland Museum of Art's Open Access images, listed in `free/art/credits.json`).

**THE LOOK IS THE VAMPIRE DIARIES, SEASON 1** (Josh, Nov 12 2026). What the season-1 frames show (reference
`tvd-s1/` + its NOTES.md, private): the great room, the long gallery, the front door and the terrace door ARE the
real Glenridge rooms, shot on location and dressed, so the real house is the right base. Two rooms were sets with no
real counterpart and are built by `tvd.py` where the house has room: **Stefan's bedroom** (timber trusses, board
lining, the bed with red pillows, desk, shelves) in the roof over the solarium, and **the cell** (iron-barred) in the
basement off the foot of the stair. The great room is dressed as the show frames it (crossed swords over the fire,
portraits and lamps either side of the inglenook, red curtains, sofas facing across the hearth). Not yet built: the
sunken library/study the show uses from 1x12. The best frames (the wiki's 1920-wide season-1 screencaps) were not
fetched: the site forbids scripted access; `tvd-s1/fandom-wiki-s1-screencap-index.tsv` lists them to open by hand.

## Reference (private, gitignored: `assets/downloads/survivorz/reference/glenridge/`)
- `jeffherr/` — the 35 photos of Jeff Herr's "Glenridge Hall Documentation Project"; `PHOTOS.md` says which
  room each shows; `sheets/` are contact sheets.
- `web/` — 64 more files, indexed in `web/NOTES.md` with every source and a FACTS list (sourced / inferred):
  the 1982 National Register nomination (PDF + OCR text: a room-by-room description and 27 photos from 1980),
  the only pre-demolition aerial (Esri Wayback, 0.25 m/px), a pen drawing of the whole front, colour interiors.
- **No floor plan exists online** (the nomination mentions "the architect's plans"; they were never published).
  The plan here is worked out from the nomination's text, the aerial's roof plan and the photos. The one
  stated size is the Great Hall, 45 × 30 ft. If Josh ever gets the plans, `plan.py` is the only file to change.
- Photos are a photographer's work: reference only, never committed, never shipped.

## What the sources fix
- Central block, two primary wings thrust forward at 45°, one secondary wing, a porte-cochère; two storeys,
  attic, part basement. Front faces south-east (the nomination's text calls it "south").
- Aerial: main range about 36 m; east wing about 26 m; south-west wing about 22 m; wings 8–10 m deep.
  The secondary (solarium) wing runs **in line** with the main range off the library's end.
- Entry: porte-cochère → low panelled vestibule → the long gallery across the front, linking the wings →
  the Great Hall behind it, two steps down, its fireplace (8 ft wide, 5 ft tall, in a niche "the size of a
  small room") opposite the entrance. Library at the hall's west end and dining room at its east, each through
  a wide Tudor arch; a balcony over the library's arch; the upper gallery looks down into the hall.
- The hall's ceiling is a lining, symmetric about the hall; the true roof (over hall and gallery) is higher.
- East wing: octagonal breakfast room (between dining room and wing), butler's pantry, kitchen, servants'
  sitting room, larder, lead-lined vault, service stair; the boys' rooms and sleeping porch over; basement
  (furnace, coal, laundry, two servants' bedrooms) under.
- West wing: panelled bedroom, guest suite with boudoir and a screened porch at the end; Mrs. Glenn's suite
  (bedroom, sitting room, secretary's office, sleeping porch) over, joined to Mr. Glenn's (over the library;
  his "gym" over the solarium).
- Solarium wing: the solarium, with a cross-vaulted arcade along its rear side from the library's porch to
  its own pointed door.

## The build (`scripts/survivorz/glenridge/`)
    node scripts/survivorz/glenridge/fetch-textures.mjs          # 45 CC0 Poly Haven sets, once
    blender -b --factory-startup --python scripts/survivorz/glenridge/build.py -- --renders all --res 1280
    (… --only front,hall picks cameras; set SURVIVORZ_ASSETS in a worktree)
- `geo.py` — the kit: 2D frames (a splayed wing is a frame at 45°; UVs are in the frame's metres, so courses
  run level on a turned wing), walls split round their openings (no booleans), pointed and Tudor arches,
  half-timbering, leaded windows, doors, gable/hip/lean-to roofs, chimneys.
- `plan.py` — the rooms (59: basement, ground, upper) as rects per block with their finishes and openings;
  `auto_walls` makes a partition where two rooms share an edge and an outside wall anywhere else.
- `build.py` — materials, the Great Hall's lining and three hammerbeam trusses, the stair, the hinges, the
  octagon, roofs, porte-cochère, grounds, trees, lamps, the storm sky, cameras, renders.
- Out: `assets/downloads/survivorz/set/glenridge.blend`; renders `docs/survivorz/plans/glenridge-*.png`.
- `ROOM_<id>` empties (name, level, size, turn) and `geo.DOORS` (id, position, turn) are for people and scripts in
  Blender. **The show's page reads neither** (checked against `client/src/survivorz/show/zones.ts`, Nov 12): rooms
  and doors come from the map's own data. What it does read is in "The game side" below.

## Stage 1 — done Nov 12: the shell
All four blocks standing with every room walled, floored and lit; roofs, chimneys, eyelid dormers; the
porte-cochère; the Great Hall's roof, gallery edge, arches, inglenook and fireplace; the main stair; forecourt,
drive, rear terrace and steps; a wood of 420 trees; night-storm lighting with the windows lit.

## Stage 2 — done Nov 12: the first dressing
- `details.py` (run inside build.py): the stair gable's oriel, the dormer by the big chimney, lantern cages, the
  east wing's low hipped end, diagonal braces in the half-timbering, shrubs at the walls' feet, 420 branching
  trees as copies of four, **rain** (26,000 streaks, storm renders only), wet slate / gravel / flags, the Great
  Hall's red curtains.
- `furnish.py`: furniture as copies of Poly Haven's CC0 models at true size (`put`, `tinted` for the red
  sofas), rugs / tapestries / portraits / landscapes from the Cleveland Museum of Art's Open Access images
  (`free/art/credits.json` holds each one's title and page), built-in bookcases with books, tables, shade lamps.
  Furnished so far: Great Hall, library, dining room, long gallery, vestibule, solarium, a first pass upstairs.
- `fetch-dressing.mjs` (57 models, 32 images) and `trim-art.mjs` (museum backgrounds off the rugs).
- Cameras: front, front-flash (lightning), front-day, aerial, aerial-rear, court, rear, porte, hall,
  hall-gallery, library, dining, plan-ground, plan-upper.

## Stage 3 — done Nov 12: ceilings, the service rooms, fittings (`rooms.py`)
Beams under the gallery, vestibule and dining-room ceilings; the library's plaster strapwork (squares, lozenges,
rings); the upper gallery's boarded barrel with ribs; the arcade's pointed vault; the kitchen (green frames, cream
panels, the steel sink run under the three windows, glazed uppers, the yellow table) and the butler's pantry
(glazed cupboards to the ceiling, the ladder); the breakfast room's table and chairs; a chandelier in each of the
best rooms and a globe on a rod elsewhere. Cameras added: kitchen, pantry, arcade, upper-gallery, breakfast.

## Stage 4 — done Nov 12: the garden side and the estate (`grounds.py`)
The rear terrace's pierced-brick parapet and the urns at the head of the steps; the five-tier rock garden (stacked
stone walls, planted beds, boulders, a flight of steps per tier, the path along the foot); the half-timbered dining
porch and the pent roof over the library porch; a brick plinth under every outside wall (the ground is 0.5 m below
the floors); stone edging round the forecourt; the servants' cottage with its five-door garage and three dormers,
and the pump house with its cupola, on a spur off the drive about 100 m from the house. Lightning renders light the
whole sky (sheet lightning), so the garden side and the cottage read. Cameras added: garden, terrace, cottage.

## Stage 5 — done Nov 12: getting about, and the export (`service.py`, the end of `build.py`)
- The service stair (two flights round a landing) with the basement stair under its second flight; two stone steps
  at every outside door; the basement's furnace, coal and laundry; rugs in the bedrooms.
- **`docs/survivorz/glenridge-map.json`** — the map as data, in the GAME's coords (x east, y up, z south): 66 rooms
  (id, name, level, block, turn, floor, height, four corners or a polygon), every way between rooms (kind, the
  two rooms, where, width, the wall's turn; "open" where rooms run together; "overlook" for the balustrades over
  the hall), the three stairs (their rooms and walking lines), and the 57 door leaves. Rewritten on every build.
- **The build checks itself:** it prints `REACHABLE from the front door: N of N rooms` and lists every way to the
  outside. All rooms are reachable (Nov 12).
- `--export` writes `assets/downloads/survivorz/set/glenridge.glb` (243 MB: everything but the rain and cameras,
  lamps as punctual lights, textures inside). Not yet split by room, baked or lightmapped as the bunker's set was.
- Not in the map file yet: the cottage's and garage's rooms, the attic.

## Stage 6 — Nov 12: the realism pass, joinery in real relief (`hall.py`, `stair.py`)
Flat textures standing in for joinery were the loudest tell. Now built as geometry, from the photographs:
- **Oak panelling** (`panel_wall` in `hall.py`): raised-and-fielded panels in stiles and rails, a skirting and a
  dado rail. Every wall face the plan calls `oakpanel` gets it by itself (`geo.PANELS`, recorded as the walls are
  built: 41 faces, about 20,000 polygons). The Great Hall's goes to the gallery floor under a carved frieze with
  painted shields, dentils and a stepped cornice; rough ochre plaster above (photos 02, 05).
- **The inglenook**: the wide oak arch with two orders of moulding, a shaft each side and a square label; a
  panelled dado; lancets in pale stone; the stone chimneypiece (four-centred opening, tracery panels, a frieze of
  seven carved squares, a leaf cornice), the tapering hood with banner and crossed spears, a herringbone
  fireback, firedogs (photos 04, 05).
- **Fires** (`fire()` in `build.py`): logs, embers, and flames as soft teardrops whose shader runs yellow to red
  to nothing up their height.
- **Chandeliers**: wrought iron, two tiers, an amber shade on every candle (photo 02).
- **The main stair** (`stair.py`, photo 09): turned vase balusters, a moulded handrail, newels with finials, a
  closed string, panelling under the flights, the red carpet, the iron lantern. The same balusters edge the
  gallery over the hall and the hall balcony.
- Interior plaster is a rough stucco scan, not a flat colour. The porte-cochère's roof no longer runs into the
  stairwell; the inglenook's gable no longer shows inside the hall.

**The outside, the same day** (photos 19, 26): the roofs are slates of mixed quarries, each with its own colour and
its own lower edge (a procedural material; rows run along the ridge); the leaded lights are true diamonds, 12 cm
by 18, every quarry at its own slight tilt so each catches the light; the brick has burnt and pale patches; the
porte-cochère stands on pale stone piers with caps, under curved braces, with a dark oak door. The long gallery is
dressed as the show's 1x05 frames it (`tvd.py`). Three roofs that ran through walls into rooms are cut back (the
porte-cochère's, the vestibule's, the garden entry's).

**Rooms checked against their photos, the same day:** the dining room (photo 12: yellow plaster, dark boards between
the beams, one long bare table, red pelmets and curtains at the French doors and the bay, sconces, two lamps under
the portrait); Stefan's bedroom (warm narrow boards along the roof; the "tiles" seen before were the slate roof's
underside showing below the lining, which now sits clear of it). Lightning (`make_bolt`, `make_glow`): a thin forked
stroke, a glow in the cloud behind it, a hard cold light, the mist thinned for the flash so the night stays dark.
The lawn has worn and lush patches. Rug photographs are cropped to the rug. A camera a few millimetres outside a
wall renders black: the breakfast room's did.

**The breakfast room** (photo 18): the tent in teal and cream stripes up to a rose at the crown, a scalloped valance,
painted landscapes on the blind walls over a dado with painted balusters, a glazed iron lantern, green slate floor.
**Plants:** a Poly Haven plant file holds several plants in a row; `variants()` in `furnish.py` cuts each into single
plants (placing a whole file put its far end through the kitchen wall). `in_house()` in `details.py` keeps every
shrub and plant out of the rooms.

**The kitchen, pantry and library** (photos 23, 24, 06): green cupboards with yellow panels and a drawer row, glazed
uppers on brackets (an open carcass, real shelves, the china showing), the steel sink run, black-and-green lino
(`kitchenfloor`); the library's panelling carries the hall's frieze and cornice, its sofas are the red pair.
**The sun room, the arcade and the vestibule** (photos 29, 11, 07): pale yellow over a black skirting, white window
frames, blue-grey slate flags (`bluestone`), low white arches, a painted frieze of flowers, lattice grilles under the
windows, the parasol at the ceiling; the vestibule in rough plaster with a carved cabinet (a day bed had stood in
front of the front door). Table lamps have tapered shades. **More roofs cut back out of rooms:** the solarium's and
both wings' ran into the upper bedrooms where they tuck under the great roof; the library chimney's stack hung
below a ceiling. Check every upper room from inside after any roof change.

**The west end's garden** (photo 27; cameras `west-end`, `west-end-day` at the foot of the steps): the ground falls
2.5 m west of the sun room (`ground_h`), a flagged landing outside the arcade's glass door, clipped box in
terracotta pots on rubble piers, the stone steps between rubble walls, lead urns at their foot, a flagged path, a
clipped hedge along the bank; the gable's herringbone brick brought up to its real red. (Steps laid on the bank's
own line are buried by it: they sit 16 cm proud.)

**The twin bedroom, the porches, the terrace, the furnace room** (photos 32, 16, 15): the boys' bedroom over the
dining room has sprigged paper (`wallpaper`) over a pink skirting, a trellis carpet, twin beds under lace-hung
half-testers (`twin_bed`) and a swagged bay; the brick porches have blue-and-bare boarded ceilings (`porchceil`) and
Moravian star lanterns (`star`); the terrace's piers are rubble with iron urns of flowers on plinths; the furnace
room has worn wooden shelving and crates (the bunker project's oil drums and warehouse racking are in the same
model folder and are wrong for 1929: do not use them here). The dining porch's roof was the sixth found inside a room.

**Room doors** are six fielded panels with a brass knob and plate (`geo.door`); plank doors to the outside keep their
iron straps. Globe lamps are smooth.

**How heavy the set is (measured Nov 12, for the game side):** the built geometry is 417,000 faces, of which the
shrubs and their leaves are 244,000, the rain 25,000 (a still's rain; the show draws its own), panelling 24,000,
dressing 20,000, ivy 13,000, balusters 16,000, the Great Hall's joinery 10,000; walls, floors, roofs and doors
together are under 30,000. On top: 90 pieces of furniture from 33 scanned models, one oak mesh set out 420 times,
59 bed plants. `glenridge.blend` is 121 MB; the last `--export` GLB (before the realism pass) was 243 MB. The
leaves are the first thing to thin for a live scene.

## The game side (surveyed Nov 12 against the bunker's pipeline; step one built)
**What the show's page loads for a map**, per zone: `rooms/<zone>/<zone>.glb`, `lightmap.exr` and (optional)
`lightmap-mains.exr`, served by `/api/survivorz/asset/<area>/<file>`. In the GLB it lightmaps every mesh named
`SHELL*` through its second UV set, makes `GLASS_*` transparent, treats `FIXTURE_p<i>` as lamp `i` of the zone's
layout, and draws anything else as it comes. It builds every door leaf itself from the map's doors, has a fixed
light rig (no light in a GLB is used), and places props from a layout JSON. The bunker's shell is generated from its
TypeScript map by `room-build.py`, which cannot read this house: Glenridge needs its own bake and export ending in
the same files.

**Step one, built: `game-export.py`.** From the lighter build (`GLEN_LEAVES=0.3 GLEN_BLEND=glenridge-game.blend`) it
writes four zones as `rooms/<zone>/<zone>-src.glb`: `glen-ground`, `glen-upper`, `glen-basement`, `glen-outside`,
each one `SHELL_<zone>` mesh, its `GLASS_<n>`, and the dressing, furniture and plants unbaked; no lights, cameras,
rain, lightning or door leaves. It writes `docs/survivorz/glenridge-zones.json`: triangles per zone and which
materials are node set-ups.

**What step one measured** (Nov 12; triangles; `glenridge-zones.json` has the detail):

| Zone | Shell | Dressing and plants | Furniture and trees, as drawn | Source GLB |
|---|---|---|---|---|
| `glen-ground` | 100,000 | 44,000 | 3,580,000 (200 pieces of 42 scanned models) | 164 MB |
| `glen-upper` | 62,000 | 7,000 | 420,000 (38 pieces) | 71 MB |
| `glen-basement` | 1,400 | 5,000 | 183,000 (7 pieces) | 53 MB (43.7 MB packed) |
| `glen-outside` | 21,000 | 219,000 | 44,900,000 (one oak of 107,000, set out 420 times) | 71 MB |

The house's own geometry is light. Two things are far over the show's budget (hero prop 30,000, ordinary 8,000,
at most 800 draw calls in view): **the oak** (the show needs a stand-in of a few thousand triangles, or far fewer
trees near the house) and **the scanned furniture** (it needs the triangle tiers `pack-props.mjs` gives the
bunker's props). `room-pack.mjs` packs a Glenridge zone as it stands (tried on the basement).

**Still to build, in order:**
1. ~~Built materials to pictures.~~ **Built Nov 12: `game-materials.py`.** Slate, the slate flags, the lino, the
   wallpaper, the carpet and the four boardings are each baked (colour, bump as a normal map, roughness) from a
   square sized to whole slates, flags or boards, into `set/glen-tex/`, and the material is swapped for one made
   of those pictures; the leaded and frosted glass are drawn (lead opaque, panes nearly clear). With `GLEN_GAME=1`
   the build leaves the node tints off the scans (brick, grass), which a GLB cannot carry. Only the flame is still
   nodes; the show draws its own fire. Run order: the game build, then
   `blender -b glenridge-game.blend --python game-materials.py --python game-export.py`.
2. ~~The lightmap bake.~~ **Built Nov 12: `game-export.py --bake`** (`--size 4096 --samples 256`), the bunker's
   recipe: a second UV set `lightmap`, a Cycles diffuse bake of the light alone from the house's own lamps and
   fires on a storm night, OIDN, half-float EXR at `rooms/<zone>/lightmap.exr` (a small picture of each is at
   `docs/survivorz/plans/lightmap-<zone>.png`). **Only walls, floors and ceilings are unwrapped** (welded first, so
   a wall is one island). Unwrapping the joinery as well gave a hundred thousand islands of a few texels each
   and the margins between them ate the picture. The joinery is hidden while the light is baked, and each of its
   faces then reads the lightmap where the nearest wall, floor or ceiling does (`borrow`). About a quarter of
   those faces stand further than 0.4 m from any such surface (trusses, chandeliers, balusters) and take the
   nearest one's light all the same. `glen-outside` is not baked. Not yet seen in the show's page.
3. **Pack and serve: done for the look test (Nov 12).** `room-pack.mjs <zone>` packs each zone as it stands. The
   four zones are in the admin's set viewer (Admin Panel, Survivorz, Assets, Set look: pick a zone from the menu):
   `AREAS` in `survivorz-assets.ts`, `client/src/survivorz/room/glenridge.ts` (labels, areas, where to stand),
   `LOOK_ZONES` in `room/lobby.ts`. Seen there on a local server: the great room, kitchen, long gallery and twin
   bedroom load with their baked light. (At that step the show itself still played the bunker; it plays the mansion
   since stage S4, below.) Known in the viewer: the lamps' orange
   reads stronger than in the stills (exposure and the page's tone curve, not lost tints: a plain colour multiply
   reaches the GLB as the material's colour factor); furniture is unbaked and lit only by the viewer's fill; the
   fire is a flat shape; the outside zone has no baked light; one zone shows at a time. The packed files are big
   (at that step: ground floor 198 MB, upper 107 MB, outside 65 MB, basement 44 MB; today 182, 107, 76 and 77) because the furniture is full scans.
   **Thinned and batched (Nov 13).** `zone-weigh.mjs <zone>` says what a packed zone weighs and where. It showed the
   ground floor drawing 3.7 million triangles (1.6 million of them bed plants filed with the indoor furniture) and
   the outside 45 million (the oak). `game-export.py` now cuts each scanned model and the oak down once for the
   show's build (`GOALS`: the oak to 10,000 triangles, a shrub 2,500, furniture 8,000; `--full` keeps the scans),
   files the garden plants with the outside, and `room-pack.mjs <zone> --instance` draws a model used three times
   or more as one batch. After: ground 254 draws (was 514), upper 97, basement 29, outside 45 (was 1,287);
   packed 182, 106, 43 and 73 MB. The size left is textures: the ground floor carries 194 of them, 167 at 1024
   (the furniture's) and 14 at 2048 (the walls' and floors').
   **The rooms' own lamps (Nov 13).** `build.py` writes `client/src/survivorz/room/glenridge-layout.json`: per zone,
   every lamp the stills are lit by (189 today: 101 ground, 52 upper, 22 basement, 14 outside) as a fixture of kind
   `lamp` with the room it stands in, and every room's outline (`roomPolys`, since the wings stand at 45 degrees).
   The viewer hands its ten real-time lights to the lamps of the room the camera is in, so furniture is lit by that
   room's lamps and not only by the fill (seen in the great room). `lamp` is a new fixture kind with no model of its
   own (the show's `zones.ts` and `rig.ts` place it since S4).
   **The walk map (Nov 13): `walkmap.py`**, run on the game build, writes `src/survivorz/glenridge-walk.json` (the
   bunker's shape: four cells to the metre, a 0.3 m body, run-length rows per floor, top floor first, plus the
   stairs as links and a report) and a picture per level (`plans/glenridge-walk-<level>.png`: green reached, red
   open but not reached). It is cut from the geometry, not from the map data: a cell is open if it is inside a
   room's outline and nothing stands within a body's radius of it between ankle and head height; every way the
   map records is cleared for the width a body can use; door leaves are left out. Then it walks the house from the
   front door, up and down the stairs. **Result: all 66 rooms reached.** It found two real faults on its first run,
   both fixed: the service corridor's end door opened onto the end of the scullery's side wall (the scullery now
   opens off the servants' sitting room), and a bed stood across the boys' bathroom door. The build's own
   reachability check had passed both, because it counts doors, not floor. Left as they are: 53 cells inside the
   breakfast room's ring of chairs and 20 behind the furnace that a body cannot reach. Run it after any change to
   walls or furniture.
   **For the simulation (Nov 13):** the same run writes `glenridge-sight.json` (what hides a line of sight: only
   what stands at eye height), `glenridge-site.json` (the 66 rooms with their outlines, and 80 doors each with its
   place: centre, normal, size) and, in the walk file, `simLinks` (the three stairs) and a `label` grid (which room
   every cell is). Four rules it keeps, each learned from a failure:
   - **One room, one piece of floor.** Outlines overlap at the hinges and wing ends; a room's stranded floor is
     given to the neighbour it touches most.
   - **Each side of a door is its own room.** The cells cleared through a wall are labelled by side, never by
     outline.
   - **A doorway wherever two floors meet.** Rooms that run into each other with no wall get a doorway at the
     meeting, including pairs the map does not record (each west corridor opens into the gallery, not the hinge).
   - **Floor nobody can reach is not floor** (the breakfast room's ring of chairs, behind the furnace).
   A door in a 45-degree wall is cleared at least 0.54 m wide, or its cells touch only at their corners.
   It found three more faults, fixed in `furnish.py`: an armchair inside the guest suite's corridor door, another
   behind the door of Mrs. Glenn's sitting room, and a potted plant behind the solarium's north library door.
4. **The simulation** is written for axis-aligned rectangular rooms on floors 8 m apart with straight-line stairs,
   and for one map per build.
   **Done Nov 13, the navigation:** `sim/nav.ts` takes a map (`new Nav({ walk, sight, site })`; no argument is the
   bunker, unchanged: `nav-print.mjs` printed the same fingerprint before and after that change, and `test-sim.mjs` is green).
   A room may carry an outline (`Room.poly`), a door its own place (`Door.place`), a walk file its own room labels
   and stairs between two rooms (`upperRoom`/`lowerRoom`), and floor heights come from the map. **Check:
   `node scripts/survivorz/glenridge/test-nav.mjs` (19 today)**: the mansion builds, 66 rooms each with one piece of
   floor, three stairs, a route from the front door to every room, every one of the 80 doors walkable on its own,
   shut doors stop a route, sight across the hall and not into the kitchen.
   **Stairs have a shape (Nov 13):** a stair portal carries its line (`Portal.line`, upper end first), takes its
   length at `STAIR_PACE` (0.9 m/s: main stair 13.7 s, service 9.5, basement 6.3) and a body on it follows the line round its landings
   (`alongStair` in nav.ts, called by the world's `walkLink`; a stair with no line slides straight, as the bunker's do).
   **Still to do at that step (all done since, in S1 to S4):** floor heights elsewhere in the sim (`FLOOR_Y`, `NODE_FLOORS`, the dead's floor arithmetic);
   seeing and hearing between levels (the
   gallery over the hall); the hall's step down; a second map selectable at start; the show page streaming the
   mansion's zones and placing `lamp` fixtures.
5. **Josh's design (Nov 13 2026), in his words:** "think resident evil one."
   - **Objectives:** "eliminate the zombies inside, uncover the secret of the mansion", plus more in that spirit
     (proposed below).
   - **Start:** "outside in the rain they must make it to the open front door and close it and lock it."
   - **The dead:** "can come through broken windows, they are already spawned around the mansion."

   **AGREED Nov 13 2026 ("lets do what you reccomend"): one hour, six survivors.** The secret: the sickness began in
   this house; the family has kept the first of the dead chained in the basement cell since 1929; the journals in
   the hidden study are the proof. The ending: leave by car with the proof. The lights go out once, mid-show.
   1. **Get inside (to ~5 min).** They start at the gate on the drive, in the rain, apart. The dead stand in the
      grounds. Reach the open front door, shut it, bolt it. Anyone still outside when it is bolted has to be let in.
   2. **Seal the house (to ~20 min).** Five ground-floor windows are broken (dining room, library, solarium, guest
      suite, kitchen). The dead outside climb in through an unboarded one about every two minutes (`GLEN.climbMin`/`climbMax`). Board each
      with planks from the coal store (strength, mechanics). Then kill what is already inside: about eight.
   3. **The four crests (to ~45 min).** The great hall's chimneypiece has four empty shield sockets. One crest in
      each part of the house, each behind a different kind of obstacle so every skill has a use:
      the vault off the butler's pantry (lockpicking, or the butler's key); the library (science: the ledger
      names the shelf); Mrs. Glenn's sitting room upstairs (scavenging: a search); the basement cell
      (fighting: something strong is chained in it).
   4. **The secret (to ~55 min).** All four crests set, the inglenook's fireback opens on a stair down to a hidden
      study under the hall (to build: the sunken library). The journals there say what the house is.
   5. **The way out.** Carry the proof to the car under the porte-cochere (keys upstairs, fuel in the cottage) and
      leave; or hold until dawn.
   Also proposed: the storm takes the power once, mid-show (restart the plant in the furnace room: electronics,
   mechanics); one room the dead never enter, with the only medical supplies; ammunition scarce; doors locked by
   wing until their key is found.
   Josh's brief for the rest: finish the mansion and its grounds, and make it play in Survivorz seamlessly.

## The integration plan (Nov 13, from two surveys of the code; work it top to bottom, each stage green before the next)

**What the surveys found.** The simulation and the page each read the bunker directly: `sim/map.ts` (MAP, START_ROOMS,
SPOTS_OF) is imported by world.ts, survivor.ts, knowledge.ts, maps.ts and routes/survivorz-show.ts, several at module
load; the chosen map never reaches the sim (index.ts, broadcast.ts and talk/show.ts build a world with no map); the wire
carries no map id; objectives are hard-coded for the crank, the radio and the armory across goals.ts,
world.objectiveWork, survivor.ts's job menu, knowledge facts, wire `Goals`, broadcast, talk and the page's overlay;
the dead are placed from a table of bunker room ids and arrive in "tunnel"; many calls assume floor 0 (`roomCell(.., 0,
..)`, `cellAt(0, ..)`, noises on floor 0, `/ 3` in zombie.ts); there is no lights-out mechanic (`isDark` is always
false). On the page `show/site.ts` IS the bunker (rectangles, floor 0, one zone), the rig drops `lamp` fixtures,
shots and camera clamp to rectangles, the overlay's text and objective rows are bunker text, bodies with no room are
hidden, and there is no sky, rain or lightning.

- **S1. One map handed to the world (no change to the bunker).** `SimOptions.map` -> `world.map` (a MapDef: site,
  walk, sight, start rooms, spots, the dead's placements and arrivals, its scenario); Nav, FacilityWorld, doorUsed,
  the snapshot, knowledge's zones, survivor.ts's caches all read it; the save names it; index.ts, broadcast.ts,
  talk/show.ts and the routes pass it; floor-0 and `/ 3` arithmetic go through nav. Proof: nav fingerprint, test-sim,
  resume, broadcast, talk harnesses unchanged.
- **S2. Objectives as a map's scenario.** The bunker's stays where it is behind the interface; the mansion's is new
  (`get inside`, `seal the house`, `the four crests`, `the secret`, `the way out`, the blackout). The wire's goals
  become rows the page can draw for any map.
- **S3. The build, for the design.** Outdoor rooms (gate, drive, forecourt, lawns, terrace, garage court) and the
  cottage's garage; five broken windows as ways the dead use; the hearth stair and the hidden study; crest sockets and
  crests; the car; planks, chains, the plant, keys, fuel, journals as spots with a place to stand; per-room floor
  heights (the hall is 0.36 down, the grounds 0.5). Walk map outdoors.
- **S4. The page plays it.** The map on the wire; `site.ts` per map (outlines, own heights, room -> baked zone);
  the mansion's zones and lamps; shots and camera on outlines; doors without bunker lock panels; overlay from the
  wire; sound; outdoors (sky, rain, a fixed lightning light).
- **S5. Finish and proof.** The open finish items; a full local run watched end to end; the harness for the mansion's
  scenario; stills.

### Where the plan stands (Nov 13, evening)

- **S1 done** (6762d3f): `sim/mapdef.ts`; the bunker byte-identical on three seeds (`scripts/survivorz/framehash.mjs`). **S2 then
  changed every bunker show** (the exact route-line test, `nav.segLine`): the hashes have been steady since S2
  (seed 1 `a9667d74…`, seed 2 `aa08426e…`, seed 3 `92aa86f5…`), not since before the mansion work. **They moved
  again on Nov 14** (the soak's fixes, below, are shared rules): and again with the code review's fixes: seed 1
  `af29fa53…`, seed 2 `4a983f7f…`, seed 3 `5bc836d0…` after the second round (run `framehash.mjs` on the build in hand: a merge from
  master moves them too). Over 100 bunker
  shows before and after, the endings are within noise (rescued 31 to 29, wiped 56 to 57); job failures rose from
  2.1 to 3.4 a show, which is worth a look.
- **S3 done, for play** (7b3e6f0 and after): eight yards (gate, drive, forecourt, west and east lawns, terrace, garage
  road and court) and the garage; five broken windows (dining room, library porch, guest suite, kitchen, solarium);
  the hearth stair (the hearth stone in the inglenook sinks: `dyn-hearth-stone`) and the hidden study; crest sockets
  in four of the chimneypiece's seven carved squares (`dyn-crest-0..3`); the car (a 1967 Camaro SS by adrianaflak09,
  CC Attribution — credit it); planks, the switchboard, the fuel can; 62 spots (27 containers found from the
  furniture, 16 placed, 19 the scenario's own). The walk map: 77 rooms, 107 doors, 4 stairs, all walked from the
  front door. It found a fourth fault of furniture: the breakfast room's chairs cut the room in two (tucked in).
- **S2 done** (this commit): `sim/scenario.ts` and `sim/scenarios/glenridge.ts`. New in the sim, for any map:
  a door kind `window` (the dead climb it while it stands open; boarded, nothing passes; the living never use it),
  `FacilityWorld.bolt/board/unseat`, a stair shut by a `grate` door, per-room floor heights (`Room.y`), map-owned
  loot tables, start doors standing open, job kind `task`, `Goals.rows` (the overlay's objectives in the server's
  words), ending `escaped`. **THE EXACT LINE:** `nav.segLine` replaced the cell-line test in route smoothing and
  lanes (a body walking a 45-degree wall clipped cells the old test skipped and stalled); lanes try both sides.
  That is for every map: the bunker's harnesses are green on it and its navigation fingerprint is now
  `2e18015410d930c506400dbc`.
- **The dials** (`GLEN` in the scenario, and the placements in mapdef.ts), as tuned on game code alone over 30
  shows (Nov 13; the numbers today are under "The soak" and "The code review" below). 24 dead at the start (14 in the
  grounds) and the one in the cell (2.5 times the health); one more out of the woods every 2 to 3 minutes while
  fewer than 12 stand in the grounds; one of the dead at a boarded window knocks a plank off every 45 s (three
  planks); the lights go out at 22 to 30 minutes, or the moment the hearth stone sinks.
- **Checks:** `test-nav.mjs` (19), `test-world.mjs` (19), `test-show.mjs` (27), `test-car.mjs` (5), `test-steady.mjs` (53:
  nobody dithers, nothing stalls, and each fix of Nov 14 staged on its own), `test-page.mjs` (9: the page's own
  arithmetic, in Node); all six run under `npm run checks` by `scripts/checks/test_survivorz_glenridge.mjs`, `run-show.mjs [seeds] [minutes]` (a line a show, for tuning), `soak.mjs [shows]`
  (what went WRONG over many shows; `MAP=bunker` for the bunker, `DIST=<dir>` for another build).
- **S4 done (Nov 13, night): the page plays it.** A run can be started on Glenridge Hall (maps.ts: no longer
  `building`), and the show page draws it:
  - **One scene, one map.** `show/site.ts useMap(id)` picks the map; `ShowScene.onMapChange` fires when a snapshot
    names another map than the scene was built for, and Show.svelte throws the scene away and builds one for that
    map (the choice is remembered in `localStorage sz_map`, so the next visit starts on the right one).
  - **The zones** (`show/zones.ts`): all four kept on screen at once (a house is seen through its windows); the
    layout's 189 lamps are fixtures on the house's electricity; the grounds have no bake, so a flat dim blue stands
    in the lightmap's place (`NIGHT`); the hearth stone, the four crests and the car are the zone files' `DYN_` nodes
    (`zones.dyn(name)`), given their own colour as a glow because they stand unbaked in baked rooms; metal is held
    to 0.3 (no environment map: full metal draws black). Rooms are not culled by room in a house.
  - **The lights out**: one bake with the lamps lit, turned down to 6% (`DARK_LEVEL`), the lamps' glass with it,
    the fires left burning. `power.cut` / `power.on` on the wire; a snapshot's power for the map's one supply.
  - **Doors** (`show/doors.ts`): dark oak leaves in the house's own frames, no lock panels; a broken window is a
    door with no leaf, its boards the effects' planks (`window.boarded/banged/broken` are read as
    `door.barricade/banged`); the hearth stone sinks and slides back; a crest shows as it is set; the car drives
    out to the gate on `car.away`. Late joiners get all of it from the snapshot (`Goals.props`, the door states).
  - **The storm** (`show/storm.ts`): rain round the camera while it is out of doors (one draw), lightning that
    lifts the grounds' night light and the fill on the bodies for a few frames (two uniforms, no light added), and
    rain and thunder from the show's own recordings since S5 (`rain-out`, `rain-in`, `thunder`, `thunder-far`);
    the noise stand-in plays only on a page whose sound set has none, and never before the show's sound is on.
  - **The graphics**: the objectives are the server's rows, banners per row (`HOUSE_BANNER`), end cards for
    `escaped` / wiped / the hour running out, a minimap of the ground floor's outlines with DOOR, HEARTH and CAR.
  - **The key** is "the butler's key" in every line a survivor is told or thinks (`MapDef.keyName`).
  - **Watched locally** end to end on the 8621 / 4198 recipe (a real show, since a test run is the admin's own
    socket only): the gate, the house at night with its windows lit, the dining room, the hall, the crests in the
    chimneypiece, the stone sunk, the lights out, the car. 60 fps on the workstation with all four zones in
    (11.7 M triangles, 785 draws, 1.4 GB of zone textures): **heavy for a small machine; thinning the plants and
    halving the lightmaps is the first lever if viewers stutter.**
- **S5, Nov 13: sounds, effects, lighting and doors** (Josh: "a high quality map, with correct sounds, effects,
  lighting, doors work and are animated properly for the survivors to use"). The rubric the work is graded on is
  `GLENRIDGE-RUBRIC.md`; the reviewers' sheets are `GLENRIDGE-REVIEW.md`.
  - **Sounds, recorded** (ElevenLabs, through the show's own pipeline): `docs/survivorz/sound-list.mjs` group
    `glenridge` and `sound-prompts.mjs`. Footsteps on wood, stone, gravel and carpet (`step-<surface>`, played at
    three paces like every other floor); `rain-out` and `rain-in` as the room tone; `thunder` and `thunder-far` a
    stroke; `fire-crackle` at every hearth; `door-wood-open`, `door-wood-close`, `door-bolt`; `stone-grind`;
    `crest-set`; `house-creak`; `car-away`. Made with `node scripts/survivorz/sound-eleven.mjs prod --only
    glenridge` (the key is the main checkout's `.env`), kept with `node scripts/survivorz/glenridge/sound-picks.mjs`
    (it cuts hard-floor steps one at a time by their onsets), then `sound-tally.mjs` and `sound-final.mjs --only
    <ids>`. **THE TAKES WERE PICKED BY MEASUREMENT, NOT BY EAR** (Josh, Nov 13: "just pick
    the sounds for me"). `sound-picks.mjs` judges each take on what can be measured against what the show does
    with it: when its event comes (a door's thud at the frame, a crest's click as it appears), one landing or one
    creak a file, no held pitch under a sound that should have none, a loop that holds its level, far thunder with
    no crack, a car that really drives away, pounding that is several blows. It prints every decision
    (`docs/survivorz/glenridge-sound-picks.txt`): 5 takes dropped, 3 soft "near" thunders refiled as far, crest
    clicks cut to land at 0.12 s. No person has heard any of them; the page to hear them on, and to flag one, is
    https://claude.ai/artifact/K1DRV6nHUwMTmoQ5j6ftKh (private to Josh; made with `node
    scripts/survivorz/sound-preview-artifact.mjs <out> --group glenridge --ids
    step-wood,step-stone,step-gravel,step-carpet --title "Glenridge Hall Sounds"`; a "needs work" tick and note
    save to the page's own store, document `final/review`). The page's rules for a house are
    in `client/src/survivorz/audio/rules.ts` (`setHouse`, `HOUSE_RULES`: a room's floor and how it rings, by its id)
    and `cues.ts` (a `house` field on every cue, so a key door never chirps like a card reader).
  - **Doors** (`client/src/survivorz/show/houseDoors.ts`, hung by `doors.ts hangHouse`): each door's `style` is
    written into the site file by `node scripts/survivorz/glenridge/door-styles.mjs` (run it after walkmap.py):
    46 panelled oak doors, 3 arched plank doors with a fixed pointed head over the transom, 8 glazed French doors
    (pairs where the opening is 1.3 m or more), the vault's steel door, the garage's boarded pair. A leaf stands
    inside the frame the build left; its hinge side and swing are chosen from the floor either side (`swingOf`):
    onto clear floor, into a room rather than a hall or the grounds, back against a wall where there is one.
    **French doors are open frames in the game build** (`geo.py`, GLEN_GAME): the page hangs the glazed leaves, so
    nobody walks through a fixed pane.
  - **Fire**: the build's flames reach a GLB as flat white cards (one mesh, material `fireflame`). The page gathers
    that mesh's points into hearths, hides it and draws three crossed sheets of scrolling noise a fire
    (`zones.ts flameMaterial`); a lamp standing in a hearth is the fire's own light (it burns through the lights
    out, and flickers); each hearth has a `fire-crackle` loop.
  - **Flashlights light the walls**: a baked shell takes no real-time light, so the house's shells add the rig's
    three torch beams by hand (`zones.ts TORCH_FRAG`, uniforms in view space, program key `house-shell`).
  - **Lightning** lifts the grounds, the fill on the bodies, the sky and the rain-haze together.
  - **The cast cards** name a house task for what it is (`overlay.ts HOUSE_JOB`), and a body at a task works with
    its hands (`stance.ts`).
  - **The admin's Control Room and Live Picture** follow the running map (the house's ground floor and grounds as
    outlines).
  - **The study under the hall is dressed** (`design.py`): ledgers along the south wall, portraits, a rug, candles
    and a second lamp on the desk.
- **Still open**: see "What is still open" at the end of this file.

## WALK THE MAP (the admin's own body), Nov 13

Josh: "the ability as admin in solace to spawn into the map and walk around. just put a walk the map button in the
survivors panel. I should be able to do everything the survivors are supposed to do. do that with each available
map we have made. this will be the standard also for all future maps".

**What it is.** A WALK RUN is a test run (private to the admin's own sockets, never streamed, never numbered, not
kept in the run history) on any map a run can start on, with ONE survivor in it, and the admin drives that
survivor by hand. The map's scenario runs as ever (the dead, the windows, the lights, the endings), so every
objective can be done by hand. Its clock is six hours (`WALK.SHOW_MS`).

**The rule that makes it the same game** (`src/survivorz/sim/player.ts`): for the driven body the AI chooses
nothing (no menu pick, no reflex, no line, no thought), and everything else is the simulation's ordinary code.
- What happens TO it (needs, grabs, bites, bleeding, infection, going down, death) is `survivorStep`, untouched.
- It MOVES with the walk every survivor uses (`moveGait` over `world.walk`): the same gaits, pace, noise, turning
  and weight, on the same walk grid. It slides along a wall, creeps the last of the way up to one, and never
  stands on a cell a survivor may not. A shut door it may pass is opened by the same hand on the same leaf
  (`handOnDoor`: the step up to it, 500 ms, `door.open`); one it may not stays shut and the screen is told why
  ("locked: it needs the butler's key").
- A stair is climbed by walking at its foot (within 0.5 m, the push within 60 degrees of the way it runs), on the
  link the walk already knows. The one just taken is not walked onto again until the body has stepped away from
  its end (a stair that doubles back ends facing the way it began); the action for it is on the list all the while.
- What it can DO is the survivor's own job menu (`jobMenu` in survivor.ts: the map's scenario and the common work),
  cut down to what is within 2.5 m as the body would walk it, plus what is in its pockets (eat, drink, bandage,
  med kit, reload), the door in front of it (shut / open) and a stair near by. Picking one starts the SAME job the
  AI would start and `runJob` carries it out. For a driven body the menu rolls nothing and thins nothing out, so
  reading it changes nothing.
- A blow is the simulation's own swing (`startSwing` / `resolveSwing`) at the nearest of the dead in reach, in
  front first; out of reach with rounds for a gun, the shot (`shoot`).
- **Nothing in it knows a map.** The bunker's crank and Glenridge's crests arrive as lines of the menu.

**Starting one.** `POST /api/admin/survivorz/show {op: "walk", map, who?, zombies?, seed?}` (admin, audited).
`who` is any of the cast or the bench (absent: the first of the cast); `zombies` as a test run's. Refused 400
`bad_map` (unknown, or still `building`) / `bad_who` / `bad_zombies`, 409 `already_running` while any other run is
on. A walk gives way to another walk (the admin picking the next map). `status()` carries `walk: true` and
`walker: "s:<who>"` (and `test: true`); `/api/survivorz/onair` carries `walk: true` for the admin. Pause, speed,
jump, reset (still a walk, the same survivor), stop and the test-run levers (heal, give, spawn, clear) all work on
it. A restart of the server resumes it a walk, with the same body where it stood.

**The wire** (types in `src/survivorz/sim/wire.ts`). Up, on `/ws-survivorz`, read only from an admin's own socket
and only while a walk run is on; each is checked (finite numbers, a short id) and counted (a burst of 60, 40 a
second; an action, a blow or a stop costs three) before the world sees it:
- `{type: "walk.in", mx, mz, run?, crouch?}`: the stick, world coordinates (x east, z south), length 0 to 1
  (longer is cut to 1, under 0.1 is "stand"). It stands until the next one, and goes slack if the socket that sent
  it closes. `crouch` creeps (0.8 m/s, silent); `run` sprints (5 m/s while there is breath, then a jog); otherwise
  a push longer than half is a jog (3.2 m/s) and a shorter one a walk (1.4 m/s; 1.15 while calm).
- `{type: "walk.do", id}`: one of the actions the last `walk` frame listed.
- `{type: "walk.hit"}`: a blow (stands 400 ms if it can't be struck at once).
- `{type: "walk.stop"}`: let go of whatever is in hand, and stand.
A NEW push, a blow or a stop lets go of a job that can be let go of (walking to a thing, the crank, a repair, a
task, a search, a lock being picked); a bandage, a tin, a bottle and a door half open are seen through. The push
already held when the action was picked is not a new one. While a job is in hand the stick does not move the body.

Down, to the admin's own sockets, right behind every snapshot and whenever it changes (at most five a second):
`{type: "walk", you: "s:<who>", actions: [{id, label, kind}], busy?: {label, frac}, note?}`. `actions` nearest
first; ids are the menu's own (`loot:<spot>`, `task:<what>`, `crank:crank`, `repair:radio-set`, `call:radio-set`,
`rest:<bed>`, `rest`, `revive:<who>`) or the hands' (`eat`, `drink`, `bandage`, `medkit`, `reload`, `shut:<door>`,
`open:<door>`, `link:<n>`); `kind` is the part before the colon. `busy` is what the hands are on and how far along
(0 while still walking to it). `note` is sent once ("not from here", "in a moment", "nothing in reach",
"interrupted", "locked: …").

**THE STANDARD FOR EVERY MAP.** `node scripts/checks/test_survivorz_walk.mjs` (after `npm run build`; in process on
both maps, then a real server on port 8616) drives the body by those four inputs alone and proves, on every map a
run can start on: it walks where it is pushed and is never off the walk grid nor in a shut door; doors, stairs,
containers, the pockets, a fight and a bite; the same inputs replay the same walk and a save comes back the walk;
and **the map's objectives end to end by hand** (the bunker to "rescued", Glenridge Hall to "escaped": the bolt,
five armfuls of planks and five windows, the four crests, the stone, the switchboard, the journals, the keys, the
fuel, the car). A new map needs an objective walk written in that file's `OBJECTIVES` table: without one the
harness is red. Then the lever and the socket's contract over the real server.

**What the sim gained for it** (all of it a no-op without a driven body: `framehash.mjs` is identical on the
bunker's three seeds): `jobMenu` split out of `pickJob`, `runJob` out of `jobStep`, `handOnDoor` out of `moveGait`,
`startSwing` out of `fightStep`, `startQuick` out of `quickNeeds`; `Scenario.progress` (how far along the task
under a pair of hands is); `SimOptions.player`; `Survivor.player` (saved with the world).

**The page half.** Admin Panel, Survivorz, Show: the start card has "Walk the map" for the picked map, with who
to walk as (Rick by default: a fighter) and the dead as the map has them or none. It opens the show's own page
full-screen in its walk mode (`show/Show.svelte` with `walk`, `show/walk.ts`): the camera follows your body.
WASD or the arrows move the way the camera faces, Shift sprints, Z toggles a walking pace, C crouches, Space or F
strikes or shoots the nearest of the dead, 1 to 9 (or a click, or E for the first) does what the list offers, X
stops what you are doing, drag looks round. "End the walk" stops the run and closes the view; closing the panel
card's view without ending leaves the walk running ("Go back in"). A walk borrows the map setting and the ON AIR
switch and gives both back when it ends; it never touches a stream.

## After any change to the build: the order

1. `build.py` in Blender (GLEN_GAME=1 GLEN_LEAVES=0.3 GLEN_BLEND=glenridge-game.blend), then `walkmap.py` on the
   blend it wrote (the walk map, the sight map, the site file: this REWRITES the site file from scratch).
2. `node scripts/survivorz/glenridge/door-styles.mjs` (each door's leaf), `python
   scripts/survivorz/glenridge/floors.py` (each room's footstep floor; walkmap.py writes it too).
3. `game-materials.py` + `game-export.py -- --bake` for the zones that changed, then `room-pack.mjs <zone>
   --instance` for each.
4. `node scripts/survivorz/glenridge/door-fit.mjs`: measures every door's real opening off the packed zone files
   (jambs, head, floor) and writes `fit` into the site file; the page hangs each leaf in that. It needs step 3's
   files, and step 1 wipes what it wrote: always last.
5. `npm run build`, then `test-nav.mjs`, `test-world.mjs`, `test-show.mjs`, `test-car.mjs`, `test-steady.mjs` here, `test-audio.mjs`
   and **`scripts/checks/test_survivorz_walk.mjs`** (a regenerated map once left a stair unclimbable and only that
   harness knew).
6. Upload the zones that changed (below), commit the data files, deploy.

## Getting a change onto the server

The code goes by the ordinary deploy (`solace-deploy`). **The zone files and the sounds are gitignored and go by
hand**, like the bunker's: copy `assets/downloads/survivorz/rooms/glen-*/` (the packed `.glb`, `.lm.exr`,
`layout.json`) to `/opt/solace/assets/downloads/survivorz/rooms/` and `sound/final/game/<id>/` plus
`sound/final/manifest.json` to the same tree on the R220 (scp to /tmp, then a root copy with the owner set to the
service's user). A zone or sound that is in git's data files but not on the server draws nothing and plays nothing.

## The soak (Nov 14): what was not working, and what was done

Josh: "just focus on making [sure] things are working right". Forty whole shows on game code alone
(`soak.mjs`), read for what went WRONG rather than how they ended, then every fault traced to one body in one
minute and fixed. All of these but the last four are SHARED rules (`sim/survivor.ts`, `sim/zombie.ts`): the bunker
had the same faults, less often. Before and after, on game code:

| | Glenridge, 40 shows | the bunker, 60 shows |
|---|---|---|
| a body changing its mind 20+ times in a minute | 651 survivor-minutes, worst 294 a minute -> 30, worst 33 | 356, worst 366 -> 206, worst 57 |
| ran out the hour with three or more alive | 1 -> 0 | 9 -> 2 (three alive each) |
| ten minutes with no objective's row moving and hands free | 10 -> 1 | (not measured) |
| got away | 21 -> 33 | rescued 20 -> 29 |

(The "after" column is the build after the code review's fixes as well, measured on it: `soak.mjs 40`, `MAP=bunker
soak.mjs 60`.)

What is left of the first row is a real fight (hit, step back, hit: the 800 ms dwell allows it).

1. **Driven off** (`decide`, `SCARE_MAX`). Somebody too hurt to fight saw the dead on the way to their work, ran,
   lost sight a step later, went back, saw them: Rollo at the front door, every 0.75 s for forty minutes, with the
   fuel errand in his name. The third fright running, the job is given up (`failJob "driven off"`), is not theirs
   again for a while, and somebody fitter takes it. 11 of 17 wipes went this way.
2. **The fighters go where somebody was driven off** (`scaredOff`, the menu's "clear the dead out of ..."). A
   window stood open all night because the one with the planks was driven off it twice and nobody else knew.
3. **One of the dead that can't be got at is left alone** (`scan`, `Zombie.walled`). Anything in sight was a threat:
   Dale saw one standing on the terrace through the great hall's glass, went for it, lost sight, went back to the
   chimneypiece, saw it: 75 changes of mind a minute. A threat is one that is coming for somebody and has a way
   to them, or one there is a straight walk to. Inside 1.2 m (`TOUCH_M`, was 2.5) it is known whatever is between:
   somebody a wall away from the dead no longer backs off from them.
4. **A feeding one makes up its mind** (`sense`, `FEED_BREAK_M`). With a body on the floor and a friend standing
   two metres off it went for the friend, saw the body nearer, went back: three times a second, and the friend's
   nerve flipped with it. One place decides now, by what it can see.
5. **Work cut short is gone back to** (`goThenDo`). A fright or a grab took the hands off a window, a crank, a
   search; the job stayed theirs and nothing brought them back to it. Dale stood jogging on the spot with the
   planks under his arm for six minutes, twice. The bunker's crank and searches had the same hole.
6. **A runner keeps running three seconds after the last sight of them; a fighter keeps after one that passes out
   of sight for two and a half** (`FLEE_CALM_MS`, `FIGHT_CALM_MS`, `lostFoe`). The bends in the mansion's galleries
   made sight come and go every step. The badly hurt no longer walk up to one of the dead a way off.
7. **The second fighter waits behind the first** (`fighterInWay`), instead of pushing at their back until the walk's
   last resort put one body through the other.
8. **Escorts make way, and two go with somebody for the company of it, not four** (`escortStep`, `ESCORTS_MAX`; the
   mansion's fuel party and the walk to the car are parties of everybody, on purpose). Four people stood round
   Rollo in a 1.5 m corridor; he could not get out from among them and gave the fuel up "stuck", twice.
9. **No sweep bonus once the place is clear** (bunker: `sealedBonus`; mansion: `secured`). The sweep of empty rooms
   outranked the radio's part for fifty minutes in one bunker show in six.
10. The mansion's own: **nobody goes for the fuel alone** (the rest go with whoever has the errand); **planks count
    only on their way to a window**; **the dead on a porch open to the grounds are not "in the house"** (the west
    and dining porches: "Clear the house" could never be done, and the sweep went on all night in its name); a task
    somebody was just driven off is not offered to them again for 90 s.

`test-steady.mjs` (42 since the code review) stages the faults one at a time and then holds the whole-show
numbers; it goes red on 22 asserts against the code before the fixes (`DIST=<old build>`). Every Survivorz harness is green after them
(test-sim 54, walk 132, talk 179, broadcast 126, weight 24, resume 37, bunker map 91, and the mansion's five).

## The code review (Nov 14): 65 of 112, and what was done about it

Five reviewers graded the code against `CODE-RUBRIC.md` (code only: no model, no GPU). Their sheets are in
`CODE-REVIEW.md`. What they confirmed and what was fixed the same day:

- **Shared rules.** The dead no longer attack from a window's sill or a stair, nor lunge through a wall (A-1, A-2);
  a walk stopped at a shut door waits for the hand instead of walking at it for minutes (A-3); a flee that can't be
  walked is planned again (A-4); a route planned on a stair starts where the stair ends (A-5); twenty seconds
  hidden, a job only one pair of hands can do is let go (A-6); a breather with nothing to get over is not picked
  again the next step (A-7); `reviving` is cleared when the hands come off (A-10, and the cause of E-6: two people
  were never kept apart again and walked to the infirmary one inside the other).
- **The mansion.** `car.away` is sent every time the car leaves, and the hour does not beat a seated car (B-1,
  B-7); nobody sweeps a porch or runs out into the grounds for quiet (B-2); the garage is not the house (B-3); the
  butler's key lost with its holder is back in the pantry (B-4); THE PROOF IS CARRIED: it is in the reader's pack,
  nobody sits in the car before it does, the rest go with whoever has it, and lost with them the journals are
  offered again (B-5); the one in the cell is on a 2.4 m chain (B-6, `GLEN.chainM`); the crest hunt starts after
  fifteen minutes without the bolt (B-8); `close()` shuts only a leaf on hinges (B-9); a house the dead are back
  in is not "clear" (B-11).
- **The server.** A signed-out, revoked or suspended session's show socket is closed (C-1: `Broadcast.kick` on
  `user.kick`); a restart lets go of a walk's stick (C-2); an account holds at most three seats (C-3); a stop with
  nothing running leaves the stream switch alone (C-4); the driven body shuts only what the AI shuts (C-5).
- **The page.** The bolt bar is drawn on `door.bolted` (D-1); the follow camera stays in the room the body just
  left until it has followed it through the doorway (D-2); the outside doors swing in (D-3); "at the gate", "on
  the west lawn" (D-4); the bunker's pipe burst and clatter are a creak of the house here (D-6).
- **The checks.** `test-steady.mjs` grew from 18 to 42: a wall away, driven off and who comes, the escort cap, the
  plank count, the ninety seconds, the fuel party, the proof, the sweep's bonus, the garage, and over whole shows
  the car's leaving, the proof aboard, the chain, no porch sweeps, nobody held from a sill. Its thresholds were
  set where the old build fails them for the dithering and the stalls (E-3, E-4; "no show runs out the hour" and
  "the windows get boarded" pass on the old build on these seeds, as the re-grade found). The personal-space
  count was claimed "back under ten" here and was not: see the re-grade below (E-6). The hashes and the table above are the committed build's (E-8, E-9).

**On game code after all of it, over 80 mansion shows: 68 escape, 11 are wiped, 1 runs out the hour.** The ones
that get away do it at 16 minutes on average with one death in eight shows. The faults that were fixed were most
of what made the hour hard (the dead striking unseen from the sills, the one from the cell loose in the house,
people walking at doors). How hard and how long it should be is Josh's dial: `GLEN` and the placements.

## The code review's second round (Nov 14, the same evening): the open list worked through

Josh: "Start fixing." What was left open above, and what writing the checks for it turned up.

- **Shared rules.** A fighter going at one of the dead that stands still plans once, not twice a second (A-8: a
  route out of a doorway starts at the doorway's own point, so every new plan turned Rick back to it and he walked
  on the spot for 75 seconds; `s.foeCell`). Somebody coming WITH them is company on whatever floor they are
  (A-9: up and down the stair after their own escort). An escort whose leader is on a stair goes to where the
  stair lets off, and two never set off up a stair in the same step (`STAIR_GAP_MS`): two stood on the stair's
  foot, one inside the other. A bed they were just driven off is not gone straight back to. `walled` does not
  outlive the chase it was planned for (E-14).
- **Found while staging the make-way rule: it never fired when it was needed.** A walk that is refused drops its
  route, and the rule read the route. In the east corridor's side passage two escorts stood in front of their
  leader, nobody with a place to step to, until the errand was given up "stuck"; the build before the rule let
  them squeeze by in a quarter of a minute. Now the refused walk leaves where it was going (`s.want`), a refusal
  counts as "not getting there" whatever speed the body shows, and an escort with nowhere beside and no straight
  step ahead walks on along the leader's own route.
- **The one in the cell could still come off its chain** three ways: a lunge at somebody out of reach, a shove
  from somebody inside its reach, and the service stair, whose foot is inside the ring. `stepTo` now takes no
  step further from the ring than the chain is long, and one on a chain takes no stair. Zero steps off it in
  sixteen shows (it was 23).
- **The server.** Signing out closes that session's show sockets: the first round's fix listened for
  `user.kick`, which a plain sign-out never sent (found by the new assert; `session.ended` on the bus). A lever's
  body is read as what it is (C-8: a list, a true or an object where a word or a number goes is a 400; `seed: "5"`
  is seed 5). A second admin socket's flood lets go of its own push, not the first one's (C-9). A joining screen
  does not take the driver's note (C-10). An ordinary test run gives ON AIR back like a walk; a walk whose body
  has died is put away after a minute and a show can be started; the length lever goes to six hours (C-11).
  `DEAD_MAX` 80: the trickle, the woods and the spawn lever stop there (C-12). A world that will not be made
  leaves nothing half begun (C-14). The wire's own words about `why` and about what a socket may send are true
  now (C-7: `why` picks the work's animation on every screen; it is written on the admin's overlay only).
- **The page.** The car goes the way it points: the corners of its way out are rounded and its heading is the
  way it is moving (D-7: it slid up to 20 degrees sideways at the joins; 0.3 now). The rain's roof holds each
  room's own height (D-8: one flat lid at 7.4 m kept rain off for metres over the single-storey rooms and let it
  fall inside the top of the Great Hall). A camera hung in the air of a tall room or over a stair is in the room
  below it, for the lightning and for the rain's sound (`roomUnder`). The arch's head hangs over the opening as
  built (D-9). A closed page leaves no reload timer, no late event and no live socket handler behind; Command on
  a Mac lets go of the walk keys (D-10).
- **The checks.** `scripts/checks/test_survivorz_glenridge.mjs` runs the mansion's six harnesses under
  `npm run checks` (E-12: 127 asserts). New: `test-page.mjs` (9: the rain's roof and the camera's room, the page's
  code bundled and run in Node). `test-steady.mjs` 42 to 46 (the second fighter asked of the rule itself, make-way
  in four narrow places, company on another floor, seed 238's fighter; four of them red on the deployed build),
  `test-car.mjs` 5 to 7 (the slide, the step), the walk harness 132 to 146 and the stream harness 72 to 74 (every
  server fix of both rounds has an assert now: C-1 to C-5 and C-8 to C-12).

**The dials.** With the faults gone the mansion was a stroll: 140 of 160 shows got away, a death one show in three,
and `test-show`'s own band ("neither a stroll nor a slaughter", 20 to 85% away) went red. Two lines of `GLEN` put
it back where it was tuned on Nov 13: the dead come out of the woods every 50 to 80 s up to 18 standing (it was
120 to 180 s and 12), and go for an open window every 80 to 120 s (150 to 210). (Both moved again later the
same day, to 65 to 100 s / 16 and 95 to 140 s: "The house is all of its floors", below.) Swept over 120 shows a setting;
more of the dead at the START was tried and only made five-minute wipes. **Over 160 shows on game code now: 80
escape, 79 are wiped, 1 runs out the hour; 3.2 deaths a show; an escape comes at 16 minutes with 0.3 dead; wipes
come mostly between 12 and 30 minutes.** The escape is still quick: the story's own length (how long the crest
hunt, the journals and the fuel take) is untouched and is Josh's call.

A lesson for the next comparison: 40 shows is not enough to compare two builds. One range of seeds read 30
survivor-minutes of dithering on the old build against 48 on the new; over four ranges the old read 189 and the
new 161.

## The third round (Nov 14, later still): what the soak found once the list was done

Josh: "Keep working." The rest of the list, then soaks of 160 shows read for what went wrong, each fault traced to
one body in one minute.

- **The list.** A friend down in the front doorway is got up by the one at the bolt (B-10: they stood with a hand
  on it for fifty seconds and the door shut when the friend died). The scenario's loose numbers are in `GLEN`
  (B-12: the runner share, the clearance out of the woods, the cell's strength, the two "not again for a while"
  times, when the windows are thought of, the stone's noise). A crest that goes back to its place is not also
  lying with whoever carried it. A watch socket that stops reading is hung up on past 4 MB waiting for it
  (C-13: `MAX_BUFFERED`; a frozen tab piled frames up in the server without limit).
- **WHERE TO LOOK IS THE MAP'S TO SAY** (A-11, the part of it that was a fault): `mapdef.ts lootHints`. Somebody
  in need of a weapon, a bandage or food looked first in containers named like the bunker's (its workbenches, its
  infirmary, its stores). In the mansion nobody hurt went to a bathroom cabinet, and one container of forty-three
  counted as a place to find a weapon. The mansion names its own: the garage, the knife block and the furnace
  tools; the bathrooms; the kitchen and the cellars. The bunker is byte for byte as it was.
- **A HAND'S REACH IS NOT THROUGH A SHUT DOOR** (seed 56). One of the dead beating on the far side of the bolted
  front door, 1.2 m from Johanna with the fuel errand in her name, was "at her elbow". She backed off from it
  without moving for forty minutes, four people standing with her, and the hour ran out with five alive.
  `shutDoorBetween`; and backing off is not a place to stay: thirty seconds of it with work only they can do, and
  the work is let go (`BACKOFF_GIVES_UP_MS`).
- **NOBODY FLICKERS IN AND OUT OF HIDING** (seed 11: 124 changes of mind in a minute). A hide is broken by one of
  the dead within six metres; Sarah, six metres from them at their meal, was flushed out and hid again twice a
  second. Not into hiding with one that near (`HIDE_FLUSH_M` and a margin), and a hide holds the same dwell as the
  other modes.
- **NOBODY WALKS INTO BEING OUTNUMBERED** (seed 25: Dale, a hundred changes a minute on the lawn). The count that
  turns a fighter round is of the dead within six metres, and a fight is begun from further off: he could take
  two standing at eight metres, walked in, was outnumbered at six, ran back, hid, got his breath, could take them
  again. To BEGIN a fight the count is of those within `ENGAGE_M` (10), and going back in from hiding or running
  takes the same margin as from backing off.
- **MAKE WAY, AGAIN.** With other dice the same staging put an escort 0.7 m to one side of a leader in a 1.6 m
  corridor: not "on the line", and as much in the way. To a leader whose walk is refused, in the way is anywhere
  in the lane a body needs; such a one steps out on their own side or goes on ahead (crossing the line would only
  put them on it). The staging runs on four sets of dice now.

`test-steady.mjs` 46 to 53 (the doorway, the door between, seeds 11 and 56 played whole, make-way on four sets of
dice), the broadcast harness 126 to 129 (the frozen screen). The bunker's frame hashes: seed 1 `3c85e3b5…`, seed 2
`65bcda17…`, seed 3 `6bf5b7bb…`.

**Over 160 mansion shows on game code after it: 104 escape, 56 are wiped, none runs out the hour; 2.3 deaths a
show; an escape comes at about 17 minutes.** Knowing where the weapons and the bandages are is worth about ten
shows in a hundred to them, and the dials were left where the second round put them. The worst minute of
dithering is 62 changes (it was 124). The bunker over 120 shows: 50 rescued on this build and 50 on the one
before it.

## The re-grade (Nov 14, night): three sections of five, and what it found

Five reviewers again, code only. The two for the shared rules (A) and the mansion's rules (B) stopped on the
account's usage limit before reporting, so A and B have no new grade. **C (walk and server) 15 to 18 of 24, D (the
show page) 14 to 17 of 24, E (the checks and the record) 8 to 10 of 16.**

What they found and what was done the same night:

- **A fix of mine had made bodies stand inside each other five times as often, and the check's budget hid it**
  (E-6 again: 33 steps against a budget of 36). A sweeper who walked into their own escort was pushed back off
  them every step: never "stopped", never refused, so the escort was never told to make way, and after two and
  a half seconds the sweeper squeezed through at 24 cm. A walk that makes no ground for seven tenths of a second
  is blocked now (`escortStep`). The twelve shows read 2; the budget is 10.
- **Asserts that passed without their fix** (found by undoing each fix in a copy of the build): the bolt and the
  downed friend (the ordinary offer of a revive won first: the staging now holds them at the bolt until it is at
  its last inch), the fighter in the doorway (seed 238 had moved: staged at the place itself now), the chain (with
  no chain at all the count read 0: every show must have one). Each was checked red with its fix undone. The
  mansion's looting words got an assert (hurt, the first place looked is a bathroom cabinet).
- **The server.** The fallen are capped at 200 lying and the spawn lever at 1,500 bodies a run (pressed in turn,
  clear and spawn made 4,886 bodies, an 800 kB snapshot and a save that held the server a third of a second).
  Every watch socket's session is looked at again every thirty seconds (a member who died on the Wheel while
  watching, and a session row taken by the age prune, kept their sockets; the pruned admin one still drove a
  walk). The last four lever bodies that crashed are refused. OFF AIR pressed during a test run stays off. A
  walk paused over its dead body is put away. A reset whose world cannot be made leaves nothing saying a run is
  live.
- **The page.** The follow camera keeps a trail of the rooms the body has left (through two doorways nearer
  together than the camera trails, Great Hall to Long Gallery to Vestibule, it jumped four metres to in front of
  the body and the forward key walked it back: 0.05 m now). The porte-cochere has a roof in the rain's picture.
  The sound and the picture mean the same rooms by "open air" (from a porch the rain was heard and not seen). A
  camera above the roof of an upper room is in no room.

Checks after it: walk 152, broadcast 129, the mansion's suite 143 (test-steady 56, test-page 14, test-show 28).
160 mansion shows: 103 escape, 56 wiped, 1 out of time (not with three alive). 120 bunker shows: 49 rescued. The
bunker's frame hashes did not move.

**Still unpinned by any assert of its own** (each works as far as the soaks show; undoing it alone turns nothing
red): `ENGAGE_M`, the hide margin and its dwell (pinned only all three together), `BACKOFF_GIVES_UP_MS`, the
stair's single file and the escort's route to its far end, the bed's "not again yet", `walled` cleared, the
`stepTo` chain clamp (the no-stair rule is pinned), the trickle's and the woods' `DEAD_MAX`, and from the first
round: the bunker's sweep bonus, the door wait, the stuck flee, `reviving`, the butler's key, the hour against a
seated car, the crest hunt at fifteen minutes. A staging for `ENGAGE_M` was written and taken out again: it
passed with the rule undone.

**Left for eyes** (the page's reviewer could not judge without a screen): the arch heads are 10 cm wider than
their measured openings; the follow camera, once pulled in close by a small room, is not let back out; the car is
doing 14 m/s through the gate and vanishes 22 m past it; the bolt's bar appears while the leaf is still swinging.

## The house is all of its floors (Nov 14, late): one fault under every number above, and section B's re-grade

Section B's reviewer was run again and gave **16 of 24** (14 at the first review). Its first finding was one I had
met an hour before, staging a check of something else:

- **The whole upper floor and the cellars were "the grounds".** "In the house" was what joins the great hall by a
  door (the first round's fix for the garage, B-3), and the floors are joined by four stairs. Thirty-two rooms
  read as out of doors. Somebody in a bedroom, or in the coal store for the planks, was offered "get inside the
  house, out of the rain" at the top of the menu (665 times in 40 shows, by the reviewer's count); "Clear the
  house" was ticked with the dead standing upstairs (25 shows of 35); nobody swept upstairs or below, and the
  fighters were never sent there; nobody ran upstairs for quiet; the dead indoors up there counted against the
  woods' number; and one of them standing in a bedroom knocked the planks off the window below. The flood
  follows stairs now (`grounds()`). The one on its chain in the cell is left out of "Clear the house": that one
  is the fourth crest's business.
- **Two faults the fix uncovered.** (1) Somebody badly hurt, sent at one of the dead, now ran up the main stair for
  quiet: fourteen seconds up and fourteen down, so each fright read as the first and they went on for good. The
  three-frights window is time back at the job, not time since the fright began (`act`, survivor.ts). (2) In the
  west upper corridor, a metre wide, a leader stood behind her own escort until the errand was given up: a
  refused walk drops its route, so the stall clock began again every second and the squeeze never came
  (`progress()`, world.ts). Both are shared rules; the bunker reads 51 rescued in 120 (49 before).
- **The difficulty.** Every number in this file was measured with the fault in, and the second round's dials
  were set against it. With the house counted right those dials let 64 of 160 away (the woods no longer held
  back by the dead upstairs). Four settings were run, 160 shows each: the second round's, 64; Josh's own
  (120 to 180 s / 12, windows 150 to 210 s), 135; and two between. **The woods now send one every 65 to 100 s up
  to 16 standing, and the dead go for a window every 95 to 140 s: 101 of 160 get away with 2.4 deaths a show**,
  which is what the build before the fix did (103, 2.3). It is Josh's dial; the old values are in the comment
  on `GLEN.climbMin`.
- **The rest of section B's sheet.** One butler's key, not two (it was put back in the pantry and left on the body
  as well). The revive at the bolt goes to somebody with a bandage (given to the one at the bolt with none, it
  was dropped and given again eighteen times in seventeen seconds). The planks are knocked off by one of the
  dead on the window's own floor. Whoever has the fuel can and was just driven off the car is not followed about
  as "the one bringing the fuel": somebody else fetches another can (two of the three stalls in the harness's
  sixteen shows were that; in 160 shows the stalls went 8 to 6). Three comments that disagreed with the code.
- **A mistake of mine the suite caught.** The planks' floor test was first written as a height, against the
  window's middle: the lawns lie half a metre under the house and a window's middle is 1.65 m over it, so
  nothing could knock a plank off at all, and 14 shows of 14 got away. `test-show` went red on it. There was no
  staged check of the boards giving way; there is now, and it fails both ways.
- **The server's four small ones** (section C's nits): the daily summary is a real show's (a walk left going at
  nine sent one); the stream's "expected" switch takes true or false and nothing else; the spawn lever wants a
  body that says how many; the show socket's door is budgeted by address (120 knocks a minute).

Checks added, each red with its fix undone: the house's floors and "get inside"; the bed's "not again yet"
(the bunker, in `test_survivorz_weight`); the crest back and off the body; one key; the hour against a seated
car; the car's wait; the crest hunt at fifteen minutes; `close()`'s guard; the revive with no bandage; the boards
(both ways); the fuel hand-off. `test-show`'s band on fourteen shows is now "3 to 13 get away": fourteen shows
cannot tell two in three from five in six, and the band went red on 12 of 14 when the dice moved. Tried and
taken out again, because they passed with the rule undone: the stair's single file, `BACKOFF_GIVES_UP_MS`,
the woods' `DEAD_MAX` in the mansion (the bunker's trickle staged cleanly, 80 standing to 82 with the cap out,
and is in `test_survivorz_walk` now).

Checks after it: the mansion's suite 155 (test-steady 68, test-show 28), walk 156, stream 75, weight 25,
broadcast 129, resume 37, talk 179, test-sim 54.

160 mansion shows on this build: **101 escape, 57 wiped, 2 out of time** (one with four alive: seed 36, the four
out by the garage with a can each and eighteen of the dead round the car, to the end of the hour). Ten minutes
with nothing done and three or more up: 6 shows. A body changing its mind twenty times in a minute: 273
survivor-minutes (416 on the second round's dials).

**Section B's findings left for Josh:** the one in the cell is dead by minute three, killed by whoever fetches the
planks: its chain reaches through the cell's gate into the basement stair, on the way to the coal store (15
shows of 16), so the cell's crest is found with nothing guarding it (DONE the same night: "The one in the cell
stays in it"). The car's keys are a fact, not a thing carried: they cannot be lost (left so). "house.clear" is
sent again each time the house is cleared again.

## Section A's re-grade (Nov 14, into the night): 13 of 24, and what was done

The shared rules' reviewer was run again on `cb879cb` and gave **13 of 24** (14 at the first review): most of the
first round's findings fixed, and a livelock found that the first review had missed. With it every section has
been graded twice: **74 of 112** (65), each grade of the code before that section's own fixes.

What it found, most serious first, and what was done:

- **A job picked, let go the same step and picked again, every step** (in the code since before the first review).
  The guard's step kept a guard only for the bunker's three kinds of work, and the mansion offers one for a
  `task`; the escort's step let go of anybody whose leader was resting or between jobs, and the menus offered
  them. Up to 600 choices a minute, 2.3% of all the mansion's survivor time, in 70 shows of 80, the body left in
  whatever pose it last moved in. The guard's step knows a map's work; the menus ask what the escort's step asks
  (`canEscort`, and a way to walk there); a leader between two jobs is waited on five seconds; and a job gone the
  step it was picked is not picked again for a second and a half. The reviewer's count on this build: 0.0% of
  survivor time, 0 shows of 40.
- **A fix of mine left fighters standing** (A-8: plan again only when the other has moved). A fighter nudged off
  his line kept a route whose next step was refused: four stood half a minute, weapons up, three metres from one
  of the dead. A refused walk plans again, once a second.
- **Held on a stair, then put metres on in one step** (38 times in 80 shows): the dead do not take hold of
  somebody on a stair. **Blows through walls and shut doors** (46 in 160 shows): a blow wants floor to cross,
  as the lunge already did.
- **A reviver standing a metre short until the friend bled out** (32 times in 160 shows, 11 dead). A revive is
  one pair of hands'; kept off the place for two seconds, they kneel where they are if that is in reach and let
  it go if not; a revive let go is not theirs again for eight seconds. The reviewer's count on this build: 2 in
  80 shows, nobody dead of it.
- **The dead coming in over a sill were nobody's threat until they stood on the floor** (44 of 3,060 blows): one
  on a sill or a stair is seen at the place it will land.
- **In and out across the ten-metre line with no blow struck**: how near one of the dead is was three steps
  (1.5, 1, 0.6) and is a slope now. Dithering fell (273 survivor-minutes in 160 mansion shows to 233; the
  bunker 466 to 396) and is not gone: the shuttle is slower, not cured.
- **A fighter frozen at one he can see and no route goes to** (the bunker's tunnel): left alone for twenty
  seconds unless it comes. **The hands come off** when somebody goes down. **The dead's routes** are trimmed by
  the test the living's are. **The mansion's vault is not "the armory"** (the word was said for any keycard
  door).
- **With the house counted right, six people swept sixty-six rooms for ten minutes** before anybody looked at
  the chimneypiece: the sweep comes first for five minutes after the last board goes up (`GLEN.sweepFirstMs`),
  then it is ordinary work.

**Tried and taken out.** Somebody on a stair looking from where it sets them down (for the dead standing at a
stair's foot): 97 escapes in 160 fell to 65. They turned to fight or run half-way down a stair they could not
leave. What stands at a stair's foot is still met unseen.

**Checks.** Nine new asserts in `test-steady`, each red on the build before: the guard kept; no going with
somebody who rests; the hands off on going down; one pair of hands; no hold through a wall; the one on a sill
seen; the sweep's five minutes; and over whole shows nobody held on a stair, nobody running on the spot with no
job, no "armory". **Not pinned:** the refused fighter's new plan, the one no route goes to, the slope, the
dead's trimmed routes, the reviver's giving up, the escort's wait. The bunker's personal-space count read 16 on
its twelve shows and 2 on the build before, while 60 shows read 38 and 40: twelve shows was a coin. It reads 48
shows now with a budget of 70 (a sound build about 30; the two faults it has caught, 130 and 142).

Every harness after it: the mansion's suite 167 (test-steady 80), walk 156, weight 25, broadcast 129, resume 37,
stream 75, talk 179, test-sim 54.

**160 mansion shows: 106 escape, 53 wiped, 1 out of time (not with three alive). 120 bunker shows: 55 rescued**
(51), one out of time with three alive. Ten minutes with nothing done and three or more up: 7 mansion shows, the
fuel errand in all but one.

**Section A's findings left:** jobs only one person can do are kept through fright after fright less often now
(the window counts time back at the job) and were not re-measured; bodies inside each other on the mansion were
7.6 steps a show and are not pinned there; the dead change whom they are after up to ninety times a minute (the
nearest seen, no hold); and the bunker's objectives are still written into the shared rules (A-11).

## The one in the cell stays in it (Nov 14, night)

Josh, asked what to do with the open list: "whatever you recommend just do it". What was recommended and done:

- **The chain.** The cell has a metre and a half of floor and its gate stands open a pace from the foot of the
  basement stair. On a 2.4 m chain the one in it stood at the stair's foot: whoever came down for planks walked
  into it, five at a time, and it was dead by minute three of every show with the cell's crest unguarded (20 shows
  of 20). Its ring is now in the back wall (the place in the cell furthest from any floor outside it) and the
  chain is 0.3 m (`GLEN.chainM`): the chain and an arm reach nothing outside the bars. Four more things had to
  change with it, each found by running it:
  - somebody it cannot reach leaves it alone, unless what they came for is inside its reach (`scan`): seen
    straining at its chain it was a threat like any other, and passers-by went in and put it down;
  - nobody is sent to sweep its room;
  - the search of the cell is gone through with at a door that "sounds bad" (`Job.brave`): the cell always does,
    the cautious turned back at its gate every time and the last crest was never fetched (51 escapes in 160, 19
    shows out of time);
  - the chained one's own blow asks what any blow asks (not at somebody on a stair, not through a wall): the
    basement stair's first step is inside its reach, and somebody on it was held.
  It now lives until somebody comes for its crest (dead between minute 10 and minute 51; still up five minutes in
  in every show), and the crest is fought for: `loot:driven off [crest-cell]` 136 times in 160 shows.
- **The trickle from the woods is one every 80 to 120 s** (65 to 100). With the crest guarded as the map means it
  to be, 79 shows of 160 got away; the cell's own strength made little difference (85 at 1.5 times a common one's
  health, 92 at once; `GLEN.cellHp` stays 2.5). At 80 to 120 s: **104 of 160 escape, 55 wiped, 1 out of time (not
  with three alive)**, at about twenty-two minutes. The bunker is frame for frame what it was.
- **The car's keys stay a fact.** A thing carried that can be lost with its carrier needs a way back (the proof has
  one, the butler's key has one); the keys have nothing riding on them and no fault was measured.
- **What stands at a stair's foot.** With the chained one off the basement stair's foot, 40 shows have no blow
  from one of the dead on another floor at the victim's last look (58 unseen blows in 3,233, none of that kind).
  Closed by measurement, not by a rule.
- **Tried and taken out:** a shorter wait before the one driven off the car goes back to it (25 s and 45 s for
  90 s): 81 and 82 escapes for 79, no difference.
- **Checks.** Eight new asserts in `test-steady` (88): the reach inside the bars, left alone and leaving it alone
  at the nearest place outside, theirs to deal with when they come for the crest, no sweep of its room, the
  errand not turned back from, alive five minutes into every show; and two of section A's unpinned fixes: how
  near the dead are is a slope (0.60 and 0.36 across the ten-metre line on the build before) and somebody between
  two jobs is waited on. Each red on the build before.
- **Left:** ten minutes with nothing done and three or more up is 9 shows in 160, the fuel errand in 7 (three
  cans fetched, the carrier driven off the car four times with the forecourt nearly empty: the shows still get
  away, at 26 and 27 minutes). In and out of a fight at a distance is 278 survivor-minutes in 160 shows (233).
  Four of section A's fixes are still unpinned (the refused fighter's new plan, the one no route goes to, the
  dead's trimmed routes, the reviver's giving up: two pinned on Nov 16). The bunker's objectives stay in the shared rules until a
  third map is started.

## The objective: survive (Nov 17)

Josh, Nov 17 2026: *"restructuring our objectives completely … survive the time frame assigned for the show in the
stream."* The mansion has ONE objective now: be alive when the show's clock runs out. The length is the admin's
dial (Start card / the show lever `length`, 5 minutes to 6 hours; `w.showMs`). Anybody alive at the end: the show
ends **`survived`**, naming them (the end card reads SURVIVED THE NIGHT); nobody alive: `wiped`.

- **Gone:** the four crests, the hearth stone's stair and the study's journals, the proof, the car's keys, the fuel
  and the car (sim/scenarios/glenridge.ts; their tasks, searches, state, rows, facts and voice moments). The hidden
  study and the car are still built and still on the page; nobody is sent to them. `test-car.mjs` is gone.
- **Kept, as the house's defences:** get inside and bolt the front door, board the five windows (planks from the coal
  store, and the dead knock them loose again), clear the house, and the switchboard when the storm takes the lights.
  The overlay's rows are the clock first ("Survive until the clock runs out", with how many are alive) and those.
- **What the survivors are told:** nobody is coming; stay alive until the night is over, and about how many minutes
  that is (the talk layer's FACTS); the map's world text ends "all there is to do is live through the night".
- **The lights** go out between minutes 22 and 30 as before (they no longer wait on the hearth stone).
- **Checks:** test-steady 83 (the clock's two endings, the rows, no old objective on any menu; the escort rule
  tested on `canEscort` itself), test-show 25 (every show ends survived or wiped, a survived show ends on the clock
  and names everybody alive, the 3-to-13-of-14 band), the walk harness's objective walk (bolt, five windows, the
  switchboard, the clock: survived by name), test-audio. Mansion suite 160, walk 154.
- **How hard:** 160 one-hour shows: 104 survived, 56 wiped (65%); 20+ changes of mind a minute 153 survivor-minutes; wipes spread across the hour. No dial was moved. The bunker is frame for frame what it was.

## In and out of a fight (Nov 16)

The shuttle the soak kept finding: somebody going for one of the dead, backing off, going back in, a change of mind
every second or so. Instrumented over twelve mansion shows, 434 fight / back-off changes, 288 of them under five
seconds apart; in 225 of those 288 it was the threat that had moved, not what they could take. Walking up to one of
the dead puts its threat up (how near it is), they cross the line and back off, it falls, they cross back.

- **Tried and taken out:** judging the dead within ten metres by what they would be at arm's length, so that walking
  in changes nothing. The bunker got worse (rescues 55 to 31 in 120 shows, 396 to 551 survivor-minutes of 20+
  changes of mind): what moved instead was how many were in sight and how many friends were near.
- **Kept:** a change between fighting, backing off, running and hiding stands **two seconds** (`MODE_DWELL_MS`, was
  0.8 s) unless it is urgent (a friend grabbed, the blood low enough to run). In 160 mansion shows the
  survivor-minutes of 20+ changes of mind fell **278 to 122** and escapes went **104 to 115** (43 wiped, 2 out of
  time, none with three alive); in 120 bunker shows **396 to 214**, rescues 55 to 52. A wider margin between the
  two lines (1.2 / 0.75 for 1.0 / 0.85) did about as well alone and worse together, and is not used.
- **Nobody kneels among the dead.** With the dead feeding on a friend, revivers walked up between them and were
  kept off the place by their bodies (three in half a minute, the bunker's vestibule, seed 7): a revive is not
  offered, and one under way is put down without counting as failed, while one of the dead on its feet is within
  arm's reach of the body (`onTheBody`).
- **Checks.** Three more asserts in `test-steady` (91): the reviver kept off the place kneels where they are or lets
  it go, and the fighter whose step is refused plans again, both red on the build before. The escort's wait and
  the slope were pinned on Nov 14. Unpinned of section A's: the one no route goes to, and the dead's trimmed routes.
- **The difficulty dials were not moved again.** Two shows in three was the aim; this is nearer three in four
  (115 of 160). Josh's dial.

## What is still open (Nov 14, after three rounds, the re-grade and the house rule)

- **From the code review, not done:** the bunker's objectives are written into the shared rules and the driven
  body (A-11, C-6: the crank, the radio, its room ids). It is a restructuring, not a fault: they would move into
  a scenario of their own, as the mansion's are. Best done when a third map is started, with the frame hashes
  held. A jump while paused moves the clock and stays paused (C-11, as designed). Door materials kept at module
  level (D-10, suspect).
- **Seen in the soak and left:** about one mansion show in eighteen has ten minutes with no objective moving
  and three or more up, the fuel errand in most. None in 160 runs out the hour with three or more alive.

The house and the show are built; the Nov 12 list that stood here (outside to the photos, the storm, the rooms,
the game side, the objectives) is done. What is left:

- **Josh's ear and eye.** The sounds were picked by measurement and are unheard (the page is linked under S5). The lit rooms, the
  blackout, the fires, the flashlights and the door swings were checked by script and by a few local looks, not
  by a watched hour.
- **Unbaked things in baked rooms.** Furniture, rugs, doors and bodies take one fill light, about four times the
  median baked wall: a rug reads brighter than its floor away from a lamp. The cure is baking the furniture, or a
  lower fill; it wants Josh's eye first.
- **Doors.** Every leaf is hung in the opening as built (`door-fit.mjs`, below); a bolted outside door shows its
  bar. Not yet looked at by eye after the last rebuild: the three arched doors (their arches are flatter now, so
  the transom clears a head) and the nursery's threshold.
- **The dead** come over a window's sill on their bellies, but along a straight line through it.
- **The sim.** Survivors know the whole house at the gate (the bunker's "lived here for weeks" rule,
  `knowledge.ts startKnowledge`), against the map's own "you don't know whose house it is": Josh's call. A bolted
  front door opens from outside for the living (read it as somebody inside drawing the bolt for them: making it
  one-sided needs a way to be let in, or people are locked out for good). The endings are under "The code review"
  under "The objective: survive": shows end survived or wiped on the show's clock.
  How hard and how long is Josh's dial.
- **The walk** offers what a pair of hands does at a place (`player.ts HAND_KINDS`): a new map's objectives are
  offered by themselves as long as they are scenario `task`s, which is how a map must build them. Its end-to-end
  harness walks with no dead.
- **Weight.** Measured in a local walk after the fixes: 5.49 M triangles and 268 draws from the Great Hall, 60
  frames a second on the workstation (it was 11.7 M: transmissive glass drew the scene twice, and is plain glass now). Download:
  441 MB of zone GLBs and 114 MB of lightmaps; on the GPU the three 4096 lightmaps are about 536 MB with mips, and
  nearly half their texels are unused. First lever: 2048 lightmaps for the upper floor and the basement, then
  thinner plants.
- **Bunker step files.** `step-vinyl` and `step-concrete` (older, approved takes) hold several steps in some
  files; the mansion's kitchen wing and cellars use them. Re-cutting them changes the bunker's sound too.
- No gravel and grass split out of doors (lawns use the soft carpet step).

