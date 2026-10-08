// Service worker mínimo: la app abre sin conexión.
// - /_next/static (con hash en el nombre): cache-first.
// - Iconos, manifests y fuentes (sin hash): stale-while-revalidate, para que los nuevos lleguen.
// - Navegación: red primero (máx. 4 s si hay copia); si falla o tarda, la última página cacheada de esa misma ruta.
// Los datos de Supabase no pasan por aquí: la app guarda su propia copia local (localStorage) y,
// al abrir sin red, prefiere esa copia si es más reciente que el HTML cacheado.
// Sube la versión al cambiar la estrategia: al activarse se borran las cachés antiguas.
const CACHE = 'cuarteto-v4';

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

// Tope de entradas /_next/static (cada despliegue crea ficheros nuevos). Es LRU real: cada acierto se
// re-guarda (pasa al final del orden de claves) y se expulsan las menos usadas, así los chunks compartidos
// entre despliegues (framework/main) sobreviven.
const MAX_STATIC = 120;
const isStatic = r => new URL(r.url).pathname.startsWith('/_next/static');
const trimStatic = c =>
  c.keys().then(reqs => {
    const old = reqs.filter(isStatic);
    return Promise.all(old.slice(0, Math.max(0, old.length - MAX_STATIC)).map(r => c.delete(r)));
  });
const touch = (request, hit) => {
  caches.open(CACHE).then(c => c.put(request, hit.clone())).catch(() => {});
  return hit;
};

const store = (key, res) => {
  if (!res.ok) return; // nunca se cachean errores ni redirecciones
  const copy = res.clone();
  caches.open(CACHE)
    .then(c => c.put(key, copy).then(() => (typeof key !== 'string' ? trimStatic(c) : null)))
    .catch(() => {});
};

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const key = pageKey(url);
    const coach = url.searchParams.get('entrenador') === 'nico';
    const fallback = () =>
      caches.match(key).then(hit => hit || caches.match(url.origin + '/' + (coach ? '?entrenador=nico' : '')));
    const network = fetch(request).then(res => {
      store(key, res);
      return res;
    });
    // Red lenta: tras 4 s se sirve la copia (si la hay); si no, se sigue esperando a la red.
    const slow = new Promise(resolve =>
      setTimeout(() => fallback().then(hit => hit && resolve(hit)).catch(() => {}), 4000)
    );
    event.respondWith(
      Promise.race([network, slow])
        .catch(() => fallback())
        .then(res => res || Response.error())
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then(hit => (hit ? touch(request, hit) : fetch(request).then(res => {
        store(request, res);
        return res;
      })))
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
