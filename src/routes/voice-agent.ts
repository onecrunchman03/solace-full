// THE VOICE AGENT'S DOOR (slopbot's 3080, scripts/rollo/agent.py). It voices
// the Solace Survivorz show's survivors in their cloned voices: it polls for
// lines to render and posts the audio back (src/survivorz/voices.ts). The
// casino regulars it also used to voice were removed in Nov 2026, so `npcs`
// and `listeners` are always empty — an agent that expects them still runs.
//
// Every route takes NPC_AGENT_SECRET (>= 24 chars, compared as bytes) and
// answers 404 to anybody without it.

import { timingSafeEqual } from "node:crypto";
import { json, type Router } from "../http";
import { voiceTake, voiceAudio, VOICE } from "../survivorz/voices";
import { registerHealthCheck } from "../health";

let agentLastSeen = 0;

export function registerVoiceAgentRoutes(router: Router): void {
  const secret = process.env.NPC_AGENT_SECRET ?? "";
  const authed = (req: { headers: Record<string, string | string[] | undefined> }): boolean => {
    const got = Buffer.from(String(req.headers["x-agent-secret"] ?? ""));
    const want = Buffer.from(secret);
    if (!secret || secret.length < 24 || got.length !== want.length) return false;
    return timingSafeEqual(got, want);
  };

  // The heartbeat: hands over the survivors' lines to voice (only to an agent
  // that says it voices them — an older one would take lines it never renders).
  router.get("/api/npc/agent/near", "none", ({ req, res, url }) => {
    if (!authed(req)) return json(res, 404, { error: "not_found" });
    agentLastSeen = Date.now();
    json(res, 200, {
      npcs: [],
      listeners: [],
      host: [],
      ...(url.searchParams.get("sz") === "1" ? { survivorz: voiceTake() } : {}),
    });
  });

  // A SURVIVOR'S VOICE, rendered: 16-bit mono PCM (base64) for a held line.
  router.post("/api/npc/agent/survivorz-audio", "none", ({ req, res, body }) => {
    if (!authed(req)) return json(res, 404, { error: "not_found" });
    const b = (body ?? {}) as { id?: unknown; pcm?: unknown; rate?: unknown };
    const id = Number(b.id), rate = Number(b.rate);
    if (!Number.isInteger(id) || typeof b.pcm !== "string" || !Number.isInteger(rate) || rate < 8_000 || rate > 48_000) return json(res, 400, { error: "bad_input" });
    const pcm = Buffer.from(b.pcm, "base64");
    if (!pcm.length || pcm.length > rate * 2 * VOICE.maxSeconds) return json(res, 400, { error: "bad_audio" });
    json(res, 200, { ok: voiceAudio(id, pcm, rate) });
  });

  // Red past two minutes without a check-in — the alert reaches Sterling's DMs.
  if (secret.length >= 24) {
    const bootAt = Date.now();
    registerHealthCheck("Show voices (slopbot)", () => {
      if (!agentLastSeen) {
        return Date.now() - bootAt < 5 * 60_000
          ? { ok: true, detail: "waiting for the voice agent to check in" }
          : { ok: false, detail: "the voice agent hasn't checked in since this boot — is solace-voices up on slopbot?" };
      }
      const age = Date.now() - agentLastSeen;
      return { ok: age < 2 * 60_000, detail: `last check-in ${Math.round(age / 1000)}s ago` };
    });
  }
}
