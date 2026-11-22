// STERLING NOTICES YOU, IN PRIVATE (Josh, Oct 2026; src/sterling-notice.ts).
//
// Run:  npm run build && node scripts/checks/test_sterling_notice.mjs
//
// In-process over a real Store, a bus and a fake clock — the note itself is
// recorded, not posted. One assert per rule:
//   · the four moments each write a note: the FIRST legendary (never the
//     second), a streak at the moment it CROSSES its line (never on every
//     spin past it), coming back after two weeks away, and a friend — by DM
//     count — dying on the Wheel (a stranger to them gets nothing)
//   · THE CAPS: one note per person per 72h across every kind, a streak once
//     a week, a first legendary once ever
//   · the house never writes to itself, a bot, or the deleted; the admin's
//     lever (force) skips the gaps and nothing else
process.env.STERLING_NOTICE_BACK_DELAY_MS = "0";

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = (p) => pathToFileURL(path.join(ROOT, "dist", p)).href;
const { Store } = await import(dist("db/store.js"));
const N = await import(dist("sterling-notice.js"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const tick = () => new Promise((r) => setTimeout(r, 5));

const store = new Store(path.join(mkdtempSync(path.join(tmpdir(), "notice-")), "n.db"));
store.seedEmoji([
  { code: "leg_a", tier: "legendary", name: "Golden Owl", file: "a.png" },
  { code: "leg_b", tier: "legendary", name: "Silver Fox", file: "b.png" },
  { code: "com_a", tier: "common", name: "Pebble", file: "c.png" },
]);
const mk = (u) => store.createUser({ username: u, displayName: u[0].toUpperCase() + u.slice(1), passwordHash: "x" });
const mara = mk("mara"), theo = mk("theo"), ivy = mk("ivy"), rex = mk("rex"), sam = mk("sam");
const boss = store.createUser({ username: "boss", displayName: "Boss", passwordHash: "x", isAdmin: true });
store.createUser({ username: "robo", displayName: "Robo", passwordHash: "x" });
store.setBotFlag("robo");
const bot = store.getUserByUsername("robo");

let now = Date.now();
const bus = new EventEmitter();
const notes = [];
const noticer = N.startNoticing(store, bus, (userId, body, situation, must) => notes.push({ userId, body, situation, must }), { now: () => now });
const notesFor = (id) => notes.filter((x) => x.userId === id);
const pass = (ms) => { now += ms; };
const feed = (user, kind, extra = {}) => ({ item: { id: String(Math.random()), kind, user: { id: user.id, username: user.username, displayName: user.displayName }, at: now, ...extra } });

console.log("THE FIRST LEGENDARY");
store.addEmoji(mara.id, "leg_a");
bus.emit("wheel.event", feed(mara, "win", { tier: "legendary", emoji: { code: "leg_a", name: "Golden Owl", file: "a.png", animated: false } }));
ok(notesFor(mara.id).length === 1 && /first legendary/i.test(notesFor(mara.id)[0].body) && notesFor(mara.id)[0].must.includes("Mara"), "her first legendary off the Wheel gets a note, with her name kept");
pass(4 * 86_400_000);
store.addEmoji(mara.id, "leg_b");
bus.emit("wheel.event", feed(mara, "win", { tier: "legendary", emoji: { code: "leg_b", name: "Silver Fox", file: "b.png" } }));
ok(notesFor(mara.id).length === 1, "…and her second gets nothing (a first is a first)");
store.addEmoji(theo.id, "leg_a");
store.addEmoji(theo.id, "leg_b");
bus.emit("wheel.event", feed(theo, "win", { tier: "legendary" }));
ok(notesFor(theo.id).length === 0, "a player who already held one before this win isn't told it's their first");

console.log("A ROUGH STREAK");
const blanks = (u, k) => { for (let i = 0; i < k; i++) { store.streakStat(u.id, "wheel_blanks", true); bus.emit("wheel.spin", { userId: u.id, slotIndex: 0, died: false }); } };
blanks(ivy, N.NOTICE.WHEEL_BLANKS - 1);
ok(notesFor(ivy.id).length === 0, `${N.NOTICE.WHEEL_BLANKS - 1} blanks in a row: nothing yet`);
blanks(ivy, 1);
ok(notesFor(ivy.id).length === 1 && /blank/i.test(notesFor(ivy.id)[0].situation), `the ${N.NOTICE.WHEEL_BLANKS}th blank in a row gets a note`);
blanks(ivy, 3);
ok(notesFor(ivy.id).length === 1, "…and the spins past the line don't (it's noticed as it CROSSES)");
store.streakStat(ivy.id, "wheel_blanks", false);
pass(N.NOTICE.GAP_MS + 1000);
blanks(ivy, N.NOTICE.WHEEL_BLANKS);
ok(notesFor(ivy.id).length === 1, "a second streak inside the week: nothing (one streak note a week)");
pass(N.NOTICE.STREAK_GAP_MS);
store.streakStat(ivy.id, "slots_dry", false);
for (let i = 0; i < N.NOTICE.SLOTS_DRY; i++) { store.streakStat(ivy.id, "slots_dry", true); bus.emit("slots.pull", { userId: ivy.id, reels: [] }); }
ok(notesFor(ivy.id).length === 2 && /slots/i.test(notesFor(ivy.id)[1].situation), `a week on, ${N.NOTICE.SLOTS_DRY} dry pulls on the slots in a row gets one`);

console.log("THE CAP");
store.addEmoji(ivy.id, "leg_a");
bus.emit("wheel.event", feed(ivy, "win", { tier: "legendary" }));
ok(notesFor(ivy.id).length === 2, "another moment inside 72 hours of the last note: nothing (one note per person per 72h, whatever the kind)");

console.log("COMING BACK");
bus.emit("presence.change", { userId: rex.id, online: true });
await tick();
ok(notesFor(rex.id).length === 0, "the first time we see somebody, there's nothing to welcome them back from");
bus.emit("presence.change", { userId: rex.id, online: false });
pass(3 * 86_400_000);
bus.emit("presence.change", { userId: rex.id, online: true });
await tick();
ok(notesFor(rex.id).length === 0, "back after three days: nothing");
bus.emit("presence.change", { userId: rex.id, online: false });
pass(N.NOTICE.AWAY_MS + 86_400_000);
bus.emit("presence.change", { userId: rex.id, online: true });
await tick();
ok(notesFor(rex.id).length === 1 && /15 days/.test(notesFor(rex.id)[0].situation), "back after fifteen days away: welcomed back, the days counted");

console.log("A FRIEND'S DEATH");
pass(N.NOTICE.GAP_MS + 1000);
// the DMs are stamped with the real clock and this run's clock is weeks on: date them to it
const talk = (a, b, k) => { const c = store.getOrCreateConversation(a.id, b.id); for (let i = 0; i < k; i++) store.createDmMessage(c.id, i % 2 ? a.id : b.id, "hey"); store.db.prepare("UPDATE dm_messages SET createdAt = ? WHERE conversationId = ?").run(now - 86_400_000, c.id); };
talk(sam, theo, N.NOTICE.FRIEND_MIN_MESSAGES + 2);
talk(sam, rex, 2);
talk(sam, boss, 20);
bus.emit("wheel.event", feed(sam, "death"));
ok(notesFor(theo.id).length === 1 && notesFor(theo.id)[0].must.includes("Sam") && /died/.test(notesFor(theo.id)[0].situation), "Sam dies on the Wheel: Theo, who talks to him a lot in DMs, gets a quiet note naming him");
ok(notesFor(rex.id).length === 1, "…someone who barely spoke to him gets nothing");
ok(notesFor(boss.id).length === 0, "…and the house (an admin) is never written to on its own");

console.log("WHO HE NEVER WRITES TO");
ok(!N.noticeable(store.getUserById(boss.id)) && !N.noticeable(store.getUserById(bot.id)) && N.noticeable(store.getUserById(mara.id)), "admins and bots are out; members are in");
ok(noticer.notice(bot.id, "back", {}, true).ok === false, "not even the lever writes to a bot");
pass(N.NOTICE.GAP_MS + 1000);
store.addEmoji(boss.id, "com_a");
const r1 = noticer.notice(boss.id, "first_legendary", { emoji: "Golden Owl" });
ok(!r1.ok && r1.error === "not_eligible", "an admin left to the house: refused");

console.log("A FIRST INSIDE THE GAP");
{
  const nel = mk("nel");
  pass(N.NOTICE.GAP_MS + 1000);
  noticer.notice(nel.id, "back", { days: 20 }); // a note — the 72h gap starts
  store.addEmoji(nel.id, "leg_a");
  bus.emit("wheel.event", feed(nel, "win", { tier: "legendary", emoji: { code: "leg_a", name: "Golden Owl", file: "a.png" } }));
  const had = notesFor(nel.id).length;
  pass(N.NOTICE.GAP_MS + 1000);
  store.removeEmoji(nel.id, "leg_a");
  store.addEmoji(nel.id, "leg_b");
  bus.emit("wheel.event", feed(nel, "win", { tier: "legendary", emoji: { code: "leg_b", name: "Silver Fox", file: "b.png" } }));
  ok(had === 1 && notesFor(nel.id).length === 1, "a first legendary that fell inside the gap is still the first: a later one isn't greeted as it");
}

console.log("THE LEVER");
const before = notesFor(ivy.id).length;
ok(noticer.notice(ivy.id, "back", { days: 20 }, true).ok && notesFor(ivy.id).length === before + 1, "force writes one now, gaps or not");
ok(noticer.notice(boss.id, "friend_death", { name: "Sam" }, true).ok, "…even to the admin, so the operator can read one");
ok(noticer.notice(ivy.id, "streak").ok === false, "…and the note it sent counts toward the cap like any other");

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
