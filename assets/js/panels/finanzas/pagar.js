// Admin Finanzas → Cuentas por pagar (deudas + pagos_deudas), con Sueldos integrado (empleados + empleados_sueldos).
// - Una deuda NO es gasto: el gasto se registra cuando sale el dinero (cada pago genera su movimiento en movimientos_financieros).
// - El saldo pendiente se calcula desde los pagos registrados; nada se borra (anular solo si no tiene pagos).
// - Sueldos: la obligación del período se carga a mano y congela el sueldo de referencia. Un adelanto es un PAGO ANTICIPADO de esa obligación
//   (nunca una deuda nueva) y no puede superar el saldo pendiente. Un cambio de sueldo rige hacia adelante y no toca nada ya cargado.
import { el, montar, aviso, conBloqueo } from '../../ui.js';
import { pesos, fmtFecha, tile, cabecera, tabla, vacio, leer, operacion, campo, entrada, importeInput, fechaInput, textoArea, selector, numero, texto, conOpcionales,
  resumenOp, filaDato, cuentasActivas, opcionesCuentas, CATEGORIA_TXT, PERIODICIDAD_TXT, hoyART } from './comun.js';

const ESTADO = { pendiente: ['Pendiente', 'warn'], parcialmente_pagada: ['Pago parcial', 'gold'], pagada: ['Pagada', 'ok'], anulada: ['Anulada', 'off'] };
const chipEstado = (e) => el('span', { class: 'chip ' + ((ESTADO[e] || [])[1] || ''), 'data-estado-deuda': e, text: (ESTADO[e] || [e])[0] });
const DEU = /^DEU-[0-9A-F]{16}$/;
const EMP = /^EMP-[0-9A-F]{12}$/;
const filtro = { estado: '' };
const sueldoTxt = (s) => s ? pesos(s.importe) + ' ' + (PERIODICIDAD_TXT[s.periodicidad] || s.periodicidad).toLowerCase() : 'Sin sueldo cargado';

export function vistaPagar(ctx, cont, partes) {
  if (partes[0] === 'deuda') return fichaDeuda(ctx, cont, decodeURIComponent(partes[1] || ''));
  if (partes[0] === 'empleado') return fichaEmpleado(ctx, cont, decodeURIComponent(partes[1] || ''));
  const tab = partes[0] === 'sueldos' ? 'sueldos' : 'deudas';
  const t = (id, txt, href) => el('a', { class: 'btn btn-sm ' + (tab === id ? 'btn-primary' : 'btn-ghost'), role: 'tab', 'aria-selected': String(tab === id), href, 'data-tab': id }, txt);
  const tabs = el('div', { class: 'ped-tabs', role: 'tablist', 'aria-label': 'Cuentas por pagar' }, t('deudas', 'Deudas', '#/finanzas/pagar'), t('sueldos', 'Sueldos', '#/finanzas/pagar/sueldos'));
  const boton = tab === 'deudas' ? el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-nueva-deuda', onclick: () => nuevaDeuda(ctx) }, 'Nueva deuda')
    : el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-nuevo-empleado', onclick: () => nuevoEmpleado(ctx) }, 'Nuevo empleado');
  const head = cabecera('Cuentas por pagar', 'Deudas con proveedores y otros, y sueldos de empleados. Se registran como gasto recién cuando se pagan.', boton);
  head.appendChild(tabs);
  const cuerpo = el('div', { class: 'stack', id: tab === 'deudas' ? 'cp-deudas' : 'cp-sueldos', 'data-estado': 'cargando' });
  montar(cont, head, cuerpo);
  return tab === 'deudas' ? listaDeudas(ctx, cuerpo) : listaEmpleados(ctx, cuerpo);
}

