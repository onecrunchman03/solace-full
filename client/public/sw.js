// Minimal service worker — exists so Solace is installable as an app (PWA).
// Deliberately does NO caching: the app always loads live from the server,
// which is what keeps every user on the newest deploy automatically (the
// in-app update watcher handles long-lived sessions). If you ever add
// offline caching here, you must also add cache-busting on deploy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
// Present but pass-through: not calling respondWith() means the browser
// performs the normal network request (older Chromium requires a fetch
// handler for installability).
self.addEventListener("fetch", () => {});

// Web Push: the server sends {title, body, tag} for DMs, @mentions, and
// event reminders — only to devices whose user has no open Solace anywhere.
self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(
    self.registration.showNotification(p.title || "Solace", {
      body: p.body || "",
      tag: p.tag || undefined,
      icon: "/solace-logo.png",
      badge: "/solace-logo.png",
    }),
  );
});

// Clicking the notification focuses an open Solace or opens a fresh one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => "focus" in w);
      return win ? win.focus() : self.clients.openWindow("/");
    }),
  );
});
