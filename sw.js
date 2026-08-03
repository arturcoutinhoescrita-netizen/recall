const CACHE_NAME = 'letther-b-shell-v9-errors-only';
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
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  if(event.request.mode === 'navigate'){
    event.respondWith(fetch(event.request).then(response => {
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html',copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
