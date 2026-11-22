// SOLACE SURVIVORZ — the show's big files, KEPT ON THIS MACHINE between watches (Nov 3 2026 — Josh: "do I
// really have to reload everything when watching it?").
//
// WHY THE BROWSER'S OWN CACHE DIDN'T: the asset door answers `private, no-cache` with an ETag, which is
// right, but a run is ~400 MB of files — the bunker's shell (76 MB), two lightmaps, a body per survivor
// (35-50 MB each) and per zombie model (20 MB) — and Chromium's HTTP cache (the desktop app's WebView2 is
// Chromium) refuses any entry bigger than an eighth of the whole cache and evicts by LRU across every site,
// so the big ones were downloaded again on every open. Here they go into the Cache Storage API instead
// (per origin, on this machine, no per-file cap), and every later open ASKS the server first with
// `If-None-Match`: the server still checks the session on every file (a 304 is only ever sent to somebody
// allowed the file), a re-bake is picked up (new ETag → a fresh 200), and nothing leaves the browser — the
// licensed files stay as private as the HTTP cache would have kept them (signing out empties the store:
// `dropAssetCache`, session.svelte.ts).
//
// A FILE THAT STALLS IS DROPPED AND ASKED FOR AGAIN: a download that stops sending bytes for `stallMs` is
// aborted and rejected (an HTTP/2 stream left hanging by a restart used to leave its promise pending
// forever — a body that never appeared, because a pending load is never retried).
//
// While the server can't answer at all (a restart for a deploy: a network error or a 5xx), a copy kept
// from an earlier watch is used rather than failing; a 401/403/404 is never answered from the store.
//
// No DOM and no three.js: the lightmap worker could import it (`caches` exists in a worker), and
// scripts/checks/test_survivorz_client.mjs drives it in Node against a real server and a stand-in store.

export const ASSET_CACHE = "survivorz-assets-v1";
/** a download that sends nothing for this long is aborted */
export const STALL_MS = 30_000;

export class FetchError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export interface BytesOpts {
  headers?: Record<string, string>;
  onProgress?: (frac: number) => void;
  stallMs?: number;
  /** keep the file on this machine (default true) */
  keep?: boolean;
  /** only make sure the store has it: a kept copy the server says is current isn't read (an early download
   *  asking about a file kept from last time) — the bytes come back empty then */
  peek?: boolean;
  /** a BIG file: it waits its turn among the big downloads (BIG_AT_ONCE at a time), lowest first — the
   *  first zone 0, a survivor 1, the dead 2. Unset: the page's small files, never queued behind a body */
  priority?: number;
}

/** what the server's answer means for a file kept from before (pure: the client checks drive it) */
export function useKept(status: number | "network"): boolean {
  return status === 304 || status === "network" || (typeof status === "number" && status >= 500);
}

/** a download under way, settled once its copy is in the store: a second asker for the same file waits
 *  for it and then reads the kept copy (one download, and no buffer shared between two loaders — one may
 *  hand its buffer to a worker, which detaches it) */
interface Run { done: Promise<void>; hear: Set<(f: number) => void> }
const inflight = new Map<string, Run>();

let store: Promise<Cache | null> | null = null;
/** the store refused a file (out of room, a broken profile): nothing is asked for early any more, since an
 *  early download nobody can keep is only downloaded again by the loader that wanted it */
let storeRefused = false;
function openStore(): Promise<Cache | null> {
  if (!store) {
    store = (typeof caches === "undefined" ? Promise.resolve(null) : caches.open(ASSET_CACHE)).catch(() => null);
  }
  return store;
}

/** The file's bytes: from this machine when the server says it hasn't changed, else downloaded (and kept). */
export async function cachedBytes(url: string, opts: BytesOpts = {}): Promise<ArrayBuffer> {
  const key = new URL(url, (globalThis as { location?: { href: string } }).location?.href).href;
  // (a waiter hears the download's progress: the zone loader counts a silent minute as a hang)
  for (let run = inflight.get(key); run; run = inflight.get(key)) {
    if (opts.onProgress) run.hear.add(opts.onProgress);
    await run.done;
    if (opts.onProgress) run.hear.delete(opts.onProgress);
  }
  let done!: () => void;
  const mine: Run = { done: new Promise<void>((r) => (done = r)), hear: new Set(opts.onProgress ? [opts.onProgress] : []) };
  inflight.set(key, mine);
  const settle = (): void => { if (inflight.get(key) === mine) inflight.delete(key); done(); };
  try {
    const { buf, stored } = await fetchBytes(key, { ...opts, onProgress: (f) => { for (const h of mine.hear) h(f); } });
    void stored.then(settle);
    return buf;
  } catch (e) {
    settle();
    throw e;
  }
}

