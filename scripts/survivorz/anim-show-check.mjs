// SURVIVORZ: THE SHOW'S CLIP CHOICE, checked headless on every body (Oct 28 2026 — Josh: "go over their
// animations and make sure nothing is bugged").
//
// Loads each game/*.glb in plain Node (lib-loadbody.mjs: three's GLTFLoader, meshopt decoded, no textures)
// and walks EVERY state the sim can send through the client's own picker (client/src/survivorz/show/
// stance.ts — the same functions actors.ts calls): pose × what's in the hands × calm/ready × hurt × speed
// for the survivors, pose × kind × speed for the dead, and every one-shot. For each pick it asserts:
//   · a clip came back, the body HAS it, and it isn't one that fails the laws on this body
//   · played through three's mixer at three moments, every bone's world matrix is finite and the body
//     is NOT in its bind pose (an action that binds nothing, or a weight stuck at 0, reads as bind)
//   · locomotion: the loop's own ground speed (measured off the planted foot, as actors.ts does) puts the
//     sim's speed for that state inside the 0.55–1.7 rate clamp (outside it the feet skate or moonwalk)
//   · a held weapon is SHOWN on the ready loop that carries it, and never on a calm one
// Prints one line per body and the failures; exits 1 on any.
//   node scripts/survivorz/anim-show-check.mjs [--only carla,zombie-m01] [--speeds]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { THREE, ROOT, STAGE, loadBody, boneLike } from "./lib-loadbody.mjs";

const S = await import(pathToFileURL(path.join(ROOT, "client", "src", "survivorz", "show", "stance.ts")).href);
// THE PAIRS the show may play (scripts/survivorz/pair-table.mjs): every half named there must be on its body
const PAIRS = JSON.parse(fs.readFileSync(path.join(ROOT, "client", "src", "survivorz", "show", "pairs.json"), "utf8"));
const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1].split(",") : null; })();
const showSpeeds = args.includes("--speeds");
// (every survivor body, the creator's too — bodies.cjs: a hard list of the seven checked every creator body as a zombie)
const SURVIVORS = createRequire(import.meta.url)("./bodies.cjs").survivorIds();
const dir = path.join(STAGE, "game");
const bodies = fs.readdirSync(dir).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4)).filter((b) => !only || only.includes(b));

// THE SIM'S SPEEDS (src/survivorz/sim/tables.ts): what each state moves at, m/s
// (moveGait: SPEED[gait] × 0.7 under 30 hp × 0.85 exhausted)
const GAIT = { walk: 1.4, jog: 3.2, sprint: 5.0, "crouch-walk": 0.8 };
const survSpeeds = (pose, hurt) => GAIT[pose] ? (hurt ? [0.7, 0.7 * 0.85] : [1, 0.85]).map((k) => +(GAIT[pose] * k).toFixed(2)) : [1];
const Z_SPEEDS = { shambler: [0.45, 0.72, 1.0], runner: [0.6 * 1.6, 2.0, 4.2], crawler: [0.35, 0.56, 0.6], experiment: [0.7, 1.12, 3.0] };

const HELD = [null, "pistol", "hk416", "shotgun", "crowbar", "claw-hammer", "lead-pipe", "chef-knife", "fire-axe-a", "flashlight", "walkie"];
const POSES = ["idle", "walk", "jog", "sprint", "crouch", "crouch-walk", "search", "interact", "fight", "aim", "shoot", "reload", "hit", "down", "revive", "sleep", "sit", "eat", "drink", "bandage", "talk", "panic", "grabbed", "dead"];
const ONESHOTS = ["swing.light", "swing.heavy", "stab", "stomp", "shoot", "reload", "hit", "hit.head", "bitten", "fall", "death", "open-box", "can", "sink", "door", "getup"];
const ZPOSES = ["z-idle", "z-wander", "z-chase", "z-attack", "z-bang", "z-feed", "z-crawl", "z-stagger", "z-dead"];
const ZKINDS = ["shambler", "runner", "crawler", "experiment"];
const ZSHOTS = ["hit", "hit.head", "zhit", "attack", "death"];

let failures = 0;
const fail = (body, msg) => { failures++; console.log(`  FAIL ${body}: ${msg}`); };

