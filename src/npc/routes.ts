// THE HOUSE'S BRAINS — the admin's view and off switch (Oct 2026).
//
// Off turns all three back into exactly what they were before the brains:
// commands answer, a mention is ignored, a DM gets one scripted "away" line
// an hour. Audited — it changes how the house speaks to everyone.

import { json, makeRateLimiter, type Router } from "../http";
import { config } from "../config";
import type { NpcBrain } from "./brain";
import { AFFINITY_MAX, SOURCES, hasMeter, isAffinityNpc, type AffinityKeeper } from "./affinity";
import { CHARACTERS, NPC_IDS, VENUES, type NpcId } from "./characters";

const voiceLimiter = makeRateLimiter();
/** A reaction line is a one-line rewrite; a person clicking about a shop
 *  fires a handful a minute. */
const VOICE_PER_MIN = Number(process.env.NPC_VOICE_PER_MIN ?? 20);
const LINES_PER_MIN = Number(process.env.NPC_LINES_PER_MIN ?? 12);
/** The longest scripted reaction a client may hand over to be voiced. */
const MAX_REACTION = 300;

export function registerNpcRoutes(router: Router, brain: NpcBrain, affinity: AffinityKeeper | null = null): void {
  /** Parse {npc, venue}; null = refuse. */
  const where = (body: unknown): { npc: NpcId; venue: string } | null => {
    const npc = String((body as { npc?: unknown })?.npc ?? "") as NpcId;
    const venue = String((body as { venue?: unknown })?.venue ?? "");
    // Only the house three (Oct 2026 review): the unfiltered floor regulars
    // have a venue for the server's own use, and these routes put caller text
    // into the prompt with no gate and no second read of THE LINE.
    return NPC_IDS.includes(npc) && !CHARACTERS[npc].unfiltered && VENUES[npc][venue] ? { npc, venue } : null;
  };

  // COUNTER TALK — the lines a character's speech bubble cycles through at a
  // venue, written for the person looking at it. 503 = no model right now;
  // the client falls back to its scripted pool.
  // (ARCHIVED Nov 17 2026, config.npcHouseAi: 410 tells the client to stop asking for the session and use its
  // scripted pools — lib/npcvoice.ts)
  router.post("/api/npc/lines", "user", async ({ res, body, user }) => {
    if (!config.npcHouseAi) return json(res, 410, { error: "archived" });
    const w = where(body);
    if (!w) return json(res, 400, { error: "bad_venue" });
    if (!voiceLimiter(`lines:${user.id}`, LINES_PER_MIN, 60_000)) return json(res, 429, { error: "rate_limited" });
    const lines = await brain.bubbles(w.npc, w.venue, user, (body as { fresh?: unknown })?.fresh === true);
    if (!lines) return json(res, 503, { error: "unavailable" });
    json(res, 200, { lines });
  });

  // A REACTION — the line a counter says after you did something there ("A
  // fine choice", "Catalogued, 1,000 silver released"). The client sends the
  // scripted line as the brief; what comes back is it in the character's
  // words, or the brief itself. Only the asker ever sees the result.
  router.post("/api/npc/voice", "user", async ({ res, body, user }) => {
    if (!config.npcHouseAi) return json(res, 410, { error: "archived" });
    const w = where(body);
    if (!w) return json(res, 400, { error: "bad_venue" });
    const line = String((body as { line?: unknown })?.line ?? "").trim();
    if (!line || line.length > MAX_REACTION) return json(res, 400, { error: "bad_line" });
    // WHAT HAPPENED is required for a voiced reaction: without it the line
    // comes back as written. (A blind paraphrase turned "bring it back
    // unmelted" into "return it melted".)
    const event = String((body as { event?: unknown })?.event ?? "").trim();
    if (event.length > MAX_REACTION) return json(res, 400, { error: "bad_event" });
    if (!event || !voiceLimiter(`voice:${user.id}`, VOICE_PER_MIN, 60_000)) return json(res, 200, { line });
    json(res, 200, { line: await brain.react(w.npc, w.venue, user, event, line) });
  });

  // WHAT THEY REMEMBER ABOUT YOU (migration 106). Your own notes only — the
  // route takes no user id, so there is no way to ask for anybody else's.
  // THE AFFINITY METER (affinity.ts): your own standing with each of the
  // three, and what earns it. The house has no meter.
  router.get("/api/me/npc-affinity", "user", ({ res, user, store }) => {
    // (archived: the meter is hidden from the pages — `on: false` — and its rows are kept)
    if (!config.npcHouseAi) return json(res, 200, { house: true, affinity: [], on: false });
    if (!affinity) return json(res, 200, { house: true, affinity: [] });
    // The house has no meter — except one its admin set on themself with the
    // lever below, to test what each tier sounds like.
    if (!hasMeter(user)) {
      const set = affinity.all(user.id).filter((v) => store.npcAffinityRow(user.id, v.npc));
      return json(res, 200, { house: true, affinity: set.map((v) => ({ ...v, name: CHARACTERS[v.npc].name, earns: [] })) });
    }
    json(res, 200, {
      house: false,
      affinity: affinity.all(user.id).map((v) => ({
        ...v,
        name: CHARACTERS[v.npc].name,
        earns: Object.values(SOURCES[v.npc]).map((r) => r.label),
      })),
    });
  });

  /** The admin's lever, for testing: set one person's meter outright. */
  router.post("/api/admin/npc-affinity", "admin", ({ res, body, user, store }) => {
    const b = (body ?? {}) as { userId?: unknown; npc?: unknown; points?: unknown };
    const userId = Number(b.userId), points = Number(b.points), npc = String(b.npc ?? "") as NpcId;
    if (!config.npcHouseAi) return json(res, 409, { error: "archived" });
    if (!affinity) return json(res, 503, { error: "off" });
    if (!Number.isInteger(userId) || !store.getUserById(userId)) return json(res, 404, { error: "no_user" });
    if (!NPC_IDS.includes(npc) || !isAffinityNpc(npc)) return json(res, 400, { error: "bad_npc" });
    if (!Number.isFinite(points) || points < 0 || points > AFFINITY_MAX) return json(res, 400, { error: "bad_points" });
    affinity.set(userId, npc, points);
    store.audit(user.id, "npc.affinity", `${userId} ${npc} ${Math.round(points)}`);
    json(res, 200, { ok: true, affinity: affinity.all(userId) });
  });

  router.get("/api/me/npc-memory", "user", ({ res, user, store }) => {
    const rows = new Map(store.npcMemoryAll(user.id).map((r) => [r.npc, r]));
    json(res, 200, {
      memories: NPC_IDS.map((id) => ({
        npc: id,
        name: CHARACTERS[id].name,
        notes: rows.get(id)?.notes ?? "",
        updatedAt: rows.get(id)?.updatedAt ?? null,
      })),
    });
  });

  /** Forget: one character's notes, or "all" of them. The conversation up to
   *  now is marked as covered, so it is never read back into new notes. */
  router.del("/api/me/npc-memory/:npc", "user", ({ res, params, user }) => {
    const which = String(params.npc);
    if (which !== "all" && !NPC_IDS.includes(which as NpcId)) return json(res, 404, { error: "no_npc" });
    brain.memory.forget(user.id, which === "all" ? null : (which as NpcId));
    json(res, 200, { ok: true });
  });

  router.get("/api/admin/npc-brain", "admin", ({ res }) => {
    json(res, 200, brain.status());
  });

  router.post("/api/admin/npc-brain", "admin", ({ res, body, user, store }) => {
    const on = (body as { on?: unknown })?.on;
    if (typeof on !== "boolean") return json(res, 400, { error: "bad_on" });
    if (!config.npcHouseAi) return json(res, 409, { error: "archived" });
    brain.setEnabled(on);
    store.audit(user.id, "npc.brain", on ? "on" : "off");
    json(res, 200, brain.status());
  });
}
