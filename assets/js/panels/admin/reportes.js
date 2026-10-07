// Admin General → Reportes. Solo lectura. Acciones existentes: reportes_pedidos, reportes_productos, reportes_clientes,
// reportes_repartidores, reportes_produccion (Admin Historial Reportes PROD). Período obligatorio (desde/hasta o mes).
// Los totales los calcula el backend; acá solo se muestran. Exportar a Excel no está disponible (pendiente).
import { el, montar, aviso } from '../../ui.js';
import { avisoFalla } from './personas.js';

const TIPO = 'admin_general';
const REP = { reportes_pedidos: 'Pedidos', reportes_productos: 'Productos', reportes_clientes: 'Clientes', reportes_repartidores: 'Repartidores', reportes_produccion: 'Producción' };
const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const st = { tipo: 'reportes_pedidos', modo: 'rango', desde: null, hasta: null, mes: null, catalogo: '' };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '—');
const kg = (v) => (typeof v === 'number' ? num(v) + ' kg' : '—');
const fmt = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : (f || '—');
const tile = (label, valor, attr) => el('div', { class: 'precio-tile prd-tile', 'data-tile': attr || label }, el('span', { class: 'precio-label', text: label }), el('span', { class: 'precio-valor', text: valor }));
const tabla = (cols, filas, id) => el('div', { class: 'tabla rep-tabla', id }, el('div', { class: 'rep-fila rep-head rep-c' + cols.length }, cols.map(c => el('span', { text: c }))),
  filas.map(f => el('div', { class: 'rep-fila rep-c' + cols.length }, f.map((v, i) => el('span', { 'data-col': cols[i] }, el('span', { class: 'pc-label', text: cols[i] + ': ' }), v === null || v === undefined ? '—' : (v instanceof Node ? v : String(v)))))));
const cantidades = (p) => (p.cantidades || []).map(c => num(c.cantidad) + ' ' + (c.unidad || '')).join(' + ') || '—';
const ADV = { EXTRA_FUERA_DEL_MODELO: 'Extra fuera del circuito', AVISOS_LOGICA_PRODUCCION: 'Avisos de la lógica de producción', CIERRE_OFICIAL_SIN_SNAPSHOT: 'Cierre sin planilla congelada',
  SNAPSHOT_FORMATO_NO_SOPORTADO: 'Planilla congelada con formato viejo', VALOR_NEGATIVO_SNAPSHOT: 'Valores negativos en la planilla congelada', CIERRES_DUPLICADOS: 'Cierres duplicados',
  SIN_CONVERSION_A_KILOS: 'Productos que no suman a TOTAL KILOS (solo suma Pan Francés; no es un error)', HABITUAL_Y_SOLO_POR_HOY_MISMA_FECHA: 'Habitual y solo por hoy en la misma fecha', CIERRE_NO_CERRADO: 'Cierre no cerrado',
  SIN_UNIDAD: 'Renglones sin unidad', PAN_FRANCES_UNIDAD_INVALIDA: 'Pan Francés en una unidad distinta de kg', PERIODO_CON_REGLAS_DISTINTAS: 'El período incluye cierres anteriores al cambio de TOTAL KILOS (se informan aparte)' };
const KG_PF = 'Pan Francés — kg';

