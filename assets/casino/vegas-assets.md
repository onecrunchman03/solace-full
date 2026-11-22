# Classic Vegas floor: the asset intake (Oct 2026)

Fetched for the "Classic Vegas" redesign of the 3D casino floor: red and gold,
loud carpet, marble aisles, gold rails, banks of lit slots. Every model is
CC-BY 4.0 (credits in `client/public/assets/casino/vegas/CREDITS.txt`, which
must ship with the files). Every texture is CC0. Nothing here is wired into the
game yet.

- **Game-ready GLBs:** `client/public/assets/casino/vegas/<id>.glb`
- **Textures:** `client/public/assets/casino/vegas/tex/<stem>-{color,normal,rough}.jpg`
- **Measured manifests:** `assets/casino/manifests/vegas-<id>.json`. These hold the
  size, triangles, draw calls, every material's alpha mode, double-sidedness and
  textures, the credit, and the scale applied to the source.
- **Untouched downloads (gitignored):** `assets/downloads/sketchfab/<uid>/`,
  `assets/downloads/ambientcg/<id>_2K/`, `assets/downloads/polyhaven/<id>_2k/`,
  each with a `credit.json`.
- **Re-run:** `node scripts/casino/vegas-intake.mjs [id ...]` rebuilds GLBs and
  manifests from the downloads. Its recipe table is the record of every scale,
  yaw, tint and material fix. `node scripts/casino/vegas-carpet.mjs` rebuilds
  the carpet pattern.

## What the intake did to every model

1. Scaled each model to a real-world size (the "size" column below). Stood it on y = 0, centred it in x/z, and turned it so **the front faces +Z**.
2. Baked every node transform into the vertices and merged primitives per material, which gives fewer draw calls in a bank of 12.
3. Set **`metallicFactor` to 0 on every material**, following the prop-kit rule. Several shipped at 1 (chrome cabinets, gold posts, bronze trim) and would render black without an environment map. Chrome and gold now read as light grey and yellow paint. A sheen has to come from lighting or roughness, not from metalness.
4. **No two-pass transparency.** Every remaining `BLEND` material is single-sided now. Two cut-outs (reel windows, the JACKPOT topper) became `MASK` (cutoff 0.5), so they never sort. The only `BLEND` left is `cashier-counter`'s window glass, a flat translucent tint that is single-sided.
5. Re-encoded the textures to at most 1024px with `scripts/shrink-glb.mjs`. Only PNGs that need alpha are kept as PNG.

Opaque materials keep the source's `doubleSided: true`. Several of these models are built from single planes, and that setting is harmless when the material is opaque.

## Kept: models

