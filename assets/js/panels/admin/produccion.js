// Admin General → Producción.
// Reutiliza SOLO lógica cerrada del backend (Web API PROD, tipo admin_general):
//   produccion_fecha (Consultas: produccion_efectiva + aclaraciones de la fecha + resumen del cierre oficial),
//   reportes_produccion (Historial/Reportes: snapshot congelado de la planilla cerrada o pedidos efectivos de una fecha abierta),
//   aclaraciones_listar, y las escrituras existentes de Admin Gestion: agregar/editar/anular_linea_manual,
//   crear/editar/activar/desactivar_aclaracion, y guardar_valores_produccion (cinco valores manuales por fecha).
// TOTAL KILOS = solo Pan Francés (lo decide el backend); los demás productos se muestran con su cantidad y unidad y no suman.
// Acá no se recalculan totales ni cálculos de planilla: se muestran tal como los devuelve el backend.
// No hay cierre manual ni acceso a Drive desde la página: el cierre y los archivos los maneja el flujo de Planillas.
import * as ops from '../../ops.js';
import { el, montar, aviso, modal, confirmar, conBloqueo, toast } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';

const TIPO = 'admin_general';
const estado = { fecha: null, tab: 'planilla' };
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === 'string' ? v : null);
const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const sumarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const fmtFecha = (f) => { if (!FECHA_RE.test(f || '')) return '—'; const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1); };
const fmtCorta = (f) => FECHA_RE.test(f || '') ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '—';
const fmtHora = (iso) => { const t = Date.parse(iso || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '—');
const kg = (v) => (typeof v === 'number' && Number.isFinite(v) ? num(v) + ' kg' : '—');
const cant = (q, u) => num(q) + (str(u) ? ' ' + u : '');
const salidaTxt = (s) => str(s) ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sin salida';

const ESTADO_TXT = { abierta: 'Abierta', en_cierre: 'En cierre', cerrada: 'Cerrada', sin_cierre: 'Sin cierre registrado', requiere_revision: 'Requiere revisión' };
const ESTADO_CHIP = { abierta: 'ok', en_cierre: 'warn', cerrada: 'gold', sin_cierre: 'warn', requiere_revision: 'off' };
export const PEND_TXT = {
  UNIDAD_NO_DETERMINADA: 'Línea sin unidad: está en la planilla, pero revisá qué se pidió',
  PAN_FRANCES_UNIDAD_INVALIDA: 'Pan Francés en una unidad distinta de kg: está en la planilla y no suma',
  LINEA_MANUAL_NO_SUMA: 'Línea manual marcada para sumar que no es Pan Francés en kg: no suma',
  VALORES_PRODUCCION_DUPLICADOS: 'Valores de producción duplicados para la fecha',
  KILOS_INDETERMINADOS: 'Kilos no determinados (regla anterior)',
  CANTIDAD_INVALIDA: 'Cantidad inválida (0 o vacía): la línea no entra en la producción',
  PERSONA_NO_ENCONTRADA: 'Pedido de una persona que no existe',
  SIN_ROL_REPARTIDOR: 'Pedido de repartidor de alguien sin rol de repartidor activo',
  SIN_ROL_CLIENTE: 'Pedido de cliente de alguien sin rol de cliente activo',
  SIN_ROL_PARA_RECURRENTE: 'Habitual de alguien sin rol de cliente ni repartidor activo',
  PEDIDO_NUEVO_CON_RECURRENTE: 'Pedido nuevo de alguien que tiene habitual ese día (se mantiene el habitual)',
  SOLO_POR_HOY_SIN_RECURRENTE: '“Solo por hoy” de alguien sin habitual ese día',
  ROL_AMBIGUO: 'Habitual sin rol definido (la persona es cliente y repartidor)',
  VERSION_INCOMPLETA: 'Versión de pedido incompleta',
  VIGENTE_SIN_EN_PRODUCCION: 'Pedido vigente sin marca de producción',
  TIPO_OPERACION_DESCONOCIDO: 'Pedido con tipo desconocido',
  LINEA_MANUAL_REEMPLAZO_PENDIENTE: 'Línea manual con reemplazo pendiente',
  SALIDA_INVALIDA: 'Salida fuera de 1 a 4',
};
const pendTxt = (t) => PEND_TXT[t] || String(t || 'Dato a confirmar');
const MSJ = {
  PRODUCCION_CERRADA: 'La producción de esa fecha ya está cerrada o pasó el horario de corte. No se puede cambiar.',
  CIERRE_EN_CURSO: 'Se está cerrando la producción. Reintentá cuando termine el cierre.',
  KILOS_OBLIGATORIO: 'No se pueden calcular los kilos de esa línea: indicá los kilos.',
  PRODUCTO_NO_DISPONIBLE: 'El producto no existe o está inactivo.',
  LINEA_NO_VIGENTE: 'Esa línea ya no está vigente (fue editada o anulada).',
  LINEA_NO_ENCONTRADA: 'La línea manual no existe.',
  ACLARACION_MODIFICADA: 'La aclaración cambió mientras tanto. Recargá y volvé a intentar.',
  ACLARACION_YA_ACTIVA: 'La aclaración ya estaba activa.', ACLARACION_YA_INACTIVA: 'La aclaración ya estaba inactiva.',
  OPERACION_ID_REUTILIZADO: 'Esa operación ya se había usado con otros datos. Volvé a intentarlo como una operación nueva.',
  SIN_CAMBIOS: 'No hay cambios para guardar.', MOTIVO_OBLIGATORIO: 'Escribí el motivo.',
  VALOR_INVALIDO: 'Algún valor no es válido: usá números de 0 a 100000 (hasta 3 decimales).', VALORES_INCOMPLETOS: 'Faltan valores para guardar.',
  FECHA_INVALIDA: 'La fecha no es válida para cargar valores (tiene que ser a partir de mañana).',
};
const OK_TXT = { LINEA_MANUAL_REGISTRADA: 'Línea agregada.', LINEA_MANUAL_EDITADA: 'Línea editada (la anterior quedó en el historial).', LINEA_MANUAL_ANULADA: 'Línea anulada.',
  ACLARACION_CREADA: 'Aclaración creada.', ACLARACION_EDITADA: 'Aclaración editada.', ACLARACION_ACTIVADA: 'Aclaración activada.', ACLARACION_DESACTIVADA: 'Aclaración desactivada.',
  OPERACION_YA_PROCESADA: 'La operación ya estaba registrada. No se duplicó.',
  VALORES_PRODUCCION_REGISTRADOS: 'Valores de producción guardados.', VALORES_PRODUCCION_ACTUALIZADOS: 'Valores de producción actualizados.', VALORES_SIN_CAMBIOS: 'No había cambios para guardar.' };
function avisoNegocio(r) {
  if (r.success) return el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, OK_TXT[r.codigo] || r.mensaje || 'Listo.',
    r.datos && r.datos.aviso === 'KILOS_MANUAL_IGNORADO' ? el('span', { class: 'small', text: ' Los kilos se calcularon con el peso del producto (se ignoró el valor ingresado).' }) : null,
    el('span', { class: 'code', text: r.codigo }));
  return el('div', { class: 'notice error', role: 'alert', 'data-codigo': r.codigo }, MSJ[r.codigo] || r.mensaje || 'No se pudo completar la operación.', el('span', { class: 'code', text: r.codigo }));
}
async function escribir(ctx, zona, accion, campos, alExito) {
  const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
  if (res.sinConfirmar) { montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => escribir(ctx, zona, accion, campos, alExito), () => { ops.descartar(accion, campos); montar(zona); })); return null; }
  if (ctx.revisarFinSesion(res.r)) return null;
  if (res.r.success && alExito) await alExito(res.r); else montar(zona, avisoNegocio(res.r));
  return res.r;
}
const campo = (id, label, input, hint) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
const numOrNull = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const txtOrNull = (v) => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };

