// THE NEW-ASSET INTAKE — the step between "Josh downloaded a model" and the
// prop kit (Josh, Sep 2026):
//
//   "C:\Users\you\code\solace\assets\New Assets is where i will put all new
//    assets i find and download online … check the assets and get a good
//    understanding and fix any model issues, if the asset needs to be animated
//    like a door model, then add them to it. check and validate it works
//    before moving the asset to its final destination."
//
//   node scripts/props/intake.mjs            fix everything with a recipe
//   node scripts/props/intake.mjs --file=5_doors.glb
//   node scripts/props/intake.mjs --rerun    re-fix what was already filed
//                                            (reads assets/downloads/, moves nothing)
//
// For each file in assets/New Assets that has a RECIPE below, this writes the
// FIXED models to assets/kit/<shelf>/ (one GLB per prop) and moves the
// untouched download to assets/downloads/ (kept so a recipe can be re-run).
// From assets/kit the ordinary pipeline takes over: sources.mjs → extract.mjs
// → curate.mjs → build.mjs.
//
// Inspect a file first: node scripts/props/inspect.mjs "assets/New Assets/x.glb"
//
// What a recipe can do:
//   pick     node-name patterns: which pieces of the file make this prop
//   door     turn it into a door that opens: the leaf is put on a HINGE node
//            at its hinge edge and given an "open" clip (0 → ~95° in 0.9s).
//              { leaf, frame }  the leaf and frame are separate pieces
//              { fused: true }  one mesh holding both — split by loose parts:
//                               anything reaching the outer edge is frame
//   glow     material-name patterns that should light up (tubes, bulbs)
//   glass    material-name patterns that are windows: made see-through
//   out      where the fixed model goes, under assets/kit/
//   scale    a number the whole thing is multiplied by, baked into the
//            vertices (0.01 for a pack modelled in centimetres) — measure it
//            against something whose real size you know
//   yaw      degrees to turn it about the vertical so its FRONT faces +Z
//            (the kit's "south": r = 0 in a map)
//   pitch    degrees to tip it about x (before the yaw) — a model that was
//            left leaning (an easel photo frame, to hang flat on a wall)
//   clip     { above: y } — triangles wholly above y (in the baked units,
//            after scale/yaw/pitch) are cut away: a pendant's chain that
//            is longer than any ceiling is tall
//   simplify a ratio: every piece thinned to that share of its triangles ON
//            ITS OWN, before any merge — a mesh of many tiny pieces (a
//            chandelier's crystal strands) thinned as one loses the small
//            pieces outright; { ratio, error } to let it go further (error
//            relative to each piece, default 0.05); pair it with `tris`
//            in curate.mjs
//   merge    true = pieces sharing a material become ONE draw call (a
//            chandelier modelled as 89 separate crystals and arms)
//   parts    the file is ONE mesh holding several objects side by side: it
//            is cut into loose parts, parts whose boxes touch stay together,
//            and each group becomes its own piece (extract splits "nodes");
//            "largest" keeps only the biggest group (a scan's stray crumbs)
//   color    [[material pattern, [r,g,b] linear, roughness?]] — for a
//            material that lost its texture (a flat colour beats white)
//   opaque   material patterns shipped as BLEND with nothing to see through
//            (a whole atlas marked transparent sorts badly and draws
//            through itself)
//   mask     material patterns shipped as BLEND whose alpha is a CUTOUT (a
//            fan guard, an atlas with empty space): alpha-tested instead,
//            so nothing needs sorting
//   drop     node-name patterns to leave out of what `pick` matched
//   only     indices into what `pick` matched, when two nodes share a name
//            (a photo-scan's object and its stray ground patch)
//
// A recipe list of [] files the download away with nothing built — for a
// file that holds no usable prop (say so in a comment beside it).
//
// The game plays a prop's "open" clip when someone walks up to it
// (client world.ts, kit props) — no catalogue flag needed; the clip is in the
// file. VALIDATE a door on the bench before building:
//   node scripts/serve-root.mjs 8791
//   http://127.0.0.1:8791/scripts/animview.html?model=/assets/kit/doors/<file>.glb&clip=open

