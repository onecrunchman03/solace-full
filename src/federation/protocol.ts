// FEDERATION protocol constants + the pieces BOTH sides must agree on
// byte-for-byte (FEDERATION.md is the design authority). The hub imports
// this for verification; the satellite daemon imports it for signing —
// one module, so the signed payload can never drift between them.

/** The daemon's own version, stamped into every handshake.
 *  0.2.0 = F3: attachment files, search, rotation keys. */
export const SATELLITE_VERSION = "0.3.6";

/** The hub refuses anything older — bumping this is how updates enforce
 *  themselves (FEDERATION.md: the version gate). 0.1.0 daemons still link:
 *  they just answer the F3 ops with unknown_op, which the hub's routes turn
 *  into honest refusals (files stay hub-served, search skips them). */
export const MIN_SATELLITE_VERSION = "0.1.0";

/** One raw file chunk per RPC frame, base64'd on the wire — sized so the
 *  encoded frame stays comfortably under the link's 512KB maxPayload. */
export const FILE_CHUNK_BYTES = 300_000;

/** The transport ceiling both sides enforce (the hub's WSS maxPayload). */
export const LINK_MAX_PAYLOAD = 512 * 1024;

/** Handshake replies must arrive this fast, and their timestamp must sit
 *  within the skew window (replay refusal). */
export const HELLO_TIMEOUT_MS = 10_000;
export const TS_SKEW_MS = 120_000;

/** Heartbeat: hub pings; a satellite that misses two is presumed dead. */
export const HEARTBEAT_MS = 30_000;

/** The exact string an Ed25519 signature covers. Versioned prefix so a
 *  future protocol can change the shape without ambiguity. */
export function helloPayload(nonce: string, satelliteId: number, version: string, ts: number): string {
  return `solace-sat1:${nonce}:${satelliteId}:${version}:${ts}`;
}

/** F4 auto-update: the string a satellite signs to fetch its update manifest
 *  + package — the installer is MEMBER-gated for humans, so machines prove
 *  they're a REGISTERED satellite instead (same identity, different door).
 *  Timestamped like the hello; the TTL covers a slow package download. */
export function updatePayload(satelliteId: number, ts: number): string {
  return `solace-satupd:${satelliteId}:${ts}`;
}
export const UPDATE_TOKEN_TTL_MS = 10 * 60_000;

/** Dotted-numeric compare ("0.10.2" > "0.9.9"). Non-numeric segments read
 *  as 0 — a garbage version can only ever look OLD, never new. */
export function versionAtLeast(v: string, min: string): boolean {
  const a = String(v).split(".").map((s) => parseInt(s, 10) || 0);
  const b = String(min).split(".").map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
