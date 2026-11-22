// The Solace-side Backrooms API — the community main map and door status.
//
// Map secrecy holds here too: the map endpoint reveals geometry ONLY for
// explored cells (walls masked to fog), so the Solace client can draw a true
// fog-of-war map without ever holding unexplored structure. Landmarks appear
// once any of their cells has been walked; doors are always known (you can
// see them from the lobby, after all).
//
// ONE EXEMPTION (Josh, July 2026): an ADMIN gets the whole plan unmasked, plus
// the operator overlay (relics, drives, the door, the key). It is decided
// server-side from the session's own admin flag and changes nothing about the
// community's fog — an operator looking at the map does not chart it.

import { suitColorOfItem } from "../vip";
import { AccessToken } from "livekit-server-sdk";
import { levelRoomOf, ghostRoomOf } from "../backrooms/ghostvoice";
import { json, type Router } from "../http";
import { config } from "../config";
import type { Store } from "../db/store";
import { BR_GRACE_MS, type BackroomsService } from "../backrooms/service";
import { SECTOR_A } from "../backrooms/worldgen";
import { driveById, driveLevel, LEVEL1_FLAG } from "../backrooms/lore";
import {
  ALL_GEAR,
  gearByKind,
  UPGRADE_COST,
  SUIT_PRICE,
  SUIT_COLORS,
  SPRAY_COLORS,
  SPRAY_COLOR_COST,
  LOCKER_UPGRADE_COST,
  LOCKER_MAX,
  RELIC_PRICE,
  FOOTAGE_PRICE,
} from "../backrooms/gear";
import { GRANT_SEED, grantState, grantCovers } from "../backrooms/grant";

const voiceEnabled = () => !!(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);

