// SURVIVORZ: the ONE list of survivor bodies the animation pipeline bakes. The seven made by
// hand are written here; every body the character creator takes in (docs/survivorz/CREATOR.md)
// is added to assets/downloads/survivorz/creator/bodies.json by scripts/survivorz/creator/bake.mjs,
// and comes out of this list the same as the seven. A script that used to carry its own copy of
// the names reads it from here, so a dropped-in body reaches every step.
const fs = require("fs"), path = require("path");

const STAGE = path.join(__dirname, "..", "..", "assets", "downloads", "survivorz");
const REGISTRY = path.join(STAGE, "creator", "bodies.json");

// the target each was baked from (under targets/), and the shoulder height the hug's roles go by
const BUILT_IN = {
  eric: { target: "eric/rp_eric_rigged_001_yup_a.gltf", shoulder: 1.468 },
  carla: { target: "carla/rp_carla_rigged_001_yup_a.gltf", shoulder: 1.36 },
  claudia: { target: "claudia/rp_claudia_rigged_002_yup_a.gltf", shoulder: 1.417 },
  manuel: { target: "manuel/rp_manuel_animated_001_dancing.gltf", shoulder: 1.438 },
  nathan: { target: "nathan/rp_nathan_animated_003_walking.gltf", shoulder: 1.489 },
  sophia: { target: "sophia/rp_sophia_animated_003_idling.gltf", shoulder: 1.367 },
  // ROLLO (Oct 22 2026): the SKP_GAMES hazmat on Eric's rig, built by scripts/survivorz/rollo-build.py
  rollo: { target: "rollo/rollo.gltf", shoulder: 1.468 },
};

/** Every body the creator has registered: { id: { target, shoulder, source, ... } }. */
function registered() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  } catch {
    return {};
  }
}

/** Every survivor body, the seven first: { id: { target, shoulder, ... } }. */
function survivorBodies() {
  return { ...BUILT_IN, ...registered() };
}

/** Their ids, in the order above. */
function survivorIds() {
  return Object.keys(survivorBodies());
}

/** Add or replace one body in the registry. */
function register(id, entry) {
  const all = registered();
  all[id] = entry;
  fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
  fs.writeFileSync(REGISTRY, JSON.stringify(all, null, 1));
}

/** A creator body gone: out of the registry and every file of it off the stage (never one of the
 *  seven). Left registered, it would keep being baked into every hug and pair. */
function forget(id) {
  if (BUILT_IN[id] || !/^[a-z0-9-]{2,32}$/.test(id) || /^zombie-/.test(id)) return false;
  const all = registered();
  const had = id in all;
  delete all[id];
  if (had) fs.writeFileSync(REGISTRY, JSON.stringify(all, null, 1));
  for (const d of ["targets", "out", "out-raw", "anim", "sheets", "creator"]) fs.rmSync(path.join(STAGE, d, id), { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  for (const f of [path.join("jobs", `${id}.json`), path.join("game", `${id}.glb`)]) fs.rmSync(path.join(STAGE, f), { force: true, maxRetries: 5, retryDelay: 400 });
  const cal = path.join(STAGE, "props", "guns", "cal.json");
  try {
    const c = JSON.parse(fs.readFileSync(cal, "utf8"));
    if (id in c) { delete c[id]; fs.writeFileSync(cal, JSON.stringify(c, null, 1)); }
  } catch { /* no seats yet */ }
  return had;
}

module.exports = { STAGE, REGISTRY, BUILT_IN, survivorBodies, survivorIds, registered, register, forget };
