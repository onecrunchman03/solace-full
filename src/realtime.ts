import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { rememberSocketToken, sessionStandsFor, userForToken } from "./auth";
import { termsOutstanding } from "./legal";
import { toPublicUser, GENERAL_PAGE_ID, type User, type Channel } from "./types";
import { setWsClientCounter } from "./perf";
import { canDiscoverPage } from "./permissions";
import { mayEnterChannel, visibleChannels } from "./pagescope";
import { mayPostChannel } from "./pageauth";
import { satelliteConnected } from "./federation/link";
import { clientIp, makeRateLimiter } from "./http";

/** Open app sockets one account may hold (review round 2). */
export const MAX_SOCKETS_PER_USER = 8;
/** State-frame budget per user: voice presence/media, stream watching, status. */
export const STATE_FRAME_BURST = 40;
export const STATE_FRAME_WINDOW_MS = 60_000;

/**
 * Attach the realtime layer to an existing HTTP server. Clients connect to
 * `/ws?token=<session token>`; from there the server pushes live message,
 * channel, presence, and typing events. Most events go to every connected
 * client, but anything belonging to a PAGE is addressed to that page's
 * members (see toPage/toChannel below) — a private page must not even be
 * announced outside itself.
 */
/** The Admin Panel's connections view — populated once attachRealtime runs. */
export interface ConnectionRow {
  userId: number;
  sockets: number;
  ips: string[];
  agents: string[];
  voiceChannelId: number | null;
  status: string;
}
let reportFn: () => ConnectionRow[] = () => [];
export function getConnectionReport(): ConnectionRow[] {
  return reportFn();
}
/** Who is connected right now. Routes register before the socket server
 *  attaches, so this is late-bound the same way the report is — the Pages
 *  picker needs it for its live "online / total" counts. */
let onlineFn: () => number[] = () => [];
export function onlineUsers(): number[] {
  return onlineFn();
}

/** Which voice channel a user's live app socket says they are in (null when
 *  none) — the voice token route reads it before minting a pop-out viewer. */
let voiceOf: (userId: number) => number | null = () => null;
export function voiceChannelOf(userId: number): number | null {
  return voiceOf(userId);
}