// =====================================================================================
export function vistaProduccion(ctx, cont, fechaRuta) {
  if (FECHA_RE.test(fechaRuta || '')) estado.fecha = fechaRuta;
  if (!estado.fecha) estado.fecha = sumarDias(hoyART(), 1);
  const tabP = el('button', { type: 'button', class: 'btn btn-sm', role: 'tab', id: 'tab-planilla', 'data-tab': 'planilla' }, 'Planilla por fecha');
  const tabA = el('button', { type: 'button', class: 'btn btn-sm', role: 'tab', id: 'tab-aclaraciones', 'data-tab': 'aclaraciones' }, 'Aclaraciones');
  const zona = el('div', { class: 'stack', id: 'produccion' });
  montar(cont,
    el('div', { class: 'card stack section-card' },
      el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Producción' }),
        el('p', { class: 'card-sub', text: 'Planilla de producción por fecha, líneas manuales y aclaraciones. Los extras de reposición no entran en Producción.' }))),
      el('div', { class: 'ped-tabs', role: 'tablist', 'aria-label': 'Vista de producción' }, tabP, tabA)),
    zona);
  const pintarTabs = () => { for (const t of [tabP, tabA]) { const on = t.dataset.tab === estado.tab; t.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-ghost'); t.setAttribute('aria-selected', String(on)); } };
  tabP.addEventListener('click', () => { estado.tab = 'planilla'; pintarTabs(); vistaPlanilla(ctx, zona); });
  tabA.addEventListener('click', () => { estado.tab = 'aclaraciones'; pintarTabs(); vistaAclaraciones(ctx, zona); });
  pintarTabs();
  if (estado.tab === 'aclaraciones') vistaAclaraciones(ctx, zona); else vistaPlanilla(ctx, zona);
}

function vistaPlanilla(ctx, zona) {
  const iFecha = el('input', { class: 'input', id: 'prd-fecha', type: 'date', value: estado.fecha, 'aria-label': 'Fecha de producción' });
  const bHoy = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'prd-hoy' }, 'Hoy');
  const bMan = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'prd-manana' }, 'Mañana');
  const txt = el('span', { class: 'ped-fecha-txt', id: 'prd-fecha-txt', text: fmtFecha(estado.fecha) });
  const avisos = el('div', { class: 'stack', id: 'prd-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'prd-cuerpo', 'data-estado': 'cargando' });
  montar(zona, el('div', { class: 'ped-fecha-bar' }, el('label', { for: 'prd-fecha', class: 'ped-fecha-label', text: 'Fecha de producción' }), iFecha, bHoy, bMan, txt), avisos, cuerpo);
  const cambiar = (f) => { if (!FECHA_RE.test(f)) return; estado.fecha = f; iFecha.value = f; txt.textContent = fmtFecha(f); montar(avisos); cargar(); };
  iFecha.addEventListener('change', () => cambiar(iFecha.value));
  bHoy.addEventListener('click', () => cambiar(hoyART()));
  bMan.addEventListener('click', () => cambiar(sumarDias(hoyART(), 1)));

  async function cargar() {
    const fecha = estado.fecha;
    cuerpo.dataset.fecha = fecha;
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const [a, b, c] = await Promise.all([ctx.pedir(TIPO, 'produccion_fecha', { fecha }), ctx.pedir(TIPO, 'reportes_produccion', { filtros: { fecha_desde: fecha, fecha_hasta: fecha } }),
      ctx.pedir(TIPO, 'listar_productos', {})]);
    if (!cuerpo.isConnected || fecha !== estado.fecha) return;
    cuerpo.dataset.estado = 'listo';
    for (const x of [a, b, c]) if (x.r && ctx.revisarFinSesion(x.r)) return;
    if (a.falla) return montar(cuerpo, avisoFalla(a.falla, cargar));
    if (!a.r.success) return montar(cuerpo, avisoNegocio(a.r));
    const d = a.r.datos;
    const rep = b.r && b.r.success && b.r.codigo === 'REPORTE_OK' && b.r.datos && b.r.datos.datos && Array.isArray(b.r.datos.datos.por_fecha) ? b.r.datos.datos.por_fecha[0] || null : null;
    const advRep = b.r && b.r.success && b.r.datos ? (b.r.datos.advertencias || []) : [];
    const productos = c.r && c.r.success && c.r.datos && Array.isArray(c.r.datos.productos) ? c.r.datos.productos.map(p => ({ producto_id: p.producto_id, producto: str(p.producto), unidad: str(p.unidad), activo: p.activo === true })) : [];
    cuerpo.dataset.estadoProduccion = d.estado;
    montar(cuerpo,
      bloqueEstado(d, rep, advRep, b),
      // Fecha con cierre registrado: se muestra SOLO lo congelado (o el aviso de que no se puede leer); nunca se reconstruye con datos actuales.
      d.estado === 'cerrada' || (d.cierre && d.cierre.existe) ? bloqueCerrada(rep) : bloqueAbierta(d, rep),
      // Valores manuales y capacidad: solo mientras no hay cierre (con cierre, los valores son los congelados de la planilla).
      d.cierre && d.cierre.existe ? null : bloqueValores(ctx, d, avisos, cargar),
      d.cierre && d.cierre.existe ? null : bloqueCapacidad(d),
      bloqueLineas(ctx, d, rep, productos, avisos, cargar),
      bloqueAclaracionesFecha(ctx, d),
      // Con cierre registrado, los datos a confirmar válidos son los congelados (se ven en la planilla); los actuales no aplican.
      d.cierre && d.cierre.existe ? null : bloquePendientes(d));
  }
  cargar();
}

function bloqueEstado(d, rep, advRep, b) {
  const cr = d.cierre || {};
  const chips = el('div', { class: 'chips' },
    el('span', { class: 'chip ' + (ESTADO_CHIP[d.estado] || ''), 'data-estado-produccion': d.estado, text: ESTADO_TXT[d.estado] || d.estado }),
    el('span', { class: 'chip', 'data-tipo-planilla': d.tipo_planilla || '', text: 'Planilla ' + (d.tipo_planilla === 'domingo' ? 'de domingo' : 'diaria') }));
  const lineas = [];
  if (d.estado === 'abierta') lineas.push('Se puede modificar hasta el corte (' + fmtHora(d.corte_en) + '). Después, la planilla se cierra y queda congelada.');
  if (d.estado === 'en_cierre') lineas.push('Pasó el corte (' + fmtHora(d.corte_en) + ') y todavía no hay cierre registrado: la planilla se está generando. Los pedidos ya no se pueden cambiar.');
  if (d.estado === 'cerrada') lineas.push('Cerrada el ' + fmtHora(cr.cerrado_en) + ' — lo que se ve es la planilla congelada: los cambios posteriores no la modifican.');
  if (d.estado === 'sin_cierre') lineas.push('Esta fecha ya pasó y no tiene cierre registrado. Se muestran los pedidos actuales (no hay planilla congelada).');
  if (d.estado === 'requiere_revision') lineas.push('El cierre de esta fecha no se puede leer de forma segura (' + (d.motivo_estado || 'sin detalle') + '). No se reconstruye desde los datos actuales.');
  const datosCierre = cr.existe ? el('dl', { class: 'dl prd-cierre', id: 'prd-cierre' },
    el('div', { class: 'dl-item', 'data-ico': 'cal' }, el('dt', { text: 'Cierre' }), el('dd', { text: (cr.cierre_id || '—') + (cr.cierres_registrados > 1 ? ' · ' + cr.cierres_registrados + ' registros (vale el primero)' : '') })),
    el('div', { class: 'dl-item', 'data-ico': 'tag', 'data-historico': String(cr.historico_vinculado === true) }, el('dt', { text: 'Histórico en Drive' }), el('dd', { text: cr.historico_vinculado ? 'Generado y vinculado' : 'Sin histórico vinculado' })),
    el('div', { class: 'dl-item', 'data-ico': 'tag' }, el('dt', { text: 'Producción de mañana / Masa 1' }),
      el('dd', { 'data-faltantes': [cr.falta_produccion_manana ? 'produccion_manana' : '', cr.falta_masa_1 ? 'masa_1' : ''].filter(Boolean).join(',') },
        cr.falta_produccion_manana === true || cr.falta_masa_1 === true
          ? 'Faltó informar: ' + [cr.falta_produccion_manana ? 'producción de mañana' : null, cr.falta_masa_1 ? 'masa 1' : null].filter(Boolean).join(' y ') + ' (quedó “No informado”)'
          : (cr.con_resumen ? 'Informados' : 'Sin dato')))) : null;
  return el('div', { class: 'card stack', id: 'prd-estado' },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-estado', text: 'Estado de la producción' }), el('span', { class: 'spacer' }), chips),
    lineas.map(t => el('p', { class: 'small', text: t })),
    datosCierre,
    advRep.filter(x => x.fecha === d.fecha || !x.fecha).map(x => el('div', { class: 'notice info small', 'data-advertencia': x.tipo }, ADV_TXT[x.tipo] || x.tipo, el('span', { class: 'code', text: x.tipo }))),
    !b.r || !b.r.success ? aviso('info', 'No se pudo leer el resumen de la planilla (Reportes).', b.r ? b.r.codigo : 'FALLA_' + b.falla) : null,
    el('p', { class: 'muted small', text: 'El archivo “Producción de mañana” de Drive no se consulta desde la página: se genera en el flujo de Planillas al cerrar.' }));
}
export const ADV_TXT = { CIERRE_OFICIAL_SIN_SNAPSHOT: 'El cierre de esta fecha no tiene la planilla congelada.', SNAPSHOT_FORMATO_NO_SOPORTADO: 'La planilla congelada tiene un formato viejo que no se puede leer.',
  VALOR_NEGATIVO_SNAPSHOT: 'La planilla congelada tiene valores de producción negativos.', CIERRES_DUPLICADOS: 'Hay más de un cierre registrado para la fecha (vale el primero).',
  CIERRE_NO_CERRADO: 'Hay un cierre registrado que no quedó cerrado.', TOTAL_KILOS_INCONSISTENTE_EN_CIERRE: 'El total de kilos del cierre no coincide con la planilla congelada.' };

function tileCalc(c) {
  const v = c.estado_fuente === 'pendiente' || c.valor_fuente == null ? 'No informado' : num(c.valor_fuente);
  return el('div', { class: 'precio-tile prd-tile' + (c.requiere_revision ? ' prd-tile-alerta' : ''), 'data-calculo': c.clave || '' },
    el('span', { class: 'precio-label', text: c.etiqueta || c.clave || '' }), el('span', { class: 'precio-valor', text: v }),
    c.requiere_revision ? el('span', { class: 'hint', text: 'Valor negativo: requiere revisión.' }) : null);
}
function bloqueCerrada(rep) {
  if (!rep || rep.estado_fuente !== 'OK') return el('div', { class: 'card stack', id: 'prd-planilla' }, el('h3', { class: 'h-ico h-ico-pedido', text: 'Planilla congelada' }),
    aviso('error', 'No hay una planilla congelada que se pueda mostrar para esta fecha.', rep ? rep.motivo || 'FUENTE_NO_DISPONIBLE' : 'SIN_REPORTE'));
  const calc = Array.isArray(rep.calculos) ? rep.calculos : [];
  const grupos = new Map();
  for (const r of ((rep.detalle_congelado || {}).renglones || [])) { const k = r.bloque || '—'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
  const sub = new Map(); for (const a of (rep.agrupaciones || [])) { sub.set(a.bloque, a.kilos); for (const s of (a.secciones || [])) sub.set(a.bloque + ' / ' + s.seccion, s.kilos); }
  return el('div', { class: 'card stack', id: 'prd-planilla', 'data-fuente': 'cierre' },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-pedido', text: 'Planilla congelada' }), el('span', { class: 'spacer' }), el('span', { class: 'chip gold', text: 'Total ' + kg(rep.total_kilos) })),
    el('div', { class: 'prd-tiles', id: 'prd-calculos' }, calc.map(tileCalc)),
    el('div', { class: 'prd-bloques', id: 'prd-agrupaciones' }, (rep.agrupaciones || []).map(a => el('div', { class: 'prd-bloque-res', 'data-bloque': a.bloque },
      el('div', { class: 'prd-bloque-head' }, el('strong', { text: a.bloque }), el('span', { class: 'pp-cant', text: kg(a.kilos) })),
      (a.secciones || []).length ? el('div', { class: 'chips' }, a.secciones.map(s => el('span', { class: 'chip' + (s.kilos ? ' gold' : ''), text: s.seccion + ': ' + kg(s.kilos) }))) : null))),
    el('div', { class: 'stack', id: 'prd-detalle' }, [...grupos.entries()].map(([k, rs]) => el('div', { class: 'prd-grupo', 'data-grupo': k },
      el('div', { class: 'prd-grupo-head' }, el('strong', { text: k }), sub.has(k) ? el('span', { class: 'pp-cant', text: kg(sub.get(k)) }) : null),
      el('ul', { class: 'pp-lineas' }, rs.map(r => el('li', null, el('span', { class: 'pp-prod' }, (r.cliente || '—') + ' · ' + (r.detalle || '—')), el('span', { class: 'muted small', text: cant(r.cantidad, r.unidad) }), el('span', { class: 'pp-cant', text: kg(r.kilos) }))))))),
    rep.datos_a_confirmar && rep.datos_a_confirmar.cantidad ? el('div', { class: 'notice info', 'data-dato-a-confirmar': String(rep.datos_a_confirmar.cantidad) },
      'Datos a confirmar congelados en la planilla: ' + Object.entries(rep.datos_a_confirmar.por_tipo || {}).map(([t, n]) => pendTxt(t) + ' (' + n + ')').join(' · ') + '. No se imprimen.') : null);
}
function bloqueAbierta(d, rep) {
  // Agrupación de PRESENTACIÓN por repartidor y salida de cada renglón (tal como los devuelve produccion_efectiva). Los totales salen de Reportes.
  const reps = new Map();
  for (const r of d.renglones) { const k = r.repartidor_persona_id || ''; if (!reps.has(k)) reps.set(k, []); reps.get(k).push(r); }
  const nombreRep = new Map(); for (const r of d.renglones) if (r.repartidor_persona_id) nombreRep.set(r.repartidor_persona_id, r.repartidor_persona_id);
  const kRep = new Map(((rep && rep.agrupacion_por_repartidor) || []).map(x => [x.repartidor_persona_id || '', x]));
  const nombreDe = (id) => { const x = kRep.get(id); return x && x.repartidor_nombre ? x.repartidor_nombre : id; };
  const rs = d.resumen || {};
  const totales = el('div', { class: 'prd-tiles', id: 'prd-calculos' },
    el('div', { class: 'precio-tile prd-tile', 'data-calculo': 'total_kilos' }, el('span', { class: 'precio-label', text: 'TOTAL KILOS (Pan Francés)' }), el('span', { class: 'precio-valor', text: kg(rs.kilos_pan_frances) }),
      el('span', { class: 'hint', text: 'Solo Pan Francés en kg. Las líneas manuales de Pan Francés se suman al cerrar.' })),
    el('div', { class: 'precio-tile prd-tile', 'data-calculo': 'no_suman' }, el('span', { class: 'precio-label', text: 'Otros productos' }), el('span', { class: 'precio-valor', text: String(rs.renglones_no_suman || 0) }),
      el('span', { class: 'hint', text: 'Líneas en la planilla con su cantidad y unidad. No suman a TOTAL KILOS (no es un error).' })),
    rs.renglones_sin_kilos ? el('div', { class: 'precio-tile prd-tile prd-tile-alerta', 'data-calculo': 'sin_unidad' }, el('span', { class: 'precio-label', text: 'A revisar' }), el('span', { class: 'precio-valor', text: String(rs.renglones_sin_kilos) }),
      el('span', { class: 'hint', text: 'Líneas sin unidad o Pan Francés fuera de kg. Están en la planilla: ver “Revisar antes del cierre”.' })) : null);
  return el('div', { class: 'card stack', id: 'prd-planilla', 'data-fuente': 'efectiva' },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-pedido', text: d.estado === 'abierta' ? 'Producción efectiva (en curso)' : 'Producción efectiva' })),
    el('p', { class: 'muted small', text: 'Pedidos que entran en la producción según la regla consolidada (habitual, solo por hoy y pedidos nuevos). Los extras de reposición no se incluyen.' }),
    totales,
    !d.renglones.length ? el('p', { class: 'muted', text: 'No hay pedidos para esta fecha.' }) : el('div', { class: 'stack', id: 'prd-detalle' }, [...reps.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1)).map(([idRep, rs]) => {
      const sal = new Map(); for (const r of rs) { const k = r.salida || ''; if (!sal.has(k)) sal.set(k, []); sal.get(k).push(r); }
      const tot = kRep.get(idRep);
      return el('div', { class: 'prd-grupo', 'data-grupo': idRep || 'sin_repartidor' },
        el('div', { class: 'prd-grupo-head' }, el('strong', { text: idRep ? 'Repartidor: ' + nombreDe(idRep) : 'Sin repartidor' }), tot ? el('span', { class: 'pp-cant', text: kg(tot.kilos) }) : null),
        [...sal.entries()].sort((a, b) => (a[0] || 'z').localeCompare(b[0] || 'z')).map(([s, l]) => el('div', { class: 'prd-salida', 'data-salida': s || 'sin_salida' },
          el('span', { class: 'chip', text: salidaTxt(s) }),
          el('ul', { class: 'pp-lineas' }, l.map(r => el('li', { 'data-persona': r.persona_id || '' },
            el('span', { class: 'pp-prod' }, (r.nombre || r.persona_id || '—') + ' · ' + (r.producto || r.detalle_libre || '—')),
            el('span', { class: 'muted small', text: cant(r.cantidad, r.unidad) + (r.origen === 'solo_por_hoy' ? ' · solo por hoy' : r.origen === 'pedido_nuevo_no_recurrente' ? ' · pedido nuevo' : '') }),
            el('span', { class: 'pp-cant' + (r.cuenta_en_total_kilos ? '' : ' muted small'), 'data-suma': String(r.cuenta_en_total_kilos === true), text: r.cuenta_en_total_kilos ? kg(r.kilos) : 'no suma' })))))));
    })));
}

function bloqueLineas(ctx, d, rep, productos, avisos, recargar) {
  const cerrada = d.estado === 'cerrada' || !!(d.cierre && d.cierre.existe);
  const bAgregar = !cerrada ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-agregar-linea', onclick: () => abrirLinea(ctx, d.fecha, null, productos, avisos, recargar) }, 'Agregar línea') : null;
  const congeladas = rep && rep.lineas_manuales && Array.isArray(rep.lineas_manuales.filas) ? rep.lineas_manuales.filas : null;
  const filas = cerrada ? (congeladas || []) : d.lineas_manuales;
  return el('div', { class: 'card stack', id: 'prd-lineas', 'data-cerrada': String(cerrada) },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-extra', text: 'Otros / extras (líneas manuales)' }), el('span', { class: 'spacer' }), bAgregar),
    cerrada ? el('p', { class: 'muted small', text: 'Planilla cerrada: se muestran las líneas tal como quedaron congeladas. No se pueden cambiar.' })
      : el('p', { class: 'muted small', text: 'Conceptos que no son pedidos de personas. Solo suma a TOTAL KILOS una línea de Pan Francés en kg marcada “Suma al total”; el resto es informativa. Editar crea una versión nueva y la anterior queda en el historial.' }),
    !filas.length ? el('p', { class: 'muted', text: 'Sin líneas manuales.' }) : el('ul', { class: 'pp-lineas', id: 'lista-lineas' }, filas.map(l => {
      const acc = (!cerrada && l.linea_manual_id) ? el('span', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'editar-linea', onclick: () => abrirLinea(ctx, d.fecha, l, productos, avisos, recargar) }, 'Editar'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'anular-linea', onclick: () => abrirAnular(ctx, l, avisos, recargar) }, 'Anular')) : null;
      return el('li', { 'data-linea-manual': l.linea_manual_id || '' },
        el('span', { class: 'pp-prod' }, l.concepto || '—', l.observacion ? el('span', { class: 'muted small', text: ' · ' + l.observacion }) : null),
        el('span', { class: 'muted small', text: (l.cantidad != null ? cant(l.cantidad, l.unidad) + ' · ' : '') + (l.cuenta_en_total_kilos === true || (cerrada && l.suma_en_total) ? 'suma al total' : (l.suma_en_total ? 'marcada para sumar, pero no es Pan Francés en kg' : 'solo informativa')) }),
        el('span', { class: 'pp-cant', text: kg(l.kilos) }), acc);
    })));
}
function abrirLinea(ctx, fecha, l, productos, avisos, recargar) {
  const editar = !!l;
  const iCon = el('input', { class: 'input', id: 'lm-concepto', maxlength: '120', value: l ? l.concepto || '' : '' });
  const sProd = el('select', { class: 'select', id: 'lm-producto' }, el('option', { value: '', text: 'Sin producto' }),
    productos.filter(p => p.activo || (l && p.producto_id === l.producto_id)).map(p => el('option', { value: String(p.producto_id), text: (p.producto || 'Producto ' + p.producto_id) + (p.unidad ? ' (' + p.unidad + ')' : '') })));
  if (l && Number.isInteger(l.producto_id)) sProd.value = String(l.producto_id);
  const iCant = el('input', { class: 'input', id: 'lm-cantidad', type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: l && l.cantidad != null ? String(l.cantidad) : '' });
  const iUni = el('input', { class: 'input', id: 'lm-unidad', maxlength: '20', placeholder: 'kg, u…', value: l && l.unidad ? l.unidad : '' });
  const iKg = el('input', { class: 'input', id: 'lm-kilos', type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: l && l.kilos != null ? String(l.kilos) : '' });
  const cSuma = el('input', { type: 'checkbox', id: 'lm-suma', checked: l ? l.suma_en_total === true : true });
  const iObs = el('input', { class: 'input', id: 'lm-obs', maxlength: '300', value: l && l.observacion ? l.observacion : '' });
  const zona = el('div', { class: 'stack', id: 'lm-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-linea' }, editar ? 'Guardar cambios' : 'Agregar línea');
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('div', { class: 'form-grid two' }, campo('lm-concepto', 'Concepto', iCon), campo('lm-producto', 'Producto (opcional)', sProd),
      campo('lm-cantidad', 'Cantidad (opcional)', iCant), campo('lm-unidad', 'Unidad (opcional)', iUni),
      campo('lm-kilos', 'Kilos', iKg, 'Si la cantidad está en kg o el producto tiene peso por unidad, el sistema calcula los kilos.'), campo('lm-obs', 'Observación (opcional)', iObs)),
    el('label', { class: 'check', for: 'lm-suma' }, cSuma, el('span', { text: 'Suma al TOTAL KILOS (solo si es Pan Francés en kg)' })),
    b, zona);
  const m = modal((editar ? 'Editar línea — ' : 'Nueva línea — ') + fmtCorta(fecha), form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const concepto = txtOrNull(iCon.value);
    if (!concepto) return montar(zona, aviso('error', 'Escribí el concepto.'));
    const q = numOrNull(iCant.value), k = numOrNull(iKg.value);
    if (Number.isNaN(q) || (q !== null && !(q > 0))) return montar(zona, aviso('error', 'La cantidad debe ser mayor que 0.'));
    if (Number.isNaN(k) || (k !== null && k < 0)) return montar(zona, aviso('error', 'Los kilos deben ser 0 o más.'));
    const campos = editar ? { linea_manual_id: l.linea_manual_id } : { fecha_produccion: fecha };
    campos.concepto = concepto;
    if (sProd.value) campos.producto_id = Number(sProd.value);
    if (q !== null) campos.cantidad = q;
    const u = txtOrNull(iUni.value); if (u) campos.unidad = u;
    if (k !== null) campos.kilos = k;
    campos.suma_en_total = cSuma.checked;
    const o = txtOrNull(iObs.value); if (o) campos.observacion = o;
    await escribir(ctx, zona, editar ? 'editar_linea_manual' : 'agregar_linea_manual', campos, async (r) => { m.cerrar(); montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await recargar(); });
  }, 'Guardando…'));
}
function abrirAnular(ctx, l, avisos, recargar) {
  const t = el('textarea', { class: 'input', id: 'lm-motivo', maxlength: '300', rows: '3' });
  const zona = el('div', { class: 'stack', id: 'lm-anular-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-danger', id: 'btn-anular-linea' }, 'Anular línea');
  const form = el('form', { class: 'stack', novalidate: true }, el('p', { class: 'small', text: '“' + (l.concepto || '') + '” deja de contar en la producción. No se borra: queda en el historial.' }),
    campo('lm-motivo', 'Motivo', t), b, zona);
  const m = modal('Anular línea', form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const motivo = t.value.trim();
    if (!motivo) return montar(zona, aviso('error', 'Escribí el motivo.'));
    await escribir(ctx, zona, 'anular_linea_manual', { linea_manual_id: l.linea_manual_id, motivo }, async (r) => { m.cerrar(); montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await recargar(); });
  }, 'Anulando…'));
}

