// PHONE MODE'S DOOR POLICY — which views a phone may show, and to whom.
//
// Run:  node scripts/checks/test_phone_views.mjs
//
// Pure data + one pure function (client/src/lib/phone-views.ts), driven
// directly. It earns a harness because it is a RULE ABOUT ACCESS that three
// separate surfaces read — the bounce effect in App.svelte, the bottom tab
// bar, and the You sheet — and the failure modes are quiet ones:
//
//   · a tab that offers a destination the bounce immediately takes away
//     (the app flickering back to chat, looking broken)
//   · a member shown an Admin Panel door that answers 403
//   · a 3D world (WebGL + pointer lock + WASD) reachable on a touchscreen,
//     which is worse than no door at all
//   · a moderator demoted mid-session left sitting inside the panel
//
// NB this is NOT the security boundary and the harness says so below: every
// /api/admin route is admin- or mod-level server-side. This is about not
// showing people doors that lie.

import { PHONE_VIEWS, PHONE_STAFF_VIEWS, phoneAllows } from "../../client/src/lib/phone-views.ts";

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

const member = { isAdmin: false, role: "user" };
const mod = { isAdmin: false, role: "moderator" };
const admin = { isAdmin: true, role: "user" };

// ---- everyone gets chat, and the reading surfaces ------------------------
for (const v of ["chat", "dms", "profile", "feedback", "howto"]) {
  ok(phoneAllows(v, member), `a member reaches "${v}" on a phone`);
}
ok(phoneAllows("pandora", member), "…and Pandora's Box (a reading surface, not a game)");
ok(phoneAllows("portal", member), "…and the Portal, or saying the phrase would bounce the speaker to chat");

// ---- THE SEP 2026 OPENING: the casino, the Market, the boards ------------
ok(phoneAllows("rumble", member), "the casino hub is on the phone now");
ok(phoneAllows("market", member), "…and the Market — the casino runs on silver, and silver is sold here");
ok(phoneAllows("leaderboards", member), "…and the Leaderboards");

// ---- THE 3D WORLDS STAY OFF ---------------------------------------------
// WebGL + pointer lock + WASD. There is no touch design that makes them work,
// and a door onto something unplayable is worse than no door.
ok(!phoneAllows("backrooms", member), "the Backrooms are NOT on a phone");
ok(!phoneAllows("backrooms", admin), "…not even for the admin — it isn't a permission, it's a device");
ok(!phoneAllows("graveyard", member), "the Graveyard stays desktop-only (not asked for)");

// ---- THE ADMIN PANEL IS STAFF-ONLY --------------------------------------
ok(!phoneAllows("adminpanel", member), "a member does NOT reach the Admin Panel on a phone");
ok(phoneAllows("adminpanel", mod), "a moderator does");
ok(phoneAllows("adminpanel", admin), "…and so does the admin");
ok(!phoneAllows("adminpanel", null), "a signed-out caller does not");
ok(!phoneAllows("adminpanel", undefined), "…nor an undefined one");
// The demotion case: the same call with the same view, one field different.
ok(!phoneAllows("adminpanel", { isAdmin: false, role: "user" }),
  "a moderator demoted mid-session is carried back out of the panel");
// Hostile-ish shapes: nothing but the two real signals opens it.
ok(!phoneAllows("adminpanel", { isAdmin: "yes", role: "admin" }),
  "a truthy non-true isAdmin does not open it (=== true, not a coercion)");
ok(!phoneAllows("adminpanel", { role: "Moderator" }), "…and the role compare is case-exact");

// ---- unknown views are refused, not assumed -----------------------------
ok(!phoneAllows("", member), "an empty view name is refused");
ok(!phoneAllows("nonesuch", admin), "an unknown view is refused even for the admin");
ok(!phoneAllows("__proto__", member), "…and a prototype-shaped name is just an unknown view");
ok(!phoneAllows("constructor", member), "…as is 'constructor' (Set lookups, not object keys)");

// ---- the two sets don't overlap -----------------------------------------
// If a view were in both, the staff check would be dead code and a demotion
// would leave the panel reachable.
const overlap = [...PHONE_STAFF_VIEWS].filter((v) => PHONE_VIEWS.has(v));
ok(overlap.length === 0, `no view is in both sets (overlap: ${overlap.join(", ") || "none"})`);
ok(PHONE_STAFF_VIEWS.has("adminpanel"), "the staff set is exactly the panel");
ok(PHONE_STAFF_VIEWS.size === 1, "…and nothing else has been quietly added to it");

// ---- every allowed view is a real View in nav.svelte.ts ------------------
// A typo ("leaderboard") would be a view nobody can ever reach, failing
// silently — the bounce would just send them to chat forever.
const navSrc = await (await import("node:fs/promises")).readFile(
  new URL("../../client/src/lib/nav.svelte.ts", import.meta.url), "utf8",
);
const union = navSrc.slice(navSrc.indexOf("export type View"), navSrc.indexOf(";", navSrc.indexOf("export type View")));
const known = new Set([...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
ok(known.size > 8, `read the View union from nav.svelte.ts (${known.size} views)`);
for (const v of [...PHONE_VIEWS, ...PHONE_STAFF_VIEWS]) {
  ok(known.has(v), `"${v}" is a real View in nav.svelte.ts`);
}

console.log("");
if (bad) {
  console.log(`${n - bad} passed, ${bad} FAILED`);
  process.exit(1);
}
console.log(`${n}/${n} phone-view asserts passed`);
