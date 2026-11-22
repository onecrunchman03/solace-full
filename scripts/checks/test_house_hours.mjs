// THE HOUSE'S HOURS (Josh, Sep 2026: "i see sterling has events during the AM
// est. most people using this app are only gonna be online and active around
// 0800 to 0200 the next days lets try to focus the special events during this
// window. same with the goblins").
//
// Everything the house STARTS ON ITS OWN — Sterling's specials, the goblins'
// letters, their barker, the sexton's remembrances — waits for 08:00–02:00
// America/New_York. Everything REACTIVE does not.
//
// Why this is a harness and not a comment, in the order it can hurt:
//  1. THE ZONE IS A ZONE, NOT AN OFFSET. Josh said EST; the box runs UTC. A
//     hardcoded -5 puts every event an hour wrong for eight months a year, and
//     it would be wrong SILENTLY — an event at 07:00 instead of 08:00 looks
//     exactly like an event at 08:00 to anyone reading the code.
//  2. THE WINDOW WRAPS MIDNIGHT. 01:30 is inside it and 05:00 is outside it,
//     which is the opposite of what a naive `h >= open && h < close` says.
//  3. AN EVENT IS A WINDOW, NOT A MOMENT. A six-hour rake holiday announced at
//     01:00 is announced to an empty building — five of its six hours are gone
//     before anybody arrives. `houseFits` is what refuses that.
//  4. THE TICK MUST NEVER LOSE A ROLL. Sterling rolls his 1-in-N first and
//     THEN picks among the specials that fit, so there has to be at least one
//     that fits at every open minute, or the odds quietly thin out at the
//     edges of the window. The 24h special is what guarantees it.
//  5. THE GATES ARE ACTUALLY WIRED. The arithmetic being right is worth
//     nothing if a tick stops calling it, so the source is swept too.

import { readFileSync } from "node:fs";
import {
  HOUSE_TZ,
  HOUSE_OPEN,
  HOUSE_CLOSE,
  HOUSE_OPEN_SHARE,
  HOUSE_MIN_COVERAGE,
  houseClock,
  houseIsOpen,
  houseCoverage,
  houseFits,
} from "../../src/househours.ts";

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const H = 3_600_000;
/** The lengths Sterling's specials actually run for (SPECIAL_HOURS). */
const SPECIAL_HOURS = { flashsale: 2, spindrop: 0.5, rakefree: 6, potsweet: 0.5, doublestats: 24, shieldsale: 6 };

// The zone's offset at a given instant, read from the zone itself.
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: HOUSE_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false, hourCycle: "h23",
});
const offsetAt = (ms) => {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
};
/** The UTC instant at which the house's clock reads y-mo-d h:mi. */
const atLocal = (y, mo, d, h, mi = 0) => {
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 4; i++) t = Date.UTC(y, mo - 1, d, h, mi) - offsetAt(t);
  return t;
};

console.log("\n-- 1. THE ZONE IS A ZONE, NOT AN OFFSET --");
{
  ok(HOUSE_TZ === "America/New_York", "the house keeps New York time");
  // EDT in July (UTC-4), EST in January (UTC-5) — the same code, both answers.
  const julyNoonUtc = Date.UTC(2026, 6, 15, 16, 0); // 16:00 UTC
  const janNoonUtc = Date.UTC(2026, 0, 15, 17, 0);  // 17:00 UTC
  ok(near(houseClock(julyNoonUtc), 12), "16:00 UTC in July reads 12:00 (EDT, UTC-4)");
  ok(near(houseClock(janNoonUtc), 12), "17:00 UTC in January reads 12:00 (EST, UTC-5)");
  // The trap this exists for: the SAME UTC hour reads differently by season.
  const sameUtcHour = 16;
  const july = houseClock(Date.UTC(2026, 6, 15, sameUtcHour));
  const jan = houseClock(Date.UTC(2026, 0, 15, sameUtcHour));
  ok(near(july - jan, 1), "one UTC hour is two different local hours across DST");
  // 07:00 UTC is 03:00 EDT and 02:00 EST — shut under both, but a hardcoded
  // offset would have called one of them open.
  ok(!houseIsOpen(Date.UTC(2026, 6, 15, 7)) && !houseIsOpen(Date.UTC(2026, 0, 15, 7)),
    "07:00 UTC is shut in both seasons");
  ok(near(houseClock(atLocal(2026, 9, 22, 13, 30)), 13.5), "minutes ride the clock as a fraction");
}

