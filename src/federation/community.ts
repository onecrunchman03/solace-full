// FEDERATION — the satellite's community page, one place (F4).
//
// Josh, Sep 2026: "i started a satellite and i dont see it in the solace
// pages." The admin's control point is the KEY MINT — once a host redeems
// it and connects, making the admin come back for a second button before
// the community existed read as broken. So the page auto-creates on the
// satellite's FIRST successful connect, named what the host named their
// community; the Admin Panel's "Create page" button remains for renames-
// before-first-connect and for pre-F4 satellites, both through this same
// function so the two paths can't drift.
import type { Store } from "../db/store";
import type { Bus } from "../bus";
import type { Page, PageJoinPolicy } from "../types";

export function ensureSatellitePage(
  store: Store,
  bus: Bus,
  satelliteId: number,
  opts?: { name?: string; description?: string | null; joinPolicy?: PageJoinPolicy; discoverable?: boolean },
): { page: Page; created: boolean } | null {
  const sat = store.getSatellite(satelliteId);
  if (!sat || sat.status !== "active") return null;
  const existing = store.pageForSatellite(sat.id);
  if (existing) return { page: existing, created: false };

  const name = (opts?.name ?? sat.name).trim().slice(0, 60) || "Unnamed community";
  // Privacy: an explicit bind-route opt wins, then the preference the host
  // expressed at registration (F8's Linux wizard), then the OPEN default —
  // the original ask was TeamSpeak-style ("people discover communities and
  // join them"), and the host manages the page, so they can retune joining
  // in Page Settings any time. An open page is forced discoverable
  // downstream, exactly as Page Settings enforces it.
  const policy = opts?.joinPolicy
    ?? (sat.pageJoinPolicy === "open" || sat.pageJoinPolicy === "request" || sat.pageJoinPolicy === "invite"
      ? sat.pageJoinPolicy : "open");
  const page = store.createPage({
    name,
    description: opts?.description ?? null,
    joinPolicy: policy,
    discoverable: policy === "open" ? true : (opts?.discoverable ?? sat.pageDiscoverable ?? true),
    createdBy: sat.ownerUserId,
    satelliteId: sat.id,
  });
  const lobby = store.createChannel({
    name: "lobby", topic: null, createdBy: sat.ownerUserId, parentId: null, kind: "text", pageId: page.id,
  });
  const fresh = store.updatePage(page.id, { defaultChannelId: lobby.id })!;
  store.recordSatelliteEvent("page_bound", sat.id, null, `page ${page.id} "${name}"`);
  // Realtime re-derives counts/roles per recipient; the emits just carry
  // the rows. The lobby announces through the ordinary page-scoped path.
  bus.emit("page.change", {
    page: { ...fresh, role: null, members: 1, online: 0 },
    members: [sat.ownerUserId],
  });
  bus.emit("channel.create", { channel: { ...lobby, postAllow: [], viewRoles: [], postRoles: [] } });
  return { page: fresh, created: true };
}
