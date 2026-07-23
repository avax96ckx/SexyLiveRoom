// SEXY LIVE ROOM - Service Worker v7
// Rewritten from scratch for maximum notification reliability

const CACHE_NAME = 'slr-v7';
const STATIC_ASSETS = ['/', '/index.html', '/icon-192.png', '/manifest.json'];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW v7] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => {
        console.log('[SW v7] Installed, skipping waiting');
        return self.skipWaiting();
      })
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW v7] Activating, claiming clients...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW v7] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => console.log('[SW v7] Active and claiming all clients'))
  );
});

// ─── Fetch (cache strategy) ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and backend requests
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase') || url.hostname.includes('backend.onspace')) return;
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for static assets
  const isStatic = (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.destination === 'image' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  );

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return resp;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Network-first for navigation (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(c => c || new Response('Offline', { status: 503 }))
      )
    );
  }
});

// ─── Helper: show notification via SW registration ───────────────────────────
function swShowNotif(title, body, url, tag) {
  const notifTag = tag || ('slr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  return self.registration.showNotification(title || 'SEXY LIVE ROOM', {
    body: body || 'Arifa mpya!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: url || '/notifications' },
    tag: notifTag,
    renotify: true,
    silent: false,
    requireInteraction: false,
  });
}

// ─── Server Push ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW v7] Push received');
  let data = { title: 'SEXY LIVE ROOM', body: 'Arifa mpya!', url: '/notifications' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch { data.body = event.data.text() || data.body; }
  }
  event.waitUntil(swShowNotif(data.title, data.body, data.url, null));
});

// ─── Messages from App ────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  console.log('[SW v7] Message received:', msg.type);

  if (msg.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      swShowNotif(msg.title, msg.body, msg.url, msg.tag)
        .then(() => console.log('[SW v7] Notification shown:', msg.title))
        .catch(err => console.error('[SW v7] Show notification failed:', err))
    );
  }

  if (msg.type === 'SKIP_WAITING') {
    console.log('[SW v7] Skip waiting');
    self.skipWaiting();
  }

  if (msg.type === 'PING') {
    // Reply to confirm SW is active
    if (event.source) {
      event.source.postMessage({ type: 'PONG', active: true });
    }
  }
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW v7] Notification clicked:', event.notification.tag);
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Find existing open window
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return;
          }
        }
        // No window open - open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(self.location.origin + targetUrl);
        }
      })
  );
});

// ─── Notification close ───────────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('[SW v7] Notification closed:', event.notification.tag);
});
