// THE TOUCH FLOOR, as a rule nobody can quietly undercut.
//
// Run:  node scripts/checks/test_touch_floor.mjs
//
// The phone UI's 44px floor lives in ONE global block in client/src/app.css.
// It shipped first as an ALLOW-LIST of four class names (.go, .counter,
// .tc-join, .tc-watch) on the theory that those were "the app's own
// vocabulary for the button that does the thing". A sweep of every
// phone-reachable view at 390px proved that theory false — the Nightly
// Draw's only action is .buy (39px), Direct Trade's is .new (38px), and the
// recovery-secret gate that every new account must clear had an unclassed
// button at 37px. None of those were reachable by the list, and none were
// visible without measuring.
//
// So the rule was inverted: every button gets the floor, and exceptions are
// named. This harness pins BOTH halves, because both can rot quietly:
//
//   1. the global floor still exists, still applies to bare `button`, and is
//      still scoped to phone width (a floor that leaked to desktop would
//      inflate the whole app);
//   2. no component's own phone media query undercuts it.
//
// (2) is the one that actually bit. A component's scoped rule sits at equal
// specificity and LATER in document order, so `.cell { min-height: 42px }`
// inside its own @media beats the global 44 in silence — no error, no
// warning, just a target 2px too small that nobody measures again. Roulette's
// betting grid, both composers and the chat header all did exactly this.
//
// This is a SOURCE check, not a browser one: it runs in plain Node in
// milliseconds and it fails on the diff that introduces the problem, which
// is the moment it is cheapest to fix. The browser sweep is still how you
// find a NEW class of defect; this is how the fixed one stays fixed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, "..", "..", "client", "src");
const APPCSS = path.join(SRC, "app.css");

let n = 0;
let bad = 0;
const ok = (c, name) => {
  n++;
  if (!c) {
    bad++;
    console.error("  x " + name);
  } else console.log("  + " + name);
};

// ---- 1. the global floor is present and shaped right --------------------
const css = fs.readFileSync(APPCSS, "utf8");
const floorAt = css.indexOf("THE TOUCH FLOOR");
ok(floorAt > 0, "app.css carries the documented THE TOUCH FLOOR block");

