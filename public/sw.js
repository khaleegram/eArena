'use strict';

// This is a base service worker file for next-pwa.
// It will be injected with the precache manifest.

self.addEventListener('push', (event) => {
  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/images/icons/icon-192x192.png',
      badge: '/images/icons/icon-96x96.png',
      data: {
        url: data.url,
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    console.error('Error handling push event:', error);
    const options = {
        body: 'You have a new notification.',
        icon: '/images/icons/icon-192x192.png',
        badge: '/images/icons/icon-96x96.png',
    };
    event.waitUntil(
        self.registration.showNotification('New Notification', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/';
  event.waitUntil(
    clients.openWindow(urlToOpen)
  );
});

// The following is injected by next-pwa
// self.addEventListener('fetch', (event) => { ... });
