// THE GHOST'S VOICE, ENFORCED (law 12 — Josh, Oct 2026: "whatever you
// recommend. just make sure it works").
//
// The dead keep their seat in the level's voice room so they hear the one they
// watch, but they may only SPEAK into it while the ghost key is held and the
// fifteen seconds aren't spent. That rule used to live in the dead player's own
// client (it muted itself), which an edited client simply ignores. Here the
// SERVER holds it: a spectator's participant in the level room has its
// `canPublish` switched on for the length of a granted talk and off again the
// moment it ends, so a talk past the budget has nowhere to go — LiveKit itself
// takes the track down when the right to publish is revoked.
//
// Free talk between the dead (spectators watching the same player "hear each
// other freely, as ordinary chat") is a second room per level, the dead's own
// — see ghostRoomOf and the voice-token route.

import { RoomServiceClient } from "livekit-server-sdk";
import { config } from "../config";

/** The level's voice room (one per level, law 10). */
export const levelRoomOf = (sectorId: string): string => `backrooms_${sectorId}`;
/** The dead's own room on that level: free talk among spectators. */
export const ghostRoomOf = (sectorId: string): string => `backrooms_${sectorId}_ghosts`;

/** LiveKit's server API. Production's LIVEKIT_URL is the public wss front
 *  (Caddy proxies /livekit to the SFU on the same box), and the app reaching
 *  its own SFU out through the router and back is the trip that drops a
 *  request now and then (the health probe's lesson) — so when LIVEKIT_URL is
 *  that front, the API is the SFU on this box. LIVEKIT_API_URL overrides. */
export function livekitApiUrl(): string {
  if (config.livekitApiUrl) return config.livekitApiUrl;
  const u = config.livekitUrl;
  if (!u) return "";
  if (/\/livekit\/?$/.test(u)) return "http://127.0.0.1:7880";
  return u.replace(/^ws(s?):\/\//, "http$1://");
}

let client: RoomServiceClient | null = null;
let clientFor = "";
const svc = (): RoomServiceClient | null => {
  const url = livekitApiUrl();
  if (!url || !config.livekitApiKey || !config.livekitApiSecret) return null;
  if (!client || clientFor !== url) {
    client = new RoomServiceClient(url, config.livekitApiKey, config.livekitApiSecret);
    clientFor = url;
  }
  return client;
};

/** Is server-side voice configured at all? Without it nobody has voice, so
 *  every gate is trivially satisfied. */
export const ghostVoiceLive = (): boolean => svc() !== null;

/** Remove everybody from a room who isn't on `keep` (Oct 2026 review): a
 *  voice token outlives the run it was minted for, so a member who had left
 *  the level could stay in, or rejoin, its room and hear every voice on it.
 *  Only numeric identities are touched (a viewer or agent seat is never a
 *  runner). A room that doesn't exist is nothing to sweep. Never throws. */
export async function sweepRoom(room: string, keep: Set<string>): Promise<void> {
  const s = svc();
  if (!s) return;
  try {
    const parts = await s.listParticipants(room);
    for (const p of parts) {
      if (!/^\d+$/.test(p.identity) || keep.has(p.identity)) continue;
      await s.removeParticipant(room, p.identity).catch(() => undefined);
    }
  } catch {
    /* no such room, or the SFU is down — the next sweep tries again */
  }
}

/** Let a spectator speak in the level room, or stop them. Resolves true when
 *  the SFU applied it — or when there is nothing to apply (no voice on this
 *  box, or the spectator isn't connected to the room: a refused publish is
 *  then simply what their next token says). Never throws. */
export async function setGhostPublish(sectorId: string, userId: number, on: boolean): Promise<boolean> {
  const s = svc();
  if (!s) return true;
  try {
    await s.updateParticipant(levelRoomOf(sectorId), String(userId), {
      permission: { canPublish: on, canSubscribe: true, canPublishData: false },
    });
    return true;
  } catch (e) {
    // "participant not found" — they aren't in the room right now, which is
    // the same as not publishing; anything else is a real failure
    const msg = e instanceof Error ? e.message : String(e);
    if (/not.?found|does not exist/i.test(msg)) return true;
    console.warn(`[backrooms] ghost voice: ${on ? "grant" : "revoke"} for ${userId} failed — ${msg}`);
    return false;
  }
}

/** Take a banned, suspended, reset or deleted account out of every voice room
 *  on the hub's SFU (Oct 2026 review): closing their sockets cleared their
 *  presence, but the SFU never heard, so a client that ignored the 4003 (or a
 *  second tab, or a pop-out) stayed in the call — listening and talking, now
 *  invisible on the sidebar. Viewer and watch seats (`<id>.…`) go too. Never
 *  throws; a box without voice does nothing. */
export async function kickFromVoice(userId: number): Promise<void> {
  const s = svc();
  if (!s) return;
  const id = String(userId);
  try {
    for (const r of await s.listRooms()) {
      try {
        for (const p of await s.listParticipants(r.name)) {
          if (p.identity === id || p.identity.startsWith(`${id}.`)) {
            await s.removeParticipant(r.name, p.identity).catch(() => undefined);
          }
        }
      } catch { /* the room closed between the two calls */ }
    }
  } catch { /* the SFU is down — nobody is talking on it either */ }
}
