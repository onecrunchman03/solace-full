// SURVIVORZ: writes the retarget job lists (assets/downloads/survivorz/jobs/)
// from what is staged in assets/downloads/survivorz/src — which clips the
// survivors get, which the zombies get, and how much of each long take to keep.
//
//   node scripts/survivorz/manifest.mjs
//   node scripts/survivorz/retarget-batch.cjs assets/downloads/survivorz/jobs/<body>.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bodies from "./bodies.cjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STAGE = path.join(ROOT, "assets", "downloads", "survivorz");
const URL = "/assets/downloads/survivorz";

// a long take kept to its first N seconds (a survivor fidgets for a few seconds,
// and every second is ~50KB of JSON before packing)
const UNTIL = { terrified: 10, typing: 10, "looking-through-files-low": 10 };
const HW_UNTIL = 10;

// Mixamo clips that are ZOMBIE moves; everything else on the Mixamo shelf is a survivor's
const isZombieMx = (id) => id.startsWith("zombie-");
// ...and the human falls/reactions a zombie can use too
const ZOMBIE_TOO = ["falling-down", "knocked-down", "getting-up", "getting-up-1", "hit-reaction", "hit-reaction-1",
  "shoulder-hit-and-fall", "stunned", "standing-react-large-from-right", "injured-crawling",
  "pro-rifle-pack--death-from-the-front", "pro-rifle-pack--death-from-the-back", "pro-rifle-pack--death-from-right",
  "pro-rifle-pack--death-from-front-headshot", "pro-rifle-pack--death-from-back-headshot"];

const UAL1_SURV = ["Crouch_Fwd_Loop", "Crouch_Idle_Loop", "Death01", "Fixing_Kneeling", "Hit_Chest", "Hit_Head",
  "Idle_Loop", "Idle_Talking_Loop", "Idle_Torch_Loop", "Interact", "Jog_Fwd_Loop", "Jump_Land", "Jump_Loop",
  "Jump_Start", "PickUp_Table", "Pistol_Aim_Down", "Pistol_Aim_Neutral", "Pistol_Aim_Up", "Pistol_Idle_Loop",
  "Pistol_Reload", "Pistol_Shoot", "Punch_Cross", "Punch_Jab", "Push_Loop", "Roll", "Sitting_Enter", "Sitting_Exit",
  "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Sprint_Loop", "Swim_Fwd_Loop", "Swim_Idle_Loop", "Sword_Attack",
  "Sword_Idle", "Walk_Loop"];
const UAL2_SURV = ["Chest_Open", "ClimbUp_1m", "Consume", "Farm_Harvest", "Farm_PlantSeed", "Hit_Knockback",
  "Idle_FoldArms_Loop", "Idle_Lantern_Loop", "Idle_No_Loop", "Idle_Rail_Call", "Idle_Rail_Loop",
  "Idle_TalkingPhone_Loop", "LayToIdle", "Melee_Hook", "Melee_Hook_Rec", "OverhandThrow", "Sword_Block",
  "Sword_Heavy_Combo", "Sword_Regular_A", "Sword_Regular_A_Rec", "Sword_Regular_B", "Sword_Regular_B_Rec",
  "Sword_Regular_C", "Sword_Regular_Combo", "TreeChopping_Loop", "Walk_Carry_Loop", "Yes"];
const UAL1_ZOMB = ["Death01", "Hit_Chest", "Hit_Head", "Crouch_Idle_Loop"];
const UAL2_ZOMB = ["Zombie_Idle_Loop", "Zombie_Scratch", "Zombie_Walk_Fwd_Loop", "Hit_Knockback"];
// the Halloween mocap: walks, attacks and the two giants — never the vampire or the spells
const HW_ZOMB = /^(0[1-6]|1[2-9])_/;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const surv = [], zomb = [];
for (const f of fs.readdirSync(path.join(STAGE, "src", "mixamo")).sort()) {
  const id = f.replace(/\.glb$/, "");
  if (id.endsWith("x-bot")) continue;
  const job = { id: "mx-" + id, src: `${URL}/src/mixamo/${f}` };
  if (UNTIL[id]) job.until = UNTIL[id];
  if (isZombieMx(id)) { zomb.push(job); continue; }
  surv.push(job);
  if (ZOMBIE_TOO.includes(id)) zomb.push(job);
}
for (const [file, keep, list] of [["UAL1", UAL1_SURV, surv], ["UAL2", UAL2_SURV, surv], ["UAL1", UAL1_ZOMB, zomb], ["UAL2", UAL2_ZOMB, zomb]]) {
  for (const clip of keep) list.push({ id: `${file.toLowerCase()}-${slug(clip)}`, src: `${URL}/src/ual/${file}.glb`, clip });
}
for (const f of fs.readdirSync(path.join(STAGE, "src", "hw")).filter((f) => f.endsWith(".glb") && HW_ZOMB.test(f)).sort()) {
  const until = /walk/i.test(f) ? HW_UNTIL : undefined;
  zomb.push({ id: "hw-" + slug(f.replace(/_ue5\.glb$/, "")), src: `${URL}/src/hw/${f}`, ...(until ? { until } : {}) });
}

