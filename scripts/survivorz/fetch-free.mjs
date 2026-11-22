// SURVIVORZ: downloads the free assets picked in docs/survivorz/sourcing/free/*.json
// that their sites let us fetch directly (Poly Haven, ambientCG, OpenGameArt,
// Wikimedia Commons, Google Fonts). Sketchfab needs SKETCHFAB_TOKEN in .env.
// Everything lands in assets/downloads/survivorz/free/<source>/<id>/ (gitignored),
// and every file is logged with its page, licence, credit and the date, in
// free/LOG.json (the record a copyright dispute or a credits list is built from).
//
//   node scripts/survivorz/fetch-free.mjs [polyhaven|ambientcg|other|sketchfab|freesound|all]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "docs", "survivorz", "sourcing", "free");
const OUT = path.join(ROOT, "assets", "downloads", "survivorz", "free");
const env = fs.existsSync(path.join(ROOT, ".env")) ? parseEnv(fs.readFileSync(path.join(ROOT, ".env"), "utf8")) : {};
const UA = { "User-Agent": "SolaceAssetIntake/1.0" };
const want = process.argv[2] || "all";
const load = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
const entries = [...load("free_props.json"), ...load("free_items.json"), ...load("free_textures.json"),
  // the models picked to fill ASSET-CHECK.md's gaps (scripts/survivorz/find-gap-models.mjs)
  ...(fs.existsSync(path.join(SRC, "free_gaps.json")) ? load("free_gaps.json") : []),
  // sounds: only the ones a script may fetch (OpenGameArt, Kenney); Sonniss, Freesound and itch.io are Josh's
  ...load("free_sound.json").filter((e) => /opengameart\.org|kenney\.nl|freesound\.org/.test(e.url))];
// Freesound keeps its own log: it can run while another source is still downloading.
const LOGF = path.join(OUT, want === "freesound" ? "LOG-freesound.json" : "LOG.json");
fs.mkdirSync(OUT, { recursive: true });
const log = fs.existsSync(LOGF) ? JSON.parse(fs.readFileSync(LOGF, "utf8")) : {};
const saveLog = () => fs.writeFileSync(LOGF, JSON.stringify(log, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, headers = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers }, redirect: "follow" });
      if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r;
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500); }
  }
  throw new Error(`gave up ${url}`);
}
async function save(url, file, headers) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.statSync(file).size;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await get(url, headers);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}
const record = (e, source, id, files, bytes) => {
  log[`${source}:${id}`] = { name: e.name, page: e.url, licence: e.licence, credit: e.credit || "", fills: e.fills, category: e.category,
    files: files.map((f) => path.relative(OUT, f).replace(/\\/g, "/")), bytes, fetched: new Date().toISOString() };
  saveLog();
};

