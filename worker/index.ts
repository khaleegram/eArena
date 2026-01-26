/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event) => {
  const data = event.data?.json();
  if (!data) return;

  const title = data.title || 'eArena';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icons/android/android-launchericon-192-192.png',
    badge: '/icons/android/android-launchericon-72-72.png',
    data: { href: data.href || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const href = (event.notification.data as any)?.href || '/';

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of clientsList) {
      // If already open, focus it
      if ('focus' in client) {
        return (client as WindowClient).focus();
      }
    }

    if (self.clients.openWindow) return self.clients.openWindow(href);
  })());
});
