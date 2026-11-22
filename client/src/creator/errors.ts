// THE CREATOR'S ERRORS, IN WORDS (Nov 11 2026 review): the server answers with short codes; the panel used to
// show them raw ("in_use", "gone"). The server's own sentence wins when it sent one.
import { ApiError } from "../lib/api";

const PLAIN: Record<string, string> = {
  in_use: "Somebody is using it.",
  name_taken: "That name is taken.",
  gone: "It's gone: it expired or was removed.",
  not_found: "It isn't there any more.",
  deleted: "That character was deleted.",
  not_paused: "It isn't paused.",
  baking: "It's baking right now.",
  not_baking: "It isn't baking.",
  not_running: "It isn't baking or waiting.",
  not_ready: "It has to finish baking first.",
  game_running: "A game has the GPU. It carries on when the game closes.",
  too_large: "That file is too big.",
  not_audio: "That isn't an MP3 or a WAV.",
  bad_name: "Name it 2-40 characters: a-z, 0-9 and -.",
  rate_limited: "Too fast. Try again in a moment.",
  unauthorized: "You're signed out. Sign in again.",
  forbidden: "Only the admin can do that.",
};
export function plain(e: unknown, fallback = "That didn't work."): string {
  if (e instanceof ApiError) {
    if (e.code === "in_use" && e.data?.name) return `${e.data.name} is using it.`;
    if (e.message && e.message !== e.code) return e.message;
    return PLAIN[e.code] ?? (e.status >= 500 ? "The server didn't answer. Try again." : fallback);
  }
  return e instanceof Error && e.message ? e.message : fallback;
}
