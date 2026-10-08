// Panel Cliente → Mi pedido habitual. Lectura: recurrente/mi_habitual. Cambio: recurrente/editar_habitual_dia (Recurrentes Cambios PROD).
// Etapa 4: el día habitual se edita COMPLETO (varios productos): agregar, quitar y cambiar cantidades; se envía la lista entera del día.
// El cliente/repartidor NO crea un habitual desde cero (lo configura Golden); sin habitual puede pedir para una fecha.
// La fila "ancla" (sin producto, cantidad 0: logística del día) no se muestra. Salida y repartidor NO se muestran ni se envían (los define Golden).
// El corte y el cierre de producción los aplica el backend.
import { el, montar, toast } from '../../ui.js';
import { leer, catalogo, escribir, cabecera, vacio, DIA_TXT, DIAS, cant, str, textoOk, fmtFecha, raiz, esAncla } from './comun.js';
import { armadorPedido } from './armador.js';
import { cargarFoto } from './fotos.js';

export function vistaHabitual(ctx, cont) {
  const avisos = el('div', { class: 'stack', id: 'hab-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'hab-cuerpo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Mi pedido habitual', 'Lo que recibís cada semana. Los cambios valen desde la próxima producción abierta; las fechas ya cerradas no cambian.'), avisos, cuerpo);
  const cargar = () => leer(ctx, cuerpo, 'mi_habitual', {}, (d) => {
    // Solo días con al menos un producto real (la fila ancla no es un producto).
    const dias = (d.dias || []).map(x => ({ dia: x.dia, lineas: (x.lineas || []).filter(l => !esAncla(l)) })).filter(x => x.lineas.length)
      .sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia));
    if (!d.tiene_habitual || !dias.length) return montar(cuerpo, vacio('No tenés pedido habitual. Podés pedir para una fecha o escribirle a Golden para armarlo.'),
      el('div', { class: 'row' }, el('a', { class: 'btn btn-primary', href: raiz() + '/pedido' }, 'Pedir para una fecha'), el('a', { class: 'btn btn-ghost', href: raiz() + '/soporte' }, 'Hablar con Golden')));
    montar(cuerpo,
      el('div', { class: 'hab-dias', 'data-habitual': 'si' }, dias.map(dia => {
        const b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'editar-dia-habitual', 'data-dia': dia.dia }, 'Editar día');
        b.addEventListener('click', () => abrirDia(ctx, dia, avisos, cuerpo, cargar));
        return el('div', { class: 'hab-dia', 'data-dia': dia.dia },
          el('div', { class: 'hab-dia-head' }, el('strong', { text: DIA_TXT[dia.dia] || dia.dia }), el('span', { class: 'spacer' }), b),
          dia.lineas.map(l => el('div', { class: 'hab-linea', 'data-recurrente': String(l.pedido_recurrente_id) },
            el('span', { class: 'hab-prod' }, el('span', { text: (str(l.producto) || str(l.detalle_libre) || 'Producto') + ' · ' + cant(l.cantidad, l.unidad) }),
              str(l.detalle_libre) && str(l.producto) ? el('span', { class: 'muted small', text: l.detalle_libre }) : null))));
      })),
      el('p', { class: 'muted small', text: 'Para cambiar un solo día sin tocar el habitual, usá “Pedido para una fecha”. Para agregar un día nuevo al habitual, escribile a Golden.' }));
  });
  cargar();
}

// Editar un día del habitual con el mismo catálogo + carrito de "Hacer pedido" (armador.js). Se envía la lista completa del día
// (recurrente/editar_habitual_dia { dia_semana, lineas }): mismas reglas que antes (al menos un producto, cantidades > 0, sin repetidos).
async function abrirDia(ctx, dia, avisos, cuerpo, recargar) {
  montar(avisos);
  montar(cuerpo, el('div', { class: 'card stack' }, el('div', { class: 'skeleton' })));
  const cat = await catalogo(ctx);
  if (!cuerpo.isConnected) return;
  if (cat.error) return montar(cuerpo, cat.error, el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: recargar }, 'Volver'));
  const nombreDia = (DIA_TXT[dia.dia] || dia.dia).toLowerCase();
  const firma = (ls) => JSON.stringify(ls.map(l => [l.producto_id, l.cantidad, str(l.detalle_libre)]).sort((x, y) => x[0] - y[0]));
  const arm = armadorPedido({
    productos: cat.productos, iniciales: dia.lineas.filter(l => Number.isInteger(l.producto_id)),
    titulo: 'Tu habitual del ' + nombreDia, conservarIniciales: true, textoEnviar: 'Guardar día', idEnviar: 'btn-guardar-dia', idAviso: 'hd-aviso',
    avisoDia: 'Es tu habitual completo de los ' + nombreDia + ': agregá, quitá o cambiá cantidades. Se puede cambiar hasta las 22:00 del día anterior; si la próxima producción ya cerró, vale desde la siguiente.',
    cargarFoto: (id) => cargarFoto(ctx, id), alCancelar: recargar,
    alEnviar: (items, zona) => {
      if (firma(items) === firma(dia.lineas)) { montar(zona, el('div', { class: 'notice info', role: 'status' }, 'No hay cambios para guardar.')); return null; }
      return escribir(ctx, zona, 'editar_habitual_dia', { dia_semana: dia.dia, lineas: items }, async (r) => {
        const d = r.datos || {};
        montar(avisos, el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, textoOk(r) + (d.aplica_desde ? ' Vale desde el ' + fmtFecha(d.aplica_desde).toLowerCase() + '.' : ''), el('span', { class: 'code', text: r.codigo })));
        toast(textoOk(r));
        await recargar();
      });
    },
  });
  montar(cuerpo, el('div', { class: 'stack arm-marco', id: 'hd-form', 'data-dia': dia.dia },
    el('div', { class: 'arm-intro' }, el('h3', { class: 'arm-titulo', text: 'Editar habitual — ' + (DIA_TXT[dia.dia] || dia.dia) }),
      el('p', { class: 'muted small', text: 'Elegí los productos y las cantidades de tu habitual de los ' + nombreDia + '.' })),
    arm.nodo));
  cuerpo.scrollIntoView({ block: 'start' });
}
