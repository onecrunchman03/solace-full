import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { json, type Router } from "../http";
import { config } from "../config";
import { mayPostChannel } from "../pageauth";
import { mayEnterChannel } from "../pagescope";
import { reachableSatVoice } from "../federation/voice";
import { voiceChannelOf } from "../realtime";

const enabled = () => !!(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);

/**
 * Voice (LiveKit SFU). Solace stays authoritative: voice channels + their
 * permissions live in OUR database, and this route only mints a LiveKit room
 * token once the caller passes the same rule that gates posting in a locked
 * text channel. LiveKit handles the actual audio (Opus, noise suppression,
 * reconnection); the shared WebSocket handles who-is-in-which-room presence.
 */
export function registerVoiceRoutes(router: Router): void {
  // Is voice configured? The client hides all voice UI when it isn't.
  router.get("/api/voice/config", "user", ({ res }) => {
    json(res, 200, { enabled: enabled(), url: enabled() ? config.livekitUrl : null });
  });

  // Mint a join token for a voice channel's room.
  //
  // { viewer: true } mints a SUBSCRIBE-ONLY side connection with a distinct
  // identity ("<id>.v.<nonce>") — the desktop shell's stream pop-out window
  // runs its own LiveKit connection (a separate webview can't share the main
  // window's media objects). The dotted identity can never collide with (and
  // so never kick) the user's main "<id>" connection, and clients filter
  // non-numeric identities out of the peer list, so viewers are invisible.
  router.post("/api/voice/:channelId/token", "user", async ({ res, params, body, user, store }) => {
    const channel = store.getChannel(Number(params.channelId));
    if (!channel || channel.kind !== "voice") return json(res, 404, { error: "no_channel" });

    // Same rule as posting in a locked channel: open = anyone active, locked =
    // owner/admin + the allow-list.
    // The page gate comes FIRST: a voice room inside a private page is as
    // private as the page; then the roles layer (post permission, the
    // lock's roles or the allow-list).
    if (!mayEnterChannel(store, user, channel)) return json(res, 404, { error: "no_channel" });
    if (!mayPostChannel(store, user, channel)) return json(res, 403, { error: "locked" });

    // FEDERATION (F5b): a satellite page's rooms run on the HOST's own
    // LiveKit when it's up and its ports are reachable — the hub still did
    // every permission check above and signs with the key the satellite
    // handed over the link; only the MEDIA moves to the host's box. Not
    // reachable (router unconfigured, host mid-restart, pre-0.4 daemon) →
    // quiet fallback to the hub's SFU below.
    let signKey = config.livekitApiKey;
    let signSecret = config.livekitApiSecret;
    let url: string = config.livekitUrl;
    const satId = store.getPage(channel.pageId)?.satelliteId;
    if (satId) {
      const sv = await reachableSatVoice(satId);
      if (sv) {
        signKey = sv.key;
        signSecret = sv.secret;
        // Relative on purpose — the client prefixes its own origin, so the
        // relay works identically behind Caddy, the Vite proxy, and dev.
        url = `/satvoice/${satId}`;
      }
    }
    if (!url || !signKey || !signSecret) return json(res, 503, { error: "voice_disabled" });

    const viewer = body?.viewer === true;
    // A VIEWER seat is for someone already IN the room popping a stream out
    // (Oct 2026 review): it subscribes to everything, and its identity is
    // filtered out of every client's member list, so minted for anyone it
    // was an invisible way to listen in on a room you weren't in.
    if (viewer && voiceChannelOf(user.id) !== channel.id) return json(res, 403, { error: "not_in_room" });
    const at = new AccessToken(signKey, signSecret, {
      identity: viewer ? `${user.id}.v.${randomUUID().slice(0, 8)}` : String(user.id),
      name: user.displayName,
      metadata: JSON.stringify({ avatar: user.avatar }),
      // One hour (Oct 2026; was 6h): a banned member's stored token can't
      // rejoin for long. A call that runs longer is fine — the SFU hands a
      // connected participant fresh tokens itself, and a rejoin asks us anew.
      ttl: "1h",
    });
    at.addGrant({
      room: `voice_${channel.id}`,
      roomJoin: true,
      canPublish: !viewer,
      canSubscribe: true,
      canPublishData: false,
    });
    json(res, 200, { token: await at.toJwt(), url, room: `voice_${channel.id}` });
  });
}
