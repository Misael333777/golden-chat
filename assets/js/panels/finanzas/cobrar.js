// Admin Finanzas → Cuentas por cobrar (Cuenta Corriente PROD). Desde la ficha: registrar cobro, ajuste y revertir (Escrituras PROD).
// Lista: acción cuentas_cobrar (conciliación global: saldos por persona). Ficha: acción cuenta_persona (historial con saldo después de cada movimiento).
// Una persona con varios roles tiene UNA sola cuenta. Nada se recalcula acá.
import { el, montar, aviso, conBloqueo } from '../../ui.js';
import { TIPO, pesos, fmtFecha, sinTilde, estadoCuenta, tile, cabecera, tabla, vacio, leer, operacion, campo, entrada, importeInput, textoArea, selector, numero, texto, conOpcionales, resumenOp, filaDato, conceptoMov } from './comun.js';
import { nuevoCobro } from './dinero.js';
import { abrirBoleta } from './boleta.js';

const filtro = { texto: '', estado: 'todos' };
const TIPO_TXT = { saldo_inicial: 'Saldo inicial', cargo: 'Cargo', pago: 'Pago', ajuste_debito: 'Ajuste (débito)', ajuste_credito: 'Ajuste (crédito)', reversion: 'Reversión', anulacion: 'Anulación', otro: 'Movimiento' };
const ORIGEN_TXT = { extras_cola_finanzas: 'Extra entregado', manual_admin_finanzas: 'Carga manual', pago_admin_finanzas: 'Cobro', ajuste_admin_finanzas: 'Ajuste', reversion_admin_finanzas: 'Reversión', cierre_produccion: 'Cargo de cierre' };
const ROL_TXT = { cliente: 'Cliente', repartidor: 'Repartidor' };

