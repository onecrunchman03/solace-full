// THE JUKEBOX, heard. The server owns WHAT is playing and HOW FAR IN; this
// owns how loud it is where you're standing.
//
// An <audio> element, not a decoded AudioBuffer: a five-minute MP3 decodes to
// well over a hundred megabytes of float samples, and the element streams and
// seeks instead (which is also why /music serves byte ranges). It goes through
// Web Audio anyway — element → our gain → the app's master — so the room's
// distance falloff and the Settings sound slider both apply.
//
// SYNC WITHOUT TRUSTING CLOCKS. The wire carries `posMs`, how far into the
// record the server was when it sent the frame, never an absolute start time:
// browser clocks are seconds apart from each other, and a shared playhead read
// against a wrong clock is worse than no sync at all. The local anchor is
// performance.now(), so the only error is network latency.

import { musicLevelAt } from "./layout";
import { sfxContext, sfxOut } from "../lib/sfx";

/** Loudest the music can ever be, at the machine itself, with the listener's
 *  own volume at maximum. Deliberately well under 1 — Josh: "make sure the
 *  sound is not incredibly loud". This is background music in a room full of
 *  other noises, not a set of headphones. */
const MAX_GAIN = 0.55;
/** Correct the playhead when it drifts further than this from the server's. */
const DRIFT_S = 1.6;

export interface MusicNow {
  id: number;
  file: string;
  posMs: number;
  title: string;
  artist: string;
}

let el: HTMLAudioElement | null = null;
let src: MediaElementAudioSourceNode | null = null;
let gain: GainNode | null = null;
// SLORP's spectral warp (see setMusicWarp): a filter + tremolo stage between
// the element and the room gain. Built with the chain and left transparent —
// a wide-open lowpass at unity is a wire, so sober costs nothing audible.
let warpFilter: BiquadFilterNode | null = null;
let warpTrem: GainNode | null = null;
let songId = 0;
/** performance.now() when the current record was at position `anchorPos`. */
let anchorAt = 0;
let anchorPos = 0;
let volume = 0.5;
let muted = false;
let blocked = false; // the browser refused to start audio without a gesture
let retryHooked = false;

