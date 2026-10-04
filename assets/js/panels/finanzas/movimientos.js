// Admin Finanzas → Movimientos (solo lectura). Consolidado de movimientos de dinero (movimientos_financieros) y de cuenta corriente.
// Filtros por período, cuenta, tipo y paginación; todo se filtra en el backend.
import { el, montar } from '../../ui.js';
import { pesos, fmtFecha, cabecera, tabla, vacio, leer, campo, entrada, selector, hoyART } from './comun.js';

const TIPOS = [['', 'Todos'], ['cobro', 'Cobros'], ['gasto', 'Gastos'], ['transferencia', 'Transferencias'], ['anulacion', 'Anulaciones'], ['cargo', 'Cargos (cuenta corriente)'],
  ['pago', 'Pagos (cuenta corriente)'], ['ajuste', 'Ajustes'], ['reversion', 'Reversiones'], ['saldo_inicial', 'Saldos iniciales']];
const RES_TXT = { ingreso: 'Ingreso', gasto: 'Gasto', neutro: 'Sin impacto' };
const f = { desde: null, hasta: null, cuenta: '', tipo: '', pagina: 1 };

export function vistaMovimientos(ctx, cont) {
  if (!f.desde) { f.hasta = hoyART(); f.desde = f.hasta.slice(0, 8) + '01'; }
  const iD = entrada('mv-desde', { type: 'date' }); iD.value = f.desde;
  const iH = entrada('mv-hasta', { type: 'date' }); iH.value = f.hasta;
  const sT = selector('mv-tipo', TIPOS, f.tipo);
  const sC = selector('mv-cuenta', [['', 'Todas las cuentas']]);
  const zona = el('div', { class: 'stack', id: 'mv-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Movimientos', 'Todo lo registrado: dinero (cobros, gastos, transferencias) y cuenta corriente (cargos, pagos, ajustes, reversiones). Solo lectura.'),
    el('div', { class: 'form-grid two', id: 'mv-filtros' }, campo('mv-desde', 'Desde', iD), campo('mv-hasta', 'Hasta', iH), campo('mv-tipo', 'Tipo', sT), campo('mv-cuenta', 'Cuenta', sC)), zona);
  const cargar = () => {
    const c = { fecha_desde: f.desde, fecha_hasta: f.hasta, pagina: f.pagina };
    if (f.tipo) c.tipo_movimiento = f.tipo;
    if (f.cuenta) c.cuenta_id = f.cuenta;
    leer(ctx, zona, 'movimientos', c, (d) => {
      if (sC.options.length === 1) for (const k of d.cuentas || []) sC.appendChild(el('option', { value: k.cuenta_id, text: k.nombre }));
      sC.value = f.cuenta;
      const l = d.items || [];
      const pag = (n, txt, id) => el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id, disabled: n < 1 || n > (d.total_paginas || 1), onclick: () => { f.pagina = n; cargar(); } }, txt);
      montar(zona,
        !l.length ? vacio('No hay movimientos con estos filtros.') : tabla(['Concepto', 'Fecha', 'Tipo', 'Cuenta', 'Persona', 'Importe'], l.map(m => ({ dataset: { mov: m.id, fuente: m.fuente, tipo: m.tipo },
          celdas: [m.concepto || m.categoria || '—', fmtFecha(m.fecha), el('span', null, m.tipo_label || m.tipo, ' ', el('span', { class: 'chip', text: RES_TXT[m.resultado] || (m.fuente === 'cuenta_corriente' ? 'Cuenta corriente' : '—') })),
            [m.cuenta_origen, m.cuenta_destino].filter(Boolean).join(' → ') || '—', m.persona || '—', pesos(m.importe)] })), 'mv-items'),
        el('div', { class: 'row', id: 'mv-paginas', 'data-pagina': String(d.pagina || 1), 'data-total-paginas': String(d.total_paginas || 1) },
          pag((d.pagina || 1) - 1, 'Anterior', 'mv-anterior'), el('span', { class: 'muted small', text: 'Página ' + (d.pagina || 1) + ' de ' + (d.total_paginas || 1) + ' · ' + (d.total ?? l.length) + ' movimiento(s)' }),
          pag((d.pagina || 1) + 1, 'Siguiente', 'mv-siguiente')),
        el('p', { class: 'muted small', text: 'Las transferencias no son ingreso ni gasto. En cuenta corriente, el importe negativo reduce lo que la persona debe.' }));
    });
  };
  const cambio = () => { f.desde = iD.value; f.hasta = iH.value; f.tipo = sT.value; f.cuenta = sC.value; f.pagina = 1; cargar(); };
  for (const n of [iD, iH, sT, sC]) n.addEventListener('change', cambio);
  cargar();
}