// the Brutal Zombie Finisher pack (bought, Oct 2026): every attack is a PAIR — the zombie
// plays the attack (ACT), the survivor plays its _React. The files are skeleton-only, so the
// UE5 mannequin's rest pose is borrowed from a Halloween file (retarget.html ?rest=), and the
// pair keeps its travel: the two bodies meet where the pack placed them.
const FZ_REST = `${URL}/src/hw/12_Attack_01_ue5.glb`;
const fz = (f) => "fz-" + slug(f.replace(/^AS_ZF_/, "").replace(/.glb$/, ""));
const fzFiles = fs.readdirSync(path.join(STAGE, "src", "finisher")).filter((f) => f.endsWith(".glb") && /^AS_ZF_/.test(f));   // not the bare Skeleton file
for (const f of fzFiles.filter((f) => !/_React.glb$/.test(f)).sort()) {
  zomb.push({ id: fz(f), src: `${URL}/src/finisher/${f}`, rest: FZ_REST, travel: true });
  const react = f.replace(/.glb$/, "_React.glb");
  if (fzFiles.includes(react)) surv.push({ id: fz(f), src: `${URL}/src/finisher/${react}`, rest: FZ_REST, travel: true });
}

// THE TURNED (Oct 23 2026): a survivor who turns rises as a zombie in their OWN body (SURVIVORZ.md §6),
// so every zombie move goes onto the survivors too — the walks, idles, attacks, the stand-up, the
// deaths. A finisher's ATTACK side keeps its pair's name with "fza-" for "the zombie's half": the
// survivors already carry the same pair's REACT side under "fz-"
{
  const have = new Set(surv.map((j) => j.id));
  for (const j of zomb) {
    if (j.id.startsWith("fz-")) surv.push({ ...j, id: "fza-" + j.id.slice(3) });
    else if (!have.has(j.id) && !/giant/.test(j.id)) surv.push(j);   // (not the giants: a person turned is still person-sized)
  }
}

// moves BUILT IN CODE on a clip we have (scripts/survivorz/anim-recipes.js, baked by
// anim-build.cjs): listed so pack.mjs packs them; retarget-batch.cjs skips them
// the hug is built per pair by anim-build.cjs --hug, not listed here
for (const r of ["shiver", "cough", "hammer", "bandage"]) surv.push({ id: `bd-${r}`, built: r });

// one list per body: every Renderpeople body bakes the survivors' clips on its
// OWN bind pose (they come in two bind families, 45-51 degrees apart at the arms),
// and each zombie bakes the zombies' clips. Sheets only for one body per family.
// (the list lives in bodies.cjs: the seven made by hand, then every body the creator took in —
// each is renamed to the Renderpeople bones at intake, so they all bake as "rp")
const RP = Object.fromEntries(Object.entries(bodies.survivorBodies()).map(([id, b]) => [id, b.target]));
// ONLY=<body> writes just that body's list (the creator bakes one body at a time)
const ONLY_BODY = process.env.ONLY;
const SHEETS = new Set(["eric", "nathan", "zombie-m01", "zombie-f01"]);
fs.mkdirSync(path.join(STAGE, "jobs"), { recursive: true });
const write = (name, target, tfam, jobs) =>
  fs.writeFileSync(path.join(STAGE, "jobs", `${name}.json`), JSON.stringify({ target: `${URL}/targets/${target}`, tfam, out: name, sheets: SHEETS.has(name), jobs }, null, 1));
for (const [who, file] of Object.entries(RP)) if (!ONLY_BODY || who === ONLY_BODY) write(who, file, "rp", surv);
// the zombies come out of scripts/survivorz/zombie-export.py (skin baked) into zombies/
if (!ONLY_BODY) for (const f of fs.readdirSync(path.join(STAGE, "zombies")).filter((f) => /^zombie-.*\.glb$/.test(f)).sort()) write(f.replace(/\.glb$/, ""), `../zombies/${f}`, "zombie", zomb);
console.log(`survivors ${surv.length} clips × ${Object.keys(RP).length} bodies; zombies ${zomb.length} clips`);