export function vistaReportes(ctx, cont) {
  if (!st.desde) { st.hasta = hoyART(); st.desde = new Date(Date.parse(st.hasta + 'T12:00:00Z') - 6 * 86400e3).toISOString().slice(0, 10); st.mes = st.hasta.slice(0, 7); }
  const sR = el('select', { class: 'select', id: 'rep-tipo', 'aria-label': 'Reporte' }, Object.entries(REP).map(([k, v]) => el('option', { value: k, text: v })));
  const sM = el('select', { class: 'select', id: 'rep-modo', 'aria-label': 'Período' }, el('option', { value: 'rango', text: 'Entre fechas' }), el('option', { value: 'mes', text: 'Mes' }));
  const iD = el('input', { class: 'input', id: 'rep-desde', type: 'date', value: st.desde, 'aria-label': 'Desde' });
  const iH = el('input', { class: 'input', id: 'rep-hasta', type: 'date', value: st.hasta, 'aria-label': 'Hasta' });
  const iMes = el('input', { class: 'input', id: 'rep-mes', type: 'month', value: st.mes, 'aria-label': 'Mes' });
  const sC = el('select', { class: 'select', id: 'rep-catalogo', 'aria-label': 'Catálogo' }, el('option', { value: '', text: 'Todo el catálogo' }), el('option', { value: 'clientes', text: 'Catálogo de clientes' }), el('option', { value: 'repartidores', text: 'Catálogo de repartidores' }));
  const bVer = el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'rep-ver' }, 'Ver reporte');
  sR.value = st.tipo; sM.value = st.modo; sC.value = st.catalogo;
  const cuerpo = el('div', { class: 'stack', id: 'rep-cuerpo', 'data-estado': 'inicial' });
  const sync = () => { const r = sM.value === 'rango'; iD.hidden = !r; iH.hidden = !r; iMes.hidden = r; sC.hidden = sR.value !== 'reportes_productos'; };
  sR.addEventListener('change', sync); sM.addEventListener('change', sync); sync();
  montar(cont, el('div', { class: 'card stack section-card' }, el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Reportes' }),
    el('p', { class: 'card-sub', text: 'Resúmenes por período calculados por el sistema. Los extras se informan aparte y nunca se suman a los pedidos.' })))),
    el('div', { class: 'ped-filtros rep-filtros' }, sR, sM, iD, iH, iMes, sC, bVer), cuerpo);
  bVer.addEventListener('click', () => {
    st.tipo = sR.value; st.modo = sM.value; st.desde = iD.value; st.hasta = iH.value; st.mes = iMes.value; st.catalogo = sC.value;
    if (st.modo === 'rango' && (!st.desde || !st.hasta || st.hasta < st.desde)) return montar(cuerpo, aviso('error', 'Indicá un período válido.'));
    if (st.modo === 'mes' && !/^\d{4}-\d{2}$/.test(st.mes || '')) return montar(cuerpo, aviso('error', 'Indicá el mes.'));
    cargar();
  });
  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('p', { class: 'muted small', text: 'Calculando… los períodos largos pueden tardar.' }));
    const filtros = st.modo === 'mes' ? { mes: st.mes } : { fecha_desde: st.desde, fecha_hasta: st.hasta };
    if (st.tipo === 'reportes_productos' && st.catalogo) filtros.catalogo = st.catalogo;
    const tipo = st.tipo;
    bVer.disabled = true; // un cálculo por vez (puede tardar ~30 s)
    let res;
    try { res = await ctx.pedir(TIPO, tipo, { filtros }); } finally { bVer.disabled = false; }
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo'; cuerpo.dataset.reporte = tipo;
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(cuerpo, el('div', { class: 'notice error', 'data-codigo': res.r.codigo }, res.r.mensaje || 'No se pudo calcular el reporte.', el('span', { class: 'code', text: res.r.codigo })));
    const R = res.r.datos, d = R.datos || {};
    const p = R.periodo || {};
    const cab = [el('p', { class: 'muted small', id: 'rep-periodo', text: REP[tipo] + ' · ' + (p.mes ? 'mes ' + p.mes : fmt(p.fecha_desde) + ' a ' + fmt(p.fecha_hasta)) + ' · ' + (p.dias || '?') + ' día(s)' + ((R.fechas_cerradas_en_periodo || []).length ? ' · ' + R.fechas_cerradas_en_periodo.length + ' con producción cerrada' : '') }),
      R.requiere_revision ? el('div', { class: 'notice info', 'data-requiere-revision': 'true' }, 'Hay datos que requieren revisión (se informan, no se corrigen): ' +
        [...new Set((R.advertencias || []).filter(a => a.requiere_revision !== false).map(a => ADV[a.tipo] || a.tipo))].join(', ') + '.') : null];
    montar(cuerpo, cab, cuerpoReporte(tipo, d));
  }
  function cuerpoReporte(tipo, d) {
    if (tipo === 'reportes_pedidos') {
      const pe = d.pedidos_efectivos || {}, ex = d.extras || {};
      return [el('div', { class: 'prd-tiles' }, tile('Pedidos', num(pe.total), 'pedidos'), tile('Habituales', num(pe.recurrente)), tile('Solo por hoy', num(pe.solo_por_hoy)), tile('Pedidos nuevos', num(pe.pedido_nuevo_no_recurrente)),
        tile(KG_PF, kg(d.kilos), 'kilos'), tile('Extras solicitados', num(ex.solicitados))),
        tabla(['Fecha', 'Pedidos', 'Renglones', KG_PF, 'Extras', 'Fuente'], (d.por_fecha || []).map(x => [fmt(x.fecha), num((x.pedidos_efectivos || {}).total), num(x.renglones), kg(x.kilos), num((x.extras || {}).solicitados), x.fecha_cerrada ? 'Cerrada' : 'Actual']), 'rep-por-fecha')];
    }
    if (tipo === 'reportes_productos') {
      const pn = d.pedidos_normales || {}, sp = pn.sin_producto_id || {};
      return [tabla(['Producto', 'Cantidad', KG_PF, 'Renglones'], (pn.productos || []).map(x => [x.nombre || ('Producto ' + x.producto_id), cantidades(x), typeof x.kilos === 'number' ? kg(x.kilos) : 'no suma', num(x.renglones)]), 'rep-productos'),
        sp.renglones ? el('p', { class: 'muted small', id: 'rep-sin-producto', text: sp.renglones + ' renglón(es) sin producto (detalle libre), se listan aparte y no suman a Pan Francés' + (sp.renglones_a_revisar ? '; ' + sp.renglones_a_revisar + ' sin unidad (a revisar).' : '.') }) : null,
        d.filtro_catalogo ? el('p', { class: 'muted small', text: 'Filtro: ' + (d.filtro_catalogo.criterio || d.filtro_catalogo.catalogo) + '. Excluidos sin producto: ' + (d.filtro_catalogo.renglones_sin_producto_id_excluidos || 0) + '.' }) : null,
        d.extras && (d.extras.productos || []).length ? el('div', { class: 'stack' }, el('strong', { text: 'Extras aprobados (aparte)' }), tabla(['Producto', 'Aprobado', 'Entregado', KG_PF], d.extras.productos.map(x => [x.nombre || ('Producto ' + x.producto_id),
          num(x.cantidad_aprobada) + ' ' + (x.unidad || ''), num(x.cantidad_entregada) + ' ' + (x.unidad || ''), typeof x.kilos_aprobados === 'number' ? kg(x.kilos_aprobados) : 'no suma']), 'rep-productos-extras')) : null];
    }
    if (tipo === 'reportes_clientes') {
      return [el('p', { class: 'muted small', text: (d.total_clientes_con_pedido ?? (d.clientes || []).length) + ' cliente(s) con pedido.' }),
        tabla(['Cliente', 'Días con pedido', 'Pedidos', KG_PF, 'Frecuencia'], (d.clientes || []).map(x => [x.nombre || x.persona_id, num(x.dias_con_pedido_efectivo), num((x.pedidos_efectivos || {}).total), kg(x.kilos_validos), (x.frecuencia || {}).descripcion || '—']), 'rep-clientes')];
    }
    if (tipo === 'reportes_repartidores') {
      const sr = d.sin_repartidor || {};
      return [tabla(['Repartidor', 'Días', 'Pedidos', 'Clientes', KG_PF, 'Extras'], (d.repartidores || []).map(x => { const pn = x.pedidos_normales_asociados || {}; return [x.repartidor_nombre || x.repartidor_persona_id, num(x.dias_con_actividad), num((pn.pedidos || {}).total), num(pn.clientes), kg(pn.kilos_validos), num(((x.extras || {}).resumen || {}).solicitados)]; }), 'rep-repartidores'),
        sr.pedidos_normales ? el('p', { class: 'muted small', text: 'Sin repartidor: ' + num((sr.pedidos_normales.pedidos || {}).total) + ' pedido(s), ' + kg(sr.pedidos_normales.kilos_validos) + ' de Pan Francés. Los pedidos normales no tienen registro de entrega.' }) : null];
    }
    const rs = d.resumen || {};
    return [el('div', { class: 'prd-tiles' }, tile('Días cerrados', num(rs.dias_cerrados_con_snapshot)), tile(KG_PF + ' (cierres)', kg(rs.kilos_total_cierres)), rs.dias_cerrados_regla_anterior ? tile('Cierres con la regla anterior', kg(rs.kilos_total_cierres_regla_anterior) + ' · ' + num(rs.dias_cerrados_regla_anterior) + ' día(s)') : null, tile('Días sin cierre', num(rs.dias_no_cerrados)), tile(KG_PF + ' (sin cierre)', kg(rs.kilos_pedidos_efectivos_no_cerrados))),
      el('p', { class: 'muted small', text: 'TOTAL KILOS = solo Pan Francés. Las fechas cerradas muestran el total congelado; los cierres anteriores al cambio conservan su regla (podían incluir otros productos en kg) y se muestran aparte. Las fechas sin cierre muestran Pan Francés de pedidos, sin líneas manuales ni cálculos. No se suman entre sí.' }),
      tabla(['Fecha', 'Fuente', 'TOTAL KILOS', 'Datos a confirmar', ''], (d.por_fecha || []).map(x => [fmt(x.fecha), x.fecha_cerrada ? 'Planilla cerrada' : 'Pedidos actuales',
        x.estado_fuente !== 'OK' ? 'No disponible' : (x.fecha_cerrada ? kg(x.total_kilos) + (x.regla_total_kilos === 'ANTERIOR_AL_CAMBIO' ? ' (regla anterior)' : '') : kg(x.kilos_pedidos_efectivos)), num((x.datos_a_confirmar || {}).cantidad), el('a', { href: '#/admin/produccion/' + x.fecha, class: 'btn btn-ghost btn-sm', text: 'Ver' })]), 'rep-produccion')];
  }
}
