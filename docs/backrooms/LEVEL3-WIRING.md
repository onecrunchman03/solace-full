# Level 3 wiring checklist — every place Pipe Dreams (Level 2) is wired in

Traced Oct 9 2026, while starting Level 3 (the Electrical Station, `sectorS`).
Line numbers drift; the names don't. Work through it group by group, and tick
the box beside each entry when Level 3 has its branch there.

## Where it stands (Oct 9 2026)
- Stages 1–4 done: the props, the map (S1), the server (breakers, cutoffs, blackouts, arcs, live water, travel, the ship gate) and the client (rendering, levers, power, arcs, HUD, the hub). Walked in a local browser: breaker thrown end to end, live water and blackouts drawn, an arc caught firing, and a death to the hazards.
- Stage 5 done: THE BLEEDER (`test_bleeder.mjs`, 27). Next: stage 6 the map editor, then the harness rows below and Josh's Test play walk.

## Headline facts
- **Pipe Dreams' steam vents and hot pipes are NOT hazards.** Only a deco code
  (`PDECO.vent`), a glyph and a placement rule exist — no server damage, no
  wire, no client rendering. Their sounds (`steam-*`, `pipe-burn`) are unused.
  Level 3's arcing panels copy the BROWNOUT clock (service.ts) and the
  DROWNING / GATOR damage shape (`hurtCb({cause})`, `killPlayer(s, cause)`),
  not the vents.
- **The Grabber was never built.** Design text + five unused sounds + the
  `SAFE_TYPES` rooms. Pipe Dreams' only creatures are editor-spawned Entities.
  The Bleeder's template is the Level 0 STALKER (its burn rule).
- **No DB migration is needed**: every table is keyed by level number or
  sector id.

## (A) Level unions and shared types
- [x] `BrLevel = 0 | 1 | 2` (service.ts) → add 3; ripples through every signature
- [x] `OperatorView` monster/objective kinds → `bleeder`; `breaker`, `cutoff`, `shutter`
- [x] `DistrictType` union (worldgen.ts) → the station's room types
- [x] a `station-vocab.ts` shaped like `pipes-vocab.ts` (types, safe types, deco codes, named — no magic numbers)
- [x] `Dialect.level` (tiles.ts) → the station dialect sets `level: 3`
- [ ] `marks.ts` marker `levels: [0, 1, 2]` → add 3 (+ a bleeder marker if it gets spawners)
- [ ] `kit.ts` signs/shapes `levels: [0, 1, 2]` → add 3
- [ ] `scripts/props/build.mjs` `LEVELS_OF` → `station: [3]` (and `industrial: [2, 3]`), rebuild the catalogue
- [x] client `gamenet.ts`: `ChunkFrame.level`, `Welcome.level`, `onMarksBatch`, `TravelFrame.level`, `SprayMark.level`, `enter(level?)`, `OperatorView.level`
- [x] `lib/brtest.svelte.ts` `brTest.level`; `lib/api.ts` `backroomsMap(level)`, `level2Open`/`pipesDoors`/`insideByLevel`/`myRun.level` → `level3Open`, `stationDoors`

