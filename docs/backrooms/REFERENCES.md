# THE BACKROOMS — REFERENCE SETS AND THE THEME VERDICT

Backrooms law 8's reference task (Josh, 2026-10-11): *"go online and focus on
looking backrooms images relative to each levels theme and judge what you made
based off of those images. For each level I want you to find 20 theme accurate
images."*

**How the set was made.** Bing Images, three searches per level; every
candidate viewed on a numbered contact sheet; 20 kept per level for being
on-theme for THAT level (title cards, entity art, collages, other levels and
AI-generated images dropped — six picks that turned out to be AI were
swapped). Links only: nothing is downloaded or kept in the repo. A few come
through Pinterest-style aggregators whose original creator can't be confirmed;
those say so.

**How ours was judged.** The operator flew a 3×3 grid of stops across each
shipped map in the real client on a real GPU, landing on open floor at every
stop and shooting two headings (`flytour.mjs` in the session's scratchpad —
the dev-only `__brFly` / `__brTorch` hooks exist for it). Average colour and
luminance were MEASURED for all 20 references and all 18 of our shots
(HUD cropped), not eyeballed.

## Level 0 — The Lobby (sector A6)

**What the 20 agree on.** Mono-yellow wallpaper with a faint chevron/damask print, a thin pale baseboard; a LOW drop ceiling of cream acoustic tiles packed with recessed fluorescent troffers (solid glowing panels, or four-tube louvred ones in Kane Pixels'); tan-to-mustard carpet, stained and damp-looking; vast open rooms broken by square pillars and stray wall pieces, plus long corridors; light even, washed-out and yellow, fading into haze rather than dark; almost no clutter (a cable, an outlet).

**Measured.** References: average colour (144, 127, 57), luminance 126 (70–180). Ours, 18 shots across the map: (105, 91, 36), luminance 90 (48–105). SAME HUE, about 28% darker, and no bright end at all.

**Verdict.**
- MATCHES: the palette's hue, the chevron paper, dense panels in a drop-ceiling grid, pillar fields and freestanding walls, long corridors, the pit room (the references' pit room is our shafts), very little clutter.
- FIXED (2026-10-11) — brightness. Josh: "whatever you recommend." The ROOM light was lifted (Level 0's hemisphere and ambient ×1.75, `LOBBY_HEMI`/`LOBBY_AMB` in world.ts) and the panels' bloom left alone — that was the earlier call, made because the fixtures glared. Re-measured on the same 18-shot tour: (135, 117, 48), luminance 115 (63–136), against the set's 126 (70–180). The panelled offices stay the dim room they were drawn as.
- KEPT, Josh's standing calls (each is written into the code with his words): the 3×3 tile drop ceiling with its T-bar grid, the paper span set for sharpness, baseboards on ~8.5% of walls, and the drawn carpet with its stains removed. None were changed under "whatever you recommend" — a recommendation is not a reason to undo a decision he made himself.

| # | What it shows | Source |
|---|---|---|
| 1 | Pillared hall: chevron wallpaper, pale baseboard, dense square troffers, mustard carpet, open doorway cut | [unrealengine.com](https://www.unrealengine.com/marketplace/en-US/product/8c6ad5a890b547da834ddb5ef2cd6244/questions) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/Demonstration-06-1920x1080-7c572930a3e0ed99e4764c36214fe5a2.jpg?resize=1&w=1920) |
| 2 | Rows of wallpapered pillars under a bright drop ceiling — the classic grid | [wallpapers.com](https://wallpapers.com/wallpapers/the-backrooms-n0y9jwa8crrhayv3.html) · [image](https://wallpapers.com/images/file/the-backrooms-n0y9jwa8crrhayv3.jpg) |
| 3 | Wide bright room, haze in the distance, overexposed panels | [reddit.com](https://www.reddit.com/r/backrooms/comments/13mmscb/some_new_scenes_for_level_0_for_my_backroom/) · [image](https://preview.redd.it/some-new-scenes-for-level-0-for-my-backroom-craft-build-v0-b3edp2e6cy0b1.jpg?width=1440&format=pjpg&auto=webp&s=bb3e188b9eb47917695907a2476a217d4e35d01d) |
| 4 | Freestanding wall pieces at odd angles, a stray cable on the carpet | [unionstreetjournal.com](https://unionstreetjournal.com/2022/04/scents-of-wet-carpet-and-terrifying-entities-welcome-to-the-backrooms/) · [image](https://unionstreetjournal.com/wp-content/uploads/2022/03/the-backrooms.jpg) |
| 5 | Dim corner: wallpaper close up, an outlet low on the wall, louvred lights | [backrooms-mb.fandom.com](https://backrooms-mb.fandom.com/wiki/Level_0) · [image](https://static.wikia.nocookie.net/backrooms-mb/images/a/a9/Backrooms_level_0.jpg/revision/latest?cb=20260130015916) |
| 6 | Narrow corridor with a skylight-like panel; brown carpet | [faithful-backrooms.fandom.com](https://faithful-backrooms.fandom.com/wiki/Level_0) · [image](https://static.wikia.nocookie.net/faithful-backrooms/images/6/63/Level_0.png/revision/latest/scale-to-width-down/512?cb=20230407084042) |
| 7 | Overlit corner: drop-ceiling tiles visible, glowing panels | [reddit.com](https://www.reddit.com/r/backrooms/comments/vfj5z9/i_got_recommendations_to_darken_my_backrooms_so/) · [image](https://i.redd.it/mkhix82w2h691.jpg) |
| 8 | Escape the Backrooms: plain beige pillars, darker, desaturated | [destructoid.com](https://www.destructoid.com/all-monsters-and-levels-in-escape-the-backrooms-entities-guide/) · [image](https://www.destructoid.com/wp-content/uploads/2025/10/Escape-the-Backrooms-Level-0.jpg?quality=75&w=1024&resize=1024%2C576) |
| 9 | Long corridor to a dark vanishing point, pillars both sides | [youtube.com](https://www.youtube.com/watch?v=ZMIzlasUe-w) · [image](https://i.ytimg.com/vi/ZMIzlasUe-w/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGHIgZyg5MA8=&rs=AOn4CLDuWRsWXqddVfEHzVowgFJv_ue45A) |
| 10 | Dense grid of square troffers over a pillar field | [deviantart.com](https://www.deviantart.com/yanis1212/art/Backrooms-level-0-909768877) · [image](https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/15763aa8-624f-4b76-ad29-d7067d1f767c/df1ni5p-c149b975-3980-4c09-a36e-8e7d24058c74.png/v1/fill/w_1280,h_717,q_80,strp/backrooms_level_0_by_yanis1212_df1ni5p-fullview.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9NzE3IiwicGF0aCI6IlwvZlwvMTU3NjNhYTgtNjI0Zi00Yjc2LWFkMjktZDcwNjdkMWY3NjdjXC9kZjFuaTVwLWMxNDliOTc1LTM5ODAtNGMwOS1hMzZlLThlN2QyNDA1OGM3NC5wbmciLCJ3aWR0aCI6Ijw9MTI4MCJ9XV0sImF1ZCI6WyJ1cm46c2VydmljZTppbWFnZS5vcGVyYXRpb25zIl19.gJGWg1RM2q0Vz1hnf4UxlnP20pttY9qYknBFrA1c96w) |
| 11 | Flat bright white-yellow, a lone wall piece | [enter-the-backrooms.fandom.com](https://enter-the-backrooms.fandom.com/wiki/Level_0) · [image](https://static.wikia.nocookie.net/enter-the-backrooms/images/0/02/ETB_Level_0.png/revision/latest/scale-to-width-down/1200?cb=20220405010137) |
| 12 | Kane Pixels: the original framing — low, wide, beige, ordinary | [abcnews.go.com](https://abcnews.go.com/US/backrooms-horror-storytelling-online/story?id=92623707) · [image](https://i.abcnewsfe.com/a/a134019d-8bfb-4ea5-adc9-277ef828acea/kane-pixels-backrooms-02-ht-jt-221104_1667609605968_hpEmbed_25x14.jpg) |
| 13 | Kane Pixels: a slanted pillar in a long bright hall | [reddit.com](https://www.reddit.com/r/KanePixelsBackrooms/comments/14zll8p/made_level_0_from_kane_pixels_what_level_should_i/) · [image](https://preview.redd.it/where-it-all-started-v0-7n1t2zyiv4mb1.jpg?width=640&crop=smart&auto=webp&s=e68a55e53eea440aa9fecbbf07ef99a1f847b74c) |
| 14 | Kane Pixels render: dense panels, pillar rows | [fity.club](https://fity.club/lists/k/kane-pixels/) · [image](https://static.wikia.nocookie.net/kane-pixels-backrooms/images/1/1b/Backrooms_1.png/revision/latest/smart/width/250/height/250?cb=20241101031754) |
| 15 | Kane Pixels, darker amber: four-tube louvred troffers, deep shadow | [lagofast.com](https://www.lagofast.com/es/mod-master/games/escape-the-backrooms/kane-pixels-backrooms-8k-textures/) · [image](https://static.qiyou.cn/game_back_file/oversea_prepare/mod_auto_get/mod_image/25/10/24/1-1660584275-373024465.png) |
| 16 | Kane Pixels: amber pillars, four-tube fixtures, dark edges | [nexusmods.com](https://www.nexusmods.com/escapethebackrooms/mods/1) · [image](https://staticdelivery.nexusmods.com/mods/4722/images/thumbnails/1/1-1660584224-822375674.png) |
| 17 | Kane Pixels camcorder still (date stamp): heavy pillar, dim corners | [nexusmods.com](https://www.nexusmods.com/escapethebackrooms/mods/1?file_id=1) · [image](https://staticdelivery.nexusmods.com/mods/4722/images/thumbnails/1/1-1660584256-398786741.png) |
| 18 | Corridor with clear chevron wallpaper, white baseboard, STAINED brown carpet | [wallpapers.com](https://wallpapers.com/the-backrooms) · [image](https://wallpapers.com/images/hd/the-backrooms-u1iy74rc660bfcad.jpg) |
| 19 | Room corner: chevron wallpaper, baseboard, mottled wet carpet | [store.steampowered.com](https://store.steampowered.com/app/2223900/Backrooms_The_Game/?l=polish) · [image](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2223900/ss_6846d2cdcafcb0a6f752708473ea0713433a167c.1920x1080.jpg?t=1694553810) |
| 20 | Pit room: square shafts cut in the floor (our pits), hazmat for scale | [store.steampowered.com](https://store.steampowered.com/app/2141730/Backrooms_Escape_Together/?l=german) · [image](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2141730/ss_618b444ce6825d6c039cf951cbdd7dd717982ba7.1920x1080.jpg?t=1725491752) |

## Level 1 — The Poolrooms (sector P6)

**What the 20 agree on.** Small square white/cream tile (~10–20cm) on EVERY surface with visible grout; rounded corners, arches, curved walls and round tunnels; square pillars; tall barrel and stepped ceilings with skylights and oculi letting in soft daylight; clear turquoise water with caustic ripples; ladders and porthole windows; the dark variant swaps the tile for plain grey render but keeps the shapes.

**Measured.** References: (120, 132, 114), luminance 128 (69–192). Ours: (124, 133, 128), luminance 131 (77–179). BRIGHTNESS AND COLOUR MATCH.

**Verdict.**
- MATCHES: brightness and palette, turquoise water with caustics on the surface, arches and cylinders, skylights, the bright/dark zone split.
- FIXED (2026-10-11) — tile scale. 12.5cm on walls, floors, risers, pillars and the kit pieces (25cm on the ceiling), one grid from world position, so a grout line runs up a wall, over a step and across the floor. The tile is glazed and raised now: a bevelled edge, recessed grout, a sheen that reflects a soft pool hall (Josh: "the tile has no depth to it and looks like matt sheets").
- FIXED (2026-10-11) — no stone or marble. Josh: "I do not want marble or stone in the pools. I just want the tile." Gone from the library, and the Poolrooms' checker and look picker now offer the pool tile only (`LEVEL1_SURFACES`).

| # | What it shows | Source |
|---|---|---|
| 1 | Curved tile corridor half-flooded; small cream tiles with grout | [backrooms.miraheze.org](https://backrooms.miraheze.org/wiki/Level_37) · [image](https://static.wikitide.net/backroomswiki/thumb/e/e6/Pool.jpg/1200px-Pool.jpg) |
| 2 | Kane-style blue pillar hall over open water, camcorder grain | [theliminalgallery.com](https://theliminalgallery.com/art/the-backrooms/level-37-sublimity-poolrooms-01) · [image](https://theliminalgallery.com/artwork/the-backrooms/_gallery/level-37-sublimity-poolrooms-01.jpg) |
| 3 | Spiral stair in a tiled hall, daylight window, shallow water | [the-backrooms-unredacted.fandom.com](https://the-backrooms-unredacted.fandom.com/wiki/Level_37) · [image](https://static.wikia.nocookie.net/the-backrooms-unredacted/images/b/bc/Poolrooms.png/revision/latest/scale-to-width-down/600?cb=20241004044429) |
| 4 | Doorways in tile walls, deep turquoise water, soft daylight | [the-actual-backrooms.fandom.com](https://the-actual-backrooms.fandom.com/wiki/Level_37) · [image](https://static.wikia.nocookie.net/the-actual-backrooms/images/a/a1/Level_Poolrooms.jpg/revision/latest/scale-to-width-down/147?cb=20250201124216) |
| 5 | Arch tunnel at the end of a pool, square skylights | [gamepretty.com](https://gamepretty.com/backrooms-escape-together-level-37-guide/) · [image](https://gamepretty.com/wp-content/uploads/2023/11/unnamed-file-72.png) |
| 6 | Dark Poolrooms: smooth rounded concrete, no tile, dim | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Dark-Tiled_Room) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/6/64/Level_37_Background.jpg/revision/latest?cb=20230804042148) |
| 7 | White tile corridor with pillar, ankle-deep water | [the-actual-backrooms.fandom.com](https://the-actual-backrooms.fandom.com/wiki/Level_37) · [image](https://static.wikia.nocookie.net/the-actual-backrooms/images/8/83/37_is_what.png/revision/latest/scale-to-width-down/148?cb=20250201124428) |
| 8 | Dark Poolrooms: grey hall, slot skylights, arches along the wall | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_37.2) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/0/01/The_Expanded_Poolrooms.jpg/revision/latest/scale-to-width-down/1200?cb=20240425215936) |
| 9 | Dark Poolrooms: angled ceiling beams, turquoise channel | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_37.2) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/1/10/Expanded_Poolrooms.jpg/revision/latest/scale-to-width-down/268?cb=20240701162558) |
| 10 | Long pool with porthole windows, ladders, slanted skylights | [youtube.com](https://www.youtube.com/watch?v=i9rre_oz9Do) · [image](https://i.ytimg.com/vi/i9rre_oz9Do/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGGUgZShlMA8=&amp;rs=AOn4CLB18YWtM0_lWZ33JsrlLajqtkgu-g) |
| 11 | Domed room with arched windows around a round pool | [backrooms-mb.fandom.com](https://backrooms-mb.fandom.com/wiki/Level_37) · [image](https://static.wikia.nocookie.net/backrooms-mb/images/7/74/Poolrooms-4.jpg/revision/latest/scale-to-width-down/180?cb=20260202232415) |
| 12 | Stepped tiled ceiling, oculus skylights, turquoise basin | [store.steampowered.com](https://store.steampowered.com/app/2978690/Poolrooms/) · [image](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2978690/ss_c79694ffba375076b2d036a655f71a7328cab640.1920x1080.jpg?t=1715784048) |
| 13 | Arches receding, small tiles everywhere, a strip light | [store.steampowered.com](https://store.steampowered.com/app/2978690/Poolrooms/) · [image](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2978690/ss_a62c5e58d5cc44aecb0d4090c28a1ce6f71f2321.1920x1080.jpg?t=1719764225) |
| 14 | Arched galleries over still water (aggregator; creator unverified) | [reddit.com](https://www.reddit.com/r/poolrooms/comments/1bgvgyk/poolrooms_i_made/) · [image](https://preview.redd.it/poolrooms-i-made-v0-98a1m4dvrvoc1.jpg?width=1920&format=pjpg&auto=webp&s=645a8839c3e9630710c0422f29b88337c6c495d2) |
| 15 | Bright tile basins, doorway, blue water (Pinterest; creator unverified) | [pinterest.com](https://www.pinterest.com/nacona_yazzie/poolrooms/) · [image](https://i.pinimg.com/originals/4e/16/d2/4e16d2cf75397346dd9c0850dcab67c1.png) |
| 16 | Tiled pillars and doorways, white light, turquoise water | [reddit.com](https://www.reddit.com/r/Bossfightarena/comments/yfm1n4/the_poolrooms_dangerous_red_reality_lore_in/) · [image](https://preview.redd.it/the-poolrooms-dangerous-red-reality-lore-in-comments-v0-x21zs9enbjw91.jpg?width=1080&format=pjpg&auto=webp&s=cbef2b7c7fe9803925af83a3988c35637a8a43d3) |
| 17 | Round room with arched openings, glowing pool (aggregator; creator unverified) | [duitang.com](https://www.duitang.com/blog/?id=1443058600) · [image](https://c-ssl.duitang.com/uploads/blog/202212/19/20221219162108_1df67.jpeg) |
| 18 | Tiled passage with a rounded vault (aggregator; creator unverified) | [artofit.org](https://www.artofit.org/image-gallery/917960336520463219/backrooms-level-33-1-poolrooms/) · [image](https://i.pinimg.com/originals/4f/40/fb/4f40fb15a49fcb4d758a3256e0a5d30c.jpg) |
| 19 | Unreal Marketplace: white tile pool hall under skylights | [unrealengine.com](https://www.unrealengine.com/marketplace/en-US/product/the-backrooms-poolrooms) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/TheBackroomsPreviews2022UE11-1920x1080-ecd12c7b8ac408fc8844f3a66a2398f0.png?resize=1&w=1920) |
| 20 | Tiled round tunnel narrowing to a dark circle (Pinterest; creator unverified) | [jp.pinterest.com](https://jp.pinterest.com/pin/3096293487920597/) · [image](https://i.pinimg.com/originals/e2/15/f5/e215f587936dea5f7af7cf6279de0b62.jpg) |

## Level 2 — Pipe Dreams (sector D3)

**What the 20 agree on.** Long, NARROW concrete maintenance corridors (~2m) lined on both walls and the ceiling with bundles of horizontal pipes of mixed sizes — rusted, lagged, painted; bare fluorescent tubes or caged bulbs throwing POOLS of light with the corridor black between them and at its end; grimy, sometimes wet floors; valve wheels, doors, ladders, electrical boxes.

**Measured.** References: (76, 73, 67), luminance 73 (23–129). Ours, landed at every stop, torch off: (14, 10, 7), luminance 11 (2–37) — nearly black.

**Verdict.**
- THE BIGGEST GAP OF THE FOUR — NO PIPES ON THE WALLS. Every reference is defined by pipe runs along the walls and ceilings; ours has none (BACKROOMS.md listed it as a KNOWN GAP in Sep 2026 and it was never built). FIXED (2026-10-11): pipe runs on every real wall of the corridors, tunnels, galleries and plant rooms, a pair down the middle of every corridor ceiling and a low pair in the galleries; every end turns into its wall or up into the ceiling, in the kit pipe's material in four finishes. Measured: +8–36% triangles and +4–17 draw calls where they are densest, frame time unchanged.
- MATCHES: raw concrete, valve and machine set pieces, caged bulkhead lamps, the dark rhythm Josh accepted ('dark tunnels between islands of light').
- FIXED (2026-10-11) — the lamps throw POOLS now. Josh: "whatever you recommend." The lamp gain went 1.3 → 3.2 (`PIPE_LAMP_GAIN`) with the falloff unchanged, so the floor under a caged lamp is lit and the tunnel between stays black. Re-measured: luminance 15 (2–55), from 11 (2–37); a lit stretch reads ~50–100. Deliberately short of the references' brightest — Josh's standing word is "pipe dream should be dark", and the dark is part of the Grabber's difficulty (law 11).
- JOSH DECIDES — our plant is mostly big open rooms (tanks, warehouse racking); the references are mostly narrow corridors. The blue-and-orange pallet racking in particular reads as a modern warehouse, not a maintenance plant.

| # | What it shows | Source |
|---|---|---|
| 1 | Escape the Backrooms: long corridor, pipe bundles along both walls, tube lights | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/d/d0/Pipe_Dreams.jpg/revision/latest/scale-to-width-down/1200?cb=20240204223705) |
| 2 | Wiki: rusty pipe bundles floor to ceiling, narrow walkway | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/backrooms/images/0/03/Level2possiblimage.jpeg/revision/latest?cb=20221010150638) |
| 3 | Grey concrete corridor, dense pipes overhead and on the right | [youtube.com](https://www.youtube.com/watch?v=8Cn5DPZjeUU) · [image](https://i.ytimg.com/vi/8Cn5DPZjeUU/maxresdefault.jpg) |
| 4 | Concrete corridor, pipes along the top of the walls, dark | [backrooms-redacted-survival.fandom.com](https://backrooms-redacted-survival.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/backrooms-redacted-survival/images/d/d5/Pipe_lol.png/revision/latest?cb=20231105162632) |
| 5 | Grimy corridor, pipes both sides, single light pool | [youtube.com](https://www.youtube.com/watch?v=EzuiQxiqJLQ) · [image](https://i.ytimg.com/vi/EzuiQxiqJLQ/maxresdefault.jpg) |
| 6 | Dark corridor end, ceiling light, wall pipes | [untitled-backrooms-experience.fandom.com](https://untitled-backrooms-experience.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/untitled-backrooms-experience/images/7/7f/Level_2.png/revision/latest?cb=20240523094126) |
| 7 | Clean concrete corridor with stacked grey pipes | [youtube.com](https://www.youtube.com/watch?v=MqCsYMLePgs) · [image](https://i.ytimg.com/vi/MqCsYMLePgs/maxresdefault.jpg) |
| 8 | 4K walkthrough still: lit tubes, pipe walls, black end | [youtube.com](https://www.youtube.com/watch?v=UqdDSb34WY4) · [image](https://i.ytimg.com/vi/UqdDSb34WY4/maxresdefault.jpg) |
| 9 | Wiki: white-washed walls, insulated pipes, harsh light | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/backrooms/images/f/fe/Cleanlevel2.jpg/revision/latest/scale-to-width-down/670?cb=20240420163804) |
| 10 | Escape the Backrooms: rust and grime, pipes converging | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/e/e7/Level_2_Screenshot_5.jpg/revision/latest/scale-to-width-down/185?cb=20230805202145) |
| 11 | Blue-grey corridor, valve wheels, pipe runs | [youtube.com](https://www.youtube.com/watch?v=B7ejc2pP5sk) · [image](https://i.ytimg.com/vi/B7ejc2pP5sk/hqdefault.jpg) |
| 12 | Wet floor reflecting a light, pipes on the walls | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/backrooms/images/4/41/Darklevel2.png/revision/latest?cb=20240420163655) |
| 13 | Brick-floored passage with pipes at shoulder height | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/backrooms/images/0/0f/Level_2_(Another_Angle).jpg/revision/latest/scale-to-width-down/261?cb=20221118040858) |
| 14 | Wiki (JP): long straight run, pipes stacked six high | [backrooms.fandom.com](https://backrooms.fandom.com/ja/wiki/Level_2_(1)) · [image](https://static.wikia.nocookie.net/backrooms/images/5/5b/Pipes-on-underground-maintenance-tunnel-wall-luca-lorenzelli.jpg/revision/latest/scale-to-width-down/350?cb=20220226125841&path-prefix=ja) |
| 15 | Bright concrete hall, pipes and a ladder | [the-backrooms-database-w.fandom.com](https://the-backrooms-database-w.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/the-backrooms-database-w/images/0/0f/Level2.png/revision/latest?cb=20240721085719) |
| 16 | Pipes on the ceiling, a hospital bed left in the corridor | [fity.club](http://fity.club/lists/suggestions/backrooms-level-2/) · [image](https://preview.redd.it/vbp286fh94g61.png?width=930&format=png&auto=webp&s=581bfe7c82c3b1ac7dafaabf537198df0161ebce) |
| 17 | Tight corridor, pipes on every surface, cold light | [inthebackrooms.fandom.com](https://inthebackrooms.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/inthebackrooms/images/c/ca/3EX5172.jpg/revision/latest/scale-to-width-down/1200?cb=20230715043856) |
| 18 | Utility tunnel, big lagged pipe low on the right | [lanimil-corporation-backrooms-documentation.fandom.com](https://lanimil-corporation-backrooms-documentation.fandom.com/wiki/Level_2) · [image](https://static.wikia.nocookie.net/august-documentaries-backrooms-archives/images/b/b1/BrightHall.jpg/revision/latest/scale-to-width-down/330?cb=20220524093418) |
| 19 | Lit tunnel with fluorescent tubes and pipe runs | [youtube.com](https://www.youtube.com/watch?v=8Cn5DPZjeUU) · [image](https://i.ytimg.com/vi/8Cn5DPZjeUU/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGGUgXyhTMA8=&rs=AOn4CLAoYjyMlod_o1p_-1SlZnb6ySLegQ) |
| 20 | Rusty brown pipes, dark machinery corridor | [attackofthefanboy.com](https://attackofthefanboy.com/guides/all-backrooms-monsters-and-entities-for-every-level/) · [image](https://attackofthefanboy.com/wp-content/uploads/2023/04/Backrooms-Level-2.jpg) |

## Level 3 — The Electrical Station (sector S1)

**What the 20 agree on.** Narrow corridors of yellow-brown and red BRICK; iron cage bars and gates like a cell block; banks of grey electrical cabinets, switchboards and breaker panels; conduit, cable trays and small pipes along the ceiling; warm sodium-orange pools of light from caged bulbs; wet, polished floors that reflect them.

**Measured.** References (17 of the 20 measured — three would not load for the measurement): (68, 54, 35), luminance 56 (29–107), WARM. Ours: (30, 32, 35), luminance 32 (17–89), COLD blue-grey.

**Verdict.**
- FIXED (2026-10-11) — the palette. Josh approved the download ("whatever you recommend"): "Red Brick 03" by Rob Tuytel, Poly Haven (CC0), 1k colour + normal (~1.6MB), now the Station's wall and a `red-brick` surface in the catalogue. Laid from world position, so the courses run level and turn every corner. The light went from cold fluorescent white-blue to warm sodium, and a POWERED section now has a base light throughout (`STATION_BASE_LIT`) while a dead one drops to black — over dark brick the old near-zero floor left even a live corridor black between its lamps. Re-measured: (57, 40, 28), luminance 43 (32–67), from (30, 32, 35) / 32 — warm now, against the set's (68, 54, 35) / 56.
- FIXED (2026-10-11) — CONDUIT. Galvanized conduit in bundles of three to six along the walls of every working room (capped at 3.4m, so a tall room carries it where people look) and a tray-width bundle down the middle of every serviceway and cable vault — Pipe Dreams' pipe-run builder with the Station's profile (`STATION_RUN_PROFILE`), one mesh a chunk. The same round put the runs and Pipe Dreams' machines on the chunk's OWN light curve: they had a copy of it, which left them at the old brightness when Pipe Dreams' lamps were raised.
- FIXED (2026-10-11) — CABINET BANKS. 86 of the kit's "Old electrical cabinet" stand two to a cell along the north and south walls of the switch rooms, the main switch room, the substation halls and the control room (`station-rooms.json`), clear of every doorway, breaker, arcing panel, lamp and puddle; every room passes the editor's checker and the cost meter.
- FIXED (2026-10-11) — CAGES. Each transformer in the transformer bays stands in a three-sided cage of the kit's braced steel fence panels (sides and back, the front open to the bay, so nothing in the room is sealed off); the room passes the editor's checker and the placement law.
- FIXED (2026-10-11) — the water. It was flat bright-blue sheets in 2m squares; it is dark, glassy and rippled now, reflecting the lamps (a dark section's barely), with a ragged shore, and live water carries the current as sparse cold crackles that wander over it.
- Not yet open to members, so this is the right time to fix it — before Josh's Test play walk.

| # | What it shows | Source |
|---|---|---|
| 1 | Garry's Mod map: brick corridor with cage bars, lamp at the far end | [gamebanana.com](https://gamebanana.com/mods/605731) · [image](https://images.gamebanana.com/img/ss/mods/686d8dc31a7d8.jpg) |
| 2 | Banks of grey electrical cabinets down a corridor | [attackofthefanboy.com](https://attackofthefanboy.com/guides/all-backrooms-monsters-and-entities-for-every-level/) · [image](https://attackofthefanboy.com/wp-content/uploads/2023/04/Backrooms-Level-3.jpg?resize=470) |
| 3 | Wiki (ES): red brick, conduit, switchboxes, wet floor | [backrooms.fandom.com](https://backrooms.fandom.com/es/wiki/Nivel_3) · [image](https://static.wikia.nocookie.net/backrooms/images/6/6f/Level3.jpg/revision/latest/scale-to-width-down/1200?cb=20220904020545&path-prefix=es) |
| 4 | Warm brick corridor, lit, cable trays | [youtube.com](https://www.youtube.com/watch?v=ERJaWNxthoU) · [image](https://i.ytimg.com/vi/ERJaWNxthoU/hqdefault.jpg) |
| 5 | Wiki: brick and machinery, red indicator lights | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/backrooms/images/5/53/Level_3room.png/revision/latest?cb=20220802040147) |
| 6 | Escape the Backrooms: dark corridor, wet concrete | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/7/70/Level_3_Screenshot_10.jpg/revision/latest/scale-to-width-down/185?cb=20240327010318) |
| 7 | Minecraft wiki render: corridor with a bright ceiling panel and cage walls | [official-minecraft-the-backrooms.fandom.com](https://official-minecraft-the-backrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/official-minecraft-the-backrooms/images/4/4d/Level3_1.png/revision/latest/scale-to-width-down/1200?cb=20230222210939) |
| 8 | Escape Together: brick corridor, cage, wall lamp | [backrooms-escape-together.fandom.com](https://backrooms-escape-together.fandom.com/wiki/Level_3┃Electrical_Station) · [image](https://static.wikia.nocookie.net/backrooms-escape-together/images/c/c6/Level_3_Electrical_Station.png/revision/latest/scale-to-width-down/1200?cb=20260329113014) |
| 9 | Cage-lined corridor, ceiling light, brick | [the-backroomsuncharted-territory.fandom.com](https://the-backroomsuncharted-territory.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/the-backroomsuncharted-territory/images/2/2d/RobloxScreenShot20230826_212135408.png/revision/latest?cb=20240326020000) |
| 10 | Bars both sides, electrical box, yellow-lit corridor | [backrooms-infinite-plus.fandom.com](https://backrooms-infinite-plus.fandom.com/wiki/Level_3:_Electrical_station) · [image](https://static.wikia.nocookie.net/backrooms-infinite-plus/images/9/9c/Medium.jpg/revision/latest?cb=20250118091409) |
| 11 | Dark brick room with a red light switch | [steamcommunity.com](https://steamcommunity.com/sharedfiles/filedetails/?l=latam&id=2917649860) · [image](https://images.steamusercontent.com/ugc/12988227011248906851/586C0E9C181D418006A2683659F05F0F72705768/) |
| 12 | Long brick corridor glowing amber | [pinterest.com](https://www.pinterest.com/pin/backrooms-level-3-electrical-station-found-footage--17170042322410386/) · [image](https://i.pinimg.com/736x/c2/b5/28/c2b5289bc98b74da29f70554f179e402.jpg) |
| 13 | Escape Together site: brick, pipes, warm light | [backroomsescapetogether.com](https://www.backroomsescapetogether.com/roadmap) · [image](https://www.backroomsescapetogether.com/images/levels/level-3.webp) |
| 14 | Brick corridor to a lit doorway, camcorder still | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/0/0e/Level_3_Screenshot_2.jpg/revision/latest/scale-to-width-down/185?cb=20240327010057) |
| 15 | Brick and steel, dim, pipes overhead | [project-backrooms.fandom.com](https://project-backrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/project-backrooms/images/3/33/Level_3_hallway.PNG/revision/latest?cb=20221004073810) |
| 16 | Fuse box with coloured breakers, close up | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/8/8a/Level_3_Screenshot_24.jpg/revision/latest/scale-to-width-down/185?cb=20240327010648) |
| 17 | Brick passage, gate at the end, haze | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/c/c2/Level_3_Screenshot_1.jpg/revision/latest/scale-to-width-down/185?cb=20240327010048) |
| 18 | Polished floor reflecting a lamp, bars | [backrooms-escape-together.fandom.com](https://backrooms-escape-together.fandom.com/wiki/Level_3┃Electrical_Station) · [image](https://static.wikia.nocookie.net/backrooms-escape-together/images/9/90/Level_3_Machine_Room_Entrance.png/revision/latest/scale-to-width-down/185?cb=20250926151954) |
| 19 | Cell bars across a brick corridor | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_3) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/2/22/Level_3_Screenshot_20.jpg/revision/latest/scale-to-width-down/185?cb=20240327010603) |
| 20 | Amber-lit corridor, brick, a long run of cages | [backrooms-escape-together.fandom.com](https://backrooms-escape-together.fandom.com/wiki/Level_3┃Electrical_Station) · [image](https://static.wikia.nocookie.net/backrooms-escape-together/images/c/c6/Level_3_Electrical_Station.png/revision/latest/scale-to-width-down/185?cb=20250926150920) |



## Level 4 — The Abandoned Office (sector O1)

Gathered 2026-10-12, BEFORE the level, so there is nothing of ours to measure
yet — the set and what it agrees on are the brief the build is judged against
when it exists (the ship gate's Test play walk, and a flytour then).

**What the 20 agree on.** Beige-to-off-white painted drywall; dark grey
office carpet; a DROP CEILING of fibre tiles with fluorescent troffers, a lot
of them dead, so the light comes in pools; VAST BARE OPEN FLOORS broken only
by square pillars, against SMALL ROOMS that still hold furniture — desks and
office chairs, filing cabinets, folding tables, a records room of shelving,
a break room with vending machines and a water cooler; plain corridors with
brown wooden office doors; stairwells with steel railings; windows with rain
behind them. The Backrooms wiki's own text says the same: barren big rooms,
furnished small ones, "many of the fluorescent lights … do not function",
vending machines with almond water, stairwells that only ever lead back to the
same floor, and "the heavy pattering of rain on the windows" as the level's
one constant sound.

**Measured.** All 20: (57, 52, 48), luminance 53 (11–120) — a neutral-warm
grey, DIM. The two real-photograph offices (1, 4) sit at 120; the in-game
captures, which are the honest guide to what this looks like at night with
half the lamps dead, sit between 11 and 98.

**Ours, measured (2026-10-12).** The same tour as every level: a 3×3 grid of
stops across sector O1, landing at the room nearest each, two headings, HUD
cropped (`flytour-office.mjs` in the session's scratchpad; headless Chromium
on SwiftShader). First pass: (47, 44, 32), luminance 44 (36–56) — the hue
YELLOWER than the set (blue 32 against 48) and a little dark.

**Verdict.**
- MATCHES: the beige drywall, the grey carpet, the drop-ceiling grid, most
  troffers dead and the floor lit in pools, bare open floors with square
  pillars against furnished small rooms (cubicles, conference tables, the
  security office, records, a break room with its vending machine and water
  cooler), the lift, the stairwell door, and rain on the windows.
- FIXED (2026-10-12) — the ceiling. It was Level 0's tile, which is YELLOW
  in the photograph itself (the canvas averages 217, 211, 136) and read olive
  over the office's grey light. The office has its own now: the same tile
  greyed per pixel, washed off-white, with a grey T-bar grid
  (`officeCeiling` in world.ts). Level 0 keeps its touch of yellow — that
  was Josh's call for Level 0.
- FIXED (2026-10-12) — the light, lifted (`OFFICE_BASE_LIT` 0.24 → 0.3, the
  pools `OFFICE_LAMP_GAIN` 1.5 → 2.0). Re-measured: (53, 51, 47),
  luminance 51 (35–63), against the set's (57, 52, 48) / 53. The set's range
  is wider only because two of its twenty are real photographs of lit
  offices (120); the in-game captures sit where ours does.
- NOTED, not changed: the cubicle partitions read paler than the room (a kit
  model's own fabric, lit by the scene rather than the baked pools). The real
  office in reference 1 has grey partitions; recolouring a kit model is a
  prop-pipeline change, so it waits for Josh's Test play.

**What the design takes from it** (BACKROOMS.md → LEVEL 4):
- The windows have RAIN behind them, in fog, under a sky that never changes —
  not the grey void the first draft said. The rain is the ambient bed.
- Big rooms are bare; furniture lives in the small ones.
- Most troffers are dead and the floor is lit in pools — which is also what
  makes the Temp work: the dark between the pools is where it can move.
- Square pillars in the open floors (they're the only cover).
- Stairwells you can see into that lead nowhere; the badge-locked one is the
  only real way down.
- **Canon calls Level 4 "devoid of entities".** The Temp is a deliberate
  departure, as every level here has its creature.

| # | What it shows | Source |
|---|---|---|
| 1 | Real office: rows of grey cubicle partitions under a bright troffer grid, grey carpet, windows | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/backrooms/images/2/22/Level4Workrooms1.png) |
| 2 | Real office: a vast empty open floor, grey carpet, pillars, beige walls, doors — barren | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/backrooms/images/9/91/Level4altbg.png) |
| 3 | Wiki's level image: a dark open office, missing ceiling tiles, a wall of rain-streaked windows | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/backrooms/images/f/f2/Level4RewriteBackground.gif) |
| 4 | Black-and-white office: desks with monitors between pillars, troffers | [backrooms.fandom.com (es)](https://backrooms.fandom.com/es/wiki/Nivel_4) · [image](https://static.wikia.nocookie.net/backrooms/images/1/16/Nivel_%284%29_.jpg/revision/latest?path-prefix=es) |
| 5 | Escape the Backrooms: a dark open floor of pillars, a few panels lit | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/2/29/Level_4.png) |
| 6 | A stairwell: steel railings, beige walls, a door on the landing | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/6/64/Level_4_Screenshot_1.jpg) |
| 7 | A dark open hall, lit ceiling panels in pools, brown doors along the wall | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/3/3f/Level_4_Screenshot_2.jpg) |
| 8 | A small office: desk and chair, a stepladder, boxes and paper on the floor | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/4/4b/Level_4_Screenshot_3.jpg) |
| 9 | Open floor of square pillars, some lights on, most off | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/e/e2/Level_4_Screenshot_4.jpg) |
| 10 | A plain beige corridor, dim, a doorway at the end | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/3/36/Level_4_Screenshot_5.jpg) |
| 11 | Break room: folding tables, vending machines, a water cooler | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/f/f4/Level_4_Screenshot_6.jpg) |
| 12 | Near-black room, a curtained window | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/b/b3/Level_4_Screenshot_7.jpg) |
| 13 | A desk, office chair, filing cabinet and desk lamp in a bare room | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/3/34/Level_4_Screenshot_8.jpg) |
| 14 | Tables and chairs in a dim workroom | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/c/ca/Level_4_Screenshot_9.jpg) |
| 15 | A large empty dim room, doors in the far wall | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/e/e0/Level_4_Screenshot_10.jpg) |
| 16 | A records room: rows of shelving full of files | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/1/1d/Level_4_Screenshot_11.jpg) |
| 17 | Dark corridor between pillars and doors | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/a/ae/Level_4_Screenshot_12.jpg) |
| 18 | A lit corridor of fluorescent tubes over a glossy floor, a door at the end | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/f/f1/Level_4_Screenshot_13.jpg) |
| 19 | A framed sign on a beige wall beside a dark lift doorway | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/c/c3/ElevatorOffice.JPG) |
| 20 | A dark room with a rain-streaked window and a door | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_4) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/d/d0/Window_Level_in_4.jpg) |

## Level 5 — Terror Hotel (not built yet: the set is the brief)

Gathered 2026-10-12, before the level — the brief its build is judged
against. Bing Images, four searches, ~210 candidates on numbered contact
sheets; title cards, maps, creature art, YouTube faces and three likely
AI-generated pictures (a "Dreamlike Art" gallery) left out.

**What the 20 agree on.** Dark mahogany and red columns trimmed in gold;
red patterned carpets with gold borders, runners down long halls; coffered
ceilings with chandeliers; palms round lamp-lit round tables; long corridors
of numbered doors lit by sconces and ceiling lamps; checkered marble halls;
THE BEVERLY ROOM as a vast bare red-carpeted ballroom with one table under
a chandelier; THE BOILER ROOM as brown tunnels of big pipes. Warm, amber,
clean.

**Measured.** All 20: (82, 57, 34), luminance 62 (9–108) — the warmest set
yet (the office's was (57, 52, 48) / 53).

| # | What it shows | Source |
|---|---|---|
| 1 | Lobby: dark red columns, a red runner, a lit lamp on a round table, leather sofas | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_5_-_Terror_hotel) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/8/8b/Level_5_Screenshot_1.png/revision/latest/scale-to-width-down/1200?cb=20230626033200) |
| 2 | Grand lobby: coffered ceiling, chandelier, red carpet with a gold border, sofas | [backrooms-redacted.fandom.com](https://backrooms-redacted.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/backrooms-redacted/images/2/27/Level5.spawn.png/revision/latest?cb=20251118165645) |
| 3 | Corridor of room doors: warm walls, red patterned carpet, a luggage cart | [the-backrooms-nowhere-roblox.fandom.com](https://the-backrooms-nowhere-roblox.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/the-backrooms-nowhere-roblox/images/1/17/Level5.jpeg/revision/latest?cb=20251112222108) |
| 4 | Lobby: dark coffered ceiling, chandelier, patterned rugs, palms | [the-backrooms-existential-cosmos.fandom.com](https://the-backrooms-existential-cosmos.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/the-backrooms-existential-cosmos/images/8/80/Level_5_Spawn.png/revision/latest?cb=20250525043804) |
| 5 | Near-black corridor: patterned red carpet, wood panelling, a lamp far off | [www.reddit.com](https://www.reddit.com/r/backrooms/comments/1aidx7x/level_5_terror_hotel/) · [image](https://preview.redd.it/level-5-terror-hotel-v0-a4d6n0wljhgc1.jpeg?width=1080&crop=smart&auto=webp&s=a7fd6978d048a5590edbe2eb1d09e51e57a16fb5) |
| 6 | Reception: desk, staircase, marble and carpet | [www.unrealengine.com](https://www.unrealengine.com/marketplace/ko/product/the-backroom-level-5-terror-hotel/reviews) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/2-1920x1080-ceedc9d21d2f88cba9983d36e6c31975.jpg?resize=1&w=1920) |
| 7 | Cream corridor of framed panels and ceiling lights, archways receding | [www.unrealengine.com](https://www.unrealengine.com/marketplace/en-US/product/the-backroom-level-5-terror-hotel/questions) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/1-1920x1080-0596bb61fd814a1ed06c2d4b5b8b1535.jpg?resize=1&w=1920) |
| 8 | Grand staircase with a wooden banister | [www.unrealengine.com](https://www.unrealengine.com/marketplace/ko/product/the-backroom-level-5-terror-hotel/reviews) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/5-1920x1080-1cf1a85915f60de7e7f22d5a5fdbf8ab.jpg?resize=1&w=1920) |
| 9 | Bright corridor of red wall panels between doors, ceiling lamps | [backrooms.fandom.com](https://backrooms.fandom.com/ja/wiki/翻訳/Level_5) · [image](https://static.wikia.nocookie.net/backrooms/images/7/78/Level_5_hallway.jpg/revision/latest?cb=20230622170500&path-prefix=ja) |
| 10 | Lobby: a round table under a chandelier, palms, panelled walls | [www.unrealengine.com](https://www.unrealengine.com/marketplace/ko/product/the-backroom-level-5-terror-hotel/reviews) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/26-1920x1080-1acb07eaa0ec5363c3c7c984e8edd9b4.jpg?resize=1&w=1920) |
| 11 | Lobby: a huge patterned rug, red columns, a round table | [the-backroomsuncharted-territory.fandom.com](https://the-backroomsuncharted-territory.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/the-backroomsuncharted-territory/images/a/ae/Level_5_New.png/revision/latest?cb=20250723185601) |
| 12 | Long lobby: a red runner between dark columns toward a lamp | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/c/c2/The_Main_Halls.jpg/revision/latest/scale-to-width-down/350?cb=20240426175618) |
| 13 | Hall of checkered marble under a row of chandeliers, white coffered ceiling | [www.deviantart.com](https://www.deviantart.com/drakesonofthedragon2/art/Backrooms-Level-5-Terror-Hotel-1033481792) · [image](https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/7eec0c9d-b574-40ab-af94-59d20fe01b0f/dh3b3nk-1ca5383a-e90a-492e-8c0e-592fd76ee17f.jpg/v1/fill/w_1154,h_692,q_70,strp/backrooms_level_5__terror_hotel_by_drakesonofthedragon2_dh3b3nk-pre.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9NzY4IiwicGF0aCI6IlwvZlwvN2VlYzBjOWQtYjU3NC00MGFiLWFmOTQtNTlkMjBmZTAxYjBmXC9kaDNiM25rLTFjYTUzODNhLWU5MGEtNDkyZS04YzBlLTU5MmZkNzZlZTE3Zi5qcGciLCJ3aWR0aCI6Ijw9MTI4MCJ9XV0sImF1ZCI6WyJ1cm46c2VydmljZTppbWFnZS5vcGVyYXRpb25zIl19.iJ0LfMDsgO7ZXNVdc97dxoVP1zDzS5lLVbBJddI-RCo) |
| 14 | Dark corridor of deep red doors in amber light | [backrooms-levels.com](https://backrooms-levels.com/levels/level-5/) · [image](https://backrooms-levels.com/images/levels/level-5-1.png) |
| 15 | Dim corridor, a numbered room door (225) | [escapebackrooms.wiki](https://escapebackrooms.wiki/levels/level-5-terror-hotel) · [image](https://escapebackrooms.wiki/lvl-terror-hotel.webp) |
| 16 | Dim service corridor, bare and brown | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/4/43/Level_5_Screenshot_8.png/revision/latest/scale-to-width-down/185?cb=20240207162609) |
| 17 | THE BEVERLY ROOM: a vast bare red-carpeted ballroom, one table and chairs under a chandelier | [backrooms.fandom.com](https://backrooms.fandom.com/es/wiki/Nivel_5) · [image](https://i.ytimg.com/vi/_QPWEjY_iLw/maxresdefault.jpg) |
| 18 | THE BOILER ROOM: a tunnel of big pipes, brown and dim | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_5) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/0/08/The_Boiler_Room.jpg/revision/latest/scale-to-width-down/350?cb=20240426175317) |
| 19 | A hotel bedroom: bed, dresser, armchair | [www.unrealengine.com](https://www.unrealengine.com/marketplace/ko/product/the-backroom-level-5-terror-hotel/reviews) · [image](https://cdn1.epicgames.com/ue/product/Screenshot/15-1920x1080-03151baefdd9930ad63e3bcf3724af55.jpg?resize=1&w=1920) |
| 20 | THE BOILER ROOM: a corridor of pipes and lamps along timber walls | [backrooms.fandom.com](https://backrooms.fandom.com/es/wiki/Nivel_5) · [image](https://static.wikia.nocookie.net/backrooms/images/1/18/Level-5-Boiler.o.jpg/revision/latest?cb=20220108221601&path-prefix=es) |

## Level 6 — Lights Out (not built yet: the set is the brief)

Gathered 2026-10-14, before the level. Bing Images, five searches, ~290
candidates; 82 downloaded onto numbered contact sheets and viewed brightened
(most are nearly black at their own exposure). Title cards, hand-drawn and
wiki maps, LiDAR-scanner point clouds (a different game's mechanic), other
sub-levels (6.1, 6.5, -6), Minecraft blocks and the lit "neon" variants were
left out.

**What the 20 agree on.** No light but the one you carry: a flashlight cone,
or a single lamp far off. Rough grey concrete and cracked plaster walls,
bare doorways cut straight through them, uneven rubble floors, a few
cinder-block and brick runs, exposed pipes along the walls and dead
fluorescent tubes on the ceiling. Narrow corridors that end in black,
square rooms with two or three openings, a little abandoned clutter (a
table, a shelf, a bin, a stack of boards). Wet floors in the worst of it.
No colour at all.

**Measured.** All 20: (14, 14, 14), luminance 14 (2–51). That is a dead
neutral grey and the darkest set by far (the office's was (57, 52, 48) / 53,
the hotel's (82, 57, 34) / 62). The light in them comes from the player.

| # | What it shows | Source |
|---|---|---|
| 1 | The spawn: a black corridor, a doorway at its end, a sliver of light on the floor | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_6_-_Lights_out) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/0/08/Level_6_Spawn.png/revision/latest?cb=20230802070453) |
| 2 | A flashlight's beam on stained concrete walls, a gap between them, a railing beyond | [backroomsunlimited.fandom.com](https://backroomsunlimited.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backroomsunlimited/images/4/4a/Level6new.png/revision/latest/scale-to-width-down/1200?cb=20230516175536) |
| 3 | A torch on a rough rubble floor, two bare doorways in pitted concrete | [backrooms-redacted.fandom.com](https://backrooms-redacted.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backrooms-redacted/images/1/13/Level_6_Better.jpg/revision/latest?cb=20250517192459) |
| 4 | Black room, one doorway lit by the beam, cracked plaster | [backrooms-freewriting.fandom.com](https://backrooms-freewriting.fandom.com/wiki/Lights_Out_(Retake)) · [image](https://static.wikia.nocookie.net/backrooms-freewriting/images/1/18/Level_6.png/revision/latest?cb=20220919221628) |
| 5 | Night-vision view: mottled grey concrete corridor, square openings, step in the floor | [backrooms-redacted.fandom.com](https://backrooms-redacted.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backrooms-redacted/images/d/d1/Screenshot_20231111-142011_Roblox.jpg/revision/latest?cb=20231113164039) |
| 6 | Two doorways side by side, lumpy concrete floor in the torch | [backrooms-redacted-survival.fandom.com](https://backrooms-redacted-survival.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backrooms-redacted-survival/images/7/75/Level6Background.png/revision/latest?cb=20240613181723) |
| 7 | Camcorder footage: almost nothing, a wall edge and a doorway at the limit of the light | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/8/8f/Level_6_Screenshot_3.png/revision/latest?cb=20230718204730) |
| 8 | A wide black space, dead ceiling tubes, a grille and pillars catching the beam | [backrooms-universe.fandom.com](https://backrooms-universe.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backrooms-universe/images/8/86/Backrooms_Level_6_Image_1.png/revision/latest?cb=20260312191608) |
| 9 | A pipe down a wall, a doorway into a further room, cracked floor | [btb-taor-roblox.fandom.com](https://btb-taor-roblox.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/btb-taor-roblox/images/b/bb/Lights_out.jpg/revision/latest/scale-to-width-down/1200?cb=20250405170033) |
| 10 | Clutter in the dark: boards and signs leaning on a wall | [youtube (via a fan page)](https://storage.googleapis.com/dslmisifpfnrbe/lights-out-escape-the-backrooms.html) · [image](https://i.ytimg.com/vi/wBMgOMZvp0w/maxresdefault.jpg) |
| 11 | Camcorder: a lit patch of plaster wall, a bin and a chair at its foot | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/0/0f/Level_6_Screenshot_5.png/revision/latest?cb=20230718205026) |
| 12 | A maze of dark walls, one doorway bright at the end | [backrooms-freewriting.fandom.com](https://backrooms-freewriting.fandom.com/wiki/Level_6_(Retake)) · [image](https://static.wikia.nocookie.net/backrooms-freewriting/images/3/33/Level6MazeDark.jpg/revision/latest?cb=20251111165259) |
| 13 | Grey walls meeting a dark brick floor, the far end black | [backrooms-the-endless-mazes-of-death-2.fandom.com](https://backrooms-the-endless-mazes-of-death-2.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backrooms-the-endless-mazes-of-death-2/images/b/b3/Level_6_.jpg/revision/latest/scale-to-width-down/1200?cb=20220924015438) |
| 14 | A long narrow corridor, a single tiny lamp far off (aggregator; creator unconfirmed) | [pinterest](https://mx.pinterest.com/pin/172825704444844933/) · [image](https://i.pinimg.com/736x/82/af/28/82af28807c78f2c71866b975cdd4886c.jpg) |
| 15 | Camcorder: a bare concrete room, a metal table with bottles, a barred window, shelving | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/d/d5/Level_6_Screenshot_1.png/revision/latest?cb=20230718204657) |
| 16 | A pale wall slab standing in black | [the-random-backrooms.fandom.com](https://the-random-backrooms.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/the-random-backrooms/images/2/24/Level_6_Photo.png/revision/latest?cb=20230322121645) |
| 17 | Brick walls, pipes along them, one caged ceiling lamp | [the-backrooms-rebirth.fandom.com](https://the-backrooms-rebirth.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/the-backrooms-rebirth/images/1/1d/Tbrwikilevel6.PNG/revision/latest/scale-to-width-down/1200?cb=20220217235332) |
| 18 | Cinder-block wall corners, black between them | [backroomsunlimited.fandom.com](https://backroomsunlimited.fandom.com/wiki/Level_6) · [image](https://static.wikia.nocookie.net/backroomsunlimited/images/1/18/Level_6.png/revision/latest?cb=20210827150631) |
| 19 | A wet industrial corridor: pipes down both walls, puddles, one bulb in the distance | [backrooms-levels.com](https://backrooms-levels.com/levels/level-6/) · [image](https://backrooms-levels.com/images/levels/level-6-4.png) |
| 20 | A stained concrete corridor, pipes on the ceiling, one dead fluorescent | [backrooms-levels.com](https://backrooms-levels.com/levels/level-6/) · [image](https://backrooms-levels.com/images/levels/level-6-1.png) |

## Level 7 — Thalassophobia (sector T1)

Gathered 2026-10-14, after the level was built and before it opens. Three web
searches and the Level 7 pages and image lists of four Fandom wikis, the
creature pages ("The Thing on Level 7"), the wikidot wiki and 13 Steam
Workshop maps: 88 candidates on contact sheets. Left out: hand-drawn and
sketch art, fake photos (taped prints, glitch effects), title cards with text,
maps and icons, creature models on plain turntables, Backrooms Unlimited's
flooded-hallway Level 7 (not an ocean), and the GMod maps' yellow interiors
(they read as Level 0). **Eleven of the twenty are from one game, Escape the
Backrooms**, which carries a VHS timestamp overlay. No image anywhere shows the
creature from above the water, and none shows a dense sunken city.

**What the 20 agree on.** Dark slate-grey water, small choppy ripples, opaque:
you never see the bottom from the surface. A flat, shadowless overcast sky,
fog swallowing the horizon within a few hundred metres. Lone American wooden
houses standing low in the water (white clapboard, peeling paint, porches,
shingle roofs), a white lighthouse, a timber dock, a rowboat. Indoors, dim
rooms with peeling green paint over grey plaster, wooden stairs, a flooded
ground floor. Under the water: murky green with light shafts, then black. The
creature is a deep-sea anglerfish lit by its own glow.

**Measured.** All 20: (90, 93, 95), luminance 93 (6–154). By group: the
surface shots 126, the interiors 65, under the water 20.

| # | What it shows | Source |
|---|---|---|
| 1 | A flooded living room, a couch on its end, the back wall gone onto a foggy sea | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/d/db/Level_7_Screenshot_2.png/revision/latest?cb=20230718020144&format=original) |
| 2 | Wooden stairs and banisters, green paint peeling off grey plaster, one small lamp | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/7/7a/Level_7_Screenshot_10.png/revision/latest?cb=20230718021458&format=original) |
| 3 | An open door framing flat dark water to the horizon (GMod) | [Steam Workshop: gm_thalassophobia](https://steamcommunity.com/sharedfiles/filedetails/?id=2852195467) · [image](https://images.steamusercontent.com/ugc/1750231854665490869/0F5FBBF17C5E94D1A5AD586DA327FAB2E2EA3D28/) |
| 4 | A plain beige box hanging in a stormy sky over a hazy sea (GMod) | [Steam Workshop: Backrooms – Level 7](https://steamcommunity.com/sharedfiles/filedetails/?id=2799108192) · [image](https://images.steamusercontent.com/ugc/1821152507227870088/9109D0969738733110D48B064FC5683026834E1F/) |
| 5 | A sash window in a green peeling wall onto grey water, baskets standing in the flood | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/File:Level_7_Flare_Gun_House_Background.jpg) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/b/be/Level_7_Flare_Gun_House_Background.jpg/revision/latest?cb=20240714102846&format=original) |
| 6 | From a white porch between its posts onto grey water and a pale shape in the fog | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/7/7c/Level_7_Screenshot_8.png/revision/latest?cb=20230718021358&format=original) |
| 7 | A two-storey clapboard house low in the water, seen from a rowboat's bow | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/5/52/Level_7_Screenshot_11.png/revision/latest?cb=20230718021522&format=original) |
| 8 | One low house on the misty horizon past a rowboat's bow | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/5/59/Level_7_Screenshot_7.png/revision/latest?cb=20230718021055&format=original) |
| 9 | A row of small roofs just showing above the water, half lost in fog | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/f/f0/Level_7_Background_2.jpg/revision/latest?cb=20230804042145&format=original) |
| 10 | A white lighthouse standing out of grey water | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/c/cd/Level_7_Screenshot_13.png/revision/latest?cb=20230718021612&format=original) |
| 11 | A long timber dock ending in a white gate, junk at its foot | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/6/6a/Level_7_Screenshot_14.png/revision/latest?cb=20230718021635&format=original) |
| 12 | An empty rowboat drifting, three low houses on the horizon | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/8/80/Level_7_Promo_Textless.jpg/revision/latest?cb=20240522092837&format=original) |
| 13 | Standing on a dark shingle roof whose edge dips into the water | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/6/6f/Level_7_Screenshot_6.png/revision/latest?cb=20230718021033&format=original) |
| 14 | A photo: flat grey water fading into near-white fog | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/backrooms/images/b/b7/Level_7_background_2.jpg/revision/latest?cb=20250216135205&format=original) |
| 15 | A photo: a dark steel-blue sea under a hazy sky | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/backrooms/images/c/cf/Level_7_background.jpg/revision/latest?cb=20250208155158&format=original) |
| 16 | A drone photo straight down on open blue sea, darker toward the bottom | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/backrooms/images/c/cc/Level_7_drone_shot.jpg/revision/latest?cb=20250415022447&format=original) |
| 17 | Murky green underwater, light shafts on rocks and kelp, a dark mass behind | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/c/cf/Level_7_Underwater_Teaser.jpg/revision/latest?cb=20240122045250&format=original) |
| 18 | A very dark brown-green bottom, rocks and weed, barely lit | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/File:Level_7_Underwater_Background.jpg) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/7/7a/Level_7_Underwater_Background.jpg/revision/latest?cb=20240715000506&format=original) |
| 19 | The creature: an anglerfish, needle teeth and a lure, pale in black water | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/The_Thing_on_Level_7) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/3/38/The_Thing_on_Level_7_fandom_wiki.jpg/revision/latest?cb=20230705020256&format=original) |
| 20 | A deep-sea fish glowing blue with long filaments, in black water | [backrooms-freewriting.fandom.com](https://backrooms-freewriting.fandom.com/wiki/The_Thing_on_Level_7) · [image](https://static.wikia.nocookie.net/backrooms-freewriting/images/d/df/The_Thing_on_Level_7_image_2.png/revision/latest?cb=20250507080412&format=original) |

### The verdict (law 8)

**Matches.**
- The sky and fog are (127, 138, 142) on T1, against the references' surface shots at 126: the same flat grey day, no sun, no shadows.
- The water is a dark slate grey (0x3c4a4c), opaque from above, with small ripples, as in every surface shot.
- Under the surface the view goes green-black and closes in with depth, like 17 and 18.
- The creature is never shown whole, which suits a set where it is only ever seen in the black.

**Fixed now.** The tower's floor was office carpet. It is wood planks, like the houses' floors in 1, 2 and 5.

**Brought to Josh, not changed: the city is not the references' town.** The references show a few wooden houses in open water: white clapboard, porches, shingle roofs, a lighthouse, a dock and rowboats. T1 is a concrete and brick city drowned to its roofs. That was the map Josh approved ("1. A 2. A 3. Sure"), so it was not quietly redrawn. If he wants it closer to the canon, there are three ways to do it:
- a clapboard-house block type mixed into the city;
- a lighthouse as a landmark on the edge of the Drop;
- the Poolrooms' boats on the streets.

The tower's walls are beige plaster, not the references' peeling green. That is one Look change in the editor if he wants it.

## Level 8 — The Cave System (sector C1)

Gathered 2026-10-15, before the level is built: the set is the brief. The
Level 8 pages and image lists of five Fandom wikis (Escape the Backrooms,
the Backrooms wiki, backrooms-freewriting, the-random-backrooms,
the-backrooms-rebirth) and the wikidot wiki, three GMod Steam Workshop maps
(24 screenshots), and Wikimedia Commons for the parts of our design the canon
doesn't cover: ~80 candidates on contact sheets. Left out: the cartoon mascot
art on wikidot, maps and diagrams, title cards, the freewriting wiki's Level 8
(a lit blue office, not a cave), the Escape the Backrooms note and VHS
backdrop, and the GMod maps' stalactite-on-a-flat-wall shots. **No image
anywhere shows a subway, or any eyeless burrowing creature**: those are
ours.

**What the 20 agree on.** Near-black, natural rock: grey to warm brown
limestone, broken into boulders and scree on the floor, the walls fractured
in big slabs. Two scales and nothing between: chambers too big for a torch to
reach the far wall, and passages you squeeze through on hands and knees
(the Backrooms wiki calls the low ones "The Burrows"; wikidot's text is a
crawl). The only human things are old and rotten: plank bridges hung on rope
over drops, wooden ladders up shafts. Light is the player's torch, a warm
lamp-pool here and there, or one shaft of pale light falling from high above
(Escape the Backrooms' Giant Room, Gaping Gill). Water is black or
black-teal and still, under hanging stalactites. Every way out canon gives
goes UP: a ladder into fog, a ladder up a shaft to a round hole.

**Measured.** All 20: (65, 60, 53), luminance 60 (6–125). That average is
lifted by the real photos, which are flash-lit and show-cave-lit: the eight
real ones are (92, 84, 73) / 84, the Station three (81, 76, 58) / 75. The
canon twelve are (47, 44, 39) / 44, and the game screenshots alone, without
the fog-ladder shot, are (23, 22, 18) / 22 — as dark as Level 6's set (14),
and slightly warm where Level 6 was dead grey.

| # | What it shows | Source |
|---|---|---|
| 1 | A huge chamber, a flat slab of rock overhanging it, a warm pool of light on a floor of loose stones | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/b/bf/Level8.png/revision/latest?cb=20230324192410) |
| 2 | "Giant Room": a towering grey rock face in the dark, one beam of light falling from far above | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/7/75/Lvl8bigcave.png/revision/latest?cb=20240723130346) |
| 3 | "A Hole": a jumble of warm-lit boulders around a lit hole in the floor, the way on | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/1/13/Lvl8End.png/revision/latest?cb=20240723130528) |
| 4 | "Claustrophobic Area": a flashlight cone on bare rock, black everywhere else | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/e/e6/Lvl8.png/revision/latest?cb=20230324193040) |
| 5 | A metal ladder climbing out of the cave into pale fog, the exit | [escapethebackrooms.fandom.com](https://escapethebackrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/escapethebackrooms/images/3/3f/Lvl8Ladder.png/revision/latest?cb=20240723130622) |
| 6 | "The upper surface": a blue-grey cavern full of mist, a faint glow in the haze | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/backrooms/images/a/a0/The_Hive_New.png/revision/latest?cb=20241007224941) |
| 7 | A frail bridge: rotten planks and rope rails across a rock shaft, half collapsed | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/backrooms/images/3/35/Level_8_Bridge.png/revision/latest?cb=20240423160304) |
| 8 | "The Burrows": a narrow tunnel of pinkish-grey rock running into black | [backrooms.fandom.com](https://backrooms.fandom.com/wiki/Level_8) · [image](https://static.wikia.nocookie.net/backrooms/images/5/5b/Level_8_Burrows.jpg/revision/latest?cb=20241007035619) |
| 9 | "A dark cave greets wanderers surfacing from the waters": a stalactite curtain over black-teal water | [backrooms-wiki.wikidot.com](https://backrooms-wiki.wikidot.com/level-8) · [image](https://backrooms-wiki.wdfiles.com/local--files/level-8/Level-8-cc.png) |
| 10 | "A narrow vadose trough": a tall, body-wide slot of grey rock, a trickle on its floor | [backrooms-wiki.wikidot.com](https://backrooms-wiki.wikidot.com/level-8) · [image](https://backrooms-wiki.wdfiles.com/local--files/level-8/Vadose_cave.jpg) |
| 11 | A wooden ladder up a brown earth-and-rock shaft to a round hole (GMod) | [Steam Workshop: backrooms level 8](https://steamcommunity.com/sharedfiles/filedetails/?id=3373043127) · [image](https://images.steamusercontent.com/ugc/26554304323037166/2D0CCF653D5095F6742C6160AEA03FFD3D8A2ADD/) |
| 12 | Dark grey boulders under a low rock ceiling (GMod) | [Steam Workshop: Backrooms Level 8: Cave System](https://steamcommunity.com/sharedfiles/filedetails/?id=2885933568) · [image](https://images.steamusercontent.com/ugc/1921375899599493916/5F4BE87F002A761E02BE564A2BF4ED3C6D53C2CE/) |
| 13 | Real: an abandoned subway platform (Chambers St, New York): cream tile columns, a platform edge, rails into the dark | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:NYCS_BMT_Nassau_Chambers_abandoned_platform.jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/1/10/NYCS_BMT_Nassau_Chambers_abandoned_platform.jpg) |
| 14 | Real: a flooded subway tunnel (14th St, after Hurricane Sandy): black water over the trackbed, a catwalk, cables on the wall | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:14th_Street_Tunnel_after_Hurricane_Sandy_vc.jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/0/05/14th_Street_Tunnel_after_Hurricane_Sandy_vc.jpg) |
| 15 | Real: a subway station cut into raw bedrock (Kungsträdgården, Stockholm): the train and platform under a rough rock vault | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Kungstr%C3%A4dg%C3%A5rden_Metro_station_May_2014_02.jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/0/07/Kungstr%C3%A4dg%C3%A5rden_Metro_station_May_2014_02.jpg) |
| 16 | Real: a limestone chamber hung with stalactites and flowstone (Carlsbad Caverns, Big Room) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Big_Room,_Carlsbad_Cavern_(51202435701).jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/8/8d/Big_Room%2C_Carlsbad_Cavern_%2851202435701%29.jpg) |
| 17 | Real: an underground river under hanging rock (Puerto Princesa) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Puerto_Princesa_Subterranean_River_-_PuertoPrincesaSR1760.jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/5/54/Puerto_Princesa_Subterranean_River_-_PuertoPrincesaSR1760.jpg) |
| 18 | Real: an old rope bridge, planks on two ropes, slung across a chasm (Carrick-a-Rede, an early photo) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Carrick-A-Rede_Rope_Bridge,_Co._Antrim_(7975577852).jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/f/fe/Carrick-A-Rede_Rope_Bridge%2C_Co._Antrim_%287975577852%29.jpg) |
| 19 | Real: a caver in a tight squeeze, helmet lamp, rock pressing in on every side | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Caver_in_a_tight_squeeze_(19a4b55a-016e-f453-aaf7-aab6b24a590a).JPG) · [image](https://upload.wikimedia.org/wikipedia/commons/d/df/Caver_in_a_tight_squeeze_%2819a4b55a-016e-f453-aaf7-aab6b24a590a%29.JPG) |
| 20 | Real: a vertical shaft seen from the chamber floor, daylight falling down it (Gaping Gill) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Gaping_Gill_main_chamber_-_geograph.org.uk_-_227709.jpg) · [image](https://upload.wikimedia.org/wikipedia/commons/7/7c/Gaping_Gill_main_chamber_-_geograph.org.uk_-_227709.jpg) |

### Verdict for our build (law 8)

**Walls, floors, ceilings.** The Station is cream glazed tile on square
columns, a concrete platform with a yellow edge, rusted rails, cables along
the tunnel wall (13, 14). Where the tunnel breaks into the cave, the tile and
concrete stop at raw rock and the rock takes over the vault, as in 15: the
seam should read as the cave eating the station, not as a doorway. The
Caverns are limestone in grey-brown, fractured into big slabs, with scree
and boulders on uneven floors, stalactites and flowstone overhead (1, 2, 16).
The Deep is the same rock pressed close: tall body-wide slots and low crawls
(8, 10, 19), no stalactites, no scale.

**Fixtures and light.** Darker than any level but Lights Out. The game
screenshots measure 22; aim for near-black Caverns and Deep, lit by the
player's torch. Under the fixture law that leaves: on the Station, dead
fluorescent battens and the odd caged emergency lamp still glowing; in the
Caverns, a few old work lamps or lanterns on a sagging cable (canon's "signs
of past wanderer habitation"), giving 1's warm pools; in the Deep, nothing.
The Chimney is the one cool light in the level: the streetlight through the
manhole, falling as a pale beam down the shaft (2, 20, and 5's fog).

**Colour.** Slightly warm grey-brown, about (23, 22, 18) at the game
screenshots' exposure; the real photos give the hue, not the brightness.
The river is black-teal and still (9, 6), not show-cave turquoise (17).
The Station is the warmest and brightest part, cream and rust.

**Scale.** Chambers where the torch doesn't reach the far wall or the
ceiling (1, 2); then passages one body wide (8, 10, 19).

**Clutter.** Scree, fallen slabs, a dead train's cars, debris on the
trackbed. The bridges are rotten planks on rope rails with gaps (7, 18),
not a tidy suspension bridge; an old wooden ladder or two; a wanderers'
den with old supplies.

**Where canon disagrees with our design.**
- Canon Level 8 is wholly natural; wikidot says it is "generally free of the visage of human engineering". The subway station is ours. It is the right bridge from a drowned city, and canon backs the arrival: wikidot's "a dark cave greets wanderers surfacing from the waters", and the-random-backrooms enters from a cave at the bottom of Level 7's ocean.
- Canon's ways out are ladders (5, 11), not a rope; a rope fixed at the foot of the Chimney is still a climb up a shaft into pale light, which is canon's image.
- Canon's creatures are moths (Deathmoths, Mortisdoptera), giant spiders (Troglosidae) and skin-stealers. Nothing burrows or clicks; the Burrower is our own. The Backrooms wiki's "The Burrows", tight tunnels below the cave floor that "shift when unobserved", is where it belongs. The moths are already Level 5's, so they are rightly not reused.

**Questions for Josh.**
- **How dark?** The canon is near-black. Lighting the Caverns only with sparse old work lamps and the torch is faithful, but law 11 may call it too hard with the Burrower about. Does he want that, or more lamps?
- **Which subway?** Should the Station read as New York (cream tile and columns, 13) or Stockholm (a station blasted into bare rock, 15)? 15 makes the break-in to the cave read naturally; 13 is the more "Backrooms" look.
- **The river's colour.** Black-teal and opaque like Level 7's sea (recommended), or clear show-cave blue?

## Level 9 — The Suburbs (sector U1)

Gathered 2026-11-01 for law 8's reference task (the Nov 2026 polish round). Nothing was downloaded.

**Sources:**
- The canonical wikidot entry, "Level 9 — The Suburbs".
- Its pantheon mirror (the same two images, so not counted twice).
- The A-Sync investigation wiki's "Darkened Suburbs".
- A fan ASYNC archive page.
- For the parts the canon leaves to the imagination, real night photographs of residential streets from Wikimedia Commons and Unsplash.

The Backrooms Fandom page (backrooms.fandom.com/wiki/Level_9 and 9.6) refused automated fetches (HTTP 402) and the Steam Workshop rate-limited, so neither is in the set.

**Caveat, stated plainly:** descriptions below come from each image's caption or alt text and the page around it. Unlike the earlier levels' sets, these images were **not** viewed on a contact sheet, because the task forbade downloading them. Before this goes into REFERENCES.md, somebody should open the 20 links and swap any that disappoint.

**What the canon says** (wikidot):
- An infinite suburban area, always midnight.
- Dark "similar to Level 6, though not as dangerous".
- Houses are varied, mostly new and fully furnished (sofas, TVs, beds, fridges), but nothing electric works. Some are empty, some have furnished back yards, near-identical pairs occur, and two houses are sometimes clipped into each other.
- The streets are the most dangerous part: wet, unpainted asphalt, partly covered in leaves, with puddles. Sidewalks are ordinary stone.
- Street lamps are usually off; some flicker and a few occasionally have power.
- Fog sometimes rolls in.
- **The Neighborhood Watch** is listed as one of the level's own entities. (In the A-Sync wiki it is a giant walking eyeball; ours is our own take.)
- Exits include walkways into grass fields (to Level 10), arrows to Level 11, and playground tubes.

**What the real photographs agree on:**
- One or two sodium-orange or cold-white streetlights carrying a whole street, with deep shadow between them.
- Bare or dark trees.
- Kerbs and driveways, with parked cars.
- Utility poles and overhead wires.
- **Windows** — dark, or with a blind drawn.
- Porches with one light.
- Wet asphalt reflecting the lamps.
- Fog haloing the lamps.

| # | What it shows | Source |
|---|---|---|
| 1 | Canon: "The Empty Roads of Level 9", an empty night street in the suburbs | [backrooms-wiki.wikidot.com](https://backrooms-wiki.wikidot.com/level-9) · [image](https://backrooms-wiki.wdfiles.com/local--files/level-9/Level-9-1-cc.jpg) |
| 2 | Canon: "A picture of a House in Level 9", a furnished suburban house at night | [backrooms-wiki.wikidot.com](https://backrooms-wiki.wikidot.com/level-9) · [image](https://backrooms-wiki.wdfiles.com/local--files/level-9/Level-9-2-cc.jpg) |
| 3 | A-Sync wiki's "Darkened Suburbs" header image: the always-midnight maze of streets (no caption) | [a-syncbackroomsinvestigationwiki](https://a-syncbackroomsinvestigationwiki.webador.es/level-9-darkened-suburbs) · [image](https://primary.jwwb.nl/public/q/h/c/temp-pnbuclagnsxzhcbykvkc/level9.png) |
| 4 | Fan ASYNC archive, Level 9: near-identical houses in a grid, dim orange streetlights, starless sky (page image `level9.webp`; fan work, creator unconfirmed) | [miravoltsyt.github.io](https://miravoltsyt.github.io/ASYNC-CONFIDENTIAL-FILES/level9.html) |
| 5 | Real: streetlights haloed in fog on a residential street at night | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Streetlights_illuminating_fog_on_a_residential_street_at_night.jpg) |
| 6 | Real: a quiet residential street at night lined with wooden houses, soft streetlights | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:DSC_8336_Quiet_residential_street_at_night_lined_with_traditional_wooden_houses_and_soft_streetlights.jpg) |
| 7 | Real: a quiet residential street of modest houses lit by one row of streetlights | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:DSC_8333_Quiet_residential_street_at_night_lined_with_modest_houses_and_lit_by_a_lone_row_of_streetlights.jpg) |
| 8 | Real: suburban trees at night, black against a lit sky | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Suburban_Trees_at_Night_-_geograph.org.uk_-_3948516.jpg) |
| 9 | Real: a quiet street at night, a warmly lit neighbourhood under streetlights, one car | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:DSC_7675_Quiet_illuminated_main_street_at_night_-_a_lone_car_moves_through_a_warmly_lit_neighborhood_under_streetlights.jpg) |
| 10 | Real: an empty street at night, trees lining the sidewalk, kerbside pools of light | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:DFC_0766_Empty_well-lit_street_at_night_with_a_few_stray_dogs_resting_along_the_curb_and_trees_lining_the_sidewalk.jpg) |
| 11 | Real: streetlights over a dark suburban street at night | [unsplash.com](https://unsplash.com/photos/streetlights-illuminate-a-dark-suburban-street-at-night-IUCq3D25hVc) |
| 12 | Real: a quiet residential street under bright overhead streetlights (Unsplash+) | [unsplash.com](https://unsplash.com/photos/residential-street-at-night-mn7R1gwn4Bg) |
| 13 | Real: a foggy street at night, utility poles and glowing streetlights | [unsplash.com](https://unsplash.com/photos/foggy-street-at-night-with-utility-poles-and-glowing-streetlights-Fzcuc7F4JKE) |
| 14 | Real: one bright street lamp over a dark intersection, black and white | [unsplash.com](https://unsplash.com/photos/street-lamp-illuminating-dark-intersection-5CcvSRxy6Ws) |
| 15 | Real: a garage lit by a single light at night | [unsplash.com](https://unsplash.com/photos/a-garage-illuminated-by-a-bright-green-light-at-night-LGWXfkzwerg) |
| 16 | Real: a white-and-brown house at night under a deep blue sky | [unsplash.com](https://unsplash.com/photos/DYSFOYAbHUY) |
| 17 | Real: a white-and-black house at night | [unsplash.com](https://unsplash.com/photos/DYgv51CoT1A) |
| 18 | Real: one streetlight on a dark, empty street | [unsplash.com](https://unsplash.com/photos/a-streetlight-illuminates-a-dark-empty-street-at-night-2sXSOLRDPLQ) |
| 19 | Real: "Evening quiet on a suburban street", wet pavement reflecting streetlight, bare trees both sides (QY Liu, via an Unsplash mirror) | [sampleshots.com](https://www.sampleshots.com/photos/uoBpcYDcVmk/) |
| 20 | Real: a residential street at night under its lamps (UK terraces, the nearest Commons match for a street-level night view) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Carline_Road_at_night_-_geograph.org.uk_-_630423.jpg) |

### Verdict for our build (law 8)

The build was judged in the real client: the rig's auto and torch runs, close-ups, and the Watch summoned on foot (audit shots `L9\`, `L9t\`, `L9s\`, `L9c\`).

**Matches.**
- **Always midnight under a navy, starless sky.** Fog closes in at 8–64 m, which is canon's dark and its occasional fog.
- **Most streetlights are dead**: 25 lit lamps, with 97% of the outdoors dark. The few that work throw small pools, as canon says ("usually off, some flicker, a few have power"). The lit ones are a pole and a caged fixture, which obeys the fixture law.
- **Houses are furnished, with no power.** Inside is the dark of an empty house; the beds, sofas and wardrobes are there.
- **The same few plans repeat**, which canon backs ("near-identical pairs").
- Picket fences between lawns, a privacy fence at the edge, hip roofs, five siding colours, a park and a playground. The playground is canon's own landmark.
- **The Neighborhood Watch is a canon entity name**, and patrolling the streets is its canon job.
- **Measured brightness**, mean luminance 0–255 without the torch:
  - Outdoors: road 10.7, yard 10.1, park 12.5, sidewalk 7.5.
  - Indoors: house 3.4, garage 4.1.
  - That sits with the earlier dark levels and with canon's "darkness similar to Level 6". The real photographs are much brighter, but they are exposed for a camera, not for dread; they give the hue, not the brightness.

**Gaps** (filed as findings in L9.md):
- **No windows on any house.** Every photograph and the canon house picture have them, and it is the defining image of a liminal suburb at night. Our own relic says every front window carries a Watch sticker. (L9-03)
- **Furniture glows in the dark houses**, lit by the moon and the sky light, while the rooms are black. (L9-02)
- **Number 9's whole lot is hardwood flooring**, not a lawn with a porch. (L9-04)
- **Trees read as lollipops; the parked car reads as a crate.** (L9-05, L9-06)
- **The canon's street detail is missing**: wet leaves and puddles on the road. So is the photographs' small furniture of a street: utility poles and wires, a mailbox at every kerb, driveways and garage doors. (L9-10)
- **A floating casino scoreboard is every house's TV.** (L9-01)

**Colour.** Ours is navy-blue cold light outdoors (fog 0x0b1020), with the few lamps warm. Most of the photographs are sodium-orange streets. Canon names no colour. Ours reads as moonlight, which suits "the light is safety" because the pools stand out; that is a taste call for Josh.

**Where our design departs from canon, on purpose:**
- Canon's Watch is (in one wiki) an eyeball. Ours is a tall man in a windbreaker with a painted smile, Josh's pick.
- Canon's exits are walkways and arrows. Ours is Number 9's front door, the end of the descent.
- Both are fine: the canon disagrees with itself across wikis.


**Since fixed, in the same polish round:** windows on every house (L9-03, dark glass in a painted frame), furniture no longer glowing in the dark houses (L9-02: kit props take their cell's baked light on every level), Number 9's lot is lawn again (L9-04), and the floating casino scoreboard is gone as the TV (L9-01).

**Questions for Josh.**
- Should the street lamps be **sodium orange** like the photographs, or stay cold white?
- Is the **window treatment** fine: dark glass, never lit?
- Would he like the canon's **wet leaves and puddles** on the roads?
