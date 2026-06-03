// Service worker minimal — strategy "network first, fallback cache".
// Le but est juste de rendre l'app installable (PWA) et un poil plus résiliente offline.
const CACHE = "garenna-v8";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./logo.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./scrabble/game.html",
  "./scrabble/game.css",
  "./scrabble/game.js",
  "./scrabble/engine.js",
  "./scrabble/dictionary.js",
  "./scrabble/topfinder.js",
  "./scrabble/generator.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // On ne touche pas les requêtes Supabase (data live)
  if (req.url.includes("supabase.co") || req.url.includes("supabase.com")) return;
  // GET only
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});
