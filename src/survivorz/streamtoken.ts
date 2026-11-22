// SOLACE SURVIVORZ — THE STREAM TOKEN (SURVIVORZ.md §12 "The stream rig").
//
// The YouTube stream is captured from a browser on the workstation that nobody signs in to, and the
// in-Solace broadcast stays OFF AIR for the run (Josh, Oct 31 2026: YouTube only, the licences). So
// the rig cannot ride a member's session, and the admin's is the wrong thing to leave in a kiosk.
// SURVIVORZ_STREAM_TOKEN is a shared secret the box sets (>= 24 characters); a request carrying it is
// the STREAM PRINCIPAL, which may:
//   · open /ws-survivorz (broadcast.ts) — even off air, never counted against MAX_WATCHERS;
//   · load the show's assets, effects and sounds (routes/survivorz-assets.ts, auth "watch");
//   · fetch a survivor's voiced line (routes/survivorz-show.ts, auth "watch");
//   · post the rig's heartbeat and read its standby card (src/survivorz/stream.ts).
// …and nothing else. It is never a User row and `userForToken` never resolves it, so every other
// route answers it 401 exactly as it would a garbage token. Unset (or short) = the whole thing is off.
//
// Import-free of the store and the router on purpose: http.ts and broadcast.ts both read it.
import { createHash, timingSafeEqual } from "node:crypto";
import type { User } from "../types";

export const STREAM_TOKEN_MIN = 24;

/** The configured secret, or null when the stream door is shut (unset or too short). Read on every
 *  call so a harness can set the env before boot without an import-order dance. */
function secret(): string | null {
  const s = process.env.SURVIVORZ_STREAM_TOKEN ?? "";
  return s.length >= STREAM_TOKEN_MIN ? s : null;
}

export function streamTokenConfigured(): boolean {
  return secret() !== null;
}

/** Timing-safe: both sides are hashed to the same length first, so neither the comparison nor a
 *  length check leaks how much of a guess was right. */
export function isStreamToken(candidate: string | null | undefined): boolean {
  const s = secret();
  if (!s || typeof candidate !== "string" || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(s).digest();
  return timingSafeEqual(a, b);
}

/** Who a stream-token request IS: no account, no admin, no Terms to accept. Only ever compared by
 *  identity (`isStreamPrincipal`); id 0 matches no row. */
export const STREAM_PRINCIPAL: User = Object.freeze({
  id: 0,
  username: "survivorz-stream",
  displayName: "Survivorz stream",
  passwordHash: "",
  isAdmin: false,
  isBot: true,
  role: "user",
  disabled: false,
  locked: false,
  suspendedUntil: null,
  createdAt: 0,
  diedAt: null,
  generation: 1,
  graveSealsAt: null,
  jailedAt: null,
  jailSealsAt: null,
}) as unknown as User;

export function isStreamPrincipal(u: unknown): boolean {
  return u === STREAM_PRINCIPAL;
}