export function vistaCobrar(ctx, cont) {
  const iT = el('input', { class: 'input', id: 'cc-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar persona…', 'aria-label': 'Buscar', value: filtro.texto });
  const sE = el('select', { class: 'select', id: 'cc-estado', 'aria-label': 'Estado' }, el('option', { value: 'todos', text: 'Todas' }),
    el('option', { value: 'debe', text: 'Deben' }), el('option', { value: 'a_favor', text: 'Con saldo a favor' }), el('option', { value: 'al_dia', text: 'Al día' }));
  sE.value = filtro.estado;
  const cuerpo = el('div', { class: 'stack', id: 'cc-lista', 'data-estado': 'cargando' });
  // 27/10 (pedido del usuario): montos ocultos al entrar; el ojo los muestra/oculta sin volver a pedir datos.
  let mostrar = false;
  const $ = (v) => (mostrar ? pesos(v) : '$ ••••••');
  const bOjo = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cc-ojo', 'aria-pressed': 'false', text: '👁 Mostrar montos' });
  bOjo.addEventListener('click', () => { mostrar = !mostrar; bOjo.textContent = mostrar ? '🙈 Ocultar montos' : '👁 Mostrar montos'; bOjo.setAttribute('aria-pressed', String(mostrar)); pintar(); });
  montar(cont, buscadorCliente(ctx), cabecera('Cuentas por cobrar', 'Saldo de cuenta corriente de clientes y repartidores con movimientos. Ordenado por mayor deuda. Abrí una persona para cobrar, ajustar o revertir.'),
    el('div', { class: 'ped-filtros' }, el('div', { class: 'field search-field' }, iT), sE, bOjo), cuerpo);
  let datos = null;
  const pintar = () => {
    if (!datos) return;
    const q = sinTilde(filtro.texto.trim());
    const todas = (datos.cuentas || []).slice().sort((a, b) => b.saldo - a.saldo || (a.nombre || '').localeCompare(b.nombre || ''));
    const vis = todas.filter(c => (filtro.estado === 'todos' || estadoCuenta(c.saldo).k === filtro.estado) && (!q || sinTilde(c.nombre + ' ' + c.persona_id).includes(q)));
    const t = datos.totales || {};
    montar(cuerpo,
      el('div', { class: 'prd-tiles', id: 'cc-totales' }, tile('Total por cobrar', $(t.falta_pagar), 'por_cobrar'), tile('Saldo a favor de clientes', $(t.saldo_a_favor), 'a_favor'), tile('Neto', $(t.neto), 'neto')),
      !vis.length ? vacio(todas.length ? 'No hay cuentas que coincidan con los filtros.' : 'Todavía no hay cuentas con movimientos.')
        : el('div', { class: 'list', id: 'cc-cuentas' }, vis.map(c => {
          const e = estadoCuenta(c.saldo);
          return el('a', { class: 'person-card cc-row', href: '#/finanzas/cobrar/' + encodeURIComponent(c.persona_id), 'data-persona': c.persona_id, 'data-estado-cuenta': e.k },
            el('span', { class: 'pc-cell' }, el('span', { class: 'person-name', text: c.nombre || c.persona_id }), el('span', { class: 'person-also', text: (c.movimientos ?? '—') + ' movimiento(s)' })),
            el('span', { class: 'pc-cell cc-saldo', text: c.saldo > 0 ? $(c.falta_pagar) : c.saldo < 0 ? $(c.saldo_a_favor) : $(0) }),
            el('span', { class: 'pc-cell chips' }, el('span', { class: 'chip ' + e.chip, text: e.txt })),
            el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' })));
        })),
      el('p', { class: 'muted small', text: 'Calculado: ' + fmtFecha(datos.generado_al) + ' · Las personas sin movimientos no aparecen en esta lista.' }));
  };
  iT.addEventListener('input', () => { filtro.texto = iT.value; pintar(); });
  sE.addEventListener('change', () => { filtro.estado = sE.value; pintar(); });
  leer(ctx, cuerpo, 'cuentas_cobrar', {}, (d) => { datos = d; pintar(); });
}

// 24/10: buscar CUALQUIER cliente o repartidor (aunque no tenga movimientos) para abrir su ficha: cargar la primera deuda, cobrar o sacar la boleta.
// Solo consulta cuando se toca "Buscar" (1 ejecucion). Usa la busqueda existente de Finanzas (buscar_personas).
function buscadorCliente(ctx) {
  const iBus = el('input', { class: 'input', id: 'cc-buscar-cliente', type: 'search', maxlength: '60', placeholder: 'Nombre del cliente…', 'aria-label': 'Buscar cliente' });
  const bBus = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'cc-btn-buscar-cliente' }, 'Buscar');
  const zRes = el('div', { class: 'stack', id: 'cc-buscar-resultados' });
  bBus.addEventListener('click', conBloqueo(bBus, async () => {
    if (iBus.value.trim().length < 2) return montar(zRes, el('p', { class: 'muted small', text: 'Escribí al menos 2 letras.' }));
    const res = await ctx.pedir(TIPO, 'buscar_personas', { texto: iBus.value.trim() });
    if (!zRes.isConnected) return;
    if (res.falla) return montar(zRes, el('p', { class: 'notice error', text: 'No pudimos buscar. Reintentá.' }));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(zRes, el('p', { class: 'notice error', 'data-codigo': res.r.codigo, text: res.r.codigo === 'FILTRO_INVALIDO' ? 'Escribí al menos 2 letras.' : (res.r.mensaje || 'No se pudo buscar.') }));
    const l = (res.r.datos || {}).personas || [];
    montar(zRes, !l.length ? el('p', { class: 'muted small', text: 'Sin resultados con cuenta de cliente o repartidor.' })
      : el('div', { class: 'list' }, l.map(p => el('a', { class: 'btn btn-ghost btn-sm', href: '#/finanzas/cobrar/' + encodeURIComponent(p.persona_id), 'data-abrir-persona': p.persona_id },
        p.nombre + ((p.roles || []).length ? ' · ' + p.roles.map(r => ROL_TXT[r] || r).join(', ') : '')))));
  }, 'Buscando…'));
  iBus.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bBus.click(); } });
  return el('div', { class: 'card stack section-card', id: 'cc-buscador' },
    el('div', null, el('h2', { class: 'section-title', text: 'Buscar cliente' }), el('p', { class: 'card-sub', text: 'Para abrir la cuenta de cualquier cliente o repartidor, aunque todavía no tenga movimientos (cargar deuda, cobrar o sacar la boleta).' })),
    el('div', { class: 'row' }, iBus, bBus), zRes);
}

