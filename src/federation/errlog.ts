// FEDERATION F6 — the satellite error sweep (Josh: "have [error logs]
// automatically forward to the hub and be stored").
//
// The doctrine stands: the hub asks, the satellite answers. Every sweep the
// hub drains each LINKED satellite's queued errors over the existing RPC
// channel — no new inbound frame, nothing for the noise guard to weigh —
// and folds them into the deduped ledger (satellite_errors). The same pass
// prunes anything older than a year. Josh's cycle lives on top: export the
// new ones from Admin Panel → Satellites, hand them to a session for fixing,
// mark them processed; a signature that recurs AFTER its fix reopens.
import type { Store } from "../db/store";
import { heartbeat } from "../health";
import { connectedSatelliteIds, satelliteRpc } from "./link";

const SWEEP_MS = Number(process.env.SAT_ERR_SWEEP_MS || 10 * 60_000);

export async function sweepSatelliteErrors(store: Store): Promise<void> {
  for (const satId of connectedSatelliteIds()) {
    try {
      const raw = (await satelliteRpc(satId, "errors.drain", {}, 5_000)) as
        { errors?: unknown[]; upTo?: unknown } | null;
      // Hostile input: cap the batch, clamp every field, sanity the clock.
      const now = Date.now();
      const batch = (Array.isArray(raw?.errors) ? raw.errors : []).slice(0, 50);
      for (const e of batch) {
        const r = e as { at?: unknown; kind?: unknown; message?: unknown };
        // One line, always (Oct 2026 review): a host's newline started a line
        // of its own in the admin's TXT export — forged headers, and words
        // aimed at whoever reads the report.
        // eslint-disable-next-line no-control-regex
        const message = String(r.message ?? "").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 500);
        if (!message) continue;
        const at = Number(r.at);
        store.upsertSatelliteError(
          satId,
          // eslint-disable-next-line no-control-regex
          String(r.kind ?? "error").replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 40),
          message,
          // Bounded both ways: a far-past stamp pruned itself on the next
          // sweep (so the per-satellite cap wasn't one), a future one is a
          // lie (Sep 2026 review). A year is the retention window.
          Number.isFinite(at) && at >= now - 365 * 86_400_000 && at <= now + 60_000 ? at : now,
        );
      }
      // Drain PEEKS on 0.3.0+ daemons; the ack — sent only once the ledger
      // has the batch — is what purges the host's queue. A link that dies
      // between the two just redelivers next sweep (dedup absorbs it).
      // Pre-0.3 daemons deleted at drain and return no upTo: nothing to ack.
      const upTo = Math.floor(Number(raw?.upTo) || 0);
      if (batch.length && upTo > 0) {
        await satelliteRpc(satId, "errors.ack", { upTo }, 5_000).catch(() => {});
      }
    } catch {
      /* offline mid-sweep, or a pre-0.5 daemon (unknown_op) — next time */
    }
  }
  store.pruneSatelliteErrors();
}

export function startSatelliteErrorSweep(store: Store): void {
  setInterval(() => {
    heartbeat("satellite error sweep", SWEEP_MS);
    void sweepSatelliteErrors(store);
  }, SWEEP_MS).unref?.();
}
