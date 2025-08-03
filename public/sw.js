
self.addEventListener('push', (event) => {
    const data = event.data?.json();
    if (!data) return;

    const { title, body, url } = data;
    
    const options = {
        body: body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: {
            url: url
        }
    };
    
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
