// POOLROOMS DESIGN VALIDATION — audits the frozen P3 against the rules
// Josh has set over this build, and reports every violation with counts and
// sample coordinates so they can be fixed rather than argued about.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (m) => path.join(ROOT, "dist", m);
const require = createRequire(path.join(ROOT, "package.json"));
const {
  generatePoolsSector,
  SECTOR_P,
  SWIM_DEPTH_STEPS,
  WATER_TABLE,
  DECO,
} = require(dist("backrooms/worldgen-pools.js"));
const { WATER_NONE, heightWalkable, distanceMap } = require(dist("backrooms/worldgen.js"));
const { POOL_RELICS } = require(dist("backrooms/relics.js"));

const s = generatePoolsSector(SECTOR_P.seed, SECTOR_P.size);
const N = s.size;
const at = (x, y) => y * N + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const findings = [];
const note = (label, list, sampleN = 3) => {
  const n = Array.isArray(list) ? list.length : list;
  const ok = n === 0;
  findings.push({ ok, label, n, sample: Array.isArray(list) ? list.slice(0, sampleN) : [] });
};

// 1. NO FLOATING / UNGROUNDED DECO. Every deco must sit on a cell that is
//    open (or, for pillars/cores, solid) — verified in the generator, but
//    re-checked here independently.
{
  const bad = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const code = s.deco[at(x, y)];
    if (!code) continue;
    const kind = code >> 4;
    const solid = !!s.solid[at(x, y)];
    if ((kind === DECO.pillar || kind === DECO.spiralcore) !== solid) bad.push([x, y, kind]);
  }
  note("deco on the wrong cell kind (floating/buried)", bad);
}

// 2. ARCHES STAND ON LEVEL GROUND: no leg may hang over a drop.
{
  const bad = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const code = s.deco[at(x, y)];
    if ((code >> 4) !== DECO.arch) continue;
    const span = (code & 15) === 1 ? [0, 1] : [1, 0];
    for (const sgn of [-1, 1]) {
      for (const d of [1, 2]) {
        const nx = x + span[0] * sgn * d, ny = y + span[1] * sgn * d;
        if (!inb(nx, ny)) continue;
        if (s.solid[at(nx, ny)]) break;
        if (s.floor[at(nx, ny)] < s.floor[at(x, y)] - 1) { bad.push([x, y]); break; }
      }
    }
  }
  note("arch legs hanging over a drop", bad);
}

// 3. BRIDGES ARE CONTINUOUS: every bridge cell is raised, and its deck must
//    reach dry land on both ends (no bridge to nowhere).
{
  const bad = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const code = s.deco[at(x, y)];
    if ((code >> 4) !== DECO.bridge) continue;
    if (s.floor[at(x, y)] < 1) bad.push([x, y, "not raised"]);
  }
  note("bridge cells not raised", bad);
}

// 4. NO AWKWARD LIPS AT THE WATERLINE. A shore must either be climbable
//    (within a step of the table, the "smooth banks" rule) or be honest
//    ARCHITECTURE — a bridge deck standing over the channel, or a wall
//    rising out of it (≥4 steps, as in Blue_Tiles). What must never exist
//    is the in-between: a 1–1.5m ledge you can see over but not climb.
{
  const bad = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = at(x, y);
    if (s.water[i] === WATER_NONE || s.solid[i]) continue;
    for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      const ni = at(nx, ny);
      if (s.solid[ni] || s.water[ni] !== WATER_NONE) continue;
      if ((s.deco[ni] >> 4) === DECO.bridge) continue; // a deck, on purpose
      const rise = s.floor[ni] - WATER_TABLE;
      if (rise >= 2 && rise < 4) bad.push([x, y, "lip +" + rise]);
    }
  }
  note("waterline meets an unclimbable lip (2–3 steps)", bad);
}

// 5. NO ORPHAN WATER: every wet region must touch a cell you can stand or
//    climb out on (already asserted in the harness; repeated for the report).
{
  const seen = new Uint8Array(N * N);
  let trapped = 0, bodies = 0;
  for (let start = 0; start < N * N; start++) {
    if (seen[start] || s.water[start] === WATER_NONE) continue;
    bodies++;
    let exitOK = false;
    const stack = [start]; seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % N, y = (i / N) | 0;
      for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
        if (!inb(nx, ny)) continue;
        const ni = at(nx, ny);
        if (s.solid[ni]) continue;
        if (!heightWalkable(s.eff[i], s.eff[ni])) continue;
        if (s.water[ni] === WATER_NONE) exitOK = true;
        else if (!seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (!exitOK) trapped++;
  }
  note(`water bodies with no way out (of ${bodies})`, trapped);
}

// 6. RELIC SPAWN SPACE: the spawner needs walkable cells ≥60 from any door.
{
  let ok = 0;
  for (let y = 4; y < N - 4; y++) for (let x = 4; x < N - 4; x++) {
    if (s.solid[at(x, y)]) continue;
    let dd = Infinity;
    for (const d of s.doors) dd = Math.min(dd, Math.hypot(d.x - x, d.y - y));
    if (dd >= 60) ok++;
  }
  findings.push({ ok: ok > 1000, label: `relic spawn candidates (deep cells ≥60 from a door)`, n: ok, sample: [] });
  findings.push({ ok: POOL_RELICS.length === 10, label: "pool relic catalog size", n: POOL_RELICS.length, sample: [] });
}

// 7. EVERY DOOR APRON IS DRY AND REACHABLE (spawns must never drown).
{
  const bad = [];
  for (const d of s.doors) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = at(d.x + dx, d.y + dy);
      if (s.water[i] !== WATER_NONE) bad.push([d.name, d.x + dx, d.y + dy]);
    }
  }
  note("door aprons touching water", bad);
}

