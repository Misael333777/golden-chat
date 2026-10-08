// Admin General → Pedidos.
// Usa SOLO acciones de Web API PROD (tipo admin_general → Consultas / Escrituras / Recurrentes Cambios / Extras PROD):
//   lectura: pedidos_fecha, pedido_persona, habitual_persona, extras_admin (+ listar_personas y listar_productos ya existentes);
//   escritura: crear_pedido_normal, configurar_recurrente, agregar_dia, editar_habitual_dia, hoy_no_pedir, anular_pedido_fecha,
//   solicitar_extra, aprobar_extra, rechazar_extra, registrar_entrega, recuperar_finanzas_extra.
// Etapa 4: el día habitual se edita COMPLETO (editar_habitual_dia: lista entera + salida/repartidor del día). La fila ancla (sin producto,
// cantidad 0) se muestra como "Solo logística". 'Hoy no pedir' / 'Volver al habitual' / 'Cancelar pedido' usan las rutas existentes (sin pedido_id).
// Reglas: el backend decide TODO (tipo solo_por_hoy / pedido_nuevo_no_recurrente, corte, cierre, roles, idempotencia).
// Acá no se recalcula producción ni el habitual: se muestra lo que devuelve el backend y su código.
// Finanzas: solo estado operativo del extra (generado / pendiente de generar / no corresponde). Nunca precios ni importes del extra guardado.
// Excepcion: el formulario 'Cargar extra para hoy' muestra el precio ACTUAL del catalogo solo como referencia (el backend congela el precio real).
import * as ops from '../../ops.js';
import { el, montar, aviso, modal, confirmar, conBloqueo, toast } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';
import { armadorPedido } from '../cliente/armador.js';
import { DRIVE_RE } from './imagenes.js';

const TIPO = 'admin_general';
const estado = { fecha: null, tab: 'fecha', texto: '', tipo: 'todos', repartidor: 'todos', salida: 'todas', extra: 'todos' };
const str = (v) => (typeof v === 'string' ? v : null);
const sinTilde = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const inicial = (n) => { const w = (str(n) || '?').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : '')).toUpperCase(); };
const PID = /^PER-[A-Z0-9]+-[A-Z0-9]+$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fechas en hora de Argentina (UTC-3 fijo, mismo criterio del backend). Solo para proponer valores; el backend valida.
const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const sumarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const fmtFecha = (f) => { if (!FECHA_RE.test(f || '')) return '—'; const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1); };
const fmtMin = (f) => fmtFecha(f).toLowerCase();
const fmtCorta = (f) => FECHA_RE.test(f || '') ? new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '—';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '—');
const cant = (q, u) => num(q) + (str(u) ? ' ' + u : '');
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pesos = (v) => (typeof v === 'number' && Number.isFinite(v) ? money.format(v) : '—');

const ORIGEN_TXT = { recurrente: 'Habitual', habitual: 'Habitual', solo_por_hoy: 'Solo por hoy', pedido_nuevo_no_recurrente: 'Pedido nuevo', sin_pedido: 'Sin pedido' };
const ORIGEN_CHIP = { recurrente: 'gold', habitual: 'gold', solo_por_hoy: 'ok', pedido_nuevo_no_recurrente: 'ok', sin_pedido: '' };
const chipOrigen = (o) => el('span', { class: 'chip ' + (ORIGEN_CHIP[o] || ''), 'data-origen': o || 'ninguno', text: ORIGEN_TXT[o] || String(o || '—') });
const EXTRA_TXT = { solicitado: 'Pendiente de aprobar', rechazado: 'Rechazado', aprobado_entrega_pendiente: 'Aprobado · entrega pendiente', entregado: 'Entregado',
  entregado_parcial: 'Entregado parcial', no_entregado: 'No entregado', requiere_revision: 'Requiere revisión', anulado: 'Cancelado' };
const EXTRA_CHIP = { solicitado: 'warn', rechazado: 'off', aprobado_entrega_pendiente: 'gold', entregado: 'ok', entregado_parcial: 'ok', no_entregado: 'off', requiere_revision: 'off', anulado: 'off' };
const chipExtra = (e) => el('span', { class: 'chip ' + (EXTRA_CHIP[e] || ''), 'data-estado-extra': e || 'ninguno', text: EXTRA_TXT[e] || String(e || '—') });
const FIN_TXT = { generado: 'Cargo generado', pendiente_de_generar: 'Cargo pendiente de generar', no_corresponde: 'Sin cargo' };
const chipFin = (f) => el('span', { class: 'chip ' + (f === 'pendiente_de_generar' ? 'warn' : (f === 'generado' ? 'ok' : '')), 'data-finanzas': f || 'ninguno', text: 'Finanzas: ' + (FIN_TXT[f] || '—') });
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIA_TXT = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
const SALIDAS = ['salida 1', 'salida 2', 'salida 3', 'salida 4'];
const salidaTxt = (s) => str(s) ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sin salida';
// Etapa 4: fila ancla = sin producto y cantidad 0 (solo guarda la logística del día). Nunca se muestra como producto.
const esAncla = (l) => !!l && (l.ancla === true || ((l.producto_id === null || l.producto_id === undefined) && l.cantidad === 0));
// Salida y repartidor del día (uniformes en el día; se toman de la primera línea activa, incluida la ancla).
const logisticaDia = (ls) => { const l = (ls || [])[0] || {}; return { salida: str(l.salida), repartidor_persona_id: str(l.repartidor_persona_id) }; };

// Mensajes claros por código (el código del backend se muestra siempre al lado). Sin texto propio, se usa el mensaje del backend.
const MSJ = {
  PRODUCCION_CERRADA: 'La producción de esa fecha ya está cerrada o pasó el horario de corte (22:00 del día anterior). No se pueden cargar ni cambiar pedidos normales para esa fecha.',
  CIERRE_EN_CURSO: 'Se está cerrando la producción. Los cambios del habitual se pueden hacer cuando termine el cierre.',
  FECHA_INVALIDA: null,
  OPERACION_ID_REUTILIZADO: 'Esa operación ya se había usado con otros datos. Volvé a intentarlo como una operación nueva.',
  OPERACION_YA_PROCESADA: 'La operación ya estaba registrada. No se duplicó.',
  ACCESO_DENEGADO: null, SESION_INVALIDA: 'La sesión no es válida. Ingresá de nuevo.',
  PERSONA_ES_RECURRENTE: null, PERSONA_NO_ES_RECURRENTE: null, DIA_YA_EXISTE: 'La persona ya tiene un habitual activo ese día. Para cambiarlo, editá sus líneas.',
  YA_RESUELTO: 'Ese extra ya fue aprobado o rechazado.', FIN_YA_EXISTE: 'El cargo de este extra ya existe. No se duplica.',
  SIN_IMPORTE: 'Este extra no tiene nada para cobrar (no se entregó nada). No corresponde cargo.',
  SIN_ENTREGA_REGISTRADA: 'Primero hay que registrar la entrega del extra.', MOTIVO_OBLIGATORIO: 'Escribí el motivo del rechazo.',
  CAMPO_NO_PERMITIDO: 'La solicitud tenía datos que no se permiten.', REQUIERE_REVISION: 'Los datos guardados no son coherentes. Requiere revisión: no se aplicó ningún cambio.',
  PRODUCTO_DUPLICADO: 'Hay un producto repetido en el día. Juntalo en una sola línea.', CANTIDAD_INVALIDA: 'Cada producto necesita una cantidad mayor que 0.',
  LINEAS_INVALIDAS: 'Revisá los productos y cantidades del día.', RECURRENTE_MODIFICADO: 'El habitual cambió mientras se editaba. Actualizá y volvé a intentarlo.',
  PRODUCTO_NO_DISPONIBLE: 'Hay productos que no están disponibles para esa persona (catálogo de su rol o producto inactivo).',
  SIN_RECURRENTE_PARA_FECHA: 'La persona no tiene habitual ese día: no corresponde “Hoy no pedir”.', SIN_EXCEPCION_VIGENTE: 'No hay un pedido vigente para esa fecha que se pueda anular.',
};
const OK_TXT = {
  PEDIDO_REGISTRADO: 'Pedido registrado.', VERSION_SUPERADA: 'Pedido registrado (ya había una versión más nueva).',
  RECURRENTE_CONFIGURADO: 'Habitual configurado.', DIA_AGREGADO: 'Día agregado al habitual.', CAMBIO_VIGENTE_APLICADO: 'Habitual actualizado.',
  EXTRA_REGISTRADO_APROBADO: 'Extra cargado y aprobado.', EXTRA_SOLICITADO: 'Extra solicitado.', EXTRA_APROBADO: 'Extra aprobado.', EXTRA_RECHAZADO: 'Extra rechazado.', EXTRA_CANCELADO: 'Extra cancelado.',
  ENTREGA_REGISTRADA: 'Entrega registrada.', ENTREGA_REGISTRADA_CON_CARGO: 'Entrega registrada. Se generó el cargo del extra.',
  FINANZAS_RECUPERADAS: 'Se generó el cargo pendiente del extra.', OPERACION_YA_PROCESADA: 'La operación ya estaba registrada. No se duplicó.',
  HABITUAL_DIA_EDITADO: 'Día del habitual actualizado.', HOY_NO_PEDIR_REGISTRADO: 'Listo: ese día la persona no recibe pedido. El habitual no cambia.', PEDIDO_ANULADO: 'Se anuló el pedido de esa fecha.',
};
function avisoNegocio(r) {
  if (r.success) return el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, OK_TXT[r.codigo] || r.mensaje || 'Operación realizada.', el('span', { class: 'code', text: r.codigo }));
  const d = r.datos || {};
  const extra = [];
  if (d.reintentar_despues_del_cierre) extra.push(el('span', { class: 'small', text: 'Reintentá la misma operación cuando termine el cierre.' }));
  if (d.estado_actual) extra.push(el('span', { class: 'small', text: 'Estado actual: ' + (EXTRA_TXT[d.estado_actual] || d.estado_actual) + (d.estado_entrega_actual ? ' · entrega: ' + d.estado_entrega_actual : '') }));
  if (Array.isArray(d.lineas) && d.lineas.length) extra.push(el('span', { class: 'small', text: d.lineas.map(l => 'solicitado ' + num(l.solicitada) + ', indicado ' + num(l.aprobada)).join(' · ') }));
  const texto = MSJ[r.codigo] || r.mensaje || 'No se pudo completar la operación.';
  return el('div', { class: 'notice error stack', role: 'alert', 'data-codigo': r.codigo },
    el('span', null, texto, el('span', { class: 'code', text: r.codigo })), extra);
}

