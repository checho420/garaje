/* =========================================================================
   Service Worker — Garaje
   -------------------------------------------------------------------------
   Estrategia: "cache primero, con actualización en segundo plano" (stale-
   while-revalidate) para el shell de la app. Como toda la lógica y los
   datos viven en el propio HTML + localStorage, cachear estos pocos
   archivos basta para que la app funcione 100% sin conexión, incluyendo
   crear/editar vehículos, registrar gastos y ver gráficos.

   Los datos del usuario NUNCA pasan por aquí: siguen en localStorage,
   dentro del propio navegador, y no se tocan al actualizar el caché.
   ========================================================================= */

const CACHE_NAME = 'garaje-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/app-icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

// Instalación: precachea el shell de la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activación: limpia cachés de versiones anteriores.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first para el shell propio; red con fallback a caché para lo demás
// (p. ej. la fuente de Google Fonts, que si no hay internet simplemente no carga
// y el navegador usa su fuente de sistema — la app sigue funcionando igual).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isOwnOrigin = url.origin === self.location.origin;

  if (isOwnOrigin) {
    // Las navegaciones consultan primero la red para recibir despliegues nuevos.
    // Si no hay conexión, se conserva la última versión funcional en caché.
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
      );
      return;
    }

    // Para recursos estáticos, responde de caché y actualiza detrás.
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached); // sin red: usa lo cacheado
        return cached || network;
      })
    );
  } else {
    // Recursos externos (fuentes): red primero, caché como respaldo si existe.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
