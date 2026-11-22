import "./env"; // loads .env into process.env — MUST come before ./config
import { setResearchSource } from "./npc/research";
import { STONE_CODE, STONE_NAME, STONE_FILE, ABYSS_TIER } from "./abyss";
import { registerAbyssRoutes } from "./routes/abyss";
import { registerPortalRoutes } from "./routes/portal";
import { Hall } from "./portal/hall";
import { PortalGames } from "./portal/games";
import { PortalVoice } from "./portal/voice";
import { relicBySlug } from "./backrooms/relics";
import { installLogBuffer } from "./logbuf";
import { registerFederationRoutes } from "./routes/federation";
import { registerSurvivorzAssetRoutes, setSurvivorzShowGate } from "./routes/survivorz-assets";
import { registerSurvivorzShowRoutes } from "./routes/survivorz-show";
import { attachSurvivorzBroadcast } from "./survivorz/broadcast";
import { startSurvivorzStream } from "./survivorz/stream";
import { startGpuWatch } from "./survivorz/gpuwatch";
import { isStreamPrincipal } from "./survivorz/streamtoken";
import { makeTalkWorld, type TalkWorld } from "./survivorz/talk/show";
import { dailySummary, dailyWanted, houseDate, type DailyCounts } from "./survivorz/daily";
import { voiceStats } from "./survivorz/voices";
import { brainModel } from "./survivorz/talk/model";
import { registerSurvivorzTalkRoutes, talkAllowed } from "./routes/survivorz-talk";
import { refreshCast, registerSurvivorzCastRoutes } from "./routes/survivorz-cast";
import { registerVoiceAgentRoutes } from "./routes/voice-agent";
import { registerSurvivorzBodyRoutes } from "./routes/survivorz-bodies";
import { registerSurvivorzVoiceRoutes } from "./routes/survivorz-voices";
import { attachFederationLink } from "./federation/link";
import { attachSatVoiceProxy } from "./federation/voice";
import { startSatelliteErrorSweep } from "./federation/errlog";
installLogBuffer(); // wrap console.* before ANYTHING logs — the panel's log tab
import fs from "node:fs";
import { config } from "./config";
import { Store } from "./db/store";
import { createServer, Router } from "./http";
import { Bus } from "./bus";
import { attachRealtime, onlineUsers } from "./realtime";
import { registerPageRoutes } from "./routes/pages";
import { registerRoleRoutes } from "./routes/roles";
import { createBackrooms } from "./backrooms/service";
import { attachBackroomsNet } from "./backrooms/net";
import { attachCasinoFloor } from "./casino/floor";
import { registerCasinoRoutes } from "./routes/casino";
import { registerEscapeRoutes } from "./routes/escape";
import { attachEscapeZone } from "./casino/escape-zone";
import { createJukebox } from "./casino/jukebox";
import { registerJukeboxRoutes } from "./routes/jukebox";
import { registerBackroomsRoutes } from "./routes/backrooms";
import { registerMapEditorRoutes, loadCustomSurfaces } from "./routes/mapeditor";
import { hashPassword } from "./auth";
import { TALISMAN_CODE } from "./wheel";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerChannelRoutes } from "./routes/channels";
import { registerMessageRoutes } from "./routes/messages";
import { registerWheelRoutes } from "./routes/wheel";
import { registerAdminRoutes } from "./routes/admin";
import { registerProfileRoutes } from "./routes/profile";
import { registerDmRoutes } from "./routes/dm";
import { registerSlotsRoutes } from "./routes/slots";
import { registerTradeRoutes } from "./routes/trade";
import { registerWalletRoutes } from "./routes/wallet";
import { registerShopRoutes } from "./routes/shop";
import { registerForgeRoutes } from "./routes/forge";
import { registerLenderRoutes } from "./routes/lender";
import { registerAuctionRoutes } from "./routes/auction";
import { startAuctionSweep } from "./auction";
import { registerBlackjackRoutes } from "./routes/blackjack";
import { createBlackjack } from "./blackjack";
import { registerRouletteRoutes } from "./routes/roulette";
import { createRoulette } from "./roulette";
import { registerCrapsRoutes } from "./routes/craps";
import { createCraps } from "./craps";
import { registerHoldemRoutes } from "./routes/holdem";
import { createHoldem } from "./holdem";
import { createSterling, registerSterlingRoutes, UPDATES_CHANNEL, UPDATES_TOPIC } from "./sterling";
import { GENERAL_PAGE_ID } from "./types";
import { createGoblins, registerGoblinRoutes } from "./goblins";
import { registerGazetteRoutes, startGazette } from "./gazette";
import { createVoss, registerVossRoutes } from "./voss";
import { NpcBrain } from "./npc/brain";
import { CHARACTERS, FLOOR_NPCS } from "./npc/characters";
import { registerNpcRoutes } from "./npc/routes";
import { AffinityKeeper, MISSED_DAY_PENALTY } from "./npc/affinity";
import { brainConfigured } from "./npc/ollama";
import { registerObservabilityRoutes } from "./routes/observability";
import { registerSecurityRoutes } from "./routes/security";
import { securityFindings, hostFindings, pruneSecurity } from "./security";
import { heartbeat, runHealthChecks, startLivekitProbe, guardedTick, registerHealthCheck } from "./health";
import { registerModerationRoutes } from "./routes/moderation";
import { registerDerbyRoutes } from "./routes/derby";
import { createDerby } from "./derby";
import { registerLotteryRoutes } from "./routes/lottery";
import { startLotterySweep } from "./lottery";
import { registerChessRoutes } from "./routes/chess";
import { registerFeedbackRoutes } from "./routes/feedback";
import { registerUploadRoutes } from "./routes/uploads";
import { startAttachmentSweep } from "./attachments";
import { GRAVE_SWEEP_MS } from "./mortality";
import { LENDER_SWEEP_MS, collectorsNotice } from "./lender";
import { registerBonePitRoutes } from "./routes/bonepit";
import { createBonePit } from "./bonepit";
import { registerSearchRoutes } from "./routes/search";
import { registerSideBetRoutes } from "./routes/sidebet";
import { registerLedgerRoutes } from "./routes/ledger";
import { registerEventRoutes, startEventReminders } from "./routes/events";
import { initPush, wirePushTriggers } from "./push";
import { registerPushRoutes } from "./routes/push";
import { createChessDuels } from "./chessduel";
import { registerGraveyardRoutes } from "./routes/graveyard";
import { startPerfSampler } from "./perf";
import { startCheckpointer } from "./db/checkpointer";
import { registerEmporiumRoutes } from "./routes/emporium";
import { registerVipRoutes } from "./routes/vip";
import { registerPandoraRoutes } from "./routes/pandora";
import { registerVoiceRoutes } from "./routes/voice";
import { initAchievements } from "./achievements";

