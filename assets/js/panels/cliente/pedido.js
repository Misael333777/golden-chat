// Panel Cliente → Pedido para una fecha. Lectura: pedido/mi_pedido_fecha. Escritura: pedido/crear_pedido_normal (Pedidos Fecha Escrituras PROD).
// El TIPO lo decide el servidor: si ese día tenés habitual queda "solo por ese día" (reemplaza el habitual SOLO esa fecha); si no, "pedido para ese día".
// Flujo: elegir productos del catálogo → vista previa (estimado con el catálogo vigente) → confirmar. Doble click bloqueado; reintento con el MISMO operacion_id.
// Etapa 4 (rutas existentes, solo fecha + operacion_id; persona y rol de la SESIÓN; nunca pedido_id):
//  - 'Hoy no pedir' (pedido/hoy_no_pedir): solo si hay habitual ese día y la fecha es modificable. El servidor arma la excepción vacía (sin líneas).
//  - 'Volver al habitual' (pedido/anular) sobre un 'solo por ese día'; 'Cancelar pedido' (pedido/anular) sobre un pedido nuevo sin habitual.
import { el, montar, conBloqueo, toast, confirmar, modal } from '../../ui.js';
import { armadorPedido } from './armador.js';
import { leer, catalogo, escribir, cabecera, chipOrigen, listaLineas, pesos, hoyART, sumarDias, fmtFecha, FECHA_RE, cant, num, textoOk, diaDe, DIA_TXT, raiz, avisoCli } from './comun.js';

const MOTIVO_TXT = { PRODUCCION_CERRADA: 'La producción de ese día ya cerró o pasó el horario de corte (22:00 del día anterior).', FECHA_PASADA: 'Esa fecha ya pasó.',
  CIERRE_EN_CURSO: 'Golden está cerrando la producción de ese día.', FECHA_INVALIDA: 'Los pedidos se cargan a partir de mañana.' };