// the @media that follows the comment, up to its closing brace
const afterComment = css.slice(floorAt);
const mqMatch = afterComment.match(/@media\s*([^{]+)\{/);
const mqCond = mqMatch ? mqMatch[1].trim() : "";
ok(!!mqMatch, "the floor is inside a media query");
ok(/max-width:\s*760px/.test(mqCond), `…keyed to the phone width, 760px (found "${mqCond}")`);
// A PHONE ON ITS SIDE is still a phone (Sep 2026). The floor has to follow
// phone mode into landscape, or a rotated phone keeps the desktop target
// sizes while wearing the phone UI.
ok(/max-height:\s*500px/.test(mqCond) && /pointer:\s*coarse/.test(mqCond),
  "…and carries the landscape clause, so a rotated phone keeps the floor");

let block = "";
if (mqMatch) {
  const start = afterComment.indexOf(mqMatch[0]) + mqMatch[0].length;
  let depth = 1;
  let i = start;
  for (; i < afterComment.length && depth > 0; i++) {
    if (afterComment[i] === "{") depth++;
    else if (afterComment[i] === "}") depth--;
  }
  block = afterComment.slice(start, i - 1);
}
ok(block.length > 0, "the floor block parses");

// The load-bearing assert: a BARE `button` selector, not a list of classes.
const selectorsWith44 = [];
for (const rule of block.split("}")) {
  if (!/min-height:\s*44px/.test(rule)) continue;
  const sel = rule.split("{")[0];
  if (sel) selectorsWith44.push(sel.replace(/\/\*[\s\S]*?\*\//g, "").trim());
}
const all44 = selectorsWith44.join(",");
const bareButton = /(^|,)\s*button\s*(,|$)/m.test(all44);
ok(bareButton, "the floor applies to a BARE `button` selector, not an allow-list of classes");
ok(/\[role="button"\]/.test(all44), "…and to [role=\"button\"]");
ok(/(^|,)\s*textarea\s*(,|$)/m.test(all44) || /textarea/.test(all44), "…and to textarea");
ok(/input/.test(all44), "…and to text inputs");

// The old allow-list must not be the ONLY thing granting the floor.
const onlyClasses = selectorsWith44.every((s) => /\./.test(s));
ok(!onlyClasses, "the floor is not purely class-scoped (that was the original bug)");

// Exceptions exist and are deliberate.
const exceptions = [];
for (const rule of block.split("}")) {
  if (!/min-height:\s*0/.test(rule)) continue;
  const sel = rule.split("{")[0];
  if (sel) exceptions.push(...sel.split(",").map((s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean));
}
ok(exceptions.length > 0, `the exceptions are named in the same block (${exceptions.length} of them)`);
ok(exceptions.includes(".tabbtn"), "…the tab bar's own buttons are exempt (fixed grid, already 56px)");
ok(exceptions.includes(".author"), "…a message author's name is exempt (press-and-hold is the real target)");
ok(
  /dense|beside|bigger way in|exception/i.test(block) || /dense|beside/i.test(afterComment.slice(0, floorAt + 2200)),
  "…and the block explains WHY something may be exempt",
);

// ---- 2. no component undercuts the floor --------------------------------
// Walk every component/stylesheet, find phone media queries, and flag any
// control-shaped rule setting a height under 44 inside one.
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(svelte|css)$/.test(e.name)) files.push(p);
  }
})(SRC);
ok(files.length > 40, `walked the client source (${files.length} files)`);

// Deliberate, reviewed exceptions: selector fragment → why.
const ALLOWED = [
  {
    file: "components/TermsGate.svelte",
    why: "the consent checkbox is 22px INSIDE a 44px row — a 44px checkbox is just a big checkbox",
    max: 22,
  },
  {
    file: "components/Login.svelte",
    why: "the sign-up consent checkbox, same shape: a 22px box in a 44px row, and its label holds the three document links so the BOX is what you aim at",
    max: 22,
  },
];

const CONTROLISH = /btn|button|\.tab\b|\.chip|\.cell|\.item|\.nav|input|\.go\b|\.pill|\.key|\.act|\.opt|\.row/i;
const offenders = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join("/");
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  let inPhoneMq = false;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const mq = L.match(/@media[^{]*max-width:\s*(\d+)px/);
    if (mq && Number(mq[1]) <= 860) {
      inPhoneMq = true;
      depth = 0;
    }
    if (!inPhoneMq) continue;
    depth += (L.match(/\{/g) || []).length;
    depth -= (L.match(/\}/g) || []).length;
    const m = L.match(/(?:^|[;{\s])(min-height|height)\s*:\s*([\d.]+)px/);
    if (m) {
      const px = Number(m[2]);
      const ctx = lines.slice(Math.max(0, i - 6), i + 1).join(" ");
      if (px < 44 && px >= 16 && CONTROLISH.test(ctx)) {
        const allowed = ALLOWED.find((a) => rel === a.file && px <= a.max);
        if (!allowed) offenders.push(`${rel}:${i + 1} → ${m[1]}: ${px}px`);
      }
    }
    if (depth <= 0 && L.includes("}")) inPhoneMq = false;
  }
}
ok(
  offenders.length === 0,
  offenders.length
    ? `NO component undercuts the touch floor — found ${offenders.length}: ${offenders.join(" · ")}`
    : "no component undercuts the touch floor inside its own phone media query",
);

// The allow-list itself must stay honest: each entry names a real file.
for (const a of ALLOWED) {
  ok(fs.existsSync(path.join(SRC, a.file)), `the documented exception ${a.file} still exists`);
  ok(a.why.length > 20, `…and says why (${a.file})`);
}

// ---- 3. the CSS and the JS agree on what a phone IS ----------------------
// phone.svelte.ts decides whether to show the tab bar; the CSS decides
// whether anything is laid out for one. They read the same string
// (PHONE_QUERY, in the rune-free module) precisely so they cannot drift —
// a tab bar over a desktop layout, or a phone layout with no tab bar, is
// the kind of bug that only shows up on a real device.
//
// Landscape made this sharp: the phone breakpoint grew a second clause, and
// a file left behind would keep the desktop layout on a rotated phone. So
// EVERY 760px query in the client must carry the whole condition. (Other
// breakpoints — the 700px counters, the 820px rail collapse — are different
// decisions and are deliberately not checked here.)
const phoneViewsSrc = fs.readFileSync(path.join(SRC, "lib", "phone-views.ts"), "utf8");
const pq = phoneViewsSrc.match(/export const PHONE_QUERY\s*=\s*"([^"]+)"/);
ok(!!pq, "phone-views.ts exports PHONE_QUERY");
const query = pq ? pq[1] : "";
ok(/max-width:\s*760px/.test(query), "…the JS definition carries the narrow clause");
ok(/max-height:\s*500px/.test(query) && /pointer:\s*coarse/.test(query),
  "…and the landscape clause (a phone on its side is still a phone)");

