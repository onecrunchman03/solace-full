// SURVIVORZ, GLENRIDGE HALL: what the rooms are dressed with, all CC0.
//   furniture and plants   Poly Haven models (glTF, 1k maps)   -> assets/downloads/survivorz/free/polyhaven/<id>/
//   rugs, tapestries, portraits, landscapes   the Cleveland Museum of Art's Open Access images (CC0)
//                                             -> assets/downloads/survivorz/free/art/<kind>-NN.jpg + art/credits.json
//   node scripts/survivorz/glenridge/fetch-dressing.mjs [--models] [--art]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ASSETS = process.env.SURVIVORZ_ASSETS ?? path.join(ROOT, "assets/downloads/survivorz");
const want = (k) => process.argv.length < 3 || process.argv.includes(k);
const get = async (u) => { const r = await fetch(u, { headers: { "user-agent": "solace-map-build" } }); if (!r.ok) throw new Error(u + " " + r.status); return r; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const MODELS = [
  "ArmChair_01", "Sofa_01", "sofa_02", "GothicCabinet_01", "GothicCommode_01", "GothicBed_01", "gothic_coffee_table", "Chandelier_01", "Chandelier_02",
  "Chandelier_03", "ClassicConsole_01", "ClassicNightstand_01", "WoodenTable_01", "WoodenTable_02", "WoodenTable_03", "WoodenChair_01", "dining_table",
  "dining_chair_02", "vintage_grandfather_clock_01", "marble_bust_01", "fancy_picture_frame_01", "fancy_picture_frame_02", "ornate_mirror_01",
  "mantel_clock_01", "book_encyclopedia_set_01", "decorative_book_set_01", "wooden_bookshelf_worn", "brass_candleholders", "antique_ceramic_vase_01",
  "ceramic_vase_01", "vintage_cabinet_01", "vintage_wooden_drawer_01", "Ottoman_01", "side_table_01", "round_wooden_table_01", "GreenChair_01",
  "Lantern_01", "lantern_chandelier_01", "chess_set", "potted_plant_01", "potted_plant_02", "shrub_01", "shrub_02", "shrub_03", "shrub_04", "fern_02",
  "tree_small_02", "jacaranda_tree", "pine_tree_01", "fir_tree_01", "planter_pot_clay", "vintage_day_bed", "painted_wooden_cabinet", "drawer_cabinet",
  "horse_statue_01", "gothic_statue", "vintage_oil_lamp", "wooden_candlestick",
];
if (want("--models")) {
  let n = 0;
  for (const id of MODELS) {
    const dir = path.join(ASSETS, "free/polyhaven", id);
    if (fs.existsSync(path.join(dir, id + ".gltf"))) continue;
    try {
      const files = await (await get("https://api.polyhaven.com/files/" + id)).json();
      const g = files.gltf?.["1k"]?.gltf || files.gltf?.["2k"]?.gltf;
      if (!g) { console.log("no gltf", id); continue; }
      const take = async (u, rel) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(await (await get(u)).arrayBuffer())); };
      await take(g.url, id + ".gltf");
      for (const [rel, inc] of Object.entries(g.include || {})) await take(inc.url, rel);
      n++; console.log("ok", id);
    } catch (e) { console.log("FAILED", id, e.message); }
  }
  console.log(n, "models fetched");
}

// The Cleveland Museum of Art's Open Access API (CC0). [type, search words] per kind.
const ART = {
  rug: [["Carpet", "Persian"], ["Carpet", "medallion"], ["Carpet", "Iran"], ["Carpet", "Turkey"], ["Carpet", ""]],
  tapestry: [["Tapestry", "verdure"], ["Tapestry", "hunt"], ["Tapestry", "landscape"], ["Tapestry", ""]],
  portrait: [["Painting", "portrait British"], ["Painting", "portrait of a gentleman"], ["Painting", "portrait of a lady"], ["Painting", "portrait England 18th century"]],
  landscape: [["Painting", "landscape England"], ["Painting", "hunting landscape"], ["Painting", "landscape with cattle"]],
};
const PER = { rug: 8, tapestry: 8, portrait: 10, landscape: 6 };
if (want("--art")) {
  const dir = path.join(ASSETS, "free/art"); fs.mkdirSync(dir, { recursive: true });
  const creditsFile = path.join(dir, "credits.json");
  const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, "utf8")) : {};
  for (const [kind, queries] of Object.entries(ART)) {
    const seen = new Set(Object.values(credits).filter((c) => c.kind === kind).map((c) => c.id));
    let n = Object.values(credits).filter((c) => c.kind === kind).length;
    for (const [type, q] of queries) {
      if (n >= PER[kind]) break;
      let rows = [];
      try { rows = (await (await get(`https://openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1&limit=20&type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`)).json()).data || []; } catch (e) { console.log("search failed", q, e.message); }
      for (const o of rows) {
        if (n >= PER[kind] || seen.has(o.id)) continue;
        const im = o.images?.print || o.images?.web; if (!im) continue;
        const w0 = Number(im.width), h0 = Number(im.height);
        if (kind === "portrait" && w0 > h0) continue;            // portraits upright, landscapes wide
        if (kind === "landscape" && h0 > w0) continue;
        try {
          await sleep(150);
          const buf = Buffer.from(await (await get(im.url)).arrayBuffer());
          const name = `${kind}-${String(n + 1).padStart(2, "0")}.jpg`;
          const out = await sharp(buf).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(path.join(dir, name));
          credits[name] = { kind, id: o.id, title: o.title, date: o.creation_date, url: o.url, w: out.width, h: out.height, licence: "CC0 (Cleveland Museum of Art Open Access)" };
          seen.add(o.id); n++; console.log("ok", name, out.width + "x" + out.height, String(o.title).slice(0, 60));
          fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 1));
        } catch (e) { console.log("skip", o.id, e.message.slice(0, 80)); }
      }
    }
  }
}
