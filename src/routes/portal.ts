import { json, type Router } from "../http";
import { Hall, type GlitchKind } from "../portal/hall";
import { GLYPH_COUNT } from "../portal/glyph-ids";
import type { PortalGames } from "../portal/games";
import type { PortalVoice } from "../portal/voice";
import { AccessToken } from "livekit-server-sdk";
import { config } from "../config";
import { tokenize } from "../portal/script";
import { transliterate } from "../portal/translit";

/** THE PORTAL (PORTAL.md; src/portal/hall.ts): the hall behind the stone.
 *  Only a reader whose portal is open may come in; everything they are sent
 *  is decided by Hall. Admin levers sit at /api/admin/portal/*. */
export function registerPortalRoutes(router: Router, hall: Hall, games: PortalGames, voice: PortalVoice): void {
  const day = () => new Date().toISOString().slice(0, 10);
  const open = (store: { abyssOpenedAt(id: number): number | null }, id: number) => store.abyssOpenedAt(id) != null;
  const postsAt = new Map<string, number[]>();
  /** A per-reader rate, one bucket per kind of thing (posts, ring-game moves). */
  const rate = (userId: number, n: number, ms: number, kind = "post") => {
    const key = `${kind}:${userId}`, now = Date.now(), list = (postsAt.get(key) ?? []).filter((t) => now - t < ms);
    if (list.length >= n) return false;
    list.push(now); postsAt.set(key, list); return true;
  };

  // Coming through: Tharvend files you (the first time), and the hall's state.
  router.get("/api/portal", "user", ({ res, user, store, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const a = hall.arrive(user.id, user.username);
    if (a.first) bus.emit("portal.changed", { what: "member" });
    if (a.cracked !== null) bus.emit("portal.glyph", { userId: user.id, glyph: a.cracked, source: "stone" });
    // An etched relic carried through is read on the far side (sources.ts).
    const etched = hall.relicCracks(user.id, (glyph, slug) => bus.emit("portal.glyph", { userId: user.id, glyph, source: `relic:${slug}` }));
    // The machine is old: now and then a look meets a glitch (never the first look).
    if (!a.first) hall.maybeGlitch(user.id);
    json(res, 200, { ...hall.overview(user.id), keystone: a.keystone, first: a.first, etched: etched.map((e) => e.glyph) });
  });

  // THE CLAIM WALL: every mark; for the read ones, who read it and how.
  router.get("/api/portal/wall", "user", ({ res, user, store }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    json(res, 200, { wall: hall.wall(), notation: hall.notationWall() });
  });

  // THE NOTATION (notation-ids.ts): claim a mark by naming the script glyph it stands for.
  router.post("/api/portal/guess/notation", "user", ({ res, user, store, body, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const { mark, glyph } = (body ?? {}) as { mark?: unknown; glyph?: unknown };
    const r = hall.guessNotation(mark, glyph, user.id, day());
    if (!r.ok) return json(res, r.error === "no_tries" ? 429 : r.error === "already_cracked" ? 409 : 400, { error: r.error });
    if (r.right) bus.emit("portal.notation", { userId: user.id, mark: mark as number, source: "deduction" });
    json(res, 200, r);
  });

  // ISHAAL, the ring game (games.ts): the recorded game, Paelu's move, the
  // hall's players, and live games between members.
  const filed = (store: { portalMembers(): { userId: number }[] }, id: number) => store.portalMembers().some((m) => m.userId === id);
  router.get("/api/portal/ishaal", "user", ({ res, user, store }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    json(res, 200, games.view(user.id));
  });
  router.post("/api/portal/ishaal/:what", "user", ({ res, user, store, body, bus, params }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    if (!filed(store, user.id)) return json(res, 403, { error: "not_filed" });
    if (!rate(user.id, 240, 60_000, "ishaal")) return json(res, 429, { error: "rate_limited" });
    const b = (body ?? {}) as { move?: unknown; opp?: unknown; id?: unknown };
    const what = params.what;
    const opp = games.botOpponent(user.id);
    const r =
      what === "paelu" ? games.paelu(user.id, b.move)
      : what === "start" ? games.botStart(user.id, b.opp)
      : what === "move" ? games.botMove(user.id, b.move)
      : what === "leave" ? (games.botLeave(user.id), { ok: true as const })
      : what === "open" ? games.openGame(user.id)
      : what === "join" ? games.joinGame(user.id, b.id)
      : what === "play" ? games.liveMove(user.id, b.id, b.move)
      : what === "resign" ? games.resign(user.id, b.id)
      : { ok: false as const, error: "not_found" };
    if (!r.ok) return json(res, r.error === "not_found" ? 404 : r.error === "taken" || r.error === "stale" || r.error === "already_moved" ? 409 : 400, { error: r.error });
    if (["open", "join", "play", "resign"].includes(what)) bus.emit("portal.changed", { what: "ishaal" });
    if (what === "paelu") bus.emit("portal.changed", { what: "post", room: "tharvend" });
    const cracked = (r as { cracked?: number | null }).cracked;
    if (cracked != null) bus.emit("portal.glyph", { userId: user.id, glyph: cracked, source: `ishaal:${opp ?? ""}` });
    json(res, 200, r);
  });

  // THE VOICE ROOMS (voice.ts): sit, talk, and — very rarely, alone — hear
  // four breaths of the room's last session.
  const voiceOn = () => !!(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);
  const voiceState = (room: Parameters<PortalVoice["state"]>[0], viewer: number, store: { portalMembers(): { userId: number; username: string }[] }) => {
    const names = new Map(store.portalMembers().map((m) => [m.userId, m.username]));
    const st = voice.state(room);
    return { enabled: voiceOn(), here: st.here.map((u) => ({ name: tokenize(transliterate(names.get(u) ?? "a")).tokens, you: u === viewer })), fault: st.fault, now: Date.now() };
  };
  router.get("/api/portal/voice/:room", "user", ({ res, user, store, params }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const room = decodeURIComponent(params.room);
    if (!voice.isRoom(room)) return json(res, 404, { error: "not_found" });
    json(res, 200, voiceState(room, user.id, store));
  });
  router.post("/api/portal/voice/:room/:what", "user", async ({ res, user, store, params }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    if (!filed(store, user.id)) return json(res, 403, { error: "not_filed" });
    const room = decodeURIComponent(params.room);
    if (!voice.isRoom(room)) return json(res, 404, { error: "not_found" });
    if (params.what === "token") {
      if (!voiceOn()) return json(res, 503, { error: "voice_disabled" });
      const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, { identity: String(user.id), name: transliterate(user.username), ttl: "1h" });
      at.addGrant({ room: `portal_${room}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
      return json(res, 200, { token: await at.toJwt(), url: config.livekitUrl, room: `portal_${room}` });
    }
    if (params.what === "beat") { voice.beat(room, user.id); return json(res, 200, voiceState(room, user.id, store)); }
    if (params.what === "leave") { voice.leave(room, user.id); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "not_found" });
  });

  // SENNETH'S BENCH (bench-sim.ts): start a run, then finish it with every bleed.
  router.get("/api/portal/bench", "user", ({ res, user, store }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    json(res, 200, games.bench(user.id));
  });
  router.post("/api/portal/bench/start", "user", ({ res, user, store, body }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    if (!filed(store, user.id)) return json(res, 403, { error: "not_filed" });
    const r = games.benchStart(user.id, (body as { id?: unknown })?.id);
    if (!r.ok) return json(res, r.error === "locked" ? 403 : 400, { error: r.error });
    json(res, 200, r);
  });
  router.post("/api/portal/bench/finish", "user", ({ res, user, store, body, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const r = games.benchFinish(user.id, (body as { bleeds?: unknown })?.bleeds);
    if (!r.ok) return json(res, 400, { error: r.error });
    if (r.cracked != null) bus.emit("portal.glyph", { userId: user.id, glyph: r.cracked, source: "bench" });
    if (r.mark != null) bus.emit("portal.notation", { userId: user.id, mark: r.mark, source: "bench:unaimed" });
    json(res, 200, r);
  });

  // THE SURVEY (survey.ts): the sky instrument, and charting a galaxy.
  router.get("/api/portal/survey", "user", ({ res, user, store }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    json(res, 200, hall.survey(user.id, day()));
  });
  router.post("/api/portal/survey/chart", "user", ({ res, user, store, body, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    if (!store.portalMembers().some((m) => m.userId === user.id)) return json(res, 403, { error: "not_filed" });
    const { galaxy, pairs } = (body ?? {}) as { galaxy?: unknown; pairs?: unknown };
    const r = hall.chart(user.id, galaxy, pairs, day());
    if (!r.ok) return json(res, r.error === "no_tries" ? 429 : r.error === "already_charted" ? 409 : 400, { error: r.error });
    if (r.cracked !== null) bus.emit("portal.glyph", { userId: user.id, glyph: r.cracked, source: `survey:${galaxy as string}` });
    json(res, 200, r);
  });

  router.get("/api/portal/roster", "user", ({ res, user, store }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    store.portalTouch(user.id);
    json(res, 200, { roster: hall.roster(user.id) });
  });

  router.get("/api/portal/profile/:key", "user", ({ res, user, store, params }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const p = hall.profile(decodeURIComponent(params.key), user.id);
    if (!p) return json(res, 404, { error: "not_found" });
    json(res, 200, p);
  });

  router.get("/api/portal/rooms/:room", "user", ({ res, user, store, params, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    store.portalTouch(user.id);
    const id = decodeURIComponent(params.room);
    // The primer, read in full, is the second cipher's first crack.
    if (id === "kaal-ith") { const m = hall.primerCrack(user.id); if (m !== null) bus.emit("portal.notation", { userId: user.id, mark: m, source: "primer" }); }
    const r = hall.room(id, user.id);
    if (!r) return json(res, 404, { error: "not_found" });
    json(res, 200, { ...(r as object), sounds: hall.sounds(hall.unlocked()) });
  });

  // Speaking: glyph tokens only; every glyph cracked, every word one you know.
  router.post("/api/portal/rooms/:room/posts", "user", ({ res, user, store, params, body, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    if (!rate(user.id, 10, 60_000)) return json(res, 429, { error: "rate_limited" });
    const room = decodeURIComponent(params.room);
    const r = hall.composePost(room, (body as { tokens?: unknown })?.tokens, user.id);
    if (!r.ok) return json(res, 400, { error: r.error });
    const p = store.portalAddPost(room, user.id, r.text);
    bus.emit("portal.changed", { what: "post", room });
    json(res, 200, { ok: true, id: p.id });
  });

  router.post("/api/portal/react", "user", ({ res, user, store, body, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const { target, sign } = (body ?? {}) as { target?: unknown; sign?: unknown };
    if (typeof sign !== "string" || !["ren", "ta'an", "ahel", "eeth", "sehu", "onn"].includes(sign)) return json(res, 400, { error: "bad_sign" });
    if (!hall.hasTarget(target)) return json(res, 404, { error: "not_found" });
    const on = store.portalReact(target as string, user.id, sign);
    bus.emit("portal.changed", { what: "react" });
    json(res, 200, { ok: true, on });
  });

  router.post("/api/portal/guess/glyph", "user", ({ res, user, store, body, bus }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const { glyph, sound } = (body ?? {}) as { glyph?: unknown; sound?: unknown };
    const r = hall.guessGlyph(glyph, sound, user.id, day());
    if (!r.ok) return json(res, r.error === "no_tries" ? 429 : r.error === "already_cracked" ? 409 : 400, { error: r.error });
    if (r.right) bus.emit("portal.glyph", { userId: user.id, glyph: glyph as number, source: "deduction" });
    json(res, 200, r);
  });

  router.post("/api/portal/guess/word", "user", ({ res, user, store, body }) => {
    if (!open(store, user.id)) return json(res, 403, { error: "portal_closed" });
    const { target, word, piece, meaning } = (body ?? {}) as Record<string, unknown>;
    const r = hall.guessWord(target, word, piece, meaning, user.id, day());
    if (!r.ok) return json(res, r.error === "no_tries" ? 429 : 400, { error: r.error });
    json(res, 200, r);
  });

  // ---- admin -------------------------------------------------------------
  // The voice rooms' playback fault, now (testing; filed as a repair like any other).
  router.post("/api/admin/portal/voice-fault", "admin", ({ res, body }) => {
    const room = (body as { room?: unknown })?.room;
    if (!voice.isRoom(room)) return json(res, 400, { error: "bad_room" });
    const f = voice.fault(room);
    if (!f) return json(res, 409, { error: "no_clips" });
    json(res, 200, { ok: true, ...f });
  });
  // A glitch for a reader's next look (testing; the repair is filed like any other).
  router.post("/api/admin/portal/glitch", "admin", ({ res, user, body }) => {
    const { kind, userId } = (body ?? {}) as { kind?: unknown; userId?: unknown };
    if (!["ghost", "presence", "corrupt"].includes(kind as string)) return json(res, 400, { error: "bad_kind" });
    const who = Number.isInteger(userId) ? (userId as number) : user.id;
    json(res, 200, { ok: true, kind: hall.maybeGlitch(who, kind as GlitchKind) });
  });
  // Hand the community a glyph (a module, for testing): a named one, or a random locked one.
  router.post("/api/admin/portal/glyph", "admin", ({ res, user, store, body, bus }) => {
    const want = (body as { glyph?: unknown })?.glyph;
    const unlocked = hall.unlocked();
    const locked = [...Array(GLYPH_COUNT).keys()].filter((g) => !unlocked.has(g));
    const glyph = Number.isInteger(want) ? (want as number) : locked[Math.floor(Math.random() * locked.length)];
    if (glyph === undefined || glyph < 0 || glyph >= GLYPH_COUNT) return json(res, 400, { error: "bad_glyph" });
    if (!store.portalUnlockGlyph(glyph, user.id, "admin")) return json(res, 409, { error: "already_cracked" });
    store.audit(user.id, "portal.glyph", String(glyph));
    bus.emit("portal.glyph", { userId: user.id, glyph, source: "admin" });
    json(res, 200, { ok: true, glyph, cracked: unlocked.size + 1 });
  });
}