function bloqueAclaracionesFecha(ctx, d) {
  const a = d.aclaraciones;
  const EXC = { INACTIVA: 'inactiva', ANTES_DE_VIGENCIA: 'todavía no vigente', DESPUES_DE_VIGENCIA: 'vigencia terminada', OTRO_DIA: 'otro día', OTRA_PLANILLA: 'otra planilla' };
  return el('div', { class: 'card stack', id: 'prd-aclaraciones-fecha', 'data-origen': a ? a.origen || '' : '' },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-habitual', text: 'Aclaraciones de la planilla' }), el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-ir-aclaraciones', onclick: () => { document.getElementById('tab-aclaraciones').click(); } }, 'Gestionar aclaraciones')),
    !a ? aviso('error', 'No se pudieron leer las aclaraciones de la fecha.') : null,
    a && a.congelada ? el('p', { class: 'muted small', text: 'Congeladas al cerrar la planilla. Los cambios posteriores no las modifican.' }) : null,
    a && (a.alertas || []).some(x => x.tipo === 'ACLARACIONES_SIN_SNAPSHOT') ? aviso('info', 'La planilla cerrada no tiene aclaraciones congeladas.', 'ACLARACIONES_SIN_SNAPSHOT') : null,
    a && a.lista.length ? el('ol', { class: 'prd-acl' }, a.lista.map(x => el('li', { 'data-aclaracion': x.aclaracion_id || '', text: x.texto || '' }))) : (a ? el('p', { class: 'muted', text: 'Sin aclaraciones para esta planilla.' }) : null),
    a && a.excluidas && a.excluidas.length ? el('p', { class: 'muted small', text: a.excluidas.length + ' aclaración(es) no aplican a esta fecha: ' + [...new Set(a.excluidas.map(x => EXC[x.motivo] || x.motivo))].join(', ') + '.' }) : null);
}

