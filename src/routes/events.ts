import { json, type Router } from "../http";
import { guardedTick } from "../health";
import type { Store } from "../db/store";
import type { Bus } from "../bus";

const MAX_TITLE = 80;
const MAX_NOTE = 300;
const REMIND_WINDOW_MS = 15 * 60 * 1000; // heads-up 15 minutes before

/**
 * Game nights: anyone can post an event ("Pit night, Saturday 8pm"), everyone
 * RSVPs, and the house reminds the room 15 minutes before it starts. Public
 * like auctions — every change broadcasts the fresh list.
 */
export function registerEventRoutes(router: Router): void {
  router.get("/api/events", "user", ({ res, store }) => {
    json(res, 200, { events: store.listEvents() });
  });

  router.post("/api/events", "user", ({ res, body, user, store, bus }) => {
    const title = String(body?.title ?? "").trim();
    const note = String(body?.note ?? "").trim() || null;
    const at = Number(body?.at);
    if (!title || title.length > MAX_TITLE) return json(res, 400, { error: "bad_title" });
    if (note && note.length > MAX_NOTE) return json(res, 400, { error: "bad_note" });
    if (!Number.isFinite(at) || at < Date.now() - 60_000 || at > Date.now() + 365 * 86_400_000) {
      return json(res, 400, { error: "bad_time" });
    }
    const id = store.createEvent(user.id, title, note, at);
    store.setRsvp(id, user.id, true); // hosting implies attending
    bus.emit("event.change", { events: store.listEvents() });
    json(res, 200, { ok: true, id });
  });

  router.post("/api/events/:id/rsvp", "user", ({ res, params, body, user, store, bus }) => {
    const ev = store.getEvent(Number(params.id));
    if (!ev) return json(res, 404, { error: "no_event" });
    store.setRsvp(ev.id as number, user.id, body?.going === true);
    bus.emit("event.change", { events: store.listEvents() });
    json(res, 200, { ok: true });
  });

  // Creator or admin can cancel.
  router.del("/api/events/:id", "user", ({ res, params, user, store, bus }) => {
    const ev = store.getEvent(Number(params.id));
    if (!ev) return json(res, 404, { error: "no_event" });
    if (ev.createdBy !== user.id && !user.isAdmin) return json(res, 403, { error: "forbidden" });
    store.deleteEvent(ev.id as number);
    bus.emit("event.change", { events: store.listEvents() });
    json(res, 200, { ok: true });
  });
}

/** The reminder sweep: T-minus-15-minutes heads-up, broadcast exactly once
 *  per event (the DB stamp is the dedupe). */
export function startEventReminders(store: Store, bus: Bus): () => void {
  const tick = () => {
    for (const ev of store.dueEventReminders(REMIND_WINDOW_MS)) {
      bus.emit("event.remind", { id: ev.id, title: ev.title, at: ev.at });
    }
  };
  tick();
  const timer = setInterval(() => {
    guardedTick(store, "event reminders", 60_000, tick);
  }, 60_000);
  return () => clearInterval(timer);
}
