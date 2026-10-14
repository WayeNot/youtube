// Service Worker - Network First Strategy for Realtime Updates
const CACHE_NAME = 'vibestream-v16';

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
    // Only handle valid HTTP/HTTPS GET requests (ignore chrome-extension://, ws://, etc.)
    if (!e.request || !e.request.url || (!e.request.url.startsWith('http://') && !e.request.url.startsWith('https://'))) {
        return;
    }
    if (e.request.method !== 'GET') {
        return;
    }

    // Never cache API or stream requests, audio/video elements, or external streaming domains
    const url = e.request.url;
    if (
        url.includes('/api/') ||
        url.includes('googlevideo.com') ||
        url.includes('ytimg.com') ||
        url.includes('/robots.txt') ||
        url.includes('/sitemap.xml') ||
        e.request.destination === 'audio' ||
        e.request.destination === 'video'
    ) {
        return;
    }

    // Network First: Always try fresh network version, fallback to cache if offline
    e.respondWith(
        fetch(e.request)
            .then((networkRes) => {
                if (networkRes && networkRes.status === 200 && e.request.method === 'GET' && e.request.url.startsWith('http')) {
                    const resClone = networkRes.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        try {
                            cache.put(e.request, resClone);
                        } catch (_) {}
                    });
                }
                return networkRes;
            })
            .catch(async () => {
                const cached = await caches.match(e.request);
                if (cached) return cached;
                // For SPA navigation routes (e.g. /library/liked, /playlist/...) fallback to cached index.html
                if (e.request.mode === 'navigate') {
                    const indexCached = await caches.match('/');
                    if (indexCached) return indexCached;
                }
                return new Response('Offline', { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/plain' } });
            })
    );
});
