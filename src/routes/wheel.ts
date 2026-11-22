import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { json, type Router } from "../http";
import { config } from "../config";
import {
  spin, buildFace, WHEEL_SLOTS, TALISMAN_CODE,
  reaperRate, reaperGraceLeft, REAPER_GRACE, reaperRetired,
} from "../wheel";
import { pushFeed, recentFeed } from "../feed";
import type { WheelFeedItem } from "../types";

const MIME: Record<string, string> = { ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".jpg": "image/jpeg" };
const TIERS = new Set(["common", "rare", "legendary", "mythic", "special", "abyss"]);
const SAFE = /^[A-Za-z0-9._-]+$/;
const NOTABLE = new Set(["rare", "legendary", "mythic"]); // wins worth announcing

/** Register the wheel, inventory, board, and emoji-asset routes. */
export function registerWheelRoutes(router: Router, onDeath?: (userId: number) => void): void {
  // Wheel status for rendering: slots, spins available, when the bucket refills.
  router.get("/api/wheel", "user", ({ res, user, store }) => {
    store.refreshSpins(user.id);
    // THE REAPER'S PATIENCE. A hazard the player cannot see is just bad luck
    // arriving, so the gauge is part of the rules rather than decoration: how
    // long you have been bare, how much grace is left, and what the wedge
    // would do to you RIGHT NOW. The house is never at risk and reads safe.
    const shielded = store.ownsEmoji(user.id, TALISMAN_CODE);
    const bare = store.bareSpins(user.id);
    // Pandora's box can retire the reaper for everyone: the gauge reads safe.
    const retired = reaperRetired(store);
    const safe = user.isAdmin || retired;
    json(res, 200, {
      reaper: {
        bare,
        grace: REAPER_GRACE,
        graceLeft: safe ? REAPER_GRACE : reaperGraceLeft(bare),
        rate: safe ? 0 : reaperRate(bare, shielded),
        shielded,
        immune: user.isAdmin === true,
        retired,
      },
      slots: WHEEL_SLOTS,
      // what the wedges advertise at rest — real prizes you don't own yet
      face: buildFace(store, user),
      spins: store.spinState(user.id),
      nextReset: store.nextSpinReset(),
      tierCounts: store.emojiTierCounts(),
      owned: store.inventoryCount(user.id),
      hasTalisman: store.ownsEmoji(user.id, TALISMAN_CODE),
    });
  });

  // Spin (server-authoritative). Announces notable outcomes to the live feed.
  router.post("/api/wheel/spin", "user", ({ res, user, store, bus }) => {
    const outcome = spin(store, user);
    if (!outcome.ok) return json(res, 429, { error: outcome.error });

    const r = outcome.result!;
    const who = { id: user.id, username: user.username, displayName: user.displayName };
    let item: WheelFeedItem | null = null;
    if (r.type === "emoji" && r.emoji && NOTABLE.has(r.tier ?? "")) {
      item = { id: randomUUID(), kind: "win", user: who, tier: r.tier, at: Date.now(),
        emoji: { code: r.emoji.code, name: r.emoji.name, file: r.emoji.file, animated: r.emoji.animated } };
    } else if (r.type === "talisman" && !r.alreadyHad) {
      item = { id: randomUUID(), kind: "talisman", user: who, at: Date.now() };
    } else if (r.type === "death") {
      // THE DEAD LEAVE THE TABLES (Sep 2026 review). killUser swept their
      // escrow rows back into the estate inside the spin, but the in-memory
      // engines still had them seated: Hold'em dealt the corpse in and posted
      // its blinds from a row that no longer existed, and holdemSettle's
      // guarded UPDATE no-op'd for the dead while the winner's +delta was
      // paid in full — silver minted every hand until the auto-fold sweep.
      // Same hook logout uses; after the transaction, never inside it.
      onDeath?.(user.id);
      // …and their sockets hang up (Oct 2026 review): only an honest client
      // closed them, so a modified one kept acting as a corpse — typing,
      // shooting on the floor, opening escape chests. Late enough for the
      // death cinematic to play first; the kick re-checks the session, so a
      // grave raised meanwhile hangs up nobody.
      const deadId = user.id;
      setTimeout(() => bus.emit("user.kick", { userId: deadId }), 25_000).unref();
      item = { id: randomUUID(), kind: "death", user: who, at: Date.now() };
    } else if (r.type === "death_survived" && !r.immune) {
      // Admin immunity is a quiet operator no-op — keep it out of the feed.
      item = { id: randomUUID(), kind: "survived", user: who, at: Date.now() };
    }
    if (item) {
      pushFeed(item);
      bus.emit("wheel.event", { item });
    }
    // THE FLOOR's stage wheel mirrors this spin, so it needs EVERY outcome and
    // the slot itself — `wheel.event` above carries neither. Emitted after the
    // spin is fully applied; consumers are presentation only.
    if (typeof outcome.slotIndex === "number") {
      bus.emit("wheel.spin", {
        userId: user.id,
        slotIndex: outcome.slotIndex,
        died: r.type === "death",
        outcome: r.type,
        tier: r.type === "emoji" ? r.tier : undefined,
        emojiFile: r.type === "emoji" ? r.emoji?.file : undefined,
        emojiName: r.type === "emoji" ? r.emoji?.name : undefined,
        face: outcome.face?.map((f) => (f ? { file: f.file } : null)),
      });
    }
    json(res, 200, outcome);
  });

  // The current user's collection.
  router.get("/api/inventory", "user", ({ res, user, store }) => {
    json(res, 200, { emoji: store.getInventory(user.id), count: store.inventoryCount(user.id) });
  });

  // Boards.
  router.get("/api/wheel/feed", "user", ({ res }) => json(res, 200, { feed: recentFeed() }));
  router.get("/api/leaderboard", "user", ({ res, store }) => json(res, 200, { leaders: store.leaderboard() }));
  router.get("/api/deaths", "user", ({ res, store }) => json(res, 200, { deaths: store.deaths() }));
  router.get("/api/leaderboard/tiers", "user", ({ res, store }) => {
    const tiers: Record<string, unknown> = {};
    for (const t of ["mythic", "legendary", "rare", "common"]) tiers[t] = store.leaderboardByTier(t, 5);
    json(res, 200, { tiers });
  });

  // Full catalog (grouped by tier) for the unlockables gallery + wheel prizes.
  router.get("/api/catalog", "user", ({ res, store }) => json(res, 200, { catalog: store.catalogByTier() }));

  // Serve emoji image files at /emoji/<tier>/<file>. Public so <img> tags can load them.
  router.get("/emoji/:tier/:file", "none", ({ res, params }) => {
    const { tier, file } = params;
    const ext = path.extname(file).toLowerCase();
    if (!TIERS.has(tier) || !SAFE.test(file) || !MIME[ext]) return json(res, 404, { error: "not_found" });
    // The server's art folder first; the repo's bundled art (the Stone of
    // the Abyss) when the folder lacks it. Both roots traversal-guarded.
    const roots = [config.emojiDir, config.bundledEmojiDir];
    const filePath = roots.map((r) => path.join(r, tier, file)).find((p, i) => p.startsWith(roots[i]) && fs.existsSync(p));
    if (!filePath) return json(res, 404, { error: "not_found" });
    // Catalog art is seeded once and never redrawn — a month keeps repeat
    // traffic near zero while still (eventually) honoring a replaced file.
    res.writeHead(200, { "content-type": MIME[ext], "cache-control": "public, max-age=2592000" });
    fs.createReadStream(filePath).pipe(res);
  });
}