console.log("\n-- 2. THE WINDOW WRAPS MIDNIGHT --");
{
  ok(HOUSE_OPEN === 8 && HOUSE_CLOSE === 2, "the doors are 08:00 to 02:00");
  const open = [8, 9, 12, 17, 20, 23, 0, 1];
  const shut = [2, 3, 4, 5, 6, 7];
  for (const h of open) ok(houseIsOpen(atLocal(2026, 9, 22, h, 30)), `open at ${String(h).padStart(2, "0")}:30`);
  for (const h of shut) ok(!houseIsOpen(atLocal(2026, 9, 22, h, 30)), `shut at ${String(h).padStart(2, "0")}:30`);
  // The two edges, to the minute — a half-open interval on both sides.
  ok(houseIsOpen(atLocal(2026, 9, 22, 8, 0)), "08:00 exactly is open");
  ok(!houseIsOpen(atLocal(2026, 9, 22, 7, 59)), "07:59 is still shut");
  ok(houseIsOpen(atLocal(2026, 9, 22, 1, 59)), "01:59 is still open");
  ok(!houseIsOpen(atLocal(2026, 9, 22, 2, 0)), "02:00 exactly is shut");
  // Winter too, so nothing about the edges is an EDT accident.
  ok(houseIsOpen(atLocal(2026, 1, 14, 1, 30)) && !houseIsOpen(atLocal(2026, 1, 14, 4, 30)),
    "the wrap holds in EST as well as EDT");
  ok(near(HOUSE_OPEN_SHARE, 18 / 24), "the house is open three quarters of the day");
}

console.log("\n-- 3. AN EVENT IS A WINDOW, NOT A MOMENT --");
{
  ok(near(houseCoverage(atLocal(2026, 9, 22, 12), 2 * H), 1), "a 2h special at noon runs entirely in the hours");
  ok(near(houseCoverage(atLocal(2026, 9, 22, 8), 24 * H), 0.75, 0.01), "a 24h special covers the open share");
  // The exact case Josh is complaining about: six hours from 01:00 spends five
  // of them in an empty building.
  const rakeAtOne = houseCoverage(atLocal(2026, 9, 22, 1), 6 * H);
  ok(near(rakeAtOne, 1 / 6, 0.01), `a 6h holiday at 01:00 is ${(rakeAtOne * 100).toFixed(0)}% wasted-adjacent`);
  ok(rakeAtOne < HOUSE_MIN_COVERAGE, "…and is therefore refused");
  const rakeAtEight = houseCoverage(atLocal(2026, 9, 22, 20), 6 * H);
  ok(near(rakeAtEight, 1, 0.01), "the same holiday at 20:00 runs wholly inside the hours");
  // A span straddling the close from the open side.
  ok(near(houseCoverage(atLocal(2026, 9, 22, 0), 4 * H), 0.5, 0.01), "a 4h span from midnight is half in, half out");
  ok(houseCoverage(atLocal(2026, 9, 22, 4), 1 * H) === 0, "a span wholly in the dead hours covers nothing");
  ok(houseCoverage(atLocal(2026, 9, 22, 4), 0) === 0, "a zero-length event at 04:00 covers nothing");
  ok(houseCoverage(atLocal(2026, 9, 22, 12), 0) === 1, "a zero-length event at noon covers everything");
  // Sampling must not be fooled by a span longer than a day.
  ok(near(houseCoverage(atLocal(2026, 9, 22, 8), 7 * 24 * H), 0.75, 0.01), "a week-long span still reads 0.75");
}

console.log("\n-- 4. THE TICK NEVER LOSES A ROLL --");
{
  // Sterling rolls his odds BEFORE filtering to the specials that fit, so at
  // every open minute at least one must fit — else the effective rate sags at
  // the edges of the window and nobody would ever see why.
  let emptyAt = null, everShort = null;
  for (let m = 0; m < 24 * 60 && !emptyAt; m += 1) {
    const t = atLocal(2026, 9, 22, 0, 0) + m * 60_000;
    if (!houseIsOpen(t)) continue;
    const fits = Object.entries(SPECIAL_HOURS).filter(([, h]) => houseFits(h * H, t));
    if (!fits.length) emptyAt = m;
    if (fits.length < Object.keys(SPECIAL_HOURS).length && !everShort) everShort = m;
  }
  ok(emptyAt === null, "every open minute of the day has at least one special that fits");
  ok(everShort !== null, "…and the hours really do rule some of them out (the filter isn't a no-op)");
  ok(houseFits(24 * H, atLocal(2026, 9, 22, 1, 59)), "the 24h special fits even at the last open minute");
  ok(!houseFits(6 * H, atLocal(2026, 9, 22, 1, 0)), "a 6h special does not fit at 01:00");
  ok(!houseFits(2 * H, atLocal(2026, 9, 22, 4, 0)), "nothing fits while the house is shut");
  ok(!houseFits(0.5 * H, atLocal(2026, 9, 22, 5, 0)), "…not even the half-hour ones");
  // The shape Josh asked for: the long promotions go up early, the quick ones
  // can still go up late.
  const lastStart = (hours) => {
    let last = null;
    for (let m = 0; m < 24 * 60; m++) {
      const t = atLocal(2026, 9, 22, 8, 0) + m * 60_000;
      if (houseFits(hours * H, t)) last = t; else if (last) break;
    }
    return houseClock(last);
  };
  const last6 = lastStart(6), last2 = lastStart(2);
  ok(last6 > 20 && last6 < 23, `a 6h special may start until ~${last6.toFixed(1)}h`);
  ok(last2 > 23 || last2 < 2, `a 2h special may start until ~${last2.toFixed(1)}h`);
  ok(last2 !== last6, "a shorter event gets a later last call than a longer one");
}

