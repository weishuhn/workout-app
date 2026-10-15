// Cache-first service worker so the app works offline. Bump CACHE on every release.

const CACHE = 'workout-timer-v3';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/audio.js',
  'js/display.js',
  'js/exercises.js',
  'js/generator.js',
  'js/history.js',
  'js/photos.js',
  'js/settings.js',
  'js/stats.js',
  'js/storage.js',
  'js/timer.js',
  'js/workout.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'img/exercises/bicycle-crunches-0.jpg',
  'img/exercises/bicycle-crunches-1.jpg',
  'img/exercises/bulgarian-split-squats-0.jpg',
  'img/exercises/burpees-0.gif',
  'img/exercises/chair-dips-0.jpg',
  'img/exercises/chair-dips-1.jpg',
  'img/exercises/chin-ups-0.jpg',
  'img/exercises/chin-ups-1.jpg',
  'img/exercises/decline-push-ups-0.jpg',
  'img/exercises/decline-push-ups-1.jpg',
  'img/exercises/diamond-push-ups-0.jpg',
  'img/exercises/glute-bridges-0.jpg',
  'img/exercises/glute-bridges-1.jpg',
  'img/exercises/hanging-knee-raises-0.gif',
  'img/exercises/high-knees-0.jpg',
  'img/exercises/hollow-hold-0.jpg',
  'img/exercises/jump-squats-0.jpg',
  'img/exercises/jump-squats-1.jpg',
  'img/exercises/jumping-jacks-0.jpg',
  'img/exercises/mountain-climbers-0.jpg',
  'img/exercises/mountain-climbers-1.jpg',
  'img/exercises/pike-push-ups-0.jpg',
  'img/exercises/plank-0.jpg',
  'img/exercises/prone-ytw-raises-0.jpg',
  'img/exercises/prone-ytw-raises-1.jpg',
  'img/exercises/pull-ups-0.jpg',
  'img/exercises/pull-ups-1.jpg',
  'img/exercises/push-ups-0.jpg',
  'img/exercises/push-ups-1.jpg',
  'img/exercises/reverse-lunges-0.jpg',
  'img/exercises/reverse-snow-angels-0.jpg',
  'img/exercises/ring-bulgarian-split-squat-0.jpg',
  'img/exercises/ring-bulgarian-split-squat-1.jpg',
  'img/exercises/ring-dips-0.jpg',
  'img/exercises/ring-dips-1.jpg',
  'img/exercises/ring-face-pulls-0.jpg',
  'img/exercises/ring-fallouts-0.jpg',
  'img/exercises/ring-hamstring-curls-0.jpg',
  'img/exercises/ring-knee-tucks-0.jpg',
  'img/exercises/ring-knee-tucks-1.jpg',
  'img/exercises/ring-push-ups-0.jpg',
  'img/exercises/ring-push-ups-1.jpg',
  'img/exercises/ring-rows-0.jpg',
  'img/exercises/ring-rows-1.jpg',
  'img/exercises/ring-support-hold-0.jpg',
  'img/exercises/ring-y-raises-0.jpg',
  'img/exercises/scapular-pull-ups-0.jpg',
  'img/exercises/scapular-pull-ups-1.jpg',
  'img/exercises/seal-jacks-0.gif',
  'img/exercises/side-plank-0.jpg',
  'img/exercises/side-plank-1.jpg',
  'img/exercises/single-leg-glute-bridge-0.jpg',
  'img/exercises/single-leg-glute-bridge-1.jpg',
  'img/exercises/skaters-0.gif',
  'img/exercises/squat-thrusts-0.jpg',
  'img/exercises/squats-0.jpg',
  'img/exercises/squats-1.jpg',
  'img/exercises/steep-ring-rows-0.jpg',
  'img/exercises/step-ups-0.jpg',
  'img/exercises/superman-hold-0.jpg',
  'img/exercises/superman-hold-1.jpg',
  'img/exercises/table-rows-0.jpg',
  'img/exercises/table-rows-1.jpg',
  'img/exercises/wall-sit-0.jpg',
  'img/exercises/wide-push-ups-0.gif',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache: 'reload' bypasses the HTTP cache so a new release never precaches stale files.
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fetch(request)));
});
