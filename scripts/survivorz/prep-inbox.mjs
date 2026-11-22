// SURVIVORZ: readies the BOUGHT packs from assets/New Assets (Fab FBX packs and two loose
// files) for scripts/survivorz/pack-props.mjs. FBX2glTF converts the meshes but loses or
// half-binds the textures, so every texture is bound here by hand, the way each pack's own
// files are named. Output: assets/downloads/survivorz/originals/inbox/ready/<id>.glb
// (plain glTF with PNG textures; the packer does the sizing and KTX2).
//
//   1. unzip the packs into originals/inbox/<pack>/ and convert the FBX files with
//      node_modules/fbx2gltf (FBX2glTF.exe -b) into originals/inbox/glb/  (done once by hand)
//   2. node scripts/survivorz/prep-inbox.mjs [id ...]
//
// NORMAL MAPS: these packs are made for Unreal, whose normal maps are DirectX (green
// down); glTF wants OpenGL (green up), so every one has its green channel inverted here.
// The melee pack's readme says so outright; the others follow Unreal's naming (SM_, T_, MI_).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const IN = path.join(ROOT, "assets", "downloads", "survivorz", "originals", "inbox");
const OUT = path.join(IN, "ready");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "solace-inbox-"));

const MELEE = "meleehousehold/MeleeHousehold/textures/T_MeleeHousehold_";
const MELEE_SET = { base: MELEE + "BC.png", normal: MELEE + "N.png", orm: MELEE + "ORM.png" };
const AID = "firstaidprops/FirstAidProps/Textures/T_Props_";
const AID_SET = { base: AID + "D.png", normal: AID + "N.png", rough: AID + "R.png", metal: AID + "M.png", ao: AID + "AO.png" };
const AID_MATS = { Props01: AID_SET, "Props01 Translucid": { ...AID_SET, alpha: AID + "Opacity.png" } };
const CARD = "electronic_acces_cards_fbx/Electronic_acces_cards_FBX/Textures/key_card_";
const CARD_MATS = { key_card: { base: CARD + "BaseColor.png", normal: CARD + "Normal.png", rough: CARD + "Roughness.png", metal: CARD + "Metallic.png" } };
const LAB = "laboratory_doors_nakedsingularity/Laboratory_doors_NakedSingularity/Textures/T_";
const labSet = (m, glass) => ({ base: `${LAB}${m}_Diffuse.${glass ? "png" : "jpg"}`, normal: `${LAB}${m}_Normal.jpg`, rough: `${LAB}${m}_Roughness.jpg`, metal: `${LAB}${m}_Metalic.jpg`,
  ao: fs.existsSync(path.join(IN, `${LAB}${m}_AmbientOcclusion.jpg`)) ? `${LAB}${m}_AmbientOcclusion.jpg` : `${LAB}${m}_Ambient.jpg`,
  ...(fs.existsSync(path.join(IN, `${LAB}${m}_Emissive.jpg`)) ? { emissive: `${LAB}${m}_Emissive.jpg` } : {}), ...(glass ? { blend: true } : {}) });
const LAB_MATS = Object.fromEntries(["double_door_metal", "single_door_metal", "Door_override_metal"].map((m) => [m, labSet(m, false)])
  .concat(["double_door_glass", "single_door_glass"].map((m) => [m, labSet(m, true)])));
const SCOPE = "sf_microscope_nakedsingularity/SF_Microscope_NakedSingularity/T_SM_Microscope_02_sub_plas_";
const BSC = "biosafety_cabinet_nakedsingularity/Biosafety_cabinet_NakedSingularity/Textures/T_biosafety_";
const bscSet = (m, extra = {}) => ({ base: `${BSC}${m}_Diffuse.png`, normal: `${BSC}${m}_Normal.png`, rough: `${BSC}${m}_Roughness.jpg`, metal: `${BSC}${m}_Metalic.jpg`, ao: `${BSC}${m}_AmbientOcclusion.jpg`, ...extra });

