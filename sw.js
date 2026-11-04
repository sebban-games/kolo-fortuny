/* Service worker: gra działa offline po pierwszym uruchomieniu. Zmień VERSION przy każdym wdrożeniu.
   Na tej samej domenie (sebban-games.github.io) działają inne gry, a pamięć podręczna jest wspólna
   dla całej domeny, dlatego wszystkie cache tej gry mają prefiks „kf-” i tylko takie są usuwane. */
const PREFIX = 'kf-';
const VERSION = PREFIX + '2.2.2';
const FONTS = PREFIX + 'fonts'; // czcionki nie zmieniają się między wersjami gry
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/firebase-config.js', 'js/engine.js', 'js/puzzles.js', 'js/bot.js', 'js/audio.js',
  'js/wheel.js', 'js/online.js', 'js/game.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' omija 10-minutową pamięć przeglądarki ustawianą przez GitHub Pages,
  // więc nowa wersja zawsze zapisuje świeże pliki.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Serwery Firebase i jego SDK zawsze z sieci (tylko obce domeny; własny js/firebase-config.js
  // obsługujemy normalnie, żeby działał offline i odświeżał się po wdrożeniu).
  if (url.origin !== location.origin && /firebase|identitytoolkit|gstatic\.com\/firebasejs/.test(url.href)) return;
  // Czcionki Google: najpierw pamięć, w tle odświeżenie.
  if (url.host.includes('fonts.g')) {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Własne pliki: najpierw serwer (no-cache = zawsze sprawdź, czy plik się zmienił, zamiast brać
  // kopię z pamięci przeglądarki), a bez internetu kopia z pamięci service workera.
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return revalidate(r);
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => revalidate(r || null)).then((r) => r || caches.match('index.html'))));
});

// GitHub Pages wysyła „Cache-Control: max-age=600”. Przeglądarka trzyma wtedy skrypty w swojej
// pamięci przez 10 minut i przy odświeżeniu w ogóle nie pyta service workera. Odpowiedzi z naszej
// domeny dostają więc „no-cache”, żeby każde wczytanie strony sprawdzało, czy pliki się zmieniły.
function revalidate(r) {
  if (!r || r.type !== 'basic' || !r.ok) return r;
  const h = new Headers(r.headers);
  h.set('Cache-Control', 'no-cache');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