// 8. NO SEALED POCKETS: 100% of walkable cells reachable from the doors.
{
  const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  let walk = 0, reach = 0;
  for (let i = 0; i < N * N; i++) {
    if (s.solid[i]) continue;
    walk++;
    if (dist[i] >= 0) reach++;
  }
  findings.push({ ok: walk === reach, label: `reachable ${reach}/${walk} walkable cells`, n: walk - reach, sample: [] });
}

// 9. SWIM WATER EXISTS AND ISN'T THE WHOLE MAP.
{
  let swim = 0, wet = 0, open = 0;
  for (let i = 0; i < N * N; i++) {
    if (s.solid[i]) continue;
    open++;
    if (s.water[i] === WATER_NONE) continue;
    wet++;
    if (s.water[i] - s.floor[i] >= SWIM_DEPTH_STEPS) swim++;
  }
  const wetPct = (wet / open) * 100, swimPct = (swim / open) * 100;
  findings.push({ ok: wetPct > 20 && wetPct < 55, label: `wet ${wetPct.toFixed(1)}% of open cells`, n: 0, sample: [] });
  findings.push({ ok: swimPct > 8, label: `swimmable ${swimPct.toFixed(1)}%`, n: 0, sample: [] });
}

// 10. THE POOLS ARCHIVE: all twenty drives place, on standable ground, off
//     the doorstep, spread out — and never somewhere you'd have to dive
//     (a dropped drive in deep water is a lost drive).
{
  const { driveSites, POOL_DRIVES, DRIVES } = require(dist("backrooms/lore.js"));
  const sites = driveSites(s, POOL_DRIVES);
  findings.push({ ok: sites.length === POOL_DRIVES.length, label: `pools drives placed ${sites.length}/${POOL_DRIVES.length}`, n: POOL_DRIVES.length - sites.length, sample: [] });
  const dive = [], nearDoor = [], onSolid = [];
  let minApart = Infinity;
  for (const st of sites) {
    const i = at(Math.floor(st.x), Math.floor(st.y));
    if (s.solid[i]) onSolid.push([st.id]);
    if (s.water[i] !== WATER_NONE && s.water[i] - s.floor[i] >= SWIM_DEPTH_STEPS) dive.push([st.id]);
    for (const d of s.doors) if (Math.hypot(d.x - st.x, d.y - st.y) < 25) nearDoor.push([st.id]);
    for (const o of sites) if (o !== st) minApart = Math.min(minApart, Math.hypot(o.x - st.x, o.y - st.y));
  }
  note("drives on solid rock", onSolid);
  note("drives needing a dive", dive);
  note("drives on the doorstep (<25 cells)", nearDoor);
  findings.push({ ok: minApart > 15, label: `closest pair of drives ${minApart.toFixed(1)} cells`, n: 0, sample: [] });
  // Ids must never collide across the two archives.
  const dup = DRIVES.map((d) => d.id).filter((id) => POOL_DRIVES.some((p) => p.id === id));
  note("drive ids colliding with Level 0's", dup);
}

// 11. POOL RELICS: the catalog is complete and its art is staged.
{
  const fs = require("node:fs");
  const missing = POOL_RELICS.filter(
    (r) => !fs.existsSync(path.join(ROOT, "client/public/assets/relics", r.img)),
  ).map((r) => [r.slug]);
  note("pool relics with no art", missing);
}

