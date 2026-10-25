self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));

// No cachear HTML — siempre red para tener la última versión
self.addEventListener('fetch', event => {
  if (event.request.destination === 'document' || event.request.url.endsWith('.html')) {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'LuxRides', body: event.data.text() }; }

  const silent = data.silent === true;
  const options = {
    body: data.body || data.cuerpo || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-96.png',
    tag: data.tag || 'luxrides-viaje',
    renotify: !silent && data.renotify !== false,
    requireInteraction: data.requireInteraction !== false,
    silent: silent,
    data: { url: data.url || '/ses.html' }
  };
  // La API lanza TypeError si se combina silent con vibrate.
  if (!silent) options.vibrate = [300, 100, 300, 100, 600];
  if (data.image) options.image = data.image;

  event.waitUntil(
    self.registration.showNotification(data.title || data.titulo || 'LuxRides — Nuevo viaje', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/ses.html', self.location.origin);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).pathname === target.pathname && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(target.href);
    })
  );
});
