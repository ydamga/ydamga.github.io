// ÖSYM başvuru bildirimleri: GitHub Actions'tan gelen Web Push iletilerini gösterir.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var veri = {};
  try { veri = e.data ? e.data.json() : {}; } catch (_) { veri = { govde: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(veri.baslik || 'ÖSYM hatırlatma', {
    body: veri.govde || '',
    tag: veri.etiket || 'osym',
    data: { url: veri.url || 'https://ysndmg.me/' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data.url));
});
