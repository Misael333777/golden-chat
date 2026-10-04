// Panel Cliente → Mi perfil (solo lectura: usuario/mi_perfil) y Productos y precios (usuario/mi_catalogo).
// Nunca se muestra el código de acceso, tokens ni datos internos. El catálogo trae SOLO productos activos y visibles para clientes,
// con el precio de la condición de la persona (lo decide el backend; la página no elige lista ni precio).
import { el, montar } from '../../ui.js';
import { textoLista } from '../../ui.js';
import { leer, catalogo, cabecera, vacio, pesos, str, raiz } from './comun.js';

export function vistaPerfil(ctx, cont) {
  const cuerpo = el('div', { class: 'stack', id: 'per-cuerpo', 'data-estado': 'cargando' });
  montar(cont, cabecera('Mi perfil', 'Tus datos en Golden. Si algo no está bien, avisanos desde “Hablar con Golden”.'), el('div', { class: 'card stack' }, cuerpo));
  leer(ctx, cuerpo, 'mi_perfil', {}, (d) => {
    const p = d.perfil || {};
    const fila = (label, valor, attr) => el('div', { class: 'rep-fila rep-c2 op-dato', 'data-dato': attr }, el('span', { text: label }), el('span', { text: str(valor) || 'Sin cargar' }));
    montar(cuerpo, el('div', { class: 'tabla rep-tabla op-resumen', id: 'per-datos' },
      fila('Nombre', p.nombre, 'nombre'), fila('Teléfono', p.telefono, 'telefono'), fila('Dirección', p.direccion, 'direccion'), fila('Condición de precios', textoLista(p.lista_precio), 'lista_precio')),
      el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost', href: raiz() + '/soporte' }, 'Pedir un cambio de datos')));
  });
}

export function vistaCatalogo(ctx, cont) {
  const cuerpo = el('div', { class: 'stack', id: 'cat-cli', 'data-estado': 'cargando' });
  montar(cont, cabecera('Productos y precios', 'Los productos que podés pedir, con tu precio de hoy.'), cuerpo);
  (async () => {
    montar(cuerpo, el('div', { class: 'skeleton' }));
    const c = await catalogo(ctx);
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (c.error) return montar(cuerpo, c.error);
    if (!c.productos.length) return montar(cuerpo, vacio('No hay productos disponibles.'));
    const grupos = {};
    for (const p of c.productos) (grupos[p.categoria || 'Otros'] = grupos[p.categoria || 'Otros'] || []).push(p);
    montar(cuerpo, el('p', { class: 'muted small', text: 'Son los precios de tu condición comercial. El precio de cada pedido queda fijado cuando se registra.' }),
      Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es')).map(g => el('div', { class: 'card stack', 'data-categoria': g }, el('h3', { text: g }),
        el('div', { class: 'tabla rep-tabla' }, el('div', { class: 'rep-fila rep-head rep-c3' }, ['Producto', 'Unidad', 'Precio'].map(x => el('span', { text: x }))),
          grupos[g].map(p => el('div', { class: 'rep-fila rep-c3', 'data-producto': String(p.producto_id) }, el('span', { text: p.nombre }),
            el('span', null, el('span', { class: 'pc-label', text: 'Unidad: ' }), p.unidad || '—'), el('span', null, el('span', { class: 'pc-label', text: 'Precio: ' }), pesos(p.precio))))))));
  })();
}
