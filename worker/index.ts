
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload: any = null;

    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        // If JSON parsing fails, treat it as plain text.
        payload = { title: 'eArena', body: await event.data.text() };
      }
    }

    if (!payload) return;

    const title = payload.title || 'eArena';
    const options: NotificationOptions = {
      body: payload.body || '',
      icon: payload.icon || '/icons/android/android-launchericon-192-192.png',
      badge: '/icons/android/android-launchericon-72-72.png',
      data: { href: payload.href || payload.data?.href || '/' },
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const href = (event.notification.data as any)?.href || '/';

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of clientsList) {
      // If already open, focus it
      if ('focus' in client) {
        // Optional: if you want strict match, compare origins + path properly
        return (client as WindowClient).focus();
      }
    }

    if (self.clients.openWindow) return self.clients.openWindow(href);
  })());
});