/** how many big files download at once. A run is ~1 GB: all of it at once split the line thirty ways, and
 *  the bunker's shell — the one thing the picture can't do without — crawled until the zone loader called it
 *  a hang and started it again (measured: no zone in 100 s). In order instead, the zone lands first and each
 *  body after it lands as soon as it can. */
export const BIG_AT_ONCE = 3;
/** THE DEAD WAIT FOR THE PICTURE (Nov 13 2026, the review's H5: 21 s to a picture with every file already on
 *  this machine). Unpacking a body is seconds of the page's one thread, and the twenty of the dead were unpacked
 *  alongside the room and the six survivors the picture waits for. A file of this priority or later that is
 *  being LOADED (not only fetched into the store ahead of time) waits while the show holds them back, and takes
 *  its turn BIG_AT_ONCE at a time afterwards, so they come in on air a few at a time. */
export const LATE_PRI = 2;
let lateHeld = false, lateTimer: ReturnType<typeof setTimeout> | null = null;
/** hold the late files back (the show, while it loads) or let them go (the picture is up). A hold lets go by
 *  itself after `maxMs`: a load that never finishes must not keep the dead out for good. */
export function holdLate(on: boolean, maxMs = 60_000): void {
  lateHeld = on;
  if (lateTimer) { clearTimeout(lateTimer); lateTimer = null; }
  if (on) lateTimer = setTimeout(() => holdLate(false), maxMs);
  else nextTurn();
}
interface Turn { pri: number; seq: number; late: boolean; go: () => void }
const turns: Turn[] = [];
let bigRunning = 0, turnSeq = 0;
function nextTurn(): void {
  while (bigRunning < BIG_AT_ONCE) {
    let best = -1;
    for (let i = 0; i < turns.length; i++) {
      if (lateHeld && turns[i].late) continue;
      if (best < 0 || turns[i].pri < turns[best].pri || (turns[i].pri === turns[best].pri && turns[i].seq < turns[best].seq)) best = i;
    }
    if (best < 0) return;
    bigRunning++;
    turns.splice(best, 1)[0].go();
  }
}
/** wait for a big file's turn; the returned function hands the turn on (call it once) */
function turn(pri: number, late = false): Promise<() => void> {
  return new Promise((go) => {
    let given = false;
    turns.push({ pri, seq: turnSeq++, late, go: () => go(() => { if (given) return; given = true; bigRunning--; nextTurn(); }) });
    nextTurn();
  });
}

/** Start a big file downloading into the store (the show asks for the first zone and the cast's bodies while
 *  the effects load). Nothing without a store: a copy nobody can keep would only be downloaded twice. */
export function prefetchBytes(url: string, opts: BytesOpts = {}): void {
  if (typeof caches === "undefined" || storeRefused) return;
  void cachedBytes(url, { priority: 1, ...opts, peek: true }).catch(() => {});
}

const NOTHING = Promise.resolve();

async function fetchBytes(url: string, opts: BytesOpts): Promise<{ buf: ArrayBuffer; stored: Promise<void> }> {
  const keep = opts.keep !== false;
  const cache = keep ? await openStore() : null;
  const kept = cache ? await cache.match(url).catch(() => undefined) : undefined;
  // (a file already kept here costs the line nothing — a question and a read off the disk — so the room, the
  // survivors and the props don't queue three at a time behind each other for it; the late ones still take
  // turns, kept or not, so the dead are unpacked a few at a time)
  const late = opts.priority !== undefined && opts.priority >= LATE_PRI;
  const handOn = opts.priority === undefined || (kept && !late) ? null : await turn(opts.priority, late && !opts.peek);
  try {
    return await fetchNet(url, opts, cache, kept);
  } finally {
    handOn?.();
  }
}

