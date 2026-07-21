/* Bump esse número sempre que publicar uma mudança e quiser forçar os
   usuários a pegar a versão nova em vez do cache antigo. */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `recall-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // só GET e mesma origem — chamadas à API da Anthropic (POST, outra origem)
  // passam direto pela rede, sem nunca serem cacheadas ou interceptadas.
  if(req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if(req.mode === 'navigate'){
    // documento HTML: tenta a rede primeiro pra sempre pegar a versão mais nova;
    // se estiver offline, cai pro cache salvo.
    event.respondWith(
      fetch(req)
        .then(res => { caches.open(CACHE_NAME).then(c => c.put(req, res.clone())); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ícones, manifest etc.: cache primeiro (mudam raramente), rede como fallback.
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
