// SOLACE SURVIVORZ — THE PANEL'S ONE READING (Admin Panel → Survivorz). The header, the control room, the stream
// card and the diagnostics all read the same four things — the run, the stream rig, the survivors' AI, the
// workstation's GPU — and each used to poll them on its own clock (three loops on two endpoints, three copies of
// "is the rig live?"). One loop now: every 2 s while the tab is looked at, not at all while it's hidden, and the
// slower things (the GPU, the health checks) every fifth beat. `watchPanel()` is ref-counted: the loop runs while
// anything that reads it is mounted.
import { sessionHeaders } from "../assets";

export interface RunSetup { seed: number; starts: { who: string; room: string }[]; partSpot: string; noteSpot: string; zombies: number; inside: number }
export interface RunDiag {
  tickAvgMs: number; tickMaxMs: number; lateTicks: number; tickBudgetMs: number; beganAt: number | null; startedAt: number | null;
  admins: number; streams: number; maxWatchers: number; saveEveryMs: number; holdAfterMs: number;
}
export interface RunStatus {
  running: boolean; paused: boolean; onAir: boolean; watchers: number; members: number; seed: number | null; t: number | null;
  run: string | null; saved: { at: number; bytes: number; ms: number } | null; ticks: number; tickMs: number; framesOut: number; bytesOut: number;
  test: boolean; runNo: number | null; lastRunNo: number; speed: number; jumping: { to: string; from: number } | null; held: boolean;
  setup: RunSetup | null; countdown: number; map: string | null; cast: string[];
  /** WALK THE MAP: the run is the admin's own body in a private world (show/walk.ts) */
  walk?: boolean;
  noHold: boolean; dials: { showMin: number; trickle: number; startZombies: number | null } | null;
  diag?: RunDiag;
}
export interface Beat { at: number; fps: number | null; lastFrameAt: number | null; rtmp: string; recording: string; ffmpeg: boolean; session: number; restarts: number; rtmpSince: number | null; heapMB: number | null; problem: string | null; idle?: boolean }
export interface StreamView { configured: boolean; expected: boolean; want: boolean; wantAt: number | null; beat: Beat | null; age: number | null; standby: { on: boolean; text: string; at: number }; staleMs: number }
export interface Gpu { watching: boolean; age: number | null; report: { usedMb: number; totalMb: number; procs: { name: string; mb: number }[]; verdict: { level: string; alarm: boolean; detail: string } } | null }
export interface Minds {
  active: boolean; allowed: boolean; modelUp: boolean; configured: boolean;
  said: number; dropped: number; writing: number; thinking: number;
  choicesAsked: number; choicesTaken: number; choicesFailed: number; goalsAsked: number; goalsSet: number;
  thinksAi: number; thinksCode: number; share: { ai: number; code: number; pct: number | null }; decided: number;
  meetings: number; thoughts: number; thoughtsWritten: number; thoughtsDropped: number;
  goals: Record<string, string>; leader?: string;
}
export interface HealthCheck { name: string; ok: boolean; detail: string }

/** the checks on the health screen that are the show's */
const SHOW_CHECK = /survivorz|show voices|ai engine|workstation gpu/i;

class Panel {
  run = $state<RunStatus | null>(null);
  stream = $state<StreamView | null>(null);
  gpu = $state<Gpu | null>(null);
  talkOn = $state<boolean | null>(null);
  minds = $state<Minds | null>(null);
  /** the engine itself, run or no run (the minds only exist while a world does) */
  engine = $state<{ up: boolean; configured: boolean } | null>(null);
  engineUp = $derived(this.minds ? this.minds.modelUp : this.engine?.up === true);
  engineHere = $derived(this.minds ? this.minds.configured : this.engine?.configured !== false);
  health = $state<HealthCheck[] | null>(null);
  /** when the last good reading of the run came in (wall clock), and whether the last try failed */
  readAt = $state(0);
  offline = $state(false);
  /** the output rate over the last beat (frames and bytes a second to all watchers) */
  rate = $state<{ fps: number; kbps: number } | null>(null);

