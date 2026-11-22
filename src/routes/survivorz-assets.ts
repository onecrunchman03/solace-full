// SOLACE SURVIVORZ — the asset door (SURVIVORZ.md §13: the Watch page is built
// alongside the facility map).
//
// The show's bodies, guns and sounds are BOUGHT or licensed (Mixamo, the
// Synapse gun pack, Freesound), so none of them may sit under the public
// /assets dir where anybody with the URL could take them. They live in the
// gitignored assets/downloads/survivorz tree and stream from here, ADMIN-only
// until the show is built and validated (the Watch page is the operator's
// bench, not a member's view yet).
//
// Rules, in the order they are checked:
//   · every path is an AREA from a fixed list plus a bare file name — no
//     slashes, no leading dot, nothing the area's extension list doesn't name;
//   · the resolved path must still be inside the area's directory;
//   · a missing tree is an honest 404 "not_available" (prod has none of it).
// The bodies are re-baked while the animation work goes on, so nothing here
// is cached as immutable: `no-cache` + an ETag from size and mtime, so a
// browser revalidates and a re-bake is picked up on the next load.
import fs from "node:fs";
import path from "node:path";
import { json, type Router } from "../http";
import { config } from "../config";
import { mergedPairs, pairClipFile } from "./survivorz-pairs";

/** WHO MAY LOAD THE SHOW'S ASSETS. The admin always; a member only while the show is ON AIR (Josh,
 *  Oct 27 2026: the Solace-only broadcast is an ON AIR band, and every watcher's own client draws the
 *  show, so it needs the bodies, rooms and sounds). Never public: the zombie pack and the mocap may not
 *  be redistributed (SURVIVORZ.md §12 "Licences"), so it stays behind a Solace login. The broadcast
 *  installs the real gate at boot (index.ts); until then it is the admin's alone. */
// (auth "watch": the stream rig's token reaches the four show doors too: index.ts's gate admits it)
let showGate: (u: { isAdmin?: boolean }) => boolean = (u) => u.isAdmin === true;
export function setSurvivorzShowGate(fn: (u: { isAdmin?: boolean }) => boolean): void { showGate = fn; }

/** Where the character creator's bodies go (src/routes/survivorz-bodies.ts): under the data dir, the
 *  only place the hardened service may write (deploy/solace.service ReadWritePaths). Its game/ is a
 *  second shelf beside the tree's, and its cal.json the creator bodies' gun seats. */
export function creatorRoot(): string {
  return path.resolve(process.env.SURVIVORZ_CREATOR_DIR || path.join(config.dataDir, "survivorz-creator"));
}

/** Where the gitignored tree lives. Env so a harness can point at fixtures. */
export function survivorzRoot(): string {
  return path.resolve(process.env.SURVIVORZ_ASSETS || "./assets/downloads/survivorz");
}

interface Area {
  dir: string;
  ext: readonly string[];
  type: (ext: string) => string;
}

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".ogg": "audio/ogg",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".exr": "image/x-exr",
};
const typeOf = (ext: string): string => TYPES[ext] ?? "application/octet-stream";

/** The only places this door opens onto. A new folder is a new line here. */
export const AREAS: Record<string, Area> = {
  body: { dir: "game", ext: [".glb"], type: typeOf },
  gun: { dir: "props/guns", ext: [".glb", ".json"], type: typeOf },
  guntex: { dir: "props/guns/tex", ext: [".png", ".jpg", ".webp"], type: typeOf },
  prop: { dir: "props", ext: [".glb"], type: typeOf },
  // the props' catalogue (props.json): sizes and each hand-held thing's GRIP (scripts/survivorz/prop-grips.mjs),
  // which the show's character controller hangs a held prop by. Its own area so the prop listing stays .glb only
  propinfo: { dir: "props", ext: [".json"], type: typeOf },
  // the dressed rooms (scripts/survivorz/room-build.py): the shell + ceiling kit, and its baked light
  room: { dir: "rooms/vault-lobby", ext: [".glb", ".exr"], type: typeOf },
  roomres: { dir: "rooms/residential", ext: [".glb", ".exr"], type: typeOf },   // zone 2, the residential wing
  roomlabs: { dir: "rooms/labs", ext: [".glb", ".exr"], type: typeOf },        // zone 3, the research labs
  roommed: { dir: "rooms/medical", ext: [".glb", ".exr"], type: typeOf },       // zone 4, medical and quarantine
  roomsec: { dir: "rooms/security", ext: [".glb", ".exr"], type: typeOf },      // zone 5, security
  roompow: { dir: "rooms/power", ext: [".glb", ".exr"], type: typeOf },         // zone 6, power and maintenance
  roomcon: { dir: "rooms/containment", ext: [".glb", ".exr"], type: typeOf },   // zone 7, specimen containment
  roomdeep: { dir: "rooms/deep", ext: [".glb", ".exr"], type: typeOf },         // zone 8, the deep lab and the tunnels
  roombunker: { dir: "rooms/bunker", ext: [".glb", ".exr"], type: typeOf },     // THE BUNKER, the new show (docs/survivorz/BUNKER.md)
  // GLENRIDGE HALL, the next map (docs/survivorz/GLENRIDGE.md): four baked zones, in the look test only so far
  roomglenground: { dir: "rooms/glen-ground", ext: [".glb", ".exr"], type: typeOf },
  roomglenupper: { dir: "rooms/glen-upper", ext: [".glb", ".exr"], type: typeOf },
  roomglenbasement: { dir: "rooms/glen-basement", ext: [".glb", ".exr"], type: typeOf },
  roomglenoutside: { dir: "rooms/glen-outside", ext: [".glb", ".exr"], type: typeOf },
  roomdecal: { dir: "rooms/vault-lobby/decals", ext: [".webp", ".png"], type: typeOf },
};