async function fetchNet(url: string, opts: BytesOpts, cache: Cache | null, kept: Response | undefined): Promise<{ buf: ArrayBuffer; stored: Promise<void> }> {
  const etag = kept?.headers.get("etag") ?? null;
  const ctl = new AbortController();
  const stallMs = opts.stallMs ?? STALL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const poke = (): void => { if (timer) clearTimeout(timer); timer = setTimeout(() => ctl.abort(), stallMs); };
  const fromKept = async (): Promise<{ buf: ArrayBuffer; stored: Promise<void> }> => { const b = opts.peek ? new ArrayBuffer(0) : await kept!.arrayBuffer(); opts.onProgress?.(1); return { buf: b, stored: NOTHING }; };
  poke();
  let res: Response;
  try {
    // (no-store: the HTTP cache neither answers nor keeps a copy — it is this store's job, and a 76 MB
    // second copy in the HTTP cache would only push everything else out of it)
    res = await fetch(url, { headers: { ...(opts.headers ?? {}), ...(etag ? { "if-none-match": etag } : {}) }, cache: "no-store", signal: ctl.signal });
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (kept && useKept("network")) return fromKept();
    throw new FetchError(0, ctl.signal.aborted ? `stalled: ${url}` : `network: ${String((e as Error)?.message ?? e)}`);
  }
  if (res.status === 304 && kept) { if (timer) clearTimeout(timer); return fromKept(); }
  if (!res.ok) {
    if (timer) clearTimeout(timer);
    if (kept && useKept(res.status)) return fromKept();
    // a file we were told is gone or not ours any more isn't kept either
    if (cache && (res.status === 404 || res.status === 403)) void cache.delete(url).catch(() => {});
    throw new FetchError(res.status, `${res.status}: ${url}`);
  }
  // (a compressed answer's length is the compressed one: no progress, no length check)
  const total = res.headers.get("content-encoding") ? 0 : Number(res.headers.get("content-length")) || 0;
  let buf: Uint8Array;
  try {
    if (!res.body) { buf = new Uint8Array(await res.arrayBuffer()); }
    else {
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        poke();
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.byteLength;
        if (total) opts.onProgress?.(Math.min(1, got / total));
      }
      if (total && got !== total) throw new Error(`short: ${got} of ${total}`);
      if (parts.length === 1 && parts[0].byteOffset === 0 && parts[0].byteLength === parts[0].buffer.byteLength) buf = parts[0];
      else {
        buf = new Uint8Array(got);
        let at = 0;
        for (const part of parts) { buf.set(part, at); at += part.byteLength; }
      }
    }
  } catch (e) {
    const stalled = ctl.signal.aborted;
    ctl.abort();
    if (kept && useKept("network")) return fromKept();
    throw new FetchError(0, stalled ? `stalled: ${url}` : `download: ${String((e as Error)?.message ?? e)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  opts.onProgress?.(1);
  const tag = res.headers.get("etag");
  let stored = NOTHING;
  if (cache && tag) {
    // (the Blob takes its own copy of the bytes, so the caller may hand `buf` to a worker; a second asker
    // waiting on this download is let go once the copy is in, and finds it there)
    const copy = new Response(new Blob([buf as BlobPart]), { headers: { etag: tag, "content-type": res.headers.get("content-type") ?? "application/octet-stream" } });
    stored = cache.put(url, copy).catch(() => { storeRefused = true; /* out of room: it's downloaded again next time */ });
  }
  return { buf: buf.buffer as ArrayBuffer, stored };
}

/** `p`, or a rejection once `ms` has passed without it settling: a step that never comes back (a decode
 *  whose worker never answers, a compile) is turned into a failure the caller retries, never a promise
 *  pending for the rest of the watch */
export function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error(`timed out: ${what}`)), ms); });
  return Promise.race([p, late]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Forget every kept file (signing out: the next person on this machine shouldn't find them there). */
export async function dropAssetCache(): Promise<void> {
  store = null;
  storeRefused = false;
  if (typeof caches !== "undefined") await caches.delete(ASSET_CACHE).catch(() => false);
}
