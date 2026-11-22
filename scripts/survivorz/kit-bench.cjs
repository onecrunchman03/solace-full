// SURVIVORZ: drives kit-bench.html (Playwright, swiftshader) and lays the frames out as one contact sheet.
//   node scripts/serve-root.mjs 8795     (another shell)
//   node scripts/survivorz/kit-bench.cjs <body> <out.jpg> --pack backpack-small --stow crowbar,pistol \
//        --clips ual1-walk-loop,ual1-idle-loop --views back,side --frames 3 [--size 300] [--port 8795]
const fs = require("fs"), path = require("path");
const { stripTypeScriptTypes } = require("node:module");
const npx = path.join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
let pw; for (const d of fs.readdirSync(npx)) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } }
const base = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const ROOT = path.join(__dirname, "..", "..");
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const [body, out] = a;
const size = +opt("--size", 300), N = +opt("--frames", 3), port = opt("--port", "8795");
const clips = opt("--clips", "ual1-idle-loop").split(","), views = opt("--views", "back").split(",");
(async () => {
  const b = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: size, height: size } });
  p.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  await p.route("**/client/src/survivorz/show/kit.ts", (r) => r.fulfill({ contentType: "text/javascript", body: stripTypeScriptTypes(fs.readFileSync(path.join(ROOT, "client/src/survivorz/show/kit.ts"), "utf8")) }));
  await p.goto(`http://127.0.0.1:${port}/scripts/survivorz/kit-bench.html?body=${body}&size=${size}&pack=${opt("--pack", "")}&stow=${opt("--stow", "")}`);
  await p.waitForFunction(() => window.k?.ready, null, { timeout: 240000 });
  const err = await p.evaluate(() => window.k.error); if (err) throw new Error(err);
  const rows = [];
  for (const c of clips) {
    const dur = await p.evaluate((n) => window.k.use(n), c);
    for (const v of views) { const fr = []; for (let i = 0; i < N; i++) fr.push(await p.evaluate(([t, v]) => window.k.frame(t, v), [dur * (i + 0.5) / N, v])); rows.push({ c: `${c} · ${v}`, fr }); }
  }
  const html = `<body style="margin:0;background:#111;color:#ddd;font:11px sans-serif">${rows.map((r) => `<div style="display:flex;align-items:center"><div style="width:150px;padding:4px;word-break:break-all">${r.c}</div>${r.fr.map((f) => `<img src="${f}" width=${size}>`).join("")}</div>`).join("")}</body>`;
  const q = await b.newPage({ viewport: { width: 150 + N * size, height: 100 } }); await q.setContent(html);
  await q.screenshot({ path: out, fullPage: true, type: "jpeg", quality: 80 }); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
