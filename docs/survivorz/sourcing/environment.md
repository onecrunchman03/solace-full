# Sourcing: the facility's environment kits (2026-10-20, research only — nothing bought or downloaded)

Fab listings were read through Fab's public listing data; prices are list, in USD, on 2026-10-20 (several were ~50% off that week).

## Licences — what decides the shortlist
- **Fab Standard** allows use "not limited to Unreal Engine" and explicitly lets you distribute "rendered video files (e.g., broadcast or streamed video…)". Our show is covered. Personal tier (buyers under $100k/yr) is enough for Josh.
- **The blocker on Fab is the FORMAT, not the licence.** Most realistic lab kits ship only as Unreal files (.uasset). Exporting them needs Unreal installed, and the licence forbids "translate … or derive" from the content, so that's a grey area. Those kits are excluded here.
- **Unity Asset Store**: not restricted to Unity per Unity's support page, but the EULA says "games and interactive media" and downloads go through the Unity editor. A grey area.
- **TurboSquid Standard**: broadcast and video fine; public WebGL outside Unity/Unreal needs case-by-case approval. No AI use.
- **CGTrader Royalty Free**: commercial OK if end users can't extract the files (from a quoted clause; the official page wasn't readable).
- **Kitbash3D**: commercial use in "films, games"; no redistribution.
- **For all of them:** the render page stays private (stream PC + admin Watch). Served on the public site, every model would be downloadable, which is redistribution.

