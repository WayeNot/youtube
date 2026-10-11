// Service Worker - Network First Strategy for Realtime Updates
const CACHE_NAME = 'ytm-v4';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Never cache API or stream requests, audio/video elements, or external streaming domains
    const url = e.request.url;
    if (
        url.includes('/api/') ||
        url.includes('googlevideo.com') ||
        url.includes('ytimg.com') ||
        e.request.destination === 'audio' ||
        e.request.destination === 'video'
    ) {
        return;
    }

    // Network First: Always try fresh network version, fallback to cache if offline
    e.respondWith(
        fetch(e.request)
            .then((networkRes) => {
                if (networkRes && networkRes.status === 200) {
                    const resClone = networkRes.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
                }
                return networkRes;
            })
            .catch(() => {
                return caches.match(e.request);
            })
    );
});
