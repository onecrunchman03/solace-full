/**
 * THE HOUSE'S HOURS (Josh, Sep 2026)
 *
 * "i see sterling has events during the AM est. most people using this app are
 *  only gonna be online and active around 0800 to 0200 the next days lets try
 *  to focus the special events during this window. same with the goblins"
 *
 * Everything the house does ON ITS OWN INITIATIVE — Sterling's specials, the
 * goblins' letters, their barker, the sexton's remembrances — is held to these
 * hours. Anything REACTIVE is NOT: an answer to a command, commentary on a
 * death, the herald at the door, a security alert and the collectors' daily
 * visit all belong to the moment that caused them, whatever the clock says.
 * The test for a new thing is simply "did a player's action start this?" — if
 * yes it fires when it fires, if no it waits for the doors to open.
 *
 * THE CLOCK IS AMERICA/NEW_YORK, NOT A FIXED OFFSET. Josh said EST and the box
 * runs UTC; hardcoding -5 would put every event an hour wrong for eight months
 * of the year. Intl carries the zone's own DST rules, so EST and EDT are the
 * same line of code.
 */

export const HOUSE_TZ = process.env.HOUSE_TZ ?? "America/New_York";
/** The doors open at 08:00 and close at 02:00 the next morning. */
export const HOUSE_OPEN = Number(process.env.HOUSE_OPEN_HOUR ?? 8);
export const HOUSE_CLOSE = Number(process.env.HOUSE_CLOSE_HOUR ?? 2);

const FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: HOUSE_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

/** The house's local time as a fractional hour in [0, 24). */
export function houseClock(at: number = Date.now()): number {
  const parts = FMT.formatToParts(new Date(at));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) + m / 60;
}

/** Is the building open right now? The window WRAPS past midnight, which is
 *  the whole point of it — 01:30 is a busy hour here and 05:00 is not. */
export function houseIsOpen(at: number = Date.now()): boolean {
  const h = houseClock(at);
  return HOUSE_OPEN < HOUSE_CLOSE
    ? h >= HOUSE_OPEN && h < HOUSE_CLOSE
    : h >= HOUSE_OPEN || h < HOUSE_CLOSE;
}

/**
 * What share of `[at, at + ms]` falls inside the house's hours, 0..1.
 *
 * AN EVENT IS A WINDOW, NOT A MOMENT. Announcing a six-hour rake holiday at
 * one in the morning is still announcing it to an empty building: five of its
 * six hours are gone before anybody arrives. So a special is chosen by whether
 * its RUN lands in the house's hours, not merely its announcement.
 *
 * Sampled at midpoints rather than solved analytically — the window wraps
 * midnight, the zone changes offset twice a year, and a span can cover several
 * days; a few hundred cheap lookups once a week is the honest way to get all
 * three right. `step` is the sample spacing in ms.
 */
export function houseCoverage(at: number, ms: number, step = 300_000): number {
  if (ms <= 0) return houseIsOpen(at) ? 1 : 0;
  const n = Math.max(1, Math.ceil(ms / step));
  let open = 0;
  for (let i = 0; i < n; i++) if (houseIsOpen(at + ((i + 0.5) * ms) / n)) open++;
  return open / n;
}

/** How much of an event's run has to land in the house's hours for it to be
 *  worth starting. A 24h promotion clears this from any hour (18/24 = 0.75);
 *  a 6h one has to start before about 22:20; a 2h one before about 00:45. */
export const HOUSE_MIN_COVERAGE = Number(process.env.HOUSE_MIN_COVERAGE ?? 0.6);

/** Would an event of this length, started now, spend enough of itself in front
 *  of an audience? */
export function houseFits(ms: number, at: number = Date.now()): boolean {
  return houseIsOpen(at) && houseCoverage(at, ms) >= HOUSE_MIN_COVERAGE;
}

/** The share of the day the house is open — the factor by which gating a
 *  per-tick roll on the hours would otherwise thin it out. */
export const HOUSE_OPEN_SHARE =
  ((HOUSE_OPEN < HOUSE_CLOSE ? HOUSE_CLOSE - HOUSE_OPEN : 24 - HOUSE_OPEN + HOUSE_CLOSE) / 24);
