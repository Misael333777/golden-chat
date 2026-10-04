// Admin Finanzas → Extras (cola financiera producida por Admin General). Admin Finanzas confirma MANUALMENTE cada evento:
// ver detalle (extra_evento) → previsualizar_extra → registrar_extra. El backend verifica finanzas_operacion_id contra la cola y que no exista
// el cargo (no hay doble cargo con el consumidor automático). Admin Finanzas no modifica cantidades, entregas, precios ni aprobaciones.
import { el, montar, conBloqueo, toast } from '../../ui.js';
import { pesos, fmtFecha, tile, cabecera, tabla, leer, operacion, resumenOp, filaDato, TIPO } from './comun.js';

export function vistaExtras(ctx, cont) {
  const cuerpo = el('div', { class: 'stack', id: 'fx-cuerpo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Extras', 'Cargos de extras entregados. Revisá cada uno y confirmalo para que pase a la cuenta corriente.'), cuerpo);
  leer(ctx, cuerpo, 'extras_finanzas', {}, (d) => {
    const fila = (x, extra, accion) => ({ dataset: { fin: x.fin || '' }, celdas: [x.nombre || x.persona_id || '—', x.pedido_id || '—', pesos(x.importe), extra(x)].concat(accion ? [accion(x)] : []) });
    const bloque = (titulo, id, lista, col, extra, textoVacio, accion) => el('div', { class: 'stack' }, el('h3', { text: titulo + ' (' + lista.length + ')' }),
      lista.length ? tabla(['Persona', 'Pedido', 'Importe', col].concat(accion ? ['Acción'] : []), lista.map(x => fila(x, extra, accion)), id) : el('p', { class: 'muted small', text: textoVacio }));
    const revisar = (x) => { const b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'revisar-extra' }, 'Revisar'); b.addEventListener('click', conBloqueo(b, () => revisarExtra(ctx, x.fin), 'Abriendo…')); return b; };
    montar(cuerpo,
      el('div', { class: 'prd-tiles', id: 'fx-totales' }, tile('Pendientes de registrar', String((d.pendientes || []).length), 'pendientes'), tile('Registrados', String(d.registrados ?? '—'), 'registrados'),
        tile('Con error / revisión', String((d.en_error || []).length), 'error')),
      bloque('Pendientes de registrar', 'fx-pendientes', d.pendientes || [], 'Generado', (x) => fmtFecha(x.creado_en), 'No hay extras pendientes de registrar.', revisar),
      bloque('Con error o en revisión', 'fx-error', d.en_error || [], 'Motivo', (x) => x.motivo || '—', 'No hay extras con error.'),
      (d.excluidos_corte || []).length ? bloque('Excluidos por fecha de corte', 'fx-excluidos', d.excluidos_corte, 'Motivo', (x) => x.motivo || '—', '') : null,
      el('p', { class: 'muted small', text: 'Calculado: ' + fmtFecha(d.generado_al) + '. Los extras con error los resuelve Admin General.' + (d.fixtures_aparte ? ' Hay ' + d.fixtures_aparte + ' dato(s) de prueba informados aparte.' : '') }));
  });
}

async function revisarExtra(ctx, fin) {
  const res = await ctx.pedir(TIPO, 'extra_evento', { finanzas_operacion_id: fin });
  if (res.falla) return toast('No pudimos leer el extra. Reintentá.');
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return toast(res.r.mensaje || 'No se pudo leer el extra.');
  const x = res.r.datos || {};
  const lineas = x.lineas || [];
  operacion(ctx, {
    id: 'op-extra', titulo: 'Confirmar extra', prev: 'previsualizar_extra', reg: 'registrar_extra', textoConfirmar: 'Registrar cargo',
    form: el('div', { class: 'stack', 'data-extra': fin },
      resumenOp([filaDato('Persona', x.persona_nombre || x.persona_id, 'persona'), filaDato('Pedido', x.pedido_id), filaDato('Entregado', fmtFecha(x.fecha_entrega)),
        filaDato('Lista de precio', x.lista_precio), filaDato('Importe', pesos(x.importe), 'importe')]),
      lineas.length ? tabla(['Producto', 'Cantidad', 'Precio', 'Importe'], lineas.map(l => ({ celdas: [l.producto || ('Producto ' + l.producto_id), l.cantidad_entregada + ' ' + (l.unidad || ''), pesos(l.precio_unitario), pesos(l.importe_linea)] })), 'fx-lineas') : null,
      x.detalle_legible === false ? el('p', { class: 'notice error', text: 'El detalle del extra no se pudo leer: no lo confirmes y avisá a Admin General.' }) : null),
    datos: () => ({ finanzas_operacion_id: fin, persona_id: x.persona_id, importe: x.importe, tipo_evento: x.tipo }),
    resumen: (d) => resumenOp([filaDato('Cargo a registrar', pesos(d.importe_firmado), 'importe'), filaDato('Persona', x.persona_nombre || x.persona_id)],
      'Se suma a la cuenta corriente de la persona. Si ya estaba registrado, no se duplica.'),
    ok: () => ctx.ir('#/finanzas/extras'),
  });
}
