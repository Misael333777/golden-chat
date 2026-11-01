// Panel Producción: utilidades compartidas. El actor lo decide SIEMPRE la Web API a partir de la sesión (rol produccion).
// La página solo envía el cliente elegido, la fecha y las cantidades; precios, importes y descuentos los calcula el backend.
// Nunca se muestra el saldo de la cuenta del cliente.
import { el, montar } from '../../ui.js';
import { avisoFalla } from '../admin/personas.js';

export const TIPO = 'produccion';
export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DIAS_ATRAS = 60;
// Fechas en hora de Argentina (UTC-3 fijo, mismo criterio del backend). Solo para proponer valores: el backend valida.
export const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const restarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
export const minFecha = () => restarDias(hoyART(), DIAS_ATRAS);

const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pesos = (v) => (typeof v === 'number' && Number.isFinite(v) ? ARS.format(v) : '—');
export const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
export const nOk = (v) => (typeof v === 'number' && Number.isFinite(v));
export const fnum = (v) => (nOk(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '—');
export const redondo = (v) => Math.round(v * 100) / 100;
// Unidad para mostrar: los paquetes del catálogo (x2u, x4u, x6u) se muestran como 'paquetes'.
export const uTxt = (u) => (/^x\d+u$/i.test(u || '') ? 'paquetes' : (u || ''));
export const cant = (q, u) => fnum(q) + (uTxt(u) ? ' ' + uTxt(u) : '');
export const leerCant = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return 0; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
export const sinTilde = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const fmtFecha = (f) => (FECHA_RE.test(f || '') ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '—');

// Respuestas: se aceptan las listas bajo datos o bajo datos.<clave> (defensivo ante cambios menores del sobre).
export const listaDe = (datos, ...claves) => {
  if (Array.isArray(datos)) return datos;
  for (const k of claves) if (datos && Array.isArray(datos[k])) return datos[k];
  return [];
};
// Producto del catálogo de Producción, normalizado: { producto_id, nombre, unidad, categoria, orden, precio|null }.
export const normProducto = (p) => {
  const id = Number.isInteger(p && p.producto_id) ? p.producto_id : (Number.isInteger(p && p.id) ? p.id : null);
  return id === null ? null : { producto_id: id, nombre: str(p.producto) || str(p.nombre) || 'Producto ' + id, unidad: str(p.unidad), categoria: str(p.categoria),
    orden: Number.isInteger(p.orden) ? p.orden : null, precio: nOk(p.precio) ? p.precio : null };
};
export const ordenarProductos = (l) => l.slice().sort((a, b) => (a.orden === null ? 1e9 : a.orden) - (b.orden === null ? 1e9 : b.orden) || a.nombre.localeCompare(b.nombre, 'es'));

export const cabecera = (titulo, sub, extra) => el('div', { class: 'card stack section-card' }, el('div', { class: 'card-head' },
  el('div', null, el('h2', { class: 'section-title', text: titulo }), sub ? el('p', { class: 'card-sub', text: sub }) : null), extra ? el('span', { class: 'spacer' }) : null, extra || null));
export const vacio = (texto) => el('div', { class: 'card empty', 'data-vacio': 'true' }, el('span', { class: 'empty-ico', 'aria-hidden': 'true' }), el('p', { text: texto }));
export const avisoR = (r, tipo) => el('div', { class: 'notice ' + (tipo || (r.success ? 'ok' : 'error')), role: r.success ? 'status' : 'alert', 'data-codigo': r.codigo },
  r.mensaje || (r.success ? 'Listo.' : 'No se pudo completar la solicitud.'), el('span', { class: 'code', text: r.codigo }));

// Lectura estándar: carga → falla de red (reintentar) → fin de sesión → rechazo del backend → pintar(datos, r).
// alRechazo(r) opcional: devuelve true si ya pintó algo propio para ese rechazo.
export async function leer(ctx, zona, accion, campos, pintar, alRechazo) {
  zona.dataset.estado = 'cargando';
  montar(zona, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
  const res = await ctx.pedir(TIPO, accion, campos || {});
  if (!zona.isConnected) return;
  zona.dataset.estado = 'listo';
  if (res.falla) return montar(zona, avisoFalla(res.falla, () => leer(ctx, zona, accion, campos, pintar, alRechazo)));
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) { if (alRechazo && alRechazo(res.r)) return; return montar(zona, avisoR(res.r)); }
  pintar(res.r.datos || {}, res.r);
}

// Clientes de Producción (persona_id + nombre). Se recuerdan en memoria para la búsqueda y para nombrar pendientes.
export const memoria = { clientes: null, busqueda: '', fechas: {} };
export const nombreCliente = (pid) => { const c = (memoria.clientes || []).find(x => x.persona_id === pid); return c ? c.nombre : null; };
