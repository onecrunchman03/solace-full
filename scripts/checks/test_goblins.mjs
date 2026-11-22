// THE GOBLINS' VOICE (Josh, Sep 2026) over a real server on a throwaway port.
//
//  · THE BOT: a real users row (isBot) that can never log in, wearing its own
//    name, so its letters and posts ride the ordinary DM/message pipelines.
//  · THE LETTER: refused for nobody-to-take-from (no_credit), for a bot, for an
//    open loan, for a locked account, and TOO SOON inside the gap (the admin's
//    lever may force past only that); a letter lands as a recipient-scoped DM
//    from the goblins naming the person and the rate, writes the offer into
//    the file (loan_events "letter"), and the kiosk then shows every window at
//    the INTRODUCTORY rate beside its posted one.
//  · THE OFFER IS REAL AND SPENT: a window signed under it carries the teaser
//    rate, the offer is gone the moment it's used, the vault moved exactly the
//    principal (nothing minted — a rate is not a coin), and the borrow event
//    says why the rate is odd. An EXPIRED offer reads as no offer.
//  · THE TEASER DIES ON THE FIRST MISS: the collectors' step lands on the
//    POSTED rate plus a point, never on the teaser plus a point.
//  · THE BARKER: a post in #general by the goblins, Sterling's reply AS A
//    REPLY to it (replyToId + the hydrated preview), the optional retort
//    threading under his, the stamp in app_kv, and two barks never reusing
//    the same trio of lines.
//  · THE STREAKS the letters read: wheel_blanks and slots_dry extend on a
//    blank / a dry pull and break to zero on anything else, per spin, per pull.
//  · STERLING BY RANK: the admin (Tier 4 at the door) ringing /sterling hears
//    one of The Complete's OWN greeting lines (matched against the exported
//    pool, over enough rings that the weighted pick can't flap the suite).

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { DatabaseSync } = require("node:sqlite");
const { RATES, RATE_STEP, teaserRate, dayKey, TIERS } = require(path.join(ROOT, "dist", "lender.js"));
const {
  writeLetter, GOBLINS_USERNAME, SMALL_PRINT, writeDun, DUN_LINES, DUN_GAPS, SALES_PITCH_LINES,
} = require(path.join(ROOT, "dist", "goblins.js"));
const { L } = require(path.join(ROOT, "dist", "sterling.js"));

const PORT = 8510;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "goblins-harness");
const DB = path.join(DATA, "solace.db");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    // The goblins' own tick stays out of the way; the levers drive everything.
    GOBLIN_TICK_MS: "3600000", GOBLIN_SCOLD_MS: "250", GOBLIN_RETORT_MS: "250",
    LENDER_SWEEP_MS: "1200", STERLING_REPLY_MS: "60",
  },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
