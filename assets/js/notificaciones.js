// Golden — notificaciones en el celular para Admin General y Admin Finanzas (23/10).
// Web Push estandar: el navegador da una "suscripcion" (direccion + claves) que se guarda en n8n; n8n avisa a esa direccion cuando hay algo para revisar.
// Solo consulta a n8n al tocar Activar / Desactivar (1 ejecucion cada vez). Ver el estado no consulta nada.
import { el, toast } from './ui.js';

const CLAVE_PUBLICA = 'BJEaMVLlhM5bDlxK9FfTjhS2Tp06_8WJzQuOGQeAhC20u_LzFyzYxyggrxiqCy1DybK146kHkbAynKBkYq9V85k'; // clave publica VAPID (la privada vive solo en n8n)
const esApp = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const aBytes = (b64) => { const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); const r = atob(s); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const dispositivo = () => { const u = navigator.userAgent; return (esIOS() ? 'iPhone' : /android/i.test(u) ? 'Android' : 'Computadora') + (esApp() ? ' (app)' : ' (navegador)'); };
const registro = async () => { await navigator.serviceWorker.register('sw.js'); return navigator.serviceWorker.ready; };

// tipo = 'admin_general' | 'admin_finanzas' (el panel desde el que se activa; n8n suscribe a todos los paneles que la persona tenga).
export function tarjetaNotificaciones(ctx, tipo) {
  const cuerpo = el('div', { class: 'stack' });
  const caja = el('div', { class: 'card stack', id: 'notificaciones-' + tipo, 'data-notificaciones': 'si' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Notificaciones en este celular' })), cuerpo);
  const msg = (t, clase) => el('p', { class: clase || 'small', text: t });
  const boton = (id, txt, clase, fn) => { const b = el('button', { type: 'button', class: 'btn ' + clase, id }, txt); b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }); return b; };
  const pedir = async (accion, campos) => {
    const res = await ctx.pedir(tipo, accion, campos);
    if (res.falla) { toast('No pudimos conectar. Probá de nuevo.'); return null; }
    if (ctx.revisarFinSesion(res.r)) return null;
    return res.r;
  };
  async function activar() {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { toast('Sin permiso no se pueden mostrar notificaciones.'); return pintar(); }
    const reg = await registro();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE_PUBLICA) });
    const j = sub.toJSON();
    const r = await pedir('notificaciones_activar', { suscripcion: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }, dispositivo: dispositivo() });
    if (!r) return pintar();
    if (!r.success) { try { await sub.unsubscribe(); } catch (err) { /* nada */ } toast(r.mensaje || 'No se pudieron activar.'); return pintar(); }
    toast(r.datos && r.datos.enviados > 0 ? 'Listo: te mandamos una notificación de prueba.' : 'Activadas, pero la prueba no llegó. Probá desactivar y volver a activar.');
    pintar();
  }
  async function desactivar() {
    const reg = await registro();
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await pedir('notificaciones_desactivar', { suscripcion: { endpoint: sub.endpoint } }); try { await sub.unsubscribe(); } catch (err) { /* nada */ } }
    toast('Notificaciones desactivadas en este celular.');
    pintar();
  }
  async function pintar() {
    while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild);
    if (!soportado()) {
      cuerpo.appendChild(msg(esIOS() && !esApp() ? 'En iPhone primero instalá Golden como app (Compartir → “Agregar a inicio”) y abrila desde el ícono. Ahí vas a poder activar las notificaciones.' : 'Este navegador no permite notificaciones. Probá desde Chrome en Android o desde la app instalada.', 'muted small'));
      return;
    }
    if (Notification.permission === 'denied') {
      cuerpo.appendChild(msg('Las notificaciones de Golden están bloqueadas en este celular. Habilitalas en los ajustes del navegador o de la app y volvé a entrar.', 'muted small'));
      return;
    }
    let sub = null;
    try { const reg = await registro(); sub = await reg.pushManager.getSubscription(); } catch (err) { sub = null; }
    if (sub && Notification.permission === 'granted') {
      cuerpo.appendChild(el('p', { class: 'small' }, el('span', { class: 'chip ok', text: 'Activadas' }), ' Te avisamos acá cuando haya algo para revisar.'));
      cuerpo.appendChild(el('div', { class: 'row' }, boton('btn-notif-desactivar', 'Desactivar', 'btn-ghost btn-sm', desactivar)));
    } else {
      cuerpo.appendChild(msg('Te llega un aviso al celular cuando hay algo para revisar (extras, clientes nuevos, consultas, la planilla y Finanzas), aunque la app esté cerrada.', 'muted small'));
      cuerpo.appendChild(boton('btn-notif-activar', 'Activar notificaciones', 'btn-gold', activar));
    }
  }
  pintar();
  return caja;
}
