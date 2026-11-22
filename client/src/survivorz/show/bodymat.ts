// HOW A SURVIVORZ BODY'S MATERIALS ARE DRAWN, wherever a body is drawn: the show (actors.ts), the lobby
// (room/lobby.ts) and the character creator's preview (creator/BodyPreview.svelte). One rule, so a body never
// looks matte in one place and like wet plastic in another (Josh, Nov 11 2026: the preview still showed the
// Mixamo bodies shiny — it loaded the file's own materials).
import * as THREE from "three";

/** NO BODY IS A MIRROR (Josh, Nov 3 2026: "they sometimes reflect the overhead lights so much it blinds the
 *  camera"). The scanned survivors came out of their conversion at 40% metal (every one: metalness 0.4,
 *  roughness 0.707), Rollo's suit and the zombies' eyes at 100% — so skin and cloth threw the ceiling lights back
 *  like polished steel, and the bloom spread each highlight into a white blob. Skin and cloth are not metal: no
 *  metal map = 0; a metal map (a buckle, a visor) keeps a quarter of its factor; and nothing on a body is glossier
 *  than half-rough except an eye. Done to the file's own (shared) material, once.
 *
 *  THE MIXAMO BODIES (Josh, Nov 10 2026: "renner are quite shiny … chad are weirdly see through"), measured off
 *  the twelve creator bakes: their converter writes a metal map that is PURE WHITE (metal everywhere) at factor
 *  0.5, a roughness channel averaging 0.18–0.43 (wet plastic), KHR specular colour 2 on hair, and BLEND on body
 *  and hair materials whose texture alpha is solid but for strand edges — and a blended skin draws its own
 *  back half through its front. So: a metal map counts only on a part NAMED like metal (a helmet, a visor); a
 *  roughness map that reads glossier than ROUGH_FLOOR on average is DROPPED for a plain 0.8 (scaling it kept the
 *  darkest patches wet — Renner's camo still glinted, checked side by side); specular is halved; and a blended body is drawn CUT OUT (alpha test, depth
 *  written), which keeps hair strands and fixes the see-through. */
const tamed = new WeakSet<THREE.Material>();
const ROUGH_FLOOR = 0.65;
const METAL_PART = /helmet|visor|buckle|armou?r|metal|blade|gun/i;
export function tameBodyMaterial(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardMaterial;
  if (tamed.has(mat) || !("metalness" in m)) return;
  tamed.add(mat);
  m.metalness = m.metalnessMap && METAL_PART.test(m.name) ? Math.min(m.metalness, 0.25) : 0;
  if (!/cornea|eye/i.test(m.name)) {
    m.roughness = Math.max(m.roughness, 0.55);
    const g = m.roughnessMap ? meanChannel(m.roughnessMap, 1) : null;
    if (g && g * m.roughness < ROUGH_FLOOR) { m.roughnessMap = null; m.roughness = 0.8; m.needsUpdate = true; }
  }
  const p = m as THREE.MeshPhysicalMaterial;
  if (p.isMeshPhysicalMaterial) {
    p.specularIntensity = Math.min(p.specularIntensity, 0.5);
    p.specularColor.setRGB(Math.min(1, p.specularColor.r), Math.min(1, p.specularColor.g), Math.min(1, p.specularColor.b));
  }
  if (m.transparent) {
    m.transparent = false;
    m.alphaTest = Math.max(m.alphaTest, 0.5);
    m.depthWrite = true;
    m.needsUpdate = true;
  }
}

/** a texture channel's average (0–1), read off a 16×16 copy; null when the image can't be read */
function meanChannel(tex: THREE.Texture, ch: number): number | null {
  try {
    const img = tex.image as CanvasImageSource & { width?: number };
    if (!img || !img.width) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let s = 0;
    for (let i = ch; i < d.length; i += 4) s += d[i];
    return s / 256 / 255;
  } catch { return null; }
}

/** Every material on a loaded body, tamed (and the suit's hidden person kept hidden). */
export function tameBody(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (/body_proxy/.test(m.name)) { m.visible = false; return; }
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) tameBodyMaterial(x);
  });
}
