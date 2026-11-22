// EMOJI CATALOG SEEDING — the manifest is additive, and only additive.
//
// seedEmoji used to return the moment the table had any rows, so a pack added
// to the manifest never reached a database that had already booted. Making it
// top up is easy; making it SAFE is the point of this harness. An emoji's tier
// sets its sell price, which wheel pool can award it and its leaderboard
// weight, so re-grading one people already own would move real value. The rule
// is insert-only: never update, never delete.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));

const DB = path.join(ROOT, "data", "emojiseed-harness.db");
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);

const first = [
  { code: "a_01", tier: "common", name: "alpha", file: "common/a_01.png" },
  { code: "a_02", tier: "rare", name: "beta", file: "rare/a_02.png", animated: true },
  { code: "a_03", tier: "legendary", name: "gamma", file: "legendary/a_03.png" },
];
store.seedEmoji(first);
ok(store.emojiTierCounts().common === 1, "first boot seeds the catalog");
ok(store.getEmoji("a_02")?.animated === true, "animated flag survives the seed");

// Somebody owns one of them.
const u = store.createUser({
  username: "collector",
  passwordHash: "x",
  displayName: "Collector",
  isAdmin: false,
});
ok(store.addEmoji(u.id, "a_02"), "a user owns a_02");

// Boot again with the SAME manifest — nothing should change.
store.seedEmoji(first);
ok(store.emojiTierCounts().rare === 1, "re-seeding the same manifest adds nothing");

// Now the real case: a new pack appended, PLUS a hostile edit to an existing
// entry (a rare quietly promoted to mythic, and its file moved).
const second = [
  ...first.map((e) => (e.code === "a_02" ? { ...e, tier: "mythic", name: "REGRADED", file: "mythic/nope.png" } : e)),
  { code: "miku_01", tier: "rare", name: "hatsune kittu", file: "rare/miku_01.png" },
  { code: "miku_02", tier: "rare", name: "miku snail", file: "rare/miku_02.png" },
];
store.seedEmoji(second);

const a2 = store.getEmoji("a_02");
ok(a2?.tier === "rare", `an owned emoji is NOT re-graded by a manifest edit (still ${a2?.tier})`);
ok(a2?.name === "beta" && a2?.file === "rare/a_02.png", "and its name/file are left alone");
ok(store.ownsEmoji(u.id, "a_02"), "ownership survives a re-seed");
ok(!!store.getEmoji("miku_01") && !!store.getEmoji("miku_02"), "new codes ARE added to an existing catalog");
ok(store.getEmoji("miku_01")?.tier === "rare", "new codes land in the tier the manifest names");
ok(store.emojiTierCounts().rare === 3, "rare tier grew by exactly the new entries");

// A code dropped from the manifest must not disappear from under an owner.
store.seedEmoji([{ code: "miku_03", tier: "rare", name: "miku dab", file: "rare/miku_03.png" }]);
ok(!!store.getEmoji("a_02") && store.ownsEmoji(u.id, "a_02"), "a code missing from the manifest is never deleted");
ok(!!store.getEmoji("miku_03"), "and the newest entry still seeds");

// The real manifest should load and be internally consistent.
const manifest = require(path.join(ROOT, "assets", "emoji-manifest.json"));
const codes = new Set(manifest.map((e) => e.code));
ok(codes.size === manifest.length, `the shipped manifest has no duplicate codes (${manifest.length} entries)`);
ok(
  manifest.every((e) => e.file.startsWith(e.tier + "/")),
  "every shipped entry's file sits under its own tier",
);
const miku = manifest.filter((e) => e.pack === "miku");
ok(miku.length === 20 && miku.every((e) => e.tier === "rare"), `the miku pack is 20 rare entries (${miku.length})`);
ok(
  miku.every((e) => e.animated === e.file.endsWith(".gif")),
  "miku animated flags match their file types",
);

console.log(`\n${n - bad}/${n} passed`);
for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} }
process.exit(bad ? 1 : 0);
