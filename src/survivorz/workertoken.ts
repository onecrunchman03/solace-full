// SOLACE SURVIVORZ — THE CREATOR WORKER'S TOKEN (docs/survivorz/CREATOR.md).
//
// The character creator's heavy work (re-posing a model, putting the whole clip library on it,
// checking every clip) runs on Josh's PC, not on this server. The worker there
// (scripts/survivorz/creator/worker.mjs) takes queued bodies, reports each step, and sends the
// packed body back into game/. SURVIVORZ_WORKER_TOKEN is the secret it carries (>= 24 characters).
// It is its own token, not the stream token: the stream rig only ever READS the show's assets,
// and this one writes body files. A request carrying it may use the /api/survivorz/worker/*
// routes and nothing else. Unset (or short) = the door is shut.
import { createHash, timingSafeEqual } from "node:crypto";

export const WORKER_TOKEN_MIN = 24;

function secret(): string | null {
  const s = process.env.SURVIVORZ_WORKER_TOKEN ?? "";
  return s.length >= WORKER_TOKEN_MIN ? s : null;
}

export function workerTokenConfigured(): boolean {
  return secret() !== null;
}

/** Timing-safe: both sides hashed to the same length first. */
export function isWorkerToken(candidate: string | null | undefined): boolean {
  const s = secret();
  if (!s || typeof candidate !== "string" || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(s).digest();
  return timingSafeEqual(a, b);
}
