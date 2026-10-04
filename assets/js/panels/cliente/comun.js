// Panel Cliente: utilidades compartidas. La persona, el rol y el actor los decide SIEMPRE la Web API a partir de la sesión:
// la página nunca envía persona_id, actor, rol, lista de precio, precios, entorno, tablas ni flags de prueba.
// Los importes los calcula el backend; la página solo los formatea (la vista previa de un pedido es un ESTIMADO con el catálogo vigente).
import { el, montar, aviso } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from '../admin/personas.js';
import * as ops from '../../ops.js';

// Rutas de la Web API PROD usadas por el panel (tipo/accion). 'usuario' = consultas de la propia persona.
export const RUTA = {
  mi_perfil: 'usuario', mi_catalogo: 'usuario',
  mi_habitual: 'recurrente', cambio_vigente: 'recurrente',
  mi_pedido_fecha: 'pedido', crear_pedido_normal: 'pedido', mis_pedidos: 'pedido',
  mis_extras: 'extra', solicitar_extra: 'extra',
  mi_cuenta: 'cuenta',
  mis_casos: 'soporte', solicitar_soporte: 'soporte',
  mis_clientes: 'repartidor',
};
export const TIPOS_CLIENTE = ['pedido', 'recurrente', 'extra', 'soporte'];
// Las vistas son las mismas para el panel Cliente y el panel Repartidor: la ruta base sale del hash actual (el backend decide rol y persona por la sesión).
export const raiz = () => (location.hash.startsWith('#/repartidor') ? '#/repartidor' : '#/cliente');
export const esRepartidor = () => location.hash.startsWith('#/repartidor');

