// Golden — instalar la pagina como app en el celular (17/10). Pensado para los paneles de administracion.
// Android / computadora (Chrome, Edge): boton "Instalar app" con el aviso del navegador.
// iPhone (Safari): no hay boton automatico; se explica Compartir -> "Agregar a inicio".
// Ya instalada (abierta como app): no se muestra nada.
import { el } from './ui.js';

let aviso = null; // evento beforeinstallprompt guardado para usarlo cuando la persona toca el boton
const avisar = new Set();

export function iniciarInstalacion() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); aviso = e; avisar.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { aviso = null; avisar.forEach(f => f()); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sin app instalable: la pagina funciona igual */ });
}

const esApp = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Tarjeta para el inicio de Admin General y Admin Finanzas. null si ya se esta usando como app.
export function tarjetaInstalar() {
  if (esApp()) return null;
  const cuerpo = el('div', { class: 'stack' });
  const caja = el('div', { class: 'card stack', id: 'instalar-app', 'data-instalar': 'si' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Usar Golden como app en el celular' })), cuerpo);
  const pintar = () => {
    while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild);
    if (esApp()) { caja.remove(); return; }
    if (aviso) {
      const b = el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-instalar-app' }, 'Instalar app');
      b.addEventListener('click', async () => { const ev = aviso; if (!ev) return; ev.prompt(); try { await ev.userChoice; } catch (err) { /* nada */ } aviso = null; pintar(); });
      cuerpo.appendChild(el('p', { class: 'muted small', text: 'Queda un ícono de Golden en la pantalla del celular y se abre como una app, sin barra del navegador.' }));
      cuerpo.appendChild(b);
    } else if (esIOS()) {
      cuerpo.appendChild(el('p', { class: 'small', text: 'En iPhone: abrí esta página en Safari, tocá el botón Compartir (el cuadrado con la flecha hacia arriba) y elegí “Agregar a inicio”.' }));
    } else {
      cuerpo.appendChild(el('p', { class: 'small', text: 'En Android: abrí esta página en Chrome, tocá el menú (los tres puntitos) y elegí “Instalar app” o “Agregar a la pantalla principal”.' }));
    }
  };
  avisar.add(() => { if (caja.isConnected) pintar(); });
  pintar();
  return caja;
}
