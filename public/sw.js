// This is a basic service worker that enables PWA installation.
// For more advanced caching strategies, you can expand this file.

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // You can add pre-caching logic here if needed
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
});

self.addEventListener('fetch', (event) => {
  // A simple fetch-first strategy.
  // The PWA will feel faster if you implement more robust caching.
  event.respondWith(fetch(event.request));
});