// ---------- datos de apoyo (personas y productos), cacheados mientras dura la vista ----------
async function cargarApoyo(ctx) {
  const [p, c] = await Promise.all([ctx.pedir(TIPO, 'listar_personas', { buscar: '' }), ctx.pedir(TIPO, 'listar_productos', {})]);
  const personas = p.r && p.r.success && p.r.datos && Array.isArray(p.r.datos.personas) ? p.r.datos.personas.filter(x => x && PID.test(x.persona_id || '')) : null;
  // De los productos: id, nombre, unidad, estado e imagen (fotos del catálogo + carrito). Precios y visibilidad por rol SOLO para la referencia de 'Cargar extra para hoy' (el backend congela el precio).
  const nOk = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const productos = c.r && c.r.success && c.r.datos && Array.isArray(c.r.datos.productos)
    ? c.r.datos.productos.filter(x => x && Number.isInteger(x.producto_id)).map(x => ({ producto_id: x.producto_id, producto: str(x.producto), unidad: str(x.unidad), activo: x.activo === true, categoria: str(x.categoria),
      precio_minorista: nOk(x.precio_minorista), precio_mayorista: nOk(x.precio_mayorista), visible_clientes: x.visible_clientes === true, visible_repartidores: x.visible_repartidores === true,
      imagen_url: str(x.imagen_url) })) : null;
  return { personas, productos, falla: p.falla || c.falla || null, r: (p.r && !p.r.success) ? p.r : ((c.r && !c.r.success) ? c.r : null) };
}
const rolesActivos = (p) => (p && Array.isArray(p.roles) ? p.roles.filter(r => r.estado === 'activo').map(r => r.rol) : []);
const nombreDe = (apoyo, pid) => { const p = apoyo && apoyo.personas ? apoyo.personas.find(x => x.persona_id === pid) : null; return p ? (str(p.nombre) || pid) : (pid || '—'); };
const repartidores = (apoyo) => (apoyo && apoyo.personas ? apoyo.personas.filter(p => rolesActivos(p).includes('repartidor')) : []);

// ---------- catálogo + carrito (mismo componente que "Hacer pedido" de Cliente/Repartidor) ----------
// Admin: sin precios (Pedidos nunca muestra importes). Productos activos + los ya cargados que hoy están inactivos (se conservan, como antes).
const productosArmador = (apoyo) => (apoyo.productos || []).filter(p => p.activo)
  .map(p => ({ producto_id: p.producto_id, nombre: p.producto || 'Producto ' + p.producto_id, categoria: p.categoria, unidad: p.unidad, precio: null,
    tiene_imagen: typeof p.imagen_url === 'string' && DRIVE_RE.test(p.imagen_url) }));
// Fotos en Admin: la acción existente admin_general/ver_imagen (la misma del Catálogo de Admin). Caché en memoria; si falla, queda el ícono.
const fotosAdmin = new Map(); // imagen_url -> Promise<data:|null>
function cargadorFotosAdmin(ctx, apoyo) {
  return (producto_id) => {
    const p = (apoyo.productos || []).find(x => x.producto_id === producto_id);
    const url = p && typeof p.imagen_url === 'string' && DRIVE_RE.test(p.imagen_url) ? p.imagen_url : null;
    if (!url) return Promise.resolve(null);
    if (!fotosAdmin.has(url)) fotosAdmin.set(url, ctx.pedir(TIPO, 'ver_imagen', { imagen_url: url }).then((res) => {
      if (!res || res.falla) { fotosAdmin.delete(url); return null; }
      const d = res.r && res.r.success ? res.r.datos || {} : null;
      if (!d || !['image/png', 'image/jpeg', 'image/webp'].includes(d.tipo_mime) || typeof d.contenido_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(d.contenido_base64)) return null;
      return 'data:' + d.tipo_mime + ';base64,' + d.contenido_base64;
    }, () => { fotosAdmin.delete(url); return null; }));
    return fotosAdmin.get(url);
  };
}

// ---------- escritura común ----------
// Ejecuta una escritura con operacion_id (idempotente; reintento con el MISMO id si quedó sin confirmar). Devuelve la respuesta o null.
async function escribir(ctx, zona, accion, campos, alExito) {
  const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
  if (res.sinConfirmar) {
    montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => escribir(ctx, zona, accion, campos, alExito), () => { ops.descartar(accion, campos); montar(zona); }));
    return null;
  }
  if (ctx.revisarFinSesion(res.r)) return null;
  if (res.r.success) { if (alExito) await alExito(res.r); else montar(zona, avisoNegocio(res.r)); }
  else montar(zona, avisoNegocio(res.r));
  return res.r;
}

// =====================================================================================
// VISTA PRINCIPAL
// =====================================================================================
export function vistaPedidos(ctx, cont, sub) {
  if (sub === 'extras') estado.tab = 'extras';
  if (!estado.fecha) estado.fecha = sumarDias(hoyART(), 1);
  const tabFecha = el('button', { type: 'button', class: 'btn btn-sm', role: 'tab', id: 'tab-fecha', 'data-tab': 'fecha' }, 'Pedidos por fecha');
  const tabExtras = el('button', { type: 'button', class: 'btn btn-sm', role: 'tab', id: 'tab-extras', 'data-tab': 'extras' }, 'Extras pendientes');
  const bCargar = el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-cargar-pedido', onclick: () => elegirPersona(ctx) }, 'Cargar o ver pedido de una persona');
  const zona = el('div', { class: 'stack', id: 'pedidos', 'data-estado': 'cargando' });
  montar(cont,
    el('div', { class: 'card stack section-card' },
      el('div', { class: 'card-head' },
        el('div', null, el('h2', { class: 'section-title', text: 'Pedidos' }),
          el('p', { class: 'card-sub', text: 'Pedidos por fecha, habituales y extras. Los pedidos normales no requieren aprobación; solo los extras.' })),
        el('span', { class: 'spacer' }), bCargar),
      el('div', { class: 'ped-tabs', role: 'tablist', 'aria-label': 'Vista de pedidos' }, tabFecha, tabExtras)),
    zona);
  const pintarTabs = () => {
    for (const t of [tabFecha, tabExtras]) { const on = t.dataset.tab === estado.tab; t.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-ghost'); t.setAttribute('aria-selected', String(on)); }
  };
  tabFecha.addEventListener('click', () => { estado.tab = 'fecha'; pintarTabs(); vistaFecha(ctx, zona); });
  tabExtras.addEventListener('click', () => { estado.tab = 'extras'; pintarTabs(); vistaExtrasPendientes(ctx, zona); });
  pintarTabs();
  if (estado.tab === 'extras') vistaExtrasPendientes(ctx, zona); else vistaFecha(ctx, zona);
}

function vistaFecha(ctx, zona) {
  const iFecha = el('input', { class: 'input', id: 'ped-fecha', type: 'date', value: estado.fecha, 'aria-label': 'Fecha de entrega' });
  const bHoy = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'ped-hoy' }, 'Hoy');
  const bMan = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'ped-manana' }, 'Mañana');
  const iTexto = el('input', { class: 'input', id: 'ped-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar persona…', 'aria-label': 'Buscar persona', value: estado.texto });
  const sTipo = el('select', { class: 'select', id: 'ped-tipo', 'aria-label': 'Tipo' },
    el('option', { value: 'todos', text: 'Todos los tipos' }), el('option', { value: 'recurrente', text: 'Habitual' }), el('option', { value: 'solo_por_hoy', text: 'Solo por hoy' }),
    el('option', { value: 'pedido_nuevo_no_recurrente', text: 'Pedido nuevo' }), el('option', { value: 'solo_extras', text: 'Solo extras' }));
  const sRep = el('select', { class: 'select', id: 'ped-repartidor', 'aria-label': 'Repartidor' }, el('option', { value: 'todos', text: 'Todos los repartidores' }));
  const sSal = el('select', { class: 'select', id: 'ped-salida', 'aria-label': 'Salida' }, el('option', { value: 'todas', text: 'Todas las salidas' }),
    SALIDAS.map(s => el('option', { value: s, text: salidaTxt(s) })), el('option', { value: 'sin', text: 'Sin salida' }));
  const sExt = el('select', { class: 'select', id: 'ped-extras', 'aria-label': 'Extras' },
    el('option', { value: 'todos', text: 'Con y sin extras' }), el('option', { value: 'con', text: 'Con extras' }), el('option', { value: 'pendientes', text: 'Extras por resolver' }), el('option', { value: 'sin', text: 'Sin extras' }));
  sTipo.value = estado.tipo; sSal.value = estado.salida; sExt.value = estado.extra;
  const cuerpo = el('div', { class: 'stack', id: 'ped-lista', 'data-estado': 'cargando' });
  montar(zona,
    el('div', { class: 'ped-fecha-bar' }, el('label', { for: 'ped-fecha', class: 'ped-fecha-label', text: 'Fecha de entrega' }), iFecha, bHoy, bMan,
      el('span', { class: 'ped-fecha-txt', id: 'ped-fecha-txt', text: fmtFecha(estado.fecha) })),
    el('div', { class: 'ped-filtros' }, el('div', { class: 'field search-field' }, iTexto), sTipo, sRep, sSal, sExt),
    cuerpo);
  zona.dataset.estado = 'listo';
  let datos = null;
  const cambiarFecha = (f) => { if (!FECHA_RE.test(f)) return; estado.fecha = f; iFecha.value = f; document.getElementById('ped-fecha-txt').textContent = fmtFecha(f); cargar(); };
  iFecha.addEventListener('change', () => cambiarFecha(iFecha.value));
  bHoy.addEventListener('click', () => cambiarFecha(hoyART()));
  bMan.addEventListener('click', () => cambiarFecha(sumarDias(hoyART(), 1)));
  iTexto.addEventListener('input', () => { estado.texto = iTexto.value; pintar(); });
  sTipo.addEventListener('change', () => { estado.tipo = sTipo.value; pintar(); });
  sRep.addEventListener('change', () => { estado.repartidor = sRep.value; pintar(); });
  sSal.addEventListener('change', () => { estado.salida = sSal.value; pintar(); });
  sExt.addEventListener('change', () => { estado.extra = sExt.value; pintar(); });

  function pintar() {
    if (!datos) return;
    const { grupos, apoyo, pf, ex } = datos;
    const q = sinTilde(estado.texto.trim());
    const vis = grupos.filter(g =>
      (!q || sinTilde(g.nombre).includes(q) || sinTilde(g.persona_id).includes(q)) &&
      (estado.tipo === 'todos' || (estado.tipo === 'solo_extras' ? !g.origen && g.extras.length : g.origen === estado.tipo)) &&
      (estado.repartidor === 'todos' || (estado.repartidor === 'sin' ? !g.repartidores.length : g.repartidores.includes(estado.repartidor))) &&
      (estado.salida === 'todas' || (estado.salida === 'sin' ? !g.salidas.length : g.salidas.includes(estado.salida))) &&
      (estado.extra === 'todos' || (estado.extra === 'con' ? g.extras.length > 0 : estado.extra === 'sin' ? g.extras.length === 0
        : g.extras.some(x => ['solicitado', 'aprobado_entrega_pendiente', 'requiere_revision'].includes(x.estado) || x.finanzas === 'pendiente_de_generar'))));
    const po = (pf && pf.resumen && pf.resumen.por_origen) || {};
    const exPend = ex ? ex.extras.filter(x => ['solicitado', 'aprobado_entrega_pendiente'].includes(x.estado)).length : 0;
    const resumen = el('div', { class: 'ped-resumen', id: 'ped-resumen' },
      el('span', { class: 'ped-res-item', 'data-res': 'personas' }, el('strong', { text: String(grupos.filter(g => g.origen).length) }), ' con pedido'),
      el('span', { class: 'ped-res-item', 'data-res': 'habitual' }, el('strong', { text: String(po.recurrente || 0) }), ' líneas de habitual'),
      el('span', { class: 'ped-res-item', 'data-res': 'sph' }, el('strong', { text: String(po.solo_por_hoy || 0) }), ' solo por hoy'),
      el('span', { class: 'ped-res-item', 'data-res': 'pnn' }, el('strong', { text: String(po.pedido_nuevo_no_recurrente || 0) }), ' pedido nuevo'),
      el('span', { class: 'ped-res-item', 'data-res': 'extras' }, el('strong', { text: String(ex ? ex.extras.length : 0) }), ' extras' + (exPend ? ' (' + exPend + ' por resolver)' : '')));
    const avisos = [];
    if (!pf) avisos.push(aviso('error', 'No se pudieron leer los pedidos de la fecha.', datos.pfCodigo || null));
    if (!ex) avisos.push(aviso('error', 'No se pudieron leer los extras de la fecha.', datos.exCodigo || null));
    if (pf && pf.pendientes && pf.pendientes.length) avisos.push(el('div', { class: 'notice info', 'data-pendientes-produccion': String(pf.pendientes.length) },
      pf.pendientes.length + ' pedido(s) de esta fecha quedaron fuera de la producción por inconsistencias y requieren revisión (se ven en Producción/Pendientes).'));
    const filtrado = vis.length !== grupos.length ? el('p', { class: 'muted small', text: 'Mostrando ' + vis.length + ' de ' + grupos.length + ' personas.' }) : null;
    if (!vis.length) return montar(cuerpo, resumen, avisos, el('div', { class: 'card empty', 'data-vacio': 'true' },
      el('span', { class: 'empty-ico empty-ico-search', 'aria-hidden': 'true' }),
      el('p', { text: grupos.length ? 'No hay pedidos que coincidan con los filtros.' : 'No hay pedidos para ' + fmtMin(estado.fecha) + '.' })));
    montar(cuerpo, resumen, avisos, filtrado, el('div', { class: 'tabla tabla-ped' },
      el('div', { class: 'tabla-head ped-row-grid', 'aria-hidden': 'true' },
        el('span', { text: 'Persona' }), el('span', { text: 'Tipo' }), el('span', { text: 'Productos' }), el('span', { text: 'Salida · Repartidor' }), el('span', { text: 'Extras' }), el('span', { text: '' })),
      el('div', { class: 'list', id: 'lista-pedidos' }, vis.map(g => filaGrupo(ctx, g, apoyo)))));
  }

  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'list' }, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' })));
    const fecha = estado.fecha;
    const [a, b, apoyo] = await Promise.all([ctx.pedir(TIPO, 'pedidos_fecha', { fecha }), ctx.pedir(TIPO, 'extras_admin', { modo: 'fecha', fecha }), cargarApoyo(ctx)]);
    if (!cuerpo.isConnected || fecha !== estado.fecha) return;
    cuerpo.dataset.estado = 'listo';
    for (const x of [a, b]) if (x.r && ctx.revisarFinSesion(x.r)) return;
    if (a.falla && b.falla) return montar(cuerpo, avisoFalla(a.falla, cargar));
    if (a.r && !a.r.success && b.r && !b.r.success) return montar(cuerpo, avisoNegocio(a.r));
    const pf = a.r && a.r.success && a.r.codigo === 'PEDIDOS_FECHA_OK' ? a.r.datos : null;
    const ex = b.r && b.r.success && b.r.codigo === 'EXTRAS_ADMIN_OK' ? b.r.datos : null;
    const mapa = new Map();
    const g = (pid, nombre) => { if (!mapa.has(pid)) mapa.set(pid, { persona_id: pid, nombre: nombre || nombreDe(apoyo, pid), origen: null, lineas: [], salidas: [], repartidores: [], extras: [] }); return mapa.get(pid); };
    for (const r of (pf ? pf.renglones : [])) {
      if (!PID.test(r.persona_id || '')) continue;
      const x = g(r.persona_id, r.nombre);
      x.origen = x.origen || r.origen;
      x.lineas.push(r);
      if (r.salida && !x.salidas.includes(r.salida)) x.salidas.push(r.salida);
      if (r.repartidor_persona_id && !x.repartidores.includes(r.repartidor_persona_id)) x.repartidores.push(r.repartidor_persona_id);
    }
    for (const e of (ex ? ex.extras : [])) if (PID.test(e.persona_id || '')) g(e.persona_id, e.nombre).extras.push(e);
    const grupos = [...mapa.values()].sort((p, q) => (p.nombre || '').localeCompare(q.nombre || '', 'es'));
    const reps = [...new Set(grupos.flatMap(x => x.repartidores))];
    montar(sRep, el('option', { value: 'todos', text: 'Todos los repartidores' }), el('option', { value: 'sin', text: 'Sin repartidor' }),
      reps.map(id => el('option', { value: id, text: nombreDe(apoyo, id) })));
    if (estado.repartidor !== 'todos' && estado.repartidor !== 'sin' && !reps.includes(estado.repartidor)) estado.repartidor = 'todos';
    sRep.value = estado.repartidor;
    datos = { grupos, apoyo, pf, ex, pfCodigo: a.r ? a.r.codigo : 'FALLA_' + a.falla, exCodigo: b.r ? b.r.codigo : 'FALLA_' + b.falla };
    pintar();
  }
  cargar();
}

