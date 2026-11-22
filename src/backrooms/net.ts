// The game's WebSocket — /ws-game, separate from the chat socket (/ws stays
// chat-shaped; the game speaks its own compact protocol). Auth mirrors
// realtime.ts: token in the query string, verified BEFORE the upgrade.
//
// Client → server: {type:"enter", door} · {type:"move", x, y, h, p} ·
//                  {type:"chunks", want:[{cx,cy}]} · {type:"leave"} ·
//                  {type:"fly", on}  (ADMIN ONLY — re-verified in the service)
// Server → client: {type:"welcome", size, chunk, doors, you} ·
//                  {type:"denied", error} · {type:"chunk", ...payload} ·
//                  {type:"pos", id, name, x, y, h, p} · {type:"bye", id} ·
//                  {type:"correct", x, y} · {type:"enterer", id, name, x, y}
//
// `p` is the body POSE (0 stand · 1 crouch · 2 airborne) — cosmetic only, it
// picks which clip a peer's avatar plays. Clamped server-side and relayed.
//
// Position fan-out is PROXIMITY-scoped (the recipient-aware rule): you only
// ever hear about players within earshot — a distant group simply does not
// exist on your wire, which is both the privacy model and the dread.

import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import { rememberSocketToken, sessionStandsFor, userForToken } from "../auth";
import { termsOutstanding } from "../legal";
import { award } from "../achievements";
import type { BackroomsService, BrLevel, Spectator } from "./service";
import { CHUNK } from "./service";
import { ghostRoomOf, ghostVoiceLive, levelRoomOf, setGhostPublish, sweepRoom } from "./ghostvoice";

const NEARBY_CELLS = 28; // ~56m — beyond this, other players don't exist to you
/** How far a fresh spray dot is announced. It has to cover the ground a
 *  client KEEPS LOADED, not the ground it can see people on: chunks are
 *  requested within ±2 chunks and only pruned past ±4 (64 cells), and a chunk
 *  is the only thing that ever carries stored marks. At the 28-cell player
 *  radius, anyone between 28 and 64 cells away already held the wall, never
 *  heard the dot, and never re-fetched the chunk — so that paint stayed
 *  invisible to them for the rest of the session (Josh, Aug 2026: "make sure
 *  spray paint stays persistent for all players"). Marks are tiny and capped
 *  at ~30/s per sprayer, so the wider fan-out costs nothing at our scale. */
const MARK_CELLS = 72;
// MOVES ARRIVE IN BURSTS, so the spam guard is a BUCKET, not a minimum gap
// (Oct 2026 — Josh: "running forward and suddenly i teleport back"). The old
// rule dropped any frame under 40ms after the last, and a Wi-Fi hiccup or a
// server pause delivers several of a client's 10Hz frames at once: it kept
// the OLDEST of the burst and threw the rest away, so the next frame it
// accepted had to cover the whole gap in one step — past the per-message
// cap, or across two cell lines — and the server snapped the runner back. A
// bucket lets a burst through in order (each frame a small step) and still
// starves a client that sends faster than 25Hz for long.
const MOVE_BURST = 10; // frames a player may send back to back
const MOVE_RATE = 25; // frames a second the bucket refills at
const CHUNKS_MIN_MS = 50; // a chunk batch at most 20×/s per socket (32 ids each)
/** The emote catalog, mirrored from the client's EMOTES list (world.ts) —
 *  the wire only ever relays ids off this list, never free text. Adding a
 *  dance = a file in client/public/assets/hazmat/emote/ + both lists. */
const EMOTE_IDS = new Set([
  "hiphop", "gangnam", "twerk", "backflip", "chicken", "silly", "bboy",
  "house", "snake", "soul", "freeze",
]);

