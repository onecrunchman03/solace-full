import fs from "node:fs";
import path from "node:path";
import util from "node:util";

/**
 * Load `key=value` pairs from a `.env` file into `process.env`.
 *
 * This MUST run before `./config` is evaluated, because config reads
 * `process.env` at module-load time — so `index.ts` imports this module first.
 *
 * Real environment variables (shell / systemd `Environment=`) take precedence:
 * only keys not already present are applied, matching conventional dotenv
 * behavior. A missing `.env` is fine — the app falls back to config defaults.
 * Override the path with `ENV_FILE=/path/to/file`.
 */
function loadEnv(): void {
  const envPath = path.resolve(process.env.ENV_FILE ?? ".env");
  let content: string;
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    return; // no .env — config.ts defaults apply
  }
  const parsed = util.parseEnv(content);
  let applied = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied++;
    }
  }
  console.log(`[env] loaded ${applied} setting(s) from ${envPath}`);
}

loadEnv();
