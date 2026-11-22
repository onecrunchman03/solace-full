// THE MAP EDITOR's routes — Admin Panel → Map editor (Josh, Sep 2026: "I
// would the editor to be available in the admin panel so I can design and
// redesigns maps").
//
//   GET    /api/admin/maps/:level          the draft (or the live library),
//                                          the version history, who's inside
//   POST   /api/admin/maps/:level/draft    save work in progress — never
//                                          touches the live map
//   DELETE /api/admin/maps/:level/draft    throw the draft away
//   POST   /api/admin/maps/:level/build    build the level a library makes
//                                          (the editor's whole-map view)
//   POST   /api/admin/maps/:level/publish  put it live: the rooms must pass
//                                          the checker, the map must pass the
//                                          level's rules, nobody may be inside
//   POST   /api/admin/maps/:level/revert   copy an old version into the draft
//   GET    /api/admin/maps/:level/export   the library as the repo file reads
//                                          (how a published design gets back
//                                          into git — Claude pulls it)
//   GET    /api/admin/maps/:level/heat     what players did on the map being
//                                          played: where they died, and which
//                                          cells anyone has ever charted
//   POST   /api/admin/maps/:level/compare  an old version beside the draft:
//                                          both maps, and what changed
//   POST   /api/admin/maps/:level/playtest play the draft for real, alone:
//                                          the level plays it until the test
//                                          ends (…/playtest/end, walking out,
//                                          dying, or an hour)
//   POST   /api/admin/map-surfaces         upload a texture (raw bytes;
//                                          ?kind=&name=&sizeM=&level=)
//   PATCH  /api/admin/map-surfaces/:id     rename it / change its size
//   GET    /api/br-surface/:file           the picture itself — public, so
//                                          the game's texture loader can fetch
//                                          it; UUID-named and immutable
//
// Levels 0 (the Lobby), 1 (the Poolrooms) and 2 (Pipe Dreams) are built from rooms.
// Admin-only, all of it. A publish is audited: it changes the world every
// player walks.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { json, readRawBody, type Router } from "../http";
import { config } from "../config";
import { type CustomSurface, type SurfaceKind, setCustomSurfaces, customSurfaces } from "../backrooms/surfaces";
import type { Store } from "../db/store";
import type { BackroomsService, BrLevel } from "../backrooms/service";
import { formatLibrary, type TileDef } from "../backrooms/tiles";
import { sectorFingerprint } from "../backrooms/worldgen";
import { EDITABLE_LEVELS, LEVEL_NAMES, designSectorId, repoDesign, readLibrary, readSeed, roomProblems, buildMap, libraryChanges } from "../backrooms/designs";

const SURFACE_DIR = path.join(config.uploadsDir, "surfaces");
const MAX_SURFACE_BYTES = 8 * 1024 * 1024;
const SURFACE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;
/** Type from the BYTES, never the client's word for it (every upload here). */
function sniffPicture(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
}

/** The uploaded textures, as the surface catalogue names them. Called at
 *  boot BEFORE the Backrooms service checks the published maps (a map that
 *  names an uploaded texture must still pass), and after every upload. */
export function loadCustomSurfaces(store: Store): void {
  const list: CustomSurface[] = store.mapSurfaces().map((r) => ({
    id: `c${r.id}`,
    kind: r.kind as SurfaceKind,
    name: r.name,
    url: `/api/br-surface/${r.file}`,
    sizeM: r.sizeM,
    roughness: 0.85,
    ...(r.level ? { level: true } : {}),
  }));
  setCustomSurfaces(list);
}