import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, join, weld, simplify, transformPrimitive, compactPrimitive } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { existsSync, mkdirSync, renameSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const INBOX = path.join(ROOT, "assets", "New Assets");
const KIT = path.join(ROOT, "assets", "kit");
const DOWNLOADS = path.join(ROOT, "assets", "downloads");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

export const RECIPES = {
  // ---- THE FETCHER's downloads (scripts/assets/fetch.mjs, Oct 2026): each
  // lives in its own folder, `<source>/<id>/`, beside a credit.json, so the
  // key is that folder. The model inside is found by itself (a Poly Haven
  // .gltf with its .bin and textures, or a Sketchfab model.glb), and the whole
  // folder — credit and all — moves to assets/downloads/ when it's filed.
  // LEVEL 3, THE ELECTRICAL STATION:
  // Poly Haven (CC0) — metres already, every one.
  "polyhaven/power_box_01": [{ out: "electrical/power-box.glb", pick: [/^power_box_01_(box|door)$/] }],
  "polyhaven/utility_box_01": [{ out: "electrical/utility-box.glb", pick: [/^utility_box_01_box$/] }],
  "polyhaven/utility_box_02": [{ out: "electrical/utility-box-wide.glb", pick: [/^utility_box_02$/] }],
  // 49 cable runs, bends, mounts and junction boxes laid out side by side —
  // split into separate props by sources.mjs ("nodes")
  "polyhaven/modular_electric_cables": [{ out: "electrical/electric-cables.glb", pick: [/./] }],
  "polyhaven/caged_hanging_light": [{ out: "lighting/caged-hanging-light.glb", pick: [/^caged_hanging_light$/] }],
  // seven batten variants side by side — split by sources.mjs
  "polyhaven/mounted_fluorescent_lights": [{ out: "lighting/mounted-fluorescents.glb", pick: [/^mounted_fluorescent_lights_[a-g]$/] }],
  // its three cages, mount, elbow and bulb are loose pieces with no assembly
  // to copy; the kit has caged lamps enough — filed away, nothing built
  "polyhaven/industrial_caged_sconce": [],
  // the plain shutter and the graffitied one, side by side in the file
  "polyhaven/rollershutter_door": [
    { out: "doors/roller-shutter.glb", pick: [/^rollershutter_door$/] },
    { out: "doors/roller-shutter-graffiti.glb", pick: [/^rollershutter_door_graffiti$/] },
  ],
  "polyhaven/WetFloorSign_01": [{ out: "signs/wet-floor-sign.glb", pick: [/^WetFloorSign_01$/] }],
  "polyhaven/worn_metal_rack": [{ out: "storage/worn-metal-rack.glb", pick: [/^worn_metal_rack$/] }],
  "polyhaven/fire_alarm": [{ out: "electrical/fire-alarm.glb", pick: [/^fire_alarm/] }],
  // Sketchfab (CC-BY 4.0 — the credit.json beside each carries the author)
  "sketchfab/9ad62dc3bd694bf880be78e43530008e": [{ out: "electrical/switchgear.glb", pick: [/^Sketchfab_model$/] }],
  "sketchfab/de13c96dad014bf098df03030f314fee": [{ out: "electrical/electrical-box.glb", pick: [/^Sketchfab_model$/] }],
  // a 5m outdoor transformer: its height is set in curate.mjs
  "sketchfab/615fe4b367314a72b7dffb8ec791f575": [{ out: "electrical/station-transformer.glb", pick: [/^Sketchfab_model$/] }],
  "sketchfab/423cfdbd612c486aada7bb1bc44695a9": [{ out: "electrical/diesel-generator.glb", pick: [/^Sketchfab_model$/] }],
  "sketchfab/8ba2c3ac7f5f41d588908750fdb24130": [{ out: "electrical/cable-tray.glb", pick: [/^Sketchfab_model$/] }],
  // NOT KIT PROPS: the breaker lever (the six breakers — the game draws and
  // animates it from the server's state) and the Bleeder (a creature) are
  // game assets, prepared by scripts/station-assets.mjs from the copies
  // filed in assets/downloads/. The unused creature candidate is kept too.
  // LEVEL 4, THE ABANDONED OFFICE (scripts/assets/level4.json):
  // MadeByYeshe, "90s Retro Office Pack" (CC-BY-4.0). A furnished 22m floor
  // laid out as a showroom, metres. The named pieces are the props; the
  // Node_* groups are the showroom's rotated duplicates, Plane_0 its floor,
  // the NurbsPaths its cables, and the loose clock hands strays.
  "sketchfab/dadca97505214b9481d35e22c48e18df": [
    { out: "office/nineties-office.glb", pick: [/^(KeyBoard|Mug \d|Desk|Bottom_Drawer|Top_Drawer|Pot|Black Lamp|White Lamp|Creme Lamp|Cooler|Binder|paper\.|File Box|Files|Trash can|Filing Cainet Base\.015|Printer|Bottle|Phone|Monitor|Mouse|PC|Cubicle_Wall|Chair|Pen Holder|Clock\.|Fan (Blades|Body|Head))/] },
  ],
  // thethieme, "Copy Machine" (CC-BY-4.0). 2m wide with its trays out —
  // a big office copier stands ~1.15m: × 0.75.
  "sketchfab/f26853d4d55c4a86af33788fb13653c9": [{ out: "office/copy-machine.glb", pick: [/^Sketchfab_model$/], scale: 0.75, opaque: [/Tanslucent/] }],
  // RackRibs, "Vending Machine" (CC-BY-4.0). 2.3m tall → a real 1.83m: × 0.8;
  // modelled facing +x, turned.
  "sketchfab/d62a741a00e04d84bc45b6ccb039cf8a": [{ out: "office/vending-machine.glb", pick: [/^Sketchfab_model$/], scale: 0.8, yaw: -90 }],
  // Johana-PS, "ID Card Model" (CC-BY-4.0). A lanyard ID; its height is
  // set in curate.mjs.
  "sketchfab/5addf1256a404b7a82c380bb2d22f186": [{ out: "office/lanyard-id.glb", pick: [/^Sketchfab_model$/] }],
  // NOT KIT PROPS: THE TEMP (the mannequin) and the security keycard are game
  // assets, copied to client/public/assets/office/ by scripts/shrink-glb.mjs.
  "sketchfab/e39ee21828ff4779b4c93ea600f30577": [],
  "sketchfab/fd8d344f83394987aff12a30d91013fb": [],
  "sketchfab/374608f75c114b8a9bf41dbc02c51c50": [],
  "sketchfab/5a64c259a5a8410da7e39eb9e2acff75": [],
  "sketchfab/3d3fc31eddaa409a8f2df564823154e1": [],
  // LEVEL 5, THE TERROR HOTEL (scripts/assets/level5.json, Josh approved the
  // list 2026-10-13). Every one CC-BY-4.0 — the author is in each credit.json.
  // Heights are set in curate.mjs (the downloads come at arbitrary scales);
  // a turn here only where the front doesn't face +Z.
  // Apophisie, "Lustre Luxe": an empire crystal chandelier, ceiling rose to
  // drops; the crystals (Material_50) catch the light. Untextured: its
  // frame (49) and rings (51, 52) shipped white — given their gilt.
  "sketchfab/29392dd175444772881f62436af56397": [{ out: "hotel/crystal-chandelier.glb", pick: [/^Sketchfab_model$/], glow: [/^Material_50$/], simplify: { ratio: 0.2, error: 0.2 }, merge: true, color: [[/^Material_(49|51|52)$/, [0.62, 0.42, 0.14], 0.4]] }],
  // Rixx, "Art Deco Chandelier": a glass lantern on a chain 3x its own
  // height (12.6 units of a 14.7 total) — cut to a short drop, since a
  // ceiling prop's top is the ceiling. The lantern glass glows.
  "sketchfab/2dec4b96bb7b4e4595c69ca001c58afa": [{ out: "hotel/deco-chandelier.glb", pick: [/^Sketchfab_model$/], glow: [/^Material.002$/], clip: { above: 5.6 } }],
  // Rafasilart/Leafar, "Art Deco Prop House Interior Sconce": four glowing
  // discs on brass rods, flat against the wall, lit face toward +z.
  "sketchfab/40517cb6d42a4316a655141f9f6d5757": [{ out: "hotel/deco-sconce.glb", pick: [/^Sketchfab_model$/], glow: [/^LEDBlur$/], merge: true }],
  // Valo Niskanen, "Wall candle": its backplate was on +x — turned so it
  // backs onto the wall (−z) with the candle out front.
  "sketchfab/593098a9230d4438a40688957784237d": [{ out: "hotel/candle-sconce.glb", pick: [/^Sketchfab_model$/], yaw: 90 }],
  // Rixx, "Art Deco Bar": the counter and the back bar are separate meshes —
  // the counter is the RECEPTION DESK (its beer taps left off), the back bar
  // with its shelves the key pigeonholes behind it. Light_1 is a stray plane.
  "sketchfab/385733562f074903ba593ff29359fd4d": [
    { out: "hotel/reception-desk.glb", pick: [/^Counter.001_10$/] },
    { out: "hotel/deco-back-bar.glb", pick: [/^Bar_0$/, /^Bar shelf/], merge: true },
  ],
  "sketchfab/77f2ea17b4c84fe1a8d2aec02caa9de3": [{ out: "hotel/desk-bell.glb", pick: [/^Sketchfab_model$/], merge: true }],
  "sketchfab/a54b2ac109d146fb80cfc37c9da26cfb": [{ out: "hotel/velvet-sofa.glb", pick: [/^Sketchfab_model$/] }],
  // a 10-triangle stray (Maya's texture-editor isolate set) left out
  "sketchfab/3dff6a5ff7d94a86b083a72f14ab078d": [{ out: "hotel/chesterfield.glb", pick: [/^Sketchfab_model$/], drop: [/^textureEditorIsolateSelectSet$/] }],
  "sketchfab/045a190f982b40f28b62eb7f503f3948": [{ out: "hotel/velvet-armchair.glb", pick: [/^Sketchfab_model$/] }],
  "sketchfab/12e059dd5bf74029a916147e3331e72d": [{ out: "hotel/side-table.glb", pick: [/^Sketchfab_model$/] }],
  // a one-triangle stray (Object_2) left out; its shade reached +x — turned
  "sketchfab/994e7d5249904af28f93b713d54a385d": [{ out: "hotel/deco-table-lamp.glb", pick: [/^Sketchfab_model$/], drop: [/^Object_2$/], yaw: -90 }],
  // the fronds ship as BLEND with a cutout alpha: alpha-tested
  "sketchfab/92f75abd656049608248cf76a8c88136": [{ out: "hotel/potted-palm.glb", pick: [/^Sketchfab_model$/], mask: [/^DYPSIS_LUTESCENS_Mat$/] }],
  // NOT "hotel-bed.glb": the hoteldoor source takes every hotel-*.glb here.
  // Modelled lengthways along x, foot at +x: turned foot-first to +z.
  "sketchfab/926dac2bce56437ea5d433b2c6604fc9": [{ out: "hotel/deco-bed.glb", pick: [/^Sketchfab_model$/], yaw: -90, merge: true }],
  // doors swung open and drawers pulled out — left that way (a ransacked room)
  "sketchfab/d9892e64d3194bc3843be84ecf589b1c": [{ out: "hotel/antique-wardrobe.glb", pick: [/^Sketchfab_model$/], merge: true }],
  // modelled with its mirror and front facing −x: turned
  "sketchfab/b11f7fc61a3b48e784aed7c8afa8115c": [{ out: "hotel/dressing-table.glb", pick: [/^Sketchfab_model$/], yaw: 90 }],
  // WENGA, "Ornate Picture Frame": an EASEL frame standing on a floor plane,
  // face toward −z, leaning back ~19°. The floor, the easel strut and its
  // hinge are left off, the glass too (a 40% white pane over the picture),
  // and it is stood upright and turned to face +z, to hang on a wall.
  "sketchfab/165ad70b97694c57b8f0fe90e583ff91": [{ out: "hotel/picture-frame.glb", pick: [/^(framelow|Box001|Ellipse00[1-4]|photo)$/], pitch: -19, yaw: 180, merge: true }],
  // shosha, "Japanese mahjong tiles": a game laid out flat, 37 tiles
  "sketchfab/80cee44ddba640d4bf77ccc2c99d2e7e": [{ out: "hotel/mahjong-set.glb", pick: [/^Sketchfab_model$/], merge: true }],
  // tsutomu.saito, "Mahjong": the 34 tile faces stood on edge in a chart,
  // four rows high — a reference sheet, not anything you'd find on a table,
  // and the set above already covers the game. Filed away, nothing built.
  "sketchfab/a0d118ec8fa84e9ab556a10529ef7bbb": [],
  // a brass cart whose gold lived in its metalness (which the kit zeroes):
  // the texture is tinted brass instead
  "sketchfab/2fb449392d834f61929a76fe935c759c": [{ out: "hotel/luggage-trolley.glb", pick: [/^Sketchfab_model$/], color: [[/^Material__218$/, [0.86, 0.64, 0.3], 0.45]] }],
  // its firing doors are on +x: turned so the stoker's end faces +z
  "sketchfab/e3cc45a7ea754154ba29cbb71114d898": [{ out: "hotel/boiler.glb", pick: [/^Sketchfab_model$/], yaw: -90, merge: true }],
  // the firebox door faced +x: turned
  "sketchfab/74ba60b7bddb440ab182dea15b33c722": [{ out: "hotel/cast-iron-furnace.glb", pick: [/^Sketchfab_model$/], yaw: -90, merge: true }],
  "sketchfab/5ad84f8545964e04ab5dd94042731a5e": [{ out: "hotel/safety-valve.glb", pick: [/^Sketchfab_model$/], merge: true }],
  "sketchfab/7d4d8077bc524dbeb11a28ca09badf57": [{ out: "hotel/radiator.glb", pick: [/^Sketchfab_model$/] }],
  // NOT A KIT PROP: the Deathmoth is a creature — a game asset, prepared with
  // the Deathmoths' round (instanced into swarms, its wings flapped in code).
  "sketchfab/b94c382e1f494cfbb925575392c70ea6": [],

  // Dima Zverev, "5 Doors" (Sketchfab Standard). Five panelled wooden doors in
  // their frames; only the green one came apart (and animated) — the other
  // four are frame and leaf in ONE mesh.
  "5_doors.glb": [
    { out: "doors/wood-door-white-worn.glb", pick: [/^Object002$/], door: { fused: true } },
    { out: "doors/wood-door-white.glb", pick: [/^Object003$/], door: { fused: true } },
    { out: "doors/wood-door-green.glb", pick: [/^Box013$/, /^Object001$/], door: { leaf: /^Object001$/ } },
    { out: "doors/wood-door-blue.glb", pick: [/^Object004$/], door: { fused: true } },
    { out: "doors/wood-door-red.glb", pick: [/^Object005$/], door: { fused: true } },
  ],
  // STHModels, "Poppy Playtime Chapter3 Doors Pack1" (Sketchfab Standard).
  // Four painted steel doors with a wired-glass window; frames and leaves are
  // separate pieces already, paired here by colour.
  "poppy_playtime_chapter3_doors_pack1.glb": ["Yellow", "Red", "Grey", "Blue"].map((c) => ({
    out: `doors/steel-door-${c.toLowerCase()}.glb`,
    pick: [new RegExp(`^SM_Frame_Metal_A${c}\\.mo$`), new RegExp(`^SM_Door_A_${c}\\.mo$`)],
    door: { leaf: new RegExp(`^SM_Door_A_${c}\\.mo$`) },
    glass: [/^MI_Glass$/],
  })),
  // urbanmasque, "Flourescent Lighting" (CC-BY-4.0 — credited in the
  // catalogue). One tube batten, 113k triangles (extract.mjs simplifies it),
  // hung 58m below its own origin (extract.mjs re-centres it).
  "flourescent_lighting.glb": [{ out: "lighting/fluorescent-batten.glb", pick: [/./], glow: [/^Layer_1_mtl$/] }],
  // Mohit Akundi, "Lighting Fixtures Set 1 Free" (Sketchfab Standard). Four
  // lamps laid out in a row, each in several pieces.
  "lighting_fixtures_set_1_free.glb": [
    { out: "lighting/hanging-lantern.glb", pick: [/^Hanging Lamp/, /^Curvy Holder$/] },
    { out: "lighting/led-wall-panel.glb", pick: [/^LED FLAT Base$/], glow: [/^material$/] }, // the lit face's material is literally named "material"
    { out: "lighting/bulkhead-lamp.glb", pick: [/^Bulkhead /], glow: [/^Bulkhead_Lamp$/] },
    { out: "lighting/bare-bulb.glb", pick: [/^Bulb$/, /^Fil[12]$/], glow: [/^Bulb_Filament$/] },
  ],

  // ---- the September 2026 batch (27 downloads). Scales were MEASURED on
  // the look-sheets against a 1.8m figure, and against the one thing in each
  // file whose real size is known (a lotion tube, a drill's column, a rung).

  // SeanNicolas, "60's Office Props" (CC-BY-NC-4.0). Forty-odd pieces of a
  // 1960s office in flat colours, modelled ~1.4x too big throughout (the
  // desk top stood at 1.06m, the swivel chair 1.59m) → 0.72; its three
  // scene lights are simply not picked.
  "60s_office_props.glb": [{ out: "office/sixties-office.glb", pick: [/^(Cube|Cylinder)/], scale: 0.72 }],
  // HippoStance, "Ammo Reloading Workbench" (CC-BY-4.0). One bench, metres.
  "ammo_reloading_workbench.glb": [{ out: "workshop/reloading-bench.glb", pick: [/^RootNode$/] }],
  // Brandon Westlake, "Bathroom Props (FREE)" (Sketchfab Standard). Three
  // bottles in no unit at all: the lotion tube (531 units) is ~21cm.
  "bathroom_props_free.glb": [{ out: "bathroom/bottles.glb", pick: [/^Cylinder/], scale: 0.0004 }],
  // CommonSpence, "Drill Press" (CC-BY-4.0). A floor pillar drill, 73.7
  // units tall → 1.70m.
  "drill_press.glb": [{ out: "workshop/pillar-drill.glb", pick: [/^Sketchfab_model$/], scale: 0.0231 }],
  // Labus, "Electrical transformer substation" (CC-BY-4.0). Metres already.
  "electrical_transformer_substation.glb": [{ out: "electrical/pole-substation.glb", pick: [/^Sketchfab_model$/] }],
  // Scarecrow_original, "Hydraulic Press" (CC-BY-4.0). A shop press, metres.
  "hydraulic_press.glb": [{ out: "workshop/hydraulic-press.glb", pick: [/^Sketchfab_model$/] }],
  // Anfossi Valentin, "Industrial - Locker" (Sketchfab Standard). Ten
  // lockers in two tiers, 16.07 units → 1.85m.
  "industrial_-_locker.glb": [{ out: "storage/locker-tiers.glb", pick: [/^Sketchfab_model$/], scale: 0.1151 }],
  // HusarL, "Industrial Air Conditioner" (CC-BY-4.0). A twin-fan condenser;
  // the fan guards are an alpha cutout. Its fan clip is dropped (the kit
  // plays only "open").
  "industrial_air_conditioner.glb": [{ out: "electrical/condenser-unit.glb", pick: [/^Sketchfab_model$/], mask: [/^material$/] }],
  // byte-for-byte the pack already in the kit as source "indfree"
  // (assets/pipe dreams/industrial_asset_pack_free.glb) — nothing new
  "industrial_asset_pack_free.glb": [],
  // DudleyLong, "Industrial Pipes" (CC-BY-4.0). Two riser pipes, metres.
  "industrial_pipes.glb": [{ out: "pipes/riser-pair.glb", pick: [/^Pipes_Low$/] }],
  // siddharthkalbage, "Industrial Storage Rack" (CC-BY-4.0). Pallet racking,
  // 10.3 units → 3.1m; modelled running along z, turned to run along x.
  "industrial_storage_rack.glb": [{ out: "storage/pallet-rack.glb", pick: [/^Sketchfab_model$/], scale: 0.3, yaw: 90 }],
  // Elasta Kristya, "Industrial Table" (CC-BY-4.0). Its colour textures are
  // missing (only normal maps came down), so the oak top and the steel
  // frame get flat colours.
  "industrial_table.glb": [{ out: "workshop/steel-frame-table.glb", pick: [/^Sketchfab_model$/], color: [[/^Table_wood/, [0.28, 0.15, 0.07], 0.75], [/^Old_Steel/, [0.1, 0.1, 0.1], 0.55]] }],
  // denis_cliofas, "Industrial Work Light" (CC-BY-4.0). Twin floodlights on
  // a tripod, in centimetres-ish; 110.6 units → 1.55m. The lenses glow.
  "industrial_work_light.glb": [{ out: "lighting/tripod-work-light.glb", pick: [/^Sketchfab_model$/], scale: 0.014, glow: [/Transparent/] }],
  // Oleg, "lathe" (CC-BY-4.0). A heavy engine lathe; 200 units → 1.2m tall
  // at the handwheels (3.7m long).
  "lathe.glb": [{ out: "workshop/engine-lathe.glb", pick: [/^Sketchfab_model$/], scale: 0.006 }],
  // Ross Armstrong Photography, "Local Service Transformer" (CC-BY-4.0). A
  // photo-scan of a pad-mounted transformer; the file's FIRST mesh of the
  // same name is a stray patch of snowy ground, left behind. The scan's
  // scale is off (the cabinet reads 3.5m wide): its height is set in
  // curate.mjs.
  "local_service_transformer.glb": [{ out: "electrical/pad-transformer.glb", pick: [/^Model_material0_0$/], only: [1] }],
  // neverfollow81, "Locker" (CC-BY-4.0). A row of three and a single, in
  // centimetres, in ONE mesh — cut apart by loose parts.
  "locker.glb": [{ out: "storage/blue-lockers.glb", pick: [/^Sketchfab_model$/], scale: 0.01, parts: true }],
  // ROHIT3DMODELS, "Modern Bathroom Props & Sanitary Ware Pack" (CC-BY-4.0).
  // Nine fittings, metres; the pack's camera and light are not picked.
  "modern_bathroom_props__sanitary_ware_pack.glb": [
    { out: "bathroom/modern-bathroom.glb", pick: [/^(Bathtub|Floating_Vanity_Ceramic_Sink|Heated_Towel_Rail|LED_Mirror_0[12]|Modern_Wall_Hung_Toilet|Toilet_Paper_Holder|Trash_Can|Walk_in_Shower\.001)$/], glass: [/^shower$/] },
  ],
  // Jordi Kruk, "Modular office building assets (Post Apoc)" (CC-BY-4.0).
  // Untextured walls, floors and an elevator shaft (the level kits already
  // do walls) — what's worth having is the doors: frameless leaves, turned to
  // face +z and hung so they swing, plus the steel elevator doors.
  "modular_office_building_assets_post_apoc.glb": [
    { out: "doors/office-door-plain.glb", pick: [/^Door$/], door: { leaf: /^Door$/ }, scale: 0.01, yaw: 90, color: [[/^lambert2$/, [0.42, 0.4, 0.35], 0.8], [/^lambert1$/, [0.3, 0.3, 0.31], 0.45]] },
    { out: "doors/office-door-glass.glb", pick: [/^Glass_door$/], door: { leaf: /^Glass_door$/ }, scale: 0.01, yaw: 90, glass: [/^blinn1$/], color: [[/^lambert1$/, [0.3, 0.3, 0.31], 0.45]] },
    { out: "doors/office-door-keycard.glb", pick: [/^Keycard_door1$/], door: { leaf: /^Keycard_door1$/ }, scale: 0.01, yaw: 90, color: [[/^lambert2$/, [0.3, 0.32, 0.34], 0.7], [/^lambert1$/, [0.12, 0.12, 0.13], 0.5]] },
    { out: "office/elevator-doors.glb", pick: [/^Elevator_door$/], scale: 0.01, yaw: 90, color: [[/^lambert1$/, [0.38, 0.39, 0.4], 0.35]] },
  ],
  // Jordi Kruk, "Modular office Interior assets (Post Apoc)" (CC-BY-4.0).
  // Thirty-one pieces on one atlas, in centimetres (a loose toilet lid left
  // out). The atlas ships as BLEND with its empty space transparent:
  // alpha-tested instead.
  // The glassware keeps the blend (its glass IS the alpha, and a cutout
  // shaved the flasks to slivers), in a file of its own.
  "modular_office_interior_assets_post_apoc.glb": [
    { out: "office/post-apoc-office.glb", pick: [/^(?!Sketchfab_model$|RootNode$|[0-9a-f]{32}|Bottle_|test_tubes|Toilet_lid)/], scale: 0.01, mask: [/^AssetsC_MAT$/] },
    { out: "office/post-apoc-glassware.glb", pick: [/^(Bottle_[1-4]|test_tubes)$/], scale: 0.01 },
  ],
  // AspectStudios, "Office Prop Pack - Game Asset" (CC-BY-4.0). 27 pieces
  // on one palette, metres.
  // Its furniture is ~1.25x (chairs 1.21m, a 4-drawer cabinet 1.97m) →
  // 0.8; the loose pencils and the eraser are too small to be worth a slot.
  // The two chairs were modelled facing +x and get their own file, turned.
  "office_prop_pack_-_game_asset.glb": [
    { out: "office/office-pack.glb", pick: [/^(Drawers|Headphones|Lamp|Mug|PencilHolder|Shelves|Stickynote|String|Table|Whiteboard|WoodBoard)/], scale: 0.8 },
    { out: "office/office-pack-chairs.glb", pick: [/^Seat/], scale: 0.8, yaw: -90 },
  ],
  // MrUnity, "Old Soviet Transformer Low-Poly" (CC-BY-4.0). A two-door
  // street electrical cabinet, metres.
  "old_soviet_transformer_low-poly.glb": [{ out: "electrical/street-cabinet.glb", pick: [/^Sketchfab_model$/] }],
  // adventurer, "Pipe workshop Industrial piping" (CC-BY-4.0). A pipe rack
  // and loose pipes, metres.
  "pipe_workshop_industrial_piping.glb": [{ out: "pipes/pipe-workshop.glb", pick: [/^0[1-4]$/] }],
  // One80 Solar, "Substation" (CC-BY-4.0) — SKIPPED: a whole 121m switchyard
  // (665k triangles, 45MB), merged by material into 24 meshes each scattered
  // across the site, so no piece of it is an object you could place.
  "substation.glb": [],
  // ecjhr0awipso, "Toilet" (Sketchfab Standard). Metres; it faced +x.
  "toilet.glb": [{ out: "bathroom/toilet.glb", pick: [/^Sketchfab_model$/], yaw: -90 }],
  // Samuel Francis Johnson, "Vintage Industrial Ladder" (CC-BY-4.0). A
  // ladder whose rails hook over a ledge; modelled facing +x, turned. Its
  // rungs are 1.22 units wide on a 7.08 rise: height set in curate.mjs.
  "vintage_industrial_ladder.glb": [{ out: "hardware/wall-ladder.glb", pick: [/^Sketchfab_model$/], yaw: -90 }],
  // Mad_Lobster_Workshop, "Vintage Industrial Light Switches Type A". Three
  // finishes of one rotary switch, metres.
  "vintage_industrial_light_switches_type_a.glb": [{ out: "electrical/rotary-switches.glb", pick: [/^Vintage Industrial Light Switch Type A/] }],
  // JJ Chalupnik, "Workbench" (CC-BY-4.0). Bench, pegboard and tool chests,
  // in centimetres.
  "workbench.glb": [{ out: "workshop/workbench.glb", pick: [/^Sketchfab_model$/], scale: 0.01 }],
  // "Hotel Asset Pack" (Josh, Oct 2026; its source isn't recorded in the
  // file — its textures are ambientCG's, CC0). Mostly a corridor-and-room
  // SHELL, which a grid-built level can't use; the keepers are the
  // showroom's standalone doors along z ≈ -0.3 (the ones beside the frames
  // are the same doors modelled OPEN). Modelled 2.63m tall: × 0.8 is a real
  // 2.1m hotel door. Its wallpapers, carpet and floors went to the surface
  // catalogue (scripts/assets/texture.mjs).
  "Hotel Asset Pack.glb": [
    { out: "hotel/hotel-door-panelled.glb", pick: [/^Door\.003$/], door: { leaf: /^Door\.003$/ }, scale: 0.8 },
    { out: "hotel/hotel-door-plain.glb", pick: [/^Door\.002$/], door: { leaf: /^Door\.002$/ }, scale: 0.8 },
    { out: "hotel/hotel-door-glass.glb", pick: [/^Cube\.002$/], door: { leaf: /^Cube\.002$/ }, scale: 0.8, glass: [/^Glass$/] },
    { out: "hotel/hotel-lift-doors.glb", pick: [/^Cube\.001$/], scale: 0.8 },
  ],
  // LEVEL 6, LIGHTS OUT (scripts/assets/level6.json, Josh approved the list
  // 2026-10-14). CC-BY-4.0, the author in each credit.json; heights in
  // curate.mjs. The sea hatch and the creature are not kit props — they are
  // built for the scene by scripts/assets/seahatch.mjs and shrink-glb.
  "sketchfab/514cf4b2872d484497425033eeec9c0a": [],
  "sketchfab/9fb509d207d744babeb5d87a486f7de1": [],
  // kemsui, "Broken concrete debris": ten loose pieces laid out on one plate —
  // the ones worth placing alone, each its own prop.
  "sketchfab/284ab0cef4fd4e0dbc963da2e52341b0": [
    { out: "debris/broken-wall-slab.glb", pick: [/^broken_concrete_wall_001\.001/] },
    { out: "debris/broken-wall-corner.glb", pick: [/^broken_concrete_wall_cornor_001\.001/] },
    { out: "debris/broken-pillar-tall.glb", pick: [/^broken_concrete_pillar_001\.002/] },
    { out: "debris/broken-pillar.glb", pick: [/^broken_concrete_pillar_003\.001/] },
    { out: "debris/broken-pillar-stump.glb", pick: [/^broken_concrete_pillar_002\.003/] },
    { out: "debris/concrete-shard.glb", pick: [/^broken_concrete_wall_003\.001/] },
  ],
  // GameDev Nick, "Rubble Pile - Photoscan": 60k triangles for a heap you walk
  // past in the dark. `simplify` can't thin it — every triangle of a photo
  // scan has its own UVs, so the weld joins nothing — so AFTER this recipe:
  //   npx gltfpack@0.22.0 -i assets/kit/debris/rubble-pile.glb -o <tmp> -si 0.25 -sa -noq -kn
  // and copy <tmp> back over the kit file (≈12k triangles; -sa simplifies
  // across the seams).
  "sketchfab/5986d1487d9443b883d67b121c2c903c": [{ out: "debris/rubble-pile.glb", pick: [/^Sketchfab_model$/] }],
  // jimbogies, "Old Rusty Shelving Unit": four bare rusted shelves.
  "sketchfab/3ce07d0518154759841236045efafd72": [{ out: "storage/rusty-shelving.glb", pick: [/^Sketchfab_model$/] }],
};

/** Every node whose name matches, taking the highest match in each branch. */
function findNodes(doc, patterns) {
  const out = [];
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const visit = (n) => {
    if (patterns.some((p) => p.test(n.getName()))) {
      out.push(n);
      return;
    }
    for (const k of n.listChildren()) visit(k);
  };
  for (const n of scene.listChildren()) visit(n);
  return out;
}

/** Column-major 4x4 multiply (a · b). */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** The recipe's own scale and yaw as one matrix, applied after the world. */
function preOf(r) {
  const s = r.scale ?? 1;
  const a = ((r.yaw ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const n = Math.sin(a);
  const yawScale = [c * s, 0, -n * s, 0, 0, s, 0, 0, n * s, 0, c * s, 0, 0, 0, 0, 1];
  if (!r.pitch) return yawScale;
  const p = (r.pitch * Math.PI) / 180;
  const pc = Math.cos(p);
  const ps = Math.sin(p);
  // about x: y' = c·y − s·z, z' = s·y + c·z (applied first, then yaw and scale)
  return mul(yawScale, [1, 0, 0, 0, 0, pc, ps, 0, 0, -ps, pc, 0, 0, 0, 0, 1]);
}

/** Cut away every triangle whose three corners are all above y. */
function clipAbove(mesh, y) {
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    const idx = p.getIndices();
    if (!idx) continue;
    const keep = [];
    const v = [0, 0, 0];
    for (let t = 0; t < idx.getCount(); t += 3) {
      const tri = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
      if (tri.every((i) => pos.getElement(i, v)[1] > y)) continue;
      keep.push(...tri);
    }
    idx.setArray(new Uint32Array(keep));
  }
  return mesh;
}

/** Bake a node branch into WORLD space: every primitive under it is copied,
 *  transformed by its world matrix (and the recipe's scale and yaw), into one
 *  new mesh. `drop` leaves matching sub-branches out. */
function bake(doc, node, name, pre = null, drop = null) {
  const mesh = doc.createMesh(name);
  const skip = new Set();
  if (drop) node.traverse((n) => n !== node && drop.some((p) => p.test(n.getName())) && n.traverse((q) => skip.add(q)));
  node.traverse((n) => {
    const m = n.getMesh();
    if (!m || skip.has(n)) return;
    const skin = n.getSkin();
    const world = pre ? mul(pre, n.getWorldMatrix()) : n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const q = p.clone();
      // the clone shares accessors with the original: give it its own copies
      for (const sem of q.listSemantics()) q.setAttribute(sem, q.getAttribute(sem).clone());
      if (q.getIndices()) q.setIndices(q.getIndices().clone());
      if (skin && q.getAttribute("JOINTS_0")) {
        // A SKINNED mesh ignores its node's transform: it is drawn where its
        // bones put it. Pose it in its rest pose by the joints, then the
        // recipe's scale and yaw (the reloading bench's press and scale, the
        // condenser's fans — baked by node matrix they landed a metre off).
        poseSkinned(q, skin);
        if (pre) transformPrimitive(q, pre);
      } else transformPrimitive(q, world);
      mesh.addPrimitive(q);
    }
  });
  return mesh;
}

/** Linear-blend a skinned primitive into world space at its bones' current
 *  pose, and strip the skin attributes (a kit prop has no skeleton). */
function poseSkinned(q, skin) {
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const mats = joints.map((j, k) => {
    const inv = ibm ? ibm.getElement(k, new Array(16)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return mul(j.getWorldMatrix(), inv);
  });
  const J = q.getAttribute("JOINTS_0");
  const W = q.getAttribute("WEIGHTS_0");
  const apply = (attr, w) => {
    if (!attr) return;
    const v = [0, 0, 0];
    const ji = [0, 0, 0, 0];
    const wi = [0, 0, 0, 0];
    for (let i = 0; i < attr.getCount(); i++) {
      attr.getElement(i, v);
      J.getElement(i, ji);
      W.getElement(i, wi);
      const o = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        if (!wi[k]) continue;
        const M = mats[ji[k]];
        for (let r = 0; r < 3; r++) o[r] += wi[k] * (M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + (w ? M[12 + r] : 0));
      }
      if (!w) {
        const l = Math.hypot(o[0], o[1], o[2]) || 1;
        o[0] /= l;
        o[1] /= l;
        o[2] /= l;
      }
      attr.setElement(i, o);
    }
  };
  apply(q.getAttribute("POSITION"), 1);
  apply(q.getAttribute("NORMAL"), 0);
  q.setAttribute("TANGENT", null);
  for (const s of ["JOINTS_0", "WEIGHTS_0", "JOINTS_1", "WEIGHTS_1"]) q.setAttribute(s, null);
}

/** Split a mesh into [frame, leaf] by loose parts: a part whose box reaches
 *  the outer edge of the whole (either side, or the head) is frame. */
function splitFused(doc, mesh) {
  const all = getBoundsOfMesh(mesh);
  const frame = doc.createMesh("frame");
  const leaf = doc.createMesh("leaf");
  const tol = 0.012;
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    const idx = p.getIndices();
    const n = pos.getCount();
    const tri = idx ? idx.getCount() / 3 : n / 3;
    const at = (t, k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k);
    // union vertices that share a POSITION (a loose part is often split at UV seams)
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const key = new Map();
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v);
      const k = `${Math.round(v[0] * 2000)},${Math.round(v[1] * 2000)},${Math.round(v[2] * 2000)}`;
      const j = key.get(k);
      if (j === undefined) key.set(k, i);
      else parent[find(i)] = find(j);
    }
    for (let t = 0; t < tri; t++) {
      const a = find(at(t, 0));
      parent[find(at(t, 1))] = a;
      parent[find(at(t, 2))] = a;
    }
    // each part's box
    const box = new Map();
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v);
      const r = find(i);
      const b = box.get(r) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (let a = 0; a < 3; a++) (b.min[a] = Math.min(b.min[a], v[a])), (b.max[a] = Math.max(b.max[a], v[a]));
      box.set(r, b);
    }
    const isFrame = (r) => {
      const b = box.get(r);
      return b.min[0] <= all.min[0] + tol || b.max[0] >= all.max[0] - tol || b.max[1] >= all.max[1] - tol;
    };
    const fi = [];
    const li = [];
    for (let t = 0; t < tri; t++) (isFrame(find(at(t, 0))) ? fi : li).push(at(t, 0), at(t, 1), at(t, 2));
    for (const [list, into] of [[fi, frame], [li, leaf]]) {
      if (!list.length) continue;
      const q = p.clone();
      const acc = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(list));
      q.setIndices(acc);
      into.addPrimitive(q);
    }
  }
  return [frame, leaf];
}