// Cinco valores MANUALES por fecha. Ninguno se calcula a partir de otro ni del TOTAL KILOS. Se guardan juntos; vacío = sin informar.
const VALORES = [['produccion_manana', 'Producción mañana'], ['turno_noche_kg', 'Hacer turno noche (kg)'], ['harina_a_usar', 'Harina a usar'], ['masa_1', 'Masa 1'], ['masa_2', 'Masa 2']];
function bloqueValores(ctx, d, avisos, recargar) {
  const v = d.valores_produccion || {};
  const editable = d.estado === 'abierta';
  const inputs = VALORES.map(([k]) => el('input', { class: 'input', id: 'vp-' + k, type: 'number', min: '0', max: '100000', step: 'any', inputmode: 'decimal', value: typeof v[k] === 'number' ? String(v[k]) : '', disabled: !editable }));
  const zona = el('div', { class: 'stack', id: 'vp-aviso' });
  const b = editable ? el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-valores' }, 'Guardar valores') : null;
  const form = el('form', { class: 'stack', id: 'vp-form', novalidate: true, autocomplete: 'off', 'data-existe': String(v.existe === true) },
    el('div', { class: 'form-grid two' }, VALORES.map(([k, t], i) => campo('vp-' + k, t, inputs[i]))), b, zona);
  if (editable) form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const campos = { fecha_produccion: d.fecha };
    for (let i = 0; i < VALORES.length; i++) {
      const x = numOrNull(inputs[i].value);
      if (Number.isNaN(x) || (x !== null && (x < 0 || x > 100000))) return montar(zona, aviso('error', VALORES[i][1] + ': número de 0 a 100000.'));
      campos[VALORES[i][0]] = x;
    }
    await escribir(ctx, zona, 'guardar_valores_produccion', campos, async (r) => { montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await recargar(); });
  }, 'Guardando…'));
  return el('div', { class: 'card stack', id: 'prd-valores', 'data-editable': String(editable) },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-pedido', text: 'Valores de producción (manuales)' }), el('span', { class: 'spacer' }),
      el('span', { class: 'chip ' + (v.existe ? 'ok' : 'warn'), text: v.existe ? 'Cargados' : 'Sin cargar' })),
    el('p', { class: 'muted small', text: editable
      ? 'Se cargan a mano para esta fecha y se imprimen tal cual en la planilla. Ninguno se calcula a partir de otro. Se pueden editar hasta el corte; al cerrar quedan congelados. Vacío = “No informado”.'
      : 'La fecha ya no se puede modificar (pasó el corte o está en cierre). Al cerrar, la planilla usa los valores guardados.' }),
    v.modificado_en ? el('p', { class: 'muted small', text: 'Última modificación: ' + fmtHora(v.modificado_en) }) : null,
    form);
}
// Aviso de ocupación de la planilla ANTES del cierre (estimado por el backend con las capacidades de la plantilla).
const BLOQUE_TXT = { repartidores: 'Repartidores', salida_1: 'Salida 1', salida_2: 'Salida 2', salida_3: 'Salida 3', salida_4: 'Salida 4', sin_salida: 'Sin salida' };
function bloqueCapacidad(d) {
  const c = d.capacidad;
  if (!c || !Array.isArray(c.bloques)) return null;
  const msg = c.estado === 'ok' ? 'Todos los pedidos entran en la hoja principal.'
    : c.estado === 'usa_anexo' ? 'Algunos pedidos no entran en su bloque: van COMPLETOS al Anexo (hoja 2). Ningún pedido se corta.'
    : 'Los pedidos no entran ni con el Anexo: el cierre va a fallar con aviso (no se genera una planilla incompleta). Revisá salidas o repartidores antes del corte.';
  return el('div', { class: 'card stack', id: 'prd-capacidad', 'data-estado-capacidad': c.estado },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-estado', text: 'Ocupación de la planilla' }), el('span', { class: 'spacer' }),
      el('span', { class: 'chip ' + (c.estado === 'ok' ? 'ok' : (c.estado === 'usa_anexo' ? 'warn' : 'off')), text: c.estado === 'ok' ? 'Entra' : (c.estado === 'usa_anexo' ? 'Usa anexo' : 'No entra') })),
    el('p', { class: c.estado === 'no_entra' ? 'small' : 'muted small', text: msg + ' (Estimado: el cierre aplica la regla final.)' }),
    el('div', { class: 'chips' }, c.bloques.map(x => el('span', { class: 'chip' + (x.excede ? ' warn' : ''), 'data-bloque': x.bloque,
      text: (BLOQUE_TXT[x.bloque] || x.bloque) + ': ' + x.filas + '/' + x.capacidad + (x.personas_a_anexo ? ' · ' + x.personas_a_anexo + ' al anexo' : '') })),
      c.anexo && c.anexo.filas ? el('span', { class: 'chip warn', 'data-bloque': 'anexo', text: 'Anexo: ' + c.anexo.filas + '/' + c.anexo.capacidad }) : null));
}
function bloquePendientes(d) {
  const p = d.pendientes || [];
  return el('div', { class: 'card stack', id: 'prd-pendientes', 'data-pendientes': String(p.length) },
    el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-estado', text: 'Revisar antes del cierre' }), el('span', { class: 'spacer' }),
      el('span', { class: 'chip ' + (p.length ? 'warn' : 'ok'), text: p.length ? p.length + ' por revisar' : 'Sin pendientes' })),
    el('p', { class: 'muted small', text: 'Solo inconsistencias reales. Las líneas en unidades y los productos que no son Pan Francés NO son errores: están en la planilla y no suman a TOTAL KILOS. Cada caso indica si la línea está o no en la planilla. No bloquean el cierre.' }),
    p.length ? el('ul', { class: 'pp-lineas' }, p.map(x => el('li', { 'data-pendiente-tipo': x.tipo || '' },
      el('span', { class: 'pp-prod', text: pendTxt(x.tipo) }),
      el('span', { class: 'chip' + (/^incluida|^no_suma/.test(x.efecto || '') ? '' : ' warn'), 'data-efecto': x.efecto || '', text: /^incluida/.test(x.efecto || '') ? 'En la planilla' : (/^no_suma/.test(x.efecto || '') ? 'No suma' : (/^excluida/.test(x.efecto || '') ? 'No entra en la planilla' : 'A revisar')) }),
      el('span', { class: 'muted small', text: [x.persona_id, x.pedido_fecha_id, x.pedido_recurrente_id ? 'habitual #' + x.pedido_recurrente_id : null, x.linea_manual_id].filter(Boolean).join(' · ') }),
      x.persona_id && /^PER-/.test(x.persona_id) ? el('a', { class: 'btn btn-ghost btn-sm', href: '#/admin/pedidos/persona/' + encodeURIComponent(x.persona_id) + '/' + d.fecha }, 'Ver pedido') : null))) : null);
}

