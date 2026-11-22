// THE AFFINITY METER, the client's half (server: src/npc/affinity.ts).
// Your standing with Sterling, the goblins and Dr. Voss — loaded when you
// open a conversation with one of them, refreshed when a tier changes.
import { api, type NpcAffinity } from "./api";
import { pushNotice } from "./notices.svelte";

export const affinity = $state({
  loaded: false,
  /** The house's AI is running (server config.npcHouseAi). Archived (false): no meter, no memory on the pages. */
  on: false,
  house: false,
  byNpc: {} as Record<string, NpcAffinity>,
});

let inflight: Promise<void> | null = null;

export function loadAffinity(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await api.npcAffinity();
      affinity.on = r.on !== false;
      affinity.house = r.house;
      affinity.byNpc = Object.fromEntries(r.affinity.map((a) => [a.npc, a]));
      affinity.loaded = true;
    } catch {
      /* the meter is decoration; a failed read just leaves it as it was */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const NAMES: Record<string, string> = { sterling: "Sterling", goblins: "The Goblin Lenders", voss: "Dr. Voss" };

/** A tier crossed (the server's `npc.affinity` frame). */
export function onAffinityFrame(msg: { npc?: unknown; tier?: unknown; tierName?: unknown; up?: unknown }): void {
  const name = NAMES[String(msg.npc)] ?? "The house";
  const tier = Number(msg.tier);
  const up = msg.up === true;
  const title = up
    ? tier >= 3 ? `${name} trusts you` : tier === 2 ? `${name} counts you a regular` : `${name} knows your name now`
    : `${name} thinks less of you`;
  const body = up
    ? tier >= 3 ? "You've earned their confidence. Some things they'll only say to you now." : "Your standing went up."
    : `You're back to ${String(msg.tierName ?? "").toLowerCase()}.`;
  pushNotice({ title, body, tone: up ? "kind" : "grim", icon: up ? "🤝" : "📉" });
  if (affinity.loaded) void loadAffinity();
}

export function resetAffinity(): void {
  affinity.loaded = false;
  affinity.on = false;
  affinity.house = false;
  affinity.byNpc = {};
}
