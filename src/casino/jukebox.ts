// THE JUKEBOX — the casino's record player (Josh, Aug 2026).
//
// A shared, server-owned playhead: one song is playing for the whole hall at
// one position, and every client seeks to that position rather than starting
// its own copy at zero. Nothing about the AUDIO is decided here — the wire
// carries a filename and how far in we are, and the floor does the rest.
//
// Where the money is (and isn't). Queueing a pick costs QUEUE_PRICE silver and
// that silver is BURNED — the same shape as every other service counter in the
// house (the Vault's buy-in, a bought spin), and the reason the Wheel stays the
// only faucet. It is charged in the ROUTE, through the guarded spendCoins path,
// never on the /ws-casino relay: the socket is presentation, exactly as
// CASINO.md says, and a wire that can't move money can't lose any.
//
// NOTHING PLAYS UNLESS SOMEBODY PUT IT ON (Josh, Aug 2026 — the first cut had
// the house shuffling for free between paid picks, and he wanted the machine
// silent instead). An empty queue is an empty room: the last record ends and
// the casino goes quiet until the next person spends. So the price buys the
// music, not merely the choice of it.
//
// THE CLOCK ONLY RUNS WHEN SOMEBODY IS IN THE ROOM. An empty hall parks the
// playhead instead of burning through the queue, so a pick someone paid for is
// still there when they walk back in.

import type { Store } from "../db/store";
import type { Bus } from "../bus";
import type { JukeboxSong } from "../types";
import { heartbeat } from "../health";

/** What a pick costs, in silver. Burned — see the header. */
export const QUEUE_PRICE = 60;
/** What a VOTE to skip costs (Josh, Aug 2026). Also burned. A free vote is a
 *  free veto: at 40% of a small floor, two people who don't like a song could
 *  bin somebody's 60 silver at no cost to themselves. Twenty makes skipping a
 *  thing you'd rather agree about. Charged once per voter per record — a
 *  repeated vote is refused, not re-billed. */
export const SKIP_PRICE = 20;
/** Share of the people actually on the floor needed to skip. Josh's number. */
export const SKIP_SHARE = 0.4;
/** Nobody may stack more than this many pending picks at once. The price is
 *  the real throttle; this only stops one wallet owning the whole evening. */
export const MAX_PER_USER = 3;
const MAX_QUEUE = 12;
const TICK_MS = 2000;
/** Gap after a song before the next one starts — a jukebox changes records. */
const CHANGE_MS = 1200;

export interface JukeboxEntry {
  id: number;
  title: string;
  artist: string;
  durationMs: number;
  /** Who paid for it — null when the house picked it (free shuffle). */
  by: string | null;
  byId: number | null;
}

export interface JukeboxStateDTO {
  now:
    | (JukeboxEntry & {
        file: string;
        /** Milliseconds into the track AT THE MOMENT THIS WAS SENT. Deliberately
         *  relative: an absolute start time would be read against the client's
         *  own clock, and browsers are seconds apart. */
        posMs: number;
      })
    | null;
  queue: JukeboxEntry[];
  /** Votes to skip the current record, and how many are needed right now. */
  votes: number;
  need: number;
  /** How many people are on the floor (what `need` is a share of). */
  listeners: number;
  price: number;
  skipPrice: number;
}

/** What the jukebox needs to know about the room. Injected rather than
 *  imported, so this module never depends on the socket layer. */
export interface FloorRoster {
  count(): number;
  ids(): number[];
}

export interface Jukebox {
  bindFloor(roster: FloorRoster): void;
  state(): JukeboxStateDTO;
  /** Everything a player may pick from. */
  library(): JukeboxSong[];
  /** Why this pick can't be made, or null if it can. Checked BEFORE the wallet
   *  is touched — the charge is the last thing that happens. */
  refuseReason(userId: number, songId: number): string | null;
  enqueue(userId: number, name: string, songId: number): JukeboxStateDTO;
  /** Why this vote can't be cast, or null. Checked BEFORE the wallet, and it
   *  is what stops a second vote from the same person being billed again. */
  refuseVoteReason(userId: number): string | null;
  voteSkip(userId: number, name: string): { ok: boolean; skipped: boolean; state: JukeboxStateDTO };
  /** The room's population changed — start the music, or park it. */
  poke(): void;
  stop(): void;
}