## (B) World generation
- [x] `worldgen-station.ts`: `SECTOR_S`, `SECTOR_S_FINGERPRINT`, `STATION_LIBRARY`, `planStationSector`, `generateStationSector`, `validateStationSector`, and the SECTION partition (breakers and cutoffs live on it)
- [x] `station-tiles.ts` (the dialect): glyphs for breaker, cutoff, arcing panel, live-wire run, puddle, shutter; a section per room; its lint
- [x] `station-rooms.json` (the room library)
- [ ] `designs.ts`: `EDITABLE_LEVELS`, `LEVEL_NAMES`, `designSectorId`, `repoDesign`, `roomProblems` (**falls through to Pipe Dreams' lint for any level ≥ 2**), `buildLevelMap` (`if (level !== 2) throw`) → a `buildStation` with the station's rules
- [x] every breaker, cutoff, the shutter and the Bleeder's starts through `placement.ts` (THE PLACEMENT LAW)
- [x] `lore.ts`: `LEVEL4_FLAG`, `BREAKER_COUNT = 6`, `breakerFlag(i)`
- [ ] `relics.ts`: `STATION_RELICS` into `ALL_RELICS` **in the commit that opens the level** (+ `pandora.ts` `LEVEL_RELICS`)
- [ ] `surfaces.ts`: station surfaces (the ambientCG picks) + a `station` room sound

## (C) Server runtime — service.ts
- [x] imports (worldgen, `STATION_RELICS`, `LEVEL4_FLAG`, breaker flags)
- [x] boot: a `bootS` block — `sectorS`, `sectorIdS`, `STATION_UNFROZEN`, `enabledS`, boot logs
- [x] `secBy`, `sectorIdOf`; fog: `fogS`, a fourth dirty flag, 3 in the flush loop
- [x] spawned Entities: `seatSpawners(3)`
- [x] **generalise `litByFlashlight` / `facingOf`** (bound to the stalker and Level 0's `lineWalkable`) to `(sec, cx, cy, prey)` — the Bleeder's held-beam rule
- [x] the Bleeder: `bleederTick` in `startEntity`, `onBleeder`, a `BleederEvent`, admin `summonBleeder`, hearing (`entityHears`, footsteps in `move`)
- [x] hazards: per-section blackouts + cutoffs (the brownout clock's shape), arc / electrified-water damage (the drowning / gator shape)
- [x] corpses: `row.sector === sectorIdS ? 3`; drops `for lvl of [0,1,2,3]`; `keyHolder` length 4
- [x] relics: `relicSitesS` + `spawnRelicS(STATION_RELICS)` + two initial spawns
- [x] breakers/cutoffs/shutter block (`placeBreakers()`), read by NAMED station deco codes
- [x] getters `sectorS`, `enabledS`, `fogS`, `exploredCountS()` (+ interface lines)
- [x] `swapMap` and `swapDressing` level-3 branches; `beginTest`/`endTest` ternaries (they fall through to D)
- [x] `travel`: the pressure door with `LEVEL3_FLAG` → `s.level = 3` at `sectorS.doors[0]`, `revealAround(3, …)`; the shutter answers `not_built` until Level 4
- [x] `activeRelics` S sites; `activeDrives(3)` → `[]` (no drives)
- [x] `takeKey`/`openDoor` early return for 3
- [x] `breakerSites()`, `throwBreaker`, `cutoff`, `level4()`
- [x] `setFly` landing ternary; `resetWorld` (**it never wiped D either — fix both**); `operatorView` and `debugState` level-3 branches; `takeRelic` ternary
- [x] `enter`: a level-3 gate (`station_offline` / `station_locked`, admin exempt) — and the SHIP GATE's own switch so members wait for Josh's Test play
- [x] `exit` level-3 branch (`sectorS.doors`)
- [x] `move`: hazard checks; `chunkFor`: stream the section id / power state

## (D) Wire — net.ts
- [x] `secFor`, `zoneDetail` → `"station"`; the 2.5s stream's level-3 branch (relics, breakers, cutoffs, shutter)
- [x] a Bleeder relay (`sendNear(3, …)`, kill → `dead` with cause); a blackout / power relay per section
- [x] `enter`: `wantLevel` **clamps to 2** → accept 3; the welcome's power state; travel's mini-welcome too
- [x] `throw-breaker` / `cutoff` messages; `backrooms.level4` (bus.ts, realtime.ts, sterling.ts lines)

## (E) Routes
- [x] `/api/backrooms/map`: `?level` **clamped to 0..2** → 3; `level3Open`, `exploredCountS`, the debug branch
- [x] `/api/backrooms/status`: `level3Open`, `stationDoors`, `insideByLevel [0,1,2,3]`
- [x] `routes/mapeditor.ts`: `playing` and heat-fog ternaries

## (G) Client game
- [x] `BackroomsGame.svelte`: `enterLevel` type; the lamp-loaded rebuild; `level`/`styleFor`/`floorSurface`; breaker/cutoff/shutter sites through `pinToGround`; `onWelcome` and **`onTravel` (which has NO level-2 branch — see Bugs)**; travel/denied messages; `onLevel4`; the breaker/power handlers; an `arc` hurt cause; the E key; the HUD
- [x] `world.ts`: `STATION_CEILINGS` into `HEIGHT_BY_TYPE`; `buildStationMats`; `LevelStyle` + `applyLevelEnvironment` station branch; **per-section lamp darkening** (not the global `setPowerLevel` dial); the light field; fixtures via `instanceFixture` (the fixture law)
- [ ] a `station-props.ts` (client tables agreeing with the server's, harness-checked)
- [ ] `ambience.ts`: a station bed; the Bleeder's six sounds (`/assets/station/bleeder/*.ogg`)
- [ ] `opmap.ts` `MONSTER_NAME` + objective kinds; `Roster.svelte` zone line

## (H) Hub, map editor, guide
- [x] `Backrooms.svelte`: `selLevel`/`playingLevel`, `level3Open`, `levelReachable`, `LEVEL_NAME`, door lists, rail labels, legend
- [ ] `MapEditor.svelte`; `mapeditor/levels.ts` (a `STATION` kit — **`levelKit` falls back to PIPES**); `editor.ts` (`#lvl` select, markers, hints, `LEVEL_OWN`, the new-room template); `preview3d.ts`; `mapview.ts` (**treats every `level !== 1` as Pipe Dreams deco**); `guide.ts` (`by()` three-way → four)

## (I) Scripts and harnesses
- [ ] `pull-map.mjs` (level 3 row), `render-station.mjs`, `gen-sounds.mjs` station set (ambience, arc warn/burst, breaker throw, shutter, buzz)
- [ ] `test_progression` (pressure door → Level 3 → six breakers → the shutter), `test_placement` (`secs`, `RELIC_MIN`), `test_flycam` (a level-3 row), new `test_station.mjs` + `test_station_live.mjs`, `test_mapeditor` level-3 coverage, `test_pandora` (4 of 10 levels, 40 of 100 relics) and `test_vip` (relic total 40) **when it opens**, new `test_bleeder.mjs`
- [ ] `pandora.ts` `LEVEL_RELICS`, `voss.ts` (`levelsOpen()` ignores `LEVEL3_FLAG`; `/ada levels` stops at Level 2)

## Bugs found while tracing (fix as they're reached)
1. **FIXED (stage 4: one `dressDoors` for welcome and travel).** `onTravel` (BackroomsGame.svelte) had no level-2 branch: after dropping through the Poolrooms hatch, E at the drain does NOT exit (only after a welcome), the door reads "Level 0" and the arrival note says "yellow wallpaper".
2. **FIXED (stage 3).** `resetWorld` never wiped `sectorIdD` fog, marks or drops.
3. `litByFlashlight` is bound to the stalker and Level 0.
4. Pipe Dreams' fuse block reads deco by magic numbers (6 / 12 / 5).
5. `designs.ts` `roomProblems`, `levels.ts` `levelKit` and `mapview.ts` silently treat any new level as Pipe Dreams.
6. **FIXED (stage 3).** `net.ts` `enter` and `routes/backrooms.ts` `/map` clamp the level to 0..2.
7. Brownouts reach only Level 0's clients though the timer fires for every level.
8. `voss.ts` `levelsOpen()` ignores `LEVEL3_FLAG`; `achievementFacts` counts only `level1_unlocked`.
9. Pipe Dreams has no lore drives, though BACKROOMS.md says 20.