export function vistaCuenta(ctx, cont, pid) {
  const cuerpo = el('div', { class: 'stack', id: 'cc-ficha', 'data-estado': 'cargando', 'data-persona': pid });
  montar(cont, el('a', { class: 'btn btn-ghost btn-sm back-link', href: '#/finanzas/cobrar', id: 'cc-volver' }, 'Volver a Cuentas por cobrar'), cuerpo);
  if (!/^PER-[A-Z0-9]{4,20}-[A-Z0-9]{4,12}$/.test(pid || '')) return montar(cuerpo, aviso('error', 'La persona indicada no es válida.', 'PERSONA_ID_INVALIDO'));
  leer(ctx, cuerpo, 'cuenta_persona', { persona_id: pid }, (d) => {
    const p = d.persona || {};
    const e = estadoCuenta(d.saldo);
    const movs = (d.movimientos || []).slice().reverse(); // más nuevos primero
    const recargar = () => ctx.ir('#/finanzas/cobrar/' + encodeURIComponent(pid));
    const quien = { persona_id: p.persona_id || pid, nombre: p.nombre || pid };
    const bCobro = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'cc-btn-cobro' }, 'Registrar cobro');
    bCobro.addEventListener('click', conBloqueo(bCobro, () => nuevoCobro(ctx, quien, recargar), 'Abriendo…'));
    const bAjuste = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cc-btn-ajuste', onclick: () => nuevoAjuste(ctx, quien, recargar) }, 'Ajuste');
    const bBoleta = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cc-btn-boleta', onclick: () => abrirBoleta(ctx, quien) }, 'Boleta');
    const revertible = (m) => REVERSIBLES.includes(m.tipo) && !m.revertido && !m.revierte_ccm_id;
    montar(cuerpo,
      el('div', { class: 'card stack section-card' },
        el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', id: 'cc-nombre', text: p.nombre || p.persona_id }),
          el('p', { class: 'card-sub', text: (p.roles || []).map(r => ROL_TXT[r] || r).join(' y ') + ' · una sola cuenta corriente por persona' })),
          el('span', { class: 'spacer' }), el('span', { class: 'chips' }, el('span', { class: 'chip ' + e.chip, 'data-estado-cuenta': e.k, text: e.txt }))),
        el('div', { class: 'prd-tiles', id: 'cc-saldos' }, tile('Falta pagar', pesos(d.falta_pagar), 'falta_pagar'), tile('Saldo a favor', pesos(d.saldo_a_favor), 'saldo_a_favor'),
          tile('Último pago', d.ultimo_pago ? pesos(d.ultimo_pago.importe) + ' · ' + fmtFecha(d.ultimo_pago.fecha) : 'Sin pagos', 'ultimo_pago')),
        el('div', { class: 'row', id: 'cc-acciones' }, bCobro, bAjuste, bBoleta)),
      (d.alertas || []).length ? aviso('error', 'El historial tiene datos a revisar: ' + d.alertas.map(a => a.codigo).join(', ') + '.', 'ALERTA_CUENTA') : null,
      !movs.length ? vacio('Esta cuenta no tiene movimientos.')
        : tabla(['Fecha', 'Movimiento', 'Concepto', 'Importe', 'Saldo después', 'Acción'], movs.map(m => ({ dataset: { ccm: m.ccm_id, tipo: m.tipo, revertido: m.revertido ? 'si' : 'no' },
          celdas: [fmtFecha(m.fecha), el('span', null, TIPO_TXT[m.tipo] || 'Movimiento', m.revertido ? el('span', { class: 'chip off', text: 'Revertido' }) : null, m.revierte_ccm_id ? el('span', { class: 'chip', text: 'Revierte otro' }) : null,
              m.registrado_por ? el('small', { class: 'muted', 'data-registro': 'si', text: ' · cargó ' + m.registrado_por + horaReg(m.creado_en) }) : null),
            [...new Set([m.concepto ? conceptoMov(m, false) : null, ORIGEN_TXT[m.origen]].filter(Boolean))].concat(m.motivo ? ['Motivo: ' + m.motivo] : []).join(' · ') || '—',
            (m.importe_firmado > 0 ? '+' : '−') + pesos(Math.abs(m.importe_firmado)), pesos(m.saldo_despues),
            revertible(m) ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'revertir', onclick: () => revertir(ctx, m, recargar) }, 'Revertir') : '—'] })), 'cc-movimientos'),
      el('p', { class: 'muted small', text: '“+” aumenta lo que la persona debe; “−” lo reduce o genera saldo a favor. Los movimientos no se editan ni se borran: una corrección agrega una reversión o un ajuste.' }));
  });
}