// ======================= DEUDAS =======================
function listaDeudas(ctx, cuerpo) {
  const sE = selector('cp-estado', [['', 'Todas'], ['pendiente', 'Pendientes'], ['parcialmente_pagada', 'Pago parcial'], ['pagada', 'Pagadas'], ['anulada', 'Anuladas']], filtro.estado);
  const zona = el('div', { class: 'stack', id: 'cp-lista', 'data-estado': 'cargando' });
  montar(cuerpo, el('div', { class: 'ped-filtros' }, sE), zona);
  const cargar = () => leer(ctx, zona, 'deudas', filtro.estado ? { estado: filtro.estado } : {}, (d) => {
    const l = d.deudas || []; const t = d.totales || {};
    montar(zona,
      el('div', { class: 'prd-tiles', id: 'cp-totales' }, tile('Total pendiente', pesos(t.pendiente), 'pendiente'), tile('Deudas con saldo', String(t.cantidad_pendientes ?? 0), 'cantidad'),
        tile('Vencidas', String(t.vencidas ?? 0), 'vencidas')),
      !l.length ? vacio('No hay deudas para mostrar.') : el('div', { class: 'list', id: 'cp-items' }, l.map(x => el('a', { class: 'person-card cc-row', href: '#/finanzas/pagar/deuda/' + encodeURIComponent(x.deuda_id), 'data-deuda': x.deuda_id, 'data-tipo-deuda': x.tipo_deuda },
        el('span', { class: 'pc-cell' }, el('span', { class: 'person-name', text: x.concepto }),
          el('span', { class: 'person-also', text: x.acreedor + (x.tipo_deuda === 'sueldo' ? ' · sueldo ' + x.periodo : ' · ' + (CATEGORIA_TXT[x.categoria] || x.categoria)) + (x.vencimiento ? ' · vence ' + fmtFecha(x.vencimiento) : '') })),
        el('span', { class: 'pc-cell cc-saldo', text: pesos(x.saldo_pendiente) }),
        el('span', { class: 'pc-cell chips' }, chipEstado(x.estado), x.vencida ? el('span', { class: 'chip off', text: 'Vencida' }) : null),
        el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' }))))),
      el('p', { class: 'muted small', text: 'El importe a la derecha es lo que falta pagar. Registrar una deuda no mueve dinero.' }));
  });
  sE.addEventListener('change', () => { filtro.estado = sE.value; cargar(); });
  cargar();
}

function nuevaDeuda(ctx) {
  const iCon = entrada('dn-concepto', { maxlength: '120' });
  const iAcr = entrada('dn-acreedor', { maxlength: '80' });
  const sTa = selector('dn-tipo-acreedor', [['proveedor', 'Proveedor'], ['otro', 'Otro']]);
  const sCat = selector('dn-categoria', ['proveedor', 'servicio', 'alquiler', 'impuesto', 'otro'].map(k => [k, CATEGORIA_TXT[k]]));
  const iImp = importeInput('dn-importe');
  const iFec = fechaInput('dn-fecha');
  const iVen = entrada('dn-vencimiento', { type: 'date' });
  const iObs = textoArea('dn-obs', 500);
  operacion(ctx, {
    id: 'op-deuda', titulo: 'Nueva deuda', prev: 'previsualizar_deuda', reg: 'registrar_deuda',
    form: el('div', { class: 'stack' }, el('div', { class: 'form-grid two' }, campo('dn-concepto', 'Concepto', iCon), campo('dn-acreedor', 'A quién se le debe', iAcr),
      campo('dn-tipo-acreedor', 'Tipo', sTa), campo('dn-categoria', 'Categoría', sCat), campo('dn-importe', 'Importe', iImp), campo('dn-fecha', 'Fecha', iFec),
      campo('dn-vencimiento', 'Vencimiento (opcional)', iVen)), campo('dn-obs', 'Observación (opcional)', iObs),
      el('p', { class: 'muted small', text: 'Los sueldos se cargan desde la pestaña Sueldos.' })),
    datos: () => {
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un importe mayor a 0.' };
      return conOpcionales({ concepto: iCon.value, acreedor: iAcr.value, tipo_acreedor: sTa.value, categoria: sCat.value, importe_original: imp, fecha: iFec.value },
        { vencimiento: texto(iVen.value), observacion: texto(iObs.value) });
    },
    resumen: (d) => { const x = d.deuda || {}; return resumenOp([filaDato('Concepto', x.concepto), filaDato('Acreedor', x.acreedor), filaDato('Importe', pesos(x.importe_original), 'importe'),
      filaDato('Fecha', fmtFecha(x.fecha)), x.vencimiento ? filaDato('Vence', fmtFecha(x.vencimiento)) : null], d.nota); },
    ok: (r) => ctx.ir(r.datos && DEU.test(r.datos.deuda_id || '') ? '#/finanzas/pagar/deuda/' + r.datos.deuda_id : '#/finanzas/pagar'),
  });
}

function fichaDeuda(ctx, cont, did) {
  const cuerpo = el('div', { class: 'stack', id: 'cp-ficha', 'data-estado': 'cargando', 'data-deuda': did });
  montar(cont, el('a', { class: 'btn btn-ghost btn-sm back-link', href: '#/finanzas/pagar', id: 'cp-volver' }, 'Volver a Cuentas por pagar'), cuerpo);
  if (!DEU.test(did)) return montar(cuerpo, aviso('error', 'La deuda indicada no es válida.', 'DEUDA_INEXISTENTE'));
  leer(ctx, cuerpo, 'deuda', { deuda_id: did }, (d) => {
    const x = d.deuda || {}; const pagos = d.pagos || [];
    const recargar = () => ctx.ir('#/finanzas/pagar/deuda/' + encodeURIComponent(did));
    const abierta = x.estado === 'pendiente' || x.estado === 'parcialmente_pagada';
    const esSueldo = x.tipo_deuda === 'sueldo';
    const acciones = [];
    if (abierta) {
      const bPagar = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'cp-btn-pagar' }, esSueldo ? 'Pagar sueldo' : 'Registrar pago');
      bPagar.addEventListener('click', conBloqueo(bPagar, () => pagarDeuda(ctx, x, 'pago', recargar), 'Abriendo…'));
      acciones.push(bPagar);
      if (esSueldo) { const bAde = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cp-btn-adelanto' }, 'Adelanto'); bAde.addEventListener('click', conBloqueo(bAde, () => pagarDeuda(ctx, x, 'adelanto', recargar), 'Abriendo…')); acciones.push(bAde); }
    }
    if (x.estado === 'pendiente' && !(x.cantidad_pagos > 0)) acciones.push(el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cp-btn-anular', onclick: () => anularDeuda(ctx, x, recargar) }, 'Anular'));
    montar(cuerpo,
      el('div', { class: 'card stack section-card' },
        el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', id: 'cp-concepto', text: x.concepto }),
          el('p', { class: 'card-sub', text: x.acreedor + (esSueldo ? ' · sueldo del período ' + x.periodo : ' · ' + (CATEGORIA_TXT[x.categoria] || x.categoria)) })),
          el('span', { class: 'spacer' }), el('span', { class: 'chips' }, chipEstado(x.estado), x.vencida ? el('span', { class: 'chip off', text: 'Vencida' }) : null)),
        el('div', { class: 'prd-tiles', id: 'cp-saldos' }, tile('Importe original', pesos(x.importe_original), 'original'), tile(esSueldo ? 'Pagado (incluye adelantos)' : 'Pagado', pesos(x.pagado), 'pagado'),
          tile('Saldo pendiente', pesos(x.saldo_pendiente), 'saldo'), esSueldo ? tile('Adelantos', pesos(x.adelantado), 'adelantado') : null),
        resumenOp([filaDato('Fecha', fmtFecha(x.fecha)), x.vencimiento ? filaDato('Vence', fmtFecha(x.vencimiento)) : null,
          esSueldo && x.sueldo_referencia ? filaDato('Sueldo de referencia (congelado)', sueldoTxt(x.sueldo_referencia), 'referencia') : null,
          x.observacion ? filaDato('Observación', x.observacion) : null, x.estado === 'anulada' ? filaDato('Motivo de anulación', x.motivo_anulacion) : null]),
        acciones.length ? el('div', { class: 'row', id: 'cp-acciones' }, acciones) : null,
        esSueldo && EMP.test(x.empleado_id || '') ? el('a', { class: 'btn btn-ghost btn-sm', href: '#/finanzas/pagar/empleado/' + x.empleado_id, id: 'cp-ver-empleado' }, 'Ver empleado') : null),
      el('h3', { text: 'Pagos aplicados' }),
      !pagos.length ? vacio('Todavía no tiene pagos.') : tabla(['Tipo', 'Fecha', 'Cuenta', 'Importe'], pagos.map(p => ({ dataset: { pago: p.pago_id, tipoPago: p.tipo_pago },
        celdas: [p.tipo_pago === 'adelanto' ? 'Adelanto' : 'Pago', fmtFecha(p.fecha), p.cuenta_nombre || p.cuenta_id, pesos(p.importe)] })), 'cp-pagos'),
      el('p', { class: 'muted small', text: 'Cada pago generó su salida de dinero en Movimientos. Los pagos no se editan ni se borran.' }));
  });
}

async function pagarDeuda(ctx, x, tipoPago, alTerminar) {
  const cuentas = await cuentasActivas(ctx); if (!cuentas) return;
  const adelanto = tipoPago === 'adelanto';
  const iImp = importeInput('pg-importe', adelanto ? null : x.saldo_pendiente);
  const sCta = selector('pg-cuenta', opcionesCuentas(cuentas));
  const iFec = fechaInput('pg-fecha');
  const iObs = textoArea('pg-obs', 500);
  operacion(ctx, {
    id: 'op-pago-deuda', titulo: adelanto ? 'Adelanto de sueldo' : (x.tipo_deuda === 'sueldo' ? 'Pago de sueldo' : 'Pago de deuda'), prev: 'previsualizar_pago_deuda', reg: 'registrar_pago_deuda',
    form: el('div', { class: 'stack' }, el('p', { text: x.concepto + ' · ' + x.acreedor + ' · falta pagar ' + pesos(x.saldo_pendiente) }),
      el('div', { class: 'form-grid two' }, campo('pg-importe', 'Importe', iImp, adelanto ? 'No puede superar lo que falta pagar.' : null), campo('pg-cuenta', 'Sale de la cuenta', sCta), campo('pg-fecha', 'Fecha', iFec)),
      campo('pg-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un importe mayor a 0.' };
      return conOpcionales({ deuda_id: x.deuda_id, tipo_pago: tipoPago, importe: imp, cuenta_financiera_id: sCta.value, fecha: iFec.value }, { observacion: texto(iObs.value) });
    },
    resumen: (d) => { const k = d.deuda || {}; return resumenOp([filaDato(adelanto ? 'Adelanto' : 'Pago', pesos(d.importe), 'importe'), filaDato('Sale de', (d.cuenta || {}).nombre),
      filaDato('Saldo de la cuenta después', pesos(d.saldo_cuenta_proyectado), 'saldo_cuenta'), filaDato('Falta pagar hoy', pesos(k.saldo_pendiente)),
      filaDato('Falta pagar después', pesos(k.saldo_pendiente_proyectado), 'saldo_despues'), filaDato('Estado después', (ESTADO[k.estado_proyectado] || [k.estado_proyectado])[0], 'estado_despues')],
      [d.advertencia, 'Se registra como gasto ahora, porque sale dinero.'].filter(Boolean).join(' ')); },
    ok: alTerminar,
  });
}

function anularDeuda(ctx, x, alTerminar) {
  const iMot = entrada('an-motivo', { maxlength: '300' });
  operacion(ctx, {
    id: 'op-anular-deuda', titulo: 'Anular deuda', prev: 'previsualizar_anular_deuda', reg: 'registrar_anular_deuda', textoConfirmar: 'Anular deuda',
    form: el('div', { class: 'stack' }, el('p', { text: x.concepto + ' · ' + pesos(x.importe_original) }), campo('an-motivo', 'Motivo', iMot)),
    datos: () => texto(iMot.value) ? { deuda_id: x.deuda_id, motivo: iMot.value } : { __error: 'Escribí el motivo.' },
    resumen: () => resumenOp([filaDato('Deuda', x.concepto), filaDato('Importe', pesos(x.importe_original))], 'La deuda queda anulada en el historial; no se borra.'),
    ok: alTerminar,
  });
}

// ======================= SUELDOS =======================
function listaEmpleados(ctx, cuerpo) {
  leer(ctx, cuerpo, 'empleados', {}, (d) => {
    const todos = d.empleados || [];
    const l = todos.filter(x => !x.dado_de_baja), bajas = todos.filter(x => x.dado_de_baja); // baja lógica: fuera de la lista principal
    montar(cuerpo,
      !l.length ? vacio('Todavía no hay empleados cargados.') : el('div', { class: 'list', id: 'emp-lista' }, l.map(x => el('a', { class: 'person-card cc-row', href: '#/finanzas/pagar/empleado/' + encodeURIComponent(x.empleado_id), 'data-empleado': x.empleado_id },
        el('span', { class: 'pc-cell' }, el('span', { class: 'person-name', text: x.nombre }),
          el('span', { class: 'person-also', text: 'Sueldo: ' + sueldoTxt(x.sueldo_vigente) + (x.proximo_cambio ? ' · cambia el ' + fmtFecha(x.proximo_cambio.vigente_desde) : '') })),
        el('span', { class: 'pc-cell cc-saldo', text: pesos(x.saldo_pendiente) }),
        el('span', { class: 'pc-cell chips' }, el('span', { class: 'chip ' + (x.obligaciones_pendientes ? 'warn' : ''), text: (x.obligaciones_pendientes || 0) + ' sueldo(s) por pagar' })),
        el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' }))))),
      el('p', { class: 'muted small', text: 'Los sueldos no se generan solos: cada sueldo del período se carga a mano desde la ficha del empleado.' }),
      bajas.length ? el('details', { class: 'emp-bajas', id: 'emp-bajas' }, el('summary', { text: 'Dados de baja (' + bajas.length + ')' }),
        el('div', { class: 'list' }, bajas.map(x => el('a', { class: 'person-card cc-row', href: '#/finanzas/pagar/empleado/' + encodeURIComponent(x.empleado_id), 'data-empleado-baja': x.empleado_id },
          el('span', { class: 'pc-cell' }, el('span', { class: 'person-name', text: x.nombre }),
            el('span', { class: 'person-also', text: 'Dado de baja' + (x.baja && x.baja.fecha ? ' el ' + fmtFecha(x.baja.fecha) : '') + (x.baja && x.baja.motivo ? ' · ' + x.baja.motivo : '') })),
          el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' })))))) : null);
  });
}

function nuevoEmpleado(ctx) {
  const iNom = entrada('em-nombre', { maxlength: '80' });
  const iId = entrada('em-ident', { maxlength: '40', placeholder: 'Legajo, apodo…' });
  const iObs = textoArea('em-obs', 500);
  operacion(ctx, {
    id: 'op-empleado', titulo: 'Nuevo empleado', prev: 'previsualizar_empleado', reg: 'registrar_empleado',
    form: el('div', { class: 'stack' }, el('div', { class: 'form-grid two' }, campo('em-nombre', 'Nombre', iNom), campo('em-ident', 'Identificación (opcional)', iId)), campo('em-obs', 'Observación (opcional)', iObs)),
    datos: () => conOpcionales({ nombre: iNom.value }, { identificacion: texto(iId.value), observacion: texto(iObs.value) }),
    resumen: (d) => { const e = d.empleado || {}; return resumenOp([filaDato('Nombre', e.nombre), e.identificacion ? filaDato('Identificación', e.identificacion) : null], 'Después cargá su sueldo vigente.'); },
    ok: (r) => ctx.ir(r.datos && EMP.test(r.datos.empleado_id || '') ? '#/finanzas/pagar/empleado/' + r.datos.empleado_id : '#/finanzas/pagar/sueldos'),
  });
}

function fichaEmpleado(ctx, cont, eid) {
  const cuerpo = el('div', { class: 'stack', id: 'emp-ficha', 'data-estado': 'cargando', 'data-empleado': eid });
  montar(cont, el('a', { class: 'btn btn-ghost btn-sm back-link', href: '#/finanzas/pagar/sueldos', id: 'emp-volver' }, 'Volver a Sueldos'), cuerpo);
  if (!EMP.test(eid)) return montar(cuerpo, aviso('error', 'El empleado indicado no es válido.', 'EMPLEADO_INEXISTENTE'));
  leer(ctx, cuerpo, 'empleado', { empleado_id: eid }, (d) => {
    const e = d.empleado || {}; const hist = (d.historial_sueldos || []).slice().reverse(); const obls = (d.obligaciones || []).slice().sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
    const recargar = () => ctx.ir('#/finanzas/pagar/empleado/' + encodeURIComponent(eid));
    const bSueldo = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'emp-btn-sueldo', onclick: () => cambiarSueldo(ctx, e, recargar) }, e.sueldo_vigente || hist.length ? 'Cambiar sueldo' : 'Cargar sueldo');
    const baja = e.dado_de_baja === true;
    const bBaja = !baja ? el('button', { type: 'button', class: 'btn btn-danger btn-sm', id: 'emp-btn-baja', onclick: () => darDeBaja(ctx, e, recargar) }, 'Dar de baja') : null;
    const bRest = baja ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'emp-btn-restaurar', onclick: () => restaurar(ctx, e, recargar) }, 'Restaurar empleado') : null;
    const bObl = !baja && e.sueldo_vigente ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'emp-btn-obligacion', onclick: () => cargarObligacion(ctx, e, recargar) }, 'Cargar sueldo del período') : null;
    montar(cuerpo,
      el('div', { class: 'card stack section-card' },
        el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', id: 'emp-nombre', text: e.nombre }), el('p', { class: 'card-sub', text: e.identificacion || 'Empleado' }))),
        el('div', { class: 'prd-tiles', id: 'emp-tiles' }, tile('Sueldo vigente', sueldoTxt(e.sueldo_vigente), 'vigente'), tile('Falta pagar', pesos(e.saldo_pendiente), 'saldo'),
          tile('Sueldos por pagar', String(e.obligaciones_pendientes || 0), 'pendientes'), e.proximo_cambio ? tile('Próximo cambio', sueldoTxt(e.proximo_cambio) + ' desde ' + fmtFecha(e.proximo_cambio.vigente_desde), 'proximo') : null),
        baja ? el('div', { class: 'notice info', id: 'emp-aviso-baja', 'data-codigo': 'EMPLEADO_DADO_DE_BAJA' }, 'Dado de baja' + (e.baja && e.baja.fecha ? ' el ' + fmtFecha(e.baja.fecha) : '') + (e.baja && e.baja.por ? ' por ' + e.baja.por : '') + (e.baja && e.baja.motivo ? '. Motivo: ' + e.baja.motivo : '') + '. Su historial se conserva; no admite operaciones nuevas hasta restaurarlo.') : null,
        el('div', { class: 'row', id: 'emp-acciones' }, bObl, baja ? null : bSueldo, bBaja, bRest)),
      el('h3', { text: 'Sueldos cargados por período' }),
      !obls.length ? vacio('Todavía no hay sueldos cargados.') : el('div', { class: 'list', id: 'emp-obligaciones' }, obls.map(o => el('a', { class: 'person-card cc-row', href: '#/finanzas/pagar/deuda/' + encodeURIComponent(o.deuda_id), 'data-deuda': o.deuda_id, 'data-periodo': o.periodo },
        el('span', { class: 'pc-cell' }, el('span', { class: 'person-name', text: 'Período ' + o.periodo }),
          el('span', { class: 'person-also', text: 'Sueldo ' + pesos(o.importe_original) + (o.adelantado ? ' · adelantos ' + pesos(o.adelantado) : '') + ' · pagado ' + pesos(o.pagado) })),
        el('span', { class: 'pc-cell cc-saldo', text: pesos(o.saldo_pendiente) }),
        el('span', { class: 'pc-cell chips' }, chipEstado(o.estado)),
        el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' }))))),
      el('h3', { text: 'Historial de sueldo' }),
      !hist.length ? vacio('Sin sueldo cargado.') : tabla(['Rige desde', 'Sueldo', 'Periodicidad', 'Motivo'], hist.map(s => ({ dataset: { sueldo: s.sueldo_id },
        celdas: [fmtFecha(s.vigente_desde), pesos(s.importe), PERIODICIDAD_TXT[s.periodicidad] || s.periodicidad, s.motivo || '—'] })), 'emp-historial'),
      el('p', { class: 'muted small', text: 'Un cambio de sueldo rige desde su fecha hacia adelante: los sueldos ya cargados, adelantos y pagos no cambian.' }));
  });
}

// Baja LÓGICA: el empleado deja de aparecer en las listas y no admite operaciones nuevas; sueldos, obligaciones y pagos quedan intactos. Se puede restaurar.
function darDeBaja(ctx, e, alTerminar) {
  const iMot = textoArea('emp-baja-motivo', 200, 'Por ejemplo: cargado por error');
  operacion(ctx, {
    id: 'op-baja-empleado', titulo: 'Dar de baja a ' + e.nombre, reg: 'baja_empleado', textoConfirmar: 'Confirmar baja',
    confirmacion: 'El empleado deja de aparecer en las listas y no se le pueden cargar sueldos nuevos. Su historial (sueldos, deudas y pagos) se conserva y se puede restaurar.',
    form: el('div', { class: 'stack' }, resumenOp([filaDato('Empleado', e.nombre)]), campo('emp-baja-motivo', 'Motivo de la baja', iMot)),
    datos: () => { const m = texto(iMot.value); if (!m || m.length < 3) return { __error: 'Escribí el motivo de la baja.' }; return { empleado_id: e.empleado_id, motivo: m }; },
    ok: () => ctx.ir('#/finanzas/pagar/sueldos'),
  });
}
function restaurar(ctx, e, alTerminar) {
  operacion(ctx, {
    id: 'op-restaurar-empleado', titulo: 'Restaurar a ' + e.nombre, reg: 'restaurar_empleado', textoConfirmar: 'Restaurar',
    confirmacion: 'Vuelve a aparecer en las listas y se le pueden cargar sueldos de nuevo.',
    form: el('div', { class: 'stack' }, resumenOp([filaDato('Empleado', e.nombre)])),
    datos: () => ({ empleado_id: e.empleado_id }),
    ok: alTerminar,
  });
}

function cambiarSueldo(ctx, e, alTerminar) {
  const v = e.sueldo_vigente;
  const iImp = importeInput('su-importe');
  const sPer = selector('su-periodicidad', Object.entries(PERIODICIDAD_TXT), v ? v.periodicidad : 'mensual');
  const iDesde = entrada('su-desde', { type: 'date' }); iDesde.value = hoyART();
  const iMot = entrada('su-motivo', { maxlength: '300', placeholder: v ? 'Aumento, reducción…' : 'Alta' });
  operacion(ctx, {
    id: 'op-sueldo', titulo: v ? 'Cambiar sueldo' : 'Cargar sueldo', prev: 'previsualizar_sueldo', reg: 'registrar_sueldo',
    form: el('div', { class: 'stack' }, el('p', { text: e.nombre + (v ? ' · hoy: ' + sueldoTxt(v) : '') }),
      el('div', { class: 'form-grid two' }, campo('su-importe', 'Nuevo sueldo', iImp), campo('su-periodicidad', 'Periodicidad', sPer), campo('su-desde', 'Rige desde', iDesde), campo('su-motivo', 'Motivo', iMot))),
    datos: () => {
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un sueldo mayor a 0.' };
      if (!texto(iMot.value)) return { __error: 'Escribí el motivo.' };
      return { empleado_id: e.empleado_id, importe: imp, periodicidad: sPer.value, vigente_desde: iDesde.value, motivo: iMot.value };
    },
    resumen: (d) => { const VAR = { aumento: 'Aumento', reduccion: 'Reducción', sueldo_inicial: 'Sueldo inicial', sin_cambio_de_importe: 'Mismo importe' };
      return resumenOp([filaDato('Antes', d.anterior ? sueldoTxt(d.anterior) : '—'), filaDato('Nuevo', sueldoTxt(d.nuevo), 'nuevo'), filaDato('Rige desde', fmtFecha((d.nuevo || {}).vigente_desde)),
        filaDato('Cambio', VAR[d.variacion] || d.variacion, 'variacion')], d.nota); },
    ok: alTerminar,
  });
}

function cargarObligacion(ctx, e, alTerminar) {
  const v = e.sueldo_vigente;
  const tipoInput = { mensual: 'month', semanal: 'week', diario: 'date' }[v.periodicidad] || 'month';
  const iPer = entrada('ob-periodo', { type: tipoInput });
  iPer.value = v.periodicidad === 'mensual' ? hoyART().slice(0, 7) : v.periodicidad === 'diario' ? hoyART() : '';
  const iImp = importeInput('ob-importe');
  const iFec = fechaInput('ob-fecha');
  const iVen = entrada('ob-vencimiento', { type: 'date' });
  const iObs = textoArea('ob-obs', 500);
  operacion(ctx, {
    id: 'op-obligacion', titulo: 'Cargar sueldo del período', prev: 'previsualizar_obligacion_sueldo', reg: 'registrar_obligacion_sueldo',
    form: el('div', { class: 'stack' }, el('p', { text: e.nombre + ' · sueldo vigente ' + sueldoTxt(v) }),
      el('div', { class: 'form-grid two' }, campo('ob-periodo', 'Período', iPer, v.periodicidad === 'semanal' ? 'Formato AAAA-Wss.' : null),
        campo('ob-importe', 'Importe (opcional)', iImp, 'Vacío = sueldo vigente al inicio del período.'), campo('ob-fecha', 'Fecha de carga', iFec), campo('ob-vencimiento', 'Vencimiento (opcional)', iVen)),
      campo('ob-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      if (!texto(iPer.value)) return { __error: 'Indicá el período.' };
      const imp = numero(iImp.value); if (Number.isNaN(imp) || (imp !== null && !(imp > 0))) return { __error: 'El importe tiene que ser mayor a 0 (o dejalo vacío).' };
      return conOpcionales({ empleado_id: e.empleado_id, periodo: iPer.value, fecha: iFec.value }, { importe: imp, vencimiento: texto(iVen.value), observacion: texto(iObs.value) });
    },
    resumen: (d) => { const o = d.obligacion || {}; return resumenOp([filaDato('Período', o.periodo, 'periodo'), filaDato('Sueldo a pagar', pesos(o.importe_original), 'importe'),
      filaDato('Sueldo de referencia', sueldoTxt(o.sueldo_referencia)), o.difiere_de_referencia ? filaDato('Atención', 'El importe es distinto del sueldo de referencia', 'difiere') : null,
      o.vencimiento ? filaDato('Vence', fmtFecha(o.vencimiento)) : null], d.nota); },
    ok: (r) => ctx.ir(r.datos && DEU.test(r.datos.deuda_id || '') ? '#/finanzas/pagar/deuda/' + r.datos.deuda_id : '#/finanzas/pagar/empleado/' + e.empleado_id),
  });
}
