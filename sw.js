// Golden — service worker MINIMO, solo para que la pagina se pueda instalar como app en el celular.
// No guarda nada en cache ni intercepta pedidos: la app siempre usa la version publicada y los datos en vivo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