// Saldo inicial, cargos y ajustes se pueden revertir (los cobros no: tienen dinero asociado). La reversión agrega un movimiento; nada se borra.
// 30/10: quién cargó cada movimiento (nombre; 'Sistema' para el cobro automático) y a qué hora (Argentina).
const horaReg = (iso) => { const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return ''; const d = new Date(t - 3 * 3600e3).toISOString(); return ' el ' + d.slice(8, 10) + '/' + d.slice(5, 7) + ' ' + d.slice(11, 16); };
const REVERSIBLES = ['saldo_inicial', 'cargo', 'ajuste_debito', 'ajuste_credito'];
function nuevoAjuste(ctx, quien, alTerminar) {
  const sTipo = selector('aj-tipo', [['debito', 'Débito (aumenta lo que debe)'], ['credito', 'Crédito (reduce lo que debe)']]);
  const iImp = importeInput('aj-importe');
  const iMot = entrada('aj-motivo', { maxlength: '300' });
  const iCon = entrada('aj-concepto', { maxlength: '120' });
  const iObs = textoArea('aj-obs', 500);
  operacion(ctx, {
    id: 'op-ajuste', titulo: 'Ajuste de cuenta corriente', prev: 'previsualizar_ajuste', reg: 'registrar_ajuste',
    form: el('div', { class: 'stack' }, el('p', { text: quien.nombre }), el('div', { class: 'form-grid two' }, campo('aj-tipo', 'Tipo', sTipo), campo('aj-importe', 'Importe', iImp),
      campo('aj-motivo', 'Motivo', iMot), campo('aj-concepto', 'Concepto (opcional)', iCon)), campo('aj-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un importe mayor a 0.' };
      if (!texto(iMot.value)) return { __error: 'Escribí el motivo del ajuste.' };
      return conOpcionales({ persona_id: quien.persona_id, tipo_ajuste: sTipo.value, importe: imp, motivo: iMot.value }, { concepto: texto(iCon.value), observacion: texto(iObs.value) });
    },
    resumen: (d) => resumenOp([filaDato('Persona', quien.nombre), filaDato('Ajuste', (d.tipo_ajuste === 'debito' ? '+' : '−') + pesos(d.importe_ajuste), 'importe'),
      filaDato('Debe hoy', pesos(d.falta_pagar_actual)), filaDato('Debe después', pesos(d.falta_pagar_proyectado), 'falta_despues'),
      d.saldo_a_favor_proyectado > 0 ? filaDato('Saldo a favor después', pesos(d.saldo_a_favor_proyectado)) : null], 'Un ajuste no mueve dinero: solo corrige la cuenta corriente.'),
    ok: alTerminar,
  });
}
function revertir(ctx, m, alTerminar) {
  const iMot = entrada('rv-motivo', { maxlength: '300', placeholder: 'Ej.: cargo duplicado' });
  const iObs = textoArea('rv-obs', 500);
  operacion(ctx, {
    id: 'op-revertir', titulo: 'Revertir movimiento', reg: 'revertir_movimiento', textoConfirmar: 'Revertir movimiento',
    form: el('div', { class: 'stack' }, resumenOp([filaDato('Movimiento', (TIPO_TXT[m.tipo] || m.tipo) + ' · ' + fmtFecha(m.fecha)), filaDato('Concepto', m.concepto),
      filaDato('Importe', pesos(m.importe_firmado))]), campo('rv-motivo', 'Motivo', iMot), campo('rv-obs', 'Observación (opcional)', iObs)),
    confirmacion: 'Se agrega un movimiento inverso. El original queda en el historial marcado como revertido.',
    datos: () => texto(iMot.value) ? conOpcionales({ ccm_id: m.ccm_id, motivo: iMot.value }, { observacion: texto(iObs.value) }) : { __error: 'Escribí el motivo de la reversión.' },
    ok: alTerminar,
  });
}
