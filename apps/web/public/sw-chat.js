// HU-19 RF-10 — lo que hace el service worker cuando se toca un aviso del chat: lleva a la aplicación y abre esa conversación.
// Es un script común (no un módulo): el service worker de la aplicación lo carga con importScripts (ver vite.config.ts).
// Los avisos los muestra la pantalla con registration.showNotification (en Chrome de Android es la única forma) y traen
// data = { tipo: 'chat', sala: 'global' | <identificador del compañero> }.
self.addEventListener('notificationclick', (event) => {
  const datos = event.notification && event.notification.data;
  if (!datos || datos.tipo !== 'chat') return;
  event.notification.close();
  const sala = typeof datos.sala === 'string' ? datos.sala : '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si la aplicación ya está abierta, se la trae al frente y se le pide que abra la conversación; si no, se abre una ventana ya en ella.
      const ventana = ventanas.find((v) => v.visibilityState === 'visible') || ventanas[0];
      if (ventana) {
        ventana.postMessage({ tipo: 'abrir-chat', sala });
        return ventana.focus();
      }
      return self.clients.openWindow('/?chat=' + encodeURIComponent(sala));
    }),
  );
});