export function attachBackroomsNet(httpServer: Server, store: Store, br: BackroomsService, bus: Bus): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }); // pos frames, not uploads
  const socketByUser = new Map<number, WebSocket>();
  const userBySocket = new Map<WebSocket, { id: number; name: string }>();
  const lastMove = new Map<number, number>();
  const moveBucket = new Map<number, { tokens: number; at: number }>();
  // Budgets for two chatty frames (Oct 2026 review): a walkie key fans out
  // to every carrier, an `enter` re-sends the whole welcome and emits bus
  // events. A radio may change state ~5 times a second; 20 enters a minute.
  const walkieLast = new Map<number, { on: boolean; at: number }>();
  const enterTimes = new Map<number, number[]>();

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws-game") return; // realtime owns /ws and destroys the rest
    const user = userForToken(store, url.searchParams.get("token") ?? undefined);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // THE PAPERWORK: no Terms on file, no world (legal.ts).
    if (termsOutstanding(user)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      rememberSocketToken(ws, url.searchParams.get("token"));
      userBySocket.set(ws, { id: user.id, name: user.displayName });
      wss.emit("connection", ws, req);
    });
  });

  const send = (ws: WebSocket, msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // A ban/suspend/scrub/jail hangs up this wire too (Sep 2026 review). The
  // run freezes under the ordinary lost-wire rule and forfeits on the grace
  // clock — a banned body must not keep looting under a locked account.
  // A TEST RUN ENDED (the map editor's Test play): whoever was inside it gets
  // the ordinary way-out screen — nothing was banked, nothing was lost.
  br.onTestEnd((_level, userIds) => {
    for (const uid of userIds) {
      const ws = socketByUser.get(uid);
      bus.emit("zone.presence", { userId: uid, zone: "backrooms", on: false, detail: null });
      if (ws) send(ws, { type: "debrief", revealed: 0, ms: 0, relics: [], footage: null, test: true });
    }
  });

  bus.on("user.kick", ({ userId }) => {
    const ws = socketByUser.get(userId);
    if (ws && !sessionStandsFor(store, ws)) ws.close(4003, "kicked");
  });

  /** Send to every SAME-LEVEL session within radius of (x,y), optionally
   *  excluding one. Levels share a coordinate space, not a world — an
   *  unscoped broadcast would haunt the Poolrooms with Level 0 ghosts. */
  const sendNear = (
    level: BrLevel,
    x: number,
    y: number,
    msg: unknown,
    excludeUserId?: number,
    radius = NEARBY_CELLS,
  ): void => {
    for (const s of br.sessions.values()) {
      if (s.userId === excludeUserId) continue;
      if (s.level !== level) continue;
      if (Math.hypot(s.x - x, s.y - y) > radius) continue;
      const ws = socketByUser.get(s.userId);
      if (ws) send(ws, msg);
    }
    // THE DEAD, WATCHING (law 12): a spectator sees what the one they watch
    // would see — so whatever reaches their target's surroundings reaches them.
    for (const sp of br.spectators.values()) {
      if (sp.userId === excludeUserId || sp.level !== level) continue;
      const t = br.sessions.get(sp.targetId);
      if (!t || Math.hypot(t.x - x, t.y - y) > radius) continue;
      const ws = socketByUser.get(sp.userId);
      if (ws) send(ws, msg);
    }
  };

  // ---- LAW 12: SPECTATING THE DEAD ------------------------------------------
  // Josh, Oct 2026: a player who dies watches the living on that map, hears
  // the one they watch, cycles with Q and E, orbits with the mouse, and may
  // speak to the one they watch for 15 seconds (held push-to-talk, refilled
  // every five minutes) — heard from the direction of the spectator's camera,
  // as a ghost. Spectators of the same player hear each other freely (their
  // own room — ghostvoice.ts). THE BUDGET IS THE SERVER'S: a spectator may
  // publish into the level's room only while a granted talk runs, because the
  // SFU is told to switch their right to publish on and off (setGhostPublish)
  // — an edited client gets nowhere past it. The watched player is still told
  // when a ghost is speaking and from where, which is how it is placed.
  const SPEC_TALK_MS = Number(process.env.BACKROOMS_SPEC_TALK_MS ?? 15_000);
  const SPEC_REFILL_MS = Number(process.env.BACKROOMS_SPEC_REFILL_MS ?? 300_000);
  /** Talk time left right now (a talk in progress is spending it). */
  const talkLeft = (sp: Spectator, now = Date.now()): number =>
    Math.max(0, sp.talkLeftMs - (sp.talkingSince ? now - sp.talkingSince : 0));
  const watchersOf = (targetId: number): Spectator[] => [...br.spectators.values()].filter((q) => q.targetId === targetId);
  /** Tell one spectator where things stand. */
  const specState = (sp: Spectator): void => {
    const ws = socketByUser.get(sp.userId);
    if (!ws) return;
    const now = Date.now();
    const alive = br.aliveOn(sp.level);
    send(ws, {
      type: "spectate",
      target: sp.targetId,
      targets: alive.map((q) => ({ id: q.userId, name: q.name })),
      talkLeftMs: talkLeft(sp, now),
      talking: !!sp.talkingSince,
      refillInMs: Math.max(0, sp.refillAt - now),
      watchers: watchersOf(sp.targetId).filter((q) => q.userId !== sp.userId).map((q) => q.userId),
    });
  };
  const specStateAll = (): void => {
    for (const sp of br.spectators.values()) specState(sp);
  };
  /** Show a spectator the world round their target: the target and everyone
   *  near it, as a newcomer would be introduced. */
  const specIntro = (sp: Spectator): void => {
    const ws = socketByUser.get(sp.userId);
    const t = br.sessions.get(sp.targetId);
    if (!ws || !t) return;
    for (const other of [t, ...br.nearby(t.userId, NEARBY_CELLS)]) {
      send(ws, {
        type: "pos", id: other.userId, name: other.name, x: other.x, y: other.y, h: other.heading, p: other.pose,
        suit: suitOf(other.userId), e: other.equip ?? "", pt: other.pitch ?? 0, em: other.emote ?? "",
      });
    }
  };
  const ghostTell = (sp: Spectator, on: boolean): void => {
    const tws = socketByUser.get(sp.targetId);
    if (tws) send(tws, { type: "ghost", id: sp.userId, name: sp.name, on, yaw: sp.camYaw });
  };
  const stopTalking = (sp: Spectator, now = Date.now()): void => {
    if (!sp.talkingSince) return;
    sp.talkLeftMs = talkLeft(sp, now);
    sp.talkingSince = 0;
    ghostTell(sp, false);
    void setGhostPublish(br.sectorIdOf(sp.level), sp.userId, false);
  };
  /** The ghost key went down: ask the SFU to let them speak, and start the
   *  talk only once it has — a key let go while the grant was on its way, a
   *  spent budget or a watch that ended in the meantime takes it straight back. */
  const startTalking = (sp: Spectator): void => {
    if (sp.talkingSince || sp.granting || talkLeft(sp) <= 0) return;
    sp.granting = true;
    void setGhostPublish(br.sectorIdOf(sp.level), sp.userId, true).then((ok) => {
      sp.granting = false;
      const live = br.spectators.get(sp.userId) === sp;
      if (!ok || !live || !sp.wantTalk || talkLeft(sp) <= 0) {
        if (ok) void setGhostPublish(br.sectorIdOf(sp.level), sp.userId, false);
        if (live) specState(sp);
        return;
      }
      sp.talkingSince = Date.now();
      ghostTell(sp, true);
      specState(sp);
    });
  };
  /** Start watching: the nearest of the living to where they fell. */
  const beginSpectate = (userId: number, name: string, level: BrLevel, x: number, y: number): void => {
    const alive = br.aliveOn(level).filter((q) => q.userId !== userId);
    if (!alive.length || !socketByUser.get(userId)) return;
    const near = alive.reduce((a, b) => (Math.hypot(a.x - x, a.y - y) <= Math.hypot(b.x - x, b.y - y) ? a : b));
    const old = br.spectators.get(userId);
    br.spectators.set(userId, {
      userId, name, level, targetId: near.userId,
      // a second death inside five minutes doesn't buy a fresh budget
      talkLeftMs: old ? talkLeft(old) : SPEC_TALK_MS,
      refillAt: old ? old.refillAt : Date.now() + SPEC_REFILL_MS,
      talkingSince: 0,
      camYaw: 0,
    });
    // the dead are heard by the living only through a granted talk
    void setGhostPublish(br.sectorIdOf(level), userId, false);
    specIntro(br.spectators.get(userId)!);
    specStateAll();
  };
  const endSpectate = (userId: number): void => {
    const sp = br.spectators.get(userId);
    if (!sp) return;
    stopTalking(sp);
    br.spectators.delete(userId);
    specStateAll();
  };
  /** Q / E: the next or previous of the living, in a stable order. */
  const cycleSpectate = (sp: Spectator, dir: number): void => {
    const alive = br.aliveOn(sp.level).sort((a, b) => a.userId - b.userId);
    if (!alive.length) return;
    const i = alive.findIndex((q) => q.userId === sp.targetId);
    const next = alive[((((i < 0 ? 0 : i) + (dir < 0 ? -1 : 1)) % alive.length) + alive.length) % alive.length];
    if (next.userId === sp.targetId) return;
    stopTalking(sp);
    sp.targetId = next.userId;
    specIntro(sp);
    specStateAll();
  };
  // The clock: a watched player who died, left or froze hands the watcher on
  // (or, nobody left, ends the watch); the budget refills; a talk runs out at
  // zero.
  const specTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const sp of [...br.spectators.values()]) {
      if (!socketByUser.get(sp.userId)) {
        br.spectators.delete(sp.userId);
        changed = true;
        continue;
      }
      const t = br.sessions.get(sp.targetId);
      if (!t || t.level !== sp.level || t.lostAt || t.fly) {
        stopTalking(sp, now);
        const alive = br.aliveOn(sp.level);
        if (!alive.length) {
          const ws = socketByUser.get(sp.userId);
          if (ws) send(ws, { type: "spectate", none: true });
          br.spectators.delete(sp.userId);
        } else {
          sp.targetId = alive[0].userId;
          specIntro(sp);
        }
        changed = true;
      }
      if (now >= sp.refillAt) {
        sp.talkLeftMs = SPEC_TALK_MS;
        if (sp.talkingSince) sp.talkingSince = now;
        sp.refillAt = now + SPEC_REFILL_MS;
        changed = true;
      }
      if (sp.talkingSince && talkLeft(sp, now) <= 0) {
        stopTalking(sp, now);
        changed = true;
      }
    }
    if (changed) specStateAll();
  }, 250);
  specTimer.unref?.();
  // THE OLD TOKEN. A dead player was handed a publishing token while alive
  // (6h), and an edited client can reconnect to the level room with it,
  // walking past the revoke beginSpectate sent to the connection it had. So
  // every few seconds the right is taken back from every spectator not in a
  // granted talk — idempotent, and "not in the room" counts as done. A cheat
  // gets seconds of voice, not a run's worth.
  const GHOST_RECHECK_MS = Number(process.env.BACKROOMS_GHOST_RECHECK_MS ?? 4_000);
  const ghostRecheck = setInterval(() => {
    for (const sp of br.spectators.values()) {
      if (sp.talkingSince || sp.granting) continue;
      void setGhostPublish(br.sectorIdOf(sp.level), sp.userId, false);
    }
  }, GHOST_RECHECK_MS);
  ghostRecheck.unref?.();
  // THE TOKEN OUTLIVES THE RUN (Oct 2026 review): every 30s, a level's
  // voice room keeps only the runners on that level (frozen ones too) and
  // its spectators; its ghost room only its spectators.
  const VOICE_SWEEP_MS = Number(process.env.BACKROOMS_VOICE_SWEEP_MS ?? 30_000);
  const voiceSweep = setInterval(() => {
    if (!ghostVoiceLive()) return;
    for (let lv = 0; lv <= 9; lv++) {
      const level = lv as BrLevel;
      const runners = new Set([...br.sessions.values()].filter((q) => q.level === level).map((q) => String(q.userId)));
      const ghosts = new Set([...br.spectators.values()].filter((sp) => sp.level === level).map((sp) => String(sp.userId)));
      const sid = br.sectorIdOf(level);
      void sweepRoom(levelRoomOf(sid), new Set([...runners, ...ghosts]));
      void sweepRoom(ghostRoomOf(sid), ghosts);
    }
  }, VOICE_SWEEP_MS);
  voiceSweep.unref?.();
  const levelOf = (uid: number): BrLevel => br.sessions.get(uid)?.level ?? 0;
  /** A level's world + its persisted sector id, in one place. */
  const secFor = (level: BrLevel) => (level === 9 ? br.sectorU : level === 8 ? br.sectorC : level === 7 ? br.sectorT : level === 6 ? br.sectorL : level === 5 ? br.sectorH : level === 4 ? br.sectorO : level === 3 ? br.sectorS : level === 2 ? br.sectorD : level === 1 ? br.sectorP : br.sector);
  const sectorIdFor = (level: BrLevel): string => br.sectorIdOf(level);
  /** The roster's zone line. */
  const zoneDetail = (level: BrLevel): string => (level === 9 ? "suburbs" : level === 8 ? "cave" : level === 7 ? "ocean" : level === 6 ? "lights" : level === 5 ? "hotel" : level === 4 ? "office" : level === 3 ? "station" : level === 2 ? "pipes" : level === 1 ? "pools" : "level0");

  // Walkie talkie channels (B3): per-user tuned channel while inside.
  // Transmissions relay to every SAME-CHANNEL walkie CARRIER ON THE SAME
  // LEVEL, distance be damned — that's what the radio is for. One level only
  // (Josh, Oct 2026): a Level 0 radio heard on Level 3 made the levels one
  // place; they are meant to be cut off from each other. Ownership is
  // validated against the session's server-held inventory.
  const walkieCh = new Map<number, number>();
  const lastSpray = new Map<number, number>();
  const lastChunks = new Map<number, number>();
  const lastNoise = new Map<number, number>();
  const hasWalkie = (uid: number): boolean =>
    br.sessions.get(uid)?.inventory.some((i) => i.kind === "walkie") ?? false;
  /** A run ending (death, exit, a frozen body) takes its radio with it. If it
   *  was keyed, every carrier is told it went quiet — the off frame the
   *  dead can no longer send, or the dead's ghost talk played level-wide as
   *  radio and their next run's first key press was swallowed as a repeat
   *  (Nov 2026 validation run). */
  const walkieDrop = (uid: number): void => {
    walkieCh.delete(uid);
    const last = walkieLast.get(uid);
    walkieLast.delete(uid);
    if (!last?.on) return;
    for (const s of br.sessions.values()) {
      if (s.userId === uid || !hasWalkie(s.userId)) continue;
      const w = socketByUser.get(s.userId);
      if (w) send(w, { type: "walkie", id: uid, on: false });
    }
  };
  /** Everyone on a level — the living and the dead watching it. */
  const toLevel = (level: BrLevel, msg: unknown): void => {
    for (const s of br.sessions.values()) {
      if (s.level !== level) continue;
      const w = socketByUser.get(s.userId);
      if (w) send(w, msg);
    }
    for (const sp of br.spectators.values()) {
      if (sp.level !== level) continue;
      const w = socketByUser.get(sp.userId);
      if (w) send(w, msg);
    }
  };

  /** The suit color a player is WEARING (from their validated loadout) — it
   *  rides the position frames so peers render the color that was bought.
   *  Server-sourced, so nobody can claim a suit they don't own. */
  const suitOf = (uid: number): string =>
    br.sessions.get(uid)?.inventory.find((i) => i.kind === "suit")?.color ?? "yellow";

  /** THE PRESENCE PULSE (Backrooms law 5, Oct 2026). Positions used to leave
   *  only when somebody MOVED, so a body standing still — mid-emote, holding a
   *  lit torch, waiting at a door, a frozen run — was never shown to anyone
   *  who walked into range afterwards. Once a second every still body is
   *  re-announced to whoever is near it now. It is also what lets the client
   *  drop a peer that has gone quiet (out of range, or gone) — with this, a
   *  body in range is never silent for more than a second. Flying operators
   *  stay invisible. */
  const PULSE_MS = 1_000;
  const posFrameOf = (s: { userId: number; name: string; x: number; y: number; heading: number; pose?: number; equip?: string; pitch?: number; emote?: string }) => ({
    type: "pos",
    id: s.userId,
    name: s.name,
    x: s.x,
    y: s.y,
    h: s.heading,
    p: s.pose ?? 0,
    suit: suitOf(s.userId),
    e: s.equip ?? "",
    pt: s.pitch ?? 0,
    em: s.emote ?? "",
  });
  const pulseTimer = setInterval(() => {
    const now = Date.now();
    for (const s of br.sessions.values()) {
      if (s.fly) continue;
      if (now - (lastMove.get(s.userId) ?? 0) < PULSE_MS - 100) continue; // moving: its own frames carry it
      sendNear(s.level, s.x, s.y, posFrameOf(s), s.userId);
    }
  }, PULSE_MS);
  pulseTimer.unref?.();

  /** LOSING A PLAYER'S WIRE DOES NOT END THEIR RUN (July 2026). The session
   *  freezes where it stands for the grace window; reconnecting resumes it,
   *  and running out of time is a forfeit — death and a lootable body.
   *
   *  No `bye` frame goes out, because nothing left: the body is still standing
   *  in the room, still visible to everyone near it, and still perfectly
   *  catchable. That is precisely what stops "close the app" being an escape
   *  hatch, and it is why the ONLY safe way out of Level 0 is still the door
   *  you came in by. */
  const freezeSession = (userId: number): void => {
    walkieDrop(userId);
    br.markDisconnected(userId);
  };

  // THE ENTITY's wire: position frames go only to players within earshot-
  // of-dread range (30 cells) — beyond that it does not exist to you. A
  // kill tells the victim they died and everyone nearby that they vanished.
  // Relic sites: positions stream to players within 30 cells every 2.5s —
  // identity stays server-side until pickup. Clients hide sites they stop
  // hearing about (timeout), so no removal frames are needed.
  /** LAW 4: a relic site has no identity until somebody picks it up (it is
   *  rolled then from what THEY are missing), so the wire names none — it
   *  tells each viewer whether one is still new to them on this level. */
  const veil = (
    s: { userId: number; level: BrLevel },
    list: { id: number; x: number; y: number; lvl: BrLevel }[],
  ): { id: number; x: number; y: number; relicId: string; name: string }[] => {
    const left = br.relicsLeft(s.userId, s.level);
    const name = left ? "A RELIC — ONE YOU HAVEN'T FOUND" : "A RELIC — YOU HAVE FOUND THEM ALL";
    return list.map((r) => ({ id: r.id, x: r.x, y: r.y, relicId: "", name }));
  };
  const relicTimer = setInterval(() => {
    const sites = br.activeRelics();
    const bodies = br.activeCorpses();
    const loose = br.activeDrops();
    // Lore drives, the KEY and THE DOOR ride the same proximity stream as
    // everything else findable — you learn a drive exists by walking near it,
    // never from the wire. The door streams from further out: its location is
    // allowed to be known (Drive 003), the key's is not.
    const lore = br.activeDrives();
    const loreP = br.activeDrives(1);
    const loreD = br.activeDrives(2);
    const loreS = br.activeDrives(3);
    const loreO = br.activeDrives(4);
    const loreH = br.activeDrives(5);
    const loreL = br.activeDrives(6);
    const lights = br.lightsState();
    const wheel = br.keyPos(6);
    const loreT = br.activeDrives(7);
    const ocean = br.oceanState();
    const helmet = br.keyPos(7);
    const loreC = br.activeDrives(8);
    const cave = br.caveState();
    const rope = br.keyPos(8);
    const loreU = br.activeDrives(9);
    const suburb = br.suburbState();
    const houseKey = br.keyPos(9);
    const office = br.officeState();
    const hotel = br.hotelState();
    const key = br.keyPos();
    const door = br.doorPos();
    const keyP = br.keyPos(1);
    const hatch = br.hatchPos();
    const fuses = br.fuseSitesOpen();
    const box = br.fuseBox();
    for (const s of br.sessions.values()) {
      const ws = socketByUser.get(s.userId);
      if (!ws) continue;
      if (s.level === 0) {
        const nearLore = lore.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLore.length) send(ws, { type: "drives", list: nearLore });
        if (key && Math.hypot(key.x - s.x, key.y - s.y) <= 22) send(ws, { type: "key", x: key.x, y: key.y });
        if (Math.hypot(door.x - s.x, door.y - s.y) <= 40) {
          send(ws, { type: "thedoor", x: door.x, y: door.y, open: !!br.level1() });
        }
        const near = sites.filter((r) => r.lvl === 0 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
      } else if (s.level === 9) {
        // THE SUBURBS: the way in (the manhole) rides the welcome's door list.
        // THE HOUSE KEY streams like any key, from close; NUMBER 9'S FRONT
        // DOOR from far — its porch light shows down the street.
        const nearLoreU = loreU.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreU.length) send(ws, { type: "drives", list: nearLoreU });
        const near = sites.filter((r) => r.lvl === 9 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        if (houseKey && Math.hypot(houseKey.x - s.x, houseKey.y - s.y) <= 14) send(ws, { type: "key", x: houseKey.x, y: houseKey.y });
        if (suburb?.frontDoor && Math.hypot(suburb.frontDoor.x - s.x, suburb.frontDoor.y - s.y) <= 50) send(ws, { type: "frontdoor", ...suburb.frontDoor });
      } else if (s.level === 8) {
        // THE CAVE SYSTEM: the way out (the subway stair) rides the welcome's
        // door list. THE CLIMBING ROPE streams like any key, from close (it is
        // dark); THE CHIMNEY from far — its streetlight shows down the Deep.
        const nearLoreC = loreC.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreC.length) send(ws, { type: "drives", list: nearLoreC });
        const near = sites.filter((r) => r.lvl === 8 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        if (rope && Math.hypot(rope.x - s.x, rope.y - s.y) <= 16) send(ws, { type: "key", x: rope.x, y: rope.y });
        if (cave?.chimney && Math.hypot(cave.chimney.x - s.x, cave.chimney.y - s.y) <= 45) send(ws, { type: "chimney", ...cave.chimney });
      } else if (s.level === 7) {
        // THALASSOPHOBIA: the way out (the hatch) rides the welcome's door
        // list. THE DIVING HELMET streams like any key; THE SUBWAY STAIR from
        // far out — you can see the plaza's dark from the roofs.
        const nearLoreT = loreT.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreT.length) send(ws, { type: "drives", list: nearLoreT });
        const near = sites.filter((r) => r.lvl === 7 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        if (helmet && Math.hypot(helmet.x - s.x, helmet.y - s.y) <= 22) send(ws, { type: "key", x: helmet.x, y: helmet.y });
        if (ocean?.subway && Math.hypot(ocean.subway.x - s.x, ocean.subway.y - s.y) <= 45) send(ws, { type: "subway", ...ocean.subway });
      } else if (s.level === 6) {
        // LIGHTS OUT: the way out (the stair) rides the welcome's door list.
        // THE HANDWHEEL streams like any key, but only from close — it is
        // pitch dark. THE SEA HATCH from far out: you find it by its sound.
        const nearLoreL = loreL.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreL.length) send(ws, { type: "drives", list: nearLoreL });
        const near = sites.filter((r) => r.lvl === 6 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        if (wheel && Math.hypot(wheel.x - s.x, wheel.y - s.y) <= 14) send(ws, { type: "key", x: wheel.x, y: wheel.y });
        if (lights?.hatch && Math.hypot(lights.hatch.x - s.x, lights.hatch.y - s.y) <= 45) send(ws, { type: "seahatch", ...lights.hatch });
      } else if (s.level === 5) {
        // THE TERROR HOTEL: its way out (the service stair), the register, the
        // suites' doors, the lifts and the furnaces ride the welcome's hotel
        // state. THE BOILER KEY streams ONLY to someone standing in its room
        // (the register is how you find which); THE RUSTY DOOR from further
        // out, like a door.
        const nearLoreH = loreH.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreH.length) send(ws, { type: "drives", list: nearLoreH });
        const near = sites.filter((r) => r.lvl === 5 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        const bk = br.hotelKeyFor(s.userId);
        if (bk) send(ws, { type: "key", x: bk.x, y: bk.y });
        if (hotel?.rustydoor && Math.hypot(hotel.rustydoor.x - s.x, hotel.rustydoor.y - s.y) <= 40) send(ws, { type: "rustydoor", ...hotel.rustydoor });
      } else if (s.level === 4) {
        // THE ABANDONED OFFICE: its way out (the lift) rides the welcome's door
        // list. THE KEYCARD streams like the key (you learn where it lies by
        // walking near it); THE STAIRWELL DOOR from further out, like a door.
        const nearLoreO = loreO.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreO.length) send(ws, { type: "drives", list: nearLoreO });
        const near = sites.filter((r) => r.lvl === 4 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        if (office?.keycard && Math.hypot(office.keycard.x - s.x, office.keycard.y - s.y) <= 22) send(ws, { type: "key", x: office.keycard.x, y: office.keycard.y });
        if (office?.stairdoor && Math.hypot(office.stairdoor.x - s.x, office.stairdoor.y - s.y) <= 40) send(ws, { type: "stairdoor", ...office.stairdoor });
      } else if (s.level === 3) {
        // THE ELECTRICAL STATION: its way out rides the welcome's door list;
        // its breakers, cutoffs and shutter ride the welcome's station state
        // and the "breaker"/"power" events. Its own relics and drives stream here.
        const nearLoreS = loreS.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreS.length) send(ws, { type: "drives", list: nearLoreS });
        const near = sites.filter((r) => r.lvl === 3 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
      } else if (s.level === 2) {
        // PIPE DREAMS: its way out (the drain) rides the welcome's door list;
        // its own relics and drives stream like everyone else's.
        const nearLoreD = loreD.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreD.length) send(ws, { type: "drives", list: nearLoreD });
        const near = sites.filter((r) => r.lvl === 2 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        // THE FUSES, streamed like the key (you learn one exists by walking
        // near it), and the fuse box, streamed from further out like a door
        const nearFuses = fuses.filter((f) => Math.hypot(f.x - s.x, f.y - s.y) <= 22);
        if (nearFuses.length) send(ws, { type: "fuses", list: nearFuses });
        if (box && Math.hypot(box.x - s.x, box.y - s.y) <= 40) send(ws, { type: "fusebox", ...box, carrying: s.fuses?.length ?? 0 });
      } else {
        // The way home, streamed like THE DOOR is on Level 0 — and the
        // pools' OWN relic sites (their catalog spawns only down here).
        const landing = br.sectorP.doors[0];
        if (Math.hypot(landing.x + 0.5 - s.x, landing.y + 0.5 - s.y) <= 40) {
          send(ws, { type: "thedoor", x: landing.x + 0.5, y: landing.y + 0.5, open: true, back: true });
        }
        const near = sites.filter((r) => r.lvl === 1 && Math.hypot(r.x - s.x, r.y - s.y) <= 30);
        if (near.length) send(ws, { type: "relics", list: veil(s, near) });
        // LEVEL 1's KEY and its door, the drain hatch down to Pipe Dreams
        if (keyP && Math.hypot(keyP.x - s.x, keyP.y - s.y) <= 22) send(ws, { type: "key", x: keyP.x, y: keyP.y });
        if (hatch && Math.hypot(hatch.x - s.x, hatch.y - s.y) <= 40) send(ws, { type: "hatch", x: hatch.x, y: hatch.y, open: !!br.level2() });
        // The Poolrooms' own archive strand streams the same way.
        const nearLoreP = loreP.filter((d) => Math.hypot(d.x - s.x, d.y - s.y) <= 26);
        if (nearLoreP.length) send(ws, { type: "drives", list: nearLoreP });
      }
      // BODIES: 25 cells = 50 METRES, tighter than everything else and never on
      // the lobby map. You have to remember the way back to your own corpse.
      const nearBodies = bodies.filter((c) => c.lvl === s.level && Math.hypot(c.x - s.x, c.y - s.y) <= 25);
      if (nearBodies.length) send(ws, { type: "corpses", list: nearBodies });
      const nearDrops = loose.filter((d) => d.lvl === s.level && Math.hypot(d.x - s.x, d.y - s.y) <= 30);
      if (nearDrops.length) send(ws, { type: "drops", list: nearDrops });
    }
  }, 2500);
  relicTimer.unref?.();

  // THE OPERATOR OVERLAY (Josh, Oct 2026: "as the admin i am able to fly in
  // every map and see all monster, relics, objectives, and hard drives"). The
  // proximity streams above are for players — a ghost at sixty cells a second
  // passes clean through a 22-cell radius between two 2.5s ticks, and three
  // creatures only tick while somebody is WALKING the level. A flying admin is
  // sent the level's whole hunt instead, once a second. Only a session the
  // service let fly (setFly re-checks isAdmin against the DB) ever gets one.
  const opTimer = setInterval(() => {
    for (const s of br.sessions.values()) {
      if (!s.fly) continue;
      const ws = socketByUser.get(s.userId);
      if (ws) send(ws, { type: "op", view: br.operatorView(s.level) });
    }
  }, 1000);
  opTimer.unref?.();

  // FALLING (v2): health lives on the server now, so a drop reports itself.
  br.onHurt(({ userId, hp, drop, dead, cause, x, y, level }) => {
    const ws = socketByUser.get(userId);
    if (ws) send(ws, dead ? { type: "dead", fell: drop, ...(cause ? { cause } : {}) } : { type: "hurt", hp, drop, ...(cause ? { cause } : {}) });
    if (dead) walkieDrop(userId);
    // Deaths that happen outside a move frame (drowning's sweep) carry
    // their position so the room sees the body go under.
    if (dead && x !== undefined && y !== undefined && level !== undefined) {
      sendNear(level, x, y, { type: "bye", id: userId });
    }
  });

  // THE RAGDOLL WIRE (Aug 2026): every death, with the throw that made it.
  // Fired from inside killPlayer, so it always lands BEFORE the dead/bye
  // frames — the client swaps the avatar for a ragdoll before it vanishes.
  // The victim gets it too (their session is already gone, so sendNear
  // can't reach them — but their socket is still up for the send-off).
  br.onDeath((ev) => {
    const payload = {
      type: "death",
      id: ev.userId,
      x: ev.x,
      y: ev.y,
      rx: ev.rx,
      ry: ev.ry,
      dir: ev.dir,
      power: ev.power,
      seed: ev.seed,
      cause: ev.cause,
      suit: ev.suit,
      h: ev.h,
    };
    const ws = socketByUser.get(ev.userId);
    if (ws) send(ws, payload);
    sendNear(ev.level, ev.x, ev.y, payload, ev.userId);
    // law 12: the dead stay, watching the living (if any are left)
    const dws = socketByUser.get(ev.userId);
    const dname = dws ? (userBySocket.get(dws)?.name ?? "someone") : "someone";
    beginSpectate(ev.userId, dname, ev.level, ev.x, ev.y);
  });

  br.startEntity((ev) => {
    if (ev.type === "pos") {
      sendNear(ev.level ?? 0, ev.x, ev.y, { type: "entity", id: ev.id, x: ev.x, y: ev.y, mode: ev.mode }, undefined);
      return;
    }
    if (ev.type === "kill" && ev.userId !== undefined) {
      const ws = socketByUser.get(ev.userId);
      walkieDrop(ev.userId);
      // the cause is what plays the kill clip (Nov 2026 validation run: a
      // bare dead frame never did)
      if (ws) send(ws, { type: "dead", cause: "the entity" });
      sendNear(ev.level ?? 0, ev.x, ev.y, { type: "bye", id: ev.userId });
    }
  });

  // Brownouts are SECTOR-WIDE, not proximity-scoped — a power sag is the one
  // event everyone shares no matter how far apart they are, and that
  // simultaneity ("did yours just go out too?" on the walkie) is the point.
  // THE STALKER's wire: pos frames within earshot-of-dread range; a mimic
  // tells nearby clients WHOSE voice to throw (the audio itself is replayed
  // client-side from that player's recent proximity-voice audio); a kill is
  // the entity kill flow.
  br.onStalker((ev) => {
    if (ev.type === "pos") {
      sendNear(0, ev.x, ev.y, { type: "stalker", x: ev.x, y: ev.y, mode: ev.mode, ...(ev.burn ? { burn: 1 } : {}) });
      return;
    }
    if (ev.type === "mimic") {
      sendNear(0, ev.x, ev.y, { type: "stalkerMimic", of: ev.of, x: ev.x, y: ev.y });
      return;
    }
    if (ev.type === "kill") {
      const ws = socketByUser.get(ev.userId);
      walkieDrop(ev.userId);
      if (ws) send(ws, { type: "dead", cause: "the stalker" });
      sendNear(0, ev.x, ev.y, { type: "bye", id: ev.userId });
    }
  });

  // THE GRABBER's wire (Level 2): its steps within the usual range (the
  // client stays silent past 8 cells — you do not hear it until it is close);
  // the screech carries; the grab is told to the room so a teammate can turn
  // and light it; `gone` to the whole level.
  br.onGrabber((ev) => {
    if (ev.type === "pos") {
      sendNear(2, ev.x, ev.y, { type: "grabber", x: ev.x, y: ev.y, h: ev.h, mode: ev.mode, targetId: ev.targetId });
      return;
    }
    if (ev.type === "screech" || ev.type === "grab") {
      sendNear(2, ev.x, ev.y, { type: "grabberCry", cry: ev.type, x: ev.x, y: ev.y, ...(ev.type === "grab" ? { targetId: ev.targetId } : {}) }, undefined, 40);
      return;
    }
    if (ev.type === "gone") {
      for (const s of br.sessions.values()) {
        if (s.level !== 2) continue;
        const w = socketByUser.get(s.userId);
        if (w) send(w, { type: "grabber", gone: true });
      }
      return;
    }
    const ws = socketByUser.get(ev.userId);
    walkieDrop(ev.userId);
    if (ws) send(ws, { type: "dead", cause: "the grabber" });
    sendNear(2, ev.x, ev.y, { type: "bye", id: ev.userId });
  });

  // THE BLEEDER's wire (Level 3). pos frames within the usual range; the
  // scream and the retreat shriek carry further (they are the warnings, and a
  // warning you are too far to hear is a bad one); `gone` goes to the whole
  // level, because it does not fade out — it goes back into the wiring.
  br.onBleeder((ev) => {
    if (ev.type === "pos") {
      sendNear(3, ev.x, ev.y, { type: "bleeder", x: ev.x, y: ev.y, h: ev.h, mode: ev.mode, targetId: ev.targetId, ...(ev.burn ? { burn: 1 } : {}) });
      return;
    }
    if (ev.type === "scream" || ev.type === "retreat") {
      sendNear(3, ev.x, ev.y, { type: "bleederCry", cry: ev.type, x: ev.x, y: ev.y, ...(ev.type === "scream" ? { targetId: ev.targetId } : {}) }, undefined, 40);
      return;
    }
    if (ev.type === "gone") {
      for (const s of br.sessions.values()) {
        if (s.level !== 3) continue;
        const w = socketByUser.get(s.userId);
        if (w) send(w, { type: "bleeder", gone: true });
      }
      return;
    }
    const ws = socketByUser.get(ev.userId);
    walkieDrop(ev.userId);
    if (ws) send(ws, { type: "dead", cause: "the bleeder" });
    sendNear(3, ev.x, ev.y, { type: "bye", id: ev.userId });
  });

  // THE HEAT's wire (Level 5): a player's own gauge, to them alone.
  br.onHeat((ev) => {
    const ws = socketByUser.get(ev.userId);
    if (ws) send(ws, { type: "heat", v: ev.heat });
  });

  // THE DEATHMOTHS' wire (Level 5): an awake swarm's position to whoever is
  // near; its waking (the flutter), circling and settling from further out,
  // so you hear a swarm before you see it. A kill rides the hurt wire.
  br.onMoths((ev) => {
    if (ev.type === "pos") {
      sendNear(5, ev.x, ev.y, { type: "moths", id: ev.id, x: ev.x, y: ev.y, m: ev.mode });
      return;
    }
    if (ev.type === "kill") return;
    sendNear(5, ev.x, ev.y, { type: "mothsEv", id: ev.id, ev: ev.type, x: ev.x, y: ev.y }, undefined, 40);
  });

  // THE LISTENER's wire (Level 6): its position and mode to whoever is near;
  // the touch to the touched (the cold hand) and as a whisper to everyone
  // near; the killing touch to everyone near and the victim; its going when
  // the level empties. The death itself rides the hurt wire.
  br.onListener((ev) => {
    if (ev.type === "pos") {
      sendNear(6, ev.x, ev.y, { type: "listener", id: ev.id, x: ev.x, y: ev.y, m: ev.mode });
      return;
    }
    if (ev.type === "gone") {
      for (const s of br.sessions.values()) {
        if (s.level !== 6) continue;
        const ws = socketByUser.get(s.userId);
        if (ws) send(ws, { type: "listenerEv", id: ev.id, ev: "gone" });
      }
      return;
    }
    if (ev.type === "kill") {
      // The killing touch reaches out on every screen near, the victim's too
      // (its death cam watches it): it used to ride only the hurt wire, so the
      // Listener stood doing nothing while somebody dropped (Nov 2026 polish
      // round). x, y are where the victim stood; the death rides the hurt wire.
      sendNear(6, ev.x, ev.y, { type: "listenerEv", id: ev.id, ev: "kill", x: ev.x, y: ev.y, you: false }, ev.userId, 20);
      const victim = socketByUser.get(ev.userId);
      if (victim) send(victim, { type: "listenerEv", id: ev.id, ev: "kill", x: ev.x, y: ev.y, you: true });
      return;
    }
    sendNear(6, ev.x, ev.y, { type: "listenerEv", id: ev.id, ev: "touch", x: ev.x, y: ev.y, you: false }, ev.userId, 20);
    const ws = socketByUser.get(ev.userId);
    if (ws) send(ws, { type: "listenerEv", id: ev.id, ev: "touch", x: ev.x, y: ev.y, you: true });
  });

  // THE THING BELOW's wire (Level 7): every stage of a swimmer's exposure to
  // that swimmer (the warnings ARE the rules), and the same to anyone near
  // enough to watch the water go dark round them; the strike to everyone near
  // (the kill itself rides the hurt wire).
  // THE BURROWER's wire (Level 8): where each one is and what it's doing to
  // whoever is near (the client clicks in the rock from it — the warning);
  // its going when the level empties. A kill rides the hurt wire.
  br.onBurrower((ev) => {
    if (ev.type === "pos") {
      sendNear(8, ev.x, ev.y, { type: "burrower", id: ev.id, x: ev.x, y: ev.y, m: ev.mode });
      return;
    }
    if (ev.type === "gone") {
      for (const s of br.sessions.values()) {
        if (s.level !== 8) continue;
        const ws = socketByUser.get(s.userId);
        if (ws) send(ws, { type: "burrowerEv", id: ev.id, ev: "gone" });
      }
      return;
    }
    sendNear(8, ev.x, ev.y, { type: "burrowerEv", id: ev.id, ev: ev.type, x: ev.x, y: ev.y }, undefined, 30);
  });

  // THE NEIGHBORHOOD WATCH's wire (Level 9): where it is and what it's doing
  // to whoever is near (the client whistles from it — the warning); a knock,
  // heard further; its going when the streets empty. A kill rides the hurt
  // wire.
  br.onWatch((ev) => {
    if (ev.type === "pos") {
      // out to its whistle's reach, or the whistle cut out past 28 cells
      sendNear(9, ev.x, ev.y, { type: "watch", id: ev.id, x: ev.x, y: ev.y, h: ev.h, m: ev.mode }, undefined, 34);
      return;
    }
    if (ev.type === "gone") {
      toLevel(9, { type: "watchEv", id: ev.id, ev: "gone" });
      return;
    }
    sendNear(9, ev.x, ev.y, { type: "watchEv", id: ev.id, ev: ev.type, x: ev.x, y: ev.y }, undefined, 40);
  });

  br.onDeep((ev) => {
    const own = socketByUser.get(ev.userId);
    if (ev.type === "strike") {
      sendNear(7, ev.x, ev.y, { type: "deepEv", ev: "strike", uid: ev.userId, x: ev.x, y: ev.y, you: false }, ev.userId, 40);
      return;
    }
    const stage = ev.type === "stage" ? ev.stage : 0;
    if (own) send(own, { type: "deepEv", ev: "stage", stage, uid: ev.userId, x: ev.x, y: ev.y, you: true });
    sendNear(7, ev.x, ev.y, { type: "deepEv", ev: "stage", stage, uid: ev.userId, x: ev.x, y: ev.y, you: false }, ev.userId, 30);
  });

  // THE TEMP's wire (Level 4): its position and pose to whoever is near, the
  // freeze (a creak, near), the kill, its going — and the troffers' dips to
  // everyone on the level, so every client darkens the same zone together.
  br.onTemp((ev) => {
    if (ev.type === "pos") {
      // out to TEMP_RANGE: it is watched to 40 cells, so it is SEEN to 40
      sendNear(4, ev.x, ev.y, { type: "temp", x: ev.x, y: ev.y, h: ev.h, pose: ev.pose, moving: ev.moving ? 1 : 0 }, undefined, 40);
      return;
    }
    if (ev.type === "freeze") {
      sendNear(4, ev.x, ev.y, { type: "tempFreeze", x: ev.x, y: ev.y, pose: ev.pose }, undefined, 40);
      return;
    }
    if (ev.type === "gone" || ev.type === "blink") {
      toLevel(4, ev.type === "gone" ? { type: "temp", gone: true } : { type: "blink", zone: ev.zone, ms: ev.ms });
      return;
    }
    const ws = socketByUser.get(ev.userId);
    walkieDrop(ev.userId);
    if (ws) send(ws, { type: "dead", cause: "the temp" });
    sendNear(4, ev.x, ev.y, { type: "bye", id: ev.userId });
  });

  // THE SHY GUY's wire (Level 1). Same proximity rule as the other creatures,
  // plus an explicit `gone` frame: it doesn't fade out of the stream, it
  // LEAVES, and the client has to drop it the moment it does or a corpse of a
  // model would sit in the water where it vanished.
  br.onShy((ev) => {
    if (ev.type === "pos") {
      // out to SHY_SEE_MAX: it can be stared into a charge from 34 cells, so
      // it is drawn to 34 (Nov 2026 validation run)
      sendNear(1, ev.x, ev.y, { type: "shy", x: ev.x, y: ev.y, mode: ev.mode, targetId: ev.targetId }, undefined, 34);
      return;
    }
    if (ev.type === "gone") {
      toLevel(1, { type: "shy", gone: true });
      return;
    }
    const ws = socketByUser.get(ev.userId);
    walkieDrop(ev.userId);
    if (ws) send(ws, { type: "dead", cause: "the shy guy" });
    sendNear(1, ev.x, ev.y, { type: "bye", id: ev.userId });
  });

  // THE ALLIGATORS' wire (Level 1): pos frames within the normal proximity
  // window, plus a BITE frame — the munch — for everyone close enough to
  // hear it. Deaths ride the normal hurt pipeline (cause "an alligator"),
  // so there is no kill frame here.
  br.onGator((ev) => {
    if (ev.type === "pos") {
      sendNear(1, ev.x, ev.y, { type: "gator", id: ev.id, x: ev.x, y: ev.y, h: ev.h, mode: ev.mode });
      return;
    }
    sendNear(1, ev.x, ev.y, { type: "gatorBite", id: ev.id, x: ev.x, y: ev.y });
  });

  // A props-only publish from the map editor (service.ts swapKit): anybody
  // on that level gets the changed chunks again, rebuilt in place, if they
  // are close enough to have them loaded (the client keeps 4 chunks out).
  br.onKitSwap((level, chunks) => {
    for (const s of br.sessions.values()) {
      if (s.level !== level) continue;
      const w = socketByUser.get(s.userId);
      if (!w) continue;
      const pcx = Math.floor(s.x / CHUNK);
      const pcy = Math.floor(s.y / CHUNK);
      for (const c of chunks) {
        if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cy - pcy)) > 4) continue;
        const payload = br.chunkFor(s.userId, c.cx, c.cy);
        if (payload) send(w, { type: "chunk", ...payload, refresh: true });
      }
    }
  });

  // THE ELECTRICAL STATION. Power changes reach everyone on Level 3 (the
  // whole station shares one set of circuits); a panel's crackle and its arc
  // reach whoever is near enough to hear it; a breaker thrown is told to the
  // whole station, and all six open the way to Level 4 for everyone, app-wide.
  br.onStation((ev) => {
    if (ev.type === "arc") {
      sendNear(3, ev.x, ev.y, ev, undefined, 30);
      return;
    }
    for (const s of br.sessions.values()) {
      if (s.level !== 3) continue;
      const w = socketByUser.get(s.userId);
      if (w) send(w, ev);
    }
    if (ev.type === "breaker" && ev.opened) {
      bus.emit("backrooms.level4", { finder: ev.by });
      for (const s of br.sessions.values()) {
        const w2 = socketByUser.get(s.userId);
        if (w2) send(w2, { type: "level4", who: ev.by });
      }
    }
  });

  br.onBrownout((ms, black) => {
    for (const s of br.sessions.values()) {
      if (s.level !== 0) continue;
      const w = socketByUser.get(s.userId);
      if (w) send(w, { type: "brownout", ms, black });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    const who = userBySocket.get(ws)!;

    // One game socket per user — a second connection replaces the first
    // (refresh recovery), and the old session ends cleanly.
    const prev = socketByUser.get(who.id);
    if (prev && prev !== ws) {
      try {
        prev.close();
      } catch {
        /* already dead */
      }
      // The session is NOT dropped: this is one player's second socket taking
      // over (a reopened tab, a reconnect that raced the old close), and the
      // run carries straight on. The old socket's close handler will try to
      // freeze it, which enter() then undoes by resuming.
    }
    socketByUser.set(who.id, ws);

    ws.on("message", (raw: RawData) => {
      let msg: { type?: string; door?: number; x?: number; y?: number; h?: number; p?: number; want?: { cx: number; cy: number }[] };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      // ---- the spectator's frames (law 12) ----
      if (msg.type === "spec-cycle") {
        const sp = br.spectators.get(who.id);
        if (sp) cycleSpectate(sp, Number((msg as { dir?: unknown }).dir) < 0 ? -1 : 1);
        return;
      }
      if (msg.type === "spec-cam") {
        const sp = br.spectators.get(who.id);
        const yaw = Number((msg as { yaw?: unknown }).yaw);
        if (sp && Number.isFinite(yaw)) {
          sp.camYaw = yaw;
          // a speaking ghost moves with the camera (paced by the client's 5Hz)
          if (sp.talkingSince) ghostTell(sp, true);
        }
        return;
      }
      if (msg.type === "ghost-ptt") {
        const sp = br.spectators.get(who.id);
        if (!sp) return;
        const on = !!(msg as { on?: unknown }).on;
        sp.wantTalk = on;
        if (on) startTalking(sp);
        else stopTalking(sp);
        specState(sp);
        return;
      }
      if (msg.type === "spec-leave") {
        endSpectate(who.id);
        return;
      }

      if (msg.type === "enter") {
        {
          const now = Date.now();
          const recent = (enterTimes.get(who.id) ?? []).filter((t) => now - t < 60_000);
          if (recent.length >= 20) return;
          recent.push(now);
          enterTimes.set(who.id, recent);
        }
        endSpectate(who.id); // a new run ends any watch
        const loadout = Array.isArray((msg as { loadout?: unknown }).loadout)
          ? ((msg as { loadout: unknown[] }).loadout.filter((n) => Number.isInteger(n)) as number[])
          : [];
        const lv = Number((msg as { level?: unknown }).level);
        const wantLevel: BrLevel = lv === 9 ? 9 : lv === 8 ? 8 : lv === 7 ? 7 : lv === 6 ? 6 : lv === 5 ? 5 : lv === 4 ? 4 : lv === 3 ? 3 : lv === 2 ? 2 : lv === 1 ? 1 : 0;
        const r = br.enter(who.id, who.name, Number(msg.door ?? -1), loadout, wantLevel);
        if ("error" in r) {
          send(ws, { type: "denied", error: r.error });
          return;
        }
        // Design rule: no-clipping in hangs up Solace voice — in the
        // backrooms, comms are proximity only.
        bus.emit("voice.kick", { userId: who.id });
        // …and the roster learns which level they no-clipped into.
        bus.emit("zone.presence", {
          userId: who.id, zone: "backrooms", on: true,
          detail: zoneDetail(r.level),
        });
        // First steps in (idempotent) — and a resumed Poolrooms body counts
        // as having gone through the door.
        award(who.id, "br-first");
        if (r.level === 1) award(who.id, "pools-first");
        // A RESUMED session may be standing in the Poolrooms — the welcome
        // describes whichever world the body is actually in.
        const sec = secFor(r.level);
        send(ws, {
          type: "welcome",
          level: r.level,
          size: sec.size,
          chunk: CHUNK,
          // Frozen worldgen names are fingerprinted — display names map over
          // them here (Josh's Alpha/Bravo/Charlie/Delta renames; the pools
          // doors keep their own worldgen names).
          // each door carries its floor (steps): the client builds the door
          // before the chunk under it has streamed (the buried-drain bug)
          doors: sec.doors.map((d) => ({ ...d, floor: sec.floor[d.y * sec.size + d.x] ?? 0 })),
          // District id → type, so the client can flavor materials (which
          // wallpaper a zone wears) without ever holding unexplored geometry.
          districts: sec.districts.map((d) => ({ id: d.id, type: d.type })),
          you: { x: r.x, y: r.y, door: r.door },
          inventory: r.inventory,
          // relics already in hand — a RESUMED run (a refresh, a dropped
          // socket) must show them again, or its slots read empty while the
          // server still counts them and refuses pickups for "no space"
          relics: r.relics,
          // ...and a key or fuses in hand, or a resumed runner can't open the
          // door the key is for (Oct 2026 review)
          hasKey: r.hasKey || undefined,
          fuses: r.fuses?.length || undefined,
          hp: r.hp,
          // A joiner mid-blackout walks into the same darkness everyone else
          // is standing in (undefined when the lights are fine — stringify
          // drops it from the frame).
          brownoutMs: r.level === 0 ? br.brownoutRemaining() || undefined : undefined,
          brownoutBlack: r.level === 0 && br.brownoutRemaining() > 0 ? br.brownoutBlack() : undefined,
          // the station's breakers, cutoffs, shutter and power, as they stand
          station: r.level === 3 ? br.stationState() ?? undefined : undefined,
          // the office's keycard and stairwell door, as they stand
          office: r.level === 4 ? br.officeState() ?? undefined : undefined,
          // the hotel's register, suites' doors, lifts, furnaces and rusty door
          hotel: r.level === 5 ? br.hotelState() ?? undefined : undefined,
          lights: r.level === 6 ? br.lightsState() ?? undefined : undefined,
          ocean: r.level === 7 ? br.oceanState() ?? undefined : undefined,
          cave: r.level === 8 ? br.caveState() ?? undefined : undefined,
          suburb: r.level === 9 ? br.suburbState() ?? undefined : undefined,
        });
        // The waterways have rowboats — AFTER the welcome, which tears the
        // client's world down (an earlier snapshot would be wiped with it).
        if (r.level === 1) send(ws, { type: "boats", list: br.boats() });
        // Introductions both ways — only within earshot.
        sendNear(
          r.level,
          r.x,
          r.y,
          { type: "pos", id: who.id, name: who.name, x: r.x, y: r.y, h: 0, p: 0, suit: suitOf(who.id) },
          who.id,
        );
        for (const other of br.nearby(who.id, NEARBY_CELLS)) {
          send(ws, {
            type: "pos",
            id: other.userId,
            name: other.name,
            x: other.x,
            y: other.y,
            h: other.heading,
            p: other.pose,
            suit: suitOf(other.userId),
            e: other.equip ?? "",
            pt: other.pitch ?? 0,
            em: other.emote ?? "", // joined mid-dance — see it from the top
          });
        }
        return;
      }

      // A FROZEN run waits for an `enter` and does nothing else (Oct 2026
      // review): after a `leave` the socket stays open, and a body that kept
      // moving, picking up and opening doors while every creature skipped it
      // as frozen was immune to the whole level.
      if (br.sessions.get(who.id)?.lostAt) return;

      if (msg.type === "move") {
        const now = Date.now();
        const bk = moveBucket.get(who.id) ?? { tokens: MOVE_BURST, at: now };
        bk.tokens = Math.min(MOVE_BURST, bk.tokens + ((now - bk.at) / 1000) * MOVE_RATE);
        bk.at = now;
        moveBucket.set(who.id, bk);
        if (bk.tokens < 1) return;
        bk.tokens -= 1;
        lastMove.set(who.id, now);
        const lvl = levelOf(who.id);
        // POSE FIRST: the fall settle inside move() reads it to know whether
        // the feet are down yet, so a frame-late pose would land the damage
        // a beat early — the exact bug this ordering fixes.
        const poseNow = msg.p === 1 ? 1 : msg.p === 2 ? 2 : msg.p === 3 ? 3 : msg.p === 4 ? 4 : 0;
        const sessPre = br.sessions.get(who.id);
        if (sessPre) sessPre.pose = poseNow;
        const r = br.move(who.id, Number(msg.x), Number(msg.y), Number(msg.h ?? 0));
        if (!r) return;
        if (r.dead) {
          // A fatal fall: the session is already gone (onHurt sent 'dead').
          sendNear(lvl, r.x, r.y, { type: "bye", id: who.id });
          return;
        }
        if (r.corrected) send(ws, { type: "correct", x: r.x, y: r.y });
        // Body pose (crouch/air) rides the move frame — clamped, stored on the
        // session so late arrivals get it in their intro, and relayed below.
        const pose = poseNow; // 3 = swimming, 4 = aboard a boat (set above)
        const sess = br.sessions.get(who.id);
        // Held equipment ("kind" or "kind!" while in use) — VALIDATED against
        // the session's own inventory, so nobody can wave gear they don't
        // carry. Peers render the model on the hand and play the use sounds.
        if (sess) {
          const raw = String((msg as { e?: unknown }).e ?? "");
          const active = raw.endsWith("!");
          const kind = active ? raw.slice(0, -1) : raw;
          sess.equip = kind && sess.inventory.some((i) => i.kind === kind) ? kind + (active ? "!" : "") : "";
          // Look pitch (clamped) — cosmetic, drives the peer's head aim.
          const pt = Number((msg as { pt?: unknown }).pt);
          sess.pitch = Number.isFinite(pt) ? Math.max(-1.6, Math.min(1.6, pt)) : 0;
          // Emote — validated against the fixed catalog (never relay free
          // text), cosmetic like pitch: peers play the dance on the avatar.
          const em = String((msg as { em?: unknown }).em ?? "");
          sess.emote = EMOTE_IDS.has(em) ? em : "";
        }
        // A flying admin is invisible: no position leaves for anyone else, and
        // the "bye" below is what removed their body when they took off.
        if (sess?.fly) return;
        sendNear(
          lvl,
          r.x,
          r.y,
          { type: "pos", id: who.id, name: who.name, x: r.x, y: r.y, h: Number(msg.h ?? 0), p: pose, suit: suitOf(who.id), e: sess?.equip ?? "", pt: sess?.pitch ?? 0, em: sess?.emote ?? "" },
          who.id,
        );
        // A captained boat rides the same fan-out — everyone near sees it
        // glide with its riders.
        const myBoat = br.boatFor(who.id);
        if (myBoat) {
          sendNear(lvl, r.x, r.y, { type: "boat", ...myBoat }, who.id);
        }
        return;
      }

      // THE BOATS: board the nearest rowboat / step off. The service owns
      // seats, distance, and the deep-water steering rule.
      if (msg.type === "boatBoard") {
        const r = br.boardBoat(who.id, Number((msg as { id?: unknown }).id));
        if ("error" in r) {
          send(ws, { type: "boatSeat", id: null, error: r.error });
        } else {
          send(ws, { type: "boatSeat", id: r.boat.id, seat: r.seat });
          const s = br.sessions.get(who.id);
          if (s) sendNear(s.level, r.boat.x, r.boat.y, { type: "boat", ...r.boat });
        }
        return;
      }
      if (msg.type === "boatLeave") {
        const r = br.leaveBoat(who.id);
        if ("error" in r) {
          send(ws, { type: "boatSeat", id: null, error: r.error });
        } else {
          send(ws, { type: "boatSeat", id: null });
          const s = br.sessions.get(who.id);
          if (s) sendNear(s.level, r.boat.x, r.boat.y, { type: "boat", ...r.boat });
        }
        return;
      }

      // ADMIN FLYCAM. The service re-checks the admin flag against the DB, so
      // this frame is a request, not a grant. Taking off makes the ghost
      // vanish from everyone else's world; landing puts them back in it.
      if (msg.type === "fly") {
        const s = br.sessions.get(who.id);
        const before = s?.x ?? 0;
        const beforeY = s?.y ?? 0;
        const r = br.setFly(who.id, !!(msg as { on?: unknown }).on);
        if ("error" in r) {
          send(ws, { type: "fly", ok: false, error: r.error });
          return;
        }
        send(ws, { type: "fly", ok: true, on: r.fly });
        if (r.fly) sendNear(levelOf(who.id), before, beforeY, { type: "bye", id: who.id }, who.id);
        return;
      }

      if (msg.type === "chunks" && Array.isArray(msg.want)) {
        // Paced (Sep 2026 review): each id is nine 256-entry arrays plus a
        // marks query, up to 32 per message, and nothing bounded the rate.
        const nowC = Date.now();
        if (nowC - (lastChunks.get(who.id) ?? 0) < CHUNKS_MIN_MS) return;
        lastChunks.set(who.id, nowC);
        for (const w of msg.want.slice(0, 32)) {
          const cx = Number(w?.cx), cy = Number(w?.cy);
          if (!Number.isInteger(cx) || !Number.isInteger(cy)) continue;
          const payload = br.chunkFor(who.id, cx, cy);
          if (payload) {
            send(ws, { type: "chunk", ...payload });
            // Spray marks ride the same secrecy rule as geometry: you get
            // a chunk's marks only when you're close enough for the chunk.
            const marks = store.brMarksInRect(
              // the chunk's own level: a spectator has no session, so
              // levelOf read 0 and painted Level 0's marks over Levels 1-9
              sectorIdFor(payload.level),
              payload.cx * CHUNK,
              payload.cy * CHUNK,
              (payload.cx + 1) * CHUNK,
              (payload.cy + 1) * CHUNK,
            );
            if (marks.length) send(ws, { type: "marks", cx: payload.cx, cy: payload.cy, level: payload.level, marks });
          }
        }
        return;
      }

      // Spray paint (B3): a dot on a wall face. Server-authoritative where
      // it counts — you must CARRY a spray can (its color is what sprays,
      // not whatever the client claims) and be standing near the wall.
      if (msg.type === "spray") {
        const s = br.sessions.get(who.id);
        if (!s) return;
        const can = s.inventory.find((i) => i.kind === "spraycan");
        if (!can) return;
        const now = Date.now();
        if (now - (lastSpray.get(who.id) ?? 0) < 32) return; // ~30/s cap
        const m = msg as unknown as { cellX?: unknown; cellY?: unknown; face?: unknown; u?: unknown; v?: unknown };
        const cellX = Math.round(Number(m.cellX));
        const cellY = Math.round(Number(m.cellY));
        // NaN passes every comparison-shaped guard below (Sep 2026 review).
        if (!Number.isInteger(cellX) || !Number.isInteger(cellY)) return;
        const face = String(m.face ?? "");
        const u = Number(m.u);
        const v = Number(m.v);
        if (!["N", "S", "E", "W"].includes(face)) return;
        if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) return;
        if (Math.hypot(s.x - (cellX + 0.5), s.y - (cellY + 0.5)) > 3.2) return;
        lastSpray.set(who.id, now);
        const color = can.color ?? "black";
        store.brAddMark(sectorIdFor(s.level), { cellX, cellY, face, u, v, color, userId: who.id });
        sendNear(
          s.level,
          s.x,
          s.y,
          { type: "mark", level: s.level, cellX, cellY, face, u, v, color },
          who.id,
          MARK_CELLS,
        );
        return;
      }

      if (msg.type === "leave") {
        // Navigating away is not an exit either — same freeze, same clock.
        // Otherwise clicking back to Solace would be the safe escape that
        // closing the app no longer is. Quitting on purpose is the pause
        // menu's FORFEIT, which kills you honestly.
        freezeSession(who.id);
        return;
      }

      if (msg.type === "walkie-ch") {
        if (!hasWalkie(who.id)) return;
        const ch = Math.min(10, Math.max(1, Math.round(Number((msg as { ch?: unknown }).ch ?? 1))));
        walkieCh.set(who.id, ch);
        return;
      }

      if (msg.type === "walkie-tx") {
        if (!hasWalkie(who.id)) return;
        const on = !!(msg as { on?: unknown }).on;
        {
          const now = Date.now();
          const last = walkieLast.get(who.id);
          // a repeat of the same state is nothing, and a key pressed again
          // inside 200ms is a finger, not a radio. An OFF always goes through,
          // or a quick tap would leave every receiver keyed open.
          if (last && (last.on === on || (on && now - last.at < 200))) return;
          walkieLast.set(who.id, { on, at: now });
        }
        const ch = walkieCh.get(who.id) ?? 1;
        // A crackling radio is LOUD in the silence — the entity hears it.
        const me = br.sessions.get(who.id);
        // (never a flying operator's: a flyer is a camera, and its radio
        // walked the Listener off toward it — Nov 2026 polish round)
        if (on && me && !me.fly) br.entityHears(me.x, me.y, 10, me.level);
        for (const s of br.sessions.values()) {
          if (s.userId === who.id) continue;
          // off: tell every carrier, so a radio that hopped levels mid-call
          // can never be left keyed open on the old one
          if (on && s.level !== me?.level) continue;
          if (!hasWalkie(s.userId)) continue;
          if ((walkieCh.get(s.userId) ?? 1) !== ch) continue;
          const ws2 = socketByUser.get(s.userId);
          if (ws2) send(ws2, { type: "walkie", id: who.id, on });
        }
        return;
      }

      // Extraction — the ONLY in-game way out (Josh's rule): the server
      // verifies you're physically at your entry door, ends the session,
      // and hands back the debrief facts for the Voss screen.
      // Speaking on the open mic — the entity is drawn to voices (6 cells
      // ≈ 12m; louder than footsteps, quieter than a walkie). Rate-limited;
      // the client sends this ~every 1.5s while actually speaking.
      if (msg.type === "noise") {
        const now = Date.now();
        if (now - (lastNoise.get(who.id) ?? 0) < 1200) return;
        lastNoise.set(who.id, now);
        const s = br.sessions.get(who.id);
        // a flyer's voice draws nothing either (Nov 2026 polish round)
        if (s && !s.fly) br.entityHears(s.x, s.y, 6, s.level);
        return;
      }

      if (msg.type === "cam") {
        br.setCam(who.id, !!(msg as { on?: unknown }).on);
        return;
      }

      // DROWNING (Poolrooms v3): the head crossed the waterline (or came
      // back up). The service gates it to swim-deep cells and owns the 10s
      // clock — a false report in shallow water is simply ignored.
      if (msg.type === "swim") {
        br.setSubmerged(who.id, !!(msg as { sub?: unknown }).sub);
        return;
      }

      // EYE CONTACT with THE SHY GUY. The client raycasts its crosshair
      // against the actual model — the only place that precision exists —
      // and says so. The service treats it as a claim and re-checks range,
      // line of sight and facing before anything happens; reporting a look
      // you didn't take only ever hurts the reporter, and NOT reporting one
      // is covered by the service's own backstop cone.
      if (msg.type === "shy-look") {
        br.shyLook(who.id);
        return;
      }

      if (msg.type === "consume") {
        const itemId = Number((msg as { itemId?: unknown }).itemId);
        const r = br.consumeItem(who.id, itemId);
        if ("error" in r) send(ws, { type: "consumed", ok: false, itemId, error: r.error });
        else {
          send(ws, { type: "consumed", ok: true, itemId, kind: r.kind, hp: r.hp });
          // LAW 5: the room hears it too — the pills, the gulp, the battery
          // (the kind is all that leaves; never the item or the health)
          const s = br.sessions.get(who.id);
          if (s && !s.fly) sendNear(s.level, s.x, s.y, { type: "peergear", id: who.id, kind: r.kind, x: s.x, y: s.y }, who.id, 16);
        }
        return;
      }

      if (msg.type === "loot-open") {
        const r = br.lootView(who.id, Number((msg as { id?: unknown }).id));
        if ("error" in r) send(ws, { type: "corpse", ok: false, error: r.error });
        else send(ws, { type: "corpse", ok: true, id: Number((msg as { id?: unknown }).id), name: r.name, items: r.items });
        return;
      }

      if (msg.type === "loot-take") {
        const m2 = msg as unknown as { id?: unknown; idx?: unknown };
        const r = br.lootTake(who.id, Number(m2.id), Number(m2.idx));
        if ("error" in r) send(ws, { type: "looted", ok: false, error: r.error });
        else send(ws, { type: "looted", ok: true, item: r.item, remaining: r.remaining });
        return;
      }

      // G: drop what you're holding. The item leaves your locker the moment
      // it hits the carpet, so a drop can never duplicate gear.
      if (msg.type === "drop") {
        const m3 = msg as unknown as { itemId?: unknown; charge?: unknown };
        const charge = Number(m3.charge);
        const itemId = Number(m3.itemId);
        const r = br.dropItem(who.id, itemId, Number.isFinite(charge) ? charge : null);
        // The response ECHOES the itemId: two quick drops must clear the two
        // slots they came from, not race over one "pending" variable.
        if ("error" in r) send(ws, { type: "dropped", ok: false, itemId, error: r.error });
        else send(ws, { type: "dropped", ok: true, itemId, id: r.id, kind: r.kind });
        return;
      }

      if (msg.type === "take-drop") {
        const r = br.takeDrop(who.id, Number((msg as { id?: unknown }).id));
        if ("error" in r) send(ws, { type: "tookDrop", ok: false, error: r.error });
        else send(ws, { type: "tookDrop", ok: true, item: r.item, charge: r.charge });
        return;
      }

      // The pause menu's forfeit: end the run the hard way. Same
      // consequences as the entity catching you — body, ledger, no debrief.
      if (msg.type === "forfeit") {
        const s = br.sessions.get(who.id);
        if (!s) return;
        const { x, y, level } = s;
        walkieDrop(who.id);
        if (br.forfeit(who.id)) {
          send(ws, { type: "dead", forfeit: true });
          sendNear(level, x, y, { type: "bye", id: who.id });
        }
        return;
      }

      // A LORE DRIVE. Finding one unlocks it for the whole platform — so the
      // finder gets the text to read on the spot, and everyone inside hears
      // that the archive grew. The section's Research tab picks it up from the
      // DB on its next read.
      if (msg.type === "take-drive") {
        const id = String((msg as { id?: unknown }).id ?? "");
        const r = br.takeDrive(who.id, who.name, id);
        if ("error" in r) {
          send(ws, { type: "driveTaken", ok: false, error: r.error });
          return;
        }
        send(ws, { type: "driveTaken", ok: true, ...r });
        if (r.fresh) {
          bus.emit("backrooms.drive", { driveId: r.driveId, title: r.title, finder: who.name });
          for (const s of br.sessions.values()) {
            if (s.userId === who.id) continue;
            const w2 = socketByUser.get(s.userId);
            if (w2) send(w2, { type: "driveFound", title: r.title, finder: who.name });
          }
        }
        return;
      }

      // THE KEY — one object, in the whole level, that opens the only door.
      if (msg.type === "take-key") {
        const r = br.takeKey(who.id);
        if ("error" in r) {
          send(ws, { type: "keyTaken", ok: false, error: r.error });
          return;
        }
        send(ws, { type: "keyTaken", ok: true });
        // Everyone inside should know it's in play — this is the community's
        // end goal, not a private pickup.
        const kl = br.sessions.get(who.id)?.level ?? 0;
        for (const s of br.sessions.values()) {
          if (s.userId === who.id || s.level !== kl) continue;
          const w2 = socketByUser.get(s.userId);
          if (w2) send(w2, { type: "keyInPlay", who: who.name });
        }
        return;
      }

      // THE PASSAGE — step through THE DOOR into the Poolrooms, or back.
      // The response is a fresh mini-welcome: the client tears down and
      // rebuilds its world from these parameters.
      if (msg.type === "travel") {
        const before = br.sessions.get(who.id);
        if (!before) return;
        const fromLevel = before.level;
        const fromX = before.x;
        const fromY = before.y;
        const r = br.travel(who.id);
        if ("error" in r) {
          send(ws, { type: "travelDenied", error: r.error });
          return;
        }
        if (r.level === 1) award(who.id, "pools-first"); // through THE DOOR
        // The roster's level label follows them through.
        bus.emit("zone.presence", {
          userId: who.id, zone: "backrooms", on: true,
          detail: zoneDetail(r.level),
        });
        sendNear(fromLevel, fromX, fromY, { type: "bye", id: who.id }, who.id);
        const sec = secFor(r.level);
        send(ws, {
          type: "travel",
          level: r.level,
          size: sec.size,
          chunk: CHUNK,
          // each door carries its floor (steps): the client builds the door
          // before the chunk under it has streamed (the buried-drain bug)
          doors: sec.doors.map((d) => ({ ...d, floor: sec.floor[d.y * sec.size + d.x] ?? 0 })),
          districts: sec.districts.map((d) => ({ id: d.id, type: d.type })),
          you: { x: r.x, y: r.y },
          brownoutMs: r.level === 0 ? br.brownoutRemaining() || undefined : undefined,
          brownoutBlack: r.level === 0 && br.brownoutRemaining() > 0 ? br.brownoutBlack() : undefined,
          station: r.level === 3 ? br.stationState() ?? undefined : undefined,
          // the office's keycard and stairwell door, as they stand
          office: r.level === 4 ? br.officeState() ?? undefined : undefined,
          // the hotel's register, suites' doors, lifts, furnaces and rusty door
          hotel: r.level === 5 ? br.hotelState() ?? undefined : undefined,
          lights: r.level === 6 ? br.lightsState() ?? undefined : undefined,
          ocean: r.level === 7 ? br.oceanState() ?? undefined : undefined,
          cave: r.level === 8 ? br.caveState() ?? undefined : undefined,
          suburb: r.level === 9 ? br.suburbState() ?? undefined : undefined,
        });
        // The fleet, AFTER the travel frame (which tears the world down).
        if (r.level === 1) send(ws, { type: "boats", list: br.boats() });
        // Introductions on the new level, both ways.
        const sess = br.sessions.get(who.id);
        sendNear(
          r.level,
          r.x,
          r.y,
          { type: "pos", id: who.id, name: who.name, x: r.x, y: r.y, h: 0, p: 0, suit: suitOf(who.id) },
          who.id,
        );
        if (sess) {
          for (const other of br.nearby(who.id, NEARBY_CELLS)) {
            send(ws, {
              type: "pos",
              id: other.userId,
              name: other.name,
              x: other.x,
              y: other.y,
              h: other.heading,
              p: other.pose,
              suit: suitOf(other.userId),
              e: other.equip ?? "",
              pt: other.pitch ?? 0,
            });
          }
        }
        return;
      }

      // THE DOOR. Key in hand + standing at it = Level 1 opens for everyone,
      // once, forever.
      if (msg.type === "open-door") {
        const r = br.openDoor(who.id, who.name);
        if ("error" in r) {
          send(ws, { type: "doorTried", ok: false, error: r.error });
          return;
        }
        send(ws, { type: "doorTried", ok: true, fresh: r.fresh });
        if (r.fresh) {
          // which door: Level 0's opens the Poolrooms, Level 1's hatch Pipe
          // Dreams, the office's stairwell door (badged) Level 5
          const at = br.sessions.get(who.id)?.level ?? 0;
          const opened = at === 9 ? 10 : at === 8 ? 9 : at === 7 ? 8 : at === 6 ? 7 : at === 5 ? 6 : at === 4 ? 5 : at === 1 ? 2 : 1;
          bus.emit(opened === 10 ? "backrooms.level10" : opened === 9 ? "backrooms.level9" : opened === 8 ? "backrooms.level8" : opened === 7 ? "backrooms.level7" : opened === 6 ? "backrooms.level6" : opened === 5 ? "backrooms.level5" : opened === 2 ? "backrooms.level2" : "backrooms.level1", { finder: who.name });
          store.affinityHook?.(who.id, "voss", "door");
          for (const s of br.sessions.values()) {
            const w2 = socketByUser.get(s.userId);
            if (w2) send(w2, { type: opened === 10 ? "level10" : opened === 9 ? "level9" : opened === 8 ? "level8" : opened === 7 ? "level7" : opened === 6 ? "level6" : opened === 5 ? "level5" : opened === 2 ? "level2" : "level1", who: who.name });
          }
        }
        return;
      }

      // THE GUEST REGISTER (Level 5): read the line that's still clear. Only
      // at the table — the number never rides any other frame.
      if (msg.type === "read-register") {
        const r = br.readRegister(who.id);
        if ("error" in r) send(ws, { type: "register", ok: false, error: r.error });
        else send(ws, { type: "register", ok: true, number: r.number });
        return;
      }

      // THE LIFTS (Level 5): press a floor. 1-12 come out at another lift on
      // this floor; 13 and up, the doors close and never open again.
      if (msg.type === "lift") {
        const before = br.sessions.get(who.id);
        if (!before) return;
        const fromX = before.x;
        const fromY = before.y;
        const r = br.rideLift(who.id, Number((msg as { floor?: unknown }).floor));
        if ("error" in r) {
          send(ws, { type: "lifted", ok: false, error: r.error });
          return;
        }
        // the lift's death rides the ordinary hurt wire (dead + bye, once)
        if ("dead" in r) return;
        send(ws, { type: "lifted", ok: true, x: r.x, y: r.y, floor: r.floor });
        // gone from the lift you left; arrived at the one you came out of
        sendNear(5, fromX, fromY, { type: "bye", id: who.id }, who.id);
        // with what is in their hand: a lift ride used to leave them
        // empty-handed to everybody else until their next step
        { const ls = br.sessions.get(who.id); sendNear(5, r.x, r.y, { type: "pos", id: who.id, name: who.name, x: r.x, y: r.y, h: 0, p: 0, suit: suitOf(who.id), e: ls?.equip ?? "", pt: ls?.pitch ?? 0 }, who.id); }
        for (const other of br.nearby(who.id, NEARBY_CELLS)) {
          send(ws, { type: "pos", id: other.userId, name: other.name, x: other.x, y: other.y, h: other.heading, p: other.pose, suit: suitOf(other.userId), e: other.equip ?? "", pt: other.pitch ?? 0 });
        }
        return;
      }

      // PIPE DREAMS' FUSES: pick one up, and put them in the box.
      if (msg.type === "take-fuse") {
        const r = br.takeFuse(who.id, Number((msg as { i?: unknown }).i));
        if ("error" in r) send(ws, { type: "fuseTaken", ok: false, error: r.error });
        else {
          send(ws, { type: "fuseTaken", ok: true, carrying: r.carrying });
          for (const s of br.sessions.values()) {
            if (s.userId === who.id || s.level !== 2) continue;
            const w2 = socketByUser.get(s.userId);
            if (w2) send(w2, { type: "fuseInPlay", who: who.name });
          }
        }
        return;
      }
      if (msg.type === "insert-fuses") {
        const r = br.insertFuses(who.id, who.name);
        if ("error" in r) {
          send(ws, { type: "fusesIn", ok: false, error: r.error });
          return;
        }
        send(ws, { type: "fusesIn", ok: true, inserted: r.inserted, added: r.added, opened: r.opened });
        for (const s of br.sessions.values()) {
          if (s.userId === who.id || s.level !== 2 || !r.added) continue;
          const w2 = socketByUser.get(s.userId);
          if (w2) send(w2, { type: "fuseAdded", who: who.name, inserted: r.inserted });
        }
        if (r.opened) {
          bus.emit("backrooms.level3", { finder: who.name });
          store.affinityHook?.(who.id, "voss", "door");
          for (const s of br.sessions.values()) {
            const w2 = socketByUser.get(s.userId);
            if (w2) send(w2, { type: "level3", who: who.name });
          }
        }
        return;
      }

      // THE ELECTRICAL STATION's levers: a section's breaker (thrown once,
      // for good) and its cutoff (the section's power off for a while).
      if (msg.type === "throw-breaker") {
        const r = br.throwBreaker(who.id, who.name, Number((msg as { section?: unknown }).section));
        if ("error" in r) send(ws, { type: "breakerThrown", ok: false, error: r.error });
        else send(ws, { type: "breakerThrown", ok: true, on: r.on, total: r.total, fresh: r.fresh, opened: r.opened });
        return;
      }
      if (msg.type === "pull-cutoff") {
        const r = br.pullCutoff(who.id, Number((msg as { section?: unknown }).section));
        if ("error" in r) send(ws, { type: "cutoffPulled", ok: false, error: r.error });
        else send(ws, { type: "cutoffPulled", ok: true, ms: r.ms });
        return;
      }

      if (msg.type === "take-relic") {
        const r = br.takeRelic(who.id, Number((msg as { id?: unknown }).id));
        if ("error" in r) send(ws, { type: "relicTaken", ok: false, error: r.error });
        else send(ws, { type: "relicTaken", ok: true, relicId: r.relicId, name: r.name, test: !!r.test });
        return;
      }

      if (msg.type === "exit") {
        // The level is read BEFORE the exit ends the session: the goodbye
        // goes to that world, not always Level 0 (it used to be hardcoded 0,
        // so a Poolrooms bystander kept a ghost of whoever walked out).
        const exitLevel = levelOf(who.id);
        const r = br.exit(who.id);
        if ("error" in r) {
          send(ws, { type: "exitDenied", error: r.error });
          return;
        }
        walkieDrop(who.id);
        sendNear(exitLevel, r.x, r.y, { type: "bye", id: who.id });
        bus.emit("zone.presence", { userId: who.id, zone: "backrooms", on: false, detail: null });
        send(ws, { type: "debrief", revealed: r.revealed, ms: r.ms, relics: r.relics, footage: r.footage, test: !!r.test, home: !!r.home });
        return;
      }
    });

    // Same as realtime: an oversized frame emits 'error' (Oct 2026 review).
    ws.on("error", () => {});
    ws.on("close", () => {
      if (socketByUser.get(who.id) === ws) endSpectate(who.id);
      if (socketByUser.get(who.id) === ws) {
        socketByUser.delete(who.id);
        freezeSession(who.id);
        // The session freezes (the body is saved) but the PLAYER is gone —
        // the roster line tracks the live socket, not the saved body.
        bus.emit("zone.presence", { userId: who.id, zone: "backrooms", on: false, detail: null });
      }
      userBySocket.delete(ws);
    });
  });
}
