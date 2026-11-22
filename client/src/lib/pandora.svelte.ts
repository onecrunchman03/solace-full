// PANDORA'S BOX (Josh, Sep 2026 — PANDORA.md): my keys, the box, the
// ledger. The server grants keys through the achievement engine and tells
// me over the socket (chat.svelte.ts → applyPandoraKey); the page loads the
// whole state and reloads on the opening broadcast so the ledger is live.
import { api, ApiError, type PandoraState, type PandoraKeyId } from "./api";

export const KEY_LABEL: Record<PandoraKeyId, string> = {
  prismatic: "The Prismatic Key",
  brass: "The Brass Key",
  rusted: "The Rusted Key",
};

export const pandora = $state<{
  state: PandoraState | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;
}>({ state: null, loaded: false, busy: false, error: null });

export async function loadPandora(): Promise<void> {
  try {
    pandora.state = await api.pandora();
    pandora.loaded = true;
    pandora.error = null;
  } catch {
    pandora.error = "The box is out of reach for a moment.";
  }
}

/** Set a held key into its keyhole (idempotent server-side). */
export async function insertKey(key: PandoraKeyId): Promise<boolean> {
  if (pandora.busy) return false;
  pandora.busy = true;
  try {
    await api.pandoraInsert(key);
    await loadPandora();
    return true;
  } catch {
    pandora.error = "That key isn't yours to set.";
    return false;
  } finally {
    pandora.busy = false;
  }
}

/** THE OPENING. `choice` null = leave hope in the box. */
export async function openBox(choice: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (pandora.busy) return { ok: false, error: "busy" };
  pandora.busy = true;
  try {
    await api.pandoraOpen(choice);
    await loadPandora();
    return { ok: true };
  } catch (e) {
    const err = e instanceof ApiError ? e.code : "failed"; // ApiError has .code, never .body (Oct 2026 review)
    pandora.error =
      err === "choice_taken" ? "Somebody took that choice while you were deciding."
      : err === "keys_missing" ? "All three keys must be set first."
      : err === "already_opened" ? "You have already opened the box."
      : "The lid wouldn't move.";
    await loadPandora();
    return { ok: false, error: err };
  } finally {
    pandora.busy = false;
  }
}

/** A key landed over the socket: refresh if the page is up. */
export function applyPandoraKey(): void {
  if (pandora.loaded) void loadPandora();
}

export function resetPandora(): void {
  pandora.state = null;
  pandora.loaded = false;
  pandora.busy = false;
  pandora.error = null;
}
