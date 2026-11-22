// SOLACE SURVIVORZ — renders the YouTube channel art (docs/survivorz/YOUTUBE.md §2).
//
//   node scripts/survivorz/render-youtube-art.mjs
//
// docs/survivorz/youtube/banner.html → banner.png (2560×1440) plus banner-crops.png, which shows
// what a TV, a desktop and a phone each actually see; avatar-tv.html → avatar-tv.png (the channel
// picture, 800×800). The two earlier avatar drafts' SVGs → their PNGs. Uses the installed Edge.

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "docs", "survivorz", "youtube");
const EDGE = process.env.SURVIVORZ_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await chromium.launch({ executablePath: EDGE });
try {
  // the banner
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.goto(pathToFileURL(path.join(DIR, "banner.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const banner = path.join(DIR, "banner.png");
  await page.screenshot({ path: banner });

  // what each screen shows: TV (all), desktop (2560×423 strip), phone (1546×423 middle)
  const uri = "data:image/png;base64," + fs.readFileSync(banner).toString("base64");
  const sheet = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await sheet.setContent(`<body style="margin:0;background:#1a1a1a;color:#ccc;font:16px sans-serif;padding:20px">
    <div>TV (whole image)</div><img src="${uri}" style="width:1280px;margin:6px 0 18px">
    <div>Desktop</div><div style="width:1280px;height:211px;overflow:hidden;margin:6px 0 18px"><img src="${uri}" style="width:1280px;margin-top:-254px"></div>
    <div>Phone</div><div style="width:773px;height:211px;overflow:hidden;margin:6px 0"><img src="${uri}" style="width:1280px;margin:-254px 0 0 -253px"></div>
  </body>`);
  await sheet.screenshot({ path: path.join(DIR, "banner-crops.png"), fullPage: true });

  // the channel picture
  const tv = await browser.newPage({ viewport: { width: 800, height: 800 } });
  await tv.goto(pathToFileURL(path.join(DIR, "avatar-tv.html")).href);
  await tv.evaluate(() => document.fonts.ready);
  await tv.screenshot({ path: path.join(DIR, "avatar-tv.png") });
  const tvUri = "data:image/png;base64," + fs.readFileSync(path.join(DIR, "avatar-tv.png")).toString("base64");
  const sizes = await browser.newPage({ viewport: { width: 560, height: 280 } });
  await sizes.setContent(`<body style="margin:0">${["#0f0f0f", "#ffffff"].map((bg) =>
    `<div style="display:flex;gap:28px;align-items:center;padding:20px;background:${bg}">${[240, 98, 48, 32]
      .map((px) => `<img src="${tvUri}" style="width:${px}px;height:${px}px;border-radius:50%">`).join("")}</div>`).join("")}</body>`);
  await sizes.screenshot({ path: path.join(DIR, "avatar-tv-sizes.png"), fullPage: true });

  // the earlier avatar drafts
  const av = await browser.newPage({ viewport: { width: 800, height: 800 } });
  for (const name of ["avatar-sz", "avatar-ring"]) {
    const svg = fs.readFileSync(path.join(DIR, `${name}.svg`), "utf8");
    await av.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await av.screenshot({ path: path.join(DIR, `${name}.png`), clip: { x: 0, y: 0, width: 800, height: 800 } });
  }
  console.log("wrote banner.png, banner-crops.png, avatar-tv.png, avatar-tv-sizes.png and the drafts in", path.relative(ROOT, DIR));
} finally {
  await browser.close();
}