export function registerMapEditorRoutes(router: Router, br: BackroomsService, store: Store): void {
  fs.mkdirSync(SURFACE_DIR, { recursive: true });
  loadCustomSurfaces(store);
  const levelOf = (raw: string | undefined): number | null => {
    const n = Number(raw);
    return EDITABLE_LEVELS.includes(n) ? n : null;
  };
  /** What's live for a level: the newest published version, else the repo's. */
  const live = (level: number): { tiles: TileDef[]; seed: number; sectorId: string; version: number } => {
    const pub = store.mapPublished(level);
    if (pub) return { tiles: JSON.parse(pub.tiles), seed: pub.seed, sectorId: pub.sectorId, version: pub.version };
    return { ...repoDesign(level), version: 0 };
  };

  /** The sector a level is playing right now. */
  const playing = (level: number) => (level === 9 ? br.sectorU : level === 8 ? br.sectorC : level === 7 ? br.sectorT : level === 6 ? br.sectorL : level === 5 ? br.sectorH : level === 4 ? br.sectorO : level === 3 ? br.sectorS : level === 2 ? br.sectorD : level === 1 ? br.sectorP : br.sector);
  /** Would a build with this fingerprint keep the level's map? Only when the
   *  level is playing the newest published design (not a repo fallback after
   *  a generator change) and the floor, walls, doors and water are identical. */
  /** Is the level serving a VERIFIED map? One disabled for a fingerprint
   *  mismatch is playing a changed generator under its old sector id, and a
   *  "props-only" publish there would adopt the new geometry under the old
   *  fog, paint and bodies (Oct 2026 review). */
  const verified = (level: number): boolean =>
    [br.enabled, br.enabledP, br.enabledD, br.enabledS, br.enabledO, br.enabledH, br.enabledL, br.enabledT, br.enabledC, br.enabledU][level] ?? false;
  const keepsMap = (level: number, fp: string): boolean =>
    verified(level) && br.sectorIdOf(level as BrLevel) === live(level).sectorId && sectorFingerprint(playing(level)) === fp;

  router.get("/api/admin/maps/:level", "admin", ({ res, params }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable", editable: EDITABLE_LEVELS });
    const l = live(level);
    const draft = store.mapDraft(level);
    const who = (id: number | null): string | null => (id ? (store.getUserById(id)?.displayName ?? null) : null);
    json(res, 200, {
      level,
      name: LEVEL_NAMES[level],
      live: { version: l.version, sectorId: l.sectorId, seed: l.seed, playing: br.sectorIdOf(level as BrLevel) },
      draft: draft ? { savedAt: draft.savedAt, savedBy: who(draft.savedBy) } : null,
      tiles: draft ? JSON.parse(draft.tiles) : l.tiles,
      seed: draft ? draft.seed : l.seed,
      versions: store.mapVersions(level).map((v) => ({ ...v, publishedBy: who(v.publishedBy) })),
      inside: br.playersOn(level as BrLevel),
      surfaces: customSurfaces(),
      testing: br.testOf(level as BrLevel),
    });
  });

  // ---- CUSTOM TEXTURES ---------------------------------------------------------
  const cleanName = (raw: unknown): string => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const cleanSize = (raw: unknown): number | null => {
    const n = Math.round(Number(raw) * 100) / 100;
    return Number.isFinite(n) && n >= 0.25 && n <= 20 ? n : null;
  };
  router.postRaw("/api/admin/map-surfaces", "admin", async ({ req, res, url, user }) => {
    const kind = url.searchParams.get("kind");
    if (kind !== "wall" && kind !== "floor" && kind !== "ceil") return json(res, 400, { error: "bad_kind" });
    const name = cleanName(url.searchParams.get("name"));
    if (!name) return json(res, 400, { error: "name_required" });
    const sizeM = cleanSize(url.searchParams.get("sizeM") ?? 2);
    if (sizeM === null) return json(res, 400, { error: "bad_size" });
    let buf: Buffer;
    try {
      buf = await readRawBody(req, MAX_SURFACE_BYTES);
    } catch {
      return json(res, 413, { error: "file_too_large" });
    }
    if (!buf.length) return json(res, 400, { error: "empty" });
    const ext = sniffPicture(buf);
    if (!ext) return json(res, 415, { error: "unsupported_type" });
    const file = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(SURFACE_DIR, file), buf);
    const id = store.addMapSurface(kind, name, file, sizeM, url.searchParams.get("level") === "1" && kind === "wall", user.id);
    loadCustomSurfaces(store);
    store.audit(user.id, "map_surface_added", `${kind} texture "${name}" (c${id}, ${sizeM}m)`);
    json(res, 200, { ok: true, id: `c${id}`, surfaces: customSurfaces() });
  });
  router.patch("/api/admin/map-surfaces/:id", "admin", ({ res, params, body }) => {
    const id = Number(String(params.id).replace(/^c/, ""));
    const b = (body ?? {}) as { name?: unknown; sizeM?: unknown };
    const cur = store.mapSurfaces().find((r) => r.id === id);
    if (!cur) return json(res, 404, { error: "not_found" });
    const name = b.name === undefined ? cur.name : cleanName(b.name);
    const sizeM = b.sizeM === undefined ? cur.sizeM : cleanSize(b.sizeM);
    if (!name) return json(res, 400, { error: "name_required" });
    if (sizeM === null) return json(res, 400, { error: "bad_size" });
    store.renameMapSurface(id, name, sizeM);
    loadCustomSurfaces(store);
    json(res, 200, { ok: true, surfaces: customSurfaces() });
  });
  router.get("/api/br-surface/:file", "none", ({ res, params }) => {
    const { file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!SAFE_FILE.test(file) || !SURFACE_MIME[ext]) return json(res, 404, { error: "not_found" });
    const p = path.join(SURFACE_DIR, file);
    if (!p.startsWith(SURFACE_DIR) || !fs.existsSync(p)) return json(res, 404, { error: "not_found" });
    res.writeHead(200, { "content-type": SURFACE_MIME[ext], "cache-control": "public, max-age=31536000, immutable" });
    fs.createReadStream(p).pipe(res);
  });

  router.post("/api/admin/maps/:level/draft", "admin", ({ res, user, params, body }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const b = (body ?? {}) as { tiles?: unknown; seed?: unknown };
    const tiles = readLibrary(b.tiles);
    if (typeof tiles === "string") return json(res, 400, { error: "bad_library", detail: tiles });
    const seed = readSeed(b.seed, level);
    const savedAt = store.saveMapDraft(level, JSON.stringify(tiles), seed, user.id);
    json(res, 200, { ok: true, savedAt, rooms: tiles.length, problems: roomProblems(level, tiles).length });
  });

  router.del("/api/admin/maps/:level/draft", "admin", ({ res, params }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    json(res, 200, { ok: true, dropped: store.clearMapDraft(level) });
  });

  router.post("/api/admin/maps/:level/build", "admin", ({ res, params, body }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const b = (body ?? {}) as { tiles?: unknown; seed?: unknown };
    const tiles = readLibrary(b.tiles);
    if (typeof tiles === "string") return json(res, 400, { error: "bad_library", detail: tiles });
    const broken = roomProblems(level, tiles);
    if (broken.length) return json(res, 422, { error: "rooms_have_problems", rooms: broken });
    try {
      const seed = readSeed(b.seed, level);
      const m = buildMap(level, tiles, seed);
      const l = live(level);
      json(res, 200, {
        ...m.preview,
        problems: m.problems,
        fingerprint: m.fingerprint,
        // what publishing this would do (the publish screen's summary)
        keepsMap: keepsMap(level, m.fingerprint),
        seedChanged: seed !== l.seed,
        changes: libraryChanges(l.tiles, tiles),
        inside: br.playersOn(level as BrLevel),
      });
    } catch (e) {
      json(res, 422, { error: "generator_refused", detail: (e as Error).message });
    }
  });

  router.post("/api/admin/maps/:level/publish", "admin", ({ res, user, params, body }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const b = (body ?? {}) as { tiles?: unknown; seed?: unknown; note?: unknown };
    const tiles = readLibrary(b.tiles);
    if (typeof tiles === "string") return json(res, 400, { error: "bad_library", detail: tiles });
    const broken = roomProblems(level, tiles);
    if (broken.length) return json(res, 422, { error: "rooms_have_problems", rooms: broken });
    const seed = readSeed(b.seed, level);
    let m;
    try {
      m = buildMap(level, tiles, seed);
    } catch (e) {
      return json(res, 422, { error: "generator_refused", detail: (e as Error).message });
    }
    if (m.problems.length) return json(res, 422, { error: "map_has_problems", problems: m.problems });
    const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 200) : null;
    // A TEST PLAY has the live map stashed: a publish now would swap the
    // test's sector, and the test's end would quietly put the old map back
    // (Oct 2026 review). End the test first.
    if (br.testOf(level as BrLevel)) return json(res, 409, { error: "level_testing" });
    // DRESSING ONLY (Josh, Sep 2026): the same floor, walls, doors and water
    // as the map being played — only props or looks differ — so the level
    // KEEPS its sector id, and with it its charted map, paint, bodies and
    // relics. The dressing is swapped in place; nobody has to leave first.
    if (keepsMap(level, m.fingerprint)) {
      const kept = br.sectorIdOf(level as BrLevel);
      const rec = store.insertMapVersion(level, { sectorIdOf: () => kept, seed, tiles: JSON.stringify(tiles), fingerprint: m.fingerprint, note, by: user.id });
      const changed = br.swapDressing(level as BrLevel, { kit: m.sector.kit ?? [], look: m.sector.look, styles: m.sector.styles, marks: m.sector.marks, lid: m.sector.lid, stair: m.sector.stair, stairStyle: m.sector.stairStyle, stairSpecs: m.sector.stairSpecs });
      store.audit(user.id, "map_published", `${LEVEL_NAMES[level]} v${rec.version} (${rec.sectorId}, props, looks and markers only — map kept) · ${tiles.length} rooms · ${m.sector.kit?.length ?? 0} props · ${changed.length} chunks changed${note ? ` · "${note}"` : ""}`);
      return json(res, 200, { ok: true, version: rec.version, sectorId: rec.sectorId, voided: 0, kept: true, chunks: changed.length });
    }
    if (br.playersOn(level as BrLevel)) return json(res, 409, { error: "players_inside", inside: br.playersOn(level as BrLevel) });
    const rec = store.insertMapVersion(level, { sectorIdOf: (v) => designSectorId(level, v), seed, tiles: JSON.stringify(tiles), fingerprint: m.fingerprint, note, by: user.id });
    // nobody connected (checked above, and nothing yields in between) — so
    // the swap cannot be refused here
    const swap = br.swapMap(level as BrLevel, m.sector, rec.sectorId);
    store.audit(user.id, "map_published", `${LEVEL_NAMES[level]} v${rec.version} (${rec.sectorId}) · ${tiles.length} rooms · ${m.sector.kit?.length ?? 0} props · seed ${seed}${note ? ` · "${note}"` : ""}`);
    json(res, 200, { ok: true, version: rec.version, sectorId: rec.sectorId, voided: "voided" in swap ? swap.voided : 0, kept: false });
  });

  // THE HEATMAP (Josh, Sep 2026: design from what players actually do). The
  // playing map's deaths (recorded with their map since migration 105) and its
  // community fog, one byte per cell — which cells somebody has ever seen.
  router.get("/api/admin/maps/:level/heat", "admin", ({ res, params }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const sec = playing(level);
    const sectorId = br.sectorIdOf(level as BrLevel);
    const fog = level === 9 ? br.fogU : level === 8 ? br.fogC : level === 7 ? br.fogT : level === 6 ? br.fogL : level === 5 ? br.fogH : level === 4 ? br.fogO : level === 3 ? br.fogS : level === 2 ? br.fogD : level === 1 ? br.fogP : br.fog;
    json(res, 200, {
      sectorId,
      size: sec.size,
      fingerprint: sectorFingerprint(sec),
      deaths: store.brDeathsOn(sectorId).map((d) => ({ x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10, cause: d.cause, at: d.at })),
      explored: Buffer.from(fog.buffer, fog.byteOffset, fog.byteLength).toString("base64"),
    });
  });

  // PLAY THE DRAFT (Josh, Sep 2026): the level plays the draft for the admin
  // alone — its creatures, its water, its doors, its lights — under a
  // throwaway sector id. Nothing a test run does is kept. Refused while
  // anybody is on the level; the live map comes back exactly as it was.
  router.post("/api/admin/maps/:level/playtest", "admin", ({ res, user, params, body }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const b = (body ?? {}) as { tiles?: unknown; seed?: unknown };
    const tiles = readLibrary(b.tiles);
    if (typeof tiles === "string") return json(res, 400, { error: "bad_library", detail: tiles });
    const broken = roomProblems(level, tiles);
    if (broken.length) return json(res, 422, { error: "rooms_have_problems", rooms: broken });
    let m;
    try {
      m = buildMap(level, tiles, readSeed(b.seed, level));
    } catch (e) {
      return json(res, 422, { error: "generator_refused", detail: (e as Error).message });
    }
    const r = br.beginTest(level as BrLevel, m.sector, user.id);
    if ("error" in r) return json(res, 409, r);
    store.audit(user.id, "map_playtest", `${LEVEL_NAMES[level]}: the draft test-played (${r.sectorId})`);
    json(res, 200, { ok: true, sectorId: r.sectorId, problems: m.problems });
  });
  router.post("/api/admin/maps/:level/playtest/end", "admin", ({ res, params }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const r = br.endTest(level as BrLevel);
    if ("error" in r) return json(res, 409, r);
    json(res, 200, r);
  });

  // COMPARE: an old version (or the original map) beside the draft, both
  // built, with what changed room by room.
  router.post("/api/admin/maps/:level/compare", "admin", ({ res, params, body }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const b = (body ?? {}) as { version?: unknown; tiles?: unknown; seed?: unknown };
    const version = Math.floor(Number(b.version));
    const src = version === 0 ? repoDesign(level) : store.mapVersion(level, version);
    if (!src) return json(res, 404, { error: "no_such_version" });
    const beforeTiles: TileDef[] = typeof src.tiles === "string" ? JSON.parse(src.tiles) : src.tiles;
    const tiles = readLibrary(b.tiles);
    if (typeof tiles === "string") return json(res, 400, { error: "bad_library", detail: tiles });
    if (roomProblems(level, tiles).length) return json(res, 422, { error: "rooms_have_problems", rooms: roomProblems(level, tiles) });
    try {
      const before = buildMap(level, beforeTiles, src.seed);
      const after = buildMap(level, tiles, readSeed(b.seed, level));
      json(res, 200, {
        version,
        before: { ...before.preview, fingerprint: before.fingerprint },
        after: { ...after.preview, fingerprint: after.fingerprint, problems: after.problems },
        sameMap: before.fingerprint === after.fingerprint,
        changes: libraryChanges(beforeTiles, tiles),
      });
    } catch (e) {
      json(res, 422, { error: "generator_refused", detail: (e as Error).message });
    }
  });

  router.post("/api/admin/maps/:level/revert", "admin", ({ res, user, params, body }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const version = Math.floor(Number((body as { version?: unknown })?.version));
    // version 0 = the repo's frozen map, the one every level started from
    const src = version === 0 ? repoDesign(level) : store.mapVersion(level, version);
    if (!src) return json(res, 404, { error: "no_such_version" });
    const tiles = typeof src.tiles === "string" ? src.tiles : JSON.stringify(src.tiles);
    const savedAt = store.saveMapDraft(level, tiles, src.seed, user.id);
    json(res, 200, { ok: true, savedAt, version });
  });

  router.get("/api/admin/maps/:level/export", "admin", ({ res, params }) => {
    const level = levelOf(params.level);
    if (level === null) return json(res, 400, { error: "not_editable" });
    const l = live(level);
    json(res, 200, { level, version: l.version, sectorId: l.sectorId, seed: l.seed, file: formatLibrary(l.tiles) });
  });
}
