// Panel Cliente / Repartidor → "Hacer pedido": catálogo en tarjetas + carrito "Tu pedido" (componente compartido por los dos paneles).
// Solo arma la lista { producto_id, cantidad, detalle_libre? }: NO envía precios ni lista de precio. Los precios que se muestran salen de
// mi_catalogo (el backend ya devuelve el precio de la condición de la persona y solo productos activos y visibles para su rol)
// y el total es un ESTIMADO. El envío lo hace quien llama (mismo circuito de siempre: vista previa → confirmar → pedido/crear_pedido_normal).
// Imágenes: hoy el catálogo de Cliente/Repartidor no trae fotos (son archivos privados). Cada tarjeta usa fotoProducto(): si algún día
// el catálogo trae una imagen segura (p.imagen_src, data: o similar, entregada por una consulta del backend), reemplaza el placeholder sin tocar la vista.
import { el, montar, aviso } from '../../ui.js';
import { pesos, num, leerNum } from './comun.js';

const sinTilde = (s) => Array.from(String(s || '').normalize('NFD')).filter(ch => { const k = ch.charCodeAt(0); return k < 768 || k > 879; }).join('').toLowerCase();
const redondear = (q) => Math.round(q * 1000) / 1000;
const iniciales = (n) => String(n || '').split(/\s+/).filter(w => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'G';

// Foto del producto: placeholder Golden (iniciales sobre crema con trigo). Preparado para reemplazarse por la foto real.
export function fotoProducto(p, chica) {
  const caja = el('div', { class: 'arm-foto' + (chica ? ' arm-foto-chica' : ''), 'data-foto': p.imagen_src ? 'si' : 'placeholder', 'aria-hidden': 'true' });
  if (typeof p.imagen_src === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(p.imagen_src)) {
    caja.appendChild(el('img', { src: p.imagen_src, alt: '', loading: 'lazy', decoding: 'async' }));
  } else {
    caja.appendChild(el('span', { class: 'arm-foto-ini', text: iniciales(p.nombre) }));
  }
  return caja;
}

// opciones: { productos, iniciales: [{producto_id,cantidad,detalle_libre}], avisoDia (texto), alEnviar(items) , alCancelar() }
// Devuelve { nodo }.
export function armadorPedido(opc) {
  const productos = opc.productos || [];
  const porId = new Map(productos.map(p => [p.producto_id, p]));
  // Categorías reales del catálogo, en el orden del catálogo (por id de producto).
  const cats = [];
  for (const p of productos.slice().sort((a, b) => a.producto_id - b.producto_id)) { const c = p.categoria || 'Otros'; if (!cats.includes(c)) cats.push(c); }
  const estado = { texto: '', cat: 'todos' };
  const carrito = new Map(); // producto_id -> { cantidad, detalle }
  const fuera = [];
  for (const i of (opc.iniciales || [])) {
    if (!Number.isInteger(i.producto_id) || !(i.cantidad > 0)) continue;
    if (!porId.has(i.producto_id)) { fuera.push(i.producto || 'Un producto'); continue; }
    carrito.set(i.producto_id, { cantidad: i.cantidad, detalle: i.detalle_libre || '' });
  }

  // ---- catálogo ----
  const iBuscar = el('input', { class: 'input', id: 'arm-buscar', type: 'search', maxlength: '60', placeholder: 'Buscar productos…', 'aria-label': 'Buscar productos', autocomplete: 'off' });
  const chips = el('div', { class: 'arm-cats', id: 'arm-cats', role: 'tablist', 'aria-label': 'Categorías' });
  const grilla = el('div', { class: 'arm-grilla', id: 'arm-grilla' });
  const pintarCats = () => montar(chips, ['todos', ...cats].map(c => el('button', { type: 'button', class: 'arm-cat' + (estado.cat === c ? ' activa' : ''), role: 'tab',
    'aria-selected': estado.cat === c ? 'true' : 'false', 'data-categoria': c, text: c === 'todos' ? 'Todos' : c, onclick: () => { estado.cat = c; pintarCats(); pintarGrilla(); } })));

  // Selector de cantidad reutilizado en tarjeta y carrito: −, campo (acepta decimales, p. ej. 2,5 kg), +.
  function selector(pid, idBase) {
    const actual = () => (carrito.get(pid) || {}).cantidad || 0;
    const i = el('input', { class: 'arm-cant', id: idBase, type: 'text', inputmode: 'decimal', 'aria-label': 'Cantidad', value: num(actual()), autocomplete: 'off' });
    const fijar = (q) => {
      q = redondear(q);
      if (!(q > 0)) carrito.delete(pid);
      else carrito.set(pid, { cantidad: q, detalle: (carrito.get(pid) || {}).detalle || '' });
      actualizar();
    };
    // − / + de a 1 unidad; si la cantidad tiene decimales (p. ej. 2,5 kg) primero lleva al entero más cercano en ese sentido.
    const menos = el('button', { type: 'button', class: 'arm-btn', 'data-accion': 'menos', 'aria-label': 'Restar uno', text: '−', onclick: () => { const a = actual(); fijar(Math.max(0, Number.isInteger(a) ? a - 1 : Math.floor(a))); } });
    const mas = el('button', { type: 'button', class: 'arm-btn', 'data-accion': 'mas', 'aria-label': 'Sumar uno', text: '+', onclick: () => { const a = actual(); fijar(Number.isInteger(a) ? a + 1 : Math.ceil(a)); } });
    i.addEventListener('change', () => { const q = leerNum(i.value); if (q === null) return fijar(0); if (!Number.isFinite(q) || q < 0) { i.value = num(actual()); return; } fijar(q); });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } });
    return el('div', { class: 'arm-selector', 'data-producto': String(pid) }, menos, i, mas);
  }

  function pintarGrilla() {
    const q = sinTilde(estado.texto.trim());
    const vis = productos.filter(p => (estado.cat === 'todos' || (p.categoria || 'Otros') === estado.cat)
      && (!q || sinTilde([p.nombre, p.categoria, p.unidad].filter(Boolean).join(' ')).includes(q)));
    if (!vis.length) return montar(grilla, el('div', { class: 'arm-vacio', 'data-vacio': 'true', text: q ? 'No encontramos productos con ese nombre.' : 'No hay productos en esta categoría.' }));
    montar(grilla, vis.map(p => el('article', { class: 'arm-card' + (carrito.has(p.producto_id) ? ' en-pedido' : ''), 'data-producto': String(p.producto_id), 'data-categoria': p.categoria || 'Otros' },
      fotoProducto(p),
      el('div', { class: 'arm-card-txt' },
        el('h4', { class: 'arm-nombre', text: p.nombre }),
        el('p', { class: 'arm-precio' }, el('strong', { text: p.precio !== null ? pesos(p.precio) : 'Sin precio' }), p.unidad ? el('span', { class: 'arm-unidad', text: ' / ' + p.unidad }) : null)),
      selector(p.producto_id, 'arm-cant-' + p.producto_id))));
  }
  iBuscar.addEventListener('input', () => { estado.texto = iBuscar.value; pintarGrilla(); });

  // ---- carrito ----
  const cuerpoCarrito = el('div', { class: 'arm-items', id: 'arm-items' });
  const contador = el('span', { class: 'arm-badge', id: 'arm-contador', 'aria-live': 'polite' });
  const totalTxt = el('strong', { class: 'arm-total-valor', id: 'arm-total' });
  const zona = el('div', { class: 'stack', id: 'arm-aviso' });
  const bEnviar = el('button', { type: 'button', class: 'btn btn-gold arm-enviar', id: 'arm-enviar' }, 'Enviar pedido');
  const bCancelar = opc.alCancelar ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'arm-cancelar', 'data-accion': 'cancelar-pedido', onclick: opc.alCancelar }, 'Cancelar') : null;
  const barraMovil = el('button', { type: 'button', class: 'arm-barra-movil', id: 'arm-barra-movil', onclick: () => carritoNodo.scrollIntoView({ behavior: 'smooth', block: 'start' }) });
  const carritoNodo = el('aside', { class: 'arm-carrito card', id: 'arm-carrito', 'aria-label': 'Tu pedido' },
    el('div', { class: 'arm-carrito-head' }, el('h3', { text: 'Tu pedido' }), contador),
    opc.avisoDia ? el('p', { class: 'arm-aviso-dia small', id: 'arm-aviso-dia', text: opc.avisoDia }) : null,
    fuera.length ? el('div', { class: 'notice info small', id: 'arm-fuera' }, 'Ya no está disponible y se quitó: ' + fuera.join(', ') + '.') : null,
    cuerpoCarrito,
    el('div', { class: 'arm-total' }, el('span', { class: 'arm-total-label', text: 'Total (estimado)' }), totalTxt),
    el('p', { class: 'muted small', text: 'Es un estimado con tus precios de hoy: el importe final lo confirma Golden.' }),
    zona, bEnviar, bCancelar);

  function actualizar() {
    // tarjetas: marcar las que están en el pedido y sincronizar cantidades visibles
    for (const card of grilla.querySelectorAll('.arm-card')) {
      const pid = Number(card.dataset.producto); const c = carrito.get(pid);
      card.classList.toggle('en-pedido', !!c);
      const i = card.querySelector('.arm-cant'); if (i && document.activeElement !== i) i.value = c ? num(c.cantidad) : '0';
    }
    let total = 0; let completo = true;
    const items = [...carrito.entries()].map(([pid, c]) => ({ p: porId.get(pid), ...c, pid }));
    if (!items.length) montar(cuerpoCarrito, el('div', { class: 'arm-vacio', 'data-vacio': 'true', text: 'Todavía no agregaste productos. Tocá + en el catálogo.' }));
    else montar(cuerpoCarrito, items.map(x => {
      const sub = typeof x.p.precio === 'number' ? Math.round(x.p.precio * x.cantidad * 100) / 100 : null;
      if (sub === null) completo = false; else total += sub;
      const iDet = el('input', { class: 'input arm-det', id: 'arm-det-' + x.pid, maxlength: '200', placeholder: 'Aclaración (opcional)', 'aria-label': 'Aclaración para ' + x.p.nombre, autocomplete: 'off', value: x.detalle });
      iDet.addEventListener('input', () => { const c = carrito.get(x.pid); if (c) c.detalle = iDet.value; });
      return el('div', { class: 'arm-item', 'data-producto': String(x.pid) },
        fotoProducto(x.p, true),
        el('div', { class: 'arm-item-txt' }, el('span', { class: 'arm-item-nombre', text: x.p.nombre }),
          el('span', { class: 'muted small', text: (x.p.precio !== null ? pesos(x.p.precio) : 'sin precio') + (x.p.unidad ? ' / ' + x.p.unidad : '') })),
        el('span', { class: 'arm-item-sub', text: sub !== null ? pesos(sub) : '—' }),
        selector(x.pid, 'arm-ccant-' + x.pid),
        iDet);
    }));
    totalTxt.textContent = items.length ? (completo ? pesos(total) : '—') : pesos(0);
    contador.textContent = String(items.length);
    contador.hidden = !items.length;
    barraMovil.textContent = items.length ? 'Ver tu pedido · ' + items.length + (items.length === 1 ? ' producto' : ' productos') + ' · ' + totalTxt.textContent : 'Tu pedido está vacío';
    bEnviar.disabled = !items.length;
  }

  bEnviar.addEventListener('click', () => {
    montar(zona);
    const items = [];
    for (const [pid, c] of carrito) {
      if (!(c.cantidad > 0)) return montar(zona, aviso('error', 'Cada producto necesita una cantidad mayor que 0.', 'DATOS_INCOMPLETOS'));
      const o = { producto_id: pid, cantidad: c.cantidad };
      const det = String(c.detalle || '').trim(); if (det) o.detalle_libre = det;
      items.push(o);
    }
    if (!items.length) return montar(zona, aviso('error', 'Agregá al menos un producto.', 'DATOS_INCOMPLETOS'));
    opc.alEnviar(items, zona);
  });

  pintarCats(); pintarGrilla(); actualizar();
  const nodo = el('div', { class: 'arm', id: 'arm' },
    el('section', { class: 'arm-catalogo', 'aria-label': 'Catálogo de productos' },
      el('div', { class: 'field search-field arm-buscador' }, iBuscar), chips, grilla),
    barraMovil, carritoNodo); // en celular la barra queda pegada abajo mientras se recorre el catálogo y se apoya sobre el carrito al llegar
  return { nodo, zona };
}
