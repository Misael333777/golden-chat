// Golden — service worker MINIMO: permite instalar la pagina como app y mostrar notificaciones (23/10).
// No guarda nada en cache ni intercepta pedidos: la app siempre usa la version publicada y los datos en vivo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Notificacion enviada por n8n (Admin General / Admin Finanzas). Datos: { titulo, texto, url, tag }.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const titulo = typeof d.titulo === 'string' && d.titulo ? d.titulo : 'Golden';
  const texto = typeof d.texto === 'string' && d.texto ? d.texto : 'Hay algo para revisar.';
  const url = typeof d.url === 'string' && /^#\/[A-Za-z0-9_\/-]{0,80}$/.test(d.url) ? d.url : '#/';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: texto, icon: 'assets/img/app-192.png', badge: 'assets/img/app-192.png',
    tag: typeof d.tag === 'string' && d.tag ? d.tag : 'golden', renotify: true, data: { url } }));
});

// Al tocar la notificacion: abre (o enfoca) la app en la seccion correspondiente.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL('./' + ((e.notification.data && e.notification.data.url) || '#/'), self.registration.scope).href;
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lista) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); try { await c.navigate(destino); } catch (err) { /* nada */ } return; } }
    await self.clients.openWindow(destino);
  })());
});
