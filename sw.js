const CACHE_NAME = 'crosstrainer-3d-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
];

// Instalación tolerante a fallos: guarda cada archivo individualmente
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precargando recursos para uso offline y datos móviles...');
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(new Request(url, { mode: 'cors' })).catch((err) => {
            console.warn(`[Service Worker] Advertencia al precargar ${url}:`, err);
            // Intentar cachear con no-cors si falla el modo cors
            return cache.add(new Request(url, { mode: 'no-cors' })).catch(() => {});
          });
        })
      );
    })
  );
});

// Activación y borrado inmediato de cachés obsoletos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia Cache-First resistente a redes móviles lentas o sin datos
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      // 1. Si ya está en caché, entregarlo DE INMEDIATO (Cero espera en datos móviles)
      if (cachedResponse) {
        // En segundo plano intentamos actualizar la versión en caché sin bloquear al usuario
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque' || networkResponse.type === 'cors')) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {/* Red lenta o sin conexión, se ignora silenciosamente */});

        return cachedResponse;
      }

      // 2. Si no está en caché, ir a la red y guardar en caché para la próxima vez
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.error('[Service Worker] Fallo de red en petición:', event.request.url, err);
          // Si falló la navegación principal a HTML, intentar servir index.html desde el caché
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html') || caches.match('./');
          }
        });
    })
  );
});