const drifted = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join("/");
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    if (!/@media/.test(line) || !/max-width:\s*760px/.test(line)) continue;
    const hasLandscape = /max-height:\s*500px/.test(line) && /pointer:\s*coarse/.test(line);
    // `(hover: none)` already matches ANY touch device in ANY orientation, so
    // a query written as `(hover: none), (max-width: 760px)` covers a phone on
    // its side without the extra clause — the four touch-target rules are
    // written that way on purpose. Adding the landscape clause there would be
    // redundant, so this accepts either spelling and only catches a query
    // that is narrow-ONLY.
    const coversTouch = /hover:\s*none/.test(line);
    if (!hasLandscape && !coversTouch) drifted.push(rel);
  }
}
ok(
  drifted.length === 0,
  drifted.length
    ? `every 760px query carries the landscape clause — ${[...new Set(drifted)].join(", ")} do(es) not`
    : "every 760px phone query in the client carries the landscape clause too",
);

// ---- 4. a phone override is not shadowed by its own base rule ------------
// THE TRAP THIS EXISTS FOR, in one sentence: a phone `@media` block placed
// ABOVE the ordinary rule it means to override loses on source order and does
// nothing at all — no error, no warning, the property simply never applies.
//
// It is written in comments in three places in Shop.svelte, because it has
// been sprung there three times, twice by somebody who had read those very
// comments. Prose in a file nobody re-reads is not a control. This is:
//
//   .grid { ... }                     <- phone block, line 1141
//   @media (max-width: 700px) { ... }
//   ...
//   .grid { grid-template-columns: … } <- base rule, line 1580, WINS
//
// The check is deliberately narrow, so it accuses only when it is certain:
// the SAME selector text, the SAME property, the base rule appearing LATER in
// the file and outside any media query. Different specificity, shorthand vs
// longhand, and rules in other files are all left alone — a noisy version of
// this check would be turned off within a week.
const shadowed = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join("/");
  const src = fs.readFileSync(f, "utf8");
  const style = src.includes("<style") ? src.slice(src.indexOf("<style")) : src;

  // Collect declarations inside phone media blocks, and base rules outside.
  const inMedia = [];   // { sel, prop, at }
  const baseAt = new Map(); // "sel|prop" -> last offset outside a media query
  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(style)) !== null) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " ");
    if (!sel || sel.startsWith("@")) continue;
    // Is this rule inside a phone media block? Count braces before it.
    const before = style.slice(0, m.index);
    const lastMedia = before.lastIndexOf("@media");
    let insidePhoneMedia = false;
    let insideAnyMedia = false;
    if (lastMedia !== -1) {
      const between = before.slice(lastMedia);
      const opens = (between.match(/\{/g) || []).length;
      const closes = (between.match(/\}/g) || []).length;
      const cond = style.slice(lastMedia, style.indexOf("{", lastMedia));
      insideAnyMedia = opens > closes;
      insidePhoneMedia = insideAnyMedia && /max-width:\s*(7\d\d|8[0-6]\d)px/.test(cond);
    }
    // A "base" rule is one under NO media query at all. A rule in some OTHER
    // media query (the landscape block, a print sheet, reduced-motion) is not
    // a base rule and must not be read as one — that mistake made this check
    // accuse sixteen innocent rules the first time it ran.
    if (insideAnyMedia && !insidePhoneMedia) continue;
    for (const decl of m[2].split(";")) {
      const d = decl.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const c = d.indexOf(":");
      if (c < 1) continue;
      const prop = d.slice(0, c).trim();
      if (!/^[a-z-]+$/.test(prop)) continue;
      if (insidePhoneMedia) inMedia.push({ sel, prop, at: m.index });
      else baseAt.set(sel + "|" + prop, m.index);
    }
  }
  for (const o of inMedia) {
    const at = baseAt.get(o.sel + "|" + o.prop);
    if (at !== undefined && at > o.at) {
      shadowed.push(`${rel}: "${o.sel}" { ${o.prop} } — phone rule at ${o.at}, base rule LATER at ${at}`);
    }
  }
}
ok(
  shadowed.length === 0,
  shadowed.length
    ? `no phone override is shadowed by its own base rule — found ${shadowed.length}:\n     ` +
      shadowed.join("\n     ")
    : "no phone override is shadowed by a later base rule for the same selector",
);

console.log("");
if (bad) {
  console.log(`${n - bad} passed, ${bad} FAILED`);
  process.exit(1);
}
console.log(`${n}/${n} touch-floor asserts passed`);
