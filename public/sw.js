const CACHE_NAME = 'vibestream-v17';

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
    const url = e.request.url;

    // 1. CRITICAL: Strictly bypass non-HTTP/HTTPS schemes (e.g. chrome-extension:, moz-extension:, about:, blob:, data:)
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return;
    }

    // 2. Only intercept standard GET requests
    if (e.request.method !== 'GET') {
        return;
    }

    // 3. Bypass streaming, audio/video media, Google/YouTube CDNs, APIs, range requests
    if (
        url.includes('/api/') ||
        url.includes('googlevideo.com') ||
        url.includes('ytimg.com') ||
        url.includes('youtube.com') ||
        url.includes('dicebear.com') ||
        e.request.headers.has('range') ||
        e.request.destination === 'audio' ||
        e.request.destination === 'video'
    ) {
        return;
    }

    // 4. Network First: Always try fresh network version, fallback to cache if offline
    e.respondWith(
        fetch(e.request)
            .then((networkRes) => {
                // Only cache successful basic (same-origin) responses to avoid unsupported scheme or opaque cache errors
                if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                    try {
                        const resClone = networkRes.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(e.request, resClone).catch(() => {});
                        }).catch(() => {});
                    } catch (_) {}
                }
                return networkRes;
            })
            .catch(async () => {
                try {
                    const cached = await caches.match(e.request);
                    if (cached) return cached;
                    // For SPA navigation routes, fallback to cached index.html
                    if (e.request.mode === 'navigate') {
                        const indexCached = await caches.match('/');
                        if (indexCached) return indexCached;
                    }
                } catch (_) {}
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});