/** Cut a mesh into objects: loose parts (vertices sharing a position are one
 *  part), then parts whose boxes touch are unioned — so a locker keeps its
 *  handles, while two lockers standing apart come out as two. Left to right. */
function splitParts(doc, mesh, name, tol = 0.01) {
  const parts = []; // { prim, tris, box }
  const v = [0, 0, 0];
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    const idx = p.getIndices();
    const n = pos.getCount();
    const tri = idx ? idx.getCount() / 3 : n / 3;
    const at = (t, k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k);
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const key = new Map();
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v);
      const k = `${Math.round(v[0] * 2000)},${Math.round(v[1] * 2000)},${Math.round(v[2] * 2000)}`;
      const j = key.get(k);
      if (j === undefined) key.set(k, i);
      else parent[find(i)] = find(j);
    }
    for (let t = 0; t < tri; t++) {
      const a = find(at(t, 0));
      parent[find(at(t, 1))] = a;
      parent[find(at(t, 2))] = a;
    }
    const byRoot = new Map();
    for (let t = 0; t < tri; t++) {
      const r = find(at(t, 0));
      let q = byRoot.get(r);
      if (!q) byRoot.set(r, (q = { prim: p, tris: [], box: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } }));
      for (let k = 0; k < 3; k++) {
        const i = at(t, k);
        q.tris.push(i);
        pos.getElement(i, v);
        for (let a = 0; a < 3; a++) (q.box.min[a] = Math.min(q.box.min[a], v[a])), (q.box.max[a] = Math.max(q.box.max[a], v[a]));
      }
    }
    parts.push(...byRoot.values());
  }
  const up = parts.map((_, i) => i);
  const f = (i) => (up[i] === i ? i : (up[i] = f(up[i])));
  const box = parts.map((q) => ({ min: [...q.box.min], max: [...q.box.max] }));
  for (let merged = true; merged; ) {
    merged = false;
    for (let a = 0; a < parts.length; a++) {
      for (let b = a + 1; b < parts.length; b++) {
        const ra = f(a);
        const rb = f(b);
        if (ra === rb) continue;
        const A = box[ra];
        const B = box[rb];
        if (![0, 1, 2].every((k) => A.min[k] <= B.max[k] + tol && B.min[k] <= A.max[k] + tol)) continue;
        up[rb] = ra;
        for (let k = 0; k < 3; k++) (A.min[k] = Math.min(A.min[k], B.min[k])), (A.max[k] = Math.max(A.max[k], B.max[k]));
        merged = true;
      }
    }
  }
  const groups = new Map();
  parts.forEach((q, i) => groups.set(f(i), [...(groups.get(f(i)) ?? []), q]));
  return [...groups.entries()]
    .sort((a, b) => box[a[0]].min[0] - box[b[0]].min[0])
    .map(([, qs], gi) => {
      const out = doc.createMesh(`${name}-${gi + 1}`);
      const byPrim = new Map();
      for (const q of qs) byPrim.set(q.prim, [...(byPrim.get(q.prim) ?? []), ...q.tris]);
      for (const [p, list] of byPrim) {
        const c = p.clone();
        c.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(list)));
        out.addPrimitive(c);
      }
      return out;
    });
}

