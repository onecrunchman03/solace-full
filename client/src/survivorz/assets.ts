// SOLACE SURVIVORZ — loading the show's assets through the admin-only door
// (src/routes/survivorz-assets.ts). Everything is fetched with the session's
// bearer header, never a ?token= URL: a link carrying the token would BE the
// session, and these are bought assets that must not leak.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { getToken } from "../lib/api";
import { sfxContext, sfxOut } from "../lib/sfx";
import { cachedBytes, prefetchBytes, within } from "./assetcache";

export interface AssetFile {
  file: string;
  bytes: number;
  mtime: number;
}
export interface BodyFile extends AssetFile {
  id: string;
  kind: "survivor" | "zombie";
}
export interface SoundTake {
  file: string;
  variant?: number;
}
export interface SoundDef {
  group: string;
  kind: string;
  music: boolean;
  files: SoundTake[];
}
export interface SurvivorzIndex {
  bodies: BodyFile[];
  guns: AssetFile[];
  props: AssetFile[];
  sounds: { sounds: Record<string, SoundDef> } | null;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

export class AssetError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function fetchIndex(): Promise<SurvivorzIndex> {
  const res = await fetch("/api/survivorz/assets", { headers: authHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AssetError(res.status, data?.error ?? "error");
  return data as SurvivorzIndex;
}

export const assetUrl = (area: "body" | "pairclip" | "gun" | "prop" | "room" | "roomres" | "roomlabs" | "roommed" | "roomsec" | "roompow" | "roomcon" | "roomdeep" | "roombunker" | "roomglenground" | "roomglenupper" | "roomglenbasement" | "roomglenoutside" | "roomdecal", file: string): string =>
  `/api/survivorz/asset/${area}/${encodeURIComponent(file)}`;
/** An effects file under fx/, e.g. fxUrl("blood/splat-01.webp") — up to four
 *  segments deep (three folders and the file). */
export const fxUrl = (relPath: string): string =>
  `/api/survivorz/fx/${relPath.split("/").map(encodeURIComponent).join("/")}`;
export const soundUrl = (id: string, file: string): string =>
  `/api/survivorz/sound/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;

/** Load a packed GLB (meshopt-compressed, quantized) with the session header.
 *  The packed props (scripts/survivorz/pack-props.mjs) carry KTX2 textures, so
 *  call initCompressed(renderer) before loading one. The bytes come through
 *  ./assetcache.ts: kept on this machine between watches (asked for again with
 *  If-None-Match, so the server still checks the session and a re-bake is
 *  picked up), and a download that stalls is aborted and rejected rather than
 *  left pending forever. */
/** how long a GLB's decode may take before it counts as failed */
export const PARSE_MS = 90_000;

export async function loadGlb(url: string, onProgress?: (frac: number) => void, priority?: number): Promise<GLTF> {
  const buf = await cachedBytes(url, { headers: authHeaders(), onProgress, priority });
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (ktx2) loader.setKTX2Loader(ktx2);
  loader.setRequestHeader(authHeaders());
  // (the decode may wait on a worker — the KTX2 transcoder: one that never answers fails the load, which
  // is tried again, rather than leaving it pending for good)
  return within(loader.parseAsync(buf, url.slice(0, url.lastIndexOf("/") + 1)), PARSE_MS, url);
}

/** Start a big file downloading into the asset store (the first zone, the cast's bodies, while the effects
 *  load), at its place in the big files' queue (assetcache.ts BIG_AT_ONCE: 0 the zone, 1 a survivor, 2 the dead). */
export function prefetchAsset(url: string, priority: number): void {
  prefetchBytes(url, { headers: authHeaders(), priority });
}

export interface TextureOpts {
  /** "srgb" for colour and decal maps; "linear" for data — normals,
   *  roughness, flipbook data. Required on purpose: the wrong one is a
   *  silent washed-out or too-dark texture. */
  space: "srgb" | "linear";
  /** Flip vertically, the way three's TextureLoader does (UV 0,0 bottom-
   *  left). Default true. Pass false for a texture laid out glTF-style
   *  (0,0 top-left). Done by createImageBitmap — an ImageBitmap ignores
   *  texture.flipY, so the result always has flipY = false. */
  flipY?: boolean;
}

/** Load a PNG / WebP / JPEG with the session header (three's TextureLoader
 *  can't send one). For .ktx2 / .exr use KTX2Loader / EXRLoader with
 *  `setRequestHeader(authHeaders())` — they inherit it. The caller owns the
 *  texture and disposes it. */
export async function loadTexture(url: string, opts: TextureOpts): Promise<THREE.Texture> {
  const buf = await cachedBytes(url, { headers: authHeaders() }).catch((e: { status?: number }) => { throw new AssetError(e?.status ?? 0, "texture_failed"); });
  const bitmap = await createImageBitmap(new Blob([buf]), {
    imageOrientation: opts.flipY === false ? "none" : "flipY",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const tex = new THREE.Texture(bitmap);
  tex.flipY = false;
  tex.colorSpace = opts.space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** The session header, for loaders that take one (KTX2Loader, EXRLoader). */
export function sessionHeaders(): Record<string, string> {
  return authHeaders();
}

// ---- compressed textures (KTX2 / Basis) --------------------------------------
// One shared KTX2Loader: it runs transcoder workers, so making one per texture
// would start a pool each time. The transcoder is three's own, copied to
// client/public/basis/ (KTX2Loader loads it by fixed file name from a folder,
// which a hashed Vite asset can't give it). Keep that copy in step with the
// three version: cp client/node_modules/three/examples/jsm/libs/basis/basis_transcoder.* client/public/basis/
/** how many transcoder workers: the machine’s threads less two for the page and the GPU, between 4 and 8 */
export const KTX2_WORKERS = Math.max(4, Math.min(8, ((globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 4) - 2));
let ktx2: KTX2Loader | null = null;
let ktx2Renderer: THREE.WebGLRenderer | null = null;

/** Tell the loader which GPU formats this renderer can take. Call once per
 *  renderer before the first loadCompressed (or pass the renderer to it). */
export function initCompressed(renderer: THREE.WebGLRenderer): void {
  // (MORE HANDS, Nov 13 2026, the review’s H5: three’s pool is four transcoders whatever the machine has, and a zone’s
  // props wait on it — six seconds of the load with the page itself idle. Up to eight where the machine has them.)
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath("/basis/").setWorkerLimit(KTX2_WORKERS);
  if (ktx2Renderer !== renderer) {
    ktx2.detectSupport(renderer);
    ktx2Renderer = renderer;
  }
}

/** Load a .ktx2 (e.g. fxUrl("flipbooks/smoke-01.ktx2")) with the session
 *  header, transcoded to whatever the GPU takes (BC7 on desktop). The
 *  orientation is the file's own; the caller owns the texture. */
export async function loadCompressed(url: string, renderer?: THREE.WebGLRenderer): Promise<THREE.Texture> {
  if (renderer) initCompressed(renderer);
  if (!ktx2) throw new Error("initCompressed(renderer) first");
  const buf = await cachedBytes(url, { headers: authHeaders() });
  const loader = ktx2;
  return within(new Promise<THREE.Texture>((ok, fail) => loader.parse(buf, ok, fail)), PARSE_MS, url);
}

/** Stop the transcoder workers (a view leaving calls this). */
export function disposeCompressed(): void {
  ktx2?.dispose();
  ktx2 = null;
  ktx2Renderer = null;
}

const decoded = new Map<string, Promise<AudioBuffer>>();

/** Fetch + decode a sound with NO caching: a survivor's voiced line is a one-off (every `say` frame
 *  is its own URL), and decoded PCM is 1-2 MB a line — kept, thousands of lines a week were
 *  gigabytes of heap on a page that streams for a month. */
export async function fetchSound(url: string, keep = false): Promise<AudioBuffer> {
  const ctx = sfxContext();
  if (!ctx) throw new Error("no_audio");
  // (the fixed set is kept on this machine like the models, assetcache.ts; a voiced line is a one-off)
  const buf = await cachedBytes(url, { headers: authHeaders(), keep }).catch((e: { status?: number }) => { throw new AssetError(e?.status ?? 0, "sound_failed"); });
  return ctx.decodeAudioData(buf);
}

/** Fetch + decode a take once; later plays reuse the buffer (the sound engine,
 *  survivorz/audio/engine.ts, plays through this too). For the FIXED sound set only — a voice line
 *  goes through `fetchSound`. */
export function soundBuffer(url: string): Promise<AudioBuffer> {
  let p = decoded.get(url);
  if (!p) {
    p = fetchSound(url, true);
    decoded.set(url, p);
    p.catch(() => decoded.delete(url));
  }
  return p;
}

/** Play one take through the house mix (so the App-sounds slider applies). */
export async function playTake(id: string, file: string, gain = 0.8): Promise<AudioBufferSourceNode> {
  const buf = await soundBuffer(soundUrl(id, file));
  const ctx = sfxContext()!;
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(sfxOut() ?? ctx.destination);
  src.start();
  return src;
}

/** Forget every decoded take (the Watch page calls this on leaving). */
export function dropSoundCache(): void {
  decoded.clear();
}
