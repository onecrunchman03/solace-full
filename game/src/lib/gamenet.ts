// The game socket client — /ws-game. Compact protocol, server-authoritative:
// we SEND claimed positions, the server corrects us if we lie (or lag through
// a wall); we RECEIVE the world in chunks and other players only when nearby.

import { getToken, wsUrl } from "./api";

export interface DoorInfo {
  x: number;
  y: number;
  edge: "N" | "S" | "E" | "W";
  name: string;
}

export interface ChunkData {
  cx: number;
  cy: number;
  size: number;
  wallN: number[];
  wallW: number[];
  solid: number[];
  district: number[];
  landmark: number[];
}

export interface Welcome {
  size: number;
  chunk: number;
  doors: DoorInfo[];
  districts: { id: number; type: string }[];
  you: { x: number; y: number; door: number };
}

export interface GameNetHandlers {
  onWelcome: (w: Welcome) => void;
  onDenied: (error: string) => void;
  onChunk: (c: ChunkData) => void;
  onPos: (id: number, name: string, x: number, y: number, h: number) => void;
  onBye: (id: number) => void;
  onCorrect: (x: number, y: number) => void;
  onClosed: () => void;
}

export interface GameNet {
  enter(door: number): void;
  move(x: number, y: number, h: number): void;
  requestChunks(want: { cx: number; cy: number }[]): void;
  leave(): void;
  close(): void;
}

export function connectGame(handlers: GameNetHandlers): GameNet {
  const token = getToken() ?? "";
  const ws = new WebSocket(`${wsUrl("/ws-game")}?token=${encodeURIComponent(token)}`);
  let closedByUs = false;

  ws.onmessage = (ev) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    switch (m.type) {
      case "welcome":
        handlers.onWelcome(m as unknown as Welcome);
        break;
      case "denied":
        handlers.onDenied(String(m.error ?? "denied"));
        break;
      case "chunk":
        handlers.onChunk(m as unknown as ChunkData);
        break;
      case "pos":
        handlers.onPos(Number(m.id), String(m.name ?? ""), Number(m.x), Number(m.y), Number(m.h ?? 0));
        break;
      case "bye":
        handlers.onBye(Number(m.id));
        break;
      case "correct":
        handlers.onCorrect(Number(m.x), Number(m.y));
        break;
    }
  };
  ws.onclose = () => {
    if (!closedByUs) handlers.onClosed();
  };
  ws.onerror = () => {
    /* onclose follows */
  };

  const send = (msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  return {
    enter: (door) => {
      if (ws.readyState === WebSocket.OPEN) send({ type: "enter", door });
      else ws.addEventListener("open", () => send({ type: "enter", door }), { once: true });
    },
    move: (x, y, h) => send({ type: "move", x, y, h }),
    requestChunks: (want) => {
      if (want.length) send({ type: "chunks", want });
    },
    leave: () => send({ type: "leave" }),
    close: () => {
      closedByUs = true;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}
