// The house soundboard — one shared library (migration 73). Anyone can add a
// sound (per-user cap), everyone in a voice room can play any of them. The
// list lives here so the dock popup and the `soundboard.change` broadcast
// share one copy.

import { api, ApiError, type BoardSound } from "./api";

export const board = $state<{
  sounds: BoardSound[];
  max: number;
  mine: number;
  loaded: boolean;
}>({ sounds: [], max: 8, mine: 0, loaded: false });

export async function loadBoard(): Promise<void> {
  try {
    const r = await api.soundboard();
    board.sounds = r.sounds;
    board.max = r.max;
    board.mine = r.mine;
    board.loaded = true;
  } catch {
    /* best-effort */
  }
}

/** A `soundboard.change` broadcast — refetch only if we've ever loaded. */
export function handleBoardChange(): void {
  if (board.loaded) void loadBoard();
}

export async function addBoardSound(
  file: File,
  name: string,
  emoji: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.addBoardSound(file, name, emoji);
    board.sounds = r.sounds;
    board.mine = r.mine;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

export async function removeBoardSound(id: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await api.removeBoardSound(id);
    board.sounds = r.sounds;
    board.mine = r.mine;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.code : "error" };
  }
}

export function resetBoard(): void {
  board.sounds = [];
  board.mine = 0;
  board.loaded = false;
}
