/*
 * Findtern service worker: web push only. No caching, no offline mode, so a
 * stale worker can never serve an old page.
 *
 * A push shows a notification and nudges any open Findtern tab to refresh its
 * drive state at once (college-live.tsx listens for "findtern-refresh").
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Findtern", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Findtern";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/intern/dashboard";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: "/apple-icon",
        data: { url },
      }),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ type: "findtern-refresh" }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/intern/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.postMessage({ type: "findtern-refresh" });
          return client.navigate ? client.navigate(url).then((c) => (c || client).focus()) : client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
