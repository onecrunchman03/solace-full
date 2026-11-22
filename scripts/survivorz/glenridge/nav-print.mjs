// SURVIVORZ: a fingerprint of the BUNKER's navigation as built (run after `npm run build`). Used to prove a change
// to sim/nav.ts or facility.ts left the bunker's walk map, rooms, doors, portals and a set of routes exactly as they were.
//   node scripts/survivorz/glenridge/nav-print.mjs
import { createRequire } from "node:module"; import { createHash } from "node:crypto"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url); const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { Nav } = require(path.join(ROOT, "dist", "survivorz", "sim", "nav.js"));
const nav = new Nav(); const h = createHash("sha256");
for (const a of [nav.walk, nav.sight, nav.room, nav.door, nav.hops]) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
h.update(JSON.stringify(nav.portals)); h.update(JSON.stringify(nav.doorCentre)); h.update(JSON.stringify(nav.floors));
let routes = 0, reached = 0;
for (let a = 0; a < nav.rooms.length; a += 3) for (let b = 1; b < nav.rooms.length; b += 4) {
  const ca = nav.cellInRoom(a, nav.rooms[a].floor, 0.5, 0.5), cb = nav.cellInRoom(b, nav.rooms[b].floor, 0.3, 0.7);
  if (ca < 0 || cb < 0) { h.update("x"); continue; }
  const p = nav.route(ca, cb, () => 1); routes++; if (p && p.reached) reached++; h.update(JSON.stringify(p));
}
console.log(`bunker nav: ${nav.rooms.length} rooms, ${nav.doors.length} doors, ${nav.portals.length} portals, ${routes} routes (${reached} reached), floorY ${[0, 1, 2].map((f) => nav.floorY(f)).join(",")}`);
console.log("fingerprint", h.digest("hex").slice(0, 24));