function filaGrupo(ctx, g, apoyo) {
  const prods = g.lineas.map(l => (str(l.producto) || str(l.detalle_libre) || 'Producto') + ' ' + cant(l.cantidad, l.unidad)).join(' · ');
  const salRep = [g.salidas.map(salidaTxt).join(', '), g.repartidores.map(id => nombreDe(apoyo, id)).join(', ')].filter(Boolean).join(' · ');
  const porResolver = g.extras.filter(x => ['solicitado', 'aprobado_entrega_pendiente', 'requiere_revision'].includes(x.estado) || x.finanzas === 'pendiente_de_generar').length;
  return el('button', { type: 'button', class: 'person-card ped-row ped-row-grid', 'data-persona': g.persona_id, 'data-origen': g.origen || 'solo_extras',
    onclick: () => ctx.ir('#/admin/pedidos/persona/' + encodeURIComponent(g.persona_id) + '/' + estado.fecha) },
    el('span', { class: 'pc-cell pc-nombre' }, el('span', { class: 'avatar', 'aria-hidden': 'true', text: inicial(g.nombre) }),
      el('span', { class: 'person-id' }, el('span', { class: 'person-name', text: g.nombre || g.persona_id }), el('span', { class: 'person-also', text: g.persona_id }))),
    el('span', { class: 'pc-cell ped-tipo chips' }, g.origen ? chipOrigen(g.origen) : el('span', { class: 'chip', text: 'Solo extras' })),
    el('span', { class: 'pc-cell ped-prods' }, el('span', { class: 'pc-label', text: 'Productos: ' }), prods || '—'),
    el('span', { class: 'pc-cell ped-salida' }, el('span', { class: 'pc-label', text: 'Salida · repartidor: ' }), salRep || 'Sin asignar'),
    el('span', { class: 'pc-cell ped-extras chips' }, g.extras.length ? el('span', { class: 'chip ' + (porResolver ? 'warn' : 'gold'), 'data-extras': String(g.extras.length),
      text: g.extras.length + (g.extras.length === 1 ? ' extra' : ' extras') + (porResolver ? ' · ' + porResolver + ' por resolver' : '') }) : el('span', { class: 'muted small', text: 'Sin extras' })),
    el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' })));
}

// Elegir persona (clientes y repartidores activos) para abrir su pedido en la fecha seleccionada.
async function elegirPersona(ctx) {
  const iBus = el('input', { class: 'input', id: 'elegir-buscar', type: 'search', maxlength: '100', placeholder: 'Nombre o ID…', 'aria-label': 'Buscar persona' });
  const iFecha = el('input', { class: 'input', id: 'elegir-fecha', type: 'date', value: estado.fecha || sumarDias(hoyART(), 1) });
  const lista = el('div', { class: 'list ped-elegir', id: 'elegir-lista' }, el('div', { class: 'skeleton' }));
  const m = modal('Elegir persona', el('div', { class: 'stack' },
    el('div', { class: 'form-grid two' }, el('div', { class: 'field' }, el('label', { for: 'elegir-buscar', text: 'Persona' }), iBus),
      el('div', { class: 'field' }, el('label', { for: 'elegir-fecha', text: 'Fecha' }), iFecha)), lista));
  const apoyo = await cargarApoyo(ctx);
  if (!lista.isConnected) return;
  if (!apoyo.personas) return montar(lista, apoyo.falla ? avisoFalla(apoyo.falla) : avisoNegocio(apoyo.r || { success: false, codigo: 'ERROR_INTERNO' }));
  const candidatos = apoyo.personas.filter(p => rolesActivos(p).some(r => r === 'cliente' || r === 'repartidor'));
  const pintar = () => {
    const q = sinTilde(iBus.value.trim());
    const vis = candidatos.filter(p => !q || sinTilde(p.nombre).includes(q) || sinTilde(p.persona_id).includes(q)).slice(0, 50);
    if (!vis.length) return montar(lista, el('p', { class: 'muted', text: 'No hay personas que coincidan.' }));
    montar(lista, vis.map(p => el('button', { type: 'button', class: 'ped-elegir-item', 'data-persona': p.persona_id, onclick: () => {
      const f = FECHA_RE.test(iFecha.value) ? iFecha.value : estado.fecha; estado.fecha = f; m.cerrar();
      ctx.ir('#/admin/pedidos/persona/' + encodeURIComponent(p.persona_id) + '/' + f); } },
      el('span', { class: 'avatar', 'aria-hidden': 'true', text: inicial(p.nombre) }),
      el('span', { class: 'person-id' }, el('span', { class: 'person-name', text: str(p.nombre) || p.persona_id }),
        el('span', { class: 'person-also', text: rolesActivos(p).filter(r => r === 'cliente' || r === 'repartidor').map(r => r === 'cliente' ? 'Cliente' : 'Repartidor').join(' · ') })))));
  };
  iBus.addEventListener('input', pintar);
  pintar();
}

// =====================================================================================
// EXTRAS (pendientes de cualquier fecha)
// =====================================================================================
function vistaExtrasPendientes(ctx, zona) {
  const cuerpo = el('div', { class: 'stack', id: 'extras-pendientes', 'data-estado': 'cargando' });
  const avisosEx = el('div', { class: 'stack', id: 'extras-aviso' });
  // 'Cargar extra para hoy' para cualquier persona (elige persona, rol y productos). Reutiliza solicitar_extra.
  const bCrear = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-crear-extra' }, 'Cargar extra para hoy');
  bCrear.addEventListener('click', conBloqueo(bCrear, async () => {
    montar(avisosEx);
    const apoyo = await cargarApoyo(ctx);
    if (!apoyo.personas || !apoyo.productos) return montar(avisosEx, apoyo.falla ? avisoFalla(apoyo.falla, () => bCrear.click()) : avisoNegocio(apoyo.r || { success: false, codigo: 'ERROR_INTERNO' }));
    abrirCrearExtra(ctx, apoyo, null, async (r) => { montar(avisosEx, avisoNegocio(r)); await cargar(); });
  }, 'Abriendo…'));
  montar(zona, el('div', { class: 'row' }, el('p', { class: 'muted small', text: 'Extras por aprobar, con entrega pendiente o con el cargo pendiente de generar, de cualquier fecha. Los extras no entran en Producción.' }), el('span', { class: 'spacer' }), bCrear), avisosEx, cuerpo);
  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'extras_admin', { modo: 'pendientes' });
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success || res.r.codigo !== 'EXTRAS_ADMIN_OK') return montar(cuerpo, avisoNegocio(res.r));
    const d = res.r.datos;
    const rs = d.resumen || {};
    const resumen = el('div', { class: 'ped-resumen', id: 'extras-resumen' },
      el('span', { class: 'ped-res-item', 'data-res': 'solicitados' }, el('strong', { text: String(rs.solicitados || 0) }), ' por aprobar'),
      el('span', { class: 'ped-res-item', 'data-res': 'entrega' }, el('strong', { text: String(rs.entrega_pendiente || 0) }), ' con entrega pendiente'),
      el('span', { class: 'ped-res-item', 'data-res': 'finanzas' }, el('strong', { text: String(rs.finanzas_pendientes || 0) }), ' con cargo pendiente'),
      el('span', { class: 'ped-res-item', 'data-res': 'revision' }, el('strong', { text: String(rs.requiere_revision || 0) }), ' requieren revisión'));
    if (!d.extras.length) return montar(cuerpo, resumen, el('div', { class: 'card empty', 'data-vacio': 'true' }, el('span', { class: 'empty-ico', 'aria-hidden': 'true' }), el('p', { text: 'No hay extras pendientes.' })));
    montar(cuerpo, resumen, d.truncado ? aviso('info', 'Se muestran los primeros 200 extras pendientes.') : null,
      el('div', { class: 'stack', id: 'lista-extras' }, d.extras.map(x => tarjetaExtra(ctx, x, { conPersona: true, alCambiar: cargar }))));
  }
  cargar();
}

