// Panel Cliente → Mi cuenta. SOLO LECTURA: cuenta/mi_cuenta (Cuenta corriente PROD, ruta separada de Admin Finanzas).
// El cliente no registra pagos, ajustes ni reversiones. Los saldos los calcula el backend.
import { el, montar } from '../../ui.js';
import { leer, cabecera, vacio, tile, pesos, fmtCualquiera, raiz } from './comun.js';

const TIPO_TXT = { cargo: 'Cargo', pago: 'Pago', ajuste: 'Ajuste', reversion: 'Reversión', saldo_inicial: 'Saldo inicial' };

export function vistaCuenta(ctx, cont) {
  const cuerpo = el('div', { class: 'stack', id: 'cta-cuerpo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Mi cuenta', 'Lo que falta pagar y los movimientos de tu cuenta. Para pagar o consultar algo, hablá con Golden.'), cuerpo);
  leer(ctx, cuerpo, 'mi_cuenta', {}, (d) => {
    const l = d.movimientos || [];
    montar(cuerpo,
      el('div', { class: 'prd-tiles', id: 'cta-tiles' }, tile('Falta pagar', pesos(d.falta_pagar || 0), 'falta_pagar'), tile('Saldo a favor', pesos(d.saldo_a_favor || 0), 'saldo_a_favor')),
      d.actualizado_al ? el('p', { class: 'muted small', text: 'Actualizado: ' + fmtCualquiera(d.actualizado_al) }) : null,
      el('h3', { text: 'Movimientos' }),
      !l.length ? vacio('Todavía no hay movimientos en tu cuenta.') : el('div', { class: 'tabla rep-tabla', id: 'cta-movs' },
        el('div', { class: 'rep-fila rep-head rep-c4' }, ['Concepto', 'Fecha', 'Importe', 'Saldo'].map(c => el('span', { text: c }))),
        l.map(m => el('div', { class: 'rep-fila rep-c4', 'data-tipo': m.tipo || '' },
          el('span', { text: (m.concepto || TIPO_TXT[m.tipo] || 'Movimiento') }),
          el('span', null, el('span', { class: 'pc-label', text: 'Fecha: ' }), fmtCualquiera(m.fecha)),
          el('span', null, el('span', { class: 'pc-label', text: 'Importe: ' }), pesos(m.importe)),
          el('span', null, el('span', { class: 'pc-label', text: 'Saldo: ' }), pesos(m.saldo_despues))))),
      d.hay_mas ? el('p', { class: 'muted small', text: 'Se muestran los movimientos más recientes. Si necesitás el detalle completo, pedíselo a Golden.' }) : null,
      el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost', href: raiz() + '/soporte' }, 'Consultar a Golden sobre mi cuenta')));
  });
}