// =====================================================================================
// ACLARACIONES (gestión)
// =====================================================================================
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIA_TXT = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };
const PLAN_TXT = { diaria: 'Solo diaria', domingo: 'Solo domingo', ambas: 'Diaria y domingo' };
function vistaAclaraciones(ctx, zona) {
  const avisos = el('div', { class: 'stack', id: 'acl-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'acl-lista', 'data-estado': 'cargando' });
  const bNueva = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-nueva-aclaracion', onclick: () => abrirAclaracion(ctx, null, avisos, cargar) }, 'Nueva aclaración');
  montar(zona, el('div', { class: 'row' }, el('p', { class: 'muted small', text: 'Las aclaraciones se imprimen en las planillas que todavía no cerraron, según vigencia, días y tipo de planilla. Una planilla cerrada no cambia.' }),
    el('span', { class: 'spacer' }), bNueva), avisos, cuerpo);
  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'aclaraciones_listar', {});
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(cuerpo, avisoNegocio(res.r));
    const l = res.r.datos.aclaraciones;
    if (!l.length) return montar(cuerpo, el('div', { class: 'card empty' }, el('p', { text: 'No hay aclaraciones.' })));
    montar(cuerpo, l.map(a => {
      const bEd = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'editar-aclaracion', onclick: () => abrirAclaracion(ctx, a, avisos, cargar) }, 'Editar');
      const bAct = el('button', { type: 'button', class: 'btn btn-sm ' + (a.activa ? 'btn-ghost' : 'btn-primary'), 'data-accion': a.activa ? 'desactivar-aclaracion' : 'activar-aclaracion' }, a.activa ? 'Desactivar' : 'Activar');
      bAct.addEventListener('click', conBloqueo(bAct, async () => {
        montar(avisos);
        if (a.activa && !(await confirmar('Desactivar aclaración', 'Deja de imprimirse en las planillas que todavía no cerraron. Las cerradas no cambian.', 'Desactivar'))) return;
        await escribir(ctx, avisos, a.activa ? 'desactivar_aclaracion' : 'activar_aclaracion', { aclaracion_id: a.aclaracion_id }, async (r) => { montar(avisos, avisoNegocio(r)); await cargar(); });
      }, 'Guardando…'));
      const vig = (a.vigencia_desde || a.vigencia_hasta) ? 'Vigencia: ' + (a.vigencia_desde ? 'desde ' + fmtCorta(a.vigencia_desde) : '') + (a.vigencia_hasta ? ' hasta ' + fmtCorta(a.vigencia_hasta) : '') : 'Sin vigencia (siempre)';
      const dias = a.dias_semana ? 'Días: ' + a.dias_semana.split(',').map(x => DIA_TXT[x] || x).join(', ') : 'Todos los días';
      return el('div', { class: 'card stack acl-card', 'data-aclaracion': a.aclaracion_id || '', 'data-activa': String(a.activa) },
        el('div', { class: 'card-head ext-head' }, el('div', { class: 'ext-titulo' }, el('strong', { text: a.texto || '' }), el('span', { class: 'muted small', text: [vig, dias, PLAN_TXT[a.planilla] || a.planilla, 'Orden ' + (a.orden ?? '—')].join(' · ') })),
          el('span', { class: 'spacer' }), el('span', { class: 'chip ' + (a.activa ? 'ok' : 'off'), text: a.activa ? 'Activa' : 'Inactiva' })),
        el('div', { class: 'row ext-acciones' }, bEd, bAct));
    }));
  }
  cargar();
}
function abrirAclaracion(ctx, a, avisos, recargar) {
  const editar = !!a;
  const t = el('textarea', { class: 'input', id: 'acl-texto', maxlength: '300', rows: '3' }); t.value = a ? a.texto || '' : '';
  const iD = el('input', { class: 'input', id: 'acl-desde', type: 'date', value: a && a.vigencia_desde ? a.vigencia_desde : '' });
  const iH = el('input', { class: 'input', id: 'acl-hasta', type: 'date', value: a && a.vigencia_hasta ? a.vigencia_hasta : '' });
  const sP = el('select', { class: 'select', id: 'acl-planilla' }, ['ambas', 'diaria', 'domingo'].map(p => el('option', { value: p, text: PLAN_TXT[p] }))); sP.value = a ? a.planilla || 'ambas' : 'ambas';
  const iO = el('input', { class: 'input', id: 'acl-orden', type: 'number', min: '1', step: '1', value: a && a.orden != null ? String(a.orden) : '' });
  const actuales = a && a.dias_semana ? a.dias_semana.split(',') : [];
  const checks = DIAS.map(d => { const i = el('input', { type: 'checkbox', id: 'acl-dia-' + d, checked: actuales.includes(d) }); return { d, i, nodo: el('label', { class: 'check', for: 'acl-dia-' + d }, i, el('span', { text: DIA_TXT[d] })) }; });
  const zona = el('div', { class: 'stack', id: 'acl-form-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-aclaracion' }, editar ? 'Guardar cambios' : 'Crear aclaración');
  const form = el('form', { class: 'stack', novalidate: true },
    campo('acl-texto', 'Texto (se imprime en la planilla)', t),
    el('div', { class: 'form-grid two' }, campo('acl-desde', 'Vigente desde (opcional)', iD), campo('acl-hasta', 'Vigente hasta (opcional)', iH), campo('acl-planilla', 'Planilla', sP), campo('acl-orden', 'Orden (opcional)', iO)),
    el('fieldset', { class: 'grupo' }, el('legend', { text: 'Días (ninguno = todos)' }), el('div', { class: 'checks' }, checks.map(c => c.nodo))),
    b, zona);
  const m = modal(editar ? 'Editar aclaración' : 'Nueva aclaración', form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const texto = t.value.trim();
    if (!texto) return montar(zona, aviso('error', 'Escribí el texto.'));
    const desde = iD.value || null, hasta = iH.value || null;
    if (desde && hasta && hasta < desde) return montar(zona, aviso('error', '“Hasta” no puede ser anterior a “desde”.'));
    const dias = checks.filter(c => c.i.checked).map(c => c.d);
    const diasTxt = dias.length ? dias.join(',') : null;
    const orden = iO.value.trim() === '' ? null : Number(iO.value);
    if (orden !== null && !(Number.isInteger(orden) && orden >= 1)) return montar(zona, aviso('error', 'El orden debe ser un entero mayor o igual a 1.'));
    let campos;
    if (!editar) { campos = { texto, planilla: sP.value }; if (desde) campos.vigencia_desde = desde; if (hasta) campos.vigencia_hasta = hasta; if (diasTxt) campos.dias_semana = diasTxt; if (orden !== null) campos.orden = orden; }
    else {
      campos = { aclaracion_id: a.aclaracion_id };
      if (texto !== (a.texto || '')) campos.texto = texto;
      if (desde !== (a.vigencia_desde || null)) campos.vigencia_desde = desde;
      if (hasta !== (a.vigencia_hasta || null)) campos.vigencia_hasta = hasta;
      if (diasTxt !== (a.dias_semana || null)) campos.dias_semana = diasTxt;
      if (sP.value !== a.planilla) campos.planilla = sP.value;
      if (orden !== null && orden !== a.orden) campos.orden = orden;
      if (Object.keys(campos).length === 1) return montar(zona, aviso('info', 'No hay cambios para guardar.'));
    }
    await escribir(ctx, zona, editar ? 'editar_aclaracion' : 'crear_aclaracion', campos, async (r) => { m.cerrar(); montar(avisos, avisoNegocio(r)); toast(OK_TXT[r.codigo] || 'Listo.'); await recargar(); });
  }, 'Guardando…'));
}