export function registerBackroomsRoutes(router: Router, br: BackroomsService, store: Store): void {
  // An item a live or frozen run is carrying is in the run, not on the
  // counter (Oct 2026 review): sold or discarded mid-run, a drop or a death
  // re-minted it, an endless draw on the Async grant.
  const inRun = (userId: number, itemId: number): boolean =>
    !!br.sessions.get(userId)?.inventory.some((i) => i.id === itemId);
  router.get("/api/backrooms/deaths", "user", ({ res }) => {
    json(res, 200, { deaths: store.brRecentDeaths(8) });
  });

  // ---- THE RESEARCH ARCHIVE -----------------------------------------------
  // Only RECOVERED drives cross the wire, text and all. A drive nobody has
  // found doesn't exist here — no title, no teaser, not even a slot in a list
  // (the same rule as vault answers and relic identity: never ship a secret a
  // player hasn't earned). The catalog SIZE is not published either, so the
  // archive reads as bottomless until it isn't.
  router.get("/api/backrooms/research", "user", ({ res }) => {
    const found = store.brUnlockedDrives();
    const entries = found
      .map((row) => {
        const def = driveById(row.driveId);
        if (!def) return null; // a drive removed from the catalog: skip, keep the row
        return {
          id: def.id,
          title: def.title,
          file: def.file,
          body: def.body,
          // law 1: the archive's line on it, and Dr. Voss's note
          desc: def.desc ?? "",
          ada: def.ada ?? "",
          level: driveLevel(def.id),
          finder: row.name,
          at: row.at,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    const level1 = store.brGetFlag(LEVEL1_FLAG);
    json(res, 200, {
      entries,
      // THE DOOR's status is public — its existence is the point.
      door: { open: !!level1, openedBy: level1?.name ?? null, at: level1?.at ?? null },
    });
  });

  // ---- Admin playtest tools (Josh's list) ---------------------------------
  // FOUNDRY'S DISBURSEMENT — top Async's research budget up (or claw it
  // back). This REPLACED the old per-user RC mint: with one currency, handing
  // a player silver is the ordinary `/api/admin/coins` mint, and the only
  // backrooms-specific house lever left is the size of the budget itself.
  // Audited like every other lever that moves money.
  router.post("/api/admin/backrooms/grant", "admin", ({ res, user, body }) => {
    const amount = Math.round(Number((body as { amount?: unknown })?.amount));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > GRANT_SEED * 10)
      return json(res, 400, { error: "bad_amount" });
    const before = store.asyncGrant().silver;
    if (amount < 0 && before + amount < 0) return json(res, 400, { error: "would_go_negative" });
    // grantAdjust, NOT grantCollect: the latter is the counter's takings
    // coming home and refuses anything <= 0, so routing a claw-back through
    // it answered 200 and moved nothing at all.
    const after = store.grantAdjust(amount);
    if (after === null) return json(res, 400, { error: "would_go_negative" });
    // THE ACTOR IS THE POINT of auditing a money lever. This recorded `null`,
    // which is the shape reserved for something the HOUSE did on its own
    // (Sterling's auto-specials) — so the one backrooms lever that moves real
    // silver was the only admin action on the server nobody's name was on.
    store.audit(user.id, "async_grant_adjust", `${amount > 0 ? "+" : ""}${amount} → ${after}`);
    json(res, 200, { grant: after });
  });

  router.post("/api/admin/backrooms/immortal", "admin", ({ res, user, body }) => {
    const on = !!(body as { on?: unknown })?.on;
    br.setImmortal(user.id, on);
    json(res, 200, { on });
  });

  router.post("/api/admin/backrooms/summon", "admin", ({ res, user }) => {
    // Inside → it spawns ~10m away NOW and comes to you. Outside → armed:
    // it triggers automatically the moment you next step through a door.
    if (br.summonEntity(user.id)) return json(res, 200, { armed: false });
    br.armSummon(user.id);
    json(res, 200, { armed: true });
  });

  // THE SHY GUY playtest lever: it normally only comes for a relic carrier,
  // which makes the whole mechanic awkward to exercise. A summon puts it
  // round the nearest corner regardless — you still have to LOOK at it.
  router.post("/api/admin/backrooms/summon-shy", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonShy(user.id) });
  });

  // THE BLEEDER playtest lever: it only ever comes out in a section with no
  // power. A summon brings it round the nearest corner to you now, light or
  // not (this visit only) — you still have to hold the beam on it.
  router.post("/api/admin/backrooms/summon-grabber", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonGrabber(user.id) });
  });
  router.post("/api/admin/backrooms/summon-bleeder", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonBleeder(user.id) });
  });
  // ADMIN (J, the office only): put THE TEMP round the nearest corner from you.
  router.post("/api/admin/backrooms/summon-temp", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonTemp(user.id) });
  });
  // ADMIN (J, the hotel only): wake the nearest swarm of DEATHMOTHS and send it at you.
  router.post("/api/admin/backrooms/summon-moths", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonMoths(user.id) });
  });
  // ADMIN (J, Lights Out only): send the Listener to you.
  router.post("/api/admin/backrooms/summon-listener", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonListener(user.id) });
  });
  // ADMIN (J, Thalassophobia only, in the water): let the thing below rise on you.
  router.post("/api/admin/backrooms/summon-deep", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonDeep(user.id) });
  });
  // ADMIN (J, the Cave System only, in its passages): send a Burrower at you.
  router.post("/api/admin/backrooms/summon-burrower", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonBurrower(user.id) });
  });
  // Admin J on Level 9: the Neighborhood Watch comes for you (outdoors, dark).
  router.post("/api/admin/backrooms/summon-watch", "admin", ({ res, user }) => {
    json(res, 200, { ok: br.summonWatch(user.id) });
  });

  // Playtest lever for the July 2026 lighting pass: sag the sector's power
  // NOW instead of waiting out the random 8–18 minute clock.
  router.post("/api/admin/backrooms/brownout", "admin", ({ res, body }) => {
    const ms = Number((body as { ms?: unknown })?.ms);
    const black = !!(body as { black?: unknown })?.black;
    json(res, 200, { ms: br.triggerBrownout(Number.isFinite(ms) ? ms : undefined, black), black });
  });

  // ADMIN: open THE DOOR for everyone — the Poolrooms unlock lever. The same
  // one-shot flag the key sets; idempotent (a second press reports who beat
  // you to it). Exists because a player already found the key: the operator
  // can now throw the door open for the whole community without waiting for
  // the carry-the-key-to-the-door run.
  router.post("/api/admin/backrooms/open-pools", "admin", ({ res, user }) => {
    const r = store.brSetFlag(LEVEL1_FLAG, user.id, user.displayName);
    store.audit(user.id, "backrooms_open_pools", r.fresh ? "THE DOOR opened by admin lever" : `already open (${r.name})`);
    json(res, 200, { ok: true, fresh: r.fresh, openedBy: r.name, at: r.at });
  });

  // ADMIN: THE SHIP GATE's switch for the Electrical Station (CLAUDE.md →
  // THE PLACEMENT LAW + THE SHIP GATE). Members walk into Level 3 only once
  // Josh has walked it in Test play and pressed this; the admin always may.
  // Off again is allowed (a level found broken after opening can be shut).
  router.post("/api/admin/backrooms/open-station", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setStationOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_station", open ? "the Electrical Station opened to members" : "the Electrical Station shut to members");
    json(res, 200, { ok: true, open: br.stationOpen() });
  });

  // ADMIN: THE SHIP GATE's switch for the Abandoned Office — the station's
  // lever exactly. Members ride the lift down only once Josh has walked it in
  // Test play and pressed this; the admin always may.
  // ADMIN: THE SHIP GATE's switch for the Terror Hotel — the office's lever
  // exactly. Members take the service stair down only once Josh has walked it
  // in Test play and pressed this; the admin always may.
  router.post("/api/admin/backrooms/open-hotel", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setHotelOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_hotel", open ? "the Terror Hotel opened to members" : "the Terror Hotel shut to members");
    json(res, 200, { ok: true, open: br.hotelOpen() });
  });

  // ADMIN: THE SHIP GATE's switch for Lights Out — the hotel's lever exactly.
  // Members go down through the rusty door only once Josh has walked it in
  // Test play and pressed this; the admin always may.
  router.post("/api/admin/backrooms/open-lights", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setLightsOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_lights", open ? "Lights Out opened to members" : "Lights Out shut to members");
    json(res, 200, { ok: true, open: br.lightsOpen() });
  });

  // ADMIN: THE SHIP GATE's switch for Thalassophobia — the same lever.
  // ADMIN: THE SHIP GATE's switch for the Cave System — the same lever.
  router.post("/api/admin/backrooms/open-cave", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setCaveOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_cave", open ? "The Cave System opened to members" : "The Cave System shut to members");
    json(res, 200, { ok: true, open: br.caveOpen() });
  });

  // ADMIN: THE SHIP GATE's switch for the Suburbs — the same lever.
  router.post("/api/admin/backrooms/open-suburbs", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setSuburbsOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_suburbs", open ? "The Suburbs opened to members" : "The Suburbs shut to members");
    json(res, 200, { ok: true, open: br.suburbsOpen() });
  });

  router.post("/api/admin/backrooms/open-ocean", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setOceanOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_ocean", open ? "Thalassophobia opened to members" : "Thalassophobia shut to members");
    json(res, 200, { ok: true, open: br.oceanOpen() });
  });

  router.post("/api/admin/backrooms/open-office", "admin", ({ res, user, body }) => {
    const open = (body as { open?: unknown } | null)?.open !== false;
    br.setOfficeOpen(open, user.displayName);
    store.audit(user.id, "backrooms_open_office", open ? "the Abandoned Office opened to members" : "the Abandoned Office shut to members");
    json(res, 200, { ok: true, open: br.officeOpen() });
  });

  // ADMIN: wipe the community map. The launch valve — Level 0 goes live with
  // a clean sheet, not with the playtest's scribbles all over it. Refuses
  // while anyone is inside (their fog would be re-written mid-walk) and is
  // audited like every other house action.
  router.post("/api/admin/backrooms/reset", "admin", ({ res, user, body }) => {
    // `deep` also wipes community PROGRESS (relic collections, the lore
    // archive, THE DOOR) so the discovery loop can be replayed in testing. It
    // is opt-in per request precisely because it is unrecoverable.
    const deep = !!(body as { deep?: unknown })?.deep;
    const r = br.resetWorld(deep);
    if ("error" in r) return json(res, 409, { error: r.error, inside: br.sessions.size });
    store.audit(
      user.id,
      deep ? "backrooms_world_reset_deep" : "backrooms_world_reset",
      `sector ${SECTOR_A.id}: ${r.fog ? "fog wiped" : "fog empty"}, ${r.marks} marks, ${r.corpses} bodies, ${r.drops} drops, ${r.deaths} deaths` +
        (deep ? ` · PROGRESS WIPED: ${r.relics} relic unlocks, ${r.drives} drives, ${r.flags} flags` : ""),
    );
    json(res, 200, { ok: true, deep, ...r });
  });

  router.get("/api/backrooms/map", "user", ({ res, user, url }) => {
    if (!br.enabled) return json(res, 503, { error: "backrooms_offline" });
    // Composed fresh per request — masking 65k cells costs ~1ms, and a cache
    // here served a stale pre-walk map in testing. Not worth it.
    // ?level=1 serves THE POOLROOMS' own charted map (its fog is its own).
    // ?level=2 serves PIPE DREAMS — the admin's playtest view until its door opens.
    // ?level=3 serves THE ELECTRICAL STATION, ?level=4 THE ABANDONED OFFICE,
    // the same way.
    const lvParam = Number(url.searchParams.get("level"));
    const level = lvParam === 9 ? 9 : lvParam === 8 ? 8 : lvParam === 7 ? 7 : lvParam === 6 ? 6 : lvParam === 5 ? 5 : lvParam === 4 ? 4 : lvParam === 3 ? 3 : lvParam === 2 ? 2 : lvParam === 1 ? 1 : 0;
    const s = level === 9 ? br.sectorU : level === 8 ? br.sectorC : level === 7 ? br.sectorT : level === 6 ? br.sectorL : level === 5 ? br.sectorH : level === 4 ? br.sectorO : level === 3 ? br.sectorS : level === 2 ? br.sectorD : level === 1 ? br.sectorP : br.sector;
    const fogHere = level === 9 ? br.fogU : level === 8 ? br.fogC : level === 7 ? br.fogT : level === 6 ? br.fogL : level === 5 ? br.fogH : level === 4 ? br.fogO : level === 3 ? br.fogS : level === 2 ? br.fogD : level === 1 ? br.fogP : br.fog;
    const n = s.size;
    // THE FOG IS THE MAP-SECRECY RULE: an unexplored cell contributes nothing
    // at all, so a modded client cannot read geometry the community hasn't
    // walked. ADMINS SEE EVERYTHING (Josh, July 2026) — the operator needs the
    // whole plan to answer "is this bit broken?", and they already get the
    // relic/drive/door/key overlay below. That is the ONLY exemption, it is
    // decided here on the server from the session's own flag, and it never
    // touches `br.fog` itself: the community's charted map is unchanged by an
    // admin looking at it.
    const revealAll = user.isAdmin;
    const explored = Buffer.alloc(Math.ceil((n * n) / 8));
    const wallN = Buffer.alloc(Math.ceil((n * n) / 8));
    const wallW = Buffer.alloc(Math.ceil((n * n) / 8));
    const solid = Buffer.alloc(Math.ceil((n * n) / 8));
    for (let i = 0; i < n * n; i++) {
      if (!revealAll && !fogHere[i]) continue; // unexplored cells contribute NOTHING
      explored[i >> 3] |= 1 << (i & 7);
      if (s.wallN[i]) wallN[i >> 3] |= 1 << (i & 7);
      if (s.wallW[i]) wallW[i >> 3] |= 1 << (i & 7);
      if (s.solid[i]) solid[i >> 3] |= 1 << (i & 7);
    }
    const landmarks = s.landmarks
      .filter((l) => {
        if (revealAll) return true;
        for (let y = l.y; y < l.y + l.h; y++) {
          for (let x = l.x; x < l.x + l.w; x++) {
            if (fogHere[y * n + x]) return true;
          }
        }
        return false;
      })
      .map((l) => ({ name: l.name, x: l.x + l.w / 2, y: l.y + l.h / 2 }));
    json(res, 200, {
      sector: br.sectorIdOf(level),
      level,
      // Selectable the moment THE DOOR opens — drives the home screen's rail.
      level1Open: !!br.level1(),
      level2Open: !!br.level2(),
      // Levels 3-8 open to members on their SHIP GATE's switch alone (Josh,
      // Oct 2026) — the way-in door no longer has to be opened first
      level3Open: br.stationOpen(),
      level4Open: br.officeOpen(),
      level5Open: br.hotelOpen(),
      level6Open: br.lightsOpen(),
      level7Open: br.oceanOpen(),
      level8Open: br.caveOpen(),
      level9Open: br.suburbsOpen(),
      size: n,
      explored: explored.toString("base64"),
      wallN: wallN.toString("base64"),
      wallW: wallW.toString("base64"),
      solid: solid.toString("base64"),
      exploredCells: level === 9 ? br.exploredCountU() : level === 8 ? br.exploredCountC() : level === 7 ? br.exploredCountT() : level === 6 ? br.exploredCountL() : level === 5 ? br.exploredCountH() : level === 4 ? br.exploredCountO() : level === 3 ? br.exploredCountS() : level === 2 ? br.exploredCountD() : level === 1 ? br.exploredCountP() : br.exploredCount(),
      totalCells: n * n,
      landmarks,
      doors: s.doors.map((d) => ({ name: d.name, x: d.x, y: d.y, edge: d.edge })),
      // NO DEATH MARKERS (Josh, July 2026 — reversing the round-2 lock). A body
      // is findable and lootable, but WHERE it lies is not published: it only
      // reaches a client that walks within 50m of it (net.ts). You get 24 hours
      // to recover your own corpse, and finding it is on your memory, not the
      // map. Do not put `bodies` back on this payload.
      // Admin playtest overlay: the entity + relic sites, always visible.
      ...(user.isAdmin
        ? {
            // THE OPERATOR VIEW: every level's whole hunt in one shape — the
            // maps draw from this (monsters, relics, drives, objectives with
            // their state). `debug` stays for the harnesses that read it.
            operator: br.operatorView(level),
            // THE RULES DIRECTOR (Level 0): its phase, tension and decisions.
            ...(level === 0 ? { director: br.directorState() } : {}),
            debug:
              level === 0
                ? (() => {
                    const d = br.debugState();
                    return { ...d, entities: [...d.entities, ...d.spawned.filter((e) => e.level === 0)] };
                  })()
                : level >= 2
                  ? {
                      entities: br.debugState().spawned.filter((e) => e.level === level),
                      relics: level === 2 ? br.debugState().relicsD : br.operatorView(level).relics,
                      gators: [],
                      drives: [],
                      door: null,
                    }
                  : {
                    entities: br.debugState().spawned.filter((e) => e.level === 1),
                    relics: br.debugState().relicsP,
                    gators: br.debugState().gators,
                    drives: [],
                    door: null,
                  },
          }
        : {}),
    });
  });

  // Proximity-voice token: one LiveKit room PER LEVEL (law 9, Oct 2026 — one
  // room for every level had every client subscribed to and decoding every
  // voice in the Backrooms; at 16 a level that is 63 streams). The client
  // rejoins on travel. The GAME does the
  // spatialization (per-participant volume by distance — the server's
  // proximity wire guarantees position data for anyone within earshot).
  // Only players with a LIVE game session may join the room.
  router.post("/api/backrooms/voice-token", "user", async ({ res, user }) => {
    if (!voiceEnabled()) return json(res, 503, { error: "voice_disabled" });
    if (!br.enabled) return json(res, 503, { error: "backrooms_offline" });
    // the living, or the dead still watching that level (law 12) — a refresh
    // while spectating must not cost the spectator their ears
    const living = br.sessions.get(user.id);
    const lvl = living?.level ?? br.spectators.get(user.id)?.level;
    if (lvl === undefined) return json(res, 403, { error: "not_inside" });
    const room = levelRoomOf(br.sectorIdOf(lvl));
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: String(user.id),
      name: user.displayName,
      ttl: "1h",
    });
    at.addGrant({
      room,
      roomJoin: true,
      // THE DEAD LISTEN: a spectator's seat in the level room can't publish;
      // the wire grants it for the length of a ghost talk (ghostvoice.ts)
      canPublish: !!living,
      canSubscribe: true,
      canPublishData: false,
    });
    json(res, 200, { token: await at.toJwt(), url: config.livekitUrl, room, listenOnly: !living });
  });

  // THE DEAD'S OWN ROOM on a level (law 12: spectators watching the same
  // player "hear each other freely, as ordinary chat") — spectators only.
  router.post("/api/backrooms/ghost-voice-token", "user", async ({ res, user }) => {
    if (!voiceEnabled()) return json(res, 503, { error: "voice_disabled" });
    if (!br.enabled) return json(res, 503, { error: "backrooms_offline" });
    const sp = br.spectators.get(user.id);
    if (!sp || br.sessions.get(user.id)) return json(res, 403, { error: "not_spectating" });
    const room = ghostRoomOf(br.sectorIdOf(sp.level));
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: String(user.id),
      name: user.displayName,
      ttl: "1h",
    });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    json(res, 200, { token: await at.toJwt(), url: config.livekitUrl, room });
  });

  router.get("/api/backrooms/status", "user", ({ res, user }) => {
    if (!br.enabled) return json(res, 503, { error: "backrooms_offline" });
    const perDoor = br.sector.doors.map((_d, i) => ({
      name: _d.name,
      inside: [...br.sessions.values()].filter((s) => s.door === i).length,
    }));
    json(res, 200, {
      inside: br.sessions.size,
      level1Open: !!br.level1(),
      level2Open: !!br.level2(),
      level3Open: br.stationOpen(),
      /** The pressure door is open but the station waits for the ship gate. */
      stationReady: !!br.level3() && !br.stationOpen(),
      /** THE SHIP GATE's switch itself (the admin's lever on the hub). */
      stationGate: br.stationOpen(),
      level4Open: br.officeOpen(),
      /** The lift shutter is powered but the office waits for its ship gate. */
      officeReady: !!br.level4() && !br.officeOpen(),
      officeGate: br.officeOpen(),
      level5Open: br.hotelOpen(),
      /** The stairwell door is open but the hotel waits for its ship gate. */
      hotelReady: !!br.level5() && !br.hotelOpen(),
      hotelGate: br.hotelOpen(),
      level6Open: br.lightsOpen(),
      /** The rusty door is open but Lights Out waits for its ship gate. */
      lightsReady: !!br.level6() && !br.lightsOpen(),
      lightsGate: br.lightsOpen(),
      level7Open: br.oceanOpen(),
      /** The sea hatch is open but Thalassophobia waits for its ship gate. */
      oceanReady: !!br.level7() && !br.oceanOpen(),
      oceanGate: br.oceanOpen(),
      level8Open: br.caveOpen(),
      /** The subway stair is open but the Cave System waits for its ship gate. */
      caveReady: !!br.level8() && !br.caveOpen(),
      caveGate: br.caveOpen(),
      level9Open: br.suburbsOpen(),
      /** The climb is open but the Suburbs wait for their ship gate. */
      suburbsReady: !!br.level9() && !br.suburbsOpen(),
      suburbsGate: br.suburbsOpen(),
      /** The front door of Number 9 is open: the way out has been found. */
      level10Open: !!br.level10(),
      poolsDoors: br.sectorP.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })),
      pipesDoors: br.enabledD ? br.sectorD.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      stationDoors: br.enabledS ? br.sectorS.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      officeDoors: br.enabledO ? br.sectorO.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      hotelDoors: br.enabledH ? br.sectorH.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      lightsDoors: br.enabledL ? br.sectorL.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      oceanDoors: br.enabledT ? br.sectorT.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      caveDoors: br.enabledC ? br.sectorC.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      suburbDoors: br.enabledU ? br.sectorU.doors.map((d) => ({ name: d.name, x: d.x, y: d.y })) : [],
      insideByLevel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => [...br.sessions.values()].filter((s) => s.level === l).length),
      // CONNECTED is the subset with a live wire. A frozen run (socket lost,
      // inside its grace window) is genuinely still inside — it occupies a
      // slot and can still be killed — so `inside` counts it. But the reset
      // guard keys off THIS number, because that is the rule the server
      // actually enforces: a reset waits for real players, not for ghosts
      // whose two minutes are already running out.
      connected: [...br.sessions.values()].filter((s) => !s.lostAt).length,
      cap: 16,
      doors: perDoor,
      exploredCells: br.exploredCount(),
      totalCells: br.sector.size * br.sector.size,
      // Live positions for the section map (Josh's call, overriding the
      // earlier no-live-positions lock — friend group, shared map).
      players: [...br.sessions.values()].map((s) => ({ name: s.name, x: s.x, y: s.y })),
      // YOUR RUN, if one is still standing (Josh, Sep 2026: "I cannot access
      // the pool rooms it just takes me to the backrooms"). Leaving without
      // an exit freezes the run, and ANY door you pick inside the grace
      // window resumes that body where it stands — on whatever level it is.
      // That rule is right; the hub not saying so was the bug.
      myRun: (() => {
        const s = br.sessions.get(user.id);
        if (!s) return null;
        return {
          level: s.level,
          waiting: !!s.lostAt,
          lostInMs: s.lostAt ? Math.max(0, s.lostAt + BR_GRACE_MS - Date.now()) : null,
        };
      })(),
    });
  });

  // ---- Voss's counter + the locker (the B3 economy, in silver) ------------
  // Threshold-4 runs on SILVER and pays out of THE ASYNC GRANT — a funded
  // budget that turn-ins draw from and purchases return to, which is what
  // keeps the backrooms from being a second faucet. Rules and reasoning in
  // src/backrooms/grant.ts. Everything money-shaped is one guarded store
  // transaction, as ever.

  router.get("/api/backrooms/me", "user", ({ res, user }) => {
    const p = store.brPlayer(user.id);
    // THE VIP ROOM's wardrobe: a VIP suit lost in the corridors comes back
    // to the locker on the next visit (ownership is the Emporium row).
    store.ensureVipSuits(user.id, store.userItems(user.id).map(suitColorOfItem).filter((c): c is string => !!c));
    const grant = store.asyncGrant();
    json(res, 200, {
      coins: store.getCoins(user.id),
      grant: { silver: grant.silver, seed: GRANT_SEED, state: grantState(grant.silver) },
      lockerSlots: p.lockerSlots,
      items: store.brLockerItems(user.id),
      relics: store.brRelics(user.id),
      catalog: ALL_GEAR,
      prices: {
        upgrade: UPGRADE_COST,
        relic: RELIC_PRICE,
        footage: FOOTAGE_PRICE,
        suit: SUIT_PRICE,
        suitColors: SUIT_COLORS,
        sprayColors: SPRAY_COLORS,
        sprayColorCost: SPRAY_COLOR_COST,
        lockerUpgrade: LOCKER_UPGRADE_COST,
        lockerMax: LOCKER_MAX,
      },
    });
  });

  // NB there is no emoji counter here any more. Voss bought rares at 50 and
  // legendaries at 150 RC; the moment RC became silver that was strictly
  // worse than Sterling's 200 / 2,500, so the till was dead weight AND a
  // second door for emoji to become house money. She buys findings now. The
  // Standard Kit (below) is the one emoji path left, and it is a pure burn.

  router.post("/api/backrooms/buy", "user", ({ res, user, body }) => {
    const b = body as { kind?: string; color?: string };
    if (b?.kind === "suit") {
      const color = String(b.color ?? "");
      if (!SUIT_COLORS.includes(color)) return json(res, 400, { error: "bad_color" });
      const r = store.brBuyGear(user.id, "suit", SUIT_PRICE, color);
      if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 409, { error: r.error, coins: r.coins });
      return json(res, 200, { coins: r.coins, itemId: r.itemId });
    }
    const def = gearByKind(String(b?.kind ?? ""));
    if (!def) return json(res, 400, { error: "unknown_kind" });
    const r = store.brBuyGear(user.id, def.kind, def.price, null);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 409, { error: r.error, coins: r.coins });
    json(res, 200, { coins: r.coins, itemId: r.itemId });
  });

  router.post("/api/backrooms/upgrade", "user", ({ res, user, body }) => {
    const itemId = Number((body as { itemId?: unknown })?.itemId);
    if (!Number.isInteger(itemId)) return json(res, 400, { error: "bad_item" });
    const item = store.brLockerItems(user.id).find((i) => i.id === itemId);
    if (!item) return json(res, 404, { error: "not_owned" });
    if (inRun(user.id, itemId)) return json(res, 409, { error: "inside" });
    const def = gearByKind(item.kind);
    if (!def || def.maxLevel === 0) return json(res, 400, { error: "not_upgradable" });
    const r = store.brUpgradeGear(user.id, itemId, def.maxLevel, (lv) => UPGRADE_COST[lv] ?? 999999);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 409, { error: r.error, coins: r.coins });
    json(res, 200, { coins: r.coins, level: r.level });
  });

  router.post("/api/backrooms/spraycolor", "user", ({ res, user, body }) => {
    const b = body as { itemId?: unknown; color?: unknown };
    const itemId = Number(b?.itemId);
    const color = String(b?.color ?? "");
    if (!Number.isInteger(itemId) || !SPRAY_COLORS.includes(color))
      return json(res, 400, { error: "bad_request" });
    if (inRun(user.id, itemId)) return json(res, 409, { error: "inside" });
    const r = store.brSprayColor(user.id, itemId, color, SPRAY_COLOR_COST);
    if (!r.ok) return json(res, r.error === "insufficient" ? 402 : 409, { error: r.error, coins: r.coins });
    json(res, 200, { coins: r.coins });
  });

  router.post("/api/backrooms/locker-upgrade", "user", ({ res, user }) => {
    const r = store.brLockerUpgrade(user.id, LOCKER_UPGRADE_COST, LOCKER_MAX);
    if (!r.ok)
      return json(res, r.error === "insufficient" ? 402 : 409, {
        error: r.error,
        coins: r.coins,
        lockerSlots: r.lockerSlots,
      });
    json(res, 200, { coins: r.coins, lockerSlots: r.lockerSlots });
  });

  // TURN RESEARCH IN. Voss buys relics and tapes, paid out of Async's budget,
  // and NOTHING ELSE. She used to buy any gear back at half the catalog
  // price, which was harmless while Research Credit was a closed currency and
  // an outright faucet the instant it became silver: the Standard Kit cost
  // ONE RARE EMOJI and handed over 500 of gear, repeatably, so a rare worth
  // 200 at Sterling's counter converted to 250 of house money, forever. The
  // fix is also the in-character one — she is a researcher, not a pawnbroker.
  router.post("/api/backrooms/sellitem", "user", ({ res, user, body }) => {
    const itemId = Number((body as { itemId?: unknown })?.itemId);
    if (!Number.isInteger(itemId)) return json(res, 400, { error: "bad_item" });
    const item = store.brLockerItems(user.id).find((i) => i.id === itemId);
    if (!item) return json(res, 404, { error: "not_owned" });
    if (inRun(user.id, itemId)) return json(res, 409, { error: "inside" });
    if (item.kind !== "relic" && item.kind !== "tape")
      return json(res, 400, { error: "unsellable" });
    const price = item.kind === "relic" ? RELIC_PRICE : (FOOTAGE_PRICE[item.color ?? "far"] ?? 50);
    // FUNDING REVIEW PENDING. A budget that can't cover the valuation buys
    // nothing at all rather than paying part of it: the finding stays whole
    // in the locker, to bank, to auction to another player, or to bring back
    // when Foundry's next disbursement lands.
    const budget = store.asyncGrant().silver;
    if (!grantCovers(budget, price))
      return json(res, 409, { error: "grant_dry", grant: budget, price, coins: store.getCoins(user.id) });
    const r = store.brTurnIn(user.id, itemId, price);
    if (!r.ok)
      return json(res, r.error === "grant_dry" ? 409 : 404, { error: r.error, coins: r.coins });
    json(res, 200, { coins: r.coins, gained: price, grant: store.asyncGrant().silver });
  });

  // Throw a locker item away — free, irreversible, moves no money. The way
  // out of a full locker now that equipment has no resale.
  router.post("/api/backrooms/discard", "user", ({ res, user, body }) => {
    const itemId = Number((body as { itemId?: unknown })?.itemId);
    if (!Number.isInteger(itemId)) return json(res, 400, { error: "bad_item" });
    const item = store.brLockerItems(user.id).find((i) => i.id === itemId);
    if (!item) return json(res, 404, { error: "not_owned" });
    if (inRun(user.id, itemId)) return json(res, 409, { error: "inside" });
    // A VIP ROOM suit is re-issued free by the wardrobe, so throwing one away
    // is pointless and reads as a loss. Refuse it.
    if (item.kind === "suit" && store.userItems(user.id).map(suitColorOfItem).includes(item.color ?? ""))
      return json(res, 400, { error: "vip_suit" });
    if (!store.brDiscardItem(user.id, itemId)) return json(res, 404, { error: "not_owned" });
    json(res, 200, { ok: true });
  });

  router.post("/api/backrooms/kit", "user", ({ res, user, body }) => {
    const code = String((body as { code?: unknown })?.code ?? "");
    if (!code) return json(res, 400, { error: "bad_code" });
    const r = store.brBuyStandardKit(user.id, code);
    if (!r.ok) return json(res, r.error === "locker_full" ? 409 : 400, { error: r.error, coins: r.coins });
    json(res, 200, { coins: r.coins });
  });
}
