// Admin General → Pendientes.
// Una sola lista de situaciones que requieren intervención, DERIVADA de fuentes existentes (no hay tabla de pendientes):
//   - Producción: datos a confirmar por fecha y advertencias de cierre (Reportes: reportes_produccion).
//   - Extras: que requieren revisión (extras_admin modo revision) y por resolver (extras_admin modo pendientes).
//   - Operaciones incompletas o que requieren revisión (Historial: historial_listar con estado iniciada / requiere_revision).
//   - Nuevas solicitudes de registro del inicio público (registros.js): revisar, aprobar (crea el cliente) o rechazar.
//   - Consultas de clientes/repartidores (soporte.js): tomar, responder o derivar a Finanzas.
//   - Revisiones financieras derivadas a Admin Finanzas (revisiones.js): derivar y ver su estado.
// Nada se resuelve acá: cada pendiente lleva a la sección donde se resuelve, o indica que hoy no hay una acción en la página.
import { el, montar, aviso, confirmar, conBloqueo, toast } from '../../ui.js';
import * as ops from '../../ops.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';
import { PEND_TXT, ADV_TXT } from './produccion.js';
import { seccionRevisiones, derivar } from './revisiones.js';
import { seccionSoporte } from './soporte.js';
import { seccionRegistros } from './registros.js';

