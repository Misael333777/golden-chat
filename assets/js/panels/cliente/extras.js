// Panel Cliente → Extras de hoy. Lectura: extra/mis_extras (hoy lo decide el servidor). Escritura: extra/solicitar_extra (Extras PROD).
// El extra queda PENDIENTE de Golden (Admin General): el cliente no aprueba, no registra entregas ni toca Finanzas.
// El precio queda congelado al solicitar (lo fija el backend). Cada solicitud es independiente; un reintento no duplica (mismo operacion_id).
import { el, montar, aviso, conBloqueo, toast, modal } from '../../ui.js';
import { leer, catalogo, escribir, cabecera, vacio, chipExtra, pesos, hoyART, fmtFecha, cant, num, str, leerNum, textoOk } from './comun.js';

const MODO_TXT = { entrega: 'Te lo llevamos', retiro: 'Lo retirás' };

export function vistaExtras(ctx, cont) {
  const hoy = hoyART();
  const avisos = el('div', { class: 'stack', id: 'ex-aviso' });
  const form = el('div', { class: 'stack', id: 'ex-form' });
  const lista = el('div', { class: 'stack', id: 'ex-lista', 'data-estado': 'cargando' });
  const bNuevo = el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-nuevo-extra' }, 'Pedir un extra');
  montar(cont, cabecera('Extras de hoy', 'Si hoy te falta algo, pedilo acá. Golden lo revisa y te avisa si lo aprueba.', bNuevo), avisos, form, lista);
  const cargar = () => leer(ctx, lista, 'mis_extras', {}, (d) => {
    const l = d.extras || [];
    if (!l.length) return montar(lista, vacio('Hoy no pediste extras.'));
    montar(lista, el('p', { class: 'muted small', text: fmtFecha(d.fecha || hoy) + ' · ' + l.length + ' extra(s). Cada pedido de extra es independiente.' }),
      el('div', { class: 'stack', id: 'ex-items' }, l.map((x, i) => el('div', { class: 'card stack ext-card', 'data-extra': String(i + 1), 'data-estado-extra': x.estado },
        el('div', { class: 'card-head ext-head' }, el('div', { class: 'ext-titulo' }, el('strong', { text: 'Extra ' + (i + 1) }),
          el('span', { class: 'muted small', text: [x.cargado_por_golden ? 'Cargado por Golden' : 'Pedido por vos', MODO_TXT[x.modo_entrega] || null].filter(Boolean).join(' · ') })),
          el('span', { class: 'spacer' }), el('span', { class: 'chips' }, chipExtra(x.estado))),
        el('div', { class: 'ext-lineas' }, el('div', { class: 'ext-linea ext-linea-head' }, el('span', { text: 'Producto' }), el('span', { text: 'Pedido' }), el('span', { text: 'Aprobado' }), el('span', { text: 'Entregado' })),
          (x.lineas || []).map(ln => el('div', { class: 'ext-linea', 'data-producto': String(ln.producto_id) }, el('span', { class: 'ext-prod', text: str(ln.producto) || 'Producto' }),
            el('span', null, el('span', { class: 'pc-label', text: 'Pedido: ' }), cant(ln.cantidad_solicitada, ln.unidad)),
            el('span', null, el('span', { class: 'pc-label', text: 'Aprobado: ' }), ln.cantidad_aprobada === null || ln.cantidad_aprobada === undefined ? '—' : num(ln.cantidad_aprobada)),
            el('span', null, el('span', { class: 'pc-label', text: 'Entregado: ' }), ln.cantidad_entregada === null || ln.cantidad_entregada === undefined ? '—' : num(ln.cantidad_entregada))))),
        x.motivo_rechazo ? el('p', { class: 'small', 'data-motivo': 'true' }, el('strong', { text: 'Motivo: ' }), x.motivo_rechazo) : null,
        typeof x.importe_final === 'number' ? el('p', { class: 'small' }, el('strong', { text: 'Importe: ' }), pesos(x.importe_final))
          : typeof x.importe_aprobado === 'number' ? el('p', { class: 'small' }, el('strong', { text: 'Importe aprobado: ' }), pesos(x.importe_aprobado)) : null,
        x.estado === 'anulado' && x.motivo_anulacion ? el('p', { class: 'small', 'data-motivo-anulacion': 'true' }, el('strong', { text: 'Motivo de la cancelación: ' }), x.motivo_anulacion) : null,
        x.estado === 'solicitado' ? accionesExtra(x, i) : null))));
  });
  // Mientras Golden no lo resolvió (pendiente): cambiar cantidades o cancelar. El precio queda el del momento en que lo pediste.
  function accionesExtra(x, i) {
    const zona = el('div', { class: 'stack', 'data-extra-aviso': String(i + 1) });
    const bMod = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'modificar-extra' }, 'Modificar');
    const bCan = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'cancelar-extra' }, 'Cancelar');
    bMod.addEventListener('click', () => { montar(zona); abrirModificar(x); });
    bCan.addEventListener('click', () => { montar(zona); abrirCancelar(x); });
    return el('div', { class: 'stack' }, el('div', { class: 'row ext-acciones' }, bMod, bCan), zona);
  }
  function abrirModificar(x) {
    const filasM = (x.lineas || []).map((ln, k) => {
      const inp = el('input', { class: 'input input-num', id: 'ex-mod-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: String(ln.cantidad_solicitada) });
      return { ln, inp, nodo: el('div', { class: 'field' }, el('label', { for: 'ex-mod-' + k, text: (str(ln.producto) || 'Producto') + (ln.unidad ? ' (' + ln.unidad + ')' : '') }), inp) };
    });
    const zonaM = el('div', { class: 'stack', id: 'ex-mod-aviso' });
    const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'ex-mod-guardar' }, 'Guardar cambios');
    const form = el('form', { class: 'stack', novalidate: true },
      el('p', { class: 'muted small', text: 'Podés cambiar la cantidad de cada producto mientras Golden no lo haya revisado. El precio queda el del momento en que lo pediste.' }),
      filasM.map(f => f.nodo), b, zonaM);
    const m = modal('Modificar extra', form);
    form.addEventListener('submit', conBloqueo(b, async () => {
      montar(zonaM);
      const lineas = filasM.map(f => ({ producto_id: f.ln.producto_id, cantidad: leerNum(f.inp.value) }));
      if (lineas.some(l => !(l.cantidad > 0))) return montar(zonaM, aviso('error', 'Cada producto necesita una cantidad mayor que 0. Si ya no lo necesitás, cancelá el extra.', 'DATOS_INCOMPLETOS'));
      if (lineas.every((l, k) => l.cantidad === filasM[k].ln.cantidad_solicitada)) return montar(zonaM, aviso('info', 'No cambiaste ninguna cantidad.'));
      await escribir(ctx, zonaM, 'modificar_extra', { pedido_id: x.pedido_id, lineas }, async (r) => { m.cerrar(); montar(avisos, el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, textoOk(r))); toast(textoOk(r)); await cargar(); });
    }, 'Guardando…'));
  }
  function abrirCancelar(x) {
    const t = el('textarea', { class: 'input', id: 'ex-can-motivo', maxlength: '300', rows: '2', placeholder: 'Opcional' });
    const zonaC = el('div', { class: 'stack', id: 'ex-can-aviso' });
    const b = el('button', { type: 'submit', class: 'btn btn-danger', id: 'ex-can-confirmar' }, 'Cancelar el extra');
    const form = el('form', { class: 'stack', novalidate: true },
      el('p', { class: 'small', text: 'El extra queda cancelado y Golden ya no lo va a preparar. No se cobra nada.' }),
      el('div', { class: 'field' }, el('label', { for: 'ex-can-motivo', text: 'Motivo (opcional)' }), t), b, zonaC);
    const m = modal('Cancelar extra', form);
    form.addEventListener('submit', conBloqueo(b, async () => {
      montar(zonaC);
      const campos = { pedido_id: x.pedido_id };
      if (t.value.trim()) campos.motivo_anulacion = t.value.trim();
      await escribir(ctx, zonaC, 'cancelar_extra', campos, async (r) => { m.cerrar(); montar(avisos, el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, textoOk(r))); toast(textoOk(r)); await cargar(); });
    }, 'Cancelando…'));
  }
  bNuevo.addEventListener('click', () => abrirForm());

  async function abrirForm() {
    montar(avisos);
    montar(form, el('div', { class: 'card stack' }, el('div', { class: 'skeleton' })));
    const cat = await catalogo(ctx);
    if (!form.isConnected) return;
    if (cat.error) return montar(form, cat.error);
    const filas = [];
    const ed = el('div', { class: 'stack lin-editor', id: 'ex-lineas-ed' });
    const zona = el('div', { class: 'stack', id: 'ex-form-aviso' });
    const agregar = () => {
      const k = filas.length ? Math.max(...filas.map(f => f.k)) + 1 : 0;
      const sProd = el('select', { class: 'select', id: 'ex-prod-' + k, 'aria-label': 'Producto' }, el('option', { value: '', text: 'Elegí un producto…' }),
        cat.productos.map(p => el('option', { value: String(p.producto_id), text: p.nombre + (p.unidad ? ' (' + p.unidad + ')' : '') + (p.precio !== null ? ' · ' + pesos(p.precio) : '') })));
      const iCant = el('input', { class: 'input input-num', id: 'ex-cant-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': 'Cantidad' });
      const quitar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'quitar-linea' }, 'Quitar');
      const nodo = el('div', { class: 'lin-fila', 'data-fila': String(k) }, sProd, iCant, quitar);
      const f = { k, nodo, sProd, iCant };
      quitar.addEventListener('click', () => { if (filas.length <= 1) return; filas.splice(filas.indexOf(f), 1); nodo.remove(); });
      filas.push(f); ed.insertBefore(nodo, bAg);
    };
    const bAg = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'ex-agregar', 'data-accion': 'agregar-linea', onclick: agregar }, 'Agregar producto');
    ed.appendChild(bAg); agregar();
    const bRev = el('button', { type: 'submit', class: 'btn btn-primary', id: 'ex-revisar' }, 'Revisar');
    const paso1 = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' }, ed,
      el('div', { class: 'row' }, bRev, el('button', { type: 'button', class: 'btn btn-ghost', 'data-accion': 'cancelar-extra', onclick: () => montar(form) }, 'Cancelar')));
    const paso2 = el('div', { class: 'stack', id: 'ex-confirmar', hidden: true });
    const caja = el('div', { class: 'card stack', id: 'ex-caja', 'data-paso': 'datos' }, el('h3', { text: 'Pedir un extra para hoy' }), paso1, paso2, zona);
    montar(form, caja);
    const verPaso = (p) => { caja.dataset.paso = p; paso1.hidden = p !== 'datos'; paso2.hidden = p !== 'confirmar'; };
    let lineas = null;
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
        out.push({ producto_id: pid, cantidad: q });
      }
      lineas = out;
      let total = 0;
      const prev = lineas.map(i => { const p = cat.productos.find(x => x.producto_id === i.producto_id) || {}; const imp = typeof p.precio === 'number' ? Math.round(p.precio * i.cantidad * 100) / 100 : 0; total += imp;
        return el('li', { 'data-producto': String(i.producto_id) }, el('span', { class: 'pp-prod', text: p.nombre || 'Producto' }), el('span', { class: 'pp-cant', text: cant(i.cantidad, p.unidad) }),
          el('span', { class: 'muted small', text: typeof p.precio === 'number' ? pesos(p.precio) + ' c/u · ' + pesos(imp) : 'sin precio' })); });
      const bConf = el('button', { type: 'button', class: 'btn btn-gold', id: 'ex-enviar' }, 'Enviar pedido de extra');
      bConf.addEventListener('click', conBloqueo(bConf, enviar, 'Enviando…'));
      montar(paso2, el('ul', { class: 'pp-lineas', id: 'ex-prev' }, prev), el('p', { class: 'small' }, el('strong', { text: 'Total estimado: ' }), pesos(total)),
        el('p', { class: 'muted small', text: 'El precio queda fijado al enviar. Golden revisa el pedido: puede aprobarlo (todo o en parte) o rechazarlo. Todavía no se envió nada.' }),
        el('div', { class: 'row' }, bConf, el('button', { type: 'button', class: 'btn btn-ghost', id: 'ex-volver', onclick: () => { montar(zona); verPaso('datos'); } }, 'Volver a editar')));
      verPaso('confirmar');
    }, 'Revisando…'));
    async function enviar() {
      montar(zona);
      await escribir(ctx, zona, 'solicitar_extra', { fecha_entrega: hoy, lineas }, async (r) => {
        montar(form);
        montar(avisos, el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, textoOk(r), el('span', { class: 'code', text: r.codigo })));
        toast(textoOk(r));
        await cargar();
      });
    }
  }
  cargar();
}
