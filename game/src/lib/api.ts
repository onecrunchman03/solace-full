// The game's line to the Solace server. Same account, same token semantics
// as the main client: bearer auth, and only an explicit 401/403 clears the
// stored token (network blips keep you signed in).
//
// Dev: same-origin via the Vite proxy. Packaged (Tauri) builds will set an
// absolute base + server CORS in B2.

const TOKEN_KEY = "sb_token";

// Dev runs same-origin through the Vite proxy; the PACKAGED app (Tauri
// webview on a local origin) calls production directly — the server
// allowlists the Tauri origins for CORS (GAME_ORIGINS in src/http.ts).
// VITE_SERVER overrides for testing a packaged build against a dev server.
const PROD_SERVER = (import.meta.env.VITE_SERVER as string | undefined) ?? "https://solace.zone";
const BASE = import.meta.env.DEV ? "" : PROD_SERVER;

/** ws(s) URL for a server path — same dev/packaged split as BASE. */
export function wsUrl(path: string): string {
  if (import.meta.env.DEV) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}${path}`;
  }
  return PROD_SERVER.replace(/^http/, "ws") + path;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
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
  const res = await fetch(BASE + path, {
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
    if (res.status === 401 || res.status === 403) setToken(null);
    throw new ApiError(res.status, String(json?.error ?? "request_failed"), String(json?.message ?? ""));
  }
  return json as T;
}

export interface SelfUser {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  isAdmin: boolean;
}

export interface LoginResult {
  token?: string;
  user?: SelfUser;
  challenge?: "secret";
  mustSetSecret?: boolean;
}

export interface DoorStatus {
  inside: number;
  cap: number;
  doors: { name: string; inside: number }[];
  exploredCells: number;
  totalCells: number;
}

export const api = {
  status: () => request<DoorStatus>("/api/backrooms/status"),
  /** Proximity-voice room token — 403 unless you're inside, 503 if voice is off. */
  voiceToken: () =>
    request<{ token: string; url: string; room: string }>("/api/backrooms/voice-token", { method: "POST", body: {} }),
  /** Step 1 — password. A `challenge: "secret"` reply means the server wants
   *  the recovery secret (new network) via verify(). */
  login: (username: string, password: string) =>
    request<LoginResult>("/api/login", { method: "POST", body: { username, password } }),
  /** Step 2 — new-network verification with the recovery secret. */
  verify: (username: string, password: string, secret: string) =>
    request<LoginResult>("/api/login/verify", { method: "POST", body: { username, password, secret } }),
  me: () => request<{ user: SelfUser }>("/api/me"),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST", body: {} }),
};