function getBoundsOfMesh(mesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const v = [0, 0, 0];
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      for (let a = 0; a < 3; a++) (min[a] = Math.min(min[a], v[a])), (max[a] = Math.max(max[a], v[a]));
    }
  }
  return { min, max };
}

/** Where the handle is: the leaf's vertices that stick out of its slab (the
 *  handle, the keyhole plate) sit on the side AWAY from the hinge. */
function handleSide(mesh) {
  const b = getBoundsOfMesh(mesh);
  const zc = (b.min[2] + b.max[2]) / 2;
  const xc = (b.min[0] + b.max[0]) / 2;
  // the slab's own half-thickness is the median |z - zc| of all vertices
  const zs = [];
  const xs = [];
  const v = [0, 0, 0];
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      zs.push(Math.abs(v[2] - zc));
      xs.push(v[0]);
    }
  }
  const sorted = [...zs].sort((a, b) => a - b);
  const slab = sorted[Math.floor(sorted.length * 0.5)];
  let sum = 0;
  let cnt = 0;
  zs.forEach((z, i) => {
    if (z > slab * 1.6 + 0.004) {
      sum += xs[i] - xc;
      cnt++;
    }
  });
  return cnt ? Math.sign(sum) || 1 : 1;
}

/** Hang the leaf on a hinge at the edge away from its handle, and give the
 *  file an "open" clip that swings it about 95°. */
