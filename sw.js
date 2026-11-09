/**
 * AGUA MAGALY — SERVICE WORKER (app del repartidor)
 * Guarda una copia de las páginas, estilos y scripts para que la app abra
 * aunque la señal sea mala. Siempre intenta primero la red (datos frescos)
 * y solo usa la copia si no hay conexión.
 * Nunca guarda llamadas a Supabase: los datos de pedidos no pasan por aquí.
 */
const VERSION = '2026110902';
const CACHE = 'magaly-app-' + VERSION;
const V = '?v=' + VERSION;

const SHELL = [
  'repartidor.html',
  'login.html',
  'manifest-repartidor.webmanifest',
  'css/styles.css' + V,
  'css/panel.css' + V,
  'js/config.js' + V,
  'js/store.js' + V,
  'js/ui.js' + V,
  'js/auth.js' + V,
  'js/repartidor.js' + V,
  'js/vendor/supabase.min.js',
  'assets/logo-magaly.png',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('magaly-app-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fuentes, WhatsApp: directo a la red

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await cache.match('repartidor.html');
        if (shell) return shell;
      }
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
