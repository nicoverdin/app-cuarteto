// Service worker mínimo: la app abre sin conexión.
// - /_next/static (con hash en el nombre): cache-first.
// - Iconos, manifests y fuentes (sin hash): stale-while-revalidate, para que los nuevos lleguen.
// - Navegación: red primero; si falla, la última página cacheada de esa misma ruta.
// Los datos de Supabase no pasan por aquí: la app guarda su propia copia local (localStorage) y,
// al abrir sin red, prefiere esa copia si es más reciente que el HTML cacheado.
// Sube la versión al cambiar la estrategia: al activarse se borran las cachés antiguas.
const CACHE = 'cuarteto-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Clave de caché de una página: ruta + solo el parámetro que cambia el modo (?entrenador=nico).
// Así el entrenador nunca recibe la copia de la alumna ni al revés, y otros parámetros (utm, etc.) no crean entradas.
const pageKey = url => {
  const coach = url.searchParams.get('entrenador') === 'nico';
  return url.origin + url.pathname + (coach ? '?entrenador=nico' : '');
};

const store = (key, res) => {
  if (!res.ok) return; // nunca se cachean errores ni redirecciones
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
};

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const key = pageKey(url);
    const coach = url.searchParams.get('entrenador') === 'nico';
    event.respondWith(
      fetch(request)
        .then(res => {
          store(key, res);
          return res;
        })
        .catch(() =>
          caches.match(key).then(hit => hit || caches.match(url.origin + '/' + (coach ? '?entrenador=nico' : '')))
        )
        .then(res => res || Response.error())
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        store(request, res);
        return res;
      }))
    );
    return;
  }

  if (/\.(png|svg|json|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(hit => {
        const network = fetch(request).then(res => {
          store(request, res);
          return res;
        });
        if (!hit) return network;
        network.catch(() => {}); // revalida en segundo plano; sin red se queda con la copia
        return hit;
      })
    );
  }
});