function hang(doc, root, leafMesh) {
  const b = getBoundsOfMesh(leafMesh);
  const side = handleSide(leafMesh); // +1: handle at +x, so the hinge is at min x
  const hx = side > 0 ? b.min[0] : b.max[0];
  const hz = (b.min[2] + b.max[2]) / 2;
  const hinge = doc.createNode("hinge").setTranslation([hx, 0, hz]);
  const leaf = doc.createNode("leaf").setMesh(leafMesh).setTranslation([-hx, 0, -hz]);
  hinge.addChild(leaf);
  root.addChild(hinge);
  // swing so the handle side moves toward +z (the room the door faces into)
  const angle = (95 * Math.PI) / 180 * (side > 0 ? -1 : 1);
  const steps = 10;
  const times = [];
  const quats = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = 1 - (1 - t) ** 3; // ease out — a push, then the swing settles
    const a = (angle * e) / 2;
    times.push(t * 0.9);
    quats.push(0, Math.sin(a), 0, Math.cos(a));
  }
  const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(times));
  const output = doc.createAccessor().setType("VEC4").setArray(new Float32Array(quats));
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
  const channel = doc.createAnimationChannel().setTargetNode(hinge).setTargetPath("rotation").setSampler(sampler);
  doc.createAnimation("open").addSampler(sampler).addChannel(channel);
  return { hingeAt: [hx, hz], swing: +((angle * 180) / Math.PI).toFixed(0) };
}

