// THE ASSET FETCHER — the automated half of the new-asset intake (Josh, Oct
// 2026: "find me any assets online that would help. i want to start
// automating this").
//
//   node scripts/assets/fetch.mjs scripts/assets/level3.json --dry   sizes only, nothing downloaded
//   node scripts/assets/fetch.mjs scripts/assets/level3.json         fetch what isn't here yet
//   node scripts/assets/fetch.mjs scripts/assets/level3.json --only=Tiles140,power_box_01
//
// A MANIFEST names what to fetch; this script fetches it into the drop folder,
// assets/New Assets/<source>/<id>/, beside a credit.json saying where it came
// from, who made it and under what licence. From there the ordinary intake
// takes over (scripts/props/inspect.mjs → intake.mjs → the prop kit, or a
// texture into client/public/assets/br/tex + one surfaces.ts entry).
// Already-fetched entries are skipped, so a manifest can grow and be re-run.
//
// SOURCES, and why these three:
//   ambientcg  CC0 textures. No account. { source, id, res? = "1K-JPG" }
//   polyhaven  CC0 textures and models. No account.
//              { source, id, type: "texture" | "model", res? = "1k" }
//   sketchfab  mostly CC-BY models. Downloading needs SKETCHFAB_TOKEN in .env
//              (sketchfab.com → Settings → Password & API); without it these
//              entries are skipped, never failed. { source, uid, name? }
// CC-BY means the author must be credited: the prop pipeline's `credit` field
// (sources.mjs) feeds propkit/CREDITS.txt — copy it from credit.json.
//
// Downloads are fetched SEQUENTIALLY with a named User-Agent (Poly Haven's
// API terms ask for one). Zips are unpacked with Windows' own tar.exe
// (bsdtar reads zip; Git's GNU tar does not).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DROP = join(ROOT, "assets", "New Assets");
const UA = "Solace-asset-intake/1.0 (solace.zone)";

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
const DRY = args.includes("--dry");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
if (!manifestPath) {
  console.error("usage: node scripts/assets/fetch.mjs <manifest.json> [--dry] [--only=id,id]");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));