// Tarjeta de un extra con sus acciones según el estado que devolvió el backend.
function tarjetaExtra(ctx, x, opciones) {
  const { conPersona, alCambiar } = opciones || {};
  const zona = el('div', { class: 'stack', 'data-extra-aviso': x.pedido_id });
  const acciones = [];
  const boton = (id, texto, clase, fn) => { const b = el('button', { type: 'button', class: 'btn btn-sm ' + clase, 'data-accion': id }, texto); b.addEventListener('click', () => { montar(zona); fn(); }); acciones.push(b); };
  const tras = async (r) => { toast(OK_TXT[r.codigo] || 'Listo.'); if (alCambiar) await alCambiar(); };
  if (x.estado === 'solicitado') {
    boton('aprobar-extra', 'Aprobar', 'btn-primary', () => abrirAprobar(ctx, x, tras));
    boton('rechazar-extra', 'Rechazar', 'btn-danger', () => abrirRechazar(ctx, x, tras));
  }
  if (x.estado === 'aprobado_entrega_pendiente') boton('registrar-entrega', 'Registrar entrega', 'btn-primary', () => abrirEntrega(ctx, x, tras));
  // Cancelar: pendiente, o aprobado SIN entrega y SIN cargo (con entrega o cargo no hay cancelacion simple; el backend lo vuelve a verificar).
  if (x.estado === 'solicitado' || (x.estado === 'aprobado_entrega_pendiente' && x.finanzas === 'no_corresponde'))
    boton('cancelar-extra', x.estado === 'solicitado' ? 'Cancelar' : 'Cancelar extra', 'btn-ghost', () => abrirCancelarExtra(ctx, x, tras));
  if (x.estado !== 'requiere_revision' && x.finanzas === 'pendiente_de_generar') {
    const b = el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'recuperar-finanzas' }, 'Generar cargo pendiente');
    b.addEventListener('click', conBloqueo(b, async () => {
      montar(zona);
      if (!(await confirmar('Generar cargo del extra', 'El extra tiene la entrega registrada pero su cargo no se generó. ¿Generarlo ahora? No se duplica si ya existe.', 'Generar cargo'))) return;
      await escribir(ctx, zona, 'recuperar_finanzas_extra', { pedido_id: x.pedido_id }, tras);
    }, 'Generando…'));
    acciones.push(b);
  }
  const lineas = el('div', { class: 'ext-lineas' },
    el('div', { class: 'ext-linea ext-linea-head', 'aria-hidden': 'true' }, el('span', { text: 'Producto' }), el('span', { text: 'Pedido' }), el('span', { text: 'Aprobado' }), el('span', { text: 'Entregado' })),
    (x.lineas || []).map(l => el('div', { class: 'ext-linea', 'data-linea': l.linea_id || '' },
      el('span', { class: 'ext-prod' }, str(l.producto) || 'Producto ' + (l.producto_id || ''), str(l.detalle_libre) ? el('span', { class: 'muted small', text: ' · ' + l.detalle_libre }) : null),
      el('span', null, el('span', { class: 'pc-label', text: 'Pedido: ' }), cant(l.cantidad_solicitada, l.unidad)),
      el('span', null, el('span', { class: 'pc-label', text: 'Aprobado: ' }), l.cantidad_aprobada == null ? '—' : cant(l.cantidad_aprobada, l.unidad)),
      el('span', null, el('span', { class: 'pc-label', text: 'Entregado: ' }), l.cantidad_entregada == null ? '—' : cant(l.cantidad_entregada, l.unidad)))));
  const meta = [fmtCorta(x.fecha_entrega), x.rol_pedido === 'repartidor' ? 'Pedido de repartidor' : 'Pedido de cliente', x.cargado_por_golden ? 'Cargado por Golden' : 'Pedido por la persona',
    x.modo_entrega ? (x.modo_entrega === 'retiro' ? 'Retiro' : 'Entrega') : null].filter(Boolean).join(' · ');
  return el('div', { class: 'card stack ext-card', 'data-extra': x.pedido_id, 'data-estado-extra': x.estado },
    el('div', { class: 'card-head ext-head' },
      el('div', { class: 'ext-titulo' },
        conPersona ? el('a', { class: 'person-name ext-persona', href: '#/admin/pedidos/persona/' + encodeURIComponent(x.persona_id) + '/' + x.fecha_entrega, text: x.nombre || x.persona_id }) : el('strong', { text: 'Extra' }),
        el('span', { class: 'muted small', text: meta })),
      el('span', { class: 'spacer' }), el('span', { class: 'chips' }, chipExtra(x.estado), chipFin(x.finanzas))),
    x.estado === 'requiere_revision' ? el('div', { class: 'notice info small', 'data-revision': (x.revision_motivos || []).join(',') },
      'Los datos de este extra no cierran con el circuito y no se pueden operar desde acá. Motivo: ' + ((x.revision_motivos || []).join(', ') || 'sin detalle') + '.') : null,
    x.motivo_rechazo ? el('p', { class: 'small', text: 'Motivo del rechazo: ' + x.motivo_rechazo }) : null,
    x.estado === 'anulado' ? el('p', { class: 'small', 'data-motivo-anulacion': 'true', text: (x.anulado_por_golden === false ? 'Cancelado por la persona' : 'Cancelado por Golden') + (x.motivo_anulacion ? ' · Motivo: ' + x.motivo_anulacion : '') }) : null,
    lineas,
    acciones.length ? el('div', { class: 'row ext-acciones' }, acciones) : null,
    zona);
}

function filaCantidad(id, etiqueta, valor, max) {
  const i = el('input', { class: 'input input-num', id, type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: valor == null ? '' : String(valor), max: max == null ? null : String(max) });
  return { input: i, nodo: el('div', { class: 'field ext-campo' }, el('label', { for: id, text: etiqueta }), i) };
}
const leerNum = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return NaN; return Number(t.replace(',', '.')); };

function abrirAprobar(ctx, x, alExito) {
  const filas = (x.lineas || []).map((l, k) => ({ l, f: filaCantidad('aprobar-' + k, (str(l.producto) || 'Producto') + ' — pedido ' + cant(l.cantidad_solicitada, l.unidad), l.cantidad_solicitada, l.cantidad_solicitada) }));
  const zona = el('div', { class: 'stack', id: 'aprobar-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-aprobar' }, 'Aprobar extra');
  const form = el('form', { class: 'stack', novalidate: true },
    el('p', { class: 'muted small', text: 'Indicá cuánto se aprueba de cada producto (mayor que 0 y hasta lo pedido).' }), filas.map(x2 => x2.f.nodo), b, zona);
  const m = modal('Aprobar extra — ' + (x.nombre || ''), form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const lineas = filas.map(({ l, f }) => ({ linea_id: l.linea_id, cantidad_aprobada: leerNum(f.input.value) }));
    if (lineas.some(l => !(l.cantidad_aprobada > 0))) return montar(zona, aviso('error', 'Cada producto necesita una cantidad aprobada mayor que 0. Si no se puede aprobar, rechazá el extra.'));
    await escribir(ctx, zona, 'aprobar_extra', { pedido_id: x.pedido_id, lineas }, async (r) => { m.cerrar(); await alExito(r); });
  }, 'Aprobando…'));
}

function abrirRechazar(ctx, x, alExito) {
  const t = el('textarea', { class: 'input', id: 'rechazo-motivo', maxlength: '300', rows: '3', placeholder: 'Ej.: sin stock para reposición hoy' });
  const zona = el('div', { class: 'stack', id: 'rechazo-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-danger', id: 'btn-rechazar' }, 'Rechazar extra');
  const form = el('form', { class: 'stack', novalidate: true }, el('div', { class: 'field' }, el('label', { for: 'rechazo-motivo', text: 'Motivo del rechazo (lo ve la persona)' }), t), b, zona);
  const m = modal('Rechazar extra — ' + (x.nombre || ''), form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const motivo = t.value.trim();
    if (!motivo) return montar(zona, aviso('error', 'Escribí el motivo del rechazo.'));
    await escribir(ctx, zona, 'rechazar_extra', { pedido_id: x.pedido_id, motivo_rechazo: motivo }, async (r) => { m.cerrar(); await alExito(r); });
  }, 'Rechazando…'));
}