/** The effects session's folder (flipbook sheets, decals, cut zombie pieces).
 *  The one area with SUBFOLDERS, so it has its own route shape. */
const FX_DIR = "fx";
// (.json: the manifests the effects load first — flipbooks.json, blood.json, gore.json, the skin masks)
const FX_EXT = [".png", ".webp", ".ktx2", ".glb", ".exr", ".json"] as const;
/** How deep fx/ may nest: fx/<a>/<b>/<c>/<file>. The router matches exact
 *  segment counts, so each depth is one registered route. */
export const FX_MAX_DEPTH = 4;

/** The final sounds: one folder per sound id, each holding its takes. */
const SOUND_DIR = "sound/final/game";
const SOUND_EXT = [".ogg"] as const;
const MANIFEST = "sound/final/manifest.json";

/** A bare file or folder name: letters, digits, dot, dash, underscore, and
 *  never a leading dot (no "..", no hidden files). */
const SAFE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/;

/** Resolve `name` inside `dir`, or null if it isn't a plain file there. */
export function resolveInside(dir: string, name: string, exts: readonly string[]): string | null {
  if (!SAFE.test(name)) return null;
  const ext = path.extname(name).toLowerCase();
  if (!exts.includes(ext)) return null;
  const base = path.resolve(survivorzRoot(), dir);
  const full = path.resolve(base, name);
  if (path.dirname(full) !== base) return null;
  return full;
}

/** resolveInside, under another root (the creator's shelf). */
function resolveInsideRoot(root: string, dir: string, name: string, exts: readonly string[]): string | null {
  if (!SAFE.test(name) || !exts.includes(path.extname(name).toLowerCase())) return null;
  const base = path.resolve(root, dir);
  const full = path.resolve(base, name);
  return path.dirname(full) === base ? full : null;
}

/** Every body's gun seat: the tree's cal.json, and the creator's bodies' beside it (never over it). */
export function gunSeats(): Record<string, unknown> {
  const read = (p: string): Record<string, unknown> => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } };
  return { ...read(path.join(creatorRoot(), "cal.json")), ...read(path.join(survivorzRoot(), "props", "guns", "cal.json")) };
}

/** Every survivor body there is: the tree's game/ and the creator's shelf, zombies left out. */
export function survivorBodyIds(): string[] {
  const ids = new Set<string>();
  for (const d of [path.join(survivorzRoot(), "game"), path.join(creatorRoot(), "game")]) {
    try { for (const f of fs.readdirSync(d)) if (f.endsWith(".glb") && !f.startsWith("zombie-") && SAFE.test(f)) ids.add(f.slice(0, -4)); } catch { /* not there */ }
  }
  return [...ids].sort();
}

/** Resolve fx/<segments…> — every folder segment a bare name (no dots at all,
 *  so no "..", no hidden folders), the last a safe file with an fx extension,
 *  and the result still inside fx/. */
export function resolveFx(segments: string[]): string | null {
  if (segments.length < 1 || segments.length > FX_MAX_DEPTH) return null;
  const folders = segments.slice(0, -1);
  if (folders.some((f) => !SAFE.test(f) || f.includes("."))) return null;
  const file = resolveInside([FX_DIR, ...folders].join("/"), segments[segments.length - 1], FX_EXT);
  if (!file) return null;
  const base = path.resolve(survivorzRoot(), FX_DIR);
  return file.startsWith(base + path.sep) ? file : null;
}

function listDir(dir: string, exts: readonly string[], root = survivorzRoot()): { file: string; bytes: number; mtime: number }[] {
  const base = path.resolve(root, dir);
  let names: string[];
  try {
    names = fs.readdirSync(base);
  } catch {
    return [];
  }
  const out: { file: string; bytes: number; mtime: number }[] = [];
  for (const file of names.sort()) {
    if (!SAFE.test(file) || !exts.includes(path.extname(file).toLowerCase())) continue;
    try {
      const st = fs.statSync(path.join(base, file));
      if (st.isFile()) out.push({ file, bytes: st.size, mtime: Math.round(st.mtimeMs) });
    } catch {
      /* gone between readdir and stat — a bake mid-write */
    }
  }
  return out;
}

