/* Service worker: gra działa offline po pierwszym uruchomieniu. Zmień VERSION przy każdym wdrożeniu.
   Na tej samej domenie (sebban-games.github.io) działają inne gry, a pamięć podręczna jest wspólna
   dla całej domeny, dlatego wszystkie cache tej gry mają prefiks „kf-” i tylko takie są usuwane. */
const PREFIX = 'kf-';
const VERSION = PREFIX + '2.2.1';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/firebase-config.js', 'js/engine.js', 'js/puzzles.js', 'js/bot.js', 'js/audio.js',
  'js/wheel.js', 'js/online.js', 'js/game.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase i jego SDK zawsze z sieci.
  if (/firebase|googleapis\.com\/identitytoolkit|gstatic\.com\/firebasejs/.test(url.href)) return;
  // Czcionki Google: najpierw pamięć, w tle odświeżenie.
  if (url.host.includes('fonts.g')) {
    e.respondWith(caches.open(VERSION + '-fonts').then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Własne pliki: sieć z zapasem w pamięci (nowa wersja po odświeżeniu, offline też działa).
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