console.log("\n-- 5. THE CLOCKS SURVIVE THE DAYS THAT AREN'T 24 HOURS LONG --");
{
  // Spring forward 2026-03-08 (02:00 never happens) and fall back 2026-11-01
  // (01:00 happens twice). Nothing here may throw, invert, or leave the range.
  for (const [y, mo, d, label] of [[2026, 3, 8, "spring forward"], [2026, 11, 1, "fall back"]]) {
    const start = Date.UTC(y, mo - 1, d - 1, 12);
    let openMin = 0, sane = true;
    for (let m = 0; m < 48 * 60; m++) {
      const t = start + m * 60_000;
      const c = houseClock(t);
      if (!(c >= 0 && c < 24)) sane = false;
      if (houseIsOpen(t)) openMin++;
    }
    ok(sane, `the clock stays in [0,24) across ${label}`);
    // 48h of normal days would be 36 open hours; the DST day moves it by one.
    ok(Math.abs(openMin / 60 - 36) <= 1.01, `${label}: ${(openMin / 60).toFixed(1)} open hours in 48 (36 ± 1)`);
    const cov = houseCoverage(start, 48 * H);
    ok(cov > 0.7 && cov < 0.8, `${label}: coverage of two days reads ${cov.toFixed(3)}`);
  }
}

console.log("\n-- 6. THE GATES ARE ACTUALLY WIRED --");
{
  const sterling = readFileSync("src/sterling.ts", "utf8");
  const goblins = readFileSync("src/goblins.ts", "utf8");
  const voss = readFileSync("src/voss.ts", "utf8");
  const between = (src, from, to) => {
    const i = src.indexOf(from);
    if (i < 0) return "";
    const j = src.indexOf(to, i + from.length);
    return src.slice(i, j < 0 ? src.length : j);
  };
  ok(/from "\.\/househours"/.test(sterling), "sterling.ts reads the house's hours");
  ok(/from "\.\/househours"/.test(goblins), "goblins.ts reads the house's hours");
  ok(/from "\.\/househours"/.test(voss), "voss.ts reads the house's hours");
  const tick = between(sterling, "private tick(): void {", "\n  /**");
  ok(/houseIsOpen\(/.test(tick), "Sterling's tick checks the doors before firing a special");
  ok(/houseFits\(/.test(tick), "…and picks only from the specials whose run fits");
  ok(/houseIsOpen\(/.test(between(sterling, "private remembrances(): void {", "\n  // ----")),
    "the sexton's remembrances wait for the doors");
  ok(/houseIsOpen\(/.test(between(goblins, "private maybeWrite(): void {", "\n  /**")),
    "the goblins' letter waits for the doors");
  ok(/houseIsOpen\(/.test(between(goblins, "private maybeBark(): void {", "\n  /**")),
    "the barker waits for the doors");
  ok(/houseIsOpen\(/.test(between(voss, "private maybeNotice(): void {", "\n  /**")),
    "Dr. Voss's field notice waits for the doors");
  // The rates are shortened by the share of the day the gate costs them, so
  // moving the events did not silently make them rarer.
  ok(/STERLING_FIRE_ODDS \?\? Math\.round\(430 \* HOUSE_OPEN_SHARE\)/.test(sterling),
    "Sterling's odds are scaled by the open share, not left at the raw number");
  ok(/GOBLIN_PITCH_ODDS \?\? Math\.round\(9 \* HOUSE_OPEN_SHARE\)/.test(goblins),
    "the goblins' letter odds are scaled the same way");
  ok(/GOBLIN_BARKER_ODDS \?\? Math\.round\(200 \* HOUSE_OPEN_SHARE\)/.test(goblins),
    "…and so are the barker's");
  ok(/VOSS_NOTICE_ODDS \?\? Math\.round\(240 \* HOUSE_OPEN_SHARE\)/.test(voss),
    "…and the field notice's");
  // The courtesy is the documented exception: help before a death, so it
  // reaches somebody who is AT THE WHEEL at any hour.
  const courtesy = between(sterling, "private maybeOfferShield(): void {", "\n  /**");
  ok(/AT_THE_WHEEL_MS/.test(courtesy), "the shield courtesy still reaches a player at the wheel out of hours");
  ok(/houseIsOpen\(/.test(courtesy), "…but holds back from everyone else until the doors open");
}

console.log(`\n${n - bad}/${n} asserts passed`);
process.exit(bad ? 1 : 0);
