import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Dev: the game runs on :5175 and proxies API calls to the local Solace
// backend, so the browser sees one origin (same trick as the main client).
// The packaged Tauri build will instead call https://solace.zone directly —
// that needs a CORS story on the server (B2, shared with the compiled
// desktop-app work on the roadmap).
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5175,
    proxy: {
      "/api": "http://127.0.0.1:8443",
      "/ws": { target: "ws://127.0.0.1:8443", ws: true },
    },
  },
});