| id | what it is | size (x × y × z, m) | tris | draws | file | licence / author / link |
|---|---|---|---|---|---|---|
| `slot-vegas-star` | Upright 3-reel slot with a chrome cabinet and a candle light on top. **Separate materials** for the topper glass (`Mat_8`), the paytable glass (`Mat_9`), the reel strip (`Mat_7`) and the reel-window overlay (`Mat_10`, MASK), so each can be made emissive | 0.94 × 1.75 × 0.91 | 2,608 | 9 | 0.91 MB | CC-BY 4.0, nermin, [link](https://sketchfab.com/3d-models/slot-machine-b853ed93538a4405949800ab501606d8) |
| `slot-bulb-classic` | Red classic slot with a chasing-bulb arched topper and a side lever. **One material**, with the bulbs painted on. To make it glow, add an emissive map, e.g. its own base colour with the ground masked out | 1.05 × 1.85 × 0.88 | 10,000 | 1 | 1.27 MB | CC-BY 4.0, kritamb (credited as kvasium in the file), [link](https://sketchfab.com/3d-models/casion-slot-machine-49fc3271878e4e148fed325439b53a1a) |
| `slot-jackpot` | Modern upright slot with a neon JACKPOT topper (`phong2`, MASK) and reel art (`front1`). Ships with an **emissive map** on the purple side panels (`phong5`) | 0.91 × 1.83 × 0.94 | 4,440 | 6 | 0.69 MB | CC-BY 4.0, deepakyhr, [link](https://sketchfab.com/3d-models/slot-machine-aff86b4e07fe4a22bc1b6bc3fa91d662) |
| `slot-lucky-spin` | Rounded red "Lucky Spin" upright, one PBR material. The source was 1.30 m tall and is scaled up to 1.6 m | 0.82 × 1.60 × 0.68 | 1,968 | 1 | 0.78 MB | CC-BY 4.0, morrrtu1o, [link](https://sketchfab.com/3d-models/slot-machine-d58181162e154af2ab73e8667db2e81d) |
| `slot-stool` | Chrome pedestal stool with a red cushion and a foot ring: the classic slot-bank stool | 0.51 × 0.80 × 0.50 | 746 | 1 | 0.14 MB | CC-BY 4.0, beastybevan, [link](https://sketchfab.com/3d-models/bar-stool-f795dda3a17948919e238f05778cd205) |
| `stanchion-brass-run` | Three brass ball-top stanchions with two red velvet ropes, all one mesh. The nicer rope set | 3.09 × 1.00 × 0.34 | 10,000 | 1 | 1.09 MB | CC-BY 4.0, danlovesmothers (dodan54), [link](https://sketchfab.com/3d-models/red-velvet-rope-barriers-809c332e18f54d4784a94456fa1cecc8) |
| `stanchion-gold-pair` | Two thin gold posts and one red rope. Cheap enough to repeat; the texture is tinted deeper gold | 1.96 × 1.09 × 0.25 | 1,948 | 1 | 0.64 MB | CC-BY 4.0, Rylae Shylna, [link](https://sketchfab.com/3d-models/grand-entrance-a-pole-with-a-sign-gold-velour-7bb310edac154c5b9ee9c3d6e41f13e2) |
| `stanchion-sign-stand` | Gold post holding a framed sign card. The card reads "Your Image Here", so retexture it | 0.37 × 1.31 × 0.25 | 648 | 1 | 0.58 MB | same model as `stanchion-gold-pair` |
| `column-marble` | Cream marble column with plinth and capital | 0.81 × 4.48 × 0.81 | 952 | 1 | 0.93 MB | CC-BY 4.0, Ergin ERYILDIR, [link](https://sketchfab.com/3d-models/roman-marble-column-c17dfe2926ce48a6bbaca77dcc3a0d12) |
| `pilaster-fluted-gold` | Fluted wall pilaster with base and capital, flat-backed and 9.5 cm deep. The source is untextured white; it is tinted gold (0.80, 0.60, 0.22) at roughness 0.38. The 11.5k tris are mostly fluting | 0.36 × 2.97 × 0.10 | 11,504 | 1 | 0.25 MB | CC-BY 4.0, EViRO, [link](https://sketchfab.com/3d-models/eviro-120002-f54b9670ebae440b87c8f4db0fd19816) |
| `cashier-counter` | L-shaped teller counter: wood base, stone cap, and bronze-framed glass windows (`WindowGlass`, BLEND, single-sided). This is the cashier cage frontage. Retexture the grey stone cap with `marble-cream` or `marble-black-gold` | 6.87 × 2.30 × 2.63 | 18,632 | 4 | 0.75 MB | CC-BY 4.0, abdillaamy, [link](https://sketchfab.com/3d-models/bank-teller-cubical-237f5748963644779985f550257fd8a6) |
| `cashier-gate` | Wrought-iron and wood double gate with bronze trim, the cage's side door. Turned 90° so it faces +Z | 2.00 × 2.30 × 0.10 | 15,674 | 8 | 0.71 MB | CC-BY 4.0, abdillaamy, [link](https://sketchfab.com/3d-models/teller-cubical-gate-goes-with-teller-cubical-da0862fd3dc246269c591c745610c686) |
| `chips-dice-set` | Loose low-poly chips in six colours, two chip stacks and dice, laid in a 30 cm row at true size. Untextured, flat colours | 0.04 × 0.02 × 0.30 | 12,280 | 7 | 0.56 MB | CC-BY 4.0, lupas (ivan.anton.albarracin), [link](https://sketchfab.com/3d-models/simple-low-poly-casino-chips-and-dices-f7ac7a2de860408596d989c213ea8ce6) |
| `chip-stack` | One tall photo-textured stack of mixed chips, 4 cm across | 0.04 × 0.03 × 0.04 | 5,154 | 1 | 0.20 MB | CC-BY 4.0, Casing, [link](https://sketchfab.com/3d-models/poker-chips-cfff531b48e24073bc5f5c917b0d3519) |
| `dice-red-pair` | Two red casino dice, 19 mm | 0.05 × 0.02 × 0.03 | 3,988 | 2 | 0.20 MB | CC-BY 4.0, Yanez Designs, [link](https://sketchfab.com/3d-models/red-dice-995ac5d09d944d31ac587f0f90e36ca2) |
| `neon-casino` | Flat, pixel-style neon "CASINO" panel with an emissive texture. Turned 180° so it reads from +Z. A wall sign with its origin at bottom-centre | 2.00 × 1.51 × 0.04 | 468 | 1 | 0.04 MB | CC-BY 4.0, alina_dreiman, [link](https://sketchfab.com/3d-models/a-neon-sign-casino-2043019fd0ec4834a489b3d9d549980f) |
| `neon-bar` | Neon-tube "BAR" sign in a green rounded frame. The source is untextured; each material's colour is copied to its emissive so the tubes glow | 1.00 × 0.52 × 0.02 | 14,252 | 2 | 0.27 MB | CC-BY 4.0, Jimmy Johansson, [link](https://sketchfab.com/3d-models/neon-bar-sign-52d50a3b04ae414cb11b16df0d779054) |

The GLBs total about 10 MB.

**Performance notes for the build:**
- A bank of 12 `slot-vegas-star` is 108 draw calls if each machine is cloned naively. Instance them (one `InstancedMesh` per material) or merge a whole bank. `slot-bulb-classic` and `slot-lucky-spin` are one draw each.
- The 10k-tri models (the bulb slot, the brass stanchion run, the neon BAR) are fine in ones and twos. If one of them stands in a row of 12, decimate it first.
- None of these add lights. Under the frozen-light-count rule, a topper's glow comes from emissive materials (plus bloom if the post chain gets one), never from a light per machine.

## Kept: textures

All are CC0. Colour maps are 2048² JPGs. Normal maps are OpenGL convention (what three.js reads); the noisy fabric normals and roughness maps are 1024². Roughness maps are greyscale. There are no metalness maps (metallic 0). The `tex/` folder totals about 12 MB.

| stem | what it is | source | maps (size) |
|---|---|---|---|
| `carpet-vegas-red` | **The casino carpet.** Deep red ground, a gold diamond lattice, teal/purple/blue medallions and rosettes, gold stars and confetti dots. Tiles seamlessly; one repeat should cover about 2-3 m. | **Original pattern generated for Solace** (`scripts/casino/vegas-carpet.mjs`), with pile detail from ambientCG Carpet013 | color 2048 (0.95 MB), normal 1024 (1.1 MB), rough 2048 (0.49 MB) |
| `carpet-vegas-midnight` | The same carpet on a midnight-blue ground, with red rosettes. Uses `carpet-vegas-red`'s normal and rough maps | as above | color 2048 (0.89 MB) |
| `marble-cream` | Cream marble with tan/gold veins, for aisles, counter caps and plinths | ambientCG Marble014 | color/normal/rough 2048 (0.71 / 0.03 / 0.44 MB) |
| `marble-black-gold` | Dark marble with warm brown-gold veins | ambientCG Marble006 | 2048 (0.92 / 0.03 / 0.38 MB) |
| `marble-black` | Black marble with white veins (alternative dark) | ambientCG Marble016 | 2048 (0.80 / 0.05 / 0.15 MB) |
| `gold-polished` | Polished gold | ambientCG Metal048A | 2048 (0.09 / 0.07 / 0.03 MB) |
| `gold-brushed` | Brushed gold | ambientCG Metal048B | 2048 (0.17 / 0.05 / 0.12 MB) |
| `velvet-red` | Red velour velvet, for banquettes, ropes and the stage curtain | Poly Haven velour_velvet | color 2048 (0.61 MB), normal/rough 1024 (0.25 / 0.35 MB) |
| `jacquard-red` | Red quatrefoil jacquard, for upholstered wall panels and booth backs | Poly Haven quatrefoil_jacquard_fabric | color 2048 (0.25 MB), normal/rough 1024 (0.39 / 0.29 MB) |
| `wood-lacquer-cherry` | Dark lacquered cherry, for table rails and the bar front | Poly Haven lacquered_cherry_wood | 2048 (0.42 / 0.07 / 0.54 MB) |
| `wood-dark` | Dark red-brown wood grain, the alternative | Poly Haven dark_wood | 2048 (0.60 / 0.42 / 0.52 MB) |

The gold colour maps are metal albedo, which is pale. With metallic forced to 0 they read as pale yellow paint. For a rich gold, multiply the colour by about (1.0, 0.8, 0.5) (the factor `stanchion-gold-pair` uses), keep roughness low, and let the lighting provide the highlight.

## Already in the repo, and good for this

- **Red velvet seating** in the backrooms prop kit (`client/public/assets/propkit/`). These are meshopt-compressed `.gltf`, so the hall's loader needs the meshopt decoder.
  - `velvet-armchair`: Victorian carved wood, red velvet, 0.82 × 1.05 × 0.81 m
  - `velvet-sofa`: matching, 1.75 m
  - `chesterfield-sofa`: black, 1.66 m
  - `bar-stool-cushion--1..4`: wood legs, red cushion, 0.75 m
  - `casino-stool--1..4`
  - **Verdict:** the velvet armchair and sofa suit a high-limit lounge or VIP corner. For the slot banks, the new `slot-stool` (chrome pedestal, red cushion) is the right shape.
- **Crystal chandelier:** `propkit/crystal-chandelier` ("Lustre Luxe") and `deco-chandelier`, from the hotel intake. Not re-fetched.

## Rejected

| candidate | why |
|---|---|
| Slot-machine (nermin), **second machine** (`slot_machine2`) | Its topper and glass art is a "JURASSIC PARK" knock-off. Trademarked branding has no business in the hall, whatever the model's licence says. Only the generic "Vegas Star" machine from that file is kept. |
| Vintage Slot Machine (doomsentinel) | A 1930s countertop one-armer, not a Vegas upright. 34 MB of textures. |
| Stylized Jackpot Slot Machine (ozcanburak8) | A toy/cartoon style that clashes with the hall. |
| Slot Machine (carlin.chu), (warrenblyth "cheap fast"), (davidgersch, 40k tris) | Neon-reel abstract / untextured blockout / 40k tris and cartoony. |
| Slot Machine (jacknelsonnsb, "Cicada") | Downloaded and inspected. A plain black box with flat art, inferior to the four kept, and ships at 0.32 m (a tenth of size). |
| Pillar Slots, Future Slot Machine, 190k+ tri slots | Wrong style or far too heavy. |
| Corinthian Column (Nick Havas) | Downloaded. A dark, grimy ruin with a two-sided BLEND capital; wrong look. |
| Crown & Cornice Moldings (Hivebody) | Downloaded. A demo scene of boxes with only a sample corner of molding, not a usable trim run. |
| "Craps-table" (mobileEY) | Downloaded. **Mislabelled**: it is a flat UI notification card ("Brad Pitt… interested in the craps tables"), not a table. |
| Classic Casino Craps Dice (Max Keeley) | Both materials are double-sided BLEND (translucent dice), so two-pass transparency. The red dice pair covers it. |
| Welcome to Las Vegas inspired sign (Amine) | Downloaded. A 5 m roadside sign on bright blue legs; wrong for an interior. |
| Velvet Rope and Metal Poles, VIP Rope Barrier | Silver poles, 25k tris, ~15-20 MB textures. The brass run is better and lighter. |
| Japan Casino Sign, Cocktails Neon (30k tris, 13.5 MB) | Off-theme / too heavy for what the BAR sign already covers. |

## Could not find (build these procedurally)

- **A craps table.** Nothing usable on Sketchfab under CC0 or CC-BY (searched craps, dice table, gambling table). The only hit was the mislabelled card. Build one from a long rounded-rectangle tub: `wood-lacquer-cherry` rail, felt floor with the layout as a texture, mirrored diamond backwall, and the `dice-red-pair` / `chips-dice-set` dressing.
- **A cashier cage** as one piece. `cashier-counter` plus `cashier-gate` make the frontage and door. The back wall and a gold/brass grille over the windows would be procedural.
- **A slot carousel / round bank, or a bank-end sign.** Nothing exists. Ring 6-8 cabinets around a drum and top it with a procedural round marquee (an emissive band of the casino sign).
- **A chip rack and a card shoe.** None found (searched chip rack, chip tray, card shoe, dealer shoe). Both are simple boxes and are better modelled in place.
- **Gold ceiling and wall trim.** Every ornate molding on Sketchfab is a 100k-3M tri scan. Extrude a profile along the wall line and use `gold-polished`.
- **A marquee light bulb.** Downloadable bulbs (1-11k tris each) are wrong for marquees that need hundreds. Use a procedural emissive sphere on a short cylinder socket, instanced. `propkit/bare-bulb` exists for one-off hanging bulbs.
- **A real casino carpet texture.** No CC0 source has the patterned kind, only plain or geometric office carpet. Hence the generated pattern above. The closest found textures were ambientCG Carpet013 (plain red pile) and Poly Haven Quatrefoil Jacquard (red fabric), and both are used.

## Licence notes

- Every model is CC-BY 4.0. `CREDITS.txt` lists title, author and link, and states that the models were modified. It has to stay beside the files, and an in-game credits screen should carry it too.
- Slot art: "Vegas Star", "Classic 7 Fruits", "Lucky Spin" and "Velvetinas"-style toppers are generic as far as could be checked. The Jurassic Park machine was dropped for exactly this reason. **Retexturing the topper glass with Solace's own art** (the Wheel, the death wedge, Sterling) would remove any doubt and make the floor ours. `slot-vegas-star` makes that easy because its topper and paytable are their own materials.
- The carpet pattern is original work; its pile detail is CC0.