export function createJukebox(store: Store, bus: Bus): Jukebox {
  let roster: FloorRoster = { count: () => 0, ids: () => [] };
  let now: (JukeboxEntry & { file: string; startedAt: number }) | null = null;
  let nextAt = 0; // when the current record ends
  const queue: JukeboxEntry[] = [];
  let votes = new Set<number>();

  const entry = (s: JukeboxSong, by: string | null, byId: number | null): JukeboxEntry => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    durationMs: s.durationMs,
    by,
    byId,
  });

  const needed = (): number => Math.max(1, Math.ceil(roster.count() * SKIP_SHARE));

  const state = (): JukeboxStateDTO => ({
    now: now ? { ...now, posMs: Math.max(0, Date.now() - now.startedAt) } : null,
    queue: queue.map((q) => ({ ...q })),
    votes: votes.size,
    need: needed(),
    listeners: roster.count(),
    price: QUEUE_PRICE,
    skipPrice: SKIP_PRICE,
  });

  const publish = (): void => bus.emit("jukebox.state", { state: state() });

  function play(e: JukeboxEntry, file: string): void {
    now = { ...e, file, startedAt: Date.now() };
    nextAt = now.startedAt + e.durationMs + CHANGE_MS;
    votes = new Set();
    store.bumpJukeboxPlays(e.id);
  }

  /** Move to the next record. Returns false when the queue is empty — which
   *  means SILENCE, not a house pick: nothing plays that nobody paid for. */
  /** Park the record that's playing: back to the FRONT of the queue (Oct 2026
   *  review — clearing `now` alone threw away a paid pick whenever the hall
   *  emptied, a lone listener's page refresh included). It starts again from
   *  the top when somebody's back. */
  function park(): void {
    if (!now) return;
    const { file: _f, startedAt: _s, ...e } = now;
    queue.unshift(e);
    now = null;
  }

  function advance(): boolean {
    while (queue.length) {
      const next = queue.shift()!;
      const song = store.jukeboxSong(next.id);
      if (!song) continue; // deleted from the library while it waited
      play(entry(song, next.by, next.byId), song.file);
      return true;
    }
    now = null;
    return false;
  }

  const timer = setInterval(() => {
    heartbeat("jukebox", TICK_MS * 4);
    const listeners = roster.count();
    if (!listeners) {
      // Park it. The queue survives — somebody paid for those, and so does
      // the record that was playing.
      if (now) {
        park();
        publish();
      }
      return;
    }
    // People left; their votes leave with them.
    if (votes.size) {
      const here = new Set(roster.ids());
      const before = votes.size;
      votes = new Set([...votes].filter((id) => here.has(id)));
      if (votes.size !== before && now) {
        if (votes.size >= needed()) advance();
        publish();
        return;
      }
    }
    if (!now || Date.now() >= nextAt) {
      if (advance()) publish();
      else if (now === null && nextAt !== 0) {
        nextAt = 0;
        publish();
      }
    }
  }, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();

  return {
    bindFloor(r) {
      roster = r;
    },
    state,
    library: () => store.jukeboxSongs(),
    refuseReason(userId, songId) {
      if (queue.length >= MAX_QUEUE) return "queue_full";
      if (queue.filter((q) => q.byId === userId).length >= MAX_PER_USER) return "your_limit";
      if (queue.some((q) => q.id === songId)) return "already_queued";
      if (now && now.id === songId) return "already_playing";
      if (!store.jukeboxSong(songId)) return "no_song";
      return null;
    },
    enqueue(userId, name, songId) {
      const song = store.jukeboxSong(songId);
      if (song) {
        queue.push(entry(song, name, userId));
        // A paid pick in a silent room starts it — you shouldn't have to walk
        // out and back in to hear what you just bought.
        if (!now && roster.count()) advance();
      }
      publish();
      return state();
    },
    refuseVoteReason(userId) {
      if (!now) return "nothing_playing";
      if (votes.has(userId)) return "already_voted";
      // "40% of the people ACTUALLY ON THE FLOOR" — a vote from the hub
      // counted toward a quorum it wasn't part of, and the tick only pruned
      // it after advance() had already run (Sep 2026 review).
      if (!roster.ids().includes(userId)) return "not_on_floor";
      return null;
    },
    voteSkip(userId) {
      if (!now) return { ok: false, skipped: false, state: state() };
      votes.add(userId);
      const skipped = votes.size >= needed();
      if (skipped) advance();
      publish();
      return { ok: true, skipped, state: state() };
    },
    poke() {
      const listeners = roster.count();
      if (listeners && !now) {
        if (advance()) publish();
      } else if (!listeners && now) {
        park();
        publish();
      } else {
        publish();
      }
    },
    stop() {
      clearInterval(timer);
    },
  };
}