/** A recipe's source: a file in the inbox, or a fetched folder's model. */
function modelOf(file) {
  const p = path.join(FROM, file);
  if (!statSync(p).isDirectory()) return p;
  const m = readdirSync(p).find((f) => /.(glb|gltf)$/i.test(f));
  if (!m) throw new Error(`${file}: no .glb or .gltf inside`);
  return path.join(p, m);
}

async function build(file, r) {
  const doc = await io.read(modelOf(file));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const picked = findNodes(doc, r.pick);
  if (!picked.length) throw new Error(`${r.out}: nothing matched`);
  if (r.only) picked.splice(0, picked.length, ...r.only.map((i) => picked[i]).filter(Boolean));
  const pre = r.scale || r.yaw || r.pitch ? preOf(r) : null;
  // any clip the download came with drove the OLD nodes — it goes first,
  // before this recipe makes its own
  for (const a of root.listAnimations()) a.dispose();
  const prop = doc.createNode("prop");
  const report = {};
  if (r.door?.leaf) {
    const leafNode = picked.find((n) => r.door.leaf.test(n.getName()));
    const frames = picked.filter((n) => n !== leafNode);
    for (const f of frames) prop.addChild(doc.createNode("frame").setMesh(bake(doc, f, "frame", pre, r.drop)));
    Object.assign(report, hang(doc, prop, bake(doc, leafNode, "leaf", pre, r.drop)));
  } else if (r.door?.fused) {
    const [frame, leaf] = splitFused(doc, bake(doc, picked[0], "door", pre, r.drop));
    if (!leaf.listPrimitives().length) throw new Error(`${r.out}: no leaf found inside the frame`);
    prop.addChild(doc.createNode("frame").setMesh(frame));
    Object.assign(report, hang(doc, prop, leaf));
  } else if (r.parts) {
    const whole = doc.createMesh("whole");
    for (const n of picked) for (const p of bake(doc, n, n.getName(), pre, r.drop).listPrimitives()) whole.addPrimitive(p);
    let groups = splitParts(doc, whole, "part");
    // "largest": a photo-scan's fringe of floating crumbs goes, the object stays
    const triCount = (g) => g.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0), 0);
    if (r.parts === "largest") groups = [groups.reduce((a, b) => (triCount(b) > triCount(a) ? b : a))];
    for (const g of groups) prop.addChild(doc.createNode(g.getName()).setMesh(g));
    report.parts = groups.length;
  } else {
    for (const n of picked) {
      const m = bake(doc, n, n.getName(), pre, r.drop);
      prop.addChild(doc.createNode(n.getName()).setMesh(r.clip ? clipAbove(m, r.clip.above) : m));
    }
  }
  // the old scene goes (its clips went before the new one was made)
  for (const c of scene.listChildren()) {
    c.traverse((q) => q !== c && q.dispose());
    c.dispose();
  }
  scene.addChild(prop);
  for (const m of root.listMaterials()) {
    if (!r.glow?.some((p) => p.test(m.getName()))) continue;
    const c = m.getBaseColorFactor();
    m.setEmissiveFactor([Math.max(0.6, c[0]), Math.max(0.6, c[1]), Math.max(0.6, c[2])]);
    if (m.getBaseColorTexture()) m.setEmissiveTexture(m.getBaseColorTexture());
    report.glow = [...(report.glow ?? []), m.getName()];
  }
  // NOT METAL. The game has no environment map, so a metallic surface has
  // nothing to reflect and renders BLACK — and Sketchfab packs say metallic 1
  // and leave a texture to take it back, a texture the kit build strips.
  // (THE DOOR's old model hit the same thing: "the door is black".)
  for (const m of root.listMaterials()) m.setMetallicFactor(0);
  // Spec-gloss (an old Maya/Sketchfab export) is gone from three: the game
  // would log a warning per load and read the metal/rough values anyway
  // BUT a spec-gloss material keeps its COLOUR in the extension (the diffuse
  // texture and factor), so it moves onto the base colour first — disposing
  // the extension outright left Oct 2026's diesel generator a blank white.
  for (const m of root.listMaterials()) {
    const sg = m.getExtension("KHR_materials_pbrSpecularGlossiness");
    if (!sg) continue;
    if (!m.getBaseColorTexture() && sg.getDiffuseTexture()) m.setBaseColorTexture(sg.getDiffuseTexture());
    m.setBaseColorFactor(sg.getDiffuseFactor());
  }
  for (const e of root.listExtensionsUsed()) if (e.extensionName === "KHR_materials_pbrSpecularGlossiness") e.dispose();
  for (const [pat, rgb, rough] of r.color ?? []) {
    for (const m of root.listMaterials()) {
      if (!pat.test(m.getName())) continue;
      m.setBaseColorFactor([...rgb, 1]);
      if (rough !== undefined) m.setRoughnessFactor(rough);
      report.color = [...(report.color ?? []), m.getName()];
    }
  }
  for (const m of root.listMaterials()) if (r.opaque?.some((p) => p.test(m.getName()))) m.setAlphaMode("OPAQUE");
  for (const m of root.listMaterials()) if (r.mask?.some((p) => p.test(m.getName()))) m.setAlphaMode("MASK").setAlphaCutoff(0.5);
  for (const m of root.listMaterials()) {
    if (!r.glass?.some((p) => p.test(m.getName()))) continue;
    // the pack shipped its window as an opaque grey slab — a dark hole in the door
    m.setAlphaMode("BLEND").setBaseColorFactor([0.78, 0.84, 0.86, 0.32]).setRoughnessFactor(0.15).setMetallicFactor(0).setDoubleSided(true);
    report.glass = [...(report.glass ?? []), m.getName()];
  }
  // every primitive keeps only the vertices it USES: packs share one vertex
  // buffer between objects (and a split shares it between the parts), and a
  // bound read off a shared buffer is the whole pack, not the piece
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
  await doc.transform(prune({ keepLeaves: false }), dedup());
  if (r.simplify) {
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: r.simplify.ratio ?? r.simplify, error: r.simplify.error ?? 0.05 }));
  }
  if (r.merge) await doc.transform(join({ keepMeshes: false, keepNamed: false }), prune({ keepLeaves: false }));
  const b = getBounds(scene);
  report.size = b.min.map((v, i) => +(b.max[i] - v).toFixed(3));
  const dest = path.join(KIT, r.out);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, await io.writeBinary(doc));
  return report;
}

