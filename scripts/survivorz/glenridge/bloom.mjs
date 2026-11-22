// SURVIVORZ, GLENRIDGE HALL: the glow round the lamps and lit windows that a camera gives a night shot (halation).
// Takes the bright parts of a render, blurs them wide, and lays them back over it.  node bloom.mjs <in.png> [out.png]
import sharp from "sharp";
const [src, dst = src] = process.argv.slice(2);
const base = sharp(src); const { width, height } = await base.metadata();
const bright = await sharp(src).removeAlpha().linear(2.2, -255 * 1.25).toBuffer();          // keep only what is nearly white
const layers = [];
for (const [sigma, gain] of [[Math.max(2, width / 320), 0.9], [width / 90, 0.7], [width / 28, 0.5]])
  layers.push({ input: await sharp(bright).blur(sigma).linear(gain, 0).png().toBuffer(), blend: "screen" });
await sharp(await base.removeAlpha().toBuffer()).composite(layers).png().toFile(dst + ".tmp.png");
const fs = await import("node:fs"); fs.renameSync(dst + ".tmp.png", dst);
console.log("bloom", dst, width + "x" + height);