const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pesos = (v) => (typeof v === 'number' && Number.isFinite(v) ? ARS.format(v) : '—');
export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '—');
export const cant = (q, u) => num(q) + (str(u) ? ' ' + u : '');
// Fechas en hora de Argentina (UTC-3 fijo, mismo criterio del backend). Solo para proponer valores: el backend valida.
export const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const sumarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
export const fmtFecha = (f) => { if (!FECHA_RE.test(f || '')) return '—'; const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1); };
export const fmtCorta = (f) => FECHA_RE.test(f || '') ? new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '—';
export const fmtHora = (f) => { const t = Date.parse(f || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };
export const fmtCualquiera = (f) => (FECHA_RE.test(f || '') ? fmtCorta(f) : fmtHora(f));
export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const DIA_TXT = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
export const diaDe = (f) => DIAS[(new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7];
export const leerNum = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

export const ORIGEN_TXT = { habitual: 'Tu habitual', solo_por_hoy: 'Solo por ese día', pedido_nuevo_no_recurrente: 'Pedido para ese día', sin_pedido: 'Sin pedido' };
const ORIGEN_CHIP = { habitual: 'gold', solo_por_hoy: 'ok', pedido_nuevo_no_recurrente: 'ok', sin_pedido: '' };
export const chipOrigen = (o) => el('span', { class: 'chip ' + (ORIGEN_CHIP[o] || ''), 'data-origen': o || 'ninguno', text: ORIGEN_TXT[o] || String(o || '—') });
export const EXTRA_TXT = { pendiente_admin: 'Pendiente de Golden', solicitado: 'Pendiente de Golden', rechazado: 'Rechazado', aprobado_entrega_pendiente: 'Aprobado · entrega pendiente', aprobado: 'Aprobado',
  entregado: 'Entregado', entregado_parcial: 'Entregado en parte', no_entregado: 'No entregado', en_revision: 'En revisión', requiere_revision: 'En revisión' };
const EXTRA_CHIP = { pendiente_admin: 'warn', solicitado: 'warn', rechazado: 'off', aprobado_entrega_pendiente: 'gold', aprobado: 'gold', entregado: 'ok', entregado_parcial: 'ok', no_entregado: 'off', en_revision: 'off', requiere_revision: 'off' };
export const chipExtra = (e) => el('span', { class: 'chip ' + (EXTRA_CHIP[e] || ''), 'data-estado-extra': e || 'ninguno', text: EXTRA_TXT[e] || String(e || '—') });

export const tile = (label, valor, attr) => el('div', { class: 'precio-tile prd-tile', 'data-tile': attr || label }, el('span', { class: 'precio-label', text: label }), el('span', { class: 'precio-valor', text: valor }));
export const cabecera = (titulo, sub, extra) => el('div', { class: 'card stack section-card' }, el('div', { class: 'card-head' },
  el('div', null, el('h2', { class: 'section-title', text: titulo }), el('p', { class: 'card-sub', text: sub })), extra ? el('span', { class: 'spacer' }) : null, extra || null));
export const vacio = (texto) => el('div', { class: 'card empty', 'data-vacio': 'true' }, el('span', { class: 'empty-ico', 'aria-hidden': 'true' }), el('p', { text: texto }));
export const campo = (id, label, input, hint) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
export const listaLineas = (ls, id) => (!ls || !ls.length) ? el('p', { class: 'muted', text: 'Sin productos.' })
  : el('ul', { class: 'pp-lineas', id: id || null }, ls.map(l => el('li', { 'data-producto': String(l.producto_id || '') },
    el('span', { class: 'pp-prod', text: str(l.producto) || str(l.detalle_libre) || 'Producto' }), el('span', { class: 'pp-cant', text: cant(l.cantidad, l.unidad) }),
    str(l.detalle_libre) && str(l.producto) ? el('span', { class: 'muted small', text: l.detalle_libre }) : null)));

// Mensajes claros por código (el código del backend se muestra siempre al lado).
const MSJ = {
  PRODUCCION_CERRADA: 'La producción de esa fecha ya está cerrada o pasó el horario de corte (22:00 del día anterior). Ya no se puede cambiar el pedido de ese día.',
  CIERRE_EN_CURSO: 'Golden está cerrando la producción. Probá de nuevo en unos minutos.',
  PRODUCTO_NO_DISPONIBLE: 'Algún producto ya no está disponible. Elegí otro del catálogo.',
  FILA_NO_ENCONTRADA: 'No encontramos esa línea de tu habitual. Actualizá la pantalla.',
  OPERACION_ID_REUTILIZADO: 'Esa operación ya se había usado con otros datos. Volvé a intentarlo.',
  CAMPO_NO_PERMITIDO: 'La solicitud tenía datos que no se permiten.',
  DEMASIADAS_CONSULTAS: 'Ya tenés varias consultas abiertas. Esperá a que Golden las responda.',
};
const OK_TXT = { PEDIDO_REGISTRADO: 'Pedido registrado.', VERSION_SUPERADA: 'Pedido registrado.', CAMBIO_VIGENTE_APLICADO: 'Tu habitual se actualizó.', EXTRA_SOLICITADO: 'Extra solicitado. Golden lo va a revisar.',
  OPERACION_YA_PROCESADA: 'Ya estaba registrado. No se duplicó.', OK: 'Listo.' };
export const textoOk = (r) => OK_TXT[r.codigo] || r.mensaje || 'Listo.';
export function avisoCli(r) {
  if (r.success) return el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, OK_TXT[r.codigo] || r.mensaje || 'Listo.', el('span', { class: 'code', text: r.codigo }));
  const d = r.datos || {};
  return el('div', { class: 'notice error stack', role: 'alert', 'data-codigo': r.codigo },
    el('span', null, MSJ[r.codigo] || r.mensaje || 'No se pudo completar la solicitud.', el('span', { class: 'code', text: r.codigo })),
    d.reintentar_despues_del_cierre ? el('span', { class: 'small', text: 'Reintentá cuando termine el cierre.' }) : null);
}

// Lectura estándar: carga → falla de red (reintentar) → fin de sesión → rechazo del backend → pintar.
export async function leer(ctx, zona, accion, campos, pintar) {
  zona.dataset.estado = 'cargando';
  montar(zona, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
  const res = await ctx.pedir(RUTA[accion], accion, campos || {});
  if (!zona.isConnected) return;
  zona.dataset.estado = 'listo';
  if (res.falla) return montar(zona, avisoFalla(res.falla, () => leer(ctx, zona, accion, campos, pintar)));
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return montar(zona, avisoCli(res.r));
  pintar(res.r.datos || {});
}
// Lectura silenciosa (para datos de apoyo, p. ej. el catálogo). Devuelve datos o { error: Node }.
export async function traer(ctx, accion, campos) {
  const res = await ctx.pedir(RUTA[accion], accion, campos || {});
  if (res.falla) return { error: avisoFalla(res.falla) };
  if (ctx.revisarFinSesion(res.r)) return { error: aviso('error', 'La sesión terminó.') };
  if (!res.r.success) return { error: avisoCli(res.r) };
  return { datos: res.r.datos || {} };
}
// Catálogo de la persona: id, nombre, unidad y el precio de SU condición (lo decide el backend).
export async function catalogo(ctx) {
  const r = await traer(ctx, 'mi_catalogo');
  if (r.error) return r;
  const productos = (r.datos.productos || []).map(p => ({ producto_id: Number.isInteger(p.product_id) ? p.product_id : p.producto_id, nombre: str(p.nombre) || 'Producto', categoria: str(p.categoria), unidad: str(p.unidad), precio: typeof p.precio === 'number' ? p.precio : null }))
    .filter(p => Number.isInteger(p.producto_id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { productos, tipo_catalogo: str(r.datos.tipo_catalogo) };
}

// Escritura idempotente: operacion_id nuevo por operación; si queda sin confirmar (red), el reintento usa el MISMO id.
// alExito(r) se llama ante éxito u OPERACION_YA_PROCESADA. Devuelve la respuesta o null.
export async function escribir(ctx, zona, accion, campos, alExito) {
  const res = await ops.ejecutar(ctx.base(RUTA[accion]), accion, campos);
  if (!zona.isConnected && !res.r) return null;
  if (res.sinConfirmar) {
    montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => escribir(ctx, zona, accion, campos, alExito), () => { ops.descartar(accion, campos); montar(zona); }));
    return null;
  }
  if (ctx.revisarFinSesion(res.r)) return null;
  if (res.r.success) { if (alExito) await alExito(res.r); else montar(zona, avisoCli(res.r)); }
  else montar(zona, avisoCli(res.r));
  return res.r;
}
