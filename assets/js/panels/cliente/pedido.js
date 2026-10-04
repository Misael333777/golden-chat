// Panel Cliente → Pedido para una fecha. Lectura: pedido/mi_pedido_fecha. Escritura: pedido/crear_pedido_normal (Pedidos Fecha Escrituras PROD).
// El TIPO lo decide el servidor: si ese día tenés habitual queda "solo por ese día" (reemplaza el habitual SOLO esa fecha); si no, "pedido para ese día".
// Flujo: elegir productos del catálogo → vista previa (estimado con el catálogo vigente) → confirmar. Doble click bloqueado; reintento con el MISMO operacion_id.
import { el, montar, aviso, conBloqueo, toast } from '../../ui.js';
import { leer, catalogo, escribir, cabecera, chipOrigen, listaLineas, pesos, hoyART, sumarDias, fmtFecha, FECHA_RE, cant, num, leerNum, textoOk, diaDe, DIA_TXT, raiz } from './comun.js';

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
    const bEditar = d.modificable ? el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-pedir-fecha' }, d.origen === 'sin_pedido' ? 'Hacer pedido para este día' : 'Cambiar el pedido de este día') : null;
    if (bEditar) bEditar.addEventListener('click', () => abrirEditor(d));
    montar(actual,
      el('div', { class: 'card-head' }, el('div', null, el('h3', { text: fmtFecha(fecha) }), el('p', { class: 'muted small', text: 'Lo que tenés para este día.' })), el('span', { class: 'spacer' }),
        el('div', { class: 'chips' }, chipOrigen(d.origen), d.modificable ? el('span', { class: 'chip ok', 'data-modificable': 'true', text: 'Se puede cambiar' }) : el('span', { class: 'chip off', 'data-modificable': 'false', text: 'Ya no se puede cambiar' }))),
      motivo ? el('div', { class: 'notice info', 'data-codigo': d.motivo_no_modificable }, motivo, el('span', { class: 'code', text: d.motivo_no_modificable })) : null,
      d.sin_entrega ? el('p', { class: 'small', text: 'Para este día no recibís productos.' }) : null,
      d.origen === 'sin_pedido' ? el('p', { class: 'muted', text: 'No tenés pedido para este día.' }) : listaLineas(d.lineas, 'pf-lineas'),
      typeof d.importe_total === 'number' && d.origen !== 'sin_pedido' ? el('p', { class: 'small', 'data-importe': String(d.importe_total) }, el('strong', { text: 'Importe: ' }), pesos(d.importe_total)) : null,
      bEditar ? el('div', { class: 'row' }, bEditar) : null);
  });

  async function abrirEditor(d) {
    montar(avisos);
    montar(editor, el('div', { class: 'card stack' }, el('div', { class: 'skeleton' })));
    const cat = await catalogo(ctx);
    if (!editor.isConnected) return;
    if (cat.error) return montar(editor, cat.error);
    const filas = [];
    const lista = el('div', { class: 'stack lin-editor', id: 'pf-lineas-ed' });
    const zona = el('div', { class: 'stack', id: 'pf-ed-aviso' });
    const agregar = (ini) => {
      const k = filas.length ? Math.max(...filas.map(f => f.k)) + 1 : 0;
      const sProd = el('select', { class: 'select', id: 'pf-prod-' + k, 'aria-label': 'Producto' }, el('option', { value: '', text: 'Elegí un producto…' }),
        cat.productos.map(p => el('option', { value: String(p.producto_id), text: p.nombre + (p.unidad ? ' (' + p.unidad + ')' : '') + (p.precio !== null ? ' · ' + pesos(p.precio) : '') })));
      if (ini && cat.productos.some(p => p.producto_id === ini.producto_id)) sProd.value = String(ini.producto_id);
      const iCant = el('input', { class: 'input input-num', id: 'pf-cant-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': 'Cantidad', value: ini && typeof ini.cantidad === 'number' && ini.cantidad > 0 ? String(ini.cantidad) : '' });
      const iDet = el('input', { class: 'input', id: 'pf-det-' + k, maxlength: '200', 'aria-label': 'Aclaración', placeholder: 'Aclaración (opcional)', autocomplete: 'off', value: ini && ini.detalle_libre ? ini.detalle_libre : '' });
      const quitar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'quitar-linea' }, 'Quitar');
      const nodo = el('div', { class: 'lin-fila', 'data-fila': String(k) }, sProd, iCant, iDet, quitar);
      const f = { k, nodo, sProd, iCant, iDet };
      quitar.addEventListener('click', () => { if (filas.length <= 1) return; filas.splice(filas.indexOf(f), 1); nodo.remove(); });
      filas.push(f); lista.insertBefore(nodo, bAgregar);
    };
    const bAgregar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'pf-agregar', 'data-accion': 'agregar-linea', onclick: () => agregar(null) }, 'Agregar producto');
    lista.appendChild(bAgregar);
    const iniciales = d.origen === 'sin_pedido' ? [] : (d.lineas || []).filter(l => Number.isInteger(l.producto_id));
    for (const i of (iniciales.length ? iniciales : [null])) agregar(i);
    const bRev = el('button', { type: 'submit', class: 'btn btn-primary', id: 'pf-revisar' }, 'Revisar pedido');
    const paso1 = el('form', { class: 'stack', novalidate: true, autocomplete: 'off', id: 'pf-paso-datos' },
      el('p', { class: 'muted small', text: d.tiene_habitual
        ? 'Tenés habitual los ' + (DIA_TXT[diaDe(fecha)] || '').toLowerCase() + ': este pedido reemplaza tu habitual SOLO el ' + fmtFecha(fecha).toLowerCase() + '. Tu habitual no cambia.'
        : 'No tenés habitual ese día: se carga como pedido para el ' + fmtFecha(fecha).toLowerCase() + '.' }),
      lista, el('div', { class: 'row' }, bRev, el('button', { type: 'button', class: 'btn btn-ghost', 'data-accion': 'cancelar-pedido', onclick: () => montar(editor) }, 'Cancelar')));
    const paso2 = el('div', { class: 'stack', id: 'pf-paso-confirmar', hidden: true });
    const caja = el('div', { class: 'card stack', id: 'pf-caja', 'data-paso': 'datos' }, el('h3', { text: 'Pedido para el ' + fmtFecha(fecha).toLowerCase() }), paso1, paso2, zona);
    montar(editor, caja);
    const verPaso = (p) => { caja.dataset.paso = p; paso1.hidden = p !== 'datos'; paso2.hidden = p !== 'confirmar'; };
    let items = null;
    paso1.addEventListener('submit', conBloqueo(bRev, async () => {
      montar(zona);
      const out = []; const vistos = new Set();
      for (const f of filas) {
        const pid = Number(f.sProd.value);
        if (!Number.isInteger(pid) || pid <= 0) return montar(zona, aviso('error', 'Elegí el producto de cada línea.', 'DATOS_INCOMPLETOS'));
        if (vistos.has(pid)) return montar(zona, aviso('error', 'Hay un producto repetido: juntalo en una sola línea.', 'DATOS_INCOMPLETOS'));
        vistos.add(pid);
        const q = leerNum(f.iCant.value);
        if (!(q > 0)) return montar(zona, aviso('error', 'Cada línea necesita una cantidad mayor que 0.', 'DATOS_INCOMPLETOS'));
        const o = { producto_id: pid, cantidad: q };
        const det = f.iDet.value.trim(); if (det) o.detalle_libre = det;
        out.push(o);
      }
      items = out;
      let total = 0; let completo = true;
      const filasPrev = items.map(i => { const p = cat.productos.find(x => x.producto_id === i.producto_id) || {}; const imp = typeof p.precio === 'number' ? Math.round(p.precio * i.cantidad * 100) / 100 : null;
        if (imp === null) completo = false; else total += imp;
        return el('li', { 'data-producto': String(i.producto_id) }, el('span', { class: 'pp-prod', text: p.nombre || 'Producto' }), el('span', { class: 'pp-cant', text: cant(i.cantidad, p.unidad) }),
          el('span', { class: 'muted small', text: (typeof p.precio === 'number' ? pesos(p.precio) + ' c/u · ' + pesos(imp) : 'sin precio') + (i.detalle_libre ? ' · ' + i.detalle_libre : '') })); });
      const bConf = el('button', { type: 'button', class: 'btn btn-gold', id: 'pf-confirmar' }, 'Confirmar pedido');
      bConf.addEventListener('click', conBloqueo(bConf, confirmar, 'Enviando…'));
      montar(paso2, el('ul', { class: 'pp-lineas', id: 'pf-prev-lineas' }, filasPrev),
        el('p', { class: 'small', id: 'pf-prev-total' }, el('strong', { text: 'Total estimado: ' }), completo ? pesos(total) : '—'),
        el('p', { class: 'muted small', text: (d.tiene_habitual ? 'Reemplaza tu habitual solo ese día. ' : '') + 'Es un estimado con tus precios de hoy: el importe final lo confirma Golden. Todavía no se envió nada.' }),
        el('div', { class: 'row' }, bConf, el('button', { type: 'button', class: 'btn btn-ghost', id: 'pf-volver', onclick: () => { montar(zona); verPaso('datos'); } }, 'Volver a editar')));
      verPaso('confirmar');
    }, 'Revisando…'));
    async function confirmar() {
      montar(zona);
      await escribir(ctx, zona, 'crear_pedido_normal', { fecha, items }, async (r) => {
        const x = r.datos || {};
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
