# Casino FPS — asset notes

Source of truth for the FPS casino floor project. Design doc pending; the
locked decisions so far live in the session history (2026-08-06):

- 2D Emoji Rumble stays the default; the floor is opt-in via an
  "Enter the Casino" band at the BOTTOM of the Rumble main page.
- Player model = the backrooms hazmat body. Yellow suit free for everyone;
  players who own other suit variations may pick those (read-only — the
  casino never consumes or risks inventory). Future fun variants =
  Emporium cosmetics (a new kind), NOT backrooms gear.
- 2D-seated players render on the floor as generic seated hazmat bodies
  with nametags (never empty chairs).
- ZERO new money paths: every station opens the EXISTING game engines/UIs;
  the floor is a presence layer only.
- The stage Wheel of Fortune is a real 3D wheel; a death slot hit ragdolls
  the victim off the stage (extreme throw — Josh's explicit ask) before the
  Terminated cinematic.

## `maps design.png` — Josh's floor plan
One hall (~50×24 m): entrance south-centre · Wheel stage dead centre ·
slots 2×5 west wall · blackjack Copper/Silver/Gold/High-Roller up the east
wall · Hold'em NE corner · Bone Pit + Chess NW · bar along the north wall
with the Emoji Racing jumbotron + race ticket machine. Dot = seat.

## `props/` — PSX Casino Props Pack (purchased by Josh, zip kept as original)
`casino-props.fbx` (523 KB, binary FBX 7.5) + two atlases (1720×1080 PNG —
shrink to WebP before shipping). **120 separate meshes, 10,589 tris TOTAL**
— PSX low-poly, matches the backrooms retro look. Units are **cm**
(chair 83 cm, cards 11.4 cm): scale ×0.01. Materials: Atlas 1 / Atlas 2 /
Transparent (glass).

Highlights (name → world size in cm):
- `Black_Jack_Table` 128×116×281 · `Poker_Table` 280 round ·
  `Roulette_table` 293×118×629 (full table, wheel included)
- `Fortune_Roulette` 120×443×181 standing wheel-of-fortune, and its disc
  is the SEPARATE `Roulette` mesh (345 cm) → spin-animatable. Stage piece.
- `Casino_Machine` slot cabinet 108×270×130 with SEPARATE `Lever`,
  `Button_1/2`, `TV_Score` (jumbotron candidate 85×152×100)
- `Chair_1/3/4` + `Clair_2` (sic) · `Stanchion_1/2/3` rope barriers ·
  `Carpet_1..4` (3.7–4 m tiles) · `Casino_Signal`/`Exit_Signal`/`Vip_Signal`
- Dressing: full 53-card deck as meshes, 6 token colors + `Tokens_Plate`,
  `Dice_1/2` + `Dice_Shaker`, whisky/champagne/glasses, money/briefcases,
  safe + vault door + dial, cigarettes/lighters/ashtray, `Lamp`.

**NOT in the packs (build procedurally or source later):** the stage
itself, a ceiling texture, a red-velvet stage curtain, a chandelier/sconce
model, all architecture (walls/floor/ceiling — ours, like the backrooms),
and **Sterling's 3D body** (he has only ever been an SVG portrait —
decision: build him bespoke low-poly from his canonical design: copper,
top hat, cyan goggle lenses, glowing grill mouth, gear belly; he tends
the bar).

## `bar/` — Bar Env Assets (purchased 2026-08-06, rar kept as original)
**Blender SOURCE ONLY** (.blend per prop + PSX dithered PNG textures, no
game formats). Export pipeline PROVEN: Blender 5.2 lives at
`D:\blender\blender.exe`; headless `blender -b file.blend --python
<script>` with `bpy.ops.export_scene.gltf(export_format="GLB",
export_apply=True)` converts cleanly (modular bar → 87KB GLB). Units are
METERS (bar sections exactly 2.00m wide). Contents: **SM_Modular_Bar**
(straight/corner/shelf counter sections — the north-wall bar) + bar sink +
**SM_Bar_Stool** (the stool to use) + chairs + round/square tables +
back-bar furniture high/low (shelving, fridge) + suspended furniture +
bottles (beer/red/white wine/Ballantines) + 3 glass kinds + barrel + cash
register + posters + coasters + **SM_Chessboard** (closes the chess-table
gap) + SM_Walls (3 wall textures) + stairs + slate/paper/pillow/rag
dressing. Warm wood style matches the props pack AND the Cozy palette.
Ignore `Starter_Scene.blend` (composed demo room) except as reference.

## Loose GLBs
- `ticket machine.glb` (Sketchfab): 822 tris, "SOUL KIOSK" dystopian
  vending machine — CRT screen, coin slot, dispense tray. USE for the
  Derby race-ticket machine; the sign band can be retextured
  ("RACE TICKETS") in its 1024² atlas (663KB PNG → shrink). Local bbox
  1.82×3.30×1.14 (check real scale at placement).
- `props/bar_stool.glb`: **DO NOT SHIP** — 64,754 tris (6× the entire
  120-prop casino pack) + 2.7MB textures, sculpt-grade, off-style. The
  bar pack's SM_Bar_Stool replaces it. Kept only as Josh's source file.

Inspection tooling: three's FBXLoader runs in Node with a 2-line DOM stub
(see the shipped converter scripts in `scripts/` for the GLB pipeline).
