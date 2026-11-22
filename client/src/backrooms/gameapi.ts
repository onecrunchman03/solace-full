// The embedded game's line to the server — a thin shim over the CLIENT's
// session. The standalone app had its own login + token store ("sb_token");
// embedded, the game rides the signed-in Solace session (same origin, same
// bearer token), so there is no game login at all. Only the two endpoints
// the game screen needs live here; everything else stays in lib/api.ts.

import { getToken } from "../lib/api";

export { getToken };

/** ws(s) URL for a server path — always same-origin (dev proxies /ws-game). */
export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    // Never clears the stored token here — the main app's session logic
    // owns that decision.
    throw new ApiError(res.status, String(json?.error ?? "request_failed"), String(json?.message ?? ""));
  }
  return json as T;
}

export const api = {
  /** Proximity-voice room token — 403 unless you're inside, 503 if voice is off. */
  voiceToken: () =>
    request<{ token: string; url: string; room: string; listenOnly?: boolean }>("/api/backrooms/voice-token", {
      method: "POST",
      body: {},
    }),
  /** The dead's own room on a level (law 12) — spectators only. */
  ghostVoiceToken: () =>
    request<{ token: string; url: string; room: string }>("/api/backrooms/ghost-voice-token", {
      method: "POST",
      body: {},
    }),
};
