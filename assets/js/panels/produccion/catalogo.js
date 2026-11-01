// Panel Producción → Catálogo: productos activos visibles para clientes (prod_catalogo sin cliente: sin precios), en tarjetas con foto.
// Mismo look que el catálogo del panel Cliente (armador.js). prod_catalogo no devuelve imagen: se muestra el placeholder Golden.
import { el, montar } from '../../ui.js';
import { fotoProducto } from '../cliente/armador.js';
import { listaDe, normProducto, ordenarProductos, uTxt, pesos, sinTilde, cabecera, vacio, leer } from './comun.js';

export function vistaCatalogo(ctx, cont) {
  const input = el('input', { class: 'input', id: 'prod-cat-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar producto…', 'aria-label': 'Buscar producto', autocomplete: 'off' });
  const total = el('p', { class: 'muted small', id: 'prod-cat-total' });
  const zona = el('div', { class: 'stack', id: 'prod-catalogo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Catálogo', 'Productos activos que pueden pedir los clientes.'),
    el('div', { class: 'field search-field arm-buscador' }, input), total, zona);
  let productos = [];
  const pintar = () => {
    const q = sinTilde(input.value.trim());
    const vis = q ? productos.filter(p => sinTilde(p.nombre + ' ' + (p.categoria || '')).includes(q)) : productos;
    total.textContent = vis.length + (vis.length === 1 ? ' producto' : ' productos');
    if (!productos.length) return montar(zona, vacio('No hay productos activos.'));
    if (!vis.length) return montar(zona, vacio('No hay productos con ese nombre.'));
    const cats = [...new Set(vis.map(p => p.categoria || 'Otros'))];
    montar(zona, cats.map(cat => el('section', { class: 'stack prod-cat-grupo', 'data-categoria': cat },
      el('h3', { class: 'prod-cat-titulo', text: cat }),
      el('div', { class: 'arm-grilla' }, vis.filter(p => (p.categoria || 'Otros') === cat).map(p => el('article', { class: 'arm-card', 'data-producto': String(p.producto_id) },
        fotoProducto(p, false),
        el('div', { class: 'arm-card-txt' },
          el('h4', { class: 'arm-nombre', text: p.nombre }),
          el('p', { class: 'arm-precio' }, p.precio !== null ? el('strong', { text: pesos(p.precio) }) : null,
            p.unidad ? el('span', { class: 'arm-unidad', text: (p.precio !== null ? ' / ' : 'Unidad: ') + uTxt(p.unidad) }) : null))))))));
  };
  input.addEventListener('input', pintar);
  leer(ctx, zona, 'prod_catalogo', {}, (d) => {
    productos = ordenarProductos(listaDe(d, 'productos', 'catalogo').map(normProducto).filter(Boolean));
    pintar();
  });
}
