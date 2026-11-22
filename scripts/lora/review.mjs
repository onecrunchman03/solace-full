// THE LORA PROJECT, step 2 — CURATE (see README.md in this folder).
//
//   node scripts/lora/review.mjs            → open http://localhost:8792
//   node scripts/lora/review.mjs --export   → data/lora/train.jsonl (kept examples only)
//
// Every candidate from collect.mjs, one card each: what the player said, what
// the character answered (editable), Keep or Drop. Decisions are saved as you
// go to data/lora/<npc>/review.json, so a review can stop and resume. The
// export writes chat-format examples — the production system prompt and
// conversation, then the reply as you kept or edited it — which is what
// train.py reads.
//
// This is where the dataset's quality comes from. A good rule: keep a reply
// you'd be happy to see the character post every time; edit a reply that's
// nearly right; drop anything flat, wrong, or out of character. A few hundred
// excellent examples beat thousands of mediocre ones.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "data", "lora");
const PORT = 8792;

const npcs = () => (existsSync(DIR) ? readdirSync(DIR).filter((d) => existsSync(path.join(DIR, d, "candidates.jsonl"))) : []);
const candidates = (npc) =>
  readFileSync(path.join(DIR, npc, "candidates.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const reviewPath = (npc) => path.join(DIR, npc, "review.json");
const reviews = (npc) => (existsSync(reviewPath(npc)) ? JSON.parse(readFileSync(reviewPath(npc), "utf8")) : {});

if (process.argv.includes("--export")) {
  const out = [];
  const counts = {};
  for (const npc of npcs()) {
    const rv = reviews(npc);
    counts[npc] = 0;
    for (const c of candidates(npc)) {
      const d = rv[c.id];
      if (!d || !d.keep) continue;
      out.push(JSON.stringify({ npc, messages: [...c.messages, { role: "assistant", content: d.text ?? c.completion }] }));
      counts[npc]++;
    }
  }
  writeFileSync(path.join(DIR, "train.jsonl"), out.join("\n") + (out.length ? "\n" : ""));
  console.log(`exported ${out.length} examples to data/lora/train.jsonl`, counts);
  process.exit(0);
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>LoRA review</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#17140f;--panel:#221d16;--line:#3a3127;--ink:#efe6d6;--soft:#b9ab95;--accent:#d98a4f;--keep:#5fae6e;--drop:#c4554d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;background:var(--panel);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
header select,header button{background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit}
.stat{color:var(--soft);font-size:13px}
main{max-width:860px;margin:0 auto;padding:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px}
.card.keep{border-color:var(--keep)}.card.drop{border-color:var(--drop);opacity:.55}
.meta{color:var(--soft);font-size:12px;margin-bottom:6px}
.prior{color:var(--soft);font-size:13px;border-left:2px solid var(--line);padding-left:8px;margin:6px 0;white-space:pre-wrap}
.said{font-weight:600;margin:6px 0 8px;white-space:pre-wrap}
textarea{width:100%;min-height:80px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;resize:vertical}
.row{display:flex;gap:8px;margin-top:8px}.row button{flex:1;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;cursor:pointer}
.row .k.on{background:var(--keep);border-color:var(--keep);color:#111}.row .d.on{background:var(--drop);border-color:var(--drop)}
details summary{cursor:pointer;color:var(--soft);font-size:12px}
</style></head><body>
<header><b>LoRA review</b><select id="npc"></select><select id="show"><option value="todo">To review</option><option value="all">All</option><option value="keep">Kept</option><option value="drop">Dropped</option></select><span class="stat" id="stat"></span></header>
<main id="list"></main>
<script>
const $ = (s) => document.querySelector(s);
let data = { npcs: [], items: [], reviews: {} };
async function load() {
  data = await (await fetch("/api/data?npc=" + encodeURIComponent($("#npc").value || ""))).json();
  if (!$("#npc").options.length) { for (const n of data.npcs) $("#npc").add(new Option(n, n)); }
  render();
}
function render() {
  const show = $("#show").value, list = $("#list");
  list.textContent = "";
  let kept = 0, dropped = 0;
  for (const c of data.items) { const r = data.reviews[c.id]; if (r?.keep === true) kept++; else if (r?.keep === false) dropped++; }
  $("#stat").textContent = kept + " kept · " + dropped + " dropped · " + (data.items.length - kept - dropped) + " to review";
  for (const c of data.items) {
    const r = data.reviews[c.id];
    const state = r?.keep === true ? "keep" : r?.keep === false ? "drop" : "todo";
    if (show !== "all" && show !== state) continue;
    const card = document.createElement("div"); card.className = "card " + state;
    const turns = c.messages.filter((m) => m.role !== "system");
    const last = turns[turns.length - 1];
    const meta = document.createElement("div"); meta.className = "meta";
    meta.textContent = c.persona + " · " + c.scope + " · " + c.topic;
    card.append(meta);
    if (turns.length > 1) {
      const det = document.createElement("details"); const sum = document.createElement("summary");
      sum.textContent = "earlier in the conversation (" + (turns.length - 1) + ")"; det.append(sum);
      for (const t of turns.slice(0, -1)) { const p = document.createElement("div"); p.className = "prior"; p.textContent = (t.role === "user" ? "player: " : "reply: ") + t.content; det.append(p); }
      card.append(det);
    }
    const said = document.createElement("div"); said.className = "said"; said.textContent = last.content; card.append(said);
    const ta = document.createElement("textarea"); ta.value = r?.text ?? c.completion; card.append(ta);
    const row = document.createElement("div"); row.className = "row";
    const k = document.createElement("button"); k.className = "k" + (state === "keep" ? " on" : ""); k.textContent = "Keep";
    const d = document.createElement("button"); d.className = "d" + (state === "drop" ? " on" : ""); d.textContent = "Drop";
    k.onclick = () => decide(c.id, true, ta.value); d.onclick = () => decide(c.id, false, ta.value);
    row.append(k, d); card.append(row); list.append(card);
  }
}
async function decide(id, keep, text) {
  data.reviews[id] = { keep, text };
  await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ npc: $("#npc").value, id, keep, text }) });
  render();
}
$("#npc").onchange = load; $("#show").onchange = render;
load();
</script></body></html>`;

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type }); res.end(body); };
  if (req.method === "GET" && url.pathname === "/") return send(200, "text/html; charset=utf-8", PAGE);
  if (req.method === "GET" && url.pathname === "/api/data") {
    const all = npcs();
    const npc = all.includes(url.searchParams.get("npc") ?? "") ? url.searchParams.get("npc") : all[0];
    return send(200, "application/json", JSON.stringify({ npcs: all, items: npc ? candidates(npc) : [], reviews: npc ? reviews(npc) : {} }));
  }
  if (req.method === "POST" && url.pathname === "/api/decide") {
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      try {
        const { npc, id, keep, text } = JSON.parse(raw);
        if (!npcs().includes(npc)) return send(400, "application/json", '{"error":"bad_npc"}');
        const rv = reviews(npc);
        rv[id] = { keep: !!keep, text: String(text ?? "").slice(0, 2000) };
        writeFileSync(reviewPath(npc), JSON.stringify(rv, null, 1));
        send(200, "application/json", '{"ok":true}');
      } catch { send(400, "application/json", '{"error":"bad_json"}'); }
    });
    return;
  }
  send(404, "text/plain", "not found");
}).listen(PORT, "127.0.0.1", () => console.log(`LoRA review at http://localhost:${PORT}`));
