// Panel Repartidor → Mis clientes (solo lectura, H8: repartidor/mis_clientes → Consultas PROD 'clientes_repartidor').
// El repartidor sale SIEMPRE de la sesión. Muestra solo la asignación habitual vigente: nombre, teléfono si existe y días con salida.
// Nunca persona_id, GLD, lista de precio, precios, deudas ni datos de Finanzas. El repartidor no modifica nada de sus clientes.
import { el, montar } from '../../ui.js';
import { leer, cabecera, vacio, DIA_TXT, DIAS } from './comun.js';

const salidaTxt = (s) => (typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sin salida');

export function vistaMisClientes(ctx, cont) {
  const cuerpo = el('div', { class: 'stack', id: 'mc-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Mis clientes', 'Los clientes que tenés asignados en el reparto habitual, con sus días y salida. Si algo no coincide, avisale a Golden.'), cuerpo);
  leer(ctx, cuerpo, 'mis_clientes', {}, (d) => {
    const l = d.clientes || [];
    if (!l.length) return montar(cuerpo, vacio('No tenés clientes asignados en el reparto habitual.'));
    montar(cuerpo, el('p', { class: 'muted small', text: l.length + ' cliente(s).' }),
      el('div', { class: 'hab-dias', id: 'mc-clientes' }, l.map((c, i) => el('div', { class: 'hab-dia', 'data-cliente': String(i + 1) },
        el('div', { class: 'hab-dia-head' }, el('strong', { text: c.nombre || 'Cliente' }), c.telefono ? el('a', { class: 'small mc-tel', href: 'tel:' + String(c.telefono).replace(/[^+\d]/g, ''), text: c.telefono }) : null),
        el('ul', { class: 'pp-lineas' }, (c.dias || []).slice().sort((a, b) => DIAS.indexOf(a.dia_semana) - DIAS.indexOf(b.dia_semana)).map(x => el('li', { 'data-dia': x.dia_semana },
          el('span', { class: 'pp-prod', text: DIA_TXT[x.dia_semana] || x.dia_semana }), el('span', { class: 'chip', text: salidaTxt(x.salida) }))))))),
      el('p', { class: 'muted small', text: 'Solo lectura: las asignaciones y salidas las define Golden.' }));
  });
}
