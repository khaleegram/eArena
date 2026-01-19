// Service Worker: handles push + notification click

self.addEventListener("push", (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data.json();
    } catch {
      // fallback: accept plain text payloads too
      const text = await event.data.text();
      payload = { title: "eArena", body: text };
    }

    const title = payload.title || "eArena";
    const body = payload.body || "";
    const href = payload?.data?.href || payload?.href || "/";

    const options = {
      body,
      icon: "/icons/android/android-launchericon-192-192.png",
      badge: "/icons/android/android-launchericon-72-72.png",
      data: { href }
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const href = event?.notification?.data?.href || "/";
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

    // Try to focus an existing tab with the same origin
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          // If you want to navigate the focused tab:
          // client.navigate(href);
          return;
        }
      } catch {}
    }

    await clients.openWindow(href);
  })());
});

// next-pwa support
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});