/** Stream one file with revalidation, or answer 404 / 304. */
function sendFile(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, full: string | null): void {
  if (!full) return json(res, 404, { error: "not_found" });
  let st: fs.Stats;
  try {
    st = fs.statSync(full);
    if (!st.isFile()) throw new Error("not a file");
  } catch {
    return json(res, 404, { error: "not_found" });
  }
  const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
  const headers = {
    "content-type": typeOf(path.extname(full).toLowerCase()),
    "cache-control": "private, no-cache",
    etag,
    "last-modified": st.mtime.toUTCString(),
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, { ...headers, "content-length": st.size });
  const stream = fs.createReadStream(full);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

export function registerSurvivorzAssetRoutes(router: Router): void {
  // The index: what there is, so the Watch page never guesses a file name.
  router.get("/api/survivorz/assets", "watch", ({ res, user }) => {
    if (!showGate(user)) return json(res, 403, { error: "off_air" });
    const root = survivorzRoot();
    if (!fs.existsSync(root)) return json(res, 404, { error: "not_available" });
    // the tree's bodies, then the creator's (a name in both: the tree's wins)
    const tree = listDir(AREAS.body.dir, AREAS.body.ext);
    const made = listDir("game", AREAS.body.ext, creatorRoot()).filter((m) => !tree.some((t) => t.file === m.file));
    const bodies = [...tree, ...made].map((f) => ({
      ...f,
      id: f.file.replace(/\.glb$/i, ""),
      kind: f.file.startsWith("zombie-") ? "zombie" : "survivor",
    }));
    const guns = listDir(AREAS.gun.dir, [".glb"]);
    const props = listDir(AREAS.prop.dir, AREAS.prop.ext);
    let sounds: unknown = null;
    try {
      sounds = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), "utf8"));
    } catch {
      sounds = null;
    }
    json(res, 200, { bodies, guns, props, sounds });
  });

  router.get("/api/survivorz/asset/:area/:file", "watch", ({ req, res, params, user }) => {
    if (!showGate(user)) return json(res, 403, { error: "off_air" });
    // a creator body's grabs, bites and rescues (survivorz-pairs.ts): the merged table, and each zombie's halves
    if (params.area === "pairs" && params.file === "pairs.json") return json(res, 200, mergedPairs());
    if (params.area === "pairclip") return sendFile(req, res, pairClipFile(params.file));
    // the creator's bodies' loop speeds (the bake's "speeds" step); the hand-made bodies' ship in the client
    if (params.area === "body" && params.file === "loopspeed.json") { let all = {}; try { all = JSON.parse(fs.readFileSync(path.join(creatorRoot(), "loopspeed.json"), "utf8")); } catch { /* none yet */ } return json(res, 200, all); }
    // the creator's bodies' pack and stow fits (the bake's "kit" step); the page ships its own in kit-fit.json
    if (params.area === "body" && params.file === "kitfit.json") { let all = { packs: {}, stow: {} }; try { all = JSON.parse(fs.readFileSync(path.join(creatorRoot(), "kitfit.json"), "utf8")); } catch { /* none yet */ } return json(res, 200, all); }
    const area = Object.prototype.hasOwnProperty.call(AREAS, params.area) ? AREAS[params.area] : null;
    if (!area) return json(res, 404, { error: "not_found" });
    if (params.area === "gun" && params.file === "cal.json") return json(res, 200, gunSeats());
    let full = resolveInside(area.dir, params.file, area.ext);
    // a body the creator baked lives on its own shelf
    if (params.area === "body" && full && !fs.existsSync(full)) full = resolveInsideRoot(creatorRoot(), "game", params.file, area.ext);
    sendFile(req, res, full);
  });

  // /api/survivorz/fx/<file> … /api/survivorz/fx/<a>/<b>/<c>/<file>
  for (let depth = 1; depth <= FX_MAX_DEPTH; depth++) {
    const keys = Array.from({ length: depth }, (_, i) => `p${i}`);
    router.get(`/api/survivorz/fx/${keys.map((k) => ":" + k).join("/")}`, "watch", ({ req, res, params, user }) => {
      if (!showGate(user)) return json(res, 403, { error: "off_air" });
      sendFile(req, res, resolveFx(keys.map((k) => params[k])));
    });
  }

  router.get("/api/survivorz/sound/:id/:file", "watch", ({ req, res, params, user }) => {
    if (!showGate(user)) return json(res, 403, { error: "off_air" });
    if (!SAFE.test(params.id) || params.id.includes(".")) return json(res, 404, { error: "not_found" });
    sendFile(req, res, resolveInside(`${SOUND_DIR}/${params.id}`, params.file, SOUND_EXT));
  });
}