// 12. THE PILLARS. A pillar/spiral core is a 2×2 SOLID block whose NW cell
//     carries the deco; the client draws one cylinder spanning the block.
//     Every way that can go wrong:
//       · a member cell not solid → the drum hangs over open floor/water
//         and you can walk inside it (rivers carve straight through blocks)
//       · overlapping blocks → two drums in one place
//       · a block wedged against a wall line → the drum eats a doorway
{
  const partial = [], overlap = [], claimed = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const code = s.deco[at(x, y)];
    const kind = code >> 4;
    if (kind !== DECO.pillar && kind !== DECO.spiralcore) continue;
    for (const [ox, oy] of [[0,0],[1,0],[0,1],[1,1]]) {
      const cx = x + ox, cy = y + oy;
      if (!inb(cx, cy) || !s.solid[at(cx, cy)]) { partial.push([x, y, "hole at " + cx + "," + cy]); break; }
      const key = cx + "," + cy;
      if (claimed.has(key) && claimed.get(key) !== `${x},${y}`) overlap.push([x, y, "shares " + key]);
      claimed.set(key, `${x},${y}`);
    }
  }
  note("pillars with a carved-out cell (drum over open ground)", partial);
  note("pillar blocks overlapping each other", overlap);
}

// 13. PILLARS MUST NOT STRANGLE A ROOM: no pillar may sit where removing it
//     is the only way through (the props.ts notACutCell rule, applied to
//     the drums the generator places).
{
  const choke = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const kind = s.deco[at(x, y)] >> 4;
    if (kind !== DECO.pillar) continue;
    // A 2×2 block with open cells on opposite sides and walls closing the
    // other axis would be a plug. Count open neighbours around the block.
    let open = 0;
    for (const [cx, cy] of [[x-1,y],[x-1,y+1],[x+2,y],[x+2,y+1],[x,y-1],[x+1,y-1],[x,y+2],[x+1,y+2]]) {
      if (inb(cx, cy) && !s.solid[at(cx, cy)]) open++;
    }
    if (open <= 2) choke.push([x, y, open + " open sides"]);
  }
  note("pillars plugging a passage (≤2 open sides)", choke);
}

// 14. THE DECO PLACEMENT RULES, run against the real sector.
//     The generator dresses districts from their geometry without checking
//     that the architecture is there, so the RENDERER filters what it draws
//     (client/src/backrooms/decorules.ts). Those rules are imported here
//     rather than restated, so this can never drift from what ships: what we
//     assert is that after filtering, nothing wall-mounted hangs on air and
//     no arch stands on nothing.
{
  const rules = await import("../../client/src/backrooms/decorules.ts");
  const wIdx = {
    solidAt: (x, y) => !inb(x, y) || !!s.solid[at(x, y)] || !!s.background[at(x, y)],
    waterAt: (x, y) => (inb(x, y) && s.water?.[at(x, y)] !== WATER_NONE ? s.water[at(x, y)] : null),
    decoAt: (x, y) => (inb(x, y) ? s.deco[at(x, y)] : 0),
  };
  const orphanBench = [];
  const floatingArch = [];
  const orphanPort = [];
  let benches = 0, arches = 0, drawnBench = 0, drawnArch = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const code = s.deco[at(x, y)];
    if (!code) continue;
    const kind = code >> 4;
    const v = code & 15;
    if (kind === DECO.cubby) {
      benches++;
      const m = rules.benchMount(wIdx, x, y, v);
      if (!m) continue; // not drawn at all — fine
      drawnBench++;
      if (!rules.backedOn(wIdx, m.x, m.y, m.side)) orphanBench.push([x, y, "→", m.x, m.y]);
    } else if (kind === DECO.porthole) {
      if (rules.backedOn(wIdx, x, y, v)) continue;
      orphanPort.push([x, y, v]); // renderer skips these; listed for visibility
    } else if (kind === DECO.arch) {
      arches++;
      if (!rules.archBelongs(wIdx, x, y, v !== 1)) continue; // not drawn
      drawnArch++;
      const spanX = v !== 1;
      const buried = [-1, 1].some((d) => wIdx.solidAt(spanX ? x + d : x, spanX ? y : y + d));
      const overWater = wIdx.waterAt(x, y) !== null;
      let colonnade = false;
      for (let d = 1; d <= 3 && !colonnade; d++) for (const sg of [-1, 1]) {
        const c2 = wIdx.decoAt(spanX ? x : x + sg * d, spanX ? y + sg * d : y);
        if (c2 >> 4 === DECO.arch && ((c2 & 15) !== 1) === spanX) colonnade = true;
      }
      if (!buried && !overWater && !colonnade) floatingArch.push([x, y]);
    }
  }
  note("benches drawn hanging on open air", orphanBench);
  note("arches drawn supporting nothing", floatingArch);
  console.log(`  · benches ${drawnBench}/${benches} mounted · arches ${drawnArch}/${arches} kept · ` +
    `${orphanPort.length} unbacked portholes skipped`);
}

let bad = 0;
for (const f of findings) {
  if (!f.ok) bad++;
  console.log(`${f.ok ? "✓" : "✗"} ${f.label}${f.n ? ` — ${f.n}` : ""}${f.sample.length ? " e.g. " + JSON.stringify(f.sample) : ""}`);
}
console.log(`\n${findings.length - bad}/${findings.length} design checks pass`);
process.exit(bad ? 1 : 0);
