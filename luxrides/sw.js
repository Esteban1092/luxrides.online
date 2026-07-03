self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));

self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'LuxRides', body: event.data.text() }; }

  const options = {
    body: data.body || data.cuerpo || '',
    icon: '/logo-luxrides.png',
    badge: '/logo-luxrides.png',
    tag: data.tag || 'luxrides-viaje',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 600],
    data: { url: data.url || '/ses.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || data.titulo || 'LuxRides — Nuevo viaje', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/ses.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('ses.html') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