/** The .env key, read here rather than through src/env.ts (a script, no build). */
function envKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const m = readFileSync(join(ROOT, ".env"), "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

async function json(url, headers = {}) {
  const r = await fetch(url, { headers: { "user-agent": UA, ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, to, headers = {}) {
  const r = await fetch(url, { headers: { "user-agent": UA, ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  mkdirSync(dirname(to), { recursive: true });
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(to, buf);
  return buf.length;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/** Each source turns an entry into: what it is, its files, and its credit. */
const SOURCES = {
  async ambientcg(e) {
    const res = e.res ?? "1K-JPG";
    const data = await json(`https://ambientcg.com/api/v3/assets?id=${encodeURIComponent(e.id)}&include=downloads,title`);
    const a = data.assets?.[0];
    const dl = a?.downloads?.find((d) => d.attributes === res && d.extension === "zip");
    if (!dl) throw new Error(`ambientCG ${e.id}: no ${res} zip`);
    return {
      key: e.id,
      files: [{ url: dl.url, rel: `${e.id}_${res}.zip`, size: dl.size, unzip: true }],
      credit: { source: "ambientCG", id: e.id, title: a.title ?? e.id, author: "ambientCG", license: "CC0 1.0", url: `https://ambientcg.com/view?id=${e.id}` },
    };
  },

  async polyhaven(e) {
    const res = e.res ?? "1k";
    const [files, info] = await Promise.all([json(`https://api.polyhaven.com/files/${e.id}`), json(`https://api.polyhaven.com/info/${e.id}`)]);
    const out = [];
    if (e.type === "model") {
      const g = files.gltf?.[res]?.gltf;
      if (!g) throw new Error(`Poly Haven ${e.id}: no ${res} glTF`);
      out.push({ url: g.url, rel: g.url.split("/").pop(), size: g.size });
      for (const [rel, f] of Object.entries(g.include ?? {})) out.push({ url: f.url, rel, size: f.size });
    } else {
      // diffuse, OpenGL normal (three.js's convention), roughness
      for (const map of ["Diffuse", "nor_gl", "Rough"]) {
        const f = files[map]?.[res]?.jpg;
        if (f) out.push({ url: f.url, rel: f.url.split("/").pop(), size: f.size });
      }
      if (!out.length) throw new Error(`Poly Haven ${e.id}: no ${res} jpg maps`);
    }
    return {
      key: e.id,
      files: out,
      credit: { source: "Poly Haven", id: e.id, title: info.name ?? e.id, author: Object.keys(info.authors ?? {}).join(", "), license: "CC0 1.0", url: `https://polyhaven.com/a/${e.id}` },
    };
  },

  async sketchfab(e) {
    const meta = await json(`https://api.sketchfab.com/v3/models/${e.uid}`);
    const token = envKey("SKETCHFAB_TOKEN");
    const credit = {
      source: "Sketchfab",
      id: e.uid,
      title: meta.name,
      author: meta.user?.displayName ?? meta.user?.username ?? "",
      license: meta.license?.label ?? "unknown",
      url: meta.viewerUrl ?? `https://sketchfab.com/models/${e.uid}`,
    };
    const size = meta.archives?.glb?.size ?? 0;
    if (!token) return { key: e.uid, skip: "no SKETCHFAB_TOKEN in .env", files: [{ size }], credit };
    if (DRY) return { key: e.uid, files: [{ url: "", rel: "model.glb", size }], credit };
    const dl = await json(`https://api.sketchfab.com/v3/models/${e.uid}/download`, { authorization: `Token ${token}` });
    if (!dl.glb?.url) throw new Error(`Sketchfab ${e.uid}: no glb download`);
    return { key: e.uid, files: [{ url: dl.glb.url, rel: "model.glb", size: dl.glb.size ?? size }], credit };
  },
};

let total = 0, fetched = 0, skipped = 0, failed = 0;
for (const e of manifest.assets) {
  const id = e.id ?? e.uid;
  if (ONLY.length && !ONLY.includes(id)) continue;
  const src = SOURCES[e.source];
  if (!src) {
    console.log(`?  ${id}: unknown source "${e.source}"`);
    failed++;
    continue;
  }
  const dir = join(DROP, e.source, id);
  if (existsSync(join(dir, "credit.json"))) {
    console.log(`=  ${e.source}/${id}: already fetched`);
    skipped++;
    continue;
  }
  try {
    const plan = await src(e);
    const size = plan.files.reduce((s, f) => s + (f.size ?? 0), 0);
    total += size;
    const label = `${e.source}/${id}  ${plan.credit.title} — ${plan.credit.license}, ${size ? mb(size) : "size unknown"}${e.use ? `  [${e.use}]` : ""}`;
    if (plan.skip) {
      console.log(`-  ${label}  SKIPPED: ${plan.skip}`);
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(`·  ${label}`);
      continue;
    }
    for (const f of plan.files) {
      const to = join(dir, f.rel);
      await download(f.url, to);
      if (f.unzip) {
        execFileSync("C:\\Windows\\System32\\tar.exe", ["-xf", to, "-C", dir]);
        rmSync(to);
      }
    }
    // credit.json last: its presence is what marks the entry as done
    writeFileSync(join(dir, "credit.json"), JSON.stringify({ ...plan.credit, use: e.use ?? null, fetched: new Date().toISOString() }, null, 2));
    console.log(`+  ${label}`);
    fetched++;
  } catch (err) {
    console.log(`!  ${e.source}/${id}: ${err.message}`);
    failed++;
  }
}
console.log(`\n${DRY ? "would fetch" : "fetched"} ${DRY ? mb(total) : fetched}  ·  skipped ${skipped}  ·  failed ${failed}`);
if (failed) process.exitCode = 1;
