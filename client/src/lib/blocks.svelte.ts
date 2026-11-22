// Per-user blocks. Server-enforced where contact is targeted (DMs, trade
// offers); in public channels the client collapses a blocked author's
// messages instead — public rooms stay public.

import { api } from "./api";

export const blocks = $state<{ ids: number[]; loaded: boolean }>({ ids: [], loaded: false });

export function isBlocked(userId: number): boolean {
  return blocks.ids.includes(userId);
}

export async function loadBlocks(): Promise<void> {
  try {
    const r = await api.blocks();
    blocks.ids = r.blocked;
    blocks.loaded = true;
  } catch {
    /* best-effort */
  }
}

export async function toggleBlock(userId: number): Promise<void> {
  try {
    const r = isBlocked(userId) ? await api.unblockUser(userId) : await api.blockUser(userId);
    blocks.ids = r.blocked;
  } catch {
    /* leave state as-is */
  }
}

export function resetBlocks(): void {
  blocks.ids = [];
  blocks.loaded = false;
}