const only = process.argv.find((a) => a.startsWith("--file="))?.slice(7);
const rerun = process.argv.includes("--rerun");
const FROM = rerun ? DOWNLOADS : INBOX;
// the inbox: loose files, plus every fetched folder (<source>/<id>/ holding a
// credit.json) as one entry — texture-only folders (ambientCG) are not props
const inbox = [];
for (const f of existsSync(FROM) ? readdirSync(FROM) : []) {
  const p = path.join(FROM, f);
  if (!statSync(p).isDirectory()) {
    inbox.push(f);
    continue;
  }
  for (const id of readdirSync(p)) {
    const d = path.join(p, id);
    if (statSync(d).isDirectory() && existsSync(path.join(d, "credit.json")) && readdirSync(d).some((x) => /.(glb|gltf)$/i.test(x))) inbox.push(`${f}/${id}`);
  }
}
mkdirSync(DOWNLOADS, { recursive: true });
for (const file of inbox) {
  if (only && file !== only) continue;
  const recipes = RECIPES[file];
  if (!recipes) {
    console.log(`? ${file}: no recipe yet — inspect it and add one to RECIPES`);
    continue;
  }
  let ok = true;
  for (const r of recipes) {
    try {
      const rep = await build(file, r);
      console.log(`  ${r.out}  ${rep.size.join("×")}m${rep.parts ? `  ${rep.parts} parts` : ""}${rep.hingeAt ? `  hinge x=${rep.hingeAt[0].toFixed(3)} swing ${rep.swing}°` : ""}${rep.glow ? `  glows: ${rep.glow.join(", ")}` : ""}`);
    } catch (e) {
      ok = false;
      console.log(`  ! ${r.out}: ${e.message}`);
    }
  }
  if (ok && !rerun && !process.argv.includes("--keep")) {
    mkdirSync(path.dirname(path.join(DOWNLOADS, file)), { recursive: true });
    renameSync(path.join(INBOX, file), path.join(DOWNLOADS, file));
    console.log(`  → the download is kept at assets/downloads/${file}`);
  }
}
