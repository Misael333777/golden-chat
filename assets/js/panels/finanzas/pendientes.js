// Admin Finanzas → Pendientes.
// 1) Revisiones financieras derivadas por Admin General (revisiones_financieras): tomar → terminar (con resolución) → devolver a Admin General.
//    Admin Finanzas no cierra la atención con el cliente/repartidor: la revisión terminada vuelve a Admin General.
// 2) Bandeja DERIVADA de estados existentes (extras pendientes o con error, conciliación, pagos no conciliados). Solo lectura.
import { el, montar } from '../../ui.js';
import { pesos, fmtFecha, cabecera, vacio, leer, operacion, campo, textoArea, texto, resumenOp, filaDato } from './comun.js';

const REV_EST = { pendiente: ['Pendiente', 'warn'], en_revision: ['En revisión', 'gold'], revision_terminada: ['Revisión terminada', 'ok'], devuelta_admin_general: ['Devuelta a Admin General', ''], atendida: ['Atendida por Admin General', ''] };
const ROL_CTX = { cliente: 'Cliente', repartidor: 'Repartidor', otro: 'Otro' };
function revisiones(ctx, zona) {
  leer(ctx, zona, 'revisiones', {}, (d) => {
    const cerrada = (r) => r.estado === 'devuelta_admin_general' || r.estado === 'atendida';
    const l = (d.revisiones || []).slice().sort((a, b) => cerrada(a) - cerrada(b) || String(b.fecha_derivacion).localeCompare(String(a.fecha_derivacion)));
    const pe = d.por_estado || {};
    const recargar = () => ctx.ir('#/finanzas/pendientes');
    const accion = (r) => {
      if (r.estado === 'pendiente') return el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'tomar-revision', onclick: () => paso(ctx, r, 'tomar_revision', recargar) }, 'Tomar');
      if (r.estado === 'en_revision') return el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'terminar-revision', onclick: () => paso(ctx, r, 'terminar_revision', recargar) }, 'Terminar revisión');
      if (r.estado === 'revision_terminada') return el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'devolver-revision', onclick: () => paso(ctx, r, 'devolver_revision', recargar) }, 'Devolver a Admin General');
      return null;
    };
    montar(zona, el('h3', { text: 'Revisiones derivadas por Admin General' }),
      el('div', { class: 'ped-resumen', id: 'rv-resumen' }, Object.keys(REV_EST).map(k => el('span', { class: 'ped-res-item', 'data-res': k }, el('strong', { text: String(pe[k] || 0) }), ' ' + REV_EST[k][0].toLowerCase()))),
      !l.length ? vacio('No hay revisiones derivadas.') : el('div', { class: 'stack', id: 'rv-lista' }, l.map(r => el('div', { class: 'card pend-card stack', 'data-revision': r.revision_id, 'data-estado-revision': r.estado },
        el('div', { class: 'card-head' }, el('strong', { text: (r.persona_nombre || r.persona_id) + ' · ' + (ROL_CTX[r.rol_contexto] || r.rol_contexto) }), el('span', { class: 'spacer' }),
          el('span', { class: 'chip ' + (REV_EST[r.estado] || ['', ''])[1], text: (REV_EST[r.estado] || [r.estado])[0] })),
        el('p', { text: r.motivo + (r.resumen ? ' — ' + r.resumen : '') }),
        el('p', { class: 'muted small', text: ['Derivó ' + (r.derivado_por || '—') + ' el ' + fmtFecha(r.fecha_derivacion), r.revisado_por ? 'Revisa ' + r.revisado_por : null,
          (r.referencias || []).length ? 'Referencias: ' + r.referencias.join(', ') : null].filter(Boolean).join(' · ') }),
        r.resolucion ? el('p', { class: 'small', 'data-resolucion': 'true', text: 'Resolución: ' + r.resolucion }) : null,
        accion(r) ? el('div', { class: 'row' }, accion(r)) : null))));
  });
}
function paso(ctx, r, accion, alTerminar) {
  const iRes = accion === 'terminar_revision' ? textoArea('rv-resolucion', 500, 'Qué se verificó y qué se resolvió') : null;
  const T = { tomar_revision: ['Tomar revisión', 'Tomar', 'Queda en revisión a tu cargo.'], terminar_revision: ['Terminar revisión', 'Terminar revisión', 'La resolución queda registrada; después la devolvés a Admin General.'],
    devolver_revision: ['Devolver a Admin General', 'Devolver', 'Admin General retoma la atención con la persona.'] }[accion];
  operacion(ctx, {
    id: 'op-revision', titulo: T[0], reg: accion, textoConfirmar: T[1], confirmacion: T[2],
    form: el('div', { class: 'stack' }, resumenOp([filaDato('Persona', r.persona_nombre || r.persona_id), filaDato('Motivo', r.motivo), r.resolucion ? filaDato('Resolución', r.resolucion) : null]),
      iRes ? campo('rv-resolucion', 'Resolución', iRes) : null),
    datos: () => { const c = { revision_id: r.revision_id }; if (iRes) { if (!texto(iRes.value)) return { __error: 'Escribí la resolución.' }; c.resolucion = iRes.value; } return c; },
    ok: alTerminar,
  });
}