function abrirCancelarExtra(ctx, x, alExito) {
  const t = el('textarea', { class: 'input', id: 'cancelar-extra-motivo', maxlength: '300', rows: '3', placeholder: 'Ej.: lo pidió por error / no hay stock' });
  const zona = el('div', { class: 'stack', id: 'cancelar-extra-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-danger', id: 'btn-cancelar-extra' }, 'Cancelar extra');
  const form = el('form', { class: 'stack', novalidate: true },
    el('p', { class: 'muted small', text: 'El extra queda cancelado: no se entrega ni se cobra. Se conservan las cantidades y el precio como historial.' }),
    el('div', { class: 'field' }, el('label', { for: 'cancelar-extra-motivo', text: 'Motivo de la cancelación (lo ve la persona)' }), t), b, zona);
  const m = modal('Cancelar extra — ' + (x.nombre || ''), form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const motivo = t.value.trim();
    if (!motivo) return montar(zona, aviso('error', 'Escribí el motivo de la cancelación.'));
    await escribir(ctx, zona, 'cancelar_extra', { pedido_id: x.pedido_id, motivo_anulacion: motivo }, async (r) => { m.cerrar(); await alExito(r); });
  }, 'Cancelando…'));
}

function abrirEntrega(ctx, x, alExito) {
  const sModo = el('select', { class: 'select', id: 'entrega-modo' }, el('option', { value: 'entrega', text: 'Entrega' }), el('option', { value: 'retiro', text: 'Retiro en Golden' }));
  const filas = (x.lineas || []).map((l, k) => ({ l, f: filaCantidad('entrega-' + k, (str(l.producto) || 'Producto') + ' — aprobado ' + cant(l.cantidad_aprobada, l.unidad), l.cantidad_aprobada, l.cantidad_aprobada) }));
  const zona = el('div', { class: 'stack', id: 'entrega-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-entrega' }, 'Registrar entrega');
  const form = el('form', { class: 'stack', novalidate: true },
    el('div', { class: 'field' }, el('label', { for: 'entrega-modo', text: 'Cómo se entregó' }), sModo),
    el('p', { class: 'muted small', text: 'Cantidad realmente entregada de cada producto (0 si no se entregó). Si es menos de lo aprobado queda como entrega parcial.' }),
    filas.map(x2 => x2.f.nodo), b, zona);
  const m = modal('Registrar entrega — ' + (x.nombre || ''), form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const lineas = filas.map(({ l, f }) => ({ linea_id: l.linea_id, cantidad_entregada: leerNum(f.input.value) }));
    if (lineas.some(l => !(l.cantidad_entregada >= 0))) return montar(zona, aviso('error', 'Indicá una cantidad entregada (0 o más) para cada producto.'));
    const total = lineas.every(l => l.cantidad_entregada === 0) ? 'no entregado' : (lineas.every((l, k) => l.cantidad_entregada === filas[k].l.cantidad_aprobada) ? 'completa' : 'parcial');
    if (!(await confirmar('Confirmar entrega', 'Se registrará la entrega como ' + total + '. Después no se puede modificar desde acá. ¿Confirmás?', 'Registrar'))) return;
    await escribir(ctx, zona, 'registrar_entrega', { pedido_id: x.pedido_id, modo_entrega: sModo.value, lineas }, async (r) => { m.cerrar(); await alExito(r); });
  }, 'Registrando…'));
}

// =====================================================================================
// EDITOR DE LÍNEAS (productos del catálogo; solo id, nombre y unidad)
// =====================================================================================
// ---------- 'Cargar extra para hoy' (Admin General) ----------
// Reutiliza solicitar_extra (Extras PROD): con actor Admin el extra queda aprobado, entrega pendiente y sin cargo; siempre para HOY (Reglas).
// Se envia SOLO persona_id, rol_pedido, fecha_entrega (hoy) y lineas {producto_id, cantidad, detalle_libre}. Nunca precio, lista, estado ni actor.
// El precio que se muestra es la referencia ACTUAL del catalogo (misma regla que Reglas condicion_comercial); el que vale lo congela el backend.
const listaDe = (persona, rol) => rol === 'repartidor' ? 'mayorista' : (persona && ['minorista', 'mayorista'].includes(persona.lista_precio) ? persona.lista_precio : null);
const catalogoExtra = (productos, rol, lista) => (productos || []).filter(p => p.activo && (rol === 'repartidor' ? p.visible_repartidores : p.visible_clientes)
  && typeof (lista === 'mayorista' ? p.precio_mayorista : p.precio_minorista) === 'number');
function abrirCrearExtra(ctx, apoyo, ini, alExito) {
  const conRol = (p) => rolesActivos(p).filter(r => r === 'cliente' || r === 'repartidor');
  const candidatas = (apoyo.personas || []).filter(p => conRol(p).length).sort((a, b) => (str(a.nombre) || '').localeCompare(str(b.nombre) || '', 'es'));
  let persona = ini && ini.persona ? ini.persona : null;
  let rol = ini && ini.rol ? ini.rol : null;
  let ed = null;
  const sPer = persona ? null : el('select', { class: 'select', id: 'extra-persona' }, el('option', { value: '', text: 'Elegí la persona…' }),
    candidatas.map(p => el('option', { value: p.persona_id, text: (str(p.nombre) || p.persona_id) })));
  const sRol = el('select', { class: 'select', id: 'extra-rol' });
  const campoRol = el('div', { class: 'field' }, el('label', { for: 'extra-rol', text: 'Rol del pedido' }), sRol);
  const zonaEd = el('div', { class: 'stack', id: 'extra-editor' });
  const resumen = el('div', { class: 'stack', id: 'extra-resumen', 'aria-live': 'polite' });
  const zona = el('div', { class: 'stack', id: 'extra-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-extra' }, 'Crear extra');
  let cat = [], lista = null;
  const pintarResumen = () => {
    if (!ed) return montar(resumen);
    const filas = ed.borrador().map(l => { const p = cat.find(x => x.producto_id === l.producto_id); const pu = p ? (lista === 'mayorista' ? p.precio_mayorista : p.precio_minorista) : null;
      return { p, l, pu, imp: (pu !== null && l.cantidad > 0) ? Math.round(l.cantidad * pu * 100) / 100 : null }; });
    if (!filas.length) return montar(resumen);
    const total = filas.every(f => f.imp !== null) ? Math.round(filas.reduce((s2, f) => s2 + f.imp, 0) * 100) / 100 : null;
    montar(resumen, el('div', { class: 'notice info small', 'data-precios': 'referencia' },
      el('p', { class: 'small', text: 'Precio actual del catálogo (' + (lista === 'mayorista' ? 'mayorista' : 'minorista') + '), solo como referencia. Al crear el extra el precio queda congelado y no cambia aunque después cambie el catálogo.' }),
      filas.map(f => el('div', { class: 'small', 'data-ref-producto': String(f.l.producto_id) },
        (f.p ? (f.p.producto || 'Producto') : 'Producto') + ' — ' + (f.l.cantidad > 0 ? cant(f.l.cantidad, f.p && f.p.unidad) : 'sin cantidad') + ' × ' + pesos(f.pu) + (f.imp !== null ? ' = ' + pesos(f.imp) : ''))),
      el('p', { class: 'small', 'data-total-estimado': total === null ? '' : String(total) }, el('strong', { text: 'Total estimado: ' }), total === null ? '—' : pesos(total))));
  };
  const armarEditor = () => {
    ed = null; montar(zona);
    if (!persona) { montar(zonaEd, el('p', { class: 'muted small', text: 'Elegí la persona para ver su catálogo.' })); return pintarResumen(); }
    lista = listaDe(persona, rol);
    if (!lista) { montar(zonaEd, aviso('error', 'La persona no tiene una lista de precios válida. Revisala en Clientes antes de cargar el extra.')); return pintarResumen(); }
    cat = catalogoExtra(apoyo.productos, rol, lista);
    if (!cat.length) { montar(zonaEd, aviso('error', 'No hay productos disponibles para el catálogo de ' + (rol === 'repartidor' ? 'repartidores' : 'clientes') + '.')); return pintarResumen(); }
    const e2 = editorLineas(cat, [], { idBase: 'ext', alCambiar: () => pintarResumen() });
    ed = e2; montar(zonaEd, e2.nodo); pintarResumen();
  };
  const armarRoles = () => {
    const roles = persona ? conRol(persona) : [];
    if (!roles.includes(rol)) rol = roles.includes('cliente') ? 'cliente' : (roles[0] || null);
    montar(sRol, roles.map(r => el('option', { value: r, text: r === 'cliente' ? 'Como cliente' : 'Como repartidor' })));
    if (rol) sRol.value = rol;
    campoRol.hidden = roles.length < 2;
    armarEditor();
  };
  if (sPer) sPer.addEventListener('change', () => { persona = candidatas.find(p => p.persona_id === sPer.value) || null; armarRoles(); });
  sRol.addEventListener('change', () => { rol = sRol.value; armarEditor(); });
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('p', { class: 'muted small', text: 'Extra de reposición para hoy (' + fmtMin(hoyART()) + '). Cargado por Golden queda aprobado, con la entrega pendiente y sin cargo hasta registrar la entrega. No entra en Producción.' }),
    sPer ? el('div', { class: 'field' }, el('label', { for: 'extra-persona', text: 'Persona' }), sPer) : null,
    campoRol, zonaEd, resumen, b, zona);
  const m = modal('Cargar extra para hoy' + (persona ? ' — ' + (str(persona.nombre) || persona.persona_id) : ''), form);
  armarRoles();
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    if (!persona) return montar(zona, aviso('error', 'Elegí la persona.'));
    if (!ed) return montar(zona, aviso('error', 'No se puede cargar el extra para esta persona.'));
    const l = ed.leer();
    if (l.error) return montar(zona, aviso('error', l.error));
    const prods = l.lineas.map(x => x.producto_id);
    if (new Set(prods).size !== prods.length) return montar(zona, aviso('error', 'Hay un producto repetido: juntalo en una sola línea.'));
    const lineas = l.lineas.map(x => { const o = { producto_id: x.producto_id, cantidad: x.cantidad }; if (x.detalle_libre) o.detalle_libre = x.detalle_libre; return o; });
    await escribir(ctx, zona, 'solicitar_extra', { persona_id: persona.persona_id, rol_pedido: rol, fecha_entrega: hoyART(), lineas }, async (r) => {
      m.cerrar(); toast(OK_TXT[r.codigo] || 'Listo.'); await alExito(r, persona);
    });
  }, 'Creando…'));
}

