// SolaceBackrooms asset prep — processes Josh's licensed packs from the repo
// root `assets/` folder (GITIGNORED — their licenses forbid redistribution as
// raw files) into game/public/assets/ (also gitignored; the vite build
// bundles them into the installer, which is normal in-project use).
//
//   cd game && node scripts/prepare-assets.mjs
//
// Sources (drop the packs in <repo>/assets/):
// - TheBackroomsAndPoolrooms_Textures  → walls (3 wallpaper variants), floor,
//   ceiling (one tile CROPPED from the pack's UV atlas), light panel maps
// - Hazmat PS1 v1.1.1                  → the player model + yellow skin
// - Liminal Worlds Music & Ambience Pack → Fluorescent Static (WAV→OGG)
//
// Needs ffmpeg (winget install; the path below matches this machine).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, "..", "..");
const SRC = path.join(REPO, "assets");
const OUT = path.join(here, "..", "public", "assets");
const BR = path.join(SRC, "TheBackroomsAndPoolrooms_Textures", "Textures", "The Backrooms");

const FFMPEG = existsSync("C:\\Users\\josh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe")
  ? "C:\\Users\\josh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe"
  : "ffmpeg";

const ff = (args) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const cp = (from, to) => {
  copyFileSync(from, to);
  console.log("  +", path.basename(to));
};

mkdirSync(path.join(OUT, "br"), { recursive: true });
mkdirSync(path.join(OUT, "hazmat"), { recursive: true });

// ---- Walls: three wallpaper variants (district flavor) ---------------------
console.log("walls");
for (const [dir, name] of [["Wallpaper", "wall1"], ["Wallpaper02", "wall2"], ["Wallpaper03", "wall3"]]) {
  cp(path.join(BR, dir, "Wall_large_mat_tx_BaseColor_sRGB.png"), path.join(OUT, "br", `${name}_color.png`));
  cp(path.join(BR, dir, "Wall_large_mat_tx_Normal_Raw.png"), path.join(OUT, "br", `${name}_normal.png`));
  cp(path.join(BR, dir, "Wall_large_mat_tx_Roughness_Raw.png"), path.join(OUT, "br", `${name}_rough.png`));
}

// ---- Floor -----------------------------------------------------------------
console.log("floor");
cp(path.join(BR, "Floor", "Floor_mat_tx_BaseColor_sRGB.png"), path.join(OUT, "br", "floor_color.png"));
cp(path.join(BR, "Floor", "Floor_mat_tx_Normal_Raw.png"), path.join(OUT, "br", "floor_normal.png"));
cp(path.join(BR, "Floor", "Floor_mat_tx_Roughness_Raw.png"), path.join(OUT, "br", "floor_rough.png"));

// ---- Ceiling: crop ONE acoustic tile from the pack's UV atlas --------------
// The 512px atlas has a 3-wide strip of speckled tiles across the top; one
// tile (incl. its grout line) is ~170x163 at the origin. Cropping keeps the
// grid when repeated.
console.log("ceiling (atlas crop)");
for (const [map, out] of [["BaseColor_sRGB", "ceiling_color.png"], ["Normal_Raw", "ceiling_normal.png"], ["Roughness_Raw", "ceiling_rough.png"]]) {
  ff(["-i", path.join(BR, "Ceiling", `Ceiling_mat_tx_${map}.png`), "-vf", "crop=170:163:0:0", path.join(OUT, "br", out)]);
  console.log("  +", out);
}

// ---- Light panels ----------------------------------------------------------
// The pack's panel texture is UV-mapped for its FBX fixture — the lit tube
// sits OFF-CENTER (left column of the image). Crop the tube region so the
// flat panel quad glows centered (Josh's catch).
console.log("light panel (tube crop)");
ff([
  "-i",
  path.join(BR, "Ceiling_light_large", "Ceiling_light_large_mat_tx_BaseColor_sRGB.png"),
  "-vf",
  "crop=210:430:25:65",
  path.join(OUT, "br", "panel_color.png"),
]);
console.log("  + panel_color.png");
ff([
  "-i",
  path.join(BR, "Ceiling_light_large", "Ceiling_light_large_mat_tx_Emissive_sRGB.png"),
  "-vf",
  "crop=210:430:25:65",
  path.join(OUT, "br", "panel_emissive.png"),
]);
console.log("  + panel_emissive.png");

// ---- The hazmat player model ----------------------------------------------
console.log("hazmat");
cp(path.join(SRC, "Hazmat PS1 v1.1.1", "Hazmat.fbx"), path.join(OUT, "hazmat", "hazmat.fbx"));
cp(path.join(SRC, "Hazmat PS1 v1.1.1", "Hazmat Yellow.png"), path.join(OUT, "hazmat", "hazmat_yellow.png"));

// ---- Footsteps: Josh's carpet-walk sample, WAV → OGG -----------------------
const stepsOut = path.join(OUT, "footsteps.ogg");
if (!existsSync(stepsOut)) {
  console.log("footsteps (wav → ogg)");
  ff(["-i", path.join(SRC, "Walk on Carpet Sound Effect.wav"), "-c:a", "libvorbis", "-q:a", "5", stepsOut]);
  console.log("  + footsteps.ogg");
} else {
  console.log("= footsteps.ogg present");
}

// ---- Ambience: Fluorescent Static, WAV → OGG loop --------------------------
const ambOut = path.join(OUT, "ambience.ogg");
if (!existsSync(ambOut)) {
  console.log("ambience (wav → ogg, ~q4)");
  ff([
    "-i",
    path.join(SRC, "Liminal Worlds Music & Ambience Pack", "Liminal Worlds Music & Ambience Pack", "Ambience", "Fluorescent Static.wav"),
    "-c:a",
    "libvorbis",
    "-q:a",
    "4",
    ambOut,
  ]);
  console.log("  + ambience.ogg");
} else {
  console.log("= ambience.ogg present");
}

// ---- Mirror into the CLIENT (the embedded game is the primary way to play;
// client/public/assets is COMMITTED so the server build can serve it) -------
const CLIENT_OUT = path.join(REPO, "client", "public", "assets");
cpSync(OUT, CLIENT_OUT, { recursive: true });
console.log("mirrored →", CLIENT_OUT);

console.log("done.");
