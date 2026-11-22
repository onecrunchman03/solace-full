import fs from "node:fs";
import path from "node:path";
import { json, type Router } from "../http";
import { kickFromVoice } from "../backrooms/ghostvoice";
import { newInviteCode, hashPassword, hashSecret, validatePassword, validateSecret } from "../auth";
import { toPublicUser } from "../types";
import { deleteAvatarFile as deleteAvatarFileByName, deleteScrubbedUploads } from "./profile";
import { TALISMAN_CODE } from "../wheel";
import { PANDORA_KEYS, type PandoraKey } from "../pandora";
import { liveSample } from "../perf";
import { buildWeeklyReport } from "../report";
import { config } from "../config";

/**
 * Admin-only economy tools, used from the client's Settings panel. These bypass
 * the normal rules on purpose (refilling spins, forcing a death outcome), so
 * they're gated at `"admin"` auth — the router returns 403 for non-admins.
 */
export function registerAdminRoutes(router: Router, onExit?: (userId: number) => void): void {
  // Refill a user's spin bucket to a full 7. Defaults to the calling admin.
  router.post("/api/admin/spins/reset", "admin", ({ res, body, user, store }) => {
    const targetId = Number.isInteger(body?.userId) ? (body.userId as number) : user.id;
    if (!store.getUserById(targetId)) return json(res, 404, { error: "user_not_found" });
    store.resetSpins(targetId);
    // A full refill is ~700 silver of sell-yield: audited like every other
    // house power (Oct 2026 review — it was the one that wasn't).
    store.audit(user.id, "spins.reset", store.getUserById(targetId)?.username ?? String(targetId));
    json(res, 200, { ok: true, userId: targetId, spins: store.spinState(targetId) });
  });

  // Rig a user's next spin to land on the death slot (or clear the rig).
  //
  // IT IS NOT A GUARANTEED KILL, and the answer comes back with the rig.
  // A rigged spin skips the reaper's 68% blink — that is what makes it
  // deterministic — but it still meets the talisman, which is consumed and
  // the target walks away. Most accounts here are shielded most of the time
  // (the wedge hands one out on 1/32 of spins and the house has handed out
  // more), so "I rigged a death and Solace spared them" is the ordinary
  // outcome rather than a fault. The operator should not have to guess:
  // `shielded` says what the next wedge will actually do.
  router.post("/api/admin/spins/rig-death", "admin", ({ res, body, user, store }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    const clear = body?.clear === true;
    store.setRiggedSpin(targetId, clear ? null : "death");
    // A lever that can end an account leaves a record, like every other house
    // power in this file. It was the only one that didn't.
    store.audit(user.id, clear ? "spin.rig_clear" : "spin.rig_death", target.username);
    json(res, 200, {
      ok: true,
      userId: targetId,
      rigged: clear ? null : "death",
      shielded: store.ownsEmoji(targetId, TALISMAN_CODE),
      immune: target.isAdmin === true,
    });
  });

  // Rig a user's next spin onto the legendary slot — GUARANTEED legendary
  // (the 50% near-miss roll is skipped for rigged spins), so the casino
  // floor's big-win moment is testable on demand (Josh's ask).
  router.post("/api/admin/spins/rig-legendary", "admin", ({ res, body, user, store }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    const clear = body?.clear === true;
    store.setRiggedSpin(targetId, clear ? null : "legendary");
    // A guaranteed legendary sells for 2,500 — a mint like /api/admin/coins,
    // so it is audited like its sibling rig-death (Oct 2026 review).
    store.audit(user.id, clear ? "spin.rig_clear" : "spin.rig_legendary", target.username);
    json(res, 200, { ok: true, userId: targetId, rigged: clear ? null : "legendary" });
  });

  // Revive a tombstoned account (re-enable login, clear death + any rig).
  router.post("/api/admin/users/revive", "admin", ({ res, body, user, store }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    // A goblin prisoner is not dead: reviving one left the cell's clock armed
    // and the cell later sealed onto the living account, running the
    // Inheritance (Oct 2026 review). Bail or the house's settlement frees them.
    if (target.jailedAt && !target.diedAt) return json(res, 409, { error: "jailed" });
    store.reviveUser(targetId);
    store.audit(user.id, "user.revive", target.username);
    json(res, 200, { ok: true, userId: targetId });
  });

  // Grant the death-shield talisman (house power, like minting silver).
  // Ownership is binary — an already-shielded target is a clean 409.
  router.post("/api/admin/talisman", "admin", ({ res, body, user, store }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (store.ownsEmoji(targetId, TALISMAN_CODE)) {
      return json(res, 409, { error: "already_shielded" });
    }
    store.addEmoji(targetId, TALISMAN_CODE);
    // A handed-out shield is a life the wheel can't take, so it is audited
    // like the mint. Without this, the only trace of the five shields the
    // house gave out in July 2026 is five acquiredAt stamps 26 seconds apart.
    store.audit(user.id, "talisman.grant", target.username);
    json(res, 200, { ok: true, userId: targetId });
  });

  // Lock / unlock an account (a BAN): locked users can't log in and every
  // session is killed, but they are NOT dead — no graveyard, fully
  // reversible. Moderator power (admins included via the "mod" auth level);
  // mods can never touch admins or other mods.
  router.post("/api/admin/users/:id/lock", "mod", ({ res, params, body, user, store, bus }) => {
    const target = store.getUserById(Number(params.id));
    // A deleted account reads as nonexistent: an unban used to unlock a
    // scrubbed row whose password still worked (Oct 2026 review).
    if (!target || target.deletedAt) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin) return json(res, 403, { error: "cannot_touch_admin" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    if (target.role === "moderator" && !user.isAdmin) return json(res, 403, { error: "cannot_touch_mod" });
    const updated = store.setLocked(target.id, body?.locked === true);
    store.audit(user.id, body?.locked === true ? "user.ban" : "user.unban", target.username);
    if (updated) bus.emit("user.update", { user: toPublicUser(updated) });
    if (body?.locked === true) { bus.emit("user.kick", { userId: target.id }); void kickFromVoice(target.id); }
    json(res, 200, { ok: true, locked: body?.locked === true });
  });

  // Timed SUSPENSION (moderator power): refused login for `hours` (1–720);
  // hours 0 lifts an active suspension early. Sessions die with it.
  router.post("/api/admin/users/:id/suspend", "mod", ({ res, params, body, user, store, bus }) => {
    const target = store.getUserById(Number(params.id));
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin) return json(res, 403, { error: "cannot_touch_admin" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    if (target.role === "moderator" && !user.isAdmin) return json(res, 403, { error: "cannot_touch_mod" });
    const hours = Number(body?.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 720) return json(res, 400, { error: "bad_hours" });
    const until = hours === 0 ? null : Date.now() + hours * 3600_000;
    store.setSuspension(target.id, until);
    store.audit(user.id, hours === 0 ? "user.unsuspend" : "user.suspend", `${target.username}${hours ? ` ${hours}h` : ""}`);
    if (until) { bus.emit("user.kick", { userId: target.id }); void kickFromVoice(target.id); }
    json(res, 200, { ok: true, until });
  });

  // Assign a role (ADMIN only — mods can't mint mods).
  router.post("/api/admin/users/:id/role", "admin", ({ res, params, body, user, store, bus }) => {
    const target = store.getUserById(Number(params.id));
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin) return json(res, 403, { error: "cannot_touch_admin" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    const role = String(body?.role ?? "");
    if (role !== "user" && role !== "moderator") return json(res, 400, { error: "bad_role" });
    const updated = store.setRole(target.id, role);
    store.audit(user.id, "user.role", `${target.username} → ${role}`);
    if (updated) bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true, role });
  });

  // UNLOCK a login (Josh, Aug 2026): clears the brute-force lockout so a
  // friend who fat-fingered their password ten times doesn't have to wait
  // out the backoff. Purely protective, so unlike the other user tools it
  // may target anyone but the bot — even an admin.
  router.post("/api/admin/users/:id/unlock-login", "admin", ({ res, params, user, store }) => {
    const target = store.getUserById(Number(params.id));
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    store.clearLoginFailures(target.id);
    store.audit(user.id, "user.unlock_login", target.username);
    json(res, 200, { ok: true });
  });

  // RESET a user's password (Josh, Aug 2026): the operator's recovery path
  // for a friend locked out with no recovery secret. Same password policy
  // as registration; every session dies with the old password; the
  // brute-force counter clears. Admin accounts are refused — an admin
  // password changes only through Settings with the current password in
  // hand (a takeover of the house is not a support action).
  router.post("/api/admin/users/:id/password", "admin", ({ res, params, body, user, store, bus }) => {
    const target = store.getUserById(Number(params.id));
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin) return json(res, 403, { error: "cannot_touch_admin" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    const password = String(body?.password ?? "");
    const pErr = validatePassword(password, target.username);
    if (pErr) return json(res, 400, { error: "bad_password", message: pErr });
    store.setPassword(target.id, hashPassword(password));
    store.deleteOtherSessions(target.id, ""); // evict every session
    store.clearLoginFailures(target.id);
    store.audit(user.id, "user.password_reset", target.username);
    // Also on the target's own sign-in ledger, so their security history
    // reads straight: "your password was changed, by the house". WITHOUT the
    // operator's address (Oct 2026 review): the member reads this ledger.
    store.recordLoginEvent({
      userId: target.id, username: target.username, outcome: "password_changed",
      ip: "house", network: "house", ua: `admin:${user.username}`,
    });
    bus.emit("user.kick", { userId: target.id });
    void kickFromVoice(target.id);
    json(res, 200, { ok: true });
  });

  // RESET a user's RECOVERY SECRET (Josh, Aug 2026): the companion to the
  // password reset above — a friend who forgot their secret phrase can't
  // pass the new-network challenge or self-reset, so the operator sets a
  // fresh one and hands it over. Same screening as registration; sessions
  // survive (the secret is a recovery credential, not a login one); the
  // brute-force counter clears since a forgotten secret usually means a
  // string of failed guesses. Admins refused — the house's own secret only
  // changes in Settings.
  router.post("/api/admin/users/:id/secret", "admin", ({ res, params, body, user, store }) => {
    const target = store.getUserById(Number(params.id));
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin) return json(res, 403, { error: "cannot_touch_admin" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    const secret = String(body?.secret ?? "");
    const sErr = validateSecret(secret, "", target.username);
    if (sErr) return json(res, 400, { error: "bad_secret", message: sErr });
    store.setSecret(target.id, hashSecret(secret));
    store.clearLoginFailures(target.id);
    store.audit(user.id, "user.secret_reset", target.username);
    store.recordLoginEvent({
      userId: target.id, username: target.username, outcome: "secret_changed",
      ip: "house", network: "house", ua: `admin:${user.username}`,
    });
    json(res, 200, { ok: true });
  });

  // "Delete" an account: scrub all personal data (identity anonymized,
  // avatar/bio/cosmetics wiped, emoji + coins burned, sessions killed) and
  // permanently lock. The row survives so message history keeps its shape.
  router.post("/api/admin/users/:id/delete", "admin", ({ res, params, user, store, bus }) => {
    const target = store.getUserById(Number(params.id));
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin) return json(res, 403, { error: "cannot_touch_admin" });
    if (target.isBot) return json(res, 403, { error: "cannot_touch_bot" });
    store.audit(user.id, "user.delete", target.username);
    onExit?.(target.id); // stand up from every table BEFORE the escrow sweep (Sep 2026 review)
    const r = store.scrubUser(target.id);
    if (!r.ok) return json(res, 404, { error: "user_not_found" });
    deleteAvatarFileByName(r.avatar);
    deleteScrubbedUploads(r);
    bus.emit("user.kick", { userId: target.id });
    void kickFromVoice(target.id);
    const updated = store.getUserById(target.id);
    if (updated) bus.emit("user.update", { user: toPublicUser(updated) });
    json(res, 200, { ok: true });
  });

  // Mint silver into any account (usually the admin's own). The house's
  // printing press — an explicit admin power, like refilling spins; the
  // player-facing economy still has the Wheel as its only faucet.
  // PANDORA'S BOX (PANDORA.md): hand a member a key for testing, or take a
  // test key back. Never for the house or the bot (the rules give them
  // none either). `revoke: true` undoes; a revoked key that's already in
  // the box comes out with it.
  router.post("/api/admin/pandora/key", "admin", ({ res, body, user, store, bus }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isAdmin || target.isBot) return json(res, 400, { error: "house_holds_no_key" });
    const key = String(body?.key ?? "") as PandoraKey;
    if (!PANDORA_KEYS.includes(key)) return json(res, 400, { error: "bad_key" });
    if (body?.revoke === true) {
      const gone = store.revokePandoraKey(target.id, key);
      store.audit(user.id, "pandora.key_revoke", `${key} ← ${target.username}`);
      return json(res, 200, { ok: true, revoked: gone, keys: store.pandoraKeys(target.id) });
    }
    const fresh = store.grantPandoraKey(target.id, key);
    if (fresh) bus.emit("pandora.key", { userId: target.id, key });
    store.audit(user.id, "pandora.key_grant", `${key} → ${target.username}`);
    json(res, 200, { ok: true, granted: fresh, keys: store.pandoraKeys(target.id) });
  });

  // THE STONE OF THE ABYSS (src/abyss.ts): hand a member the stone for
  // testing (the box is the only real source), or take it back — a revoke
  // also closes their Portal. Audited. The admin may hold one (Josh tests).
  router.post("/api/admin/abyss/stone", "admin", ({ res, body, user, store, bus }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    if (target.isBot) return json(res, 400, { error: "bot" });
    if (body?.revoke === true) {
      const gone = store.revokeStone(target.id);
      // The lever's own tooltip promises the Portal shuts — tell their sockets
      // so the rail entry goes now, instead of on their next reload.
      bus.emit("abyss.closed", { userId: target.id });
      store.audit(user.id, "abyss.stone_revoke", target.username);
      return json(res, 200, { ok: true, revoked: gone });
    }
    const fresh = store.grantStone(target.id);
    store.audit(user.id, "abyss.stone_grant", target.username);
    json(res, 200, { ok: true, granted: fresh });
  });

  // …and clear a TEST opening: the ledger row, its world flag, the suit.
  router.post("/api/admin/pandora/reset", "admin", ({ res, body, user, store }) => {
    const targetId = Number(body?.userId);
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    const cleared = store.clearPandoraOpening(target.id);
    store.audit(user.id, "pandora.reset", target.username);
    json(res, 200, { ok: true, cleared });
  });

  router.post("/api/admin/coins", "admin", ({ res, body, user, store }) => {
    const targetId = body?.userId !== undefined ? Number(body.userId) : user.id;
    const target = Number.isInteger(targetId) ? store.getUserById(targetId) : undefined;
    if (!target) return json(res, 404, { error: "user_not_found" });
    const amount = Number(body?.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
      return json(res, 400, { error: "bad_amount" });
    }
    store.addCoins(target.id, amount);
    store.audit(user.id, "coins.mint", `${amount} → ${target.username}`);
    json(res, 200, { ok: true, userId: target.id, coins: store.getCoins(target.id) });
  });

  // Reset the Wall of Fame (user_stats) — a fresh-season lever. Pit crowns
  // and collection boards are untouched; those are history, not stats.
  router.post("/api/admin/stats/reset", "admin", ({ res, user, store }) => {
    const cleared = store.resetStats();
    store.audit(user.id, "stats.reset", `${cleared} rows`);
    console.log(`[admin] Wall of Fame reset (${cleared} stat rows cleared)`);
    json(res, 200, { ok: true, cleared });
  });

  // ---- Invites -----------------------------------------------------------

  // List all invites (newest first) with usage + derived status.
  router.get("/api/admin/invites", "mod", ({ res, store }) => {
    json(res, 200, { invites: store.listInvites() });
  });

  // Mint a new invite code. Body: { maxUses?, ttlHours?, note? } — all optional
  // (defaults to a single-use code that never expires).
  router.post("/api/admin/invites", "mod", ({ res, body, user, store }) => {
    const maxUsesRaw = Number(body?.maxUses);
    const maxUses =
      Number.isInteger(maxUsesRaw) && maxUsesRaw >= 1 ? Math.min(maxUsesRaw, 1000) : 1;
    const ttlHours = Number(body?.ttlHours);
    const expiresAt =
      Number.isFinite(ttlHours) && ttlHours > 0 ? Date.now() + ttlHours * 3_600_000 : null;
    const note =
      typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 80) : null;
    const invite = store.createInvite({
      code: newInviteCode(),
      createdBy: user.id,
      maxUses,
      expiresAt,
      note,
    });
    // Who can join an invite-only server is a power worth a record (Oct 2026).
    store.audit(user.id, "invite.mint", `${invite.code} x${maxUses}${expiresAt ? "" : " (no expiry)"}`);
    json(res, 200, { invite });
  });

  // Revoke an invite so it can no longer be redeemed.
  router.post("/api/admin/invites/:code/revoke", "mod", ({ res, params, user, store }) => {
    if (!store.revokeInvite(params.code)) return json(res, 404, { error: "invite_not_found" });
    store.audit(user.id, "invite.revoke", params.code);
    json(res, 200, { ok: true });
  });

  // ---- Admin Panel observability (src/perf.ts, migration 44) ---------------

  // Live server stats + recent history (the panel polls this).
  router.get("/api/admin/stats", "admin", ({ res, store }) => {
    json(res, 200, { now: liveSample(), samples: store.perfRecent(240) });
  });

  // Full performance-log export: a JSON download ready to hand to a debugging
  // session (drag it into Claude, paste it into an issue, whatever).
  router.get("/api/admin/perf/export", "admin", ({ res, store }) => {
    const payload = JSON.stringify(
      { app: "solace", exportedAt: new Date().toISOString(), samples: store.perfAll() },
      null,
      2,
    );
    res.writeHead(200, {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="solace-perf-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(payload);
  });

  // The weekly stability report as a text download — the app-layer twin of
  // deploy/weekly-report.sh (which adds the OS sections). Built to be pasted
  // whole into a Claude session for the weekly review.
  router.get("/api/admin/weekly-report", "admin", ({ res, store }) => {
    const text = buildWeeklyReport(store);
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="solace-weekly-${new Date().toISOString().slice(0, 10)}.txt"`,
    });
    res.end(text);
  });

  // Per-user storage report: live attachment bytes + the avatar file itself,
  // searchable so it stays usable as the member list grows.
  router.get("/api/admin/storage", "admin", ({ res, url, store }) => {
    const q = (url.searchParams.get("q") ?? "").slice(0, 40);
    const users = store
      .storageByUser(q)
      .map((r) => {
        const statBytes = (dir: string, file: string | null) => {
          if (!file) return 0;
          try {
            return fs.statSync(path.join(config.uploadsDir, dir, file)).size;
          } catch {
            return 0; // file gone — counts as zero
          }
        };
        const avatarBytes = statBytes("avatars", r.avatar);
        const bannerBytes = statBytes("banners", r.banner);
        return {
          ...r,
          avatarBytes,
          bannerBytes,
          totalBytes: r.attachBytes + avatarBytes + bannerBytes + r.soundBytes,
        };
      })
      .sort((a, b) => b.totalBytes - a.totalBytes);
    json(res, 200, { users });
  });
}