/** On a brand-new database, create the initial admin account from the env. */
function seedAdmin(store: Store): void {
  if (store.countUsers() > 0) return;
  // A rebuilt production box (REQUIRE_INVITE is the production posture) must
  // not come up with the documented placeholder as its operator password —
  // dev boxes and harnesses get a loud warning instead (Sep 2026 review).
  if (config.adminPassword === "changeme") {
    if (config.requireInvite) {
      throw new Error("ADMIN_PASSWORD is still the placeholder on an invite-only server — set a real one in .env before the first boot");
    }
    console.warn('[seed] ADMIN_PASSWORD is the placeholder "changeme" — fine for dev, never for a public box');
  }
  store.createUser({
    username: "admin",
    displayName: "Admin",
    passwordHash: hashPassword(config.adminPassword),
    isAdmin: true,
  });
  console.log('[seed] created admin account "admin" from ADMIN_PASSWORD');
}

/** Ensure there's always at least one channel to talk in. */
function seedGeneral(store: Store): void {
  if (store.countChannels() > 0) return;
  const admin = store.getUserByUsername("admin");
  store.createChannel({ name: "general", topic: "Welcome to Solace", createdBy: admin?.id ?? 1 });
  console.log("[seed] created #general channel");
}

/** THE NOTICE BOARD (Josh, Sep 2026): a read-only channel on Solace General
 *  where Sterling posts update briefs. Created LOCKED and owned by the admin
 *  account, which is exactly what makes it read-only — `canPost` admits an
 *  admin, the creator, or the allow-list on a locked channel, and the first
 *  two are the same account here. Sterling writes through the store, not the
 *  route, so the lock never stands in his way.
 *
 *  Idempotent by NAME rather than by a count, unlike seedGeneral: this runs on
 *  every boot so an existing server grows the board on its next deploy, and an
 *  admin who deletes it has deleted it on purpose — only its absence at boot
 *  brings it back. */
function seedUpdatesChannel(store: Store): void {
  const existing = store
    .listChannels(GENERAL_PAGE_ID)
    .find((c) => c.name.toLowerCase() === UPDATES_CHANNEL.toLowerCase());
  if (existing) return;
  const admin = store.getUserByUsername("admin");
  if (!admin) return; // no house yet; the next boot has one
  const ch = store.createChannel({ name: UPDATES_CHANNEL, topic: UPDATES_TOPIC, createdBy: admin.id });
  store.updateChannel(ch.id, { locked: true });
  console.log(`[seed] created the notice board "${UPDATES_CHANNEL}" (locked, admin-only)`);
}

