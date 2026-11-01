// Panel Producción → Catálogo: productos activos visibles para clientes (prod_catalogo sin cliente: sin precios).
import { el, montar } from '../../ui.js';
import { listaDe, normProducto, ordenarProductos, uTxt, pesos, sinTilde, cabecera, vacio, leer } from './comun.js';

export function vistaCatalogo(ctx, cont) {
  const input = el('input', { class: 'input', id: 'prod-cat-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar producto…', 'aria-label': 'Buscar producto', autocomplete: 'off' });
  const total = el('p', { class: 'muted small', id: 'prod-cat-total' });
  const zona = el('div', { class: 'stack', id: 'prod-catalogo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Catálogo', 'Productos activos que pueden pedir los clientes.'),
    el('div', { class: 'card stack prod-buscador' }, el('div', { class: 'field' }, input), total), zona);
  let productos = [];
  const pintar = () => {
    const q = sinTilde(input.value.trim());
    const vis = q ? productos.filter(p => sinTilde(p.nombre + ' ' + (p.categoria || '')).includes(q)) : productos;
    total.textContent = vis.length + (vis.length === 1 ? ' producto' : ' productos');
    if (!productos.length) return montar(zona, vacio('No hay productos activos.'));
    if (!vis.length) return montar(zona, vacio('No hay productos con ese nombre.'));
    const cats = [...new Set(vis.map(p => p.categoria || 'Otros'))];
    montar(zona, cats.map(cat => el('div', { class: 'card stack prod-cat-grupo', 'data-categoria': cat },
      el('h3', { text: cat }),
      el('ul', { class: 'pp-lineas' }, vis.filter(p => (p.categoria || 'Otros') === cat).map(p => el('li', { 'data-producto': String(p.producto_id) },
        el('span', { class: 'pp-prod', text: p.nombre }),
        p.unidad ? el('span', { class: 'muted small', text: uTxt(p.unidad) }) : null,
        p.precio !== null ? el('span', { class: 'small prod-cat-precio', text: pesos(p.precio) }) : null))))));
  };
  input.addEventListener('input', pintar);
  leer(ctx, zona, 'prod_catalogo', {}, (d) => {
    productos = ordenarProductos(listaDe(d, 'productos', 'catalogo').map(normProducto).filter(Boolean));
    pintar();
  });
}
