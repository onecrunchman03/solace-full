// SOLACE SURVIVORZ — THE CAST'S FILES, ASKED FOR EARLY (Nov 3 2026 — Josh: "speed up the loading of the
// stream"). The watch socket opens as the page does, so the run's snapshot is in hand while the effects
// are still loading; its bodies start downloading into the asset store (../assetcache.ts) at once instead
// of after the bunker has loaded, and by the time the cast is dressed their bytes are on this machine.
//
// PURE (no three.js, no DOM): scripts/checks/test_survivorz_client.mjs drives it.

export interface CastBody { kind: string; body: string; turned?: unknown; escaped?: unknown }

/** the body files a snapshot draws, each once: the survivors first (the faces the curtain waits for),
 *  then the dead. A survivor who turned or got out isn't drawn as themselves (scene.ts spawnBody). */
export function castFiles(bodies: readonly CastBody[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (f: string): void => { if (f && !seen.has(f)) { seen.add(f); out.push(f); } };
  for (const b of bodies) if (b.kind === "survivor" && !b.turned && !b.escaped) add(b.body);
  for (const b of bodies) if (b.kind !== "survivor") add(b.body);
  return out;
}
