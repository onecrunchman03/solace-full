// SURVIVORZ: bakes the moves built in code (scripts/survivorz/anim-recipes.js) onto survivor
// bodies, through scripts/survivorz/anim-build.html, into out/<body>/bd-<recipe>.json beside
// the converted clips — then pack.mjs packs them with the rest (manifest.mjs lists them).
//   node scripts/serve-root.mjs 8791            (in another shell)
//   node scripts/survivorz/anim-build.cjs <body> [recipe]
//   node scripts/survivorz/anim-build.cjs --hug [body] [partner]   (every pair, both roles)
//   node scripts/survivorz/anim-build.cjs --zpair [zombie] [survivor] (a zombie's moves on a survivor: the bites)
//   node scripts/survivorz/anim-build.cjs --zvictim [survivor] [zombie] (a survivor's moves on a zombie: the knife, the stamp)
const fs = require("fs"), path = require("path");
const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
let pw; try { pw = require("playwright-core"); } catch { for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const p = path.join(npx, d, "node_modules", "playwright-core"); if (fs.existsSync(p)) { pw = require(p); break; } } }
const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const chrome = path.join(base, fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop(), "chrome-win64", "chrome.exe");
const STAGE = path.join(__dirname, "..", "..", "..", "assets", "downloads", "survivorz");
const NEXTOUT = process.env.NEXT_OUT;
const glbOf = (b) => fs.existsSync(path.join(STAGE, "game-next", b + ".glb")) ? `game-next/${b}.glb` : `game/${b}.glb`;
const SURVIVORS = ["eric", "carla", "claudia", "manuel", "nathan", "sophia", "rollo"];
const HUG = process.argv[2] === "--hug", ZPAIR = process.argv[2] === "--zpair", ZVICTIM = process.argv[2] === "--zvictim";
const [body, only] = process.argv.slice(HUG || ZPAIR || ZVICTIM ? 3 : 2);
const ZOMBIES = fs.readdirSync(path.join(STAGE, "game")).filter((f) => /^zombie-.*\.glb$/.test(f)).map((f) => f.replace(/\.glb$/, "")).sort();
if (!body && !HUG && !ZPAIR && !ZVICTIM) throw new Error("usage: anim-build.cjs <body> [recipe] | --hug [body] [partner]");
// the moves for two (the hug) are fitted to each pair: on body A against partner B they bake as
// bd-<recipe>-<B>, and the gap the pair stands apart (hips, metres) goes into out/hug-gaps.json
const GAPS = path.join(STAGE, "out", "hug-gaps.json");
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  page.on("pageerror", (e) => console.log("page:", e.message));
  if (process.env.LOG) page.on("console", (m) => console.log("log:", m.text()));
  if (process.env.LOG) await page.addInitScript(() => { window.__mlog = 1; });
  if (process.env.PAGE_FLAGS) await page.addInitScript((f) => { window.__flags = f; }, JSON.parse(process.env.PAGE_FLAGS));
  const open = async (b, partner) => {
    await page.goto(`http://127.0.0.1:8791/scripts/survivorz/_next/anim-build.html?body=/assets/downloads/survivorz/${glbOf(b)}${partner ? `&partner=/assets/downloads/survivorz/${glbOf(partner)}` : ""}`);
    await page.waitForFunction(() => window.build?.ready, null, { timeout: 180000 });
    const err = await page.evaluate(() => window.build.error); if (err) throw new Error(err);
  };
  const outDir = (b) => NEXTOUT ? (fs.mkdirSync(path.join(NEXTOUT, b), { recursive: true }), path.join(NEXTOUT, b)) : path.join(STAGE, "out", JSON.parse(fs.readFileSync(path.join(STAGE, "jobs", `${b}.json`), "utf8")).out);
  // --clean [substr]: the mocap clips' finger, thumb and toe defects taken out (anim-build.html
  // B.clean), each clip once (it is marked); then repack
  if (process.argv.includes("--clean")) {
    await open(body);
    const dir = outDir(body), sub = process.argv.slice(3).find((a) => !a.startsWith("--")) ?? "";
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !/^(bd|gr|gs|gp|hd|fz)-/.test(f) && f.includes(sub))) {
      const file = path.join(dir, f), j = JSON.parse(fs.readFileSync(file, "utf8"));
      if ((j.cleaned ?? 0) >= (/^zombie-/.test(body) ? 4 : 3) || !Array.isArray(j.tracks)) continue;
      const r = await page.evaluate((j) => { const x = window.build.clean(j); return { ...x, j }; }, j);
      fs.writeFileSync(file, JSON.stringify(r.j));
      if (r.clamped || r.popped) console.log(`${body}: ${f.replace(".json", "")} ${r.clamped} keys held in range, ${r.popped} pops taken out`);
    }
    return browser.close();
  }
  // --gun-cal: measure how a gun sits in this body's fist, into props/guns/cal.json
  if (process.argv.includes("--gun-cal")) {
    await open(body);
    // what's MEASURED (how the mocap held its rifle, the pistol's sight line) is each gun's AIM; the
    // STANDARD seat the game parents a gun with is how a hand really holds a grip (Oct 22 2026): the
    // grip along the palm's crease — the thumb side, 20 degrees toward the fingers — the palm on its
    // right side, the barrel the way the grip's lean then points. Seated at the mocap's angle, the
    // carbine's grip ran out of the palm toward the fingertips and the fingers curled in front of it
    const measured = await page.evaluate(() => window.build.gunCal());
    const pist = await page.evaluate(() => window.build.pistolCal());
    const holds = JSON.parse(fs.readFileSync(path.join(STAGE, "props", "guns", "guns.json"), "utf8"));
    const canon = (lean) => { const p = (lean - 20) * Math.PI / 180; return { z: [+Math.cos(p).toFixed(4), 0, +Math.sin(p).toFixed(4)], y: [+(-Math.sin(p)).toFixed(4), 0, +Math.cos(p).toFixed(4)] }; };
    const cal = { ...canon(holds.hk416.gripLean), reach: measured.reach, n: measured.n, aim: { z: measured.z, y: measured.y }, pistol: pist ? { ...canon(holds.pistol.gripLean), n: pist.n, aim: { z: pist.z, y: pist.y } } : null };
    const file = path.join(STAGE, "props", "guns", "cal.json");
    const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    all[body] = cal; fs.writeFileSync(file, JSON.stringify(all, null, 1));
    console.log(body, JSON.stringify(cal));
    return browser.close();
  }
  if (ZPAIR) {
    const { placeOf } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "..", "..", "docs", "survivorz", "anim-pairs.mjs")).href);
    // A ZOMBIE'S MOVE ON A SURVIVOR (the bites): baked on the zombie, the survivor its partner, as
    // zd-<recipe>-<survivor> in the zombie's out/, the survivor's place riding the clip (built.place)
    for (const z of ZOMBIES) for (const s of SURVIVORS) {
      if ((body && z !== body) || (only && s !== only)) continue;
      await open(z, s);
      // (ZONLY=<regex> bakes just the zombie recipes it matches — the finisher fits are 25 a pair)
      const want = process.env.ZONLY ? new RegExp(process.env.ZONLY) : null;
      // (a per-pair variant, recipe@<survivor>, is baked for its own survivor only, in place of the plain recipe)
      const zr = await page.evaluate(() => window.build.recipes("zombie"));
      for (const r of zr.filter((r) => (!want || want.test(r)) && (r.includes("@") ? r.endsWith("@" + s) : !zr.includes(`${r}@${s}`)))) {
        const id = `zd-${r.replace(/@.*$/, "").replace(/^zfit:/, "").replace(/^zbite-/, "bite-").replace(/^zkicked$/, "kicked")}-${s}`;
        // (a finisher's fit is baked where the pack puts the survivor: anim-pairs.mjs, in this zombie's frame)
        const fz = /^zfit:/.test(r) ? placeOf(r.slice(5)) : null;
        if (process.env.FIT_DEBUG) await page.evaluate(() => { globalThis.FIT_DEBUG = true; });
        await page.evaluate((p) => { window.build.presetPlace = p; }, fz ? { x: fz.bx, z: fz.bz, yaw: fz.byaw - (fz.ayaw ?? 0), y: -(fz.ay ?? 0) } : null);
        const j = await page.evaluate(([n, id]) => { const c = window.build.bake(n); c.name = id; return c; }, [r, id]);
        fs.writeFileSync(path.join(outDir(z), `${id}.json`), JSON.stringify(j));
        console.log(`${z} on ${s}: ${id} ${j.duration.toFixed(2)}s ${JSON.stringify(j.built.place ?? {})}`);
      }
    }
    return browser.close();
  }
  if (ZVICTIM) {
    // A SURVIVOR'S MOVE ON A ZOMBIE: baked on the survivor, the zombie its partner, as zv-<recipe>-<zombie>
    // in the survivor's out/. Where the zombie stands is the pair's own: the knife from the pack's front
    // grab (anim-pairs.mjs), the stamp from the zombie's zd-kicked-<survivor> (its built.place) — each
    // turned into the survivor's frame and handed to the page before the bake
    const { placeOf } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "..", "..", "docs", "survivorz", "anim-pairs.mjs")).href);
    const inv = (p) => { const a = -p.yaw * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); return { x: +(-p.x * c - p.z * sn).toFixed(3), z: +(p.x * sn - p.z * c).toFixed(3), yaw: -p.yaw }; };
    const PLACE = {
      "knife-head": () => { const o = placeOf("fz-front-struggle-start-idle"); return inv({ x: o.bx, z: o.bz, yaw: o.byaw - (o.ayaw ?? 0) }); },
      ...Object.fromEntries(["fz-back", "fz-back-v2", "fz-back-struggle-end", "fz-back-struggle-full", "fz-front-stand-v2", "fz-front-jump", "fz-front-struggle-end", "fz-front-struggle-full", "fz-lying-leg-back", "fz-lying-leg", "fz-lying", "fz-up-down", "fz-up-down-v2", "fz-up-down-v3"].map((c) => [`sfit:${c}`, () => { const o = placeOf(c); return { ...inv({ x: o.bx, z: o.bz, yaw: o.byaw - (o.ayaw ?? 0) }), y: o.ay ?? 0 }; }])),
      "kick-free": (z, s) => inv(JSON.parse(fs.readFileSync(path.join(outDir(z), `zd-kicked-${s}.json`), "utf8")).built.place),
    };
    for (const s of SURVIVORS) for (const z of ZOMBIES) {
      if ((body && s !== body) || (only && z !== only)) continue;
      await open(s, z);
      // (VONLY=<regex> bakes just the victim moves it matches)
      const vwant = process.env.VONLY ? new RegExp(process.env.VONLY) : null;
      for (const r of (await page.evaluate(() => window.build.recipes("victim"))).filter((r) => !vwant || vwant.test(r))) {
        const id = `zv-${r.replace(/^sfit:/, "")}-${z}`, place = PLACE[r]?.(z, s) ?? null;
        await page.evaluate((p) => { window.build.presetPlace = p; }, place);
        const j = await page.evaluate(([n, id]) => { const c = window.build.bake(n); c.name = id; return c; }, [r, id]);
        j.built.zombieAt = place;
        fs.writeFileSync(path.join(outDir(s), `${id}.json`), JSON.stringify(j));
        console.log(`${s} on ${z}: ${id} ${j.duration.toFixed(2)}s zombie at ${JSON.stringify(place)}`);
      }
    }
    return browser.close();
  }
  if (HUG) {
    const gaps = fs.existsSync(GAPS) ? JSON.parse(fs.readFileSync(GAPS, "utf8")) : {};
    for (const a of SURVIVORS) for (const b of SURVIVORS) {
      if (a === b || (body && a !== body) || (only && b !== only)) continue;
      await open(a, b);
      const gap = await page.evaluate(() => window.build.gap());
      (gaps[a] ??= {})[b] = +gap.toFixed(3);
      // (HONLY=<regex> bakes just the pair moves it matches)
      const hwant = process.env.HONLY ? new RegExp(process.env.HONLY) : null;
      for (const r of (await page.evaluate(() => window.build.recipes(true))).filter((r) => !hwant || hwant.test(r))) {
        const id = `bd-${r}-${b}`;
        const j = await page.evaluate(([n, id]) => { const c = window.build.bake(n); c.name = id; return c; }, [r, id]);
        fs.writeFileSync(path.join(outDir(a), `${id}.json`), JSON.stringify(j));
        if (j.built.stuck) console.log(`  ${id}: arm clearance gave up on ${j.built.stuck} arm-frames`);
      }
      console.log(`${a} with ${b}: gap ${gap.toFixed(3)} m`);
    }
    fs.writeFileSync(GAPS, JSON.stringify(gaps, null, 1));
  } else {
    await open(body);
    // [recipe]: an exact name, or a prefix ending in ":" or "*" (gr: = every HK416 clip; * = all)
    const match = (r) => !only || r === only || (/[:*]$/.test(only) && (only === "*" || r.startsWith(only.replace(/\*$/, ""))));
    const all = await page.evaluate(() => window.build.recipes(false));
    // the gun clips are many (two guns over the rifle set): baked only when asked for
    // (a recorded clip through the law, "lw:<clip>", is asked for by name: the list doesn't carry them)
    // (a per-pair variant, "recipe@other", is baked only by its exact name: the list leaves them out)
    for (const r of /^lwl?:/.test(only ?? "") || (only ?? "").includes("@") ? [only] : all.filter((r) => match(r) && (only || !r.includes(":")))) {
      const id = await page.evaluate((n) => window.build.idOf(n), r);
      const j = await page.evaluate(([n, id]) => { const c = window.build.bake(n); c.name = id; return c; }, [r, id]);
      fs.writeFileSync(path.join(outDir(body), `${id}.json`), JSON.stringify(j));
      console.log(`${body}: ${id} ${j.duration.toFixed(2)}s${j.built.lawLift ? `  — the law had to lift an arm ${j.built.lawLift} degrees: fix the recipe` : ""}${j.built.handOut ? `  — a hand went ${Math.round(j.built.handOut * 100)} cm round the body` : ""}`);
    }
  }
  await browser.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
