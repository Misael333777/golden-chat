// Admin Finanzas → Inicio. Todo lo que se muestra lo calcula el backend (Consultas PROD): saldos por cuenta desde movimientos,
// ingresos / gastos / resultado neto del mes (las transferencias no cuentan), cuentas por cobrar y por pagar, revisiones y extras pendientes.
import { el, montar } from '../../ui.js';
import { pesos, fmtFecha, tile, tabla, vacio, leer, hoyART } from './comun.js';

export function vistaInicio(ctx, cont) {
  const hoy = hoyART();
  const desde = hoy.slice(0, 8) + '01';
  const periodo = el('div', { class: 'stack', id: 'fin-periodo', 'data-estado': 'cargando' });
  const cuerpo = el('div', { class: 'stack', id: 'fin-resumen', 'data-estado': 'cargando' });
  const atajo = (id, titulo, texto, boton, clase) => el('div', { class: 'shortcut', 'data-atajo': 'fin-' + id },
    el('span', { class: 'shortcut-ico', 'aria-hidden': 'true' }), el('h3', { text: titulo }), el('p', { class: 'muted small', text: texto }),
    el('a', { class: 'btn ' + clase, href: '#/finanzas/' + id }, boton));
  montar(cont, el('div', { class: 'card stack card-welcome' },
    el('div', null, el('span', { class: 'eyebrow', text: 'Resumen' }), el('h2', { text: 'Inicio' }),
      el('p', { class: 'muted', text: 'Mes en curso (' + fmtFecha(desde) + ' al ' + fmtFecha(hoy) + '). Todo se calcula desde los movimientos registrados.' })),
    periodo, cuerpo,
    el('div', { class: 'shortcut-grid' },
      atajo('cobros', 'Registrar cobro', 'Dinero que entra de un cliente o repartidor.', 'Nuevo cobro', 'btn-primary'),
      atajo('gastos', 'Registrar gasto', 'Dinero que sale por un gasto.', 'Nuevo gasto', 'btn-ghost'),
      atajo('transferencias', 'Transferir', 'Mover dinero entre cuentas propias.', 'Nueva transferencia', 'btn-ghost'),
      atajo('pendientes', 'Pendientes', 'Lo que necesita revisión.', 'Ir a Pendientes', 'btn-ghost'))));
  leer(ctx, periodo, 'resumen_periodo', { fecha_desde: desde, fecha_hasta: hoy }, (d) => {
    const cuentas = d.cuentas || [];
    const recientes = d.movimientos_recientes || [];
    montar(periodo,
      el('div', { class: 'prd-tiles', id: 'fin-tiles' },
        tile('Saldo disponible', pesos(d.saldo_total_disponible), 'disponible'), tile('Ingresos del mes', pesos(d.ingresos), 'ingresos'),
        tile('Gastos del mes', pesos(d.gastos), 'gastos'), tile('Resultado neto', pesos(d.resultado_neto), 'neto'),
        tile('Cuentas por pagar', pesos(d.cuentas_por_pagar), 'por_pagar'), tile('Revisiones pendientes', String(d.revisiones_pendientes ?? 0), 'revisiones')),
      el('p', { class: 'muted small', text: 'Las transferencias entre cuentas no son ingreso ni gasto. Los sueldos cuentan como gasto cuando se pagan (adelantos y pagos), no al cargarlos.' }),
      el('h3', { text: 'Saldo por cuenta' }),
      !cuentas.length ? vacio('No hay cuentas financieras.') : tabla(['Cuenta', 'Estado', 'Saldo'], cuentas.map(c => ({ dataset: { cuenta: c.cuenta_id },
        celdas: [c.nombre, c.activa ? 'Activa' : 'Inactiva', pesos(c.saldo)] })), 'fin-cuentas'),
      el('h3', { text: 'Movimientos recientes' }),
      !recientes.length ? vacio('Todavía no hay movimientos de dinero.') : tabla(['Concepto', 'Fecha', 'Tipo', 'Cuenta', 'Importe'], recientes.map(m => ({ dataset: { mov: m.movimiento_id },
        celdas: [m.concepto || m.categoria || '—', fmtFecha(m.fecha), m.tipo_label || m.tipo, [m.cuenta_origen, m.cuenta_destino].filter(Boolean).join(' → ') || '—', pesos(m.monto)] })), 'fin-recientes'));
  });
  leer(ctx, cuerpo, 'resumen_finanzas', {}, (d) => {
    montar(cuerpo,
      el('div', { class: 'prd-tiles', id: 'fin-tiles-cc' },
        tile('Total por cobrar', pesos(d.total_falta_pagar), 'por_cobrar'), tile('Saldo a favor de clientes', pesos(d.total_saldo_a_favor), 'a_favor'),
        tile('Extras pendientes de registrar', String(d.extras_pendientes ?? 0), 'extras_pendientes'),
        tile('Alertas de conciliación', String((d.inconsistencias || 0) + (d.pagos_no_conciliados || 0) + (d.extras_en_error || 0)), 'alertas')),
      el('p', { class: 'muted small', text: 'Cuenta corriente calculada: ' + fmtFecha(d.generado_al) }));
  });
}