  // ---- the one reading of the rig ----
  stale = $derived(!this.stream?.beat || (this.stream.age ?? Infinity) > this.stream.staleMs);
  live = $derived(!this.stale && !!this.stream?.beat && !this.stream.beat.idle && (this.stream.beat.rtmp === "up" || this.stream.beat.rtmp === "backup"));
  rigLabel = $derived(
    !this.stream?.configured ? "" : this.live ? "● Streaming to YouTube" : this.stream.want ? (this.stale ? "YouTube wanted — rig offline" : "YouTube: starting…") : this.stale ? "Stream rig offline" : "Stream rig ready",
  );
  // ---- the one reading of the run ----
  runLabel = $derived(!this.run ? "…" : !this.run.running ? "No run" : this.run.walk ? "Walking the map" : this.run.test ? "Test run" : `Run #${this.run.runNo}`);
  runState = $derived(
    !this.run?.running ? "stopped" : this.run.countdown > 0 ? `starts in ${mmss(this.run.countdown)}` : this.run.held ? "held — the AI is down"
      : this.run.paused ? "paused" : this.run.jumping ? "jumping…" : "running",
  );
  aiLabel = $derived(
    this.talkOn === null ? "…" : !this.talkOn ? "Off — code decides" : !this.engineHere ? "On, but no engine on this server"
      : this.engineUp ? "On — the 26B is up" : "On — the 26B is down",
  );
  /** the show's health checks that are red */
  red = $derived((this.health ?? []).filter((c) => !c.ok));

  private users = 0;
  private timer = 0;
  private beatNo = 0;
  private inFlight = false;
  private prev: { at: number; frames: number; bytes: number; run: string | null } | null = null;

  private async get<T>(path: string): Promise<T | null> {
    const r = await fetch(path, { headers: sessionHeaders() });
    return r.ok ? ((await r.json()) as T) : null;
  }

  /** read everything now (a lever calls this so the panel doesn't wait for the next beat) */
  async refresh(slow = false): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const [a, b, c] = await Promise.all([
        this.get<RunStatus>("/api/admin/survivorz/show"),
        this.get<StreamView>("/api/admin/survivorz/stream"),
        this.get<{ on: boolean; minds: Minds | null; engine?: { up: boolean; configured: boolean } | null }>("/api/admin/survivorz/talk"),
      ]);
      if (a) this.setRun(a);
      if (b) this.stream = b;
      if (c) { this.talkOn = c.on === true; this.minds = c.minds; this.engine = c.engine ?? null; }
      this.offline = !a;
      if (slow) {
        const [g, h] = await Promise.all([
          this.get<Gpu>("/api/admin/survivorz/gpu"),
          this.get<{ checks: HealthCheck[] }>("/api/admin/health"),
        ]);
        if (g) this.gpu = g;
        if (h) this.health = h.checks.filter((k) => SHOW_CHECK.test(k.name));
      }
    } catch { this.offline = true; }
    finally { this.inFlight = false; }
  }

  /** a lever's answer is the run as it stands: take it without waiting for the beat */
  setRun(s: RunStatus): void {
    const now = Date.now();
    const p = this.prev;
    if (p && p.run === s.run && now - p.at >= 900 && s.framesOut >= p.frames) {
      const dt = (now - p.at) / 1000;
      this.rate = { fps: Math.round(((s.framesOut - p.frames) / dt) * 10) / 10, kbps: Math.round(((s.bytesOut - p.bytes) * 8) / dt / 100) / 10 };
      this.prev = { at: now, frames: s.framesOut, bytes: s.bytesOut, run: s.run };
    } else if (!p || p.run !== s.run || s.framesOut < p.frames) { this.prev = { at: now, frames: s.framesOut, bytes: s.bytesOut, run: s.run }; this.rate = null; }
    this.run = s;
    this.readAt = now;
  }

  private beat = (): void => {
    if (document.hidden) return;
    void this.refresh(this.beatNo++ % 5 === 0);
  };
  private seen = (): void => { if (!document.hidden) void this.refresh(true); };

  /** start reading; the returned function stops (when the last reader has gone) */
  watch(): () => void {
    if (this.users++ === 0) {
      this.beatNo = 0;
      this.beat();
      this.timer = window.setInterval(this.beat, 2000);
      document.addEventListener("visibilitychange", this.seen);
    }
    return () => {
      if (--this.users > 0) return;
      window.clearInterval(this.timer);
      document.removeEventListener("visibilitychange", this.seen);
    };
  }
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const ago = (ms: number | null | undefined): string =>
  ms == null ? "—" : ms < 90_000 ? `${Math.max(0, Math.round(ms / 1000))} s ago` : ms < 5_400_000 ? `${Math.round(ms / 60_000)} min ago` : `${(ms / 3_600_000).toFixed(1)} h ago`;

export const panel = new Panel();
