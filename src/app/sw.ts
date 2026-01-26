// This is a type definition for the service worker scope
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// This will be populated by next-pwa with the precache manifest
import { precacheAndRoute } from 'workbox-precaching';

// Make sure to set the correct revision for your precache manifest.
// self.__WB_MANIFEST is injected by the Workbox webpack plugin.
precacheAndRoute(self.__WB_MANIFEST || []);


self.addEventListener('push', (event) => {
  const data = event.data?.json();
  if (!data) {
    console.error('Push event but no data');
    return;
  }
  
  const title = data.title || 'eArena';
  const options: NotificationOptions = {
    body: data.body,
    icon: data.icon || '/icons/android/android-launchericon-192-192.png',
    badge: '/icons/android/android-launchericon-72-72.png',
    data: {
      href: data.data?.href || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const href = event.notification.data?.href || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window for the app is already open, focus it.
      for (const client of clientList) {
        if (client.url === href && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(href);
      }
    })
  );
});