function ensure(): boolean {
  const ctx = sfxContext();
  const out = sfxOut();
  if (!ctx || !out) return false;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.loop = false;
  }
  if (!src) {
    try {
      src = ctx.createMediaElementSource(el);
      gain = ctx.createGain();
      gain.gain.value = 0;
      warpFilter = ctx.createBiquadFilter();
      warpFilter.type = "lowpass";
      warpFilter.frequency.value = 20000;
      warpFilter.Q.value = 0.7;
      warpTrem = ctx.createGain();
      warpTrem.gain.value = 1;
      src.connect(warpFilter);
      warpFilter.connect(warpTrem);
      warpTrem.connect(gain);
      gain.connect(out);
    } catch {
      return false; // an element can only ever be adopted once
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return true;
}

/** Autoplay policy: without a gesture the first play() is refused. Rather than
 *  nag, wait for the next thing the player does — in here that's within a
 *  second or two, since you have to click to take the pointer. */
function hookRetry(): void {
  if (retryHooked || typeof window === "undefined") return;
  retryHooked = true;
  const go = (): void => {
    if (!blocked || !el) return;
    void sfxContext()?.resume();
    void el.play().then(
      () => {
        blocked = false;
      },
      () => {},
    );
  };
  window.addEventListener("pointerdown", go, { passive: true });
  window.addEventListener("keydown", go, { passive: true });
}

/** Apply what the server says the hall is listening to. Safe to call with the
 *  same record repeatedly — only a CHANGE re-seeks. */
export function setMusic(now: MusicNow | null): void {
  if (!now) {
    songId = 0;
    if (el && !el.paused) el.pause();
    return;
  }
  if (!ensure() || !el) return;
  const startAt = now.posMs / 1000;
  if (now.id !== songId) {
    songId = now.id;
    el.src = `/music/${now.file}`;
    // A fresh element can't be sought until it knows its own duration.
    const seek = (): void => {
      try {
        el!.currentTime = Math.max(0, startAt);
      } catch {
        /* not seekable yet — the drift check will catch it */
      }
    };
    if (el.readyState >= 1) seek();
    else el.addEventListener("loadedmetadata", seek, { once: true });
  }
  anchorAt = performance.now();
  anchorPos = startAt;
  hookRetry();
  void el.play().then(
    () => {
      blocked = false;
    },
    () => {
      blocked = true;
    },
  );
}

/** Where the server's playhead is now, in seconds. */
function expectedPos(): number {
  return anchorPos + (performance.now() - anchorAt) / 1000;
}

/** The last gain target actually scheduled, so a still listener costs no
 *  automation events (Aug 2026 perf review — this ran a setTargetAtTime per
 *  FRAME, unconditionally, for the life of the module). */
let lastWant = -1;
/** Drift is a seconds-scale error; checking it 4×/s is plenty, and the
 *  media-element property reads (paused/readyState/seekable) cross into the
 *  browser's media pipeline — not free at 60Hz. */
let nextDriftCheck = 0;

/** Per-frame: where the listener is standing. Cheap — nine distances. */
export function tickMusic(x: number, y: number): void {
  if (!gain || !el) return;
  const ctx = sfxContext();
  if (!ctx) return;
  const want = muted ? 0 : musicLevelAt(x, y) * volume * MAX_GAIN;
  // Ramp rather than jump: a per-frame gain assignment zippers — and only
  // re-schedule when the target actually moved.
  if (Math.abs(want - lastWant) > 0.004) {
    lastWant = want;
    gain.gain.setTargetAtTime(want, ctx.currentTime, 0.08);
  }
  // Keep the playhead honest. Buffering, a background tab or a slow seek all
  // pull it off the room's clock.
  const now = performance.now();
  if (now >= nextDriftCheck) {
    nextDriftCheck = now + 250;
    if (songId && !el.paused && el.readyState >= 2) {
      const drift = el.currentTime - expectedPos();
      if (Math.abs(drift) > DRIFT_S && el.seekable.length) {
        try {
          el.currentTime = Math.max(0, expectedPos());
        } catch {
          /* mid-load; try again next check */
        }
      }
    }
  }
}

/**
 * Bend the record WITHOUT touching its playback rate. SLORP only (Aug 2026).
 *
 * The first cut dragged playbackRate below 1 (`setMusicRate`) — the tape-drag
 * sound — but the drift check above exists precisely to keep this element on
 * the server's playhead, so a slowed record fell steadily behind and got
 * yanked forward every couple of seconds: the music audibly SKIPPED (Josh's
 * report). The record keeps time now; the trip lives in the filter cutoff,
 * its resonance, and a tremolo — the curve itself is pure and lives in
 * slorp.ts (`slorpMusicWarp`) where the harness can hold it.
 *
 * Called per-frame while tripping; `setTargetAtTime` smooths the steps.
 */
let lastWarpAt = 0;
let pendingWarp: { cutoffHz: number; q: number; trem: number } | null = null;
let warpTimer: ReturnType<typeof setTimeout> | null = null;
export function setMusicWarp(w: { cutoffHz: number; q: number; trem: number }): void {
  if (!warpFilter || !warpTrem) return;
  // ON A CLOCK, NOT PER FRAME (Sep 2026 review): the slorp pass called this
  // 60×/s for the length of a trip. A call inside the window is HELD and
  // flushed when the window ends, so the final "sober" value can never be
  // the one that gets dropped.
  const t = performance.now();
  if (t - lastWarpAt < 80) {
    pendingWarp = w;
    if (!warpTimer) {
      warpTimer = setTimeout(() => {
        warpTimer = null;
        const p = pendingWarp;
        pendingWarp = null;
        if (p) setMusicWarp(p);
      }, Math.max(1, 80 - (t - lastWarpAt)));
    }
    return;
  }
  lastWarpAt = t;
  pendingWarp = null;
  const ctx = sfxContext();
  if (!ctx) return;
  warpFilter.frequency.setTargetAtTime(w.cutoffHz, ctx.currentTime, 0.06);
  warpFilter.Q.setTargetAtTime(w.q, ctx.currentTime, 0.1);
  warpTrem.gain.setTargetAtTime(w.trem, ctx.currentTime, 0.05);
}

export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}

export function setMusicMuted(m: boolean): void {
  muted = m;
  if (m && el && !el.paused) el.pause();
  else if (!m && songId && el && el.paused) {
    try {
      el.currentTime = Math.max(0, expectedPos());
    } catch {
      /* it'll drift-correct */
    }
    void el.play().catch(() => {
      blocked = true;
    });
  }
}

/** True while the browser is refusing to start audio without a gesture — the
 *  panel offers a button rather than leaving the room silently quiet. */
export function musicBlocked(): boolean {
  return blocked;
}

/** Leaving the floor. The element is kept (a MediaElementSource can only be
 *  made once per element) but silenced and detached from any record. */
export function stopMusic(): void {
  songId = 0;
  if (el) {
    el.pause();
    el.removeAttribute("src");
    el.load();
  }
  if (gain) gain.gain.value = 0;
}
