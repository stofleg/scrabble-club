'use strict';

const CACHE_NAME = "blackscrab-v1.42";
const BASE  = new URL('.', self.location).href;
const ROOT  = new URL('..', self.location).href;

// Fichiers légers : pré-cachés à l'install (addAll est atomique)
const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'app.js',
  BASE + 'dict.js',
  BASE + 'version.js',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  ROOT + 'shared/dict-core.js',
];

// Fichiers lourds : mis en cache en arrière-plan puis à la volée
const DATA = [
  BASE + 'data.js',
  ROOT + 'data.js',
];

self.addEventListener('install', e => {
  // Seul SHELL bloque l'install — atomique et léger
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
  // DATA : fire-and-forget, n'empêche pas l'install de réussir
  caches.open(CACHE_NAME).then(c =>
    Promise.allSettled(DATA.map(url => c.add(url)))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('blackscrab-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first avec mise en cache à la volée pour les fichiers non pré-cachés
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => {
      if (r) return r;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