const COD_TXT = { PAGO_SIN_MF: 'Pago sin movimiento de dinero', MF_INEXISTENTE: 'Movimiento de dinero inexistente', NO_PAGO_CON_MF: 'Movimiento de dinero en algo que no es pago',
  FIN_SIN_COLA: 'Cargo de extra sin evento de origen', REFERENCIA_DUPLICADA: 'Referencia duplicada', OPERACION_DUPLICADA: 'Operación duplicada', REVERSION_DUPLICADA: 'Reversión duplicada',
  REVERSION_SIN_ORIGINAL: 'Reversión sin movimiento original', MF_DUPLICADO_TECNICO: 'Movimiento de dinero duplicado', POSIBLE_DUPLICADO_FINANCIERO: 'Posible cobro duplicado',
  ENVIADO_SIN_CC: 'Extra registrado sin cargo en la cuenta', PENDIENTE_CON_CC: 'Extra pendiente que ya tiene cargo', PERSONA_SIN_ROL_CUENTA: 'Persona con movimientos sin rol cliente/repartidor activo' };

export function vistaPendientesFin(ctx, cont) {
  const cuerpo = el('div', { class: 'stack', id: 'fp-cuerpo', 'data-estado': 'cargando' });
  const zRev = el('div', { class: 'stack', id: 'rv-cuerpo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Pendientes', 'Revisiones derivadas por Admin General y alertas de la cola de extras y de la conciliación de cuentas.'), zRev, el('h3', { text: 'Alertas del sistema' }), cuerpo);
  revisiones(ctx, zRev);
  leer(ctx, cuerpo, 'pendientes_finanzas', {}, (d) => {
    const items = [];
    for (const x of d.extras_pendientes || []) items.push({ grupo: 'extra', estado: 'por_registrar', titulo: 'Extra pendiente de registrar', detalle: [x.nombre, x.pedido_id, pesos(x.importe)] });
    for (const x of d.extras_en_error || []) items.push({ grupo: 'extra', estado: 'error', titulo: 'Extra con error', detalle: [x.nombre, x.pedido_id, pesos(x.importe), x.motivo] });
    for (const x of d.inconsistencias || []) items.push({ grupo: 'cuenta', estado: 'error', titulo: COD_TXT[x.codigo] || 'Inconsistencia', codigo: x.codigo, detalle: [x.nombre, x.ccm_id || x.movimiento_id || x.fin] });
    for (const x of d.pagos_no_conciliados || []) items.push({ grupo: 'cobro', estado: 'error', titulo: 'Cobro no conciliado', codigo: 'PAGO_ESTADO_' + (x.estado || '?'), detalle: [x.nombre, x.motivo] });
    for (const x of d.advertencias || []) items.push({ grupo: 'cuenta', estado: 'revisar', titulo: COD_TXT[x.codigo] || 'Advertencia', codigo: x.codigo, detalle: [x.nombre, x.minutos_entre !== undefined ? x.minutos_entre + ' min entre movimientos' : null] });
    const CHIP = { error: 'off', por_registrar: 'warn', revisar: 'warn' };
    const EST = { error: 'Error / revisión', por_registrar: 'Por registrar', revisar: 'A revisar' };
    montar(cuerpo,
      el('div', { class: 'ped-resumen', id: 'fp-resumen' }, [['extra', 'extras'], ['cuenta', 'de cuentas'], ['cobro', 'de cobros']].map(([g, t]) =>
        el('span', { class: 'ped-res-item', 'data-res': g }, el('strong', { text: String(items.filter(i => i.grupo === g).length) }), ' ' + t))),
      !items.length ? vacio('No hay pendientes financieros.') : el('div', { class: 'stack', id: 'fp-lista' }, items.map(i => el('div', { class: 'card pend-card', 'data-grupo': i.grupo, 'data-codigo': i.codigo || null },
        el('div', { class: 'card-head' }, el('strong', { text: i.titulo }), el('span', { class: 'spacer' }), el('span', { class: 'chip ' + CHIP[i.estado], text: EST[i.estado] })),
        el('p', { class: 'muted small', text: i.detalle.filter(Boolean).join(' · ') || '—' }),
        i.codigo ? el('span', { class: 'code', text: i.codigo }) : null))),
      el('p', { class: 'muted small', text: 'Calculado: ' + fmtFecha(d.generado_al) }));
  });
}
