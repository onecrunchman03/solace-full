import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// During development the Svelte app runs on Vite's dev server (port 5173) and
// proxies API + WebSocket calls to the Solace backend on 8443, so everything
// looks same-origin to the browser. In production the backend serves the built
// files directly and no proxy is involved.
export default defineConfig({
  // Hidden maps: emitted beside the chunks for mapping a minified stack out of
  // the errors table, but never referenced by the bundle (Sep 2026 review).
  build: { sourcemap: "hidden" },
  plugins: [svelte()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8443",
      "/emoji": "http://127.0.0.1:8443",
      "/avatars": "http://127.0.0.1:8443",
      "/pageicons": "http://127.0.0.1:8443",
      "/attachments": "http://127.0.0.1:8443",
      "/banners": "http://127.0.0.1:8443",
      "/sounds": "http://127.0.0.1:8443",
      "/music": "http://127.0.0.1:8443", // the casino jukebox's records
      "/ws": { target: "ws://127.0.0.1:8443", ws: true },
      "/ws-game": { target: "ws://127.0.0.1:8443", ws: true },
      "/ws-casino": { target: "ws://127.0.0.1:8443", ws: true },
      "/ws-escape": { target: "ws://127.0.0.1:8443", ws: true },
      "/ws-satellite": { target: "ws://127.0.0.1:8443", ws: true },
      "/ws-survivorz": { target: "ws://127.0.0.1:8443", ws: true },
      "/satvoice": { target: "ws://127.0.0.1:8443", ws: true },
    },
  },
});