// ---- Poly Haven: models as 2K glTF (+ its textures), materials as 2K maps, HDRIs as 2K .hdr
async function polyhaven(e) {
  const id = e.url.split("/a/")[1].split(/[?#]/)[0];
  if (log[`polyhaven:${id}`]) return "have";
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const dir = path.join(OUT, "polyhaven", id);
  const got = []; let bytes = 0;
  const take = async (u, rel) => { const f = path.join(dir, rel); bytes += await save(u, f); got.push(f); };
  if (files.hdri) {
    const h = files.hdri["2k"]?.hdr || files.hdri["1k"]?.hdr;
    await take(h.url, `${id}_2k.hdr`);
  } else if (files.gltf && (!files.Diffuse || (await (await get(`https://api.polyhaven.com/info/${id}`)).json()).type === 2)) {
    // a MODEL (type 2): its texture maps are listed beside the glTF too (the Service Pistol's are),
    // so the maps alone can't tell a model from a material
    const g = files.gltf["2k"]?.gltf || files.gltf["1k"]?.gltf;
    await take(g.url, `${id}.gltf`);
    for (const [rel, inc] of Object.entries(g.include || {})) await take(inc.url, rel);
  } else {
    for (const [map, byRes] of Object.entries(files)) {
      if (["gltf", "blend", "mtlx", "usd"].includes(map)) continue;
      const r = byRes["2k"] || byRes["1k"]; if (!r) continue;
      const f = r.jpg || r.png || r.exr; if (!f) continue;
      await take(f.url, path.basename(new URL(f.url).pathname));
    }
  }
  record(e, "polyhaven", id, got, bytes);
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

// ---- ambientCG: the 2K-JPG zip
async function ambientcg(e) {
  const id = new URL(e.url).searchParams.get("id") || e.url.split("/").pop();
  if (log[`ambientcg:${id}`]) return "have";
  const f = path.join(OUT, "ambientcg", `${id}_2K-JPG.zip`);
  const bytes = await save(`https://ambientcg.com/get?file=${id}_2K-JPG.zip`, f);
  record(e, "ambientcg", id, [f], bytes);
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

// ---- OpenGameArt (file links on the page), Wikimedia (original file), Google Fonts (OFL files)
async function other(e) {
  const host = new URL(e.url).hostname;
  const id = e.name.replace(/[^\w.-]+/g, "_").slice(0, 60);
  if (log[`other:${id}`]) return "have";
  const dir = path.join(OUT, host.replace(/^www\./, ""), id);
  const got = []; let bytes = 0;
  if (host.includes("opengameart.org")) {
    const html = await (await get(e.url)).text();
    const links = [...new Set([...html.matchAll(/href="(https:\/\/opengameart\.org\/sites\/default\/files\/[^"]+)"/g)].map((m) => m[1]))];
    for (const u of links) { const f = path.join(dir, decodeURIComponent(path.basename(new URL(u).pathname))); bytes += await save(u, f); got.push(f); }
  } else if (host.includes("wikimedia.org")) {
    const title = decodeURIComponent(e.url.split("/wiki/")[1]);
    const q = await (await get(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`)).json();
    const page = Object.values(q.query.pages)[0]; const u = page.imageinfo[0].url;
    const f = path.join(dir, decodeURIComponent(path.basename(new URL(u).pathname))); bytes += await save(u, f); got.push(f);
    await sleep(1500);
  } else if (host.includes("fonts.google.com")) {
    const fam = decodeURIComponent(e.url.split("/specimen/")[1] || "").split(/[?#]/)[0].replace(/\+/g, " ");
    const slug = fam.toLowerCase().replace(/[^a-z0-9]/g, "");
    const list = await (await get(`https://api.github.com/repos/google/fonts/contents/ofl/${slug}`)).json();
    for (const it of Array.isArray(list) ? list : []) {
      if (!/\.(ttf|otf)$|^OFL\.txt$/i.test(it.name)) continue;
      const f = path.join(dir, it.name); bytes += await save(it.download_url, f); got.push(f);
    }
  } else if (host.includes("kenney.nl")) {
    const html = await (await get(e.url)).text();
    const u = [...html.matchAll(/href="([^"]+\.zip)"/g)].map((m) => new URL(m[1], e.url).href)[0];
    if (!u) return "nothing found";
    const f = path.join(dir, path.basename(new URL(u).pathname)); bytes += await save(u, f); got.push(f);
  } else return "skip";
  if (!got.length) return "nothing found";
  record(e, "other", id, got, bytes);
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

// ---- Sketchfab: the API hands back a time-limited glTF zip link for a token holder
async function sketchfab(e) {
  const token = env.SKETCHFAB_TOKEN || process.env.SKETCHFAB_TOKEN;
  if (!token) return "no SKETCHFAB_TOKEN";
  const uid = e.url.match(/([0-9a-f]{32})/)?.[1];
  if (!uid) return "no uid";
  if (log[`sketchfab:${uid}`]) return "have";
  const r = await (await get(`https://api.sketchfab.com/v3/models/${uid}/download`, { Authorization: `Token ${token}` })).json();
  const pick = r.gltf || r.glb || r.source; if (!pick) return "no download offered";
  const f = path.join(OUT, "sketchfab", `${uid}.zip`);
  const bytes = await save(pick.url, f);
  record(e, "sketchfab", uid, [f], bytes);
  await sleep(2500);
  return `${(bytes / 1e6).toFixed(1)} MB`;
}


// ---- Freesound: the original file, through OAuth2. Josh authorises once in his browser
// (the link this prints), puts the code he's shown in .env as FREESOUND_AUTH_CODE, and the
// first run trades it for tokens kept in .env (FREESOUND_ACCESS_TOKEN / _REFRESH_TOKEN).
let fsToken = null;
function setEnv(updates) {
  const p = path.join(ROOT, ".env"); let s = fs.readFileSync(p, "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    s = re.test(s) ? s.replace(re, `${k}=${v}`) : s.replace(/\n?$/, `\n${k}=${v}\n`);
  }
  fs.writeFileSync(p, s);
}
async function freesoundToken() {
  if (fsToken) return fsToken;
  const id = env.FREESOUND_CLIENT_ID, secret = env.FREESOUND_API_KEY;
  const trade = async (body) => {
    const r = await fetch("https://freesound.org/apiv2/oauth2/access_token/", { method: "POST", body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }) });
    const j = await r.json(); if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
    setEnv({ FREESOUND_ACCESS_TOKEN: j.access_token, FREESOUND_REFRESH_TOKEN: j.refresh_token, FREESOUND_AUTH_CODE: "" });
    return j.access_token;
  };
  if (env.FREESOUND_REFRESH_TOKEN) { try { return (fsToken = await trade({ grant_type: "refresh_token", refresh_token: env.FREESOUND_REFRESH_TOKEN })); } catch {} }
  if (env.FREESOUND_AUTH_CODE) return (fsToken = await trade({ grant_type: "authorization_code", code: env.FREESOUND_AUTH_CODE }));
  throw new Error(`not authorised yet — open https://freesound.org/apiv2/oauth2/authorize/?client_id=${id}&response_type=code`);
}
async function freesound(e) {
  const sid = e.url.match(/\/sounds\/(\d+)/)?.[1]; if (!sid) return "no id";
  if (log[`freesound:${sid}`]) return "have";
  const tok = await freesoundToken();
  const auth = { Authorization: `Bearer ${tok}` };
  const meta = await (await get(`https://freesound.org/apiv2/sounds/${sid}/?fields=id,name,type,license,username`, auth)).json();
  if (!/publicdomain\/zero|creativecommons\.org\/licenses\/by\//.test(meta.license || "")) return `licence changed: ${meta.license}`;
  const safe = String(meta.name || sid).replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 60);
  const f = path.join(OUT, "freesound", `${sid}_${safe}.${meta.type || "wav"}`);
  const bytes = await save(`https://freesound.org/apiv2/sounds/${sid}/download/`, f, auth);
  record({ ...e, licence: `${e.licence} · API: ${meta.license}` }, "freesound", sid, [f], bytes);
  await sleep(1200);
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
const route = (e) => e.url.includes("polyhaven.com") ? "polyhaven" : e.url.includes("ambientcg.com") ? "ambientcg" : e.url.includes("sketchfab.com") ? "sketchfab" : e.url.includes("freesound.org") ? "freesound" : "other";
const fns = { polyhaven, ambientcg, other, sketchfab, freesound };
const seen = new Set(); let ok = 0, fail = 0;
for (const e of entries) {
  const kind = route(e);
  if (want !== "all" && want !== kind) continue;
  if (seen.has(e.url)) continue; seen.add(e.url);
  try { const res = await fns[kind](e); console.log(`${kind.padEnd(9)} ${String(res).padEnd(18)} ${e.name}`); if (res !== "skip") ok++; }
  catch (err) { fail++; console.log(`${kind.padEnd(9)} FAILED             ${e.name} — ${err.message}`); }
}
console.log(`done: ${ok} ok, ${fail} failed`);