function editorLineas(productos, iniciales, cfg) {
  const { conDia, conSalida, reps, idBase, alCambiar } = cfg;
  const activos = productos.filter(p => p.activo).sort((a, b) => (a.producto || '').localeCompare(b.producto || '', 'es'));
  const cont = el('div', { class: 'stack lin-editor', id: idBase + '-lineas' });
  const filas = [];
  const agregar = (ini) => {
    const k = filas.length ? Math.max(...filas.map(f => f.k)) + 1 : 0;
    const sProd = el('select', { class: 'select', id: idBase + '-prod-' + k, 'aria-label': 'Producto' }, el('option', { value: '', text: 'Elegí un producto…' }),
      activos.map(p => el('option', { value: String(p.producto_id), text: (p.producto || 'Producto ' + p.producto_id) + (p.unidad ? ' (' + p.unidad + ')' : '') })));
    if (ini && Number.isInteger(ini.producto_id)) { if (!activos.some(p => p.producto_id === ini.producto_id)) sProd.appendChild(el('option', { value: String(ini.producto_id), text: (ini.producto || 'Producto ' + ini.producto_id) + ' (inactivo)' })); sProd.value = String(ini.producto_id); }
    const iCant = el('input', { class: 'input input-num', id: idBase + '-cant-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': 'Cantidad', value: ini && typeof ini.cantidad === 'number' ? String(ini.cantidad) : '' });
    const iDet = el('input', { class: 'input', id: idBase + '-det-' + k, maxlength: '200', 'aria-label': 'Aclaración', placeholder: 'Aclaración (opcional)', value: ini && ini.detalle_libre ? ini.detalle_libre : '' });
    const sDia = conDia ? el('select', { class: 'select', id: idBase + '-dia-' + k, 'aria-label': 'Día' }, DIAS.map(d => el('option', { value: d, text: DIA_TXT[d] }))) : null;
    if (sDia && ini && ini.dia_semana) sDia.value = ini.dia_semana;
    const sSal = conSalida ? el('select', { class: 'select', id: idBase + '-sal-' + k, 'aria-label': 'Salida' }, el('option', { value: '', text: 'Sin salida' }), SALIDAS.map(s => el('option', { value: s, text: salidaTxt(s) }))) : null;
    const sRep = conSalida ? el('select', { class: 'select', id: idBase + '-rep-' + k, 'aria-label': 'Repartidor' }, el('option', { value: '', text: 'Sin repartidor' }), (reps || []).map(p => el('option', { value: p.persona_id, text: p.nombre || p.persona_id }))) : null;
    const quitar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'quitar-linea' }, 'Quitar');
    const nodo = el('div', { class: 'lin-fila' + (conDia ? ' con-dia' : '') + (conSalida ? ' con-salida' : ''), 'data-fila': String(k) }, sDia, sProd, iCant, iDet, sSal, sRep, quitar);
    const f = { k, nodo, sProd, iCant, iDet, sDia, sSal, sRep };
    quitar.addEventListener('click', () => { if (filas.length <= 1) return; filas.splice(filas.indexOf(f), 1); nodo.remove(); if (alCambiar) alCambiar(); });
    filas.push(f);
    cont.insertBefore(nodo, bAgregar);
    if (alCambiar) alCambiar();
  };
  const bAgregar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: idBase + '-agregar', 'data-accion': 'agregar-linea', onclick: () => agregar(null) }, 'Agregar producto');
  cont.appendChild(bAgregar);
  for (const i of (iniciales && iniciales.length ? iniciales : [null])) agregar(i);
  const leer = () => {
    const out = [];
    for (const f of filas) {
      const pid = Number(f.sProd.value);
      if (!Number.isInteger(pid) || pid <= 0) return { error: 'Elegí el producto de cada línea.' };
      const q = leerNum(f.iCant.value);
      if (!(q > 0)) return { error: 'Cada línea necesita una cantidad mayor que 0.' };
      const o = { producto_id: pid, cantidad: q };
      const det = f.iDet.value.trim(); if (det) o.detalle_libre = det;
      if (conDia) o.dia_semana = f.sDia.value;
      if (conSalida) {
        const prod = productos.find(p => p.producto_id === pid); if (prod && prod.unidad) o.unidad = prod.unidad;
        o.salida = f.sSal.value || null; o.repartidor_persona_id = f.sRep.value || null;
      }
      out.push(o);
    }
    return { lineas: out };
  };
  // Borrador para mostrar referencias (no valida ni bloquea): lineas con producto elegido y su cantidad tal como esta.
  const borrador = () => filas.map(f => ({ producto_id: Number(f.sProd.value), cantidad: leerNum(f.iCant.value) })).filter(l => Number.isInteger(l.producto_id) && l.producto_id > 0);
  if (alCambiar) { cont.addEventListener('input', alCambiar); cont.addEventListener('change', alCambiar); }
  return { nodo: cont, leer, borrador };
}