export function vistaPedidoFecha(ctx, cont, fechaRuta) {
  const manana = sumarDias(hoyART(), 1);
  const fecha = FECHA_RE.test(fechaRuta || '') && fechaRuta >= manana ? fechaRuta : manana;
  const iF = el('input', { class: 'input', id: 'pf-fecha', type: 'date', min: manana, value: fecha, 'aria-label': 'Fecha' });
  iF.addEventListener('change', () => { if (FECHA_RE.test(iF.value)) ctx.ir(raiz() + '/pedido/' + iF.value); });
  const avisos = el('div', { class: 'stack', id: 'pf-aviso' });
  const actual = el('div', { class: 'stack', id: 'pf-actual', 'data-fecha': fecha, 'data-estado': 'cargando' });
  const editor = el('div', { class: 'stack', id: 'pf-editor' });
  montar(cont, cabecera('Pedido para una fecha', 'Cambiá lo que recibís un día puntual o pedí para un día que no tenés habitual. Se puede cambiar hasta las 22:00 del día anterior.'),
    el('div', { class: 'ped-fecha-bar' }, el('label', { for: 'pf-fecha', class: 'ped-fecha-label', text: 'Fecha de entrega' }), iF), avisos,
    el('div', { class: 'card stack' }, actual), editor);
  const cargar = () => leer(ctx, actual, 'mi_pedido_fecha', { fecha }, (d) => {
    const motivo = d.motivo_no_modificable ? (MOTIVO_TXT[d.motivo_no_modificable] || 'No se puede modificar.') : null;
    // Sin pedido: el catálogo se abre solo (más abajo). Con pedido/habitual: botón para cambiarlo (abre el catálogo con lo actual en el carrito).
    const bEditar = d.modificable && d.origen !== 'sin_pedido' ? el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-pedir-fecha' }, 'Cambiar el pedido de este día') : null;
    if (bEditar) bEditar.addEventListener('click', () => abrirEditor(d));
    const excepcionVacia = d.origen === 'solo_por_hoy' && d.sin_entrega === true;
    const bHoyNo = d.modificable && d.tiene_habitual && !excepcionVacia ? botonDia('btn-hoy-no-pedir', 'Hoy no pedir', 'hoy_no_pedir', 'Hoy no pedir',
      'Ese día no vas a recibir tu habitual. Tu habitual de los demás días no cambia. Podés volver al habitual hasta las 22:00 del día anterior.', 'Sí, no pedir ese día') : null;
    const bVolver = d.modificable && d.origen === 'solo_por_hoy' ? botonDia('btn-volver-habitual', 'Volver al habitual', 'anular', 'Volver al habitual',
      'Se deshace el cambio de este día y recibís tu habitual de siempre.', 'Volver al habitual') : null;
    const bCancelar = d.modificable && d.origen === 'pedido_nuevo_no_recurrente' && !d.tiene_habitual ? botonDia('btn-cancelar-pedido', 'Cancelar pedido', 'anular', 'Cancelar pedido',
      'Se cancela el pedido de este día. No vas a recibir nada ese día.', 'Sí, cancelar pedido') : null;
    montar(actual,
      el('div', { class: 'card-head' }, el('div', null, el('h3', { text: fmtFecha(fecha) }), el('p', { class: 'muted small', text: 'Lo que tenés para este día.' })), el('span', { class: 'spacer' }),
        el('div', { class: 'chips' }, chipOrigen(d.origen), d.modificable ? el('span', { class: 'chip ok', 'data-modificable': 'true', text: 'Se puede cambiar' }) : el('span', { class: 'chip off', 'data-modificable': 'false', text: 'Ya no se puede cambiar' }))),
      motivo ? el('div', { class: 'notice info', 'data-codigo': d.motivo_no_modificable }, motivo, el('span', { class: 'code', text: d.motivo_no_modificable })) : null,
      excepcionVacia ? el('p', { class: 'small', 'data-hoy-no-pedir': 'true', text: 'Marcaste “Hoy no pedir”: este día no recibís productos. Tu habitual no cambia.' })
        : d.sin_entrega ? el('p', { class: 'small', text: 'Para este día no recibís productos.' }) : null,
      d.origen === 'sin_pedido' ? el('p', { class: 'muted', text: 'No tenés pedido para este día.' }) : excepcionVacia ? null : listaLineas(d.lineas, 'pf-lineas'),
      typeof d.importe_total === 'number' && d.origen !== 'sin_pedido' ? el('p', { class: 'small', 'data-importe': String(d.importe_total) }, el('strong', { text: 'Importe: ' }), pesos(d.importe_total)) : null,
      (bEditar || bHoyNo || bVolver || bCancelar) ? el('div', { class: 'row' }, bEditar, bHoyNo, bVolver, bCancelar) : null);
    // Sin pedido para ese día y todavía modificable: el catálogo se abre directamente (como la referencia de "Hacer pedido").
    if (d.modificable && d.origen === 'sin_pedido' && !editor.hasChildNodes()) abrirEditor(d);
  });

  // Acción de un día (hoy_no_pedir / anular): confirmación → escritura idempotente (solo fecha + operacion_id) → recarga.
  function botonDia(id, texto, accion, titulo, pregunta, etiqueta) {
    const b = el('button', { type: 'button', class: 'btn btn-ghost', id, 'data-accion': id.replace(/^btn-/, '') }, texto);
    b.addEventListener('click', conBloqueo(b, async () => {
      if (!(await confirmar(titulo + ' — ' + fmtFecha(fecha), pregunta, etiqueta))) return;
      montar(avisos); montar(editor);
      await escribir(ctx, avisos, accion, { fecha }, async (r) => { montar(avisos, avisoCli(r)); toast(textoOk(r)); await cargar(); });
    }, 'Enviando…'));
    return b;
  }

  // "Hacer pedido": catálogo en tarjetas + carrito (armador.js, mismo componente para Cliente y Repartidor).
  // Enviar → vista previa con el estimado → Confirmar → pedido/crear_pedido_normal { fecha, items } (mismo circuito y validaciones de siempre).
  async function abrirEditor(d) {
    montar(avisos);
    montar(editor, el('div', { class: 'card stack' }, el('div', { class: 'skeleton' })));
    const cat = await catalogo(ctx);
    if (!editor.isConnected) return;
    if (cat.error) return montar(editor, cat.error);
    const iniciales = d.origen === 'sin_pedido' ? [] : (d.lineas || []).filter(l => Number.isInteger(l.producto_id));
    const avisoDia = d.tiene_habitual
      ? 'Tenés habitual los ' + (DIA_TXT[diaDe(fecha)] || '').toLowerCase() + ': este pedido reemplaza tu habitual SOLO el ' + fmtFecha(fecha).toLowerCase() + '. Tu habitual no cambia.'
      : 'No tenés habitual ese día: se carga como pedido para el ' + fmtFecha(fecha).toLowerCase() + '.';
    const arm = armadorPedido({ productos: cat.productos, iniciales, avisoDia, alCancelar: d.origen === 'sin_pedido' ? null : () => montar(editor), alEnviar: (items) => revisar(items) });
    montar(editor, el('div', { class: 'stack arm-marco', id: 'pf-caja', 'data-paso': 'datos' },
      el('div', { class: 'arm-intro' }, el('h3', { class: 'arm-titulo', text: '¡Hacé tu pedido!' }), el('p', { class: 'muted small', text: 'Pedido para el ' + fmtFecha(fecha).toLowerCase() + '. Elegí los productos y la cantidad; revisás todo antes de enviar.' })),
      arm.nodo));

    // Vista previa (estimado con el catálogo vigente) → confirmar. Nada se envía hasta tocar "Confirmar pedido".
    function revisar(items) {
      let total = 0; let completo = true;
      const filasPrev = items.map(i => { const p = cat.productos.find(x => x.producto_id === i.producto_id) || {}; const imp = typeof p.precio === 'number' ? Math.round(p.precio * i.cantidad * 100) / 100 : null;
        if (imp === null) completo = false; else total += imp;
        return el('li', { 'data-producto': String(i.producto_id) }, el('span', { class: 'pp-prod', text: p.nombre || 'Producto' }), el('span', { class: 'pp-cant', text: cant(i.cantidad, p.unidad) }),
          el('span', { class: 'muted small', text: (typeof p.precio === 'number' ? pesos(p.precio) + ' c/u · ' + pesos(imp) : 'sin precio') + (i.detalle_libre ? ' · ' + i.detalle_libre : '') })); });
      const zonaM = el('div', { class: 'stack', id: 'pf-ed-aviso' });
      const bConf = el('button', { type: 'button', class: 'btn btn-gold', id: 'pf-confirmar' }, 'Confirmar pedido');
      const m = modal('Revisá tu pedido — ' + fmtFecha(fecha), el('div', { class: 'stack', id: 'pf-paso-confirmar' },
        el('ul', { class: 'pp-lineas', id: 'pf-prev-lineas' }, filasPrev),
        el('p', { class: 'small', id: 'pf-prev-total' }, el('strong', { text: 'Total estimado: ' }), completo ? pesos(total) : '—'),
        el('p', { class: 'muted small', text: (d.tiene_habitual ? 'Reemplaza tu habitual solo ese día. ' : '') + 'Es un estimado con tus precios de hoy: el importe final lo confirma Golden. Todavía no se envió nada.' }),
        zonaM,
        el('div', { class: 'row' }, bConf, el('button', { type: 'button', class: 'btn btn-ghost', id: 'pf-volver', onclick: () => m.cerrar() }, 'Volver a editar'))));
      bConf.addEventListener('click', conBloqueo(bConf, () => enviar(items, zonaM, m), 'Enviando…'));
    }
    async function enviar(items, zonaM, m) {
      montar(zonaM);
      await escribir(ctx, zonaM, 'crear_pedido_normal', { fecha, items }, async (r) => {
        const x = r.datos || {};
        m.cerrar();
        montar(editor);
        montar(avisos, el('div', { class: 'notice ok stack', role: 'status', 'data-codigo': r.codigo, 'data-referencia': x.referencia || '' },
          el('span', null, textoOk(r), el('span', { class: 'code', text: r.codigo })),
          el('span', { class: 'small', text: [x.referencia ? 'Referencia ' + x.referencia : null, Number.isInteger(x.version_nro) ? 'versión ' + x.version_nro : null,
            typeof x.importe_total === 'number' ? 'importe ' + pesos(x.importe_total) : null, Number.isInteger(x.lineas_total) ? num(x.lineas_total) + ' producto(s)' : null].filter(Boolean).join(' · ') })));
        toast(textoOk(r));
        await cargar();
      });
    }
  }
  cargar();
}
