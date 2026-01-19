// This file is the browser's "background worker" for handling push notifications.

// Listen for a push event from the server
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.error('Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/images/logo-192.png', // The icon that appears in the notification
      badge: '/images/logo-192.png', // A smaller icon for the notification bar
      data: {
        href: data.data.href, // The URL to open when the notification is clicked
      },
    };
    // Tell the browser to show the notification
    event.waitUntil(self.registration.showNotification(data.title, options));
  } catch (e) {
    console.error('Push event data is not valid JSON:', event.data.text());
  }
});

// Listen for a click on the notification
self.addEventListener('notificationclick', (event) => {
  // Close the notification
  event.notification.close();
  
  const href = event.notification.data.href;
  // If there's a URL, open it in a new window/tab
  if (href) {
    event.waitUntil(clients.openWindow(href));
  }
});

// This part is for the next-pwa library to work correctly
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
