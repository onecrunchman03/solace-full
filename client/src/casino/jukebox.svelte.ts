// THE JUKEBOX's client state — what's playing, what's queued, and this
// listener's own volume.
//
// The playing state arrives on the floor socket (CasinoGame pushes it in);
// the LIBRARY and every action are ordinary authenticated HTTP, because
// queueing a record costs silver and money never rides the relay.

import { api, ApiError } from "../lib/api";
import type { JukeState } from "./net";
import { setMusic, setMusicMuted, setMusicVolume } from "./music";
import { prefs } from "../lib/prefs.svelte";
import { wallet } from "../lib/wallet.svelte";

export interface JukeSong {
  id: number;
  title: string;
  artist: string;
  durationMs: number;
  plays: number;
}

export const juke = $state({
  state: null as JukeState | null,
  library: [] as JukeSong[],
  price: 60,
  skipPrice: 20,
  loading: false,
  /** Set while a queue call is in flight, so the button can't double-fire. */
  busy: false,
  msg: "",
  /** This listener's own settings — mirrored out of prefs so the slider has
   *  something to bind to before the account's prefs land. */
  volume: 0.5,
  muted: false,
});

/** Read the account's stored preference. Called on entering the floor. */
export function adoptJukeboxPrefs(): void {
  juke.volume = prefs.jukebox.volume;
  juke.muted = prefs.jukebox.muted;
  setMusicVolume(juke.volume);
  setMusicMuted(juke.muted);
}

/** The floor socket handed us new state (or the welcome frame did). */
export function applyJukeState(s: JukeState | null): void {
  juke.state = s;
  if (s) {
    juke.price = s.price;
    juke.skipPrice = s.skipPrice;
  }
  setMusic(s?.now ? { ...s.now } : null);
}

export async function loadJukebox(): Promise<void> {
  juke.loading = true;
  try {
    const r = await api.jukebox();
    juke.library = r.library;
    juke.price = r.price;
    juke.skipPrice = r.skipPrice;
    // Don't touch the audio here: the socket is the authority on the
    // playhead, and this response is a few hundred ms stale by arrival.
    if (!juke.state) juke.state = r.state;
  } catch {
    juke.msg = "the jukebox isn't answering";
  }
  juke.loading = false;
}

export async function queueSong(songId: number): Promise<void> {
  if (juke.busy) return;
  juke.busy = true;
  juke.msg = "";
  try {
    const r = await api.jukeboxQueue(songId);
    juke.state = r.state;
    wallet.coins = r.coins;
    juke.msg = "queued — it's on after the current record";
  } catch (e) {
    const err = e instanceof ApiError ? e.code : ""; // ApiError has .code, never .body (Oct 2026 review)
    juke.msg =
      err === "insufficient"
        ? `you need ${juke.price} silver`
        : err === "already_queued"
          ? "that one's already coming up"
          : err === "already_playing"
            ? "that's what's playing"
            : err === "your_limit"
              ? "you've got enough lined up — let someone else pick"
              : err === "queue_full"
                ? "the queue is full"
                : "the jukebox refused that";
  }
  juke.busy = false;
}

export async function voteSkipSong(): Promise<void> {
  if (juke.busy) return;
  juke.busy = true;
  juke.msg = "";
  try {
    const r = await api.jukeboxSkip();
    juke.state = r.state;
    wallet.coins = r.coins;
    juke.msg = r.skipped ? "skipped" : `vote counted — ${r.state.votes}/${r.state.need}`;
  } catch (e) {
    const err = e instanceof ApiError ? e.code : ""; // ApiError has .code, never .body (Oct 2026 review)
    juke.msg =
      err === "insufficient"
        ? `a vote costs ${juke.skipPrice} silver`
        : err === "already_voted"
          ? "you've already voted on this one"
          : "there's nothing playing to skip";
  }
  juke.busy = false;
}

export function setJukeVolume(v: number): void {
  juke.volume = Math.max(0, Math.min(1, v));
  setMusicVolume(juke.volume);
  prefs.jukebox.volume = juke.volume;
  void api.updatePrefs({ jukebox: { volume: juke.volume } }).catch(() => {});
}

export function setJukeMuted(m: boolean): void {
  juke.muted = m;
  setMusicMuted(m);
  prefs.jukebox.muted = m;
  void api.updatePrefs({ jukebox: { muted: m } }).catch(() => {});
}

export function resetJukebox(): void {
  juke.state = null;
  juke.msg = "";
  juke.busy = false;
}