/** Load the emoji catalog into the DB on first boot (drives the wheel/economy). */
function seedEmoji(store: Store): void {
  let list: { code: string; tier: string; name: string; file: string; animated?: boolean }[];
  try {
    list = JSON.parse(fs.readFileSync(config.emojiManifestPath, "utf8"));
  } catch {
    console.warn(`[seed] no emoji manifest at ${config.emojiManifestPath} — skipping catalog`);
    return;
  }
  // The special talisman item/emoji (death shield). Its art can be dropped in later.
  list.push({ code: TALISMAN_CODE, tier: "talisman", name: "talisman", file: "special/talisman.png", animated: false });
  // THE STONE OF THE ABYSS (src/abyss.ts): its own tier, its art bundled in
  // the repo (assets/emoji) so a pull deploys it.
  list.push({ code: STONE_CODE, tier: ABYSS_TIER, name: STONE_NAME, file: STONE_FILE, animated: false });
  store.seedEmoji(list);
  const counts = store.emojiTierCounts();
  if (Object.keys(counts).length) console.log(`[seed] emoji catalog: ${JSON.stringify(counts)}`);
}

function main(): void {
  const store = new Store(config.dbPath);
  seedAdmin(store);
  seedGeneral(store);
  seedUpdatesChannel(store);
  seedEmoji(store);

  const bus = new Bus();
  const router = new Router();
  // Achievements: the engine registers its debounced re-check against every
  // store write that can move a badge (stats, emoji, deaths, messages…).
  initAchievements(store, bus);
  // Logout pulls the user out of any game they're seated at. Late-bound —
  // the game engines are created after the auth routes register.
  const gameExits: { fn: (userId: number) => void } = { fn: () => {} };
  registerAuthRoutes(router, (userId) => gameExits.fn(userId));
  registerUserRoutes(router);
  registerChannelRoutes(router);
  registerPageRoutes(router, onlineUsers);
  registerRoleRoutes(router);
  // Sterling: the house bot — commands, floor commentary, auto specials.
  const sterling = createSterling(store, bus);
  registerSterlingRoutes(router, sterling);
  // The goblins' voice: rare personal letters with an introductory rate, and
  // the rarer bark in #general that Sterling answers.
  const goblins = createGoblins(store, bus, sterling);
  // THE THIRD VOICE (Sep 2026): Dr. Voss answers /ada and files the field
  // notice that Sterling replies to and the goblins barge into — the only
  // thread where all three of the house's characters are in one room.
  const voss = createVoss(store, bus, sterling);
  registerGoblinRoutes(router, goblins);
  registerVossRoutes(router, voss);
  registerObservabilityRoutes(router);
  registerSecurityRoutes(router);
  // THE HOUSE'S THREE VOICES answer commands on one hook. Each returns true
  // if it recognised the message, so the chain stops at the first owner and a
  // post that is nobody's command falls through untouched.
  // THE HOUSE'S BRAINS (Oct 2026, src/npc): conversation BESIDE the commands.
  // A command is claimed by the chain above and never reaches the model; an
  // un-commanded post reaches the brain, which answers only if it @mentions
  // one of the three or replies to one of their messages.
  // THE AFFINITY METER (src/npc/affinity.ts): the keeper is the meter's only
  // writer; everything that earns affinity reaches it through store.affinityHook.
  const affinity = new AffinityKeeper(store, bus);
  // Best-effort: these fire from inside money operations (a relic bank, an
  // auction settlement, an Exchange close), and earning affinity must never be
  // the reason one of those fails.
  store.affinityHook = (userId, npc, source) => {
    try { affinity.award(userId, npc, source); } catch (e) { console.error(`[npc] affinity award failed (${npc}/${source}):`, (e as Error).message); }
  };
  bus.on("wheel.event", ({ item }) => {
    if (item.kind === "win" && (item.tier === "legendary" || item.tier === "mythic")) affinity.award(item.user.id, "sterling", "wheel");
  });
  bus.on("lottery.won", ({ winner }) => { if (winner) affinity.award(winner.id, "sterling", "lottery"); });
  // THE REGULARS' BOT ROWS (migration 119): they no longer walk the floor,
  // but their personalities stay in characters.ts and the brain looks every
  // character's row up, so the rows exist — hidden from every roster.
  for (const id of FLOOR_NPCS) {
    const c = CHARACTERS[id];
    let u = store.getUserByUsername(c.username);
    if (!u) {
      u = store.createUser({ username: c.username, displayName: c.name, passwordHash: "!bot!" });
      store.setBotFlag(c.username);
    }
    if (!u.deletedAt) store.hideAccount(u.id);
  }
  const npcBrain = new NpcBrain(store, bus, affinity);
  registerNpcRoutes(router, npcBrain, affinity);
  npcBrain.start();
  registerMessageRoutes(router, (user, channel, text, message) => {
    const handled =
      sterling.handleCommand(user, channel, text) ||
      goblins.handleCommand(user, channel, text) ||
      voss.handleCommand(user, channel, text);
    if (!handled) npcBrain.onChannelMessage(user, channel, message);
  });
  registerWheelRoutes(router, (userId) => gameExits.fn(userId));
  registerAdminRoutes(router, (userId) => gameExits.fn(userId));
  registerProfileRoutes(router, (userId) => gameExits.fn(userId));
  registerDmRoutes(router, (user, convId, recipientId, message) => npcBrain.onDm(user, convId, recipientId, message));
  registerSlotsRoutes(router);
  registerTradeRoutes(router);
  registerWalletRoutes(router);
  registerShopRoutes(router);
  registerForgeRoutes(router);
  registerLenderRoutes(router);
  registerAuctionRoutes(router);
  const bj = createBlackjack(store, bus);
  registerBlackjackRoutes(router, bj);
  const roulette = createRoulette(store, bus);
  registerRouletteRoutes(router, roulette);
  registerCrapsRoutes(router, createCraps(store, bus));
  const holdem = createHoldem(store, bus);
  registerHoldemRoutes(router, holdem);
  registerModerationRoutes(router);
  const derby = createDerby(store, bus);
  registerDerbyRoutes(router, derby);
  registerLotteryRoutes(router, bus);
  const duels = createChessDuels(store, bus);
  registerChessRoutes(router, duels);
  registerFeedbackRoutes(router);
  registerGraveyardRoutes(router);
  registerEmporiumRoutes(router);
  registerVipRoutes(router);
  registerPandoraRoutes(router);
  registerAbyssRoutes(router);
  // THE PORTAL: the hall behind the stone. Its archive is a bundle in assets/.
  const hall = new Hall(store, config.portalArchivePath);
  registerPortalRoutes(router, hall, new PortalGames(store, hall, hall.ishaal), new PortalVoice(store));
  // A glyph cracked is news on Solace too (PORTAL.md: "the announcement in
  // #general") — Sterling names who, and how many are left, nothing more.
  bus.on("portal.glyph", ({ userId, glyph, source }) => {
    const ch = sterling.general();
    const n = store.portalGlyphs().length;
    // The last mark, however it fell: the count mark is given, the last room opens.
    if (n >= 34 && ch && !store.kvGet("portal_last_room")) {
      store.kvSet("portal_last_room", String(Date.now()));
      setTimeout(() => sterling.say(ch.id, "Every mark over there is read now. Something in the hall opened that wasn't open before. I don't know what's in it. I'm not sure I want to."), 1500);
    }
    // Sterling's own three are announced by his reply where he was asked.
    if (source === "admin" || source === "sterling") return;
    const who = store.getUserById(userId);
    if (!who || !ch) return;
    const relic = source.startsWith("relic:") ? relicBySlug(source.slice(6)) : undefined;
    sterling.say(ch.id, source === "stone"
      ? `${who.displayName} went through the Portal and the stone they carried read one mark on the far side. ${n} of 34 marks read.`
      : relic
        ? `${who.displayName} carried ${relic.name} through the Portal, and the mark cut into it read on the far side. ${n} of 34 read. I'd have that relic looked at, if I were Dr. Voss.`
        : source.startsWith("survey:")
          ? `${who.displayName} matched a whole galaxy of pulses on the Portal's sky instrument, and one of its numbers read with it. ${n} of 34 read.`
          : source.startsWith("ishaal:")
            ? `${who.displayName} beat one of the old players at the Portal's ring game, and a mark read with the win. ${n} of 34 read.`
            : source === "bench"
              ? `${who.displayName} held a fold on the bench over there long enough to get its answer, and a mark read with it. ${n} of 34 read.`
              : `${who.displayName} cracked a mark in the Portal. ${n} of 34 read. Whatever is over there, it's being read.`);
    void glyph;
  });
  bus.on("portal.notation", ({ userId, source }) => {
    const who = store.getUserById(userId);
    const ch = sterling.general();
    if (!who || !ch) return;
    const n = store.portalNotation().length;
    sterling.say(ch.id, source === "primer"
      ? `${who.displayName} read the first page of the Portal's research shorthand all the way through, and one of its marks gave itself up. ${n} of 26.`
      : `${who.displayName} cracked a mark of the shorthand their researchers wrote in. ${n} of 26. That's the second cipher over there, for those keeping count.`);
  });
  sterling.portalMarks = (userId) => {
    if (store.abyssOpenedAt(userId) == null) return { state: "closed", cracked: 0 };
    if (!store.portalMembers().some((m) => m.userId === userId)) return { state: "unfiled", cracked: 0 };
    const cracked = hall.sterlingMarks(userId);
    for (const glyph of cracked) bus.emit("portal.glyph", { userId, glyph, source: "sterling" });
    return { state: "filed", cracked: cracked.length };
  };
  registerVoiceRoutes(router);
  registerUploadRoutes(router);
  const pit = createBonePit(store, bus);
  registerBonePitRoutes(router, pit);
  registerSideBetRoutes(router, pit, duels);
  gameExits.fn = (userId) => {
    bj.leaveAll(userId);
    pit.leaveAll(userId);
    holdem.leaveAll(userId);
  };
  // Side-bet escrow spans both games — boot-refund orphans once, up front.
  const refundedBets = store.sideBetRefundOpen();
  if (refundedBets > 0) console.log(`[sidebet] refunded ${refundedBets} orphaned bet(s) from before restart`);
  registerSearchRoutes(router);
  registerLedgerRoutes(router);
  registerEventRoutes(router);
  // FEDERATION F1 (FEDERATION.md): the satellite registry + provisioning.
  registerFederationRoutes(router);
  registerSurvivorzAssetRoutes(router);
  const stopEventReminders = startEventReminders(store, bus);
  // Web Push: VAPID keys from app_kv (generated on first boot), triggers on
  // the same bus events realtime bridges — closed devices get DMs, personal
  // @mentions, and event reminders.
  initPush(store);
  registerPushRoutes(router);
  wirePushTriggers(store, bus, onlineUsers);

  // Last-resort process guards: log + record, keep serving (a friend-scale
  // chat server staying up beats dying clean; the error lands in the panel).
  // "Log it and keep serving" is for faults AFTER the server is up (Oct 2026
  // review). A throw while booting used to be swallowed the same way: the
  // process stayed alive with nothing listening, so systemd never restarted
  // it and Caddy served 502s. Before listen() succeeds, a fault exits.
  let booted = false;
  const bootFault = (what: string): void => {
    if (booted) return;
    console.error(`[fatal] ${what} during boot — exiting so the service manager restarts it`);
    process.exit(1);
  };
  process.on("uncaughtException", (err) => {
    console.error("[fatal] uncaught exception:", err);
    store.recordError("server", err.message, err.stack, "uncaughtException");
    bootFault("uncaught exception");
  });
  process.on("unhandledRejection", (reason) => {
    const e = reason instanceof Error ? reason : new Error(String(reason));
    console.error("[fatal] unhandled rejection:", e);
    store.recordError("server", e.message, e.stack, "unhandledRejection");
    bootFault("unhandled rejection");
  });

  const server = createServer(store, router, bus);
  attachRealtime(server, store, bus);
  // FEDERATION: /ws-satellite — the rendezvous link satellites dial into.
  attachFederationLink(server, store, bus);
  // F5b: /satvoice/<id> — the signaling relay to a host's own LiveKit.
  attachSatVoiceProxy(server);
  // F6: drain linked satellites' error queues into the deduped ledger.
  startSatelliteErrorSweep(store);
  // The Backrooms: verify the frozen world and open /ws-game (a fingerprint
  // mismatch logs loudly and keeps the doors shut; everything else runs on).
  // uploaded textures first: a published map that names one must still pass
  loadCustomSurfaces(store);
  const backrooms = createBackrooms(store);
// Dr. Voss's research for a surveyor she trusts (src/npc/research.ts).
setResearchSource((userId) => backrooms.researchHints(userId));
  attachBackroomsNet(server, store, backrooms, bus);
  registerBackroomsRoutes(router, backrooms, store);
  registerMapEditorRoutes(router, backrooms, store);
  // SOLACE SURVIVORZ (SURVIVORZ.md §12): the show runs on the server and /ws-survivorz carries it to
  // every watching screen. Off until the admin presses Start (Admin Panel → Survivorz → Show).
  // THE TALK LAYER (src/survivorz/talk/): the survivors speak (subtitles) and now and then pick
  // from their menus — only while the house brain is up AND the admin's switch is on. Off, the sim
  // runs exactly as it does with no minds in it.
  const survivorTalk = brainModel(npcBrain);
  // THE BENCH, AUTOMATED (Josh, Nov 1 2026): Claudia comes in by herself this many sim-hours after a death
  const survivorzBenchHours = Number(process.env.SURVIVORZ_BENCH_HOURS) > 0 ? Number(process.env.SURVIVORZ_BENCH_HOURS) : 6;
  // THE CAST IS LIVE (Nov 4 2026): the panel's list laid over the repo's files BEFORE the show resumes a
  // saved run, so a character who only exists on the list is known to the run that has them in it
  refreshCast(store);
  const survivorzShow = attachSurvivorzBroadcast(server, store, (o) =>
    makeTalkWorld({ map: o.map, seed: o.seed, start: o.now(), run: o.run, restore: o.restore, cast: o.cast, zombies: o.zombies, starts: o.starts, partSpot: o.partSpot, noteSpot: o.noteSpot, player: o.player }, { model: survivorTalk, allowed: () => talkAllowed((k) => store.kvGet(k)), kv: store }));
  // THE STREAM RIG (src/survivorz/stream.ts), made first: the show's start lever turns its go-live switch
  const survivorzStream = startSurvivorzStream(router, store);
  registerSurvivorzShowRoutes(router, survivorzShow, survivorzStream);
  bus.on("user.kick", ({ userId }) => survivorzShow.kick(userId));
  bus.on("session.ended", ({ userId }) => survivorzShow.kick(userId));
  registerSurvivorzTalkRoutes(router, () => (survivorzShow.world() as TalkWorld | null)?.minds ?? null, survivorTalk);
  // the character list (Admin Panel → Characters): kept in the DB until pull-cast.mjs brings it into git
  registerSurvivorzCastRoutes(router, survivorTalk);
  // the voice agent on slopbot voices the show's survivors
  registerVoiceAgentRoutes(router);
  registerSurvivorzBodyRoutes(router);
  registerSurvivorzVoiceRoutes(router);
  // the stream rig's token reaches the show's read-only doors even off air (YouTube only for the run)
  setSurvivorzShowGate((u) => isStreamPrincipal(u) || survivorzShow.mayWatch(u));
  // the workstation GPU watcher (deploy/workstation/gpu-watch.ps1): a restart needed reaches Sterling
  startGpuWatch(router, store);
  // what the survivors' minds did, every ten minutes the show runs — the journal is the only place
  // to read it without an admin session (the live show went silent once and nothing said why)
  {
    let last = { said: 0, dropped: 0, asked: 0, thought: 0 };
    setInterval(() => {
      const m = (survivorzShow.world() as TalkWorld | null)?.minds;
      if (!m) { last = { said: 0, dropped: 0, asked: 0, thought: 0 }; return; }
      const s = m.status();
      if (s.said < last.said || s.thoughtsWritten < last.thought) last = { said: 0, dropped: 0, asked: 0, thought: 0 };   // a fresh world
      console.log(`[survivorz] talk, last 10 min: ${s.active ? "on" : `off (${!s.allowed ? "switch off" : !s.modelUp ? "model down" : "?"})`} · ${s.said - last.said} said, ${s.dropped - last.dropped} dropped, ${s.choicesAsked - last.asked} choices asked, ${s.thoughtsWritten - last.thought} thoughts written · ${s.meetings} meetings so far`);
      last = { said: s.said, dropped: s.dropped, asked: s.choicesAsked, thought: s.thoughtsWritten };
    }, 10 * 60_000).unref();
  }
  // THE DAILY SUMMARY (src/survivorz/daily.ts; Josh, Nov 1 2026): once a day at 09:00 house time while the
  // show runs, Sterling DMs every admin the story so far and the health of everything that carries it.
  // Admin Panel's lever (POST /api/admin/survivorz/daily) sends one now. Never voiced.
  {
    const DAILY_LAST = "survivorz_daily_last", DAILY_COUNTS = "survivorz_daily_counts";
    const counts = (): DailyCounts => {
      const m = (survivorzShow.world() as TalkWorld | null)?.minds?.status();
      return { voiced: voiceStats.voiced, silent: voiceStats.silent, late: voiceStats.late, said: m?.said ?? 0, dropped: m?.dropped ?? 0 };
    };
    const sendDaily = (): string => {
      const st = survivorzShow.status();
      const now = counts();
      let since: DailyCounts | null = null;
      try { since = JSON.parse(store.kvGet(DAILY_COUNTS) ?? "null"); } catch { since = null; }
      // a restart or a new run starts the counters again: never report a negative day
      if (since && (Object.keys(now) as (keyof DailyCounts)[]).some((k) => now[k] < since![k])) since = null;
      const text = dailySummary({ sim: (survivorzShow.world() as TalkWorld | null)?.sim ?? null, running: st.running, paused: st.paused, checks: runHealthChecks(store), counts: now, since });
      for (const a of store.listUsers().filter((u) => u.isAdmin && !u.disabled && !u.isBot)) sterling.dm(a.id, text);
      store.kvSet(DAILY_COUNTS, JSON.stringify(now));
      return text;
    };
    setInterval(() => {
      guardedTick(store, "survivorz-daily", 30 * 60_000, () => {
        if (!dailyWanted(survivorzShow.status(), store.kvGet(DAILY_LAST))) return;
        store.kvSet(DAILY_LAST, houseDate());
        sendDaily();
      });
    }, 5 * 60_000).unref();
    router.post("/api/admin/survivorz/daily", "admin", ({ res, user }) => {
      const text = sendDaily();
      store.audit(user.id, "survivorz.daily", "sent now");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, text }));
    });
  }
  // THE FLOOR (the FPS casino, CASINO.md): /ws-casino — a stateless presence
  // relay; positions only, nothing persisted. THE JUKEBOX rides it in the same
  // spirit: the relay carries a filename and a playhead, and the silver for a
  // pick is charged over HTTP like every other counter in the house.
  const jukebox = createJukebox(store, bus);
  // THE BOULEVARD is the one hall (the classic hall was retired, Oct 2026).
  const casinoFloor = attachCasinoFloor(server, store, bus, jukebox);
  // The 26B is the ONLY engine (Oct 13 2026), so it gets a health check —
  // red reaches Sterling's alert DMs like every other.
  if (brainConfigured()) {
    // the workstation pauses it for games, so a gap is normal; 3h is not. For a
    // 24/7 show nothing pauses it and a gap is the stream going quiet, so
    // NPC_ENGINE_RED_MIN tightens it (SURVIVORZ.md §11: minutes, not hours).
    const redMin = Math.max(1, Number(process.env.NPC_ENGINE_RED_MIN) || 180);
    registerHealthCheck("AI engine (26B)", () => {
      const since = npcBrain.offlineSince;
      if (since === null) return { ok: true, detail: "loaded" };
      const m = (Date.now() - since) / 60_000;
      const told = m >= 90 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)} min`;
      return { ok: m < redMin, detail: `no engine loaded for ${told} (paused for a game, or the workstation is off)` };
    });
  }
  // THE FOUNDRY GAZETTE (src/gazette.ts): Sterling's morning paper of the
  // house's public news, written on the steady engine.
  registerGazetteRoutes(router, startGazette(store, bus, sterling));
  const escapeZone = attachEscapeZone(server, store, bus);
  jukebox.bindFloor(casinoFloor);
  registerCasinoRoutes(router, casinoFloor);
  registerEscapeRoutes(router, escapeZone);
  registerJukeboxRoutes(router, jukebox);
  // Periodically settle auctions whose timer has elapsed (also swept lazily on read).
  const stopAuctionSweep = startAuctionSweep(store, bus);

  // Seal graves whose 48 hours have run out — the life becomes a monument and
  // the same account stands up as the next generation (src/mortality.ts). Also
  // swept lazily whenever anyone opens the Graveyard, so a stopped server just
  // means a late sealing, never a lost one: the deadline is a column.
  const graveSweep = setInterval(() => {
    guardedTick(store, "grave sweep", GRAVE_SWEEP_MS, () => {
      for (const id of store.dueGraves()) {
        const who = store.getUserById(id);
        if (store.sealGrave(id).sealed && who) {
          const now = store.getUserById(id);
          bus.emit("grave.sealed", {
            userId: id,
            generation: now?.generation ?? (who.generation ?? 1) + 1,
            name: who.displayName,
          });
        }
      }
    });
  }, GRAVE_SWEEP_MS);
  void graveSweep;
  // THE GOBLINS' ROUNDS (migration 72). Once a minute we look for debts that
  // owe a day and cells whose window has run out. The charge is keyed to the
  // UTC day, so a stopped server means a LATE visit, never a skipped one —
  // and a box that was off for a week charges at most MAX_CATCHUP_DAYS, so
  // nobody comes back to find the whole server in jail.
  const lenderSweep = setInterval(() => {
    guardedTick(store, "lender sweep", LENDER_SWEEP_MS, () => {
      const visits = store.collectDebts();
      for (const r of visits) {
        // THE COLLECTORS' NOTICE (Sep 2026): the visit used to be silent —
        // interest gone, purse garnished, ten emoji sold — and the debtor
        // found out only if they opened the kiosk. One line, to them alone.
        bus.emit("lender.notice", { userId: r.userId, kind: "visit", ...collectorsNotice(r) });
        // THE TURN, on the meter too: they love you until you're late.
        if (r.missedDays > 0) affinity.penalize(r.userId, "goblins", r.missedDays * MISSED_DAY_PENALTY);
        if (!r.jailed) continue;
        // A prisoner leaves every table, as a death does (Oct 2026 review): a
        // Hold'em seat left standing kept an in-memory stack the cell's
        // sealing later refunded, so the seat played on with nothing behind it.
        gameExits.fn(r.userId);
        const who = store.getUserById(r.userId);
        if (who) {
          bus.emit("user.kick", { userId: r.userId }); // the cell needs the session re-resolved
          bus.emit("lender.jailed", { userId: r.userId, name: who.displayName });
        }
      }
      let changed = visits.length > 0;
      for (const id of store.cellsToSeal()) {
        const who = store.getUserById(id);
        const sealed = store.sealCell(id);
        if (sealed.sealed && who) {
          changed = true;
          const now = store.getUserById(id);
          bus.emit("grave.sealed", {
            userId: id,
            generation: now?.generation ?? (who.generation ?? 1) + 1,
            name: who.displayName,
          });
        }
      }
      if (changed) bus.emit("lender.change", {});
    });
  }, LENDER_SWEEP_MS);
  void lenderSweep;
  // Expire attachment files past their retention tier + delete orphan uploads.
  const stopAttachmentSweep = startAttachmentSweep(store);
  // Draw the nightly lottery promptly at UTC midnight (also lazily on read).
  const stopLotterySweep = startLotterySweep(store, bus);
  void stopLotterySweep;
  // Server performance sampling for the Admin Panel (src/perf.ts).
  const stopPerfSampler = startPerfSampler(store);
  // WAL checkpoints on a worker thread, not inside whichever commit crosses
  // 1,000 pages (src/db/checkpointer.ts — that commit held the loop ~0.4s).
  const checkpointer = startCheckpointer(store, config.dbPath);
  void checkpointer;
  void stopPerfSampler;
  // Voice SFU liveness (60s probe) — feeds the health screen + Sterling alerts.
  startLivekitProbe();
  // Observability sweep: daily economy snapshot + Sterling's red-flag alerts.
  const OBS_MS = 5 * 60_000;
  const obsTick = () => {
    guardedTick(store, "observability", OBS_MS, () => {
      store.snapshotEconomy(new Date().toISOString().slice(0, 10));
      sterling.alertCheck(runHealthChecks(store), store.errorSurge(Date.now() - 10 * 60_000));
      // The security pass rides the same tick: scan the sign-in ledger for
      // things that shouldn't have happened, then trim it to retention.
      // Josh will not sit watching the panel — the DM is the actual control,
      // and the panel is where he goes after it.
      sterling.securityAlert([...securityFindings(store), ...hostFindings()]);
      const pruned = pruneSecurity(store);
      if (pruned > 0) console.log(`[security] pruned ${pruned} sign-in events past retention`);
      // Expired sessions and year-old audit rows: neither was ever pruned
      // by time (sessions only left on logout; audit grew forever).
      const aged = store.pruneByAge(config.sessionTtlDays * 86_400_000, 365 * 86_400_000);
      if (aged.sessions || aged.audit) console.log(`[obs] pruned ${aged.sessions} expired sessions, ${aged.audit} audit rows past a year`);
    });
  };
  setTimeout(obsTick, 20_000); // first pass shortly after boot
  const obsTimer = setInterval(obsTick, OBS_MS);
  obsTimer.unref?.();

  server.listen(config.port, config.host, () => {
    booted = true;
    console.log(`Solace listening on http://${config.host}:${config.port}`);
    console.log(`Realtime on ws://${config.host}:${config.port}/ws`);
    console.log(`Database: ${config.dbPath}`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    stopAuctionSweep();
    stopAttachmentSweep();
    stopEventReminders();
    backrooms.flushFog(); // exploration history must survive a restart
    // SOLACE SURVIVORZ: the running show is saved, so the boot after this resumes the same run
    try { survivorzShow.saveNow(); } catch { /* best effort */ }
    server.close();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
