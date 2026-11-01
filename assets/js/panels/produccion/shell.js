// Panel Producción (01/11). Mismo marco visual que Admin General / Admin Finanzas (assets/js/marco.js).
// Rutas: #/produccion/inicio (Clientes) · #/produccion/cliente/<persona_id> (día del cliente) · …/<persona_id>/extra (carrito del extra de hoy)
// · #/produccion/catalogo.
// Lecturas y escrituras con tipo 'produccion' y panel_activo 'produccion'; el backend vuelve a verificar el rol en cada acción.
import { el, montar, conBloqueo, toast, textoPanel } from '../../ui.js';
import * as ops from '../../ops.js';
import { marco } from '../../marco.js';
import { TIPO, avisoR, nombreCliente, cant } from './comun.js';
import { vistaClientes, vistaDiaCliente, vistaExtra } from './clientes.js';
import { vistaCatalogo } from './catalogo.js';

const MENU = [
  { id: 'inicio', txt: 'Clientes', ico: 'personas', sub: 'Lo que lleva cada uno', corto: 'Clientes', tab: true },
  { id: 'catalogo', txt: 'Catálogo', ico: 'caja', sub: 'Productos activos', corto: 'Catálogo', tab: true },
];

export function vistaProduccion(ctx, partes) {
  const sec = partes[0] || 'inicio';
  const pid = sec === 'cliente' ? decodeURIComponent(partes[1] || '') : '';
  if (!(sec === 'inicio' || sec === 'catalogo' || (sec === 'cliente' && pid))) return ctx.ir('#/produccion/inicio');
  const grupo = MENU.find(m => m.id === (sec === 'cliente' ? 'inicio' : sec));
  const avisos = el('div', { class: 'stack', id: 'prod-pendientes-ops' });
  const contenido = el('section', { class: 'stack', id: 'produccion-contenido' });
  marco(ctx, { panel: 'produccion', extraClase: 'admin-page produccion-page' + (partes[2] === 'extra' ? ' prod-extra-page' : ''), base: '#/produccion', nav: MENU, grupo, sec, prefijo: 'prod-', zonas: [avisos], contenido,
    sub: sec === 'cliente' ? (partes[2] === 'extra' ? 'Registrar extra' : 'Día del cliente') : null,
    etiqueta: textoPanel('produccion'), rolTxt: textoPanel('produccion'), ariaMenu: 'Menú Producción', pie: 'Lo de cada día, bien anotado.' });
  pintarPendientes(ctx, avisos);
  if (ctx.flash) { const f = ctx.flash; ctx.flash = null; if (f.r) avisos.appendChild(avisoR(f.r)); }
  if (sec === 'catalogo') return vistaCatalogo(ctx, contenido);
  if (sec === 'cliente' && partes[2] === 'extra') return vistaExtra(ctx, contenido, pid);
  if (sec === 'cliente') return vistaDiaCliente(ctx, contenido, pid);
  return vistaClientes(ctx, contenido);
}

// Operaciones de Producción que quedaron sin confirmar (red caída, candado ocupado): se reintentan con el MISMO operacion_id.
const ACC_TXT = { prod_registrar_extra: 'Extra', prod_registrar_devolucion: 'Devolución' };
function describir(p) {
  const c = p.campos || {};
  const lineas = Array.isArray(c.lineas) ? c.lineas : [];
  const detalle = p.accion === 'prod_registrar_extra' ? lineas.length + (lineas.length === 1 ? ' producto' : ' productos')
    : lineas.map(l => cant(l.descontar)).join(', ');
  return [ACC_TXT[p.accion] || p.accion, nombreCliente(c.persona_id) || c.persona_id || null, c.fecha || c.fecha_entrega || null, detalle || null].filter(Boolean).join(' · ');
}
// Antes de mostrar el aviso, cada pendiente se verifica UNA vez en silencio reenviando la MISMA operación (mismo operacion_id).
// El backend es idempotente: si ya estaba registrada responde OPERACION_YA_PROCESADA y no duplica. Se marcan todas antes de enviar:
// nunca dos envíos en paralelo de la misma operación.
const verificadas = new Set();
async function verificarPendientes(ctx, lista) {
  const nuevas = lista.filter(p => !verificadas.has(p.operacion_id));
  nuevas.forEach(p => verificadas.add(p.operacion_id));
  for (const p of nuevas) {
    if (!ops.hayPendiente(p.accion, p.campos)) continue;
    const res = await ops.ejecutar(ctx.base(TIPO), p.accion, p.campos);
    if (res.r && ctx.revisarFinSesion(res.r)) return;
    if (res.r && res.r.codigo !== 'OPERACION_EN_CURSO') {
      toast(res.r.codigo === 'OPERACION_YA_PROCESADA' ? describir(p) + ': ya estaba registrado. No se duplicó.'
        : (res.r.success ? describir(p) + ': registrado.' : describir(p) + ': ' + (res.r.mensaje || 'no se pudo registrar.')));
    }
  }
}
function pintarPendientes(ctx, zona) {
  const lista = ops.listar((acc, tipo) => tipo === TIPO);
  if (!lista.length) return montar(zona);
  if (lista.some(p => !verificadas.has(p.operacion_id))) {
    montar(zona, el('div', { class: 'notice pending', role: 'status', 'data-verificando': 'true' }, 'Verificando operaciones que quedaron sin confirmar…'));
    verificarPendientes(ctx, lista).catch(() => null).then(() => { if (zona.isConnected) pintarPendientes(ctx, zona); });
    return;
  }
  montar(zona, el('div', { class: 'notice pending stack', role: 'alert', 'data-pendientes-prod': String(lista.length) },
    el('strong', { text: 'Operaciones sin confirmar' }),
    el('span', { text: 'No sabemos si se registraron. Reintentá la misma operación: si ya se había registrado, no se duplica.' }),
    lista.map(p => {
      const b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-accion': 'reintentar-pendiente' }, 'Reintentar la misma operación');
      b.addEventListener('click', conBloqueo(b, async () => {
        if (!ops.hayPendiente(p.accion, p.campos)) return pintarPendientes(ctx, zona);
        const res = await ops.ejecutar(ctx.base(TIPO), p.accion, p.campos);
        if (res.r && ctx.revisarFinSesion(res.r)) return;
        ctx.flash = res.r ? { r: res.r } : null;
        ctx.ir(location.hash);
      }, 'Reintentando…'));
      return el('div', { class: 'row', 'data-pendiente': p.operacion_id, 'data-pendiente-accion': p.accion },
        el('span', { class: 'small', text: describir(p) }), el('span', { class: 'spacer' }), b,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'descartar-pendiente', onclick: () => { ops.descartar(p.accion, p.campos); pintarPendientes(ctx, zona); } }, 'Descartar'));
    })));
}