/** id → the converted glb, which nodes to drop or keep, and how its materials bind */
export const INBOX = {
  "lead-pipe": { glb: "glb/SM_BentLeadPipe.glb", drop: /^UCX_/, mats: { M_MeleeHousehold: MELEE_SET }, pack: "Melee Weapons – Improvised & Household (Shoestring Studios)" },
  "claw-hammer": { glb: "glb/SM_ClawHammer.glb", drop: /^UCX_/, mats: { M_MeleeHousehold: MELEE_SET }, pack: "Melee Weapons – Improvised & Household (Shoestring Studios)" },
  crowbar: { glb: "glb/SM_Crowbar.glb", drop: /^UCX_/, mats: { M_MeleeHousehold: MELEE_SET }, pack: "Melee Weapons – Improvised & Household (Shoestring Studios)" },
  "fire-extinguisher": { glb: "glb/SM_FireExtinguisher.glb", drop: /^UCX_/, mats: { M_MeleeHousehold: MELEE_SET }, pack: "Melee Weapons – Improvised & Household (Shoestring Studios)" },
  bandage: { glb: "glb/SM_Bandage.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "bandage-box": { glb: "glb/SM_BandageBox.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "first-aid-kit": { glb: "glb/SM_FirstAidKit.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "first-aid-kit-b": { glb: "glb/SM_FirstAidKit01.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "pill-blister": { glb: "glb/SM_MedicineBlister.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "pill-bottle-b": { glb: "glb/SM_PillBottle.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  ampoule: { glb: "glb/SM_AmpouleBottle.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "syringe-b": { glb: "glb/SM_Syringe.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "medical-tape": { glb: "glb/SM_Micropore.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "medical-scissors": { glb: "glb/SM_MedicalScissors.glb", mats: AID_MATS, pack: "First Aid Props (Diogo Dzn)" },
  "keycard-a": { glb: "glb/SM_Electronic_Access_Cards_A.glb", mats: CARD_MATS, pack: "Electronic Access Keycards (Ryptimal)" },
  "keycard-b": { glb: "glb/SM_Electronic_Access_Cards_B.glb", mats: CARD_MATS, pack: "Electronic Access Keycards (Ryptimal)" },
  "keycard-c": { glb: "glb/SM_Electronic_Access_Cards_C.glb", mats: CARD_MATS, pack: "Electronic Access Keycards (Ryptimal)" },
  "lab-door-double": { glb: "glb/Laboratory_doors_NakedSingularity.glb", keep: /^Double_door/, doors: { frame: "Double_door_frame_NakedSingularity", leaves: ["Double_door_left_NakedSingularity", "Double_door_right_NakedSingularity"] }, mats: LAB_MATS, pack: "Laboratory doors (Naked Singularity)" },
  "lab-door-single": { glb: "glb/Laboratory_doors_NakedSingularity.glb", keep: /^Single_door/, doors: { frame: "Single_door_frame_NakedSingularity", leaves: ["Single_door_leaf_NakedSingularity"] }, mats: LAB_MATS, pack: "Laboratory doors (Naked Singularity)" },
  "lab-door-override": { glb: "glb/Laboratory_doors_NakedSingularity.glb", keep: /^Door_override_NakedSingularity$/, mats: LAB_MATS, pack: "Laboratory doors (Naked Singularity)" },
  "microscope-lab": { glb: "glb/Microscope_NakedSingularity.glb", mats: { mat: { base: SCOPE + "D.jpg", normal: SCOPE + "N.jpg", orm: SCOPE + "ORM.jpg", emissive: SCOPE + "E.jpg" } }, pack: "SF Microscope (Naked Singularity)" },
  "backpack-small": { glb: "glb/backpack.glb", keep: /^SM_Acc_GApart_Backpack01A/, drop: /^(Light|Camera)$/, tga: true, mask: true, pack: "Survival Backpacks (G-Star)" },
  "backpack-large": { glb: "glb/backpack.glb", keep: /^SM_Gear_BackPack_lrg_01A/, drop: /^(Light|Camera)$/, tga: true, pack: "Survival Backpacks (G-Star)" },
  holster: { glb: "leg_gun_holster.glb", drop: /^Gun/, pack: "Drop-Leg Holster (3dia)" },
  // bought 2026-10-26 (the security hall's screening point, and the labs to come)
  "xray-scanner": { glb: "glb/xray-scanner.glb", pack: "Modern Airport X-Ray Baggage Scanner (Wanted199514)" },
  "biosafety-cabinet": { glb: "glb/biosafety-cabinet.glb", mats: {
    MI_Biosafety_cabinet_main: bscSet("main", { emissive: `${BSC}main_Emissive.png` }),
    MI_Biosafety_cabinet_net: bscSet("net", { alpha: `${BSC}net_Mask.jpg`, mask: true }),
    MI_Biosafety_cabinet_glass: bscSet("glass", { blend: true }),
  }, pack: "Biosafety Cabinet (Naked Singularity)" },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const read = (rel) => fs.readFileSync(path.join(IN, rel));
const png = (img) => sharp(img).png().toBuffer();
/** DirectX → OpenGL: invert the green channel */
async function flipGreen(img) {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 1; i < data.length; i += 4) data[i] = 255 - data[i];
  return sharp(data, { raw: info }).png().toBuffer();
}
/** glTF's metallicRoughness: G = roughness, B = metal (R left at AO when there is one) */
async function packMR(roughRel, metalRel, aoRel) {
  const r = await sharp(read(roughRel)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = r.info;
  const chan = async (rel, fill) => rel ? (await sharp(read(rel)).greyscale().resize(width, height).raw().toBuffer()) : Buffer.alloc(width * height, fill);
  const ao = await chan(aoRel, 255), metal = await chan(metalRel, 0);
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) { out[i * 3] = ao[i]; out[i * 3 + 1] = r.data[i]; out[i * 3 + 2] = metal[i]; }
  return sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
async function withAlpha(baseRel, alphaRel) {
  const base = await sharp(read(baseRel)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = await sharp(read(alphaRel)).greyscale().resize(base.info.width, base.info.height).raw().toBuffer();
  return sharp(base.data, { raw: base.info }).joinChannel(a, { raw: { width: base.info.width, height: base.info.height, channels: 1 } }).png().toBuffer();
}
/** a TGA the converter embedded (glTF can't carry TGA), through ffmpeg to PNG */
function tgaToPng(bytes) {
  const t = path.join(TMP, `t${Math.random().toString(36).slice(2)}.tga`), p = t.replace(/\.tga$/, ".png");
  fs.writeFileSync(t, bytes);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", t, p]);
  const b = fs.readFileSync(p); fs.rmSync(t); fs.rmSync(p);
  return b;
}

// DOORS. The lab door pack models some leaves swung OPEN (their geometry runs along z, across
// the frame) and puts the leaf nodes' origins nowhere near the hinge; the double door's right
// leaf is closed only by its node's rotation. Every leaf comes out CLOSED in its frame with its
// geometry baked in place, its node's origin ON the hinge line (swinging it = turning the node
// about Y) and no rotation on the node. Node and mesh names are kept (the effects' anchor table
// names them). The closed position copies the one closed leaf the pack ships, the double's
// right: its thickness centred ZOFF in front of the frame's middle, its hinge HINGE_IN outboard
// of where an open leaf's centreline stands.
const HINGE_IN = 0.055, ZOFF = -0.0675;
function worldPoints(node, attr) {
  const W = node.getWorldMatrix(), out = [];
  for (const p of node.getMesh().listPrimitives()) {
    const a = p.getAttribute(attr); if (!a) continue;
    const v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      out.push(attr === "POSITION"
        ? [W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]]
        : [W[0] * v[0] + W[4] * v[1] + W[8] * v[2], W[1] * v[0] + W[5] * v[1] + W[9] * v[2], W[2] * v[0] + W[6] * v[1] + W[10] * v[2]]);
    }
  }
  return out;
}
const boundsOf = (pts) => ({ min: [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), max: [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))) });
function closeDoors(root, { frame, leaves }) {
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const fb = boundsOf(worldPoints(byName.get(frame), "POSITION"));
  const fc = fb.min.map((v, k) => (v + fb.max[k]) / 2);
  for (const name of leaves) {
    const node = byName.get(name);
    const b = boundsOf(worldPoints(node, "POSITION"));
    const ex = b.max[0] - b.min[0], ez = b.max[2] - b.min[2];
    let hinge, toLocal, turnNormal;
    if (ez > ex) {
      // open: turn it shut about its hinge, toward the opening's middle
      const c = (b.min[0] + b.max[0]) / 2;
      const zn = Math.abs(b.min[2] - fc[2]) < Math.abs(b.max[2] - fc[2]) ? b.min[2] : b.max[2];
      const zf = zn === b.min[2] ? b.max[2] : b.min[2];
      const d = Math.sign(zf - zn), s = Math.sign(fc[0] - c);
      hinge = [c - s * HINGE_IN, fb.min[1], fc[2] + ZOFF];
      toLocal = (w) => [s * d * (w[2] - zn), w[1] - hinge[1], -s * d * (w[0] - c)];
      turnNormal = (n) => [s * d * n[2], n[1], -s * d * n[0]];
    } else {
      // already shut: only move the origin to the hinge (the end farthest from the opening's middle)
      const hx = Math.abs(b.min[0] - fc[0]) > Math.abs(b.max[0] - fc[0]) ? b.min[0] : b.max[0];
      hinge = [hx, fb.min[1], (b.min[2] + b.max[2]) / 2];
      toLocal = (w) => [w[0] - hinge[0], w[1] - hinge[1], w[2] - hinge[2]];
      turnNormal = (n) => n;
    }
    // bake: each primitive's positions and normals rewritten in the hinge's frame
    const W = node.getWorldMatrix();
    for (const p of node.getMesh().listPrimitives()) {
      for (const attr of ["POSITION", "NORMAL"]) {
        const a = p.getAttribute(attr); if (!a) continue;
        const out = new Float32Array(a.getCount() * 3), v = [0, 0, 0];
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, v);
          const r = [W[0] * v[0] + W[4] * v[1] + W[8] * v[2], W[1] * v[0] + W[5] * v[1] + W[9] * v[2], W[2] * v[0] + W[6] * v[1] + W[10] * v[2]];
          let o;
          if (attr === "POSITION") o = toLocal([r[0] + W[12], r[1] + W[13], r[2] + W[14]]);
          else { const t = turnNormal(r), l = Math.hypot(...t) || 1; o = t.map((x) => x / l); }
          out.set(o, i * 3);
        }
        p.setAttribute(attr, a.clone().setArray(out));
      }
    }
    // the leaf hangs straight off the root (whose transform is identity), its origin on the hinge
    node.setTranslation(hinge).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    const lb = boundsOf(worldPoints(node, "POSITION"));
    console.log(`  ${name}: ${ez > ex ? "shut" : "was shut"}, hinge ${hinge.map((v) => v.toFixed(3)).join(",")}, leaf x ${lb.min[0].toFixed(3)}..${lb.max[0].toFixed(3)} z ${lb.min[2].toFixed(3)}..${lb.max[2].toFixed(3)} (frame x ${fb.min[0].toFixed(3)}..${fb.max[0].toFixed(3)} z ${fb.min[2].toFixed(3)}..${fb.max[2].toFixed(3)})`);
  }
}

async function prep(id) {
  const s = INBOX[id];
  const doc = await io.read(path.join(IN, s.glb));
  const root = doc.getRoot();
  for (const c of root.listCameras()) c.dispose();
  // node selection: drop matching nodes; with `keep`, drop every mesh node that doesn't match
  for (const n of root.listNodes()) {
    if (s.drop?.test(n.getName())) { n.dispose(); continue; }
    if (s.keep && n.getMesh() && !s.keep.test(n.getName()) && !n.listParents().some((p) => p.getName && s.keep.test(p.getName()))) n.dispose();
  }
  const tex = async (bytes, name) => doc.createTexture(name).setImage(new Uint8Array(bytes)).setMimeType("image/png");
  for (const m of root.listMaterials()) {
    const b = s.mats?.[m.getName()];
    if (b) {
      // replace whatever the converter bound
      m.setBaseColorTexture(await tex(b.alpha ? await withAlpha(b.base, b.alpha) : await png(read(b.base)), `${m.getName()}-base`));
      m.setBaseColorFactor([1, 1, 1, 1]);
      if (b.normal) m.setNormalTexture(await tex(await flipGreen(read(b.normal)), `${m.getName()}-normal`));
      if (b.orm) {
        const orm = await tex(await png(read(b.orm)), `${m.getName()}-orm`);
        m.setMetallicRoughnessTexture(orm).setOcclusionTexture(orm).setMetallicFactor(1).setRoughnessFactor(1);
      } else if (b.rough) {
        const mr = await tex(await packMR(b.rough, b.metal, b.ao), `${m.getName()}-mr`);
        m.setMetallicRoughnessTexture(mr).setMetallicFactor(b.metal ? 1 : 0).setRoughnessFactor(1);
        if (b.ao) m.setOcclusionTexture(mr);
      }
      if (b.emissive) m.setEmissiveTexture(await tex(await png(read(b.emissive)), `${m.getName()}-emissive`)).setEmissiveFactor([1, 1, 1]);
      if (b.alpha || b.blend) m.setAlphaMode("BLEND");
      if (b.mask) m.setAlphaMode("MASK").setAlphaCutoff(0.5);   // a cut-out (a mesh grille), not see-through
    }
    if (s.tga) {
      // the converter's TGAs become PNGs; DirectX normals flipped
      for (const [get, isNormal] of [[() => m.getBaseColorTexture(), false], [() => m.getNormalTexture(), true]]) {
        const t = get(); if (!t?.getImage()) continue;
        let bytes = Buffer.from(t.getImage());
        if (/\.tga$/i.test(t.getURI() || t.getName()) || t.getMimeType() === "image/x-tga" || !t.getSize()) bytes = tgaToPng(bytes);
        if (isNormal) bytes = await flipGreen(bytes);
        t.setImage(new Uint8Array(bytes)).setMimeType("image/png").setURI("");
      }
    }
    if (s.mask && m.getAlphaMode() === "BLEND") m.setAlphaMode("MASK").setAlphaCutoff(0.5);
  }
  if (s.doors) closeDoors(root, s.doors);
  await doc.transform(prune());
  fs.mkdirSync(OUT, { recursive: true });
  await io.write(path.join(OUT, `${id}.glb`), doc);
  return `${(fs.statSync(path.join(OUT, `${id}.glb`)).size / 1e6).toFixed(1)} MB, ${root.listMeshes().length} meshes, ${root.listTextures().length} textures`;
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(INBOX);
for (const id of ids) {
  try { console.log(`${id.padEnd(20)} ${await prep(id)}`); }
  catch (e) { console.log(`${id.padEnd(20)} FAILED ${e.message}`); }
}
fs.rmSync(TMP, { recursive: true, force: true });
