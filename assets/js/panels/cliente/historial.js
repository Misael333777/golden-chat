// Panel Cliente → Mis pedidos. Lectura: pedido/mis_pedidos (Consultas PROD 'historial_persona', solo lectura).
// La persona, el rol y la ventana de fechas (últimos 45 días y próximos 30) los decide el SERVIDOR. Solo datos propios y operativos:
// pedidos para una fecha, extras con su estado y entregas, y cambios del habitual. Nunca historial administrativo interno.
import { el, montar } from '../../ui.js';
import { leer, cabecera, vacio, chipExtra, pesos, fmtCorta, fmtCualquiera, cant, num, str, DIA_TXT } from './comun.js';

const TIPO_TXT = { solo_por_hoy: 'Solo por ese día', pedido_nuevo: 'Pedido para una fecha', extra: 'Extra' };
const ESTADO_PED = { vigente: ['Vigente', 'ok'], anulado: ['Reemplazado / anulado', 'off'] };
const CAMBIO_TXT = { cambio: 'Cambio del habitual', dia_agregado: 'Día agregado al habitual', habitual_configurado: 'Habitual armado' };
const filtro = { tipo: 'todos' };
const lado = (x) => (x && typeof x === 'object' ? [str(x.producto), typeof x.cantidad === 'number' ? cant(x.cantidad, x.unidad) : null].filter(Boolean).join(' ') || '—' : '—');

export function vistaHistorial(ctx, cont) {
  const sT = el('select', { class: 'select', id: 'hi-tipo', 'aria-label': 'Tipo' }, [['todos', 'Todo'], ['pedidos', 'Pedidos para una fecha'], ['extra', 'Extras'], ['habitual', 'Cambios del habitual']].map(([v, t]) => el('option', { value: v, text: t })));
  sT.value = filtro.tipo;
  const cuerpo = el('div', { class: 'stack', id: 'hi-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Mis pedidos', 'Tus pedidos recientes y próximos, los extras y los cambios de tu habitual.', sT), cuerpo);
  let datos = null;
  const pintar = () => {
    if (!datos) return;
    const peds = (datos.pedidos || []).filter(p => filtro.tipo === 'todos' || (filtro.tipo === 'extra' ? p.tipo === 'extra' : filtro.tipo === 'pedidos' ? p.tipo !== 'extra' : false));
    const cambios = filtro.tipo === 'todos' || filtro.tipo === 'habitual' ? (datos.cambios_habitual || []) : [];
    montar(cuerpo,
      el('p', { class: 'muted small', text: 'Del ' + fmtCorta(datos.desde) + ' al ' + fmtCorta(datos.hasta) + '.' }),
      filtro.tipo !== 'habitual' ? (peds.length ? el('div', { class: 'stack', id: 'hi-pedidos' }, peds.map(tarjeta)) : vacio('No hay pedidos en este período.')) : null,
      cambios.length ? el('div', { class: 'card stack', id: 'hi-cambios' }, el('h3', { text: 'Cambios del habitual' }),
        el('ul', { class: 'pp-lineas' }, cambios.map(c => el('li', { 'data-cambio': c.tipo },
          el('span', { class: 'pp-prod', text: (CAMBIO_TXT[c.tipo] || 'Cambio') + (c.por_golden ? ' (por Golden)' : '') }), el('span', { class: 'muted small', text: fmtCualquiera(c.fecha) }),
          el('span', { class: 'small', text: (c.detalle || []).map(x => (DIA_TXT[x.dia] || x.dia || '') + (x.antes || x.despues ? ': ' + lado(x.antes) + ' → ' + lado(x.despues) : '')).join(' · ') }))))) : (filtro.tipo === 'habitual' ? vacio('No hubo cambios del habitual en este período.') : null));
  };
  sT.addEventListener('change', () => { filtro.tipo = sT.value; pintar(); });
  leer(ctx, cuerpo, 'mis_pedidos', {}, (d) => { datos = d; pintar(); });
}

function tarjeta(p) {
  const esExtra = p.tipo === 'extra';
  const est = esExtra ? chipExtra(p.estado) : el('span', { class: 'chip ' + ((ESTADO_PED[p.estado] || [])[1] || ''), 'data-estado-pedido': p.estado, text: (ESTADO_PED[p.estado] || [p.estado])[0] });
  return el('div', { class: 'card stack ext-card', 'data-pedido': p.referencia || '', 'data-tipo': p.tipo, 'data-estado-ped': p.estado },
    el('div', { class: 'card-head ext-head' }, el('div', { class: 'ext-titulo' }, el('strong', { text: fmtCorta(p.fecha_entrega) + ' · ' + (TIPO_TXT[p.tipo] || p.tipo) }),
      el('span', { class: 'muted small', text: [p.cargado_por_golden ? 'Cargado por Golden' : null, p.referencia ? 'Ref. ' + p.referencia : null].filter(Boolean).join(' · ') })),
      el('span', { class: 'spacer' }), el('span', { class: 'chips' }, est)),
    el('ul', { class: 'pp-lineas' }, (p.lineas || []).map(l => el('li', null, el('span', { class: 'pp-prod', text: str(l.producto) || str(l.detalle_libre) || 'Producto' }),
      el('span', { class: 'pp-cant', text: cant(l.cantidad, l.unidad) }),
      esExtra && (l.cantidad_aprobada !== null && l.cantidad_aprobada !== undefined) ? el('span', { class: 'muted small', text: 'aprobado ' + num(l.cantidad_aprobada) + (l.cantidad_entregada !== null && l.cantidad_entregada !== undefined ? ' · entregado ' + num(l.cantidad_entregada) : '') }) : null))),
    typeof p.importe === 'number' ? el('p', { class: 'small' }, el('strong', { text: 'Importe: ' }), pesos(p.importe)) : null,
    p.motivo_rechazo ? el('p', { class: 'small' }, el('strong', { text: 'Motivo del rechazo: ' }), p.motivo_rechazo) : null,
    p.motivo_anulacion ? el('p', { class: 'muted small', text: p.motivo_anulacion }) : null);
}