// =====================================================================================
// DETALLE DE UNA PERSONA EN UNA FECHA
// =====================================================================================
export function vistaPersonaPedido(ctx, cont, pidTexto, fechaTexto) {
  const pid = PID.test(pidTexto || '') ? pidTexto : null;
  const fecha = FECHA_RE.test(fechaTexto || '') ? fechaTexto : sumarDias(hoyART(), 1);
  const avisos = el('div', { class: 'stack', id: 'pp-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'ped-ficha', 'data-persona': pidTexto || '', 'data-fecha': fecha, 'data-estado': 'cargando' });
  montar(cont, el('a', { class: 'btn btn-ghost btn-sm btn-back', href: '#/admin/pedidos' }, 'Volver a pedidos'), avisos, cuerpo);
  if (!pid) { cuerpo.dataset.estado = 'listo'; return montar(cuerpo, aviso('error', 'Persona inválida.', 'PERSONA_ID_INVALIDO')); }
  estado.fecha = fecha;
  let apoyo = null, persona = null, rol = null;

  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    apoyo = await cargarApoyo(ctx);
    if (!cuerpo.isConnected) return;
    if (!apoyo.personas || !apoyo.productos) { cuerpo.dataset.estado = 'listo'; return montar(cuerpo, apoyo.falla ? avisoFalla(apoyo.falla, cargar) : avisoNegocio(apoyo.r || { success: false, codigo: 'ERROR_INTERNO' })); }
    persona = apoyo.personas.find(p => p.persona_id === pid) || null;
    const roles = rolesActivos(persona).filter(r => r === 'cliente' || r === 'repartidor');
    if (!rol || !roles.includes(rol)) rol = roles.includes('cliente') ? 'cliente' : (roles[0] || 'cliente');
    pintarFicha(roles);
  }

  function pintarFicha(roles) {
    const nombre = persona ? (str(persona.nombre) || pid) : pid;
    const iFecha = el('input', { class: 'input', id: 'pp-fecha', type: 'date', value: fecha, 'aria-label': 'Fecha' });
    iFecha.addEventListener('change', () => { if (FECHA_RE.test(iFecha.value)) ctx.ir('#/admin/pedidos/persona/' + encodeURIComponent(pid) + '/' + iFecha.value); });
    const rolTabs = roles.length > 1 ? el('div', { class: 'ped-tabs', role: 'tablist', 'aria-label': 'Rol del pedido' }, roles.map(r => {
      const b = el('button', { type: 'button', class: 'btn btn-sm ' + (r === rol ? 'btn-primary' : 'btn-ghost'), role: 'tab', 'aria-selected': String(r === rol), 'data-rol': r }, r === 'cliente' ? 'Pedido como cliente' : 'Pedido como repartidor');
      b.addEventListener('click', () => { rol = r; pintarFicha(roles); });
      return b;
    })) : null;
    const cab = el('div', { class: 'card stack', id: 'pp-datos' },
      el('div', { class: 'card-head ficha-head' }, el('span', { class: 'avatar avatar-lg', 'aria-hidden': 'true', text: inicial(nombre) }),
        el('div', { class: 'ficha-title' }, el('h2', { id: 'pp-nombre', text: nombre }),
          el('span', { class: 'ficha-sub', text: (roles.map(r => r === 'cliente' ? 'Cliente' : 'Repartidor').join(' · ') || 'Sin rol de cliente ni repartidor activo') + ' · ID: ' + pid }))),
      el('div', { class: 'ped-fecha-bar' }, el('label', { for: 'pp-fecha', class: 'ped-fecha-label', text: 'Fecha de entrega' }), iFecha, el('span', { class: 'ped-fecha-txt', text: fmtFecha(fecha) })),
      rolTabs,
      !persona ? aviso('error', 'La persona no figura en el listado de clientes y repartidores.', 'PERSONA_NO_ENCONTRADA') : null);
    const zPedido = el('div', { class: 'card stack', id: 'pp-pedido', 'data-estado': 'cargando' }, el('div', { class: 'skeleton' }));
    const zHab = el('div', { class: 'card stack', id: 'pp-habitual', 'data-estado': 'cargando' }, el('div', { class: 'skeleton' }));
    const zExt = el('div', { class: 'card stack', id: 'pp-extras', 'data-estado': 'cargando' }, el('div', { class: 'skeleton' }));
    montar(cuerpo, cab, zPedido, zHab, zExt);
    cuerpo.dataset.estado = 'listo';
    cargarPedido(zPedido); cargarHabitual(zHab); cargarExtras(zExt);
  }

  // ---- pedido de la fecha (regla consolidada del backend) ----
  async function cargarPedido(z) {
    z.dataset.estado = 'cargando';
    const [a, b] = await Promise.all([ctx.pedir(TIPO, 'pedido_persona', { persona_id: pid, fecha, rol_pedido: rol }), ctx.pedir(TIPO, 'pedidos_fecha', { fecha })]);
    if (!z.isConnected) return;
    z.dataset.estado = 'listo';
    for (const x of [a, b]) if (x.r && ctx.revisarFinSesion(x.r)) return;
    const renglones = b.r && b.r.success && b.r.datos ? b.r.datos.renglones.filter(r => r.persona_id === pid) : [];
    const sal = [...new Set(renglones.map(r => r.salida).filter(Boolean))].map(salidaTxt).join(', ');
    const rep = [...new Set(renglones.map(r => r.repartidor_persona_id).filter(Boolean))].map(id => nombreDe(apoyo, id)).join(', ');
    const head = el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-pedido', text: 'Pedido del ' + fmtMin(fecha) }));
    const salRep = el('p', { class: 'small', id: 'pp-salida' }, el('strong', { text: 'Salida: ' }), sal || 'Sin asignar', ' · ', el('strong', { text: 'Repartidor: ' }), rep || 'Sin asignar');
    if (a.falla) return montar(z, head, avisoFalla(a.falla, () => cargarPedido(z)));
    const r = a.r;
    if (!r.success && r.codigo === 'FECHA_INVALIDA') {
      // Fecha pasada: solo consulta, con lo que produjo la regla consolidada para esa fecha.
      return montar(z, head, el('div', { class: 'notice info', 'data-solo-consulta': 'true' }, 'Fecha pasada: solo consulta. No se pueden cargar ni modificar pedidos normales.'),
        renglones.length ? el('div', { class: 'chips' }, chipOrigen(renglones[0].origen)) : null,
        listaLineas(renglones), salRep);
    }
    if (!r.success) return montar(z, head, avisoNegocio(r));
    const d = r.datos;
    z.dataset.origen = d.origen || '';
    z.dataset.modificable = String(d.modificable === true);
    const motivo = d.modificable ? null : (MSJ[d.motivo_no_modificable] || 'No se puede modificar en este momento.');
    const bCargar = d.modificable && persona ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-pedido-normal', 'data-accion': 'cargar-pedido-normal',
      onclick: () => abrirPedidoNormal(z, d, () => cargarPedido(z)) }, d.origen === 'sin_pedido' ? 'Cargar pedido para esta fecha' : 'Cambiar el pedido de esta fecha') : null;
    const excepcionVacia = d.origen === 'solo_por_hoy' && d.sin_entrega === true;
    const recargarPedido = () => cargarPedido(z);
    const bHoyNo = d.modificable && persona && d.tiene_habitual && !excepcionVacia ? botonFecha('btn-hoy-no-pedir', 'Hoy no pedir', 'hoy_no_pedir', 'Hoy no pedir',
      'Ese día la persona no recibe su habitual. El habitual de los demás días no cambia.', 'Sí, no pedir ese día', recargarPedido) : null;
    const bVolver = d.modificable && persona && d.origen === 'solo_por_hoy' ? botonFecha('btn-volver-habitual', 'Volver al habitual', 'anular_pedido_fecha', 'Volver al habitual',
      'Se anula el cambio de esta fecha y la persona vuelve a recibir su habitual.', 'Volver al habitual', recargarPedido) : null;
    const bCancelar = d.modificable && persona && d.origen === 'pedido_nuevo_no_recurrente' && !d.tiene_habitual ? botonFecha('btn-cancelar-pedido', 'Cancelar pedido', 'anular_pedido_fecha', 'Cancelar pedido',
      'Se anula el pedido de esta fecha. La persona no recibe nada ese día.', 'Sí, cancelar pedido', recargarPedido) : null;
    montar(z, el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-pedido', text: 'Pedido del ' + fmtMin(fecha) }), el('span', { class: 'spacer' }), bCargar, bHoyNo, bVolver, bCancelar),
      el('div', { class: 'chips' }, chipOrigen(d.origen), d.modificable ? el('span', { class: 'chip ok', 'data-modificable': 'true', text: 'Se puede modificar' }) : el('span', { class: 'chip off', 'data-modificable': 'false', text: 'No modificable' }),
        Number.isInteger(d.version_nro) ? el('span', { class: 'chip', text: 'Versión ' + d.version_nro }) : null),
      motivo ? el('div', { class: 'notice info', 'data-codigo': d.motivo_no_modificable }, motivo, el('span', { class: 'code', text: d.motivo_no_modificable || '' })) : null,
      excepcionVacia ? el('p', { class: 'small', 'data-hoy-no-pedir': 'true', text: '“Hoy no pedir”: para esta fecha la persona no recibe productos. El habitual no cambia.' })
        : d.sin_entrega ? el('p', { class: 'small', text: 'Para esta fecha la persona no recibe productos (cantidades en 0).' }) : null,
      d.origen === 'sin_pedido' ? el('p', { class: 'muted', text: 'No tiene pedido para esta fecha.' }) : excepcionVacia ? null : listaLineas(d.lineas),
      (d.avisos || []).map(x => el('div', { class: 'notice info small', 'data-codigo': x.codigo }, x.codigo === 'PEDIDO_NUEVO_CON_RECURRENTE' ? 'Hay un pedido nuevo cargado que no se toma porque la persona tiene habitual ese día.'
        : x.codigo === 'SOLO_POR_HOY_SIN_RECURRENTE' ? 'Hay un “solo por hoy” cargado que no se toma porque la persona no tiene habitual ese día.' : x.codigo)),
      salRep,
      el('p', { class: 'muted small', text: 'Salida y repartidor salen del habitual y solo los define Golden.' }));
  }
  function listaLineas(ls) {
    if (!ls || !ls.length) return el('p', { class: 'muted', text: 'Sin productos.' });
    return el('ul', { class: 'pp-lineas' }, ls.map(l => el('li', { 'data-producto': String(l.producto_id || '') },
      el('span', { class: 'pp-prod', text: str(l.producto) || str(l.detalle_libre) || 'Producto' }), el('span', { class: 'pp-cant', text: cant(l.cantidad, l.unidad) }),
      str(l.detalle_libre) && str(l.producto) ? el('span', { class: 'muted small', text: l.detalle_libre }) : null)));
  }
  // Acción de la fecha (hoy_no_pedir / anular_pedido_fecha) sobre la persona y el rol elegidos: confirmación → escritura idempotente → recarga.
  function botonFecha(id, texto, accion, titulo, pregunta, etiqueta, alExito) {
    const b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id, 'data-accion': id.replace(/^btn-/, '') }, texto);
    b.addEventListener('click', conBloqueo(b, async () => {
      if (!(await confirmar(titulo + ' — ' + (persona.nombre || pid) + ' · ' + fmtCorta(fecha), pregunta, etiqueta))) return;
      montar(avisos);
      await escribir(ctx, avisos, accion, { persona_id: pid, rol_pedido: rol, fecha }, async (r) => { montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await alExito(); });
    }, 'Enviando…'));
    return b;
  }
  // Cargar / cambiar el pedido de la fecha con el catálogo + carrito, dentro de la tarjeta del pedido. Se guarda igual que antes:
  // crear_pedido_normal { persona_id, rol_pedido, fecha, items } (el backend decide el tipo: solo por hoy / pedido nuevo).
  function abrirPedidoNormal(z, d, alExito) {
    montar(avisos);
    const iniciales = d.origen === 'sin_pedido' ? [] : (d.lineas || []).filter(l => Number.isInteger(l.producto_id));
    const arm = armadorPedido({
      productos: productosArmador(apoyo), iniciales, conservarIniciales: true, mostrarPrecios: false,
      titulo: 'Pedido del ' + fmtCorta(fecha), textoEnviar: 'Guardar pedido', idEnviar: 'btn-guardar-pedido', idAviso: 'pn-aviso',
      avisoDia: (d.tiene_habitual
        ? 'Tiene habitual este día: se guarda como “solo por hoy” y reemplaza el habitual únicamente para el ' + fmtMin(fecha) + '.'
        : 'No tiene habitual este día: se guarda como pedido nuevo para el ' + fmtMin(fecha) + '.') + ' Se puede cambiar hasta las 22:00 del día anterior.',
      cargarFoto: cargadorFotosAdmin(ctx, apoyo), alCancelar: alExito,
      alEnviar: (items, zona) => escribir(ctx, zona, 'crear_pedido_normal', { persona_id: pid, rol_pedido: rol, fecha, items }, async (r) => {
        montar(avisos, avisoNegocio(r));
        toast((OK_TXT[r.codigo] || 'Listo.') + (r.datos && r.datos.tipo_operacion ? ' (' + (ORIGEN_TXT[r.datos.tipo_operacion] || r.datos.tipo_operacion) + ')' : ''));
        await alExito();
      }),
    });
    z.dataset.estado = 'editando';
    montar(z, el('div', { class: 'stack arm-marco', id: 'pn-form' },
      el('div', { class: 'arm-intro' }, el('h3', { class: 'arm-titulo', text: 'Pedido de ' + (persona.nombre || pid) + ' — ' + fmtCorta(fecha) }),
        el('p', { class: 'muted small', text: 'Elegí productos y cantidades. El sistema confirma el tipo al guardar; cada cambio queda como una versión nueva.' })),
      arm.nodo));
    z.scrollIntoView({ block: 'start' });
  }

  // ---- habitual vigente ----
  async function cargarHabitual(z) {
    z.dataset.estado = 'cargando';
    const res = await ctx.pedir(TIPO, 'habitual_persona', { persona_id: pid });
    if (!z.isConnected) return;
    z.dataset.estado = 'listo';
    const head = (boton) => el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-habitual', text: 'Pedido habitual' }), el('span', { class: 'spacer' }), boton);
    if (res.falla) return montar(z, head(null), avisoFalla(res.falla, () => cargarHabitual(z)));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(z, head(null), avisoNegocio(res.r));
    const d = res.r.datos;
    const recargar = () => cargarHabitual(z);
    if (!d.tiene_habitual) {
      const b = persona ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-configurar-habitual', onclick: () => abrirHabitual(z, 'configurar_recurrente', null, recargar) }, 'Configurar habitual') : null;
      return montar(z, head(b), el('p', { class: 'muted', 'data-habitual': 'no', text: 'No tiene pedido habitual. Recurrente significa “previsto”: no genera deuda.' }));
    }
    const diasConLinea = d.dias.map(x => x.dia);
    const bAgregar = persona && diasConLinea.length < 7 ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-agregar-dia', onclick: () => abrirHabitual(z, 'agregar_dia', diasConLinea, recargar) }, 'Agregar día') : null;
    const dias = d.dias.slice().sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia));
    // 2026-10-08: cancelar = editar_habitual_dia con lista vacía (queda la fila ancla con salida/repartidor; no entra en producción).
    const conProductos = dias.filter(x => x.lineas.some(l => !esAncla(l))).map(x => x.dia);
    const bCancelar = persona && conProductos.length ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-cancelar-habitual', 'data-accion': 'cancelar-habitual' }, 'Cancelar habitual') : null;
    if (bCancelar) {
      const correr = conBloqueo(bCancelar, () => quitarDias(conProductos, recargar), 'Cancelando…');
      bCancelar.addEventListener('click', async () => {
        if (await confirmar('Cancelar habitual', '¿Cancelar el habitual de ' + (persona.nombre || pid) + ' en todos los días (' + conProductos.map(x => (DIA_TXT[x] || x).toLowerCase()).join(', ') + ')? Vale desde la próxima producción abierta. Se conservan salida y repartidor por si se vuelve a armar.', 'Cancelar habitual')) await correr();
      });
    }
    montar(z, head(el('span', { class: 'row' }, bAgregar, bCancelar)),
      el('div', { class: 'hab-dias', 'data-habitual': 'si' }, dias.map(dia => {
        const productos = dia.lineas.filter(l => !esAncla(l));
        const log = logisticaDia(dia.lineas);
        const b = persona ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'editar-dia-habitual', 'data-dia': dia.dia }, 'Editar día') : null;
        if (b) b.addEventListener('click', () => abrirDia(z, dia.dia, productos, log, recargar));
        const bQ = persona && productos.length ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'quitar-dia-habitual', 'data-dia': dia.dia }, 'Quitar día') : null;
        if (bQ) {
          const nd = (DIA_TXT[dia.dia] || dia.dia).toLowerCase();
          const correr = conBloqueo(bQ, () => quitarDias([dia.dia], recargar), 'Quitando…');
          bQ.addEventListener('click', async () => {
            if (await confirmar('Quitar el ' + nd, '¿Quitar el habitual de los ' + nd + ' de ' + (persona.nombre || pid) + '? Los demás días no cambian. Vale desde la próxima producción abierta.', 'Quitar día')) await correr();
          });
        }
        return el('div', { class: 'hab-dia', 'data-dia': dia.dia },
          el('div', { class: 'hab-dia-head' }, el('strong', { text: DIA_TXT[dia.dia] || dia.dia }),
            el('span', { class: 'chips' }, el('span', { class: 'chip', 'data-salida': log.salida || '', text: salidaTxt(log.salida) }),
              el('span', { class: 'chip', 'data-repartidor': log.repartidor_persona_id || '', text: log.repartidor_persona_id ? nombreDe(apoyo, log.repartidor_persona_id) : 'Sin repartidor' }),
              productos.length ? null : el('span', { class: 'chip warn', 'data-ancla': 'true', text: 'Sin productos · no entra en producción' })),
            el('span', { class: 'spacer' }), el('span', { class: 'row' }, b, bQ)),
          productos.map(l => el('div', { class: 'hab-linea', 'data-recurrente': String(l.pedido_recurrente_id) },
            el('span', { class: 'hab-prod' }, el('span', { text: (str(l.producto) || str(l.detalle_libre) || 'Producto') + ' · ' + cant(l.cantidad, l.unidad) }),
              str(l.detalle_libre) && str(l.producto) ? el('span', { class: 'muted small', text: l.detalle_libre }) : null))));
      })),
      el('p', { class: 'muted small', text: 'Los cambios del habitual no se pueden hacer mientras se cierra la producción (desde las 22:00 hasta el cierre). Las fechas ya cerradas no cambian.' }));
  }
  // Quitar días del habitual (uno o todos): editar_habitual_dia con lista vacía, de a un día. Si uno falla se frena y se avisa.
  async function quitarDias(lista, recargar) {
    montar(avisos);
    const zona = el('div', { class: 'stack', id: 'hab-cancelar-aviso' });
    montar(avisos, zona);
    const hechos = [];
    for (const d of lista) {
      const r = await escribir(ctx, zona, 'editar_habitual_dia', { persona_id: pid, dia_semana: d, lineas: [] }, async () => {});
      if (!r || !r.success) {
        if (hechos.length) avisos.insertBefore(aviso('ok', 'Se quitaron: ' + hechos.map(x => (DIA_TXT[x] || x).toLowerCase()).join(', ') + '.'), zona);
        return false;
      }
      hechos.push(d);
    }
    const txt = lista.length > 1 ? 'Habitual cancelado.' : 'Se quitó el habitual de los ' + (DIA_TXT[lista[0]] || lista[0]).toLowerCase() + '.';
    await recargar();
    const zP = document.getElementById('pp-pedido'); if (zP) cargarPedido(zP); // el pedido de la fecha puede venir del habitual
    montar(avisos, aviso('ok', txt + ' Vale desde la próxima producción abierta.', 'HABITUAL_CANCELADO'));
    toast(txt);
    return true;
  }
  // Selects de logística (salida / repartidor) con las mismas opciones de siempre.
  function selectSalida(id, actual) {
    const sS = el('select', { class: 'select', id }, el('option', { value: '', text: 'Sin salida' }), SALIDAS.map(x => el('option', { value: x, text: salidaTxt(x) })));
    if (actual && !SALIDAS.includes(actual)) sS.appendChild(el('option', { value: actual, text: salidaTxt(actual) }));
    sS.value = actual || ''; return sS;
  }
  function selectRepartidor(id, actual) {
    const sR = el('select', { class: 'select', id }, el('option', { value: '', text: 'Sin repartidor' }), repartidores(apoyo).map(p => el('option', { value: p.persona_id, text: str(p.nombre) || p.persona_id })));
    if (actual && !repartidores(apoyo).some(p => p.persona_id === actual)) sR.appendChild(el('option', { value: actual, text: nombreDe(apoyo, actual) }));
    sR.value = actual || ''; return sR;
  }
  const campo = (id, texto, ctrl) => el('div', { class: 'field' }, el('label', { for: id, text: texto }), ctrl);
  const unidadDe = (pid) => { const p = (apoyo.productos || []).find(x => x.producto_id === pid); return p && p.unidad ? p.unidad : null; };
  function marcoHabitual(z, titulo, sub, arm) {
    z.dataset.estado = 'editando';
    montar(z, el('div', { class: 'stack arm-marco', id: 'hab-form' },
      el('div', { class: 'arm-intro' }, el('h3', { class: 'arm-titulo', text: titulo }), el('p', { class: 'muted small', text: sub })), arm.nodo));
    z.scrollIntoView({ block: 'start' });
  }

  // Configurar habitual / Agregar día: un día por vez con el catálogo + carrito. Día, salida y repartidor van arriba del carrito y se aplican
  // a todas las líneas del día (mismos campos que antes: dia_semana, unidad, salida, repartidor_persona_id). Para más días: "Agregar día".
  function abrirHabitual(z, accion, diasOcupados, alExito) {
    montar(avisos);
    const libres = DIAS.filter(dd => !(diasOcupados || []).includes(dd));
    const sDia = el('select', { class: 'select', id: 'hab-dia' }, libres.map(dd => el('option', { value: dd, text: DIA_TXT[dd] })));
    const sSal = selectSalida('hab-salida', null);
    const sRep = selectRepartidor('hab-repartidor', null);
    const arm = armadorPedido({
      productos: productosArmador(apoyo), iniciales: [], mostrarPrecios: false,
      titulo: 'Habitual del día', textoEnviar: accion === 'agregar_dia' ? 'Agregar día' : 'Guardar habitual', idEnviar: 'btn-guardar-habitual', idAviso: 'hab-aviso',
      encabezado: el('div', { class: 'stack arm-logistica' }, campo('hab-dia', 'Día', sDia), el('div', { class: 'form-grid two' }, campo('hab-salida', 'Salida (opcional)', sSal), campo('hab-repartidor', 'Repartidor (opcional)', sRep))),
      cargarFoto: cargadorFotosAdmin(ctx, apoyo), alCancelar: alExito,
      alEnviar: (items, zona) => {
        const lineas = items.map(it => {
          const o = Object.assign({}, it);
          if (accion === 'configurar_recurrente') o.dia_semana = sDia.value;
          const u = unidadDe(it.producto_id); if (u) o.unidad = u;
          o.salida = sSal.value || null; o.repartidor_persona_id = sRep.value || null;
          return o;
        });
        const campos = accion === 'agregar_dia' ? { persona_id: pid, dia_semana: sDia.value, lineas } : { persona_id: pid, lineas };
        return escribir(ctx, zona, accion, campos, async (r) => { montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await alExito(); });
      },
    });
    marcoHabitual(z, (accion === 'agregar_dia' ? 'Agregar día al habitual — ' : 'Configurar habitual — ') + (persona.nombre || pid),
      accion === 'agregar_dia' ? 'Elegí el día y sus productos. Salida y repartidor valen para todo el día.' : 'Elegí el primer día y sus productos. Después podés sumar más días con “Agregar día”.', arm);
  }
  // Editar día completo (editar_habitual_dia): todas las líneas del día (agregar / quitar / cantidades > 0, sin repetidos) + salida y repartidor del DÍA.
  // La logística se envía solo si cambió. El historial anterior se conserva (lo versiona Recurrentes Cambios PROD).
  function abrirDia(z, dia, productos, log, alExito) {
    montar(avisos);
    const sSal = selectSalida('hd-salida', log.salida);
    const sRep = selectRepartidor('hd-repartidor', log.repartidor_persona_id);
    const firma = (ls) => JSON.stringify(ls.map(l => [l.producto_id, l.cantidad, str(l.detalle_libre)]).sort((x, y) => x[0] - y[0]));
    const arm = armadorPedido({
      productos: productosArmador(apoyo), iniciales: productos.filter(l => Number.isInteger(l.producto_id)), conservarIniciales: true, mostrarPrecios: false,
      titulo: 'Habitual del ' + (DIA_TXT[dia] || dia).toLowerCase(), textoEnviar: 'Guardar día', idEnviar: 'btn-guardar-dia', idAviso: 'hd-aviso',
      encabezado: el('div', { class: 'form-grid two arm-logistica' }, campo('hd-salida', 'Salida del día', sSal), campo('hd-repartidor', 'Repartidor del día', sRep)),
      cargarFoto: cargadorFotosAdmin(ctx, apoyo), alCancelar: alExito,
      alEnviar: (items, zona) => {
        const logistica = {};
        if ((sSal.value || null) !== (log.salida || null)) logistica.salida = sSal.value || null;
        if ((sRep.value || null) !== (log.repartidor_persona_id || null)) logistica.repartidor_persona_id = sRep.value || null;
        if (firma(items) === firma(productos) && !Object.keys(logistica).length) { montar(zona, aviso('info', 'No hay cambios para guardar.')); return null; }
        const campos = { persona_id: pid, dia_semana: dia, lineas: items };
        if (Object.keys(logistica).length) campos.logistica = logistica;
        return escribir(ctx, zona, 'editar_habitual_dia', campos, async (r) => { montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await alExito(); });
      },
    });
    marcoHabitual(z, 'Editar día — ' + (DIA_TXT[dia] || dia) + ' · ' + (persona.nombre || pid),
      'Habitual completo del ' + (DIA_TXT[dia] || dia).toLowerCase() + ': agregá, quitá o cambiá productos y cantidades. Salida y repartidor valen para todo el día.', arm);
  }

  // ---- extras de la persona en la fecha ----
  async function cargarExtras(z) {
    z.dataset.estado = 'cargando';
    const res = await ctx.pedir(TIPO, 'extras_admin', { modo: 'fecha', fecha });
    if (!z.isConnected) return;
    z.dataset.estado = 'listo';
    const esHoy = fecha === hoyART();
    // Siempre crea el extra para HOY: si la ficha muestra otra fecha, al terminar se abre la ficha de hoy.
    const bNuevo = persona && rolesActivos(persona).some(r => r === 'cliente' || r === 'repartidor') ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-cargar-extra',
      onclick: () => abrirCrearExtra(ctx, apoyo, { persona, rol }, async (r) => { montar(avisos, avisoNegocio(r)); if (esHoy) await cargarExtras(z); else ctx.ir('#/admin/pedidos/persona/' + encodeURIComponent(pid) + '/' + hoyART()); }) }, 'Cargar extra para hoy') : null;
    const head = el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-extra', text: 'Extras del día' }), el('span', { class: 'spacer' }), bNuevo);
    if (res.falla) return montar(z, head, avisoFalla(res.falla, () => cargarExtras(z)));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(z, head, avisoNegocio(res.r));
    const mios = res.r.datos.extras.filter(x => x.persona_id === pid);
    montar(z, head, mios.length ? mios.map(x => tarjetaExtra(ctx, x, { alCambiar: () => cargarExtras(z) })) : el('p', { class: 'muted', text: 'Sin extras para esta fecha.' }),
      esHoy ? null : el('p', { class: 'muted small', text: 'Los extras se cargan solo para el día de hoy y no entran en Producción.' }));
  }

  cargar();
}
