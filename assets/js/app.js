// Golden — arranque, rutas (hash) y cabecera. Las guardas de ruta NO son seguridad: la barrera real es la Web API.
import { llamar, CODIGOS_FIN_SESION } from './api.js';
import * as sesion from './session.js';
import * as ops from './ops.js';
import { el, montar, toast, textoPanel } from './ui.js';
import { vistaLogin } from './panels/login.js';
import { vistaSelector } from './panels/selector.js';
import { vistaAdmin } from './panels/admin/shell.js';
import { vistaFinanzas } from './panels/finanzas/shell.js';
import { vistaCliente, vistaRepartidor } from './panels/cliente/shell.js';

const app = document.getElementById('app');

// Contexto compartido por las vistas.
export const ctx = {
  app,
  // Envía una solicitud autenticada del panel activo. Si la Web API dice que la sesión ya no vale, cierra la sesión local.
  // Los reportes (solo lectura) pueden tardar ~30 s en PROD: se les da más margen que al resto.
  async pedir(tipo, accion, campos) {
    const opciones = /^reportes_|_imagen$/.test(accion) ? { timeoutMs: 60000 } : {}; // imágenes: subir/ver pueden tardar más
    const r = await llamar(Object.assign({ tipo, accion, token: sesion.token(), panel_activo: sesion.datos().panel }, campos || {}), opciones);
    if (r.r && !r.r.success && CODIGOS_FIN_SESION.includes(r.r.codigo)) finSesion(r.r);
    return r;
  },
  sesion() { return sesion.datos(); }, // solo lectura para las vistas (nombre); la identidad la decide la Web API
  base(tipo) { return { tipo, token: sesion.token(), panel_activo: sesion.datos().panel }; },
  revisarFinSesion(r) { if (r && !r.success && CODIGOS_FIN_SESION.includes(r.codigo)) { finSesion(r); return true; } return false; },
  ir(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  async entrar(token, datos) { sesion.iniciar(token, datos); await ops.cargar(sesion.datos().persona_id); despuesDeEntrar(); },
  flash: null, // resultado a mostrar una vez tras reintentar una operación pendiente
};

let avisoLogin = null; // mensaje a mostrar en la pantalla de ingreso tras un cierre forzado
function finSesion(r) {
  sesion.cerrarLocal();
  avisoLogin = r ? { codigo: r.codigo, mensaje: r.mensaje } : null;
  ctx.ir('#/ingreso');
}
sesion.onExpira(() => finSesion({ codigo: 'SESION_EXPIRADA', mensaje: 'La sesión expiró. Volvé a ingresar.' }));

function despuesDeEntrar() {
  const d = sesion.datos();
  if (d.paneles.length === 1 && d.paneles[0] === 'admin_general') { sesion.elegirPanel('admin_general'); ctx.ir('#/admin/inicio'); }
  else if (d.paneles.length === 1 && d.paneles[0] === 'admin_finanzas') { sesion.elegirPanel('admin_finanzas'); ctx.ir('#/finanzas/inicio'); }
  else if (d.paneles.length === 1 && d.paneles[0] === 'cliente') { sesion.elegirPanel('cliente'); ctx.ir('#/cliente/inicio'); }
  else if (d.paneles.length === 1 && d.paneles[0] === 'repartidor') { sesion.elegirPanel('repartidor'); ctx.ir('#/repartidor/inicio'); }
  else ctx.ir('#/paneles');
}

function cabecera() {
  const d = sesion.datos();
  const logueado = !!sesion.token();
  document.getElementById('topbar-user').hidden = !logueado;
  document.getElementById('topbar-nombre').textContent = logueado ? (d.nombre || '') : '';
  document.getElementById('topbar-panel').textContent = logueado ? (d.panel ? textoPanel(d.panel) : 'Elegí un panel') : '';
  document.getElementById('btn-cambiar-panel').hidden = !(logueado && d.paneles.length > 1 && d.panel);
}

document.getElementById('btn-salir').addEventListener('click', async () => {
  const tok = sesion.token();
  sesion.cerrarLocal(); // el token se borra aunque falle la llamada
  ops.limpiarTodo();    // logout explícito: no quedan operaciones pendientes en la pestaña
  avisoLogin = { codigo: 'LOGOUT', mensaje: 'Sesión cerrada.' };
  ctx.ir('#/ingreso');
  if (tok) await llamar({ tipo: 'logout', token: tok });
});
document.getElementById('btn-cambiar-panel').addEventListener('click', () => { sesion.soltarPanel(); ctx.ir('#/paneles'); });

async function render() {
  for (const m of document.querySelectorAll('.modal-backdrop')) m.remove(); // un cambio de pantalla cierra los modales abiertos
  const ruta = (location.hash || '#/').replace(/^#/, '');
  const partes = ruta.split('/').filter(Boolean);
  const d = sesion.datos();
  document.body.classList.remove('es-inicio'); // solo el inicio público la vuelve a poner (cabecera sin distintivo, con Panadería · Pedidos · Gestión)
  cabecera();
  if (!sesion.token()) {
    const a = avisoLogin; avisoLogin = null;
    return vistaLogin(ctx, a);
  }
  if (partes[0] === 'admin') {
    if (d.panel !== 'admin_general') return ctx.ir('#/paneles');
    return vistaAdmin(ctx, partes.slice(1));
  }
  if (partes[0] === 'finanzas') {
    if (d.panel !== 'admin_finanzas') return ctx.ir('#/paneles');
    return vistaFinanzas(ctx, partes.slice(1));
  }
  if (partes[0] === 'cliente') {
    if (d.panel !== 'cliente') return ctx.ir('#/paneles');
    return vistaCliente(ctx, partes.slice(1));
  }
  if (partes[0] === 'repartidor') {
    if (d.panel !== 'repartidor') return ctx.ir('#/paneles');
    return vistaRepartidor(ctx, partes.slice(1));
  }
  if (partes[0] === 'paneles' || !d.panel) return vistaSelector(ctx, sesion);
  return ctx.ir(d.panel === 'admin_general' ? '#/admin/inicio' : d.panel === 'admin_finanzas' ? '#/finanzas/inicio' : d.panel === 'cliente' ? '#/cliente/inicio' : d.panel === 'repartidor' ? '#/repartidor/inicio' : '#/paneles');
}
window.addEventListener('hashchange', render);

// Arranque: si hay token guardado, se revalida con la Web API antes de mostrar nada.
(async function iniciar() {
  const tok = sesion.tokenGuardado();
  if (!tok) return render();
  montar(app, el('div', { class: 'card' }, el('p', { class: 'muted', text: 'Verificando sesión…' })));
  const res = await llamar({ tipo: 'sesion', token: tok });
  if (res.r && res.r.success && res.r.codigo === 'SESION_OK' && res.r.datos) {
    sesion.iniciar(tok, res.r.datos);
    await ops.cargar(sesion.datos().persona_id);
    const p = sesion.datos().panel;
    if (!p) location.hash = '#/paneles';
    return render();
  }
  if (res.r) { finSesion(res.r); return; }
  // Falla de red al revalidar: no se descarta el token (no hubo respuesta), se ofrece reintentar.
  montar(app, el('div', { class: 'card stack' },
    el('p', { text: 'No pudimos verificar tu sesión. Revisá la conexión.' }),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, 'Reintentar'),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { sesion.cerrarLocal(); render(); } }, 'Ingresar de nuevo'))));
  toast('Sin conexión con Golden.');
})();
