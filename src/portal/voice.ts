// THE PORTAL — the two voice rooms (docs/portal/archive/voice.md).
// Players sit in them and talk, and theirs are the first voices in them in
// fifty-four million years. Tharvend keeps a recording of each room's LAST
// SESSION, and a rare playback fault plays four breaths of it to whoever is
// sitting there ALONE — never when the room is busy, never explained, never
// a jump scare. Every fault is filed in Tharvend's log as a repair.
//
// The audio rides LiveKit like every other voice room in the house; this
// keeps who is sitting where (a heartbeat while the room is open) and stamps
// the fault so two people in a room would hear the same clip at the same
// moment (one appearance, every observer — though it only ever fires for one).

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../db/store";

export const VOICE_ROOMS = ["ren-ta'an", "keth-ren"] as const;
export type VoiceRoom = (typeof VOICE_ROOMS)[number];
/** The clips each room's last session holds, by file stem (client/public/sfx/portal/). */
export const CLIPS: Record<VoiceRoom, string[]> = {
  "ren-ta'an": ["ren-taan-1", "ren-taan-2", "ren-taan-3", "ren-taan-4"],
  "keth-ren": ["keth-ren-1", "keth-ren-2", "keth-ren-3"],
};
/** The pulses alone are the gentlest and the commonest (voice.md: heard several times first). */
const WEIGHT: Record<string, number> = { "ren-taan-1": 4 };
/** A beat older than this and the seat is empty. */
export const SEAT_MS = 45_000;
/** Alone this long before a fault can come. */
export const ALONE_MS = 2 * 60_000;
/** Roughly once per several hours of sitting alone: the chance per heartbeat (every ~20 s). */
export const FAULT_CHANCE = 20 / (4 * 3600);

export class PortalVoice {
  private seats = new Map<VoiceRoom, Map<number, number>>();
  private aloneSince = new Map<VoiceRoom, number>();
  private faults = new Map<VoiceRoom, { clip: string; at: number }>();
  /** The clips that are really on disk; a room with none never faults. */
  readonly present: Set<string>;

  constructor(private store: Store, roots: string[] = process.env.PORTAL_CLIPS_DIR ? [process.env.PORTAL_CLIPS_DIR] : ["client/dist/sfx/portal", "client/public/sfx/portal"]) {
    this.present = new Set(Object.values(CLIPS).flat().filter((c) => roots.some((r) => existsSync(join(r, `${c}.ogg`)))));
  }

  isRoom(r: unknown): r is VoiceRoom { return VOICE_ROOMS.includes(r as VoiceRoom); }
  private seated(room: VoiceRoom, now = Date.now()): number[] {
    const m = this.seats.get(room) ?? new Map<number, number>();
    for (const [u, t] of m) if (now - t > SEAT_MS) m.delete(u);
    this.seats.set(room, m);
    return [...m.keys()];
  }

  /** A heartbeat from someone sitting in a room. Rolls for the fault. */
  beat(room: VoiceRoom, userId: number, now = Date.now()): void {
    for (const r of VOICE_ROOMS) if (r !== room) this.seats.get(r)?.delete(userId);
    this.seats.get(room)?.set(userId, now) ?? this.seats.set(room, new Map([[userId, now]]));
    const here = this.seated(room, now);
    if (here.length !== 1) { this.aloneSince.delete(room); return; }
    if (!this.aloneSince.has(room)) this.aloneSince.set(room, now);
    if (now - this.aloneSince.get(room)! >= ALONE_MS && Math.random() < FAULT_CHANCE) this.fault(room, now);
  }
  leave(room: VoiceRoom, userId: number): void { this.seats.get(room)?.delete(userId); this.aloneSince.delete(room); }

  /** The playback fault: a clip of the last session, stamped to start in a moment. */
  fault(room: VoiceRoom, now = Date.now()): { clip: string; at: number } | null {
    const clips = CLIPS[room].filter((c) => this.present.has(c));
    if (!clips.length) return null;
    const pool = clips.flatMap((c) => Array(WEIGHT[c] ?? 1).fill(c) as string[]);
    const f = { clip: pool[Math.floor(Math.random() * pool.length)], at: now + 2500 };
    this.faults.set(room, f);
    this.aloneSince.set(room, now + 60 * 60_000); // not again for a long while
    this.store.portalRepair("voice", room, now);
    return f;
  }

  /** Who is sitting in a room, and a fault still to play (if any). */
  state(room: VoiceRoom, now = Date.now()): { here: number[]; fault: { clip: string; at: number } | null } {
    const f = this.faults.get(room);
    if (f && now - f.at > 30_000) this.faults.delete(room);
    return { here: this.seated(room, now), fault: this.faults.get(room) ?? null };
  }
}
