// Panel Cliente → Mi pedido habitual. Lectura: recurrente/mi_habitual. Cambio: recurrente/cambio_vigente (Recurrentes Cambios PROD).
// El cliente cambia UNA línea por vez (producto, cantidad o aclaración) con alcance 'dias_concretos' (solo esa línea/día).
// Salida y repartidor NO se muestran ni se envían (los define Golden). El corte y el cierre de producción los aplica el backend.
import { el, montar, aviso, modal, conBloqueo, toast } from '../../ui.js';
import { leer, catalogo, escribir, cabecera, vacio, DIA_TXT, DIAS, cant, str, leerNum, campo, textoOk, fmtFecha, raiz } from './comun.js';

export function vistaHabitual(ctx, cont) {
  const avisos = el('div', { class: 'stack', id: 'hab-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'hab-cuerpo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Mi pedido habitual', 'Lo que recibís cada semana. Los cambios valen desde la próxima producción abierta; las fechas ya cerradas no cambian.'), avisos, cuerpo);
  const cargar = () => leer(ctx, cuerpo, 'mi_habitual', {}, (d) => {
    if (!d.tiene_habitual || !(d.dias || []).length) return montar(cuerpo, vacio('No tenés pedido habitual. Podés pedir para una fecha o escribirle a Golden para armarlo.'),
      el('div', { class: 'row' }, el('a', { class: 'btn btn-primary', href: raiz() + '/pedido' }, 'Pedir para una fecha'), el('a', { class: 'btn btn-ghost', href: raiz() + '/soporte' }, 'Hablar con Golden')));
    const dias = d.dias.slice().sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia));
    montar(cuerpo,
      el('div', { class: 'hab-dias', 'data-habitual': 'si' }, dias.map(dia => el('div', { class: 'hab-dia', 'data-dia': dia.dia },
        el('div', { class: 'hab-dia-head' }, el('strong', { text: DIA_TXT[dia.dia] || dia.dia }), dia.sin_pedido_hoy ? el('span', { class: 'chip warn', text: 'Sin entrega (cantidad 0)' }) : null),
        (dia.lineas || []).map(l => {
          const b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'cambiar-habitual', 'data-recurrente': String(l.pedido_recurrente_id) }, 'Cambiar');
          b.addEventListener('click', () => abrirCambio(ctx, l, dia.dia, avisos, cargar));
          return el('div', { class: 'hab-linea', 'data-recurrente': String(l.pedido_recurrente_id) },
            el('span', { class: 'hab-prod' }, el('span', { text: (str(l.producto) || str(l.detalle_libre) || 'Producto') + ' · ' + cant(l.cantidad, l.unidad) }),
              str(l.detalle_libre) && str(l.producto) ? el('span', { class: 'muted small', text: l.detalle_libre }) : null), b);
        })))),
      el('p', { class: 'muted small', text: 'Para cambiar un solo día sin tocar el habitual, usá “Pedido para una fecha”. Para agregar un día nuevo al habitual, escribile a Golden.' }));
  });
  cargar();
}

async function abrirCambio(ctx, l, dia, avisos, recargar) {
  const zona = el('div', { class: 'stack', id: 'cv-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'cv-form' }, el('div', { class: 'skeleton' }));
  const m = modal('Cambiar habitual — ' + (DIA_TXT[dia] || dia), el('div', { class: 'stack' }, cuerpo, zona));
  const cat = await catalogo(ctx);
  if (!cuerpo.isConnected) return;
  if (cat.error) return montar(cuerpo, cat.error);
  const sProd = el('select', { class: 'select', id: 'cv-prod' }, cat.productos.map(p => el('option', { value: String(p.producto_id), text: p.nombre + (p.unidad ? ' (' + p.unidad + ')' : '') })));
  if (!cat.productos.some(p => p.producto_id === l.producto_id)) sProd.insertBefore(el('option', { value: String(l.producto_id), text: (str(l.producto) || 'Producto actual') + ' (no disponible)' }), sProd.firstChild);
  sProd.value = String(l.producto_id);
  const iCant = el('input', { class: 'input input-num', id: 'cv-cant', type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: typeof l.cantidad === 'number' ? String(l.cantidad) : '' });
  const iDet = el('input', { class: 'input', id: 'cv-det', maxlength: '200', placeholder: 'Aclaración (opcional)', autocomplete: 'off', value: l.detalle_libre || '' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-cambio' }, 'Guardar cambio');
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('p', { class: 'muted small', text: 'Cambia esta línea de tu habitual de los ' + (DIA_TXT[dia] || dia).toLowerCase() + '. Cantidad 0 = ese día no recibís este producto.' }),
    el('div', { class: 'form-grid two' }, campo('cv-prod', 'Producto', sProd), campo('cv-cant', 'Cantidad', iCant)), campo('cv-det', 'Aclaración', iDet),
    el('p', { class: 'muted small', text: 'Se puede cambiar hasta las 22:00 del día anterior. Si la producción de la próxima fecha ya cerró, el cambio vale desde la siguiente.' }), b);
  montar(cuerpo, form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const pidProd = Number(sProd.value);
    const q = leerNum(iCant.value);
    if (!Number.isInteger(pidProd) || pidProd <= 0) return montar(zona, aviso('error', 'Elegí el producto.'));
    if (!(q >= 0)) return montar(zona, aviso('error', 'La cantidad debe ser 0 o más.'));
    const det = iDet.value.trim() || null;
    const cambios = {};
    if (pidProd !== l.producto_id) { cambios.producto_id = pidProd; const p = cat.productos.find(x => x.producto_id === pidProd); if (p && p.unidad) cambios.unidad = p.unidad; }
    if (q !== l.cantidad) cambios.cantidad = q;
    if (det !== (l.detalle_libre || null)) cambios.detalle_libre = det;
    if (!Object.keys(cambios).length) return montar(zona, aviso('info', 'No hay cambios para guardar.'));
    await escribir(ctx, zona, 'cambio_vigente', { pedido_recurrente_id: l.pedido_recurrente_id, cambios, alcance: 'dias_concretos' }, async (r) => {
      m.cerrar();
      const d = r.datos || {};
      montar(avisos, el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, textoOk(r) + (d.aplica_desde ? ' Vale desde el ' + fmtFecha(d.aplica_desde).toLowerCase() + '.' : ''), el('span', { class: 'code', text: r.codigo })));
      toast(textoOk(r));
      await recargar();
    });
  }, 'Guardando…'));
}
