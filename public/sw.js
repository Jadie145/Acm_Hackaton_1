const cacheName = 'jrv-field-v6';
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  await cache.addAll(['/', '/style.css', '/app.js', '/field.js', '/leaf-model.mjs', '/model.json', '/leaf-network.mjs']);
  await cache.add('/leaf-network.json').catch(() => {});
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/leaf-network.json') {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return await cache.match(event.request) || Response.error();
      }
    })());
  } else {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