for (const body of bodies) {
  const isZ = !SURVIVORS.includes(body);
  const gltf = await loadBody(path.join(dir, `${body}.glb`), (n) => S.keepClip(n));
  const scene = gltf.scene;
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  const has = (n) => clips.has(n) && S.lawful(body, n);
  const mixer = new THREE.AnimationMixer(scene);
  const bones = []; scene.traverse((o) => { if (o.isBone) bones.push(o); });
  scene.updateMatrixWorld(true);
  const bind = bones.map((b) => b.quaternion.clone());
  const feet = [boneLike(scene, "foot_l") ?? boneLike(scene, "foot.l"), boneLike(scene, "foot_r") ?? boneLike(scene, "foot.r")];

  /** play a clip alone at t; true = finite and off the bind pose */
  const sampleOk = (name) => {
    const c = clips.get(name);
    if (!c) return "missing";
    mixer.stopAllAction();
    const a = mixer.clipAction(c); a.reset().play(); a.setEffectiveWeight(1);
    let moved = 0;
    for (const f of [0.1, 0.5, 0.9]) {
      a.time = c.duration * f; mixer.update(0); scene.updateMatrixWorld(true);
      for (let i = 0; i < bones.length; i++) {
        const e = bones[i].matrixWorld.elements;
        for (let j = 0; j < 16; j++) if (!Number.isFinite(e[j])) return `non-finite bone ${bones[i].name} at ${f}`;
        if (bones[i].quaternion.angleTo(bind[i]) > 0.05) moved++;
      }
    }
    a.stop();
    return moved > bones.length * 0.2 ? "ok" : `bind pose (${moved} bone-moments off bind)`;
  };
  const speeds = new Map();
  const hands = [boneLike(scene, "hand_l") ?? boneLike(scene, "hand.l"), boneLike(scene, "hand_r") ?? boneLike(scene, "hand.r")];
  /** actors.ts measureSpeed, verbatim: the loop's ground speed is how fast its PLANTED foot (a crawl's
   *  planted hand) slides back under the body — the lower of the pair, within 4 cm of its own lowest */
  const balls = [boneLike(scene, "ball_l") ?? boneLike(scene, "toes_01.l"), boneLike(scene, "ball_r") ?? boneLike(scene, "toes_01.r")];
  const natural = (name) => {
    if (speeds.has(name)) return speeds.get(name);
    const clip = clips.get(name);
    const crawl = /crawl/.test(name);
    const pts = (crawl ? [hands] : [feet, balls]).filter((x) => x[0] && x[1]);
    if (!clip || !pts.length) { speeds.set(name, NaN); return NaN; }
    mixer.stopAllAction();
    const a = mixer.clipAction(clip); a.reset().play();
    const N = 160, dt = clip.duration / N;
    const P = pts.map(() => [[], []]);
    for (let i = 0; i <= N; i++) { a.time = i * dt; mixer.update(0); scene.updateMatrixWorld(true); pts.forEach((pair, j) => { for (const k of [0, 1]) P[j][k].push(pair[k].getWorldPosition(new THREE.Vector3())); }); }
    a.stop();
    const read = (Q, tol, lower) => {
      const lo = Q.map((s) => Math.min(...s.map((p) => p.y)));
      const out = [];
      for (let i = 1; i <= N; i++) for (const k of [0, 1]) {
        if ((lower && Q[k][i].y > Q[1 - k][i].y) || Q[k][i].y > lo[k] + tol || Q[k][i - 1].y > lo[k] + tol) continue;
        out.push(Math.hypot(Q[k][i].x - Q[k][i - 1].x, Q[k][i].z - Q[k][i - 1].z) / dt * Math.sign(Q[k][i - 1].z - Q[k][i].z || 1));
      }
      return out.sort((x, y) => x - y);
    };
    const ball = !crawl && P.length > 1 ? read(P[1], 0.015, false) : [];
    const vs = ball.length >= 10 ? ball : read(P[0], 0.04, true);
    const v = vs.length >= 6 ? vs[vs.length >> 1] : NaN;
    speeds.set(name, v); return v;
  };
  const checked = new Map();
  const check = (name, why) => {
    if (!checked.has(name)) checked.set(name, sampleOk(name));
    const r = checked.get(name);
    if (r !== "ok") fail(body, `${why} -> ${name}: ${r}`);
  };
  const rate = (name, v, why) => {
    const nat = natural(name);
    if (!Number.isFinite(nat) || nat <= 0.15) { fail(body, `${why} -> ${name}: moving at ${v} m/s on a loop with no ground speed (${nat})`); return; }
    const k = v / nat;
    if (k < S.RATE_CLAMP[0] - 1e-6 || k > S.RATE_CLAMP[1] + 1e-6) fail(body, `${why} -> ${name}: ${v} m/s on a ${nat.toFixed(2)} m/s loop = x${k.toFixed(2)} (clamp ${S.RATE_CLAMP.join("–")}: the feet ${k < S.RATE_CLAMP[0] ? "moonwalk" : "skate"})`);
  };
  let n = 0;
  if (!isZ) {
    for (const pose of POSES) for (const held of HELD) for (const alert of [false, true, undefined]) for (const hurt of [false, true]) {
      const moving = S.MOVING.has(pose) ? survSpeeds(pose, hurt) : pose === "down" ? [0, 0.5] : [0];
      for (const v of moving) {
        const st = { body, seed: 7, pose, held, alert, why: "", hp: hurt ? 20 : 100, hpMax: 100, speed: v, now: 0 };
        for (const now of [0, 60_000]) {
          const name = S.survivorLoop({ ...st, now }, has, natural);
          const why = `${pose}/${held ?? "-"}/${alert === undefined ? "?" : alert ? "ready" : "calm"}${hurt ? "/hurt" : ""}@${v}`;
          n++;
          if (!name) { fail(body, `${why}: no clip`); continue; }
          if (!has(name)) fail(body, `${why} -> ${name}: not on this body or past the law`);
          check(name, why);
          if (v > S.BAND.still && (S.MOVING.has(pose) || pose === "down")) rate(name, v, why);
          const { armed } = S.armedOf(held);
          const ready = S.readyOf(st);
          const shown = S.heldShown(armed, name);
          if (!ready && shown && (armed === "pistol" || armed === "rifle" || armed === "shotgun" || armed === "melee" || armed === "axe")) fail(body, `${why} -> ${name}: a weapon in the hand while CALM`);
          if (ready && pose === "idle" && v === 0 && (armed === "pistol" || armed === "rifle" || armed === "shotgun" || armed === "melee" || armed === "axe") && !shown && !hurt) fail(body, `${why} -> ${name}: READY with the weapon put away`);
        }
      }
    }
    // THE WORK BY ITS JOB (wire `why`) and THE LINKS (wire `link`): the loops those pick (Oct 31 2026)
    for (const [pose, why] of [["revive", "brew"], ["revive", "revive"], ["interact", "brew"], ["interact", "prove"], ["search", "study"], ["search", "read"]]) for (const now of [0, 20_000, 40_000, 60_000]) {
      const name = S.survivorLoop({ body, seed: 7, pose, held: null, alert: false, why, hp: 100, hpMax: 100, speed: 0, now }, has, natural);
      n++; check(name, `${pose}/${why}`);
    }
    for (const link of ["ladder", "vent", "lift"]) {
      const name = S.survivorLoop({ body, seed: 7, pose: "walk", held: null, alert: false, why: "", hp: 100, hpMax: 100, speed: 0.7, now: 0, link }, has, natural);
      n++; check(name, `link ${link}`);
    }
    // THE EVENTS' CLIPS (the collapse, the rise, the shove, reading, the tools, talk, the clip props): on
    // every body, off the bind pose — the law's few (S.lawful) are skipped by the game and here
    for (const name of new Set([S.COLLAPSE, ...S.RISE, S.SHOVE.clip, S.NOTE, ...Object.values(S.WORK).flat(), ...Object.values(S.TOOLS), ...Object.values(S.TALK).flat(), ...Object.values(S.LINK_CLIP), ...Object.keys(S.CLIP_PROPS)])) {
      n++;
      // (a SPARE clip a body gave up in its bake — anim-spare.mjs — is fine missing: the game picks its stand-in)
      if (!clips.has(name)) { if (!S.SPARE_CLIPS.includes(name)) fail(body, `event clip ${name}: not on this body`); continue; }
      if (S.lawful(body, name)) check(name, "event clip");
    }
    // THE PAIRS' SURVIVOR HALVES: each chain link, the bites, the pull-off and the knife against every zombie
    for (const [z, bySurvivor] of Object.entries(PAIRS.chains)) {
      const row = bySurvivor[body];
      if (!row) continue;
      for (const [k, codes] of Object.entries(row)) {
        const links = Object.values(S.PAIR_CHAINS[k]), cs = codes.match(/fz|zv/g);
        links.forEach((c, i) => { const nm = cs[i] === "zv" ? `zv-${c}-${z}` : c; n++; if (!clips.has(nm)) fail(body, `pair ${k} vs ${z}: ${nm} missing`); else check(nm, `pair ${k}`); });
      }
      for (const nm of [`zv-pull-off-${z}`, `zv-knife-head-${z}`]) { n++; if (!clips.has(nm)) fail(body, `${nm} missing`); else check(nm, "rescue"); }
    }
    for (const bySurvivor of Object.values(PAIRS.bites)) for (const part of Object.keys(bySurvivor[body] ?? {})) { const nm = `bd-bitten-${part}`; n++; if (!clips.has(nm)) fail(body, `${nm} missing`); else check(nm, "bite"); }
    for (const kind of ONESHOTS) for (const held of HELD) for (const pose of ["idle", "down", "fight", "sleep"]) {
      const r = S.oneShotName(kind, { zombie: false, pose, held, seed: 3, part: undefined }, has);
      n++;
      if (r === null || r === "freeze") continue;
      check(r, `one-shot ${kind}/${held ?? "-"}/${pose}`);
    }
  } else {
    for (const zkind of ZKINDS) for (const pose of ZPOSES) {
      const vs = S.Z_MOVING.has(pose) || pose === "z-idle" ? [0, ...Z_SPEEDS[zkind]] : [0];
      for (const v of vs) for (const seed of [0, 1, 2, 3, 4, 5]) {
        const name = S.zombieLoop({ zkind, pose, speed: v, seed }, has, natural);
        const why = `${zkind}/${pose}@${v}#${seed}`;
        n++;
        if (!name) { fail(body, `${why}: no clip`); continue; }
        check(name, why);
        const key = S.zombieKey({ zkind, pose, speed: v, seed });
        if (v > S.BAND.still && S.Z_MOVING.has(key)) rate(name, v, why);
      }
      // THE PAIRS' ZOMBIE HALVES (once a body: its zd- clips against every survivor the table pairs it with)
      if (zkind === ZKINDS[0] && pose === ZPOSES[0]) {
        for (const [s, row] of Object.entries(PAIRS.chains[body] ?? {})) for (const k of Object.keys(row)) for (const c of Object.values(S.PAIR_CHAINS[k])) {
          const nm = `zd-${c}-${s}`; n++; if (!clips.has(nm)) fail(body, `pair ${k} vs ${s}: ${nm} missing`); else check(nm, `pair ${k}`);
        }
        for (const [s, parts] of Object.entries(PAIRS.bites[body] ?? {})) for (const part of Object.keys(parts)) { const nm = `zd-bite-${part}-${s}`; n++; if (!clips.has(nm)) fail(body, `${nm} missing`); else check(nm, "bite"); }
      }
      for (const kind of ZSHOTS) {
        const r = S.oneShotName(kind, { zombie: true, zkind, pose, seed: 1 }, has);
        n++;
        if (r === null || r === "freeze") continue;
        check(r, `one-shot ${kind}/${zkind}/${pose}`);
      }
    }
  }
  if (showSpeeds) console.log(`  ${body} speeds: ${[...speeds].map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · ")}`);
  console.log(`${body}: ${n} states, ${checked.size} clips played, ${clips.size} kept`);
  mixer.stopAllAction();
}
console.log(failures ? `${failures} FAILURES` : "all clean");
process.exit(failures ? 1 : 0);
