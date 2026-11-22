// STERLING'S SECURITY ALERTS — the escalation rules, in process.
//
// The Security panel is only as good as the thing that makes Josh look at it,
// which is the DM. Three rules decide whether that DM is useful or noise, and
// all three are easy to get wrong in a way no type-checker catches:
//
//   1. A finding on a STAFF account bypasses the cooldown and fires EVERY
//      time (Josh's call). A repeated new-network sign-in on the admin
//      account is the same alarm ringing again, not noise to smooth away.
//   2. Everything else fires at most once per cooldown window, or a scanner
//      sitting on the server would DM every five minutes forever.
//   3. A distributed run produces one finding PER SOURCE ADDRESS, so the
//      sweep must cap the burst and summarize the rest — otherwise the
//      operator is buried in the middle of the incident they need to read.
//
// Driven in process against a real Store, counting the DM rows Sterling
// actually wrote, because "did it send" is the only claim that matters.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { Bus } = require(path.join(ROOT, "dist", "bus.js"));
const { createSterling } = require(path.join(ROOT, "dist", "sterling.js"));

const DB = path.join(ROOT, "data", "secalert-harness.db");
const wipe = () => { for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { rmSync(f); } catch {} } };
wipe();

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };

const store = new Store(DB);
const bus = new Bus();
const admin = store.createUser({
  username: "housekeeper", passwordHash: "x", displayName: "Housekeeper", isAdmin: true,
});
const sterling = createSterling(store, bus);
const bot = store.getUserByUsername("sterling");
ok(!!bot, "Sterling exists as a real account to DM from");

// Every DM Sterling has sent the admin since the last check. Tracked by row
// id rather than by array index: listDmMessages clamps its limit to 100, so
// once the flood test runs, index arithmetic against a truncated window
// silently reports "nothing new" forever.
const conv = store.getOrCreateConversation(bot.id, admin.id);
let lastId = 0;
const sinceMark = () => {
  const fresh = store
    .listDmMessages(conv.id, { limit: 100 })
    .filter((m) => m.senderId === bot.id && m.id > lastId);
  if (fresh.length) lastId = fresh[fresh.length - 1].id;
  return fresh;
};
ok(store.listDmMessages(conv.id, { limit: 100 }).length === 0, "the admin's inbox starts empty");

const finding = (id, over = {}) => ({
  id, severity: "warn", title: `Finding ${id}`, detail: `detail for ${id}`, at: Date.now(), ...over,
});

// ---- 1. INFO IS NOT AN ALERT ----------------------------------------------
{
  sterling.securityAlert([finding("quiet", { severity: "info" })]);
  ok(sinceMark().length === 0, "an info finding never becomes a DM");
}

// ---- 2. ONE FINDING, ONE DM, THEN SILENCE ---------------------------------
{
  sterling.securityAlert([finding("stuffing:203.0.113.1", { severity: "crit" })]);
  const first = sinceMark();
  ok(first.length === 1, `a crit finding sends exactly one DM (${first.length})`);
  ok(/SECURITY/.test(first[0]?.body ?? ""), "…and it says SECURITY");
  ok(/detail for/.test(first[0]?.body ?? ""), "…and carries the detail, not just a title");

  sterling.securityAlert([finding("stuffing:203.0.113.1", { severity: "crit" })]);
  ok(sinceMark().length === 0, "the same finding inside the cooldown stays quiet");
}

// ---- 3. STAFF BYPASSES THE COOLDOWN — ON NEW EVIDENCE, NOT ON REPETITION ---
// The bypass exists so a SECOND alarm on a staff account is never smoothed
// away by a cooldown. But the observability sweep re-reads the same lookback
// window every five minutes, so if "again" means "seen again" rather than
// "happened again", one completed action alerts forever. It did: production
// logged 156 DMs of the single finding `secret:5:496177`, one per sweep, for
// a staff recovery-secret change that happened once. The rule is a timestamp
// we have not alerted on yet.
{
  const T = Date.now() - 60_000;
  const staff = (at) => finding("challenge:1:198.51.100.0/24", {
    severity: "crit", staff: true, title: "STAFF signed in from a new network", at,
  });
  sterling.securityAlert([staff(T)]);
  const first = sinceMark();
  ok(first.length === 1, "a staff finding fires");
  ok(/STAFF ACCOUNT/.test(first[0]?.body ?? ""), "…labelled as a staff account in the message");

  sterling.securityAlert([staff(T)]);
  ok(sinceMark().length === 0, "THE SAME EVENT, re-read next sweep, does NOT DM again");
  sterling.securityAlert([staff(T)]);
  sterling.securityAlert([staff(T)]);
  ok(sinceMark().length === 0, "…and stays quiet however many sweeps re-read it");

  // …but the moment something actually happens again, it rings at once, with
  // no cooldown in the way. That is the half of the rule worth keeping.
  sterling.securityAlert([staff(T + 1000)]);
  ok(sinceMark().length === 1, "a LATER staff event fires immediately — no cooldown for staff");
  sterling.securityAlert([staff(T + 1000)]);
  ok(sinceMark().length === 0, "…and that one then settles too");
  sterling.securityAlert([staff(T + 2000)]);
  ok(sinceMark().length === 1, "…and the one after that rings again");

  // An older event arriving late (out-of-order SQL) must not re-ring.
  sterling.securityAlert([staff(T - 5000)]);
  ok(sinceMark().length === 0, "an event older than the last one alerted is not a new alarm");
}

