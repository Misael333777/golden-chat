// 03/11 (pedido del usuario): "Compras" en la ficha de Hugo (Cuentas por cobrar). Lo que Golden le compra a Hugo se descuenta de su cuenta.
// Solo Admin Finanzas y solo para Hugo. Se registra como ajuste de crédito (registrar_ajuste, mismo circuito idempotente que "Ajuste")
// con concepto "Compra a Hugo" y el detalle por producto en el motivo. No toca planilla, cierre ni la regla de precio de Hugo.
import { el, montar } from '../../ui.js';
import { pesos, operacion, campo, textoArea, texto, conOpcionales, resumenOp, filaDato } from './comun.js';

export const HUGO_ID = 'PER-MVA9680F-E10EFE';
export const CONCEPTO_COMPRA = 'Compra a Hugo';

// Precios que pasó el usuario el 03/11. Si cambian, se actualizan acá.
const PRODUCTOS = [
  { id: 'aditivos', nombre: 'Aditivos', precio: 7000, unidad: 'unidad', decimales: false },
  { id: 'grasa', nombre: 'Grasa', precio: 2000, unidad: 'kg', decimales: true },
  { id: 'bizcochos', nombre: 'Bizcochos', precio: 3000, unidad: 'unidad', decimales: false },
  { id: 'prepizzas', nombre: 'Pre pizzas', precio: 1700, unidad: 'par', decimales: false },
  { id: 'grisines', nombre: 'Grisines', precio: 3000, unidad: 'kg', decimales: true },
];

const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const leerNum = (v) => { const t = String(v == null ? '' : v).trim().replace(',', '.'); if (t === '') return 0; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const plata = (v) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v);
const r2 = (n) => Math.round(n * 100) / 100;
const cantTxt = (p, q) => NUM.format(q) + ' ' + (p.unidad === 'kg' ? 'kg ' + p.nombre : p.unidad === 'par' ? (q === 1 ? 'par ' : 'pares ') + p.nombre.toLowerCase() : p.nombre);

export function nuevaCompraHugo(ctx, quien, alTerminar) {
  const cant = new Map(PRODUCTOS.map(p => [p.id, 0]));
  const zTotal = el('div', { class: 'prod-total', id: 'cmp-total' });
  const iObs = textoArea('cmp-obs', 300, 'Opcional');
  const lineas = () => PRODUCTOS.filter(p => cant.get(p.id) > 0).map(p => ({ p, q: cant.get(p.id), imp: Math.round(p.precio * cant.get(p.id)) }));
  const total = () => lineas().reduce((s, l) => s + l.imp, 0);
  const pintarTotal = () => montar(zTotal, el('span', { text: 'Total a descontar' }), el('strong', { text: pesos(total()) }));

  const filas = PRODUCTOS.map(p => {
    const i = el('input', { class: 'arm-cant', id: 'cmp-' + p.id, type: 'text', inputmode: 'decimal', 'aria-label': 'Cantidad de ' + p.nombre, value: '0', autocomplete: 'off' });
    const imp = el('span', { class: 'cmp-imp', text: pesos(0) });
    const fijar = (q) => {
      q = p.decimales ? r2(q) : Math.round(q);
      if (!(q > 0)) q = 0;
      cant.set(p.id, q); i.value = NUM.format(q); imp.textContent = pesos(Math.round(p.precio * q)); pintarTotal();
    };
    const menos = el('button', { type: 'button', class: 'arm-btn', 'data-accion': 'menos', 'aria-label': 'Restar uno', text: '−', onclick: () => fijar(Math.max(0, Math.ceil(cant.get(p.id)) - 1)) });
    const mas = el('button', { type: 'button', class: 'arm-btn', 'data-accion': 'mas', 'aria-label': 'Sumar uno', text: '+', onclick: () => fijar(Math.floor(cant.get(p.id)) + 1) });
    i.addEventListener('change', () => { const q = leerNum(i.value); if (!Number.isFinite(q) || q < 0) return fijar(cant.get(p.id)); fijar(q); });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } });
    return el('div', { class: 'cmp-fila', 'data-producto': p.id },
      el('div', { class: 'cmp-prod' }, el('strong', { text: p.nombre }), el('span', { class: 'muted small', text: pesos(p.precio) + (p.unidad === 'kg' ? ' el kilo' : p.unidad === 'par' ? ' el par' : ' c/u') })),
      el('div', { class: 'arm-selector' }, menos, i, mas), imp);
  });
  pintarTotal();

  operacion(ctx, {
    id: 'op-compra', titulo: 'Compras a Hugo', prev: 'previsualizar_ajuste', reg: 'registrar_ajuste',
    form: el('div', { class: 'stack' }, el('p', { class: 'muted small', text: 'Cargá lo que Golden le compró a Hugo. El total se descuenta de su cuenta.' }),
      el('div', { class: 'stack cmp-lista', id: 'cmp-lista' }, filas), zTotal, campo('cmp-obs', 'Observación', iObs)),
    datos: () => {
      const l = lineas();
      if (!l.length) return { __error: 'Sumá al menos un producto.' };
      const motivo = l.map(x => cantTxt(x.p, x.q) + ' ' + plata(x.imp)).join(', ');
      return conOpcionales({ persona_id: quien.persona_id, tipo_ajuste: 'credito', importe: total(), motivo: motivo.slice(0, 300), concepto: CONCEPTO_COMPRA }, { observacion: texto(iObs.value) });
    },
    resumen: (d, c) => resumenOp([filaDato('Compra', c.motivo), filaDato('Se descuenta', '−' + pesos(d.importe_ajuste), 'importe'),
      filaDato('Debe hoy', pesos(d.falta_pagar_actual)), filaDato('Debe después', pesos(d.falta_pagar_proyectado), 'falta_despues'),
      d.saldo_a_favor_proyectado > 0 ? filaDato('Saldo a favor después', pesos(d.saldo_a_favor_proyectado)) : null], 'No mueve dinero de las cajas: solo descuenta de la cuenta de Hugo.'),
    ok: alTerminar,
  });
}
