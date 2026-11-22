// THE PROP SOURCES — every model pack Josh has that holds placeable scenery,
// and how each one is cut into separate props. Read by scripts/props/extract.mjs.
//
//   split: "whole"    the file is ONE prop (all its parts together)
//          "nodes"    every top-level piece is its own prop (the casino pack:
//                     103 named props laid out side by side)
//          "cluster"  pieces that overlap in space are one prop (the
//                     industrial pack: a barrel, its cap and its base are
//                     three pieces sitting inside each other)
//   unit:  "m" | "cm" | "auto" | a number (auto: a prop over 30 units on its
//                     longest side is read as centimetres; a number is the
//                     scale that pack needs — measured against a known object)
//   theme: the tags the browser filters on by default per level
//   textures: how to find textures an FBX lost ("sibling": PNGs named after
//                     the model beside it; "kit0"/"kit1": the level kits'
//                     shared folders, by material name)
//
// Items you carry (flashlight, gun, camera), creatures and characters are not
// scenery and are left out on purpose.

export const SOURCES = [
  // ---- Pipe Dreams (industrial)
  { id: "ind", file: "assets/pipe dreams/industrial_asset_pack.glb", split: "cluster", unit: 0.23, theme: ["industrial"] },
  { id: "indfree", file: "assets/pipe dreams/industrial_asset_pack_free.glb", split: "cluster", unit: "auto", theme: ["industrial"] },
  { id: "pipekit", file: "assets/pipe dreams/old_pipes_bundle__modular_industrial_pack.glb", split: "nodes", unit: "auto", theme: ["industrial"] },
  { id: "indfbx", dir: "assets/pipe dreams/_x", match: /\.fbx$/i, split: "whole", unit: "auto", theme: ["industrial"], textures: "sibling", skip: /SolarPanel/i },
  // ---- Level 0 office furniture
  { id: "office", dir: "assets/props", match: /\.glb$/i, split: "whole", unit: "auto", theme: ["office"], except: { "furniture_from_the_90s.glb": "nodes" } },
  // ---- the level kits (walls, pillars, trims, arches, pool edges, stairs)
  { id: "kit0", dir: "assets/TheBackroomsAndPoolrooms_FBX/FBX/The Backrooms", match: /\.fbx$/i, split: "whole", unit: "m", theme: ["backrooms", "structure"], textures: "kit0", dropVertexColor: true },
  { id: "kit1", dir: "assets/TheBackroomsAndPoolrooms_FBX/FBX/The Poolrooms", match: /\.fbx$/i, split: "whole", unit: "m", theme: ["poolrooms", "structure"], textures: "kit1" },
  // ---- the casino floor (already shrunk copies)
  { id: "casino", file: "client/public/assets/casino/props.glb", split: "nodes", unit: "auto", theme: ["casino"], textures: "casinoAtlas" },
  { id: "bar", dir: "client/public/assets/casino/bar", match: /\.glb$/i, split: "cluster", unit: "auto", theme: ["casino", "bar"], textures: "casinoAtlas", dropBlank: true, except: { "bottle.glb": "nodes", "glasses.glb": "nodes", "props.glb": "nodes", "bar_sink.glb": "whole", "cash_register.glb": "whole" } },
  { id: "casfix", files: ["client/public/assets/casino/atm.glb", "client/public/assets/casino/jukebox.glb", "client/public/assets/casino/kiosk.glb", "client/public/assets/casino/locker.glb", "client/public/assets/casino/poker7.glb", "client/public/assets/casino/chess.glb", "client/public/assets/casino/speaker.glb"], split: "whole", unit: "auto", theme: ["casino"] },
  // ---- the escape room's furniture
  { id: "escape", dir: "assets/casino/escape room/props", match: /\.glb$/i, split: "whole", unit: "auto", theme: ["house"], skip: /key\.glb|celling_lights/i, except: { "doors.glb": "nodes" } },
  // ---- THE INTAKE (scripts/props/intake.mjs): Josh's downloads, fixed and
  // filed under assets/kit/. `credit` rides into the catalogue.
  { id: "wooddoor", dir: "assets/kit/doors", match: /^wood-door-.*.glb$/i, split: "whole", unit: "m", theme: ["backrooms", "house"], credit: "5 Doors by Dima Zverev (Sketchfab Standard) — sketchfab.com/3d-models/5-doors-aca0112f669048508bc307d3dd6c01e3" },
  { id: "steeldoor", dir: "assets/kit/doors", match: /^steel-door-.*.glb$/i, split: "whole", unit: "m", theme: ["backrooms", "poolrooms", "industrial"], credit: "Poppy Playtime Chapter3 Doors Pack1 by STHModels (Sketchfab Standard) — sketchfab.com/3d-models/poppy-playtime-chapter3-doors-pack1-bf3fddc897c14af6a20fcdafd98cb7d7" },
  { id: "tube", files: ["assets/kit/lighting/fluorescent-batten.glb"], split: "whole", unit: "m", theme: ["backrooms", "industrial"], credit: "Flourescent Lighting by urbanmasque (CC-BY-4.0) — sketchfab.com/3d-models/flourescent-lighting-7973e7f1c10447deb73319c8390b2e9c" },
  { id: "lamps", files: ["assets/kit/lighting/hanging-lantern.glb", "assets/kit/lighting/led-wall-panel.glb", "assets/kit/lighting/bulkhead-lamp.glb", "assets/kit/lighting/bare-bulb.glb"], split: "whole", unit: "m", theme: ["backrooms", "poolrooms", "industrial"], credit: "Lighting Fixtures Set 1 Free by Mohit Akundi (Sketchfab Standard) — sketchfab.com/3d-models/lighting-fixtures-set-1-free-0807ac67c3424e178f9ac521e1f27724" },
  // ---- the September 2026 intake batch (scripts/props/intake.mjs recipes)
  { id: "sixties", files: ["assets/kit/office/sixties-office.glb"], split: "nodes", unit: "m", theme: ["office"], credit: "60's Office Props by SeanNicolas (CC-BY-NC-4.0) — sketchfab.com/3d-models/60s-office-props-dc00ea320cfa4aad90811080270672db" },
  { id: "reload", files: ["assets/kit/workshop/reloading-bench.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Ammo Reloading Workbench by HippoStance (CC-BY-4.0) — sketchfab.com/3d-models/ammo-reloading-workbench-c9a5d6603725459fa76924d3d4f61844" },
  { id: "bottles", files: ["assets/kit/bathroom/bottles.glb"], split: "nodes", unit: "m", theme: ["backrooms", "poolrooms", "house"], credit: "Bathroom Props (FREE) by Brandon Westlake (Sketchfab Standard) — sketchfab.com/3d-models/bathroom-props-free-1fde4ea2f28c4b1c87753cbc3cdb6421" },
  { id: "drill", files: ["assets/kit/workshop/pillar-drill.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Drill Press by CommonSpence (CC-BY-4.0) — sketchfab.com/3d-models/drill-press-b1191827a2ce4341869cc8d8a476bbcf" },
  { id: "polesub", files: ["assets/kit/electrical/pole-substation.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Electrical transformer substation by Labus (CC-BY-4.0) — sketchfab.com/3d-models/electrical-transformer-substation-4f72d11f91ce4cf09696aacb470e8dcd" },
  { id: "hpress", files: ["assets/kit/workshop/hydraulic-press.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Hydraulic Press by Scarecrow_original (CC-BY-4.0) — sketchfab.com/3d-models/hydraulic-press-0998c9054c3b4c7b9b1f6cf2f2b40d45" },
  { id: "locktier", files: ["assets/kit/storage/locker-tiers.glb"], split: "whole", unit: "m", theme: ["industrial", "backrooms"], credit: "Industrial - Locker by Anfossi Valentin (Sketchfab Standard) — sketchfab.com/3d-models/industrial-locker-1938d4d4c5bc440390159c7eb301c407" },
  { id: "condenser", files: ["assets/kit/electrical/condenser-unit.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Industrial Air Conditioner by HusarL (CC-BY-4.0) — sketchfab.com/3d-models/industrial-air-conditioner-82797367c2b94fb1981e556577a3c898" },
  { id: "risers", files: ["assets/kit/pipes/riser-pair.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Industrial Pipes by DudleyLong (CC-BY-4.0) — sketchfab.com/3d-models/industrial-pipes-79f64d09a3cd496fb4f1ae601f5dafac" },
  { id: "rack", files: ["assets/kit/storage/pallet-rack.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Industrial Storage Rack by siddharthkalbage (CC-BY-4.0) — sketchfab.com/3d-models/industrial-storage-rack-c21c9a687c3d48ad9e74f894c6d2791c" },
  { id: "steeltable", files: ["assets/kit/workshop/steel-frame-table.glb"], split: "whole", unit: "m", theme: ["industrial", "office"], credit: "Industrial Table by Elasta Kristya (CC-BY-4.0) — sketchfab.com/3d-models/industrial-table-5f94fb035fa74f43abda3ada8f0a719e" },
  { id: "worklight", files: ["assets/kit/lighting/tripod-work-light.glb"], split: "whole", unit: "m", theme: ["industrial", "backrooms"], credit: "Industrial Work Light by denis_cliofas (CC-BY-4.0) — sketchfab.com/3d-models/industrial-work-light-ff0abe17dc64498191bb41c905d00ab0" },
  { id: "lathe", files: ["assets/kit/workshop/engine-lathe.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "lathe by Oleg (CC-BY-4.0) — sketchfab.com/3d-models/lathe-cfaed4ba749a46f2baf4012bedd00b6d" },
  { id: "padxfmr", files: ["assets/kit/electrical/pad-transformer.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Local Service Transformer by Ross Armstrong Photography (CC-BY-4.0) — sketchfab.com/3d-models/local-service-transformer-98405e11b98f4839807f3ac954661f97" },
  { id: "bluelock", files: ["assets/kit/storage/blue-lockers.glb"], split: "nodes", unit: "m", theme: ["industrial", "backrooms"], credit: "Locker by neverfollow81 (CC-BY-4.0) — sketchfab.com/3d-models/locker-41f55ae53fca41c3b861cebe5244b5dd" },
  { id: "modbath", files: ["assets/kit/bathroom/modern-bathroom.glb"], split: "nodes", unit: "m", theme: ["poolrooms", "house"], credit: "Modern Bathroom Props & Sanitary Ware Pack by ROHIT3DMODELS (CC-BY-4.0) — sketchfab.com/3d-models/modern-bathroom-props-sanitary-ware-pack-e1ffc9ab2a58448eb309c8a844edf79f" },
  { id: "apocdoor", dir: "assets/kit/doors", match: /^office-door-.*\.glb$/i, split: "whole", unit: "m", theme: ["office", "backrooms"], credit: "Modular office building assets (Post Apoc) by Jordi Kruk (CC-BY-4.0) — sketchfab.com/3d-models/modular-office-building-assets-post-apoc-9bb7ab3024264325a579ff5058ad4293" },
  { id: "apocelev", files: ["assets/kit/office/elevator-doors.glb"], split: "whole", unit: "m", theme: ["office", "backrooms"], credit: "Modular office building assets (Post Apoc) by Jordi Kruk (CC-BY-4.0) — sketchfab.com/3d-models/modular-office-building-assets-post-apoc-9bb7ab3024264325a579ff5058ad4293" },
  { id: "apocoffice", files: ["assets/kit/office/post-apoc-office.glb", "assets/kit/office/post-apoc-glassware.glb"], split: "nodes", unit: "m", theme: ["office"], credit: "Modular office Interior assets (Post Apoc) by Jordi Kruk (CC-BY-4.0) — sketchfab.com/3d-models/modular-office-interior-assets-post-apoc-5150e7fcc98b44e1bc087e9ba206135a" },
  { id: "officepack", files: ["assets/kit/office/office-pack.glb", "assets/kit/office/office-pack-chairs.glb"], split: "nodes", unit: "m", theme: ["office"], credit: "Office Prop Pack - Game Asset by AspectStudios (CC-BY-4.0) — sketchfab.com/3d-models/office-prop-pack-game-asset-5bdaf26299254dcd8c9ba9d31a816c7f" },
  { id: "streetcab", files: ["assets/kit/electrical/street-cabinet.glb"], split: "whole", unit: "m", theme: ["industrial", "backrooms"], credit: "Old Soviet Transformer Low-Poly by MrUnity (CC-BY-4.0) — sketchfab.com/3d-models/old-soviet-transformer-low-poly-13124cf4ef264a2eabe79b92679d6d49" },
  { id: "pipeshop", files: ["assets/kit/pipes/pipe-workshop.glb"], split: "nodes", unit: "m", theme: ["industrial"], credit: "Pipe workshop Industrial piping by adventurer (CC-BY-4.0) — sketchfab.com/3d-models/pipe-workshop-industrial-piping-6241de863511445684a917b5f9572565" },
  { id: "toilet", files: ["assets/kit/bathroom/toilet.glb"], split: "whole", unit: "m", theme: ["backrooms", "poolrooms", "house"], credit: "Toilet by ecjhr0awipso (Sketchfab Standard) — sketchfab.com/3d-models/toilet-f4d2db1700f64d04be3e090716911475" },
  { id: "ladder", files: ["assets/kit/hardware/wall-ladder.glb"], split: "whole", unit: "m", theme: ["industrial", "poolrooms"], credit: "Vintage Industrial Ladder by Samuel Francis Johnson (Oneironauticus) (CC-BY-4.0) — sketchfab.com/3d-models/vintage-industrial-ladder-55bf8ac6853a48fdab650a676f0c8cba" },
  { id: "switches", files: ["assets/kit/electrical/rotary-switches.glb"], split: "nodes", unit: "m", theme: ["industrial", "backrooms"], credit: "Vintage Industrial Light Switches Type A by Mad_Lobster_Workshop (© Mad_Lobster_Workshop, free Sketchfab download) — sketchfab.com/3d-models/vintage-industrial-light-switches-type-a-731c91e0943546ecab6454aadd381f98" },
  // ---- Level 4, the Abandoned Office
  { id: "ninetiesoffice", files: ["assets/kit/office/nineties-office.glb"], split: "nodes", unit: "m", theme: ["office"], credit: "90s Retro Office Pack by MadeByYeshe (CC-BY-4.0) — sketchfab.com/3d-models/90s-retro-office-pack-dadca97505214b9481d35e22c48e18df" },
  { id: "copier", files: ["assets/kit/office/copy-machine.glb"], split: "whole", unit: "m", theme: ["office"], credit: "Copy Machine by thethieme (CC-BY-4.0) — sketchfab.com/3d-models/copy-machine-f26853d4d55c4a86af33788fb13653c9" },
  { id: "vending", files: ["assets/kit/office/vending-machine.glb"], split: "whole", unit: "m", theme: ["office", "backrooms"], credit: "Vending Machine by RackRibs (CC-BY-4.0) — sketchfab.com/3d-models/vending-machine-d62a741a00e04d84bc45b6ccb039cf8a" },
  { id: "lanyard", files: ["assets/kit/office/lanyard-id.glb"], split: "whole", unit: "m", theme: ["office"], credit: "ID Card Model by Johana-PS (CC-BY-4.0) — sketchfab.com/3d-models/id-card-model-5addf1256a404b7a82c380bb2d22f186" },
  { id: "workbench", files:["assets/kit/workshop/workbench.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Workbench by JJ Chalupnik (CC-BY-4.0) — sketchfab.com/3d-models/workbench-9634d6a81a494925a909512c8048f446" },
  { id: "misc", files: ["assets/casino/escape room/alarm_light.glb", "assets/casino/props/low_poly_sofa.glb", "assets/casino/ticket machine.glb"], split: "whole", unit: "auto", theme: ["house"] },
  // ---- LEVEL 3, THE ELECTRICAL STATION (Oct 2026) — fetched by
  // scripts/assets/fetch.mjs (scripts/assets/level3.json), fixed by intake.mjs
  { id: "powerbox", files: ["assets/kit/electrical/power-box.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Power Box 01 by Rico Cilliers, Yann Kervran (CC0) — polyhaven.com/a/power_box_01" },
  { id: "utilbox", files: ["assets/kit/electrical/utility-box.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Utility Box 01 by James Ray Cock (CC0) — polyhaven.com/a/utility_box_01" },
  { id: "utilbox2", files: ["assets/kit/electrical/utility-box-wide.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Utility Box 02 by James Ray Cock (CC0) — polyhaven.com/a/utility_box_02" },
  { id: "cables", files: ["assets/kit/electrical/electric-cables.glb"], split: "nodes", unit: "m", theme: ["industrial","station"], credit: "Modular Electric Cables by Kuutti Siitonen (CC0) — polyhaven.com/a/modular_electric_cables" },
  { id: "cagedlamp", files: ["assets/kit/lighting/caged-hanging-light.glb"], split: "whole", unit: "m", theme: ["industrial","station","backrooms"], credit: "Caged Hanging Light by Ulan Cabanilla (CC0) — polyhaven.com/a/caged_hanging_light" },
  { id: "fluoros", files: ["assets/kit/lighting/mounted-fluorescents.glb"], split: "nodes", unit: "m", theme: ["industrial","station","backrooms"], credit: "Mounted Fluorescent Lights by Ulan Cabanilla (CC0) — polyhaven.com/a/mounted_fluorescent_lights" },
  { id: "shutter", files: ["assets/kit/doors/roller-shutter.glb", "assets/kit/doors/roller-shutter-graffiti.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Rollershutter Door by MP (CC0) — polyhaven.com/a/rollershutter_door" },
  { id: "wetsign", files: ["assets/kit/signs/wet-floor-sign.glb"], split: "whole", unit: "m", theme: ["industrial","station","backrooms","poolrooms"], credit: "Wet Floor Sign 01 by Fran Calvente (CC0) — polyhaven.com/a/WetFloorSign_01" },
  { id: "wornrack", files: ["assets/kit/storage/worn-metal-rack.glb"], split: "whole", unit: "m", theme: ["industrial"], credit: "Worn Metal Rack by Luca B (CC0) — polyhaven.com/a/worn_metal_rack" },
  { id: "firealarm", files: ["assets/kit/electrical/fire-alarm.glb"], split: "whole", unit: "m", theme: ["industrial","station","office"], credit: "Fire Alarm by Slinc (CC0) — polyhaven.com/a/fire_alarm" },
  { id: "switchgear", files: ["assets/kit/electrical/switchgear.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Industrial Switchgear by MADMOVIESINC (CC-BY-4.0) — sketchfab.com/3d-models/industrial-switchgear-9ad62dc3bd694bf880be78e43530008e" },
  { id: "elecbox", files: ["assets/kit/electrical/electrical-box.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Industrial Electrical Box by Krystofeles (CC-BY-4.0) — sketchfab.com/3d-models/industrial-electrical-box-de13c96dad014bf098df03030f314fee" },
  { id: "stxfmr", files: ["assets/kit/electrical/station-transformer.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Electrical Transformer by abass20 (CC-BY-4.0) — sketchfab.com/3d-models/electrical-transformer-615fe4b367314a72b7dffb8ec791f575" },
  { id: "dieselgen", files: ["assets/kit/electrical/diesel-generator.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "Disel generator by Oleksandr Babych (CC-BY-4.0) — sketchfab.com/3d-models/disel-generator-423cfdbd612c486aada7bb1bc44695a9" },
  { id: "cabletray", files: ["assets/kit/electrical/cable-tray.glb"], split: "whole", unit: "m", theme: ["industrial","station"], credit: "CABLE TRAY by eventdesignws (CC-BY-4.0) — sketchfab.com/3d-models/cable-tray-8ba2c3ac7f5f41d588908750fdb24130" },
  // the hotel pack's doors (intake.mjs "Hotel Asset Pack.glb") — for the
  // hotel level to come. Its source wasn't recorded; textures are ambientCG.
  { id: "hoteldoor", dir: "assets/kit/hotel", match: /^hotel-.*\.glb$/i, split: "whole", unit: "m", theme: ["hotel"], credit: "Hotel Asset Pack (author not recorded; textures by ambientCG, CC0)" },
  // ---- LEVEL 5, THE TERROR HOTEL (Oct 2026) — fetched by
  // scripts/assets/fetch.mjs (scripts/assets/level5.json), fixed by intake.mjs
  { id: "crystalchand", files: ["assets/kit/hotel/crystal-chandelier.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Lustre Luxe by Apophisie (CC-BY-4.0) — sketchfab.com/3d-models/lustre-luxe-29392dd175444772881f62436af56397" },
  { id: "decochand", files: ["assets/kit/hotel/deco-chandelier.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Art Deco Chandelier by Rixx (CC-BY-4.0) — sketchfab.com/3d-models/art-deco-chandelier-2dec4b96bb7b4e4595c69ca001c58afa" },
  { id: "decosconce", files: ["assets/kit/hotel/deco-sconce.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Art Deco Prop House Interior Sconce by Rafasilart (CC-BY-4.0) — sketchfab.com/3d-models/art-deco-prop-house-interior-sconce-40517cb6d42a4316a655141f9f6d5757" },
  { id: "candlesconce", files: ["assets/kit/hotel/candle-sconce.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Wall candle by Valo Niskanen (CC-BY-4.0) — sketchfab.com/3d-models/wall-candle-593098a9230d4438a40688957784237d" },
  { id: "decobar", files: ["assets/kit/hotel/reception-desk.glb", "assets/kit/hotel/deco-back-bar.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Art Deco Bar by Rixx (CC-BY-4.0) — sketchfab.com/3d-models/art-deco-bar-385733562f074903ba593ff29359fd4d" },
  { id: "deskbell", files: ["assets/kit/hotel/desk-bell.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Table Bell by gla_bot (CC-BY-4.0) — sketchfab.com/3d-models/table-bell-77f2ea17b4c84fe1a8d2aec02caa9de3" },
  { id: "velvetsofa", files: ["assets/kit/hotel/velvet-sofa.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Luxurious royal sofa with pillows, two seats. by klava88 (CC-BY-4.0) — sketchfab.com/3d-models/luxurious-royal-sofa-with-pillows-two-seats-a54b2ac109d146fb80cfc37c9da26cfb" },
  { id: "chesterfield", files: ["assets/kit/hotel/chesterfield.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "chesterfield sofa by praveensalo (CC-BY-4.0) — sketchfab.com/3d-models/chesterfield-sofa-3dff6a5ff7d94a86b083a72f14ab078d" },
  { id: "velvetchair", files: ["assets/kit/hotel/velvet-armchair.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Classic Victorian Wooden Armchair – Red Velvet by khalandarthameem97 (CC-BY-4.0) — sketchfab.com/3d-models/classic-victorian-wooden-armchair-red-velvet-045a190f982b40f28b62eb7f503f3948" },
  { id: "sidetable", files: ["assets/kit/hotel/side-table.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Victorian side table by Abdullah Mohammed (CC-BY-4.0) — sketchfab.com/3d-models/victorian-side-table-12e059dd5bf74029a916147e3331e72d" },
  { id: "decolamp", files: ["assets/kit/hotel/deco-table-lamp.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Old Lamp Art-deco by Léonard_Doye / Leoskateman (CC-BY-4.0) — sketchfab.com/3d-models/old-lamp-art-deco-994e7d5249904af28f93b713d54a385d" },
  { id: "palm", files: ["assets/kit/hotel/potted-palm.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "[FREE] Dyspis Lutescens - Potted Palm by AllQuad (CC-BY-4.0) — sketchfab.com/3d-models/free-dyspis-lutescens-potted-palm-92f75abd656049608248cf76a8c88136" },
  { id: "decobed", files: ["assets/kit/hotel/deco-bed.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Hotel Bed Art Deco 20s by Aida Pozo Magraso (CC-BY-4.0) — sketchfab.com/3d-models/hotel-bed-art-deco-20s-926dac2bce56437ea5d433b2c6604fc9" },
  { id: "wardrobe", files: ["assets/kit/hotel/antique-wardrobe.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Antique Wardrobe by Darren McNerney 3D (CC-BY-4.0) — sketchfab.com/3d-models/antique-wardrobe-d9892e64d3194bc3843be84ecf589b1c" },
  { id: "dressing", files: ["assets/kit/hotel/dressing-table.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Victorian Dressing Table by Jamie McFarlane (CC-BY-4.0) — sketchfab.com/3d-models/victorian-dressing-table-b11f7fc61a3b48e784aed7c8afa8115c" },
  { id: "picframe", files: ["assets/kit/hotel/picture-frame.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Ornate Picture Frame by WENGA (CC-BY-4.0) — sketchfab.com/3d-models/ornate-picture-frame-165ad70b97694c57b8f0fe90e583ff91" },
  { id: "mahjong", files: ["assets/kit/hotel/mahjong-set.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Japanese mahjong tiles by shosha (CC-BY-4.0) — sketchfab.com/3d-models/japanese-mahjong-tiles-80cee44ddba640d4bf77ccc2c99d2e7e" },
  { id: "trolley", files: ["assets/kit/hotel/luggage-trolley.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Gold_hotel_luggage_trolley_fallout_miami by enxoh (CC-BY-4.0) — sketchfab.com/3d-models/gold-hotel-luggage-trolley-fallout-miami-2fb449392d834f61929a76fe935c759c" },
  { id: "boiler", files: ["assets/kit/hotel/boiler.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Babcock_Wilcox_Boiler by Mark Rose (CC-BY-4.0) — sketchfab.com/3d-models/babcock-wilcox-boiler-e3cc45a7ea754154ba29cbb71114d898" },
  { id: "furnace", files: ["assets/kit/hotel/cast-iron-furnace.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Cast Iron Furnace by IvanBro42 (Ivan Kapustin) (CC-BY-4.0) — sketchfab.com/3d-models/cast-iron-furnace-74ba60b7bddb440ab182dea15b33c722" },
  { id: "safetyvalve", files: ["assets/kit/hotel/safety-valve.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Spring Loaded safety valve by ravindra.mohan09 (CC-BY-4.0) — sketchfab.com/3d-models/spring-loaded-safety-valve-5ad84f8545964e04ab5dd94042731a5e" },
  { id: "radiator", files: ["assets/kit/hotel/radiator.glb"], split: "whole", unit: "m", theme: ["hotel"], credit: "Vintage Cast Iron Radiator 3D Model by Ati (CC-BY-4.0) — sketchfab.com/3d-models/vintage-cast-iron-radiator-3d-model-7d4d8077bc524dbeb11a28ca09badf57" },
  // LEVEL 6, LIGHTS OUT (scripts/assets/level6.json, approved 2026-10-14)
  { id: "debris", files: ["assets/kit/debris/broken-wall-slab.glb", "assets/kit/debris/broken-wall-corner.glb", "assets/kit/debris/broken-pillar-tall.glb", "assets/kit/debris/broken-pillar.glb", "assets/kit/debris/broken-pillar-stump.glb", "assets/kit/debris/concrete-shard.glb"], split: "whole", unit: "m", theme: ["ruin"], credit: "Broken concrete debris - low poly by kemsui (CC-BY-4.0) — sketchfab.com/3d-models/broken-concrete-debris-low-poly-284ab0cef4fd4e0dbc963da2e52341b0" },
  { id: "rubblepile", files: ["assets/kit/debris/rubble-pile.glb"], split: "whole", unit: "m", theme: ["ruin"], credit: "Rubble Pile - Photoscan (Optimized) by GameDev Nick (CC-BY-4.0) — sketchfab.com/3d-models/rubble-pile-photoscan-optimized-5986d1487d9443b883d67b121c2c903c" },
  { id: "rustyshelf", files: ["assets/kit/storage/rusty-shelving.glb"], split: "whole", unit: "m", theme: ["industrial", "ruin"], credit: "Old Rusty Shelving Unit by jimbogies (CC-BY-4.0) — sketchfab.com/3d-models/old-rusty-shelving-unit-3ce07d0518154759841236045efafd72" },
];