const stop = () => { try { server.kill("SIGINT"); } catch { /* gone */ } };

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
};
let regSeq = 0;
const register = async (username) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `goblin letter brass post ${regSeq} 47`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.82.0.${10 + regSeq}` },
  });
  return { token: r.body?.token, id: r.body?.user?.id };
};

const db = () => new DatabaseSync(DB);
const row = (sql, ...args) => { const d = db(); try { return d.prepare(sql).get(...args); } finally { d.close(); } };
const rows = (sql, ...args) => { const d = db(); try { return d.prepare(sql).all(...args); } finally { d.close(); } };
const run = (sql, ...args) => { const d = db(); try { return d.prepare(sql).run(...args); } finally { d.close(); } };

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch { /* booting */ } await sleep(250); }

  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" }, headers: { "x-forwarded-for": "10.82.0.2" } })).body.token;
  const mint = (userId, amount) => api("POST", "/api/admin/coins", { token: admin, body: { userId, amount } });

  console.log("\n-- the bot");
  const bot = row("SELECT id, isBot, displayName, disabled FROM users WHERE username = ?", GOBLINS_USERNAME);
  ok(!!bot && bot.isBot === 1 && bot.displayName === "Goblin Lenders", "the goblins are a users row flagged isBot, under their own name");
  const botLogin = await api("POST", "/api/login", { body: { username: GOBLINS_USERNAME, password: "!bot!" }, headers: { "x-forwarded-for": "10.82.0.3" } });
  ok(botLogin.status === 401 || botLogin.status === 403, `the goblins can never log in (${botLogin.status})`);

  console.log("\n-- who gets a letter");
  const pauper = await register("pauper");
  const mark = await register("mark");
  await mint(mark.id, 2_000); // 6,000 of credit: the 1,000 window opens
  const r1 = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: pauper.id } });
  ok(r1.status === 409 && r1.body?.error === "no_credit", "nothing to take from = no letter (no_credit)");
  const r2 = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: bot.id } });
  ok(r2.status === 409 && r2.body?.error === "not_eligible", "a bot gets no letter (not_eligible)");
  const r3 = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: 999_999 } });
  ok(r3.status === 404, "an unknown id is 404");
  const r4 = await api("POST", "/api/admin/goblins/letter", { token: mark.token, body: { userId: mark.id } });
  ok(r4.status === 403, "the lever is the admin's alone");

  console.log("\n-- the letter");
  const w = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: mark.id } });
  ok(w.status === 200 && [0.05, 0.07, 0.1].includes(w.body?.offer?.off), `a letter goes out with a real cut (${w.body?.offer?.off})`);
  const letter = String(w.body?.letter ?? "");
  ok(/mark/.test(letter) && /%/.test(letter) && /1,000/.test(letter), "…naming the person, the window and the rate");
  // Match the REAL pool, not a loose regex over two random picks: the old
  // version passed only when the draw happened to contain the words it
  // guessed at, and flaked about one run in four (Sep 2026 review).
  ok(SMALL_PRINT.some((p) => letter.includes(p)), "…with the small print about missing a day");
  const convs = (await api("GET", "/api/dm", { token: mark.token })).body?.conversations ?? [];
  const conv = convs.find((c) => c.otherUser?.username === GOBLINS_USERNAME);
  ok(!!conv, "the letter is a DM conversation with the goblins");
  const dms = conv ? (await api("GET", `/api/dm/${conv.id}/messages`, { token: mark.token })).body?.messages ?? [] : [];
  ok(dms.length === 1 && dms[0].body === letter && dms[0].senderId === bot.id, "…holding exactly the letter, from the goblins");
  const others = (await api("GET", "/api/dm", { token: pauper.token })).body?.conversations ?? [];
  ok(!others.some((c) => c.otherUser?.username === GOBLINS_USERNAME), "a bystander's letters are empty");
  const ev = rows("SELECT kind, amount FROM loan_events WHERE userId = ? ORDER BY id", mark.id);
  ok(ev.length === 1 && ev[0].kind === "letter" && ev[0].amount === Math.round(w.body.offer.off * 100), "the file records the letter and its points");
  const again = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: mark.id } });
  ok(again.status === 409 && again.body?.error === "too_soon", "a second letter inside the gap is refused (too_soon)");
  const forced = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: mark.id, force: true } });
  ok(forced.status === 200, "…unless the admin forces it");
  const off = forced.body.offer.off;

  console.log("\n-- the kiosk wears the offer");
  const k = (await api("GET", "/api/lender", { token: mark.token })).body;
  ok(k.offer && k.offer.off === off && k.offer.until > Date.now(), "GET /api/lender carries the standing offer");
  ok(k.tiers.every((t) => t.base === RATES[t.amount] && Math.abs(t.rate - teaserRate(RATES[t.amount], off)) < 1e-9), "every window shows the teaser beside its posted rate");
  const k0 = (await api("GET", "/api/lender", { token: pauper.token })).body;
  ok(k0.offer === null && k0.tiers.every((t) => t.rate === t.base), "no letter, no offer, posted rates");

  console.log("\n-- signing under the offer");
  const vault0 = row("SELECT silver FROM goblin_vault WHERE id = 1").silver;
  const purse0 = row("SELECT coins FROM users WHERE id = ?", mark.id).coins;
  const b = await api("POST", "/api/lender/borrow", { token: mark.token, body: { amount: 1_000 } });
  ok(b.status === 200 && Math.abs(b.body.loan.rate - teaserRate(RATES[1_000], off)) < 1e-9, `the loan carries the introductory rate (${b.body?.loan?.rate})`);
  ok(row("SELECT silver FROM goblin_vault WHERE id = 1").silver === vault0 - 1_000 && row("SELECT coins FROM users WHERE id = ?", mark.id).coins === purse0 + 1_000, "the vault moved exactly the principal — a rate is not a coin");
  const k2 = (await api("GET", "/api/lender", { token: mark.token })).body;
  ok(k2.offer === null && k2.tiers.every((t) => t.rate === t.base), "the offer is spent: gone from the file, windows back to posted");
  const borrowEv = rows("SELECT kind, note FROM loan_events WHERE userId = ? AND kind = 'borrow'", mark.id);
  ok(borrowEv.length === 1 && /introductory/.test(borrowEv[0].note ?? ""), "the borrow event says why the rate is odd");
  const r5 = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: mark.id, force: true } });
  ok(r5.status === 409 && r5.body?.error === "loan_open", "no letters to somebody already on the hook (loan_open)");

  console.log("\n-- the teaser dies on the first miss");
  run("UPDATE users SET coins = 0 WHERE id = ?", mark.id); // can't service the day
  run("UPDATE loans SET lastDay = ? WHERE userId = ?", dayKey(Date.now() - 86_400_000), mark.id);
  await sleep(2_600);
  const l = row("SELECT rate, missed, principal FROM loans WHERE userId = ?", mark.id);
  ok(l && l.missed === 1, `the collectors called and the day was missed (missed=${l?.missed})`);
  ok(l && Math.abs(l.rate - (RATES[1_000] + RATE_STEP)) < 1e-9, `…and the rate is the POSTED rate plus a point (${l?.rate}), not the teaser plus a point`);
  ok(l && l.principal > 1_000, "…with the interest and fee capitalised as ever");

  console.log("\n-- an expired offer is no offer");
  const ghost = await register("ghost");
  await mint(ghost.id, 2_000);
  const g = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: ghost.id } });
  ok(g.status === 200, "a letter to a second member");
  run("UPDATE app_kv SET value = ? WHERE key = ?", JSON.stringify({ off: g.body.offer.off, until: Date.now() - 1_000 }), `goblin_offer:${ghost.id}`);
  const kg = (await api("GET", "/api/lender", { token: ghost.token })).body;
  ok(kg.offer === null && kg.tiers[0].rate === RATES[1_000], "…run out, it reads as no offer");
  const bg = await api("POST", "/api/lender/borrow", { token: ghost.token, body: { amount: 1_000 } });
  ok(bg.status === 200 && bg.body.loan.rate === RATES[1_000], "…and a window signed after it carries the posted rate");
  const locked = await register("locked");
  await mint(locked.id, 2_000);
  run("UPDATE users SET locked = 1 WHERE id = ?", locked.id);
  const rl = await api("POST", "/api/admin/goblins/letter", { token: admin, body: { userId: locked.id } });
  ok(rl.status === 409 && rl.body?.error === "not_eligible", "a locked account gets no letter");

  console.log("\n-- the letter is composed from the file (pure)");
  const facts = {
    name: "Ledger", purse: 12, worth: 400, limit: 1236, maxTier: TIERS[0], hour: 5,
    gambled: 9_000, slotsPulls: 300, spins: 40, blinks: 2, blanks: 6, dry: 14, sold: 50,
    loansRepaid: 1, loansTaken: 1, lotteryTickets: 9, lotteryWins: 0, generation: 2,
    hasShield: false, everJailed: false, everSealed: false, onShelf: 2, vipRank: 0,
  };
  const seen = new Set();
  let personal = 0;
  for (let i = 0; i < 40; i++) {
    const t = writeLetter(facts, { off: 0.05, until: Date.now() + 48 * 3_600_000 });
    seen.add(t);
    if (/Ledger/.test(t) && /10%/.test(t) && /15%/.test(t)) personal++;
  }
  ok(personal === 40, "every letter names the person, the teaser and the posted rate");
  ok(seen.size >= 20, `forty letters from one file read ${seen.size} different ways`);
  const bare = writeLetter({ ...facts, purse: 5_000, gambled: 0, blinks: 0, blanks: 0, dry: 0, sold: 0, loansRepaid: 0, lotteryTickets: 0, generation: 1, hasShield: true, onShelf: 0, hour: 15 }, { off: 0.07, until: Date.now() + 3_600_000 });
  ok(/Ledger/.test(bare) && /8%/.test(bare), "a thin file still gets a letter (the generic hook) at the right rate");

  console.log("\n-- the turn: helpful, then not (the dunning letters)");
  // Josh, Sep 2026: "they were so helpful with me getting a loan" → "these
  // absolute scammers". That arc is the feature, so it is pinned rather than
  // admired — the pools drift the moment somebody has a good cruel idea and
  // puts it in the wrong one.
  //
  // THE MASK: not one line the goblins SELL with may name what the ladder
  // does to you. A pitch that admits the cells is a pitch nobody signs, and a
  // player who was never charmed never gets to feel conned. (The personal
  // hooks are excluded by construction — they speak to the reader's own file.)
  const dunF = { name: "Welcher", payoff: 12_450, interest: 1_650, missed: 3, rate: 0.17, onShelf: 2 };
  const LADDER = /\b(cells?|jail(ed)?|garnish(ed|ing)?|repossess(ed|ion)?|seiz(e|ed|ure))\b/i;
  const leaks = SALES_PITCH_LINES.filter((l) => LADDER.test(l));
  ok(SALES_PITCH_LINES.length >= 50, `${SALES_PITCH_LINES.length} lines of sales patter`);
  ok(leaks.length === 0, "…and not one of them names the mark, the garnish, the shelf or the cells" + (leaks[0] ? ` — "${leaks[0].slice(0, 60)}…"` : ""));
  // THE COLLECTIONS HALF, which is where they stop pretending.
  ok(writeDun(0, dunF) === null, "a debtor in good standing is never dunned — they adore you");
  ok(writeDun(5, dunF) === null, "…and neither is a prisoner: they already have you, and the cell does the talking");
  for (let s = 1; s <= 4; s++) ok(DUN_LINES[s].length >= 4, `stage ${s} has ${DUN_LINES[s].length} letters of its own`);
  const allDun = [1, 2, 3, 4].flatMap((s) => DUN_LINES[s]);
  ok(allDun.every((l) => /\{(payoff|interest)\}/.test(l)),
    "every dunning letter quotes a real number — a demand with no figure in it is just abuse");
  ok(![...DUN_LINES[1], ...DUN_LINES[2]].some((l) => /\bcells?\b/i.test(l)) && DUN_LINES[4].some((l) => /\bcells?\b/i.test(l)),
    "the cell is never mentioned while they are still being nice, and named once they aren't");
  for (let s = 1; s <= 4; s++) {
    const line = writeDun(s, { ...dunF, missed: s });
    ok(typeof line === "string" && line.length > 60 && !line.includes("{"), `stage ${s} composes a letter with every slot filled`);
  }
  // THE FREQUENCY TIGHTENS AS YOU FALL — and stops at both ends. This is the
  // whole of "i dont want them to harrass the players" expressed as numbers:
  // the worst rung on the ladder still allows at most three letters a day,
  // and the house's own hours cut that to about two in practice.
  ok(DUN_GAPS[0] === 0 && DUN_GAPS[5] === 0, "no letters at all at either end of the ladder");
  ok(DUN_GAPS[1] > DUN_GAPS[2] && DUN_GAPS[2] > DUN_GAPS[3] && DUN_GAPS[3] > DUN_GAPS[4],
    "…and the gap between them shrinks on every rung down");
  ok(Math.min(...[1, 2, 3, 4].map((s) => DUN_GAPS[s])) >= 8 * 3_600_000,
    "the tightest gap is still eight hours — the escalation is in the words, never the volume");

  console.log("\n-- the dunning lever, over HTTP");
  const debtor = await register("welcher");
  await mint(debtor.id, 4_000);
  const noLoan = await api("POST", "/api/admin/goblins/dun", { token: admin, body: { userId: debtor.id } });
  ok(noLoan.status === 409 && noLoan.body?.error === "no_loan", "nobody who hasn't borrowed is ever dunned");
  const borrowed = await api("POST", "/api/lender/borrow", { token: debtor.token, body: { amount: 1_000 } });
  ok(borrowed.status === 200, "…they take the small window");
  const current = await api("POST", "/api/admin/goblins/dun", { token: admin, body: { userId: debtor.id } });
  ok(current.status === 409 && current.body?.error === "not_late", "a borrower who is paid up is left entirely alone");
  const memberLever = await api("POST", "/api/admin/goblins/dun", { token: debtor.token, body: { userId: debtor.id } });
  ok(memberLever.status === 403, "the lever is the house's, not a member's");
  // Walk the ladder by hand: the sweep's own pacing is test_lender's job, and
  // what matters here is that the REGISTER turns with the rung.
  const dunAt = async (missed) => {
    run("UPDATE loans SET missed = ? WHERE userId = ?", missed, debtor.id);
    run("DELETE FROM app_kv WHERE key = ?", `goblin_dun:${debtor.id}`);
    return api("POST", "/api/admin/goblins/dun", { token: admin, body: { userId: debtor.id } });
  };
  // Match a composed letter back to the POOL it came from, so "stage 1 sounds
  // like stage 1" is a fact rather than a reading. Each template becomes a
  // regex with its slots opened up.
  const fromPool = (stage, text) =>
    DUN_LINES[stage].some((t) =>
      new RegExp("^" + t.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c).replace(/\\\{[a-z]+\\\}/g, ".+?") + "$").test(text),
    );
  const d1 = await dunAt(1);
  ok(d1.status === 200 && d1.body?.stage === 1 && fromPool(1, d1.body.letter),
    "one day late draws a letter from the stage-1 pool, where they are still apologising");
  ok(!/\bcells?\b/i.test(d1.body.letter), "…which does not mention a cell");
  const d4 = await dunAt(4);
  ok(d4.status === 200 && d4.body?.stage === 4 && fromPool(4, d4.body.letter),
    "four days late draws one from the stage-4 pool instead");
  ok(!fromPool(1, d4.body.letter), "…and the two pools never overlap: the register really has turned");
  const dm = rows("SELECT body FROM dm_messages WHERE senderId = ? ORDER BY id DESC LIMIT 3", bot.id);
  ok(dm.length >= 2 && dm.some((m) => m.body === d4.body.letter), "the letter really lands as a DM from the goblins, not just in the response");
  const tooSoon = await api("POST", "/api/admin/goblins/dun", { token: admin, body: { userId: debtor.id } });
  ok(tooSoon.status === 409 && tooSoon.body?.error === "too_soon", "…and a second one inside the gap is refused");
  const dunForced = await api("POST", "/api/admin/goblins/dun", { token: admin, body: { userId: debtor.id, force: true } });
  ok(dunForced.status === 200, "force skips the gap");
  run("UPDATE users SET jailedAt = ? WHERE id = ?", Date.now(), debtor.id);
  run("DELETE FROM app_kv WHERE key = ?", `goblin_dun:${debtor.id}`);
  const jailed = await api("POST", "/api/admin/goblins/dun", { token: admin, body: { userId: debtor.id, force: true } });
  ok(jailed.status === 409 && jailed.body?.error === "in_custody",
    "…but not even force writes to a prisoner — force skips the gap, never the rules");
  run("UPDATE users SET jailedAt = NULL WHERE id = ?", debtor.id);
  run("DELETE FROM loans WHERE userId = ?", debtor.id);

  console.log("\n-- the barker in #general");
  const channels = (await api("GET", "/api/channels", { token: mark.token })).body?.channels ?? [];
  const general = channels.find((c) => c.name === "general");
  ok(!!general, "there is a #general to bark in");
  const sterlingId = row("SELECT id FROM users WHERE username = 'sterling'").id;
  const msgs = async () => (await api("GET", `/api/channels/${general.id}/messages`, { token: mark.token })).body?.messages ?? [];
  const before = (await msgs()).map((m) => m.id);
  const bark = await api("POST", "/api/admin/goblins/bark", { token: admin });
  ok(bark.status === 200 && bark.body?.channelId === general.id, "the admin's lever barks in #general");
  await sleep(900);
  const fresh = (await msgs()).filter((m) => !before.includes(m.id)).sort((a, b) => a.id - b.id);
  const post = fresh.find((m) => m.id === bark.body.messageId);
  ok(!!post && post.userId === bot.id && post.body.length > 80, "the goblins' post is there, under their name, and it's a pitch");
  const scold = fresh.find((m) => m.userId === sterlingId);
  ok(!!scold && scold.replyToId === post.id && scold.replyTo?.id === post.id && scold.replyTo?.author?.id === bot.id, "Sterling answers AS A REPLY to the goblins' post");
  ok(!!scold && scold.body.length > 80 && scold.body !== post.body, "…scolding them at length");
  const retort = fresh.find((m) => m.userId === bot.id && m.id !== post.id);
  ok(!retort || retort.replyToId === scold.id, retort ? "the goblins' retort threads under Sterling's reply" : "no retort this time (they dared not) — allowed");
  ok(Number(row("SELECT value FROM app_kv WHERE key = 'goblin_bark_at'")?.value) > 0, "the bark is stamped in app_kv so a restart can't repeat it");
  const trio1 = row("SELECT value FROM app_kv WHERE key = 'goblin_bark_last'")?.value;
  const bark2 = await api("POST", "/api/admin/goblins/bark", { token: admin });
  await sleep(900);
  const trio2 = row("SELECT value FROM app_kv WHERE key = 'goblin_bark_last'")?.value;
  const post2 = (await msgs()).find((m) => m.id === bark2.body?.messageId);
  ok(bark2.status === 200 && trio1 && trio2 && trio1 !== trio2 && post2 && post2.body !== post.body, "a second bark never reuses the same trio of lines");

  console.log("\n-- the room the house talks in");
  // Josh, Sep 2026: "the ability for the admin to designate a text channel for
  // solace general to make the bot only communicate their random talks in. if
  // someone runs commands in another chat let the npc repsond the there as
  // well." Both halves are the claim, so both halves are driven. The three
  // voices all resolve through ONE function (Sterling.generalChannel), so the
  // barker standing in for them here is the whole surface.
  const mk = await api("POST", "/api/channels", { token: admin, body: { name: "bot-corner", pageId: 1 } });
  const corner = mk.body?.channel;
  ok(mk.status === 200 && !!corner, "the admin opens a side room for them");
  const asMember = await api("PATCH", "/api/pages/1", { token: mark.token, body: { botChannelId: corner.id } });
  ok(asMember.status === 403 && asMember.body?.error === "forbidden", "a member cannot touch the page's settings at all");
  // THE SHARPER TEST: a page MANAGER may edit everything else on that dialog,
  // and still may not move the house's voice — the three bots belong to the
  // Foundry, not to whoever runs the page. Done on a second page, because
  // Solace General deliberately has no membership editing.
  const mine = (await api("POST", "/api/pages", { token: admin, body: { name: "Manager Test", joinPolicy: "open" } })).body?.page;
  await api("POST", `/api/pages/${mine.id}/members`, { token: admin, body: { userId: mark.id, role: "manager" } });
  const ownCh = (await api("POST", "/api/channels", { token: admin, body: { name: "their-room", pageId: mine.id } })).body?.channel;
  const mgrLanding = await api("PATCH", `/api/pages/${mine.id}`, { token: mark.token, body: { defaultChannelId: ownCh.id } });
  ok(mgrLanding.status === 200 && mgrLanding.body?.page?.defaultChannelId === ownCh.id, "a page manager sets their own landing channel");
  const mgrBots = await api("PATCH", `/api/pages/${mine.id}`, { token: mark.token, body: { botChannelId: ownCh.id } });
  ok(mgrBots.status === 403 && mgrBots.body?.error === "admin_only",
    "…and is refused the bot channel by name — the house's voice is the Operator's call, not the page's");
  const bogus = await api("PATCH", "/api/pages/1", { token: admin, body: { botChannelId: 999_999 } });
  ok(bogus.status === 400 && bogus.body?.error === "bad_bot_channel", "…nor can the admin point it at a channel that isn't there");
  const set = await api("PATCH", "/api/pages/1", { token: admin, body: { botChannelId: corner.id } });
  ok(set.status === 200 && set.body?.page?.botChannelId === corner.id, "the admin nominates the room");
  const bark3 = await api("POST", "/api/admin/goblins/bark", { token: admin });
  ok(bark3.status === 200 && bark3.body?.channelId === corner.id, "the barker moves there — and takes Sterling with it");
  await sleep(900);
  const inCorner = (await api("GET", `/api/channels/${corner.id}/messages`, { token: mark.token })).body?.messages ?? [];
  ok(inCorner.some((m) => m.userId === sterlingId), "…Sterling's scold lands in the same room, not back in #general");
  // THE OTHER HALF: a command is answered WHERE IT WAS TYPED, always.
  const beforeGen = (await msgs()).map((m) => m.id);
  await api("POST", `/api/channels/${general.id}/messages`, { token: mark.token, body: { body: "/goblins vault" } });
  await sleep(900);
  const answer = (await msgs()).filter((m) => !beforeGen.includes(m.id)).find((m) => m.userId === bot.id);
  ok(!!answer && /silver in the reserve/i.test(answer.body), "asked in #general, they answer in #general — the setting only moves what nobody asked for");
  const cornerAfter = (await api("GET", `/api/channels/${corner.id}/messages`, { token: mark.token })).body?.messages ?? [];
  ok(cornerAfter.length === inCorner.length, "…and the side room stays quiet");
  // Deleting the nominated channel must not silence the house.
  await api("DELETE", `/api/channels/${corner.id}`, { token: admin });
  ok(row("SELECT botChannelId FROM pages WHERE id = 1")?.botChannelId == null,
    "deleting that channel clears the setting rather than leaving a dangling id");
  const bark4 = await api("POST", "/api/admin/goblins/bark", { token: admin });
  ok(bark4.status === 200 && bark4.body?.channelId === general.id, "…and the house falls back to #general instead of going mute");

  console.log("\n-- Sterling by rank");
  // The greeting is picked from WEIGHTED POOLS, so any single ring is a coin
  // flip and "does the text contain 'The Complete'" was a ~1-in-10 flake that
  // turned the whole suite red for nothing (the test_shyguy lesson: an assert
  // that flaps is worse than no assert). Match the REAL exported Tier-4 pool,
  // over enough rings that a miss is ~1 in 1000. Sep 2026 review.
  const RINGS = 10;
  const escapeRe = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
  const tier4 = L.greetingTier4.map(
    (t) => new RegExp("^" + t.split("{name}").map(escapeRe).join(".+") + "$"),
  );
  for (let i = 0; i < RINGS; i++) {
    await api("POST", `/api/channels/${general.id}/messages`, { token: admin, body: { body: "/sterling" } });
    await sleep(200);
  }
  await sleep(400);
  const greetings = (await msgs())
    .filter((m) => m.userId === sterlingId && !/^No\.|Absolutely|Concession/.test(m.body))
    .slice(-RINGS);
  // THE GREETING IS THE FIRST BLOCK, not the whole message (Sep 2026): a bare
  // /sterling now carries a "/sterling help" pointer after a blank line, so
  // every house voice says where its own command list is. Matching the whole
  // body anchored ^…$ made that feature read as a broken greeting.
  const firstBlock = (b) => b.split("\n\n")[0];
  const complete = greetings.filter((m) => tier4.some((re) => re.test(firstBlock(m.body)))).length;
  ok(complete >= 1, `the admin (Tier 4 at the door) ringing /sterling hears The Complete's own greeting (${complete}/${RINGS})`);

  console.log("\n-- the streaks the letters read");
  const spinner = await register("spinner");
  await mint(spinner.id, 400);
  let prev = 0, consistent = true, spun = 0;
  for (let i = 0; i < 7; i++) {
    const s = await api("POST", "/api/wheel/spin", { token: spinner.token });
    if (s.status !== 200) break;
    const type = s.body?.result?.type ?? s.body?.outcome?.result?.type;
    if (type === "death") break;
    spun++;
    const v = row("SELECT value FROM user_stats WHERE userId = ? AND key = 'wheel_blanks'", spinner.id)?.value ?? 0;
    if (type === "blank") { if (v !== prev + 1) consistent = false; } else if (v !== 0) consistent = false;
    prev = v;
  }
  ok(spun >= 3 && consistent, `wheel_blanks extends on a blank and breaks on anything else, spin by spin (${spun} spins)`);
  prev = 0; consistent = true;
  let pulled = 0;
  for (let i = 0; i < 25; i++) {
    const p = await api("POST", "/api/slots/pull", { token: spinner.token });
    if (p.status !== 200) break;
    pulled++;
    const v = row("SELECT value FROM user_stats WHERE userId = ? AND key = 'slots_dry'", spinner.id)?.value ?? 0;
    if (p.body.result?.type === "lose") { if (v !== prev + 1) consistent = false; } else if (v !== 0) consistent = false;
    prev = v;
  }
  ok(pulled === 25 && consistent, "slots_dry extends on a coinless pull and breaks on a win, pull by pull");
} finally {
  stop();
  await sleep(300);
}

console.log(`\n${n - bad}/${n} passed${bad ? ` — ${bad} FAILED` : ""}`);
process.exit(bad ? 1 : 0);
