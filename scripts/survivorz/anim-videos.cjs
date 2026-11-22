// SURVIVORZ: turns every clip packed into a body (assets/downloads/survivorz/game/<body>.glb)
// into a short looping MP4 for the animation review page — the clip played on that body on a
// plain floor, frames rendered on a fixed clock by scripts/survivorz/anim-render.html, then
// encoded by ffmpeg. A loop plays twice; a one-shot plays once with a beat of hold at the end.
//
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-videos.cjs <body> [onlySubstr]
//   -> assets/downloads/survivorz/anim/<body>/<clip>.mp4 + index.json
//   node scripts/survivorz/anim-videos.cjs --pair <zombie> <survivor> [onlySubstr]
//   -> assets/downloads/survivorz/anim/pairs/<clip>.mp4 + index.json — the finisher pack's
//      attacks, both bodies placed as docs/survivorz/anim-pairs.mjs says, and its DUOS (the
//      hug) when both bodies are survivors: --pair eric carla hug
// The finisher clips (fz-*) only make sense as pairs, so the single-body videos skip them.
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");
const findPlaywright = () => {
  try { return require("playwright-core"); } catch {}
  const npx = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".npm"), "npm-cache", "_npx");
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const p = path.join(npx, d, "node_modules", "playwright-core");
    if (fs.existsSync(p)) return require(p);
  }
};
const findChrome = () => {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const exe = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
};
const ROOT = path.join(__dirname, "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const PAIR = process.argv[2] === "--pair";
// --close: CLOSE-UPS of the gun clips (gr-/gs-/gp-) into anim/<body>/close/ — a long gun from
// the body's right front, at the shoulder pocket and the trigger hand (is the butt IN the
// shoulder?), a pistol from the left front at both hands (is the support hand round the grip?)
const CLOSE = process.argv.includes("--close");
// --hands: CLOSE-UPS of the moves that hold something (the hand checks, anim-hands.cjs) into
// anim/<body>/hands/ — the camera on the holding hands, from where the fingers on the thing show
const HANDS = process.argv.includes("--hands");
const HAND_SHOTS = {
  "bd-hammer": [["hand_r"], [-0.9, 0.25, 0.4], 0.42], "bd-crowbar": [["hand_l", "hand_r"], [0.3, 0.55, -1], 0.6],
  "bd-flashlight-walk": [["hand_r"], [0.2, 0.35, 1], 0.38], "bd-flashlight-run": [["hand_r"], [0.2, 0.35, 1], 0.38], "bd-flashlight-jog": [["hand_r"], [0.2, 0.35, 1], 0.38], "bd-flashlight-slow-run": [["hand_r"], [0.2, 0.35, 1], 0.38],
  "bd-can": [["hand_l", "hand_r"], [0.3, 0.5, 1], 0.42], "bd-inject": [["hand_r", "hand_l"], [0.3, 0.7, 0.65], 0.42],
  "bd-molotov": [["hand_r", "hand_l"], [0.6, 0.3, 1], 0.45],
};
const args = process.argv.slice(PAIR ? 3 : 2).filter((a) => !["--close", "--redo", "--hands"].includes(a));
const [body, second] = args;
if (!body) throw new Error("usage: anim-videos.cjs <body> [onlySubstr] | --pair <zombie> <survivor> [onlySubstr]");
const ONLY = ((PAIR ? args[2] : second) ?? "").toLowerCase();
const OUT = path.join(STAGE, "anim", PAIR ? "pairs" : body, CLOSE ? "close" : HANDS ? "hands" : "");
const FPS = 24, SIZE = 360, MAX = 10;
const LOOPY = /loop|walk|run|sprint|idle|crawl|strafe|jog|swim|breath|moan|sleep|struggle-idle|typing|terrified|shiver|hammer|bandage|laying-.*cough/i;

(async () => {
  const { chromium } = findPlaywright();
  const browser = await chromium.launch({ executablePath: findChrome(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  const { placeOf, DUOS } = PAIR ? await import(require("url").pathToFileURL(path.join(ROOT, "docs", "survivorz", "anim-pairs.mjs")).href) : {};
  await page.goto(PAIR
    ? `http://127.0.0.1:8791/scripts/survivorz/anim-pair.html?a=/assets/downloads/survivorz/game/${body}.glb&b=/assets/downloads/survivorz/game/${second}.glb&size=${SIZE}`
    : `http://127.0.0.1:8791/scripts/survivorz/anim-render.html?body=/assets/downloads/survivorz/game/${body}.glb&size=${SIZE}`);
  await page.waitForFunction(() => window.r?.ready, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.r.error);
  if (err) throw new Error(err);
  fs.mkdirSync(OUT, { recursive: true });
  // a pair run makes the finisher attacks, plus the DUOS (two survivors, a different clip each)
  const clips = (await page.evaluate(() => window.r.clips())).filter((c) => c.name.toLowerCase().includes(ONLY) && (PAIR ? /^fz-/.test(c.name) : CLOSE ? /^g[rsp]-/.test(c.name) : HANDS ? !!HAND_SHOTS[c.name] : !/^fz-|^bd-hug-/.test(c.name)));
  const gaps = fs.existsSync(path.join(STAGE, "out", "hug-gaps.json")) ? JSON.parse(fs.readFileSync(path.join(STAGE, "out", "hug-gaps.json"), "utf8")) : {};
  if (PAIR) for (const d of DUOS) {
    const duo = d.pick(body, second, gaps);
    const dur = await page.evaluate((n) => window.r.durOf(n), duo.aname);
    // one video per pair of bodies: <duo>-<a>-<b>
    if (dur && duo.bz && d.name.includes(ONLY)) clips.push({ name: `${d.name}-${body}-${second}`, dur, pair: true, duo });
  }
  const index = fs.existsSync(path.join(OUT, "index.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")) : {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anim-"));
  const t0 = Date.now();
  for (const [n, c] of clips.entries()) {
    // already made (a re-run after a stop picks up where it left off); --redo makes it again
    if (!process.argv.includes("--redo") && index[c.name] && fs.existsSync(path.join(OUT, `${c.name}.mp4`))) continue;
    const loop = LOOPY.test(c.name);
    const wide = /crawl|lay|laying|death|fall|knock|dying|jump|roll|climb|carry/i.test(c.name);
    const dur = Math.min(c.dur, MAX);
    const total = loop ? Math.min(dur * 2, 12) : dur + 0.6;
    await page.evaluate(([name, o]) => window.r.use(name, o), [c.name, c.duo ?? (PAIR ? placeOf(c.name) : wide)]);
    if (HANDS) await page.evaluate((shot) => window.r.close(...shot), HAND_SHOTS[c.name]);
    if (CLOSE) await page.evaluate((pistol) => pistol ? window.r.close(["hand_r", "hand_l"], [0.55, 0.25, 1], 0.62) : window.r.close(["upperarm_r", "hand_r"], [-0.85, 0.3, 0.75], 0.95), /^gp-/.test(c.name));
    const frames = Math.max(2, Math.round(total * FPS));
    for (let i = 0; i < frames; i++) {
      const t = loop ? (i / FPS) % dur : Math.min(i / FPS, dur - 0.001);
      const url = await page.evaluate((tt) => window.r.frame(tt), t);
      fs.writeFileSync(path.join(tmp, `f${String(i).padStart(4, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
    }
    const mp4 = path.join(OUT, `${c.name}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(tmp, "f%04d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f));
    index[c.name] = { dur: +c.dur.toFixed(2), loop, file: `${c.name}.mp4`, bytes: fs.statSync(mp4).size, ...(PAIR ? { pair: c.pair } : {}) };
    // merge with what is on disk now, so two runs on one body never drop each other's entries
    const disk = fs.existsSync(path.join(OUT, "index.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")) : {};
    Object.assign(index, { ...disk, ...index, [c.name]: index[c.name] });
    fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
    console.log(`${String(n + 1).padStart(3)}/${clips.length} ${c.name} ${c.dur.toFixed(1)}s ${loop ? "loop" : "once"} ${(index[c.name].bytes / 1024).toFixed(0)}KB`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${body}: ${clips.length} videos in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