const TIPO = 'admin_general';
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const sumarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const fmtCorta = (f) => FECHA_RE.test(f || '') ? new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')) : '—';
const sinTilde = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const filtros = { desde: null, hasta: null, grupo: 'todos', estado: 'todos', texto: '' };
const GRUPO_TXT = { produccion: 'Producción', cierre: 'Cierre de producción', extra: 'Extras', operacion: 'Operaciones', revision: 'Revisiones financieras' };
const ESTADO_TXT = { devuelta_finanzas: 'Devuelta por Finanzas', requiere_revision: 'Requiere revisión', por_resolver: 'Por resolver', incompleta: 'Incompleta' };
const ESTADO_CHIP = { devuelta_finanzas: 'ok', requiere_revision: 'off', por_resolver: 'warn', incompleta: 'warn' };
const ORDEN_ESTADO = { devuelta_finanzas: 0, requiere_revision: 1, incompleta: 2, por_resolver: 3 };
const ROL_FICHA = { repartidor: 'repartidores' }; // cliente / otro -> Clientes
const fmtHora = (f) => { const t = Date.parse(f || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };
const REV_TXT = { ESTADO_FUERA_DE_MODELO: 'estado fuera del circuito', EXTRA_EN_PRODUCCION: 'marcado dentro de Producción', LINEAS_INCOMPLETAS: 'líneas incompletas',
  LINEA_SIN_APROBAR: 'línea aprobada sin cantidad', ENTREGA_VIGENTE_INVALIDA: 'entrega inválida', ENTREGA_SIN_ESTADO: 'entrega sin estado', RESUMEN_ENTREGA_INCOHERENTE: 'resumen de entrega incoherente',
  MODO_ENTREGA_MULTIPLE: 'varios modos de entrega', RECHAZO_SIN_MOTIVO: 'rechazo sin motivo', CARGO_SIN_ENTREGA: 'cargo sin entrega', PEDIDO_ID_INVALIDO: 'id inválido', ROL_PEDIDO_INVALIDO: 'rol inválido' };

export function vistaPendientes(ctx, cont) {
  if (!filtros.desde) { filtros.desde = sumarDias(hoyART(), -7); filtros.hasta = sumarDias(hoyART(), 14); }
  const iD = el('input', { class: 'input', id: 'pen-desde', type: 'date', value: filtros.desde, 'aria-label': 'Desde' });
  const iH = el('input', { class: 'input', id: 'pen-hasta', type: 'date', value: filtros.hasta, 'aria-label': 'Hasta' });
  const bAct = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'pen-actualizar' }, 'Actualizar');
  const iT = el('input', { class: 'input', id: 'pen-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar persona, fecha o causa…', 'aria-label': 'Buscar', value: filtros.texto });
  const sG = el('select', { class: 'select', id: 'pen-grupo', 'aria-label': 'Tipo' }, el('option', { value: 'todos', text: 'Todos los tipos' }), Object.entries(GRUPO_TXT).map(([k, v]) => el('option', { value: k, text: v })));
  const sE = el('select', { class: 'select', id: 'pen-estado', 'aria-label': 'Estado' }, el('option', { value: 'todos', text: 'Todos los estados' }), Object.entries(ESTADO_TXT).map(([k, v]) => el('option', { value: k, text: v })));
  sG.value = filtros.grupo; sE.value = filtros.estado;
  const cuerpo = el('div', { class: 'stack', id: 'pen-lista', 'data-estado': 'cargando' });
  // Revisiones financieras: UNA sola lectura (revisiones_listar) para la lista principal (devueltas) y la sección de estado.
  let pRev = ctx.pedir(TIPO, 'revisiones_listar', {});
  const secRev = seccionRevisiones(ctx, pRev);
  montar(cont,
    el('div', { class: 'card stack section-card' },
      el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Pendientes' }),
        el('p', { class: 'card-sub', text: 'Situaciones que necesitan intervención, tomadas de Producción, Extras y del historial de operaciones. Desde acá se va a la sección donde se resuelven.' })))),
    el('div', { class: 'ped-fecha-bar' }, el('label', { for: 'pen-desde', class: 'ped-fecha-label', text: 'Fechas de producción' }), iD, el('span', { class: 'muted', text: 'a' }), iH, bAct),
    el('div', { class: 'ped-filtros pen-filtros' }, el('div', { class: 'field search-field' }, iT), sG, sE),
    cuerpo, seccionRegistros(ctx), seccionSoporte(ctx), secRev);
  let items = null;
  const pintar = () => {
    if (!items) return;
    const q = sinTilde(filtros.texto.trim());
    const vis = items.filter(x => (filtros.grupo === 'todos' || x.grupo === filtros.grupo) && (filtros.estado === 'todos' || x.estado === filtros.estado)
      && (!q || sinTilde([x.titulo, x.causa, x.persona_nombre, x.persona_id, x.fecha, x.codigo].join(' ')).includes(q)));
    const cuenta = (g) => items.filter(x => x.grupo === g).length;
    const resumen = el('div', { class: 'ped-resumen', id: 'pen-resumen' }, Object.keys(GRUPO_TXT).map(g => el('span', { class: 'ped-res-item', 'data-res': g }, el('strong', { text: String(cuenta(g)) }), ' ' + GRUPO_TXT[g].toLowerCase())));
    if (!vis.length) return montar(cuerpo, resumen, el('div', { class: 'card empty', 'data-vacio': 'true' }, el('span', { class: 'empty-ico', 'aria-hidden': 'true' }),
      el('p', { text: items.length ? 'No hay pendientes que coincidan con los filtros.' : 'No hay pendientes en el período.' })));
    montar(cuerpo, resumen, vis.length !== items.length ? el('p', { class: 'muted small', text: 'Mostrando ' + vis.length + ' de ' + items.length + '.' }) : null,
      el('div', { class: 'stack', id: 'lista-pendientes' }, vis.map(tarjeta)));
  };
  iT.addEventListener('input', () => { filtros.texto = iT.value; pintar(); });
  sG.addEventListener('change', () => { filtros.grupo = sG.value; pintar(); });
  sE.addEventListener('change', () => { filtros.estado = sE.value; pintar(); });
  bAct.addEventListener('click', () => { if (!FECHA_RE.test(iD.value) || !FECHA_RE.test(iH.value) || iH.value < iD.value) return montar(cuerpo, aviso('error', 'Revisá el período: “hasta” no puede ser anterior a “desde”.')); filtros.desde = iD.value; filtros.hasta = iH.value; cargar(); });

  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    if (!pRev) { pRev = ctx.pedir(TIPO, 'revisiones_listar', {}); secRev.actualizar(pRev); }
    const pRevActual = pRev; pRev = null; // el próximo "Actualizar" vuelve a leer
    const [rep, rev, pen, ini, rr, rvs] = await Promise.all([
      ctx.pedir(TIPO, 'reportes_produccion', { filtros: { fecha_desde: filtros.desde, fecha_hasta: filtros.hasta } }),
      ctx.pedir(TIPO, 'extras_admin', { modo: 'revision' }), ctx.pedir(TIPO, 'extras_admin', { modo: 'pendientes' }),
      ctx.pedir(TIPO, 'historial_listar', { filtros: { estado: 'iniciada' }, tam_pagina: 50 }), ctx.pedir(TIPO, 'historial_listar', { filtros: { estado: 'requiere_revision' }, tam_pagina: 50 }), pRevActual]);
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    for (const x of [rep, rev, pen, ini, rr, rvs]) if (x.r && ctx.revisarFinSesion(x.r)) return;
    if ([rep, rev, pen, ini, rr, rvs].every(x => x.falla)) return montar(cuerpo, avisoFalla(rep.falla, cargar));
    const out = [];
    const fuentesFallidas = [];
    // Producción: datos a confirmar y advertencias de cierre.
    if (rep.r && rep.r.success && rep.r.datos && rep.r.datos.datos) {
      for (const d of (rep.r.datos.datos.por_fecha || [])) {
        const dac = d.datos_a_confirmar && d.datos_a_confirmar.por_tipo ? d.datos_a_confirmar.por_tipo : {};
        for (const [t, n] of Object.entries(dac)) out.push({ id: 'dac-' + d.fecha + '-' + t, grupo: 'produccion', estado: 'requiere_revision', fecha: d.fecha, codigo: t,
          titulo: (PEND_TXT[t] || t) + (n > 1 ? ' (' + n + ')' : ''), causa: d.fecha_cerrada ? 'Quedó como dato a confirmar en la planilla cerrada (no se imprime).' : 'La regla de producción deja esta línea afuera.',
          origen: d.fecha_cerrada ? 'Planilla cerrada' : 'Producción efectiva', ir: { href: '#/admin/produccion/' + d.fecha, txt: 'Ver producción del ' + fmtCorta(d.fecha) } });
      }
      for (const a of (rep.r.datos.advertencias || [])) out.push({ id: 'adv-' + a.fecha + '-' + a.tipo, grupo: 'cierre', estado: a.requiere_revision === false ? 'por_resolver' : 'requiere_revision', fecha: a.fecha || null, codigo: a.tipo,
        titulo: ADV_TXT[a.tipo] || a.tipo, causa: a.tipo === 'CIERRES_DUPLICADOS' ? 'Vale el primer cierre; los demás no se usan ni se borran.' : 'Dato congelado del cierre: no se corrige desde la página.',
        origen: 'Cierre de producción', ir: a.fecha ? { href: '#/admin/produccion/' + a.fecha, txt: 'Ver producción del ' + fmtCorta(a.fecha) } : null, sinAccion: true });
    } else fuentesFallidas.push('Producción');
    // Extras.
    const nombreExtra = (x) => x.nombre || x.persona_id;
    if (rev.r && rev.r.success) for (const x of rev.r.datos.extras) out.push({ id: 'exr-' + x.pedido_id, grupo: 'extra', estado: 'requiere_revision', fecha: x.fecha_entrega, persona_id: x.persona_id, persona_nombre: nombreExtra(x), codigo: (x.revision_motivos || []).join(','),
      titulo: 'Extra que no cierra con el circuito', causa: (x.revision_motivos || []).map(m => REV_TXT[m] || m).join(', ') || 'sin detalle', origen: 'Extras · ' + x.pedido_id,
      ir: { href: '#/admin/pedidos/persona/' + encodeURIComponent(x.persona_id) + '/' + x.fecha_entrega, txt: 'Ver pedidos de la persona' }, sinAccion: true });
    else fuentesFallidas.push('Extras (revisión)');
    const PEN_TXT = { solicitado: 'Extra pendiente de aprobar', aprobado_entrega_pendiente: 'Extra aprobado con entrega pendiente' };
    if (pen.r && pen.r.success) for (const x of pen.r.datos.extras) {
      if (x.estado === 'requiere_revision') continue; // ya listado arriba
      const titulo = x.finanzas === 'pendiente_de_generar' ? 'Extra entregado con el cargo sin generar' : (PEN_TXT[x.estado] || 'Extra por resolver');
      out.push({ id: 'exp-' + x.pedido_id, grupo: 'extra', estado: 'por_resolver', fecha: x.fecha_entrega, persona_id: x.persona_id, persona_nombre: nombreExtra(x), codigo: x.estado,
        titulo, causa: (x.lineas || []).map(l => (l.producto || 'Producto') + ' ' + (l.cantidad_solicitada ?? '')).join(' · '), origen: 'Extras · ' + x.pedido_id,
        ir: { href: '#/admin/pedidos/extras', txt: 'Resolver en Pedidos › Extras pendientes' } });
    } else fuentesFallidas.push('Extras (por resolver)');
    // Operaciones incompletas / requieren revisión (auditoría).
    for (const [res, est] of [[ini, 'incompleta'], [rr, 'requiere_revision']]) {
      if (!(res.r && res.r.success && res.r.datos)) { fuentesFallidas.push('Historial'); continue; }
      for (const m of (res.r.datos.items || [])) {
        const p = m.persona_afectada || {};
        out.push({ id: 'op-' + m.movimiento_id, grupo: 'operacion', estado: est, fecha: (m.iniciado_en ? new Date(Date.parse(m.iniciado_en) - 3 * 3600e3).toISOString().slice(0, 10) : null),
          persona_id: p.persona_id || null, persona_nombre: p.nombre || p.persona_id || null, codigo: m.error_codigo || m.estado,
          titulo: (m.accion_label || m.accion || 'Operación') + (est === 'incompleta' ? ' que quedó incompleta' : ' que requiere revisión'),
          causa: (est === 'incompleta' ? 'La operación empezó y no terminó (auditoría “iniciada”).' : 'La operación se aplicó en parte o chocó con un cambio posterior.') + (m.error_codigo ? ' Código: ' + m.error_codigo + '.' : ''),
          origen: (m.categoria_label || m.categoria || 'Historial') + ' · ' + (m.operacion_id || m.movimiento_id) + ' · ' + (m.fecha_hora || ''),
          ir: p.persona_id && /^PER-/.test(p.persona_id) && m.categoria === 'recurrentes' ? { href: '#/admin/pedidos/persona/' + encodeURIComponent(p.persona_id) + '/' + sumarDias(hoyART(), 1), txt: 'Ver habitual de la persona' } : null,
          sinAccion: true });
      }
      if (res.r.datos.total > (res.r.datos.items || []).length) out.push({ id: 'op-mas-' + est, grupo: 'operacion', estado: est, titulo: 'Hay más operaciones ' + (est === 'incompleta' ? 'incompletas' : 'para revisar') + ' que las mostradas', causa: 'Se muestran las primeras 50.', origen: 'Historial', sinAccion: true });
    }
    // Revisiones financieras devueltas por Admin Finanzas: Admin General retoma la atención y las marca como atendidas.
    if (rvs.r && rvs.r.success && rvs.r.datos) {
      for (const r of (rvs.r.datos.revisiones || []).filter(x => x && x.estado === 'devuelta_admin_general' && x.revision_id)) {
        out.push({ id: 'rvf-' + r.revision_id, grupo: 'revision', estado: 'devuelta_finanzas', fecha: r.fecha_devolucion ? new Date(Date.parse(r.fecha_devolucion) - 3 * 3600e3).toISOString().slice(0, 10) : null,
          persona_id: r.persona_id, persona_nombre: r.persona_nombre || r.persona_id, titulo: 'Devuelta por Finanzas: ' + (r.motivo || 'revisión financiera'),
          causa: r.resumen || '—', origen: 'Derivada ' + fmtHora(r.fecha_derivacion) + (r.revisado_por ? ' · revisó ' + r.revisado_por : '') + ' · devuelta ' + fmtHora(r.fecha_devolucion), revision: r });
      }
    } else fuentesFallidas.push('Revisiones financieras');
    out.sort((a, b) => (ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]) || String(b.fecha || '').localeCompare(String(a.fecha || '')));
    items = out;
    pintar();
    if (fuentesFallidas.length) cuerpo.insertBefore(aviso('error', 'No se pudieron leer todas las fuentes: ' + [...new Set(fuentesFallidas)].join(', ') + '. La lista puede estar incompleta.', 'FUENTE_NO_DISPONIBLE'), cuerpo.firstChild);
  }
  cargar();

  // Acciones de una revisión devuelta: ver persona, volver a derivar, marcar como atendida (atender_revision).
  function accionesRevision(x) {
    const r = x.revision;
    const zona = el('div', { class: 'stack', 'data-zona-revision': r.revision_id });
    const bAt = el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'atender-revision' }, 'Marcar como atendida');
    async function atender() {
      const campos = { revision_id: r.revision_id };
      const res = await ops.ejecutar(ctx.base(TIPO), 'atender_revision', campos);
      const otra = () => atender();
      const soltar = () => { ops.descartar('atender_revision', campos); montar(zona); };
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, otra, soltar));
      if (ctx.revisarFinSesion(res.r)) return;
      if (res.r.codigo === 'OPERACION_EN_CURSO') return montar(zona, avisoSinConfirmar('EN_CURSO', res.operacion_id, otra, soltar));
      if (!res.r.success) return montar(zona, aviso('error', res.r.mensaje || 'No se pudo marcar como atendida.', res.r.codigo));
      toast(res.r.codigo === 'OPERACION_YA_PROCESADA' ? 'Ya estaba marcada como atendida.' : 'Revisión marcada como atendida.');
      items = items.filter(y => y.id !== x.id); pintar();
      secRev.actualizar(); // relee solo las revisiones (una llamada)
    }
    bAt.addEventListener('click', conBloqueo(bAt, async () => {
      if (!(await confirmar('Marcar como atendida', '¿Ya retomaste la atención con ' + (x.persona_nombre || 'la persona') + '? La revisión deja de figurar en Pendientes y queda registrado quién y cuándo la atendió.', 'Marcar como atendida'))) return;
      await atender();
    }, 'Marcando…'));
    return el('div', { class: 'stack' },
      el('p', { class: 'small', 'data-resolucion': 'true' }, el('strong', { text: 'Resolución de Finanzas: ' }), r.resolucion || 'sin resolución escrita'),
      el('div', { class: 'row' },
        el('a', { class: 'btn btn-ghost btn-sm', 'data-accion': 'ver-persona', href: '#/admin/' + (ROL_FICHA[r.rol_contexto] || 'clientes') + '/' + encodeURIComponent(r.persona_id) }, 'Ver persona'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'volver-derivar', onclick: () => derivar(ctx, { persona_id: r.persona_id, nombre: r.persona_nombre, rol: r.rol_contexto, motivo: r.motivo,
          resumen: (r.resumen || '') + (r.resolucion ? ' — Finanzas respondió: ' + r.resolucion : '') }) }, 'Volver a derivar'),
        bAt),
      zona);
  }

  function tarjeta(x) {
    const det = el('div', { class: 'stack pen-detalle', hidden: true },
      el('p', { class: 'small' }, el('strong', { text: 'Causa: ' }), x.causa || '—'),
      el('p', { class: 'small' }, el('strong', { text: 'Origen: ' }), x.origen || '—'),
      x.codigo ? el('p', { class: 'small' }, el('strong', { text: 'Código: ' }), el('span', { class: 'code', text: x.codigo })) : null,
      x.sinAccion ? el('p', { class: 'muted small', 'data-sin-accion': 'true', text: 'Hoy no hay una acción en la página para corregir esto: requiere revisión manual de los datos.' }) : null,
      x.ir ? el('div', { class: 'row' }, el('a', { class: 'btn btn-primary btn-sm', href: x.ir.href, 'data-accion': 'ir-resolver' }, x.ir.txt)) : null);
    const bVer = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'ver-detalle', 'aria-expanded': 'false' }, 'Ver detalle');
    bVer.addEventListener('click', () => { det.hidden = !det.hidden; bVer.setAttribute('aria-expanded', String(!det.hidden)); bVer.textContent = det.hidden ? 'Ver detalle' : 'Ocultar'; });
    return el('div', { class: 'card stack pen-card', 'data-pendiente': x.id, 'data-grupo': x.grupo, 'data-estado-pendiente': x.estado },
      el('div', { class: 'card-head ext-head' },
        el('div', { class: 'ext-titulo' }, el('strong', { text: x.titulo }),
          el('span', { class: 'muted small', text: [GRUPO_TXT[x.grupo], x.fecha ? fmtCorta(x.fecha) : null, x.persona_nombre].filter(Boolean).join(' · ') })),
        el('span', { class: 'spacer' }), el('span', { class: 'chips' }, el('span', { class: 'chip ' + (ESTADO_CHIP[x.estado] || ''), text: ESTADO_TXT[x.estado] || x.estado }), bVer)),
      x.revision ? accionesRevision(x) : null, det);
  }
}
