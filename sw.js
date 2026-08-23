const CACHE_NAME = 'letther-b-shell-v16-study-navigation-fix';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/theme-init.js',
  './js/01-state.js',
  './js/02-activity-history.js',
  './js/03-firebase.js',
  './js/04-cloudflare-r2.js',
  './js/05-spaced-repetition.js',
  './js/06-sound.js',
  './js/07-gamification.js',
  './js/08-decks-cards.js',
  './js/09-import-export.js',
  './js/10-ai-theme.js',
  './js/11-ai-batch.js',
  './js/12-photo-import.js',
  './js/13-library.js',
  './js/14-routine-agenda.js',
  './js/15-study-session.js',
  './js/16-language-session.js',
  './js/17-epub-reader.js',
  './js/18-notes.js',
  './js/19-note-history.js',
  './js/20-outline.js',
  './js/21-active-outline.js',
  './js/22-floating-notes.js',
  './js/23-render.js',
  './js/24-modals.js',
  './js/26-web-flashcards.js',
  './js/25-utils-bootstrap.js',
  './assets/letther-b-icon-contrast-32.png',
  './assets/letther-b-icon-contrast-180.png',
  './assets/letther-b-icon-contrast-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackKey){
  try{
    const response = await fetch(request);
    if(response && response.ok){
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request,copy)).catch(()=>{});
    }
    return response;
  }catch(error){
    const cached=await caches.match(request) || await caches.match(request,{ignoreSearch:true});
    if(cached) return cached;
    if(fallbackKey){
      const fallback=await caches.match(fallbackKey);
      if(fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url=new URL(event.request.url);

  // Navegação: versão publicada primeiro; shell offline como fallback.
  if(event.request.mode === 'navigate'){
    event.respondWith(networkFirst(event.request,'./index.html'));
    return;
  }

  // Arquivos do próprio Letther B também são network-first. Antes eram
  // cache-first, então uma implantação nova podia carregar index.html novo e
  // JavaScript antigo na mesma sessão, mascarando hotfixes até outro reload.
  if(url.origin === self.location.origin){
    event.respondWith(networkFirst(event.request));
  }
});
