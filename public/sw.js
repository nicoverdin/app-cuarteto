// Service worker mínimo: la app abre sin conexión.
// - Estáticos (/_next/static, iconos, manifests): cache-first.
// - Navegación: red primero; si falla, la última página cacheada.
// Los datos de Supabase no pasan por aquí: la app guarda su propia copia local.
const CACHE = 'cuarteto-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('/')))
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static') || /\.(png|svg|json|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
        return res;
      }))
    );
  }
});