// ---- 4. THE BURST CAP ------------------------------------------------------
// Twelve fresh findings at once is a distributed run, not twelve incidents.
{
  const many = Array.from({ length: 12 }, (_, i) => finding(`stuffing:192.0.2.${i}`, { severity: "crit" }));
  sterling.securityAlert(many);
  const sent = sinceMark();
  ok(sent.length === 6, `twelve findings send five DMs plus one summary, not twelve (${sent.length})`);
  const summary = sent[sent.length - 1]?.body ?? "";
  ok(/7 more finding/.test(summary), `the summary counts the remainder (${summary.slice(0, 60)})`);
  ok(/7 critical/.test(summary), "…and says how many of them were critical");

  // Crucially, the suppressed seven are marked as alerted, so the NEXT sweep
  // doesn't replay them one at a time and produce the flood anyway.
  sterling.securityAlert(many);
  ok(sinceMark().length === 0, "a repeat sweep of the same twelve is silent, including the summarized seven");
}

// ---- 5. THE WORST ONES GET THE INDIVIDUAL DMs -----------------------------
// If the cap trims the list, what survives must be chosen, not arbitrary.
{
  const batch = [
    ...Array.from({ length: 8 }, (_, i) => finding(`brute:198.18.0.${i}`)),          // warn
    finding("challenge:9:203.0.113.0/24", { severity: "crit", staff: true, title: "STAFF new network" }),
  ];
  sterling.securityAlert(batch);
  const sent = sinceMark();
  ok(sent.length === 6, "nine findings again send five plus a summary");
  ok(/STAFF/.test(sent[0]?.body ?? ""),
    "the STAFF finding is the FIRST message, even though it was last in the list");
}

// ---- 5b. A FINDING CAN CARRY ITS OWN COOLDOWN ------------------------------
// "Pending reboot" is a standing chore, not an incident — hostFindings gives
// it a WEEK so the operator gets a reminder, not four DMs a day (Aug 2026,
// after Sterling nagged Josh about a mid-day kernel USN all afternoon).
{
  const weekly = () => finding("host:Pending reboot", { cooldownMs: 7 * 24 * 3_600_000 });
  sterling.securityAlert([weekly()]);
  ok(sinceMark().length === 1, "a long-cooldown finding fires its first DM");
  sterling.securityAlert([weekly()]);
  ok(sinceMark().length === 0, "…then stays quiet on the next sweep");
  // Age the key past the DEFAULT cooldown but inside its own: still quiet.
  sterling.alertedAt.set("sec:host:Pending reboot", Date.now() - 13 * 3_600_000);
  sterling.securityAlert([weekly()]);
  ok(sinceMark().length === 0, "13h later — past the default 6h — a weekly finding is STILL quiet");
  // Past its own week: it reminds again.
  sterling.alertedAt.set("sec:host:Pending reboot", Date.now() - 8 * 24 * 3_600_000);
  sterling.securityAlert([weekly()]);
  ok(sinceMark().length === 1, "…and reminds again once ITS week is up");
}

// ---- 6. THE COOLDOWN MAP DOESN'T GROW FOREVER -----------------------------
// Security keys carry the source address, so a botnet would add one entry per
// attacker IP. Prove the pruner actually reclaims them.
{
  const flood = Array.from({ length: 700 }, (_, i) => finding(`brute:10.0.${Math.floor(i / 256)}.${i % 256}`));
  sterling.securityAlert(flood);
  sinceMark();
  // Age every key past the prune line, then run one more sweep so the
  // pruner (which only engages above 500 entries) gets a chance.
  const map = sterling.alertedAt ?? null;
  ok(map instanceof Map, "the cooldown map is reachable for inspection");
  if (map instanceof Map) {
    const before = map.size;
    ok(before > 500, `the flood filled the map (${before} keys)`);
    // Past every window a stamp can matter in (8 days: event stamps, weekly
    // cooldowns — Oct 2026 review), then one more sweep for the pruner.
    for (const k of map.keys()) map.set(k, Date.now() - 9 * 86_400_000);
    sterling.securityAlert([finding("trigger:pruner")]);
    ok(map.size < before, `stale keys are reclaimed (${before} → ${map.size})`);
  }
}

console.log(`\n${n - bad}/${n} passed`);
wipe();
process.exit(bad ? 1 : 0);