## Candidates (FBX/GLB available)
| Pack | Price | Covers | Notes |
|---|---|---|---|
| **Secret Lab**, KitBash3D ([link](https://kitbash3d.com/products/secret-lab)) | $95 | clean-lab hero equipment: fume hoods, consoles, servers, cryo and vacuum chambers, operating tables, x-ray, gurneys, IV stands; a lead safety door, an airlock, a quarantine tent | Cinematic quality, 194 models, 4.8M polys, 44 PBR materials. Needs decimating for real time; leans sci-fi; props, not room architecture. |
| **Naked Singularity — "Virus Laboratory" props, sold singly** (free [wall/ceiling/floor module](https://www.fab.com/listings/0e12b2ce-1c5b-40fa-99eb-29ac928b723b), [lab door](https://www.fab.com/listings/2298a577-0e34-4533-92b3-92d9b4a1fb26), [ceiling HVAC](https://www.fab.com/listings/388896be-2c2e-477f-a7ac-5cbca7dde203), [microscope](https://www.fab.com/listings/28815fc6-5816-4f7f-ba3f-28c13abe1e79), autoclave, incubator, centrifuges, fridge, oven, balance, reagents, cart, signs) | free–$11.99 each (~$104 for all 13 paid) | the most realistic clean-lab equipment found in FBX | 4K PBR, real scale, doors and microscope split for animation. The full room kit is Unreal-only. Few ratings. |
| **Modular Subway Tunnels**, Abandoned World ([link](https://www.fab.com/listings/99cf1f16-23a4-4a61-9e66-bd86ccfa44c2)) | $59.99 | tunnels, rails, a train; pipes, wires, ventilation, electrical panels, diesel generator, stairs; hermetic gates | Game-ready PBR, 29 seamless materials, 7 ratings. Soviet / Metro look, not MARTA. |
| Abandoned World **Shelter** ($79.99), **Underground Tunnels** ($99.99), **Mini Bunker** ($49.99) | | bunker rooms, furniture, clutter, hermetic doors | One artist, consistent, but post-Soviet styling; no labs or medical. The tunnels' damage is vertex paint in Unreal, so the raw FBX looks plainer. |
| **Abandoned Lab – Modular Kit**, Rifteverse ([link](https://www.fab.com/listings/e8935036-4c73-4b81-8c4b-80a265640289)) | $25.99 | containment tank, centrifuge, autoclave, incubator, fume hood, observation window, glass partition; catwalk, generator, pipes; security gate, checkpoint; lockers, computers | 97 assets, 4K PBR, FBX + GLB with LODs and collision. **Quality unproven** (a sibling pack rates 3/5). Siblings: Hospital $15.99, Subway Station $25.99, Industrial Decay $23.99, Police Station $16.99. |
| **Outpost Kestrel**, DmitryN ([link](https://www.fab.com/listings/fdef85b5-44fb-4a5e-89d5-7d6fdccc870d)) | $34.99 | clean white wall panels, sliding doors, ceiling light panels, vents, containment capsule, lab bench, centrifuge; a medbay | 2 m grid, ~49 meshes. Space-station signage; the clean/abandoned switch is an Unreal material; 0 ratings. |
| **Cold Nine – Morgue**, RetroStyle ([link](https://www.fab.com/listings/b25e7969-8795-4589-b396-418e8940caa9)) | $49.99 | morgue fridge, autopsy room, gurney, tiled walls | 0 ratings. Same studio: **Subway Realm NYC** ($79.99) — a US-style metro. |
| **Modular Hospital Corridor**, FOUAD BEN ([link](https://www.fab.com/listings/03424f68-85de-4d48-881b-f68a00b40b27)) | $68.99 | corridor walls, doors, vents, ceilings, gurney, IV stand, signs, dirt decals | **1K trim sheets only** — too soft for our bar. |
| **Bunker pack**, VP.Studio ([link](https://www.fab.com/listings/38eb0d18-a04c-4ad0-b4f9-66220854829a)) | $99.99 | tunnels, destructible walls, floors, lights, 5 variants a module | 5/5 from 4 reviews; texture specs not stated. |
| **Modular Abandoned Bunker Bundle**, PStudio | $39.99 | 160+ pipes, walls, boxes, barrels, pallets, fans, lamps, doors, valves | "AAA game-ready"; 0 ratings. |
| **Modern Laboratory Equipment**, Y-3D (CGTrader) | $29 | benches, fume extraction arms, sinks, cabinets, microscopes, glassware | Render-oriented, maybe high-poly; 0 reviews. |
| **Xenobiology Specimen Lab Pack**, WonderFuel (CGTrader) | $18.99 | airlock door, **decontamination shower**, cryo pod, specimen cylinder, hazmat locker | Stylized cyan/violet colours; possibly generated. |
| **JOBSITE Bank Vault Door**, Dekogon (Fab FBX single) | $5.99 | the vault door | |

**Unusable here (Unreal or Unity only):** Gorodenkoff Research Laboratory, Naked Singularity LABORATORY, Stepaniuk Research Center, Dekogon's Hospital and Kitchen COMBOs, Project Zima's Sci-Fi Bio Laboratory (the best-reviewed lab kit seen, 4.97★ from 31), and others. **Too stylized/low-poly:** several "horror lab" packs.

**Free materials:** Poly Haven, ambientCG (CC0); Quixel Megascans surfaces on Fab (Fab Standard, some free).

## The finding that matters
**There is no realistic, modular LAB ARCHITECTURE kit available in a format we can use.** The good room kits (walls, ceiling grids, glass partitions, sliding doors, cleanroom floors) are Unreal-only. What's available in FBX is **equipment and props** (Secret Lab, Naked Singularity, Rifteverse) and **industrial/tunnel architecture** (Abandoned World, Bunker packs).

## Recommended combination (about $185–200)
1. **KitBash3D Secret Lab** ($95): clean-lab hero equipment, airlock, lead door, quarantine tent.
2. **Abandoned World Modular Subway Tunnels** ($59.99): tunnels, rails, pipe runs, generator, hermetic gates, electrical gear.
3. **About $30–45 of Naked Singularity props** (lab doors, HVAC ceiling, centrifuges, microscopes, fridge) plus the free module.
4. **Dekogon's vault door** ($5.99).
5. **We build the clean-lab rooms ourselves in Blender** (wall panels, ceiling grids, glass, door frames, floors), with Megascans / ambientCG / Poly Haven materials. Simple geometry with excellent materials and baked light is what makes these rooms look real.
6. Medical and security from **Cold Nine** or Rifteverse's **Hospital** and **Police Station** after inspecting one.

Cheaper, one-artist option (~$110): the five Rifteverse packs — buy one ($16) first and judge it. One-artist industrial option (~$190): Abandoned World Shelter + Tunnels + Mini Bunker (Soviet styling, no labs).

## Gaps either way
Clean modular lab architecture (we build it), a realistic decontamination shower and suit room (build, or retexture WonderFuel's), the canteen/kitchen and bunk rooms, a US/MARTA look for the tunnels (retexture, or Subway Realm NYC), and the big generator hall and boiler (partly the subway pack's generator and Rifteverse Industrial Decay).