export function attachRealtime(httpServer: Server, store: Store, bus: Bus): void {
  // Frames on this wire are chat text, typing, status, presence — kilobytes.
  // ws's default cap is 100 MiB PER FRAME, buffered before the handler runs.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  // Registry: which sockets each user has open, and the reverse lookup.
  const socketsByUser = new Map<number, Set<WebSocket>>();
  const userBySocket = new Map<WebSocket, User>();
  const alive = new WeakMap<WebSocket, boolean>();
  const pendingUser = new WeakMap<WebSocket, User>();
  const socketMeta = new WeakMap<WebSocket, { ip: string; ua: string }>();

  const onlineUserIds = () => [...socketsByUser.keys()];
  onlineFn = onlineUserIds;

  // User status: away/busy per user (absent = plain online). Manual picks and
  // client-side auto-away both arrive as `status` frames; a socket death
  // clears the entry along with presence.
  const statusByUser = new Map<number, "away" | "busy">();
  const statusSnapshot = () => Object.fromEntries(statusByUser);
  const setStatus = (userId: number, status: string) => {
    if (status !== "online" && status !== "away" && status !== "busy") return; // garbage → ignore
    const prev = statusByUser.get(userId) ?? "online";
    if (prev === status) return;
    if (status === "online") statusByUser.delete(userId);
    else statusByUser.set(userId, status);
    broadcast({ type: "status", userId, status });
  };

  // Admin observability: how many sockets are connected right now.
  setWsClientCounter(() => userBySocket.size);

  // Voice presence: which voice channel each user is currently in. The audio
  // itself is LiveKit's; this map only drives the "who's in the room" UI. A
  // socket death clears its user's entry, so a crashed tab can't haunt a room.
  const voiceByUser = new Map<number, number>();
  voiceOf = (userId) => voiceByUser.get(userId) ?? null;
  // PRIVATE MEANS PRIVATE ON THE WIRE (Aug 2026 review): a private page's
  // voice room must not announce its occupants to non-members, so the ready
  // snapshot is filtered per connecting user — an entry rides only if THIS
  // user may enter that room's page.
  const mayseeVoice = (u: User, chId: number): boolean => {
    const ch = store.getChannel(chId);
    return !!ch && mayEnterChannel(store, u, ch);
  };
  const voiceSnapshotFor = (u: User) =>
    Object.fromEntries([...voiceByUser].filter(([, chId]) => mayseeVoice(u, chId)));
  // Camera / screen-share badges for the sidebar. Media always starts OFF on
  // a join or room switch, so any presence change wipes the entry.
  const voiceMediaByUser = new Map<number, { cam: boolean; screen: boolean }>();
  const voiceMediaSnapshotFor = (u: User) =>
    Object.fromEntries([...voiceMediaByUser].filter(([uid]) => {
      const chId = voiceByUser.get(uid);
      return chId !== undefined && mayseeVoice(u, chId);
    }));
  // Which SOCKET announced the voice presence. Presence is per-user but joins
  // are per-tab: when the announcing tab dies, the room slot must free even
  // if the user has other tabs open — without this, a crashed voice tab
  // haunts the room for as long as any other tab stays connected.
  const voiceSocketByUser = new Map<number, WebSocket>();
  const setVoiceState = (userId: number, channelId: number | null) => {
    const prev = voiceByUser.get(userId) ?? null;
    if (prev === channelId) return;
    if (channelId === null) {
      voiceByUser.delete(userId);
      voiceSocketByUser.delete(userId);
    } else voiceByUser.set(userId, channelId);
    voiceMediaByUser.delete(userId);
    // Media resets on ANY room change, so a live stream's audience does too
    // (a room SWITCH used to leave the old viewer set dangling). Told to the
    // room it was streaming in.
    clearStreamViewers(userId, prev);
    // The frame reaches the union of the OLD room's audience (they saw the
    // join, they must see the leave) and the NEW room's. A public page on
    // either side means everyone, exactly as before.
    const audienceOf = (chId: number | null): number[] | "all" | "none" => {
      if (chId === null) return "none"; // no room on this side — adds nobody
      const ch = store.getChannel(chId);
      if (!ch) return "none";
      return channelAudience(ch) ?? "all";
    };
    const a = audienceOf(prev);
    const b = audienceOf(channelId);
    const frame = { type: "voice.state", userId, channelId };
    if (a === "all" || b === "all") broadcast(frame);
    else sendToUsers([...new Set([...(a === "none" ? [] : a), ...(b === "none" ? [] : b), userId])], frame);
  };
  const setVoiceMedia = (userId: number, cam: boolean, screen: boolean) => {
    if (!voiceByUser.has(userId)) return; // not in a room — no badge to show
    const prev = voiceMediaByUser.get(userId);
    if (prev?.cam === cam && prev?.screen === screen) return;
    if (!cam && !screen) voiceMediaByUser.delete(userId);
    else voiceMediaByUser.set(userId, { cam, screen });
    // Badges are scoped like the presence they decorate (private-page rooms
    // announce only to their members).
    const ch = store.getChannel(voiceByUser.get(userId)!);
    const who = ch ? channelAudience(ch) : [];
    const frame = { type: "voice.media", userId, cam, screen };
    if (who === null) broadcast(frame);
    else sendToUsers([...new Set([...who, userId])], frame);
    // A stream that just ended has no viewers to count.
    if (!screen) clearStreamViewers(userId);
  };

  // WHERE IN THE HOUSE (Josh, Aug 2026): which game zone each user's body is
  // in — the casino floor, the backrooms (+ level), the escape complex. Fed
  // by `zone.presence` bus events from the three game sockets; a user can
  // briefly hold more than one (the floor socket lingers while the escape
  // door opens), so entries are per (user, zone) and the CLIENT picks what
  // to display. Zone sockets clean up after themselves on death/close, so
  // nothing here couples to the app socket's lifecycle.
  const zonesByUser = new Map<number, Map<string, string | null>>();
  const zoneSnapshot = () =>
    [...zonesByUser].flatMap(([userId, zs]) =>
      [...zs].map(([zone, detail]) => ({ userId, zone, detail })));
  const setZone = (userId: number, zone: string, on: boolean, detail: string | null) => {
    const zs = zonesByUser.get(userId) ?? new Map<string, string | null>();
    if (on) {
      if (zs.has(zone) && zs.get(zone) === detail) return; // no-change: quiet
      zs.set(zone, detail);
      zonesByUser.set(userId, zs);
    } else {
      if (!zs.delete(zone)) return; // wasn't there: quiet
      if (zs.size === 0) zonesByUser.delete(userId);
    }
    broadcast({ type: "zone.state", userId, zone, on, detail });
  };

  // Soundboard spam armor: last play time per user.
  const lastBoardAt = new Map<number, number>();

  // Stream viewership: streamerId → the userIds watching. Drives the 👁 count
  // on watch pills + the streamer's joined/left notices. Cleared when the
  // stream (or the watcher's socket) goes away.
  const streamViewers = new Map<number, Set<number>>();
  // PRIVATE MEANS PRIVATE ON THE WIRE, for streams too (Oct 2026 review):
  // these frames were blanket broadcasts, so a private room's stream and its
  // audience reached every socket. They go to the streamer's room audience,
  // like voice presence; with no room left, only to those involved.
  const streamViewersSnapshotFor = (u: User) =>
    Object.fromEntries([...streamViewers]
      .filter(([id]) => { const chId = voiceByUser.get(id); return chId !== undefined && mayseeVoice(u, chId); })
      .map(([id, set]) => [id, [...set]]));
  const toStreamRoom = (roomId: number | null | undefined, involved: number[], payload: unknown) => {
    const ch = roomId != null ? store.getChannel(roomId) : undefined;
    if (ch) toChannelObj(ch, payload);
    else sendToUsers([...new Set(involved)], payload);
  };
  const setWatching = (watcherId: number, streamerId: number, watching: boolean) => {
    const set = streamViewers.get(streamerId) ?? new Set<number>();
    const had = set.has(watcherId);
    if (watching === had) return;
    if (watching) set.add(watcherId);
    else set.delete(watcherId);
    if (set.size > 0) streamViewers.set(streamerId, set);
    else streamViewers.delete(streamerId);
    toStreamRoom(voiceByUser.get(streamerId), [streamerId, watcherId, ...set], { type: "stream.viewers", streamerId, viewers: [...set], watcherId, watching });
  };
  const clearStreamViewers = (streamerId: number, roomId: number | null | undefined = voiceByUser.get(streamerId)) => {
    const had = streamViewers.get(streamerId);
    if (!had || !streamViewers.delete(streamerId)) return;
    toStreamRoom(roomId, [streamerId, ...had], { type: "stream.viewers", streamerId, viewers: [] });
  };
  const dropWatcherEverywhere = (watcherId: number) => {
    for (const [streamerId] of streamViewers) setWatching(watcherId, streamerId, false);
  };

  const send = (ws: WebSocket, payload: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  /** Send to every open socket, optionally skipping one user's own sockets. */
  // Encoded ONCE per fan-out as a Buffer: ws re-encodes a string argument
  // into a fresh buffer for every socket it's sent to (Sep 2026 review — a
  // 200-socket room paid 200 encodes per message).
  // NB ws autodetects a Buffer as a BINARY frame; { binary: false } keeps it
  // a text frame or every browser client gets a Blob it can never parse.
  const broadcast = (payload: unknown, exceptUserId?: number) => {
    const data = Buffer.from(JSON.stringify(payload));
    for (const [ws, u] of userBySocket) {
      if (exceptUserId !== undefined && u.id === exceptUserId) continue;
      if (ws.readyState === ws.OPEN) ws.send(data, { binary: false }); // a Buffer would autodetect as a BINARY frame — browsers get a Blob
    }
  };

  /** Deliver to only the given users' sockets (recipient-scoped, e.g. DMs). */
  const sendToUsers = (userIds: number[], payload: unknown) => {
    const data = Buffer.from(JSON.stringify(payload));
    for (const uid of userIds) {
      const set = socketsByUser.get(uid);
      if (!set) continue;
      for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(data, { binary: false }); // a Buffer would autodetect as a BINARY frame — browsers get a Blob
    }
  };

  // The connections report reads live registry state (admin-only route).
  reportFn = () =>
    [...socketsByUser.entries()].map(([userId, set]) => {
      const metas = [...set].map((ws) => socketMeta.get(ws)).filter((m): m is { ip: string; ua: string } => !!m);
      return {
        userId,
        sockets: set.size,
        ips: [...new Set(metas.map((m) => m.ip))],
        agents: [...new Set(metas.map((m) => m.ua))],
        voiceChannelId: voiceByUser.get(userId) ?? null,
        status: statusByUser.get(userId) ?? "online",
      };
    });

  // ---- Authenticate the upgrade before accepting the socket ----
  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      // /ws-game belongs to the backrooms socket (src/backrooms/net.ts),
      // /ws-casino to the floor (src/casino/floor.ts), /ws-escape to the
      // escape zone (src/casino/escape-zone.ts), /ws-satellite to the
      // federation link (src/federation/link.ts) and /satvoice/<id> to the
      // satellite-voice relay (src/federation/voice.ts) — leave their
      // upgrades alone; destroy anything else unclaimed.
      // The whole /satvoice/ prefix is spared because the relay handler
      // answers (404s + destroys) every path under it, well-formed or not —
      // sparing only \d-shaped paths left malformed ones claimed by nobody:
      // an upgraded socket nothing ever destroyed.
      if (
        url.pathname !== "/ws-game" && url.pathname !== "/ws-casino" &&
        url.pathname !== "/ws-escape" && url.pathname !== "/ws-satellite" &&
        url.pathname !== "/ws-survivorz" && // the Survivorz broadcast (src/survivorz/broadcast.ts)
        !url.pathname.startsWith("/satvoice/")
      )
        socket.destroy();
      return;
    }
    const user = userForToken(store, url.searchParams.get("token") ?? undefined);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // THE PAPERWORK: no Terms on file, no socket — the same rule the router
    // applies to every ordinary route (legal.ts).
    if (termsOutstanding(user)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      pendingUser.set(ws, user);
      rememberSocketToken(ws, url.searchParams.get("token"));
      // Operator visibility: where and what is this connection?
      socketMeta.set(ws, {
        // The address Caddy saw, not Caddy's own (review round 2: behind
        // the proxy every row in the Connections panel read 127.0.0.1).
        ip: clientIp(req),
        ua: String(req.headers["user-agent"] ?? "").slice(0, 160),
      });
      wss.emit("connection", ws, req);
    });
  });

  // ---- Connection lifecycle ----
  wss.on("connection", (ws: WebSocket) => {
    const user = pendingUser.get(ws)!;
    pendingUser.delete(ws);

    const wasOnline = socketsByUser.has(user.id);
    let set = socketsByUser.get(user.id);
    if (!set) {
      set = new Set();
      socketsByUser.set(user.id, set);
    }
    // SOCKETS PER ACCOUNT ARE CAPPED (review round 2): every broadcast is
    // multiplied by a member's open sockets, so a tab farm was a fan-out
    // amplifier. The OLDEST goes, never the newcomer — a stale tab is the
    // one that's forgotten, and closing the new one would lock out anyone
    // whose old tabs are still draining.
    if (set.size >= MAX_SOCKETS_PER_USER) {
      // …but never the tab that owns their voice presence (Oct 2026 review):
      // the oldest tab is exactly the long-lived one in a call, and evicting
      // it told every sidebar they'd left while they were still talking.
      const voiceWs = voiceSocketByUser.get(user.id);
      const oldest = ([...set].find((s) => s !== voiceWs) ?? set.values().next().value) as WebSocket | undefined;
      if (oldest) {
        try { oldest.close(4008, "too_many_sockets"); } catch { /* already dead */ }
        set.delete(oldest);
      }
    }
    set.add(ws);
    userBySocket.set(ws, user);
    alive.set(ws, true);

    // Hand the client its starting state.
    send(ws, {
      type: "ready",
      you: toPublicUser(user),
      online: onlineUserIds(),
      voice: voiceSnapshotFor(user),
      voiceMedia: voiceMediaSnapshotFor(user),
      streamViewers: streamViewersSnapshotFor(user),
      statuses: statusSnapshot(),
      zones: zoneSnapshot(),
      // THE MARK (Sep 2026): who owes the goblins and how deep — stage 1+
      // only. Read live from the store; it is a handful of rows.
      debtors: store.debtStandings(),
    });

    // Tell everyone else this user just came online (first connection only).
    if (!wasOnline) {
      broadcast({ type: "presence", event: "online", userId: user.id }, user.id);
      bus.emit("presence.change", { userId: user.id, online: true });
    }

    ws.on("pong", () => alive.set(ws, true));
    // An oversized or malformed frame makes ws emit 'error' before closing;
    // with no listener that was an uncaught exception per crafted connection
    // (Oct 2026 review). The close handler does the cleanup.
    ws.on("error", () => {});
    ws.on("message", (data) => handleClientMessage(ws, user, data));
    ws.on("close", () => {
      userBySocket.delete(ws);
      // The tab that announced voice is gone — free the room slot even while
      // the user's OTHER tabs stay connected (multi-tab ghost fix).
      if (voiceSocketByUser.get(user.id) === ws) setVoiceState(user.id, null);
      const s = socketsByUser.get(user.id);
      if (!s) return;
      s.delete(ws);
      if (s.size === 0) {
        socketsByUser.delete(user.id);
        setVoiceState(user.id, null); // their tab is gone — free the room slot
        dropWatcherEverywhere(user.id); // and they're not watching anything
        clearStreamViewers(user.id); // nor streaming
        statusByUser.delete(user.id); // offline implies no status
        broadcast({ type: "presence", event: "offline", userId: user.id });
        bus.emit("presence.change", { userId: user.id, online: false });
      }
    });
  });

  /** Messages sent FROM a client over the socket. */
  function handleClientMessage(ws: WebSocket, user: User, data: RawData): void {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;
    try {
      handleFrame(ws, user, msg);
    } catch (err) {
      // A store throw inside a ws frame must not escalate to the process-
      // level uncaughtException net — the HTTP router wraps every handler,
      // and the socket side matches it.
      console.error(`[ws] ${msg.type}:`, err);
      store.recordError(
        "server",
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? (err.stack ?? null) : null,
        `ws:${msg.type}`,
        user.id,
      );
    }
  }

  // Typing flood armor: the honest client sends at most one frame per 2s;
  // a hostile one used to amplify each frame to every page member. One per
  // second per user is generous and bounds the fan-out.
  const lastTypingAt = new Map<number, number>();
  // STATE FRAMES ARE BUDGETED (review round 2). voice.join/leave/media,
  // stream.watch and status each dedupe on no-change — but alternating two
  // values defeats that, and each change is a broadcast (or a per-page
  // fan-out plus two store reads). A person flips these a few times a
  // minute; a script does it at wire speed. One fixed window per user.
  const stateBudget = makeRateLimiter();
  const STATE_FRAMES = new Set(["voice.join", "voice.leave", "voice.media", "stream.watch", "status"]);

  function handleFrame(ws: WebSocket, user: User, msg: any): void {
    if (msg.type === "typing" && typeof msg.channelId === "number") {
      const nowT = Date.now();
      if (nowT - (lastTypingAt.get(user.id) ?? 0) < 1000) return;
      lastTypingAt.set(user.id, nowT);
      // Same gate as posting — you can't look busy in a room you can't post to.
      const ch = store.getChannel(msg.channelId);
      if (ch && mayEnterChannel(store, user, ch) && mayPostChannel(store, user, ch)) {
        // PRIVATE MEANS PRIVATE ON THE WIRE (Aug 2026 review): typing used
        // to broadcast to every socket, leaking a private page's channel id
        // and its members' live activity to non-members. Scope it like
        // every other channel event.
        const frame = { type: "typing", channelId: msg.channelId, userId: user.id, username: user.username };
        const who = channelAudience(ch);
        if (who) sendToUsers(who.filter((id) => id !== user.id), frame);
        else broadcast(frame, user.id); // don't echo typing back to the sender
      }
    }

    // Voice room presence (the client reports joins/leaves after connecting
    // to LiveKit). Enforce the SAME gate as the token route — locked rooms
    // admit owner/admin + the allow-list only. Without this, a barred user
    // could spoof presence into a locked room and, worse, fan soundboard
    // audio through its door.
    if (STATE_FRAMES.has(String(msg.type)) && !stateBudget(`state:${user.id}`, STATE_FRAME_BURST, STATE_FRAME_WINDOW_MS)) {
      return;
    }
    if (msg.type === "voice.join" && typeof msg.channelId === "number") {
      const ch = store.getChannel(msg.channelId);
      if (ch && ch.kind === "voice") {
        const fresh = store.getUserById(user.id) ?? user;
        // Same two gates as the token route — page first, then the roles
        // layer (post permission, the lock's roles or the allow-list).
        if (mayEnterChannel(store, fresh, ch) && mayPostChannel(store, fresh, ch)) {
          setVoiceState(user.id, ch.id);
          voiceSocketByUser.set(user.id, ws); // this tab owns the presence
        }
      }
    }
    if (msg.type === "voice.leave") {
      setVoiceState(user.id, null);
    }
    // Camera / screen-share badge state (🎥/🖥️ in the sidebar). Ignored
    // unless the sender is actually in a voice room.
    if (msg.type === "voice.media") {
      setVoiceMedia(user.id, msg.cam === true, msg.screen === true);
    }
    // Stream viewership: "I joined / left X's stream". Only counts against a
    // streamer whose screen badge is actually live.
    if (msg.type === "stream.watch" && typeof msg.streamerId === "number") {
      // You may watch only a stream in a room you could enter (Oct 2026
      // review): an outsider could join a private room's viewer list and set
      // off the streamer's join chime.
      const roomId = voiceByUser.get(msg.streamerId);
      const room = roomId !== undefined ? store.getChannel(roomId) : undefined;
      const mayWatch = !!room && mayEnterChannel(store, user, room);
      if (mayWatch && voiceMediaByUser.get(msg.streamerId)?.screen) {
        setWatching(user.id, msg.streamerId, msg.watching === true);
      } else if (msg.watching !== true) {
        setWatching(user.id, msg.streamerId, false);
      }
    }
    // User status (manual pick or client auto-away).
    if (msg.type === "status" && typeof msg.status === "string") {
      setStatus(user.id, msg.status);
    }
    // Soundboard: play a record from the HOUSE library (migration 73) to my
    // voice room. Validated hard — you must be in a room, the id must be a
    // real library row, and there's a per-user cooldown (spam armor).
    if (msg.type === "soundboard.play" && typeof msg.id === "number") {
      const channelId = voiceByUser.get(user.id);
      if (channelId === undefined) return;
      const now = Date.now();
      if (now - (lastBoardAt.get(user.id) ?? 0) < 2000) return;
      const snd = store.boardSound(msg.id);
      if (!snd) return;
      lastBoardAt.set(user.id, now);
      const roomIds = [...voiceByUser].filter(([, ch]) => ch === channelId).map(([id]) => id);
      sendToUsers(roomIds, { type: "soundboard.play", userId: user.id, file: snd.file, name: snd.name });
    }
  }

  // ---- Bridge HTTP-side events to connected clients ----
  //
  // PAGE SCOPING (migration 63). Channel traffic used to go to everyone, which
  // is correct for the one shared space it was written for and a leak now that
  // a page can be private: its messages, its channel list and even its
  // existence belong to its members. `toPage` answers "broadcast, or address
  // these sockets" and every channel-shaped event goes through it. A channel
  // whose page has vanished falls back to broadcast, matching the old rules.
  const pageAudience = (pageId: number): number[] | null => {
    const page = store.getPage(pageId);
    if (!page || page.isPublic) return null; // null = everyone
    // Members PLUS staff: canSeePage/canEnterPage always admit admins and
    // moderators over HTTP, so the live wire delivers to them too — they
    // used to get a private page's history on refetch but none of its
    // broadcasts (Aug 2026 review).
    return [...new Set([...store.pageMembers(page.id).map((m) => m.userId), ...store.adminIds()])];
  };
  const toPage = (pageId: number, payload: unknown): void => {
    const who = pageAudience(pageId);
    if (who) sendToUsers(who, payload);
    else broadcast(payload);
  };
  // PAGE ROLES: a channel with a VIEW gate narrows its page's audience to
  // the members who may see it. Only connected users matter on the wire, so
  // a public page's "everyone" collapses to the sockets we hold.
  const channelAudience = (ch: Channel): number[] | null => {
    const base = pageAudience(ch.pageId);
    if (!store.restrictedChannelIds().has(ch.id)) return base; // its own gate or its parent's
    const connected = new Map<number, User>();
    for (const u of userBySocket.values()) connected.set(u.id, u);
    const pool = base ?? [...connected.keys()];
    return pool.filter((id) => {
      const u = connected.get(id);
      return !!u && mayEnterChannel(store, u, ch);
    });
  };
  const toChannelObj = (ch: Channel, payload: unknown): void => {
    const who = channelAudience(ch);
    if (who) sendToUsers(who, payload);
    else broadcast(payload);
  };
  const toChannel = (channelId: number, payload: unknown): void => {
    const ch = store.getChannel(channelId);
    // A frame for a channel that no longer exists DROPS — never broadcasts.
    // Every local emitter checks the channel synchronously, but the remote
    // (satellite) message paths hold an await between the check and the
    // emit; a staff channel-delete landing in that window used to fall
    // through here and broadcast a PRIVATE page's message to every socket.
    if (!ch) return;
    toChannelObj(ch, payload);
  };

  bus.on("message", ({ message }) => toChannel(message.channelId, { type: "message", message }));
  bus.on("message.update", ({ message }) => toChannel(message.channelId, { type: "message.update", message }));
  bus.on("message.delete", ({ message }) => toChannel(message.channelId, { type: "message.delete", message }));
  bus.on("message.react", (p) => toChannel(p.channelId, { type: "message.react", ...p }));
  bus.on("read.cursor", (p) => toChannel(p.channelId, { type: "read.cursor", ...p }));
  bus.on("dm.read", ({ userIds, ...p }) => sendToUsers(userIds, { type: "dm.read", ...p }));
  bus.on("channel.create", ({ channel }) => toChannelObj(channel, { type: "channel.create", channel }));
  // A channel.update may have just GATED the channel: the frame reaches the
  // whole page so the newly-shut-out drop it (the client treats a channel it
  // may no longer see as gone — viewRoles it doesn't hold).
  // A VIEW-gated channel's edits go only to who may see it (Oct 2026 review):
  // every rename, topic and allow-list change used to reach the whole page.
  // The rest of the page still needs to drop it (the frame that GATES it is
  // the one that shuts them out), so they get a bare channel.delete — the id,
  // nothing about it — which is a no-op for anyone who never had it.
  bus.on("channel.update", ({ channel }) => {
    const viewers = channelAudience(channel);
    if (!store.restrictedChannelIds().has(channel.id) || !viewers) {
      toPage(channel.pageId, { type: "channel.update", channel });
      return;
    }
    sendToUsers(viewers, { type: "channel.update", channel });
    const seen = new Set(viewers);
    const pool = pageAudience(channel.pageId) ?? [...new Set([...userBySocket.values()].map((u) => u.id))];
    const rest = pool.filter((id) => !seen.has(id));
    if (rest.length) sendToUsers(rest, { type: "channel.delete", channelId: channel.id });
  });
  bus.on("page.roles", ({ pageId }) => toPage(pageId, { type: "page.roles", pageId }));
  // The channel is already gone by now, so its page rides the event.
  bus.on("channel.delete", ({ channelId, pageId }) =>
    toPage(pageId ?? GENERAL_PAGE_ID, { type: "channel.delete", channelId }));
  // Reorder ships the WHOLE channel list, so it can't be a blanket broadcast
  // any more — that would hand every private page's channel names to everyone
  // on the server. Each socket gets only the channels its user may see.
  bus.on("channels.reorder", ({ channels }) => {
    const done = new Set<number>();
    for (const u of userBySocket.values()) {
      if (done.has(u.id)) continue;
      done.add(u.id);
      const mine = new Set(visibleChannels(store, u).map((c) => c.id));
      sendToUsers([u.id], { type: "channels.reorder", channels: channels.filter((c) => mine.has(c.id)) });
    }
  });
  // PAGES are recipient-scoped: a private page must not even be ANNOUNCED to
  // people outside it. Public pages still go to everyone, since anyone may
  // walk into one. `role` is per-recipient, so it is resolved per socket.
  bus.on("page.change", ({ page, members, tellAll }) => {
    // Per-recipient: role, and (migration 77) whether THIS recipient has a
    // pending knock — so a request, an approval, and a denial all land as
    // the same ordinary page.change. A DISCOVERABLE page's card is public
    // knowledge, so its changes go to everyone like a public page's; a
    // hidden page's go to its members + staff (who can always see it) plus
    // the emitter's `members` list (which carries just-removed people who
    // must be told once more while they can still be addressed). `tellAll`
    // widens one frame to everyone: a page that just turned INVISIBLE has
    // to reach the outsiders still holding its card.
    //
    // REALTIME OWNS THE COUNTS (Sep 2026): members/online/pending are
    // re-derived here rather than trusted from the emitter — the makeDefault
    // path used to hand-build a DTO with online: 0 and no pending, and any
    // such frame wiped the managers' knock badge on every client. Two
    // queries total, per event, instead of two per recipient.
    const fresh = store.getPage(page.id);
    if (!fresh) return;
    const rows = store.pageMembers(fresh.id);
    const reqs = fresh.joinPolicy === "request" ? store.pageRequests(fresh.id) : [];
    const roleOf = new Map(rows.map((m) => [m.userId, m.role]));
    const reqSet = new Set(reqs.map((r) => r.userId));
    const staff = new Set(store.adminIds());
    const base = {
      ...fresh,
      members: rows.length,
      online: rows.reduce((n, m) => n + (socketsByUser.has(m.userId) ? 1 : 0), 0),
      pending: fresh.joinPolicy === "request" ? reqs.length : 0,
      remoteUp: fresh.satelliteId != null ? satelliteConnected(fresh.satelliteId) : undefined,
    };
    const frameFor = (uid: number) => {
      const role = roleOf.get(uid) ?? null;
      const card = { ...base, role, requested: reqSet.has(uid) };
      // A discoverable card is name/icon/description/counts — the ids
      // inside the page (its landing channel, its creator) stay as private
      // as its channels for anyone who can't see in.
      if (role === null && !fresh.isPublic && !staff.has(uid)) {
        card.defaultChannelId = null;
        card.createdBy = 0;
      }
      return { type: "page.change", page: card };
    };
    if (fresh.isPublic || fresh.discoverable || tellAll) {
      for (const uid of socketsByUser.keys()) sendToUsers([uid], frameFor(uid));
      return;
    }
    for (const uid of new Set([...members, ...rows.map((m) => m.userId), ...staff])) {
      sendToUsers([uid], frameFor(uid));
    }
  });
  // Ordered page ids after a staff reorder — filtered per recipient exactly
  // like channels.reorder, so a hidden page's id never rides the order list.
  bus.on("pages.reorder", ({ ids }) => {
    const done = new Set<number>();
    const pages = store.listPages();
    for (const u of userBySocket.values()) {
      if (done.has(u.id)) continue;
      done.add(u.id);
      const roles = store.pageRolesFor(u.id);
      const seen = new Set(
        pages.filter((p) => canDiscoverPage(u, p, roles.get(p.id) ?? null)).map((p) => p.id),
      );
      sendToUsers([u.id], { type: "pages.reorder", ids: ids.filter((id) => seen.has(id)) });
    }
  });
  bus.on("page.gone", ({ pageId, members, tellAll }) => {
    if (tellAll) return broadcast({ type: "page.gone", pageId });
    // Staff ride along: they hold hidden pages' cards too, and a delete they
    // didn't perform used to leave those cards standing.
    sendToUsers([...new Set([...members, ...store.adminIds()])], { type: "page.gone", pageId });
  });
  bus.on("user.update", ({ user }) => {
    // Realtime authorization reads the User captured at socket upgrade —
    // refresh every live socket's snapshot so a role change (promotion,
    // demotion) takes effect without waiting for a reconnect (Aug 2026
    // review: a demoted moderator's open socket kept staff visibility).
    const fresh = store.getUserById(user.id);
    if (fresh) {
      for (const [sock, u] of userBySocket) if (u.id === user.id) userBySocket.set(sock, fresh);
    }
    broadcast({ type: "user.update", user });
  });
  bus.on("wheel.event", ({ item }) => broadcast({ type: "wheel.event", item }));
  // A ban/suspension/scrub already killed the session rows; hang up the live
  // sockets too so the banned user drops out NOW instead of at next reconnect.
  bus.on("user.kick", ({ userId }) => {
    const set = socketsByUser.get(userId);
    if (!set) return;
    for (const ws of [...set]) if (!sessionStandsFor(store, ws)) ws.close(4003, "kicked");
  });
  // Where in the house: the game sockets report bodies entering and leaving
  // their zones; everyone's roster shows it as a status line.
  bus.on("zone.presence", ({ userId, zone, on, detail }) => setZone(userId, zone, on, detail));
  // Backrooms entry: clear Solace-voice presence and tell the user's tabs to
  // hang up their LiveKit connection — in there, it's proximity chat only.
  bus.on("voice.kick", ({ userId }) => {
    setVoiceState(userId, null);
    sendToUsers([userId], { type: "voice.kick" });
  });
  // The Research archive is PLATFORM-WIDE: a drive one player found in the
  // yellow is readable by everyone, so everyone hears it land.
  bus.on("backrooms.drive", ({ driveId, title, finder }) =>
    broadcast({ type: "backrooms.drive", driveId, title, finder }),
  );
  // The door. Once, ever.
  bus.on("backrooms.level1", ({ finder }) => broadcast({ type: "backrooms.level1", finder }));
  bus.on("backrooms.level2", ({ finder }) => broadcast({ type: "backrooms.level2", finder }));
  bus.on("backrooms.level3", ({ finder }) => broadcast({ type: "backrooms.level3", finder }));
  bus.on("backrooms.level4", ({ finder }) => broadcast({ type: "backrooms.level4", finder }));
  bus.on("backrooms.level5", ({ finder }) => broadcast({ type: "backrooms.level5", finder }));
  bus.on("backrooms.level6", ({ finder }) => broadcast({ type: "backrooms.level6", finder }));
  bus.on("backrooms.level7", ({ finder }) => broadcast({ type: "backrooms.level7", finder }));
  bus.on("backrooms.level8", ({ finder }) => broadcast({ type: "backrooms.level8", finder }));
  bus.on("backrooms.level9", ({ finder }) => broadcast({ type: "backrooms.level9", finder }));
  bus.on("backrooms.level10", ({ finder }) => broadcast({ type: "backrooms.level10", finder }));
  // THE GOBLINS (Sep 2026): a standing change re-reads the short debtor list
  // and tells everyone (the mark is public by design); a notice goes to the
  // one person it concerns.
  bus.on("lender.change", () => broadcast({ type: "lender.change", debtors: store.debtStandings() }));
  bus.on("npc.affinity", ({ userId, npc, tier, tierName, up }) =>
    sendToUsers([userId], { type: "npc.affinity", npc, tier, tierName, up }),
  );
  bus.on("lender.notice", ({ userId, title, body, kind }) =>
    sendToUsers([userId], { type: "lender.notice", title, body, kind }),
  );
  bus.on("wallet.transfer", (t) => sendToUsers([t.fromId, t.toId], { type: "wallet.transfer", ...t }));
  // Achievements: the toast goes to the EARNER only (Sterling handles the
  // public bragging for gold+ tiers).
  bus.on("vip.rank", ({ userId, rank }) => sendToUsers([userId], { type: "vip.rank", rank }));
  bus.on("vip.fanfare", ({ name, rank }) => broadcast({ type: "vip.fanfare", name, rank }));
  bus.on("achievement.earned", ({ userId, achId, name, desc, tier, rewardItem }) =>
    sendToUsers([userId], { type: "achievement", id: achId, name, desc, tier, rewardItem }),
  );
  // PANDORA'S BOX: the key to its earner only; the opening to everyone.
  bus.on("pandora.key", ({ userId, key }) => sendToUsers([userId], { type: "pandora.key", key }));
  bus.on("abyss.opened", ({ userId }) => sendToUsers([userId], { type: "abyss.opened" }));
  bus.on("abyss.closed", ({ userId }) => sendToUsers([userId], { type: "abyss.closed" }));
  // THE PORTAL: only readers whose portal is open hear the hall change.
  bus.on("portal.changed", ({ what, room }) => sendToUsers(store.portalOpenUserIds(), { type: "portal.changed", what, room: room ?? null }));
  bus.on("portal.glyph", () => sendToUsers(store.portalOpenUserIds(), { type: "portal.changed", what: "glyph", room: null }));
  bus.on("portal.notation", () => sendToUsers(store.portalOpenUserIds(), { type: "portal.changed", what: "glyph", room: null }));
  bus.on("pandora.opened", ({ userId, name, choice, choiceName, first }) =>
    broadcast({ type: "pandora.opened", userId, name, choice, choiceName, first }),
  );
  // DMs go only to the two participants.
  bus.on("dm.message", ({ userIds, message }) => sendToUsers(userIds, { type: "dm.message", message }));
  bus.on("dm.message.update", ({ userIds, message }) => sendToUsers(userIds, { type: "dm.message.update", message }));
  bus.on("dm.message.delete", ({ userIds, message }) => sendToUsers(userIds, { type: "dm.message.delete", message }));
  // One of the three is writing (src/npc). A channel gets the ordinary typing
  // frame, scoped exactly like a member's; a DM reaches only the person.
  bus.on("npc.typing", ({ userId, username, channelId, dm }) => {
    if (dm) {
      sendToUsers([dm.userId], { type: "dm.typing", conversationId: dm.conversationId, userId, username });
      return;
    }
    const ch = channelId != null ? store.getChannel(channelId) : undefined;
    if (!ch) return;
    const frame = { type: "typing", channelId: ch.id, userId, username };
    const who = channelAudience(ch);
    if (who) sendToUsers(who, frame);
    else broadcast(frame);
  });
  // Direct trades go only to the two parties.
  bus.on("trade.new", ({ userIds, trade }) => sendToUsers(userIds, { type: "trade.new", trade }));
  bus.on("trade.update", ({ userIds, trade }) => sendToUsers(userIds, { type: "trade.update", trade }));
  // Auctions are public — everyone sees new listings, bids, and settlements.
  bus.on("auction.new", ({ auction }) => broadcast({ type: "auction.new", auction }));
  bus.on("auction.bid", ({ auction }) => broadcast({ type: "auction.bid", auction }));
  bus.on("auction.close", ({ auction }) => broadcast({ type: "auction.close", auction }));
  // Blackjack tables are public rooms — every state change goes to everyone
  // (the DTO strips the dealer's hole card until the reveal).
  bus.on("bj.state", ({ lobby }) => broadcast({ type: "bj.state", lobby }));
  // The roulette table is one public room — everyone sees the shared felt.
  bus.on("roulette.state", ({ state }) => broadcast({ type: "roulette.state", state }));
  // So is the craps table.
  bus.on("craps.state", ({ state }) => broadcast({ type: "craps.state", state }));
  // Hold'em: the lobby is public, hole cards are recipient-scoped (pit rule).
  bus.on("holdem.state", ({ lobby }) => broadcast({ type: "holdem.state", lobby }));
  bus.on("holdem.cards", ({ userIds, ...rest }) => sendToUsers(userIds, { type: "holdem.cards", ...rest }));
  // The Derby track + the nightly lottery draw are public too.
  bus.on("derby.state", ({ state }) => broadcast({ type: "derby.state", state }));
  bus.on("lottery.won", (p) => broadcast({ type: "lottery.won", ...p }));
  // Chess duels are public boards — perfect information, spectators welcome.
  bus.on("chess.state", ({ state }) => broadcast({ type: "chess.state", state }));
  // Graveyard respects are public.
  bus.on("grave.respect", (p) => broadcast({ type: "grave.respect", ...p }));
  bus.on("grave.tribute", (p) => broadcast({ type: "grave.tribute", ...p }));
  bus.on("grave.raised", (p) => broadcast({ type: "grave.raised", ...p }));
  bus.on("grave.sealed", (p) => broadcast({ type: "grave.sealed", ...p }));
  // Feedback is a public board — filings and triage flips go to everyone.
  bus.on("feedback.new", ({ item }) => broadcast({ type: "feedback.new", item }));
  bus.on("feedback.status", ({ item }) => broadcast({ type: "feedback.status", item }));
  bus.on("soundboard.change", () => broadcast({ type: "soundboard.change" }));
  // Bone Pit: sanitized table state to everyone; cups to their owners only.
  bus.on("pit.state", ({ state }) => broadcast({ type: "pit.state", state }));
  bus.on("pit.dice", ({ userIds, gameId, dice }) => sendToUsers(userIds, { type: "pit.dice", gameId, dice }));
  // Game nights are public.
  bus.on("event.change", ({ events }) => broadcast({ type: "event.change", events }));
  bus.on("event.remind", (p) => broadcast({ type: "event.remind", ...p }));
  // Side bets: pooled aggregates only — safe to broadcast.
  bus.on("sidebet.change", (p) => broadcast({ type: "sidebet.change", ...p }));
  bus.on("sidebet.settled", (p) => broadcast({ type: "sidebet.settled", ...p }));

  // ---- Heartbeat: terminate dead sockets so presence stays accurate ----
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(heartbeat));
}
